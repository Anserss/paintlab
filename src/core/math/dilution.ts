import { f1, r1 } from './quantity';

/** 稀释计算结果（spec 5.3 / 3.4.2）。所有数值已按 0.1 ml 取整。 */
export interface MixResult {
  neatMl: number;
  thinnerMl: number;
  totalMl: number;
}

export const RATIO_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
export const RATIO_MIN = 0;
export const RATIO_MAX = 10;

/** 正算：原浆 A + 比例 1:N -> 稀释剂、总量 */
export function fromNeat(neatMl: number, ratioN: number): MixResult {
  const thinnerMl = r1(neatMl * ratioN);
  return { neatMl: r1(neatMl), thinnerMl, totalMl: r1(neatMl + thinnerMl) };
}

/** 反算：目标总量 V + 比例 1:N -> 原浆、稀释剂（原浆向下取整，保证不溢出） */
export function fromTotal(totalMl: number, ratioN: number): MixResult {
  const neatMl = f1(totalMl / (1 + ratioN));
  return { neatMl, thinnerMl: r1(totalMl - neatMl), totalMl: r1(totalMl) };
}

/**
 * 补满：瓶容量 C、当前余量 R、比例 1:N -> 需加入的原浆与稀释剂。
 * 比例优先；原浆向下取整后总量可能比剩余空间少 0.2 ml 以内，
 * 该误差由 baseline 语义吸收（调配后 baseline = remaining，液位恒为满）。
 */
export function toFill(capacityMl: number, remainingMl: number, ratioN: number): MixResult {
  const space = r1(capacityMl - remainingMl);
  if (space <= 0) return { neatMl: 0, thinnerMl: 0, totalMl: 0 };
  const neatMl = f1(space / (1 + ratioN));
  return fromNeat(neatMl, ratioN);
}

export interface OverflowCheck {
  ok: boolean;
  /** 当前余量下最多可加的原浆量（向下取整到 0.1） */
  maxNeatMl: number;
  message?: string;
}

/** 溢出校验（AC-05 / 3.10 错误文案） */
export function checkOverflow(
  capacityMl: number,
  remainingMl: number,
  neatMl: number,
  ratioN: number,
): OverflowCheck {
  const space = r1(capacityMl - remainingMl);
  const maxNeatMl = space <= 0 ? 0 : f1(space / (1 + ratioN));
  if (neatMl <= maxNeatMl) return { ok: true, maxNeatMl };
  return {
    ok: false,
    maxNeatMl,
    message:
      '超出瓶容量：本次最多可加原浆 ' +
      maxNeatMl.toFixed(1) +
      ' ml（1:' +
      String(r1(ratioN)).replace(/\.0$/, '') +
      '）',
  };
}
