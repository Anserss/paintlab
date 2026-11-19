import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine, StockItem } from '@/core/model/types';
import { isMixedProduct } from '@/core/render/batch';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';
import { ensureSystemGroup } from '@/data/repos/group';
import { clearHistory } from '@/data/repos/history';
import { DeleteItemDialog, RenameItemDialog } from '@/features/depot/Dialogs';
import type { DepotRow } from '@/features/depot/model';
import { useAppStore } from '@/store';

const BRAND: Brand = {
  id: 'gsi',
  name: 'GSI Creos',
  nameZh: '郡士',
  shortName: 'GSI',
  aliases: [],
  accentHex: '#1B4FA0',
  country: 'JP',
  sort: 1,
};

const LINE: PaintLine = {
  id: 'gsi-mr-color',
  brandId: 'gsi',
  name: 'Mr.Color',
  nameZh: '郡士油性漆',
  packaging: 'pot',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const BLUE: Paint = {
  id: 'gsi-c80',
  lineId: LINE.id,
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

function dilutedItem(patch: Partial<StockItem> = {}): StockItem {
  return {
    id: 'stock-diluted',
    paintId: BLUE.id,
    volumeMl: 30,
    initialMl: 30,
    state: 'thinned',
    ratioN: 2,
    groupId: null,
    origin: 'mixed',
    createdAt: 1,
    customName: '钴蓝',
    customHex: '#2E5E9F',
    dilutionRatioN: 2,
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

function rowOf(item: StockItem): DepotRow {
  return {
    item,
    paint: BLUE,
    line: LINE,
    brand: BRAND,
    customMixed: true,
    mixedProduct: isMixedProduct(item),
  };
}

/** 一支调漆产物：默认名「调漆14」，有组分快照但没有稀释比例 */
function mixedItem(patch: Partial<StockItem> = {}): StockItem {
  return {
    id: 'stock-mixed',
    paintId: BLUE.id,
    volumeMl: 8.5,
    initialMl: 30,
    state: 'thinned',
    ratioN: 2,
    groupId: null,
    origin: 'mixed',
    createdAt: 1,
    customName: '调漆14',
    customHex: '#667893',
    ...patch,
  };
}

let store: DepotStore;

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await ensureSystemGroup(store);
  await clearHistory(store);
  useAppStore.setState({
    stockItems: [],
    workbenches: [],
    workbenchItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: true,
    selected: [],
    toasts: [],
    brands: [BRAND],
    paintsById: { [BLUE.id]: BLUE },
    linesById: { [LINE.id]: LINE },
  });
});

describe('2.2.1 调漆产物改名（用户自定义名称）', () => {
  it('「调漆14」改成 JW020，落库可撤销', async () => {
    const item = mixedItem();
    await store.stockItems.put(item);

    render(<RenameItemDialog row={rowOf(item)} onClose={() => undefined} />);
    await waitFor(() => expect(document.querySelector('[data-dialog="rename-stock"]')).not.toBeNull());
    expect(document.body.textContent).toContain('当前名称「调漆14」');

    fireEvent.change(screen.getByLabelText('新名称'), { target: { value: 'JW020' } });
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
    await waitFor(async () => {
      expect((await store.stockItems.get(item.id))?.customName).toBe('JW020');
    });

    await useAppStore.getState().undo();
    await waitFor(async () => {
      expect((await store.stockItems.get(item.id))?.customName).toBe('调漆14');
    });
  });
});

describe('2.1.1 删除条目：直接删除 / 分解回仓库', () => {
  it('带组分快照的稀释漆料：弹层列出「原浆 + 辅料」，点分解后两条回仓库', async () => {
    const item = dilutedItem();
    await store.stockItems.put(item);

    const onClose = () => undefined;
    render(<DeleteItemDialog row={rowOf(item)} onClose={onClose} />);
    await waitFor(() => expect(document.querySelector('[data-decomposition]')).not.toBeNull());

    const panel = document.querySelector('[data-decomposition]') as HTMLElement;
    expect(panel.textContent).toContain('钴蓝 · 原浆 · 10.0 ml');
    expect(panel.textContent).toContain('郡士 标准稀释剂 250 ml · 辅料 · 20.0 ml');
    expect(panel.textContent).toContain('2 件 · 30.0 ml');

    const decompose = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '分解为原浆和辅料',
    ) as HTMLButtonElement | undefined;
    expect(decompose).toBeTruthy();
    if (!decompose) return;

    fireEvent.click(decompose);
    await waitFor(async () => {
      const items = await store.stockItems.toArray();
      expect(items).toHaveLength(2);
    });

    const items = await store.stockItems.toArray();
    expect(items.some((entry) => entry.id === item.id)).toBe(false);
    expect(items.find((entry) => entry.paintId === 'gsi-c80')?.volumeMl).toBe(10);
    expect(items.find((entry) => entry.paintId === 'gsi-t103')?.volumeMl).toBe(20);
  });

  it('没有组分快照的条目：不提供分解，只能确认删除', async () => {
    const item = dilutedItem({ id: 'stock-legacy', parts: undefined, dilutionRatioN: undefined });
    await store.stockItems.put(item);

    render(<DeleteItemDialog row={rowOf(item)} onClose={() => undefined} />);
    await waitFor(() => expect(document.querySelector('[data-delete-item]')).not.toBeNull());
    expect(document.querySelector('[data-decomposition]')).toBeNull();
    expect(document.body.textContent).toContain('只能直接删除');

    const confirm = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '确认删除',
    ) as HTMLButtonElement | undefined;
    expect(confirm).toBeTruthy();
    if (!confirm) return;
    fireEvent.click(confirm);
    await waitFor(async () => {
      expect(await store.stockItems.get(item.id)).toBeUndefined();
    });
  });
});
