import type { Group, StockItem } from '../model/types';
import { MAX_GROUP_DEPTH } from './invariants';

/** 系统分组：未分组（不可删、不可改名、L1） */
export const UNGROUPED_ID = 'unassigned';

export interface GroupNode {
  group: Group;
  children: GroupNode[];
  count: number;
}

export interface GroupMoveCheck {
  ok: boolean;
  reason?: string;
}

/** 分组深度：顶层 = 1 */
export function depthOf(groups: Group[], parentId: string | null): number {
  let depth = 0;
  let cursor = parentId;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const parent = groups.find((g) => g.id === cursor);
    if (!parent) break;
    depth += 1;
    cursor = parent.parentId;
  }
  return depth + 1;
}

/** 能否在 parent 下新建子分组（3.3 / AC-07） */
export function canCreateChild(groups: Group[], parentId: string | null): GroupMoveCheck {
  const childDepth = depthOf(groups, parentId);
  if (childDepth > MAX_GROUP_DEPTH) {
    return { ok: false, reason: '分组最多 ' + MAX_GROUP_DEPTH + ' 层，无法在 L3 下继续创建' };
  }
  return { ok: true };
}

/** 移动子树是否会造成成环 */
export function wouldCycle(groups: Group[], nodeId: string, newParentId: string | null): boolean {
  let cursor = newParentId;
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (guard.has(cursor)) return false;
    guard.add(cursor);
    const parent = groups.find((g) => g.id === cursor);
    cursor = parent?.parentId ?? null;
  }
  return false;
}

/** 子树高度（含自身） */
export function subtreeHeight(groups: Group[], nodeId: string): number {
  const children = groups.filter((g) => g.parentId === nodeId);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((c) => subtreeHeight(groups, c.id)));
}

/** 移动分组前的完整校验：层级 + 成环 + 同名 */
export function canMoveGroup(
  groups: Group[],
  nodeId: string,
  newParentId: string | null,
): GroupMoveCheck {
  const node = groups.find((g) => g.id === nodeId);
  if (!node) return { ok: false, reason: '分组不存在' };
  if (node.system) return { ok: false, reason: '系统分组不可移动' };
  if (wouldCycle(groups, nodeId, newParentId)) return { ok: false, reason: '不能把分组移动到自己的子级' };
  const targetDepth = depthOf(groups, newParentId);
  const height = subtreeHeight(groups, nodeId);
  if (targetDepth + height - 1 > MAX_GROUP_DEPTH) {
    return { ok: false, reason: '分组最多 ' + MAX_GROUP_DEPTH + ' 层，无法在 L3 下继续创建' };
  }
  return { ok: true };
}

/** 同层重名校验（3.7.2） */
export function isDuplicateName(
  groups: Group[],
  name: string,
  parentId: string | null,
  exceptId?: string,
): boolean {
  return groups.some(
    (g) => g.parentId === parentId && g.id !== exceptId && g.name === name.trim(),
  );
}

/** 建树（含"未分组"系统节点计数） */
export function buildGroupTree(groups: Group[], items: Pick<StockItem, 'groupId'>[]): GroupNode[] {
  const byParent = new Map<string | null, Group[]>();
  for (const g of groups) {
    const list = byParent.get(g.parentId) ?? [];
    list.push(g);
    byParent.set(g.parentId, list);
  }
  const countOf = (id: string) => items.filter((i) => i.groupId === id).length;

  const makeNode = (group: Group): GroupNode => {
    const children = (byParent.get(group.id) ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map(makeNode);
    const own = countOf(group.id);
    return { group, children, count: own + children.reduce((a, c) => a + c.count, 0) };
  };

  return (byParent.get(null) ?? [])
    .slice()
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map(makeNode);
}

/** 删除分组后：子项回到"未分组"（3.3 操作） */
export function reparentOnDelete(
  groups: Group[],
  removedId: string,
): { groups: Group[]; orphanItems: string[] } {
  const descendants = collectDescendants(groups, removedId);
  const removed = new Set([removedId, ...descendants]);
  const remaining = groups
    .filter((g) => !removed.has(g.id))
    .map((g) => (g.parentId && removed.has(g.parentId) ? { ...g, parentId: null } : g));
  return { groups: remaining, orphanItems: [...removed] };
}

export function collectDescendants(groups: Group[], id: string): string[] {
  const out: string[] = [];
  const walk = (parentId: string) => {
    for (const g of groups) {
      if (g.parentId === parentId) {
        out.push(g.id);
        walk(g.id);
      }
    }
  };
  walk(id);
  return out;
}
