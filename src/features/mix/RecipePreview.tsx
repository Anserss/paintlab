import { formatMl, formatRatio } from '@/core/math/quantity';
import { cn } from '@/components/ui';

export interface RecipePreviewPart {
  key: string;
  label: string;
  code?: string;
  hex: string;
  ml: number;
  /** 0–1 */
  share: number;
  aux?: boolean;
  /** 调漆产物的自定义透明度 */
  alpha?: number;
}

export interface RecipePreviewProps {
  parts: RecipePreviewPart[];
  totalMl: number;
  ratioN: number;
  modeLabel: string;
  /** 最近一次入库结果（显示在页脚） */
  lastResult?: { label: string; addedMl: number; merged: boolean } | null;
}

function percentOf(share: number): string {
  return Math.round(Math.max(0, share) * 100) + '%';
}

/**
 * 2.2「配方」区（用户要求缩小，把上方空间让给操作区）：
 * 一条按真实体积占比分段的配方条 + 紧凑图例；不再画大瓶身 / 配方环。
 */
export function RecipePreview({ parts, totalMl, ratioN, modeLabel, lastResult }: RecipePreviewProps) {
  const visible = parts.filter((part) => part.ml > 0);
  return (
    <section
      aria-label="配方"
      data-recipe-preview=""
      className="flex shrink-0 flex-col gap-2 border bg-surface px-4 py-3"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="ef-eyebrow">配方</span>
          <span className="text-[13px] font-semibold text-text-1" data-recipe-mode="">
            {modeLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="ef-field text-[12px] text-text-2">
            {'合计 '}
            <span data-recipe-total="" className="text-[14px] font-bold text-text-1">
              {formatMl(totalMl)}
            </span>
            {' ml · ' + formatRatio(ratioN)}
          </span>
          {lastResult && (
            <span className="ef-field text-[11px] text-text-2" data-last-mix="">
              {'最近入库 ' + formatMl(lastResult.addedMl) + ' ml · ' + lastResult.label + (lastResult.merged ? '（已合并）' : '')}
            </span>
          )}
        </div>
      </div>

      <div
        className="flex h-6 w-full overflow-hidden border"
        style={{ borderColor: 'var(--ef-rule)', background: 'var(--ef-chip)' }}
        aria-hidden="true"
        data-recipe-bar=""
      >
        {visible.length === 0 ? (
          <span className="flex w-full items-center justify-center text-[11px] text-text-2">选好漆料后显示配方</span>
        ) : (
          visible.map((part) => (
            <span
              key={part.key}
              className="relative h-full min-w-[2px]"
              style={{
                width: Math.max(0.02, part.share) * 100 + '%',
                background: part.hex,
                opacity: typeof part.alpha === 'number' ? part.alpha / 100 : 1,
              }}
            >
              {part.aux && <span className="tex-hatch absolute inset-0" style={{ opacity: 0.7 }} />}
            </span>
          ))
        )}
      </div>

      <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
        {visible.length === 0 ? (
          <li className="text-[11px] text-text-2">没有可预览的配方（先选料并填数据）</li>
        ) : (
          visible.map((part) => (
            <li
              key={part.key}
              data-recipe-part={part.key}
              className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-text-2"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 border"
                style={{ background: part.hex, borderColor: 'var(--ef-swatch-ring)' }}
              />
              {part.code && <span className="ef-field shrink-0 text-[10px]">{part.code}</span>}
              <span className="max-w-[160px] truncate text-text-1">{part.label}</span>
              <span className="ef-field shrink-0">{formatMl(part.ml) + ' ml'}</span>
              <span className={cn('ef-field shrink-0', part.aux ? 'text-text-2' : 'text-text-1')}>
                {percentOf(part.share)}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
