import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import { blendIntoBatch, diluteIntoBatch, stockInBottle } from '@/data/repos/bottle';
import { ensureSystemGroup } from '@/data/repos/group';
import { clearHistory, undo } from '@/data/repos/history';
import { createStockItem, decomposeStockItem } from '@/data/repos/stock';

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

async function seedStocks(): Promise<{ blueId: string; whiteId: string; thinnerId: string }> {
  const blue = await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
  const white = await createStockItem(store, { paint: WHITE, initialMl: 60, state: 'neat', groupId: null });
  const thinner = await createStockItem(store, { paint: THINNER, initialMl: 200, state: 'neat', groupId: null });
  if (!blue.ok || !white.ok || !thinner.ok) throw new Error('seed failed');
  return { blueId: blue.data.item.id, whiteId: white.data.item.id, thinnerId: thinner.data.item.id };
}

/** 稀释 10 ml 原浆到 1:2 → 入库，得到带组分快照的库存条目 */
async function seedDilutedStock(): Promise<{ itemId: string }> {
  const ids = await seedStocks();
  const diluted = await diluteIntoBatch(store, {
    neatMl: 10,
    targetRatioN: 2,
    sourceStockItemId: ids.blueId,
    thinnerStockItemId: ids.thinnerId,
    paint: BLUE,
    thinnerPaint: THINNER,
  });
  if (!diluted.ok) throw new Error(diluted.error);
  const stocked = await stockInBottle(store, { bottleId: diluted.data.bottle.id });
  if (!stocked.ok) throw new Error(stocked.error);
  return { itemId: stocked.data.item.id };
}

describe('2.1.1 稀释入库：组分快照', () => {
  it('批次与库存条目都记下「原浆 + 稀释剂」', async () => {
    const ids = await seedStocks();
    const diluted = await diluteIntoBatch(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
      thinnerPaint: THINNER,
    });
    expect(diluted.ok).toBe(true);
    if (!diluted.ok) return;
    expect(diluted.data.bottle.parts).toHaveLength(2);
    expect(diluted.data.bottle.parts?.[0]).toMatchObject({ paintId: 'gsi-c80', ml: 10, state: 'neat' });
    expect(diluted.data.bottle.parts?.[1]).toMatchObject({ paintId: 'gsi-t103', ml: 20, aux: true });

    const stocked = await stockInBottle(store, { bottleId: diluted.data.bottle.id });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) return;
    expect(stocked.data.item.parts).toHaveLength(2);
    expect((await store.stockItems.get(stocked.data.item.id))?.parts).toHaveLength(2);
  });

  it('找不到稀释剂身份时不留快照（不编造组分）', async () => {
    const ids = await seedStocks();
    const diluted = await diluteIntoBatch(store, {
      neatMl: 10,
      targetRatioN: 2,
      sourceStockItemId: ids.blueId,
      thinnerStockItemId: ids.thinnerId,
      paint: BLUE,
    });
    expect(diluted.ok).toBe(true);
    if (!diluted.ok) return;
    // 内存 store 的 paints 表为空，且没传 thinnerPaint → 只有原浆组分时不完整，整体不留
    expect(diluted.data.bottle.parts).toBeUndefined();
  });
});

describe('2.1.1 删除时分解回仓库', () => {
  it('稀释漆料 → 原浆 + 稀释剂两条回仓库，原条目删除，可撤销', async () => {
    const { itemId } = await seedDilutedStock();
    const before = await store.stockItems.get(itemId);
    expect(before?.parts).toHaveLength(2);

    const result = await decomposeStockItem(store, { itemId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(2);

    const items = await store.stockItems.toArray();
    expect(items.some((item) => item.id === itemId)).toBe(false);
    const neat = result.data.items.find((item) => item.paintId === 'gsi-c80');
    const aux = result.data.items.find((item) => item.paintId === 'gsi-t103');
    expect(neat?.state).toBe('neat');
    expect(neat?.volumeMl).toBe(10);
    expect(neat?.initialMl).toBe(10);
    expect(aux?.volumeMl).toBe(20);
    expect(aux?.state).toBe('neat');

    // 一整单可撤销：原条目回来、分解产物消失
    await undo(store);
    const after = await store.stockItems.toArray();
    expect(after.some((item) => item.id === itemId)).toBe(true);
    const createdIds = result.data.items.map((entry) => entry.id);
    expect(after.some((item) => createdIds.includes(item.id))).toBe(false);
  });

  it('取用一部分后分解：按当前余量等比还原', async () => {
    const { itemId } = await seedDilutedStock();
    const item = await store.stockItems.get(itemId);
    if (!item) throw new Error('missing');
    await store.stockItems.put({ ...item, volumeMl: 15 });

    const result = await decomposeStockItem(store, { itemId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.find((row) => row.paintId === 'gsi-c80')?.volumeMl).toBe(5);
    expect(result.data.items.find((row) => row.paintId === 'gsi-t103')?.volumeMl).toBe(10);
  });

  it('调漆产物：调漆前的已稀释颜料带比例回仓库', async () => {
    const ids = await seedStocks();
    // 先做一支「已稀释漆料」库存条目（1:2）
    const pre = await createStockItem(store, {
      paint: BLUE,
      initialMl: 40,
      state: 'thinned',
      ratioN: 2,
      groupId: null,
    });
    if (!pre.ok) throw new Error(pre.error);
    await store.stockItems.put({ ...pre.data.item, dilutionRatioN: 2 });

    const blended = await blendIntoBatch(store, {
      parts: [
        { stockItemId: pre.data.item.id, paint: BLUE, ml: 20 },
        { stockItemId: ids.whiteId, paint: WHITE, ml: 10 },
      ],
    });
    expect(blended.ok).toBe(true);
    if (!blended.ok) return;
    expect(blended.data.bottle.parts).toHaveLength(2);

    const stocked = await stockInBottle(store, { bottleId: blended.data.bottle.id });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) return;
    const result = await decomposeStockItem(store, { itemId: stocked.data.item.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const restoredBlue = result.data.items.find((item) => item.paintId === 'gsi-c80');
    const restoredWhite = result.data.items.find((item) => item.paintId === 'gsi-c1');
    expect(restoredBlue?.state).toBe('thinned');
    expect(restoredBlue?.ratioN).toBe(2);
    expect(restoredBlue?.dilutionRatioN).toBe(2);
    expect(restoredBlue?.volumeMl).toBe(20);
    expect(restoredWhite?.state).toBe('neat');
    expect(restoredWhite?.volumeMl).toBe(10);
  });

  it('没有组分快照的条目拒绝分解，库里不变', async () => {
    const ids = await seedStocks();
    const result = await decomposeStockItem(store, { itemId: ids.blueId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('只能直接删除');
    expect(await store.stockItems.get(ids.blueId)).toBeTruthy();
  });
});
