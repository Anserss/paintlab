import { describe, expect, it } from 'vitest';
import {
  SWATCH_BED_CLASS,
  SWATCH_RING_STYLE,
  swatchAttrs,
  swatchDotColor,
  swatchStyle,
} from '@/core/render/swatch';

/** spec 2.3 / 7.1 AC-06 三档透明度 */
describe('swatch · 三档映射（AC-06）', () => {
  it('solid 用原色、opacity 1', () => {
    expect(swatchStyle('#336699', 'solid')).toEqual({ background: '#336699', opacity: 1 });
  });

  it('clear 用原色、opacity 0.4', () => {
    expect(swatchStyle('#336699', 'clear')).toEqual({ background: '#336699', opacity: 0.4 });
  });

  it('aux 恒为白、opacity 0.7（与传入 hex 无关）', () => {
    expect(swatchStyle('#336699', 'aux')).toEqual({ background: '#FFFFFF', opacity: 0.7 });
    expect(swatchStyle('#000000', 'aux')).toEqual({ background: '#FFFFFF', opacity: 0.7 });
  });

  it('aux 的三档判定不受色值影响（白/黑/灰一致）', () => {
    for (const hex of ['#FFFFFF', '#000000', '#808080', '#ff00ff']) {
      expect(swatchStyle(hex, 'aux').background).toBe('#FFFFFF');
    }
  });
});

describe('swatch · SVG 属性直用', () => {
  it('swatchAttrs 与 swatchStyle 同源', () => {
    expect(swatchAttrs('#336699', 'solid')).toEqual({ fill: '#336699', opacity: 1 });
    expect(swatchAttrs('#336699', 'clear')).toEqual({ fill: '#336699', opacity: 0.4 });
    expect(swatchAttrs('#336699', 'aux')).toEqual({ fill: '#FFFFFF', opacity: 0.7 });
  });

  it('小色点用实心色，aux 为白（2.3 约束 4）', () => {
    expect(swatchDotColor('#336699', 'solid')).toBe('#336699');
    expect(swatchDotColor('#336699', 'clear')).toBe('#336699');
    expect(swatchDotColor('#336699', 'aux')).toBe('#FFFFFF');
  });
});

describe('swatch · 底板与描边常量（2.3 约束 1·2）', () => {
  it('半透明色块必须落在网点底板上', () => {
    expect(SWATCH_BED_CLASS).toBe('tex-grid');
  });

  it('固定 1px 白描边', () => {
    expect(SWATCH_RING_STYLE.boxShadow).toContain('inset');
    expect(SWATCH_RING_STYLE.boxShadow).toContain('1px');
    expect(SWATCH_RING_STYLE.boxShadow).toContain('var(--swatch-ring)');
  });
});
