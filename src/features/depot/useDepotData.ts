import { useEffect, useMemo, useState } from 'react';
import type { Group, LedgerEntry } from '@/core/model/types';
import type { GroupNode } from '@/core/rules/groups';
import { getStore } from '@/data/db';
import { ADJUST_REASON_LABELS, ADJUST_REASONS } from '@/data/repos/stock';
import type { AdjustReasonCode } from '@/data/repos/stock';
import { useAppStore } from '@/store';
import { buildRows } from './model';
import type { DepotRow } from './model';

/** 行模型：库存条目 × 目录漆料 */
export function useDepotRows(): DepotRow[] {
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);
  const linesById = useAppStore((state) => state.linesById);
  const brands = useAppStore((state) => state.brands);
  return useMemo(
    () => buildRows(stockItems, { paintsById, linesById, brands }),
    [stockItems, paintsById, linesById, brands],
  );
}

export function useDepotGroups(): { groups: Group[]; tree: GroupNode[] } {
  const groups = useAppStore((state) => state.groups);
  const tree = useAppStore((state) => state.tree);
  return { groups, tree };
}

export const ADJUST_REASON_OPTIONS: { value: AdjustReasonCode; label: string }[] = ADJUST_REASONS.map(
  (value) => ({ value, label: ADJUST_REASON_LABELS[value] }),
);

const LEDGER_TYPE_ZH: Record<LedgerEntry['type'], string> = {
  purchase: '采购',
  mix: '调漆',
  use: '调漆',
  adjust: '调整',
  group: '归组',
  workbench: '工作台',
  archive: '入库',
};

export interface LedgerRow {
  id: string;
  type: string;
  detail: string;
  at: number;
}

function ledgerDetail(entry: LedgerEntry): string {
  const parts: string[] = [];
  if (typeof entry.deltaMl === 'number' && entry.deltaMl !== 0) {
    parts.push((entry.deltaMl > 0 ? '+' : '') + entry.deltaMl.toFixed(1) + ' ml');
  }
  const meta = entry.meta ?? {};
  const reason = meta['reason'];
  if (typeof reason === 'string' && reason in ADJUST_REASON_LABELS) {
    parts.push(ADJUST_REASON_LABELS[reason as AdjustReasonCode]);
  }
  return parts.join(' · ');
}

function timeLabel(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => (value < 10 ? '0' + value : String(value));
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/**
 * 最近 10 条操作（spec 3.3:409）：ledger 未在 store 暴露选择器，
 * 且不得改 src/store，这里只读访问数据层并按 refId 过滤。
 */
export function useRecentLedger(refId: string | null | undefined, limit = 10): LedgerRow[] {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const inventoryVersion = useAppStore((state) => state.stockItems);

  useEffect(() => {
    let alive = true;
    if (!refId) {
      setRows([]);
      return () => {
        alive = false;
      };
    }
    void (async () => {
      try {
        const entries = await getStore().ledger.toArray();
        if (!alive) return;
        setRows(
          entries
            .filter((entry) => entry.refId === refId)
            .sort((a, b) => b.at - a.at)
            .slice(0, limit)
            .map((entry) => ({
              id: entry.id,
              type: LEDGER_TYPE_ZH[entry.type] ?? entry.type,
              detail: ledgerDetail(entry),
              at: entry.at,
            })),
        );
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refId, limit, inventoryVersion]);

  return rows;
}

export function ledgerTimeLabel(at: number): string {
  return timeLabel(at);
}
