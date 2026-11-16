import { createCommand, newId, patch } from '@/core/history/command';
import { nameSchema, parseOrErrors, GroupSchema } from '@/core/model/schemas';
import type { Command, Group, StockItem } from '@/core/model/types';
import { buildGroupTree, canCreateChild, canMoveGroup, collectDescendants, depthOf, isDuplicateName, UNGROUPED_ID } from '@/core/rules/groups';
import type { GroupNode } from '@/core/rules/groups';
import { MAX_GROUP_DEPTH } from '@/core/rules/invariants';
import type { DepotStore } from '../db';
import { recordCommand } from './history';
import { fail, ok, toFailure } from './patch';
import type { Result } from './patch';

const record = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;

export const GROUP_NAME_MAX = 16;

export async function listGroups(s: DepotStore): Promise<Group[]> {
  const groups = await s.groups.toArray();
  return groups.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export async function getGroup(s: DepotStore, id: string): Promise<Group | undefined> {
  return s.groups.get(id);
}

/** 系统分组：未分组（规格 3.3:405，不可删 / 不可改名 / 不可移动，固定 L1） */
export const SYSTEM_GROUP: Group = {
  id: UNGROUPED_ID,
  name: '未分组',
  parentId: null,
  depth: 1,
  sort: 0,
  system: true,
};

/** 幂等播种系统分组：读模型里 groupId 永不为 null */
export async function ensureSystemGroup(s: DepotStore): Promise<Group> {
  try {
    const existing = await s.groups.get(UNGROUPED_ID);
    if (existing) return existing;
    await s.groups.put(SYSTEM_GROUP);
  } catch {
    /* 无持久化环境：播种失败不阻塞读模型 */
  }
  return SYSTEM_GROUP;
}

/** 分组树：直接用 core 的 buildGroupTree（根节点含"未分组"并正确计数） */
export function groupTree(groups: Group[], items: Pick<StockItem, 'groupId'>[]): GroupNode[] {
  const normalized = items.map((item) => ({ groupId: item.groupId ?? UNGROUPED_ID }));
  return buildGroupTree(groups, normalized);
}

function nameFailure(raw: string): string | null {
  const parsed = parseOrErrors(nameSchema(GROUP_NAME_MAX), raw);
  if (parsed.ok) return null;
  return parsed.errors[0]?.message ?? '分组名称不合法';
}

export interface CreateGroupInput {
  name: string;
  parentId?: string | null;
  at?: number;
}

export async function createGroup(s: DepotStore, input: CreateGroupInput): Promise<Result<{ command: Command; group: Group }>> {
  const nameError = nameFailure(input.name);
  if (nameError) return fail(nameError, 'validation');
  const name = input.name.trim();
  const groups = await listGroups(s);
  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = groups.find((group) => group.id === parentId);
    if (!parent) return fail('父分组不存在', 'validation');
    const childCheck = canCreateChild(groups, parentId);
    if (!childCheck.ok) return fail(childCheck.reason ?? '分组层级超限', 'validation');
  }
  if (isDuplicateName(groups, name, parentId)) return fail('同层已存在同名分组「' + name + '」', 'validation');
  const depth = depthOf(groups, parentId);
  if (depth > MAX_GROUP_DEPTH) return fail('分组最多 ' + MAX_GROUP_DEPTH + ' 层', 'validation');
  const siblings = groups.filter((group) => group.parentId === parentId);
  const sort = siblings.reduce((max, group) => Math.max(max, group.sort), 0) + 1;
  const group: Group = {
    id: newId('group'),
    name,
    parentId,
    depth: depth as 1 | 2 | 3,
    sort,
  };
  const parsed = parseOrErrors(GroupSchema, group);
  if (!parsed.ok) {
    return fail(parsed.errors.map((issue) => issue.path + '：' + issue.message).join('；'), 'validation', {
      issues: parsed.errors,
    });
  }
  const at = input.at ?? Date.now();
  const command = createCommand(
    'group',
    '新建分组「' + name + '」',
    [patch.add('groups', record(group))],
    [patch.remove('groups', group.id)],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, group });
}

export interface RenameGroupInput {
  id: string;
  name: string;
  at?: number;
}

export async function renameGroup(s: DepotStore, input: RenameGroupInput): Promise<Result<{ command: Command; group: Group }>> {
  const nameError = nameFailure(input.name);
  if (nameError) return fail(nameError, 'validation');
  const name = input.name.trim();
  const group = await s.groups.get(input.id);
  if (!group) return fail('分组不存在', 'conflict');
  if (group.system || group.id === UNGROUPED_ID) return fail('系统分组不可改名', 'conflict');
  const groups = await listGroups(s);
  if (isDuplicateName(groups, name, group.parentId, group.id)) {
    return fail('同层已存在同名分组「' + name + '」', 'validation');
  }
  const at = input.at ?? Date.now();
  const command = createCommand(
    'group',
    '重命名分组「' + group.name + '」→「' + name + '」',
    [patch.replace('groups', group.id, 'name', name)],
    [patch.replace('groups', group.id, 'name', group.name)],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, group: { ...group, name } });
}

export interface DeleteGroupInput {
  id: string;
  at?: number;
}

/** 删除分组：子分组一并删除，组内条目回到"未分组"（spec 3.3） */
export async function deleteGroup(s: DepotStore, input: DeleteGroupInput): Promise<Result<{ command: Command; removed: string[] }>> {
  const group = await s.groups.get(input.id);
  if (!group) return fail('分组不存在', 'conflict');
  if (group.system || group.id === UNGROUPED_ID) return fail('系统分组不可删除', 'conflict');
  const groups = await listGroups(s);
  const removedIds = [group.id, ...collectDescendants(groups, group.id)];
  const removedSet = new Set(removedIds);
  const removedGroups = groups.filter((entry) => removedSet.has(entry.id));
  const stockItems = await s.stockItems.toArray();
  const movedItems = stockItems.filter((item) => item.groupId !== null && removedSet.has(item.groupId));

  const at = input.at ?? Date.now();
  const command = createCommand(
    'group',
    '删除分组「' + group.name + '」×' + removedIds.length,
    [
      ...movedItems.map((item) => patch.replace('stockItems', item.id, 'groupId', UNGROUPED_ID)),
      ...removedIds.map((id) => patch.remove('groups', id)),
    ],
    [
      ...removedGroups.map((entry) => patch.add('groups', record(entry))),
      ...movedItems.map((item) => patch.replace('stockItems', item.id, 'groupId', item.groupId)),
    ],
    at,
  );
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command, removed: removedIds });
}

export interface MoveGroupInput {
  id: string;
  parentId: string | null;
  at?: number;
}

/** 移动分组：3 层校验 + 成环校验，子树层级同步平移 */
export async function moveGroup(s: DepotStore, input: MoveGroupInput): Promise<Result<{ command: Command }>> {
  const groups = await listGroups(s);
  const node = groups.find((group) => group.id === input.id);
  if (!node) return fail('分组不存在', 'conflict');
  const check = canMoveGroup(groups, input.id, input.parentId);
  if (!check.ok) return fail(check.reason ?? '无法移动该分组', 'validation');
  const newDepth = depthOf(groups, input.parentId);
  const delta = newDepth - node.depth;
  const subtree = [node.id, ...collectDescendants(groups, node.id)];
  const affected = groups.filter((group) => subtree.includes(group.id));

  const at = input.at ?? Date.now();
  const forward = affected.flatMap((group) => {
    const patches = [patch.replace('groups', group.id, 'depth', group.depth + delta)];
    if (group.id === node.id) patches.push(patch.replace('groups', group.id, 'parentId', input.parentId));
    return patches;
  });
  const inverse = affected.flatMap((group) => {
    const patches = [patch.replace('groups', group.id, 'depth', group.depth)];
    if (group.id === node.id) patches.push(patch.replace('groups', group.id, 'parentId', group.parentId));
    return patches;
  });
  const command = createCommand('group', '移动分组「' + node.name + '」', forward, inverse, at);
  const recorded = await recordCommand(s, command);
  if (!recorded.ok) return recorded;
  return ok({ command });
}
