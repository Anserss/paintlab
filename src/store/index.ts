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
import type { StationSlice } from './slices/station';
import { createStationSlice } from './slices/station';
import type { UiSlice } from './slices/ui';
import { createUiSlice } from './slices/ui';

export type AppState = UiSlice & SettingsSlice & CatalogSlice & InventorySlice & MixSlice & StationSlice & HistorySlice;

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
  ...createStationSlice(...args),
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
    await state.refreshInventory();
    await state.hydrateBottles();
    await state.hydrateStations();
  } catch {
    /* 无持久化环境：保持默认态 */
  }
  try {
    await state.loadCatalog();
  } catch {
    /* 目录不可用时保持空列表 */
  }
}

export function resetHydration(): void {
  hydrationStarted = false;
}

export type { UiSlice, SettingsSlice, CatalogSlice, InventorySlice, MixSlice, StationSlice, HistorySlice };
export type { Toast, ToastTone } from './slices/ui';
export type { BrandLoadState } from './slices/catalog';
export { notifyError, notifyUndoable, isSelected, MAX_TOASTS } from './slices/ui';
export { applyAppearance, resolveTheme } from './slices/settings';
