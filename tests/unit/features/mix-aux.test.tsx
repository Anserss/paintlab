import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Paint } from '@/core/model/types';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import { createMemoryStore, setStore } from '@/data/db';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { MixPage } from '@/features/mix/MixPage';
import { useAppStore } from '@/store';

const COLOR: Paint = {
  id: 'gsi-c1',
  lineId: 'gsi-mr-color',
  brandId: 'gsi',
  code: 'C1',
  name: 'White',
  nameZh: '白',
  hex: '#ffffff',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
  volumeMl: 10,
};

const THINNER: Paint = {
  id: 'gsi-t103',
  lineId: 'gsi-thinner',
  brandId: 'gsi',
  code: 'T-103',
  name: 'Mr. Color Thinner 250',
  nameZh: '郡士 标准稀释剂 250 ml',
  hex: '#ffffff',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'additive',
  origin: 'seed',
  volumeMl: 250,
};

let store = createMemoryStore();

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await clearHistory(store);
  useAppStore.setState({
    bottles: [],
    stockItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: false,
    paintsById: { [COLOR.id]: COLOR, [THINNER.id]: THINNER },
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
});

async function seedBoth(): Promise<void> {
  await createStockItem(store, { paint: COLOR, initialMl: 10, state: 'neat', groupId: null });
  await createStockItem(store, { paint: THINNER, initialMl: 250, state: 'neat', groupId: null });
  await useAppStore.getState().refreshInventory();
}

describe('调漆台 · 辅料与原浆的区分（加辅料目录后新增）', () => {
  it('稀释剂/缓干剂不进「取用漆料」候选，只作为「稀释剂来源」', async () => {
    await seedBoth();
    render(<MemoryRouter><MixPage /></MemoryRouter>);

    await waitFor(() => {
      const rows = document.querySelector('[data-mix-panel="stock"]');
      expect(rows).not.toBeNull();
      expect(rows?.textContent).toContain('C1');
    });

    const stockPanel = document.querySelector('[data-mix-panel="stock"]');
    // 辅料不能被当成漆用
    expect(stockPanel?.textContent).not.toContain('T-103');

    // 但它必须出现在稀释剂来源里（含 SKU 与容量）
    await waitFor(() => expect(document.body.textContent).toContain('稀释剂来源'));
    expect(document.body.textContent).toContain('T-103');
  });
});
