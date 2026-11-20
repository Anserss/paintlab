import { hueBucket } from '@/core/math/color';
import type { Finish, Paint, PaintCategory, PaintClass, PaintLine } from '@/core/model/types';
import { CATEGORY_ZH, paintDescription, solventZh } from '@/core/render/label';

/** 采购大厅的搜索 / 筛选 / 排序（spec 3.2）——纯函数，单独可测。 */

export type ProcureSort = 'code' | 'hue';

/** 采购大厅的两个货架：颜色与辅料（稀释剂/缓干剂等）分开陈列，避免互相淹没 */
export type ProcureKind = 'color' | 'aux';

export interface ProcureFilters {
  kind: ProcureKind;
  query: string;
  /** '' = 全部产品线 */
  lineId: string;
  paintClass: PaintClass | '';
  finish: Finish | '';
  unregisteredOnly: boolean;
  sort: ProcureSort;
}

export const DEFAULT_PROCURE_FILTERS: ProcureFilters = {
  kind: 'color',
  query: '',
  lineId: '',
  paintClass: '',
  finish: '',
  unregisteredOnly: false,
  sort: 'code',
};

/** 左栏「全部」行的 id（其余为真实 brandId） */
export const ALL_BRANDS = 'all';

const CLASS_ORDER: PaintClass[] = ['solid', 'clear', 'aux'];

const FINISH_ORDER: Finish[] = [
  'gloss',
  'semiGloss',
  'matte',
  'metal',
  'pearl',
  'clear',
  'fluorescent',
  'primer',
  'additive',
  'wash',
  'ink',
  'other',
];

/**
 * 2.2.2：辅料货架的归类不再只看 `paintClass === 'aux'`。
 * 底漆 / 补土（例如郡士 Mr.SURFACER SF283–SF292、匠域 MP01）在目录里按厂线记成
 * `paintClass: 'solid'` + `category: 'primer'`，但它们同样是「涂装前先买的那一瓶」，
 * 放在颜色货架里会挤掉真正的色漆，所以按类目一并归到辅料。
 */
const AUX_CATEGORIES: ReadonlySet<PaintCategory> = new Set<PaintCategory>([
  'thinner',
  'retarder',
  'primer',
  'surfacer',
]);

export function isAuxPaint(paint: Pick<Paint, 'paintClass' | 'category'>): boolean {
  return paint.paintClass === 'aux' || AUX_CATEGORIES.has(paint.category);
}

/** 辅料行的第二行文案：油性 · 稀释剂（颜色行仍由 core 的 paintDescription 负责） */
export function procureDescription(paint: Paint, line: PaintLine | undefined): string | undefined {
  if (!isAuxPaint(paint)) return undefined;
  const category = CATEGORY_ZH[paint.category] ?? '辅料';
  return [solventZh(line?.solvent), category].join(' · ');
}

const lower = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

/** 有效光泽：paint 覆盖 line 默认（与 core/render/label 一致） */
export function effectiveFinishOf(paint: Paint, line: PaintLine | undefined): Finish | undefined {
  return paint.finish ?? line?.defaultFinish;
}

/** 搜索：色号 / 中英文名 / #RRGGBB / 属性词（属性词只从 core 的 paintDescription 取） */
export function matchesQuery(paint: Paint, line: PaintLine | undefined, query: string): boolean {
  const q = lower(query);
  if (!q) return true;
  if (lower(paint.code).includes(q)) return true;
  if (lower(paint.name).includes(q)) return true;
  if (lower(paint.nameZh).includes(q)) return true;
  const hex = lower(paint.hex).replace(/^#/, '');
  const bare = q.replace(/^#/, '');
  if (bare.length >= 3 && hex.includes(bare)) return true;
  // 2.2.2：辅料按类目检索（「稀释剂」「缓干剂」「底漆」都能搜到）
  const category = CATEGORY_ZH[paint.category];
  if (category && category.toLowerCase().includes(q)) return true;
  if (!line) return false;
  if (lower(paintDescription(paint, line)).includes(q)) return true;
  return lower(line.name).includes(q) || lower(line.nameZh).includes(q);
}

export function matchesFilters(
  paint: Paint,
  line: PaintLine | undefined,
  filters: ProcureFilters,
  registeredCount: number,
): boolean {
  if (!matchesQuery(paint, line, filters.query)) return false;
  if (filters.lineId && paint.lineId !== filters.lineId) return false;
  if (filters.paintClass && paint.paintClass !== filters.paintClass) return false;
  if (filters.finish && effectiveFinishOf(paint, line) !== filters.finish) return false;
  if (filters.unregisteredOnly && registeredCount > 0) return false;
  return true;
}

function byCode(a: Paint, b: Paint): number {
  const ac = a.code ?? '';
  const bc = b.code ?? '';
  if (!ac && bc) return 1;
  if (ac && !bc) return -1;
  return (
    ac.localeCompare(bc, 'en', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name)
  );
}

/** 排序：色号升序（默认，数字感知）/ 按色相（core 的 hueBucket） */
export function sortPaints(paints: readonly Paint[], sort: ProcureSort): Paint[] {
  const copy = paints.slice();
  if (sort === 'hue') {
    return copy.sort(
      (a, b) => hueBucket(a.hex) - hueBucket(b.hex) || a.hex.localeCompare(b.hex) || byCode(a, b),
    );
  }
  return copy.sort(byCode);
}

/** 按货架（颜色 / 辅料）切分品牌池，下拉候选项也据此收敛 */
export function paintsOfKind(paints: readonly Paint[], kind: ProcureKind): Paint[] {
  return paints.filter((paint) => (kind === 'aux' ? isAuxPaint(paint) : !isAuxPaint(paint)));
}

export function filterPaints(
  paints: readonly Paint[],
  linesById: Record<string, PaintLine>,
  filters: ProcureFilters,
  registeredOf: (paint: Paint) => number,
): Paint[] {
  return paints
    .filter((paint) => (filters.kind === 'aux' ? isAuxPaint(paint) : !isAuxPaint(paint)))
    .filter((paint) =>
      matchesFilters(paint, linesById[paint.lineId], filters, registeredOf(paint)),
    );
}

export interface FilterOptions {
  lines: PaintLine[];
  classes: PaintClass[];
  finishes: Finish[];
}

/** 下拉候选项只列出当前品牌池里真实出现过的产品线 / 漆类 / 光泽 */
export function filterOptionsOf(
  paints: readonly Paint[],
  linesById: Record<string, PaintLine>,
): FilterOptions {
  const lineIds = new Set<string>();
  const classes = new Set<PaintClass>();
  const finishes = new Set<Finish>();
  for (const paint of paints) {
    lineIds.add(paint.lineId);
    classes.add(paint.paintClass);
    const finish = effectiveFinishOf(paint, linesById[paint.lineId]);
    if (finish) finishes.add(finish);
  }
  const lines = Array.from(lineIds)
    .map((id) => linesById[id])
    .filter((line): line is PaintLine => Boolean(line))
    .sort((a, b) => (a.nameZh ?? a.name).localeCompare(b.nameZh ?? b.name));
  return {
    lines,
    classes: CLASS_ORDER.filter((value) => classes.has(value)),
    finishes: FINISH_ORDER.filter((value) => finishes.has(value)),
  };
}

/** 产品线的显示名：中文优先（2.2.2），没有中文名回退厂线原名 */
export function lineLabelOf(line: PaintLine): string {
  return line.nameZh || line.name;
}

export interface ProcureSummary {
  color: number;
  aux: number;
  /** 色值按色名/社区色库推定的条目数（列表只在工具栏汇总，不再逐行挂牌） */
  estimated: number;
  /** 目录里尚未核验的条目数（辅料规格还没对过官方页） */
  unverified: number;
}

/** 当前品牌池的货架与核验摘要（2.2.2：替代原来的逐行「待核验 / ≈推定色」小牌） */
export function summarizePool(paints: readonly Paint[]): ProcureSummary {
  let color = 0;
  let aux = 0;
  let estimated = 0;
  let unverified = 0;
  for (const paint of paints) {
    if (isAuxPaint(paint)) aux += 1;
    else color += 1;
    if (paint.hexEstimated) estimated += 1;
    if (!paint.verifiedAt) unverified += 1;
  }
  return { color, aux, estimated, unverified };
}
