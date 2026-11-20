import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { useShutterNavigate } from '@/app/useShutterNavigate';
import { Button, Empty, Toolbar } from '@/components/ui';
import { MAX_WORKBENCHES } from '@/core/rules/invariants';
import { useAppStore } from '@/store';
import { DeleteWorkbenchDialog, ReturnDialog, WorkbenchFormDialog } from './WorkbenchDialogs';
import type { WorkbenchFormValues } from './WorkbenchDialogs';
import { WORKBENCH_DROP_PREFIX, WorkbenchTabs } from './WorkbenchTabs';
import { WorkbenchTileGrid } from './WorkbenchTileGrid';
import { StockLane } from './StockLane';
import { UsagePanel } from './UsagePanel';
import { useWorkbenchStockLane } from './useWorkbenchData';
import { formatWorkbenchStats, resolveEntries } from './workbenchModel';

type DialogKind = 'none' | 'create' | 'edit' | 'delete' | 'return';

/** 工作台页（spec 3.5）：左侧从仓库调取 + Tab + 磁贴网格 + 用量面板 + 批量操作条 + 统计 */
export function WorkbenchPage() {
  const state = useAppStore();
  const go = useShutterNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>('none');
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  const workbenches = state.workbenches;
  const atCap = workbenches.length >= MAX_WORKBENCHES;
  const active = workbenches.find((row) => row.id === activeId) ?? workbenches[0] ?? null;

  // 撤销/反撤销只刷新库存，工作台读模型需要自行重读（spec 3.6：撤销后 UI 必须一致）
  useEffect(() => {
    void useAppStore.getState().refreshWorkbenches();
  }, [state.undoCount, state.redoCount]);

  useEffect(() => {
    if (workbenches.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !workbenches.some((row) => row.id === activeId)) setActiveId(workbenches[0].id);
  }, [workbenches, activeId]);

  const activeItems = active ? state.workbenchItems.filter((row) => row.workbenchId === active.id) : [];
  const entries = resolveEntries(activeItems, {
    stockItems: state.stockItems,
    bottles: state.bottles,
    paintsById: state.paintsById,
    linesById: state.linesById,
    brands: state.brands,
  });
  const stats = active ? state.statsOfWorkbench(active.id) : { count: 0, totalMl: 0, kits: 0 };
  const stockLane = useWorkbenchStockLane(active?.id ?? null);
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const panelEntry = entries.find((entry) => entry.id === activeEntryId) ?? selectedEntries[0] ?? entries[0] ?? null;
  const otherWorkbenches = workbenches.filter((row) => row.id !== active?.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  function openCreate() {
    if (atCap) return;
    setDialog('create');
  }

  function handleToggle(entryId: string) {
    setActiveEntryId(entryId);
    setSelectedIds((prev) =>
      prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId],
    );
  }

  function handleCreate(values: WorkbenchFormValues) {
    setDialog('none');
    void state
      .newWorkbench({ name: values.name, note: values.note || undefined, accent: values.accent })
      .then((result) => {
        if (result.ok) setActiveId(result.data.id);
      });
  }

  function handleEdit(values: WorkbenchFormValues) {
    setDialog('none');
    if (!active) return;
    void state.editWorkbench({
      id: active.id,
      name: values.name,
      note: values.note,
      accent: values.accent,
    });
  }

  function handleDelete() {
    setDialog('none');
    if (!active) return;
    void state.removeWorkbench({ id: active.id }).then(() => {
      setSelectedIds([]);
      setActiveId(null);
    });
  }

  function handleReturn(list: { itemId: string; usedMl: number }[]) {
    setDialog('none');
    if (!active) return;
    void state.stockIn({ workbenchId: active.id, entries: list }).then(() => setSelectedIds([]));
  }

  function handleRemoveSelected() {
    if (selectedIds.length === 0) return;
    void state.removeFromWorkbench([...selectedIds]).then(() => setSelectedIds([]));
  }

  function handleMove(targetWorkbenchId: string) {
    setMoveMenuOpen(false);
    if (selectedIds.length === 0) return;
    void state
      .moveInWorkbench({ itemIds: [...selectedIds], targetWorkbenchId })
      .then(() => setSelectedIds([]));
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (typeof overId !== 'string' || !overId.startsWith(WORKBENCH_DROP_PREFIX)) return;
    const targetId = overId.slice(WORKBENCH_DROP_PREFIX.length);
    if (!active || targetId === active.id) return;
    void state
      .moveInWorkbench({ itemIds: [String(event.active.id)], targetWorkbenchId: targetId })
      .then(() => setSelectedIds([]));
  }

  function handleCommitPlanned(itemId: string, plannedUseMl: number) {
    void state.changePlannedUse({ itemId, plannedUseMl });
  }

  function handleApplySelected(plannedUseMl: number) {
    for (const itemId of selectedIds) void state.changePlannedUse({ itemId, plannedUseMl });
  }

  /** 侧栏调取：仓库里的稀释 / 调漆产物直接加入当前工作台（2.1） */
  function handlePickStock(stockItemId: string) {
    if (!active) return;
    void state.openCoat({
      workbenchId: active.id,
      refs: [{ refType: 'stock', refId: stockItemId }],
    });
  }

  /** 工作台 → 调漆台：稀释漆料在三边互通，可直接带过去继续稀释 / 调漆 */
  function handleSendToMix() {
    const entry = entries.find((row) => selectedIds.includes(row.id));
    if (!entry) return;
    if (entry.refType === 'bottle') {
      go('/mix', { state: { bottleId: entry.item.refId } });
      return;
    }
    go('/mix', { state: { stockItemId: entry.item.refId } });
  }

  return (
    <section className="flex min-h-full flex-col gap-5 p-6" data-page="workbench">
      <div className="ef-page-head">
        <div className="min-w-0">
          <p className="ef-eyebrow">// BENCH</p>
          <h1 className="ef-title">工作台</h1>
          {active ? (
            <p data-slot="workbench-stats" className="ef-field mt-1 text-[12px] text-text-2">
              {formatWorkbenchStats(stats)}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-text-2">最多 5 个工作台；工作台内条目可拖拽到其它工作台。</p>
          )}
          {active?.note && <p className="mt-1 text-[12px] text-text-2">备注：{active.note}</p>}
        </div>

        {active && (
          <div className="flex shrink-0 items-center gap-2">
            <Button data-action="edit-workbench" onClick={() => setDialog('edit')}>
              重命名
            </Button>
            <Button variant="danger" data-action="delete-workbench" onClick={() => setDialog('delete')}>
              删除工作台
            </Button>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <WorkbenchTabs
          workbenches={workbenches.map((workbench) => {
            const workbenchStats = state.statsOfWorkbench(workbench.id);
            return { workbench, count: workbenchStats.count, totalMl: workbenchStats.totalMl };
          })}
          activeId={active?.id ?? null}
          atCap={atCap}
          onSelect={(id) => {
            setActiveId(id);
            setSelectedIds([]);
            setActiveEntryId(null);
          }}
          onNew={openCreate}
        />

        <div className="mt-2 flex items-start gap-5">
          <StockLane
            className="max-h-[calc(100vh-300px)] w-[264px] shrink-0"
            rows={stockLane.rows}
            neatBlocked={stockLane.neatBlocked}
            canAdd={Boolean(active)}
            onPick={handlePickStock}
          />

          <div className="min-w-0 flex-1">
            {!active ? (
              <Empty
                title="未创建工作台"
                description="先新建一个工作台，再从左侧「从仓库调取」加入稀释漆料。"
                action={<Button data-action="new-workbench-empty" onClick={openCreate}>＋ 新建工作台</Button>}
              />
            ) : (
              <WorkbenchTileGrid key={active.id} entries={entries} selectedIds={selectedIds} onToggle={handleToggle} />
            )}
          </div>

          {active && (
            <UsagePanel
              entry={panelEntry}
              selectedCount={selectedIds.length}
              onCommit={handleCommitPlanned}
              onApplyToSelected={handleApplySelected}
            />
          )}
        </div>
      </DndContext>

      <Toolbar count={selectedIds.length}>
        <Button
          size="sm"
          data-action="record-usage"
          onClick={() => setActiveEntryId(selectedIds[0] ?? null)}
        >
          记录用量
        </Button>
        <Button size="sm" data-action="return-selected" onClick={() => setDialog('return')}>
          入库
        </Button>
        <Button size="sm" data-action="send-to-mix" onClick={handleSendToMix}>
          去调漆台
        </Button>
        <Button size="sm" data-action="remove-selected" onClick={handleRemoveSelected}>
          移出工作台
        </Button>
        <div className="relative">
          <Button
            size="sm"
            data-action="move-menu"
            aria-expanded={moveMenuOpen}
            disabled={otherWorkbenches.length === 0}
            title={otherWorkbenches.length === 0 ? '没有其它工作台' : undefined}
            onClick={() => setMoveMenuOpen((open) => !open)}
          >
            移到工作台 ▾
          </Button>
          {moveMenuOpen && otherWorkbenches.length > 0 && (
            <div
              role="menu"
              aria-label="移到工作台"
              className="absolute bottom-9 right-0 min-w-[140px] border border-line-strong bg-surface p-1"
            >
              {otherWorkbenches.map((workbench) => (
                <button
                  key={workbench.id}
                  type="button"
                  role="menuitem"
                  data-move-target={workbench.id}
                  onClick={() => handleMove(workbench.id)}
                  className="block w-full px-2 py-1 text-left text-xs text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1"
                >
                  {workbench.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Toolbar>

      <WorkbenchFormDialog
        key={'create-' + dialog}
        open={dialog === 'create'}
        mode="create"
        takenNames={workbenches.map((row) => row.name)}
        onOpenChange={(open) => setDialog(open ? 'create' : 'none')}
        onSubmit={handleCreate}
      />

      <WorkbenchFormDialog
        key={'edit-' + (active?.id ?? 'none') + '-' + dialog}
        open={dialog === 'edit'}
        mode="edit"
        initial={
          active
            ? { name: active.name, note: active.note ?? '', accent: active.accent }
            : undefined
        }
        takenNames={workbenches.filter((row) => row.id !== active?.id).map((row) => row.name)}
        onOpenChange={(open) => setDialog(open ? 'edit' : 'none')}
        onSubmit={handleEdit}
      />

      <DeleteWorkbenchDialog
        open={dialog === 'delete'}
        workbenchName={active?.name ?? ''}
        itemCount={activeItems.length}
        onOpenChange={(open) => setDialog(open ? 'delete' : 'none')}
        onConfirm={handleDelete}
      />

      <ReturnDialog
        open={dialog === 'return'}
        entries={selectedEntries}
        onOpenChange={(open) => setDialog(open ? 'return' : 'none')}
        onConfirm={handleReturn}
      />
    </section>
  );
}
