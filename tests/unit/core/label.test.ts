import { describe, expect, it } from 'vitest';
import type { Finish, PaintClass, Solvent } from '@/core/model/types';
import {
  CATEGORY_ZH,
  CLASS_ZH,
  FINISH_ZH,
  SOLVENT_ZH,
  classZh,
  codeOrDash,
  effectiveFinish,
  finishZh,
  paintDescription,
  paintOriginLine,
  paintTitle,
  solventZh,
} from '@/core/render/label';

/** spec 2.3.1 / 7.1 AC-15 / 7.2 label.test */
describe('label · 词表是唯一真相', () => {
  it('溶剂三值且顺序固定', () => {
    expect(Object.keys(SOLVENT_ZH)).toEqual(['oil', 'water', 'na']);
    expect(SOLVENT_ZH.oil).toBe('油性');
    expect(SOLVENT_ZH.water).toBe('水性');
    expect(SOLVENT_ZH.na).toBe('免稀释');
  });

  it('漆类三值', () => {
    expect(CLASS_ZH).toEqual({ solid: '实色', clear: '透明', aux: '辅助' });
  });

  it('光泽度词表共 12 项且顺序固定', () => {
    expect(Object.keys(FINISH_ZH)).toEqual([
      'gloss',
      'semiGloss',
      'matte',
      'metal',
      'pearl',
      'clear',
      'fluorescent',
      'primer',
      'additive',
      'wash',
      'ink',
      'other',
    ]);
    expect(FINISH_ZH.gloss).toBe('光泽');
    expect(FINISH_ZH.semiGloss).toBe('半光');
    expect(FINISH_ZH.matte).toBe('消光');
  });

  it('分类词表覆盖 10 项', () => {
    expect(Object.keys(CATEGORY_ZH)).toHaveLength(10);
    expect(CATEGORY_ZH.thinner).toBe('稀释剂');
    expect(CATEGORY_ZH.surfacer).toBe('补土');
  });
});

describe('label · paintDescription 顺序固定（AC-15）', () => {
  it('AC-15: 油性 · 光泽 · 实色', () => {
    expect(
      paintDescription(
        { finish: 'gloss', paintClass: 'solid' },
        { solvent: 'oil', defaultFinish: 'gloss' },
      ),
    ).toBe('油性 · 光泽 · 实色');
  });

  it('AC-15: aux 的光泽位用 — 占位，不得出现"光泽"', () => {
    const text = paintDescription(
      { finish: 'gloss', paintClass: 'aux' },
      { solvent: 'oil', defaultFinish: 'gloss' },
    );
    expect(text).toBe('油性 · — · 辅助');
    expect(text).not.toContain('光泽');
  });

  it('顺序恒为 溶剂 · 光泽 · 漆类（水性/消光/透明）', () => {
    expect(
      paintDescription(
        { finish: 'matte', paintClass: 'clear' },
        { solvent: 'water', defaultFinish: 'matte' },
      ),
    ).toBe('水性 · 消光 · 透明');
  });

  it('paint.finish 缺省时回退到产品线 defaultFinish', () => {
    expect(
      paintDescription({ paintClass: 'solid' }, { solvent: 'water', defaultFinish: 'matte' }),
    ).toBe('水性 · 消光 · 实色');
  });

  it('paint.finish 优先于产品线默认值', () => {
    expect(
      effectiveFinish({ finish: 'metal' }, { defaultFinish: 'gloss' }),
    ).toBe('metal');
    expect(effectiveFinish({}, { defaultFinish: 'gloss' })).toBe('gloss');
  });
});

describe('label · 未知枚举回退为 — 而不抛错（7.2 要求）', () => {
  it('溶剂未知值', () => {
    expect(solventZh('lacquer' as unknown as Solvent)).toBe('—');
    expect(solventZh(undefined)).toBe('—');
  });

  it('光泽度未知值', () => {
    expect(finishZh('metallic' as unknown as Finish)).toBe('—');
    expect(finishZh(undefined)).toBe('—');
  });

  it('漆类未知值', () => {
    expect(classZh('unknown' as unknown as PaintClass)).toBe('—');
    expect(classZh(undefined)).toBe('—');
  });

  it('未知枚举不抛异常', () => {
    expect(() => solventZh('x' as unknown as Solvent)).not.toThrow();
    expect(() => finishZh('x' as unknown as Finish)).not.toThrow();
    expect(() => classZh('x' as unknown as PaintClass)).not.toThrow();
    expect(() =>
      paintDescription(
        { finish: 'x' as unknown as Finish, paintClass: 'solid' },
        { solvent: 'y' as unknown as Solvent, defaultFinish: 'x' as unknown as Finish },
      ),
    ).not.toThrow();
  });

  it('未知枚举在整行里也降级为 —', () => {
    expect(
      paintDescription(
        { finish: 'x' as unknown as Finish, paintClass: 'solid' },
        { solvent: 'y' as unknown as Solvent, defaultFinish: 'z' as unknown as Finish },
      ),
    ).toBe('— · — · 实色');
  });
});

describe('label · 名称与来源行', () => {
  it('中文名优先，英文名降为次要', () => {
    expect(paintTitle({ name: 'Cobalt Blue', nameZh: '钴蓝' })).toEqual({
      primary: '钴蓝',
      secondary: 'Cobalt Blue',
    });
    expect(paintTitle({ name: 'Cobalt Blue' })).toEqual({ primary: 'Cobalt Blue' });
  });

  it('来源行 = 品牌 · 产品线，缺失用 — 占位', () => {
    expect(paintOriginLine('郡士', 'Mr.Color')).toBe('郡士 · Mr.Color');
    expect(paintOriginLine(undefined, undefined)).toBe('— · —');
    expect(paintOriginLine('郡士', undefined)).toBe('郡士 · —');
  });

  it('色号空串/纯空格回退为 —', () => {
    expect(codeOrDash('C80')).toBe('C80');
    expect(codeOrDash('   ')).toBe('—');
    expect(codeOrDash('')).toBe('—');
    expect(codeOrDash(undefined)).toBe('—');
  });
});
