import { describe, expect, it } from 'vitest';
import type { BatchPart, StockItem } from '@/core/model/types';
import {
  decompositionOf,
  decompositionPartLabel,
  decompositionTitle,
} from '@/core/rules/decompose';

const NEAT: BatchPart = {
  paintId: 'gsi-c80',
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  ml: 10,
  state: 'neat',
};

const THINNER: BatchPart = {
  paintId: 'gsi-t103',
  brandId: 'gsi',
  code: 'T103',
  name: 'Thinner',
  nameZh: '稀释剂',
  hex: '#FFFFFF',
  paintClass: 'aux',
  ml: 20,
  state: 'neat',
  aux: true,
};

const THINNED: BatchPart = {
  ...NEAT,
  ml: 20,
  state: 'thinned',
  ratioN: 2,
  dilute: true,
};

function stockOf(patch: Partial<StockItem>): StockItem {
  return {
    id: 'stock-1',
    paintId: 'gsi-c80',
    volumeMl: 30,
    initialMl: 30,
    state: 'thinned',
    groupId: null,
    origin: 'mixed',
    createdAt: 1,
    ...patch,
  };
}

describe('2.1.1 分解回仓库：可分解判定', () => {
  it('没有组分快照 / 余量为 0 时不可分解', () => {
    expect(decompositionOf(stockOf({ parts: undefined }))).toBeNull();
    expect(decompositionOf(stockOf({ parts: [] }))).toBeNull();
    expect(decompositionOf(stockOf({ parts: [NEAT, THINNER], volumeMl: 0 }))).toBeNull();
    expect(decompositionOf(stockOf({ parts: [NEAT], volumeMl: 10 }))).not.toBeNull();
  });

  it('余量等于入库量时按原样还原（原浆 + 稀释剂）', () => {
    const plan = decompositionOf(stockOf({ parts: [NEAT, THINNER], volumeMl: 30 }));
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.totalMl).toBe(30);
    expect(plan.parts.map((part) => [part.paintId, part.ml, part.aux ?? false])).toEqual([
      ['gsi-c80', 10, false],
      ['gsi-t103', 20, true],
    ]);
  });

  it('取用一部分后按「当前余量 / 入库总量」等比还原，合计严格等于余量', () => {
    const plan = decompositionOf(stockOf({ parts: [NEAT, THINNER], volumeMl: 15 }));
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.totalMl).toBe(15);
    expect(plan.parts.map((part) => part.ml)).toEqual([5, 10]);
  });

  it('多组分调漆产物：已稀释的颜料带比例还原（调漆前状态）', () => {
    const plan = decompositionOf(stockOf({ parts: [THINNED, { ...NEAT, paintId: 'gsi-c1', ml: 10 }], volumeMl: 30 }));
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.parts[0]).toMatchObject({ paintId: 'gsi-c80', state: 'thinned', ratioN: 2, dilute: true, ml: 20 });
    expect(plan.parts[1]).toMatchObject({ paintId: 'gsi-c1', state: 'neat', ml: 10 });
  });

  it('四舍五入误差由最后一段兜住', () => {
    const plan = decompositionOf(stockOf({ parts: [NEAT, THINNER, { ...NEAT, paintId: 'gsi-c1', ml: 10 }], volumeMl: 17 }));
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.totalMl).toBe(17);
    expect(plan.parts.reduce((sum, part) => sum + part.ml, 0)).toBeCloseTo(17, 6);
  });
});

describe('2.1.1 分解回仓库：文案', () => {
  it('列表行：名称 · 原浆/辅料/稀释漆料 · 体积', () => {
    expect(decompositionPartLabel(NEAT)).toBe('钴蓝 · 原浆 · 10.0 ml');
    expect(decompositionPartLabel(THINNER)).toBe('稀释剂 · 辅料 · 20.0 ml');
    expect(decompositionPartLabel(THINNED)).toBe('钴蓝 · 稀释漆料 1:2 · 20.0 ml');
  });

  it('按钮文案：含辅料 → 原浆和辅料；多组分 → 调漆前的组分', () => {
    expect(decompositionTitle(stockOf({ parts: [NEAT, THINNER] }))).toBe('分解为原浆和辅料');
    expect(decompositionTitle(stockOf({ parts: [THINNED, NEAT] }))).toBe('分解为调漆前的组分');
    expect(decompositionTitle(stockOf({ parts: [NEAT], state: 'neat' }))).toBe('分解回仓库');
  });
});
