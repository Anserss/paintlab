import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type { DepotStore } from '@/data/db';
import { createMemoryStore, setStore } from '@/data/db';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { StationPage } from '@/features/station/StationPage';
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

const line: PaintLine = {
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

const paint: Paint = {
  id: 'p-c80',
  lineId: 'gs-mr-color',
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

let store: DepotStore;

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await clearHistory(store);
  useAppStore.setState({
    workstations: [],
    stationItems: [],
    stockItems: [],
    bottles: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    selected: [],
    toasts: [],
    brands: [brand],
    paintsById: { [paint.id]: paint },
    linesById: { [line.id]: line },
    settings: { ...DEFAULT_SETTINGS },
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
  });
  await useAppStore.getState().refreshStations();
  await useAppStore.getState().refreshInventory();
});

async function createStation(name: string) {
  const result = await useAppStore.getState().newWorkstation({ name });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** 往工位里放一件初始量为 initialMl、计划用量 plannedUseMl 的库存条目 */
async function seedStationItem(workstationId: string, initialMl: number, plannedUseMl: number) {
  const created = await createStockItem(store, { paint, initialMl, state: 'neat', groupId: null });
  if (!created.ok) throw new Error(created.error);
  await useAppStore.getState().refreshInventory();
  const added = await useAppStore.getState().addToStation({
    workstationId,
    refs: [{ refType: 'stock', refId: created.data.item.id }],
    plannedUseMl,
  });
  if (!added.ok) throw new Error(added.error);
  return { stockId: created.data.item.id, stationItemId: added.data.added[0].id };
}

/** 挂载后等待组件自身的数据刷新落地（避免 act 警告） */
async function renderPage() {
  const view = render(<StationPage />);
  await act(async () => {});
  return view;
}

function query<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error('找不到元素：' + selector);
  return element as T;
}

describe('AC-08 工位上限（spec 3.5 / 3.7.3）', () => {
  it('建满 5 个后「新建工位」为禁用态、title=最多 5 个工位，点击无副作用', async () => {
    for (let index = 1; index <= 5; index += 1) await createStation('工位' + index);
    const { container } = await renderPage();

    const button = container.querySelector('[data-action="new-station"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    if (!button) return;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('最多 5 个工位');
    expect(container.querySelectorAll('[data-station-tab]')).toHaveLength(5);
    expect(container.textContent).toContain('最多 5 个工位，请先删除或复用现有工位');

    fireEvent.click(button);
    await waitFor(() => expect(useAppStore.getState().workstations).toHaveLength(5));
    expect(document.querySelector('[data-dialog="station-form"]')).toBeNull();
  });

  it('未建满时可新建：第 6 个被数据层拒绝', async () => {
    for (let index = 1; index <= 5; index += 1) await createStation('台' + index);
    const sixth = await useAppStore.getState().newWorkstation({ name: '台6' });
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error).toContain('最多 5 个工位');
  });
});

describe('AC-09 放回仓库（spec 3.5 / 3.6）', () => {
  it('17.0 ml 条目、计划用量 5 ml：放回后条目移出、余量 12.0、生成 1 条 reason=return', async () => {
    const station = await createStation('喷笔台');
    const { stockId } = await seedStationItem(station.id, 17, 5);

    const { container } = await renderPage();
    const tile = container.querySelector('[data-paint-tile]');
    expect(tile).not.toBeNull();
    if (!tile) return;
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-selected')).toBe('true');

    await waitFor(() => expect(container.querySelector('[data-action="return-selected"]')).not.toBeNull());
    fireEvent.click(query('[data-action="return-selected"]'));

    await waitFor(() => expect(document.querySelector('[data-return-input]')).not.toBeNull());
    const input = query<HTMLInputElement>('[data-return-input]');
    expect(input.value).toBe('5');

    fireEvent.click(query('[data-action="confirm-return"]'));

    await waitFor(() => expect(useAppStore.getState().stationItems).toHaveLength(0));
    expect((await store.stockItems.get(stockId))?.volumeMl).toBe(12);

    const usage = await store.usageRecords.toArray();
    expect(usage).toHaveLength(1);
    expect(usage[0].reason).toBe('return');
    expect(usage[0].amountMl).toBe(5);
    expect(usage[0].targetId).toBe(stockId);

    const commands = await store.commands.toArray();
    expect(commands).toHaveLength(3);
    expect(commands[commands.length - 1].label).toContain('放回仓库');

    await waitFor(() => expect(container.textContent).toContain('工位待命'));
  });

  it('记录用量为 0 时需二次确认「仅移出、不扣减」', async () => {
    const station = await createStation('零用量台');
    const { stockId } = await seedStationItem(station.id, 17, 0);

    const { container } = await renderPage();
    fireEvent.click(container.querySelector('[data-paint-tile]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-action="return-selected"]')).not.toBeNull());
    fireEvent.click(query('[data-action="return-selected"]'));

    await waitFor(() => expect(document.querySelector('[data-return-input]')).not.toBeNull());
    expect(query<HTMLInputElement>('[data-return-input]').value).toBe('0');
    fireEvent.click(query('[data-action="confirm-return"]'));

    await waitFor(() => expect(document.querySelector('[data-dialog="return-zero"]')).not.toBeNull());
    expect(document.body.textContent).toContain('仅移出、不扣减');
    expect(useAppStore.getState().stationItems).toHaveLength(1);

    fireEvent.click(query('[data-action="confirm-zero"]'));
    await waitFor(() => expect(useAppStore.getState().stationItems).toHaveLength(0));
    expect((await store.stockItems.get(stockId))?.volumeMl).toBe(17);
    expect(await store.usageRecords.toArray()).toHaveLength(0);
  });
});

describe('空状态与统计（spec 3.10 / 3.5）', () => {
  it('空工位显示「工位待命」+「从仓库多选漆料，加入此工位。」', async () => {
    await createStation('空台');
    const { container } = await renderPage();
    expect(container.textContent).toContain('工位待命');
    expect(container.textContent).toContain('从仓库多选漆料，加入此工位。');
  });

  it('统计文案：条目 1 · 合计 17.0 ml · 预计可涂 6 个套件（估算）', async () => {
    const station = await createStation('统计台');
    await seedStationItem(station.id, 17, 5);
    const { container } = await renderPage();

    const stats = container.querySelector('[data-slot="station-stats"]')?.textContent ?? '';
    expect(stats).toContain('条目 1');
    expect(stats).toContain('合计 17.0 ml');
    expect(stats).toContain('预计可涂 6 个套件');
    expect(stats).toContain('估算');
  });

  it('一个工位都没有时显示 5 个虚线占位槽 + 可用的「新建工位」', async () => {
    const { container } = await renderPage();
    expect(container.querySelectorAll('[data-slot="station-placeholder"]')).toHaveLength(5);
    const button = query<HTMLButtonElement>('[data-action="new-station"]');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('title')).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(document.querySelector('[data-dialog="station-form"]')).not.toBeNull());
  });
});

describe('新建 / 改名 / 删除工位（spec 3.5）', () => {
  it('新建：名称 1–16 字、可选 6 个工业色之一、1 行备注', async () => {
    const { container } = await renderPage();
    fireEvent.click(query('[data-action="new-station"]'));
    await waitFor(() => expect(document.querySelector('[data-field="station-name"]')).not.toBeNull());

    fireEvent.change(query<HTMLInputElement>('[data-field="station-name"]'), { target: { value: '喷笔工位' } });
    fireEvent.change(query<HTMLInputElement>('[data-field="station-note"]'), {
      target: { value: '左侧 · 0.3 口径' },
    });

    const accents = Array.from(document.querySelectorAll('[data-accent]')) as HTMLElement[];
    expect(accents).toHaveLength(6);
    fireEvent.click(accents[2]);

    fireEvent.click(query('[data-action="submit-station"]'));
    await waitFor(() => expect(useAppStore.getState().workstations).toHaveLength(1));

    const station = useAppStore.getState().workstations[0];
    expect(station.name).toBe('喷笔工位');
    expect(station.note).toBe('左侧 · 0.3 口径');
    expect(station.accent).toBe(accents[2].getAttribute('data-accent'));
    await waitFor(() => expect(container.querySelector('[data-station-tab]')).not.toBeNull());
  });

  it('改名：名称 / 备注 / 颜色写回 store 与 Tab', async () => {
    await createStation('旧名');
    const { container } = await renderPage();
    fireEvent.click(query('[data-action="edit-station"]'));
    await waitFor(() => expect(document.querySelector('[data-field="station-name"]')).not.toBeNull());
    expect(query<HTMLInputElement>('[data-field="station-name"]').value).toBe('旧名');

    fireEvent.change(query<HTMLInputElement>('[data-field="station-name"]'), { target: { value: '新名' } });
    fireEvent.click(query('[data-action="submit-station"]'));

    await waitFor(() => expect(useAppStore.getState().workstations[0]?.name).toBe('新名'));
    await waitFor(() =>
      expect(container.querySelector('[data-station-tab]')?.textContent ?? '').toContain('新名'),
    );
  });

  it('全局不重名：重复名称时保存按钮禁用并给出提示', async () => {
    await createStation('旧工位');
    await renderPage();
    fireEvent.click(query('[data-action="new-station"]'));
    await waitFor(() => expect(document.querySelector('[data-field="station-name"]')).not.toBeNull());

    fireEvent.change(query<HTMLInputElement>('[data-field="station-name"]'), { target: { value: '旧工位' } });
    const submit = query<HTMLButtonElement>('[data-action="submit-station"]');
    expect(submit.disabled).toBe(true);
    expect(document.querySelector('[data-slot="station-form-error"]')?.textContent).toContain('已存在');
  });

  it('删除工位需二次确认，条目直接回到仓库且可撤销', async () => {
    const station = await createStation('待删工位');
    await seedStationItem(station.id, 17, 5);
    await renderPage();

    fireEvent.click(query('[data-action="delete-station"]'));
    await waitFor(() => expect(document.querySelector('[data-dialog="delete-station"]')).not.toBeNull());
    fireEvent.click(query('[data-action="confirm-delete-station"]'));

    await waitFor(() => expect(useAppStore.getState().workstations).toHaveLength(0));
    expect(useAppStore.getState().stationItems).toHaveLength(0);
    expect(await store.stockItems.toArray()).toHaveLength(1);

    await act(async () => {
      await useAppStore.getState().undo();
    });
    expect(await store.workstations.toArray()).toHaveLength(1);
    expect(await store.stationItems.toArray()).toHaveLength(1);
    await waitFor(() => expect(useAppStore.getState().workstations).toHaveLength(1));
    expect(useAppStore.getState().stationItems).toHaveLength(1);
  });
});

describe('批量操作（spec 3.5 / 3.10 拖拽矩阵的菜单路径）', () => {
  it('「移到工位 ▾」= moveInStation：选中条目批量转移', async () => {
    const stationA = await createStation('A 台');
    const stationB = await createStation('B 台');
    await seedStationItem(stationA.id, 10, 2);

    const { container } = await renderPage();
    fireEvent.click(container.querySelector('[data-paint-tile]') as HTMLElement);
    fireEvent.click(query('[data-action="move-menu"]'));

    const target = container.querySelector('[data-move-target="' + stationB.id + '"]') as HTMLButtonElement | null;
    expect(target).not.toBeNull();
    if (!target) return;
    fireEvent.click(target);

    await waitFor(() =>
      expect(useAppStore.getState().stationItems[0]?.workstationId).toBe(stationB.id),
    );
    expect(useAppStore.getState().stationItems).toHaveLength(1);
    await waitFor(() => expect(container.textContent).toContain('工位待命'));
  });

  it('「移出工位」只解除归属、不扣减余量', async () => {
    const station = await createStation('移出台');
    const { stockId } = await seedStationItem(station.id, 17, 5);

    const { container } = await renderPage();
    fireEvent.click(container.querySelector('[data-paint-tile]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-action="remove-selected"]')).not.toBeNull());
    fireEvent.click(query('[data-action="remove-selected"]'));

    await waitFor(() => expect(useAppStore.getState().stationItems).toHaveLength(0));
    expect((await store.stockItems.get(stockId))?.volumeMl).toBe(17);
    expect(await store.usageRecords.toArray()).toHaveLength(0);
  });

  it('用量面板：默认 min(2, 剩余)、预设 1/2/5/10 与滑块写入 changePlannedUse', async () => {
    const station = await createStation('用量台');
    await seedStationItem(station.id, 17, 0);

    const { container } = await renderPage();
    fireEvent.click(container.querySelector('[data-paint-tile]') as HTMLElement);

    await waitFor(() => expect(container.querySelector('[data-panel="usage"]')).not.toBeNull());
    expect(container.textContent).toContain('大概用量即可，用于估算剩余');

    const slider = query<HTMLInputElement>('[data-field="planned-slider"]');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('20');
    expect(slider.step).toBe('0.5');
    expect(slider.value).toBe('2');

    fireEvent.click(query('[data-preset="5"]'));
    await waitFor(() => expect(useAppStore.getState().stationItems[0]?.plannedUseMl).toBe(5));

    fireEvent.change(query<HTMLInputElement>('[data-field="planned-input"]'), { target: { value: '7.5' } });
    await waitFor(() => expect(useAppStore.getState().stationItems[0]?.plannedUseMl).toBe(7.5));
  });
});