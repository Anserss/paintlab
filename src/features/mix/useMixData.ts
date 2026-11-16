import { useEffect, useMemo, useState } from 'react';
import type { MixRecord, Paint, StockItem } from '@/core/model/types';
import { codeOrDash, paintTitle } from '@/core/render/label';
import { getStore } from '@/data/db';
import { useAppStore } from '@/store';

export interface NeatRow {
  item: StockItem;
  paint?: Paint;
  code: string;
  name: string;
  volumeMl: number;
  isAux: boolean;
}

/**
 * 左栏取用列表：stockItems 里 state='neat' 的条目（3.4.1）。
 * 色块 / 色号 / 中文名来自目录包；目录未加载时降级为「目录未加载」并由计算器禁止调配。
 */
export function useNeatRows(): NeatRow[] {
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);

  return useMemo(() => {
    const rows = stockItems
      .filter((item) => item.state === 'neat')
      .map((item): NeatRow => {
        const paint = paintsById[item.paintId];
        const title = paint ? paintTitle(paint) : null;
        const row: NeatRow = {
          item,
          code: codeOrDash(paint?.code),
          name: title ? title.primary : '目录未加载',
          volumeMl: item.volumeMl,
          isAux: paint?.paintClass === 'aux',
        };
        if (paint) row.paint = paint;
        return row;
      });
    return rows.sort((a, b) => Number(a.isAux) - Number(b.isAux) || a.code.localeCompare(b.code));
  }, [stockItems, paintsById]);
}

/** 稀释剂候选：paintClass='aux' 且有余量的 neat 条目（3.4.2 稀释剂来源） */
export function useThinnerRows(): NeatRow[] {
  const rows = useNeatRows();
  return useMemo(
    () => rows.filter((row) => row.paint?.paintClass === 'aux' && row.volumeMl > 0),
    [rows],
  );
}
/**
 * 最近配方（3.4.2 配方记忆）：mixRecords 未在 store 暴露选择器，且不得改 src/store，
 * 这里只读访问数据层；bottles 变化（每次调配都会 refreshBottles）即重新读取。
 */
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
