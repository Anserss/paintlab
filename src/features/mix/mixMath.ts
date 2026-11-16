import type { OverflowCheck } from '@/core/math/dilution';
import {
  RATIO_MAX,
  RATIO_MIN,
  checkOverflow,
  fromNeat,
  fromTotal,
  toFill,
} from '@/core/math/dilution';
import { clamp, quantize1, r1 } from '@/core/math/quantity';

export { RATIO_MAX, RATIO_MIN };

/** 稀释计算器三模式（3.4.2）：补满为主推 */
export type MixMode = 'fill' | 'neat' | 'total';

export interface MixModeOption {
  value: MixMode;
  label: string;
  hint: string;
}

export const MIX_MODES: readonly MixModeOption[] = [
  { value: 'fill', label: '补满瓶（推荐）', hint: '按剩余空间反推原浆' },
  { value: 'neat', label: '指定原浆量', hint: '按原浆量正推稀释剂与总量' },
  { value: 'total', label: '反算目标总量', hint: '按目标总量反推原浆' },
];

/** 瓶容量预设与自定义范围（3.4.3：5–250 整数） */
export const CAPACITY_PRESETS = [15, 30, 60, 100] as const;
export const CAPACITY_MIN = 5;
export const CAPACITY_MAX = 250;

/** 比例预设（3.4.2） */
export const RATIO_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;

export interface MixPlan {
  mode: MixMode;
  neatMl: number;
  thinnerMl: number;
  totalMl: number;
  /** 取整前的值，供界面核对（3.4.2 施工口径） */
  neatRaw: number;
  thinnerRaw: number;
  totalRaw: number;
  ratioN: number;
  capacityMl: number;
  remainingMl: number;
  overflow: OverflowCheck;
}

export interface PlanInput {
  mode: MixMode;
  capacityMl: number;
  remainingMl: number;
  ratioN: number;
  neatMl: number;
  totalMl: number;
}

/**
 * 三种模式统一出参：所有取整都由 core 的 toFill / fromTotal / fromNeat 完成，
 * 界面只额外展示取整前的值，绝不另算一份结果。
 */
export function planFor(input: PlanInput): MixPlan {
  const { mode, capacityMl, remainingMl, ratioN } = input;
  const denom = 1 + ratioN;

  if (mode === 'neat') {
    const neat = Math.max(0, r1(input.neatMl));
    const mix = fromNeat(neat, ratioN);
    return {
      mode,
      neatMl: mix.neatMl,
      thinnerMl: mix.thinnerMl,
      totalMl: mix.totalMl,
      neatRaw: neat,
      thinnerRaw: neat * ratioN,
      totalRaw: neat * denom,
      ratioN,
      capacityMl,
      remainingMl,
      overflow: checkOverflow(capacityMl, remainingMl, neat, ratioN),
    };
  }

  if (mode === 'total') {
    const target = Math.max(0, r1(input.totalMl));
    // 与落库一致：先由目标总量反推原浆，再用原浆正算
    const neat = fromTotal(target, ratioN).neatMl;
    const mix = fromNeat(neat, ratioN);
    const neatRaw = target / denom;
    return {
      mode,
      neatMl: mix.neatMl,
      thinnerMl: mix.thinnerMl,
      totalMl: mix.totalMl,
      neatRaw,
      thinnerRaw: neatRaw * ratioN,
      totalRaw: target,
      ratioN,
      capacityMl,
      remainingMl,
      overflow: checkOverflow(capacityMl, remainingMl, neat, ratioN),
    };
  }

  const space = Math.max(0, r1(capacityMl - remainingMl));
  const mix = toFill(capacityMl, remainingMl, ratioN);
  const neatRaw = space / denom;
  return {
    mode: 'fill',
    neatMl: mix.neatMl,
    thinnerMl: mix.thinnerMl,
    totalMl: mix.totalMl,
    neatRaw,
    thinnerRaw: neatRaw * ratioN,
    totalRaw: neatRaw * denom,
    ratioN,
    capacityMl,
    remainingMl,
    overflow: checkOverflow(capacityMl, remainingMl, mix.neatMl, ratioN),
  };
}

export interface RatioParse {
  value: number;
  clamped: boolean;
}

/** 比例输入：0–10、0.1 步进；非法范围钳制（3.4.2）。空串/未成数返回 null（继续编辑） */
export function parseRatio(raw: string): RatioParse | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const quantized = quantize1(parsed);
  const value = clamp(quantized, RATIO_MIN, RATIO_MAX);
  return { value, clamped: value !== quantized };
}

/** 毫升输入：非法与负数按 0 处理，落库前吸附到 0.1 */
export function parseMl(raw: string): number {
  const parsed = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, r1(parsed)) : 0;
}

/** 自定义瓶容量：5–250 整数 */
export function parseCapacity(raw: string): number | null {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < CAPACITY_MIN || rounded > CAPACITY_MAX) return null;
  return rounded;
}

/** 取整前的展示值（两位小数） */
export const formatRaw = (n: number): string => n.toFixed(2);

/** 3.10 库存不足文案 */
export function stockShortText(label: string, volumeMl: number, needMl: number): string {
  return '原浆不足：' + label + ' 仅剩 ' + volumeMl.toFixed(1) + ' ml，无法取用 ' + needMl.toFixed(1) + ' ml';
}
