import { describe, expect, it } from 'vitest';
import { diluteThinned, neatShareOf, planBlend } from '@/core/math/blend';

describe('已稀释漆料再稀释（diluteThinned）', () => {
  it('取 10 ml（1:2）稀释到 1:3 → 原浆 3.3、补加 3.3、产物 13.3', () => {
    const plan = diluteThinned(10, 2, 3);
    expect(plan.neatMl).toBe(3.3);
    expect(plan.existingThinnerMl).toBe(6.7);
    expect(plan.addedThinnerMl).toBe(3.3);
    expect(plan.totalMl).toBe(13.3);
  });

  it('目标比例等于当前比例 → 不补加，产物 = 取用量', () => {
    const plan = diluteThinned(10, 2, 2);
    expect(plan.addedThinnerMl).toBe(0);
    expect(plan.totalMl).toBe(10);
  });

  it('目标比例低于当前比例 → 不补加（由界面阻断）', () => {
    const plan = diluteThinned(10, 2, 1);
    expect(plan.addedThinnerMl).toBe(0);
    expect(plan.totalMl).toBe(10);
  });

  it('取用量为 0 / 负数 → 全部归零', () => {
    expect(diluteThinned(0, 2, 3).totalMl).toBe(0);
    expect(diluteThinned(-5, 2, 3).totalMl).toBe(0);
  });
});

describe('原浆占比（neatShareOf）', () => {
  it('1:2 的 30 ml 里原浆 10 ml', () => {
    expect(neatShareOf(30, 2)).toBe(10);
  });
  it('原浆（比例 0）全部计入', () => {
    expect(neatShareOf(12, 0)).toBe(12);
  });
});

describe('调漆分摊（planBlend）', () => {
  it('按目标总容量 30 分摊 10:10 → 各 15 ml，等效比例 0（纯原浆）', () => {
    const plan = planBlend(
      [
        { id: 'a', weight: 10, ratioN: 0, availableMl: 100 },
        { id: 'b', weight: 10, ratioN: 0, availableMl: 100 },
      ],
      30,
    );
    expect(plan.parts.map((part) => part.ml)).toEqual([15, 15]);
    expect(plan.totalMl).toBe(30);
    expect(plan.neatMl).toBe(30);
    expect(plan.thinnerMl).toBe(0);
    expect(plan.ratioN).toBe(0);
    expect(plan.shortfalls).toEqual([]);
  });

  it('按目标总容量 30 分摊 1:2 → 各 10 / 20 ml（比例 1:1）', () => {
    const plan = planBlend(
      [
        { id: 'a', weight: 1, ratioN: 0, availableMl: 100 },
        { id: 'b', weight: 2, ratioN: 0, availableMl: 100 },
      ],
      30,
    );
    expect(plan.parts.map((part) => part.ml)).toEqual([10, 20]);
    expect(plan.totalMl).toBe(30);
  });

  it('不传目标容量 → 按各组分 ml 直接累加，并按各自比例折算原浆', () => {
    const plan = planBlend([
      { id: 'neat', weight: 10, ratioN: 0, availableMl: 100 },
      { id: 'thinned', weight: 20, ratioN: 2, availableMl: 100 },
    ]);
    expect(plan.totalMl).toBe(30);
    expect(plan.neatMl).toBe(16.7);
    expect(plan.thinnerMl).toBe(13.3);
    expect(plan.ratioN).toBe(0.8);
  });

  it('已稀释漆料的体积按比例折算原浆（1:2 的 30 ml = 原浆 10）', () => {
    const plan = planBlend([{ id: 'a', weight: 30, ratioN: 2, availableMl: 100 }]);
    expect(plan.neatMl).toBe(10);
    expect(plan.thinnerMl).toBe(20);
    expect(plan.ratioN).toBe(2);
  });

  it('目标容量的取整余量落在最后一个组分，合计恰好等于目标', () => {
    const plan = planBlend(
      [
        { id: 'a', weight: 1, ratioN: 0, availableMl: 100 },
        { id: 'b', weight: 1, ratioN: 0, availableMl: 100 },
        { id: 'c', weight: 1, ratioN: 0, availableMl: 100 },
      ],
      10,
    );
    expect(plan.totalMl).toBe(10);
    expect(plan.parts.reduce((sum, part) => sum + part.ml, 0)).toBeCloseTo(10, 5);
  });

  it('库存不足时给出缺口，不静默截断', () => {
    const plan = planBlend([
      { id: 'a', weight: 10, ratioN: 0, availableMl: 5 },
      { id: 'b', weight: 10, ratioN: 0, availableMl: 100 },
    ]);
    expect(plan.shortfalls).toEqual([{ id: 'a', needMl: 10, availableMl: 5 }]);
  });

  it('权重全为 0 → 总量 0（界面阻断）', () => {
    const plan = planBlend([{ id: 'a', weight: 0, ratioN: 0, availableMl: 100 }]);
    expect(plan.totalMl).toBe(0);
    expect(plan.parts).toEqual([]);
  });
});
