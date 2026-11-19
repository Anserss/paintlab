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
  /** 24 / 40 / 'fill'；< 24 用直角小色块（实心 + ring，不使用半透明） */
  size?: SvgSize;
  /** 自定义透明度（0–100），优先于 paintClass 的默认档 */
  alpha?: number;
  /** "未定色"：叠 45° 细斜线，表示还没调出颜色 */
  undefinedColor?: boolean;
  className?: string;
}

const SMALL_BELOW = 24;

/**
 * 全站唯一色块：三档透明度只来自 core/render/swatch.ts，
 * 半透明块落在 tex-grid 网点底板上，并叠 1px ring 描边。
 */
export const PaintSwatch = memo(function PaintSwatch({
  hex,
  paintClass,
  size = 40,
  alpha,
  undefinedColor = false,
  className,
}: PaintSwatchProps) {
  const small = typeof size === 'number' && size < SMALL_BELOW;
  const style = small
    ? { background: swatchDotColor(hex, paintClass), opacity: 1 }
    : swatchStyle(hex, paintClass, alpha);
  const box = typeof size === 'number' ? { width: size, height: size } : undefined;

  return (
    <div
      aria-hidden="true"
      data-swatch={small ? 'dot' : undefinedColor ? 'undefined' : 'block'}
      style={box}
      className={cn(
        'relative shrink-0 overflow-hidden',
        SWATCH_BED_CLASS,
        size === 'fill' && 'h-full w-full',
        className,
      )}
    >
      <span
        data-swatch-fill=""
        className="absolute inset-0"
        style={{ background: style.background, opacity: style.opacity }}
      />
      {undefinedColor && (
        <span
          data-swatch-undefined=""
          className="tex-hatch absolute inset-0"
          style={{ opacity: 0.55 }}
        />
      )}
      <span
        data-swatch-ring=""
        className="pointer-events-none absolute inset-0"
        style={SWATCH_RING_STYLE}
      />
    </div>
  );
});
