import { useEffect, useState } from 'react';
import { formatMl } from '@/core/math/quantity';
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

/** 删除条目：二次确认（spec 3.10 危险动作） */
export function DeleteItemDialog({ row, onClose }: RowDialogProps) {
  const removeStockItem = useAppStore((state) => state.removeStockItem);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!row) return;
    setBusy(true);
    const result = await removeStockItem(row.item.id);
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
      description="条目连同工位引用一起删除，可撤销。"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void submit()}>
            确认删除
          </Button>
        </>
      }
    >
      {row && (
        <p className="text-xs text-text-2">
          {'确认删除「' + (row.paint.nameZh ?? row.paint.name) + ' ' + row.paint.code + '」？余量 ' + formatMl(row.item.volumeMl) + ' ml。'}
        </p>
      )}
    </Dialog>
  );
}

interface StationPickProps {
  rows: DepotRow[];
  onClose: () => void;
}

/** 「加入工位」选择器：工位 > 1 时选择目标工位 */
export function StationPickDialog({ rows, onClose }: StationPickProps) {
  const workstations = useAppStore((state) => state.workstations);
  const addToStation = useAppStore((state) => state.addToStation);

  const pick = async (workstationId: string) => {
    const result = await addToStation({
      workstationId,
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
      title="加入工位"
      description={'共 ' + rows.length + ' 件待加入'}
      width={420}
      footer={
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        {workstations.map((station) => (
          <button
            key={station.id}
            type="button"
            data-station-pick={station.id}
            onClick={() => void pick(station.id)}
            className="flex h-8 items-center border border-line px-2 text-xs text-text-1 transition-colors duration-hover hover:border-line-strong hover:bg-surface-2"
          >
            {station.name}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
