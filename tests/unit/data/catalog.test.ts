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
    // 数据换代后只保留郡士 / 匠域（paintlab 合并表）
    expect(result.data.brands.map((brand) => brand.id).sort()).toEqual(['gsi', 'jy']);
    expect(result.data.catalogVersion.length).toBeGreaterThan(0);
    const gsi = result.data.brands.find((brand) => brand.id === 'gsi');
    expect(gsi?.shortName).toBe('GSI');
    expect(gsi?.accentHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(gsi?.file).toBe('gsi.json');
    expect(gsi?.count).toBeGreaterThan(400);
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
    // 郡士 23 条产品线、448 条漆料（含按容量拆 SKU 的辅料）
    expect(bundle.lines).toHaveLength(23);
    expect(bundle.paints).toHaveLength(448);

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
    expect(await readCachedPaints(store, 'gsi')).toHaveLength(448);
  });
});
