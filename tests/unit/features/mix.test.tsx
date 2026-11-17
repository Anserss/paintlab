import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Paint } from '@/core/model/types';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type { DepotStore } from '@/data/db';
import { createMemoryStore, setStore } from '@/data/db';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { MixPage } from '@/features/mix/MixPage';
import { useAppStore } from '@/store';

const BLUE: Paint = {
  id: 'gsi-c80',
  lineId: 'gsi-mr-color',
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const WHITE: Paint = {
  id: 'gsi-c1',
  lineId: 'gsi-mr-color',
  brandId: 'gsi',
  code: 'C1',
  name: 'White',
  nameZh: '白',
  hex: '#f2f2f2',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const THINNER: Paint = {
  id: 'gsi-t103',
  lineId: 'gsi-aux',
  brandId: 'gsi',
  code: 'T103',
  name: 'Mr.COLOR Thinner',
  nameZh: '郡士 标准稀释剂 250 ml',
  hex: '#ffffff',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'additive',
  origin: 'seed',
  volumeMl: 250,
};

let store: DepotStore;

const resetAppState = () => {
  useAppStore.setState({
    bottles: [],
    activeBottleId: null,
    stockItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: false,
    paintsById: { [BLUE.id]: BLUE, [WHITE.id]: WHITE, [THINNER.id]: THINNER },
    brands: [],
    toasts: [],
    selected: [],
    settings: { ...DEFAULT_SETTINGS },
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
  });
};

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await clearHistory(store);
  resetAppState();
});

interface Seeded {
  blueId: string;
  thinnerId: string;
  whiteId: string;
}

async function seedStocks(options: { blueMl?: number; thinnerMl?: number; whiteMl?: number } = {}): Promise<Seeded> {
  const blue = await createStockItem(store, {
    paint: BLUE,
    initialMl: options.blueMl ?? 60,
    state: 'neat',
    groupId: null,
  });
  if (!blue.ok) throw new Error(blue.error);
  const white = await createStockItem(store, {
    paint: WHITE,
    initialMl: options.whiteMl ?? 60,
    state: 'neat',
    groupId: null,
  });
  if (!white.ok) throw new Error(white.error);
  const thinner = await createStockItem(store, {
    paint: THINNER,
    initialMl: options.thinnerMl ?? 200,
    state: 'neat',
    groupId: null,
  });
  if (!thinner.ok) throw new Error(thinner.error);
  await useAppStore.getState().refreshInventory();
  return { blueId: blue.data.item.id, whiteId: white.data.item.id, thinnerId: thinner.data.item.id };
}

/** 仓库里的一条「已稀释漆料」 */
async function seedThinned(paint: Paint, volumeMl: number, ratioN: number): Promise<string> {
  const created = await createStockItem(store, {
    paint,
    initialMl: volumeMl,
    state: 'thinned',
    ratioN,
    groupId: null,
  });
  if (!created.ok) throw new Error(created.error);
  await useAppStore.getState().refreshInventory();
  return created.data.item.id;
}

const resultOf = (key: string): string =>
  (document.querySelector('[data-result="' + key + '"]')?.textContent ?? '').replace(' ml', '').trim();

async function waitForPage(): Promise<void> {
  await screen.findByText('取用漆料');
}

async function switchMode(label: '稀释' | '调漆'): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: label }));
}

describe('稀释模式（1:2 正算 / 反算，不再选瓶容量）', () => {
  it('A=10、N=2 → 稀释剂 20.0 / 合计 30.0，点「稀释」后产出一支 30 ml 批次', async () => {
    const seeded = await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);

    // 稀释模式没有瓶容量选择器（改版要求：删除选容量）
    expect(screen.queryByRole('group', { name: '瓶容量' })).toBeNull();

    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    expect(resultOf('neat')).toBe('10.0');
    expect(resultOf('thinner')).toBe('20.0');
    expect(resultOf('total')).toBe('30.0');

    const results = document.querySelector('[data-mix-results]') as HTMLElement;
    expect(within(results).getByText('稀释剂')).not.toBeNull();
    expect(results.textContent).toContain('20.0');

    fireEvent.click(screen.getByRole('button', { name: '稀释' }));

    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
    const bottle = useAppStore.getState().bottles[0];
    expect(bottle.remainingMl).toBe(30);
    expect(bottle.baselineMl).toBe(30);
    expect(bottle.capacityMl).toBe(30);
    expect(bottle.ratioN).toBe(2);
    expect(bottle.mode).toBe('dilute');

    // 原浆与稀释剂都被扣减
    const stocks = await store.stockItems.toArray();
    const blue = stocks.find((item) => item.paintId === BLUE.id);
    const thinner = stocks.find((item) => item.paintId === THINNER.id);
    expect(blue?.volumeMl).toBe(50);
    expect(thinner?.volumeMl).toBe(180);
  });

  it('按目标总量 V=30、N=2 → 原浆 10.0 / 稀释剂 20.0', async () => {
    await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    fireEvent.click(screen.getByLabelText('按目标总量'));
    fireEvent.change(screen.getByLabelText('目标总量 V'), { target: { value: '30' } });

    expect(resultOf('neat')).toBe('10.0');
    expect(resultOf('thinner')).toBe('20.0');
    expect(resultOf('total')).toBe('30.0');
  });

  it('比例超出 0–10 被钳制并提示', async () => {
    await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    fireEvent.change(screen.getByLabelText('比例 N'), { target: { value: '20' } });
    expect(screen.getByLabelText('比例 N')).toHaveValue('10.0');
    expect(document.body.textContent).toContain('比例超出 0–10');
  });

  it('比例预设按钮 1:1.5 生效', async () => {
    await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    fireEvent.click(screen.getByRole('button', { name: '1:1.5' }));
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    expect(resultOf('thinner')).toBe('15.0');
    expect(resultOf('total')).toBe('25.0');
  });
});

describe('稀释模式 · 已稀释漆料再稀释（按取用毫升数）', () => {
  it('取 10 ml（1:2）再稀释到 1:3 → 补加 3.3 ml，产物 13.3 ml', async () => {
    await seedStocks();
    const thinnedId = await seedThinned(BLUE, 30, 2);
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    fireEvent.click(document.querySelector('[data-stock-item="' + thinnedId + '"]') as Element);
    await waitFor(() => expect(document.body.textContent).toContain('当前比例 1:2'));

    fireEvent.change(screen.getByLabelText('取用已稀释漆料 M'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('比例 N'), { target: { value: '3' } });

    expect(resultOf('neat')).toBe('3.3');
    expect(resultOf('thinner')).toBe('3.3');
    expect(resultOf('total')).toBe('13.3');

    fireEvent.click(screen.getByRole('button', { name: '稀释' }));
    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
    expect(useAppStore.getState().bottles[0].remainingMl).toBe(13.3);

    const stocks = await store.stockItems.toArray();
    expect(stocks.find((item) => item.id === thinnedId)?.volumeMl).toBe(20);
    expect(stocks.find((item) => item.paintId === THINNER.id)?.volumeMl).toBe(196.7);
  });
});

describe('调漆模式（多组分按目标总容量分摊）', () => {
  it('勾选 2 支漆、目标 30 ml、份量各 10 → 各分摊 15 / 15，合计 30', async () => {
    await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    await switchMode('调漆');
    fireEvent.click(screen.getByRole('button', { name: '清空组分' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /C80/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /C1/ }));

    fireEvent.change(screen.getByLabelText('目标总容量 V'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('份量 C80'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('份量 C1'), { target: { value: '10' } });

    const parts = document.querySelectorAll('[data-part-ml]');
    expect(parts).toHaveLength(2);
    expect(resultOf('total')).toBe('30.0');

    fireEvent.click(screen.getByRole('button', { name: '调漆' }));
    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
    const bottle = useAppStore.getState().bottles[0];
    expect(bottle.mode).toBe('blend');
    expect(bottle.remainingMl).toBe(30);
    expect(bottle.components).toHaveLength(2);

    const stocks = await store.stockItems.toArray();
    expect(stocks.find((item) => item.paintId === BLUE.id)?.volumeMl).toBe(45);
    expect(stocks.find((item) => item.paintId === WHITE.id)?.volumeMl).toBe(45);
  });

  it('取消「按目标总容量」后按各组分 ml 直接累加，等效比例由原浆/稀释剂折算', async () => {
    const seeded = await seedStocks();
    const thinnedId = await seedThinned(WHITE, 40, 2);
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    await switchMode('调漆');
    fireEvent.click(screen.getByRole('button', { name: '清空组分' }));
    // 同色号可能有多条条目（原浆 + 已稀释），按条目 id 勾选
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.click(document.querySelector('[data-stock-item="' + thinnedId + '"]') as Element);

    fireEvent.click(screen.getByLabelText('按目标总容量分摊'));
    fireEvent.change(screen.getByLabelText('份量 C80'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('份量 C1'), { target: { value: '20' } });

    expect(resultOf('total')).toBe('30.0');
    expect(resultOf('neat')).toBe('16.7');
    expect(resultOf('thinner')).toBe('13.3');
    expect(resultOf('ratio')).toBe('1:0.8');
  });

  it('组分库存不足时给出可行动阻断，且不落库', async () => {
    await seedStocks({ blueMl: 5 });
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    await switchMode('调漆');
    fireEvent.click(screen.getByRole('checkbox', { name: /C80/ }));
    fireEvent.click(screen.getByLabelText('按目标总容量分摊'));
    fireEvent.change(screen.getByLabelText('份量 C80'), { target: { value: '20' } });

    await waitFor(() => expect(document.body.textContent).toContain('库存不足'));
    const commit = screen.getByRole('button', { name: '调漆' }) as HTMLButtonElement;
    expect(commit.disabled).toBe(true);
    fireEvent.click(commit);
    expect(useAppStore.getState().bottles).toHaveLength(0);
  });
});

describe('稀释剂缺失时的可行动提示（3.10）', () => {
  it('开启扣减但没有 aux 库存 → 拦下并给出「本次不扣减稀释剂」，点击后可继续', async () => {
    await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
    await useAppStore.getState().refreshInventory();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();

    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });

    await waitFor(() => expect(document.querySelector('[data-thinner-missing]')).not.toBeNull());
    expect(screen.getByRole('button', { name: '稀释' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '本次不扣减稀释剂' }));
    await waitFor(() => expect(useAppStore.getState().settings.trackThinner).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: '稀释' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: '稀释' }));
    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
    expect(useAppStore.getState().bottles[0].remainingMl).toBe(30);
  });
});

describe('批次的后续动作：使用 / 入库 / 开涂', () => {
  async function commitBatch(): Promise<void> {
    await seedStocks();
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释' }));
    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
  }

  it('使用 10 ml → remaining 20，baseline 不变', async () => {
    await commitBatch();
    fireEvent.change(screen.getByLabelText('使用量'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '使用' }));

    await waitFor(() => expect(useAppStore.getState().bottles[0].remainingMl).toBe(20));
    expect(useAppStore.getState().bottles[0].baselineMl).toBe(30);
  });

  it('入库：批次变成仓库里的一条已稀释漆料，批次消失', async () => {
    await commitBatch();
    fireEvent.click(screen.getByRole('button', { name: '入库' }));

    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(0));
    const stocks = await store.stockItems.toArray();
    const added = stocks.find((item) => item.origin === 'mixed');
    expect(added?.state).toBe('thinned');
    expect(added?.volumeMl).toBe(30);
    expect(added?.ratioN).toBe(2);
  });

  it('开涂：没有工作台时给出提示；有 1 个时直接加入', async () => {
    await commitBatch();
    fireEvent.click(screen.getByRole('button', { name: '开涂' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.some((toast) => toast.message.includes('还没有工作台'))).toBe(true),
    );

    const created = await useAppStore.getState().newWorkbench({ name: '喷涂位' });
    expect(created.ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '开涂' }));

    await waitFor(() => expect(useAppStore.getState().workbenchItems).toHaveLength(1));
    expect(useAppStore.getState().workbenchItems[0].refType).toBe('bottle');
  });
});

describe('空状态', () => {
  it('没有批次时显示「调漆台空」；没有任何库存时左栏给出空提示', async () => {
    render(<MemoryRouter><MixPage /></MemoryRouter>);
    await waitForPage();
    expect(document.body.textContent).toContain('调漆台空');
    expect(document.body.textContent).toContain('仓库里没有可用的漆料');
  });
});
