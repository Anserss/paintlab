import { useDroppable } from '@dnd-kit/core';
import type { Workbench } from '@/core/model/types';
import { Badge, Button, cn } from '@/components/ui';
import { MAX_WORKBENCHES } from '@/core/rules/invariants';
import { formatTabBadge } from './workbenchModel';

export const WORKBENCH_DROP_PREFIX = 'workbench-tab:';

export interface WorkbenchTabData {
  workbench: Workbench;
  count: number;
  totalMl: number;
}

export interface WorkbenchTabsProps {
  workbenches: WorkbenchTabData[];
  activeId: string | null;
  /** 已建满 5 个：新建按钮禁用（AC-08 / 3.7.3） */
  atCap: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function WorkbenchTab({
  data,
  active,
  onSelect,
}: {
  data: WorkbenchTabData;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: WORKBENCH_DROP_PREFIX + data.workbench.id,
    data: { workbenchId: data.workbench.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      data-workbench-tab={data.workbench.id}
      title={data.workbench.note ? data.workbench.note : undefined}
      onClick={() => onSelect(data.workbench.id)}
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 border px-2.5 text-xs transition-colors duration-hover',
        active
          ? 'border-accent bg-surface-3 text-text-1'
          : 'border-line bg-bg-1 text-text-3 hover:border-line-strong hover:text-text-2',
        isOver && 'border-accent',
      )}
    >
      <span
        aria-hidden
        data-workbench-accent=""
        className="h-2 w-2 shrink-0"
        style={{ backgroundColor: data.workbench.accent }}
      />
      <span className="max-w-[112px] truncate">{data.workbench.name}</span>
      <Badge tone={active ? 'accent' : 'neutral'}>{formatTabBadge(data.count, data.totalMl)}</Badge>
    </button>
  );
}

/** 工作台 Tab 条：横向、含件数与总毫升徽标 + 新建工作台（spec 3.5） */
export function WorkbenchTabs({ workbenches, activeId, atCap, onSelect, onNew }: WorkbenchTabsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="工作台" className="flex flex-wrap items-stretch gap-2">
        {workbenches.length === 0
          ? Array.from({ length: MAX_WORKBENCHES }).map((_, index) => (
              <button
                key={index}
                type="button"
                data-slot="workbench-placeholder"
                onClick={onNew}
                className="flex h-9 flex-1 items-center justify-center border border-dashed border-line text-[11px] text-text-3 transition-colors duration-hover hover:border-line-strong hover:text-text-2"
              >
                ＋ 新建工作台
              </button>
            ))
          : workbenches.map((data) => (
              <WorkbenchTab
                key={data.workbench.id}
                data={data}
                active={data.workbench.id === activeId}
                onSelect={onSelect}
              />
            ))}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {atCap && <span className="text-[10px] text-text-3">最多 5 个工作台，请先删除或复用现有工作台</span>}
          <Button
            data-action="new-workbench"
            data-disabled-reason={atCap ? 'cap' : undefined}
            disabled={atCap}
            title={atCap ? '最多 5 个工作台' : undefined}
            onClick={() => {
              if (atCap) return;
              onNew();
            }}
          >
            ＋ 新建工作台
          </Button>
        </div>
      </div>
    </div>
  );
}
