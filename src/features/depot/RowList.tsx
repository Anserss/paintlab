import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Paint } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { canEnterWorkbench } from '@/core/render/batch';
import { isUndefinedColor } from '@/core/render/swatch';
import { PaintRow } from '@/components/paint';
import { cn } from '@/components/ui';
import { groupByLine } from './model';
import type { DepotRow } from './model';

export interface DepotRowActions {
  onOpen?: (row: DepotRow) => void;
  onOpenCoat?: (row: DepotRow) => void;
  onUse?: (row: DepotRow) => void;
}

interface RowItemProps {
  row: DepotRow;
  draggable: boolean;
  selected: boolean;
  actions: DepotRowActions;
  onSelect: (row: DepotRow) => void;
}

/** 单行：可拖（分组视图）或纯展示；拖起时原卡 40% 透明留位（3.10:743） */
function DepotRowItem({ row, draggable, selected, actions, onSelect }: RowItemProps) {
  // 只用指针激活：行内的 Space/Enter 保留给"详情"，键盘归组走行菜单（键盘替代路径）
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: 'row:' + row.item.id,
    data: { kind: 'item', stockItemId: row.item.id },
    disabled: !draggable,
  });

  const handleOpen = (paint: Paint) => {
    if (paint.id !== row.paint.id) return;
    actions.onOpen?.(row);
  };

  return (
    <div
      ref={draggable ? setNodeRef : undefined}
      onPointerDown={
        draggable && listeners?.onPointerDown
          ? (event) => {
              (listeners.onPointerDown as (e: typeof event) => void)(event);
            }
          : undefined
      }
      data-depot-row={row.item.id}
      className={cn('min-w-0', isDragging && 'opacity-40')}
    >
      <PaintRow
        paint={row.paint}
        line={row.line}
        brand={row.brand}
        stock={{ volumeMl: row.item.volumeMl, initialMl: row.item.initialMl }}
        selected={selected}
        swatchAlpha={row.displayAlpha}
        swatchUndefined={isUndefinedColor(row.item.customHex ?? row.paint.hex, row.item.customAlpha)}
        dilutionRatioN={row.dilutionRatioN}
        hideCode={row.mixedProduct}
        onSelect={() => onSelect(row)}
        onDetail={() => actions.onOpen?.(row)}
        actions={{
          onOpen: handleOpen,
          // 2.1：原浆只能在仓库与调漆台之间流转，行上不提供「开涂」
          ...(canEnterWorkbench(row.item.state) ? { onOpenCoat: () => actions.onOpenCoat?.(row) } : {}),
          onUse: () => actions.onUse?.(row),
        }}
      />
    </div>
  );
}

export interface RowListProps {
  rows: DepotRow[];
  actions: DepotRowActions;
  selectedIds: readonly string[];
  onSelect: (row: DepotRow) => void;
  /** 品牌视图：按系列分组显示（spec 3.3:388） */
  grouped?: boolean;
  draggable?: boolean;
  empty?: ReactNode;
  className?: string;
}

/** 行式色卡列表：品牌视图按系列分组，其余视图平铺 */
export function RowList({
  rows,
  actions,
  selectedIds,
  onSelect,
  grouped = false,
  draggable = false,
  empty,
  className,
}: RowListProps) {
  if (rows.length === 0) return <>{empty ?? null}</>;

  const sections = grouped
    ? groupByLine(rows).map((group) => ({ key: group.key, heading: group.heading, meta: group.rows.length + ' 件 · ' + formatMl(group.totalMl) + ' ml', rows: group.rows }))
    : [{ key: 'flat', heading: null as string | null, meta: null as string | null, rows }];

  return (
    <div data-depot-list="" className={cn('ef-in-power min-w-0 divide-y divide-line', className)}>
      {sections.map((section) => (
        <section key={section.key} className="min-w-0">
          {section.heading && (
            <header
              data-line-heading={section.key}
              className="flex h-7 items-center justify-between border-b border-line bg-bg-1 px-2"
            >
              <span className="t-label truncate">{section.heading}</span>
              <span className="t-readout shrink-0 pl-2 text-[10px] text-text-3">{section.meta}</span>
            </header>
          )}
          {section.rows.map((row) => (
            <DepotRowItem
              key={row.item.id}
              row={row}
              draggable={draggable}
              selected={selectedIds.includes(row.item.id)}
              actions={actions}
              onSelect={onSelect}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
