import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type { DepotStore } from '@/data/db';
import { createMemoryStore, setStore } from '@/data/db';
import { diluteIntoBatch, stockInBottle } from '@/data/repos/bottle';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { openCoat } from '@/data/repos/workbench';
import { MixPage } from '@/features/mix/MixPage';
import { WorkbenchPage } from '@/features/workbench/WorkbenchPage';
import { useAppStore } from '@/store';

/** jsdom 无 ResizeObserver；@dnd-kit/core 的测量在挂载时会用到 */
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

const brand: Brand = {
  id: 'gs',
  name: 'Mr.Color',
  nameZh: '郡士',
  shortName: 'GSI',
  aliases: [],
  accentHex: '#c8102e',
  country: 'JP',
  sort: 1,
};

const colorLine: PaintLine = {
  id: 'gs-mr-color',
  brandId: 'gs',
  name: 'Mr.Color',
  nameZh: '郡士油性漆',
  packaging: 'pot',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const thinnerLine: PaintLine = {
  ...colorLine,
  id: 'gs-aux',
  name: 'Auxiliary',
  nameZh: '郡士辅料',
  packaging: 'bottle',
  defaultVolumeMl: 250,
  kind: 'auxiliary',
  defaultFinish: 'additive',
};

const BLUE: Paint = {
  id: 'p-c80',
  lineId: colorLine.id,
  brandId: 'gs',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const THINNER: Paint = {
  id: 'p-t103',
  lineId: thinnerLine.id,
  brandId: 'gs',
  code: 'T103',
  name: 'Thinner',
  nameZh: '郡士标准稀释剂',
  hex: '#ffffff',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'additive',
  origin: 'seed',
  volumeMl: 250,
};

let store: DepotStore;

function resetState() {
  useAppStore.setState({
    bottles: [],
    activeBottleId: null,
    workbenches: [],
    workbenchItems: [],
    stockItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: false,
    selected: [],
    toasts: [],
    brands: [brand],
    paintsById: { [BLUE.id]: BLUE, [THINNER.id]: THINNER },
    linesById: { [colorLine.id]: colorLine, [thinnerLine.id]: thinnerLine },
    settings: { ...DEFAULT_SETTINGS },
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
  });
}

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await clearHistory(store);
  resetState();
});

/** 走真实写入路径：原浆 → 稀释 → 入库，得到一条「稀释漆料」库存条目 */
async function seedDilutedStock(): Promise<{ neatStockId: string; dilutedStockId: string }> {
  const blue = await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
  const thinner = await createStockItem(store, { paint: THINNER, initialMl: 200, state: 'neat', groupId: null });
  if (!blue.ok || !thinner.ok) throw new Error('原浆入库失败');

  const diluted = await diluteIntoBatch(store, {
    neatMl: 10,
    targetRatioN: 2,
    sourceStockItemId: blue.data.item.id,
    thinnerStockItemId: thinner.data.item.id,
    paint: BLUE,
  });
  if (!diluted.ok) throw new Error(diluted.error);

  const stocked = await stockInBottle(store, { bottleId: diluted.data.bottle.id });
  if (!stocked.ok) throw new Error(stocked.error);

  await useAppStore.getState().refreshInventory();
  return { neatStockId: blue.data.item.id, dilutedStockId: stocked.data.item.id };
}

describe('2.1 平台流转：稀释漆料三边互通，原浆不上工作台', () => {
  it('稀释产物入库带 dilutionRatioN；openCoat 接受稀释漆料、拒绝原浆', async () => {
    const { neatStockId, dilutedStockId } = await seedDilutedStock();

    const stored = await store.stockItems.get(dilutedStockId);
    expect(stored?.state).toBe('thinned');
    expect(stored?.dilutionRatioN).toBe(2);
    expect(stored?.customName).toBe('钴蓝');
    expect(stored?.customHex).toBe('#2E5E9F');

    const workbench = await useAppStore.getState().newWorkbench({ name: '喷涂位' });
    expect(workbench.ok).toBe(true);
    if (!workbench.ok) return;

    const rejected = await openCoat(store, {
      workbenchId: workbench.data.id,
      refs: [{ refType: 'stock', refId: neatStockId }],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain('原浆只能在仓库与调漆台之间流转');

    const accepted = await openCoat(store, {
      workbenchId: workbench.data.id,
      refs: [{ refType: 'stock', refId: dilutedStockId }],
    });
    expect(accepted.ok).toBe(true);
  });
});

describe('2.1 工作台侧栏：从仓库调取稀释漆料', () => {
  it('侧栏列出 (1:2)稀释 钴蓝，点一下加入工作台，磁贴同样带比例牌', async () => {
    const { dilutedStockId } = await seedDilutedStock();
    const workbench = await useAppStore.getState().newWorkbench({ name: '侧栏台' });
    expect(workbench.ok).toBe(true);

    render(
      <MemoryRouter initialEntries={['/workbench']}>
        <WorkbenchPage />
      </MemoryRouter>,
    );
    await act(async () => {});

    const lane = document.querySelector('[data-workbench-panel="stock"]') as HTMLElement | null;
    expect(lane).not.toBeNull();
    if (!lane) return;
    expect(lane.textContent).toContain('从仓库调取');
    expect(lane.textContent).toContain('(1:2)稀释');
    expect(lane.textContent).toContain('钴蓝');

    const pick = lane.querySelector('[data-pick-stock="' + dilutedStockId + '"]') as HTMLButtonElement | null;
    expect(pick).not.toBeNull();
    if (!pick) return;
    expect(pick.disabled).toBe(false);

    fireEvent.click(pick);
    await waitFor(() => expect(useAppStore.getState().workbenchItems).toHaveLength(1));

    const tile = document.querySelector('[data-paint-tile]');
    expect(tile?.textContent).toContain('(1:2)稀释');
    expect(tile?.textContent).toContain('钴蓝');
    expect(tile?.textContent).toContain('C80');
    // 已在工作台内的条目在侧栏里变为禁用（不重复加入）
    const again = document.querySelector('[data-pick-stock="' + dilutedStockId + '"]') as HTMLButtonElement | null;
    await waitFor(() => expect(again?.disabled).toBe(true));
  });
});

describe('2.2 调漆台：稀释确认后自动入库（不再有批次动作）', () => {
  it('稀释 30 ml 后仓库直接出现 (1:2)稀释 钴蓝；没有使用 / 清空 / 入库键', async () => {
    const blue = await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
    const thinner = await createStockItem(store, { paint: THINNER, initialMl: 200, state: 'neat', groupId: null });
    if (!blue.ok || !thinner.ok) throw new Error('原浆入库失败');
    await useAppStore.getState().refreshInventory();

    await act(async () => {
      await useAppStore.getState().diluteBatch({
        neatMl: 10,
        targetRatioN: 2,
        sourceStockItemId: blue.data.item.id,
        thinnerStockItemId: thinner.data.item.id,
        paint: BLUE,
      });
    });

    const mixed = useAppStore.getState().stockItems.filter((item) => item.origin === 'mixed');
    expect(mixed).toHaveLength(1);
    expect(mixed[0].customName).toBe('钴蓝');
    expect(mixed[0].dilutionRatioN).toBe(2);
    expect(mixed[0].volumeMl).toBe(30);
    // 2.2 不再产生调漆台批次
    expect(useAppStore.getState().bottles).toHaveLength(0);

    render(
      <MemoryRouter initialEntries={['/mix']}>
        <MixPage />
      </MemoryRouter>,
    );
    await act(async () => {});

    const panel = document.querySelector('[data-mix-panel="stock"]') as HTMLElement | null;
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('(1:2)稀释');
    expect(panel?.textContent).toContain('钴蓝');

    expect(document.querySelector('[data-mix-panel="bottle"]')).toBeNull();
    expect(screen.queryByRole('button', { name: '使用' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull();
    expect(screen.queryByRole('button', { name: '入库' })).toBeNull();
    expect(document.querySelector('[data-dilution-swatch]')).toBeNull();
  });
});
