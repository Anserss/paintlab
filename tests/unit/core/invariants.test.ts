import { describe, expect, it } from 'vitest';
import {
  MAX_GROUP_DEPTH,
  MAX_WORKBENCHES,
  checkBottleLevel,
  checkGroupDepth,
  checkHistoryDepth,
  checkRatioN,
  checkSingleGroup,
  checkStockVolume,
  checkUndoPreconditions,
  checkUsageAmount,
  checkWorkbenchCount,
} from '@/core/rules/invariants';

/** spec 2.4 C (298-310) / 3.7.4 / 7.2 invariants.test —— I1–I8 逐条触发 */
describe('I1 · 0 <= volumeMl <= initialMl', () => {
  it('负库存被拒', () => {
    expect(checkStockVolume({ volumeMl: -1, initialMl: 17 })).toEqual({
      id: 'I1',
      message: '无法撤销：该操作将使库存低于 0',
    });
  });

  it('超过初始量被拒（AC-11 文案）', () => {
    expect(checkStockVolume({ volumeMl: 18, initialMl: 17 })).toEqual({
      id: 'I1',
      message: '无法撤销：该操作将使库存超过初始量',
    });
  });

  it('边界值 0 与 initialMl 合法', () => {
    expect(checkStockVolume({ volumeMl: 0, initialMl: 17 })).toBeNull();
    expect(checkStockVolume({ volumeMl: 17, initialMl: 17 })).toBeNull();
    expect(checkStockVolume({ volumeMl: 12.4, initialMl: 17 })).toBeNull();
  });
});

describe('I2 · 0 <= remaining <= baseline <= capacity', () => {
  it('余量为负', () => {
    expect(checkBottleLevel({ remainingMl: -0.1, baselineMl: 60, capacityMl: 60 })).toEqual({
      id: 'I2',
      message: '瓶内余量不能为负',
    });
  });

  it('基准量超过瓶容量', () => {
    expect(checkBottleLevel({ remainingMl: 0, baselineMl: 61, capacityMl: 60 })).toEqual({
      id: 'I2',
      message: '基准量超过瓶容量',
    });
  });

  it('余量超过基准量', () => {
    expect(checkBottleLevel({ remainingMl: 61, baselineMl: 60, capacityMl: 60 })).toEqual({
      id: 'I2',
      message: '余量超过基准量',
    });
  });

  it('合法边界', () => {
    expect(checkBottleLevel({ remainingMl: 0, baselineMl: 0, capacityMl: 60 })).toBeNull();
    expect(checkBottleLevel({ remainingMl: 40, baselineMl: 60, capacityMl: 60 })).toBeNull();
    expect(checkBottleLevel({ remainingMl: 60, baselineMl: 60, capacityMl: 60 })).toBeNull();
  });
});

describe('I3 · depth <= 3 且 child.depth = parent.depth + 1', () => {
  it('超过 3 层被拒（AC-07）', () => {
    expect(checkGroupDepth(4, 3)).toEqual({ id: 'I3', message: '分组最多 3 层' });
    expect(checkGroupDepth(0, null)).toEqual({ id: 'I3', message: '分组最多 3 层' });
  });

  it('顶层必须是 1', () => {
    expect(checkGroupDepth(1, null)).toBeNull();
    expect(checkGroupDepth(2, null)).toEqual({ id: 'I3', message: '顶层分组层级必须为 1' });
  });

  it('子级层级必须恰好等于父级 + 1', () => {
    expect(checkGroupDepth(2, 1)).toBeNull();
    expect(checkGroupDepth(3, 2)).toBeNull();
    expect(checkGroupDepth(3, 1)).toEqual({ id: 'I3', message: '子分组层级必须等于父级 + 1' });
  });

  it('MAX_GROUP_DEPTH 常量为 3', () => {
    expect(MAX_GROUP_DEPTH).toBe(3);
  });
});

describe('I4 · workbenches.length <= 5（AC-08）', () => {
  it('第 6 个工作台被拒', () => {
    expect(checkWorkbenchCount(6)).toEqual({
      id: 'I4',
      message: '最多 5 个工作台，请先删除或复用现有工作台',
    });
  });

  it('5 个以内合法', () => {
    expect(checkWorkbenchCount(5)).toBeNull();
    expect(checkWorkbenchCount(0)).toBeNull();
    expect(MAX_WORKBENCHES).toBe(5);
  });
});

describe('I5 · 单归属（拖入即移动）', () => {
  it('未显式给定 groupId 被拒', () => {
    expect(checkSingleGroup(undefined)).toEqual({
      id: 'I5',
      message: '分组归属必须显式给定（null = 未分组）',
    });
  });

  it('null 与具体 id 均合法', () => {
    expect(checkSingleGroup(null)).toBeNull();
    expect(checkSingleGroup('g1')).toBeNull();
  });
});

describe('I6 · 0 <= ratioN <= 10', () => {
  it('非有限数被拒', () => {
    expect(checkRatioN(NaN)).toEqual({ id: 'I6', message: '比例必须是数字' });
    expect(checkRatioN(Infinity)).toEqual({ id: 'I6', message: '比例必须是数字' });
  });

  it('越界被拒', () => {
    expect(checkRatioN(10.1)).toEqual({ id: 'I6', message: '比例超出范围 0–10' });
    expect(checkRatioN(-0.1)).toEqual({ id: 'I6', message: '比例超出范围 0–10' });
  });

  it('边界 0 与 10 合法', () => {
    expect(checkRatioN(0)).toBeNull();
    expect(checkRatioN(10)).toBeNull();
    expect(checkRatioN(2)).toBeNull();
  });
});

describe('I7 · 扣减必须与 UsageRecord 原子（用量校验）', () => {
  it('非正用量被拒', () => {
    expect(checkUsageAmount(0, 10)).toEqual({ id: 'I7', message: '用量必须大于 0' });
    expect(checkUsageAmount(-5, 10)).toEqual({ id: 'I7', message: '用量必须大于 0' });
  });

  it('超过剩余量被拒', () => {
    expect(checkUsageAmount(11, 10)).toEqual({ id: 'I7', message: '超出剩余量' });
  });

  it('恰好等于剩余量合法', () => {
    expect(checkUsageAmount(10, 10)).toBeNull();
    expect(checkUsageAmount(0.1, 0.1)).toBeNull();
  });
});

describe('I8 · 历史栈深 <= depth', () => {
  it('任一栈超深即拒', () => {
    expect(checkHistoryDepth(4, 0, 3)).toEqual({ id: 'I8', message: '历史栈超深：最多 3 步' });
    expect(checkHistoryDepth(0, 4, 3)).toEqual({ id: 'I8', message: '历史栈超深：最多 3 步' });
  });

  it('等于深度合法', () => {
    expect(checkHistoryDepth(3, 3, 3)).toBeNull();
    expect(checkHistoryDepth(0, 0, 3)).toBeNull();
  });
});

describe('checkUndoPreconditions · 撤销前一次性校验（3.6 R4）', () => {
  it('全部合法返回 null', () => {
    expect(
      checkUndoPreconditions({
        stockItems: [{ volumeMl: 12.4, initialMl: 17 }],
        bottles: [{ remainingMl: 40, baselineMl: 60, capacityMl: 60 }],
        groups: [{ depth: 3, parentId: 'g2' }],
      }),
    ).toBeNull();
  });

  it('库存越界优先报 I1', () => {
    expect(
      checkUndoPreconditions({
        stockItems: [{ volumeMl: 30, initialMl: 17 }],
        bottles: [],
        groups: [],
      }),
    ).toEqual({ id: 'I1', message: '无法撤销：该操作将使库存超过初始量' });
  });

  it('瓶液位越界报 I2', () => {
    expect(
      checkUndoPreconditions({
        stockItems: [],
        bottles: [{ remainingMl: 61, baselineMl: 60, capacityMl: 60 }],
        groups: [],
      }),
    ).toEqual({ id: 'I2', message: '余量超过基准量' });
  });

  it('分组层级越界报 I3', () => {
    expect(
      checkUndoPreconditions({
        stockItems: [],
        bottles: [],
        groups: [{ depth: 3, parentId: null }],
      }),
    ).toEqual({ id: 'I3', message: '顶层分组层级必须为 1' });
  });
});
