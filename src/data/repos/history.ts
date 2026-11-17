import { createCommand } from '@/core/history/command';
import { history } from '@/core/history/history';
import type { Command, CommandType } from '@/core/model/types';
import { checkUndoPreconditions } from '@/core/rules/invariants';
import type { DepotStore, TableName } from '../db';
import { applyPatch, commitCommand, InvariantError, tablesFor } from './patch';
import { fail, ok, toFailure } from './patch';
import type { Result } from './patch';

/**
 * 撤销 / 反撤销的持久化（spec 3.6 R6 / AC-14）。
 * - commands 表 = 撤销栈（撤销时该命令行一并删除，故"撤销后三者一并消失"）；
 * - settings['__history.redo'] = 反撤销栈（撤销/反撤销本身不产生新 Command，R7）。
 */

export const REDO_KEY = '__history.redo';
export const HISTORY_DEPTH_KEY = 'undoDepth';
export const DEFAULT_UNDO_DEPTH = 3;

export async function readUndoDepth(s: DepotStore): Promise<number> {
  const row = await s.settings.get(HISTORY_DEPTH_KEY);
  const value = row?.value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(20, Math.max(DEFAULT_UNDO_DEPTH, Math.round(value)));
  }
  return DEFAULT_UNDO_DEPTH;
}

async function readRedoStack(s: DepotStore): Promise<Command[]> {
  const row = await s.settings.get(REDO_KEY);
  const value = row?.value;
  return Array.isArray(value) ? (value as Command[]) : [];
}

async function writeRedoStack(s: DepotStore, stack: Command[]): Promise<void> {
  await s.settings.put({ key: REDO_KEY, value: stack });
}

const byTime = (a: Command, b: Command): number => a.at - b.at || a.id.localeCompare(b.id);

async function pruneCommands(s: DepotStore, depth: number): Promise<void> {
  const rows = (await s.commands.toArray()).sort(byTime);
  const extra = rows.slice(0, Math.max(0, rows.length - depth));
  for (const row of extra) await s.commands.delete(row.id);
}

async function assertInvariants(s: DepotStore): Promise<void> {
  const [stockItems, bottles, groups] = await Promise.all([
    s.stockItems.toArray(),
    s.bottles.toArray(),
    s.groups.toArray(),
  ]);
  const violation = checkUndoPreconditions({
    stockItems: stockItems.map((item) => ({ volumeMl: item.volumeMl, initialMl: item.initialMl })),
    bottles: bottles.map((bottle) => ({
      remainingMl: bottle.remainingMl,
      baselineMl: bottle.baselineMl,
      capacityMl: bottle.capacityMl,
    })),
    groups: groups.map((group) => ({ depth: group.depth, parentId: group.parentId })),
  });
  if (violation) throw new InvariantError(violation);
}

/** 执行一个可撤销动作：forward 补丁 + 命令落库（同事务），再入栈 */
export async function recordCommand(s: DepotStore, cmd: Command): Promise<Result<Command>> {
  const depth = await readUndoDepth(s);
  try {
    await commitCommand(s, cmd);
  } catch (error) {
    return toFailure(error);
  }
  history.setDepth(depth);
  history.record(cmd);
  await pruneCommands(s, depth);
  await writeRedoStack(s, []);
  return ok(cmd);
}

function txTables(inverse: Command): TableName[] {
  return Array.from(
    new Set<TableName>([...tablesFor(inverse.inverse), ...tablesFor(inverse.forward), 'commands', 'stockItems', 'bottles', 'groups', 'workbenchItems']),
  );
}

/** 撤销：应用 inverse，校验不变量，失败回滚数据与指针（AC-11） */
export async function undo(s: DepotStore): Promise<Result<Command>> {
  const cmd = history.undo();
  if (!cmd) return fail('没有可撤销的操作', 'conflict');
  try {
    await s.transaction('rw', txTables(cmd), async () => {
      for (const p of cmd.inverse) await applyPatch(s, p);
      await assertInvariants(s);
      await s.commands.delete(cmd.id);
    });
  } catch (error) {
    history.cancelUndo();
    return toFailure(error);
  }
  const redo = await readRedoStack(s);
  await writeRedoStack(s, [...redo, cmd].slice(-history.undoDepth));
  return ok(cmd);
}

/** 反撤销：应用 forward，重新入 commands 表 */
export async function redo(s: DepotStore): Promise<Result<Command>> {
  const cmd = history.redo();
  if (!cmd) return fail('没有可反撤销的操作', 'conflict');
  try {
    await s.transaction('rw', txTables(cmd), async () => {
      for (const p of cmd.forward) await applyPatch(s, p);
      await assertInvariants(s);
      await s.commands.put(cmd);
    });
  } catch (error) {
    history.cancelRedo();
    return toFailure(error);
  }
  const redoStack = await readRedoStack(s);
  await writeRedoStack(
    s,
    redoStack.filter((entry) => entry.id !== cmd.id),
  );
  return ok(cmd);
}

export interface HistorySnapshot {
  undoCount: number;
  redoCount: number;
  undoLabel: string | null;
  redoLabel: string | null;
  depth: number;
}

export function snapshotHistory(): HistorySnapshot {
  return {
    undoCount: history.undoCount,
    redoCount: history.redoCount,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    depth: history.undoDepth,
  };
}

/** 启动时从 commands 表恢复最近 depth 步（AC-14） */
export async function hydrateHistory(s: DepotStore): Promise<Result<HistorySnapshot>> {
  try {
    const depth = await readUndoDepth(s);
    const rows = (await s.commands.toArray()).sort(byTime);
    const undoStack = rows.slice(-depth);
    const redoStack = (await readRedoStack(s)).slice(-depth);
    history.setDepth(depth);
    history.clear();
    history.restore(undoStack, redoStack);
    return ok(snapshotHistory());
  } catch (error) {
    return toFailure(error);
  }
}

export async function clearHistory(s: DepotStore): Promise<Result<HistorySnapshot>> {
  try {
    await s.transaction('rw', ['commands', 'settings'], async () => {
      const rows = await s.commands.toArray();
      for (const row of rows) await s.commands.delete(row.id);
      await s.settings.put({ key: REDO_KEY, value: [] });
    });
    history.clear();
    return ok(snapshotHistory());
  } catch (error) {
    return toFailure(error);
  }
}

/** 测试 / 高级用法：手搓一个命令（供撤销越界保护等场景） */
export function makeCommand(type: CommandType, label: string, forward: Command['forward'], inverse: Command['inverse'], at?: number): Command {
  return createCommand(type, label, forward, inverse, at ?? Date.now());
}
