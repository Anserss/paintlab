import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBar } from '@/app/StatusBar';
import { useAppStore } from '@/store';

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

function renderBar() {
  return render(
    <MemoryRouter>
      <StatusBar />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useAppStore.setState({ toasts: [] });
});

describe('2.3.0 状态条回执（进出与减少动效）', () => {
  it('回执擦入后保留，清空时先进入退出态再卸载（约 160ms）', async () => {
    stubReducedMotion(false);
    const { container } = renderBar();

    act(() => {
      useAppStore.getState().pushToast({ message: '已入库 10.0 ml', tone: 'ok' });
    });
    const message = container.querySelector('[data-slot="message"]');
    expect(message?.textContent).toContain('已入库 10.0 ml');
    expect(message?.className).toContain('ef-in-wipe');

    act(() => {
      useAppStore.getState().clearToasts();
    });
    const leaving = container.querySelector('[data-slot="message"]');
    expect(leaving).not.toBeNull();
    expect(leaving?.className).toContain('ef-out-wipe');
  });

  it('减少动效：回执清空后立即卸载，不保留退出帧', () => {
    stubReducedMotion(true);
    const { container } = renderBar();

    act(() => {
      useAppStore.getState().pushToast({ message: '已删除', tone: 'warn' });
    });
    expect(container.querySelector('[data-slot="message"]')).not.toBeNull();

    act(() => {
      useAppStore.getState().clearToasts();
    });
    expect(container.querySelector('[data-slot="message"]')).toBeNull();
  });
});
