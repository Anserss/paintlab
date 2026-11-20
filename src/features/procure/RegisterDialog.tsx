import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Group, Paint, PaintLine, PaintState } from '@/core/model/types';
import { r1 } from '@/core/math/quantity';
import { codeOrDash, paintTitle } from '@/core/render/label';
import { Button, Dialog, Segmented, Stepper } from '@/components/ui';
import { isAuxPaint } from './procureFilters';

export type CapacityMode = 'whole' | 'half' | 'custom';

/** 弹层提交给页面层的入库参数（容量 / 初始状态 / 分组 / 备注，spec 3.2） */
export interface RegisterPayload {
  volumeMl: number;
  state: PaintState;
  ratioN?: number;
  groupId: string | null;
  note?: string;
}

export interface RegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paints: Paint[];
  linesById: Record<string, PaintLine>;
  groups: Group[];
  brandNames: Record<string, string>;
  defaultRatio: number;
  busy?: boolean;
  onSubmit: (payload: RegisterPayload) => void;
}

const CAPACITY_OPTIONS: readonly { value: CapacityMode; label: string }[] = [
  { value: 'whole', label: '整瓶' },
  { value: 'half', label: '半瓶' },
  { value: 'custom', label: '自定义 ml' },
];

const STATE_OPTIONS: readonly { value: PaintState; label: string }[] = [
  { value: 'neat', label: '原浆' },
  { value: 'thinned', label: '稀释' },
];

const FIELD_LABEL = 't-label mb-1 block';

/** 入库弹层：容量（默认 line.defaultVolumeMl）+ 初始状态 + 分组 + 备注 */
export function RegisterDialog({
  open,
  onOpenChange,
  paints,
  linesById,
  groups,
  brandNames,
  defaultRatio,
  busy = false,
  onSubmit,
}: RegisterDialogProps) {
  const first = paints[0];
  const line = first ? linesById[first.lineId] : undefined;
  /** 单件规格：辅料 50/110/250/400 ml 各自成 SKU，优先取 paint.volumeMl */
  const lineVolume = first?.volumeMl ?? line?.defaultVolumeMl ?? 10;
  /**
   * 2.1.1：稀释剂 / 缓干剂等辅料不区分「原浆 / 稀释」——
   * 它们本身不是漆，采购入库时固定按未稀释（neat）记账，界面上不出现状态选项。
   * 2.2.2：底漆 / 补土（paintClass=solid + category=primer）同样归辅料，一并走这条分支。
   */
  const isAuxOnly = paints.length > 0 && paints.every((paint) => isAuxPaint(paint));

  const [mode, setMode] = useState<CapacityMode>('whole');
  const [customMl, setCustomMl] = useState(lineVolume);
  const [state, setState] = useState<PaintState>('neat');
  const [ratioN, setRatioN] = useState(line?.defaultRatioN ?? defaultRatio);
  const [groupId, setGroupId] = useState<string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextLine = paints[0] ? linesById[paints[0].lineId] : undefined;
    const nextVolume = paints[0]?.volumeMl ?? nextLine?.defaultVolumeMl ?? 10;
    setMode('whole');
    setCustomMl(nextVolume);
    setState('neat');
    setRatioN(nextLine?.defaultRatioN ?? defaultRatio);
    setGroupId('');
    setNote('');
    // 只在打开（或换了一批漆）时重置表单
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paints]);

  const volumeMl = mode === 'whole' ? lineVolume : mode === 'half' ? r1(lineVolume / 2) : customMl;
  const ratioValid = isAuxOnly || state !== 'thinned' || (ratioN >= 0 && ratioN <= 10);
  const canSubmit = Boolean(first) && volumeMl >= 0.5 && volumeMl <= 2500 && ratioValid && !busy;

  const summary = paints
    .slice(0, 4)
    .map((paint) => {
      const brand = brandNames[paint.brandId] ?? '';
      return [brand, codeOrDash(paint.code), paintTitle(paint).primary].filter(Boolean).join(' ');
    })
    .join(' / ');

  const description =
    paints.length > 1 ? '共 ' + paints.length + ' 支漆：' + summary + ' …' : summary;

  function submit() {
    if (!canSubmit) return;
    const payload: RegisterPayload = {
      volumeMl: r1(volumeMl),
      // 辅料没有「原浆 / 稀释」之分，入库一律记作未稀释
      state: isAuxOnly ? 'neat' : state,
      groupId: groupId || null,
    };
    if (!isAuxOnly && state === 'thinned') payload.ratioN = ratioN;
    const trimmed = note.trim();
    if (trimmed) payload.note = trimmed;
    onSubmit(payload);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="入库"
      description={description}
      width={520}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            chamfer
            aria-busy={busy || undefined}
            disabled={!canSubmit}
            onClick={submit}
          >
            {busy ? '入库中…' : '确认入库'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className={FIELD_LABEL}>容量</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<CapacityMode>
              options={CAPACITY_OPTIONS}
              value={mode}
              onChange={setMode}
              ariaLabel="容量"
            />
            {mode === 'custom' ? (
              <Stepper
                value={customMl}
                min={0.5}
                max={2500}
                step={0.1}
                unit="ml"
                ariaLabel="自定义容量"
                onChange={setCustomMl}
              />
            ) : (
              <span className="t-readout text-xs text-text-2">{volumeMl.toFixed(1)} ml</span>
            )}
            <span className="text-[11px] text-text-3">默认 {lineVolume} ml</span>
          </div>
        </div>

        {isAuxOnly ? (
          <div>
            <span className={FIELD_LABEL}>初始状态</span>
            <p data-aux-no-state="" className="text-[12px] leading-relaxed text-text-2">
              稀释剂 / 缓干剂 / 底漆等辅料直接入库，不分原浆与稀释。
            </p>
          </div>
        ) : (
          <div>
            <span className={FIELD_LABEL}>初始状态</span>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<PaintState>
                options={STATE_OPTIONS}
                value={state}
                onChange={setState}
                ariaLabel="初始状态"
              />
              {state === 'thinned' && (
                <div className="flex items-center gap-2">
                  <span className="t-readout text-xs text-text-2">1 :</span>
                  <Stepper
                    value={ratioN}
                    min={0}
                    max={10}
                    step={0.1}
                    unit="N"
                    ariaLabel="稀释比例"
                    onChange={setRatioN}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <span className={FIELD_LABEL}>分组（可选）</span>
          <select
            aria-label="分组"
            value={groupId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setGroupId(event.target.value)}
            className="h-8 w-full cursor-pointer border border-line bg-bg-0 px-2 text-xs text-text-1 hover:border-line-strong"
          >
            <option value="">未分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {'·'.repeat(Math.max(0, group.depth - 1))}
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={FIELD_LABEL}>备注（可选）</span>
          <input
            aria-label="备注"
            value={note}
            maxLength={120}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value)}
            placeholder="例如：补货，开封日期 2026-11"
            className="h-8 w-full border border-line bg-bg-0 px-2 text-xs text-text-1 placeholder:text-text-3 hover:border-line-strong"
          />
        </div>
      </div>
    </Dialog>
  );
}
