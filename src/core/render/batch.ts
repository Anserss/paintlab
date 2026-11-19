import { formatRatio } from '../math/quantity';
import type { Bottle, Paint, PaintState, StockItem } from '../model/types';
import { isUndefinedColor } from './swatch';

/**
 * 2.1 稀释漆料的展示规则（唯一真相）：
 * 稀释产物跟调漆不同 —— 名称沿用原浆、色值沿用原浆目录色，
 * 只在名称前加一块灰底白字的「(1:N)稀释」小牌。
 * 调漆产物继续走 2.0 的「调漆N + 自定义色」。
 */

export const DILUTION_WORD = '稀释';

/** 灰底白字小牌上的字：(1:2)稀释 */
export function dilutionTagText(ratioN: number): string {
  return '(' + formatRatio(ratioN) + ')' + DILUTION_WORD;
}

/** 调漆台的稀释批次：mode='dilute' 的产物（名称不可改、不占调漆序号） */
export function isDiluteBatch(bottle: Pick<Bottle, 'mode'>): boolean {
  return bottle.mode === 'dilute';
}

/** 稀释小牌上的比例：0 表示没真正加稀释剂（等同原浆），不出牌 */
export function bottleDilutionRatio(bottle: Pick<Bottle, 'mode' | 'ratioN'>): number | null {
  return isDiluteBatch(bottle) && bottle.ratioN > 0 ? bottle.ratioN : null;
}

/** 仓库条目是不是稀释漆料（入库时写入 dilutionRatioN） */
export function stockDilutionRatio(item: Pick<StockItem, 'dilutionRatioN'>): number | null {
  const value = item.dilutionRatioN;
  return typeof value === 'number' && value > 0 ? value : null;
}

/**
 * 平台流转规则（2.1）：
 * - 稀释漆料：仓库 ⇄ 调漆台 ⇄ 工作台 三边互通；
 * - 原浆：采购 → 仓库后只能在仓库与调漆台之间流转，不能上工作台。
 */
export function canEnterWorkbench(state: PaintState): boolean {
  return state !== 'neat';
}

export const WORKBENCH_NEAT_BLOCK =
  '原浆只能在仓库与调漆台之间流转：先在调漆台稀释，再从侧栏调取稀释漆料';

/** 一支批次/一条库存的画法：名称、色值、透明度、未定色、稀释比例 */
export interface BatchLook {
  name: string;
  hex: string;
  alpha?: number;
  undefinedColor: boolean;
  dilutionRatioN: number | null;
}

/** 调漆台批次（稀释 = 原浆色值直接显示；调漆 = 自定义色 + 未定色） */
export function bottleLook(bottle: Bottle): BatchLook {
  const ratio = bottleDilutionRatio(bottle);
  if (ratio !== null) {
    return {
      name: bottle.name,
      hex: bottle.hex,
      undefinedColor: false,
      dilutionRatioN: ratio,
    };
  }
  const alpha = typeof bottle.colorAlpha === 'number' ? bottle.colorAlpha : undefined;
  return {
    name: bottle.name,
    hex: bottle.colorHex ?? bottle.hex,
    ...(alpha === undefined ? {} : { alpha }),
    undefinedColor: isUndefinedColor(bottle.colorHex, bottle.colorAlpha),
    dilutionRatioN: null,
  };
}

/** 批次的完整展示名（切换批次 / 页头用）：(1:2)稀释 钴蓝 */
export function bottleDisplayLabel(bottle: Bottle): string {
  const ratio = bottleDilutionRatio(bottle);
  return ratio === null ? bottle.name : dilutionTagText(ratio) + ' ' + bottle.name;
}

/** 仓库条目（含工作台取用列表）的画法：稀释按原浆名称与色值 */
export function stockLook(
  item: Pick<StockItem, 'customName' | 'customHex' | 'customAlpha' | 'dilutionRatioN'>,
  paint: Pick<Paint, 'name' | 'nameZh' | 'hex' | 'paintClass'>,
): BatchLook {
  const ratio = stockDilutionRatio(item);
  const baseName = paint.nameZh || paint.name;
  if (ratio !== null) {
    return {
      name: item.customName ?? baseName,
      hex: item.customHex ?? paint.hex,
      undefinedColor: false,
      dilutionRatioN: ratio,
    };
  }
  const customMixed = Boolean(item.customName || item.customHex);
  const alpha = typeof item.customAlpha === 'number' ? item.customAlpha : undefined;
  return {
    name: item.customName ?? baseName,
    hex: item.customHex ?? paint.hex,
    ...(alpha === undefined ? {} : { alpha }),
    undefinedColor: customMixed ? isUndefinedColor(item.customHex, item.customAlpha) : false,
    dilutionRatioN: null,
  };
}

/** 调漆产物（仓库/工作台）的说明文案；普通条目返回 null */
export function stockOriginNote(item: Pick<StockItem, 'dilutionRatioN' | 'customName'>): string | null {
  const ratio = stockDilutionRatio(item);
  if (ratio !== null) return '稀释漆料 · 原浆按 ' + formatRatio(ratio) + ' 稀释';
  if (item.customName) return '调漆产物';
  return null;
}
