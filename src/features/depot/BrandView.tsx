import { useMemo, useState } from 'react';
import { Empty, TreeRow } from '@/components/ui';
import { RowList } from './RowList';
import type { DepotRowActions } from './RowList';
import {
  brandSelectionKey,
  buildBrandTree,
  matchesBrandSelection,
} from './model';
import type { BrandNode, BrandSelection, DepotRow } from './model';

export interface BrandViewProps {
  rows: DepotRow[];
  selection: BrandSelection;
  onSelectionChange: (selection: BrandSelection) => void;
  actions: DepotRowActions;
  selectedIds: readonly string[];
  onSelectRow: (row: DepotRow) => void;
}

/** 品牌视图：左树 品牌 → 产品线 → 漆类（件数徽标），右侧按系列分组的行式色卡（spec 3.3:388） */
export function BrandView({
  rows,
  selection,
  onSelectionChange,
  actions,
  selectedIds,
  onSelectRow,
}: BrandViewProps) {
  const tree = useMemo(() => buildBrandTree(rows), [rows]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = rows.filter((row) => matchesBrandSelection(row, selection));
  const activeKey = brandSelectionKey(selection);

  const renderNode = (node: BrandNode, depth: 1 | 2 | 3) => {
    const hasChildren = node.children.length > 0;
    const expanded = !collapsed.has(node.key);
    return (
      <div key={node.key} data-brand-node={node.key}>
        <TreeRow
          depth={depth}
          label={node.label}
          count={node.count}
          selected={activeKey === brandSelectionKey(node.selection)}
          hasChildren={hasChildren}
          expanded={expanded}
          onSelect={() => onSelectionChange(node.selection)}
          onToggle={() => toggle(node.key)}
        />
        {hasChildren && expanded
          ? node.children.map((child) => renderNode(child, (depth + 1) as 1 | 2 | 3))
          : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        role="tree"
        aria-label="品牌树"
        className="w-56 shrink-0 overflow-y-auto border-r border-line bg-bg-0"
      >
        <div className="flex h-8 items-center justify-between border-b border-line px-2">
          <span className="t-label">品牌 · 产品线</span>
          <button
            type="button"
            onClick={() => onSelectionChange({ kind: 'all' })}
            className="t-label transition-colors duration-hover hover:text-text-1"
          >
            全部
          </button>
        </div>
        <TreeRow
          depth={1}
          label="全部库存"
          count={rows.length}
          selected={selection.kind === 'all'}
          onSelect={() => onSelectionChange({ kind: 'all' })}
        />
        {tree.map((node) => renderNode(node, 1))}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <RowList
          rows={filtered}
          grouped
          actions={actions}
          selectedIds={selectedIds}
          onSelect={onSelectRow}
          empty={
            <Empty
              title="无匹配条目"
              description="当前品牌 / 产品线筛选下没有库存条目，切换左侧节点或清空搜索。"
              className="border-0"
            />
          }
        />
      </div>
    </div>
  );
}
