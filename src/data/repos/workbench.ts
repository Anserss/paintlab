import { createCommand, newId, patch } from '@/core/history/command';
import { r1 } from '@/core/math/quantity';
import { nameSchema, parseOrErrors, WorkbenchItemSchema, WorkbenchSchema } from '@/core/model/schemas';
import type {
  Bottle,
  Command,
  LedgerEntry,
  Patch,
  StockItem,
  UsageRecord,
  Workbench,
  WorkbenchItem,
} from '@/core/model/types';
import { checkUsageAmount, checkWorkbenchCount, MAX_WORKBENCHES } from '@/core/rules/invariants';
import type { DepotStore } from '../db';
import { recordCommand } from './history';
import { runPatches } from './patch';
import { fail, ok, toFailure } from './patch';
import type { Result } from './patch';

export { MAX_WORKBENCHES };

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;
const appendPatch = (collection: 'workbenches' | 'workbenchItems' | 'stockItems' | 'bottles' | 'usageRecords' | 'ledger', doc: object): Patch =>
  patch.append(collection, record(doc));
const addPatch = (collection: 'workbenches' | 'workbenchItems', doc: object): Patch => patch.add(collection, record(doc));

export const WORKBENCH_ACCENTS = ['#e2554b', '#3e7fc1', '#f0c24b', '#e8a33d', '#7a8a5a', '#8b6ea8'];
export const WORKBENCH_NAME_MAX = 16;
export const WORKBENCH_NOTE_MAX = 60;

export async function listWorkbenches(s: DepotStore): Promise<Workbench[]> {
  const rows = await s.workbenches.toArray();
  return rows.slice().sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt);
}

export async function listWorkbenchItems(s: DepotStore, workbenchId?: string): Promise<WorkbenchItem[]> {
  const rows = await s.workbenchItems.toArray();
  const filtered = workbenchId ? rows.filter((row) => row.workbenchId === workbenchId) : rows;
  return filtered.slice().sort((a, b) => a.addedAt - b.addedAt);
}

export interface WorkbenchStats {
  count: number;
  totalMl: number;
  kits: number;
}

/** 工作台统计：条目 n · 合计 x.x ml · 预计可涂 m 个套件（估算，spec 3.5） */
export function workbenchStats(
  items: WorkbenchItem[],
  stockItems: StockItem[],
  bottles: Bottle[],
  mlPerKit: number,
): WorkbenchStats {
  const stockMap = new Map(stockItems.map((item) => [item.id, item]));
  const bottleMap = new Map(bottles.map((item) => [item.id, item]));
  let totalMl = 0;
  for (const item of items) {
    if (item.refType === 'stock') totalMl += stockMap.get(item.refId)?.volumeMl ?? 0;
    else totalMl += bottleMap.get(item.refId)?.remainingMl ?? 0;
  }
  const total = r1(totalMl);
  const kit = mlPerKit > 0 ? mlPerKit : 2.5;
  return { count: items.length, totalMl: total, kits: Math.floor(total / kit) };
}

function nameFailure(raw: string): string | null {
  const parsed = parseOrErrors(nameSchema(WORKBENCH_NAME_MAX), raw);
  if (!parsed.ok) return parsed.errors[0]?.message ?? '工作台名称不合法';
  return null;
}

export interface CreateWorkbenchInput {
  name: string;
  note?: string;
  accent?: string;
  at?: number;
}

/** 新建工作台：上限 5（AC-08），不产生 Command */
export async function createWorkbench(
  s: DepotStore,
  input: CreateWorkbenchInput,
): Promise<Result<Workbench>> {
  const nameError = nameFailure(input.name);
  if (nameError) return fail(nameError, 'validation');
  const name = input.name.trim();
  const existing = await listWorkbenches(s);
  const countViolation = checkWorkbenchCount(existing.length + 1);
  if (countViolation) return fail(countViolation.message, 'validation', { violationId: countViolation.id });
  if (existing.some((workbench) => workbench.name === name)) return fail('工作台名称已存在「' + name + '」', 'validation');
  if (input.note && input.note.length > WORKBENCH_NOTE_MAX) return fail('备注最多 ' + WORKBENCH_NOTE_MAX + ' 字', 'validation');

  const at = input.at ?? Date.now();
  const workbench: Workbench = {
    id: newId('workbench'),
    name,
    accent: input.accent ?? WORKBENCH_ACCENTS[existing.length % WORKBENCH_ACCENTS.length],
    sort: existing.reduce((max, row) => Math.max(max, row.sort), 0) + 1,
    createdAt: at,
  };
  if (input.note) workbench.note = input.note;
  const parsed = parseOrErrors(WorkbenchSchema, workbench);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }
  await runPatches(s, [patch.add('workbenches', record(workbench))]);
  return ok(workbench);
}

export interface RenameWorkbenchInput {
  id: string;
  name?: string;
  note?: string;
  accent?: string;
}

export async function updateWorkbench(
  s: DepotStore,
  input: RenameWorkbenchInput,
): Promise<Result<Workbench>> {
  const workbench = await s.workbenches.get(input.id);
  if (!workbench) return fail('工作台不存在', 'conflict');
  const patches: Patch[] = [];
  const next: Workbench = { ...workbench };
  if (input.name !== undefined) {
    const nameError = nameFailure(input.name);
    if (nameError) return fail(nameError, 'validation');
    const name = input.name.trim();
    const existing = await listWorkbenches(s);
    if (existing.some((row) => row.id !== workbench.id && row.name === name)) {
      return fail('工作台名称已存在「' + name + '」', 'validation');
    }
    next.name = name;
    patches.push(patch.replace('workbenches', workbench.id, 'name', name));
  }
  if (input.note !== undefined) {
    if (input.note.length > WORKBENCH_NOTE_MAX) return fail('备注最多 ' + WORKBENCH_NOTE_MAX + ' 字', 'validation');
    next.note = input.note;
    patches.push(patch.replace('workbenches', workbench.id, 'note', input.note));
  }
  if (input.accent !== undefined) {
    next.accent = input.accent;
    patches.push(patch.replace('workbenches', workbench.id, 'accent', input.accent));
  }
  if (patches.length === 0) return ok(workbench);
  try {
    await runPatches(s, patches);
  } catch (error) {
    return toFailure(error);
  }
  return ok(next);
}

export interface DeleteWorkbenchInput {
  id: string;
  at?: number;
}

/** 删除工作台：条目不丢，直接回到仓库（二次确认 + 可撤销，spec 3.5） */
export async function deleteWorkbench(
  s: DepotStore,
  input: DeleteWorkbenchInput,
): Promise<Result<{ command: Command; removedItems: number }>> {
  const workbench = await s.workbenches.get(input.id);
  if (!workbench) return fail('工作台不存在', 'conflict');
  const items = await listWorkbenchItems(s, workbench.id);
  const at = input.at ?? Date.now();
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'workbench',
    refId: workbench.id,
    at,
    meta: { action: 'delete-workbench', itemIds: items.map((item) => item.id) },
  };
  const command = createCommand(
    'workbench',
    '删除工作台「' + workbench.name + '」×' + items.length,
    [
      ...items.map((item) => patch.remove('workbenchItems', item.id)),
      patch.remove('workbenches', workbench.id),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      addPatch('workbenches', workbench),
      ...items.map((item) => addPatch('workbenchItems', item)),
      patch.remove('ledger', ledgerEntry.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, removedItems: items.length });
}

export interface WorkbenchRef {
  refType: 'stock' | 'bottle';
  refId: string;
}

export interface OpenCoatInput {
  workbenchId: string;
  refs: WorkbenchRef[];
  plannedUseMl?: number;
  at?: number;
}

/** 开涂（可批量）：合并为 1 个 Command（spec 3.6 R5） */
export async function openCoat(
  s: DepotStore,
  input: OpenCoatInput,
): Promise<Result<{ command: Command; added: WorkbenchItem[] }>> {
  const workbench = await s.workbenches.get(input.workbenchId);
  if (!workbench) return fail('工作台不存在', 'conflict');
  const refs = input.refs.filter((ref) => ref.refId);
  if (refs.length === 0) return fail('没有选中条目', 'validation');
  const existing = await s.workbenchItems.toArray();
  const at = input.at ?? Date.now();
  const added: WorkbenchItem[] = [];
  for (const ref of refs) {
    const duplicate = existing.find(
      (item) => item.workbenchId === workbench.id && item.refType === ref.refType && item.refId === ref.refId,
    );
    if (duplicate) continue;
    const item: WorkbenchItem = {
      id: newId('sitem'),
      workbenchId: workbench.id,
      refType: ref.refType,
      refId: ref.refId,
      plannedUseMl: r1(input.plannedUseMl ?? 0),
      addedAt: at,
    };
    const parsed = parseOrErrors(WorkbenchItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
        { issues: parsed.errors },
      );
    }
    added.push(item);
  }
  if (added.length === 0) return fail('条目已在工作台内', 'conflict');

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'workbench',
    refId: workbench.id,
    at,
    meta: { action: 'add', itemIds: added.map((item) => item.id) },
  };
  const command = createCommand(
    'workbench',
    '开涂「' + workbench.name + '」×' + added.length,
    [...added.map((item) => addPatch('workbenchItems', item)), appendPatch('ledger', ledgerEntry)],
    [...added.map((item) => patch.remove('workbenchItems', item.id)), patch.remove('ledger', ledgerEntry.id)],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, added });
}

/** 设置计划用量（非撤销项，直接写补丁） */
export async function setPlannedUse(
  s: DepotStore,
  input: { itemId: string; plannedUseMl: number },
): Promise<Result<WorkbenchItem>> {
  const item = await s.workbenchItems.get(input.itemId);
  if (!item) return fail('工作台条目不存在', 'conflict');
  const next = r1(input.plannedUseMl);
  if (next < 0 || next > 2500) return fail('计划用量超出范围', 'validation');
  try {
    await runPatches(s, [patch.replace('workbenchItems', item.id, 'plannedUseMl', next)]);
  } catch (error) {
    return toFailure(error);
  }
  return ok({ ...item, plannedUseMl: next });
}

export interface ReturnEntry {
  itemId: string;
  usedMl: number;
}

export interface StockInInput {
  workbenchId: string;
  entries: ReturnEntry[];
  at?: number;
}

/** 记录用量并入库：复合 Command，一次撤销全恢复（spec 3.5 / AC-09） */
export async function recordUsageAndStockIn(
  s: DepotStore,
  input: StockInInput,
): Promise<Result<{ command: Command; count: number; usedMl: number }>> {
  const workbench = await s.workbenches.get(input.workbenchId);
  if (!workbench) return fail('工作台不存在', 'conflict');
  const entries = input.entries.filter((entry) => entry.itemId);
  if (entries.length === 0) return fail('没有选中条目', 'validation');
  const at = input.at ?? Date.now();

  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  const usageRecords: UsageRecord[] = [];
  let usedTotal = 0;

  for (const entry of entries) {
    const workbenchItem = await s.workbenchItems.get(entry.itemId);
    if (!workbenchItem) return fail('工作台条目不存在：' + entry.itemId, 'conflict');
    if (workbenchItem.workbenchId !== workbench.id) return fail('条目不属于该工作台', 'conflict');
    const used = r1(entry.usedMl);
    if (used < 0) return fail('用量不能为负', 'validation');

    if (workbenchItem.refType === 'stock') {
      const stock = await s.stockItems.get(workbenchItem.refId);
      if (!stock) continue;
      if (used > 0) {
        const violation = checkUsageAmount(used, stock.volumeMl);
        if (violation) return fail(violation.message, 'invariant', { violationId: violation.id });
      }
      forward.push(patch.replace('stockItems', stock.id, 'volumeMl', r1(stock.volumeMl - used)));
      inverse.push(patch.replace('stockItems', stock.id, 'volumeMl', stock.volumeMl));
    } else {
      const bottle = await s.bottles.get(workbenchItem.refId);
      if (!bottle) continue;
      if (used > 0) {
        const violation = checkUsageAmount(used, bottle.remainingMl);
        if (violation) return fail(violation.message, 'invariant', { violationId: violation.id });
      }
      forward.push(patch.replace('bottles', bottle.id, 'remainingMl', r1(bottle.remainingMl - used)));
      inverse.push(patch.replace('bottles', bottle.id, 'remainingMl', bottle.remainingMl));
    }

    if (used > 0) {
      const usage: UsageRecord = {
        id: newId('usage'),
        targetType: workbenchItem.refType === 'stock' ? 'stock' : 'bottle',
        targetId: workbenchItem.refId,
        amountMl: used,
        reason: 'return',
        at,
      };
      usageRecords.push(usage);
      forward.push(appendPatch('usageRecords', usage));
      inverse.push(patch.remove('usageRecords', usage.id));
      usedTotal = r1(usedTotal + used);
    }

    forward.push(patch.remove('workbenchItems', workbenchItem.id));
    inverse.push(addPatch('workbenchItems', workbenchItem));
  }

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'workbench',
    deltaMl: -usedTotal,
    refId: workbench.id,
    at,
    meta: { action: 'return', count: entries.length },
  };
  forward.push(appendPatch('ledger', ledgerEntry));
  inverse.push(patch.remove('ledger', ledgerEntry.id));

  const label = '入库「' + workbench.name + '」×' + entries.length;
  const command = createCommand('workbench', label, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: entries.length, usedMl: usedTotal });
}

/** 移到另一工作台（可批量） */
export async function moveWorkbenchItems(
  s: DepotStore,
  input: { itemIds: string[]; targetWorkbenchId: string; at?: number },
): Promise<Result<{ command: Command; count: number }>> {
  const target = await s.workbenches.get(input.targetWorkbenchId);
  if (!target) return fail('目标工作台不存在', 'conflict');
  const ids = Array.from(new Set(input.itemIds));
  if (ids.length === 0) return fail('没有选中条目', 'validation');
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  for (const id of ids) {
    const item = await s.workbenchItems.get(id);
    if (!item) return fail('工作台条目不存在：' + id, 'conflict');
    if (item.workbenchId === target.id) continue;
    forward.push(patch.replace('workbenchItems', id, 'workbenchId', target.id));
    inverse.push(patch.replace('workbenchItems', id, 'workbenchId', item.workbenchId));
  }
  if (forward.length === 0) return fail('条目已在该工作台', 'conflict');
  const at = input.at ?? Date.now();
  const command = createCommand('workbench', '移到工作台「' + target.name + '」×' + forward.length, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: forward.length });
}

/** 仅移出工作台（条目回到仓库，不扣减） */
export async function removeWorkbenchItems(
  s: DepotStore,
  input: { itemIds: string[]; at?: number },
): Promise<Result<{ command: Command; count: number }>> {
  const ids = Array.from(new Set(input.itemIds));
  if (ids.length === 0) return fail('没有选中条目', 'validation');
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  for (const id of ids) {
    const item = await s.workbenchItems.get(id);
    if (!item) return fail('工作台条目不存在：' + id, 'conflict');
    forward.push(patch.remove('workbenchItems', id));
    inverse.push(addPatch('workbenchItems', item));
  }
  const at = input.at ?? Date.now();
  const command = createCommand('workbench', '移出工作台 ×' + ids.length, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: ids.length });
}
