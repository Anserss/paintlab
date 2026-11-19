import { memo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintTitle } from '@/core/render/label';
import { dilutionTagText } from '@/core/render/batch';
import { isLowVolume } from '@/core/rules/low-volume';
import { cn } from '@/components/ui';
import { DilutionTag } from '@/components/paint/DilutionTag';
import { LowVolumeTag } from '@/components/paint/LowVolumeTag';
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
  /** 自定义混合批次色样的透明度 / 未定色态 */
  swatchAlpha?: number;
  swatchUndefined?: boolean;
  /** 稀释漆料：名称前的「(1:N)稀释」小牌 */
  dilutionRatioN?: number | null;
  onSelect?: (paint: Paint, e?: MouseEvent<HTMLElement>) => void;
  className?: string;
}

/** PaintTile：148×176 瓶位磁贴，上半 88 为瓶身/色样区，下半为名称/色号/属性/余量 */
export const PaintTile = memo(function PaintTile({
  paint,
  line,
  stock,
  plannedUseMl,
  usedMl,
  selected = false,
  swatchAlpha,
  swatchUndefined,
  dilutionRatioN,
  onSelect,
  className,
}: PaintTileProps) {
  const title = paintTitle(paint);
  const desc = paintDescription(paint, line);
  const diluted = typeof dilutionRatioN === 'number' && dilutionRatioN > 0;
  const low = stock ? isLowVolume(stock.volumeMl, stock.initialMl) : false;
  const label = [
    low ? '容量偏低' : null,
    diluted ? dilutionTagText(dilutionRatioN) : null,
    title.primary,
    codeOrDash(paint.code),
    desc,
  ]
    .filter(Boolean)
    .join('，');

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
        'group relative flex w-tile shrink-0 cursor-pointer select-none flex-col overflow-hidden border bg-surface transition-colors duration-hover',
        selected ? 'border-[var(--ef-trace)]' : 'border-line hover:border-line-strong',
        className,
      )}
      style={{ height: 'var(--tile-h)' }}
    >
      <div className="relative h-[88px] w-full">
        <PaintSwatch
          hex={paint.hex}
          paintClass={paint.paintClass}
          size="fill"
          alpha={swatchAlpha}
          undefinedColor={swatchUndefined}
        />
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-1 w-1"
            style={{ width: 4, height: 4, background: 'var(--ef-ink)' }}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 p-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {low && <LowVolumeTag />}
          {diluted && <DilutionTag ratioN={dilutionRatioN} />}
          <span className="truncate text-[15px] font-semibold leading-tight text-text-1">{title.primary}</span>
        </div>
        <div className="ef-field truncate text-[13px] text-text-2">{codeOrDash(paint.code)}</div>
        <div data-paint-desc="" className="truncate text-[11px] text-text-2">
          {desc}
        </div>
        {(plannedUseMl !== undefined || usedMl !== undefined) && (
          <div className="ef-field flex items-center justify-between text-[11px] text-text-2">
            <span data-planned-use="">计划 {formatMl(plannedUseMl ?? 0)}</span>
            <span data-used="">已用 {formatMl(usedMl ?? 0)}</span>
          </div>
        )}
        {stock && <StockBar volumeMl={stock.volumeMl} initialMl={stock.initialMl} className="mt-0.5" />}
      </div>
    </div>
  );
});
