import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { createMemoryStore, setStore } from '@/data/db';
import { ProcurePage } from '@/features/procure/ProcurePage';
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

const JY: Brand = {
  id: 'jy',
  name: 'Jumpwind',
  nameZh: '匠域',
  shortName: 'JW',
  aliases: [],
  accentHex: '#C0453A',
  country: 'CN',
  sort: 2,
};

const GSI_LINE: PaintLine = {
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

const JY_LINE: PaintLine = {
  id: 'jy-jw',
  brandId: 'jy',
  name: 'Jumpwind',
  packaging: 'bottle',
  defaultVolumeMl: 10,
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

/** AC-15 用的样本：oil + gloss + solid → 第二行必须是「油性 · 光泽 · 实色」 */
const C80 = makePaint({
  id: 'gsi-c80',
  lineId: GSI_LINE.id,
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  hex: '#1838a8',
  finish: 'gloss',
});

const C1 = makePaint({
  id: 'gsi-c1',
  lineId: GSI_LINE.id,
  brandId: 'gsi',
  code: 'C1',
  name: 'White',
  hex: '#ffffff',
  finish: 'gloss',
});

const JY_MATTE = makePaint({
  id: 'jy-jw001',
  lineId: JY_LINE.id,
  brandId: 'jy',
  code: 'JW001',
  name: 'Flat Red',
  nameZh: '哑光红',
  hex: '#b02a1e',
  finish: 'matte',
});

const PAINTS = [C80, C1, JY_MATTE];

function seedCatalog(): void {
  useAppStore.setState({
    brands: [GSI, JY],
    bundles: {
      gsi: { catalogVersion: 'test', brand: GSI, lines: [GSI_LINE], paints: [C80, C1] },
      jy: { catalogVersion: 'test', brand: JY, lines: [JY_LINE], paints: [JY_MATTE] },
    },
    paintsById: Object.fromEntries(PAINTS.map((paint) => [paint.id, paint])),
    linesById: { [GSI_LINE.id]: GSI_LINE, [JY_LINE.id]: JY_LINE },
    brandState: { gsi: 'loaded', jy: 'loaded' },
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

describe('采购大厅（spec 3.2 / AC-15 / AC-16）', () => {
  it('AC-15：C80 行第二行文本严格等于「油性 · 光泽 · 实色」，且属性行来自 core', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    const c80 = container.querySelector<HTMLElement>('[data-paint-row][data-code="C80"]');
    expect(c80).not.toBeNull();
    expect(descOf(c80)).toBe('油性 · 光泽 · 实色');
    // 色号 / 名称 / 品牌·系列·规格（第 3 行）
    expect(c80?.textContent).toContain('Cobalt Blue');
    expect(c80?.textContent).toContain('Mr.Color');
  });

  it('AC-16：左栏为纯文字品牌列表（DOM 中无 img），↑/↓ + Enter 切换品牌后列表条数随之变化', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('svg')).toHaveLength(0);

    const listbox = container.querySelector<HTMLElement>('[data-procure-brands]');
    expect(listbox).not.toBeNull();
    // 「全部 + 郡士 + 匠域」
    expect(container.querySelectorAll('[data-brand-row]')).toHaveLength(3);
    expect(container.querySelector('[data-brand-row="gsi"]')?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-brand-row')).toBe('jy');

    fireEvent.keyDown(listbox as HTMLElement, { key: 'Enter' });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(container.querySelector('[data-brand-row="jy"]')?.getAttribute('aria-selected')).toBe('true');
    const row = rowsOf(container)[0];
    expect(row.getAttribute('data-code')).toBe('JW001');
    expect(descOf(row)).toBe('油性 · 消光 · 实色');
    expect(useAppStore.getState().breadcrumb).toEqual(['采购', '匠域']);

    // 展开产品线二级列表 → 选中后写入面包屑
    const toggle = container.querySelector('[data-brand-row="jy"] button') as HTMLElement;
    fireEvent.click(toggle);
    const lineRow = container.querySelector('[data-line-row="jy-jw"]') as HTMLElement;
    expect(lineRow).not.toBeNull();
    fireEvent.click(lineRow);
    await waitFor(() =>
      expect(useAppStore.getState().breadcrumb).toEqual(['采购', '匠域', 'Jumpwind']),
    );
  });

  it('搜索：按色号过滤，也按属性词「油性 / 消光」过滤', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    const search = screen.getByLabelText('搜索色号、名称、色值或属性');
    fireEvent.change(search, { target: { value: 'C80' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(rowsOf(container)[0].getAttribute('data-code')).toBe('C80');

    fireEvent.change(search, { target: { value: '#1838a8' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(rowsOf(container)[0].getAttribute('data-code')).toBe('C80');

    fireEvent.change(search, { target: { value: '油性' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    // 切的匠域后按属性词「消光」过滤
    fireEvent.click(container.querySelector('[data-brand-row="jy"]') as HTMLElement);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    fireEvent.change(search, { target: { value: '消光' } });
    await waitFor(() => expect(rowsOf(container)).toHaveLength(1));
    expect(descOf(rowsOf(container)[0])).toBe('油性 · 消光 · 实色');
    expect(rowsOf(container)[0].getAttribute('data-code')).toBe('JW001');
  });

  it('登记入库：确认后该行出现「已登记 ×1」、按钮变「再登记一份」，并写入 stockItem 与回执', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    const c80 = container.querySelector<HTMLElement>('[data-paint-row][data-code="C80"]');
    const wrapper = c80?.parentElement as HTMLElement;
    const registerButton = Array.from(wrapper.querySelectorAll('button')).find(
      (button) => button.textContent === '+ 登记',
    );
    expect(registerButton).toBeTruthy();
    fireEvent.click(registerButton as HTMLButtonElement);

    const confirm = await screen.findByRole('button', { name: '确认登记' });
    fireEvent.click(confirm);

    await waitFor(() => expect(container.textContent).toContain('已登记 ×1'));
    expect(container.textContent).toContain('再登记一份');

    const state = useAppStore.getState();
    expect(state.stockItems).toHaveLength(1);
    expect(state.stockItems[0].paintId).toBe('gsi-c80');
    expect(state.stockItems[0].initialMl).toBe(10);
    expect(state.stockItems[0].state).toBe('neat');
    expect(state.toasts.some((toast) => toast.message.includes('已登记 郡士 C80 Cobalt Blue 10.0 ml'))).toBe(true);
    expect(state.toasts.some((toast) => toast.actionLabel === '撤销')).toBe(true);
  });

  it('多选批量：Ctrl+点击选中 2 行 → 底部 Toolbar → 一次批量登记', async () => {
    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));

    const rows = rowsOf(container);
    fireEvent.click(rows[0], { ctrlKey: true });
    fireEvent.click(rows[1], { ctrlKey: true });

    await waitFor(() => expect(screen.getByText('已选 2 件')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '登记入库 (2)' }));

    fireEvent.click(await screen.findByRole('button', { name: '确认登记' }));
    await waitFor(() => expect(useAppStore.getState().stockItems).toHaveLength(2));
    await waitFor(() => expect(container.textContent).toContain('已登记 ×1'));

    const registered = rowsOf(container).filter((row) => (row.textContent ?? '').includes('已登记 ×1'));
    expect(registered).toHaveLength(2);
    expect(container.textContent).toContain('再登记一份');
  });

  it('筛选与排序：仅未入库过滤已登记项，按色相（hueBucket）重排列表', async () => {
    // 色号序 C1 < C90，但色相序相反：C90（红，bucket 0）先于 C1（蓝，bucket 7）
    const blue = makePaint({
      id: 'gsi-c1',
      lineId: GSI_LINE.id,
      brandId: 'gsi',
      code: 'C1',
      name: 'Blue',
      hex: '#1838a8',
      finish: 'gloss',
    });
    const red = makePaint({
      id: 'gsi-c90',
      lineId: GSI_LINE.id,
      brandId: 'gsi',
      code: 'C90',
      name: 'Red',
      hex: '#d02a1e',
      finish: 'gloss',
    });
    act(() => {
      useAppStore.setState({
        brands: [GSI],
        bundles: { gsi: { catalogVersion: 'test', brand: GSI, lines: [GSI_LINE], paints: [blue, red] } },
        paintsById: { [blue.id]: blue, [red.id]: red },
        linesById: { [GSI_LINE.id]: GSI_LINE },
        brandState: { gsi: 'loaded' },
      });
    });

    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(rowsOf(container)).toHaveLength(2));
    const codes = () => rowsOf(container).map((row) => row.getAttribute('data-code'));
    expect(codes()).toEqual(['C1', 'C90']);

    fireEvent.click(screen.getByRole('tab', { name: '色相' }));
    await waitFor(() => expect(codes()).toEqual(['C90', 'C1']));

    act(() => {
      useAppStore.setState({
        stockAggregate: { 'gsi-c1': { paintId: 'gsi-c1', count: 1, totalMl: 10 } },
      });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '仅未入库' }));
    await waitFor(() => expect(codes()).toEqual(['C90']));
  });

  it('品牌包懒加载失败时给出可见错误态与重试按钮', async () => {
    act(() => {
      useAppStore.setState({ bundles: {}, brandState: {}, paintsById: {}, linesById: {} });
    });

    const { container } = render(<ProcurePage />);
    await waitFor(() => expect(useAppStore.getState().brandState.gsi).toBe('error'));
    await waitFor(() => expect(container.textContent).toContain('品牌包加载失败'));
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
  });
});
