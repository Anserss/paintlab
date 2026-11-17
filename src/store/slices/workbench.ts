import type { StateCreator } from 'zustand';
import type { Command, Workbench, WorkbenchItem } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  openCoat as openCoatRepo,
  createWorkbench as createWorkbenchRepo,
  deleteWorkbench as deleteWorkbenchRepo,
  listWorkbenchItems,
  listWorkbenches,
  moveWorkbenchItems as moveWorkbenchItemsRepo,
  recordUsageAndStockIn as recordUsageAndStockInRepo,
  removeWorkbenchItems as removeWorkbenchItemsRepo,
  setPlannedUse as setPlannedUseRepo,
  workbenchStats,
  updateWorkbench as updateWorkbenchRepo,
} from '@/data/repos/workbench';
import type {
  OpenCoatInput,
  CreateWorkbenchInput,
  DeleteWorkbenchInput,
  RenameWorkbenchInput,
  StockInInput,
  WorkbenchStats,
} from '@/data/repos/workbench';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError, notifyUndoable } from './ui';

export interface WorkbenchSlice {
  workbenches: Workbench[];
  workbenchItems: WorkbenchItem[];
  hydrateWorkbenches: () => Promise<void>;
  refreshWorkbenches: () => Promise<void>;
  newWorkbench: (input: CreateWorkbenchInput) => Promise<Result<Workbench>>;
  editWorkbench: (input: RenameWorkbenchInput) => Promise<Result<Workbench>>;
  removeWorkbench: (input: DeleteWorkbenchInput) => Promise<Result<{ command: Command; removedItems: number }>>;
  openCoat: (input: OpenCoatInput) => Promise<Result<{ command: Command; added: WorkbenchItem[] }>>;
  changePlannedUse: (input: { itemId: string; plannedUseMl: number }) => Promise<Result<WorkbenchItem>>;
  stockIn: (input: StockInInput) => Promise<Result<{ command: Command; count: number; usedMl: number }>>;
  moveInWorkbench: (input: { itemIds: string[]; targetWorkbenchId: string }) => Promise<Result<{ command: Command; count: number }>>;
  removeFromWorkbench: (itemIds: string[]) => Promise<Result<{ command: Command; count: number }>>;
  itemsOfWorkbench: (workbenchId: string) => WorkbenchItem[];
  statsOfWorkbench: (workbenchId: string) => WorkbenchStats;
}

export const createWorkbenchSlice: StateCreator<AppState, [], [], WorkbenchSlice> = (set, get) => ({
  workbenches: [],
  workbenchItems: [],

  async refreshWorkbenches() {
    try {
      const store = getStore();
      const [workbenches, workbenchItems] = await Promise.all([listWorkbenches(store), listWorkbenchItems(store)]);
      set({ workbenches, workbenchItems });
    } catch {
      /* 无持久化环境 */
    }
  },

  async hydrateWorkbenches() {
    await get().refreshWorkbenches();
  },

  async newWorkbench(input) {
    const result = await createWorkbenchRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().pushToast({ message: '已新建工作台「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async editWorkbench(input) {
    const result = await updateWorkbenchRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().pushToast({ message: '已更新工作台「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async removeWorkbench(input) {
    const result = await deleteWorkbenchRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().refreshHistory();
    notifyUndoable(get, '工作台已删除，' + result.data.removedItems + ' 件回到仓库');
    return result;
  },

  async openCoat(input) {
    const result = await openCoatRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().refreshHistory();
    get().clearSelection();
    notifyUndoable(get, '已开涂 ×' + result.data.added.length);
    return result;
  },

  async changePlannedUse(input) {
    const result = await setPlannedUseRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    return result;
  },

  async stockIn(input) {
    const result = await recordUsageAndStockInRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, '已记录用量并入库 ×' + result.data.count);
    return result;
  },

  async moveInWorkbench(input) {
    const result = await moveWorkbenchItemsRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().refreshHistory();
    notifyUndoable(get, '已移到目标工作台 ×' + result.data.count);
    return result;
  },

  async removeFromWorkbench(itemIds) {
    const result = await removeWorkbenchItemsRepo(getStore(), { itemIds });
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshWorkbenches();
    get().refreshHistory();
    notifyUndoable(get, '已移出工作台 ×' + result.data.count);
    return result;
  },

  itemsOfWorkbench(workbenchId) {
    return get().workbenchItems.filter((item) => item.workbenchId === workbenchId);
  },

  statsOfWorkbench(workbenchId) {
    const items = get().workbenchItems.filter((item) => item.workbenchId === workbenchId);
    return workbenchStats(items, get().stockItems, get().bottles, get().settings.mlPerKit);
  },
});
