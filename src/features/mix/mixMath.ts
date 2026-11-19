import { diluteThinned, planBlend } from '@/core/math/blend';
import type { BlendPlan } from '@/core/math/blend';
import { fromNeat, fromTotal, RATIO_MAX, RATIO_MIN } from '@/core/math/dilution';
import { clamp, quantize1, r1 } from '@/core/math/quantity';
import type { PaintState } from '@/core/model/types';

/**
 * 调漆台（2.2 改版）：
 * - 稀释模式：原浆 / 已稀释漆料 + 稀释剂 → 已稀释漆料，确认后自动入库；
 * - 调漆模式：两种口径二选一 ——
 *   ① 按总量 + 配比：填目标总容量 V 与各组分配比权重，自动算各组分 ml；
 *   ② 按各组分用量：填各组分 ml，自动算占比与合计；
 *   确认后扣减组分库存、产物自动入库，同配方自动合并容量。
 * - 不再有「调漆台批次」与「使用 / 清空」动作。
 */
export type MixMode = 'dilute' | 'blend';
/** 稀释模式的输入口径：按原浆量 / 按目标总量 */
export type DiluteInputMode = 'neat' | 'total';
/** 调漆模式的输入口径：按总量配比 / 按各组分用量 */
export type BlendLogic = 'ratio' | 'amount';

export interface MixModeOption {
  value: MixMode;
  label: string;
  hint: string;
}

export const MIX_MODES: readonly MixModeOption[] = [
  { value: 'dilute', label: '稀释', hint: '原浆 + 稀释剂 → 已稀释漆料' },
  { value: 'blend', label: '调漆', hint: '多组分按配比或用量混合' },
];

export const DILUTE_INPUT_MODES: readonly { value: DiluteInputMode; label: string; hint: string }[] = [
  { value: 'neat', label: '按原浆量', hint: '填原浆 ml，正推稀释剂' },
  { value: 'total', label: '按目标总量', hint: '填总容量，反推原浆' },
];

export const BLEND_LOGIC_MODES: readonly { value: BlendLogic; label: string; hint: string }[] = [
  { value: 'ratio', label: '按总量 ÷ 配比', hint: '给总容量 V 和各组分配比，自动算各组分 ml' },
  { value: 'amount', label: '按各组分用量', hint: '给各组分 ml，自动算占比与总容量' },
];

/** 比例预设（0.5 步进，与旧稀释计算器一致） */
export const RATIO_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;

export { RATIO_MAX, RATIO_MIN };

export interface DilutePlan {
  kind: 'neat' | 'total' | 'thinned';
  /** 取用来源的体积（thinned 模式为取用量；原浆模式 = 原浆量） */
  takenMl: number;
  neatMl: number;
  thinnerMl: number;
  totalMl: number;
  ratioN: number;
  fromRatioN: number;
  /** 取整前的值，供界面核对 */
  neatRaw: number;
  thinnerRaw: number;
  totalRaw: number;
  /** thinned 模式下补加的稀释剂（其余稀释剂已在来源里） */
  addedThinnerMl: number;
}

export interface DilutePlanInput {
  sourceState: 'neat' | 'thinned';
  /** 原浆模式下的输入口径 */
  inputMode: DiluteInputMode;
  fromRatioN: number;
  targetRatioN: number;
  neatMl: number;
  totalMl: number;
  takenMl: number;
}

/** 稀释模式统一出参：取整全部由 core 完成，界面只展示取整前的值 */
export function planDilution(input: DilutePlanInput): DilutePlan {
  const targetRatioN = r1(input.targetRatioN);

  if (input.sourceState === 'thinned') {
    const plan = diluteThinned(input.takenMl, r1(input.fromRatioN), targetRatioN);
    return {
      kind: 'thinned',
      takenMl: plan.takenMl,
      neatMl: plan.neatMl,
      thinnerMl: r1(plan.totalMl - plan.neatMl),
      totalMl: plan.totalMl,
      ratioN: targetRatioN,
      fromRatioN: r1(input.fromRatioN),
      neatRaw: plan.neatMl,
      thinnerRaw: r1(plan.neatMl * targetRatioN),
      totalRaw: r1(plan.neatMl * (1 + targetRatioN)),
      addedThinnerMl: plan.addedThinnerMl,
    };
  }

  if (input.inputMode === 'total') {
    const target = Math.max(0, r1(input.totalMl));
    const mix = fromTotal(target, targetRatioN);
    const neatRaw = target / (1 + targetRatioN);
    return {
      kind: 'total',
      takenMl: mix.neatMl,
      neatMl: mix.neatMl,
      thinnerMl: mix.thinnerMl,
      totalMl: mix.totalMl,
      ratioN: targetRatioN,
      fromRatioN: 0,
      neatRaw,
      thinnerRaw: neatRaw * targetRatioN,
      totalRaw: target,
      addedThinnerMl: mix.thinnerMl,
    };
  }

  const neat = Math.max(0, r1(input.neatMl));
  const mix = fromNeat(neat, targetRatioN);
  return {
    kind: 'neat',
    takenMl: mix.neatMl,
    neatMl: mix.neatMl,
    thinnerMl: mix.thinnerMl,
    totalMl: mix.totalMl,
    ratioN: targetRatioN,
    fromRatioN: 0,
    neatRaw: neat,
    thinnerRaw: neat * targetRatioN,
    totalRaw: neat * (1 + targetRatioN),
    addedThinnerMl: mix.thinnerMl,
  };
}

export interface BlendPartRow {
  id: string;
  code: string;
  name: string;
  /** 展示色（调漆产物 = 自定义色；稀释漆料 = 原浆色） */
  hex: string;
  /** 份量输入框的原始文本（按配比时是权重，按用量时是 ml） */
  weightText: string;
  ratioN: number;
  availableMl: number;
  state: PaintState;
  /** 稀释漆料的「(1:N)稀释」比例（2.1） */
  dilutionRatioN: number | null;
  /** 调漆产物（自定义名称/颜色） */
  mixed: boolean;
}

/** 调漆模式：按各组分权重 / 目标总容量分摊 */
export function planBlendFor(rows: BlendPartRow[], targetMl: number | null): BlendPlan {
  return planBlend(
    rows.map((row) => ({
      id: row.id,
      weight: parseMl(row.weightText),
      ratioN: r1(row.ratioN),
      availableMl: row.availableMl,
    })),
    targetMl,
  );
}

/** 组分占比（0–1），用于配方条与结果表 */
export function shareOf(ml: number, totalMl: number): number {
  if (!(totalMl > 0)) return 0;
  return clamp(ml / totalMl, 0, 1);
}

export interface RatioParse {
  value: number;
  clamped: boolean;
}

/** 比例输入：0–10、0.1 步进；非法范围钳制（空串/未成数返回 null，继续编辑） */
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

/** 取整前的展示值（两位小数） */
export const formatRaw = (n: number): string => n.toFixed(2);

/** 库存不足文案（3.10） */
export function stockShortText(label: string, volumeMl: number, needMl: number): string {
  return '库存不足：' + label + ' 仅剩 ' + volumeMl.toFixed(1) + ' ml，本次需要 ' + needMl.toFixed(1) + ' ml';
}
