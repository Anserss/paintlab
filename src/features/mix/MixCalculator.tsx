import { formatMl, formatRatio } from '@/core/math/quantity';
import { Button, cn } from '@/components/ui';
import type { MixMode, MixPlan } from './mixMath';
import { MIX_MODES, RATIO_PRESETS, formatRaw } from './mixMath';

export interface MixCalculatorProps {
  mode: MixMode;
  onModeChange: (mode: MixMode) => void;
  plan: MixPlan | null;
  capacityMl: number;
  remainingMl: number;
  ratioText: string;
  ratioN: number;
  ratioClamped: boolean;
  onRatioChange: (raw: string) => void;
  onRatioPreset: (ratioN: number) => void;
  neatText: string;
  onNeatChange: (raw: string) => void;
  totalText: string;
  onTotalChange: (raw: string) => void;
  blockers: string[];
  thinnerLabel: string | null;
  /** 开启扣减但没有 aux 稀释剂库存：走可行动面板（3.10） */
  thinnerMissing: boolean;
  thinnerMl: number;
  /** 关闭扣减后，结果区标注「未扣库存」 */
  thinnerUntracked: boolean;
  onSkipThinner: () => void;
  canMix: boolean;
  onMix: () => void;
}

function Field({
  label,
  value,
  unit,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  readOnly?: boolean;
  onChange?: (raw: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-3">{label}</span>
      <span className="flex items-center gap-1">
        <input
          aria-label={label}
          value={value}
          readOnly={readOnly}
          inputMode="decimal"
          onChange={(event) => onChange?.(event.target.value)}
          className={cn(
            't-readout h-7 w-full border border-line bg-bg-1 px-1.5 text-xs text-text-1',
            readOnly && 'text-text-2',
          )}
        />
        <span className="shrink-0 text-[10px] text-text-3">{unit}</span>
      </span>
    </label>
  );
}

function ResultRow({
  label,
  value,
  raw,
  resultKey,
  untracked,
}: {
  label: string;
  value: number | undefined;
  raw: number | undefined;
  resultKey: 'neat' | 'thinner' | 'total';
  untracked?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-text-2">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span data-result={resultKey} className="t-readout text-sm text-text-1">
          {value === undefined ? '—' : formatMl(value)}
        </span>
        <span className="text-[10px] text-text-3">ml</span>
        {untracked && (
          <span data-thinner-untracked="" className="text-[9px] text-warn">
            （未扣库存）
          </span>
        )}
        <span data-raw={resultKey} className="t-readout text-[9px] text-text-3">
          {raw === undefined ? '' : '取整前 ' + formatRaw(raw)}
        </span>
      </span>
    </div>
  );
}

/** 右栏稀释计算器：三种模式 + 比例预设 + 取整前读数（3.4.2） */
export function MixCalculator({
  mode,
  onModeChange,
  plan,
  capacityMl,
  remainingMl,
  ratioText,
  ratioN,
  ratioClamped,
  onRatioChange,
  onRatioPreset,
  neatText,
  onNeatChange,
  totalText,
  onTotalChange,
  blockers,
  thinnerLabel,
  thinnerMissing,
  thinnerMl,
  thinnerUntracked,
  onSkipThinner,
  canMix,
  onMix,
}: MixCalculatorProps) {
  return (
    <aside
      aria-label="稀释计算器"
      data-mix-panel="calc"
      className="flex shrink-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">稀释计算器</h2>
        <span className="t-readout text-[10px] text-text-3">{formatRatio(ratioN)}</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div role="radiogroup" aria-label="计算模式" className="flex flex-col gap-1">
          {MIX_MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2 border px-2 py-1.5 transition-colors duration-hover',
                mode === option.value ? 'border-accent bg-surface-2' : 'border-transparent hover:bg-surface-2',
              )}
            >
              <input
                type="radio"
                name="mix-mode"
                value={option.value}
                aria-label={option.value === 'fill' ? '补满瓶' : option.label}
                checked={mode === option.value}
                onChange={() => onModeChange(option.value)}
                className="mt-0.5 h-3 w-3 accent-accent"
              />
              <span className="min-w-0">
                <span className="block text-[11px] text-text-1">{option.label}</span>
                <span className="block text-[10px] text-text-3">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === 'fill' ? (
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-2">
              <Field label="瓶容量 C" value={formatMl(capacityMl)} unit="ml" readOnly />
              <Field label="当前余量 R" value={formatMl(remainingMl)} unit="ml" readOnly />
            </div>
            <p className="text-[10px] leading-snug text-text-3">C / R 取自瓶身，显示值即落库值</p>
          </div>
        ) : mode === 'neat' ? (
          <Field label="原浆量 A" value={neatText} unit="ml" onChange={onNeatChange} />
        ) : (
          <Field label="目标总量 V" value={totalText} unit="ml" onChange={onTotalChange} />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-text-2">比例 1 :</span>
            <input
              aria-label="比例 N"
              data-ratio-input=""
              inputMode="decimal"
              value={ratioText}
              onChange={(event) => onRatioChange(event.target.value)}
              className={cn(
                't-readout h-7 w-16 border bg-bg-1 px-1 text-center text-xs text-text-1',
                ratioClamped ? 'border-danger animate-[shake_60ms_ease-in-out_2]' : 'border-line',
              )}
            />
            <span className="text-[10px] text-text-3">0–10 · 步进 0.1</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {RATIO_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                data-ratio-preset={preset}
                aria-pressed={ratioN === preset}
                onClick={() => onRatioPreset(preset)}
                className={cn(
                  't-readout h-6 border px-1.5 text-[10px] transition-colors duration-hover',
                  ratioN === preset
                    ? 'border-accent text-accent'
                    : 'border-line text-text-2 hover:border-line-strong hover:text-text-1',
                )}
              >
                {formatRatio(preset)}
              </button>
            ))}
          </div>
          {ratioClamped && (
            <p data-ratio-clamped="" className="text-[10px] text-danger">
              {'比例超出 0–10，已钳制到 ' + ratioText}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-2" data-mix-results="">
          <ResultRow label="原浆 A" value={plan?.neatMl} raw={plan?.neatRaw} resultKey="neat" />
          <ResultRow
            label="稀释剂"
            value={plan?.thinnerMl}
            raw={plan?.thinnerRaw}
            resultKey="thinner"
            untracked={thinnerUntracked && (plan?.thinnerMl ?? 0) > 0}
          />
          <ResultRow label="合计" value={plan?.totalMl} raw={plan?.totalRaw} resultKey="total" />
        </div>

        {plan && (
          <p data-capacity-hint="" className="t-readout text-[10px] leading-snug text-text-3">
            {'剩余空间 ' + formatMl(Math.max(0, capacityMl - remainingMl)) + ' ml · 最多可加原浆 ' + formatMl(plan.overflow.maxNeatMl) + ' ml'}
          </p>
        )}

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

        {thinnerMissing && (
          <div
            role="alert"
            data-blocker=""
            data-thinner-missing=""
            className="flex flex-col gap-1.5 border border-danger px-2 py-1.5"
          >
            <p className="text-[10px] leading-relaxed text-danger">
              {'本次调配已拦下：稀释剂 ' + formatMl(thinnerMl) + ' ml 无法从库存扣减。'}
            </p>
            <p className="text-[10px] leading-relaxed text-text-2">
              原因：目录包暂无 aux 类稀释剂条目，且当前开启「扣减稀释剂库存」（设置 · trackThinner）。
            </p>
            <p className="text-[10px] leading-relaxed text-text-2">
              怎么办：点下方按钮本次不扣减稀释剂即可调配；需要真实扣减时，先在仓库登记一条稀释剂（paintClass=aux），或在设置中关闭「扣减稀释剂库存」。
            </p>
            <Button data-action="skip-thinner" variant="secondary" size="sm" onClick={onSkipThinner}>
              本次不扣减稀释剂
            </Button>
          </div>
        )}

        {thinnerLabel && (
          <p className="t-readout text-[10px] leading-snug text-text-3">{'稀释剂来源 ' + thinnerLabel}</p>
        )}

        <Button data-action="mix-calc" variant="primary" chamfer disabled={!canMix} onClick={onMix}>
          调配
        </Button>
      </div>
    </aside>
  );
}
