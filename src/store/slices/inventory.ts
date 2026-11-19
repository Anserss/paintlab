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
  decomposeStockItem as decomposeStockItemRepo,
  deleteStockItem,
  listStockItems,
  moveStockToGroup,
  purgeEmptyStockItems,
  renameStockItem as renameStockItemRepo,
  stockTotalMl,
} from '@/data/repos/stock';
import type {
  AdjustVolumeInput,
  CreateStockInput,
  DecomposeStockInput,
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
  /** 2.2：启动时清掉历史遗留的 0 ml 条目（不写撤销栈） */
  purgeEmptyStockItems: () => Promise<number>;
  purchase: (input: CreateStockInput) => Promise<Result<StockWriteResult>>;
  adjustVolume: (input: AdjustVolumeInput) => Promise<Result<StockWriteResult>>;
  /** 2.2.1：调漆产物改名（用户自定义名称） */
  renameStockItem: (input: { itemId: string; name: string }) => Promise<Result<StockWriteResult>>;
  removeStockItem: (itemId: string) => Promise<Result<StockWriteResult>>;
  /** 分解删除（2.1.1）：稀释漆料 → 原浆 + 辅料；调漆产物 → 调漆前的组分 */
  decomposeStockItem: (input: DecomposeStockInput) => Promise<Result<{ command: Command; items: StockItem[] }>>;
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

  async purgeEmptyStockItems() {
    try {
      const result = await purgeEmptyStockItems(getStore());
      return result.removed;
    } catch {
      return 0;
    }
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
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    if (result.data.lowVolume && result.data.lowVolume.length > 0) {
      get().showLowVolumeAlert(result.data.lowVolume);
    }
    return result;
  },

  async renameStockItem(input) {
    const result = await renameStockItemRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async removeStockItem(itemId) {
    const result = await deleteStockItem(getStore(), { itemId });
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    // 删除条目会连带移除其工作台引用，必须一并重读工作台读模型
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    return result;
  },

  async decomposeStockItem(input) {
    const result = await decomposeStockItemRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, '已分解为 ' + result.data.items.length + ' 件回仓库');
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
