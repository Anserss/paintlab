import { useEffect, useState } from 'react';
import { formatMl } from '@/core/math/quantity';
import { decompositionOf, decompositionPartLabel, decompositionTitle } from '@/core/rules/decompose';
import { useAppStore } from '@/store';
import { Button, Dialog } from '@/components/ui';
import { ADJUST_REASON_OPTIONS } from './useDepotData';
import type { AdjustReasonCode } from '@/data/repos/stock';
import type { DepotRow } from './model';

interface RowDialogProps {
  row: DepotRow | null;
  onClose: () => void;
}

/** 调整余量（盘点）：数值 + 必填原因，写入 ledger 且可撤销（spec 3.3:411） */
export function AdjustVolumeDialog({ row, onClose }: RowDialogProps) {
  const adjustVolume = useAppStore((state) => state.adjustVolume);
  const [text, setText] = useState('0.0');
  const [reason, setReason] = useState<AdjustReasonCode | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) setText(row.item.volumeMl.toFixed(1));
    setReason(null);
  }, [row]);

  const submit = async () => {
    if (!row || !reason) return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    setBusy(true);
    const result = await adjustVolume({ itemId: row.item.id, volumeMl: parsed, reason });
    setBusy(false);
    if (result.ok) onClose();
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="调整余量"
      description="盘点：直接改写当前余量，必须填写原因。成功后回执可撤销。"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={!reason || busy} onClick={() => void submit()}>
            确认调整
          </Button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-3" data-adjust="">
          <p className="text-xs text-text-2">
            {'当前 ' + formatMl(row.item.volumeMl) + ' / ' + formatMl(row.item.initialMl) + ' ml'}
          </p>
          <label className="flex flex-col gap-1 text-xs text-text-2">
            新的余量（ml）
            <input
              aria-label="新的余量"
              inputMode="decimal"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="t-readout h-8 w-28 border border-line bg-bg-1 px-2 text-sm text-text-1"
            />
          </label>
          <fieldset className="flex flex-col gap-1 text-xs text-text-2">
            <legend className="mb-1">原因（必填）</legend>
            <div className="flex flex-wrap gap-2">
              {ADJUST_REASON_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={
                    'inline-flex h-7 cursor-pointer items-center gap-1 border px-2 ' +
                    (reason === option.value ? 'border-accent text-text-1' : 'border-line text-text-2')
                  }
                >
                  <input
                    type="radio"
                    name="adjust-reason"
                    value={option.value}
                    aria-label={option.label}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="accent-[var(--accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}

/**
 * 2.2.1 调漆产物改名：名称是用户自定义的，留空才用默认「调漆N」。
 * 默认名「调漆N」可改成色号 / 习惯叫法（例如 JW020），落库可撤销。
 */
export function RenameItemDialog({ row, onClose }: RowDialogProps) {
  const renameStockItem = useAppStore((state) => state.renameStockItem);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setText(row.item.customName ?? '');
    setBusy(false);
    // 仅在切换条目时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.item.id]);

  const current = row?.item.customName ?? '';
  const trimmed = text.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 16 || trimmed === current;

  const submit = async () => {
    if (!row || invalid) return;
    setBusy(true);
    const result = await renameStockItem({ itemId: row.item.id, name: trimmed });
    setBusy(false);
    if (result.ok) onClose();
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="调漆产物改名"
      description="调漆产物的名称默认是「调漆N」；你可以改成色号或习惯叫法（1–16 字）。"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" data-action="confirm-rename-stock" disabled={invalid || busy} onClick={() => void submit()}>
            保存名称
          </Button>
        </>
      }
    >
      {row && (
        <div data-dialog="rename-stock" className="flex flex-col gap-3">
          <p className="text-xs text-text-2">
            {'当前名称「' + current + '」 · ' + (row.paint.nameZh ?? row.paint.name) + ' ' + (row.paint.code ?? '—')}
          </p>
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[11px] text-text-2">
              <span>新名称</span>
              <span className="ef-field">{trimmed.length + '/16'}</span>
            </span>
            <input
              aria-label="新名称"
              data-field="stock-name"
              maxLength={16}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
              className="ef-input"
              style={{ height: 44 }}
            />
          </label>
          <p className="text-[11px] leading-relaxed text-text-2">
            改名只影响显示名称，不改组分、比例与余量；可撤销。
          </p>
          {trimmed === current && current !== '' && (
            <p className="ef-flag text-[12px]">新名称与当前名称相同。</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * 删除条目（2.1.1）：稀释漆料 / 调漆产物入库时记了组分快照，
 * 可以选「直接删除」或「分解回仓库」（原浆 + 辅料 / 调漆前的稀释漆料）。
 */
export function DeleteItemDialog({ row, onClose }: RowDialogProps) {
  const removeStockItem = useAppStore((state) => state.removeStockItem);
  const decomposeStockItem = useAppStore((state) => state.decomposeStockItem);
  const [busy, setBusy] = useState(false);
  const plan = row ? decompositionOf(row.item) : null;

  const submitDirect = async () => {
    if (!row) return;
    setBusy(true);
    const result = await removeStockItem(row.item.id);
    setBusy(false);
    if (result.ok) onClose();
  };

  const submitDecompose = async () => {
    if (!row) return;
    setBusy(true);
    const result = await decomposeStockItem({ itemId: row.item.id });
    setBusy(false);
    if (result.ok) onClose();
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="删除条目"
      description={
        plan
          ? '这条漆料记着组分：可以直接删除，也可以分解回仓库。'
          : '条目连同工作台引用一起删除，可撤销。'
      }
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {plan && row && (
            <Button
              variant="secondary"
              data-action="decompose-item"
              disabled={busy}
              onClick={() => void submitDecompose()}
            >
              {decompositionTitle(row.item)}
            </Button>
          )}
          <Button variant="danger" data-action="confirm-delete-item" disabled={busy} onClick={() => void submitDirect()}>
            确认删除
          </Button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-3" data-delete-item="">
          <p className="text-xs text-text-2">
            {'确认删除「' + (row.paint.nameZh ?? row.paint.name) + ' ' + row.paint.code + '」？余量 ' + formatMl(row.item.volumeMl) + ' ml。'}
          </p>
          {plan ? (
            <div
              className="flex flex-col gap-1 border-t pt-3"
              data-decomposition=""
              style={{ borderColor: 'var(--ef-rule)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="ef-eyebrow">分解回仓库</span>
                <span className="ef-field text-[11px] text-text-2">
                  {plan.parts.length + ' 件 · ' + formatMl(plan.totalMl) + ' ml'}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {plan.parts.map((part) => (
                  <li
                    key={part.paintId + ':' + part.state + ':' + part.ml}
                    data-decomposition-part={part.aux ? 'aux' : part.state}
                    className="flex items-baseline gap-2 text-[12px] text-text-1"
                  >
                    <span className="truncate">{decompositionPartLabel(part)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-snug text-text-2">
                分解 = 按当前余量把各组分重新入库、删除原条目；整单可撤销。
              </p>
            </div>
          ) : (
            <p className="text-[11px] leading-snug text-text-3">
              该条目没有组分记录（2.0 之前入库或采购原浆），只能直接删除。
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

interface WorkbenchPickProps {
  rows: DepotRow[];
  onClose: () => void;
}

/** 「开涂」选择器：工作台 > 1 时选择目标工作台 */
export function CoatPickDialog({ rows, onClose }: WorkbenchPickProps) {
  const workbenches = useAppStore((state) => state.workbenches);
  const openCoat = useAppStore((state) => state.openCoat);

  const pick = async (workbenchId: string) => {
    const result = await openCoat({
      workbenchId,
      refs: rows.map((row) => ({ refType: 'stock' as const, refId: row.item.id })),
    });
    if (result.ok) onClose();
  };

  return (
    <Dialog
      open={rows.length > 0}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="开涂"
      description={'共 ' + rows.length + ' 件待加入'}
      width={420}
      footer={
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        {workbenches.map((workbench) => (
          <button
            key={workbench.id}
            type="button"
            data-workbench-pick={workbench.id}
            onClick={() => void pick(workbench.id)}
            className="flex h-8 items-center border border-line px-2 text-xs text-text-1 transition-colors duration-hover hover:border-line-strong hover:bg-surface-2"
          >
            {workbench.name}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
