import { beforeEach, describe, expect, it } from 'vitest';
import { createCommand, patch } from '@/core/history/command';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import {
  adjustStockVolume,
  aggregateStockByPaint,
  createStockItem,
  deleteStockItem,
  listStockItems,
  moveStockToGroup,
} from '@/data/repos/stock';
import {
  createGroup,
  deleteGroup,
  ensureSystemGroup,
  groupTree,
  listGroups,
  moveGroup,
  renameGroup,
  reorderGroups,
} from '@/data/repos/group';
import { createBottle, mixBottle, setBottleCapacity } from '@/data/repos/bottle';
import { clearHistory, makeCommand, recordCommand, redo, snapshotHistory, undo } from '@/data/repos/history';
import { commitCommand } from '@/data/repos/patch';

const paint = {
  id: 'gsi-c80',
  code: 'C80',
  name: 'German Grey',
  nameZh: '钴蓝',
  hex: '#1838a8',
  brandShortName: '郡士',
  brandId: 'gsi',
  paintClass: 'solid' as const,
};

let store: DepotStore;

const userGroups = async (): Promise<number> => (await listGroups(store)).filter((group) => !group.system).length;

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await ensureSystemGroup(store);
  await clearHistory(store);
});

describe('登记入库事务（spec 3.2 / AC-01）', () => {
  it('stockItem + ledger + command 写在同一事务里，未指定分组时落 unassigned', async () => {
    const result = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const items = await store.stockItems.toArray();
    const ledger = await store.ledger.toArray();
    const commands = await store.commands.toArray();

    expect(items).toHaveLength(1);
    expect(items[0].volumeMl).toBe(10);
    expect(items[0].initialMl).toBe(10);
    expect(items[0].groupId).toBe(UNGROUPED_ID);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe('purchase');
    expect(ledger[0].deltaMl).toBe(10);
    expect(ledger[0].refId).toBe(items[0].id);
    expect(commands).toHaveLength(1);
    expect(commands[0].id).toBe(result.data.command.id);
    expect(result.data.message).toContain('已登记');
  });

  it('补丁集任一失败则整批回滚', async () => {
    const doc = {
      id: 'stock-boom',
      paintId: paint.id,
      volumeMl: 5,
      initialMl: 10,
      state: 'neat',
      groupId: UNGROUPED_ID,
      origin: 'custom',
      createdAt: 1,
    };
    const command = createCommand(
      'purchase',
      '坏补丁',
      [patch.append('stockItems', doc), patch.replace('ledger', 'ledger-missing', 'deltaMl', 1)],
      [],
    );
    await expect(commitCommand(store, command)).rejects.toThrow(/补丁目标不存在/);
    expect(await store.stockItems.toArray()).toHaveLength(0);
    expect(await store.commands.toArray()).toHaveLength(0);
  });
});

describe('撤销采购（spec 3.6 R2）', () => {
  it('撤销后 stockItem / ledger / command 一并消失，反撤销可恢复', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    expect(created.ok).toBe(true);

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    expect(await store.stockItems.toArray()).toHaveLength(0);
    expect(await store.ledger.toArray()).toHaveLength(0);
    expect(await store.commands.toArray()).toHaveLength(0);
    expect(snapshotHistory().undoCount).toBe(0);
    expect(snapshotHistory().redoCount).toBe(1);

    const redone = await redo(store);
    expect(redone.ok).toBe(true);
    expect(await store.stockItems.toArray()).toHaveLength(1);
    expect(await store.ledger.toArray()).toHaveLength(1);
    expect(await store.commands.toArray()).toHaveLength(1);
  });
});

describe('AC-11 撤销越界保护', () => {
  it('撤销会使余量超过初始量时：数据不变、指针回滚、返回结构化失败', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const itemId = created.data.item.id;

    const stale = makeCommand('use', '使用 10 ml', [], [patch.replace('stockItems', itemId, 'volumeMl', 20)]);
    const recorded = await recordCommand(store, stale);
    expect(recorded.ok).toBe(true);
    expect(await store.commands.toArray()).toHaveLength(2);

    const undone = await undo(store);
    expect(undone.ok).toBe(false);
    if (undone.ok) return;
    expect(undone.code).toBe('invariant');
    expect(undone.violationId).toBe('I1');
    expect(undone.error).toContain('无法撤销');

    const after = await store.stockItems.get(itemId);
    expect(after?.volumeMl).toBe(10);
    expect(await store.commands.toArray()).toHaveLength(2);
    expect(snapshotHistory().undoCount).toBe(2);
    expect(snapshotHistory().redoCount).toBe(0);
  });
});

describe('盘点调整余量（spec 3.3）', () => {
  it('必须带原因并写 ledger，可撤销', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    if (!created.ok) throw new Error(created.error);
    const itemId = created.data.item.id;

    const noReason = await adjustStockVolume(store, { itemId, volumeMl: 8, reason: 'bogus' as never });
    expect(noReason.ok).toBe(false);

    const adjusted = await adjustStockVolume(store, { itemId, volumeMl: 8, reason: 'evaporate' });
    expect(adjusted.ok).toBe(true);
    const ledger = await store.ledger.toArray();
    expect(ledger.filter((row) => row.type === 'adjust')).toHaveLength(1);
    expect((await store.stockItems.get(itemId))?.volumeMl).toBe(8);

    const overflow = await adjustStockVolume(store, { itemId, volumeMl: 12, reason: 'estimate' });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.violationId).toBe('I1');

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    expect((await store.stockItems.get(itemId))?.volumeMl).toBe(10);
  });

  it('删除条目可撤销，聚合随条目变化', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    if (!created.ok) throw new Error(created.error);
    const itemId = created.data.item.id;
    const aggregate = aggregateStockByPaint(await listStockItems(store));
    expect(aggregate[paint.id]).toEqual({ paintId: paint.id, count: 1, totalMl: 10 });

    const removed = await deleteStockItem(store, { itemId });
    expect(removed.ok).toBe(true);
    expect(await store.stockItems.toArray()).toHaveLength(0);
    await undo(store);
    expect(await store.stockItems.toArray()).toHaveLength(1);
  });
});

describe('分组（spec 3.3 / 3.7.2）', () => {
  it('系统分组"未分组"不可改名 / 不可删除，且树里恒为根节点', async () => {
    const renamed = await renameGroup(store, { id: UNGROUPED_ID, name: '临时' });
    expect(renamed.ok).toBe(false);
    const removed = await deleteGroup(store, { id: UNGROUPED_ID });
    expect(removed.ok).toBe(false);

    const items = await listStockItems(store);
    const tree = groupTree(await listGroups(store), items);
    expect(tree).toHaveLength(1);
    expect(tree[0].group.id).toBe(UNGROUPED_ID);
    expect(tree[0].group.name).toBe('未分组');
  });

  it('3 层限制、成环校验、同层重名校验', async () => {
    const l1 = await createGroup(store, { name: '硝基' });
    if (!l1.ok) throw new Error(l1.error);
    const l2 = await createGroup(store, { name: '郡士', parentId: l1.data.group.id });
    if (!l2.ok) throw new Error(l2.error);
    const l3 = await createGroup(store, { name: 'Mr.Color', parentId: l2.data.group.id });
    if (!l3.ok) throw new Error(l3.error);

    const tooDeep = await createGroup(store, { name: '第4层', parentId: l3.data.group.id });
    expect(tooDeep.ok).toBe(false);

    const duplicate = await createGroup(store, { name: '硝基' });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toContain('同名');

    const cycle = await moveGroup(store, { id: l1.data.group.id, parentId: l3.data.group.id });
    expect(cycle.ok).toBe(false);

    const renamed = await renameGroup(store, { id: l1.data.group.id, name: '油性' });
    expect(renamed.ok).toBe(true);
    expect((await listGroups(store)).some((group) => group.name === '油性')).toBe(true);
  });

  it('删除分组：子分组一并删除，组内条目回到未分组，且可撤销', async () => {
    const group = await createGroup(store, { name: '军模' });
    if (!group.ok) throw new Error(group.error);
    const child = await createGroup(store, { name: '田宫', parentId: group.data.group.id });
    if (!child.ok) throw new Error(child.error);
    const created = await createStockItem(store, {
      paint,
      initialMl: 10,
      state: 'neat',
      groupId: child.data.group.id,
    });
    if (!created.ok) throw new Error(created.error);

    const removed = await deleteGroup(store, { id: group.data.group.id });
    expect(removed.ok).toBe(true);
    expect(await userGroups()).toBe(0);
    expect((await store.stockItems.get(created.data.item.id))?.groupId).toBe(UNGROUPED_ID);

    await undo(store);
    expect(await userGroups()).toBe(2);
    expect((await store.stockItems.get(created.data.item.id))?.groupId).toBe(child.data.group.id);

    const tree = groupTree(await listGroups(store), await listStockItems(store));
    expect(tree.some((node) => node.group.name === '未分组')).toBe(true);
  });

  it('分组拖拽排序：sort 写入、撤销回旧值、异父/重复/系统分组被拒且数据不变（spec 3.3）', async () => {
    const a = await createGroup(store, { name: 'A' });
    const b = await createGroup(store, { name: 'B' });
    const c = await createGroup(store, { name: 'C' });
    if (!a.ok || !b.ok || !c.ok) throw new Error('seed groups failed');
    const childOfA = await createGroup(store, { name: 'A-1', parentId: a.data.group.id });
    if (!childOfA.ok) throw new Error(childOfA.error);

    const rootIds = async (): Promise<string[]> =>
      (await listGroups(store))
        .filter((group) => group.parentId === null && !group.system)
        .map((group) => group.id);
    const sortOf = async (id: string): Promise<number | undefined> =>
      (await listGroups(store)).find((group) => group.id === id)?.sort;

    expect(await rootIds()).toEqual([a.data.group.id, b.data.group.id, c.data.group.id]);
    expect(await sortOf(a.data.group.id)).toBe(1);

    const reordered = await reorderGroups(store, {
      parentId: null,
      orderedIds: [c.data.group.id, a.data.group.id, b.data.group.id],
    });
    expect(reordered.ok).toBe(true);
    expect(await rootIds()).toEqual([c.data.group.id, a.data.group.id, b.data.group.id]);
    expect(await sortOf(c.data.group.id)).toBe(0);
    expect(await sortOf(a.data.group.id)).toBe(1);
    expect(await sortOf(b.data.group.id)).toBe(2);
    const tree = groupTree(await listGroups(store), await listStockItems(store));
    const treeChildren = tree
      .filter((node) => !node.group.system)
      .map((node) => node.group.id);
    expect(treeChildren).toEqual([c.data.group.id, a.data.group.id, b.data.group.id]);

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    expect(await sortOf(a.data.group.id)).toBe(1);
    expect(await sortOf(b.data.group.id)).toBe(2);
    expect(await sortOf(c.data.group.id)).toBe(3);

    // 混入异父 id：拒绝且数据不变
    const beforeMixed = await rootIds();
    const mixed = await reorderGroups(store, {
      parentId: null,
      orderedIds: [b.data.group.id, childOfA.data.group.id],
    });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.code).toBe('validation');
    expect(await rootIds()).toEqual(beforeMixed);

    // 重复 id / 系统分组 / 不存在的 id
    const duplicated = await reorderGroups(store, {
      parentId: null,
      orderedIds: [a.data.group.id, a.data.group.id],
    });
    expect(duplicated.ok).toBe(false);

    const system = await reorderGroups(store, {
      parentId: null,
      orderedIds: [UNGROUPED_ID, a.data.group.id],
    });
    expect(system.ok).toBe(false);

    const missing = await reorderGroups(store, { parentId: null, orderedIds: ['group-does-not-exist'] });
    expect(missing.ok).toBe(false);

    // 子级排序独立生效
    const childSibling = await createGroup(store, { name: 'A-2', parentId: a.data.group.id });
    if (!childSibling.ok) throw new Error(childSibling.error);
    const childReorder = await reorderGroups(store, {
      parentId: a.data.group.id,
      orderedIds: [childSibling.data.group.id, childOfA.data.group.id],
    });
    expect(childReorder.ok).toBe(true);
    const childRow = (await listGroups(store)).find((group) => group.id === childSibling.data.group.id);
    expect(childRow?.sort).toBe(0);
  });

  it('瓶容量：改大成功、小于余量被拒且数据不变、撤销后回到旧容量（spec 3.4.3）', async () => {
    const source = await createStockItem(store, { paint, initialMl: 30, state: 'neat', groupId: null });
    const thinner = await createStockItem(store, {
      paint: { ...paint, id: 'gsi-thinner', name: 'Thinner' },
      initialMl: 30,
      state: 'neat',
      groupId: null,
    });
    if (!source.ok || !thinner.ok) throw new Error('seed failed');

    const bottle = await createBottle(store, { name: '瓶 1', capacityMl: 60 });
    if (!bottle.ok) throw new Error(bottle.error);
    const mixed = await mixBottle(store, {
      bottleId: bottle.data.id,
      mode: 'neat',
      neatMl: 5,
      ratioN: 2,
      sourceStockItemId: source.data.item.id,
      thinnerStockItemId: thinner.data.item.id,
      paint,
    });
    if (!mixed.ok) throw new Error(mixed.error);

    const shrunk = await setBottleCapacity(store, { bottleId: bottle.data.id, capacityMl: 30 });
    expect(shrunk.ok).toBe(true);
    const after = await store.bottles.get(bottle.data.id);
    expect(after?.capacityMl).toBe(30);
    expect(after?.remainingMl).toBe(15);
    expect(after?.baselineMl).toBe(15);
    expect((await store.ledger.toArray()).filter((row) => row.type === 'adjust')).toHaveLength(1);

    const tooSmall = await setBottleCapacity(store, { bottleId: bottle.data.id, capacityMl: 10 });
    expect(tooSmall.ok).toBe(false);
    if (!tooSmall.ok) {
      expect(tooSmall.error).toContain('瓶内尚有 15 ml');
      expect(tooSmall.error).toContain('≥ 15 ml 的瓶');
    }
    expect((await store.bottles.get(bottle.data.id))?.capacityMl).toBe(30);

    const fractional = await setBottleCapacity(store, { bottleId: bottle.data.id, capacityMl: 12.5 });
    expect(fractional.ok).toBe(false);

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    expect((await store.bottles.get(bottle.data.id))?.capacityMl).toBe(60);
  });

  it('批量移动到分组只产生 1 个 Command（spec 3.6 R5）', async () => {
    const group = await createGroup(store, { name: '水性' });
    if (!group.ok) throw new Error(group.error);
    const a = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    const b = await createStockItem(store, { paint, initialMl: 12, state: 'neat', groupId: null });
    if (!a.ok || !b.ok) throw new Error('seed failed');

    const moved = await moveStockToGroup(store, {
      itemIds: [a.data.item.id, b.data.item.id],
      groupId: group.data.group.id,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.data.command.type).toBe('group');
    expect(moved.data.command.label).toContain('×2');
    expect((await store.stockItems.get(a.data.item.id))?.groupId).toBe(group.data.group.id);

    await undo(store);
    expect((await store.stockItems.get(a.data.item.id))?.groupId).toBe(UNGROUPED_ID);
    expect((await store.stockItems.get(b.data.item.id))?.groupId).toBe(UNGROUPED_ID);
  });
});
