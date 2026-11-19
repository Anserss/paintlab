import { useEffect, useState } from 'react';
import type { Group } from '@/core/model/types';
import { formatMl, formatRatio } from '@/core/math/quantity';
import { codeOrDash, paintDescription, paintOriginLine, paintTitle } from '@/core/render/label';
import { canEnterWorkbench, WORKBENCH_NEAT_BLOCK } from '@/core/render/batch';
import { UNGROUPED_ID } from '@/core/rules/groups';
import { isLowVolume } from '@/core/rules/low-volume';
import { DilutionTag, LowVolumeTag, PaintSwatch, StockBar } from '@/components/paint';
import { Badge, Button, cn } from '@/components/ui';
import { brandLabel, groupPath } from './model';
import type { DepotRow } from './model';
import { ledgerTimeLabel, useRecentLedger } from './useDepotData';

export interface PaintDetailProps {
  row: DepotRow | null;
  groups: Group[];
  onClose: () => void;
  onOpenCoat: (row: DepotRow) => void;
  onUse: (row: DepotRow) => void;
  onAdjust: (row: DepotRow) => void;
  onRename: (row: DepotRow) => void;
  onDelete: (row: DepotRow) => void;
  onMoveToGroup: (row: DepotRow, groupId: string) => void;
}

/** 漆料详情抽屉（spec 3.3:407-409）：只读展示为主，色值不可编辑（AC-12） */
export function PaintDetail({
  row,
  groups,
  onClose,
  onOpenCoat,
  onUse,
  onAdjust,
  onRename,
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
      className="fixed bottom-0 right-0 z-[var(--ef-z-drawer)] flex w-[420px] max-w-[92vw] flex-col overflow-y-auto border-l bg-surface"
      style={{
        top: 'calc(var(--ef-cmd-h) + 3px + var(--ef-status-h))',
        borderColor: 'var(--ef-ink)',
      }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b px-4"
        style={{ height: 56, borderColor: 'var(--ef-rule)' }}
      >
        <span className="text-[15px] font-bold">漆料详情</span>
        <button
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center border text-text-2 hover:border-text-1 hover:text-text-1"
          style={{ borderColor: 'var(--ef-rule)' }}
        >
          ×
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="h-24 w-full">
          <PaintSwatch
            hex={row.item.customHex ?? row.paint.hex}
            paintClass={row.paint.paintClass}
            size="fill"
            alpha={row.displayAlpha}
            undefinedColor={row.item.customHex === '#FFFFFF' && row.item.customAlpha === 70}
          />
        </div>

        <div className="flex items-center gap-2">
          {isLowVolume(row.item.volumeMl, row.item.initialMl) && <LowVolumeTag />}
          {row.dilutionRatioN ? <DilutionTag ratioN={row.dilutionRatioN} /> : null}
          <span className="truncate text-[22px] font-bold text-text-1">{title.primary}</span>
          {title.secondary && (
            <span className="truncate text-[13px] text-text-2" data-paint-name-secondary="">
              {title.secondary}
            </span>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="ef-field text-[28px] font-bold text-text-1" data-paint-code="">
            {codeOrDash(row.paint.code)}
          </span>
          <span className="ef-field text-[11px] text-text-2">{row.line.name}</span>
        </div>

        {row.dilutionRatioN ? (
          <p className="ef-field text-[11px] text-text-2" data-dilution-note="">
            {'稀释漆料 · ' + formatRatio(row.dilutionRatioN) + ' 稀释（名称与色值沿用原浆 ' + codeOrDash(row.paint.code) + '）'}
          </p>
        ) : row.customMixed ? (
          <p className="ef-field text-[11px] text-text-2" data-custom-mixed="">
            {'调漆产物 · 配方：' + (row.item.mixLabel ?? '未记录') + '（原漆 ' + codeOrDash(row.paint.code) + '）'}
          </p>
        ) : null}

        <p data-paint-desc="" className="text-[13px] text-text-2">
          {desc}
        </p>

        <p className="text-[12px] text-text-2">{origin}</p>

        <div className="flex flex-col gap-1 border-y py-3" style={{ borderColor: 'var(--ef-rule)' }}>
          <div className="flex items-center justify-between">
            <span className="ef-eyebrow">色值（只读）</span>
            <span
              role="textbox"
              aria-readonly="true"
              aria-label="色值（只读，不可编辑）"
              data-paint-hex=""
              className="ef-field text-[15px] uppercase text-text-1"
            >
              {row.paint.hexEstimated ? '≈ ' : ''}
              {(row.item.customHex ?? row.paint.hex).toUpperCase()}
              {typeof row.item.customAlpha === 'number' ? ' · ' + row.item.customAlpha + '%' : ''}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-text-2">
            {row.paint.hexEstimated
              ? '该色值按色名推定（未取到厂商官方色卡），仅用于近似辨识；核验后可在目录种子中回填。'
              : '色值来自目录（厂商色卡或既有核验记录）。'}
          </p>
          {row.paint.source && (
            <p data-paint-source="" className="text-[11px] leading-snug text-text-2">
              {'来源：' + row.paint.source}
            </p>
          )}
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
        <Button
          variant="secondary"
          size="sm"
          data-detail-action="workbench"
          disabled={!canEnterWorkbench(row.item.state)}
          title={canEnterWorkbench(row.item.state) ? undefined : WORKBENCH_NEAT_BLOCK}
          onClick={() => onOpenCoat(row)}
        >
          开涂
        </Button>
        <Button variant="secondary" size="sm" data-detail-action="mix" onClick={() => onUse(row)}>
          调漆
        </Button>
        {row.customMixed && row.dilutionRatioN === undefined && (
          <Button variant="secondary" size="sm" data-detail-action="rename" onClick={() => onRename(row)}>
            改名
          </Button>
        )}
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
