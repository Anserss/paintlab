import { useEffect, useState } from 'react';
import type { Group } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintOriginLine, paintTitle } from '@/core/render/label';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { PaintSwatch, StockBar } from '@/components/paint';
import { Badge, Button, cn } from '@/components/ui';
import { brandLabel, groupPath } from './model';
import type { DepotRow } from './model';
import { ledgerTimeLabel, useRecentLedger } from './useDepotData';

export interface PaintDetailProps {
  row: DepotRow | null;
  groups: Group[];
  onClose: () => void;
  onAddToStation: (row: DepotRow) => void;
  onUse: (row: DepotRow) => void;
  onAdjust: (row: DepotRow) => void;
  onDelete: (row: DepotRow) => void;
  onMoveToGroup: (row: DepotRow, groupId: string) => void;
}

/** 漆料详情抽屉（spec 3.3:407-409）：只读展示为主，色值不可编辑（AC-12） */
export function PaintDetail({
  row,
  groups,
  onClose,
  onAddToStation,
  onUse,
  onAdjust,
  onDelete,
  onMoveToGroup,
}: PaintDetailProps) {
  const [groupMenu, setGroupMenu] = useState(false);
  const ledger = useRecentLedger(row?.item.id ?? null, 10);

  useEffect(() => {
    setGroupMenu(false);
  }, [row?.item.id]);

  useEffect(() => {
    if (!row) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const title = paintTitle(row.paint);
  const desc = paintDescription(row.paint, row.line);
  const origin = paintOriginLine(brandLabel(row.brand), row.line.name);
  const currentGroup = row.item.groupId ?? UNGROUPED_ID;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="漆料详情"
      data-paint-detail=""
      className="fixed bottom-0 right-0 top-[var(--top-bar)] z-[var(--z-overlay)] flex w-[420px] max-w-[92vw] flex-col overflow-y-auto border-l border-line-strong bg-surface"
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="t-display text-xs uppercase tracking-[0.06em] text-text-1">漆料详情</span>
        <button
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
          className="h-6 w-6 border border-line text-text-3 transition-colors duration-hover hover:border-line-strong hover:text-text-1"
        >
          ×
        </button>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <div className="h-24 w-full">
          <PaintSwatch hex={row.paint.hex} paintClass={row.paint.paintClass} size="fill" />
        </div>

        <div className="flex items-baseline gap-2">
          <span className="truncate text-lg font-medium text-text-1">{title.primary}</span>
          {title.secondary && (
            <span className="truncate text-xs text-text-3" data-paint-name-secondary="">
              {title.secondary}
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="t-readout text-2xl text-text-1" data-paint-code="">
            {codeOrDash(row.paint.code)}
          </span>
          <span className="t-readout text-[11px] text-text-3">{row.line.name}</span>
        </div>

        <p data-paint-desc="" className="text-xs text-text-2">
          {desc}
        </p>

        <p className="text-xs text-text-3">{origin}</p>

        <div className="flex items-center justify-between border-y border-line py-2">
          <span className="t-label">色值（只读）</span>
          <span
            role="textbox"
            aria-readonly="true"
            aria-label="色值（只读，不可编辑）"
            data-paint-hex=""
            className="t-readout text-sm uppercase text-text-1"
          >
            {row.paint.hex.toUpperCase()}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="t-label">规格与当前库存</span>
            <span className="t-readout text-[13px] text-text-1" data-detail-volume="">
              {formatMl(row.item.volumeMl) + ' / ' + formatMl(row.item.initialMl) + ' ml'}
            </span>
          </div>
          <StockBar volumeMl={row.item.volumeMl} initialMl={row.item.initialMl} />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="t-label">归属分组</span>
            <button
              type="button"
              data-group-menu-toggle=""
              aria-expanded={groupMenu}
              onClick={() => setGroupMenu((open) => !open)}
              className="t-label transition-colors duration-hover hover:text-text-1"
            >
              {'加入分组 ⋯'}
            </button>
          </div>
          <span className="flex items-center gap-2 text-xs text-text-1" data-detail-group="">
            <Badge tone="neutral">{groupPath(groups, currentGroup)}</Badge>
          </span>
          {groupMenu && (
            <div role="menu" data-detail-group-menu="" className="border border-line-strong bg-bg-1 p-1">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="menuitem"
                  data-drawer-group={group.id}
                  aria-label={'加入分组 ' + group.name}
                  onClick={() => {
                    setGroupMenu(false);
                    onMoveToGroup(row, group.id);
                  }}
                  className={cn(
                    'block w-full px-2 py-1 text-left text-xs transition-colors duration-hover hover:bg-surface-2',
                    currentGroup === group.id ? 'text-accent' : 'text-text-2',
                  )}
                >
                  {'L' + group.depth + ' ' + group.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <span className="t-label">最近 10 条操作</span>
          {ledger.length === 0 ? (
            <span className="text-[11px] text-text-3">无操作记录</span>
          ) : (
            <ul data-detail-ledger="" className="flex flex-col gap-0.5">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-2 text-[11px] text-text-2">
                  <span className="truncate">{entry.type}</span>
                  <span className="t-readout shrink-0 text-text-3">
                    {entry.detail ? entry.detail + ' · ' : ''}
                    {ledgerTimeLabel(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap gap-2 border-t border-line p-3">
        <Button variant="secondary" size="sm" data-detail-action="station" onClick={() => onAddToStation(row)}>
          加入工位
        </Button>
        <Button variant="secondary" size="sm" data-detail-action="mix" onClick={() => onUse(row)}>
          取用调漆
        </Button>
        <Button variant="secondary" size="sm" data-detail-action="adjust" onClick={() => onAdjust(row)}>
          调整余量
        </Button>
        <Button variant="danger" size="sm" data-detail-action="delete" onClick={() => onDelete(row)}>
          删除条目
        </Button>
      </footer>
    </aside>
  );
}
