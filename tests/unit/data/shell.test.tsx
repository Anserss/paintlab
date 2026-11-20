import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Shell } from '@/app/Shell';

const ROUTES = [
  { path: '/procure', label: '采购' },
  { path: '/depot', label: '仓库' },
  { path: '/mix', label: '调漆台' },
  { path: '/workbench', label: '工作台' },
  { path: '/settings', label: '设置' },
];

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Shell />}>
          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={<div data-page={route.path.slice(1)}>{route.label}页占位</div>}
            />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('应用外壳（spec 3.1 / AC-16）', () => {
  it('五条路由可达，导航文字为 采购/仓库/调漆台/工作台/设置，DOM 中无 <img>', () => {
    const { container } = renderShell('/depot');
    expect(container.querySelector('[data-page="depot"]')).not.toBeNull();

    const links = Array.from(container.querySelectorAll('nav[aria-label="一级导航"] a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/procure',
      '/depot',
      '/mix',
      '/workbench',
      '/settings',
    ]);
    const labels = ['采购', '仓库', '调漆台', '工作台', '设置'];
    links.forEach((link, index) => {
      expect(link.textContent ?? '').toContain(labels[index]);
    });

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('2.3.0：打开应用时三色条扫过、内容区通电（动效类挂在正确的外壳元素上）', () => {
    const { container } = renderShell('/procure');
    const tristrip = container.querySelector('.ef-tristrip');
    const main = container.querySelector('main');
    expect(tristrip?.classList.contains('ef-in-sweep')).toBe(true);
    expect(main?.classList.contains('ef-page-boot')).toBe(true);
    expect(container.querySelector('.ef-cmd')).not.toBeNull();
    expect(container.querySelector('.ef-status')).not.toBeNull();
  });

  it('顶部状态栏：撤销/反撤销带 (n/3) 计数，n=0 时禁用并带 title', () => {
    const { container } = renderShell('/procure');
    const undo = container.querySelector('[data-action="undo"]') as HTMLButtonElement | null;
    const redo = container.querySelector('[data-action="redo"]') as HTMLButtonElement | null;

    expect(undo).not.toBeNull();
    expect(redo).not.toBeNull();
    if (!undo || !redo) return;

    expect(undo.textContent ?? '').toContain('(0/3)');
    expect(redo.textContent ?? '').toContain('(0/3)');
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    expect((undo.getAttribute('title') ?? '').length).toBeGreaterThan(0);

    const clock = container.querySelector('time')?.textContent ?? '';
    expect(clock).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(container.querySelector('[data-slot="breadcrumb"]')).not.toBeNull();
  });
});
