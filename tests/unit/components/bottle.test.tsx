import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Bottle } from '@/core/model/types';
import {
  levelFraction,
  levelReading,
  liquidHeight,
  fractionLabel,
  quantizeLevel,
  BOTTLE,
} from '@/core/render/bottle';
import { swatchAttrs } from '@/core/render/swatch';
import { BottleView } from '@/components/bottle';

/** AC-03 用户示例：上次 60 ml，用掉 20 ml */
const bottle: Bottle = {
  id: 'b-1',
  name: '钴蓝 1:2',
  capacityMl: 60,
  baselineMl: 60,
  remainingMl: 40,
  ratioN: 2,
  paintClass: 'solid',
  hex: '#2E5E9F',
  components: [],
  labelBrandId: 'gs',
  labelCode: 'C80',
  levelMode: 'baseline',
  updatedAt: 0,
};

const emptyBottle: Bottle = { ...bottle, id: 'b-2', remainingMl: 0 };

describe('AC-03 液位比例（用户示例）', () => {
  it('读数为「≈ 2/3（67%）」且液体高度 141px', () => {
    const { container } = render(<BottleView bottle={bottle} brandName="郡士" />);
    const svg = container.querySelector('[data-bottle-view]') as SVGSVGElement;
    const liquid = container.querySelector('[data-liquid]') as SVGRectElement;

    expect(svg.getAttribute('data-level-reading')).toBe('≈ 2/3（67%）');
    expect(svg.getAttribute('data-level-reading')).toBe(levelReading(levelFraction(40, 60, 60, 'baseline')));

    expect(liquid.getAttribute('height')).toBe('141');
    expect(liquid.getAttribute('height')).toBe(String(liquidHeight(levelFraction(40, 60, 60, 'baseline'))));
    expect(liquid.getAttribute('y')).toBe('201');
    expect(Number(liquid.getAttribute('y')) + Number(liquid.getAttribute('height'))).toBe(BOTTLE.innerBottom);

    expect(container.textContent ?? '').toContain('≈ 2/3');
    expect(container.textContent ?? '').toContain('67%');
    expect(fractionLabel(quantizeLevel(levelFraction(40, 60, 60, 'baseline')))).toBe('2/3');
  });

  it('液体颜色与透明度来自 core（2.3 同一条规则）', () => {
    const { container } = render(<BottleView bottle={{ ...bottle, paintClass: 'clear' }} brandName="郡士" />);
    const liquid = container.querySelector('[data-liquid]') as SVGRectElement;
    const attrs = swatchAttrs('#2E5E9F', 'clear');
    expect(liquid.getAttribute('fill')).toBe(attrs.fill);
    expect(Number(liquid.getAttribute('opacity'))).toBe(0.4);
  });

  it('顶部信息牌承载品牌 / 色号 / 名称 / 余量，且位于瓶身之上', () => {
    const { container } = render(<BottleView bottle={bottle} brandName="郡士" />);
    const label = container.querySelector('[data-bottle-label]');
    expect(label).not.toBeNull();
    const text = label?.textContent ?? '';
    expect(text).toContain('郡士');
    expect(text).toContain('C80');
    expect(text).toContain('钴蓝 1:2');
    expect(text).toContain('40.0/60.0 ml');
  });

  it('showTicks=false 时不渲染刻度层', () => {
    const on = render(<BottleView bottle={bottle} showTicks />);
    expect(on.container.querySelectorAll('[data-bottle-ticks] line')).toHaveLength(BOTTLE.ticks);
    const off = render(<BottleView bottle={bottle} showTicks={false} />);
    expect(off.container.querySelector('[data-bottle-ticks]')).toBeNull();
  });

  it('capacity 模式按容量计算比例', () => {
    const { container } = render(<BottleView bottle={bottle} levelMode="capacity" showTicks={false} />);
    const svg = container.querySelector('[data-bottle-view]') as SVGSVGElement;
    expect(svg.getAttribute('data-level-reading')).toBe(levelReading(40 / 60));
  });
});

describe('空瓶边界（3.4.4）', () => {
  it('remaining=0 时不渲染液体层，显示「空瓶 · 可归档」', () => {
    const { container } = render(<BottleView bottle={emptyBottle} brandName="郡士" />);
    expect(container.querySelector('[data-liquid]')).toBeNull();
    expect(container.querySelector('[data-liquid-layer]')).toBeNull();
    expect(container.textContent ?? '').toContain('空瓶 · 可归档');
    expect(container.querySelector('[data-bottle-view]')?.getAttribute('data-empty')).toBe('');
  });
});
