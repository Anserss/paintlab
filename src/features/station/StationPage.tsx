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
import { Button, Empty, Toolbar } from '@/components/ui';
import { MAX_WORKSTATIONS } from '@/core/rules/invariants';
import { useAppStore } from '@/store';
import { DeleteStationDialog, ReturnDialog, StationFormDialog } from './StationDialogs';
import type { StationFormValues } from './StationDialogs';
import { STATION_DROP_PREFIX, StationTabs } from './StationTabs';
import { StationTileGrid } from './StationTileGrid';
import { UsagePanel } from './UsagePanel';
import { formatStationStats, resolveEntries } from './stationModel';

type DialogKind = 'none' | 'create' | 'edit' | 'delete' | 'return';

/** 工位页（spec 3.5）：Tab + 磁贴网格 + 用量面板 + 批量操作条 + 统计 */
export function StationPage() {
  const state = useAppStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>('none');
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);

  const workstations = state.workstations;
  const atCap = workstations.length >= MAX_WORKSTATIONS;
  const active = workstations.find((row) => row.id === activeId) ?? workstations[0] ?? null;

  // 撤销/反撤销只刷新库存，工位读模型需要自行重读（spec 3.6：撤销后 UI 必须一致）
  useEffect(() => {
    void useAppStore.getState().refreshStations();
  }, [state.undoCount, state.redoCount]);

  useEffect(() => {
    if (workstations.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !workstations.some((row) => row.id === activeId)) setActiveId(workstations[0].id);
  }, [workstations, activeId]);

  const activeItems = active ? state.stationItems.filter((row) => row.workstationId === active.id) : [];
  const entries = resolveEntries(activeItems, {
    stockItems: state.stockItems,
    bottles: state.bottles,
    paintsById: state.paintsById,
    linesById: state.linesById,
    brands: state.brands,
  });
  const stats = active ? state.statsOfStation(active.id) : { count: 0, totalMl: 0, kits: 0 };
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const panelEntry = entries.find((entry) => entry.id === activeEntryId) ?? selectedEntries[0] ?? entries[0] ?? null;
  const otherStations = workstations.filter((row) => row.id !== active?.id);

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

  function handleCreate(values: StationFormValues) {
    setDialog('none');
    void state
      .newWorkstation({ name: values.name, note: values.note || undefined, accent: values.accent })
      .then((result) => {
        if (result.ok) setActiveId(result.data.id);
      });
  }

  function handleEdit(values: StationFormValues) {
    setDialog('none');
    if (!active) return;
    void state.editWorkstation({
      id: active.id,
      name: values.name,
      note: values.note,
      accent: values.accent,
    });
  }

  function handleDelete() {
    setDialog('none');
    if (!active) return;
    void state.removeWorkstation({ id: active.id }).then(() => {
      setSelectedIds([]);
      setActiveId(null);
    });
  }

  function handleReturn(list: { itemId: string; usedMl: number }[]) {
    setDialog('none');
    if (!active) return;
    void state.returnToDepot({ workstationId: active.id, entries: list }).then(() => setSelectedIds([]));
  }

  function handleRemoveSelected() {
    if (selectedIds.length === 0) return;
    void state.removeFromStation([...selectedIds]).then(() => setSelectedIds([]));
  }

  function handleMove(targetWorkstationId: string) {
    setMoveMenuOpen(false);
    if (selectedIds.length === 0) return;
    void state
      .moveInStation({ itemIds: [...selectedIds], targetWorkstationId })
      .then(() => setSelectedIds([]));
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (typeof overId !== 'string' || !overId.startsWith(STATION_DROP_PREFIX)) return;
    const targetId = overId.slice(STATION_DROP_PREFIX.length);
    if (!active || targetId === active.id) return;
    void state
      .moveInStation({ itemIds: [String(event.active.id)], targetWorkstationId: targetId })
      .then(() => setSelectedIds([]));
  }

  function handleCommitPlanned(itemId: string, plannedUseMl: number) {
    void state.changePlannedUse({ itemId, plannedUseMl });
  }

  function handleApplySelected(plannedUseMl: number) {
    for (const itemId of selectedIds) void state.changePlannedUse({ itemId, plannedUseMl });
  }

  return (
    <section className="p-6" data-page="station">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-display text-2xl">STATION // 工位</h1>
          {active ? (
            <p data-slot="station-stats" className="t-readout mt-1 text-[11px] text-text-3">
              {formatStationStats(stats)}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-text-3">最多 5 个工位；工位内条目可拖拽到其它工位。</p>
          )}
          {active?.note && <p className="mt-1 text-[11px] text-text-2">备注：{active.note}</p>}
        </div>

        {active && (
          <div className="flex shrink-0 items-center gap-2">
            <Button data-action="edit-station" onClick={() => setDialog('edit')}>
              重命名
            </Button>
            <Button variant="danger" data-action="delete-station" onClick={() => setDialog('delete')}>
              删除工位
            </Button>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <StationTabs
          stations={workstations.map((workstation) => {
            const stationStats = state.statsOfStation(workstation.id);
            return { workstation, count: stationStats.count, totalMl: stationStats.totalMl };
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

        <div className="mt-4 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {!active ? (
              <Empty
                title="未创建工位"
                description="先新建一个工位，再从仓库多选漆料加入。"
                action={<Button data-action="new-station-empty" onClick={openCreate}>＋ 新建工位</Button>}
              />
            ) : (
              <StationTileGrid entries={entries} selectedIds={selectedIds} onToggle={handleToggle} />
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
          放回仓库
        </Button>
        <Button size="sm" data-action="remove-selected" onClick={handleRemoveSelected}>
          移出工位
        </Button>
        <div className="relative">
          <Button
            size="sm"
            data-action="move-menu"
            aria-expanded={moveMenuOpen}
            disabled={otherStations.length === 0}
            title={otherStations.length === 0 ? '没有其它工位' : undefined}
            onClick={() => setMoveMenuOpen((open) => !open)}
          >
            移到工位 ▾
          </Button>
          {moveMenuOpen && otherStations.length > 0 && (
            <div
              role="menu"
              aria-label="移到工位"
              className="absolute bottom-9 right-0 min-w-[140px] border border-line-strong bg-surface p-1"
            >
              {otherStations.map((workstation) => (
                <button
                  key={workstation.id}
                  type="button"
                  role="menuitem"
                  data-move-target={workstation.id}
                  onClick={() => handleMove(workstation.id)}
                  className="block w-full px-2 py-1 text-left text-xs text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1"
                >
                  {workstation.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Toolbar>

      <StationFormDialog
        key={'create-' + dialog}
        open={dialog === 'create'}
        mode="create"
        takenNames={workstations.map((row) => row.name)}
        onOpenChange={(open) => setDialog(open ? 'create' : 'none')}
        onSubmit={handleCreate}
      />

      <StationFormDialog
        key={'edit-' + (active?.id ?? 'none') + '-' + dialog}
        open={dialog === 'edit'}
        mode="edit"
        initial={
          active
            ? { name: active.name, note: active.note ?? '', accent: active.accent }
            : undefined
        }
        takenNames={workstations.filter((row) => row.id !== active?.id).map((row) => row.name)}
        onOpenChange={(open) => setDialog(open ? 'edit' : 'none')}
        onSubmit={handleEdit}
      />

      <DeleteStationDialog
        open={dialog === 'delete'}
        stationName={active?.name ?? ''}
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
