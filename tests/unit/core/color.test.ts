import { describe, expect, it } from 'vitest';
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  hueBucket,
  isAchromatic,
  lightnessBucket,
  mixHex,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
} from '@/core/math/color';

/** spec 5.3 (1121-1133) / 3.4.3:472 / 7.2 color.test */
describe('color · hex ↔ rgb', () => {
  it('解析 #RRGGBB', () => {
    expect(hexToRgb('#336699')).toEqual([51, 102, 153]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
  });

  it('接受不带 # 与 3 位缩写', () => {
    expect(hexToRgb('336699')).toEqual([51, 102, 153]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#abc')).toEqual([170, 187, 204]);
  });

  it('rgbToHex 补零并小写', () => {
    expect(rgbToHex(51, 102, 153)).toBe('#336699');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(1, 2, 3)).toBe('#010203');
  });

  it('rgbToHex 把越界值钳制到 0–255', () => {
    expect(rgbToHex(300, -20, 127.6)).toBe('#ff0080');
  });

  it('hex -> rgb -> hex 往返不丢信息', () => {
    for (const hex of ['#336699', '#abcdef', '#000000', '#ffffff', '#7f2020']) {
      const [r, g, b] = hexToRgb(hex);
      expect(rgbToHex(r, g, b)).toBe(hex);
    }
  });
});

describe('color · rgb ↔ hsl', () => {
  it('基色换算', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(0, 255, 0)).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(0, 0, 255)).toEqual({ h: 240, s: 100, l: 50 });
  });

  it('灰度 s = 0', () => {
    expect(rgbToHsl(128, 128, 128)).toEqual({ h: 0, s: 0, l: 50 });
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 });
  });

  it('#336699 的 HSL 为 210/50/40', () => {
    expect(hexToHsl('#336699')).toEqual({ h: 210, s: 50, l: 40 });
  });

  it('hsl -> rgb -> hsl 往返（基色精确）', () => {
    expect(hslToRgb(210, 50, 40)).toEqual([51, 102, 153]);
    expect(hslToHex(210, 50, 40)).toBe('#336699');
    expect(hslToHex(0, 0, 50)).toBe('#808080');
  });

  it('hsl 负色相按 360 环绕', () => {
    expect(hslToHex(-30, 100, 50)).toBe('#ff0080');
    expect(hslToHex(330, 100, 50)).toBe(hslToHex(-30, 100, 50));
  });

  it('hex -> hsl -> hex 往返（允许取整误差 <= 2/255）', () => {
    for (const hex of ['#336699', '#7f2020', '#22aa55', '#888888']) {
      const { h, s, l } = hexToHsl(hex);
      const back = hslToHex(h, s, l);
      const a = hexToRgb(hex);
      const b = hexToRgb(back);
      for (let i = 0; i < 3; i += 1) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(2);
    }
  });
});

describe('color · mixHex 按体积加权（3.4.3:472）', () => {
  it('等体积黑白混合取中点 128', () => {
    expect(
      mixHex([
        { hex: '#000000', ml: 10, paintClass: 'solid' },
        { hex: '#ffffff', ml: 10, paintClass: 'solid' },
      ]),
    ).toBe('#808080');
  });

  it('按体积加权而非算术平均', () => {
    expect(
      mixHex([
        { hex: '#000000', ml: 10, paintClass: 'solid' },
        { hex: '#ffffff', ml: 30, paintClass: 'solid' },
      ]),
    ).toBe('#bfbfbf');
  });

  it('clear 组分权重减半（透明度感知补偿）', () => {
    expect(
      mixHex([
        { hex: '#ffffff', ml: 10, paintClass: 'solid' },
        { hex: '#000000', ml: 10, paintClass: 'clear' },
      ]),
    ).toBe('#aaaaaa');
  });

  it('clear 与 solid 的权重差异确实改变结果', () => {
    const withClear = mixHex([
      { hex: '#ffffff', ml: 10, paintClass: 'solid' },
      { hex: '#000000', ml: 10, paintClass: 'clear' },
    ]);
    const bothSolid = mixHex([
      { hex: '#ffffff', ml: 10, paintClass: 'solid' },
      { hex: '#000000', ml: 10, paintClass: 'solid' },
    ]);
    expect(withClear).not.toBe(bothSolid);
    expect(hexToRgb(withClear)[0]).toBeGreaterThan(hexToRgb(bothSolid)[0]);
  });

  it('单一组分原样返回', () => {
    expect(mixHex([{ hex: '#336699', ml: 12.4, paintClass: 'solid' }])).toBe('#336699');
  });

  it('空组分列表回退为白', () => {
    expect(mixHex([])).toBe('#ffffff');
  });

  it('三分量加权', () => {
    expect(
      mixHex([
        { hex: '#ff0000', ml: 10, paintClass: 'solid' },
        { hex: '#00ff00', ml: 10, paintClass: 'solid' },
        { hex: '#0000ff', ml: 10, paintClass: 'solid' },
      ]),
    ).toBe('#555555');
  });
});

describe('color · 色环分档（3.3 分组）', () => {
  it('isAchromatic 以 S < 8% 为灰', () => {
    expect(isAchromatic('#808080')).toBe(true);
    expect(isAchromatic('#ffffff')).toBe(true);
    expect(isAchromatic('#336699')).toBe(false);
    expect(isAchromatic('#7f2020')).toBe(false);
  });

  it('hueBucket 为 12 档（每 30°）', () => {
    expect(hueBucket('#ff0000')).toBe(0);
    expect(hueBucket('#ffff00')).toBe(2);
    expect(hueBucket('#00ff00')).toBe(4);
    expect(hueBucket('#00ffff')).toBe(6);
    expect(hueBucket('#0000ff')).toBe(8);
    expect(hueBucket('#336699')).toBe(7);
  });

  it('lightnessBucket 为 5 档且封顶 4', () => {
    expect(lightnessBucket('#000000')).toBe(0);
    expect(lightnessBucket('#808080')).toBe(2);
    expect(lightnessBucket('#cc0000')).toBe(2);
    expect(lightnessBucket('#ffffff')).toBe(4);
  });

  it('relativeLuminance 单调且端点正确', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2158, 3);
  });
});
