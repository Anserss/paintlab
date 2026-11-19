import type { Finish, Paint, PaintClass, PaintLine, Solvent } from '../model/types';

/** 属性词表（spec 2.3.1）——唯一真相，任何界面不得自造同义词 */
export const SOLVENT_ZH: Record<Solvent, string> = {
  oil: '油性',
  water: '水性',
  na: '免稀释',
};

export const FINISH_ZH: Record<Finish, string> = {
  gloss: '光泽',
  semiGloss: '半光',
  matte: '消光',
  metal: '金属',
  pearl: '珠光',
  clear: '透明',
  fluorescent: '荧光',
  primer: '底漆',
  additive: '添加剂',
  wash: '渍洗',
  ink: '墨',
  other: '其他',
};

export const CLASS_ZH: Record<PaintClass, string> = {
  solid: '实色',
  clear: '透明',
  aux: '辅助',
};

export const CATEGORY_ZH: Record<string, string> = {
  color: '颜色',
  varnish: '光油',
  matte: '消光',
  thinner: '稀释剂',
  retarder: '缓干剂',
  primer: '底漆',
  surfacer: '补土',
  wash: '渍洗液',
  effect: '特效',
  other: '其他',
};

const DASH = '—';

/** 未知枚举一律回退为 — （7.2 label.test），不抛错 */
export function solventZh(value: Solvent | undefined): string {
  if (!value) return DASH;
  return SOLVENT_ZH[value] ?? DASH;
}

export function finishZh(value: Finish | undefined): string {
  if (!value) return DASH;
  return FINISH_ZH[value] ?? DASH;
}

export function classZh(value: PaintClass | undefined): string {
  if (!value) return DASH;
  return CLASS_ZH[value] ?? DASH;
}

/** 有效光泽度：paint 覆盖 line 默认 */
export function effectiveFinish(
  paint: Pick<Paint, 'finish'>,
  line: Pick<PaintLine, 'defaultFinish'>,
): Finish | undefined {
  return paint.finish ?? line.defaultFinish;
}

/**
 * 第 2 行中文属性描述的唯一拼接处（2.3.1 / AC-15）。
 * 顺序固定：油水性 · 光泽度 · 漆类；aux 类光泽位用 — 占位。
 */
export function paintDescription(
  paint: Pick<Paint, 'finish' | 'paintClass'>,
  line: Pick<PaintLine, 'solvent' | 'defaultFinish'>,
): string {
  const gloss = paint.paintClass === 'aux' ? DASH : finishZh(effectiveFinish(paint, line));
  return [solventZh(line.solvent), gloss, classZh(paint.paintClass)].join(' · ');
}

/** 第 1 行名称：中文优先，英文次要；中英文同名（调漆/稀释产物的自定义名称）不重复出副标题 */
export function paintTitle(paint: Pick<Paint, 'name' | 'nameZh'>): { primary: string; secondary?: string } {
  if (paint.nameZh && paint.nameZh !== paint.name) return { primary: paint.nameZh, secondary: paint.name };
  return { primary: paint.nameZh || paint.name };
}

/** 第 3 行来源：品牌 · 产品线 */
export function paintOriginLine(
  brandZh: string | undefined,
  lineName: string | undefined,
): string {
  return [brandZh ?? DASH, lineName ?? DASH].join(' · ');
}

export function codeOrDash(code: string | undefined): string {
  return code && code.trim() ? code : DASH;
}

/**
 * SVG 里没有文本测量 API：按「半角 0.55em / 全角 1em」估算宽度，
 * 给瓶身信息牌上的灰底小牌定宽（宁宽勿窄，避免字被裁掉）。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    width += /[\u0000-\u00ff]/.test(char) ? fontSize * 0.58 : fontSize;
  }
  return width;
}
