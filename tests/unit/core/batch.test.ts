import { describe, expect, it } from 'vitest';
import type { Bottle, StockItem } from '@/core/model/types';
import {
  bottleDisplayLabel,
  bottleDilutionRatio,
  bottleLook,
  canEnterWorkbench,
  dilutionTagText,
  isDiluteBatch,
  isMixedProduct,
  stockDilutionRatio,
  stockLook,
  WORKBENCH_NEAT_BLOCK,
} from '@/core/render/batch';

const PAINT = {
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid' as const,
};

function bottleOf(patch: Partial<Bottle>): Bottle {
  return {
    id: 'bottle-1',
    name: '钴蓝',
    capacityMl: 30,
    baselineMl: 30,
    remainingMl: 30,
    ratioN: 2,
    paintClass: 'solid',
    hex: '#2E5E9F',
    components: [],
    levelMode: 'baseline',
    updatedAt: 1,
    ...patch,
  };
}

function stockOf(patch: Partial<StockItem>): StockItem {
  return {
    id: 'stock-1',
    paintId: 'gsi-c80',
    volumeMl: 30,
    initialMl: 30,
    state: 'thinned',
    ratioN: 2,
    groupId: null,
    origin: 'mixed',
    createdAt: 1,
    ...patch,
  };
}

describe('稀释小牌文案（2.1）', () => {
  it('(1:N)稀释：整数不带小数，1.5 保留一位', () => {
    expect(dilutionTagText(2)).toBe('(1:2)稀释');
    expect(dilutionTagText(1.5)).toBe('(1:1.5)稀释');
    expect(dilutionTagText(0.5)).toBe('(1:0.5)稀释');
  });
});

describe('调漆台批次：稀释按原浆显示 / 调漆走自定义色', () => {
  it('稀释批次用原浆色值（忽略色值与透明度），并带比例牌', () => {
    const bottle = bottleOf({ mode: 'dilute', colorHex: '#FFFFFF', colorAlpha: 70 });
    expect(isDiluteBatch(bottle)).toBe(true);
    expect(bottleDilutionRatio(bottle)).toBe(2);
    const look = bottleLook(bottle);
    expect(look.hex).toBe('#2E5E9F');
    expect(look.alpha).toBeUndefined();
    expect(look.undefinedColor).toBe(false);
    expect(look.dilutionRatioN).toBe(2);
    expect(bottleDisplayLabel(bottle)).toBe('(1:2)稀释 钴蓝');
  });

  it('调漆批次保留自定义色与「未定色」判定，不出比例牌', () => {
    const undecided = bottleOf({ mode: 'blend', name: '调漆1', colorHex: '#FFFFFF', colorAlpha: 70 });
    const look = bottleLook(undecided);
    expect(look.hex).toBe('#FFFFFF');
    expect(look.alpha).toBe(70);
    expect(look.undefinedColor).toBe(true);
    expect(look.dilutionRatioN).toBeNull();
    expect(bottleDisplayLabel(undecided)).toBe('调漆1');

    const colored = bottleOf({ mode: 'blend', name: '调漆2', colorHex: '#123456', colorAlpha: 55 });
    expect(bottleLook(colored).hex).toBe('#123456');
    expect(bottleLook(colored).alpha).toBe(55);
  });

  it('稀释到 1:0（没加稀释剂）不出比例牌，按原浆色值显示', () => {
    const bottle = bottleOf({ mode: 'dilute', ratioN: 0 });
    expect(bottleDilutionRatio(bottle)).toBeNull();
    expect(bottleLook(bottle).dilutionRatioN).toBeNull();
    expect(bottleLook(bottle).hex).toBe('#2E5E9F');
    expect(bottleDisplayLabel(bottle)).toBe('钴蓝');
  });
});

describe('仓库条目：稀释沿用原浆名称/色值', () => {
  it('dilutionRatioN 存在时名称与色值取原浆，忽略自定义透明度', () => {
    const item = stockOf({ customName: '钴蓝', customHex: '#2E5E9F', dilutionRatioN: 2 });
    expect(stockDilutionRatio(item)).toBe(2);
    const look = stockLook(item, PAINT);
    expect(look.name).toBe('钴蓝');
    expect(look.hex).toBe('#2E5E9F');
    expect(look.alpha).toBeUndefined();
    expect(look.dilutionRatioN).toBe(2);
  });

  it('调漆产物保留自定义名称/颜色/透明度', () => {
    const item = stockOf({ customName: '调漆1', customHex: '#ABCDEF', customAlpha: 42 });
    const look = stockLook(item, PAINT);
    expect(look.name).toBe('调漆1');
    expect(look.hex).toBe('#ABCDEF');
    expect(look.alpha).toBe(42);
    expect(look.dilutionRatioN).toBeNull();
  });

  it('采购原浆没有自定义字段时就是目录名称与色值', () => {
    const look = stockLook(stockOf({ state: 'neat', ratioN: undefined }), PAINT);
    expect(look.name).toBe('钴蓝');
    expect(look.hex).toBe('#2E5E9F');
    expect(look.dilutionRatioN).toBeNull();
    expect(look.undefinedColor).toBe(false);
  });
});

describe('2.2.1 调漆产物不显示基础漆号', () => {
  it('有自定义名称且没有稀释比例 → 调漆产物；稀释漆料 / 原浆不是', () => {
    expect(isMixedProduct({ customName: 'A', dilutionRatioN: undefined })).toBe(true);
    expect(isMixedProduct({ customName: '调漆14' })).toBe(true);
    expect(isMixedProduct({ customName: '钴蓝', dilutionRatioN: 2 })).toBe(false);
    expect(isMixedProduct({ customName: undefined })).toBe(false);
  });
});

describe('平台流转：原浆不上工作台（2.1）', () => {
  it('只有非原浆能进工作台，文案给出可行动指令', () => {
    expect(canEnterWorkbench('neat')).toBe(false);
    expect(canEnterWorkbench('thinned')).toBe(true);
    expect(WORKBENCH_NEAT_BLOCK).toContain('原浆只能在仓库与调漆台之间流转');
  });
});
