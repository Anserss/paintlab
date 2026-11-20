import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheBundle,
  loadBrandBundle,
  normalizeBrandBundle,
  normalizeCatalogIndex,
  readCachedPaints,
} from '@/data/catalog';
import { createMemoryStore, setStore } from '@/data/db';
import type { DepotStore } from '@/data/db';

function readCatalog(name: string): unknown {
  const path = fileURLToPath(new URL('../../../public/catalog/' + name, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

let store: DepotStore;

beforeEach(() => {
  store = createMemoryStore();
  setStore(store);
});

describe('目录索引（首屏只取 index.json）', () => {
  it('归一化成 Brand 摘要，catalogVersion 取 version 或 generatedAt', () => {
    const raw = readCatalog('index.json');
    const result = normalizeCatalogIndex(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2.2.2：目录扩到 7 个品牌（郡士 / 匠域 / 盖亚 / 田宫 / 喵酱 / 星影 / 青鸟川）
    expect(result.data.brands.map((brand) => brand.id).sort()).toEqual([
      'gaia',
      'gsi',
      'hobbymio',
      'jy',
      'qnc',
      'sunin7',
      'tamiya',
    ]);
    expect(result.data.catalogVersion).toBe('2.2.2');
    const gsi = result.data.brands.find((brand) => brand.id === 'gsi');
    expect(gsi?.shortName).toBe('GSI');
    expect(gsi?.accentHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(gsi?.file).toBe('gsi.json');
    expect(gsi?.count).toBeGreaterThan(400);
    const gaia = result.data.brands.find((brand) => brand.id === 'gaia');
    expect(gaia?.nameZh).toBe('盖亚');
    expect(gaia?.count).toBeGreaterThan(150);
  });
});

describe('品牌包归一化（null -> undefined、aliases -> []、丢弃未知字段）', () => {
  it('真实 gsi.json 通过核心 PaintSchema / PaintLineSchema / BrandSchema 校验', () => {
    const raw = readCatalog('gsi.json');
    const result = normalizeBrandBundle(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bundle = result.data;

    expect(bundle.brand.id).toBe('gsi');
    expect(bundle.brand.aliases).toEqual([]);
    // 郡士 25 条产品线、476 条漆料（含按容量拆 SKU 的辅料；2.2.2 由 modkit-swatch 补了 8 条 Mr.COLOR 缺号）
    expect(bundle.lines).toHaveLength(25);
    expect(bundle.paints).toHaveLength(476);

    const first = bundle.paints[0];
    expect(first.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(first.nameZh).toBeTruthy();
    expect(first.origin).toBe('seed');
    expect(typeof first.volumeMl).toBe('number');
    // 未知字段仍被丢弃
    expect(Object.prototype.hasOwnProperty.call(first, 'format')).toBe(false);

    // 推定色值：hexEstimated 必须带进读模型，界面才能标注「≈ 推定色」
    expect(bundle.paints.some((paint) => paint.hexEstimated === true)).toBe(true);

    const aux = bundle.paints.find((paint) => paint.id === 'gsi-c30');
    expect(aux?.paintClass).toBe('aux');
    expect(aux?.category).toBe('matte');
    expect(aux?.volumeMl).toBe(10);
    expect(aux?.source).toBeTruthy();
  });

  it('校验失败时能定位到哪个 id 的哪个字段', () => {
    const raw = readCatalog('gsi.json') as { paints: Record<string, unknown>[] };
    raw.paints[0].hex = 'not-a-hex';
    const result = normalizeBrandBundle(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(raw.paints[0].id));
    expect(result.error).toContain('hex');
    expect(result.issues?.some((issue) => issue.path.includes('paints[0]'))).toBe(true);
  });

  it('懒加载 + 缓存进 brands / paints 表', async () => {
    const raw = readCatalog('gsi.json');
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => raw,
    })) as unknown as typeof fetch;

    const loaded = await loadBrandBundle('gsi', { fetchImpl, baseUrl: '/catalog' });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    await cacheBundle(store, loaded.data);
    expect((await store.brands.get('gsi'))?.shortName).toBe('GSI');
    expect(await readCachedPaints(store, 'gsi')).toHaveLength(476);
  });
});

describe('2.2.2 · 七个品牌包都能被 normalizeBrandBundle 吃下', () => {
  it('盖亚 / 田宫 / 喵酱 / 星影 / 青鸟川：每条漆都落在自己品牌的产品线上', () => {
    const cases: { file: string; brandId: string; linePrefix: string }[] = [
      { file: 'gaia.json', brandId: 'gaia', linePrefix: 'gaia-' },
      { file: 'tamiya.json', brandId: 'tamiya', linePrefix: 'tamiya-' },
      { file: 'hobbymio.json', brandId: 'hobbymio', linePrefix: 'hobbymio-' },
      { file: 'sunin7.json', brandId: 'sunin7', linePrefix: 'sunin7-' },
      { file: 'qnc.json', brandId: 'qnc', linePrefix: 'qnc-' },
    ];
    for (const item of cases) {
      const result = normalizeBrandBundle(readCatalog(item.file));
      expect(result.ok, item.file + ' 校验失败').toBe(true);
      if (!result.ok) continue;
      const bundle = result.data;
      expect(bundle.brand.id).toBe(item.brandId);
      expect(bundle.lines.length).toBeGreaterThan(0);
      expect(bundle.paints.length).toBeGreaterThan(0);
      const lineIds = new Set(bundle.lines.map((line) => line.id));
      for (const line of bundle.lines) {
        expect(line.id.startsWith(item.linePrefix)).toBe(true);
        expect(line.brandId).toBe(item.brandId);
      }
      for (const paint of bundle.paints) {
        expect(paint.brandId).toBe(item.brandId);
        expect(lineIds.has(paint.lineId)).toBe(true);
        expect(paint.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('新品牌的数量与产品线划分（modkit-swatch 591 条）', () => {
    const gaia = normalizeBrandBundle(readCatalog('gaia.json'));
    expect(gaia.ok).toBe(true);
    if (!gaia.ok) return;
    expect(gaia.data.paints).toHaveLength(158); // 156 色 + 2 条盖亚稀释剂
    expect(gaia.data.lines.map((line) => line.id).sort()).toEqual([
      'gaia-aux',
      'gaia-color',
      'gaia-ex',
      'gaia-ge',
      'gaia-gp',
      'gaia-tl',
    ]);

    const tamiya = normalizeBrandBundle(readCatalog('tamiya.json'));
    expect(tamiya.ok).toBe(true);
    if (!tamiya.ok) return;
    expect(tamiya.data.paints).toHaveLength(115); // 111 色 + 4 条田宫稀释剂
    const xf = tamiya.data.lines.find((line) => line.id === 'tamiya-xf');
    expect(xf?.solvent).toBe('water');
    expect(xf?.defaultFinish).toBe('matte');
    const lp = tamiya.data.lines.find((line) => line.id === 'tamiya-lp');
    expect(lp?.solvent).toBe('oil');

    const jumpwind = normalizeBrandBundle(readCatalog('jy.json'));
    expect(jumpwind.ok).toBe(true);
    if (!jumpwind.ok) return;
    expect(jumpwind.data.paints).toHaveLength(193); // 169 + 24 条 AQUEOUS（JW-A）
    expect(jumpwind.data.lines.some((line) => line.id === 'jy-aqueous')).toBe(true);
    // MC51 与既有 JWMC51 是同一支漆，不允许出现两条
    const meka = jumpwind.data.paints.filter((paint) => paint.code === 'JWMC51');
    expect(meka).toHaveLength(1);
  });

  it('辅料 SKU 带得动规格与来源说明（采购要按容量记账）', () => {
    const tamiya = normalizeBrandBundle(readCatalog('tamiya.json'));
    expect(tamiya.ok).toBe(true);
    if (!tamiya.ok) return;
    const aux = tamiya.data.paints.filter((paint) => paint.paintClass === 'aux');
    expect(aux.length).toBeGreaterThanOrEqual(4);
    for (const paint of aux) {
      expect(typeof paint.volumeMl).toBe('number');
      expect(paint.source).toBeTruthy();
      expect(paint.sourceUrl).toMatch(/^https?:\/\//);
      expect(paint.category).toBe('thinner');
    }
  });
});
