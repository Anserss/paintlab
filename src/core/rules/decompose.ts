import { formatMl, formatRatio, r1 } from '../math/quantity';
import type { BatchPart, StockItem } from '../model/types';

/**
 * 2.1.1 删除条目时的「分解回仓库」规则（唯一真相）。
 * - 稀释漆料 → 原浆 + 稀释剂等辅料；
 * - 调漆产物 → 调漆前的各组分，已稀释的颜料按稀释漆料（带比例）回仓库。
 * 条目按比例取用后余量变少时，各组分按「当前余量 / 入库总量」等比还原。
 */

export interface Decomposition {
  parts: BatchPart[];
  /** 分解后合计 ml（等于条目当前余量） */
  totalMl: number;
}

/** 有组分快照且还有余量才可分解；否则只能直接删除 */
export function decompositionOf(
  item: Pick<StockItem, 'parts' | 'volumeMl'>,
): Decomposition | null {
  const parts = item.parts ?? [];
  if (parts.length === 0) return null;
  if (!(item.volumeMl > 0)) return null;
  const snapTotal = parts.reduce((sum, part) => sum + part.ml, 0);
  if (!(snapTotal > 0)) return null;

  const factor = Math.min(1, item.volumeMl / snapTotal);
  const scaled: BatchPart[] = [];
  let acc = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const isLast = index === parts.length - 1;
    // 最后一段兜住四舍五入误差，保证分解后合计 == 当前余量
    const ml = isLast ? r1(item.volumeMl - acc) : r1(parts[index].ml * factor);
    if (ml <= 0) continue;
    scaled.push({ ...parts[index], ml });
    acc = r1(acc + ml);
  }
  if (scaled.length === 0) return null;
  return { parts: scaled, totalMl: r1(scaled.reduce((sum, part) => sum + part.ml, 0)) };
}

/** 备选文案：分解列表里每一行的说明（原浆 / 稀释剂 / 稀释漆料） */
export function decompositionPartLabel(part: BatchPart): string {
  const kind = part.aux
    ? '辅料'
    : part.state === 'thinned'
      ? '稀释漆料 ' + formatRatio(part.ratioN ?? 0)
      : '原浆';
  const name = part.nameZh || part.name;
  return name + ' · ' + kind + ' · ' + formatMl(part.ml) + ' ml';
}

/** 分解动作的按钮/确认文案：稀释 → 原浆和辅料；调漆 → 调漆前的组分 */
export function decompositionTitle(item: Pick<StockItem, 'state' | 'parts'>): string {
  const parts = item.parts ?? [];
  if (parts.some((part) => part.aux)) return '分解为原浆和辅料';
  if (item.state === 'thinned' || parts.length > 1) return '分解为调漆前的组分';
  return '分解回仓库';
}
