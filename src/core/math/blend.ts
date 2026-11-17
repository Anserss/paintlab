import { f1, r1 } from './quantity';

/**
 * 调漆台的两种模式（2026-11 改版）：
 * - 稀释：原浆 + 稀释剂 → 已稀释漆料；已稀释漆料可继续再稀释（按取用毫升数）。
 * - 调漆：多种漆料（原浆 / 已稀释漆料）按 ml 或按目标总容量分摊混合。
 * 全部数值都按 0.1 ml 向下取整（与稀释计算器同一施工口径）。
 */

export interface ThinnedDilution {
  /** 取用的已稀释漆料 ml */
  takenMl: number;
  /** 其中原浆 ml */
  neatMl: number;
  /** 其中原本携带的稀释剂 ml */
  existingThinnerMl: number;
  /** 达到目标比例还需要补加的稀释剂 ml */
  addedThinnerMl: number;
  /** 产物体积 ml（取用量 + 补加稀释剂） */
  totalMl: number;
  fromRatioN: number;
  toRatioN: number;
}

/**
 * 已稀释漆料再稀释：取 M ml（原比例 1:r0）、目标比例 1:rN（rN ≥ r0）。
 *   neat   = M / (1 + r0)
 *   已含稀释剂 = M - neat
 *   需补加   = neat × (rN - r0)
 *   产物     = M + 需补加 = neat × (1 + rN)
 */
export function diluteThinned(takenMl: number, fromRatioN: number, toRatioN: number): ThinnedDilution {
  const taken = Math.max(0, r1(takenMl));
  const neatMl = r1(taken / (1 + fromRatioN));
  const existingThinnerMl = r1(taken - neatMl);
  const addedRaw = neatMl * Math.max(0, toRatioN - fromRatioN);
  const addedThinnerMl = f1(addedRaw);
  return {
    takenMl: taken,
    neatMl,
    existingThinnerMl,
    addedThinnerMl,
    totalMl: r1(taken + addedThinnerMl),
    fromRatioN,
    toRatioN,
  };
}

/** 已稀释漆料里原浆占的比例（用于调漆时把体积折成原浆体积） */
export function neatShareOf(ml: number, ratioN: number): number {
  return r1(ml / (1 + Math.max(0, ratioN)));
}

export interface BlendPartInput {
  id: string;
  /** 用户填的份量：既是权重，也是「按 ml」时的实际取用量 */
  weight: number;
  /** 该条目已有的稀释比例；原浆为 0 */
  ratioN: number;
  availableMl: number;
}

export interface BlendShare {
  id: string;
  ml: number;
  neatMl: number;
  thinnerMl: number;
  ratioN: number;
  availableMl: number;
}

export interface BlendShortfall {
  id: string;
  needMl: number;
  availableMl: number;
}

export interface BlendPlan {
  parts: BlendShare[];
  totalMl: number;
  neatMl: number;
  thinnerMl: number;
  /** 混合后的等效比例 1:N（Σ稀释剂 / Σ原浆） */
  ratioN: number;
  targetMl: number | null;
  shortfalls: BlendShortfall[];
}

/**
 * 调漆分摊：
 * - 传 targetMl 时：按各组分 weight 的比例把目标总容量分摊到每个组分（合计恰好 = targetMl）；
 * - 不传时：各组分直接用自己填的 ml。
 */
export function planBlend(parts: BlendPartInput[], targetMl?: number | null): BlendPlan {
  const active = parts.filter((part) => part.weight > 0 || part.availableMl > 0);
  const weighted = active.filter((part) => part.weight > 0);
  const weightSum = weighted.reduce((sum, part) => sum + part.weight, 0);
  const useTarget = typeof targetMl === 'number' && Number.isFinite(targetMl) && targetMl > 0;

  let assigned = 0;
  const shares: BlendShare[] = weighted.map((part, index) => {
    let ml: number;
    if (useTarget && weightSum > 0) {
      const exact = (targetMl as number) * (part.weight / weightSum);
      ml = index === weighted.length - 1 ? r1((targetMl as number) - assigned) : f1(exact);
      ml = Math.max(0, ml);
      assigned = r1(assigned + ml);
    } else {
      ml = Math.max(0, r1(part.weight));
    }
    const neatMl = neatShareOf(ml, part.ratioN);
    return {
      id: part.id,
      ml,
      neatMl,
      thinnerMl: r1(ml - neatMl),
      ratioN: part.ratioN,
      availableMl: part.availableMl,
    };
  });

  const totalMl = r1(shares.reduce((sum, part) => sum + part.ml, 0));
  const neatMl = r1(shares.reduce((sum, part) => sum + part.neatMl, 0));
  const thinnerMl = r1(totalMl - neatMl);
  const ratioN = neatMl > 0 ? r1(thinnerMl / neatMl) : 0;
  const shortfalls: BlendShortfall[] = shares
    .filter((part) => part.ml > part.availableMl + 1e-6)
    .map((part) => ({ id: part.id, needMl: part.ml, availableMl: part.availableMl }));

  return { parts: shares, totalMl, neatMl, thinnerMl, ratioN, targetMl: useTarget ? r1(targetMl as number) : null, shortfalls };
}
