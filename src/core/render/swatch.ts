import type { PaintClass } from '../model/types';

export interface SwatchStyle {
  background: string;
  opacity: number;
}

/** 未定色的默认值：70% 透明度的白（"还没调出颜色"的语义） */
export const UNDEFINED_HEX = '#FFFFFF';
export const UNDEFINED_ALPHA = 70;

/**
 * 全站唯一色块渲染函数。任何组件不得硬编码颜色。
 * opacity 用 CSS opacity 而非把 alpha 混进色值，使网点底板可透出。
 * alpha（0–100）优先；缺省时按 paintClass 的三档透明度。
 */
export function swatchStyle(hex: string, cls: PaintClass, alpha?: number): SwatchStyle {
  if (typeof alpha === 'number') {
    return { background: hex, opacity: Math.max(0, Math.min(100, alpha)) / 100 };
  }
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
export function swatchAttrs(
  hex: string,
  cls: PaintClass,
  alpha?: number,
): { fill: string; opacity: number } {
  const s = swatchStyle(hex, cls, alpha);
  return { fill: s.background, opacity: s.opacity };
}

/** "未定色"判定：默认的 70% 白（显式传入时才算，普通色样不受影响） */
export function isUndefinedColor(hex: string | undefined, alpha?: number): boolean {
  return (hex ?? '').toUpperCase() === UNDEFINED_HEX && alpha === UNDEFINED_ALPHA;
}

/** 小尺寸色样用实心色（不使用半透明），aux 恒白 */
export function swatchDotColor(hex: string, cls: PaintClass): string {
  if (cls === 'aux') return '#FFFFFF';
  return hex;
}

/** 2.3 约束 1：半透明色块必须落在网点底板上 */
export const SWATCH_BED_CLASS = 'tex-grid';

/** 1px 描边（真正描在色块上的 ring） */
export const SWATCH_RING_STYLE: { boxShadow: string } = {
  boxShadow: 'inset 0 0 0 1px var(--swatch-ring)',
};

/** 采样对比用：把半透明色合成到纸面/墨面上 */
export function compositeOver(hex: string, alpha: number, bedHex: string): string {
  const parse = (value: string): [number, number, number] => {
    const raw = value.replace('#', '');
    return [
      parseInt(raw.slice(0, 2), 16) || 0,
      parseInt(raw.slice(2, 4), 16) || 0,
      parseInt(raw.slice(4, 6), 16) || 0,
    ];
  };
  const [r, g, b] = parse(hex);
  const [br, bg, bb] = parse(bedHex);
  const a = Math.max(0, Math.min(100, alpha)) / 100;
  const mix = (c: number, bed: number) => Math.round(c * a + bed * (1 - a));
  const part = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return '#' + part(mix(r, br)) + part(mix(g, bg)) + part(mix(b, bb));
}
