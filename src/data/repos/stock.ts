import { createCommand, newId, patch } from '@/core/history/command';
import { hexToHsl } from '@/core/math/color';
import { r1 } from '@/core/math/quantity';
import { parseOrErrors, StockItemSchema } from '@/core/model/schemas';
import type { Command, CollectionName, LedgerEntry, Origin, Paint, Patch, PaintState, StockItem } from '@/core/model/types';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { checkStockVolume } from '@/core/rules/invariants';
import type { DepotStore } from '../db';
import { ensureSystemGroup } from './group';
import { recordCommand } from './history';
import { fail, ok, toFailure } from './patch';
import type { Result } from './patch';

export const ADJUST_REASONS = ['evaporate', 'spill', 'estimate', 'other'] as const;
export type AdjustReasonCode = (typeof ADJUST_REASONS)[number];

export const ADJUST_REASON_LABELS: Record<AdjustReasonCode, string> = {
  evaporate: '挥发',
  spill: '洒漏',
  estimate: '估读',
  other: '其他',
};

/** 生成 Command 补丁用的最小漆料引用 */
export interface StockPaintRef {
  id: string;
  code?: string;
  name: string;
  nameZh?: string;
  hex: string;
  brandName?: string;
  brandShortName?: string;
}

export type StockPaintSource = Pick<Paint, 'id'> & Partial<StockPaintRef>;

export function describeStockPaint(ref: Partial<StockPaintRef> & { id: string }): string {
  const parts: string[] = [];
  if (ref.brandShortName) parts.push(ref.brandShortName);
  else if (ref.brandName) parts.push(ref.brandName);
  if (ref.code) parts.push(ref.code);
  parts.push(ref.nameZh ?? ref.name ?? ref.id);
  return parts.join(' ');
}

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;

const appendPatch = (collection: CollectionName, doc: object): Patch => patch.append(collection, record(doc));
const addPatch = (collection: CollectionName, doc: object): Patch => patch.add(collection, record(doc));

export async function listStockItems(s: DepotStore): Promise<StockItem[]> {
  const items = await s.stockItems.toArray();
  return items.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export async function getStockItem(s: DepotStore, id: string): Promise<StockItem | undefined> {
  return s.stockItems.get(id);
}

export function stockTotalMl(items: StockItem[]): number {
  return r1(items.reduce((sum, item) => sum + item.volumeMl, 0));
}

export interface PaintStockAggregate {
  paintId: string;
  count: number;
  totalMl: number;
}

export function aggregateStockByPaint(items: StockItem[]): Record<string, PaintStockAggregate> {
  const result: Record<string, PaintStockAggregate> = {};
  for (const item of items) {
    const entry = result[item.paintId] ?? { paintId: item.paintId, count: 0, totalMl: 0 };
    entry.count += 1;
    entry.totalMl = r1(entry.totalMl + item.volumeMl);
    result[item.paintId] = entry;
  }
  return result;
}

export interface CreateStockInput {
  paint: StockPaintSource;
  initialMl: number;
  volumeMl?: number;
  state: PaintState;
  ratioN?: number;
  groupId?: string | null;
  note?: string;
  origin?: Origin;
  at?: number;
}

export interface StockWriteResult {
  command: Command;
  item: StockItem;
  message: string;
}

function zodIssues(failure: { errors: { path: string; message: string }[] }): string {
  return failure.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；');
}

/** 入库：stockItem + ledger + command 在同一事务（spec 3.2 / AC-01） */
export async function createStockItem(s: DepotStore, input: CreateStockInput): Promise<Result<StockWriteResult>> {
  await ensureSystemGroup(s);
  const at = input.at ?? Date.now();
  const initialMl = r1(input.initialMl);
  const volumeMl = r1(input.volumeMl ?? initialMl);
  const item: StockItem = {
    id: newId('stock'),
    paintId: input.paint.id,
    volumeMl,
    initialMl,
    state: input.state,
    groupId: input.groupId ?? UNGROUPED_ID,
    origin: input.origin ?? 'custom',
    createdAt: at,
    cachedHsl: hexToHsl(input.paint.hex ?? '#bfbfbf'),
  };
  if (input.ratioN !== undefined) item.ratioN = r1(input.ratioN);
  if (input.note) item.note = input.note;
  if (item.state === 'thinned') item.openedAt = at;

  const parsed = parseOrErrors(StockItemSchema, item);
  if (!parsed.ok) return fail(zodIssues(parsed), 'validation', { issues: parsed.errors });

  if (item.groupId) {
    const group = await s.groups.get(item.groupId);
    if (!group) return fail('分组不存在', 'validation');
  }

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'purchase',
    deltaMl: volumeMl,
    refId: item.id,
    at,
    meta: { paintId: item.paintId, initialMl, state: item.state },
  };
  const label = '入库 ' + describeStockPaint(input.paint) + ' ' + volumeMl.toFixed(1) + ' ml';
  const command = createCommand(
    'purchase',
    label,
    [appendPatch('stockItems', item), appendPatch('ledger', ledgerEntry)],
    [patch.remove('ledger', ledgerEntry.id), patch.remove('stockItems', item.id)],
    at,
  );

  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, item, message: '已入库 ' + describeStockPaint(input.paint) + ' ' + volumeMl.toFixed(1) + ' ml' });
}

export interface AdjustVolumeInput {
  itemId: string;
  volumeMl: number;
  reason: AdjustReasonCode;
  note?: string;
  at?: number;
}

/** 盘点调整余量：必须填原因，写 ledger，可撤销（spec 3.3） */
export async function adjustStockVolume(
  s: DepotStore,
  input: AdjustVolumeInput,
): Promise<Result<StockWriteResult>> {
  const item = await s.stockItems.get(input.itemId);
  if (!item) return fail('库存条目不存在', 'conflict');
  if (!ADJUST_REASONS.includes(input.reason)) return fail('必须选择调整原因', 'validation');
  const next = r1(input.volumeMl);
  const violation = checkStockVolume({ volumeMl: next, initialMl: item.initialMl });
  if (violation) return fail(violation.message.replace('无法撤销：', ''), 'invariant', { violationId: violation.id });

  const at = input.at ?? Date.now();
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'adjust',
    deltaMl: r1(next - item.volumeMl),
    refId: item.id,
    at,
    meta: { reason: input.reason, note: input.note ?? '', from: item.volumeMl, to: next },
  };
  const label = '调整余量 ' + describeStockPaint({ id: item.paintId }) + ' ' + next.toFixed(1) + ' ml';
  const command = createCommand(
    'adjust',
    label,
    [patch.replace('stockItems', item.id, 'volumeMl', next), appendPatch('ledger', ledgerEntry)],
    [
      patch.replace('stockItems', item.id, 'volumeMl', item.volumeMl),
      patch.remove('ledger', ledgerEntry.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({
    command,
    item: { ...item, volumeMl: next },
    message: '余量已调整：' + next.toFixed(1) + ' ml（' + ADJUST_REASON_LABELS[input.reason] + '）',
  });
}

export interface DeleteStockInput {
  itemId: string;
  at?: number;
}

/** 删除库存条目（连同其工作台引用），可撤销 */
export async function deleteStockItem(s: DepotStore, input: DeleteStockInput): Promise<Result<StockWriteResult>> {
  const item = await s.stockItems.get(input.itemId);
  if (!item) return fail('库存条目不存在', 'conflict');
  const at = input.at ?? Date.now();
  const workbenchItems = (await s.workbenchItems.toArray()).filter(
    (entry) => entry.refType === 'stock' && entry.refId === item.id,
  );
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'adjust',
    deltaMl: -item.volumeMl,
    refId: item.id,
    at,
    meta: { reason: 'delete' },
  };
  const label = '删除条目 ' + describeStockPaint({ id: item.paintId }) + ' ' + item.volumeMl.toFixed(1) + ' ml';
  const forward: Patch[] = [
    ...workbenchItems.map((entry) => patch.remove('workbenchItems', entry.id)),
    patch.remove('stockItems', item.id),
    appendPatch('ledger', ledgerEntry),
  ];
  const inverse: Patch[] = [
    addPatch('stockItems', item),
    ...workbenchItems.map((entry) => addPatch('workbenchItems', entry)),
    patch.remove('ledger', ledgerEntry.id),
  ];
  const command = createCommand('adjust', label, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, item, message: '已删除条目 ' + describeStockPaint({ id: item.paintId }) });
}

export interface MoveToGroupInput {
  itemIds: string[];
  groupId: string | null;
  at?: number;
}

/** 批量移动到分组：合并为 1 个 Command（spec 3.6 R5） */
export async function moveStockToGroup(
  s: DepotStore,
  input: MoveToGroupInput,
): Promise<Result<StockWriteResult | { command: Command; message: string }>> {
  const ids = Array.from(new Set(input.itemIds));
  if (ids.length === 0) return fail('没有选中条目', 'validation');
  await ensureSystemGroup(s);
  const targetGroupId = input.groupId ?? UNGROUPED_ID;
  const targetGroup = await s.groups.get(targetGroupId);
  if (!targetGroup) return fail('分组不存在', 'validation');
  const groupName = targetGroup.name;
  const items: StockItem[] = [];
  for (const id of ids) {
    const item = await s.stockItems.get(id);
    if (!item) return fail('库存条目不存在：' + id, 'conflict');
    items.push(item);
  }
  const at = input.at ?? Date.now();
  const moved = items.filter((item) => item.groupId !== targetGroupId);
  if (moved.length === 0) return fail('条目已在该分组', 'conflict');

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'group',
    refId: targetGroupId,
    at,
    meta: { itemIds: moved.map((item) => item.id) },
  };
  const label = '移动到「' + groupName + '」×' + moved.length;
  const command = createCommand(
    'group',
    label,
    [
      ...moved.map((item) => patch.replace('stockItems', item.id, 'groupId', targetGroupId)),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      ...moved.map((item) => patch.replace('stockItems', item.id, 'groupId', item.groupId)),
      patch.remove('ledger', ledgerEntry.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, item: moved[0], message: label });
}
