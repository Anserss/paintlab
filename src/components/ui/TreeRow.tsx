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

/** TreeRow：高 32，缩进 16/层；当前节点 = 左侧 4px trace + 墨字加粗 */
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
        'group relative flex h-8 cursor-pointer select-none items-center gap-1.5 pr-2 text-[13px] transition-colors duration-hover',
        'border-l-4 border-transparent',
        selected ? 'border-l-[var(--ef-trace)] bg-transparent font-semibold text-text-1' : 'text-text-2 hover:bg-surface-2 hover:text-text-1',
        dropActive && 'border-l-[var(--ef-trace)] bg-surface-2',
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
        className={cn('w-3 shrink-0 text-center text-[10px] text-text-3', !hasChildren && 'invisible')}
      >
        {expanded ? '▾' : '▸'}
      </button>
      <span className={cn('t-label shrink-0', !hasChildren && 'opacity-60')}>{PREFIX[depth]}</span>
      <span className={cn('truncate', system && 'italic text-text-3')}>{label}</span>
      {meta}
      {typeof count === 'number' && (
        <span className="ef-field ml-auto pl-2 text-[11px] text-text-2">{count}</span>
      )}
    </div>
  );
}
