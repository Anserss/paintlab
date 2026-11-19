import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import { ensureSystemGroup } from '@/data/repos/group';
import { clearHistory, hydrateHistory, redo, snapshotHistory, undo } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { estimateStorage, exportAll, importAll, readSettings, resetAll, writeSetting } from '@/data/repos/settings';
import { useAppStore } from '@/store';

const paint = {
  id: 'gsi-c80',
  code: 'C80',
  name: 'German Grey',
  nameZh: '钴蓝',
  hex: '#1838a8',
  brandShortName: '郡士',
};

let store: DepotStore;

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await ensureSystemGroup(store);
  await clearHistory(store);
});

describe('历史持久化（spec 3.6 R6 / AC-14）', () => {
  it('5 次操作只保留最近 3 步，模拟重载后撤销 / 反撤销栈可恢复', async () => {
    for (let index = 0; index < 5; index += 1) {
      const result = await createStockItem(store, {
        paint,
        initialMl: 10,
        state: 'neat',
        groupId: null,
        at: 1000 + index,
      });
      expect(result.ok).toBe(true);
    }
    expect((await store.commands.toArray())).toHaveLength(3);

    const first = await hydrateHistory(store);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.undoCount).toBe(3);
    expect(first.data.redoCount).toBe(0);

    const undone = await undo(store);
    expect(undone.ok).toBe(true);
    await hydrateHistory(store);
    expect(snapshotHistory().undoCount).toBe(2);
    expect(snapshotHistory().redoCount).toBe(1);
    expect((await store.commands.toArray())).toHaveLength(2);

    const redone = await redo(store);
    expect(redone.ok).toBe(true);
    await hydrateHistory(store);
    expect(snapshotHistory().undoCount).toBe(3);
    expect(snapshotHistory().redoCount).toBe(0);
    expect((await store.commands.toArray())).toHaveLength(3);
  });

  it('撤销/反撤销本身不产生新 Command（R7）', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null, at: 2000 });
    expect(created.ok).toBe(true);
    await undo(store);
    await redo(store);
    await undo(store);
    expect((await store.commands.toArray()).length).toBeLessThanOrEqual(1);
    expect(snapshotHistory().undoCount).toBe(0);
  });
});

describe('设置（spec 3.9）', () => {
  it('按 key 写入并读回，非法值被拒绝且不污染其它项', async () => {
    const written = await writeSetting(store, 'theme', 'light');
    expect(written.ok).toBe(true);
    const settings = await readSettings(store);
    expect(settings.theme).toBe('light');
    expect(settings.density).toBe('normal');

    const bad = await writeSetting(store, 'undoDepth', 99 as never);
    expect(bad.ok).toBe(false);
    expect((await readSettings(store)).undoDepth).toBe(3);
    expect((await readSettings(store)).theme).toBe('light');
  });

  it('存储占用估算返回结构化结果', async () => {
    const estimate = await estimateStorage(store);
    expect(typeof estimate.usage).toBe('number');
    expect(estimate.source === 'navigator' || estimate.source === 'tables').toBe(true);
  });
});

describe('导出 / 导入 / 重置（spec 3.8）', () => {
  it('导出格式含 catalogVersion / user / settings，replace 导入可恢复', async () => {
    const created = await createStockItem(store, { paint, initialMl: 10, state: 'neat', groupId: null });
    expect(created.ok).toBe(true);

    const exported = await exportAll(store);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.data.format).toBe('pigment-depot/v1');
    expect(exported.data.user.stockItems).toHaveLength(1);
    expect(exported.data.user.groups.some((group) => group.system)).toBe(true);
    expect(exported.data.settings.theme).toBe('light');
    expect(typeof exported.data.catalogVersion).toBe('string');

    await resetAll(store);
    expect(await store.stockItems.toArray()).toHaveLength(0);
    expect((await store.groups.toArray())).toHaveLength(0);

    const imported = await importAll(store, exported.data, 'replace');
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.data.added).toBeGreaterThan(0);
    expect(await store.stockItems.toArray()).toHaveLength(1);
    expect(await store.groups.toArray()).toHaveLength(1);

    const skipped = await importAll(store, exported.data, 'skip');
    expect(skipped.ok).toBe(true);
    if (!skipped.ok) return;
    expect(skipped.data.added).toBe(0);
  });
});

describe('撤销后的读模型一致性（骨架职责，不下放给特性层）', () => {
  it('撤销一次「入库」后，workbenchItems / workbenches / 库存读模型同步回到撤销前', async () => {
    // beforeEach 已 setStore(createMemoryStore()) 并清空历史
    useAppStore.setState({
      stockItems: [],
      bottles: [],
      workbenches: [],
      workbenchItems: [],
      groups: [],
      tree: [],
      selected: [],
      toasts: [],
      undoCount: 0,
      redoCount: 0,
      canUndo: false,
      canRedo: false,
    });
    const app = () => useAppStore.getState();

    // 2.1 平台流转：工作台只接收稀释 / 调漆产物，原浆不能上工作台
    const purchased = await app().purchase({ paint, initialMl: 17, state: 'thinned', ratioN: 2, groupId: null });
    expect(purchased.ok).toBe(true);
    if (!purchased.ok) return;
    const stockId = purchased.data.item.id;

    const workbench = await app().newWorkbench({ name: '工作台 A' });
    expect(workbench.ok).toBe(true);
    if (!workbench.ok) return;
    const workbenchId = workbench.data.id;

    const added = await app().openCoat({
      workbenchId: workbenchId,
      refs: [{ refType: 'stock', refId: stockId }],
    });
    expect(added.ok).toBe(true);
    expect(app().workbenchItems).toHaveLength(1);
    expect(app().workbenches).toHaveLength(1);

    const workbenchItemId = app().workbenchItems[0].id;
    const returned = await app().stockIn({
      workbenchId: workbenchId,
      entries: [{ itemId: workbenchItemId, usedMl: 5 }],
    });
    expect(returned.ok).toBe(true);
    expect(app().workbenchItems).toHaveLength(0);
    expect(app().stockItems.find((item) => item.id === stockId)?.volumeMl).toBe(12);

    const undone = await app().undo();
    expect(undone.ok).toBe(true);

    expect(app().workbenchItems).toHaveLength(1);
    expect(app().workbenchItems[0].id).toBe(workbenchItemId);
    expect(app().workbenchItems[0].workbenchId).toBe(workbenchId);
    expect(app().workbenches).toHaveLength(1);
    expect(app().workbenches[0].id).toBe(workbenchId);
    expect(app().stockItems.find((item) => item.id === stockId)?.volumeMl).toBe(17);
    expect(app().undoCount).toBe(2);
    expect(app().redoCount).toBe(1);

    const redone = await app().redo();
    expect(redone.ok).toBe(true);
    expect(app().workbenchItems).toHaveLength(0);
    expect(app().stockItems.find((item) => item.id === stockId)?.volumeMl).toBe(12);
    expect(app().redoCount).toBe(0);
  });
});
