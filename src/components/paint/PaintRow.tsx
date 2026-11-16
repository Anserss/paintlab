import { memo } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { isEmptyBottle } from '@/core/render/bottle';
import { formatMl } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintTitle } from '@/core/render/label';
import { Badge, cn } from '@/components/ui';
import { PaintSwatch } from '@/components/paint/PaintSwatch';
import { PaintMeta } from '@/components/paint/PaintMeta';
import type { PaintStock } from '@/components/paint/PaintMeta';
import { StockBar } from '@/components/paint/StockBar';

export interface PaintRowActions {
  onOpen?: (paint: Paint) => void;
  onAddToStation?: (paint: Paint) => void;
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
  actions?: PaintRowActions;
  onSelect?: (paint: Paint, e?: MouseEvent<HTMLElement>) => void;
  /** Space / 单击行的"详情"出口（4.5.1 键盘：Space 详情） */
  onDetail?: (paint: Paint) => void;
  className?: string;
}

const ACTION_CLASS =
  'h-6 border border-line px-1.5 text-[11px] text-text-2 transition-colors duration-hover hover:border-line-strong hover:text-text-1';

/**
 * PaintRow：全站默认信息原子（4.5.1）。纯展示，数据进、回调出。
 * 72px（compact 56px）/ 36×36 色块 / 三段式文字 / 悬停浮出 3 个动作。
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
  actions,
  onSelect,
  onDetail,
  className,
}: PaintRowProps) {
  const title = paintTitle(paint);
  const empty = stock ? isEmptyBottle(stock.volumeMl) : false;
  const label = [
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
      data-code={codeOrDash(paint.code)}
      onClick={(e) => onSelect?.(paint, e)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex w-full cursor-pointer select-none items-center gap-3 border-l-2 pl-2 pr-2 transition-colors duration-hover',
        compact ? 'h-row-compact' : 'h-row',
        selected ? 'border-l-accent bg-surface-2' : 'border-l-transparent hover:bg-surface-2',
        empty && 'opacity-50',
        className,
      )}
    >
      <PaintSwatch hex={paint.hex} paintClass={paint.paintClass} size={compact ? 24 : 36} />
      <PaintMeta paint={paint} line={line} brand={brand} stock={stock} compact={compact} className="flex-1" />

      <div className="ml-auto flex shrink-0 items-center gap-2 self-stretch py-2">
        <div className="flex flex-col items-end justify-between gap-2">
          <div className="flex items-center gap-1">
            {badges}
            {typeof registeredCount === 'number' && registeredCount > 0 && (
              <Badge>已登记×{registeredCount}</Badge>
            )}
            {empty && <Badge>空</Badge>}
          </div>
          {stock && !compact && <StockBar volumeMl={stock.volumeMl} initialMl={stock.initialMl} className="w-16" />}
        </div>

        {actions && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity duration-hover group-focus-within:opacity-100 group-hover:opacity-100">
            {actions.onOpen && (
              <button
                type="button"
                aria-label="详情"
                title="详情"
                className={ACTION_CLASS}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onOpen?.(paint);
                }}
              >
                详情
              </button>
            )}
            {actions.onAddToStation && (
              <button
                type="button"
                aria-label="加入工位"
                title="加入工位"
                className={ACTION_CLASS}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onAddToStation?.(paint);
                }}
              >
                入位
              </button>
            )}
            {actions.onUse && (
              <button
                type="button"
                aria-label="取用调漆"
                title="取用调漆"
                className={ACTION_CLASS}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onUse?.(paint);
                }}
              >
                取用
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
