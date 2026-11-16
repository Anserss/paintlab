import { useEffect, useState } from 'react';
import { Button, Dialog, cn } from '@/components/ui';
import { formatMl, r1 } from '@/core/math/quantity';
import { STATION_ACCENTS, STATION_NAME_MAX, STATION_NOTE_MAX } from '@/data/repos/station';
import type { StationEntry } from './stationModel';

export interface StationFormValues {
  name: string;
  note: string;
  accent: string;
}

export interface StationFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: StationFormValues;
  /** 其它工位的名称：全局不重名（spec 3.5） */
  takenNames: string[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StationFormValues) => void;
}

/** 新建 / 编辑工位：名称 1–16 字、全局唯一、6 个工业色、1 行备注 */
export function StationFormDialog({
  open,
  mode,
  initial,
  takenNames,
  onOpenChange,
  onSubmit,
}: StationFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [accent, setAccent] = useState(initial?.accent ?? STATION_ACCENTS[0]);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setNote(initial?.note ?? '');
    setAccent(initial?.accent ?? STATION_ACCENTS[0]);
  }, [open, initial?.name, initial?.note, initial?.accent]);

  const trimmed = name.trim();
  const error =
    trimmed.length === 0
      ? '请输入工位名称'
      : trimmed.length > STATION_NAME_MAX
        ? '名称最多 ' + STATION_NAME_MAX + ' 字'
        : takenNames.includes(trimmed)
          ? '工位名称已存在「' + trimmed + '」'
          : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? '新建工位' : '编辑工位'}
      description="名称 1–16 字、全局不重名；可选 1 个工业色与 1 行备注。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant="primary"
            data-action="submit-station"
            disabled={Boolean(error)}
            onClick={() => onSubmit({ name: trimmed, note: note.trim(), accent })}
          >
            {mode === 'create' ? '新建' : '保存'}
          </Button>
        </>
      }
    >
      <div data-dialog="station-form" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[10px] text-text-3">
            <span>工位名称</span>
            <span className="t-readout">
              {name.length}/{STATION_NAME_MAX}
            </span>
          </span>
          <input
            data-field="station-name"
            aria-label="工位名称"
            value={name}
            maxLength={STATION_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            className="h-8 w-full border border-line bg-bg-1 px-2 text-xs text-text-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-text-3">备注（1 行）</span>
          <input
            data-field="station-note"
            aria-label="工位备注"
            value={note}
            maxLength={STATION_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            className="h-8 w-full border border-line bg-bg-1 px-2 text-xs text-text-1"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-text-3">图标色（6 个工业色）</span>
          <div role="group" aria-label="工位图标色" className="flex items-center gap-2">
            {STATION_ACCENTS.map((hex) => (
              <button
                key={hex}
                type="button"
                data-accent={hex}
                aria-pressed={accent === hex}
                aria-label={'图标色 ' + hex}
                onClick={() => setAccent(hex)}
                className={cn(
                  'h-6 w-6 border',
                  accent === hex ? 'border-text-1' : 'border-line hover:border-line-strong',
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p data-slot="station-form-error" className="text-[10px] text-bh-red">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

export interface ReturnDialogProps {
  open: boolean;
  entries: StationEntry[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (entries: { itemId: string; usedMl: number }[]) => void;
}

function defaultUsedOf(entry: StationEntry): number {
  if (entry.plannedUseMl <= 0) return 0;
  return r1(Math.min(entry.plannedUseMl, entry.remainingMl));
}

/** 放回仓库（AC-09）：逐条取记录用量 u；u=0 时二次确认「仅移出、不扣减」 */
export function ReturnDialog({ open, entries, onOpenChange, onConfirm }: ReturnDialogProps) {
  const [used, setUsed] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<'edit' | 'zero'>('edit');
  const signature = entries.map((entry) => entry.id).join(',');

  useEffect(() => {
    if (!open) return;
    setUsed(Object.fromEntries(entries.map((entry) => [entry.id, defaultUsedOf(entry)])));
    setStage('edit');
    // 仅在打开或条目集合变化时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature]);

  const collect = () => entries.map((entry) => ({ itemId: entry.id, usedMl: r1(used[entry.id] ?? 0) }));
  const zeroCount = entries.filter((entry) => r1(used[entry.id] ?? 0) <= 0).length;

  const requestConfirm = () => {
    if (zeroCount > 0) {
      setStage('zero');
      return;
    }
    onConfirm(collect());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="放回仓库"
      description="条目回到仓库原分组；扣减量写入使用记录（reason=return），整批为 1 个可撤销操作。"
      footer={
        stage === 'edit' ? (
          <>
            <Button onClick={() => onOpenChange(false)}>取消</Button>
            <Button variant="primary" data-action="confirm-return" onClick={requestConfirm}>
              确认放回仓库
            </Button>
          </>
        ) : (
          <>
            <Button data-action="back-return" onClick={() => setStage('edit')}>
              返回修改
            </Button>
            <Button variant="primary" data-action="confirm-zero" onClick={() => onConfirm(collect())}>
              确认仅移出
            </Button>
          </>
        )
      }
    >
      {stage === 'edit' ? (
        <div data-dialog="return-entries" className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 border border-line p-2">
              <span className="min-w-0 flex-1 truncate text-xs text-text-1">{entry.title}</span>
              <span className="t-readout shrink-0 text-[10px] text-text-3">{entry.code}</span>
              <span className="t-readout shrink-0 text-[10px] text-text-3">
                余量 {formatMl(entry.remainingMl)}
              </span>
              <input
                type="number"
                aria-label={'记录用量 ' + entry.title}
                data-return-input={entry.id}
                min={0}
                max={entry.remainingMl}
                step={0.5}
                value={String(used[entry.id] ?? 0)}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  const next = Number.isFinite(parsed)
                    ? r1(Math.min(Math.max(parsed, 0), entry.remainingMl))
                    : 0;
                  setUsed((prev) => ({ ...prev, [entry.id]: next }));
                }}
                className="t-readout h-7 w-16 shrink-0 border border-line bg-bg-1 px-1 text-right text-xs text-text-1"
              />
              <span className="shrink-0 text-[10px] text-text-3">ml</span>
            </div>
          ))}
        </div>
      ) : (
        <div data-dialog="return-zero" className="flex flex-col gap-2">
          <p className="text-xs text-text-1">
            {zeroCount} 件条目的记录用量为 0：仅移出、不扣减。
          </p>
          <p className="text-[11px] text-text-3">确认后条目回到仓库，库存余量保持不变。</p>
        </div>
      )}
    </Dialog>
  );
}

export interface DeleteStationDialogProps {
  open: boolean;
  stationName: string;
  itemCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** 删除工位二次确认：条目直接回仓库（spec 3.5 / 3.7.4） */
export function DeleteStationDialog({
  open,
  stationName,
  itemCount,
  onOpenChange,
  onConfirm,
}: DeleteStationDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="删除工位"
      description={'删除「' + stationName + '」后，' + itemCount + ' 件条目直接回到仓库，可撤销。'}
      width={420}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="danger" data-action="confirm-delete-station" onClick={onConfirm}>
            删除工位
          </Button>
        </>
      }
    >
      <p data-dialog="delete-station" className="text-xs text-text-2">
        工位本身与它的条目归属会被移除；漆料不会丢失。
      </p>
    </Dialog>
  );
}
