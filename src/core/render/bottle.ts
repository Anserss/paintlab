import type { LevelMode } from '../model/types';
import { clamp } from '../math/quantity';

/** 瓶身几何常量（spec 5.3 / 4.5.2）。viewBox 0 0 240 380 */
export const BOTTLE = {
  viewBox: { width: 240, height: 380 },
  infoBar: 56,
  cap: { x: 84, y: 68, w: 72, h: 22 },
  neck: { x: 92, y: 90, w: 56, h: 24 },
  body: { x: 36, y: 114, w: 168, h: 244, r: 8 },
  innerTop: 130,
  innerBottom: 342,
  innerHeight: 212,
  ticks: 12,
} as const;

/** 显示比例：默认以"上次调漆后总量"为分母（3.4.4） */
export function levelFraction(
  remainingMl: number,
  baselineMl: number,
  capacityMl: number,
  mode: LevelMode,
): number {
  const denom = mode === 'capacity' ? capacityMl : Math.max(baselineMl, 0.1);
  if (denom <= 0) return 0;
  return clamp(remainingMl / denom, 0, 1);
}

/** 吸附到 1/12 刻度（"取大概值"） */
export const quantizeLevel = (f: number): number => Math.round(clamp(f, 0, 1) * 12) / 12;

/** 液态像素高度（未吸附，用于平滑绘制） */
export const liquidHeight = (f: number): number => Math.round(clamp(f, 0, 1) * BOTTLE.innerHeight);

/** 吸附后的液态高度（用于刻度读数与视觉归位） */
export const quantizedLiquidHeight = (f: number): number => liquidHeight(quantizeLevel(f));

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** 分数读数：0.6667 -> "2/3" */
export function fractionLabel(quantized: number): string {
  const twelfths = Math.round(clamp(quantized, 0, 1) * 12);
  if (twelfths === 0) return '0';
  const g = gcd(twelfths, 12);
  const n = twelfths / g;
  const d = 12 / g;
  if (n === d) return '1';
  return d === 1 ? String(n) : n + '/' + d;
}

/** 主读数文案：≈ 2/3（67%） */
export function levelReading(fraction: number): string {
  const q = quantizeLevel(fraction);
  return '≈ ' + fractionLabel(q) + '（' + Math.round(clamp(fraction, 0, 1) * 100) + '%）';
}

/** 气泡/提示文案：≈67% · 40.0/60.0 ml */
export function levelBubble(
  remainingMl: number,
  baselineMl: number,
  fraction: number,
): string {
  return (
    '≈' +
    Math.round(clamp(fraction, 0, 1) * 100) +
    '% · ' +
    remainingMl.toFixed(1) +
    '/' +
    baselineMl.toFixed(1) +
    ' ml'
  );
}

/** 余量不足 1 格（3.4.4 边界表） */
export const isBelowOneTick = (fraction: number): boolean => fraction > 0 && fraction < 1 / 12;

export const isEmptyBottle = (remainingMl: number): boolean => remainingMl <= 0;

/** 低库存（< 15%，4.5.1 / 4.2） */
export const isLowStock = (remainingMl: number, initialMl: number): boolean =>
  initialMl > 0 && remainingMl / initialMl < 0.15;
