import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Badge, Button, Dialog, Segmented } from '@/components/ui';
import type { ImportCounts, ImportMode, StorageEstimate } from '@/data/repos/settings';
import { useAppStore } from '@/store';
import { Panel } from './controls';
import { inventoryCsvName, pigmentExportName, pickTextFile, saveTextFile, toCsv } from './download';
import { buildInventoryCsvRows, formatBytes } from './settingsData';

const MODE_OPTIONS: { value: ImportMode; label: string }[] = [
  { value: 'replace', label: '覆盖' },
  { value: 'merge', label: '合并' },
  { value: 'skip', label: '跳过' },
];

/** 读文本：优先 Blob.text()，退回 FileReader（jsdom 与旧浏览器没有 text()） */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

const MODE_IMPACT: Record<ImportMode, string> = {
  replace: '覆盖：先清空全部用户数据表（库存 / 分组 / 工作台 / 批次 / 记录 / 历史），再写入备份内容。',
  merge: '合并：按 id 去重；库存与批次冲突时取较大余量，其余记录以备份为准。',
  skip: '跳过：已存在的 id 一律保留本地数据，只新增备份里没有的条目。',
};

/** 数据运维：导出 / 导入 / 重置 / 存储占用（spec 3.8 / 3.7.3） */
export function DataPanel() {
  const exportAll = useAppStore((state) => state.exportAll);
  const importAll = useAppStore((state) => state.importAll);
  const resetAll = useAppStore((state) => state.resetAll);
  const storageEstimate = useAppStore((state) => state.storageEstimate);
  const pushToast = useAppStore((state) => state.pushToast);
  const stockCount = useAppStore((state) => state.stockItems.length);

  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; size: number; raw: unknown } | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const [importing, setImporting] = useState(false);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let alive = true;
    setEstimating(true);
    void storageEstimate()
      .then((next) => {
        if (alive) setEstimate(next);
      })
      .finally(() => {
        if (alive) setEstimating(false);
      });
    return () => {
      alive = false;
    };
  }, [storageEstimate]);

  const onExportJson = async (): Promise<void> => {
    const result = await exportAll();
    if (!result.ok) return;
    const filename = pigmentExportName();
    const status = await saveTextFile(filename, JSON.stringify(result.data, null, 2), 'application/json');
    if (status === 'saved') {
      setLastExport(filename);
      pushToast({ message: '已导出全量备份：' + filename, tone: 'ok' });
    }
  };

  const onExportCsv = async (): Promise<void> => {
    const state = useAppStore.getState();
    const rows = buildInventoryCsvRows({
      stockItems: state.stockItems,
      groups: state.groups,
      workbenches: state.workbenches,
      workbenchItems: state.workbenchItems,
      paintOf: (id) => state.paintsById[id],
      brandOf: (id) => state.brands.find((brand) => brand.id === id),
    });
    const filename = inventoryCsvName();
    const status = await saveTextFile(filename, toCsv(rows), 'text/csv;charset=utf-8');
    if (status === 'saved') {
      setLastExport(filename);
      pushToast({ message: '已导出库存报表（' + (rows.length - 1) + ' 条）', tone: 'ok' });
    }
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await readFileText(file);
      const raw = JSON.parse(text) as unknown;
      setMode('replace');
      setCounts(null);
      setPending({ name: file.name, size: file.size, raw });
    } catch {
      pushToast({ message: '导入失败：文件不是合法 JSON，请确认是 .pigment.json 备份', tone: 'danger' });
    }
  };

  /** 桌面壳：走原生打开框（浏览器里没有平台桥，退回上面的 <input type=file>） */
  const onPickDesktopFile = async (): Promise<void> => {
    const picked = await pickTextFile(['json']);
    if (!picked) return;
    try {
      const raw = JSON.parse(picked.text) as unknown;
      setMode('replace');
      setCounts(null);
      setPending({ name: picked.name, size: new TextEncoder().encode(picked.text).length, raw });
    } catch {
      pushToast({ message: '导入失败：文件不是合法 JSON，请确认是 .pigment.json 备份', tone: 'danger' });
    }
  };

  const onConfirmImport = async (): Promise<void> => {
    if (!pending) return;
    setImporting(true);
    try {
      const result = await importAll(pending.raw, mode);
      if (result.ok) {
        setCounts(result.data);
        setPending(null);
      }
    } finally {
      setImporting(false);
    }
  };

  const onConfirmReset = async (): Promise<void> => {
    if (resetText !== 'RESET') return;
    setResetting(true);
    try {
      const result = await resetAll();
      if (result.ok) {
        setResetOpen(false);
        setResetText('');
      }
    } finally {
      setResetting(false);
    }
  };

  const storageWarn = estimate !== null && estimate.quota > 0 && estimate.ratio > 0.8;

  return (
    <Panel
      id="data"
      code="//03"
      title="数据运维"
      description="导出全量备份、导出库存报表、导入备份、重置数据与存储占用（spec 3.8）。"
    >
      <h3 className="t-label mb-1">导出（P0）</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void onExportJson()}>
          导出全量 .pigment.json
        </Button>
        <Button variant="secondary" onClick={() => void onExportCsv()}>
          导出库存 CSV
        </Button>
        <span className="text-[11px] text-text-3">全量备份含 catalog 版本号、user 数据与 settings；不含二进制。库存 {stockCount} 条。</span>
      </div>
      {lastExport && (
        <p data-note="last-export" className="t-readout mt-2 text-[11px] text-text-2">
          已生成：{lastExport}
        </p>
      )}

      <h3 className="t-label mb-1 mt-5">导入（P1）</h3>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".json,application/json"
          aria-label="选择 .pigment.json 备份文件"
          onChange={(event) => void onPickFile(event)}
          className="h-10 max-w-[280px] border bg-transparent px-2 text-[12px] text-text-2 file:mr-2 file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-text-1"
          style={{ borderColor: 'var(--ef-rule)' }}
        />
        {window.platform?.isDesktop && (
          <Button variant="secondary" onClick={() => void onPickDesktopFile()}>
            从文件选择…
          </Button>
        )}
        <span className="text-[11px] text-text-3">三种模式：覆盖 / 合并 / 跳过；导入前必须先确认影响范围。</span>
      </div>
      {counts && (
        <p data-note="import-counts" className="mt-2 text-[11px] text-text-2">
          上次导入：新增 {counts.added} · 更新 {counts.updated} · 跳过 {counts.skipped} · 无效 {counts.invalid}
        </p>
      )}

      <h3 className="t-label mb-1 mt-5">重置</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          重置数据
        </Button>
        <span className="text-[11px] text-text-3">二次确认 + 手动输入 RESET 才可执行；重置不可撤销。</span>
      </div>

      <h3 className="t-label mb-1 mt-5">存储占用</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={estimating}
          onClick={() => {
            setEstimating(true);
            void storageEstimate()
              .then((next) => setEstimate(next))
              .finally(() => setEstimating(false));
          }}
        >
          {estimating ? '测量中…' : '测量存储占用'}
        </Button>
        {estimate && (
          <span className="t-readout text-xs text-text-2">
            {formatBytes(estimate.usage)}
            {estimate.quota > 0 ? ' / ' + formatBytes(estimate.quota) + '（' + Math.round(estimate.ratio * 100) + '%）' : ''}
          </span>
        )}
        {storageWarn ? (
          <Badge tone="warn">存储占用超过 80%，建议导出归档后清理</Badge>
        ) : (
          estimate && estimate.quota > 0 && <Badge tone="ok">占用正常</Badge>
        )}
      </div>
      {estimate && estimate.quota === 0 && (
        <p className="mt-1 text-[11px] leading-snug text-text-3">
          当前环境未提供浏览器配额信息，上方为各用户数据表的序列化体积估算（不含 images）。
        </p>
      )}

      <p data-note="snapshots" className="mt-4 border-t border-line pt-2 text-[11px] leading-snug text-text-3">
        自动快照（IndexedDB <span className="t-readout">snapshots</span>）：<span className="text-warn">P1 未实现</span> ——
        数据层未提供快照仓储（src/data 无 snapshots 读写接口），本面板不伪造「会话结束自动存 1 份 / 保留 5 份 / 回滚」的交互。
        需要回滚能力前，请用「导出全量」自行留档。
      </p>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="确认导入备份"
        description="导入不进撤销栈，执行后无法回退"
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button variant="primary" disabled={importing} onClick={() => void onConfirmImport()}>
              确认导入
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          {pending && (
            <p className="t-readout break-all text-text-2">
              {pending.name}（{formatBytes(pending.size)}）
            </p>
          )}
          <div>
            <span className="t-label mb-1 block">导入模式</span>
            <Segmented options={MODE_OPTIONS} value={mode} ariaLabel="导入模式" onChange={setMode} />
          </div>
          <p data-note="import-impact" className="leading-snug text-text-1">
            {MODE_IMPACT[mode]}
          </p>
          <p className="leading-snug text-text-3">
            导入不可撤销（不产生 Command，不进撤销栈），也不生成自动快照。如担心误操作，请先「导出全量」留档。
          </p>
        </div>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) setResetText('');
        }}
        title="重置全部数据"
        description="不可撤销；不产生撤销记录，也不生成自动快照"
        width={420}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setResetOpen(false);
                setResetText('');
              }}
            >
              取消
            </Button>
            <Button variant="danger" disabled={resetText !== 'RESET' || resetting} onClick={() => void onConfirmReset()}>
              重置全部数据
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="leading-snug text-text-2">
            影响范围：库存条目、分组、工作台与工作台条目、调漆台批次、稀释 / 调漆 / 用量 / 账本记录、撤销历史，以及全部设置项（恢复默认）。
            目录数据（catalog）不受影响。
          </p>
          <p className="leading-snug text-text-3">重置不可撤销。如担心误操作，请先执行「导出全量」留档。</p>
          <label className="block">
            <span className="t-label block">手动输入 RESET 以确认</span>
            <input
              aria-label="输入 RESET 确认"
              value={resetText}
              autoComplete="off"
              placeholder="RESET"
              onChange={(event) => setResetText(event.target.value)}
              className="t-readout mt-1 h-8 w-full border border-line bg-bg-1 px-2 text-xs text-text-1"
            />
          </label>
        </div>
      </Dialog>
    </Panel>
  );
}
