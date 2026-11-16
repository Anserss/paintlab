import type { CollectionName, Command, CommandType, Patch } from '../model/types';

let seq = 0;

export function newId(prefix = 'id'): string {
  seq += 1;
  return prefix + '-' + Date.now().toString(36) + '-' + seq.toString(36);
}

/** 构造一个可撤销命令（3.6）。forward / inverse 必须成对给出。 */
export function createCommand(
  type: CommandType,
  label: string,
  forward: Patch[],
  inverse: Patch[],
  at: number = Date.now(),
): Command {
  return { id: newId('cmd'), type, label, at, forward, inverse };
}

/** 批量操作合并为 1 个 Command（3.6 R5） */
export function mergeCommands(type: CommandType, label: string, commands: Command[]): Command {
  return createCommand(
    type,
    label,
    commands.flatMap((c) => c.forward),
    commands
      .slice()
      .reverse()
      .flatMap((c) => c.inverse),
  );
}

export const patch = {
  replace: (collection: CollectionName, id: string, path: string, value: unknown): Patch => ({
    op: 'replace',
    collection,
    id,
    path,
    value,
  }),
  add: (collection: CollectionName, doc: Record<string, unknown>): Patch => ({
    op: 'add',
    collection,
    doc,
  }),
  append: (collection: CollectionName, doc: Record<string, unknown>): Patch => ({
    op: 'append',
    collection,
    doc,
  }),
  remove: (collection: CollectionName, id: string): Patch => ({ op: 'remove', collection, id }),
};
