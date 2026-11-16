import type { DragEvent, ReactNode } from 'react';
import { cn } from './cn';

export interface TreeRowProps {
  /** 1 / 2 / 3，缩进 16/层 */
  depth: 1 | 2 | 3;
  label: string;
  count?: number;
  selected?: boolean;
  expanded?: boolean;
  hasChildren?: boolean;
  dropActive?: boolean;
  system?: boolean;
  meta?: ReactNode;
  onSelect?: () => void;
  onToggle?: () => void;
  onDropOn?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOverRow?: (e: DragEvent<HTMLDivElement>) => void;
}

const PREFIX: Record<1 | 2 | 3, string> = { 1: '▸', 2: '·', 3: '∘' };

/** TreeRow：高 28，缩进 16/层；拖拽悬停时整行 --surface-3 + 左侧 2px 竖条（4.5.3） */
export function TreeRow({
  depth,
  label,
  count,
  selected,
  expanded,
  hasChildren,
  dropActive,
  system,
  meta,
  onSelect,
  onToggle,
  onDropOn,
  onDragOverRow,
}: TreeRowProps) {
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-level={depth}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
        if (e.key === 'ArrowRight' && hasChildren && !expanded) onToggle?.();
        if (e.key === 'ArrowLeft' && hasChildren && expanded) onToggle?.();
      }}
      onDrop={onDropOn}
      onDragOver={onDragOverRow}
      className={cn(
        'group relative flex h-7 cursor-pointer select-none items-center gap-1.5 pr-2 text-xs transition-colors duration-hover',
        'border-l-2 border-transparent',
        selected ? 'bg-surface-2 text-text-1' : 'text-text-2 hover:bg-surface-2 hover:text-text-1',
        dropActive && 'border-l-accent bg-surface-3',
      )}
      style={{ paddingLeft: (depth - 1) * 16 + 8 }}
    >
      <button
        type="button"
        aria-label={expanded ? '折叠' : '展开'}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn(
          'w-3 shrink-0 text-center text-[10px] text-text-3',
          !hasChildren && 'invisible',
        )}
      >
        {expanded ? '▾' : '▸'}
      </button>
      <span className={cn('t-label shrink-0', !hasChildren && 'opacity-60')}>{PREFIX[depth]}</span>
      <span className={cn('truncate', system && 'italic text-text-3')}>{label}</span>
      {meta}
      {typeof count === 'number' && (
        <span className="t-readout ml-auto pl-2 text-[10px] text-text-3">{count}</span>
      )}
    </div>
  );
}
