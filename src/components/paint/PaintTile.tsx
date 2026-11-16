import { memo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintTitle } from '@/core/render/label';
import { cn } from '@/components/ui';
import { PaintSwatch } from '@/components/paint/PaintSwatch';
import type { PaintStock } from '@/components/paint/PaintMeta';
import { StockBar } from '@/components/paint/StockBar';

export interface PaintTileProps {
  paint: Paint;
  line: PaintLine;
  brand?: Brand | string;
  stock?: PaintStock;
  plannedUseMl?: number;
  usedMl?: number;
  selected?: boolean;
  onSelect?: (paint: Paint, e?: MouseEvent<HTMLElement>) => void;
  className?: string;
}

/** PaintTile：120×148 工位磁贴（4.5.1 变体），色块铺满顶部，其下名/色号/属性各一行 */
export const PaintTile = memo(function PaintTile({
  paint,
  line,
  stock,
  plannedUseMl,
  usedMl,
  selected = false,
  onSelect,
  className,
}: PaintTileProps) {
  const title = paintTitle(paint);
  const desc = paintDescription(paint, line);
  const label = [title.primary, codeOrDash(paint.code), desc].join('，');

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(paint);
    }
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={label}
      tabIndex={0}
      data-paint-tile=""
      data-code={codeOrDash(paint.code)}
      onClick={(e) => onSelect?.(paint, e)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex w-tile shrink-0 cursor-pointer select-none flex-col overflow-hidden rounded-card border bg-surface transition-colors duration-hover',
        selected ? 'border-accent' : 'border-line hover:border-line-strong',
        className,
      )}
      style={{ height: 'var(--tile-h)' }}
    >
      <div className="h-14 w-full">
        <PaintSwatch hex={paint.hex} paintClass={paint.paintClass} size="fill" className="!rounded-none" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-0.5 p-1.5">
        <div className="truncate text-xs font-medium text-text-1">{title.primary}</div>
        <div className="t-readout truncate text-[11px] text-text-2">{codeOrDash(paint.code)}</div>
        <div data-paint-desc="" className="truncate text-[10px] text-text-3">
          {desc}
        </div>
        {(plannedUseMl !== undefined || usedMl !== undefined) && (
          <div className="t-readout flex items-center justify-between text-[10px] text-text-3">
            <span data-planned-use="">计划 {formatMl(plannedUseMl ?? 0)}</span>
            <span data-used="">已用 {formatMl(usedMl ?? 0)}</span>
          </div>
        )}
        {stock && <StockBar volumeMl={stock.volumeMl} initialMl={stock.initialMl} className="mt-0.5" />}
      </div>
    </div>
  );
});
