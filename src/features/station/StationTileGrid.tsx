import { useDraggable } from '@dnd-kit/core';
import type { MouseEvent } from 'react';
import { Empty, cn } from '@/components/ui';
import { PaintTile } from '@/components/paint';
import { formatMl } from '@/core/math/quantity';
import type { StationEntry } from './stationModel';

export interface StationTileGridProps {
  entries: StationEntry[];
  selectedIds: string[];
  onToggle: (entryId: string) => void;
}

function DraggableTile({
  entry,
  selected,
  onToggle,
}: {
  entry: StationEntry;
  selected: boolean;
  onToggle: (entryId: string) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: entry.id,
    data: { entryId: entry.id, refType: entry.refType },
  });

  return (
    <div
      ref={setNodeRef}
      data-station-tile={entry.id}
      data-ref-type={entry.refType}
      className={cn('cursor-grab', isDragging && 'opacity-40')}
      {...(listeners ?? {})}
    >
      {entry.paint && entry.line ? (
        <PaintTile
          paint={entry.paint}
          line={entry.line}
          brand={entry.brand}
          stock={{ volumeMl: entry.remainingMl, initialMl: entry.initialMl }}
          plannedUseMl={entry.plannedUseMl}
          usedMl={entry.usedMl}
          selected={selected}
          onSelect={(_paint: unknown, _event?: MouseEvent<HTMLElement>) => onToggle(entry.id)}
        />
      ) : (
        <div
          data-station-tile-fallback=""
          className="flex h-[var(--tile-h)] w-tile shrink-0 flex-col justify-between border border-dashed border-line bg-surface p-1.5"
          onClick={() => onToggle(entry.id)}
        >
          <span className="truncate text-[11px] text-text-2">{entry.title}</span>
          <span className="t-readout text-[10px] text-text-3">漆料未加载</span>
          <span className="t-readout text-[10px] text-text-2">{formatMl(entry.remainingMl)} ml</span>
        </div>
      )}
    </div>
  );
}

/** 主区：该工位条目的 PaintTile 网格（spec 3.5 / 4.5.1） */
export function StationTileGrid({ entries, selectedIds, onToggle }: StationTileGridProps) {
  if (entries.length === 0) {
    return <Empty title="工位待命" description="从仓库多选漆料，加入此工位。" />;
  }

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      aria-label="工位条目"
      data-grid="station"
      className="flex flex-wrap content-start gap-3"
    >
      {entries.map((entry) => (
        <DraggableTile
          key={entry.id}
          entry={entry}
          selected={selectedIds.includes(entry.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
