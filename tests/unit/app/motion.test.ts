import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionAllowed, revealTheme, settleReadout, shutter, supportsViewTransition } from '@/app/motion';

interface VtStub {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
}

function stubDocument(): VtStub {
  return document as unknown as VtStub;
}

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

function dropViewTransition(): void {
  delete stubDocument().startViewTransition;
  delete document.documentElement.dataset.efVt;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  dropViewTransition();
  document.body.innerHTML = '';
});

describe('2.3.0 动效编排（终末地风味）', () => {
  it('motionAllowed：系统要求减少动态效果时为 false', () => {
    stubReducedMotion(true);
    expect(motionAllowed()).toBe(false);
    stubReducedMotion(false);
    expect(motionAllowed()).toBe(true);
  });

  it('shutter：不支持 View Transitions 时直接换页', () => {
    stubReducedMotion(false);
    dropViewTransition();
    expect(supportsViewTransition()).toBe(false);
    let updated = false;
    shutter(() => {
      updated = true;
    });
    expect(updated).toBe(true);
    expect(document.documentElement.dataset.efVt).toBeUndefined();
  });

  it('shutter：支持时把换页放进 startViewTransition，并清理 data-ef-vt', async () => {
    stubReducedMotion(false);
    let update: (() => void | Promise<void>) | undefined;
    let settle: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });
    stubDocument().startViewTransition = (callback) => {
      update = callback;
      return { ready: Promise.resolve(), finished };
    };
    expect(supportsViewTransition()).toBe(true);

    let updated = false;
    shutter(() => {
      updated = true;
    });
    expect(document.documentElement.dataset.efVt).toBe('page');
    expect(updated).toBe(false);

    update?.();
    expect(updated).toBe(true);
    settle();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.efVt).toBeUndefined();
  });

  it('revealTheme：不支持 View Transitions 时直接换主题', async () => {
    stubReducedMotion(false);
    dropViewTransition();
    let changed = false;
    await revealTheme({ x: 20, y: 20 }, async () => {
      changed = true;
    });
    expect(changed).toBe(true);
  });

  it('settleReadout：减少动效时不动文本，也不加 aria-label', () => {
    stubReducedMotion(true);
    const value = document.createElement('span');
    value.textContent = '1234.5';
    document.body.append(value);

    settleReadout(value, '1234.5');

    expect(value.textContent).toBe('1234.5');
    expect(value.hasAttribute('aria-label')).toBe(false);
  });

  it('settleReadout：可用时进入乱码态，动画结束后落定回真实读数', async () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);

    const value = document.createElement('span');
    value.textContent = '1234.5';
    document.body.append(value);

    settleReadout(value, '1234.5', 400);
    expect(value.getAttribute('aria-label')).toBe('1234.5');
    expect(frames).toHaveLength(1);

    // 第一帧：还没锁定任何一位，数字被乱码替换（长度不变）
    now.mockReturnValue(100);
    frames.shift()?.(100);
    expect(value.textContent).toHaveLength(6);
    expect(value.textContent).not.toBe('1234.5');

    // 最后一帧：全部锁定，恢复真实读数并移除临时 aria-label
    now.mockReturnValue(400);
    frames.shift()?.(400);
    expect(value.textContent).toBe('1234.5');
    expect(value.hasAttribute('aria-label')).toBe(false);

    vi.useRealTimers();
    now.mockRestore();
  });
});
