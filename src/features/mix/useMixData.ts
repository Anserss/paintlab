import { useEffect, useMemo, useState } from 'react';
import type { MixRecord, Paint, PaintState, StockItem } from '@/core/model/types';
import { codeOrDash } from '@/core/render/label';
import { stockLook } from '@/core/render/batch';
import { getStore } from '@/data/db';
import { useAppStore } from '@/store';

export interface StockRow {
  item: StockItem;
  paint?: Paint;
  code: string;
  name: string;
  /** 展示色（稀释漆料 = 原浆色；调漆产物 = 自定义色） */
  hex: string;
  /** 自定义透明度 / 未定色（只有调漆产物会有） */
  alpha?: number;
  undefinedColor: boolean;
  volumeMl: number;
  isAux: boolean;
  state: PaintState;
  ratioN: number;
  /** 稀释漆料：名称前「(1:N)稀释」小牌的比例（2.1） */
  dilutionRatioN: number | null;
}

/**
 * 调漆台左栏读模型：库存条目 + 目录解析结果。
 * 原浆（neat）与已稀释漆料（thinned）都要列出来 —— 后者是「稀释模式再稀释」与「调漆模式组分」的来源。
 * 2.1：稀释漆料按原浆名称与色值显示，名称前挂「(1:N)稀释」小牌。
 */
export function useStockRows(): StockRow[] {
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);

  return useMemo(() => {
    const rows = stockItems.map((item): StockRow => {
      const paint = paintsById[item.paintId];
      if (!paint) {
        return {
          item,
          code: codeOrDash(undefined),
          name: '目录未加载',
          hex: '#BFBFBF',
          undefinedColor: false,
          volumeMl: item.volumeMl,
          isAux: false,
          state: item.state,
          ratioN: item.ratioN ?? 0,
          dilutionRatioN: null,
        };
      }
      const look = stockLook(item, paint);
      const row: StockRow = {
        item,
        paint,
        code: codeOrDash(paint.code),
        name: look.name,
        hex: look.hex,
        undefinedColor: look.undefinedColor,
        volumeMl: item.volumeMl,
        isAux: paint.paintClass === 'aux',
        state: item.state,
        ratioN: item.ratioN ?? 0,
        dilutionRatioN: look.dilutionRatioN,
      };
      if (typeof look.alpha === 'number') row.alpha = look.alpha;
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

/** 最近配方：库存变化即重读（2.2 每次稀释 / 调漆都会写完库存） */
export function useMixRecords(limit = 8): MixRecord[] {
  const stockItems = useAppStore((state) => state.stockItems);
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
  }, [stockItems, limit]);

  return records;
}
