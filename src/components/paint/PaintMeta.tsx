import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { isLowStock } from '@/core/render/bottle';
import { codeOrDash, paintDescription, paintOriginLine, paintTitle } from '@/core/render/label';
import { formatMl } from '@/core/math/quantity';
import { cn } from '@/components/ui';

export interface PaintStock {
  volumeMl: number;
  initialMl: number;
}

export interface PaintMetaProps {
  paint: Paint;
  line: PaintLine;
  brand?: Brand | string;
  stock?: PaintStock;
  /** 密度 compact：第 3 行折入第 2 行尾部（4.5.1） */
  compact?: boolean;
  className?: string;
}

/** 品牌显示名：中文优先，无中文名回退英文（2.3.1 ②） */
export function brandNameOf(brand?: Brand | string): string | undefined {
  if (!brand) return undefined;
  if (typeof brand === 'string') return brand;
  return brand.nameZh || brand.name;
}

/**
 * 三段式色卡文字（2.3.1）：
 * ① 中文名/英文名 + 色号 ② paintDescription 中文属性行 ③ 品牌 · 产品线 · 规格或余量
 */
export function PaintMeta({ paint, line, brand, stock, compact = false, className }: PaintMetaProps) {
  const title = paintTitle(paint);
  const desc = paintDescription(paint, line);
  const origin = paintOriginLine(brandNameOf(brand), line.name);
  const spec = line.defaultVolumeMl + ' ml';
  const reading = stock ? formatMl(stock.volumeMl) + '/' + formatMl(stock.initialMl) + ' ml' : null;
  const low = stock ? isLowStock(stock.volumeMl, stock.initialMl) : false;

  const first = (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-sm font-medium text-text-1">{title.primary}</span>
      {title.secondary && (
        <span className="truncate text-xs text-text-3" data-paint-name-secondary="">
          {title.secondary}
        </span>
      )}
      <span className="t-readout ml-auto shrink-0 pl-2 text-[13px] text-text-1">
        {codeOrDash(paint.code)}
      </span>
    </div>
  );

  if (compact) {
    return (
      <div className={cn('flex min-w-0 flex-col', className)}>
        {first}
        <div className="flex min-w-0 items-baseline gap-2">
          <p data-paint-desc="" className="shrink-0 text-[11px] text-text-2">
            {desc}
          </p>
          <span className="truncate text-[11px] text-text-3">
            {origin} · {reading ?? spec}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      {first}
      <p data-paint-desc="" className="truncate text-[11px] leading-[1.6] text-text-2">
        {desc}
      </p>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[11px] text-text-3">{origin}</span>
        {reading ? (
          <span
            data-paint-reading=""
            className={cn('t-readout ml-auto shrink-0 text-[11px]', low ? 'text-bh-red' : 'text-text-2')}
          >
            {reading}
          </span>
        ) : (
          <span className="t-readout ml-auto shrink-0 text-[11px] text-text-3">{spec}</span>
        )}
      </div>
    </div>
  );
}
