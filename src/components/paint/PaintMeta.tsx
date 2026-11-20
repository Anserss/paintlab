import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { isLowVolume } from '@/core/rules/low-volume';
import { codeOrDash, paintDescription, paintOriginLine, paintTitle } from '@/core/render/label';
import { formatMl } from '@/core/math/quantity';
import { cn } from '@/components/ui';
import { DilutionTag } from '@/components/paint/DilutionTag';
import { LowVolumeTag } from '@/components/paint/LowVolumeTag';

export interface PaintStock {
  volumeMl: number;
  initialMl: number;
}

export interface PaintMetaProps {
  paint: Paint;
  line: PaintLine;
  brand?: Brand | string;
  stock?: PaintStock;
  /** 密度 compact：第 3 行折入第 2 行尾部 */
  compact?: boolean;
  /** 稀释漆料：名称前的「(1:N)稀释」灰底白字小牌 */
  dilutionRatioN?: number | null;
  /** 2.2.1：调漆产物不显示基础漆号（只显示名称） */
  hideCode?: boolean;
  /** 2.2.2：第二行属性文案覆盖（采购页的辅料行显示「油性 · 稀释剂」） */
  descOverride?: string;
  className?: string;
}

/** 品牌显示名：中文优先，无中文名回退英文 */
export function brandNameOf(brand?: Brand | string): string | undefined {
  if (!brand) return undefined;
  if (typeof brand === 'string') return brand;
  return brand.nameZh || brand.name;
}

/** 三段式色卡文字：名称/色号、属性行、来源与规格 */
export function PaintMeta({
  paint,
  line,
  brand,
  stock,
  compact = false,
  dilutionRatioN,
  hideCode = false,
  descOverride,
  className,
}: PaintMetaProps) {
  const title = paintTitle(paint);
  const desc = descOverride ?? paintDescription(paint, line);
  const origin = paintOriginLine(brandNameOf(brand), line.name);
  const spec = (paint.volumeMl ?? line.defaultVolumeMl) + ' ml';
  const reading = stock ? formatMl(stock.volumeMl) + '/' + formatMl(stock.initialMl) + ' ml' : null;
  const low = stock ? isLowVolume(stock.volumeMl, stock.initialMl) : false;
  const diluted = typeof dilutionRatioN === 'number' && dilutionRatioN > 0;

  const first = (
    <div className="flex min-w-0 items-center gap-2">
      {/* 2.2：容量偏低红底白字小牌，固定排在名称栏最前面 */}
      {low && <LowVolumeTag />}
      {diluted && <DilutionTag ratioN={dilutionRatioN} />}
      <span className="truncate text-[15px] font-semibold leading-tight text-text-1">{title.primary}</span>
      {title.secondary && (
        <span className="truncate text-[13px] text-text-2" data-paint-name-secondary="">
          {title.secondary}
        </span>
      )}
      {!hideCode && (
        <span className="ef-field ml-auto shrink-0 pl-2 text-[13px] text-text-1">
          {codeOrDash(paint.code)}
        </span>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={cn('flex min-w-0 flex-col', className)}>
        {first}
        <div className="flex min-w-0 items-baseline gap-2">
          <p data-paint-desc="" className="shrink-0 text-[12px] text-text-2">
            {desc}
          </p>
          <span className="truncate text-[12px] text-text-2">
            {origin} · {reading ?? spec}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {first}
      <p data-paint-desc="" className="truncate text-[13px] leading-snug text-text-2">
        {desc}
      </p>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[11px] text-text-2">{origin}</span>
        {reading ? (
          <span
            data-paint-reading=""
            data-low={low ? '' : undefined}
            className={cn('ef-field ml-auto shrink-0 text-[12px]', low ? 'text-text-1' : 'text-text-2')}
          >
            {reading}
          </span>
        ) : (
          <span className="ef-field ml-auto shrink-0 text-[12px] text-text-2">{spec}</span>
        )}
      </div>
    </div>
  );
}
