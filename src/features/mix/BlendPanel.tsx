import { formatMl, formatRatio } from '@/core/math/quantity';
import type { BlendPlan } from '@/core/math/blend';
import { Button, cn } from '@/components/ui';
import type { BlendPartRow } from './mixMath';

export interface BlendPanelProps {
  rows: BlendPartRow[];
  onChangeMl: (itemId: string, raw: string) => void;
  onRemove: (itemId: string) => void;
  onEqualize: () => void;
  onClear: () => void;
  /** 是否按目标总容量分摊 */
  useTarget: boolean;
  onUseTargetChange: (value: boolean) => void;
  targetText: string;
  onTargetChange: (raw: string) => void;
  plan: BlendPlan | null;
  blockers: string[];
  canCommit: boolean;
  onCommit: () => void;
}

/** 右栏 · 调漆模式：多组分份量 / 目标总容量分摊，等效比例由 core 折算 */
export function BlendPanel({
  rows,
  onChangeMl,
  onRemove,
  onEqualize,
  onClear,
  useTarget,
  onUseTargetChange,
  targetText,
  onTargetChange,
  plan,
  blockers,
  canCommit,
  onCommit,
}: BlendPanelProps) {
  const shareOf = (id: string) => plan?.parts.find((part) => part.id === id)?.ml;

  return (
    <aside
      aria-label="调漆面板"
      data-mix-panel="blend"
      className="flex shrink-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">调漆</h2>
        <span className="t-readout text-[10px] text-text-3">{rows.length + ' 组分'}</span>
      </div>

      <div className="flex min-h-0 flex-col gap-3 p-3">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-[11px] text-text-2">
            <input
              type="checkbox"
              aria-label="按目标总容量分摊"
              checked={useTarget}
              onChange={(event) => onUseTargetChange(event.target.checked)}
              className="h-3 w-3 accent-accent"
            />
            按目标总容量 V 分摊
          </label>
          {useTarget ? (
            <span className="flex items-center gap-1">
              <input
                aria-label="目标总容量 V"
                data-target-input=""
                inputMode="decimal"
                value={targetText}
                onChange={(event) => onTargetChange(event.target.value)}
                className="t-readout h-7 w-full border border-line bg-bg-1 px-1.5 text-xs text-text-1"
              />
              <span className="shrink-0 text-[10px] text-text-3">ml</span>
            </span>
          ) : (
            <p className="text-[10px] leading-snug text-text-3">按各组分填写的 ml 直接混合，合计自动累加。</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" data-action="blend-equalize" disabled={rows.length === 0} onClick={onEqualize}>
            等分
          </Button>
          <Button size="sm" variant="ghost" data-action="blend-clear" disabled={rows.length === 0} onClick={onClear}>
            清空组分
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="border border-line px-2 py-3 text-center text-[11px] text-text-3">
            左侧勾选漆料组分
          </p>
        ) : (
          <ul data-blend-parts="" className="flex max-h-60 min-h-0 flex-col gap-1 overflow-auto">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-1.5 border border-line px-1.5 py-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-text-1">
                    {row.code} {row.name}
                  </span>
                  <span className="t-readout block text-[9px] text-text-3">
                    {'可用 ' + formatMl(row.availableMl) + ' ml' + (row.ratioN > 0 ? ' · ' + formatRatio(row.ratioN) : '')}
                  </span>
                </span>
                <input
                  aria-label={'份量 ' + row.code}
                  data-part-ml={row.id}
                  inputMode="decimal"
                  value={row.mlText}
                  onChange={(event) => onChangeMl(row.id, event.target.value)}
                  className={cn(
                    't-readout h-6 w-14 border bg-bg-1 px-1 text-center text-[11px] text-text-1',
                    (shareOf(row.id) ?? 0) > row.availableMl + 1e-6 ? 'border-danger' : 'border-line',
                  )}
                />
                <span className="w-9 shrink-0 text-right text-[9px] text-text-3">
                  {shareOf(row.id) === undefined ? 'ml' : '→' + formatMl(shareOf(row.id) as number)}
                </span>
                <button
                  type="button"
                  aria-label={'移除组分 ' + row.code}
                  data-part-remove={row.id}
                  onClick={() => onRemove(row.id)}
                  className="h-6 w-5 shrink-0 border border-line text-[10px] text-text-3 hover:text-danger"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1 border-t border-line pt-2" data-blend-results="">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-2">合计</span>
            <span data-result="total" className="t-readout text-sm text-text-1">
              {(plan?.totalMl ?? 0).toFixed(1) + ' ml'}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-2">其中原浆</span>
            <span data-result="neat" className="t-readout text-xs text-text-1">
              {(plan?.neatMl ?? 0).toFixed(1) + ' ml'}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-2">其中稀释剂</span>
            <span data-result="thinner" className="t-readout text-xs text-text-1">
              {(plan?.thinnerMl ?? 0).toFixed(1) + ' ml'}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-2">等效比例</span>
            <span data-result="ratio" className="t-readout text-xs text-text-1">
              {formatRatio(plan?.ratioN ?? 0)}
            </span>
          </div>
        </div>

        {blockers.map((message) => (
          <p
            key={message}
            role="alert"
            data-blocker=""
            className="border border-danger px-2 py-1 text-[10px] leading-relaxed text-danger"
          >
            {message}
          </p>
        ))}

        <Button data-action="blend-commit" variant="primary" chamfer disabled={!canCommit} onClick={onCommit}>
          调漆
        </Button>
      </div>
    </aside>
  );
}
