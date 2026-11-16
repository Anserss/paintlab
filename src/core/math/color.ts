import type { PaintClass } from '../model/types';

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return '#' + part(r) + part(g) + part(b);
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * 多组分按体积加权混色（3.4.3）。
 * clear 组分权重 ×0.5 作透明度感知补偿；aux 组分不进入色相而是走 swatch 规则。
 */
export function mixHex(
  parts: { hex: string; ml: number; paintClass: PaintClass }[],
): string {
  if (parts.length === 0) return '#ffffff';
  const weights = parts.map((p) => p.ml * (p.paintClass === 'clear' ? 0.5 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return parts[0].hex;
  const acc = parts.reduce<[number, number, number]>(
    (a, p, i) => {
      const [r, g, b] = hexToRgb(p.hex);
      return [a[0] + r * weights[i], a[1] + g * weights[i], a[2] + b * weights[i]];
    },
    [0, 0, 0],
  );
  return rgbToHex(acc[0] / sum, acc[1] / sum, acc[2] / sum);
}

/** 无彩色判定（3.3 色环）：S < 8% 视为灰 */
export const isAchromatic = (hex: string): boolean => hexToHsl(hex).s < 8;

/** 色相 12 档（每 30°） */
export const hueBucket = (hex: string): number => Math.floor(hexToHsl(hex).h / 30) % 12;

/** 明度 5 档（3.3 色板矩阵） */
export const lightnessBucket = (hex: string): number =>
  Math.min(4, Math.floor(hexToHsl(hex).l / 20));

/** 相对亮度（对比度判定用） */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
