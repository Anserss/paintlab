import { beforeEach, describe, expect, it } from 'vitest';
import { BottleSchema, StockItemSchema } from '@/core/model/schemas';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import {
  blendIntoBatch,
  diluteIntoBatch,
  renameBottle,
  setBottleColor,
  stockInBottle,
} from '@/data/repos/bottle';
import { clearHistory, undo } from '@/data/repos/history';
import { ensureSystemGroup } from '@/data/repos/group';
import { exportAll, importAll, readSettings, resetAll } from '@/data/repos/settings';
import { createStockItem } from '@/data/repos/stock';

const BLUE = {
  id: 'gsi-c80',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  brandShortName: '郡士',
  brandId: 'gsi',
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
  ...BLUE,
  id: 'gsi-t103',
  code: 'T103',
  name: 'Thinner',
  nameZh: '稀释剂',
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

async function seed(): Promise<{ blueId: string; thinnerId: string }> {
  const blue = await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
  const thinner = await createStockItem(store, { paint: THINNER, initialMl: 200, state: 'neat', groupId: null });
  if (!blue.ok || !thinner.ok) throw new Error('seed failed');
  return { blueId: blue.data.item.id, thinnerId: thinner.data.item.id };
}

async function mixOnce(seedIds: { blueId: string; thinnerId: string }, paint = BLUE) {
  const result = await diluteIntoBatch(store, {
    neatMl: 10,
    targetRatioN: 2,
    sourceStockItemId: seedIds.blueId,
    thinnerStockItemId: seedIds.thinnerId,
    paint,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.bottle;
}

async function blendOnce(seedIds: { blueId: string }) {
  const result = await blendIntoBatch(store, {
    parts: [{ stockItemId: seedIds.blueId, paint: BLUE, ml: 10 }],
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.bottle;
}

describe('稀释批次：名称与色值沿用原浆，不占调漆序号（2.1）', () => {
  it('首支稀释批次叫「钴蓝」、色值是原浆色、没有 seq / 自定义色，序号计数器不动', async () => {
    const ids = await seed();
    const bottle = await mixOnce(ids);

    expect(bottle.name).toBe('钴蓝');
    expect(bottle.mode).toBe('dilute');
    expect(bottle.ratioN).toBe(2);
    expect(bottle.hex).toBe('#2E5E9F');
    expect(bottle.seq).toBeUndefined();
    expect(bottle.colorHex).toBeUndefined();
    expect(bottle.colorAlpha).toBeUndefined();
    expect((await readSettings(store)).mixSeq).toBe(0);

    const second = await mixOnce(ids);
    expect(second.name).toBe('钴蓝');
    expect(second.seq).toBeUndefined();
    expect((await readSettings(store)).mixSeq).toBe(0);
  });
});

describe('调漆批次：调漆1 / 调漆2 序号命名（2.0 契约保留）', () => {
  it('首支调漆批次叫「调漆1」，默认 70% 白「未定色」，序号 +1 且删除不回收', async () => {
    const ids = await seed();
    const first = await blendOnce(ids);
    expect(first.name).toBe('调漆1');
    expect(first.seq).toBe(1);
    expect(first.colorHex).toBe('#FFFFFF');
    expect(first.colorAlpha).toBe(70);
    expect((await readSettings(store)).mixSeq).toBe(1);

    const second = await blendOnce(ids);
    expect(second.name).toBe('调漆2');
    expect(second.seq).toBe(2);
    expect((await readSettings(store)).mixSeq).toBe(2);

    // 第二支入库后从 bottles 表消失，序号不回收
    const stocked = await stockInBottle(store, { bottleId: second.id });
    expect(stocked.ok).toBe(true);
    const third = await blendOnce(ids);
    expect(third.name).toBe('调漆3');
  });
});

describe('自定义名称与颜色（可撤销）', () => {
  it('调漆批次改名 1–16 字落库，撤销后回到「调漆1」', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);

    const renamed = await renameBottle(store, { bottleId: bottle.id, name: '夜航蓝' });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.data.bottle.name).toBe('夜航蓝');
    expect((await store.bottles.get(bottle.id))?.name).toBe('夜航蓝');

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    expect((await store.bottles.get(bottle.id))?.name).toBe('调漆1');
  });

  it('空名称被拒绝，库里的名字不变', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);
    const renamed = await renameBottle(store, { bottleId: bottle.id, name: '   ' });
    expect(renamed.ok).toBe(false);
    expect((await store.bottles.get(bottle.id))?.name).toBe('调漆1');
  });

  it('调漆批次改色写入 hex/透明度，撤销回到默认 70% 白', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);

    const colored = await setBottleColor(store, { bottleId: bottle.id, colorHex: '#2e5e9f', colorAlpha: 55 });
    expect(colored.ok).toBe(true);
    if (!colored.ok) return;
    expect(colored.data.bottle.colorHex).toBe('#2E5E9F');
    expect(colored.data.bottle.colorAlpha).toBe(55);

    await undo(store);
    const after = await store.bottles.get(bottle.id);
    expect(after?.colorHex).toBe('#FFFFFF');
    expect(after?.colorAlpha).toBe(70);
  });

  it('非法 HEX / 透明度被拒绝', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);
    expect((await setBottleColor(store, { bottleId: bottle.id, colorHex: '#12', colorAlpha: 50 })).ok).toBe(false);
    expect((await setBottleColor(store, { bottleId: bottle.id, colorHex: '#123456', colorAlpha: 101 })).ok).toBe(false);
  });
});

describe('入库保真与备份', () => {
  it('稀释漆料入库：保留原浆名称/色值 + 稀释比例，不带自定义透明度', async () => {
    const ids = await seed();
    const bottle = await mixOnce(ids);
    const stocked = await stockInBottle(store, { bottleId: bottle.id });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) return;

    expect(stocked.data.item.state).toBe('thinned');
    expect(stocked.data.item.customName).toBe('钴蓝');
    expect(stocked.data.item.customHex).toBe('#2E5E9F');
    expect(stocked.data.item.dilutionRatioN).toBe(2);
    expect(stocked.data.item.customAlpha).toBeUndefined();
  });

  it('调漆产物入库：自定义名称与颜色保留到仓库条目', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);
    await renameBottle(store, { bottleId: bottle.id, name: '夜航蓝' });
    await setBottleColor(store, { bottleId: bottle.id, colorHex: '#123456', colorAlpha: 33 });

    const stocked = await stockInBottle(store, { bottleId: bottle.id });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) return;
    expect(stocked.data.item.customName).toBe('夜航蓝');
    expect(stocked.data.item.customHex).toBe('#123456');
    expect(stocked.data.item.customAlpha).toBe(33);
    expect(stocked.data.item.dilutionRatioN).toBeUndefined();
  });

  it('导出含 mixSeq 与颜色字段，replace 导入后完全恢复', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);
    await setBottleColor(store, { bottleId: bottle.id, colorHex: '#AA5500', colorAlpha: 42 });

    const exported = await exportAll(store);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.data.settings.mixSeq).toBe(1);
    expect(exported.data.user.bottles[0].colorHex).toBe('#AA5500');

    await resetAll(store);
    expect((await readSettings(store)).mixSeq).toBe(0);

    const imported = await importAll(store, exported.data, 'replace');
    expect(imported.ok).toBe(true);
    const restored = await store.bottles.get(bottle.id);
    expect(restored?.name).toBe('调漆1');
    expect(restored?.colorHex).toBe('#AA5500');
    expect(restored?.colorAlpha).toBe(42);
    expect((await readSettings(store)).mixSeq).toBe(1);
  });

  it('稀释漆料的 dilutionRatioN 随导出 / 导入一起走', async () => {
    const ids = await seed();
    const bottle = await mixOnce(ids);
    const stocked = await stockInBottle(store, { bottleId: bottle.id });
    expect(stocked.ok).toBe(true);
    if (!stocked.ok) return;

    const exported = await exportAll(store);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.data.user.stockItems.find((item) => item.id === stocked.data.item.id)?.dilutionRatioN).toBe(2);

    await resetAll(store);
    const imported = await importAll(store, exported.data, 'replace');
    expect(imported.ok).toBe(true);
    expect((await store.stockItems.get(stocked.data.item.id))?.dilutionRatioN).toBe(2);
  });

  it('旧备份没有 mixSeq 时，按导出的批次最大 seq 推导，避免撞号', async () => {
    const ids = await seed();
    const bottle = await blendOnce(ids);

    const exported = await exportAll(store);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const legacy = JSON.parse(JSON.stringify(exported.data)) as Record<string, unknown>;
    delete (legacy.settings as Record<string, unknown>).mixSeq;

    await resetAll(store);
    const imported = await importAll(store, legacy, 'replace');
    expect(imported.ok).toBe(true);
    expect((await store.bottles.get(bottle.id))?.seq).toBe(1);
    expect((await readSettings(store)).mixSeq).toBe(1);
  });
});

describe('schema 兼容', () => {
  it('没有 seq / colorHex / colorAlpha 的旧批次仍然通过校验', () => {
    const legacy = {
      id: 'bottle-old',
      name: '稀释 硝基黑 30.0ml',
      capacityMl: 30,
      baselineMl: 30,
      remainingMl: 30,
      ratioN: 2,
      paintClass: 'solid',
      hex: '#111111',
      components: [],
      levelMode: 'baseline',
      updatedAt: 1,
      mode: 'dilute',
    };
    expect(BottleSchema.safeParse(legacy).success).toBe(true);
  });

  it('旧库存条目没有 dilutionRatioN 仍然通过校验', () => {
    const legacy = {
      id: 'stock-old',
      paintId: 'gsi-c80',
      volumeMl: 10,
      initialMl: 10,
      state: 'neat',
      groupId: null,
      origin: 'seed',
      createdAt: 1,
    };
    expect(StockItemSchema.safeParse(legacy).success).toBe(true);
  });
});
