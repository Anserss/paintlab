import { useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Group } from '@/core/model/types';
import { collectDescendants, UNGROUPED_ID } from '@/core/rules/groups';
import type { GroupNode } from '@/core/rules/groups';
import { useAppStore } from '@/store';
import { Badge, Button, Dialog, Empty, TreeRow } from '@/components/ui';
import { RowList } from './RowList';
import type { DepotRowActions } from './RowList';
import { GROUP_DEPTH_MESSAGE, planCreateChild, siblingOrder, stepOrder } from './model';
import type { DepotRow, DropPayload, DropTarget } from './model';

export interface GroupViewProps {
  rows: DepotRow[];
  groups: Group[];
  tree: GroupNode[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  onDropPayload: (payload: DropPayload, target: DropTarget) => void;
  /** 手动排序（上移 / 下移）：与拖拽排序共用 reorderGroups */
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
  actions: DepotRowActions;
  selectedIds: readonly string[];
  onSelectRow: (row: DepotRow) => void;
}

export const GROUP_NAME_MAX = 16;

interface NodeProps {
  node: GroupNode;
  depth: 1 | 2 | 3;
  groups: Group[];
  selectedGroupId: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onOpenMenu: (id: string | null) => void;
  menuId: string | null;
  onDropPayload: (payload: DropPayload, target: DropTarget) => void;
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
  onCreateChild: (parentId: string) => void;
  onRename: (group: Group) => void;
  onDelete: (group: Group) => void;
}

/** 单节点：可拖（移动子树）+ 可放（加入 / 移动），菜单提供键盘替代路径 */
function GroupTreeNode({
  node,
  depth,
  groups,
  selectedGroupId,
  collapsed,
  onToggle,
  onSelectGroup,
  onOpenMenu,
  menuId,
  onDropPayload,
  onReorder,
  onCreateChild,
  onRename,
  onDelete,
}: NodeProps) {
  const group = node.group;
  const system = Boolean(group.system) || group.id === UNGROUPED_ID;
  const hasChildren = node.children.length > 0;
  const expanded = !collapsed.has(group.id);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'group:' + group.id,
    data: { kind: 'group', groupId: group.id },
  });
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    attributes,
    listeners,
  } = useDraggable({
    id: 'gnode:' + group.id,
    data: { kind: 'group', groupId: group.id },
    disabled: system,
  });

  const siblings = siblingOrder(groups, group.parentId);
  const siblingIndex = siblings.indexOf(group.id);
  const moveTargets = groups.filter(
    (candidate) =>
      candidate.id !== group.id &&
      !collectDescendants(groups, group.id).includes(candidate.id),
  );
  const menuOpen = menuId === group.id;

  return (
    <div key={group.id} className="relative" data-group-node={group.id}>
      <div
        ref={(element) => {
          setDropRef(element);
          setDragRef(element);
        }}
      >
        <TreeRow
          depth={depth}
          label={group.name}
          count={node.count}
          selected={selectedGroupId === group.id}
          expanded={expanded}
          hasChildren={hasChildren}
          dropActive={isOver}
          onSelect={() => onSelectGroup(group.id)}
          onToggle={() => onToggle(group.id)}
          meta={
            <span className="ml-1 flex shrink-0 items-center gap-1">
              <Badge tone={system ? 'neutral' : 'accent'}>{'L' + group.depth}</Badge>
              <button
                ref={setActivatorNodeRef}
                type="button"
                aria-label={'拖拽 ' + group.name}
                title={system ? '系统分组不可移动' : '拖拽移动分组'}
                disabled={system}
                {...(system ? {} : attributes)}
                {...(system ? {} : listeners)}
                className="w-3 text-[10px] text-text-3 transition-colors duration-hover hover:text-text-1 disabled:opacity-30"
              >
                ⠿
              </button>
              <button
                type="button"
                data-group-menu-trigger={group.id}
                aria-label={'分组菜单 ' + group.name}
                aria-expanded={menuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(menuOpen ? null : group.id);
                }}
                className="w-3 text-[11px] text-text-3 transition-colors duration-hover hover:text-text-1"
              >
                ⋯
              </button>
            </span>
          }
        />
      </div>

      {menuOpen && (
        <div
          role="menu"
          data-group-menu={group.id}
          className="absolute right-2 top-7 z-[var(--z-toolbar)] w-44 border border-line-strong bg-surface p-1 text-xs"
        >
          {group.depth < 3 && !system && (
            <button
              type="button"
              role="menuitem"
              data-group-create-child=""
              onClick={() => {
                onOpenMenu(null);
                onCreateChild(group.id);
              }}
              className="block w-full px-2 py-1 text-left text-text-2 hover:bg-surface-2 hover:text-text-1"
            >
              新建子分组
            </button>
          )}
          {!system && siblingIndex > 0 && (
            <button
              type="button"
              role="menuitem"
              data-group-up=""
              onClick={() => {
                onOpenMenu(null);
                onReorder(group.parentId, stepOrder(siblings, group.id, -1));
              }}
              className="block w-full px-2 py-1 text-left text-text-2 hover:bg-surface-2 hover:text-text-1"
            >
              上移
            </button>
          )}
          {!system && siblingIndex >= 0 && siblingIndex < siblings.length - 1 && (
            <button
              type="button"
              role="menuitem"
              data-group-down=""
              onClick={() => {
                onOpenMenu(null);
                onReorder(group.parentId, stepOrder(siblings, group.id, 1));
              }}
              className="block w-full px-2 py-1 text-left text-text-2 hover:bg-surface-2 hover:text-text-1"
            >
              下移
            </button>
          )}
          {!system && (
            <button
              type="button"
              role="menuitem"
              data-group-rename=""
              onClick={() => {
                onOpenMenu(null);
                onRename(group);
              }}
              className="block w-full px-2 py-1 text-left text-text-2 hover:bg-surface-2 hover:text-text-1"
            >
              重命名
            </button>
          )}
          {!system && (
            <button
              type="button"
              role="menuitem"
              data-group-delete=""
              onClick={() => {
                onOpenMenu(null);
                onDelete(group);
              }}
              className="block w-full px-2 py-1 text-left text-danger hover:bg-surface-2"
            >
              删除
            </button>
          )}
          {!system && moveTargets.length > 0 && (
            <>
              <div className="t-label mt-1 border-t border-line px-2 pb-0.5 pt-1">移动到</div>
              {moveTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  data-group-move={target.id}
                  aria-label={'移动到 ' + target.name}
                  onClick={() => {
                    onOpenMenu(null);
                    onDropPayload({ kind: 'group', groupId: group.id }, { kind: 'group', groupId: target.id });
                  }}
                  className="block w-full px-2 py-1 text-left text-text-2 hover:bg-surface-2 hover:text-text-1"
                >
                  → {'L' + target.depth + ' ' + target.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <GroupTreeNode
              key={child.group.id}
              node={child}
              depth={Math.min(3, depth + 1) as 1 | 2 | 3}
              groups={groups}
              selectedGroupId={selectedGroupId}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelectGroup={onSelectGroup}
              onOpenMenu={onOpenMenu}
              menuId={menuId}
              onDropPayload={onDropPayload}
              onReorder={onReorder}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 分组视图：≤3 层自定义分组树 + 行式列表（spec 3.3:399-405） */
export function GroupView({
  rows,
  groups,
  tree,
  selectedGroupId,
  onSelectGroup,
  onDropPayload,
  onReorder,
  actions,
  selectedIds,
  onSelectRow,
}: GroupViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [createUnder, setCreateUnder] = useState<{ parentId: string | null } | null>(null);
  const [createName, setCreateName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Group | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const createGroup = useAppStore((state) => state.createGroup);
  const renameGroup = useAppStore((state) => state.renameGroup);
  const removeGroup = useAppStore((state) => state.removeGroup);
  const pushToast = useAppStore((state) => state.pushToast);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = useMemo(() => {
    const scope = new Set<string>([selectedGroupId, ...collectDescendants(groups, selectedGroupId)]);
    return rows.filter((row) => scope.has(row.item.groupId ?? UNGROUPED_ID));
  }, [rows, groups, selectedGroupId]);

  const openCreate = (parentId: string | null) => {
    const check = planCreateChild(groups, parentId);
    if (!check.ok) {
      pushToast({ message: check.reason ?? GROUP_DEPTH_MESSAGE, tone: 'danger' });
      return;
    }
    setCreateName('');
    setCreateUnder({ parentId });
  };

  const submitCreate = async () => {
    if (!createUnder) return;
    const result = await createGroup({ name: createName, parentId: createUnder.parentId });
    if (result.ok) setCreateUnder(null);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const result = await renameGroup({ id: renameTarget.id, name: renameName });
    if (result.ok) setRenameTarget(null);
  };

  const submitDelete = async () => {
    if (!deleteTarget) return;
    const result = await removeGroup({ id: deleteTarget.id });
    if (result.ok) {
      setDeleteTarget(null);
      onSelectGroup(UNGROUPED_ID);
    }
  };

  return (
    <div className="flex min-h-0 flex-1" onClick={() => setMenuId(null)}>
      <aside
        role="tree"
        aria-label="分组树"
        className="w-64 shrink-0 overflow-y-auto border-r border-line bg-bg-0"
      >
        <div className="flex h-8 items-center justify-between border-b border-line px-2">
          <span className="t-label">自定义分组 ≤3 层</span>
          <button
            type="button"
            data-group-new=""
            onClick={(event) => {
              event.stopPropagation();
              openCreate(null);
            }}
            className="t-label transition-colors duration-hover hover:text-text-1"
          >
            + 新建分组
          </button>
        </div>
        {tree.map((node) => (
          <GroupTreeNode
            key={node.group.id}
            node={node}
            depth={1}
            groups={groups}
            selectedGroupId={selectedGroupId}
            collapsed={collapsed}
            onToggle={toggle}
            onSelectGroup={onSelectGroup}
            onOpenMenu={setMenuId}
            menuId={menuId}
            onDropPayload={onDropPayload}
            onReorder={onReorder}
            onCreateChild={openCreate}
            onRename={(group) => {
              setRenameName(group.name);
              setRenameTarget(group);
            }}
            onDelete={setDeleteTarget}
          />
        ))}
        <p className="p-2 text-[10px] leading-relaxed text-text-3">
          拖拽色卡行到分组节点即可归组；也可打开详情抽屉用「加入分组」菜单。
        </p>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto" data-group-list="">
        <RowList
          rows={visible}
          actions={actions}
          selectedIds={selectedIds}
          onSelect={onSelectRow}
          draggable
          empty={
            <Empty
              title="此分组暂无条目"
              description="把仓库中的漆料拖到左侧分组即可归组。"
              className="border-0"
            />
          }
        />
      </div>

      <Dialog
        open={createUnder !== null}
        onOpenChange={(open) => {
          if (!open) setCreateUnder(null);
        }}
        title="新建分组"
        description="名称 ≤ 16 字，同层不可重名。"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateUnder(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submitCreate()}>
              新建
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs text-text-2">
          分组名称
          <input
            aria-label="分组名称"
            value={createName}
            maxLength={GROUP_NAME_MAX}
            onChange={(event) => setCreateName(event.target.value)}
            className="h-8 border border-line bg-bg-1 px-2 text-sm text-text-1"
          />
        </label>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title="重命名分组"
        description="名称 ≤ 16 字，同层不可重名。"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submitRename()}>
              保存
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs text-text-2">
          分组名称
          <input
            aria-label="新的分组名称"
            value={renameName}
            maxLength={GROUP_NAME_MAX}
            onChange={(event) => setRenameName(event.target.value)}
            className="h-8 border border-line bg-bg-1 px-2 text-sm text-text-1"
          />
        </label>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除分组"
        description="删除后组内条目回到「未分组」，子分组一并删除，可撤销。"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={() => void submitDelete()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-xs text-text-2">
          {'确认删除「' + (deleteTarget?.name ?? '') + '」？'}
        </p>
      </Dialog>
    </div>
  );
}
