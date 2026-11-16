import { describe, expect, it } from 'vitest';
import {
  clamp,
  f1,
  formatMl,
  formatPercent,
  formatRatio,
  isFiniteNumber,
  quantize1,
  r1,
} from '@/core/math/quantity';

/** spec 5.3 (1053-1055) / 7.2 quantity.test */
describe('quantity · r1 四舍五入到 0.1', () => {
  it('消除浮点漂移：r1(0.1 + 0.2) === 0.3', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(r1(0.1 + 0.2)).toBe(0.3);
  });

  it('保留一位小数且不改变整数', () => {
    expect(r1(16.666)).toBe(16.7);
    expect(r1(45.55)).toBe(45.6);
    expect(r1(2)).toBe(2);
    expect(r1(0.04)).toBe(0);
  });
});

describe('quantity · f1 向下取整到 0.1（保证不溢出，spec 3.4.2:439）', () => {
  it('f1(16.666) === 16.6', () => {
    expect(f1(16.666)).toBe(16.6);
  });

  it('整数与边界不漂移', () => {
    expect(f1(10)).toBe(10);
    expect(f1(45.59999)).toBe(45.5);
    expect(f1(0.09)).toBe(0);
    expect(f1(16.6)).toBe(16.6);
  });

  it('f1(n) <= n 恒成立（向下取整语义）', () => {
    for (const n of [0.1, 3.3, 16.666, 49.8, 99.99]) {
      expect(f1(n)).toBeLessThanOrEqual(n);
    }
  });
});

describe('quantity · clamp 边界', () => {
  it('区间内原样返回', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('越界被钳制到最近端点', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('lo > n 时以 lo 为准', () => {
    expect(clamp(3, 5, 10)).toBe(5);
  });
});

describe('quantity · 其它工具', () => {
  it('quantize1 吸附到 0.1 步进（spec 3.4.2:450）', () => {
    expect(quantize1(1.2499)).toBe(1.2);
    expect(quantize1(2.04)).toBe(2);
    expect(quantize1(0.1 + 0.2)).toBe(0.3);
  });

  it('isFiniteNumber 只接受有限数字', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-1.5)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber('1')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
  });

  it('formatMl 固定 1 位小数（spec 3.3:409 显示 "12.4 / 17.0 ml"）', () => {
    expect(formatMl(12.44)).toBe('12.4');
    expect(formatMl(17)).toBe('17.0');
    expect(formatMl(0)).toBe('0.0');
  });

  it('formatRatio 输出 "1:N" 且整数不带 ".0"', () => {
    expect(formatRatio(2)).toBe('1:2');
    expect(formatRatio(1.5)).toBe('1:1.5');
    expect(formatRatio(0.5)).toBe('1:0.5');
    expect(formatRatio(0)).toBe('1:0');
  });

  it('formatPercent 钳制到 0–100% 并取整', () => {
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(2)).toBe('100%');
  });
});
