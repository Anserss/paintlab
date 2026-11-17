import type { Bottle, Group, StockItem } from '../model/types';
import { RATIO_MAX } from '../math/dilution';

/** 不变量（spec 2.4 C）。返回结构化错误而非抛异常（3.7.4）。 */
export type InvariantId = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8';

export interface Violation {
  id: InvariantId;
  message: string;
}

export const MAX_WORKBENCHES = 5;
export const MAX_GROUP_DEPTH = 3;

const ok = (): null => null;
const fail = (id: InvariantId, message: string): Violation => ({ id, message });

/** I1: 0 <= volumeMl <= initialMl */
export function checkStockVolume(item: Pick<StockItem, 'volumeMl' | 'initialMl'>): Violation | null {
  if (item.volumeMl < 0) return fail('I1', '无法撤销：该操作将使库存低于 0');
  if (item.volumeMl > item.initialMl + 1e-6)
    return fail('I1', '无法撤销：该操作将使库存超过初始量');
  return ok();
}

/** I2: 0 <= remainingMl <= baselineMl <= capacityMl */
export function checkBottleLevel(
  bottle: Pick<Bottle, 'remainingMl' | 'baselineMl' | 'capacityMl'>,
): Violation | null {
  if (bottle.remainingMl < 0) return fail('I2', '瓶内余量不能为负');
  if (bottle.baselineMl > bottle.capacityMl + 1e-6) return fail('I2', '基准量超过瓶容量');
  if (bottle.remainingMl > bottle.baselineMl + 1e-6) return fail('I2', '余量超过基准量');
  return ok();
}

/** I3: depth <= 3 且 child.depth = parent.depth + 1 */
export function checkGroupDepth(
  childDepth: number,
  parentDepth: number | null,
): Violation | null {
  if (childDepth < 1 || childDepth > MAX_GROUP_DEPTH)
    return fail('I3', '分组最多 ' + MAX_GROUP_DEPTH + ' 层');
  if (parentDepth === null) {
    return childDepth === 1 ? ok() : fail('I3', '顶层分组层级必须为 1');
  }
  if (childDepth !== parentDepth + 1) return fail('I3', '子分组层级必须等于父级 + 1');
  return ok();
}

/** I4: workbenches.length <= 5 */
export function checkWorkbenchCount(count: number): Violation | null {
  if (count > MAX_WORKBENCHES)
    return fail('I4', '最多 ' + MAX_WORKBENCHES + ' 个工作台，请先删除或复用现有工作台');
  return ok();
}

/** I5: 每条 StockItem 最多归属 1 个 Group（单归属，拖入即移动） */
export function checkSingleGroup(groupId: string | null | undefined): Violation | null {
  if (groupId === undefined) return fail('I5', '分组归属必须显式给定（null = 未分组）');
  return ok();
}

/** I6: 0 <= ratioN <= 10 */
export function checkRatioN(ratioN: number): Violation | null {
  if (!Number.isFinite(ratioN)) return fail('I6', '比例必须是数字');
  if (ratioN < 0 || ratioN > RATIO_MAX) return fail('I6', '比例超出范围 0–10');
  return ok();
}

/** I7: 任何扣减必须原子写入 UsageRecord —— 由数据层事务保证，此处校验金额 */
export function checkUsageAmount(amountMl: number, availableMl: number): Violation | null {
  if (amountMl <= 0) return fail('I7', '用量必须大于 0');
  if (amountMl > availableMl + 1e-6) return fail('I7', '超出剩余量');
  return ok();
}

/** I8: undo/redo 栈深 <= depth */
export function checkHistoryDepth(undoLength: number, redoLength: number, depth: number): Violation | null {
  if (undoLength > depth || redoLength > depth)
    return fail('I8', '历史栈超深：最多 ' + depth + ' 步');
  return ok();
}

/** 汇总：撤销前的一次性校验（3.6 R4） */
export function checkUndoPreconditions(state: {
  stockItems: Pick<StockItem, 'volumeMl' | 'initialMl'>[];
  bottles: Pick<Bottle, 'remainingMl' | 'baselineMl' | 'capacityMl'>[];
  groups: Pick<Group, 'depth' | 'parentId'>[];
}): Violation | null {
  for (const item of state.stockItems) {
    const v = checkStockVolume(item);
    if (v) return v;
  }
  for (const bottle of state.bottles) {
    const v = checkBottleLevel(bottle);
    if (v) return v;
  }
  for (const group of state.groups) {
    const v = checkGroupDepth(group.depth, group.parentId ? group.depth - 1 : null);
    if (v) return v;
  }
  return ok();
}
