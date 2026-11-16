import { describe, expect, it } from 'vitest';
import {
  RATIO_MAX,
  RATIO_MIN,
  RATIO_PRESETS,
  checkOverflow,
  fromNeat,
  fromTotal,
  toFill,
} from '@/core/math/dilution';
import { fractionLabel, levelFraction, quantizeLevel } from '@/core/render/bottle';
import { r1 } from '@/core/math/quantity';

/** spec 5.3 (1060-1081) / 3.4.2 (431-450) / 7.1 AC-01·AC-02 */
describe('dilution · 正算 fromNeat (D = A×N, V = A+D)', () => {
  it('AC-01: A=10, N=2 -> D=20.0, V=30.0', () => {
    expect(fromNeat(10, 2)).toEqual({ neatMl: 10, thinnerMl: 20, totalMl: 30 });
  });

  it('N=0 时稀释剂为 0（免稀释）', () => {
    expect(fromNeat(100, 0)).toEqual({ neatMl: 100, thinnerMl: 0, totalMl: 100 });
  });

  it('0.1 精度不漂移：A=3.3, N=3', () => {
    expect(fromNeat(3.3, 3)).toEqual({ neatMl: 3.3, thinnerMl: 9.9, totalMl: 13.2 });
  });

  it('A=0.1, N=2 总量吸收浮点误差（0.30000000000000004 -> 0.3）', () => {
    expect(fromNeat(0.1, 2)).toEqual({ neatMl: 0.1, thinnerMl: 0.2, totalMl: 0.3 });
  });

  it('N=0.5 预设：A=20 -> D=10, V=30', () => {
    expect(fromNeat(20, 0.5)).toEqual({ neatMl: 20, thinnerMl: 10, totalMl: 30 });
  });
});

describe('dilution · 反算 fromTotal (A = V/(1+N)，向下取整)', () => {
  it('V=30, N=2 -> A=10.0, D=20.0', () => {
    expect(fromTotal(30, 2)).toEqual({ neatMl: 10, thinnerMl: 20, totalMl: 30 });
  });

  it('V=100, N=0 -> 稀释剂为 0，原浆等于总量', () => {
    expect(fromTotal(100, 0)).toEqual({ neatMl: 100, thinnerMl: 0, totalMl: 100 });
  });

  it('原浆向下取整，保证不溢出（V=31, N=2）', () => {
    const r = fromTotal(31, 2);
    expect(r.neatMl).toBe(10.3);
    expect(r.thinnerMl).toBe(20.7);
    expect(r.totalMl).toBe(31);
    expect(r.neatMl + r.thinnerMl).toBeLessThanOrEqual(r.totalMl + 1e-9);
  });
});

describe('dilution · 补满 toFill (S=C-R, A=f1(S/(1+N)))', () => {
  it('AC-02: C=60, R=10, N=2 -> A=16.6, D=33.2, V=49.8', () => {
    expect(toFill(60, 10, 2)).toEqual({ neatMl: 16.6, thinnerMl: 33.2, totalMl: 49.8 });
  });

  it('AC-02 推论：调配后 remaining = baseline = 59.8，液位显示满', () => {
    const mix = toFill(60, 10, 2);
    const remaining = r1(10 + mix.totalMl);
    const baseline = remaining;
    expect(remaining).toBe(59.8);
    expect(levelFraction(remaining, baseline, 60, 'baseline')).toBe(1);
    expect(fractionLabel(quantizeLevel(1))).toBe('1');
  });

  it('已满（S=0）不多加任何东西', () => {
    expect(toFill(60, 60, 2)).toEqual({ neatMl: 0, thinnerMl: 0, totalMl: 0 });
  });

  it('溢出余量（R > C）同样返回 0，不产生负补满量', () => {
    expect(toFill(60, 70, 2)).toEqual({ neatMl: 0, thinnerMl: 0, totalMl: 0 });
  });

  it('N=0 时补满只加原浆', () => {
    expect(toFill(60, 10, 0)).toEqual({ neatMl: 50, thinnerMl: 0, totalMl: 50 });
  });

  it('floor1 语义：补满总量不超过可容纳空间', () => {
    const mix = toFill(100, 33.3, 1.5);
    expect(mix.totalMl).toBeLessThanOrEqual(r1(100 - 33.3));
  });
});

describe('dilution · checkOverflow 溢出拦截', () => {
  it('AC-05: C=100, R=9, A=99, N=1 -> 拒绝，最多 45.5 ml', () => {
    const r = checkOverflow(100, 9, 99, 1);
    expect(r.ok).toBe(false);
    expect(r.maxNeatMl).toBe(45.5);
    expect(r.message).toContain('45.5 ml');
    expect(r.message).toContain('1:1');
  });

  it('恰好等于上限时放行（边界不误杀）', () => {
    const r = checkOverflow(100, 9, 45.5, 1);
    expect(r.ok).toBe(true);
    expect(r.maxNeatMl).toBe(45.5);
    expect(r.message).toBeUndefined();
  });

  it('超过上限 0.1 ml 即拒绝', () => {
    expect(checkOverflow(100, 9, 45.6, 1).ok).toBe(false);
  });

  it('补满场景的推荐值必然通过', () => {
    const r = checkOverflow(60, 10, 16.6, 2);
    expect(r.ok).toBe(true);
    expect(r.maxNeatMl).toBe(16.6);
  });

  it('瓶子已满时上限为 0', () => {
    const r = checkOverflow(60, 60, 0, 2);
    expect(r.ok).toBe(true);
    expect(r.maxNeatMl).toBe(0);
    expect(checkOverflow(60, 60, 0.1, 2).ok).toBe(false);
  });
});

describe('dilution · 比例常量（spec 3.4.2:450）', () => {
  it('预设包含 0.5/1/1.5/2/2.5/3', () => {
    expect([...RATIO_PRESETS]).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
  });

  it('自定义范围为 0–10', () => {
    expect(RATIO_MIN).toBe(0);
    expect(RATIO_MAX).toBe(10);
  });
});
