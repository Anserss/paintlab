import type { Brand, Bottle, Paint, PaintClass, PaintLine, StockItem, WorkstationItem } from '@/core/model/types';
import { formatMl, r1 } from '@/core/math/quantity';

/** 用量面板的取值域（spec 3.5：滑块 0–20 ml、步进 0.5） */
export const PLANNED_MIN_ML = 0;
export const PLANNED_MAX_ML = 20;
export const PLANNED_STEP_ML = 0.5;
export const PLANNED_PRESETS = [1, 2, 5, 10] as const;

/** 工位条目（引用 stock 或 bottle）的渲染视图模型 */
export interface StationEntry {
  /** WorkstationItem.id */
  id: string;
  item: WorkstationItem;
  refType: 'stock' | 'bottle';
  paint: Paint | null;
  line: PaintLine | null;
  brand: Brand | undefined;
  title: string;
  code: string;
  remainingMl: number;
  initialMl: number;
  /** 已用量 = 初始量/基准量 − 当前余量 */
  usedMl: number;
  plannedUseMl: number;
}

export interface StationLookups {
  stockItems: StockItem[];
  bottles: Bottle[];
  paintsById: Record<string, Paint>;
  linesById: Record<string, PaintLine>;
  brands: Brand[];
}

const BOTTLE_LINE_SUFFIX = ':bottle';

/** 调漆瓶不是 Paint，渲染时合成一份最小线/漆引用（与 2.3 文案实现一致） */
function bottleLine(bottle: Bottle): PaintLine {
  return {
    id: bottle.id + BOTTLE_LINE_SUFFIX,
    brandId: bottle.labelBrandId ?? '',
    name: '调漆瓶',
    packaging: 'bottle',
    defaultVolumeMl: bottle.capacityMl,
    kind: 'auxiliary',
    resin: 'lacquer',
    solvent: 'na',
    defaultFinish: 'other',
  };
}

function bottlePaint(bottle: Bottle): Paint {
  return {
    id: bottle.id,
    lineId: bottle.id + BOTTLE_LINE_SUFFIX,
    brandId: bottle.labelBrandId ?? '',
    name: bottle.name,
    code: bottle.labelCode,
    hex: bottle.hex,
    paintClass: bottle.paintClass as PaintClass,
    category: 'other',
    origin: 'mixed',
  };
}

/** 把工位条目解析成可渲染的视图模型；引用的库存/瓶已不存在时跳过 */
export function resolveEntries(items: WorkstationItem[], lookups: StationLookups): StationEntry[] {
  const stockMap = new Map(lookups.stockItems.map((row) => [row.id, row]));
  const bottleMap = new Map(lookups.bottles.map((row) => [row.id, row]));
  const brandMap = new Map(lookups.brands.map((row) => [row.id, row]));
  const result: StationEntry[] = [];

  for (const item of items) {
    if (item.refType === 'stock') {
      const stock = stockMap.get(item.refId);
      if (!stock) continue;
      const paint = lookups.paintsById[stock.paintId] ?? null;
      const line = paint ? lookups.linesById[paint.lineId] ?? null : null;
      result.push({
        id: item.id,
        item,
        refType: 'stock',
        paint,
        line,
        brand: paint ? brandMap.get(paint.brandId) : undefined,
        title: paint ? paint.nameZh || paint.name : stock.paintId,
        code: paint?.code ?? '—',
        remainingMl: stock.volumeMl,
        initialMl: stock.initialMl,
        usedMl: r1(Math.max(0, stock.initialMl - stock.volumeMl)),
        plannedUseMl: item.plannedUseMl,
      });
      continue;
    }

    const bottle = bottleMap.get(item.refId);
    if (!bottle) continue;
    const paint = bottlePaint(bottle);
    result.push({
      id: item.id,
      item,
      refType: 'bottle',
      paint,
      line: bottleLine(bottle),
      brand: bottle.labelBrandId ? brandMap.get(bottle.labelBrandId) : undefined,
      title: bottle.name,
      code: bottle.labelCode ?? '—',
      remainingMl: bottle.remainingMl,
      initialMl: bottle.baselineMl,
      usedMl: r1(Math.max(0, bottle.baselineMl - bottle.remainingMl)),
      plannedUseMl: item.plannedUseMl,
    });
  }
  return result;
}

/** 量化到 0.5 步进并夹在 0–20（spec 3.5） */
export function quantizePlanned(value: number): number {
  if (!Number.isFinite(value)) return PLANNED_MIN_ML;
  const snapped = Math.round(value / PLANNED_STEP_ML) * PLANNED_STEP_ML;
  return r1(Math.min(PLANNED_MAX_ML, Math.max(PLANNED_MIN_ML, snapped)));
}

/** 默认计划用量 = min(2, 剩余量)，量化到 0.5 */
export function defaultPlannedMl(remainingMl: number): number {
  return quantizePlanned(Math.min(2, Math.max(0, remainingMl)));
}

export interface StationStatsView {
  count: number;
  totalMl: number;
  kits: number;
}

/** 「条目 n · 合计 x.x ml · 预计可涂 m 个套件」——m 为娱乐性估算，必须标注 */
export function formatStationStats(stats: StationStatsView): string {
  return (
    '条目 ' +
    stats.count +
    ' · 合计 ' +
    formatMl(stats.totalMl) +
    ' ml · 预计可涂 ' +
    stats.kits +
    ' 个套件（估算）'
  );
}

/** 工位 Tab 徽标文案 */
export function formatTabBadge(count: number, totalMl: number): string {
  return count + ' 件 · ' + formatMl(totalMl) + ' ml';
}
