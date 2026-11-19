import type { Brand, Bottle, Paint, PaintClass, PaintLine, StockItem, WorkbenchItem } from '@/core/model/types';
import { formatMl, r1 } from '@/core/math/quantity';
import { bottleLook, canEnterWorkbench, stockLook, stockOriginNote } from '@/core/render/batch';
import { codeOrDash } from '@/core/render/label';

/** 用量面板的取值域（spec 3.5：滑块 0–20 ml、步进 0.5） */
export const PLANNED_MIN_ML = 0;
export const PLANNED_MAX_ML = 20;
export const PLANNED_STEP_ML = 0.5;
export const PLANNED_PRESETS = [1, 2, 5, 10] as const;

/** 工作台条目（引用 stock 或 bottle）的渲染视图模型 */
export interface WorkbenchEntry {
  /** WorkbenchItem.id */
  id: string;
  item: WorkbenchItem;
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
  /** 调漆瓶自定义色的透明度 / 未定色态 */
  swatchAlpha?: number;
  swatchUndefined?: boolean;
  /** 稀释漆料：名称前的「(1:N)稀释」小牌（2.1） */
  dilutionRatioN: number | null;
}

export interface WorkbenchLookups {
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
    name: '批次',
    packaging: 'bottle',
    defaultVolumeMl: bottle.capacityMl,
    kind: 'auxiliary',
    resin: 'lacquer',
    solvent: 'na',
    defaultFinish: 'other',
  };
}

/** 批次合成成 Paint：2.1 稀释按原浆色值，调漆按自定义色 */
function bottlePaint(bottle: Bottle): Paint {
  const look = bottleLook(bottle);
  return {
    id: bottle.id,
    lineId: bottle.id + BOTTLE_LINE_SUFFIX,
    brandId: bottle.labelBrandId ?? '',
    name: look.name,
    code: bottle.labelCode,
    hex: look.hex,
    paintClass: bottle.paintClass as PaintClass,
    category: 'other',
    origin: 'mixed',
  };
}

/** 库存条目合成成 Paint：稀释沿用原浆名称，调漆沿用自定义名称 */
function stockPaint(stock: StockItem, paint: Paint): Paint {
  const look = stockLook(stock, paint);
  return { ...paint, name: look.name, nameZh: look.name, hex: look.hex };
}

/** 把工作台条目解析成可渲染的视图模型；引用的库存/瓶已不存在时跳过 */
export function resolveEntries(items: WorkbenchItem[], lookups: WorkbenchLookups): WorkbenchEntry[] {
  const stockMap = new Map(lookups.stockItems.map((row) => [row.id, row]));
  const bottleMap = new Map(lookups.bottles.map((row) => [row.id, row]));
  const brandMap = new Map(lookups.brands.map((row) => [row.id, row]));
  const result: WorkbenchEntry[] = [];

  for (const item of items) {
    if (item.refType === 'stock') {
      const stock = stockMap.get(item.refId);
      if (!stock) continue;
      const basePaint = lookups.paintsById[stock.paintId] ?? null;
      const paint = basePaint ? stockPaint(stock, basePaint) : null;
      const line = basePaint ? lookups.linesById[basePaint.lineId] ?? null : null;
      const look = basePaint ? stockLook(stock, basePaint) : null;
      result.push({
        id: item.id,
        item,
        refType: 'stock',
        paint,
        line,
        brand: basePaint ? brandMap.get(basePaint.brandId) : undefined,
        title: look?.name ?? stock.paintId,
        code: codeOrDash(basePaint?.code),
        remainingMl: stock.volumeMl,
        initialMl: stock.initialMl,
        usedMl: r1(Math.max(0, stock.initialMl - stock.volumeMl)),
        plannedUseMl: item.plannedUseMl,
        ...(typeof look?.alpha === 'number' ? { swatchAlpha: look.alpha } : {}),
        ...(look?.undefinedColor ? { swatchUndefined: true } : {}),
        dilutionRatioN: look?.dilutionRatioN ?? null,
      });
      continue;
    }

    const bottle = bottleMap.get(item.refId);
    if (!bottle) continue;
    const look = bottleLook(bottle);
    result.push({
      id: item.id,
      item,
      refType: 'bottle',
      paint: bottlePaint(bottle),
      line: bottleLine(bottle),
      brand: bottle.labelBrandId ? brandMap.get(bottle.labelBrandId) : undefined,
      title: look.name,
      code: bottle.labelCode ?? '—',
      remainingMl: bottle.remainingMl,
      initialMl: bottle.baselineMl,
      usedMl: r1(Math.max(0, bottle.baselineMl - bottle.remainingMl)),
      plannedUseMl: item.plannedUseMl,
      ...(typeof look.alpha === 'number' ? { swatchAlpha: look.alpha } : {}),
      ...(look.undefinedColor ? { swatchUndefined: true } : {}),
      dilutionRatioN: look.dilutionRatioN,
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 侧栏「从仓库调取」：只列稀释/调漆产物，原浆不上工作台（2.1）          */
/* ------------------------------------------------------------------ */

export interface WorkbenchStockRow {
  item: StockItem;
  paint: Paint;
  code: string;
  name: string;
  hex: string;
  alpha?: number;
  undefinedColor: boolean;
  dilutionRatioN: number | null;
  /** 稀释 / 调漆产物：用来说明为什么可以上工作台 */
  originNote: string | null;
  /** 已在当前工作台内（禁用重复加入） */
  alreadyIn: boolean;
}

export function buildStockLane(
  stockItems: StockItem[],
  paintsById: Record<string, Paint>,
  workbenchItems: WorkbenchItem[],
  workbenchId: string | null,
): WorkbenchStockRow[] {
  const rows: WorkbenchStockRow[] = [];
  for (const item of stockItems) {
    if (item.volumeMl <= 0) continue;
    if (!canEnterWorkbench(item.state)) continue;
    const paint = paintsById[item.paintId];
    if (!paint || paint.paintClass === 'aux') continue;
    const look = stockLook(item, paint);
    const row: WorkbenchStockRow = {
      item,
      paint,
      code: codeOrDash(paint.code),
      name: look.name,
      hex: look.hex,
      undefinedColor: look.undefinedColor,
      dilutionRatioN: look.dilutionRatioN,
      originNote: stockOriginNote(item),
      alreadyIn:
        workbenchId !== null &&
        workbenchItems.some(
          (entry) => entry.workbenchId === workbenchId && entry.refType === 'stock' && entry.refId === item.id,
        ),
    };
    if (typeof look.alpha === 'number') row.alpha = look.alpha;
    rows.push(row);
  }
  return rows.sort(
    (a, b) =>
      Number(b.dilutionRatioN !== null) - Number(a.dilutionRatioN !== null) ||
      a.name.localeCompare(b.name) ||
      b.item.volumeMl - a.item.volumeMl,
  );
}

/** 侧栏统计数据：可调取的条数 + 被拦下的原浆条数 */
export function stockLaneSummary(
  stockItems: StockItem[],
  paintsById: Record<string, Paint>,
): { available: number; neatBlocked: number } {
  let available = 0;
  let neatBlocked = 0;
  for (const item of stockItems) {
    if (item.volumeMl <= 0) continue;
    const paint = paintsById[item.paintId];
    if (!paint || paint.paintClass === 'aux') continue;
    if (canEnterWorkbench(item.state)) available += 1;
    else neatBlocked += 1;
  }
  return { available, neatBlocked };
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

export interface WorkbenchStatsView {
  count: number;
  totalMl: number;
  kits: number;
}

/** 「条目 n · 合计 x.x ml · 预计可涂 m 个套件」——m 为娱乐性估算，必须标注 */
export function formatWorkbenchStats(stats: WorkbenchStatsView): string {
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

/** 工作台 Tab 徽标文案 */
export function formatTabBadge(count: number, totalMl: number): string {
  return count + ' 件 · ' + formatMl(totalMl) + ' ml';
}
