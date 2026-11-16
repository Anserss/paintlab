import { createCommand, newId, patch } from '@/core/history/command';
import { r1 } from '@/core/math/quantity';
import { nameSchema, parseOrErrors, WorkstationItemSchema, WorkstationSchema } from '@/core/model/schemas';
import type {
  Bottle,
  Command,
  LedgerEntry,
  Patch,
  StockItem,
  UsageRecord,
  Workstation,
  WorkstationItem,
} from '@/core/model/types';
import { checkUsageAmount, checkWorkstationCount, MAX_WORKSTATIONS } from '@/core/rules/invariants';
import type { DepotStore } from '../db';
import { recordCommand } from './history';
import { runPatches } from './patch';
import { fail, ok, toFailure } from './patch';
import type { Result } from './patch';

export { MAX_WORKSTATIONS };

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;
const appendPatch = (collection: 'workstations' | 'stationItems' | 'stockItems' | 'bottles' | 'usageRecords' | 'ledger', doc: object): Patch =>
  patch.append(collection, record(doc));
const addPatch = (collection: 'workstations' | 'stationItems', doc: object): Patch => patch.add(collection, record(doc));

export const STATION_ACCENTS = ['#e2554b', '#3e7fc1', '#f0c24b', '#e8a33d', '#7a8a5a', '#8b6ea8'];
export const STATION_NAME_MAX = 16;
export const STATION_NOTE_MAX = 60;

export async function listWorkstations(s: DepotStore): Promise<Workstation[]> {
  const rows = await s.workstations.toArray();
  return rows.slice().sort((a, b) => a.sort - b.sort || a.createdAt - b.createdAt);
}

export async function listStationItems(s: DepotStore, workstationId?: string): Promise<WorkstationItem[]> {
  const rows = await s.stationItems.toArray();
  const filtered = workstationId ? rows.filter((row) => row.workstationId === workstationId) : rows;
  return filtered.slice().sort((a, b) => a.addedAt - b.addedAt);
}

export interface StationStats {
  count: number;
  totalMl: number;
  kits: number;
}

/** 工位统计：条目 n · 合计 x.x ml · 预计可涂 m 个套件（估算，spec 3.5） */
export function stationStats(
  items: WorkstationItem[],
  stockItems: StockItem[],
  bottles: Bottle[],
  mlPerKit: number,
): StationStats {
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
  const parsed = parseOrErrors(nameSchema(STATION_NAME_MAX), raw);
  if (!parsed.ok) return parsed.errors[0]?.message ?? '工位名称不合法';
  return null;
}

export interface CreateWorkstationInput {
  name: string;
  note?: string;
  accent?: string;
  at?: number;
}

/** 新建工位：上限 5（AC-08），不产生 Command */
export async function createWorkstation(
  s: DepotStore,
  input: CreateWorkstationInput,
): Promise<Result<Workstation>> {
  const nameError = nameFailure(input.name);
  if (nameError) return fail(nameError, 'validation');
  const name = input.name.trim();
  const existing = await listWorkstations(s);
  const countViolation = checkWorkstationCount(existing.length + 1);
  if (countViolation) return fail(countViolation.message, 'validation', { violationId: countViolation.id });
  if (existing.some((station) => station.name === name)) return fail('工位名称已存在「' + name + '」', 'validation');
  if (input.note && input.note.length > STATION_NOTE_MAX) return fail('备注最多 ' + STATION_NOTE_MAX + ' 字', 'validation');

  const at = input.at ?? Date.now();
  const station: Workstation = {
    id: newId('station'),
    name,
    accent: input.accent ?? STATION_ACCENTS[existing.length % STATION_ACCENTS.length],
    sort: existing.reduce((max, row) => Math.max(max, row.sort), 0) + 1,
    createdAt: at,
  };
  if (input.note) station.note = input.note;
  const parsed = parseOrErrors(WorkstationSchema, station);
  if (!parsed.ok) {
    return fail(
      parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
      'validation',
      { issues: parsed.errors },
    );
  }
  await runPatches(s, [patch.add('workstations', record(station))]);
  return ok(station);
}

export interface RenameWorkstationInput {
  id: string;
  name?: string;
  note?: string;
  accent?: string;
}

export async function updateWorkstation(
  s: DepotStore,
  input: RenameWorkstationInput,
): Promise<Result<Workstation>> {
  const station = await s.workstations.get(input.id);
  if (!station) return fail('工位不存在', 'conflict');
  const patches: Patch[] = [];
  const next: Workstation = { ...station };
  if (input.name !== undefined) {
    const nameError = nameFailure(input.name);
    if (nameError) return fail(nameError, 'validation');
    const name = input.name.trim();
    const existing = await listWorkstations(s);
    if (existing.some((row) => row.id !== station.id && row.name === name)) {
      return fail('工位名称已存在「' + name + '」', 'validation');
    }
    next.name = name;
    patches.push(patch.replace('workstations', station.id, 'name', name));
  }
  if (input.note !== undefined) {
    if (input.note.length > STATION_NOTE_MAX) return fail('备注最多 ' + STATION_NOTE_MAX + ' 字', 'validation');
    next.note = input.note;
    patches.push(patch.replace('workstations', station.id, 'note', input.note));
  }
  if (input.accent !== undefined) {
    next.accent = input.accent;
    patches.push(patch.replace('workstations', station.id, 'accent', input.accent));
  }
  if (patches.length === 0) return ok(station);
  try {
    await runPatches(s, patches);
  } catch (error) {
    return toFailure(error);
  }
  return ok(next);
}

export interface DeleteWorkstationInput {
  id: string;
  at?: number;
}

/** 删除工位：条目不丢，直接回到仓库（二次确认 + 可撤销，spec 3.5） */
export async function deleteWorkstation(
  s: DepotStore,
  input: DeleteWorkstationInput,
): Promise<Result<{ command: Command; removedItems: number }>> {
  const station = await s.workstations.get(input.id);
  if (!station) return fail('工位不存在', 'conflict');
  const items = await listStationItems(s, station.id);
  const at = input.at ?? Date.now();
  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'station',
    refId: station.id,
    at,
    meta: { action: 'delete-workstation', itemIds: items.map((item) => item.id) },
  };
  const command = createCommand(
    'station',
    '删除工位「' + station.name + '」×' + items.length,
    [
      ...items.map((item) => patch.remove('stationItems', item.id)),
      patch.remove('workstations', station.id),
      appendPatch('ledger', ledgerEntry),
    ],
    [
      addPatch('workstations', station),
      ...items.map((item) => addPatch('stationItems', item)),
      patch.remove('ledger', ledgerEntry.id),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, removedItems: items.length });
}

export interface StationRef {
  refType: 'stock' | 'bottle';
  refId: string;
}

export interface AddToStationInput {
  workstationId: string;
  refs: StationRef[];
  plannedUseMl?: number;
  at?: number;
}

/** 加入工位（可批量）：合并为 1 个 Command（spec 3.6 R5） */
export async function addToStation(
  s: DepotStore,
  input: AddToStationInput,
): Promise<Result<{ command: Command; added: WorkstationItem[] }>> {
  const station = await s.workstations.get(input.workstationId);
  if (!station) return fail('工位不存在', 'conflict');
  const refs = input.refs.filter((ref) => ref.refId);
  if (refs.length === 0) return fail('没有选中条目', 'validation');
  const existing = await s.stationItems.toArray();
  const at = input.at ?? Date.now();
  const added: WorkstationItem[] = [];
  for (const ref of refs) {
    const duplicate = existing.find(
      (item) => item.workstationId === station.id && item.refType === ref.refType && item.refId === ref.refId,
    );
    if (duplicate) continue;
    const item: WorkstationItem = {
      id: newId('sitem'),
      workstationId: station.id,
      refType: ref.refType,
      refId: ref.refId,
      plannedUseMl: r1(input.plannedUseMl ?? 0),
      addedAt: at,
    };
    const parsed = parseOrErrors(WorkstationItemSchema, item);
    if (!parsed.ok) {
      return fail(
        parsed.errors.map((issue) => (issue.path ? issue.path + '：' : '') + issue.message).join('；'),
        'validation',
        { issues: parsed.errors },
      );
    }
    added.push(item);
  }
  if (added.length === 0) return fail('条目已在工位内', 'conflict');

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'station',
    refId: station.id,
    at,
    meta: { action: 'add', itemIds: added.map((item) => item.id) },
  };
  const command = createCommand(
    'station',
    '加入工位「' + station.name + '」×' + added.length,
    [...added.map((item) => addPatch('stationItems', item)), appendPatch('ledger', ledgerEntry)],
    [...added.map((item) => patch.remove('stationItems', item.id)), patch.remove('ledger', ledgerEntry.id)],
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
): Promise<Result<WorkstationItem>> {
  const item = await s.stationItems.get(input.itemId);
  if (!item) return fail('工位条目不存在', 'conflict');
  const next = r1(input.plannedUseMl);
  if (next < 0 || next > 2500) return fail('计划用量超出范围', 'validation');
  try {
    await runPatches(s, [patch.replace('stationItems', item.id, 'plannedUseMl', next)]);
  } catch (error) {
    return toFailure(error);
  }
  return ok({ ...item, plannedUseMl: next });
}

export interface ReturnEntry {
  itemId: string;
  usedMl: number;
}

export interface ReturnToDepotInput {
  workstationId: string;
  entries: ReturnEntry[];
  at?: number;
}

/** 记录用量并放回仓库：复合 Command，一次撤销全恢复（spec 3.5 / AC-09） */
export async function recordUsageAndReturn(
  s: DepotStore,
  input: ReturnToDepotInput,
): Promise<Result<{ command: Command; count: number; usedMl: number }>> {
  const station = await s.workstations.get(input.workstationId);
  if (!station) return fail('工位不存在', 'conflict');
  const entries = input.entries.filter((entry) => entry.itemId);
  if (entries.length === 0) return fail('没有选中条目', 'validation');
  const at = input.at ?? Date.now();

  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  const usageRecords: UsageRecord[] = [];
  let usedTotal = 0;

  for (const entry of entries) {
    const stationItem = await s.stationItems.get(entry.itemId);
    if (!stationItem) return fail('工位条目不存在：' + entry.itemId, 'conflict');
    if (stationItem.workstationId !== station.id) return fail('条目不属于该工位', 'conflict');
    const used = r1(entry.usedMl);
    if (used < 0) return fail('用量不能为负', 'validation');

    if (stationItem.refType === 'stock') {
      const stock = await s.stockItems.get(stationItem.refId);
      if (!stock) continue;
      if (used > 0) {
        const violation = checkUsageAmount(used, stock.volumeMl);
        if (violation) return fail(violation.message, 'invariant', { violationId: violation.id });
      }
      forward.push(patch.replace('stockItems', stock.id, 'volumeMl', r1(stock.volumeMl - used)));
      inverse.push(patch.replace('stockItems', stock.id, 'volumeMl', stock.volumeMl));
    } else {
      const bottle = await s.bottles.get(stationItem.refId);
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
        targetType: stationItem.refType === 'stock' ? 'stock' : 'bottle',
        targetId: stationItem.refId,
        amountMl: used,
        reason: 'return',
        at,
      };
      usageRecords.push(usage);
      forward.push(appendPatch('usageRecords', usage));
      inverse.push(patch.remove('usageRecords', usage.id));
      usedTotal = r1(usedTotal + used);
    }

    forward.push(patch.remove('stationItems', stationItem.id));
    inverse.push(addPatch('stationItems', stationItem));
  }

  const ledgerEntry: LedgerEntry = {
    id: newId('ledger'),
    type: 'station',
    deltaMl: -usedTotal,
    refId: station.id,
    at,
    meta: { action: 'return', count: entries.length },
  };
  forward.push(appendPatch('ledger', ledgerEntry));
  inverse.push(patch.remove('ledger', ledgerEntry.id));

  const label = '放回仓库「' + station.name + '」×' + entries.length;
  const command = createCommand('station', label, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: entries.length, usedMl: usedTotal });
}

/** 移到另一工位（可批量） */
export async function moveStationItems(
  s: DepotStore,
  input: { itemIds: string[]; targetWorkstationId: string; at?: number },
): Promise<Result<{ command: Command; count: number }>> {
  const target = await s.workstations.get(input.targetWorkstationId);
  if (!target) return fail('目标工位不存在', 'conflict');
  const ids = Array.from(new Set(input.itemIds));
  if (ids.length === 0) return fail('没有选中条目', 'validation');
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  for (const id of ids) {
    const item = await s.stationItems.get(id);
    if (!item) return fail('工位条目不存在：' + id, 'conflict');
    if (item.workstationId === target.id) continue;
    forward.push(patch.replace('stationItems', id, 'workstationId', target.id));
    inverse.push(patch.replace('stationItems', id, 'workstationId', item.workstationId));
  }
  if (forward.length === 0) return fail('条目已在该工位', 'conflict');
  const at = input.at ?? Date.now();
  const command = createCommand('station', '移到工位「' + target.name + '」×' + forward.length, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: forward.length });
}

/** 仅移出工位（条目回到仓库，不扣减） */
export async function removeStationItems(
  s: DepotStore,
  input: { itemIds: string[]; at?: number },
): Promise<Result<{ command: Command; count: number }>> {
  const ids = Array.from(new Set(input.itemIds));
  if (ids.length === 0) return fail('没有选中条目', 'validation');
  const forward: Patch[] = [];
  const inverse: Patch[] = [];
  for (const id of ids) {
    const item = await s.stationItems.get(id);
    if (!item) return fail('工位条目不存在：' + id, 'conflict');
    forward.push(patch.remove('stationItems', id));
    inverse.push(addPatch('stationItems', item));
  }
  const at = input.at ?? Date.now();
  const command = createCommand('station', '移出工位 ×' + ids.length, forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, count: ids.length });
}
