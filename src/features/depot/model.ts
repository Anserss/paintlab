import type { Brand, Group, Paint, PaintClass, PaintLine, StockItem } from '@/core/model/types';
import { canCreateChild, canMoveGroup, UNGROUPED_ID } from '@/core/rules/groups';
import { hueBucket, isAchromatic, lightnessBucket } from '@/core/math/color';
import { r1 } from '@/core/math/quantity';

/** 仓库三视图（spec 3.3:384-390） */
export type DepotView = 'brand' | 'hue' | 'group';

export const DEPOT_VIEWS: { value: DepotView; label: string }[] = [
  { value: 'brand', label: '品牌' },
  { value: 'hue', label: '色环' },
  { value: 'group', label: '分组' },
];

/** 行式色卡的渲染单位：库存条目 × 目录漆料（spec 4.5.1） */
export interface DepotRow {
  item: StockItem;
  paint: Paint;
  line: PaintLine;
  brand?: Brand;
}

export interface CatalogLookup {
  paintsById: Record<string, Paint>;
  linesById: Record<string, PaintLine>;
  brands: Brand[];
}

export const PAINT_CLASSES: PaintClass[] = ['solid', 'clear', 'aux'];

export const PAINT_CLASS_ZH: Record<PaintClass, string> = {
  solid: '实色',
  clear: '透明',
  aux: '辅助',
};

/** 3.10:761 分组超深文案——由 core 的校验函数给出，这里只做测试锚点 */
export const GROUP_DEPTH_MESSAGE = '分组最多 3 层，无法在 L3 下继续创建';

export function brandLabel(brand: Brand | undefined): string | undefined {
  if (!brand) return undefined;
  return brand.nameZh || brand.name;
}

/** 库存条目 + 目录数据 -> 行模型；目录缺失的条目无法渲染色卡，直接跳过 */
export function buildRows(stockItems: StockItem[], lookup: CatalogLookup): DepotRow[] {
  const brandsById = new Map(lookup.brands.map((brand) => [brand.id, brand]));
  const rows: DepotRow[] = [];
  for (const item of stockItems) {
    const paint = lookup.paintsById[item.paintId];
    if (!paint) continue;
    const line = lookup.linesById[paint.lineId];
    if (!line) continue;
    const brand = brandsById.get(paint.brandId);
    rows.push(brand ? { item, paint, line, brand } : { item, paint, line });
  }
  return rows;
}

export function totalMl(rows: readonly DepotRow[]): number {
  return r1(rows.reduce((sum, row) => sum + row.item.volumeMl, 0));
}

/* ------------------------------------------------------------------ */
/* 品牌视图：品牌 → 产品线 → 漆类 树（spec 3.3:388）                    */
/* ------------------------------------------------------------------ */

export type BrandSelection =
  | { kind: 'all' }
  | { kind: 'brand'; brandId: string }
  | { kind: 'line'; lineId: string }
  | { kind: 'class'; lineId: string; paintClass: PaintClass };

export interface BrandNode {
  key: string;
  label: string;
  count: number;
  selection: BrandSelection;
  children: BrandNode[];
}

export function buildBrandTree(rows: readonly DepotRow[]): BrandNode[] {
  const byBrand = new Map<string, Map<string, Map<PaintClass, number>>>();
  const brandOrder: string[] = [];
  for (const row of rows) {
    const brandId = row.paint.brandId;
    if (!byBrand.has(brandId)) {
      byBrand.set(brandId, new Map());
      brandOrder.push(brandId);
    }
    const lines = byBrand.get(brandId)!;
    if (!lines.has(row.paint.lineId)) lines.set(row.paint.lineId, new Map());
    const classes = lines.get(row.paint.lineId)!;
    classes.set(row.paint.paintClass, (classes.get(row.paint.paintClass) ?? 0) + 1);
  }

  const nodes: BrandNode[] = [];
  for (const brandId of brandOrder) {
    const brandRow = rows.find((row) => row.paint.brandId === brandId);
    const lines = byBrand.get(brandId)!;
    const lineNodes: BrandNode[] = [];
    let brandCount = 0;
    for (const [lineId, classes] of lines) {
      const lineRow = rows.find((row) => row.paint.lineId === lineId);
      const classNodes: BrandNode[] = [];
      let lineCount = 0;
      for (const paintClass of PAINT_CLASSES) {
        const count = classes.get(paintClass);
        if (!count) continue;
        lineCount += count;
        classNodes.push({
          key: 'class:' + lineId + ':' + paintClass,
          label: PAINT_CLASS_ZH[paintClass],
          count,
          selection: { kind: 'class', lineId, paintClass },
          children: [],
        });
      }
      brandCount += lineCount;
      lineNodes.push({
        key: 'line:' + lineId,
        label: lineRow?.line.name ?? lineId,
        count: lineCount,
        selection: { kind: 'line', lineId },
        children: classNodes,
      });
    }
    nodes.push({
      key: 'brand:' + brandId,
      label: brandLabel(brandRow?.brand) ?? brandId,
      count: brandCount,
      selection: { kind: 'brand', brandId },
      children: lineNodes,
    });
  }
  return nodes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function matchesBrandSelection(row: DepotRow, selection: BrandSelection): boolean {
  switch (selection.kind) {
    case 'all':
      return true;
    case 'brand':
      return row.paint.brandId === selection.brandId;
    case 'line':
      return row.paint.lineId === selection.lineId;
    case 'class':
      return row.paint.lineId === selection.lineId && row.paint.paintClass === selection.paintClass;
  }
}

export function brandSelectionKey(selection: BrandSelection): string {
  switch (selection.kind) {
    case 'all':
      return 'all';
    case 'brand':
      return 'brand:' + selection.brandId;
    case 'line':
      return 'line:' + selection.lineId;
    case 'class':
      return 'class:' + selection.lineId + ':' + selection.paintClass;
  }
}

/** 右侧列表按系列（产品线）分组显示（spec 3.3:388） */
export interface LineGroup {
  key: string;
  heading: string;
  rows: DepotRow[];
  totalMl: number;
}

export function groupByLine(rows: readonly DepotRow[]): LineGroup[] {
  const groups = new Map<string, DepotRow[]>();
  for (const row of rows) {
    const list = groups.get(row.paint.lineId) ?? [];
    list.push(row);
    groups.set(row.paint.lineId, list);
  }
  return Array.from(groups.entries()).map(([lineId, list]) => {
    const first = list[0];
    const brand = brandLabel(first.brand) ?? '—';
    return {
      key: lineId,
      heading: brand + ' · ' + first.line.name,
      rows: list,
      totalMl: totalMl(list),
    };
  });
}

/* ------------------------------------------------------------------ */
/* 色环视图：12 × 30° 色相扇区 + 5 行明度矩阵（spec 3.3:392-397）        */
/* ------------------------------------------------------------------ */

export const HUE_SECTORS = 12;
export const LIGHTNESS_BANDS = 5;
export const HUE_LABELS = ['红', '橙', '黄', '黄绿', '绿', '青绿', '青', '蓝青', '蓝', '紫蓝', '紫', '品红'];

export type HueBin = { kind: 'hue'; index: number } | { kind: 'achromatic' } | { kind: 'aux' };

/** 扇区归属：aux 单列「辅助」，S<8% 归「灰黑白」，其余按 hueBucket 12 档 */
export function binOf(paint: Paint): HueBin {
  if (paint.paintClass === 'aux') return { kind: 'aux' };
  if (isAchromatic(paint.hex)) return { kind: 'achromatic' };
  return { kind: 'hue', index: Math.min(HUE_SECTORS - 1, Math.max(0, hueBucket(paint.hex))) };
}

export function binKey(bin: HueBin): string {
  return bin.kind === 'hue' ? 'hue:' + bin.index : bin.kind;
}

export function binLabel(bin: HueBin): string {
  if (bin.kind === 'hue') return HUE_LABELS[bin.index] ?? String(bin.index);
  return bin.kind === 'aux' ? '辅助' : '灰黑白';
}

export function matchesHue(row: DepotRow, selection: HueBin | null): boolean {
  if (!selection) return true;
  return binKey(binOf(row.paint)) === binKey(selection);
}

export function countOfBin(rows: readonly DepotRow[], bin: HueBin): number {
  const key = binKey(bin);
  return rows.filter((row) => binKey(binOf(row.paint)) === key).length;
}

export function sectorCounts(rows: readonly DepotRow[]): number[] {
  const counts = new Array<number>(HUE_SECTORS).fill(0);
  for (const row of rows) {
    const bin = binOf(row.paint);
    if (bin.kind === 'hue') counts[bin.index] += 1;
  }
  return counts;
}

export interface HueCell {
  hue: number;
  lightness: number;
  rows: DepotRow[];
}

/** 矩阵：5 行（明度 0–20/20–40/…/80–100）× 12 列色相；格内按库存量降序 */
export function hueMatrix(rows: readonly DepotRow[]): HueCell[][] {
  const matrix: HueCell[][] = [];
  for (let lightness = 0; lightness < LIGHTNESS_BANDS; lightness += 1) {
    const line: HueCell[] = [];
    for (let hue = 0; hue < HUE_SECTORS; hue += 1) line.push({ hue, lightness, rows: [] });
    matrix.push(line);
  }
  for (const row of rows) {
    const bin = binOf(row.paint);
    if (bin.kind !== 'hue') continue;
    const band = Math.min(LIGHTNESS_BANDS - 1, Math.max(0, lightnessBucket(row.paint.hex)));
    matrix[band][bin.index].rows.push(row);
  }
  for (const line of matrix) {
    for (const cell of line) cell.rows.sort((a, b) => b.item.volumeMl - a.item.volumeMl);
  }
  return matrix;
}

export function polarPoint(cx: number, cy: number, radius: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

/** 极坐标扇环路径（SVG path），角度 0° 指向 12 点方向 */
export function sectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const [x1, y1] = polarPoint(cx, cy, rOuter, startDeg);
  const [x2, y2] = polarPoint(cx, cy, rOuter, endDeg);
  const [x3, y3] = polarPoint(cx, cy, rInner, endDeg);
  const [x4, y4] = polarPoint(cx, cy, rInner, startDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return [
    'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2),
    'A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2),
    'L ' + x3.toFixed(2) + ' ' + y3.toFixed(2),
    'A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 0 ' + x4.toFixed(2) + ' ' + y4.toFixed(2),
    'Z',
  ].join(' ');
}

/* ------------------------------------------------------------------ */
/* 分组视图：行 → 分组节点的落点规划（spec 3.3:399-405 / AC-07）        */
/* ------------------------------------------------------------------ */

export type DropPayload = { kind: 'item'; stockItemId: string } | { kind: 'group'; groupId: string };

export type DropTarget = { kind: 'root' } | { kind: 'group'; groupId: string };

export type DropPlan =
  | { ok: true; action: 'move-item'; stockItemId: string; groupId: string }
  | { ok: true; action: 'move-group'; groupId: string; parentId: string | null }
  | { ok: false; reason: string };

/**
 * 拖拽矩阵的唯一判定处：行 → 分组 = 单归属移动；分组 → 分组 = 移动子树（3 层校验）。
 * 键盘/菜单替代路径走同一个函数，保证两条入口行为一致。
 */
export function planGroupDrop(groups: Group[], payload: DropPayload, target: DropTarget): DropPlan {
  if (payload.kind === 'item') {
    const groupId = target.kind === 'root' ? UNGROUPED_ID : target.groupId;
    return { ok: true, action: 'move-item', stockItemId: payload.stockItemId, groupId };
  }
  const parentId = target.kind === 'root' ? null : target.groupId;
  const check = canMoveGroup(groups, payload.groupId, parentId);
  if (!check.ok) return { ok: false, reason: check.reason ?? GROUP_DEPTH_MESSAGE };
  return { ok: true, action: 'move-group', groupId: payload.groupId, parentId };
}

/** 「新建子分组」的层级守卫（深度 3 的节点不显示入口，兜底仍走这里） */
export function planCreateChild(groups: Group[], parentId: string | null): { ok: boolean; reason?: string } {
  return canCreateChild(groups, parentId);
}

export interface FlatGroup {
  id: string;
  name: string;
  depth: number;
  system: boolean;
}

export function flatGroups(groups: readonly Group[]): FlatGroup[] {
  return groups
    .map((group) => ({ id: group.id, name: group.name, depth: group.depth, system: Boolean(group.system) }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

/** 归属分组路径：未分组 / 组A / 组B */
export function groupPath(groups: readonly Group[], groupId: string | null | undefined): string {
  if (!groupId) return '未分组';
  const parts: string[] = [];
  const guard = new Set<string>();
  let cursor: Group | undefined = groups.find((group) => group.id === groupId);
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    if (cursor.id !== UNGROUPED_ID) parts.unshift(cursor.name);
    const parentId: string | null = cursor.parentId;
    cursor = parentId ? groups.find((group) => group.id === parentId) : undefined;
  }
  return parts.length > 0 ? parts.join(' / ') : '未分组';
}
/* ---------------------------------------------------------------- */
/* 分组手动排序（spec 3.3:404）：同父级重排 → reorderGroups；跨父级先移后排序 */
/* ---------------------------------------------------------------- */

/** 同父级子节点的展示顺序（sort → name，与 core 的 buildGroupTree 一致；系统分组不参与排序） */
export function siblingOrder(groups: readonly Group[], parentId: string | null): string[] {
  return groups
    .filter((group) => group.parentId === parentId && !group.system && group.id !== UNGROUPED_ID)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((group) => group.id);
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** 把 id 放到 targetId 的位置上（同级重排） */
export function reorderIds(order: readonly string[], id: string, targetId: string): string[] {
  const without = order.filter((entry) => entry !== id);
  const index = without.indexOf(targetId);
  if (index < 0) return order.slice();
  const next = without.slice();
  next.splice(index, 0, id);
  return next;
}

/** 目标顺序是否真的变了（未变化时调用方必须静默跳过，不能把 repo 的「未变化」弹成错误） */
export function needsReorder(
  groups: readonly Group[],
  parentId: string | null,
  orderedIds: readonly string[],
): boolean {
  return !sameOrder(siblingOrder(groups, parentId), orderedIds);
}

/** 上移 / 下移一位（菜单替代路径） */
export function stepOrder(order: readonly string[], id: string, direction: -1 | 1): string[] {
  const index = order.indexOf(id);
  if (index < 0) return order.slice();
  const target = index + direction;
  if (target < 0 || target >= order.length) return order.slice();
  const next = order.slice();
  next[index] = order[target];
  next[target] = order[index];
  return next;
}

export type DragPlan =
  | { ok: true; action: 'move-item'; stockItemId: string; groupId: string }
  | { ok: true; action: 'reorder-group'; parentId: string | null; orderedIds: string[] }
  | { ok: true; action: 'move-group'; groupId: string; parentId: string | null; orderedIds: string[] }
  | { ok: false; reason: string };

/**
 * 拖拽落点判定（分组视图）：
 * - 行 → 分组 = 单归属移动；
 * - 分组 → 同父级兄弟 = 重排（reorderGroups）；
 * - 分组 → 异父级节点 = 换父级（relocateGroup）后再在新父级里排序；
 * - 拖到自己 = 顺序不变（调用方静默跳过）。
 */
export function planGroupDrag(groups: Group[], payload: DropPayload, target: DropTarget): DragPlan {
  if (payload.kind === 'item') {
    const groupId = target.kind === 'root' ? UNGROUPED_ID : target.groupId;
    return { ok: true, action: 'move-item', stockItemId: payload.stockItemId, groupId };
  }

  const node = groups.find((group) => group.id === payload.groupId);
  if (!node) return { ok: false, reason: '分组不存在' };
  if (node.system || node.id === UNGROUPED_ID) return { ok: false, reason: '系统分组「未分组」不可排序' };

  const targetNode = target.kind === 'group' ? groups.find((group) => group.id === target.groupId) : undefined;
  if (target.kind === 'group' && !targetNode) return { ok: false, reason: '分组不存在' };
  if (targetNode && targetNode.id === node.id) {
    return { ok: true, action: 'reorder-group', parentId: node.parentId, orderedIds: siblingOrder(groups, node.parentId) };
  }

  if (targetNode && targetNode.parentId === node.parentId) {
    const order = reorderIds(siblingOrder(groups, node.parentId), node.id, targetNode.id);
    return { ok: true, action: 'reorder-group', parentId: node.parentId, orderedIds: order };
  }

  const parentId = targetNode ? targetNode.id : null;
  const check = canMoveGroup(groups, node.id, parentId);
  if (!check.ok) return { ok: false, reason: check.reason ?? GROUP_DEPTH_MESSAGE };

  const targetOrder = siblingOrder(groups, parentId);
  const orderedIds = targetNode ? reorderIds(targetOrder, node.id, targetNode.id) : targetOrder.concat(node.id);
  return { ok: true, action: 'move-group', groupId: node.id, parentId, orderedIds };
}
