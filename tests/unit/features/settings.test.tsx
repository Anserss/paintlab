import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type { DepotStore } from '@/data/db';
import { createMemoryStore, setStore } from '@/data/db';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { useAppStore } from '@/store';

let store: DepotStore;

beforeEach(() => {
  store = createMemoryStore();
  setStore(store);
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS }, toasts: [] });
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.dataset.density = DEFAULT_SETTINGS.density;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('设置页（spec 3.7 / 3.8 / 3.9 / 10.1）', () => {
  it('切换主题后 documentElement 的 data-theme 变为 light，且设置项不进撤销栈', async () => {
    const { container } = render(<SettingsPage />);

    fireEvent.click(screen.getByRole('tab', { name: '浅色' }));

    await waitFor(() => expect(useAppStore.getState().settings.theme).toBe('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(container.querySelector('[data-setting="theme"]')?.getAttribute('data-value')).toBe('light');
    expect(await store.commands.toArray()).toHaveLength(0);
  });

  it('undoDepth 越界输入被钳制到 3–20', async () => {
    render(<SettingsPage />);

    const field = (): HTMLElement => screen.getByLabelText('撤销深度');

    fireEvent.change(field(), { target: { value: '99' } });
    fireEvent.blur(field());
    await waitFor(() => expect(useAppStore.getState().settings.undoDepth).toBe(20));
    expect(field()).toHaveValue('20');

    fireEvent.change(field(), { target: { value: '1' } });
    fireEvent.blur(field());
    await waitFor(() => expect(useAppStore.getState().settings.undoDepth).toBe(3));
    expect(field()).toHaveValue('3');
  });

  it('重置在未输入 RESET 前不可执行，输入 RESET 后才解禁', async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: '重置数据' }));

    const confirm = await screen.findByRole('button', { name: '重置全部数据' });
    expect(confirm).toBeDisabled();
    expect(document.body.textContent).toContain('重置不可撤销');

    const gate = screen.getByLabelText('输入 RESET 确认');
    fireEvent.change(gate, { target: { value: 'reset' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(gate, { target: { value: 'RESET' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '重置全部数据' })).toBeEnabled());
  });

  it('关于面板包含非官方声明、MIT 署名原文、色值免责与素材声明', () => {
    const { container } = render(<SettingsPage />);
    const about = container.querySelector('[data-panel="about"]') as HTMLElement | null;

    expect(about).not.toBeNull();
    const text = about?.textContent ?? '';
    expect(text).toContain('非官方');
    expect(text).toContain('无隶属关系');
    expect(text).toContain('MIT');
    expect(text).toContain('Paint colour data derived from ModKit Swatch');
    expect(text).toContain('(https://github.com/afzafri/modkit-swatch), MIT License.');
    expect(text).toContain('Copyright (c) modkit-swatch contributors.');
    expect(text).toContain('社区测量值');
    expect(text).toContain('明日方舟');
  });

  it('数据范围面板：目录字段是只读文本（aria-readonly），DOM 里没有输入控件', () => {
    const { container } = render(<SettingsPage />);
    const scope = container.querySelector('[data-panel="data-scope"]') as HTMLElement | null;

    expect(scope).not.toBeNull();
    const panel = scope as HTMLElement;
    expect(panel.querySelectorAll('input, select, textarea')).toHaveLength(0);

    for (const id of ['brand-name', 'paint-line-volume', 'paint-hex', 'paint-source']) {
      const node = panel.querySelector('[data-field="' + id + '"]') as HTMLElement | null;
      expect(node, '目录只读字段 ' + id).not.toBeNull();
      expect(node?.tagName).toBe('SPAN');
      expect(node?.getAttribute('aria-readonly')).toBe('true');
    }

    expect(panel.querySelectorAll('[data-writable-field]').length).toBeGreaterThanOrEqual(8);
    expect(panel.textContent).toContain('Brand.displayAlias');
    expect(panel.textContent).toContain('禁止用户改色值');
  });

  it('导出全量生成带日期的 .pigment.json 并触发下载', async () => {
    const downloads: string[] = [];
    const created: unknown[] = [];
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn((blob: unknown) => {
      created.push(blob);
      return 'blob:pigment';
    });
    url.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    const { container } = render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '导出全量 .pigment.json' }));

    await waitFor(() => expect(created.length).toBe(1));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^pigment-depot-\d{8}\.pigment\.json$/);
    expect(container.querySelector('[data-note="last-export"]')?.textContent).toContain(downloads[0]);
  });

  it('库存 CSV 导出文件名与表头符合 3.8', async () => {
    const downloads: string[] = [];
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn(() => 'blob:csv');
    url.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: '导出库存 CSV' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^pigment-depot-inventory-\d{8}\.csv$/);
  });

  it('选择备份文件后先弹出确认对话框，说明影响范围并声明不可撤销', async () => {
    render(<SettingsPage />);

    const file = new File([JSON.stringify({ format: 'pigment-depot/v1', user: {} })], 'backup.pigment.json', {
      type: 'application/json',
    });
    const input = screen.getByLabelText('选择 .pigment.json 备份文件') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('确认导入备份')).toBeTruthy();
    const impact = document.querySelector('[data-note="import-impact"]') as HTMLElement | null;
    expect(impact?.textContent ?? '').toContain('覆盖');
    expect(screen.getByRole('tab', { name: '合并' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '跳过' })).toBeTruthy();
    expect(document.body.textContent).toContain('导入不可撤销');
  });

  it('快捷键面板按 10.1 列出全部绑定', () => {
    const { container } = render(<SettingsPage />);
    const panel = container.querySelector('[data-panel="shortcuts"]') as HTMLElement | null;

    expect(panel).not.toBeNull();
    const shortcuts = panel as HTMLElement;
    expect(shortcuts.querySelectorAll('[data-shortcut]')).toHaveLength(10);
    const text = shortcuts.textContent ?? '';
    expect(text).toContain('1 – 5');
    expect(text).toContain('Ctrl / ⌘ + Z');
    expect(text).toContain('Ctrl / ⌘ + Shift + Z');
    expect(text).toContain('Esc');
    expect(text).toContain('?');
  });

  it('自动快照缺失时显式标注 P1 未实现而不伪造功能', () => {
    const { container } = render(<SettingsPage />);
    const note = container.querySelector('[data-note="snapshots"]') as HTMLElement | null;

    expect(note).not.toBeNull();
    const text = note?.textContent ?? '';
    expect(text).toContain('P1 未实现');
    expect(text).toContain('snapshots');
  });
});
