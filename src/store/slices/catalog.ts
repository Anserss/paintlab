import type { StateCreator } from 'zustand';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import {
  cacheBundle,
  loadBrandBundle,
  loadCatalogIndex,
  readAllCachedBrands,
} from '@/data/catalog';
import type { CatalogBundle, CatalogIndex, CatalogLoadOptions } from '@/data/catalog';
import { getStore } from '@/data/db';
import type { Result } from '@/data/repos/patch';
import { writeCatalogVersion } from '@/data/repos/settings';
import type { AppState } from '../index';
import { notifyError } from './ui';

export type BrandLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface CatalogSlice {
  catalogVersion: string;
  brands: Brand[];
  brandState: Record<string, BrandLoadState>;
  bundles: Record<string, CatalogBundle>;
  paintsById: Record<string, Paint>;
  linesById: Record<string, PaintLine>;
  catalogError: string | null;
  catalogReady: boolean;
  loadCatalog: (options?: CatalogLoadOptions) => Promise<Result<CatalogIndex>>;
  ensureBrand: (brandId: string, options?: CatalogLoadOptions & { file?: string }) => Promise<Result<CatalogBundle>>;
  getBrand: (id: string) => Brand | undefined;
  getPaint: (id: string) => Paint | undefined;
  getLine: (id: string) => PaintLine | undefined;
  paintsOfBrand: (brandId: string) => Paint[];
  linesOfBrand: (brandId: string) => PaintLine[];
  isBrandLoaded: (brandId: string) => boolean;
}

function mergeBrands(current: Brand[], incoming: Brand[]): Brand[] {
  const map = new Map(current.map((brand) => [brand.id, brand]));
  for (const brand of incoming) {
    const previous = map.get(brand.id);
    /*
     * 2.3.0：排序以「第一次见到的品牌」为准。index.json 只给顺序（sort = 0…6），
     * 品牌包里的 brand.sort 是 10…70；如果加载品牌包时覆盖掉 index 的 sort，
     * 左栏会随着品牌包陆续到达而重排（点一个品牌，它就跳到队尾）。
     */
    map.set(
      brand.id,
      previous
        ? { ...brand, sort: previous.sort, displayAlias: previous.displayAlias ?? brand.displayAlias }
        : brand,
    );
  }
  return Array.from(map.values()).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** 首屏只取 index.json；品牌包懒加载并缓存进 Dexie 的 brands / paints 表 */
export const createCatalogSlice: StateCreator<AppState, [], [], CatalogSlice> = (set, get) => ({
  catalogVersion: 'unknown',
  brands: [],
  brandState: {},
  bundles: {},
  paintsById: {},
  linesById: {},
  catalogError: null,
  catalogReady: false,

  async loadCatalog(options) {
    const result = await loadCatalogIndex(options);
    if (!result.ok) {
      set({ catalogError: result.error, catalogReady: true });
      try {
        const cached = await readAllCachedBrands(getStore());
        if (cached.length > 0) set({ brands: cached });
      } catch {
        /* 无持久化环境 */
      }
      return result;
    }
    const index = result.data;
    const brands: Brand[] = index.brands.map((entry, position) => ({
      id: entry.id,
      name: entry.name,
      nameZh: entry.nameZh,
      shortName: entry.shortName,
      aliases: [],
      accentHex: entry.accentHex,
      country: '',
      sort: position,
    }));
    set((state) => ({
      catalogVersion: index.catalogVersion,
      brands: mergeBrands(state.brands, brands),
      catalogReady: true,
      catalogError: null,
    }));
    try {
      const store = getStore();
      await store.brands.bulkPut(brands);
      await writeCatalogVersion(store, index.catalogVersion);
    } catch {
      /* 缓存失败不阻塞首屏 */
    }
    return result;
  },

  async ensureBrand(brandId, options) {
    const cached = get().bundles[brandId];
    if (cached) return { ok: true, data: cached };
    set((state) => ({ brandState: { ...state.brandState, [brandId]: 'loading' } }));
    const result = await loadBrandBundle(brandId, options);
    if (!result.ok) {
      set((state) => ({ brandState: { ...state.brandState, [brandId]: 'error' }, catalogError: result.error }));
      notifyError(get, result.error);
      return result;
    }
    const bundle = result.data;
    try {
      await cacheBundle(getStore(), bundle);
    } catch {
      /* 缓存失败不影响本次读取 */
    }
    set((state) => {
      const paintsById = { ...state.paintsById };
      for (const paint of bundle.paints) paintsById[paint.id] = paint;
      const linesById = { ...state.linesById };
      for (const line of bundle.lines) linesById[line.id] = line;
      return {
        bundles: { ...state.bundles, [brandId]: bundle },
        paintsById,
        linesById,
        brands: mergeBrands(state.brands, [bundle.brand]),
        brandState: { ...state.brandState, [brandId]: 'loaded' },
        catalogError: null,
      };
    });
    return result;
  },

  getBrand(id) {
    return get().brands.find((brand) => brand.id === id);
  },

  getPaint(id) {
    return get().paintsById[id];
  },

  getLine(id) {
    return get().linesById[id];
  },

  paintsOfBrand(brandId) {
    const bundle = get().bundles[brandId];
    if (bundle) return bundle.paints;
    return Object.values(get().paintsById).filter((paint) => paint.brandId === brandId);
  },

  linesOfBrand(brandId) {
    const bundle = get().bundles[brandId];
    if (bundle) return bundle.lines;
    return Object.values(get().linesById).filter((line) => line.brandId === brandId);
  },

  isBrandLoaded(brandId) {
    return get().brandState[brandId] === 'loaded' || Boolean(get().bundles[brandId]);
  },
});
