import { hueBucket } from '@/core/math/color';
import type { Finish, Paint, PaintClass, PaintLine } from '@/core/model/types';
import { paintDescription } from '@/core/render/label';

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
  return paints.filter((paint) => (kind === 'aux' ? paint.paintClass === 'aux' : paint.paintClass !== 'aux'));
}

export function filterPaints(
  paints: readonly Paint[],
  linesById: Record<string, PaintLine>,
  filters: ProcureFilters,
  registeredOf: (paint: Paint) => number,
): Paint[] {
  return paints
    .filter((paint) => (filters.kind === 'aux' ? paint.paintClass === 'aux' : paint.paintClass !== 'aux'))
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
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    lines,
    classes: CLASS_ORDER.filter((value) => classes.has(value)),
    finishes: FINISH_ORDER.filter((value) => finishes.has(value)),
  };
}
