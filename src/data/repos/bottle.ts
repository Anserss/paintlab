import { createCommand, newId, patch } from '@/core/history/command';
import { hexToHsl, mixHex } from '@/core/math/color';
import { checkOverflow, fromNeat, toFill } from '@/core/math/dilution';
import { r1 } from '@/core/math/quantity';
import { BottleSchema, parseOrErrors } from '@/core/model/schemas';
import type {
  Bottle,
  BottleComponent,
  Command,
  LedgerEntry,
  LevelMode,
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
const appendPatch = (collection: 'bottles' | 'stockItems' | 'mixRecords' | 'usageRecords' | 'ledger' | 'stationItems', doc: object): Patch =>
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
 * 改瓶容量（spec 3.4.3）：容量 5–250 整数；新容量 < 当前余量时必须拒绝并给出可行动文案。
 * 成功只改 capacityMl（baselineMl/remainingMl 不动，除非基准量超过新容量），写 ledger 并入撤销栈。
 */
export async function setBottleCapacity(
  s: DepotStore,
  input: BottleCapacityInput,
): Promise<Result<{ command: Command; bottle: Bottle }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('调漆瓶不存在', 'conflict');
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
    '瓶容量「' + bottle.name + '」' + mlText(bottle.capacityMl) + ' → ' + mlText(capacity) + ' ml',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, bottle: nextBottle });
}

export interface MixBottleInput {
  bottleId: string;
  mode: 'fill' | 'neat';
  neatMl?: number;
  ratioN?: number;
  sourceStockItemId: string;
  thinnerStockItemId?: string;
  trackThinner?: boolean;
  paint: Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'hex' | 'paintClass'>;
  at?: number;
}

export interface MixBottlePayload {
  command: Command;
  bottle: Bottle;
  mixRecord: MixRecord;
  message: string;
}

/** 调配事务：补满 / 指定原浆两种 mode，原子扣减原浆与稀释剂（spec 3.4.5） */
export async function mixBottle(s: DepotStore, input: MixBottleInput): Promise<Result<MixBottlePayload>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('调漆瓶不存在', 'conflict');
  const source = await s.stockItems.get(input.sourceStockItemId);
  if (!source) return fail('原浆条目不存在', 'conflict');
  const ratioN = r1(input.ratioN ?? bottle.ratioN);
  if (ratioN < 0 || ratioN > 10) return fail('比例超出范围 0–10', 'validation');

  let neatMl = 0;
  if (input.mode === 'fill') {
    const plan = toFill(bottle.capacityMl, bottle.remainingMl, ratioN);
    neatMl = plan.neatMl;
  } else {
    neatMl = r1(input.neatMl ?? 0);
    const overflow = checkOverflow(bottle.capacityMl, bottle.remainingMl, neatMl, ratioN);
    if (!overflow.ok) return fail(overflow.message ?? '超出瓶容量', 'validation');
  }
  if (neatMl <= 0) return fail('原浆量必须大于 0', 'validation');

  const mix = fromNeat(neatMl, ratioN);
  const nextRemaining = r1(bottle.remainingMl + mix.totalMl);
  if (nextRemaining > bottle.capacityMl + 1e-6) return fail('超出瓶容量', 'validation');
  if (source.volumeMl + 1e-6 < neatMl) return fail('原浆库存不足', 'validation');

  const trackThinner = input.trackThinner ?? true;
  let thinnerStock: StockItem | undefined;
  if (trackThinner && mix.thinnerMl > 0) {
    if (!input.thinnerStockItemId) return fail('请选择稀释剂条目', 'validation');
    thinnerStock = await s.stockItems.get(input.thinnerStockItemId);
    if (!thinnerStock) return fail('稀释剂条目不存在', 'conflict');
    if (thinnerStock.volumeMl + 1e-6 < mix.thinnerMl) return fail('稀释剂不足', 'validation');
    if (thinnerStock.id === source.id) return fail('原浆与稀释剂不能是同一条目', 'validation');
  }

  const components: BottleComponent[] = bottle.components.map((component) => ({ ...component }));
  const existing = components.find((component) => component.paintId === input.paint.id);
  if (existing) {
    existing.neatMl = r1(existing.neatMl + neatMl);
  } else {
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
    components.push(component);
  }
  const nextHex = mixHex(components.map((component) => ({ hex: component.hex, ml: component.neatMl, paintClass: component.paintClass })));
  const nextClass = bottlePaintClass(components);

  const at = input.at ?? Date.now();
  const nextBottle: Bottle = {
    ...bottle,
    remainingMl: nextRemaining,
    baselineMl: nextRemaining,
    ratioN,
    hex: nextHex,
    paintClass: nextClass,
    components,
    updatedAt: at,
  };
  const levelViolation = checkBottleLevel(nextBottle);
  if (levelViolation) return fail(levelViolation.message, 'invariant', { violationId: levelViolation.id });

  const mixRecord: MixRecord = {
    id: newId('mix'),
    bottleId: bottle.id,
    neatMl: mix.neatMl,
    thinnerMl: mix.thinnerMl,
    ratioN,
    totalMl: mix.totalMl,
    filledToMl: nextRemaining,
    at,
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'mix',
    deltaMl: mix.totalMl,
    refId: bottle.id,
    at,
    meta: { neatMl: mix.neatMl, thinnerMl: mix.thinnerMl, ratioN, sourceStockItemId: source.id },
  };

  const forward: Patch[] = [
    patch.replace('bottles', bottle.id, 'remainingMl', nextRemaining),
    patch.replace('bottles', bottle.id, 'baselineMl', nextRemaining),
    patch.replace('bottles', bottle.id, 'ratioN', ratioN),
    patch.replace('bottles', bottle.id, 'hex', nextHex),
    patch.replace('bottles', bottle.id, 'paintClass', nextClass),
    patch.replace('bottles', bottle.id, 'components', components),
    patch.replace('bottles', bottle.id, 'updatedAt', at),
    patch.replace('stockItems', source.id, 'volumeMl', r1(source.volumeMl - mix.neatMl)),
    appendPatch('mixRecords', mixRecord),
    appendPatch('ledger', ledgerEntry),
  ];
  const inverse: Patch[] = [
    patch.replace('bottles', bottle.id, 'remainingMl', bottle.remainingMl),
    patch.replace('bottles', bottle.id, 'baselineMl', bottle.baselineMl),
    patch.replace('bottles', bottle.id, 'ratioN', bottle.ratioN),
    patch.replace('bottles', bottle.id, 'hex', bottle.hex),
    patch.replace('bottles', bottle.id, 'paintClass', bottle.paintClass),
    patch.replace('bottles', bottle.id, 'components', bottle.components),
    patch.replace('bottles', bottle.id, 'updatedAt', bottle.updatedAt),
    patch.replace('stockItems', source.id, 'volumeMl', source.volumeMl),
    patch.remove('ledger', ledgerEntry.id),
    patch.remove('mixRecords', mixRecord.id),
  ];
  if (thinnerStock) {
    forward.push(patch.replace('stockItems', thinnerStock.id, 'volumeMl', r1(thinnerStock.volumeMl - mix.thinnerMl)));
    inverse.push(patch.replace('stockItems', thinnerStock.id, 'volumeMl', thinnerStock.volumeMl));
  }

  const command = createCommand('mix', '调配「' + bottle.name + '」+' + mix.totalMl.toFixed(1) + ' ml', forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    bottle: nextBottle,
    mixRecord,
    message: '已调配「' + bottle.name + '」+' + mix.totalMl.toFixed(1) + ' ml（1:' + String(ratioN) + '）',
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
  if (!bottle) return fail('调漆瓶不存在', 'conflict');
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
  if (!bottle) return fail('调漆瓶不存在', 'conflict');
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

export interface ArchiveBottleInput {
  bottleId: string;
  groupId?: string | null;
  at?: number;
}

/** 归档进仓库：瓶内内容变成一条 StockItem（origin='mixed'），可撤销 */
export async function archiveBottle(s: DepotStore, input: ArchiveBottleInput): Promise<Result<{ command: Command; item: StockItem }>> {
  const bottle = await s.bottles.get(input.bottleId);
  if (!bottle) return fail('调漆瓶不存在', 'conflict');
  if (bottle.components.length === 0) return fail('空瓶无法归档', 'conflict');
  if (bottle.remainingMl <= 0) return fail('瓶内已空，无法归档', 'conflict');
  const at = input.at ?? Date.now();
  const volumeMl = r1(bottle.remainingMl);
  const primary = bottle.components[0];
  const item: StockItem = {
    id: newId('stock'),
    paintId: primary.paintId,
    volumeMl,
    initialMl: Math.max(volumeMl, 0.5),
    state: 'thinned',
    ratioN: bottle.ratioN,
    groupId: input.groupId ?? null,
    origin: 'mixed',
    createdAt: at,
    note: '归档自调漆瓶「' + bottle.name + '」',
    cachedHsl: hexToHsl(bottle.hex),
  };
  const stationItems = (await s.stationItems.toArray()).filter(
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
    '归档「' + bottle.name + '」进仓库 ' + volumeMl.toFixed(1) + ' ml',
    [
      appendPatch('stockItems', item),
      ...stationItems.map((entry) => patch.remove('stationItems', entry.id)),
      patch.remove('bottles', bottle.id),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      patch.add('bottles', record(bottle)),
      ...stationItems.map((entry) => patch.add('stationItems', record(entry))),
      patch.remove('ledger', ledgerEntry.id),
      patch.remove('stockItems', item.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, item });
}
