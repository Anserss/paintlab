import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { createMemoryStore, setStore } from '@/data/db';
import { ProcurePage } from '@/features/procure/ProcurePage';
import { DEFAULT_PROCURE_FILTERS, paintsOfKind } from '@/features/procure/procureFilters';
import { useAppStore } from '@/store';

const GSI: Brand = {
  id: 'gsi',
  name: 'GSI Creos',
  nameZh: '郡士',
  shortName: 'GSI',
  aliases: [],
  accentHex: '#1B4FA0',
  country: 'JP',
  sort: 1,
};

const COLOR_LINE: PaintLine = {
  id: 'gsi-mr-color',
  brandId: 'gsi',
  name: 'Mr.Color',
  packaging: 'bottle',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

/** 辅料产品线：稀释剂按容量分 SKU，行级规格来自 paint.volumeMl */
const THINNER_LINE: PaintLine = {
  id: 'gsi-thinner',
  brandId: 'gsi',
  name: 'Mr. Color Thinner / Retarder',
  nameZh: '郡士 稀释与缓干系列',
  packaging: 'bottle',
  defaultVolumeMl: 110,
  kind: 'auxiliary',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'other',
};

const makePaint = (input: Partial<Paint> & Pick<Paint, 'id' | 'lineId' | 'brandId' | 'name' | 'hex'>): Paint => ({
  paintClass: 'solid',
  category: 'color',
  origin: 'seed',
  ...input,
});

const C80 = makePaint({
  id: 'gsi-c80',
  lineId: COLOR_LINE.id,
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  hex: '#1838a8',
  finish: 'gloss',
});

const T103 = makePaint({
  id: 'gsi-t103',
  lineId: THINNER_LINE.id,
  brandId: 'gsi',
  code: 'T-103',
  name: 'Mr. Color Thinner 250',
  nameZh: '郡士 标准稀释剂 250 ml',
  hex: '#ffffff',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'additive',
  volumeMl: 250,
  sourceUrl: 'https://mrhobby-europe.com/products/thinners/mr-color/mr-color-thinner-250/',
  source: 'Mr. Hobby EU 商品页',
});

const PAINTS = [C80, T103];

function seedCatalog() {
  useAppStore.setState({
    brands: [GSI],
    bundles: {
      gsi: { catalogVersion: 'test', brand: GSI, lines: [COLOR_LINE, THINNER_LINE], paints: PAINTS },
    },
    paintsById: Object.fromEntries(PAINTS.map((paint) => [paint.id, paint])),
    linesById: { [COLOR_LINE.id]: COLOR_LINE, [THINNER_LINE.id]: THINNER_LINE },
    brandState: { gsi: 'loaded' },
    catalogReady: true,
    catalogError: null,
    stockItems: [],
    stockAggregate: {},
    groups: [],
    selected: [],
    toasts: [],
    breadcrumb: null,
  });
}

const rowsOf = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-paint-row]'));

beforeEach(() => {
  setStore(createMemoryStore());
  seedCatalog();
});

describe('采购大厅 · 辅料货架（稀释剂 / 缓干剂）', () => {
  it('paintsOfKind 按货架切分：颜色不含 aux，辅料只含 aux', () => {
    expect(paintsOfKind(PAINTS, 'color').map((p) => p.id)).toEqual(['gsi-c80']);
    expect(paintsOfKind(PAINTS, 'aux').map((p) => p.id)).toEqual(['gsi-t103']);
    expect(DEFAULT_PROCURE_FILTERS.kind).toBe('color');
  });

  it('默认颜色货架不显示稀释剂；切到辅料货架后出现 T-103，属性行为「油性 · — · 辅助」且规格为 250 ml', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(container.querySelector('[data-paint-row][data-code="C80"]')).not.toBeNull();

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    expect(tabs).not.toBeNull();
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);

    await waitFor(() =>
      expect(container.querySelector('[data-paint-row][data-code="T-103"]')).not.toBeNull(),
    );
    expect(rowsOf(container)).toHaveLength(1);

    const row = container.querySelector<HTMLElement>('[data-paint-row][data-code="T-103"]') as HTMLElement;
    // AC-15 兼容规则：aux 的光泽位用「—」占位，不得出现「光泽」
    expect(row.querySelector('[data-paint-desc]')?.textContent).toBe('油性 · — · 辅助');
    expect(row.textContent).not.toContain('光泽');
    // 规格优先取 paint.volumeMl（250），而不是产品线默认 110
    expect(row.textContent).toContain('250 ml');
  });

  it('辅料登记弹层的默认容量取该 SKU 规格（250 ml），提交后库存条目初始量即 250', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);
    await waitFor(() =>
      expect(container.querySelector('[data-paint-row][data-code="T-103"]')).not.toBeNull(),
    );

    // 「+ 登记」是行容器（[data-paint-line]）里的兄弟节点，不在 PaintRow 内部
    const row = container.querySelector<HTMLElement>('[data-paint-row][data-code="T-103"]') as HTMLElement;
    const register = row.parentElement?.querySelector('button');
    expect(register).not.toBeNull();
    fireEvent.click(register as HTMLElement);

    // 弹层打开后必须能看出本次规格是 250 ml（整瓶模式不渲染输入框，规格以文案呈现）
    await waitFor(() => expect(document.body.textContent).toContain('250'));

    const confirm = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === '确认登记',
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm as HTMLElement);

    await waitFor(() => {
      const items = useAppStore.getState().stockItems;
      expect(items).toHaveLength(1);
      expect(items[0].initialMl).toBe(250);
      expect(items[0].volumeMl).toBe(250);
    });
  });
});
