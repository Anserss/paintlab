import { Fragment, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { BrandLoadState } from '@/store';
import { cn } from '@/components/ui';

/** 左栏品牌列表的一行（「全部」行 id = ALL_BRANDS） */
export interface BrandRowModel {
  id: string;
  nameZh: string;
  shortName: string;
  /** 目录件数：索引件数优先，其次已加载品牌包件数 */
  count?: number;
  state?: BrandLoadState;
  lines: { id: string; name: string; count?: number }[];
}

export interface BrandColumnProps {
  rows: BrandRowModel[];
  selectedId: string;
  selectedLineId: string;
  onSelect: (id: string) => void;
  onSelectLine: (lineId: string) => void;
}

/**
 * 采购大厅左栏（spec 3.2 / AC-16）：纯文字品牌列表，无任何厂商图标。
 * ↑/↓ 遍历、Enter 切换；品牌下可展开产品线二级列表。
 */
export function BrandColumn({
  rows,
  selectedId,
  selectedLineId,
  onSelect,
  onSelectLine,
}: BrandColumnProps) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState<string[]>([]);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const index = rows.findIndex((row) => row.id === selectedId);
    if (index >= 0) setActive(index);
  }, [rows, selectedId]);

  const focusRow = (index: number) => {
    const next = Math.min(Math.max(index, 0), rows.length - 1);
    setActive(next);
    rowRefs.current[next]?.focus();
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(active + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(active - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusRow(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusRow(rows.length - 1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const row = rows[active];
      if (!row || row.lines.length === 0) return;
      event.preventDefault();
      const isOpen = expanded.includes(row.id);
      if (event.key === 'ArrowRight' && !isOpen) toggleExpanded(row.id);
      if (event.key === 'ArrowLeft' && isOpen) toggleExpanded(row.id);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const row = rows[active];
      if (!row) return;
      event.preventDefault();
      onSelect(row.id);
    }
  }

  return (
    <div
      role="listbox"
      aria-label="品牌列表"
      data-procure-brands=""
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1"
    >
      {rows.map((row, index) => {
        const selected = row.id === selectedId;
        const isOpen = expanded.includes(row.id);
        return (
          <Fragment key={row.id}>
            <div
              role="option"
              aria-selected={selected}
              aria-label={row.nameZh + ' ' + row.shortName}
              tabIndex={index === active ? 0 : -1}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              data-brand-row={row.id}
              onClick={() => {
                setActive(index);
                onSelect(row.id);
              }}
              onFocus={() => setActive(index)}
              className={cn(
                'flex h-9 shrink-0 cursor-pointer select-none items-center gap-1.5 border-l-2 pl-2 pr-2 text-xs transition-colors duration-hover',
                selected
                  ? 'border-l-accent bg-surface-2 text-text-1'
                  : 'border-l-transparent text-text-2 hover:bg-surface-2 hover:text-text-1',
              )}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={isOpen ? '折叠产品线' : '展开产品线'}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpanded(row.id);
                }}
                className={cn(
                  'w-3 shrink-0 text-center text-[10px] text-text-3',
                  row.lines.length === 0 && 'invisible',
                )}
              >
                {isOpen ? '▾' : '▸'}
              </button>
              <span className="truncate">{row.nameZh}</span>
              <span className="t-readout shrink-0 text-[10px] text-text-3">{row.shortName}</span>
              {row.state === 'loading' && <span className="t-label shrink-0">···</span>}
              {typeof row.count === 'number' ? (
                <span className="t-readout ml-auto shrink-0 pl-2 text-[10px] text-text-3">{row.count}</span>
              ) : (
                <span className="ml-auto shrink-0 pl-2 text-[10px] text-text-3">—</span>
              )}
            </div>
            {isOpen &&
              row.lines.map((line) => {
                const lineSelected = line.id === selectedLineId;
                return (
                  <div
                    key={row.id + ':' + line.id}
                    role="option"
                    aria-selected={lineSelected}
                    data-line-row={line.id}
                    tabIndex={-1}
                    onClick={() => onSelectLine(lineSelected ? '' : line.id)}
                    className={cn(
                      'flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 border-l-2 pl-7 pr-2 text-[11px] transition-colors duration-hover',
                      lineSelected
                        ? 'border-l-accent bg-surface-3 text-text-1'
                        : 'border-l-transparent text-text-3 hover:bg-surface-2 hover:text-text-2',
                    )}
                  >
                    <span className="truncate">{line.name}</span>
                    {typeof line.count === 'number' && (
                      <span className="t-readout ml-auto shrink-0 pl-2 text-[10px] text-text-3">{line.count}</span>
                    )}
                  </div>
                );
              })}
          </Fragment>
        );
      })}
    </div>
  );
}
