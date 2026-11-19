import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { buildStockLane, stockLaneSummary } from './workbenchModel';
import type { WorkbenchStockRow } from './workbenchModel';

export interface WorkbenchStockLane {
  rows: WorkbenchStockRow[];
  /** 因为「原浆不上工作台」被拦下的条数 */
  neatBlocked: number;
}

/** 工作台侧栏读模型：仓库里可上工作台的稀释/调漆产物（2.1） */
export function useWorkbenchStockLane(workbenchId: string | null): WorkbenchStockLane {
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);
  const workbenchItems = useAppStore((state) => state.workbenchItems);

  return useMemo(() => {
    const summary = stockLaneSummary(stockItems, paintsById);
    return {
      rows: buildStockLane(stockItems, paintsById, workbenchItems, workbenchId),
      neatBlocked: summary.neatBlocked,
    };
  }, [stockItems, paintsById, workbenchItems, workbenchId]);
}
