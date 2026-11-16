import { useDroppable } from '@dnd-kit/core';
import type { Workstation } from '@/core/model/types';
import { Badge, Button, cn } from '@/components/ui';
import { MAX_WORKSTATIONS } from '@/core/rules/invariants';
import { formatTabBadge } from './stationModel';

export const STATION_DROP_PREFIX = 'station-tab:';

export interface StationTabData {
  workstation: Workstation;
  count: number;
  totalMl: number;
}

export interface StationTabsProps {
  stations: StationTabData[];
  activeId: string | null;
  /** 已建满 5 个：新建按钮禁用（AC-08 / 3.7.3） */
  atCap: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function StationTab({
  data,
  active,
  onSelect,
}: {
  data: StationTabData;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: STATION_DROP_PREFIX + data.workstation.id,
    data: { workstationId: data.workstation.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      data-station-tab={data.workstation.id}
      title={data.workstation.note ? data.workstation.note : undefined}
      onClick={() => onSelect(data.workstation.id)}
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
        data-station-accent=""
        className="h-2 w-2 shrink-0"
        style={{ backgroundColor: data.workstation.accent }}
      />
      <span className="max-w-[112px] truncate">{data.workstation.name}</span>
      <Badge tone={active ? 'accent' : 'neutral'}>{formatTabBadge(data.count, data.totalMl)}</Badge>
    </button>
  );
}

/** 工位 Tab 条：横向、含件数与总毫升徽标 + 新建工位（spec 3.5） */
export function StationTabs({ stations, activeId, atCap, onSelect, onNew }: StationTabsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="工位" className="flex flex-wrap items-stretch gap-2">
        {stations.length === 0
          ? Array.from({ length: MAX_WORKSTATIONS }).map((_, index) => (
              <button
                key={index}
                type="button"
                data-slot="station-placeholder"
                onClick={onNew}
                className="flex h-9 flex-1 items-center justify-center border border-dashed border-line text-[11px] text-text-3 transition-colors duration-hover hover:border-line-strong hover:text-text-2"
              >
                ＋ 新建工位
              </button>
            ))
          : stations.map((data) => (
              <StationTab
                key={data.workstation.id}
                data={data}
                active={data.workstation.id === activeId}
                onSelect={onSelect}
              />
            ))}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {atCap && <span className="text-[10px] text-text-3">最多 5 个工位，请先删除或复用现有工位</span>}
          <Button
            data-action="new-station"
            data-disabled-reason={atCap ? 'cap' : undefined}
            disabled={atCap}
            title={atCap ? '最多 5 个工位' : undefined}
            onClick={() => {
              if (atCap) return;
              onNew();
            }}
          >
            ＋ 新建工位
          </Button>
        </div>
      </div>
    </div>
  );
}
