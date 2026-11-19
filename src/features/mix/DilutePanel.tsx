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
  /** 正在提交（防连点） */
  busy?: boolean;
}

function Field({
  label,
  value,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  onChange?: (raw: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="ef-eyebrow">{label}</span>
        {hint && <span className="text-[11px] text-text-2">{hint}</span>}
      </span>
      <span className="flex items-center gap-2">
        <input
          aria-label={label}
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange?.(event.target.value)}
          className="ef-input ef-input--lg"
          style={{ height: 48 }}
        />
        <span className="ef-field shrink-0 text-[12px] text-text-2">{unit}</span>
      </span>
    </label>
  );
}

function ResultRow({
  label,
  value,
  raw,
  resultKey,
  strong,
}: {
  label: string;
  value: number | undefined;
  raw?: number | undefined;
  resultKey: 'neat' | 'thinner' | 'total' | 'taken';
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[13px] text-text-2">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span
          data-result={resultKey}
          className={cn('ef-field text-text-1', strong ? 'text-[20px] font-bold' : 'text-[16px] font-semibold')}
        >
          {value === undefined ? '—' : formatMl(value)}
        </span>
        <span className="ef-field text-[11px] text-text-2">ml</span>
        <span data-raw={resultKey} className="ef-field text-[10px] text-text-2">
          {raw === undefined ? '' : '取整前 ' + formatRaw(raw)}
        </span>
      </span>
    </div>
  );
}

/** 中栏 · 稀释：左侧选料，右侧填量 / 比例；确认后自动扣减并入库 */
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
  busy = false,
}: DilutePanelProps) {
  const thinned = source?.state === 'thinned';
  const sourceLabel = source ? source.code + ' ' + source.name : '未选择漆料';
  const fromRatioN = source?.ratioN ?? 0;
  const ratioInvalid = thinned && ratioN <= fromRatioN;

  return (
    <aside
      aria-label="稀释面板"
      data-mix-panel="dilute"
      className="flex min-h-0 flex-1 flex-col border bg-surface"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-4"
        style={{ height: 52, borderColor: 'var(--ef-rule)' }}
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-[16px] font-bold">稀释</h2>
          <span className="ef-field truncate text-[12px] text-text-2" data-source-line="">
            {'取用：' + sourceLabel + (source ? ' · 余 ' + formatMl(source.volumeMl) + ' ml' : '')}
          </span>
        </div>
        <span className="ef-field shrink-0 text-[11px] text-text-2" data-sop="">
          ① 选料 → ② 填量/比例 → ③ 确认入库
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-5 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {thinned ? (
            <>
              <Field label="取用已稀释漆料 M" value={takenText} unit="ml" onChange={onTakenChange} />
              <p className="text-[12px] leading-relaxed text-text-2">
                {'当前比例 ' + formatRatio(fromRatioN) + '；再稀释只会补加稀释剂，原比例会升高。'}
              </p>
            </>
          ) : (
            <>
              <div role="radiogroup" aria-label="稀释输入口径" className="grid grid-cols-2 gap-2">
                {DILUTE_INPUT_MODES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 border px-3 py-2 transition-colors duration-hover',
                      inputMode === option.value ? 'bg-chip' : 'border-transparent hover:bg-surface-2',
                    )}
                    style={{ borderColor: inputMode === option.value ? 'var(--ef-ink)' : 'var(--ef-rule)' }}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="dilute-input-mode"
                        value={option.value}
                        aria-label={option.label}
                        checked={inputMode === option.value}
                        onChange={() => onInputModeChange(option.value)}
                        className="h-4 w-4"
                        style={{ accentColor: 'var(--ef-ink)' }}
                      />
                      <span className="text-[13px] font-semibold text-text-1">{option.label}</span>
                    </span>
                    <span className="text-[11px] leading-snug text-text-2">{option.hint}</span>
                  </label>
                ))}
              </div>
              {inputMode === 'neat' ? (
                <Field label="原浆量 A" value={neatText} unit="ml" onChange={onNeatChange} hint="按比例正推稀释剂" />
              ) : (
                <Field label="目标总量 V" value={totalText} unit="ml" onChange={onTotalChange} hint="按比例反推原浆" />
              )}
            </>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[13px] text-text-2">{thinned ? '目标比例 1 :' : '比例 1 :'}</span>
              <input
                aria-label="比例 N"
                data-ratio-input=""
                inputMode="decimal"
                value={ratioText}
                onChange={(event) => onRatioChange(event.target.value)}
                className="ef-input ef-input--lg w-24"
                style={{
                  height: 48,
                  borderColor: ratioClamped || ratioInvalid ? 'var(--ef-trace)' : 'var(--ef-rule)',
                }}
              />
              <span className="text-[11px] text-text-2">0–10 · 步进 0.1</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RATIO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-ratio-preset={preset}
                  aria-pressed={ratioN === preset}
                  onClick={() => onRatioPreset(preset)}
                  className={cn(
                    'h-9 border px-3 text-[13px] transition-colors duration-hover',
                    ratioN === preset
                      ? 'border-transparent bg-ink font-semibold text-panel'
                      : 'text-text-2 hover:border-text-1 hover:text-text-1',
                  )}
                  style={{ borderColor: ratioN === preset ? 'var(--ef-ink)' : 'var(--ef-rule)' }}
                >
                  {formatRatio(preset)}
                </button>
              ))}
            </div>
            {ratioClamped && (
              <p data-ratio-clamped="" className="ef-flag" role="alert">
                {'比例超出 0–10，已钳制到 ' + ratioText}
              </p>
            )}
            {ratioInvalid && (
              <p data-ratio-invalid="" className="ef-flag" role="alert">
                {'目标比例必须大于当前比例 ' + formatRatio(fromRatioN)}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="border p-4" style={{ borderColor: 'var(--ef-rule)' }}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="ef-eyebrow">本次产出</span>
              <span className="ef-field text-[11px] text-text-2">{formatRatio(ratioN)}</span>
            </div>
            <div className="flex flex-col gap-2" data-mix-results="">
              {thinned ? (
                <>
                  <ResultRow label="其中原浆" value={plan?.neatMl} raw={plan?.neatRaw} resultKey="neat" />
                  <ResultRow label="补加稀释剂" value={plan?.addedThinnerMl} raw={undefined} resultKey="thinner" />
                  <ResultRow label="产物体积" value={plan?.totalMl} raw={plan?.totalRaw} resultKey="total" strong />
                </>
              ) : (
                <>
                  <ResultRow label="原浆 A" value={plan?.neatMl} raw={plan?.neatRaw} resultKey="neat" />
                  <ResultRow label="稀释剂" value={plan?.thinnerMl} raw={plan?.thinnerRaw} resultKey="thinner" />
                  <ResultRow label="合计" value={plan?.totalMl} raw={plan?.totalRaw} resultKey="total" strong />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="ef-field text-[11px] leading-snug text-text-2">
              {thinnerLabel ? '稀释剂来源 ' + thinnerLabel : '稀释剂来源：暂无可用辅料'}
            </p>
            {thinnerUntracked && (plan?.addedThinnerMl ?? 0) > 0 && (
              <p data-thinner-untracked="" className="ef-flag text-[12px]">
                已关闭「扣减稀释剂库存」：本次稀释剂只记数值，不扣库存
              </p>
            )}
          </div>

          {blockers.map((message) => (
            <p key={message} role="alert" data-blocker="" className="ef-flag text-[12px] leading-relaxed">
              {message}
            </p>
          ))}

          {thinnerMissing && (
            <div role="alert" data-blocker="" data-thinner-missing="" className="ef-flag gap-2">
              <p className="text-[12px] leading-relaxed">
                {'本次稀释已拦下：稀释剂 ' + formatMl(plan?.addedThinnerMl ?? 0) + ' ml 无法从库存扣减。'}
              </p>
              <p className="text-[12px] leading-relaxed text-text-2">
                怎么办：本次不扣减稀释剂即可稀释；需要真实扣减时，先在采购页入库一条稀释剂（paintClass=aux），或在设置中关闭「扣减稀释剂库存」。
              </p>
              <Button data-action="skip-thinner" variant="secondary" size="sm" onClick={onSkipThinner}>
                本次不扣减稀释剂
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
        style={{ borderColor: 'var(--ef-rule)' }}
      >
        <p className="text-[12px] leading-snug text-text-2">
          确认后自动扣减库存并入库；库中已有同配方会自动合并容量。
        </p>
        <Button
          data-action="dilute-commit"
          variant="primary"
          size="lg"
          className="min-w-[180px]"
          disabled={!canCommit || busy}
          onClick={onCommit}
        >
          稀释并入库
        </Button>
      </div>
    </aside>
  );
}
