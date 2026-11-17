import { formatMl, formatRatio } from '@/core/math/quantity';
import { Button, cn } from '@/components/ui';
import type { DiluteInputMode, DilutePlan } from './mixMath';
import { DILUTE_INPUT_MODES, RATIO_PRESETS, formatRaw } from './mixMath';
import type { StockRow } from './useMixData';

export interface DilutePanelProps {
  source: StockRow | null;
  inputMode: DiluteInputMode;
  onInputModeChange: (mode: DiluteInputMode) => void;
  ratioText: string;
  ratioN: number;
  ratioClamped: boolean;
  onRatioChange: (raw: string) => void;
  onRatioPreset: (ratioN: number) => void;
  neatText: string;
  onNeatChange: (raw: string) => void;
  totalText: string;
  onTotalChange: (raw: string) => void;
  takenText: string;
  onTakenChange: (raw: string) => void;
  plan: DilutePlan | null;
  thinnerLabel: string | null;
  thinnerMissing: boolean;
  thinnerUntracked: boolean;
  onSkipThinner: () => void;
  blockers: string[];
  canCommit: boolean;
  onCommit: () => void;
}

function Field({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  onChange?: (raw: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-3">{label}</span>
      <span className="flex items-center gap-1">
        <input
          aria-label={label}
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange?.(event.target.value)}
          className="t-readout h-7 w-full border border-line bg-bg-1 px-1.5 text-xs text-text-1"
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
}: {
  label: string;
  value: number | undefined;
  raw: number | undefined;
  resultKey: 'neat' | 'thinner' | 'total' | 'taken';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-text-2">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span data-result={resultKey} className="t-readout text-sm text-text-1">
          {value === undefined ? '—' : formatMl(value)}
        </span>
        <span className="text-[10px] text-text-3">ml</span>
        <span data-raw={resultKey} className="t-readout text-[9px] text-text-3">
          {raw === undefined ? '' : '取整前 ' + formatRaw(raw)}
        </span>
      </span>
    </div>
  );
}

/** 右栏 · 稀释模式：原浆 + 稀释剂，或把仓库里的已稀释漆料再稀释（不再选瓶容量） */
export function DilutePanel({
  source,
  inputMode,
  onInputModeChange,
  ratioText,
  ratioN,
  ratioClamped,
  onRatioChange,
  onRatioPreset,
  neatText,
  onNeatChange,
  totalText,
  onTotalChange,
  takenText,
  onTakenChange,
  plan,
  thinnerLabel,
  thinnerMissing,
  thinnerUntracked,
  onSkipThinner,
  blockers,
  canCommit,
  onCommit,
}: DilutePanelProps) {
  const thinned = source?.state === 'thinned';
  const sourceLabel = source ? source.code + ' ' + source.name : '未选择';
  const fromRatioN = source?.ratioN ?? 0;
  const ratioInvalid = thinned && ratioN <= fromRatioN;

  return (
    <aside
      aria-label="稀释面板"
      data-mix-panel="dilute"
      className="flex shrink-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">稀释</h2>
        <span className="t-readout text-[10px] text-text-3">{formatRatio(ratioN)}</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <p data-source-line="" className="truncate text-[11px] text-text-2">
          {'取用：' + sourceLabel + (source ? ' · 余 ' + formatMl(source.volumeMl) + ' ml' : '')}
        </p>

        {thinned ? (
          <>
            <Field label="取用已稀释漆料 M" value={takenText} unit="ml" onChange={onTakenChange} />
            <p className="text-[10px] leading-snug text-text-3">
              {'当前比例 1:' + formatRatio(fromRatioN) + '；再稀释只会补加稀释剂，原比例会升高。'}
            </p>
          </>
        ) : (
          <>
            <div role="radiogroup" aria-label="稀释输入口径" className="flex flex-col gap-1">
              {DILUTE_INPUT_MODES.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 border px-2 py-1.5 transition-colors duration-hover',
                    inputMode === option.value
                      ? 'border-accent bg-surface-2'
                      : 'border-transparent hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name="dilute-input-mode"
                    value={option.value}
                    aria-label={option.label}
                    checked={inputMode === option.value}
                    onChange={() => onInputModeChange(option.value)}
                    className="mt-0.5 h-3 w-3 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-text-1">{option.label}</span>
                    <span className="block text-[10px] text-text-3">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {inputMode === 'neat' ? (
              <Field label="原浆量 A" value={neatText} unit="ml" onChange={onNeatChange} />
            ) : (
              <Field label="目标总量 V" value={totalText} unit="ml" onChange={onTotalChange} />
            )}
          </>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-text-2">
              {thinned ? '目标比例 1 :' : '比例 1 :'}
            </span>
            <input
              aria-label="比例 N"
              data-ratio-input=""
              inputMode="decimal"
              value={ratioText}
              onChange={(event) => onRatioChange(event.target.value)}
              className={cn(
                't-readout h-7 w-16 border bg-bg-1 px-1 text-center text-xs text-text-1',
                ratioClamped || ratioInvalid ? 'border-danger animate-[shake_60ms_ease-in-out_2]' : 'border-line',
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
          {ratioInvalid && (
            <p data-ratio-invalid="" className="text-[10px] text-danger">
              {'目标比例必须大于当前比例 1:' + formatRatio(fromRatioN)}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-2" data-mix-results="">
          {thinned ? (
            <>
              <ResultRow label="其中原浆" value={plan?.neatMl} raw={plan?.neatRaw} resultKey="neat" />
              <ResultRow label="补加稀释剂" value={plan?.addedThinnerMl} raw={undefined} resultKey="thinner" />
              <ResultRow label="产物体积" value={plan?.totalMl} raw={plan?.totalRaw} resultKey="total" />
            </>
          ) : (
            <>
              <ResultRow label="原浆 A" value={plan?.neatMl} raw={plan?.neatRaw} resultKey="neat" />
              <ResultRow label="稀释剂" value={plan?.thinnerMl} raw={plan?.thinnerRaw} resultKey="thinner" />
              <ResultRow label="合计" value={plan?.totalMl} raw={plan?.totalRaw} resultKey="total" />
            </>
          )}
        </div>

        {thinnerUntracked && (plan?.addedThinnerMl ?? 0) > 0 && (
          <p data-thinner-untracked="" className="text-[10px] text-warn">
            已关闭「扣减稀释剂库存」：本次稀释剂只记数值，不扣库存
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
              {'本次稀释已拦下：稀释剂 ' + formatMl(plan?.addedThinnerMl ?? 0) + ' ml 无法从库存扣减。'}
            </p>
            <p className="text-[10px] leading-relaxed text-text-2">
              怎么办：本次不扣减稀释剂即可稀释；需要真实扣减时，先在采购页入库一条稀释剂（paintClass=aux），或在设置中关闭「扣减稀释剂库存」。
            </p>
            <Button data-action="skip-thinner" variant="secondary" size="sm" onClick={onSkipThinner}>
              本次不扣减稀释剂
            </Button>
          </div>
        )}

        {thinnerLabel && <p className="t-readout text-[10px] leading-snug text-text-3">{'稀释剂来源 ' + thinnerLabel}</p>}

        <Button data-action="dilute-commit" variant="primary" chamfer disabled={!canCommit} onClick={onCommit}>
          稀释
        </Button>
      </div>
    </aside>
  );
}
