import { formatMl, formatRatio } from '@/core/math/quantity';
import type { BlendPlan } from '@/core/math/blend';
import { Button, cn } from '@/components/ui';
import { DilutionTag } from '@/components/paint';
import type { BlendLogic, BlendPartRow } from './mixMath';
import { BLEND_LOGIC_MODES, shareOf } from './mixMath';

export interface BlendPanelProps {
  rows: BlendPartRow[];
  logic: BlendLogic;
  onLogicChange: (logic: BlendLogic) => void;
  onChangeWeight: (itemId: string, raw: string) => void;
  onRemove: (itemId: string) => void;
  onEqualize: () => void;
  /** 目标总容量（仅「按总量 ÷ 配比」口径） */
  targetText: string;
  onTargetChange: (raw: string) => void;
  /** 2.2.1：用户自定义产物名称；留空 = 调漆N */
  nameText: string;
  onNameChange: (raw: string) => void;
  plan: BlendPlan | null;
  blockers: string[];
  canCommit: boolean;
  onCommit: () => void;
  busy?: boolean;
}

function sharePercent(ml: number, totalMl: number): string {
  return Math.round(shareOf(ml, totalMl) * 100) + '%';
}

/** 中栏 · 调漆：左「算法 + 组分」，右「结果卡」；两种口径共用一套表单 */
export function BlendPanel({
  rows,
  logic,
  onLogicChange,
  onChangeWeight,
  onRemove,
  onEqualize,
  targetText,
  onTargetChange,
  nameText,
  onNameChange,
  plan,
  blockers,
  canCommit,
  onCommit,
  busy = false,
}: BlendPanelProps) {
  const shareOfId = (id: string) => plan?.parts.find((part) => part.id === id);
  const ratioMode = logic === 'ratio';

  return (
    <aside
      aria-label="调漆面板"
      data-mix-panel="blend"
      className="flex min-h-0 flex-1 flex-col border bg-surface"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-4"
        style={{ height: 52, borderColor: 'var(--ef-rule)' }}
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-[16px] font-bold">调漆</h2>
          <span className="ef-field text-[12px] text-text-2">{rows.length + ' 组分'}</span>
        </div>
        <span className="ef-field shrink-0 text-[11px] text-text-2" data-sop="">
          ① 选组分 → ② 选算法填数据 → ③ 确认入库
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div role="radiogroup" aria-label="调漆算法" className="grid shrink-0 gap-2 sm:grid-cols-2">
            {BLEND_LOGIC_MODES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 border px-3 py-2 transition-colors duration-hover',
                  logic === option.value ? 'bg-chip' : 'border-transparent hover:bg-surface-2',
                )}
                style={{ borderColor: logic === option.value ? 'var(--ef-ink)' : 'var(--ef-rule)' }}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="blend-logic"
                    value={option.value}
                    aria-label={option.label}
                    checked={logic === option.value}
                    onChange={() => onLogicChange(option.value)}
                    className="h-4 w-4"
                    style={{ accentColor: 'var(--ef-ink)' }}
                  />
                  <span className="text-[13px] font-semibold text-text-1">{option.label}</span>
                </span>
                <span className="text-[11px] leading-snug text-text-2">{option.hint}</span>
              </label>
            ))}
          </div>

          {ratioMode && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="ef-eyebrow">目标总容量 V</span>
                <span className="flex items-center gap-2">
                  <input
                    aria-label="目标总容量 V"
                    data-target-input=""
                    inputMode="decimal"
                    value={targetText}
                    onChange={(event) => onTargetChange(event.target.value)}
                    className="ef-input ef-input--lg"
                    style={{ height: 48, width: 140 }}
                  />
                  <span className="ef-field shrink-0 text-[12px] text-text-2">ml</span>
                </span>
              </label>
              <Button
                size="sm"
                variant="ghost"
                data-action="blend-equalize"
                disabled={rows.length === 0}
                onClick={onEqualize}
              >
                配比全部等分
              </Button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="border px-3 py-8 text-center text-[13px] text-text-2" style={{ borderColor: 'var(--ef-rule)' }}>
              左侧勾选漆料组分（可以是原浆、已稀释漆料或库里的调漆产物）
            </p>
          ) : (
            <ul data-blend-parts="" className="flex shrink-0 flex-col gap-1.5">
              {rows.map((row) => {
                const share = shareOfId(row.id);
                const over = (share?.ml ?? 0) > row.availableMl + 1e-6;
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 border px-3 py-2"
                    style={{ borderColor: over ? 'var(--ef-danger)' : 'var(--ef-rule)' }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-8 w-8 shrink-0 border"
                      style={{ background: row.hex, borderColor: 'var(--ef-swatch-ring)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {row.dilutionRatioN !== null && <DilutionTag ratioN={row.dilutionRatioN} />}
                        <span className="truncate text-[13px] font-medium text-text-1">
                          {row.mixed ? row.name : row.code + ' ' + row.name}
                        </span>
                        {row.mixed && (
                          <span className="ef-tag shrink-0" title="库里的调漆产物">
                            调漆
                          </span>
                        )}
                      </span>
                      <span className="ef-field block text-[11px] text-text-2">
                        {'可用 ' +
                          formatMl(row.availableMl) +
                          ' ml' +
                          (row.ratioN > 0 ? ' · ' + formatRatio(row.ratioN) : '') +
                          (share ? ' · 占 ' + sharePercent(share.ml, plan?.totalMl ?? 0) : '')}
                      </span>
                    </span>
                    <label className="flex shrink-0 items-center gap-1.5">
                      <span className="ef-eyebrow">{ratioMode ? '配比' : '用量'}</span>
                      <input
                        aria-label={(ratioMode ? '配比 ' : '用量 ') + (row.mixed ? row.name : row.code)}
                        data-part-ml={row.id}
                        data-part-mode={logic}
                        inputMode="decimal"
                        value={row.weightText}
                        onChange={(event) => onChangeWeight(row.id, event.target.value)}
                        className="ef-field w-20 border bg-transparent px-1 text-center text-[14px] text-text-1"
                        style={{
                          height: 36,
                          borderColor: over ? 'var(--ef-danger)' : 'var(--ef-rule)',
                        }}
                      />
                    </label>
                    <span className="ef-field w-24 shrink-0 text-right text-[12px] text-text-1" data-part-share={row.id}>
                      {share ? '→ ' + formatMl(share.ml) + ' ml' : ratioMode ? '→ —' : 'ml'}
                    </span>
                    <button
                      type="button"
                      aria-label={'移除组分 ' + (row.mixed ? row.name : row.code)}
                      data-part-remove={row.id}
                      onClick={() => onRemove(row.id)}
                      className="h-9 w-9 shrink-0 border text-[14px] text-text-2 hover:text-danger"
                      style={{ borderColor: 'var(--ef-rule)' }}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {blockers.map((message) => (
            <p key={message} role="alert" data-blocker="" className="ef-flag shrink-0 text-[12px] leading-relaxed">
              {message}
            </p>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="grid shrink-0 gap-3 border p-4 sm:grid-cols-2 lg:grid-cols-1"
            style={{ borderColor: 'var(--ef-rule)' }}
            data-blend-results=""
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-text-2">合计</span>
              <span data-result="total" className="ef-field text-[20px] font-bold text-text-1">
                {(plan?.totalMl ?? 0).toFixed(1) + ' ml'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-text-2">等效比例</span>
              <span data-result="ratio" className="ef-field text-[15px] font-semibold text-text-1">
                {formatRatio(plan?.ratioN ?? 0)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-text-2">其中原浆</span>
              <span data-result="neat" className="ef-field text-[13px] text-text-1">
                {(plan?.neatMl ?? 0).toFixed(1) + ' ml'}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-text-2">其中稀释剂</span>
              <span data-result="thinner" className="ef-field text-[13px] text-text-1">
                {(plan?.thinnerMl ?? 0).toFixed(1) + ' ml'}
              </span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-text-2">
            {ratioMode
              ? '按配比权重把目标总容量分摊到各组分；合计严格等于 V。'
              : '按各组分填写的 ml 直接混合；合计与占比自动累加。'}
          </p>

          <label className="flex shrink-0 flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="ef-eyebrow">产物名称（可选）</span>
              <span className="ef-field text-[10px] text-text-2">{nameText.trim().length + '/16'}</span>
            </span>
            <input
              aria-label="产物名称"
              data-mix-name=""
              maxLength={16}
              value={nameText}
              placeholder="留空 = 调漆N"
              onChange={(event) => onNameChange(event.target.value)}
              className="ef-input"
              style={{ height: 44 }}
            />
            <span className="text-[11px] leading-snug text-text-2">
              用户自定义名称；留空按「调漆N」自动命名。同配方合并时填了名称会给那一瓶改名。
            </span>
          </label>
        </div>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
        style={{ borderColor: 'var(--ef-rule)' }}
      >
        <p className="text-[12px] leading-snug text-text-2">
          确认后自动扣减各组分库存并入库；库中已有同配方会自动合并容量。
        </p>
        <Button
          data-action="blend-commit"
          variant="primary"
          size="lg"
          className="min-w-[180px]"
          disabled={!canCommit || busy}
          onClick={onCommit}
        >
          调漆并入库
        </Button>
      </div>
    </aside>
  );
}
