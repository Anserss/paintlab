import { memo } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { isEmptyBottle } from '@/core/render/bottle';
import { isLowVolume } from '@/core/rules/low-volume';
import { formatMl } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintTitle } from '@/core/render/label';
import { dilutionTagText } from '@/core/render/batch';
import { Badge, cn } from '@/components/ui';
import { PaintSwatch } from '@/components/paint/PaintSwatch';
import { PaintMeta } from '@/components/paint/PaintMeta';
import type { PaintStock } from '@/components/paint/PaintMeta';
import { StockBar } from '@/components/paint/StockBar';

export interface PaintRowActions {
  onOpen?: (paint: Paint) => void;
  onOpenCoat?: (paint: Paint) => void;
  onUse?: (paint: Paint) => void;
}

export interface PaintRowProps {
  paint: Paint;
  line: PaintLine;
  brand?: Brand | string;
  stock?: PaintStock;
  registeredCount?: number;
  badges?: ReactNode;
  selected?: boolean;
  compact?: boolean;
  /** 自定义混合批次的色样透明度（0–100） */
  swatchAlpha?: number;
  /** 自定义混合批次的"未定色"态 */
  swatchUndefined?: boolean;
  /** 稀释漆料：名称前的「(1:N)稀释」小牌 */
  dilutionRatioN?: number | null;
  actions?: PaintRowActions;
  onSelect?: (paint: Paint, e?: MouseEvent<HTMLElement>) => void;
  /** Space / 单击行的"详情"出口 */
  onDetail?: (paint: Paint) => void;
  className?: string;
}

const ACTION_CLASS =
  'flex h-8 items-center border px-2 text-[12px] text-text-2 transition-colors duration-hover hover:border-text-1 hover:text-text-1';

/**
 * PaintRow：全站默认信息原子。纯展示，数据进、回调出。
 * 68px（compact 56px）/ 40×40 色块 / 三段式文字 / 悬停浮出 3 个 32 高动作。
 */
export const PaintRow = memo(function PaintRow({
  paint,
  line,
  brand,
  stock,
  registeredCount,
  badges,
  selected = false,
  compact = false,
  swatchAlpha,
  swatchUndefined,
  dilutionRatioN,
  actions,
  onSelect,
  onDetail,
  className,
}: PaintRowProps) {
  const title = paintTitle(paint);
  const empty = stock ? isEmptyBottle(stock.volumeMl) : false;
  const low = stock ? isLowVolume(stock.volumeMl, stock.initialMl) : false;
  const label = [
    low ? '容量偏低' : null,
    dilutionRatioN ? dilutionTagText(dilutionRatioN) : null,
    title.primary,
    title.secondary,
    codeOrDash(paint.code),
    paintDescription(paint, line),
    stock ? '余量 ' + formatMl(stock.volumeMl) + '/' + formatMl(stock.initialMl) + ' ml' : null,
    empty ? '空瓶' : null,
  ]
    .filter(Boolean)
    .join('，');

  const open = () => actions?.onOpen?.(paint);
  const detail = () => (onDetail ?? onSelect)?.(paint);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      open();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      detail();
    }
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={0}
      data-paint-row=""
      data-empty={empty ? '' : undefined}
      data-low-volume={low ? '' : undefined}
      data-code={codeOrDash(paint.code)}
      onClick={(e) => onSelect?.(paint, e)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex w-full cursor-pointer select-none items-center gap-3 border-l-4 pl-3 pr-2 transition-colors duration-hover',
        compact ? 'min-h-row-compact' : 'min-h-row',
        selected
          ? 'border-l-[var(--ef-trace)] bg-surface-2'
          : 'border-l-transparent hover:border-l-[var(--ef-trace)] hover:bg-surface-2',
        className,
      )}
    >
      <PaintSwatch
        hex={paint.hex}
        paintClass={paint.paintClass}
        size={compact ? 28 : 40}
        alpha={swatchAlpha}
        undefinedColor={swatchUndefined}
      />
      <PaintMeta
        paint={paint}
        line={line}
        brand={brand}
        stock={stock}
        compact={compact}
        dilutionRatioN={dilutionRatioN}
        className="flex-1"
      />

      <div className="ml-auto flex shrink-0 items-center gap-2 self-stretch py-2">
        <div className="flex flex-col items-end justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {badges}
            {paint.hexEstimated && (
              <Badge tone="warn" title="色值为按色名推定的近似值，尚未按厂商官方色卡核验">
                ≈ 推定色
              </Badge>
            )}
            {typeof registeredCount === 'number' && registeredCount > 0 && (
              <Badge>已入库×{registeredCount}</Badge>
            )}
            {empty && <Badge>空</Badge>}
          </div>
          {stock && !compact && <StockBar volumeMl={stock.volumeMl} initialMl={stock.initialMl} className="w-20" />}
        </div>

        {actions && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-hover group-focus-within:opacity-100 group-hover:opacity-100">
            {actions.onOpen && (
              <button
                type="button"
                aria-label="详情"
                title="详情"
                className={ACTION_CLASS}
                style={{ borderColor: 'var(--ef-rule)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onOpen?.(paint);
                }}
              >
                详情
              </button>
            )}
            {actions.onOpenCoat && (
              <button
                type="button"
                aria-label="开涂"
                title="开涂"
                className={ACTION_CLASS}
                style={{ borderColor: 'var(--ef-rule)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onOpenCoat?.(paint);
                }}
              >
                开涂
              </button>
            )}
            {actions.onUse && (
              <button
                type="button"
                aria-label="调漆"
                title="调漆"
                className={ACTION_CLASS}
                style={{ borderColor: 'var(--ef-rule)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onUse?.(paint);
                }}
              >
                调漆
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
