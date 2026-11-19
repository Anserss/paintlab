import { beforeEach, describe, expect, it } from 'vitest';
import type { Bottle, Paint } from '@/core/model/types';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import { blendAndStockIn, diluteAndStockIn, migrateLegacyBottles } from '@/data/repos/mix';
import { ensureSystemGroup } from '@/data/repos/group';
import { clearHistory, undo } from '@/data/repos/history';
import { adjustStockVolume, createStockItem, purgeEmptyStockItems, renameStockItem } from '@/data/repos/stock';
import { createWorkbench, openCoat, recordUsageAndStockIn } from '@/data/repos/workbench';

const BLUE = {
  id: 'gsi-c80',
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid' as const,
};

const WHITE = {
  ...BLUE,
  id: 'gsi-c1',
  code: 'C1',
  name: 'White',
  nameZh: '白',
  hex: '#F2F2F2',
};

const THINNER = {
  id: 'gsi-t103',
  brandId: 'gsi',
  code: 'T103',
  name: 'Mr. Color Thinner 250',
  nameZh: '郡士 标准稀释剂 250 ml',
  hex: '#FFFFFF',
  paintClass: 'aux' as const,
};

let store: DepotStore;

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await ensureSystemGroup(store);
  await clearHistory(store);
});

async function seedStocks(options: { blueMl?: number; whiteMl?: number; thinnerMl?: number } = {}) {
  const blue = await createStockItem(store, { paint: BLUE, initialMl: options.blueMl ?? 60, state: 'neat', groupId: null });
  const white = await createStockItem(store, { paint: WHITE, initialMl: options.whiteMl ?? 60, state: 'neat', groupId: null });
  const thinner = await createStockItem(store, { paint: THINNER, initialMl: options.thinnerMl ?? 200, state: 'neat', groupId: null });
  if (!blue.ok || !white.ok || !thinner.ok) throw new Error('seed failed');
  return { blueId: blue.data.item.id, whiteId: white.data.item.id, thinnerId: thinner.data.item.id };
}

const mixedRows = async () => (await store.stockItems.toArray()).filter((item) => item.origin === 'mixed');

describe('2.2 稀释自动入库 + 同配方合并', () => {
  it('第一次入库 30 ml；同配方第二次入库合并为 60 ml / initial 60 / 组分 ml 累加', async () => {
    const ids = await seedStocks();
    const first = await diluteAndStockIn(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.merged).toBe(false);
    expect(first.data.item.volumeMl).toBe(30);
    expect(first.data.item.dilutionRatioN).toBe(2);
    expect(first.data.item.parts).toHaveLength(2);
    expect(first.data.item.mixKey).toContain('f:');
    expect(first.data.lowVolume).toEqual([]);

    const second = await diluteAndStockIn(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.merged).toBe(true);
    expect(second.data.item.id).toBe(first.data.item.id);
    expect(second.data.item.volumeMl).toBe(60);
    expect(second.data.item.initialMl).toBe(60);
    expect(second.data.item.parts?.find((part) => part.aux)?.ml).toBe(40);
    expect(await mixedRows()).toHaveLength(1);

    // 来源扣减：原浆 60 → 40，稀释剂 200 → 160
    expect((await store.stockItems.get(ids.blueId))?.volumeMl).toBe(40);
    expect((await store.stockItems.get(ids.thinnerId))?.volumeMl).toBe(160);
  });

  it('比例不同不合并（1:2 与 1:3 各一瓶）', async () => {
    const ids = await seedStocks();
    await diluteAndStockIn(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    await diluteAndStockIn(store, {
      neatMl: 10,
      targetRatioN: 3,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(await mixedRows()).toHaveLength(2);
  });

  it('稀释后来源余量偏低 → lowVolume 提示；余量归 0 → 条目删除（撤销可恢复）', async () => {
    const ids = await seedStocks({ blueMl: 60 });
    const low = await diluteAndStockIn(store, {
      neatMl: 50,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(low.ok).toBe(true);
    if (!low.ok) return;
    expect(low.data.lowVolume).toEqual([{ itemId: ids.blueId, volumeMl: 10, initialMl: 60 }]);

    const ids2 = await seedStocks({ blueMl: 10 });
    const empty = await diluteAndStockIn(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids2.blueId,
      thinnerStockItemId: ids2.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(empty.ok).toBe(true);
    expect(await store.stockItems.get(ids2.blueId)).toBeUndefined();
    expect(empty.ok && empty.data.lowVolume.some((row) => row.itemId === ids2.blueId)).toBe(false);

    await undo(store);
    expect((await store.stockItems.get(ids2.blueId))?.volumeMl).toBe(10);
    expect(await mixedRows()).toHaveLength(1); // 只剩第一单的产物
  });
});

describe('2.2 调漆自动入库 + 同配方合并', () => {
  it('同比例两次调漆合并为一瓶；不同比例不合并', async () => {
    const ids = await seedStocks();
    const first = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.item.customName).toBe('调漆1');
    expect(first.data.item.volumeMl).toBe(20);

    const second = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 20 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 20 },
      ],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.merged).toBe(true);
    expect(second.data.item.id).toBe(first.data.item.id);
    expect(second.data.item.volumeMl).toBe(60);

    const third = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 20 },
      ],
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.data.merged).toBe(false);
    expect(await mixedRows()).toHaveLength(2);
  });

  it('调漆产物可作为下一次调漆的组分（扣减该产物库存）', async () => {
    const ids = await seedStocks();
    const first = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
    });
    if (!first.ok) throw new Error(first.error);

    const second = await blendAndStockIn(store, {
      parts: [
        { stockItemId: first.data.item.id, paint: { ...BLUE, name: first.data.item.customName ?? '调漆1' }, ml: 5 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 5 },
      ],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.item.parts?.some((part) => part.sourceKey?.startsWith('f:'))).toBe(true);
    expect((await store.stockItems.get(first.data.item.id))?.volumeMl).toBe(15);
  });
});

  it('用户自定义名称：填了就用自定义名，留空才「调漆N」；合并时改名并可撤销', async () => {
    const ids = await seedStocks();
    const named = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
      name: 'JW020',
    });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(named.data.item.customName).toBe('JW020');

    // 自定义名不吃调漆序号：下一个默认产物仍是「调漆1」
    const fallback = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 5 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 20 },
      ],
    });
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    expect(fallback.data.item.customName).toBe('调漆1');

    // 同配方再调 + 新名称：合并进同一瓶并改名
    const renamed = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
      name: '夜航蓝',
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.data.merged).toBe(true);
    expect(renamed.data.item.customName).toBe('夜航蓝');
    expect(renamed.data.item.id).toBe(named.data.item.id);

    await undo(store);
    expect((await store.stockItems.get(named.data.item.id))?.customName).toBe('JW020');
  });

  it('调漆产物改名：落库可撤销；空名 / 超长 / 原浆拒绝', async () => {
    const ids = await seedStocks();
    const blended = await blendAndStockIn(store, {
      parts: [
        { stockItemId: ids.blueId, paint: BLUE, ml: 10 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
    });
    if (!blended.ok) throw new Error(blended.error);
    expect(blended.data.item.customName).toBe('调漆1');

    const renamed = await renameStockItem(store, { itemId: blended.data.item.id, name: 'JW020' });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.data.item.customName).toBe('JW020');
    expect((await store.stockItems.get(blended.data.item.id))?.customName).toBe('JW020');

    await undo(store);
    expect((await store.stockItems.get(blended.data.item.id))?.customName).toBe('调漆1');

    expect((await renameStockItem(store, { itemId: blended.data.item.id, name: '   ' })).ok).toBe(false);
    expect((await renameStockItem(store, { itemId: blended.data.item.id, name: 'x'.repeat(17) })).ok).toBe(false);
    expect((await renameStockItem(store, { itemId: ids.blueId, name: '原浆改名' })).ok).toBe(false);
  });

describe('2.2 其他扣减路径：0 ml 删除 + 容量偏低', () => {
  it('盘点调到 0 → 删除条目；调到偏低 → lowVolume；撤销恢复', async () => {
    const ids = await seedStocks();
    const zero = await adjustStockVolume(store, { itemId: ids.blueId, volumeMl: 0, reason: 'spill' });
    expect(zero.ok).toBe(true);
    if (!zero.ok) return;
    expect(zero.data.removed).toBe(true);
    expect(await store.stockItems.get(ids.blueId)).toBeUndefined();
    await undo(store);
    expect((await store.stockItems.get(ids.blueId))?.volumeMl).toBe(60);

    const low = await adjustStockVolume(store, { itemId: ids.whiteId, volumeMl: 8, reason: 'estimate' });
    expect(low.ok).toBe(true);
    if (!low.ok) return;
    expect(low.data.lowVolume).toEqual([{ itemId: ids.whiteId, volumeMl: 8, initialMl: 60 }]);
  });

  it('启动清理历史遗留的 0 ml 条目与工作台引用', async () => {
    const ids = await seedStocks();
    const item = await store.stockItems.get(ids.blueId);
    if (!item) throw new Error('missing');
    await store.stockItems.put({ ...item, volumeMl: 0 });
    const workbench = await createWorkbench(store, { name: '旧台' });
    if (!workbench.ok) throw new Error(workbench.error);
    await store.workbenchItems.put({
      id: 'wi-zero',
      workbenchId: workbench.data.id,
      refType: 'stock',
      refId: ids.blueId,
      plannedUseMl: 0,
      addedAt: 1,
    });

    const result = await purgeEmptyStockItems(store);
    expect(result.removed).toBe(1);
    expect(await store.stockItems.get(ids.blueId)).toBeUndefined();
    expect((await store.workbenchItems.toArray()).some((row) => row.refId === ids.blueId)).toBe(false);
  });

  it('工作台消耗稀释漆料到 0 → 删除；余量偏低 → 提示', async () => {
    const ids = await seedStocks();
    const diluted = await diluteAndStockIn(store, {
      neatMl: 20,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    if (!diluted.ok) throw new Error(diluted.error);
    const workbench = await createWorkbench(store, { name: '喷涂位' });
    if (!workbench.ok) throw new Error(workbench.error);
    const opened = await openCoat(store, {
      workbenchId: workbench.data.id,
      refs: [{ refType: 'stock', refId: diluted.data.item.id }],
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const low = await recordUsageAndStockIn(store, {
      workbenchId: workbench.data.id,
      entries: [{ itemId: opened.data.added[0].id, usedMl: 50 }],
    });
    expect(low.ok).toBe(true);
    if (!low.ok) return;
    expect(low.data.lowVolume).toEqual([
      { itemId: diluted.data.item.id, volumeMl: 10, initialMl: 60 },
    ]);
    expect((await store.stockItems.get(diluted.data.item.id))?.volumeMl).toBe(10);

    const opened2 = await openCoat(store, {
      workbenchId: workbench.data.id,
      refs: [{ refType: 'stock', refId: diluted.data.item.id }],
    });
    if (!opened2.ok) throw new Error(opened2.error);
    const empty = await recordUsageAndStockIn(store, {
      workbenchId: workbench.data.id,
      entries: [{ itemId: opened2.data.added[0].id, usedMl: 10 }],
    });
    expect(empty.ok).toBe(true);
    expect(await store.stockItems.get(diluted.data.item.id)).toBeUndefined();
    expect((await store.workbenchItems.toArray()).filter((row) => row.refId === diluted.data.item.id)).toHaveLength(0);

    await undo(store);
    expect((await store.stockItems.get(diluted.data.item.id))?.volumeMl).toBe(10);
  });
});

describe('2.2 旧调漆台批次迁移', () => {
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
      components: [
        {
          stockItemId: 'old-stock',
          paintId: 'gsi-c80',
          neatMl: 10,
          brandId: 'gsi',
          code: 'C80',
          name: 'Cobalt Blue',
          hex: '#2E5E9F',
          paintClass: 'solid',
        },
      ],
      levelMode: 'baseline',
      updatedAt: 1,
      mode: 'dilute',
      parts: [
        {
          paintId: 'gsi-c80',
          brandId: 'gsi',
          code: 'C80',
          name: 'Cobalt Blue',
          nameZh: '钴蓝',
          hex: '#2E5E9F',
          paintClass: 'solid',
          ml: 10,
          state: 'neat',
        },
        {
          paintId: 'gsi-t103',
          brandId: 'gsi',
          code: 'T103',
          name: 'Mr. Color Thinner 250',
          nameZh: '郡士 标准稀释剂 250 ml',
          hex: '#FFFFFF',
          paintClass: 'aux',
          ml: 20,
          state: 'neat',
          aux: true,
        },
      ],
      ...patch,
    };
  }

  it('旧批次转成库存条目不丢；同配方两瓶合并；工作台引用迁移到库存', async () => {
    await store.bottles.put(bottleOf({ id: 'b1' }));
    await store.bottles.put(bottleOf({ id: 'b2' }));
    const workbench = await createWorkbench(store, { name: '旧台' });
    if (!workbench.ok) throw new Error(workbench.error);
    await store.workbenchItems.put({
      id: 'wi-1',
      workbenchId: workbench.data.id,
      refType: 'bottle',
      refId: 'b1',
      plannedUseMl: 0,
      addedAt: 1,
    });

    const result = await migrateLegacyBottles(store);
    expect(result).toEqual({ migrated: 2, removed: 2 });
    expect((await store.bottles.toArray())).toHaveLength(0);

    const rows = await mixedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].volumeMl).toBe(60);
    expect(rows[0].dilutionRatioN).toBe(2);
    expect(rows[0].customName).toBe('钴蓝');

    const refs = await store.workbenchItems.toArray();
    expect(refs).toHaveLength(1);
    expect(refs[0].refType).toBe('stock');
    expect(refs[0].refId).toBe(rows[0].id);
  });
});
