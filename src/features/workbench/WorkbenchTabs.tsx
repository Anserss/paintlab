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
        'flex h-10 shrink-0 items-center gap-2 border px-3 text-[13px] transition-colors duration-hover',
        active
          ? 'border-transparent bg-signal font-bold text-[var(--ef-on-signal)]'
          : 'bg-surface text-text-2 hover:border-text-1 hover:text-text-1',
        isOver && 'border-[var(--ef-trace)]',
      )}
      style={{
        borderColor: active ? 'var(--ef-ink)' : 'var(--ef-rule)',
        clipPath: active
          ? 'polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%)'
          : undefined,
      }}
    >
      <span
        aria-hidden
        data-workbench-accent=""
        className="h-2 w-2 shrink-0"
        style={{ backgroundColor: data.workbench.accent }}
      />
      <span className="max-w-[112px] truncate">{data.workbench.name}</span>
      <span className={cn('ef-field text-[11px]', active ? 'text-[var(--ef-on-signal)]' : 'text-text-2')}>
        {formatTabBadge(data.count, data.totalMl)}
      </span>
    </button>
  );
}

/** 工作台 Tab 条：横向、含件数与总毫升字段 + 新建工作台 */
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
                className="tex-hatch flex h-10 flex-1 items-center justify-center border text-[12px] text-text-2 transition-colors duration-hover hover:text-text-1"
                style={{ borderColor: 'var(--ef-rule)' }}
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
          {atCap && <span className="text-[11px] text-text-2">最多 5 个工作台，请先删除或复用现有工作台</span>}
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
