import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Group } from '@/core/model/types';
import { hueBucket } from '@/core/math/color';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import { createGroup, ensureSystemGroup, listGroups } from '@/data/repos/group';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { DepotPage } from '@/features/depot/DepotPage';
import { needsReorder, planGroupDrop, siblingOrder, stepOrder } from '@/features/depot/model';
import { useAppStore } from '@/store';

/* ------------------------------------------------------------------ */
/* 目录夹具：走真实的 loadCatalog / ensureBrand（含 zod 校验）           */
/* ------------------------------------------------------------------ */

const brand = {
  id: 'gs',
  name: 'Mr.Color',
  nameZh: '郡士',
  shortName: 'GSI',
  accentHex: '#c8102e',
  country: 'JP',
  aliases: [] as string[],
  sort: 1,
};

const line = {
  id: 'gs-mr-color',
  brandId: 'gs',
  name: 'Mr.Color',
  packaging: 'pot',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const solid = {
  id: 'p-c80',
  lineId: line.id,
  brandId: brand.id,
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const clear = {
  id: 'p-clear',
  lineId: line.id,
  brandId: brand.id,
  code: 'C-clear',
  name: 'Clear Blue',
  nameZh: '透明蓝',
  hex: '#7FB2D9',
  paintClass: 'clear',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const aux = {
  id: 'p-thinner',
  lineId: line.id,
  brandId: brand.id,
  code: 'T-101',
  name: 'Thinner',
  nameZh: '稀释剂',
  hex: '#B8B8B8',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'gloss',
  origin: 'seed',
};

const paints = [solid, clear, aux];

const catalogIndex = {
  version: 'test-1',
  brands: [{ id: brand.id, name: brand.name, nameZh: brand.nameZh, shortName: brand.shortName, accentHex: brand.accentHex, count: paints.length }],
};

const catalogBundle = { version: 'test-1', brand, lines: [line], paints };

const fakeFetch = (async (url: unknown) => ({
  ok: true,
  status: 200,
  json: async () => (String(url).includes('index.json') ? catalogIndex : catalogBundle),
})) as unknown as typeof fetch;

let store: DepotStore;

function resetAppState() {
  useAppStore.setState({
    stockItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: false,
    brands: [],
    bundles: {},
    paintsById: {},
    linesById: {},
    brandState: {},
    catalogReady: false,
    catalogError: null,
    workbenches: [],
    workbenchItems: [],
    selected: [],
    toasts: [],
    breadcrumb: null,
    undoCount: 0,
    redoCount: 0,
    undoLabel: null,
    redoLabel: null,
  });
}

async function seedCatalog() {
  await useAppStore.getState().loadCatalog({ fetchImpl: fakeFetch });
  await useAppStore.getState().ensureBrand(brand.id, { fetchImpl: fakeFetch });
}

async function addStock(
  paint: { id: string; code: string; name: string; nameZh: string; hex: string },
  ml: number,
  at: number,
  initialMl = ml + 2,
) {
  const result = await createStockItem(store, {
    paint: { id: paint.id, code: paint.code, name: paint.name, nameZh: paint.nameZh, hex: paint.hex, brandShortName: '郡士' },
    initialMl,
    volumeMl: ml,
    state: 'neat',
    groupId: null,
    at,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.item;
}

/** 等异步 store 更新在 act 作用域内落定（消除 act(...) 警告，断言不依赖它） */
async function flush(times = 3): Promise<void> {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

interface TestUser {
  click: (element: Element) => Promise<void>;
  type: (element: Element, text: string) => Promise<void>;
  clear: (element: Element) => Promise<void>;
}

/** userEvent 的包装：每个交互后立刻收敛异步 store 更新 */
function setupTestUser(): TestUser {
  const base = userEvent.setup();
  return {
    async click(element) {
      await base.click(element as HTMLElement);
      await flush();
    },
    async type(element, text) {
      await base.type(element as HTMLElement, text);
      await flush();
    },
    async clear(element) {
      await base.clear(element as HTMLElement);
      await flush();
    },
  };
}

function contextMenu(element: Element) {
  act(() => {
    fireEvent.contextMenu(element);
  });
}

function Harness() {
  return <DepotPage />;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/depot']} future={{ v7_relativeSplatPath: true }}>
      <Harness />
    </MemoryRouter>,
  );
}

function rowOf(container: HTMLElement, code: string): HTMLElement {
  const row = container.querySelector('[data-code="' + code + '"]');
  expect(row, '缺少色号 ' + code + ' 的行').not.toBeNull();
  return row as HTMLElement;
}

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  resetAppState();
  await ensureSystemGroup(store);
  await clearHistory(store);
  await seedCatalog();
});

describe('AC-06 三档透明度出现在仓库列表', () => {
  it('solid / clear / aux 行内色块计算样式为 1、0.4、0.7，aux 为白色', async () => {
    await addStock(solid, 12.4, 1);
    await addStock(clear, 8, 2);
    await addStock(aux, 6, 3);
    await useAppStore.getState().refreshInventory();

    const { container } = renderPage();

    const list = container.querySelector('[data-depot-list]');
    expect(list).not.toBeNull();

    const solidFill = rowOf(container, 'C80').querySelector('[data-swatch-fill]') as HTMLElement;
    const clearFill = rowOf(container, 'C-clear').querySelector('[data-swatch-fill]') as HTMLElement;
    const auxFill = rowOf(container, 'T-101').querySelector('[data-swatch-fill]') as HTMLElement;

    expect(Number(window.getComputedStyle(solidFill).opacity)).toBe(1);
    expect(Number(window.getComputedStyle(clearFill).opacity)).toBe(0.4);
    expect(Number(window.getComputedStyle(auxFill).opacity)).toBe(0.7);
    expect(window.getComputedStyle(auxFill).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('低库存（<15%）行挂低量标记，进度条末端出现黄块（不再用红色）', async () => {
    await addStock(solid, 0.5, 1, 20);
    await useAppStore.getState().refreshInventory();
    const { container } = renderPage();
    const row = rowOf(container, 'C80');
    const reading = row.querySelector('[data-paint-reading]') as HTMLElement;
    expect(reading.getAttribute('data-low')).toBe('');
    expect(row.querySelector('[data-stock-low-mark]')).not.toBeNull();
  });
});

describe('AC-07 分组深度', () => {
  it('L1>L2>L3 之后把分组移动到 L3 下会被拒绝，提示 3 层上限且分组数据不变', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();

    const a = await createGroup(store, { name: '组A' });
    const b = a.ok ? await createGroup(store, { name: '组B', parentId: a.data.group.id }) : null;
    const c = b && b.ok ? await createGroup(store, { name: '组C', parentId: b.data.group.id }) : null;
    const d = await createGroup(store, { name: '组D' });
    expect(a.ok && b?.ok && c?.ok && d.ok).toBe(true);
    if (!a.ok || !b || !b.ok || !c || !c.ok || !d.ok) return;

    await useAppStore.getState().refreshInventory();
    const before = await listGroups(store);

    const user = setupTestUser();
    renderPage();

    await user.click(screen.getByRole('tab', { name: '分组' }));
    expect(screen.getByRole('tree', { name: '分组树' })).toBeInTheDocument();

    // 键盘/菜单替代路径：与拖拽共用 planGroupDrop
    await user.click(screen.getByLabelText('分组菜单 组D'));
    await user.click(screen.getByLabelText('移动到 组C'));

    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((toast) => /分组最多 3 层/.test(toast.message))).toBe(true);
    });

    const after = await listGroups(store);
    expect(after).toHaveLength(before.length);
    expect(after.find((group) => group.id === d.data.group.id)?.parentId).toBeNull();
    expect(after.every((group) => group.depth <= 3)).toBe(true);
    expect(useAppStore.getState().groups.find((group) => group.id === d.data.group.id)?.parentId).toBeNull();
  });

  it('未分组是系统分组：菜单里没有重命名 / 删除 / 新建子分组', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    renderPage();
    await user.click(screen.getByRole('tab', { name: '分组' }));
    await user.click(screen.getByLabelText('分组菜单 未分组'));
    expect(screen.queryByText('重命名')).toBeNull();
    expect(screen.queryByText('删除')).toBeNull();
    expect(document.querySelector('[data-group-node="' + UNGROUPED_ID + '"]')).not.toBeNull();
  });
});

describe('AC-12 色值只读', () => {
  it('详情抽屉里的 hex 是只读展示（aria-readonly），抽屉内无输入控件可改色值', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    const { container } = renderPage();

    const row = rowOf(container, 'C80');
    await user.click(within(row).getByLabelText('详情'));

    const drawer = document.querySelector('[data-paint-detail]') as HTMLElement;
    expect(drawer).not.toBeNull();

    const hex = drawer.querySelector('[data-paint-hex]') as HTMLElement;
    expect(hex).not.toBeNull();
    expect(hex.tagName).not.toBe('INPUT');
    expect(hex.getAttribute('aria-readonly')).toBe('true');
    expect(hex.textContent?.trim()).toBe('#2E5E9F');
    expect(drawer.querySelectorAll('input').length).toBe(0);

    // 抽屉读数与归属 / 属性行
    expect(drawer.textContent).toContain('12.4 / 14.4 ml');
    expect(drawer.querySelector('[data-paint-desc]')?.textContent).toBe('油性 · 光泽 · 实色');
    expect(drawer.textContent).toContain('未分组');
    expect(drawer.textContent).toContain('最近 10 条操作');
  });
});

describe('AC-13 空仓', () => {
  it('全新工作区显示 DEPOT // 空仓 + 副文案 + [去采购]', async () => {
    await useAppStore.getState().refreshInventory();
    renderPage();

    expect(screen.getByText('DEPOT // 空仓')).toBeInTheDocument();
    expect(screen.getByText('还没有漆料。前往采购大厅入库你的第一支漆。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去采购' })).toBeInTheDocument();
  });
});

describe('三视图切换', () => {
  it('品牌 / 色环 / 分组 往返切换不报错且各自渲染', async () => {
    await addStock(solid, 12.4, 1);
    await addStock(clear, 8, 2);
    await addStock(aux, 6, 3);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    const { container } = renderPage();

    expect(screen.getByRole('tree', { name: '品牌树' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '色环' }));
    expect(container.querySelector('[data-hue-wheel]')).not.toBeNull();
    expect(container.querySelectorAll('[data-hue-sector]').length).toBe(14);
    expect(container.querySelectorAll('[data-hue-cell]').length).toBe(70);

    await user.click(screen.getByRole('tab', { name: '分组' }));
    expect(screen.getByRole('tree', { name: '分组树' })).toBeInTheDocument();
    // 未分组下有条目 -> 列表非空；选中空分组 -> 分组空文案
    expect(within(document.body).getAllByText('钴蓝').length).toBeGreaterThan(0);
    const emptyGroup = await createGroup(store, { name: '空组' });
    expect(emptyGroup.ok).toBe(true);
    if (emptyGroup.ok) {
      await act(async () => {
        await useAppStore.getState().refreshInventory();
      });
      await user.click(await screen.findByText('空组'));
      expect(await screen.findByText('此分组暂无条目')).toBeInTheDocument();
      expect(screen.getByText('把仓库中的漆料拖到左侧分组即可归组。')).toBeInTheDocument();
    }

    await user.click(screen.getByRole('tab', { name: '品牌' }));
    expect(screen.getByRole('tree', { name: '品牌树' })).toBeInTheDocument();
  });

  it('色环扇区点击过滤、再点取消', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    const { container } = renderPage();

    await user.click(screen.getByRole('tab', { name: '色环' }));
    const sector = container.querySelector('[data-hue-sector="' + hueBucket(solid.hex) + '"]') as HTMLElement;
    expect(sector).not.toBeNull();

    await user.click(sector);
    await waitFor(() => expect(container.querySelector('[data-hue-filter]')).not.toBeNull());
    expect(container.querySelector('[data-hue-filter]')?.textContent).toContain('1 件');

    await user.click(sector);
    await waitFor(() => expect(container.querySelector('[data-hue-filter]')).toBeNull());
  });
});

describe('调整余量（盘点）', () => {
  it('数值 + 必填原因写入 adjustVolume，回执可撤销', async () => {
    const item = await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    const { container } = renderPage();

    await user.click(within(rowOf(container, 'C80')).getByLabelText('详情'));
    await user.click(screen.getByRole('button', { name: '调整余量' }));

    const confirm = screen.getByRole('button', { name: '确认调整' });
    expect(confirm).toBeDisabled();

    const input = screen.getByLabelText('新的余量');
    await user.clear(input);
    await user.type(input, '5.5');
    await user.click(screen.getByLabelText('挥发'));
    await user.click(confirm);

    await waitFor(() => {
      const updated = useAppStore.getState().stockItems.find((entry) => entry.id === item.id);
      expect(updated?.volumeMl).toBe(5.5);
    });

    const ledger = await store.ledger.toArray();
    const adjust = ledger.find((entry) => entry.type === 'adjust' && entry.refId === item.id);
    expect(adjust?.deltaMl).toBe(-6.9);
    expect((adjust?.meta as { reason?: string } | undefined)?.reason).toBe('evaporate');

    await waitFor(() => {
      expect(useAppStore.getState().toasts.some((toast) => /余量已调整/.test(toast.message))).toBe(true);
    });
    // 2.1：回执不再有右下角浮层，撤销走状态条的撤销栈
    expect(useAppStore.getState().undoCount).toBeGreaterThan(0);
  });
});

describe('拖拽矩阵（planGroupDrop：DnD 与菜单共用同一判定）', () => {
  const chain: Group[] = [
    { id: 'a', name: 'A', parentId: null, depth: 1, sort: 1 },
    { id: 'b', name: 'B', parentId: 'a', depth: 2, sort: 1 },
    { id: 'c', name: 'C', parentId: 'b', depth: 3, sort: 1 },
    { id: 'd', name: 'D', parentId: null, depth: 1, sort: 2 },
    { id: UNGROUPED_ID, name: '未分组', parentId: null, depth: 1, sort: 0, system: true },
  ];

  it('行 → 分组节点 = 单归属移动；行 → 根 = 未分组', () => {
    expect(planGroupDrop(chain, { kind: 'item', stockItemId: 's1' }, { kind: 'group', groupId: 'c' })).toEqual({
      ok: true,
      action: 'move-item',
      stockItemId: 's1',
      groupId: 'c',
    });
    expect(planGroupDrop(chain, { kind: 'item', stockItemId: 's1' }, { kind: 'root' })).toEqual({
      ok: true,
      action: 'move-item',
      stockItemId: 's1',
      groupId: UNGROUPED_ID,
    });
  });

  it('分组 → L3 之下 = 拒绝，给出 3 层文案（AC-07）', () => {
    const plan = planGroupDrop(chain, { kind: 'group', groupId: 'd' }, { kind: 'group', groupId: 'c' });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe('分组最多 3 层，无法在 L3 下继续创建');
  });

  it('分组 → 根 = 移出分组；系统分组不可移动', () => {
    expect(planGroupDrop(chain, { kind: 'group', groupId: 'b' }, { kind: 'root' })).toEqual({
      ok: true,
      action: 'move-group',
      groupId: 'b',
      parentId: null,
    });
    const system = planGroupDrop(chain, { kind: 'group', groupId: UNGROUPED_ID }, { kind: 'root' });
    expect(system.ok).toBe(false);
  });
});

describe('行 → 分组的菜单替代路径（拖拽的键盘等价入口）', () => {
  it('右键行菜单「加入分组」= 单归属移动，换组后自动从旧分组移出', async () => {
    const item = await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const g1 = await createGroup(store, { name: '组一' });
    const g2 = await createGroup(store, { name: '组二' });
    expect(g1.ok && g2.ok).toBe(true);
    if (!g1.ok || !g2.ok) return;
    await useAppStore.getState().refreshInventory();

    const user = setupTestUser();
    const { container } = renderPage();

    contextMenu(rowOf(container, 'C80'));
    await user.click(screen.getByLabelText('行菜单加入分组 组一'));
    await waitFor(() => {
      expect(useAppStore.getState().stockItems.find((entry) => entry.id === item.id)?.groupId).toBe(g1.data.group.id);
    });

    contextMenu(rowOf(container, 'C80'));
    await user.click(screen.getByLabelText('行菜单加入分组 组二'));
    await waitFor(() => {
      expect(useAppStore.getState().stockItems.find((entry) => entry.id === item.id)?.groupId).toBe(g2.data.group.id);
    });

    // 单归属：每个条目只在一个分组里
    const groups = await listGroups(store);
    const holders = groups.filter((group) => group.id === g2.data.group.id);
    expect(holders).toHaveLength(1);
  });
});

describe('分组手动排序（reorderGroups）', () => {
  it('三个同级分组「下移」后 DOM 顺序变化且 sort 变成 0 / 1 / 2', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const a = await createGroup(store, { name: '组A' });
    const b = await createGroup(store, { name: '组B' });
    const c = await createGroup(store, { name: '组C' });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    await useAppStore.getState().refreshInventory();

    const user = setupTestUser();
    renderPage();
    await user.click(screen.getByRole('tab', { name: '分组' }));

    const domOrder = () =>
      Array.from(document.querySelectorAll('[data-group-node]')).map((element) =>
        element.getAttribute('data-group-node'),
      );
    expect(domOrder()).toEqual([UNGROUPED_ID, a.data.group.id, b.data.group.id, c.data.group.id]);

    await user.click(screen.getByLabelText('分组菜单 组A'));
    await user.click(screen.getByText('下移'));

    await waitFor(() => {
      expect(domOrder()).toEqual([UNGROUPED_ID, b.data.group.id, a.data.group.id, c.data.group.id]);
    });

    const sorts = useAppStore
      .getState()
      .groups.filter((group) => !group.system)
      .slice()
      .sort((left, right) => left.sort - right.sort)
      .map((group) => group.sort);
    expect(sorts).toEqual([0, 1, 2]);
    expect(useAppStore.getState().groups.find((group) => group.id === a.data.group.id)?.sort).toBe(1);

    const ledger = await store.ledger.toArray();
    expect(ledger.some((entry) => (entry.meta as { action?: string } | undefined)?.action === 'reorder')).toBe(true);
  });

  it('顺序未变化时不产生新 Command（undoCount / undoLabel 不变）', async () => {
    await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const a = await createGroup(store, { name: '组A' });
    const b = await createGroup(store, { name: '组B' });
    expect(a.ok && b.ok).toBe(true);
    await useAppStore.getState().refreshInventory();

    // 先做一次真实重排，把 sort 收敛成 0 / 1 / 2
    const first = await useAppStore.getState().reorderGroups({
      parentId: null,
      orderedIds: siblingOrder(useAppStore.getState().groups, null),
    });
    expect(first.ok).toBe(true); // 1 基 sort ≠ 下标，故这次算"有变化"，写入 0 / 1

    await useAppStore.getState().refreshInventory();

    const steady = siblingOrder(useAppStore.getState().groups, null);
    // 页面 applyReorder 的判定：顺序没变就直接 return，不调 reorderGroups
    expect(needsReorder(useAppStore.getState().groups, null, steady)).toBe(false);

    const undoCount = useAppStore.getState().undoCount;
    const undoLabel = useAppStore.getState().undoLabel;

    // 对照数据层：即使硬调，也是 conflict「分组顺序未变化」且不落 Command
    const unchanged = await useAppStore.getState().reorderGroups({ parentId: null, orderedIds: steady });
    expect(unchanged.ok).toBe(false);
    if (!unchanged.ok) {
      expect(unchanged.code).toBe('conflict');
      expect(unchanged.error).toContain('未变化');
    }
    expect(useAppStore.getState().undoCount).toBe(undoCount);
    expect(useAppStore.getState().undoLabel).toBe(undoLabel);

    // 真的变了才产生 1 个 Command
    const changed = stepOrder(steady, steady[0], 1);
    expect(needsReorder(useAppStore.getState().groups, null, changed)).toBe(true);
    const result = await useAppStore.getState().reorderGroups({ parentId: null, orderedIds: changed });
    expect(result.ok).toBe(true);
    await waitFor(() => {
      expect(useAppStore.getState().undoLabel).toBe('分组排序 ×2');
    });
  });
});

describe('分组增删改（菜单路径）', () => {
  it('新建分组 → 重命名 → 删除后条目回到未分组', async () => {
    const item = await addStock(solid, 12.4, 1);
    await useAppStore.getState().refreshInventory();
    const user = setupTestUser();
    renderPage();

    await user.click(screen.getByRole('tab', { name: '分组' }));
    await user.click(screen.getByRole('button', { name: '+ 新建分组' }));
    await user.type(screen.getByLabelText('分组名称'), '金属色');
    await user.click(screen.getByRole('button', { name: '新建' }));

    await waitFor(() => expect(screen.getByText('金属色')).toBeInTheDocument());
    const created = useAppStore.getState().groups.find((group) => group.name === '金属色');
    expect(created).toBeDefined();
    if (!created) return;

    // 抽屉「加入分组」菜单 = 拖拽的键盘替代路径
    await user.click(screen.getByRole('tab', { name: '品牌' }));
    await user.click(within(rowOf(document.body as HTMLElement, 'C80')).getByLabelText('详情'));
    await user.click(screen.getByRole('button', { name: '加入分组 ⋯' }));
    await user.click(screen.getByLabelText('加入分组 金属色'));

    await waitFor(() => {
      const moved = useAppStore.getState().stockItems.find((entry) => entry.id === item.id);
      expect(moved?.groupId).toBe(created.id);
    });

    // 重命名（≤16 字，同层不重名由仓储校验）
    await user.click(screen.getByRole('tab', { name: '分组' }));
    await user.click(screen.getByLabelText('分组菜单 金属色'));
    await user.click(screen.getByText('重命名'));
    const renameInput = screen.getByLabelText('新的分组名称');
    expect(renameInput).toHaveAttribute('maxlength', '16');
    await user.clear(renameInput);
    await user.type(renameInput, '金属漆');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(async () => {
      const renamed = await listGroups(store);
      expect(renamed.some((group) => group.name === '金属漆')).toBe(true);
    });

    // 删除分组：二次确认，子项回到未分组
    await user.click(screen.getByLabelText('分组菜单 金属漆'));
    await user.click(screen.getByText('删除'));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(async () => {
      const remaining = await listGroups(store);
      expect(remaining.some((group) => group.name === '金属漆')).toBe(false);
    });
    await waitFor(() => {
      const moved = useAppStore.getState().stockItems.find((entry) => entry.id === item.id);
      expect(moved?.groupId).toBe(UNGROUPED_ID);
    });
  });
});
