import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { createMemoryStore, setStore } from '@/data/db';
import { ProcurePage } from '@/features/procure/ProcurePage';
import {
  isAuxPaint,
  paintsOfKind,
  procureDescription,
  summarizePool,
} from '@/features/procure/procureFilters';
import { useAppStore } from '@/store';

/* ------------------------------------------------------------------ */
/* 2.2.2：辅料货架收纳底漆 / 补土 + 采购列表按品牌分段 + 摘要降噪      */
/* ------------------------------------------------------------------ */

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

const TAMIYA: Brand = {
  id: 'tamiya',
  name: 'Tamiya',
  nameZh: '田宫',
  shortName: 'TAMIYA',
  aliases: [],
  accentHex: '#00539B',
  country: 'JP',
  sort: 2,
};

const JY: Brand = {
  id: 'jy',
  name: 'Jumpwind',
  nameZh: '匠域',
  shortName: 'JW',
  aliases: [],
  accentHex: '#C0453A',
  country: 'CN',
  sort: 3,
};

const COLOR_LINE: PaintLine = {
  id: 'gsi-mr-color',
  brandId: 'gsi',
  name: 'Mr.Color',
  nameZh: '实色',
  packaging: 'bottle',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const SURFACER_LINE: PaintLine = {
  id: 'gsi-surfacer',
  brandId: 'gsi',
  name: 'Mr.SURFACER',
  nameZh: '瓶装水补土',
  packaging: 'bottle',
  defaultVolumeMl: 40,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'primer',
};

const TAMIYA_LINE: PaintLine = {
  id: 'tamiya-lp',
  brandId: 'tamiya',
  name: 'LP',
  nameZh: '硝基色（LP）',
  packaging: 'bottle',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const TAMIYA_AUX_LINE: PaintLine = {
  id: 'tamiya-aux',
  brandId: 'tamiya',
  name: 'Tamiya Auxiliaries',
  nameZh: '涂装辅料',
  packaging: 'bottle',
  defaultVolumeMl: 250,
  kind: 'auxiliary',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'additive',
};

const JY_LINE: PaintLine = {
  id: 'jy-neo',
  brandId: 'jy',
  name: 'NEO COLOR',
  nameZh: '基本色',
  packaging: 'bottle',
  defaultVolumeMl: 18,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
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
  nameZh: '钴蓝',
  hex: '#1838a8',
  finish: 'gloss',
  verifiedAt: '2026-11-17',
});

/** 水补土：paintClass=solid + category=primer，2.2.2 之前被埋在颜色货架里 */
const SF283 = makePaint({
  id: 'gsi-sf283',
  lineId: SURFACER_LINE.id,
  brandId: 'gsi',
  code: 'SF283',
  name: '水补土 500',
  nameZh: '水补土 500',
  hex: '#a88c66',
  finish: 'primer',
  category: 'primer',
  volumeMl: 40,
  verifiedAt: '2026-11-17',
});

const LP1 = makePaint({
  id: 'tamiya-lp-1',
  lineId: TAMIYA_LINE.id,
  brandId: 'tamiya',
  code: 'LP-1',
  name: 'Black',
  hex: '#0d0d0d',
  finish: 'gloss',
});

/** 田宫的待核验稀释剂：没有 verifiedAt，采购行要挂「待核验」 */
const T_X20A = makePaint({
  id: 'tamiya-x-20a',
  lineId: TAMIYA_AUX_LINE.id,
  brandId: 'tamiya',
  code: 'X-20A',
  name: 'X-20A Acrylic Thinner',
  nameZh: '水性丙烯稀释剂 250 ml',
  hex: '#ffffff',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'additive',
  volumeMl: 250,
  hexEstimated: true,
  source: '待核验：田宫官方辅料线',
  sourceUrl: 'https://www.tamiya.com/japan/products/',
});

const JW001 = makePaint({
  id: 'jy-jw001',
  lineId: JY_LINE.id,
  brandId: 'jy',
  code: 'JW001',
  name: 'White',
  hex: '#e2e2e2',
  finish: 'gloss',
  hexEstimated: true,
});

const PAINTS = [C80, SF283, LP1, T_X20A, JW001];

function seedCatalog(): void {
  useAppStore.setState({
    brands: [GSI, TAMIYA, JY],
    bundles: {
      gsi: {
        catalogVersion: 'test',
        brand: GSI,
        lines: [COLOR_LINE, SURFACER_LINE],
        paints: [C80, SF283],
      },
      tamiya: {
        catalogVersion: 'test',
        brand: TAMIYA,
        lines: [TAMIYA_LINE, TAMIYA_AUX_LINE],
        paints: [LP1, T_X20A],
      },
      jy: { catalogVersion: 'test', brand: JY, lines: [JY_LINE], paints: [JW001] },
    },
    paintsById: Object.fromEntries(PAINTS.map((paint) => [paint.id, paint])),
    linesById: {
      [COLOR_LINE.id]: COLOR_LINE,
      [SURFACER_LINE.id]: SURFACER_LINE,
      [TAMIYA_LINE.id]: TAMIYA_LINE,
      [TAMIYA_AUX_LINE.id]: TAMIYA_AUX_LINE,
      [JY_LINE.id]: JY_LINE,
    },
    brandState: { gsi: 'loaded', tamiya: 'loaded', jy: 'loaded' },
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

const descOf = (row: HTMLElement | null): string | null =>
  row ? (row.querySelector('[data-paint-desc]')?.textContent ?? null) : null;

beforeEach(() => {
  setStore(createMemoryStore());
  seedCatalog();
});

describe('2.2.2 · 辅料归类（isAuxPaint）', () => {
  it('稀释剂、缓干剂、底漆、补土算辅料；色漆不算', () => {
    expect(isAuxPaint({ paintClass: 'aux', category: 'thinner' })).toBe(true);
    expect(isAuxPaint({ paintClass: 'aux', category: 'retarder' })).toBe(true);
    expect(isAuxPaint({ paintClass: 'solid', category: 'primer' })).toBe(true);
    expect(isAuxPaint({ paintClass: 'solid', category: 'surfacer' })).toBe(true);
    expect(isAuxPaint({ paintClass: 'solid', category: 'color' })).toBe(false);
    expect(isAuxPaint({ paintClass: 'clear', category: 'color' })).toBe(false);
  });

  it('paintsOfKind 按新归类切分：水补土进辅料货架，不再挤占颜色货架', () => {
    expect(paintsOfKind(PAINTS, 'color').map((paint) => paint.id)).toEqual([
      'gsi-c80',
      'tamiya-lp-1',
      'jy-jw001',
    ]);
    expect(paintsOfKind(PAINTS, 'aux').map((paint) => paint.id)).toEqual(['gsi-sf283', 'tamiya-x-20a']);
  });

  it('procureDescription：辅料行给「油性 · 类目」，色漆行交给 core 的 paintDescription', () => {
    expect(procureDescription(SF283, SURFACER_LINE)).toBe('油性 · 底漆');
    expect(procureDescription(T_X20A, TAMIYA_AUX_LINE)).toBe('油性 · 稀释剂');
    expect(procureDescription(C80, COLOR_LINE)).toBeUndefined();
  });

  it('summarizePool：颜色 / 辅料 / 近似色值 / 未核验 四项计数', () => {
    // 未核验 = LP-1 + X-20A + JW001 三条（前两条样本带 verifiedAt）
    expect(summarizePool(PAINTS)).toEqual({ color: 3, aux: 2, estimated: 2, unverified: 3 });
  });
});

describe('2.2.2 · 采购页辅料货架与摘要', () => {
  it('辅料货架能拿到水补土 SF283，描述为「油性 · 底漆」，规格 40 ml', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);

    await waitFor(() =>
      expect(container.querySelector('[data-paint-row][data-code="SF283"]')).not.toBeNull(),
    );
    const row = container.querySelector<HTMLElement>('[data-paint-row][data-code="SF283"]') as HTMLElement;
    expect(descOf(row)).toBe('油性 · 底漆');
    expect(row.textContent).toContain('40 ml');
    // 已核验的辅料不挂「待核验」
    expect(row.textContent).not.toContain('待核验');
  });

  it('底漆入库弹层也不问「原浆 / 稀释」', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);
    await waitFor(() =>
      expect(container.querySelector('[data-paint-row][data-code="SF283"]')).not.toBeNull(),
    );

    const row = container.querySelector<HTMLElement>('[data-paint-row][data-code="SF283"]') as HTMLElement;
    const register = row.parentElement?.querySelector('button') as HTMLElement;
    fireEvent.click(register);

    await waitFor(() => expect(document.querySelector('[data-aux-no-state]')).not.toBeNull());
    expect(document.querySelector('[role="tablist"][aria-label="初始状态"]')).toBeNull();
  });

  it('切到没有辅料的品牌：辅料货架给专门的空状态', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    fireEvent.click(container.querySelector('[data-brand-row="jy"]') as HTMLElement);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);

    await waitFor(() => expect(container.textContent).toContain('该品牌还没有辅料数据'));
    expect(rowsOf(container)).toHaveLength(0);
  });

  it('工具栏摘要：近似色值 / 未核验 只在池级显示一次，行内不再逐条挂牌', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    // 郡士池：C80 已核验、不推定；SF283 已核验
    expect(container.querySelector('[data-procure-estimated]')).toBeNull();
    expect(container.querySelector('[data-procure-unverified]')).toBeNull();

    fireEvent.click(container.querySelector('[data-brand-row="tamiya"]') as HTMLElement);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    // 田宫池：LP-1 无 verifiedAt、X-20A 推定色 + 未核验
    expect(container.querySelector('[data-procure-estimated]')?.getAttribute('data-procure-estimated')).toBe('1');
    expect(container.querySelector('[data-procure-unverified]')?.getAttribute('data-procure-unverified')).toBe('2');

    // 行内：只留一个 ≈ 记号，没有整块「≈ 推定色」小牌（X-20A 在辅料货架）
    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);
    await waitFor(() =>
      expect(container.querySelector('[data-paint-row][data-code="X-20A"]')).not.toBeNull(),
    );
    const row = container.querySelector<HTMLElement>('[data-paint-row][data-code="X-20A"]');
    expect(row?.querySelector('[data-hex-estimated]')).not.toBeNull();
    expect(row?.textContent).not.toContain('推定色');
  });

  it('搜索类目词（稀释剂 / 底漆）能命中辅料条目', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const search = screen.getByLabelText('搜索色号、名称、色值或属性');
    fireEvent.change(search, { target: { value: '稀释剂' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(0));

    fireEvent.change(search, { target: { value: '底漆' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(rowsOf(container)[0].getAttribute('data-code')).toBe('SF283');
  });
});

describe('2.2.2 · 全部品牌按品牌分段', () => {
  it('选「全部」后列表插入品牌分组头，单品牌平铺不插头', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(container.querySelectorAll('[data-procure-group]')).toHaveLength(0);

    fireEvent.click(container.querySelector('[data-brand-row="all"]') as HTMLElement);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(3));

    const groups = Array.from(container.querySelectorAll<HTMLElement>('[data-procure-group]'));
    expect(groups.map((group) => group.getAttribute('data-procure-group'))).toEqual(['gsi', 'tamiya', 'jy']);
    expect(groups[0].textContent).toContain('郡士');
    expect(groups[1].textContent).toContain('田宫');
    // 分组头只统计颜色货架的条目
    expect(groups.every((group) => (group.textContent ?? '').includes('1 条'))).toBe(true);
  });

  it('面包屑切到「全部」时只显示采购 / 全部', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    fireEvent.click(container.querySelector('[data-brand-row="all"]') as HTMLElement);
    await waitFor(() => expect(useAppStore.getState().breadcrumb).toEqual(['采购', '全部']));
  });
});

describe('2.2.2 · 产品线中文名', () => {
  it('产品线下拉用中文名（没有中文名才回退厂线原名），且随货架收敛', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));

    const colorSelect = screen.getByLabelText('产品线') as HTMLSelectElement;
    const colorLabels = Array.from(colorSelect.options).map((option) => option.textContent);
    expect(colorLabels).toContain('实色');
    // 水补土已归辅料，颜色货架的产品线里不该再出现
    expect(colorLabels).not.toContain('瓶装水补土');

    const tabs = container.querySelector('[role="tablist"][aria-label="货架"]') as HTMLElement;
    fireEvent.click(tabs.querySelectorAll('[role="tab"]')[1]);
    await waitFor(() => {
      const auxSelect = screen.getByLabelText('产品线') as HTMLSelectElement;
      expect(Array.from(auxSelect.options).map((option) => option.textContent)).toContain('瓶装水补土');
    });

    fireEvent.click(container.querySelector('[data-brand-row="tamiya"]') as HTMLElement);
    await waitFor(() => {
      const next = screen.getByLabelText('产品线') as HTMLSelectElement;
      expect(Array.from(next.options).map((option) => option.textContent)).toContain('涂装辅料');
    });
  });
});
