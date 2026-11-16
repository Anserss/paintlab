import { memo } from 'react';
import type { PaintClass } from '@/core/model/types';
import {
  SWATCH_BED_CLASS,
  SWATCH_RING_STYLE,
  swatchDotColor,
  swatchStyle,
} from '@/core/render/swatch';
import { cn } from '@/components/ui';

/** 通用尺寸：像素边长，或 'fill' 撑满父容器 */
export type SvgSize = number | 'fill';

export interface PaintSwatchProps {
  hex: string;
  paintClass: PaintClass;
  /** 24 / 36（4.5.1）/ 'fill'；< 24 自动降级为实心圆点（2.3 约束 4） */
  size?: SvgSize;
  className?: string;
}

const DOT_BELOW = 24;

/**
 * 全站唯一色块：三档透明度只来自 core/render/swatch.ts（2.3），
 * 半透明块落在 tex-grid 网点底板上，并叠 1px var(--swatch-ring) 描边。
 */
export const PaintSwatch = memo(function PaintSwatch({
  hex,
  paintClass,
  size = 36,
  className,
}: PaintSwatchProps) {
  const isDot = typeof size === 'number' && size < DOT_BELOW;
  const style = swatchStyle(hex, paintClass);
  const box = typeof size === 'number' ? { width: size, height: size } : undefined;

  return (
    <div
      aria-hidden="true"
      data-swatch={isDot ? 'dot' : 'block'}
      style={box}
      className={cn(
        'relative shrink-0 overflow-hidden',
        isDot ? 'rounded-dot' : ['rounded-card', SWATCH_BED_CLASS],
        size === 'fill' && 'h-full w-full',
        className,
      )}
    >
      <span
        data-swatch-fill=""
        className={cn('absolute inset-0', isDot && 'rounded-dot')}
        style={
          isDot
            ? {
                background: swatchDotColor(hex, paintClass),
                opacity: 1,
                boxShadow: SWATCH_RING_STYLE.boxShadow,
              }
            : { background: style.background, opacity: style.opacity }
        }
      />
      {!isDot && (
        <span
          data-swatch-ring=""
          className="pointer-events-none absolute inset-0"
          style={SWATCH_RING_STYLE}
        />
      )}
    </div>
  );
});
