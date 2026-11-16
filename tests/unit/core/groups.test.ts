import { describe, expect, it } from 'vitest';
import type { Group } from '@/core/model/types';
import {
  UNGROUPED_ID,
  buildGroupTree,
  canCreateChild,
  canMoveGroup,
  collectDescendants,
  depthOf,
  isDuplicateName,
  reparentOnDelete,
  subtreeHeight,
  wouldCycle,
} from '@/core/rules/groups';

const mk = (
  id: string,
  name: string,
  parentId: string | null,
  depth: 1 | 2 | 3,
  sort = 0,
  system = false,
): Group => ({ id, name, parentId, depth, sort, system });

/** a(L1) > b(L2) > c(L3)，d(L2 under a)，e(L1) */
const groups: Group[] = [
  mk('a', '漆料', null, 1, 0),
  mk('b', '油性', 'a', 2, 0),
  mk('c', '郡士', 'b', 3, 0),
  mk('d', '田宫', 'a', 2, 1),
  mk('e', '辅料', null, 1, 1),
];

/** spec 3.3 (399-405) / AC-07 / 7.2 groups.test */
describe('groups · depthOf', () => {
  it('空表顶层深度为 1', () => {
    expect(depthOf([], null)).toBe(1);
  });

  it('沿父链累加', () => {
    expect(depthOf(groups, null)).toBe(1);
    expect(depthOf(groups, 'a')).toBe(2);
    expect(depthOf(groups, 'b')).toBe(3);
    expect(depthOf(groups, 'c')).toBe(4);
    expect(depthOf(groups, 'e')).toBe(2);
  });

  it('不存在的父级按顶层处理', () => {
    expect(depthOf(groups, 'ghost')).toBe(1);
  });
});

describe('groups · canCreateChild（AC-07：最多 3 层）', () => {
  it('L1 / L2 下可继续创建', () => {
    expect(canCreateChild(groups, null)).toEqual({ ok: true });
    expect(canCreateChild(groups, 'a')).toEqual({ ok: true });
    expect(canCreateChild(groups, 'b')).toEqual({ ok: true });
  });

  it('L3 下新建第 4 层被拒', () => {
    expect(canCreateChild(groups, 'c')).toEqual({
      ok: false,
      reason: '分组最多 3 层，无法在 L3 下继续创建',
    });
  });
});

describe('groups · wouldCycle 禁止成环', () => {
  it('移动到自己的祖先链上成环', () => {
    expect(wouldCycle(groups, 'a', 'c')).toBe(true);
    expect(wouldCycle(groups, 'a', 'b')).toBe(true);
  });

  it('移到自身成环', () => {
    expect(wouldCycle(groups, 'b', 'b')).toBe(true);
  });

  it('无关分支不成环', () => {
    expect(wouldCycle(groups, 'a', 'e')).toBe(false);
    expect(wouldCycle(groups, 'a', null)).toBe(false);
    expect(wouldCycle(groups, 'c', 'd')).toBe(false);
  });
});

describe('groups · subtreeHeight', () => {
  it('叶子为 1，链长为子树高度', () => {
    expect(subtreeHeight(groups, 'c')).toBe(1);
    expect(subtreeHeight(groups, 'b')).toBe(2);
    expect(subtreeHeight(groups, 'a')).toBe(3);
    expect(subtreeHeight(groups, 'e')).toBe(1);
  });
});

describe('groups · canMoveGroup（层级 + 成环 + 系统分组）', () => {
  it('合法移动', () => {
    expect(canMoveGroup(groups, 'e', 'a')).toEqual({ ok: true });
    expect(canMoveGroup(groups, 'c', null)).toEqual({ ok: true });
    expect(canMoveGroup(groups, 'b', 'e')).toEqual({ ok: true });
  });

  it('移到已有 L3 之下会超深，被拒', () => {
    expect(canMoveGroup(groups, 'd', 'c')).toEqual({
      ok: false,
      reason: '分组最多 3 层，无法在 L3 下继续创建',
    });
  });

  it('目标层级 + 子树高度 > 3 时被拒', () => {
    expect(canMoveGroup(groups, 'a', 'e')).toEqual({
      ok: false,
      reason: '分组最多 3 层，无法在 L3 下继续创建',
    });
  });

  it('成环被拒', () => {
    expect(canMoveGroup(groups, 'a', 'c')).toEqual({
      ok: false,
      reason: '不能把分组移动到自己的子级',
    });
  });

  it('系统分组不可移动', () => {
    const withSystem = [...groups, mk(UNGROUPED_ID, '未分组', null, 1, 9, true)];
    expect(canMoveGroup(withSystem, UNGROUPED_ID, 'a')).toEqual({
      ok: false,
      reason: '系统分组不可移动',
    });
  });

  it('不存在的分组被拒', () => {
    expect(canMoveGroup(groups, 'ghost', null)).toEqual({ ok: false, reason: '分组不存在' });
  });
});

describe('groups · isDuplicateName（3.7.2 同层重名）', () => {
  it('同层同名判重', () => {
    expect(isDuplicateName(groups, '田宫', 'a')).toBe(true);
    expect(isDuplicateName(groups, '田宫', null)).toBe(false);
  });

  it('改名时排除自身', () => {
    expect(isDuplicateName(groups, '田宫', 'a', 'd')).toBe(false);
    expect(isDuplicateName(groups, '田宫', 'a', 'b')).toBe(true);
  });

  it('比较前去除首尾空白', () => {
    expect(isDuplicateName(groups, '  田宫  ', 'a')).toBe(true);
  });
});

describe('groups · buildGroupTree 计数', () => {
  const items = [
    { groupId: 'a' },
    { groupId: 'a' },
    { groupId: 'a' },
    { groupId: 'c' },
    { groupId: 'c' },
    { groupId: 'd' },
    { groupId: null },
    { groupId: null },
  ];

  it('按 sort 排序根节点并递归计数', () => {
    const tree = buildGroupTree(groups, items);
    expect(tree.map((n) => n.group.id)).toEqual(['a', 'e']);
    expect(tree[0].count).toBe(6);
    expect(tree[1].count).toBe(0);
  });

  it('子节点计数含后代', () => {
    const tree = buildGroupTree(groups, items);
    const a = tree[0];
    expect(a.children.map((n) => n.group.id)).toEqual(['b', 'd']);
    expect(a.children[0].count).toBe(2);
    expect(a.children[0].children[0].count).toBe(2);
    expect(a.children[1].count).toBe(1);
  });

  it('同级按 sort 再按名称排序', () => {
    const sameSort = [mk('x', 'b组', null, 1, 0), mk('y', 'a组', null, 1, 0)];
    expect(buildGroupTree(sameSort, []).map((n) => n.group.id)).toEqual(['y', 'x']);
  });

  it('空输入返回空树', () => {
    expect(buildGroupTree([], [])).toEqual([]);
  });
});

describe('groups · 删除后子项回到未分组（3.3:404）', () => {
  it('collectDescendants 递归收集后代', () => {
    expect(collectDescendants(groups, 'a')).toEqual(['b', 'c', 'd']);
    expect(collectDescendants(groups, 'c')).toEqual([]);
    expect(collectDescendants(groups, 'b')).toEqual(['c']);
  });

  it('reparentOnDelete 删除整棵子树并交出待迁移分组 id', () => {
    const result = reparentOnDelete(groups, 'b');
    expect(result.groups.map((g) => g.id)).toEqual(['a', 'd', 'e']);
    expect([...result.orphanItems].sort()).toEqual(['b', 'c']);
  });

  it('删除 L1 连带全部后代', () => {
    const result = reparentOnDelete(groups, 'a');
    expect(result.groups.map((g) => g.id)).toEqual(['e']);
    expect([...result.orphanItems].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(result.groups[0].parentId).toBeNull();
  });

  it('未分组 id 常量固定', () => {
    expect(UNGROUPED_ID).toBe('unassigned');
  });
});
