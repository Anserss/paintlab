import { z } from 'zod';
import { BrandSchema, PaintLineSchema, PaintSchema } from '@/core/model/schemas';
import type { Brand, Paint, PaintLine } from '@/core/model/types';
import type { DepotStore } from './db';
import { fail, ok, toFailure } from './repos/patch';
import type { FieldIssue, Result } from './repos/patch';

/**
 * 目录加载器（spec 3.2 / 3.7）：
 * - 首屏只取 index.json；
 * - 品牌包按 brandId 懒加载，归一化成 core 的 Brand / PaintLine / Paint；
 * - 归一化后再跑一次运行时校验，失败能定位到哪个 id 的哪个字段。
 */

export const CATALOG_BASE_URL = '/catalog';

export interface CatalogBrandSummary {
  id: string;
  name: string;
  nameZh: string;
  shortName: string;
  accentHex: string;
  count: number;
  file: string;
}

export interface CatalogIndex {
  catalogVersion: string;
  generatedAt?: string;
  brands: CatalogBrandSummary[];
}

export interface CatalogBundle {
  catalogVersion: string;
  verifiedAt?: string;
  brand: Brand;
  lines: PaintLine[];
  paints: Paint[];
}

export interface CatalogLoadOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const RawBrandSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameZh: z.string().nullish(),
  shortName: z.string().min(1),
  accentHex: z.string(),
  country: z.string().nullish(),
  sort: z.number().nullish(),
  aliases: z.array(z.string()).nullish(),
  displayAlias: z.string().nullish(),
});

const RawLineSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().nullish(),
  name: z.string().min(1),
  nameZh: z.string().nullish(),
  packaging: z.string(),
  defaultVolumeMl: z.number(),
  kind: z.string(),
  resin: z.string(),
  solvent: z.string(),
  defaultFinish: z.string(),
  thinnerFamily: z.string().nullish(),
  defaultRatioN: z.number().nullish(),
});

const RawPaintSchema = z.object({
  id: z.string().min(1),
  lineId: z.string().min(1),
  brandId: z.string().min(1),
  code: z.string().nullish(),
  name: z.string().min(1),
  nameZh: z.string().nullish(),
  hex: z.string(),
  paintClass: z.string(),
  category: z.string(),
  finish: z.string().nullish(),
  opacityOverride: z.number().nullish(),
  sourceUrl: z.string().nullish(),
  verifiedAt: z.string().nullish(),
  origin: z.string().nullish(),
});

const RawIndexSchema = z.object({
  format: z.string().optional(),
  version: z.string().optional(),
  catalogVersion: z.string().optional(),
  generatedAt: z.string().optional(),
  brands: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        nameZh: z.string().nullish(),
        shortName: z.string().min(1),
        accentHex: z.string(),
        count: z.number().int().nonnegative(),
        file: z.string().optional(),
      }),
    )
    .min(1),
});

const RawBundleSchema = z.object({
  format: z.string().optional(),
  version: z.string().optional(),
  verifiedAt: z.string().nullish(),
  brand: RawBrandSchema,
  lines: z.array(RawLineSchema),
  paints: z.array(RawPaintSchema),
});

const undef = <T>(value: T | null | undefined): T | undefined =>
  value === null || value === undefined ? undefined : value;

function issuesOf(label: string, issues: { path: (string | number)[]; message: string }[]): FieldIssue[] {
  return issues.map((issue) => ({
    path: label + (issue.path.length > 0 ? '.' + issue.path.join('.') : ''),
    message: issue.message,
  }));
}

function requirePaintId(bundleLabel: string, id: string | undefined): string {
  return id && id.length > 0 ? id : bundleLabel;
}

/** index.json -> CatalogIndex（首屏只用这一份文件） */
export function normalizeCatalogIndex(raw: unknown): Result<CatalogIndex> {
  const parsed = RawIndexSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('目录索引格式不正确', 'validation', { issues: issuesOf('index', parsed.error.issues) });
  }
  const data = parsed.data;
  const catalogVersion = data.version ?? data.catalogVersion ?? data.generatedAt ?? 'unknown';
  const brands: CatalogBrandSummary[] = data.brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    nameZh: undef(brand.nameZh) ?? brand.shortName,
    shortName: brand.shortName,
    accentHex: brand.accentHex,
    count: brand.count,
    file: brand.file ?? brand.id + '.json',
  }));
  return ok({ catalogVersion, generatedAt: data.generatedAt, brands });
}

/** {brandId}.json -> CatalogBundle（null -> undefined、aliases -> []、丢弃未知字段） */
export function normalizeBrandBundle(raw: unknown): Result<CatalogBundle> {
  const parsed = RawBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('品牌包格式不正确', 'validation', { issues: issuesOf('bundle', parsed.error.issues) });
  }
  const bundle = parsed.data;
  const rawBrand = bundle.brand;
  const brand: Brand = {
    id: rawBrand.id,
    name: rawBrand.name,
    nameZh: undef(rawBrand.nameZh) ?? rawBrand.shortName,
    shortName: rawBrand.shortName,
    aliases: undef(rawBrand.aliases) ?? [],
    accentHex: rawBrand.accentHex,
    country: undef(rawBrand.country) ?? '',
    sort: undef(rawBrand.sort) ?? 0,
  };
  const displayAlias = undef(rawBrand.displayAlias);
  if (displayAlias) brand.displayAlias = displayAlias;

  const issues: FieldIssue[] = [];
  const brandCheck = BrandSchema.safeParse(brand);
  if (!brandCheck.success) issues.push(...issuesOf('brand ' + brand.id, brandCheck.error.issues));

  const lines: PaintLine[] = [];
  bundle.lines.forEach((rawLine, index) => {
    const candidate: Record<string, unknown> = {
      id: rawLine.id,
      brandId: undef(rawLine.brandId) ?? brand.id,
      name: rawLine.name,
      packaging: rawLine.packaging,
      defaultVolumeMl: rawLine.defaultVolumeMl,
      kind: rawLine.kind,
      resin: rawLine.resin,
      solvent: rawLine.solvent,
      defaultFinish: rawLine.defaultFinish,
    };
    const nameZh = undef(rawLine.nameZh);
    if (nameZh) candidate.nameZh = nameZh;
    const thinnerFamily = undef(rawLine.thinnerFamily);
    if (thinnerFamily) candidate.thinnerFamily = thinnerFamily;
    const defaultRatioN = undef(rawLine.defaultRatioN);
    if (defaultRatioN !== undefined) candidate.defaultRatioN = defaultRatioN;

    const check = PaintLineSchema.safeParse(candidate);
    if (!check.success) {
      issues.push(...issuesOf('lines[' + index + '] id=' + rawLine.id, check.error.issues));
      return;
    }
    lines.push(check.data);
  });

  const paints: Paint[] = [];
  bundle.paints.forEach((rawPaint, index) => {
    const candidate: Record<string, unknown> = {
      id: rawPaint.id,
      lineId: rawPaint.lineId,
      brandId: rawPaint.brandId,
      name: rawPaint.name,
      hex: rawPaint.hex,
      paintClass: rawPaint.paintClass,
      category: rawPaint.category,
      origin: undef(rawPaint.origin) ?? 'seed',
    };
    const code = undef(rawPaint.code);
    if (code) candidate.code = code;
    const nameZh = undef(rawPaint.nameZh);
    if (nameZh) candidate.nameZh = nameZh;
    const finish = undef(rawPaint.finish);
    if (finish) candidate.finish = finish;
    const opacityOverride = undef(rawPaint.opacityOverride);
    if (opacityOverride !== undefined) candidate.opacityOverride = opacityOverride;
    const sourceUrl = undef(rawPaint.sourceUrl);
    if (sourceUrl) candidate.sourceUrl = sourceUrl;
    const verifiedAt = undef(rawPaint.verifiedAt);
    if (verifiedAt) candidate.verifiedAt = verifiedAt;

    const check = PaintSchema.safeParse(candidate);
    if (!check.success) {
      issues.push(...issuesOf('paints[' + index + '] id=' + requirePaintId(rawPaint.id, rawPaint.id), check.error.issues));
      return;
    }
    paints.push(check.data);
  });

  if (issues.length > 0) {
    const summary = issues
      .slice(0, 5)
      .map((issue) => issue.path + '：' + issue.message)
      .join('；');
    return fail(
      '品牌包 ' + brand.id + ' 校验失败（' + issues.length + ' 处）：' + summary,
      'validation',
      { issues },
    );
  }

  const result: CatalogBundle = {
    catalogVersion: bundle.version ?? 'unknown',
    brand,
    lines,
    paints,
  };
  const verifiedAt = undef(bundle.verifiedAt);
  if (verifiedAt) result.verifiedAt = verifiedAt;
  return ok(result);
}

function resolveBase(options: CatalogLoadOptions): string {
  const base = options.baseUrl ?? CATALOG_BASE_URL;
  return base.replace(/\/+$/, '');
}

async function getJson(url: string, options: CatalogLoadOptions): Promise<Result<unknown>> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return fail('当前环境不支持 fetch，无法加载目录包', 'storage');
  try {
    const response = await fetchImpl(url, options.signal ? { signal: options.signal } : undefined);
    if (!response.ok) {
      return fail('目录包请求失败：' + url + '（HTTP ' + response.status + '）', 'storage');
    }
    const json: unknown = await response.json();
    return ok(json);
  } catch (error) {
    return toFailure(error, 'storage');
  }
}

export async function loadCatalogIndex(options: CatalogLoadOptions = {}): Promise<Result<CatalogIndex>> {
  const json = await getJson(resolveBase(options) + '/index.json', options);
  if (!json.ok) return json;
  return normalizeCatalogIndex(json.data);
}

export async function loadBrandBundle(
  brandId: string,
  options: CatalogLoadOptions & { file?: string } = {},
): Promise<Result<CatalogBundle>> {
  if (!brandId) return fail('缺少 brandId', 'validation');
  const file = options.file ?? brandId + '.json';
  const json = await getJson(resolveBase(options) + '/' + file, options);
  if (!json.ok) return json;
  return normalizeBrandBundle(json.data);
}

/** 把品牌包写进 Dexie 的 brands / paints 表（同一事务） */
export async function cacheBundle(s: DepotStore, bundle: CatalogBundle): Promise<void> {
  await s.transaction('rw', ['brands', 'paints'], async () => {
    await s.brands.put(bundle.brand);
    await s.paints.bulkPut(bundle.paints);
  });
}

export async function readCachedBrand(s: DepotStore, brandId: string): Promise<Brand | undefined> {
  return s.brands.get(brandId);
}

export async function readCachedPaints(s: DepotStore, brandId: string): Promise<Paint[]> {
  const all = await s.paints.toArray();
  return all.filter((paint) => paint.brandId === brandId);
}

export async function readAllCachedBrands(s: DepotStore): Promise<Brand[]> {
  const brands = await s.brands.toArray();
  return brands.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
