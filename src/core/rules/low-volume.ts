import type { StockItem } from '../model/types';

/**
 * 2.2 容量偏低规则（用户 2026-11-19 需求）：
 * 一次扣减操作后，仓库条目余量低于「原有容量（initialMl）的 20%」或「10 ml」时：
 * - 弹窗提示（全局只弹一次，列出本次受影响的条目）；
 * - 条目名称前挂红底白字「容量偏低」小牌（volumeMl > 0 才挂）；
 * - volumeMl 归零的条目直接从仓库删除（连同工作台引用，可撤销）。
 *
 * 注：这里说的「原有容量」一律取 StockItem.initialMl（采购规格 / 产物入档容量）。
 * 合并同配方批次时 initialMl 会同步累加，因此「20%」始终相对这瓶累计的总容量。
 */
export const LOW_VOLUME_RATIO = 0.2;
export const LOW_VOLUME_ML = 10;
export const LOW_VOLUME_LABEL = '容量偏低';
export const LOW_VOLUME_MESSAGE = '此操作后容量偏低，为防止影响你的涂装请注意。';

/** 结构化提示：数据层返回 itemId，界面再用库存 + 目录解析名称 */
export interface LowVolumeNotice {
  itemId: string;
  volumeMl: number;
  initialMl: number;
}

/** 是否为「容量偏低」：余量 > 0 且（< 原有容量 20% 或 < 10 ml） */
export function isLowVolume(volumeMl: number, initialMl: number): boolean {
  if (!(volumeMl > 0)) return false;
  if (initialMl > 0 && volumeMl < initialMl * LOW_VOLUME_RATIO) return true;
  return volumeMl < LOW_VOLUME_ML;
}

/** 余量是否为 0（2.2：归零即删除，不再保留 0 ml 条目） */
export function isVolumeEmpty(volumeMl: number): boolean {
  return !(volumeMl > 0);
}

export function lowVolumeNoticeOf(
  item: Pick<StockItem, 'id' | 'volumeMl' | 'initialMl'>,
): LowVolumeNotice | null {
  if (!isLowVolume(item.volumeMl, item.initialMl)) return null;
  return { itemId: item.id, volumeMl: item.volumeMl, initialMl: item.initialMl };
}

/** 去重后的提示列表（同一单里同一条目只出现一次） */
export function collectLowVolume(notices: readonly (LowVolumeNotice | null)[]): LowVolumeNotice[] {
  const seen = new Set<string>();
  const result: LowVolumeNotice[] = [];
  for (const notice of notices) {
    if (!notice || seen.has(notice.itemId)) continue;
    seen.add(notice.itemId);
    result.push(notice);
  }
  return result;
}
