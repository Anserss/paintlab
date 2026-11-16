/** 一位小数工具（spec 5.3）。所有数值落库前必须过 r1，避免浮点漂移。 */

export const r1 = (n: number): number => Math.round(n * 10) / 10;
export const f1 = (n: number): number => Math.floor(n * 10) / 10;

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** 0.1 步进吸附（比例输入） */
export const quantize1 = (n: number): number => Math.round(n * 10) / 10;

export const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 毫升展示：整数不带小数，其余保留 1 位 */
export function formatMl(n: number): string {
  const v = r1(n);
  return Number.isInteger(v) ? v.toFixed(1) : v.toFixed(1);
}

export function formatRatio(n: number): string {
  return '1:' + String(r1(n)).replace(/\.0$/, '');
}

export function formatPercent(fraction: number): string {
  return Math.round(clamp(fraction, 0, 1) * 100) + '%';
}
