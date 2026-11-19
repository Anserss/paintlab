import { describe, expect, it } from 'vitest';
import type { BatchPart, StockItem } from '@/core/model/types';
import {
  formulaKeyOfParts,
  formulaLabel,
  formulaPartKey,
  mergeFormulaParts,
  stockFormulaKey,
} from '@/core/rules/formula';

const part = (patch: Partial<BatchPart>): BatchPart => ({
  paintId: 'gsi-c80',
  brandId: 'gsi',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  ml: 10,
  state: 'neat',
  ...patch,
});

describe('2.2 配方签名：同配方只看组分身份 + 比例（不看批次大小）', () => {
  it('10+10 与 20+20 是同一配方；顺序不影响', () => {
    const a = [part({ paintId: 'a', ml: 10 }), part({ paintId: 'b', ml: 10 })];
    const b = [part({ paintId: 'b', ml: 20 }), part({ paintId: 'a', ml: 20 })];
    expect(formulaKeyOfParts(a)).not.toBeNull();
    expect(formulaKeyOfParts(a)).toBe(formulaKeyOfParts(b));
  });

  it('比例不同 → 签名不同', () => {
    const a = [part({ paintId: 'a', ml: 10 }), part({ paintId: 'b', ml: 10 })];
    const b = [part({ paintId: 'a', ml: 10 }), part({ paintId: 'b', ml: 20 })];
    expect(formulaKeyOfParts(a)).not.toBe(formulaKeyOfParts(b));
  });

  it('稀释漆料带 state/ratio，1:2 与 1:3 不合并', () => {
    const a = [part({ paintId: 'a', ml: 10 }), part({ paintId: 't', ml: 20, paintClass: 'aux', aux: true })];
    const b = [part({ paintId: 'a', ml: 10 }), part({ paintId: 't', ml: 30, paintClass: 'aux', aux: true })];
    expect(formulaKeyOfParts(a)).not.toBe(formulaKeyOfParts(b));
  });

  it('调漆产物作为组分：sourceKey 区分同一原浆打底的不同混合漆', () => {
    const a = [part({ paintId: 'base', ml: 10, state: 'thinned', ratioN: 2, sourceKey: 'f:one' })];
    const b = [part({ paintId: 'base', ml: 10, state: 'thinned', ratioN: 2, sourceKey: 'f:two' })];
    expect(formulaKeyOfParts(a)).not.toBe(formulaKeyOfParts(b));
  });

  it('没有组分 / 总量为 0 → null（不参与合并）', () => {
    expect(formulaKeyOfParts([])).toBeNull();
    expect(formulaKeyOfParts(undefined)).toBeNull();
    expect(formulaKeyOfParts([part({ ml: 0 })])).toBeNull();
  });
});

describe('2.2 组分合并与旧数据签名', () => {
  it('mergeFormulaParts 同组分 ml 相加，新组分追加', () => {
    const target = [part({ paintId: 'a', ml: 10 }), part({ paintId: 'b', ml: 10 })];
    const incoming = [part({ paintId: 'b', ml: 5 }), part({ paintId: 'c', ml: 5 })];
    const merged = mergeFormulaParts(target, incoming) ?? [];
    expect(merged).toHaveLength(3);
    expect(merged.find((row) => row.paintId === 'a')?.ml).toBe(10);
    expect(merged.find((row) => row.paintId === 'b')?.ml).toBe(15);
    expect(merged.find((row) => row.paintId === 'c')?.ml).toBe(5);
    expect(formulaPartKey(merged[0])).toContain('p:');
  });

  it('stockFormulaKey：mixKey > parts > 稀释比例 > 原浆 id', () => {
    const base: StockItem = {
      id: 's1',
      paintId: 'gsi-c80',
      volumeMl: 30,
      initialMl: 30,
      state: 'thinned',
      ratioN: 2,
      groupId: null,
      origin: 'mixed',
      createdAt: 1,
    };
    expect(stockFormulaKey(base)).toBe('p:gsi-c80@2');
    expect(stockFormulaKey({ ...base, parts: [part({ ml: 10 })] })).toContain('f:');
    expect(stockFormulaKey({ ...base, mixKey: 'f:custom' })).toBe('f:custom');
  });

  it('配方说明截断到 80 字', () => {
    const label = formulaLabel(
      Array.from({ length: 12 }, (_, index) => part({ paintId: 'p' + index, name: '很长的漆料名字' + index, ml: 10 })),
    );
    expect(label).not.toBeNull();
    expect((label as string).length).toBeLessThanOrEqual(80);
  });
});
