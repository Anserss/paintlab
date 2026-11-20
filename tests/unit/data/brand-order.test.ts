import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, setStore } from '@/data/db';
import { useAppStore } from '@/store';

function readCatalog(name: string): unknown {
  const path = fileURLToPath(new URL('../../../public/catalog/' + name, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** 用本地 public/catalog 当后端：index.json + 各品牌包 */
const fetchImpl = (async (input: RequestInfo | URL) => {
  const name = String(input).split('/').pop() ?? 'index.json';
  return { ok: true, json: async () => readCatalog(name) } as Response;
}) as typeof fetch;

beforeEach(() => {
  setStore(createMemoryStore());
  useAppStore.setState({
    brands: [],
    brandState: {},
    bundles: {},
    paintsById: {},
    linesById: {},
    catalogVersion: 'unknown',
    catalogReady: false,
    catalogError: null,
  });
});

describe('2.3.0 · 品牌包加载不改变左栏顺序', () => {
  it('index 顺序在懒加载品牌包之后保持稳定（点一个品牌，它不会跳到队尾）', async () => {
    const index = await useAppStore.getState().loadCatalog({ fetchImpl });
    expect(index.ok).toBe(true);

    const before = useAppStore.getState().brands.map((brand) => brand.id);
    expect(before).toEqual(['gsi', 'jy', 'gaia', 'tamiya', 'hobbymio', 'sunin7', 'qnc']);

    const loaded = await useAppStore.getState().ensureBrand('tamiya', { fetchImpl });
    expect(loaded.ok).toBe(true);

    const after = useAppStore.getState().brands.map((brand) => brand.id);
    expect(after).toEqual(before);

    // 品牌包带来的元数据仍然合并进来（不是整条丢弃）
    const tamiya = useAppStore.getState().brands.find((brand) => brand.id === 'tamiya');
    expect(tamiya?.nameZh).toBe('田宫');
    expect(tamiya?.shortName).toBe('TAMIYA');
  });

  it('连续加载多个品牌包，顺序仍是 index 顺序', async () => {
    await useAppStore.getState().loadCatalog({ fetchImpl });
    for (const id of ['gsi', 'gaia', 'jy']) {
      const result = await useAppStore.getState().ensureBrand(id, { fetchImpl });
      expect(result.ok).toBe(true);
    }
    expect(useAppStore.getState().brands.map((brand) => brand.id)).toEqual([
      'gsi',
      'jy',
      'gaia',
      'tamiya',
      'hobbymio',
      'sunin7',
      'qnc',
    ]);
  });
});
