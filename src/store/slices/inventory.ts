import type { StateCreator } from 'zustand';
import type { Command, Group, StockItem } from '@/core/model/types';
import type { GroupNode } from '@/core/rules/groups';
import { getStore } from '@/data/db';
import {
  createGroup as createGroupRepo,
  deleteGroup as deleteGroupRepo,
  ensureSystemGroup,
  groupTree,
  listGroups,
  moveGroup as moveGroupRepo,
  renameGroup as renameGroupRepo,
  reorderGroups as reorderGroupsRepo,
} from '@/data/repos/group';
import type {
  CreateGroupInput,
  DeleteGroupInput,
  MoveGroupInput,
  RenameGroupInput,
  ReorderGroupsInput,
} from '@/data/repos/group';
import type { Result } from '@/data/repos/patch';
import {
  adjustStockVolume,
  aggregateStockByPaint,
  createStockItem,
  deleteStockItem,
  listStockItems,
  moveStockToGroup,
  stockTotalMl,
} from '@/data/repos/stock';
import type {
  AdjustVolumeInput,
  CreateStockInput,
  PaintStockAggregate,
  StockWriteResult,
} from '@/data/repos/stock';
import type { AppState } from '../index';
import { notifyError, notifyUndoable } from './ui';

export interface InventorySlice {
  stockItems: StockItem[];
  groups: Group[];
  tree: GroupNode[];
  stockAggregate: Record<string, PaintStockAggregate>;
  stockTotalMl: number;
  inventoryReady: boolean;
  hydrateInventory: () => Promise<void>;
  refreshInventory: () => Promise<void>;
  purchase: (input: CreateStockInput) => Promise<Result<StockWriteResult>>;
  adjustVolume: (input: AdjustVolumeInput) => Promise<Result<StockWriteResult>>;
  removeStockItem: (itemId: string) => Promise<Result<StockWriteResult>>;
  moveSelectedToGroup: (groupId: string | null) => Promise<Result<StockWriteResult | { command: Command; message: string }>>;
  createGroup: (input: CreateGroupInput) => Promise<Result<{ command: Command; group: Group }>>;
  renameGroup: (input: RenameGroupInput) => Promise<Result<{ command: Command; group: Group }>>;
  removeGroup: (input: DeleteGroupInput) => Promise<Result<{ command: Command; removed: string[] }>>;
  relocateGroup: (input: MoveGroupInput) => Promise<Result<{ command: Command }>>;
  /** 分组拖拽排序：orderedIds 按目标顺序把 sort 写成 0..n-1（一次事务、一个 Command） */
  reorderGroups: (input: ReorderGroupsInput) => Promise<Result<{ command: Command }>>;
}

export const createInventorySlice: StateCreator<AppState, [], [], InventorySlice> = (set, get) => ({
  stockItems: [],
  groups: [],
  tree: [],
  stockAggregate: {},
  stockTotalMl: 0,
  inventoryReady: false,

  async refreshInventory() {
    try {
      const store = getStore();
      await ensureSystemGroup(store);
      const [items, groups] = await Promise.all([listStockItems(store), listGroups(store)]);
      set({
        stockItems: items,
        groups,
        tree: groupTree(groups, items),
        stockAggregate: aggregateStockByPaint(items),
        stockTotalMl: stockTotalMl(items),
        inventoryReady: true,
      });
    } catch {
      set({ inventoryReady: true });
    }
  },

  async hydrateInventory() {
    await get().refreshInventory();
  },

  async purchase(input) {
    const result = await createStockItem(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async adjustVolume(input) {
    const result = await adjustStockVolume(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async removeStockItem(itemId) {
    const result = await deleteStockItem(getStore(), { itemId });
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    // 删除条目会连带移除其工位引用，必须一并重读工位读模型
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async moveSelectedToGroup(groupId) {
    const result = await moveStockToGroup(getStore(), { itemIds: get().selected, groupId });
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    get().clearSelection();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async createGroup(input) {
    const result = await createGroupRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, '已新建分组「' + result.data.group.name + '」');
    return result;
  },

  async renameGroup(input) {
    const result = await renameGroupRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, '已重命名分组为「' + result.data.group.name + '」');
    return result;
  },

  async removeGroup(input) {
    const result = await deleteGroupRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, '已删除分组（' + result.data.removed.length + ' 个）');
    return result;
  },

  async reorderGroups(input) {
    const result = await reorderGroupsRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, '已调整分组顺序（' + input.orderedIds.length + ' 个）');
    return result;
  },

  async relocateGroup(input) {
    const result = await moveGroupRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshInventory();
    get().refreshHistory();
    notifyUndoable(get, '已移动分组');
    return result;
  },
});
