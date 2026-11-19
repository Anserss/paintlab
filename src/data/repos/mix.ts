import { createCommand, newId, patch } from '@/core/history/command';
import { hexToHsl, mixHex } from '@/core/math/color';
import { diluteThinned, planBlend } from '@/core/math/blend';
import { fromNeat } from '@/core/math/dilution';
import { r1 } from '@/core/math/quantity';
import { parseOrErrors, StockItemSchema } from '@/core/model/schemas';
import type {
  BatchPart,
  BottleComponent,
  Command,
  LedgerEntry,
  MixRecord,
  Paint,
  PaintClass,
  Patch,
  StockItem,
  WorkbenchItem,
} from '@/core/model/types';
import { dilutionTagText, stockDilutionRatio } from '@/core/render/batch';
import { collectLowVolume, isLowVolume, lowVolumeNoticeOf } from '@/core/rules/low-volume';
import type { LowVolumeNotice } from '@/core/rules/low-volume';
import {
  formulaKeyOfParts,
  formulaLabel,
  mergeFormulaParts,
  stockFormulaKey,
} from '@/core/rules/formula';
import type { DepotStore } from '../db';
import { bottlePaintClass, diluteBatchName } from './bottle';
import { recordCommand } from './history';
import { fail, ok } from './patch';
import type { Result } from './patch';

/**
 * 2.2 调漆台（自动入库）：
 * - 稀释 / 调漆确认后不再产生「调漆台批次」，而是直接扣减组分库存并把产物写进仓库；
 * - 产物与库里同配方的条目自动合并容量（混色 / 稀释都算），仓库里始终只有一个瓶；
 * - 组分被用完（余量 0）时直接删除该条目；余量转为偏低时返回提示，由界面弹窗。
 *
 * 2.1 的 bottle 流程仍保留在 repos/bottle.ts，只用于旧数据迁移与历史测试。
 */

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;
const appendPatch = (collection: 'stockItems' | 'mixRecords' | 'ledger' | 'workbenchItems', doc: object): Patch =>
  patch.append(collection, record(doc));

export type MixPaintRef = Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'nameZh' | 'hex' | 'paintClass'>;

export interface DiluteStockInput {
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
  /** 来源的展示身份（调漆产物作为来源时由界面传入自定义名称 / 色值） */
  paint: MixPaintRef;
  /** 稀释剂的漆料引用（组分快照用） */
  thinnerPaint?: MixPaintRef;
  at?: number;
}

export interface BlendStockPartInput {
  stockItemId: string;
  paint: MixPaintRef;
  /** 份量：按 ml 直接取用，或作为分摊目标总容量的权重 */
  ml: number;
}

export interface BlendStockInput {
  parts: BlendStockPartInput[];
  /** 已知总容量：按各组分 ml 比例分摊（不传则按各组 ml 直接混合） */
  targetMl?: number | null;
  at?: number;
}

export interface MixStockPayload {
  command: Command;
  /** 入库后的库存条目（同配方合并时是原来那一瓶） */
  item: StockItem;
  /** 是否并入了库中已有的同配方条目 */
  merged: boolean;
  /** 本次新增的容量（不是合并后的总量） */
  addedMl: number;
  mixRecord: MixRecord;
  message: string;
  /** 本次操作后转为容量偏低的条目（弹窗用；不含本次新建的条目） */
  lowVolume: LowVolumeNotice[];
}

const mlText = (value: number): string => String(r1(value));

/** 调漆序号：只给新建的调漆产物发号；同配方合并 / 稀释产物不占号 */
async function readMixSeq(s: DepotStore): Promise<number> {
  const row = await s.settings.get('mixSeq');
  const value = row?.value;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

async function nextMixSeq(s: DepotStore): Promise<{ seq: number; forwardPatch: Patch }> {
  const seq = (await readMixSeq(s)) + 1;
  return { seq, forwardPatch: patch.replace('settings', 'mixSeq', 'value', seq) };
}

async function workbenchRefsOf(s: DepotStore, stockItemIds: ReadonlySet<string>) {
  const rows = await s.workbenchItems.toArray();
  return rows.filter((entry) => entry.refType === 'stock' && stockItemIds.has(entry.refId));
}

interface ConsumeResult {
  forward: Patch[];
  inverse: Patch[];
  /** 余量转为偏低（>0 且低于阈值）时的提示 */
  notice: LowVolumeNotice | null;
  /** 用完删除 */
  removed: boolean;
}

/**
 * 扣减一条库存：余量 > 0 → 改余量；余量归零 → 删除条目并清掉工作台引用。
 * 返回成对补丁，撤销可完整恢复。
 */
function consumeStock(item: StockItem, usedMl: number, workbenchRefs: { id: string }[]): ConsumeResult {
  const next = r1(item.volumeMl - usedMl);
  if (next <= 0) {
    return {
      forward: [
        ...workbenchRefs.map((entry) => patch.remove('workbenchItems', entry.id)),
        patch.remove('stockItems', item.id),
      ],
      inverse: [
        patch.add('stockItems', record(item)),
        ...workbenchRefs.map((entry) => patch.add('workbenchItems', record(entry))),
      ],
      notice: null,
      removed: true,
    };
  }
  return {
    forward: [patch.replace('stockItems', item.id, 'volumeMl', next)],
    inverse: [patch.replace('stockItems', item.id, 'volumeMl', item.volumeMl)],
    notice: lowVolumeNoticeOf({ id: item.id, volumeMl: next, initialMl: item.initialMl }),
    removed: false,
  };
}

/** 找库中同配方的条目（排除本次被取用的组分自己） */
async function findFormulaTarget(
  s: DepotStore,
  key: string,
  excludeIds: ReadonlySet<string>,
): Promise<StockItem | undefined> {
  const rows = await s.stockItems.toArray();
  return rows
    .filter((item) => !excludeIds.has(item.id) && stockFormulaKey(item) === key)
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

/** 产物的公共字段：名称 / 色值 / 比例 / 配方快照 */
interface StockedMix {
  paint: MixPaintRef;
  name: string;
  hex: string;
  totalMl: number;
  state: 'neat' | 'thinned';
  ratioN: number;
  dilutionRatioN?: number;
  paintClass: PaintClass;
  batchParts?: BatchPart[];
  mixKey: string | null;
  mixLabel: string | null;
  note: string;
}

function stockedItemOf(input: StockedMix & { at: number }): StockItem {
  const item: StockItem = {
    id: newId('stock'),
    paintId: input.paint.id,
    volumeMl: r1(input.totalMl),
    initialMl: Math.max(0.5, r1(input.totalMl)),
    state: input.state,
    ...(input.state === 'thinned' ? { ratioN: r1(input.ratioN) } : {}),
    groupId: null,
    origin: 'mixed',
    createdAt: input.at,
    cachedHsl: hexToHsl(input.hex),
    note: input.note,
    customName: input.name,
    customHex: input.hex,
  };
  if (input.state === 'thinned' && typeof input.dilutionRatioN === 'number') {
    item.dilutionRatioN = r1(input.dilutionRatioN);
  }
  if (input.batchParts && input.batchParts.length > 0) item.parts = input.batchParts;
  if (input.mixKey) item.mixKey = input.mixKey;
  if (input.mixLabel) item.mixLabel = input.mixLabel;
  return item;
}

/**
 * 稀释事务（调漆台 · 稀释模式）+ 自动入库：
 * - 原浆：A + 稀释剂 A×N → 产物 A(1+N)；
 * - 已稀释漆料：取 M ml（1:r0）→ 目标 1:rN，补加稀释剂 neat×(rN−r0)。
 * 来源 / 稀释剂同一个事务里扣减，产物直接进仓库；同配方自动合并。
 */
export async function diluteAndStockIn(
  s: DepotStore,
  input: DiluteStockInput,
): Promise<Result<MixStockPayload>> {
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
  const thinnerMl = r1(totalMl - neatMl);
  const sourceIsComposite = Boolean(
    source.state === 'thinned' ||
      source.dilutionRatioN !== undefined ||
      source.customName ||
      (source.parts && source.parts.length > 0),
  );

  /**
   * 2.1.1 组分快照：删除条目时可「分解为原浆和辅料」。
   * 2.2：来源本身是调漆产物 / 已稀释漆料时记 sourceKey，避免与同名原浆的产物误合并。
   */
  const thinnerPaint =
    input.thinnerPaint ?? (thinnerStock ? await s.paints.get(thinnerStock.paintId) : undefined);
  const sourceAuxPart = (source.parts ?? []).find((part) => part.aux);
  const neatPart: BatchPart = {
    paintId: input.paint.id,
    brandId: input.paint.brandId,
    name: input.paint.name,
    hex: input.paint.hex,
    paintClass: input.paint.paintClass,
    ml: r1(neatMl),
    state: 'neat',
  };
  if (input.paint.code) neatPart.code = input.paint.code;
  if (input.paint.nameZh) neatPart.nameZh = input.paint.nameZh;
  if (sourceIsComposite) {
    const sourceKey = stockFormulaKey(source);
    if (sourceKey) neatPart.sourceKey = sourceKey;
    neatPart.sourceLabel = input.paint.nameZh || input.paint.name;
  }

  let batchParts: BatchPart[] | undefined = [neatPart];
  if (thinnerMl > 0) {
    const auxPaintId = thinnerPaint?.id ?? sourceAuxPart?.paintId ?? '';
    if (!auxPaintId) {
      // 稀释剂身份不明：不留快照，删除时只能直接删（不编造组分）
      batchParts = undefined;
    } else {
      const auxPart: BatchPart = {
        paintId: auxPaintId,
        brandId: thinnerPaint?.brandId ?? sourceAuxPart?.brandId ?? '',
        name: thinnerPaint?.name ?? sourceAuxPart?.name ?? '稀释剂',
        hex: thinnerPaint?.hex ?? sourceAuxPart?.hex ?? '#ffffff',
        paintClass: 'aux',
        ml: thinnerMl,
        state: 'neat',
        aux: true,
      };
      const auxCode = thinnerPaint?.code ?? sourceAuxPart?.code;
      if (auxCode) auxPart.code = auxCode;
      const auxNameZh = thinnerPaint?.nameZh ?? sourceAuxPart?.nameZh;
      if (auxNameZh) auxPart.nameZh = auxNameZh;
      batchParts = [neatPart, auxPart];
    }
  }

  const mixKey = formulaKeyOfParts(batchParts);
  const name = diluteBatchName(input.paint);
  const state: 'neat' | 'thinned' = targetRatioN > 0 ? 'thinned' : 'neat';
  const mixLabel = (targetRatioN > 0 ? dilutionTagText(targetRatioN) + ' ' : '') + name;
  const note = '稀释产物自动入库「' + labelOfDilute(targetRatioN, name) + '」';

  const sources = [{ item: source, used: takeMl }];
  if (thinnerStock && addedThinnerMl > 0) sources.push({ item: thinnerStock, used: addedThinnerMl });
  const exclude = new Set(sources.map((entry) => entry.item.id));
  const target = mixKey ? await findFormulaTarget(s, mixKey, exclude) : undefined;
  const refs = await workbenchRefsOf(s, exclude);

  let item: StockItem;
  let merged = false;
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  const notices: (LowVolumeNotice | null)[] = [];

  if (target) {
    merged = true;
    const nextVolume = r1(target.volumeMl + totalMl);
    const nextInitial = r1(target.initialMl + totalMl);
    const nextParts = mergeFormulaParts(target.parts, batchParts) ?? target.parts;
    item = {
      ...target,
      volumeMl: nextVolume,
      initialMl: nextInitial,
      ...(nextParts ? { parts: nextParts } : {}),
    };
    if (mixKey) item.mixKey = mixKey;
    if (!item.mixLabel && mixLabel) item.mixLabel = mixLabel;
    const parsed = parseOrErrors(StockItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
      );
    }
    forward.push(
      patch.replace('stockItems', target.id, 'volumeMl', nextVolume),
      patch.replace('stockItems', target.id, 'initialMl', nextInitial),
    );
    inverse.push(
      patch.replace('stockItems', target.id, 'volumeMl', target.volumeMl),
      patch.replace('stockItems', target.id, 'initialMl', target.initialMl),
    );
    if (nextParts) {
      forward.push(patch.replace('stockItems', target.id, 'parts', nextParts));
      inverse.push(patch.replace('stockItems', target.id, 'parts', target.parts ?? []));
    }
    if (mixKey && target.mixKey !== mixKey) {
      forward.push(patch.replace('stockItems', target.id, 'mixKey', mixKey));
      if (target.mixKey !== undefined) inverse.push(patch.replace('stockItems', target.id, 'mixKey', target.mixKey));
    }
    notices.push(
      isLowVolume(nextVolume, nextInitial)
        ? { itemId: target.id, volumeMl: nextVolume, initialMl: nextInitial }
        : null,
    );
  } else {
    item = stockedItemOf({
      paint: input.paint,
      name,
      hex: input.paint.hex,
      totalMl,
      state,
      ratioN: targetRatioN,
      ...(state === 'thinned' && targetRatioN > 0 ? { dilutionRatioN: targetRatioN } : {}),
      paintClass: input.paint.paintClass,
      ...(batchParts ? { batchParts } : {}),
      mixKey,
      mixLabel,
      note,
      at,
    });
    const parsed = parseOrErrors(StockItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
      );
    }
    forward.push(appendPatch('stockItems', item));
    inverse.push(patch.remove('stockItems', item.id));
  }

  for (const entry of sources) {
    const refsOfItem = refs.filter((row) => row.refId === entry.item.id);
    const consumed = consumeStock(entry.item, entry.used, refsOfItem);
    forward.push(...consumed.forward);
    inverse.push(...consumed.inverse);
    if (consumed.notice) notices.push(consumed.notice);
  }

  const mixRecord: MixRecord = {
    id: newId('mix'),
    stockItemId: item.id,
    neatMl,
    thinnerMl,
    ratioN: targetRatioN,
    totalMl,
    filledToMl: totalMl,
    at,
    mode: 'dilute',
    parts: [
      {
        stockItemId: source.id,
        paintId: input.paint.id,
        ml: takeMl,
        ratioN: isThinned ? r1(input.currentRatioN ?? source.ratioN ?? 0) : 0,
      },
    ],
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'mix',
    deltaMl: totalMl,
    refId: item.id,
    at,
    meta: {
      mode: 'dilute',
      merged,
      neatMl,
      thinnerMl,
      ratioN: targetRatioN,
      sourceStockItemId: source.id,
    },
  };
  forward.push(appendPatch('mixRecords', mixRecord), appendPatch('ledger', ledgerEntry));
  inverse.push(patch.remove('mixRecords', mixRecord.id), patch.remove('ledger', ledgerEntry.id));

  const command = createCommand(
    'mix',
    '稀释「' + (input.paint.code || input.paint.name) + '」' + mlText(totalMl) + ' ml（1:' + mlText(targetRatioN) + '）并入库',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    item,
    merged,
    addedMl: totalMl,
    mixRecord,
    message:
      '已稀释并入库 ' + mlText(totalMl) + ' ml（1:' + mlText(targetRatioN) + '）' + (merged ? '，已并入同配方瓶' : ''),
    lowVolume: collectLowVolume(notices),
  });
}

/**
 * 调漆事务（调漆台 · 调漆模式）+ 自动入库：
 * 多个组分（原浆 / 已稀释漆料 / 调漆产物）按 ml 或按目标总容量分摊后混合；
 * 每个组分按自己的稀释比例折算原浆量，等效比例 = Σ稀释剂 / Σ原浆。
 */
export async function blendAndStockIn(
  s: DepotStore,
  input: BlendStockInput,
): Promise<Result<MixStockPayload>> {
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
    const part = parts.find((entry) => entry.stockItemId === share.id) as BlendStockPartInput;
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
  const hex = mixHex(
    components.map((component) => ({ hex: component.hex, ml: component.neatMl, paintClass: component.paintClass })),
  );
  const paintClass = bottlePaintClass(components);

  /** 2.2：调漆产物作为其他调漆的组分时，把来源签名一并记进快照 */
  const batchParts: BatchPart[] = plan.parts.map((share) => {
    const part = parts.find((entry) => entry.stockItemId === share.id) as BlendStockPartInput;
    const stock = stocks.get(share.id) as StockItem;
    const thinned = share.ratioN > 0 || stock.state === 'thinned';
    const next: BatchPart = {
      paintId: part.paint.id,
      brandId: part.paint.brandId,
      name: part.paint.name,
      hex: part.paint.hex,
      paintClass: part.paint.paintClass,
      ml: r1(share.ml),
      state: thinned ? 'thinned' : 'neat',
    };
    if (part.paint.code) next.code = part.paint.code;
    if (part.paint.nameZh) next.nameZh = part.paint.nameZh;
    if (thinned) next.ratioN = r1(share.ratioN);
    if (stockDilutionRatio(stock) !== null) next.dilute = true;
    if (stock.state === 'thinned' || stock.customName || (stock.parts && stock.parts.length > 0)) {
      const sourceKey = stockFormulaKey(stock);
      if (sourceKey) next.sourceKey = sourceKey;
      next.sourceLabel = part.paint.nameZh || part.paint.name;
    }
    return next;
  });

  const mixKey = formulaKeyOfParts(batchParts);
  const exclude = new Set(parts.map((part) => part.stockItemId));
  const target = mixKey ? await findFormulaTarget(s, mixKey, exclude) : undefined;
  const mixLabel = formulaLabel(batchParts);

  let item: StockItem;
  let merged = false;
  let seqPatch: Patch | null = null;
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  const notices: (LowVolumeNotice | null)[] = [];

  if (target) {
    merged = true;
    const nextVolume = r1(target.volumeMl + plan.totalMl);
    const nextInitial = r1(target.initialMl + plan.totalMl);
    const nextParts = mergeFormulaParts(target.parts, batchParts) ?? target.parts;
    item = {
      ...target,
      volumeMl: nextVolume,
      initialMl: nextInitial,
      ...(nextParts ? { parts: nextParts } : {}),
    };
    if (mixKey) item.mixKey = mixKey;
    if (!item.mixLabel && mixLabel) item.mixLabel = mixLabel;
    const parsed = parseOrErrors(StockItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
      );
    }
    forward.push(
      patch.replace('stockItems', target.id, 'volumeMl', nextVolume),
      patch.replace('stockItems', target.id, 'initialMl', nextInitial),
    );
    inverse.push(
      patch.replace('stockItems', target.id, 'volumeMl', target.volumeMl),
      patch.replace('stockItems', target.id, 'initialMl', target.initialMl),
    );
    if (nextParts) {
      forward.push(patch.replace('stockItems', target.id, 'parts', nextParts));
      inverse.push(patch.replace('stockItems', target.id, 'parts', target.parts ?? []));
    }
    if (mixKey && target.mixKey !== mixKey) {
      forward.push(patch.replace('stockItems', target.id, 'mixKey', mixKey));
      if (target.mixKey !== undefined) inverse.push(patch.replace('stockItems', target.id, 'mixKey', target.mixKey));
    }
    if (mixLabel && target.mixLabel !== mixLabel) {
      forward.push(patch.replace('stockItems', target.id, 'mixLabel', mixLabel));
      if (target.mixLabel !== undefined) inverse.push(patch.replace('stockItems', target.id, 'mixLabel', target.mixLabel));
    }
    notices.push(
      isLowVolume(nextVolume, nextInitial)
        ? { itemId: target.id, volumeMl: nextVolume, initialMl: nextInitial }
        : null,
    );
  } else {
    const { seq, forwardPatch } = await nextMixSeq(s);
    seqPatch = forwardPatch;
    const name = '调漆' + seq;
    item = stockedItemOf({
      paint: parts[0].paint,
      name,
      hex,
      totalMl: plan.totalMl,
      state: 'thinned',
      ratioN: plan.ratioN,
      paintClass,
      batchParts,
      mixKey,
      mixLabel,
      note: '调漆产物自动入库「' + name + '」',
      at,
    });
    const parsed = parseOrErrors(StockItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
      );
    }
    forward.push(appendPatch('stockItems', item));
    inverse.push(patch.remove('stockItems', item.id));
  }

  const refs = await workbenchRefsOf(s, exclude);
  for (const share of plan.parts) {
    const stock = stocks.get(share.id) as StockItem;
    const consumed = consumeStock(
      stock,
      share.ml,
      refs.filter((row) => row.refId === stock.id),
    );
    forward.push(...consumed.forward);
    inverse.push(...consumed.inverse);
    if (consumed.notice) notices.push(consumed.notice);
  }

  const mixRecord: MixRecord = {
    id: newId('mix'),
    stockItemId: item.id,
    neatMl: plan.neatMl,
    thinnerMl: plan.thinnerMl,
    ratioN: plan.ratioN,
    totalMl: plan.totalMl,
    filledToMl: plan.totalMl,
    at,
    mode: 'blend',
    parts: plan.parts.map((share) => ({
      stockItemId: share.id,
      paintId: (parts.find((part) => part.stockItemId === share.id) as BlendStockPartInput).paint.id,
      ml: share.ml,
      ratioN: share.ratioN,
    })),
  };
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'mix',
    deltaMl: plan.totalMl,
    refId: item.id,
    at,
    meta: {
      mode: 'blend',
      merged,
      neatMl: plan.neatMl,
      thinnerMl: plan.thinnerMl,
      ratioN: plan.ratioN,
      parts: mixRecord.parts,
    },
  };
  forward.push(appendPatch('mixRecords', mixRecord), appendPatch('ledger', ledgerEntry));
  inverse.push(patch.remove('mixRecords', mixRecord.id), patch.remove('ledger', ledgerEntry.id));
  if (seqPatch) forward.push(seqPatch);

  const command = createCommand(
    'mix',
    '调漆「' +
      (components.length === 1 ? components[0].name : components.length + ' 组分') +
      '」' +
      mlText(plan.totalMl) +
      ' ml（等效 1:' +
      mlText(plan.ratioN) +
      '）并入库',
    forward,
    inverse,
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    item,
    merged,
    addedMl: plan.totalMl,
    mixRecord,
    message:
      '已调漆并入库 ' +
      mlText(plan.totalMl) +
      ' ml（等效 1:' +
      mlText(plan.ratioN) +
      '）' +
      (merged ? '，已并入同配方瓶' : ''),
    lowVolume: collectLowVolume(notices),
  });
}

/** 稀释产物说明文案：(1:2)稀释 钴蓝 / 钴蓝 */
function labelOfDilute(ratioN: number, name: string): string {
  return ratioN > 0 ? dilutionTagText(ratioN) + ' ' + name : name;
}

/* ------------------------------------------------------------------ */
/* 2.2 旧数据迁移：2.1.x 留在调漆台的批次 → 自动入库（无撤销命令）        */
/* ------------------------------------------------------------------ */

/**
 * 升级到 2.2 后，调漆台不再显示「当前批次」；
 * 旧版本遗留的 bottle（有余量）在启动时静默转成仓库条目，避免用户数据“消失”。
 * 迁移不写 Command（属于版本升级的数据搬家，不进撤销栈）。
 */
export async function migrateLegacyBottles(
  s: DepotStore,
): Promise<{ migrated: number; removed: number }> {
  const bottles = await s.bottles.toArray();
  if (bottles.length === 0) return { migrated: 0, removed: 0 };
  const at = Date.now();
  let migrated = 0;
  let removed = 0;
  await s.transaction('rw', ['bottles', 'stockItems', 'workbenchItems', 'ledger'], async () => {
    for (const bottle of bottles.sort((a, b) => a.updatedAt - b.updatedAt)) {
      let stockedId: string | null = null;
      if (bottle.remainingMl > 0 && bottle.components.length > 0) {
        const primary = bottle.components[0];
        const dilutionRatioN = bottle.mode === 'dilute' && bottle.ratioN > 0 ? bottle.ratioN : null;
        const displayHex = dilutionRatioN !== null ? bottle.hex : (bottle.colorHex ?? bottle.hex);
        const batchParts = bottle.parts?.map((part) => ({ ...part }));
        const item: StockItem = {
          id: newId('stock'),
          paintId: primary.paintId,
          volumeMl: r1(bottle.remainingMl),
          initialMl: Math.max(0.5, r1(bottle.remainingMl)),
          state: bottle.ratioN > 0 || bottle.mode === 'blend' ? 'thinned' : 'neat',
          ...(bottle.ratioN > 0 || bottle.mode === 'blend' ? { ratioN: r1(bottle.ratioN) } : {}),
          groupId: null,
          origin: 'mixed',
          createdAt: at,
          cachedHsl: hexToHsl(displayHex),
          note: '2.2 升级迁移：旧调漆台批次「' + bottle.name + '」自动入库',
          customName: bottle.name,
          customHex: displayHex,
        };
        if (dilutionRatioN !== null) item.dilutionRatioN = r1(dilutionRatioN);
        else if (typeof bottle.colorAlpha === 'number') item.customAlpha = bottle.colorAlpha;
        if (batchParts && batchParts.length > 0) item.parts = batchParts;
        const mixKey = formulaKeyOfParts(batchParts);
        if (mixKey) item.mixKey = mixKey;
        const label = formulaLabel(batchParts);
        if (label) item.mixLabel = label;
        const parsed = parseOrErrors(StockItemSchema, item);
        if (parsed.ok) {
          const target = mixKey ? await findFormulaTarget(s, mixKey, new Set()) : undefined;
          if (target) {
            await s.stockItems.put({
              ...target,
              volumeMl: r1(target.volumeMl + item.volumeMl),
              initialMl: r1(target.initialMl + item.volumeMl),
              parts: mergeFormulaParts(target.parts, item.parts) ?? target.parts,
              ...(mixKey ? { mixKey } : {}),
            });
            stockedId = target.id;
          } else {
            await s.stockItems.put(item);
            stockedId = item.id;
          }
          const ledgerEntry: LedgerEntry = {
            id: newId('ledger'),
            type: 'archive',
            deltaMl: item.volumeMl,
            refId: stockedId ?? item.id,
            at,
            meta: { action: 'legacy-bottle-migration', bottleId: bottle.id },
          };
          await s.ledger.put(ledgerEntry);
          migrated += 1;
        }
      }

      // 旧批次挂在工作台上的引用：迁移成对应库存条目；没有产物则直接移除
      const refs = (await s.workbenchItems.toArray()).filter(
        (entry) => entry.refType === 'bottle' && entry.refId === bottle.id,
      );
      for (const ref of refs) {
        if (stockedId) {
          const already = (await s.workbenchItems.toArray()).some(
            (row) =>
              row.id !== ref.id &&
              row.workbenchId === ref.workbenchId &&
              row.refType === 'stock' &&
              row.refId === stockedId,
          );
          if (already) await s.workbenchItems.delete(ref.id);
          else await s.workbenchItems.put({ ...ref, refType: 'stock', refId: stockedId });
        } else {
          await s.workbenchItems.delete(ref.id);
        }
      }
      await s.bottles.delete(bottle.id);
      removed += 1;
    }
  });
  return { migrated, removed };
}
