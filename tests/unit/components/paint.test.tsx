import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import { swatchStyle } from '@/core/render/swatch';
import { PaintMeta, PaintRow, PaintSwatch, PaintTile, StockBar } from '@/components/paint';

const brand: Brand = {
  id: 'gs',
  name: 'Mr.Color',
  nameZh: '郡士',
  shortName: 'GSI',
  aliases: [],
  accentHex: '#c8102e',
  country: 'JP',
  sort: 1,
};

const mrColor: PaintLine = {
  id: 'gs-mr-color',
  brandId: 'gs',
  name: 'Mr.Color',
  nameZh: '郡士油性漆',
  packaging: 'pot',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
};

const solid: Paint = {
  id: 'p-c80',
  lineId: 'gs-mr-color',
  brandId: 'gs',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const clear: Paint = { ...solid, id: 'p-clear', code: 'C-clear', paintClass: 'clear', hex: '#7FB2D9' };

/** 辅助料：稀释剂，category ≠ color，光泽位必须显示 —（AC-15） */
const aux: Paint = {
  ...solid,
  id: 'p-thinner',
  code: 'T-101',
  name: 'Thinner',
  nameZh: '稀释剂',
  hex: '#B8B8B8',
  paintClass: 'aux',
  category: 'thinner',
  finish: 'gloss',
};

const stock = { volumeMl: 12.4, initialMl: 17 };

function descOf(container: HTMLElement): string {
  const el = container.querySelector('[data-paint-desc]');
  expect(el).not.toBeNull();
  return el?.textContent ?? '';
}

describe('AC-15 中文属性行', () => {
  it('实色行第二行严格等于「油性 · 光泽 · 实色」', () => {
    const { container } = render(<PaintRow paint={solid} line={mrColor} brand={brand} stock={stock} />);
    expect(descOf(container)).toBe('油性 · 光泽 · 实色');
  });

  it('aux 品第二行严格等于「油性 · — · 辅助」且不出现「光泽」', () => {
    const { container } = render(<PaintRow paint={aux} line={mrColor} brand={brand} stock={stock} />);
    expect(descOf(container)).toBe('油性 · — · 辅助');
    expect(container.textContent ?? '').not.toContain('光泽');
  });

  it('PaintMeta / PaintTile 复用同一属性行文案', () => {
    const meta = render(<PaintMeta paint={aux} line={mrColor} brand={brand} />);
    expect(descOf(meta.container)).toBe('油性 · — · 辅助');

    const tile = render(<PaintTile paint={solid} line={mrColor} brand={brand} />);
    expect(descOf(tile.container)).toBe('油性 · 光泽 · 实色');
    expect(tile.container.textContent ?? '').toContain('钴蓝');
    expect(tile.container.textContent ?? '').toContain('C80');
  });
});

describe('AC-06 三档透明度', () => {
  it('solid / clear / aux 计算样式为 1、0.4、0.7，aux 背景为 #FFF', () => {
    const { container } = render(
      <div>
        <PaintSwatch hex={solid.hex} paintClass="solid" size={36} />
        <PaintSwatch hex={clear.hex} paintClass="clear" size={36} />
        <PaintSwatch hex="#123456" paintClass="aux" size={36} />
      </div>,
    );

    const fills = Array.from(container.querySelectorAll('[data-swatch-fill]')) as HTMLElement[];
    expect(fills).toHaveLength(3);

    const [solidFill, clearFill, auxFill] = fills;

    expect(Number(window.getComputedStyle(solidFill).opacity)).toBe(1);
    expect(Number(window.getComputedStyle(clearFill).opacity)).toBe(0.4);
    expect(Number(window.getComputedStyle(auxFill).opacity)).toBe(0.7);

    expect(window.getComputedStyle(auxFill).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(window.getComputedStyle(solidFill).backgroundColor).toBe('rgb(46, 94, 159)');

    // 与 core 的唯一实现保持一致
    expect(swatchStyle(solid.hex, 'solid')).toEqual({ background: solid.hex, opacity: 1 });
    expect(swatchStyle(clear.hex, 'clear').opacity).toBe(0.4);
    expect(swatchStyle('#123456', 'aux')).toEqual({ background: '#FFFFFF', opacity: 0.7 });
  });

  it('色块落在 tex-grid 网点底板上并带 1px 描边', () => {
    const { container } = render(<PaintSwatch hex={solid.hex} paintClass="clear" size={36} />);
    const block = container.querySelector('[data-swatch]');
    expect(block?.className).toContain('tex-grid');
    expect(container.querySelector('[data-swatch-ring]')).not.toBeNull();
  });

  it('< 24px 降级为实心圆点（不使用半透明）', () => {
    const { container } = render(<PaintSwatch hex={solid.hex} paintClass="clear" size={16} />);
    const dot = container.querySelector('[data-swatch]');
    expect(dot?.getAttribute('data-swatch')).toBe('dot');
    expect(container.querySelector('[data-swatch-ring]')).toBeNull();
    const fill = container.querySelector('[data-swatch-fill]') as HTMLElement;
    expect(window.getComputedStyle(fill).opacity).toBe('1');
    expect(window.getComputedStyle(fill).backgroundColor).toBe('rgb(46, 94, 159)');
  });
});

describe('StockBar', () => {
  it('按 余量/初始量 给宽度，低库存标记末端红块', () => {
    const ok = render(<StockBar volumeMl={12.4} initialMl={17} />);
    const okFill = ok.container.querySelector('[data-stock-fill]') as HTMLElement;
    expect(okFill.style.width).toBe('73%');
    expect(ok.container.querySelector('[data-stock-low-mark]')).toBeNull();

    const low = render(<StockBar volumeMl={1} initialMl={20} />);
    expect(low.container.querySelector('[data-stock-low-mark]')).not.toBeNull();
  });
});

describe('PaintRow 结构', () => {
  it('可键盘聚焦、aria-selected、余量读数与注册数徽标', () => {
    const { container } = render(
      <PaintRow paint={solid} line={mrColor} brand={brand} stock={stock} registeredCount={1} selected />,
    );
    const row = container.querySelector('[data-paint-row]') as HTMLElement;
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.getAttribute('aria-label')).toContain('钴蓝');
    expect(container.textContent ?? '').toContain('12.4/17.0 ml');
    expect(container.textContent ?? '').toContain('已登记×1');
  });

  it('空瓶行整行淡化并出现「空」徽标', () => {
    const { container } = render(
      <PaintRow paint={solid} line={mrColor} brand={brand} stock={{ volumeMl: 0, initialMl: 17 }} />,
    );
    const row = container.querySelector('[data-paint-row]') as HTMLElement;
    expect(row.className).toContain('opacity-50');
    expect(row.getAttribute('data-empty')).toBe('');
    expect(container.textContent ?? '').toContain('空');
  });
});
