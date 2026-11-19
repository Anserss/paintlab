import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { codeOrDash } from '@/core/render/label';
import { canEnterWorkbench, WORKBENCH_NEAT_BLOCK } from '@/core/render/batch';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { useAppStore } from '@/store';
import { Button, Empty, Segmented, Toolbar } from '@/components/ui';
import { BrandView } from './BrandView';
import { GroupView } from './GroupView';
import { HueView } from './HueView';
import { PaintDetail } from './PaintDetail';
import { AdjustVolumeDialog, DeleteItemDialog, CoatPickDialog, RenameItemDialog } from './Dialogs';
import { DEPOT_VIEWS, brandLabel, needsReorder, planGroupDrag, planGroupDrop } from './model';
import type { BrandSelection, DepotRow, DepotView, DropPayload, DropTarget, HueBin } from './model';
import { useDepotGroups, useDepotRows } from './useDepotData';

interface DragData {
  kind?: string;
  stockItemId?: string;
  groupId?: string;
}

function activeDragData(event: DragStartEvent | DragEndEvent): DragData | undefined {
  return event.active.data.current as DragData | undefined;
}

function overDragData(event: DragEndEvent): DragData | undefined {
  return event.over?.data.current as DragData | undefined;
}

/** 仓库页（spec 3.3）：品牌 / 色环 / 分组三视图 + 行式色卡 + 详情抽屉 */
export function DepotPage() {
  const navigate = useNavigate();
  const rows = useDepotRows();
  const { groups, tree } = useDepotGroups();

  const stockItems = useAppStore((state) => state.stockItems);
  const inventoryReady = useAppStore((state) => state.inventoryReady);
  const refreshInventory = useAppStore((state) => state.refreshInventory);
  const selected = useAppStore((state) => state.selected);
  const setSelected = useAppStore((state) => state.setSelected);
  const select = useAppStore((state) => state.select);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const moveSelectedToGroup = useAppStore((state) => state.moveSelectedToGroup);
  const relocateGroup = useAppStore((state) => state.relocateGroup);
  const reorderGroups = useAppStore((state) => state.reorderGroups);
  const openCoat = useAppStore((state) => state.openCoat);
  const workbenches = useAppStore((state) => state.workbenches);
  const pushToast = useAppStore((state) => state.pushToast);

  const [view, setView] = useState<DepotView>('brand');
  const [query, setQuery] = useState('');
  const [brandSelection, setBrandSelection] = useState<BrandSelection>({ kind: 'all' });
  const [hueSelection, setHueSelection] = useState<HueBin | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(UNGROUPED_ID);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adjustRow, setAdjustRow] = useState<DepotRow | null>(null);
  const [renameRow, setRenameRow] = useState<DepotRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<DepotRow | null>(null);
  const [workbenchRows, setWorkbenchRows] = useState<DepotRow[]>([]);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ stockItemId: string; x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    if (!inventoryReady) void refreshInventory();
  }, [inventoryReady, refreshInventory]);

  const searched = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.paint.name, row.paint.nameZh ?? '', row.paint.code ?? '', row.line.name, brandLabel(row.brand) ?? '']
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [rows, query]);

  /** 行 → 分组：单归属移动（拖拽与菜单共用） */
  const moveRowToGroup = (stockItemId: string, groupId: string) => {
    const current = rows.find((entry) => entry.item.id === stockItemId);
    if (current && (current.item.groupId ?? UNGROUPED_ID) === groupId) {
      pushToast({ message: '条目已在该分组', tone: 'neutral' });
      return;
    }
    setSelected([stockItemId]);
    void moveSelectedToGroup(groupId);
  };

  /** 拖拽与菜单共用同一落点判定（AC-07：超深拒绝且数据不变） */
  const applyDrop = (payload: DropPayload, target: DropTarget) => {
    const plan = planGroupDrop(groups, payload, target);
    if (!plan.ok) {
      pushToast({ message: plan.reason, tone: 'danger' });
      return;
    }
    if (plan.action === 'move-item') {
      moveRowToGroup(plan.stockItemId, plan.groupId);
      return;
    }
    void relocateGroup({ id: plan.groupId, parentId: plan.parentId });
  };

  /**
   * 分组手动排序：顺序未变化时静默跳过（repo 会以「分组顺序未变化」拒绝，不该弹错）；
   * 其余失败由 InventorySlice.reorderGroups 把 error 原文上屏。
   */
  const applyReorder = (parentId: string | null, orderedIds: string[]) => {
    if (!needsReorder(useAppStore.getState().groups, parentId, orderedIds)) return;
    void reorderGroups({ parentId, orderedIds });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragLabel(null);
    const active = activeDragData(event);
    const over = overDragData(event);
    if (!active || !over) return;
    const target: DropTarget =
      over.kind === 'root' ? { kind: 'root' } : over.groupId ? { kind: 'group', groupId: over.groupId } : { kind: 'root' };
    const payload: DropPayload | null =
      active.kind === 'group' && active.groupId
        ? { kind: 'group', groupId: active.groupId }
        : active.kind === 'item' && active.stockItemId
          ? { kind: 'item', stockItemId: active.stockItemId }
          : null;
    if (!payload) return;

    const plan = planGroupDrag(groups, payload, target);
    if (!plan.ok) {
      pushToast({ message: plan.reason, tone: 'danger' });
      return;
    }
    if (plan.action === 'move-item') {
      moveRowToGroup(plan.stockItemId, plan.groupId);
      return;
    }
    if (plan.action === 'reorder-group') {
      applyReorder(plan.parentId, plan.orderedIds);
      return;
    }
    // 跨父级：先 relocateGroup，再在新父级里 reorderGroups（两步各自可撤销）
    void (async () => {
      const moved = await relocateGroup({ id: plan.groupId, parentId: plan.parentId });
      if (!moved.ok) return;
      applyReorder(plan.parentId, plan.orderedIds);
    })();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const active = activeDragData(event);
    const row = rows.find((entry) => entry.item.id === active?.stockItemId);
    const group = groups.find((entry) => entry.id === active?.groupId);
    setDragLabel(row ? codeOrDash(row.paint.code) + ' ' + (row.paint.nameZh ?? row.paint.name) : group ? group.name : null);
  };

  const requestWorkbench = (targets: DepotRow[]) => {
    if (targets.length === 0) return;
    // 2.1 平台流转：稀释漆料可进出工作台；原浆只能在仓库与调漆台之间流转
    const allowed = targets.filter((row) => canEnterWorkbench(row.item.state));
    const blocked = targets.length - allowed.length;
    if (allowed.length === 0) {
      pushToast({ message: WORKBENCH_NEAT_BLOCK, tone: 'warn' });
      return;
    }
    if (blocked > 0) {
      pushToast({ message: '已跳过 ' + blocked + ' 件原浆：' + WORKBENCH_NEAT_BLOCK, tone: 'warn' });
    }
    if (workbenches.length === 0) {
      pushToast({ message: '还没有工作台，先去工作台页新建一个', tone: 'warn' });
      return;
    }
    if (workbenches.length === 1) {
      void openCoat({
        workbenchId: workbenches[0].id,
        refs: allowed.map((row) => ({ refType: 'stock' as const, refId: row.item.id })),
      });
      return;
    }
    setWorkbenchRows(allowed);
  };

  const sendToMix = (row: DepotRow) => {
    navigate('/mix', { state: { paintId: row.paint.id, stockItemId: row.item.id } });
    pushToast({ message: '已选择 ' + codeOrDash(row.paint.code) + '，前往调漆台', tone: 'neutral' });
  };

  const openDetail = (row: DepotRow) => setDetailId(row.item.id);
  const detailRow = rows.find((row) => row.item.id === detailId) ?? null;
  const selectedRows = rows.filter((row) => selected.includes(row.item.id));

  /** 行级菜单（右键 / Shift+F10）：拖拽的键盘替代路径，落点判定与拖拽共用 applyDrop */
  const openRowMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    const rowElement = (event.target as HTMLElement).closest('[data-depot-row]');
    const stockItemId = rowElement?.getAttribute('data-depot-row');
    if (!rowElement || !stockItemId) return;
    event.preventDefault();
    const rect = rowElement.getBoundingClientRect();
    const y = typeof (event as React.MouseEvent).clientY === 'number' ? (event as React.MouseEvent).clientY : rect.top + 8;
    setRowMenu({ stockItemId, x: Math.max(8, rect.left + 24), y: Math.max(8, y) });
  };

  const rowActions = {
    onOpen: openDetail,
    onOpenCoat: (row: DepotRow) => requestWorkbench([row]),
    onUse: sendToMix,
  };

  const selectRow = (row: DepotRow) => select(row.item.id);

  const body = () => {
    if (view === 'brand') {
      return (
        <BrandView
          rows={searched}
          selection={brandSelection}
          onSelectionChange={setBrandSelection}
          actions={rowActions}
          selectedIds={selected}
          onSelectRow={selectRow}
        />
      );
    }
    if (view === 'hue') {
      return (
        <HueView
          rows={searched}
          selection={hueSelection}
          onSelectionChange={setHueSelection}
          actions={rowActions}
          selectedIds={selected}
          onSelectRow={selectRow}
        />
      );
    }
    return (
      <GroupView
        rows={searched}
        groups={groups}
        tree={tree}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        onDropPayload={applyDrop}
        onReorder={applyReorder}
        actions={rowActions}
        selectedIds={selected}
        onSelectRow={selectRow}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
      <section data-page="depot" className="flex h-full min-h-0 flex-col">
        <header
          className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b bg-surface px-4 py-2"
          style={{ borderColor: 'var(--ef-rule)' }}
        >
          <div className="flex flex-col">
            <p className="ef-eyebrow">// DEPOT</p>
            <h1 className="text-[22px] font-bold leading-tight">仓库</h1>
          </div>
          <Segmented
            ariaLabel="仓库视图"
            options={DEPOT_VIEWS}
            value={view}
            onChange={(next) => setView(next)}
          />
          <input
            aria-label="搜索漆料"
            placeholder="搜索颜色名 / 色号 / 品牌"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ef-input h-10 w-72"
          />
          <span className="ef-field ml-auto text-[12px] text-text-2" data-selected-count="">
            {'已选 ' + selected.length + ' 件'}
          </span>
        </header>

        {!inventoryReady ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="t-label">载入库存…</span>
          </div>
        ) : stockItems.length === 0 ? (
          <div className="p-4">
            <Empty
              title="DEPOT // 空仓"
              description="还没有漆料。前往采购大厅入库你的第一支漆。"
              action={
                <Button variant="primary" onClick={() => navigate('/procure')}>
                  去采购
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1" onContextMenu={openRowMenu} onClick={() => setRowMenu(null)}>
            {body()}
          </div>
        )}

        {rowMenu && (
          <div
            role="menu"
            data-row-menu=""
            style={{ left: rowMenu.x, top: rowMenu.y }}
            className="fixed z-[var(--z-toast)] w-48 border border-line-strong bg-surface p-1 text-xs"
          >
            <div className="t-label px-2 py-1">加入分组</div>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                role="menuitem"
                data-row-menu-group={group.id}
                aria-label={'行菜单加入分组 ' + group.name}
                onClick={(event) => {
                  event.stopPropagation();
                  applyDrop({ kind: 'item', stockItemId: rowMenu.stockItemId }, { kind: 'group', groupId: group.id });
                  setRowMenu(null);
                }}
                className="block w-full px-2 py-1 text-left text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1"
              >
                {'L' + group.depth + ' ' + group.name}
              </button>
            ))}
          </div>
        )}

        <Toolbar count={selected.length}>
          <Button size="sm" onClick={() => requestWorkbench(selectedRows)}>
            开涂
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            取消
          </Button>
        </Toolbar>

        <PaintDetail
          row={detailRow}
          groups={groups}
          onClose={() => setDetailId(null)}
          onOpenCoat={(row) => requestWorkbench([row])}
          onUse={sendToMix}
          onAdjust={(row) => setAdjustRow(row)}
          onRename={(row) => setRenameRow(row)}
          onDelete={(row) => setDeleteRow(row)}
          onMoveToGroup={(row, groupId) => applyDrop({ kind: 'item', stockItemId: row.item.id }, { kind: 'group', groupId })}
        />

        <AdjustVolumeDialog row={adjustRow} onClose={() => setAdjustRow(null)} />
        <RenameItemDialog row={renameRow} onClose={() => setRenameRow(null)} />
        <DeleteItemDialog row={deleteRow} onClose={() => setDeleteRow(null)} />
        <CoatPickDialog rows={workbenchRows} onClose={() => setWorkbenchRows([])} />
      </section>

      <DragOverlay dropAnimation={null}>
        {dragLabel ? (
          <div className="u-chamfer border border-line-strong bg-[rgba(12,13,14,.92)] px-2 py-1 text-xs text-text-1">
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
