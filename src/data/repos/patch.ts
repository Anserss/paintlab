import type { CollectionName, Command, Patch } from '@/core/model/types';
import type { Violation } from '@/core/rules/invariants';
import type { DepotStore, TableLike, TableName } from '../db';

export type FailureCode = 'validation' | 'invariant' | 'conflict' | 'storage' | 'quota';

export interface FieldIssue {
  path: string;
  message: string;
}

export interface Failure {
  ok: false;
  error: string;
  code: FailureCode;
  /** 不变量编号，例如 I1 */
  violationId?: string;
  issues?: FieldIssue[];
}

export type Result<T> = { ok: true; data: T } | Failure;

export const ok = <T>(data: T): Result<T> => ({ ok: true as const, data });

export const fail = (
  error: string,
  code: FailureCode = 'validation',
  extra: { violationId?: string; issues?: FieldIssue[] } = {},
): Failure => ({ ok: false as const, error, code, ...extra });

export function toFailure(error: unknown, code: FailureCode = 'storage'): Failure {
  if (error instanceof PatchError) return fail(error.message, error.code);
  if (error instanceof InvariantError) return fail(error.violation.message, 'invariant', { violationId: error.violation.id });
  if (error instanceof Error) return fail(error.message, code);
  return fail('未知错误', code);
}

/** 补丁应用失败（整批事务回滚） */
export class PatchError extends Error {
  readonly code: FailureCode;

  constructor(message: string, code: FailureCode = 'conflict') {
    super(message);
    this.name = 'PatchError';
    this.code = code;
  }
}

export class InvariantError extends Error {
  readonly violation: Violation;

  constructor(violation: Violation) {
    super(violation.message);
    this.name = 'InvariantError';
    this.violation = violation;
  }
}

export const COLLECTION_TABLE: Record<CollectionName, TableName> = {
  brands: 'brands',
  paints: 'paints',
  stockItems: 'stockItems',
  groups: 'groups',
  bottles: 'bottles',
  workbenches: 'workbenches',
  workbenchItems: 'workbenchItems',
  mixRecords: 'mixRecords',
  usageRecords: 'usageRecords',
  ledger: 'ledger',
  settings: 'settings',
};

export function collectionTable(s: DepotStore, collection: CollectionName): TableLike<Record<string, unknown>> {
  const table = s[COLLECTION_TABLE[collection]] as unknown as TableLike<Record<string, unknown>>;
  return table;
}

export function tablesFor(patches: Patch[]): TableName[] {
  return Array.from(new Set(patches.map((p) => COLLECTION_TABLE[p.collection])));
}

export function setPath(doc: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.').filter((k) => k.length > 0);
  if (keys.length === 0) throw new PatchError('补丁路径为空');
  let cursor: Record<string, unknown> = doc;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const next = cursor[keys[i]];
    if (typeof next !== 'object' || next === null) {
      throw new PatchError('补丁路径不存在：' + path);
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
}

export async function applyPatch(s: DepotStore, p: Patch): Promise<void> {
  const table = collectionTable(s, p.collection);
  if (p.op === 'add' || p.op === 'append') {
    const doc = p.doc as Record<string, unknown>;
    if (typeof doc.id !== 'string' || doc.id.length === 0) {
      throw new PatchError('补丁 ' + p.op + ' 缺少 id（' + p.collection + '）');
    }
    await table.put(doc);
    return;
  }
  if (p.op === 'remove') {
    await table.delete(p.id);
    return;
  }
  const current = await table.get(p.id);
  if (!current) {
    // settings 是 key/value 行：没有对应行时按补丁创建（混合序号等新设置项可能从未写过）
    if (p.collection === 'settings') {
      const doc: Record<string, unknown> = { key: p.id };
      setPath(doc, p.path, p.value);
      await table.put(doc);
      return;
    }
    throw new PatchError('补丁目标不存在：' + p.collection + '/' + p.id);
  }
  setPath(current, p.path, p.value);
  await table.put(current);
}

export async function applyPatches(s: DepotStore, patches: Patch[]): Promise<void> {
  for (const p of patches) await applyPatch(s, p);
}

/** 整个补丁集在一个 rw 事务内执行，任一失败全部回滚（spec 5.3） */
export async function runPatches(s: DepotStore, patches: Patch[], extraTables: TableName[] = []): Promise<void> {
  if (patches.length === 0 && extraTables.length === 0) return;
  const tables = Array.from(new Set([...tablesFor(patches), ...extraTables]));
  await s.transaction('rw', tables, async () => {
    await applyPatches(s, patches);
  });
}

/** 正向补丁 + 命令落库，同一事务（spec 3.2 / 3.6 R6） */
export async function commitCommand(s: DepotStore, cmd: Command): Promise<void> {
  const tables = Array.from(new Set<TableName>([...tablesFor(cmd.forward), ...tablesFor(cmd.inverse), 'commands']));
  await s.transaction('rw', tables, async () => {
    await applyPatches(s, cmd.forward);
    await s.commands.put(cmd);
  });
}
