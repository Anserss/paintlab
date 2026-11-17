import type { StateCreator } from 'zustand';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import type { Settings } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  estimateStorage as estimateStorageRepo,
  exportAll as exportAllRepo,
  importAll as importAllRepo,
  readSettings,
  resetAll as resetAllRepo,
  writeSetting,
} from '@/data/repos/settings';
import type { ImportCounts, ImportMode, PigmentExport, StorageEstimate } from '@/data/repos/settings';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError } from './ui';

export function resolveTheme(settings: Settings): 'dark' | 'light' {
  if (settings.theme !== 'auto') return settings.theme;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

/** theme / density 写到 documentElement（light 令牌已存在） */
export function applyAppearance(settings: Settings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings);
  root.dataset.density = settings.density;
}

export interface SettingsSlice {
  settings: Settings;
  settingsReady: boolean;
  hydrateSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<Result<Settings>>;
  applyAppearance: () => void;
  exportAll: () => Promise<Result<PigmentExport>>;
  importAll: (raw: unknown, mode: ImportMode) => Promise<Result<ImportCounts>>;
  resetAll: () => Promise<Result<true>>;
  storageEstimate: () => Promise<StorageEstimate>;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  settingsReady: false,

  async hydrateSettings() {
    try {
      const settings = await readSettings(getStore());
      set({ settings, settingsReady: true });
      applyAppearance(settings);
    } catch {
      set({ settings: { ...DEFAULT_SETTINGS }, settingsReady: true });
      applyAppearance(DEFAULT_SETTINGS);
    }
  },

  async updateSetting(key, value) {
    const result = await writeSetting(getStore(), key, value);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    set({ settings: result.data });
    applyAppearance(result.data);
    return result;
  },

  applyAppearance() {
    applyAppearance(get().settings);
  },

  async exportAll() {
    const result = await exportAllRepo(getStore());
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    get().pushToast({ message: '已导出全部数据', tone: 'ok' });
    return result;
  },

  async importAll(raw, mode) {
    const result = await importAllRepo(getStore(), raw, mode);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().hydrateSettings();
    await get().hydrateHistoryState();
    await get().refreshInventory();
    await get().refreshBottles();
    await get().refreshWorkbenches();
    get().pushToast({
      message:
        '已导入：新增 ' + result.data.added + ' · 更新 ' + result.data.updated + ' · 跳过 ' + result.data.skipped,
      tone: 'ok',
    });
    return result;
  },

  async resetAll() {
    const result = await resetAllRepo(getStore());
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().hydrateSettings();
    await get().hydrateHistoryState();
    await get().refreshInventory();
    await get().refreshBottles();
    await get().refreshWorkbenches();
    get().pushToast({ message: '已重置全部数据', tone: 'warn' });
    return result;
  },

  async storageEstimate() {
    return estimateStorageRepo(getStore());
  },
});
