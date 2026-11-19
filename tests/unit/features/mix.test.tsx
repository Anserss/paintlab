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
    lowVolumeAlert: null,
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

/** 调漆是多选：先清掉当前勾选，再精确勾选目标条目（切换模式时默认会保留一支） */
function setBlendSelection(ids: string[]): void {
  for (const element of Array.from(document.querySelectorAll('[data-stock-item][aria-checked="true"]'))) {
    fireEvent.click(element);
  }
  for (const id of ids) {
    const element = document.querySelector('[data-stock-item="' + id + '"]');
    if (!element) throw new Error('missing stock row ' + id);
    fireEvent.click(element);
  }
}

const mixedItems = () => useAppStore.getState().stockItems.filter((item) => item.origin === 'mixed');

describe('稀释模式：确认后自动扣减 + 自动入库', () => {
  it('A=10、N=2 → 稀释剂 20.0 / 合计 30.0；点「稀释并入库」后库存直接多一条 30 ml 稀释漆料', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);

    // 2.2 不再有瓶容量、使用、清空、入库这些批次动作
    expect(screen.queryByRole('group', { name: '瓶容量' })).toBeNull();
    expect(screen.queryByRole('button', { name: '使用' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空' })).toBeNull();
    expect(screen.queryByRole('button', { name: '入库' })).toBeNull();
    expect(document.querySelector('[data-mix-panel="bottle"]')).toBeNull();

    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    expect(resultOf('neat')).toBe('10.0');
    expect(resultOf('thinner')).toBe('20.0');
    expect(resultOf('total')).toBe('30.0');

    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));

    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    const item = mixedItems()[0];
    expect(item.volumeMl).toBe(30);
    expect(item.initialMl).toBe(30);
    expect(item.state).toBe('thinned');
    expect(item.ratioN).toBe(2);
    expect(item.dilutionRatioN).toBe(2);
    expect(item.customName).toBe('钴蓝');
    expect(item.parts).toHaveLength(2);
    expect(useAppStore.getState().bottles).toHaveLength(0);

    // 原浆与稀释剂都被扣减
    const stocks = await store.stockItems.toArray();
    expect(stocks.find((row) => row.id === seeded.blueId)?.volumeMl).toBe(50);
    expect(stocks.find((row) => row.id === seeded.thinnerId)?.volumeMl).toBe(180);

    // 配方条与最近配方都出现
    await waitFor(() => expect(document.querySelector('[data-recipe-preview]')?.textContent).toContain('钴蓝'));
    expect(document.querySelector('[data-mix-panel="recents"]')?.textContent).toContain('稀释 30.0 ml');
  });

  it('同配方第二次稀释自动合并为一个瓶（initial 与 volume 一起累加）', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));

    // 再稀释一次同样的配方
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));
    await waitFor(() => expect(mixedItems()[0]?.volumeMl).toBe(60));

    const items = mixedItems();
    expect(items).toHaveLength(1);
    expect(items[0].initialMl).toBe(60);
    expect(items[0].parts?.find((part) => !part.aux)?.ml).toBe(20);
    expect(document.body.textContent).toContain('已并入同配方瓶');
  });

  it('按目标总量 V=30、N=2 → 原浆 10.0 / 稀释剂 20.0', async () => {
    await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    fireEvent.click(screen.getByLabelText('按目标总量'));
    fireEvent.change(screen.getByLabelText('目标总量 V'), { target: { value: '30' } });

    expect(resultOf('neat')).toBe('10.0');
    expect(resultOf('thinner')).toBe('20.0');
    expect(resultOf('total')).toBe('30.0');
  });

  it('比例超出 0–10 被钳制并提示', async () => {
    await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    fireEvent.change(screen.getByLabelText('比例 N'), { target: { value: '20' } });
    expect(screen.getByLabelText('比例 N')).toHaveValue('10.0');
    expect(document.body.textContent).toContain('比例超出 0–10');
  });

  it('比例预设按钮 1:1.5 生效', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);

    fireEvent.click(screen.getByRole('button', { name: '1:1.5' }));
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    expect(resultOf('thinner')).toBe('15.0');
    expect(resultOf('total')).toBe('25.0');
  });
});

describe('稀释模式 · 已稀释漆料再稀释（按取用毫升数）', () => {
  it('取 10 ml（1:2）再稀释到 1:3 → 补加 3.3 ml，产物自动入库 13.3 ml', async () => {
    await seedStocks();
    const thinnedId = await seedThinned(BLUE, 30, 2);
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    fireEvent.click(document.querySelector('[data-stock-item="' + thinnedId + '"]') as Element);
    await waitFor(() => expect(document.body.textContent).toContain('当前比例 1:2'));

    fireEvent.change(screen.getByLabelText('取用已稀释漆料 M'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('比例 N'), { target: { value: '3' } });

    expect(resultOf('neat')).toBe('3.3');
    expect(resultOf('thinner')).toBe('3.3');
    expect(resultOf('total')).toBe('13.3');

    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    expect(mixedItems()[0].volumeMl).toBe(13.3);
    expect(mixedItems()[0].ratioN).toBe(3);

    const stocks = await store.stockItems.toArray();
    expect(stocks.find((item) => item.id === thinnedId)?.volumeMl).toBe(20);
    expect(stocks.find((item) => item.paintId === THINNER.id)?.volumeMl).toBe(196.7);
  });
});

describe('调漆模式 · 两种算法', () => {
  it('按总量 ÷ 配比：2 组分各 1 份、目标 30 → 各 15，确认后产物 30 ml 入库', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    await switchMode('调漆');
    setBlendSelection([seeded.blueId, seeded.whiteId]);

    fireEvent.change(screen.getByLabelText('目标总容量 V'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('配比 C80'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('配比 C1'), { target: { value: '1' } });

    expect(document.querySelectorAll('[data-part-ml]')).toHaveLength(2);
    expect(resultOf('total')).toBe('30.0');

    fireEvent.click(screen.getByRole('button', { name: '调漆并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    const item = mixedItems()[0];
    expect(item.volumeMl).toBe(30);
    expect(item.parts).toHaveLength(2);
    expect(item.customName).toBe('调漆1');

    const stocks = await store.stockItems.toArray();
    expect(stocks.find((row) => row.id === seeded.blueId)?.volumeMl).toBe(45);
    expect(stocks.find((row) => row.id === seeded.whiteId)?.volumeMl).toBe(45);
  });

  it('产物名称可自定义：填 JW020 就按 JW020 入库；留空才用「调漆N」', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    await switchMode('调漆');
    setBlendSelection([seeded.blueId, seeded.whiteId]);
    fireEvent.change(screen.getByLabelText('目标总容量 V'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('产物名称'), { target: { value: 'JW020' } });

    expect(document.querySelector('[data-mix-name]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '调漆并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    expect(mixedItems()[0].customName).toBe('JW020');

    // 换一个配方、清空名称 → 默认「调漆1」（自定义名不消耗序号）
    fireEvent.change(screen.getByLabelText('产物名称'), { target: { value: '' } });
    setBlendSelection([seeded.blueId, seeded.whiteId]);
    fireEvent.change(screen.getByLabelText('目标总容量 V'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('配比 C80'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('配比 C1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '调漆并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(2));
    expect(mixedItems().some((item) => item.customName === '调漆1')).toBe(true);
  });

  it('按各组分用量：10 + 20 → 合计 30、原浆 16.7 / 稀释剂 13.3、等效 1:0.8', async () => {
    const seeded = await seedStocks();
    const thinnedId = await seedThinned(WHITE, 40, 2);
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    await switchMode('调漆');
    fireEvent.click(screen.getByLabelText('按各组分用量'));
    setBlendSelection([seeded.blueId, thinnedId]);

    fireEvent.change(screen.getByLabelText('用量 C80'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('用量 C1'), { target: { value: '20' } });

    expect(resultOf('total')).toBe('30.0');
    expect(resultOf('neat')).toBe('16.7');
    expect(resultOf('thinner')).toBe('13.3');
    expect(resultOf('ratio')).toBe('1:0.8');

    fireEvent.click(screen.getByRole('button', { name: '调漆并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    expect(mixedItems()[0].volumeMl).toBe(30);
    const stocks = await store.stockItems.toArray();
    expect(stocks.find((row) => row.id === seeded.blueId)?.volumeMl).toBe(50);
    expect(stocks.find((row) => row.id === thinnedId)?.volumeMl).toBe(20);
  });

  it('组分库存不足时给出可行动阻断，且不落库', async () => {
    await seedStocks({ blueMl: 5 });
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    await switchMode('调漆');
    setBlendSelection([]);
    fireEvent.click(screen.getByRole('checkbox', { name: /C80/ }));
    fireEvent.change(screen.getByLabelText('目标总容量 V'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('配比 C80'), { target: { value: '1' } });

    await waitFor(() => expect(document.body.textContent).toContain('库存不足'));
    const commit = screen.getByRole('button', { name: '调漆并入库' }) as HTMLButtonElement;
    expect(commit.disabled).toBe(true);
    expect(mixedItems()).toHaveLength(0);
  });

  it('组分支持选择已调漆产物并参与同配方判定', async () => {
    const seeded = await seedStocks();
    const pre = await createStockItem(store, {
      paint: BLUE,
      initialMl: 40,
      state: 'thinned',
      ratioN: 2,
      groupId: null,
    });
    if (!pre.ok) throw new Error(pre.error);
    await store.stockItems.put({
      ...pre.data.item,
      customName: '旧调漆',
      customHex: '#336699',
      mixKey: 'f:test-mixed',
    });
    await useAppStore.getState().refreshInventory();

    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    await switchMode('调漆');
    setBlendSelection([pre.data.item.id, seeded.whiteId]);
    fireEvent.click(screen.getByLabelText('按各组分用量'));
    fireEvent.change(screen.getByLabelText('用量 C80'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('用量 C1'), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: '调漆并入库' }));
    await waitFor(async () => {
      const rows = await store.stockItems.toArray();
      expect(rows.some((item) => item.customName?.startsWith('调漆'))).toBe(true);
    });
    // 旧调漆产物作为组分被扣减 10 ml
    await waitFor(async () => {
      expect((await store.stockItems.get(pre.data.item.id))?.volumeMl).toBe(30);
    });
  });
});

describe('稀释剂缺失时的可行动提示（3.10）', () => {
  it('开启扣减但没有 aux 库存 → 拦下并给出「本次不扣减稀释剂」，点击后可继续', async () => {
    const blue = await createStockItem(store, { paint: BLUE, initialMl: 60, state: 'neat', groupId: null });
    if (!blue.ok) throw new Error(blue.error);
    await useAppStore.getState().refreshInventory();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();

    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });

    await waitFor(() => expect(document.querySelector('[data-thinner-missing]')).not.toBeNull());
    expect(screen.getByRole('button', { name: '稀释并入库' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '本次不扣减稀释剂' }));
    await waitFor(() => expect(useAppStore.getState().settings.trackThinner).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: '稀释并入库' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));
    expect(mixedItems()[0].volumeMl).toBe(30);
  });
});

describe('2.2 产出后一键开涂', () => {
  it('没有工作台时提示；有 1 个时把刚入库的库存条目加进工作台', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));
    await waitFor(() => expect(mixedItems()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: '开涂' }));
    await waitFor(() =>
      expect(useAppStore.getState().toasts.some((toast) => toast.message.includes('还没有工作台'))).toBe(true),
    );

    const created = await useAppStore.getState().newWorkbench({ name: '喷涂位' });
    expect(created.ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '开涂' }));
    await waitFor(() => expect(useAppStore.getState().workbenchItems).toHaveLength(1));
    expect(useAppStore.getState().workbenchItems[0].refType).toBe('stock');
    expect(useAppStore.getState().workbenchItems[0].refId).toBe(mixedItems()[0].id);
  });
});

describe('2.2 容量偏低：小牌与弹窗', () => {
  it('稀释后原浆只剩 10/60 → 弹窗列出该条目，名称栏出现红底白字「容量偏低」', async () => {
    const seeded = await seedStocks();
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));

    await waitFor(() => expect(useAppStore.getState().lowVolumeAlert).not.toBeNull());
    expect(useAppStore.getState().lowVolumeAlert?.some((row) => row.itemId === seeded.blueId)).toBe(true);

    const row = document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as HTMLElement | null;
    expect(row).not.toBeNull();
    expect(row?.querySelector('[data-low-volume-tag]')?.textContent).toBe('容量偏低');
    expect(row?.getAttribute('data-low-volume')).toBe('');
  });

  it('组分被完全用完（余量 0）时直接从仓库删除', async () => {
    const seeded = await seedStocks({ blueMl: 10 });
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    fireEvent.click(document.querySelector('[data-stock-item="' + seeded.blueId + '"]') as Element);
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '稀释并入库' }));

    await waitFor(() => expect(useAppStore.getState().stockItems.some((item) => item.id === seeded.blueId)).toBe(false));
    const stocks = await store.stockItems.toArray();
    expect(stocks.some((item) => item.id === seeded.blueId)).toBe(false);
  });
});

describe('空状态', () => {
  it('没有任何库存时左栏给出空提示；页头提示自动入库与同配方合并', async () => {
    render(
      <MemoryRouter>
        <MixPage />
      </MemoryRouter>,
    );
    await waitForPage();
    expect(document.body.textContent).toContain('仓库里没有可用的漆料');
    expect(document.body.textContent).toContain('同配方合并');
    expect(document.querySelector('[data-auto-stock-in]')).not.toBeNull();
  });
});
