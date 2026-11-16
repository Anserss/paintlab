import type { PaintClass } from '../model/types';

export interface SwatchStyle {
  background: string;
  opacity: number;
}

/**
 * 全站唯一色块渲染函数（spec 2.3）。任何组件不得硬编码颜色。
 * opacity 用 CSS opacity 而非把 alpha 混进色值，使网点底板可透出，
 * 同一函数可复用为 SVG <g opacity>。
 */
export function swatchStyle(hex: string, cls: PaintClass): SwatchStyle {
  switch (cls) {
    case 'solid':
      return { background: hex, opacity: 1 };
    case 'clear':
      return { background: hex, opacity: 0.4 };
    case 'aux':
      return { background: '#FFFFFF', opacity: 0.7 };
    default:
      return { background: hex, opacity: 1 };
  }
}

/** SVG 直用：返回 fill 与 opacity 两个属性 */
export function swatchAttrs(hex: string, cls: PaintClass): { fill: string; opacity: number } {
  const s = swatchStyle(hex, cls);
  return { fill: s.background, opacity: s.opacity };
}

/** 2.3 约束 4：< 24×24 的小色点改用实心圆点，不使用半透明 */
export function swatchDotColor(hex: string, cls: PaintClass): string {
  if (cls === 'aux') return '#FFFFFF';
  return hex;
}

/** 2.3 约束 1：半透明色块必须落在 --swatch-bed + 网点底板上 */
export const SWATCH_BED_CLASS = 'tex-grid';

/** 2.3 约束 2：固定 1px 白描边 */
export const SWATCH_RING_STYLE: { boxShadow: string } = {
  boxShadow: 'inset 0 0 0 1px var(--swatch-ring)',
};
