import { createCommand, newId, patch } from '@/core/history/command';
import { hexToHsl, mixHex } from '@/core/math/color';
import { diluteThinned, planBlend } from '@/core/math/blend';
import { fromNeat } from '@/core/math/dilution';
import { r1 } from '@/core/math/quantity';
import { BottleSchema, parseOrErrors } from '@/core/model/schemas';
import type {
  Bottle,
  BottleComponent,
  Command,
  LedgerEntry,
  LevelMode,
  MixBatchMode,
  MixRecord,
  Paint,
  PaintClass,
  Patch,
  StockItem,
  UsageRecord,
} from '@/core/model/types';
import { checkBottleLevel, checkUsageAmount } from '@/core/rules/invariants';
import type { DepotStore } from '../db';
import { recordCommand } from './history';
import { fail, ok, runPatches, toFailure } from './patch';
import type { Result } from './patch';

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;
const appendPatch = (collection: 'bottles' | 'stockItems' | 'mixRecords' | 'usageRecords' | 'ledger' | 'workbenchItems', doc: object): Patch =>
  patch.append(collection, record(doc));

export const BOTTLE_HEX_EMPTY = '#bfbfbf';

export async function listBottles(s: DepotStore): Promise<Bottle[]> {
  const bottles = await s.bottles.toArray();
  return bottles.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBottle(s: DepotStore, id: string): Promise<Bottle | undefined> {
  return s.bottles.get(id);
}

export function bottlePaintClass(components: BottleComponent[]): PaintClass {
  if (components.length === 0) return 'solid';
  if (components.some((component) => component.paintClass === 'solid')) return 'solid';
  if (components.every((component) => component.paintClass === 'clear')) return 'clear';
  return 'aux';
}

export interface CreateBottleInput {
  name: string;
  capacityMl: number;
  ratioN?: number;
  levelMode?: LevelMode;
  at?: number;
}

/** 新建空瓶：容量 5–250 整数（spec 3.7.2），不产生 Command */
export async function createBottle(s: DepotStore, input: CreateBottleInput): Promise<Result<Bottle>> {
  const at = input.at ?? Date.now();
  const bottle: Bottle = {
    id: newId('bottle'),
    name: input.name,
    capacityMl: Math.round(input.capacityMl),
    baselineMl: 0,
    remainingMl: 0,
    ratioN: r1(input.ratioN ?? 2),
    paintClass: 'solid',
    hex: BOTTLE_HEX_EMPTY,
    components: [],
    levelMode: input.levelMode ?? 'baseline',
    updatedAt: at,
  };
  const parsed = parseOrErrors(BottleSchema, bottle);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }
  try {
    await runPatches(s, [patch.add('bottles', record(bottle))]);
  } catch (error) {
    return toFailure(error);
  }
  return ok(bottle);
}

const mlText = (value: number): string => String(r1(value));

export interface BottleCapacityInput {
  bottleId: string;
  capacityMl: number;
  at?: number;
}

/**
 * 改批次容量：容量 5–2500 整数；新容量 < 当前余量时必须拒绝并给出可行动文案。
 * 成功只改 capacityMl（baselineMl/remainingMl 不动，除非基准量超过新容量），写 ledger 并入撤销栈。
 */
export async function setBottleCapacity(
  s: DepotStore,
  input: BottleCapacityInput,
): Promise<Result<{ command: Command; bottle: Bottle }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('批次不存在', 'conflict');
  const capacity = input.capacityMl;
  if (!Number.isInteger(capacity) || capacity < 5 || capacity > 250) {
    return fail('容量必须是 5–250 的整数', 'validation');
  }
  if (capacity + 1e-6 < bottle.remainingMl) {
    const ml = mlText(bottle.remainingMl);
    return fail('瓶内尚有 ' + ml + ' ml，请先倒出或选择 ≥ ' + ml + ' ml 的瓶', 'validation');
  }
  if (capacity === bottle.capacityMl) return fail('新容量与当前容量相同', 'conflict');

  const nextBaseline = Math.min(bottle.baselineMl, capacity);
  const at = input.at ?? Date.now();
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'adjust',
    refId: bottle.id,
    at,
    meta: { action: 'bottle-capacity', from: bottle.capacityMl, to: capacity },
  };
  const nextBottle: Bottle = { ...bottle, capacityMl: capacity, baselineMl: nextBaseline, updatedAt: at };
  const parsed = parseOrErrors(BottleSchema, nextBottle);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }

  const forward: Patch[] = [
    patch.replace('bottles', bottle.id, 'capacityMl', capacity),
    patch.replace('bottles', bottle.id, 'updatedAt', at),
    appendPatch('ledger', ledgerEntry),
  ];
  const inverse: Patch[] = [
    patch.replace('bottles', bottle.id, 'capacityMl', bottle.capacityMl),
    patch.replace('bottles', bottle.id, 'updatedAt', bottle.updatedAt),
    patch.remove('ledger', ledgerEntry.id),
  ];
  if (nextBaseline !== bottle.baselineMl) {
    forward.push(patch.replace('bottles', bottle.id, 'baselineMl', nextBaseline));
    inverse.push(patch.replace('bottles', bottle.id, 'baselineMl', bottle.baselineMl));
  }

  const command = createCommand(
    'adjust',
    '批次容量「' + bottle.name + '」' + mlText(bottle.capacityMl) + ' → ' + mlText(capacity) + ' ml',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, bottle: nextBottle });
}

/** 调漆台里一支漆料的最小引用（补丁与组分只需要这些字段） */
export type BatchPaintRef = Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'hex' | 'paintClass'>;

export interface DiluteBatchInput {
  /** 取用来源（原浆或已稀释漆料）的库存条目 */
  sourceStockItemId: string;
  /** 稀释剂库存条目；关闭「扣减稀释剂库存」时可不传 */
  thinnerStockItemId?: string;
  trackThinner?: boolean;
  /** 来源是否为已稀释漆料（缺省按条目 state 判断） */
  sourceIsThinned?: boolean;
  /** 原浆模式：取用原浆量 A */
  neatMl?: number;
  /** 已稀释模式：取用已稀释漆料量 M */
  takenMl?: number;
  /** 已稀释模式：来源当前比例 1:r0 */
  currentRatioN?: number;
  /** 目标比例 1:N */
  targetRatioN: number;
  paint: BatchPaintRef;
  at?: number;
}

export interface BlendBatchPartInput {
  stockItemId: string;
  paint: BatchPaintRef;
  /** 份量：按 ml 直接取用，或作为分摊目标总容量的权重 */
  ml: number;
}

export interface BlendBatchInput {
  parts: BlendBatchPartInput[];
  /** 已知总容量：按各组分 ml 比例分摊（不传则按各组 ml 直接混合） */
  targetMl?: number | null;
  at?: number;
}

export interface MixBatchPayload {
  command: Command;
  bottle: Bottle;
  mixRecord: MixRecord;
  message: string;
}

const batchName = (prefix: string, label: string, totalMl: number): string => {
  const text = prefix + ' ' + label + ' ' + totalMl.toFixed(1) + 'ml';
  return text.length <= 16 ? text : text.slice(0, 16);
};

/** 批次名的来源标签：尽量用漆名（色号往往只有 1–2 个字符，拼进名字不好读） */
const batchLabel = (ref: { code?: string; name: string }): string => ref.name || ref.code || '漆料';

/** 批次容量：按产出体积自动取整（最小 5 ml），不再让用户选瓶容量 */
const batchCapacity = (totalMl: number): number => Math.max(5, Math.ceil(totalMl - 1e-6));

function batchBottle(input: {
  name: string;
  totalMl: number;
  ratioN: number;
  paintClass: PaintClass;
  hex: string;
  components: BottleComponent[];
  mode: MixBatchMode;
  at: number;
}): Bottle {
  const capacityMl = batchCapacity(input.totalMl);
  return {
    id: newId('bottle'),
    name: input.name,
    capacityMl,
    baselineMl: r1(input.totalMl),
    remainingMl: r1(input.totalMl),
    ratioN: r1(input.ratioN),
    paintClass: input.paintClass,
    hex: input.hex,
    components: input.components,
    levelMode: 'baseline',
    updatedAt: input.at,
    mode: input.mode,
  };
}

/**
 * 稀释事务（调漆台 · 稀释模式）：
 * - 原浆：A + 稀释剂 A×N → 产物 A(1+N)；
 * - 已稀释漆料：取 M ml（1:r0）→ 目标 1:rN，补加稀释剂 neat×(rN−r0)，产物 M + 补加量。
 * 原浆 / 已稀释漆料 / 稀释剂在同一个 Dexie 事务里扣减，产物直接成为一支新批次。
 */
export async function diluteIntoBatch(s: DepotStore, input: DiluteBatchInput): Promise<Result<MixBatchPayload>> {
  const source = await s.stockItems.get(input.sourceStockItemId);
  if (!source) return fail('取用条目不存在', 'conflict');
  const isThinned = input.sourceIsThinned ?? source.state === 'thinned';
  const targetRatioN = r1(input.targetRatioN);
  if (targetRatioN < 0 || targetRatioN > 10) return fail('比例超出范围 0–10', 'validation');

  let takeMl = 0;
  let neatMl = 0;
  let addedThinnerMl = 0;
  let totalMl = 0;

  if (isThinned) {
    const fromRatioN = r1(input.currentRatioN ?? source.ratioN ?? 0);
    if (targetRatioN <= fromRatioN) {
      return fail('目标比例 1:' + mlText(targetRatioN) + ' 必须大于当前比例 1:' + mlText(fromRatioN), 'validation');
    }
    const plan = diluteThinned(input.takenMl ?? 0, fromRatioN, targetRatioN);
    takeMl = plan.takenMl;
    neatMl = plan.neatMl;
    addedThinnerMl = plan.addedThinnerMl;
    totalMl = plan.totalMl;
    if (takeMl <= 0) return fail('取用量必须大于 0', 'validation');
    if (source.volumeMl + 1e-6 < takeMl) {
      return fail('已稀释漆料不足：仅剩 ' + mlText(source.volumeMl) + ' ml，无法取用 ' + mlText(takeMl) + ' ml', 'validation');
    }
  } else {
    neatMl = r1(input.neatMl ?? 0);
    if (neatMl <= 0) return fail('原浆量必须大于 0', 'validation');
    if (source.volumeMl + 1e-6 < neatMl) {
      return fail('原浆不足：仅剩 ' + mlText(source.volumeMl) + ' ml，无法取用 ' + mlText(neatMl) + ' ml', 'validation');
    }
    const mix = fromNeat(neatMl, targetRatioN);
    addedThinnerMl = mix.thinnerMl;
    totalMl = mix.totalMl;
    takeMl = neatMl;
  }
  if (totalMl <= 0) return fail('产物体积必须大于 0', 'validation');

  const trackThinner = input.trackThinner ?? true;
  let thinnerStock: StockItem | undefined;
  if (trackThinner && addedThinnerMl > 0) {
    if (!input.thinnerStockItemId) return fail('请选择稀释剂条目', 'validation');
    thinnerStock = await s.stockItems.get(input.thinnerStockItemId);
    if (!thinnerStock) return fail('稀释剂条目不存在', 'conflict');
    if (thinnerStock.id === source.id) return fail('取用条目与稀释剂不能是同一条', 'validation');
    if (thinnerStock.volumeMl + 1e-6 < addedThinnerMl) {
      return fail('稀释剂不足：仅剩 ' + mlText(thinnerStock.volumeMl) + ' ml，本次需要 ' + mlText(addedThinnerMl) + ' ml', 'validation');
    }
  }

  const at = input.at ?? Date.now();
  const component: BottleComponent = {
    stockItemId: source.id,
    paintId: input.paint.id,
    neatMl,
    brandId: input.paint.brandId,
    name: input.paint.name,
    hex: input.paint.hex,
    paintClass: input.paint.paintClass,
  };
  if (input.paint.code) component.code = input.paint.code;
  const thinnerMl = r1(totalMl - neatMl);
  const bottle = batchBottle({
    name: batchName('稀释', batchLabel(input.paint), totalMl),
    totalMl,
    ratioN: targetRatioN,
    paintClass: input.paint.paintClass,
    hex: input.paint.hex,
    components: [component],
    mode: 'dilute',
    at,
  });
  const parsed = parseOrErrors(BottleSchema, bottle);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }

  const mixRecord: MixRecord = {
    id: newId('mix'),
    bottleId: bottle.id,
    neatMl,
    thinnerMl,
    ratioN: targetRatioN,
    totalMl,
    filledToMl: totalMl,
    at,
    mode: 'dilute',
    parts: [{ stockItemId: source.id, paintId: input.paint.id, ml: takeMl, ratioN: isThinned ? r1(input.currentRatioN ?? source.ratioN ?? 0) : 0 }],
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'mix',
    deltaMl: totalMl,
    refId: bottle.id,
    at,
    meta: { mode: 'dilute', neatMl, thinnerMl, ratioN: targetRatioN, sourceStockItemId: source.id },
  };

  const forward: Patch[] = [
    appendPatch('bottles', bottle),
    patch.replace('stockItems', source.id, 'volumeMl', r1(source.volumeMl - takeMl)),
    appendPatch('mixRecords', mixRecord),
    appendPatch('ledger', ledgerEntry),
  ];
  const inverse: Patch[] = [
    patch.remove('bottles', bottle.id),
    patch.replace('stockItems', source.id, 'volumeMl', source.volumeMl),
    patch.remove('mixRecords', mixRecord.id),
    patch.remove('ledger', ledgerEntry.id),
  ];
  if (thinnerStock) {
    forward.push(patch.replace('stockItems', thinnerStock.id, 'volumeMl', r1(thinnerStock.volumeMl - addedThinnerMl)));
    inverse.push(patch.replace('stockItems', thinnerStock.id, 'volumeMl', thinnerStock.volumeMl));
  }

  const command = createCommand(
    'mix',
    '稀释「' + (input.paint.code || input.paint.name) + '」' + mlText(totalMl) + ' ml（1:' + mlText(targetRatioN) + '）',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    bottle,
    mixRecord,
    message: '已稀释 ' + mlText(totalMl) + ' ml（1:' + mlText(targetRatioN) + '），已装入调漆台',
  });
}

/**
 * 调漆事务（调漆台 · 调漆模式）：
 * 多个组分（原浆 / 已稀释漆料）按 ml 或按目标总容量分摊后混合；
 * 每个组分按自己的稀释比例折算原浆量，等效比例 = Σ稀释剂 / Σ原浆。
 */
export async function blendIntoBatch(s: DepotStore, input: BlendBatchInput): Promise<Result<MixBatchPayload>> {
  const seen = new Set<string>();
  const parts = input.parts.filter((part) => {
    if (!part.stockItemId || seen.has(part.stockItemId)) return false;
    seen.add(part.stockItemId);
    return true;
  });
  if (parts.length === 0) return fail('请至少选择一个漆料组分', 'validation');

  const stocks = new Map<string, StockItem>();
  for (const part of parts) {
    const stock = await s.stockItems.get(part.stockItemId);
    if (!stock) return fail('组分条目不存在：' + part.stockItemId, 'conflict');
    stocks.set(part.stockItemId, stock);
  }

  const plan = planBlend(
    parts.map((part) => {
      const stock = stocks.get(part.stockItemId) as StockItem;
      return {
        id: part.stockItemId,
        weight: r1(part.ml),
        ratioN: stock.state === 'thinned' ? r1(stock.ratioN ?? 0) : 0,
        availableMl: stock.volumeMl,
      };
    }),
    input.targetMl ?? null,
  );

  if (plan.totalMl <= 0) return fail('产物体积必须大于 0', 'validation');
  if (plan.shortfalls.length > 0) {
    const first = plan.shortfalls[0];
    const paint = parts.find((part) => part.stockItemId === first.id)?.paint;
    const label = paint ? paint.code || paint.name : first.id;
    return fail(
      '库存不足：「' + label + '」仅剩 ' + mlText(first.availableMl) + ' ml，本次需要 ' + mlText(first.needMl) + ' ml',
      'validation',
    );
  }

  const at = input.at ?? Date.now();
  const components: BottleComponent[] = plan.parts.map((share) => {
    const part = parts.find((entry) => entry.stockItemId === share.id) as BlendBatchPartInput;
    const component: BottleComponent = {
      stockItemId: share.id,
      paintId: part.paint.id,
      neatMl: share.neatMl,
      brandId: part.paint.brandId,
      name: part.paint.name,
      hex: part.paint.hex,
      paintClass: part.paint.paintClass,
    };
    if (part.paint.code) component.code = part.paint.code;
    return component;
  });
  const hex = mixHex(components.map((component) => ({ hex: component.hex, ml: component.neatMl, paintClass: component.paintClass })));
  const paintClass = bottlePaintClass(components);
  const label = components.length === 1 ? batchLabel(components[0]) : components.length + ' 组分';
  const bottle = batchBottle({
    name: batchName('调漆', label, plan.totalMl),
    totalMl: plan.totalMl,
    ratioN: plan.ratioN,
    paintClass,
    hex,
    components,
    mode: 'blend',
    at,
  });
  const parsed = parseOrErrors(BottleSchema, bottle);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }

  const mixRecord: MixRecord = {
    id: newId('mix'),
    bottleId: bottle.id,
    neatMl: plan.neatMl,
    thinnerMl: plan.thinnerMl,
    ratioN: plan.ratioN,
    totalMl: plan.totalMl,
    filledToMl: plan.totalMl,
    at,
    mode: 'blend',
    parts: plan.parts.map((share) => ({
      stockItemId: share.id,
      paintId: (parts.find((part) => part.stockItemId === share.id) as BlendBatchPartInput).paint.id,
      ml: share.ml,
      ratioN: share.ratioN,
    })),
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'mix',
    deltaMl: plan.totalMl,
    refId: bottle.id,
    at,
    meta: { mode: 'blend', neatMl: plan.neatMl, thinnerMl: plan.thinnerMl, ratioN: plan.ratioN, parts: mixRecord.parts },
  };

  const forward: Patch[] = [appendPatch('bottles', bottle), appendPatch('mixRecords', mixRecord), appendPatch('ledger', ledgerEntry)];
  const inverse: Patch[] = [patch.remove('bottles', bottle.id), patch.remove('mixRecords', mixRecord.id), patch.remove('ledger', ledgerEntry.id)];
  for (const share of plan.parts) {
    const stock = stocks.get(share.id) as StockItem;
    forward.push(patch.replace('stockItems', stock.id, 'volumeMl', r1(stock.volumeMl - share.ml)));
    inverse.push(patch.replace('stockItems', stock.id, 'volumeMl', stock.volumeMl));
  }

  const command = createCommand(
    'mix',
    '调漆「' + label + '」' + mlText(plan.totalMl) + ' ml（1:' + mlText(plan.ratioN) + '）',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    bottle,
    mixRecord,
    message: '已调漆 ' + mlText(plan.totalMl) + ' ml（等效 1:' + mlText(plan.ratioN) + '），已装入调漆台',
  });
}

export interface BottleUseInput {
  bottleId: string;
  amountMl: number;
  at?: number;
}

/** 使用扣减（spec 3.4.5 使用事务） */
export async function useBottle(s: DepotStore, input: BottleUseInput): Promise<Result<{ command: Command; bottle: Bottle }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('批次不存在', 'conflict');
  const amount = r1(input.amountMl);
  const violation = checkUsageAmount(amount, bottle.remainingMl);
  if (violation) return fail(violation.message, 'invariant', { violationId: violation.id });
  const next = r1(bottle.remainingMl - amount);
  const at = input.at ?? Date.now();
  const usage: UsageRecord = {
    id: newId('usage'),
    targetType: 'bottle',
    targetId: bottle.id,
    amountMl: amount,
    reason: 'paint',
    at,
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'use',
    deltaMl: -amount,
    refId: bottle.id,
    at,
    meta: { targetType: 'bottle' },
  };
  const command = createCommand(
    'use',
    '使用「' + bottle.name + '」' + amount.toFixed(1) + ' ml',
    [
      patch.replace('bottles', bottle.id, 'remainingMl', next),
      patch.replace('bottles', bottle.id, 'updatedAt', at),
      appendPatch('usageRecords', usage),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      patch.replace('bottles', bottle.id, 'remainingMl', bottle.remainingMl),
      patch.replace('bottles', bottle.id, 'updatedAt', bottle.updatedAt),
      patch.remove('ledger', ledgerEntry.id),
      patch.remove('usageRecords', usage.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, bottle: { ...bottle, remainingMl: next, updatedAt: at } });
}

/** 清空瓶：余量归零、组分清空（可撤销） */
export async function clearBottle(s: DepotStore, input: { bottleId: string; at?: number }): Promise<Result<{ command: Command; bottle: Bottle }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('批次不存在', 'conflict');
  if (bottle.remainingMl <= 0) return fail('瓶内已空', 'conflict');
  const at = input.at ?? Date.now();
  const usage: UsageRecord = {
    id: newId('usage'),
    targetType: 'bottle',
    targetId: bottle.id,
    amountMl: bottle.remainingMl,
    reason: 'manual',
    at,
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'use',
    deltaMl: -bottle.remainingMl,
    refId: bottle.id,
    at,
    meta: { action: 'clear' },
  };
  const command = createCommand(
    'use',
    '清空「' + bottle.name + '」',
    [
      patch.replace('bottles', bottle.id, 'remainingMl', 0),
      patch.replace('bottles', bottle.id, 'baselineMl', 0),
      patch.replace('bottles', bottle.id, 'components', []),
      patch.replace('bottles', bottle.id, 'hex', BOTTLE_HEX_EMPTY),
      patch.replace('bottles', bottle.id, 'updatedAt', at),
      appendPatch('usageRecords', usage),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      patch.replace('bottles', bottle.id, 'remainingMl', bottle.remainingMl),
      patch.replace('bottles', bottle.id, 'baselineMl', bottle.baselineMl),
      patch.replace('bottles', bottle.id, 'components', bottle.components),
      patch.replace('bottles', bottle.id, 'hex', bottle.hex),
      patch.replace('bottles', bottle.id, 'updatedAt', bottle.updatedAt),
      patch.remove('ledger', ledgerEntry.id),
      patch.remove('usageRecords', usage.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, bottle: { ...bottle, remainingMl: 0, baselineMl: 0, components: [], hex: BOTTLE_HEX_EMPTY, updatedAt: at } });
}

export interface StockInBottleInput {
  bottleId: string;
  groupId?: string | null;
  at?: number;
}

/** 入库：批次内容变成一条 StockItem（origin='mixed'），可撤销 */
export async function stockInBottle(s: DepotStore, input: StockInBottleInput): Promise<Result<{ command: Command; item: StockItem }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('批次不存在', 'conflict');
  if (bottle.components.length === 0) return fail('空批次无法入库', 'conflict');
  if (bottle.remainingMl <= 0) return fail('批次已空，无法入库', 'conflict');
  const at = input.at ?? Date.now();
  const volumeMl = r1(bottle.remainingMl);
  const primary = bottle.components[0];
  const thinned = bottle.ratioN > 0 && bottle.mode !== 'blend';
  const item: StockItem = {
    id: newId('stock'),
    paintId: primary.paintId,
    volumeMl,
    initialMl: Math.max(volumeMl, 0.5),
    // 调漆产物即使含稀释剂也按「混合漆料」记账；纯原浆混合且比例为 0 时如实记作原浆
    state: bottle.ratioN > 0 || bottle.mode === 'blend' ? 'thinned' : 'neat',
    ...(bottle.ratioN > 0 || bottle.mode === 'blend' ? { ratioN: bottle.ratioN } : {}),
    groupId: input.groupId ?? null,
    origin: 'mixed',
    createdAt: at,
    note: (thinned ? '稀释产物入库「' : '调漆产物入库「') + bottle.name + '」',
    cachedHsl: hexToHsl(bottle.hex),
  };
  const workbenchItems = (await s.workbenchItems.toArray()).filter(
    (entry) => entry.refType === 'bottle' && entry.refId === bottle.id,
  );
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'archive',
    deltaMl: volumeMl,
    refId: item.id,
    at,
    meta: { bottleId: bottle.id },
  };
  const command = createCommand(
    'archive',
    '入库「' + bottle.name + '」' + volumeMl.toFixed(1) + ' ml',
    [
      appendPatch('stockItems', item),
      ...workbenchItems.map((entry) => patch.remove('workbenchItems', entry.id)),
      patch.remove('bottles', bottle.id),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      patch.add('bottles', record(bottle)),
      ...workbenchItems.map((entry) => patch.add('workbenchItems', record(entry))),
      patch.remove('ledger', ledgerEntry.id),
      patch.remove('stockItems', item.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, item });
}
