import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  BottleSchema,
  DEFAULT_SETTINGS_VALIDATED,
  GroupSchema,
  HexSchema,
  PaintSchema,
  RatioNSchema,
  SettingsSchema,
  StockItemSchema,
  WorkbenchSchema,
  parseOrErrors,
} from '@/core/model/schemas';
import type { ValidationResult } from '@/core/model/schemas';
import { DEFAULT_SETTINGS } from '@/core/model/types';

const pathsOf = (r: ValidationResult<unknown>): string[] => (r.ok ? [] : r.errors.map((e) => e.path));
const messagesOf = (r: ValidationResult<unknown>): string[] =>
  r.ok ? [] : r.errors.map((e) => e.message);

const stockItem = {
  id: 's1',
  paintId: 'p1',
  volumeMl: 12.4,
  initialMl: 17,
  state: 'neat' as const,
  groupId: null,
  origin: 'custom' as const,
  createdAt: 1700000000000,
};

const bottle = {
  id: 'b1',
  name: '测试瓶',
  capacityMl: 60,
  baselineMl: 60,
  remainingMl: 40,
  ratioN: 2,
  paintClass: 'solid' as const,
  hex: '#336699',
  components: [],
  levelMode: 'baseline' as const,
  updatedAt: 1700000000000,
};

/** spec 6.1 / 6.2 (1424-1432) / 3.7.4 / 7.2 schemas.test */
describe('schemas · HexSchema', () => {
  it('接受 #RRGGBB', () => {
    expect(HexSchema.parse('#AABBCC')).toBe('#AABBCC');
    expect(parseOrErrors(HexSchema, '#336699').ok).toBe(true);
  });

  it('拒绝非法 hex', () => {
    expect(() => HexSchema.parse('#GGGGGG')).toThrow();
    expect(() => HexSchema.parse('#abc')).toThrow();
    expect(() => HexSchema.parse('336699')).toThrow();
    expect(messagesOf(parseOrErrors(HexSchema, '#12345'))).toContain('色值必须是 #RRGGBB');
  });
});

describe('schemas · GroupSchema 名称与深度', () => {
  const group = { id: 'g1', name: '油性', parentId: null, depth: 1 as const, sort: 0 };

  it('16 字以内合法', () => {
    expect(parseOrErrors(GroupSchema, { ...group, name: '一二三四五六七八九十一二三四五六' }).ok).toBe(
      true,
    );
  });

  it('超过 16 字被拒', () => {
    const r = parseOrErrors(GroupSchema, { ...group, name: '一'.repeat(17) });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('name');
    expect(messagesOf(r)).toContain('最多 16 字');
  });

  it('空名被拒（trim 后为空）', () => {
    const r = parseOrErrors(GroupSchema, { ...group, name: '   ' });
    expect(r.ok).toBe(false);
    expect(messagesOf(r)).toContain('不能为空');
  });

  it('depth 只能是 1/2/3', () => {
    expect(parseOrErrors(GroupSchema, { ...group, depth: 2 }).ok).toBe(true);
    expect(parseOrErrors(GroupSchema, { ...group, depth: 4 }).ok).toBe(false);
  });
});

describe('schemas · RatioNSchema 0–10', () => {
  it('边界合法', () => {
    expect(RatioNSchema.parse(0)).toBe(0);
    expect(RatioNSchema.parse(10)).toBe(10);
    expect(RatioNSchema.parse(2.5)).toBe(2.5);
  });

  it('N > 10 被拒', () => {
    const r = parseOrErrors(RatioNSchema, 10.1);
    expect(r.ok).toBe(false);
    expect(messagesOf(r)).toContain('比例不能大于 10');
  });

  it('负数被拒', () => {
    const r = parseOrErrors(RatioNSchema, -0.1);
    expect(r.ok).toBe(false);
    expect(messagesOf(r)).toContain('比例不能小于 0');
  });
});

describe('schemas · StockItemSchema', () => {
  it('合法条目通过', () => {
    const r = parseOrErrors(StockItemSchema, stockItem);
    expect(r.ok).toBe(true);
  });

  it('容量越界：初始量 < 0.5 与 > 2500 被拒', () => {
    expect(messagesOf(parseOrErrors(StockItemSchema, { ...stockItem, initialMl: 0.1 }))).toContain(
      '规格至少 0.5 ml',
    );
    expect(messagesOf(parseOrErrors(StockItemSchema, { ...stockItem, initialMl: 2500.5 }))).toContain(
      '规格最多 2500 ml',
    );
  });

  it('volumeMl 超过 initialMl 被拒', () => {
    const r = parseOrErrors(StockItemSchema, { ...stockItem, volumeMl: 18 });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('volumeMl');
    expect(messagesOf(r)).toContain('余量不能超过初始量');
  });

  it('负余量被拒', () => {
    const r = parseOrErrors(StockItemSchema, { ...stockItem, volumeMl: -1 });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('volumeMl');
  });

  it('thinned 缺 ratioN 被拒', () => {
    const r = parseOrErrors(StockItemSchema, { ...stockItem, state: 'thinned' });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('ratioN');
    expect(messagesOf(r)).toContain('稀释状态必须填写比例');
  });

  it('thinned 带 ratioN 合法', () => {
    expect(parseOrErrors(StockItemSchema, { ...stockItem, state: 'thinned', ratioN: 2 }).ok).toBe(
      true,
    );
  });
});

describe('schemas · BottleSchema 容量越界', () => {
  it('合法瓶通过', () => {
    expect(parseOrErrors(BottleSchema, bottle).ok).toBe(true);
  });

  it('容量必须为 5–2500 的整数', () => {
    expect(pathsOf(parseOrErrors(BottleSchema, { ...bottle, capacityMl: 3000 }))).toContain(
      'capacityMl',
    );
    expect(pathsOf(parseOrErrors(BottleSchema, { ...bottle, capacityMl: 4 }))).toContain(
      'capacityMl',
    );
    expect(pathsOf(parseOrErrors(BottleSchema, { ...bottle, capacityMl: 4.5 }))).toContain(
      'capacityMl',
    );
  });

  it('remaining > baseline 被拒', () => {
    const r = parseOrErrors(BottleSchema, { ...bottle, remainingMl: 61 });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('remainingMl');
    expect(messagesOf(r)).toContain('余量不能超过基准量');
  });

  it('baseline > capacity 被拒', () => {
    const r = parseOrErrors(BottleSchema, { ...bottle, baselineMl: 100, remainingMl: 40 });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('baselineMl');
    expect(messagesOf(r)).toContain('基准量不能超过瓶容量');
  });

  it('超长瓶名被拒', () => {
    const r = parseOrErrors(BottleSchema, { ...bottle, name: '瓶'.repeat(17) });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('name');
  });
});

describe('schemas · PaintSchema / WorkbenchSchema', () => {
  const paint = {
    id: 'p1',
    lineId: 'l1',
    brandId: 'br1',
    name: 'Cobalt Blue',
    hex: '#336699',
    paintClass: 'solid' as const,
    category: 'color' as const,
    origin: 'seed' as const,
  };

  it('非法 hex 被拒', () => {
    expect(pathsOf(parseOrErrors(PaintSchema, { ...paint, hex: 'blue' }))).toContain('hex');
  });

  it('opacityOverride 必须在 0–1', () => {
    expect(pathsOf(parseOrErrors(PaintSchema, { ...paint, opacityOverride: 1.5 }))).toContain(
      'opacityOverride',
    );
    expect(parseOrErrors(PaintSchema, { ...paint, opacityOverride: 0.4 }).ok).toBe(true);
  });

  it('未知字段被剥离而非报错', () => {
    const r = parseOrErrors(PaintSchema, { ...paint, evil: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect('evil' in (r.data as Record<string, unknown>)).toBe(false);
  });

  it('工作台备注超过 60 字被拒', () => {
    const ws = { id: 'w1', name: '工作台 A', accent: '#336699', sort: 0, createdAt: 1 };
    expect(parseOrErrors(WorkbenchSchema, ws).ok).toBe(true);
    const r = parseOrErrors(WorkbenchSchema, { ...ws, note: '备'.repeat(61) });
    expect(pathsOf(r)).toContain('note');
  });
});

describe('schemas · SettingsSchema', () => {
  it('默认设置合法（spec 3.9）', () => {
    expect(DEFAULT_SETTINGS_VALIDATED.undoDepth).toBe(3);
    expect(DEFAULT_SETTINGS_VALIDATED.levelMode).toBe('baseline');
    expect(parseOrErrors(SettingsSchema, DEFAULT_SETTINGS).ok).toBe(true);
  });

  it('undoDepth 越界被拒', () => {
    expect(pathsOf(parseOrErrors(SettingsSchema, { ...DEFAULT_SETTINGS, undoDepth: 2 }))).toContain(
      'undoDepth',
    );
    expect(
      pathsOf(parseOrErrors(SettingsSchema, { ...DEFAULT_SETTINGS, undoDepth: 21 })),
    ).toContain('undoDepth');
  });
});

describe('schemas · parseOrErrors 返回结构化错误而非抛异常（3.7.4）', () => {
  it('成功时返回 { ok: true, data }', () => {
    const r = parseOrErrors(HexSchema, '#AABBCC');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe('#AABBCC');
  });

  it('失败时不抛异常，返回 { ok: false, errors }', () => {
    expect(() => parseOrErrors(HexSchema, 'nope')).not.toThrow();
    const r = parseOrErrors(HexSchema, 'nope');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Array.isArray(r.errors)).toBe(true);
      expect(r.errors[0]).toEqual({ path: '', message: '色值必须是 #RRGGBB' });
    }
  });

  it('嵌套路径以点号拼接', () => {
    const r = parseOrErrors(BottleSchema, {
      ...bottle,
      components: [
        {
          stockItemId: 's1',
          paintId: 'p1',
          neatMl: 16.6,
          brandId: 'br1',
          name: 'C80',
          hex: 'bad',
          paintClass: 'solid',
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toContain('components.0.hex');
  });

  it('非对象输入也返回结构化错误', () => {
    const r = parseOrErrors(z.object({ a: z.number() }), { a: 'x' });
    expect(r.ok).toBe(false);
    expect(pathsOf(r)).toEqual(['a']);
  });
});
