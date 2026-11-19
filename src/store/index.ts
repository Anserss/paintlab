import { create } from 'zustand';
import type { CatalogSlice } from './slices/catalog';
import { createCatalogSlice } from './slices/catalog';
import type { HistorySlice } from './slices/history';
import { createHistorySlice } from './slices/history';
import type { InventorySlice } from './slices/inventory';
import { createInventorySlice } from './slices/inventory';
import type { MixSlice } from './slices/mix';
import { createMixSlice } from './slices/mix';
import type { SettingsSlice } from './slices/settings';
import { createSettingsSlice } from './slices/settings';
import type { WorkbenchSlice } from './slices/workbench';
import { createWorkbenchSlice } from './slices/workbench';
import type { UiSlice } from './slices/ui';
import { createUiSlice } from './slices/ui';

export type AppState = UiSlice & SettingsSlice & CatalogSlice & InventorySlice & MixSlice & WorkbenchSlice & HistorySlice;

/**
 * 唯一全局 store（features -> store -> data -> core）。
 * 所有写操作都经 data 层补丁 + Command，store 只负责读模型与回执。
 */
export const useAppStore = create<AppState>()((...args) => ({
  ...createUiSlice(...args),
  ...createSettingsSlice(...args),
  ...createCatalogSlice(...args),
  ...createInventorySlice(...args),
  ...createMixSlice(...args),
  ...createWorkbenchSlice(...args),
  ...createHistorySlice(...args),
}));

let hydrationStarted = false;

/** 启动引导：设置 -> 历史栈（AC-14）-> 用户数据 -> 目录索引 */
export async function hydrateApp(): Promise<void> {
  if (hydrationStarted) return;
  hydrationStarted = true;
  const state = useAppStore.getState();
  try {
    await state.hydrateSettings();
    await state.hydrateHistoryState();
    // 2.2：2.1.x 留在调漆台的旧批次先静默入库，再清掉历史遗留的 0 ml 条目
    await state.migrateLegacyBottles();
    await state.purgeEmptyStockItems();
    await state.refreshInventory();
    await state.hydrateBottles();
    await state.hydrateWorkbenches();
  } catch {
    /* 无持久化环境：保持默认态 */
  }
  try {
    await state.loadCatalog();
  } catch {
    /* 目录不可用时保持空列表 */
  }
  /**
   * 一旦本工作区已有库存或工作台，各页面都需要解析 paintId → Paint/Line/Brand
   * （仓库行、工作台磁贴、调漆）。品牌包只有 4 个静态 JSON，这里统一预热，
   * 避免每个页面各自实现「按需补包」而漏掉一条路径。
   */
  try {
    const ready = useAppStore.getState();
    if (ready.stockItems.length > 0 || ready.workbenches.length > 0) {
      await Promise.all(ready.brands.map((brand) => ready.ensureBrand(brand.id)));
    }
  } catch {
    /* 目录包不可用时页面自行降级 */
  }
}

export function resetHydration(): void {
  hydrationStarted = false;
}

export type { UiSlice, SettingsSlice, CatalogSlice, InventorySlice, MixSlice, WorkbenchSlice, HistorySlice };
export type { Toast, ToastTone } from './slices/ui';
export type { BrandLoadState } from './slices/catalog';
export { notifyError, notifyUndoable, isSelected, MAX_TOASTS } from './slices/ui';
export { applyAppearance, resolveTheme } from './slices/settings';
