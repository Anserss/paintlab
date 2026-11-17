import { useEffect, useMemo, useState } from 'react';
import type { MixRecord, Paint, PaintState, StockItem } from '@/core/model/types';
import { codeOrDash, paintTitle } from '@/core/render/label';
import { getStore } from '@/data/db';
import { useAppStore } from '@/store';

export interface StockRow {
  item: StockItem;
  paint?: Paint;
  code: string;
  name: string;
  volumeMl: number;
  isAux: boolean;
  state: PaintState;
  ratioN: number;
}

/**
 * 调漆台左栏读模型：库存条目 + 目录解析结果。
 * 原浆（neat）与已稀释漆料（thinned）都要列出来 —— 后者是「稀释模式再稀释」与「调漆模式组分」的来源。
 */
export function useStockRows(): StockRow[] {
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);

  return useMemo(() => {
    const rows = stockItems.map((item): StockRow => {
      const paint = paintsById[item.paintId];
      const title = paint ? paintTitle(paint) : null;
      const row: StockRow = {
        item,
        code: codeOrDash(paint?.code),
        name: title ? title.primary : '目录未加载',
        volumeMl: item.volumeMl,
        isAux: paint?.paintClass === 'aux',
        state: item.state,
        ratioN: item.ratioN ?? 0,
      };
      if (paint) row.paint = paint;
      return row;
    });
    return rows.sort(
      (a, b) =>
        Number(a.isAux) - Number(b.isAux) ||
        Number(a.state === 'thinned') - Number(b.state === 'thinned') ||
        a.code.localeCompare(b.code),
    );
  }, [stockItems, paintsById]);
}

/** 调漆台取用候选：有余量、且不是辅料（稀释剂走「稀释剂来源」，不能当漆用） */
export function useMixStockRows(): StockRow[] {
  const rows = useStockRows();
  return useMemo(() => rows.filter((row) => !row.isAux && row.volumeMl > 0), [rows]);
}

/** 稀释剂候选：paintClass='aux' 且有余量 */
export function useThinnerRows(): StockRow[] {
  const rows = useStockRows();
  return useMemo(() => rows.filter((row) => row.isAux && row.volumeMl > 0), [rows]);
}

/** 最近配方：bottles 变化即重读（每次稀释 / 调漆都会刷新 bottles） */
export function useMixRecords(limit = 8): MixRecord[] {
  const bottles = useAppStore((state) => state.bottles);
  const [records, setRecords] = useState<MixRecord[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await getStore().mixRecords.toArray();
        if (!alive) return;
        setRecords(rows.slice().sort((a, b) => b.at - a.at).slice(0, limit));
      } catch {
        if (alive) setRecords([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bottles, limit]);

  return records;
}
