import type { StateCreator } from 'zustand';
import type { Bottle, Command, StockItem } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  clearBottle as clearBottleRepo,
  createBottle as createBottleRepo,
  listBottles,
  renameBottle as renameBottleRepo,
  setBottleCapacity as setBottleCapacityRepo,
  setBottleColor as setBottleColorRepo,
  stockInBottle as stockInBottleRepo,
  useBottle as useBottleRepo,
} from '@/data/repos/bottle';
import type {
  BottleCapacityInput,
  BottleColorInput,
  BottleUseInput,
  CreateBottleInput,
  RenameBottleInput,
  StockInBottleInput,
} from '@/data/repos/bottle';
import {
  blendAndStockIn as blendAndStockInRepo,
  diluteAndStockIn as diluteAndStockInRepo,
  migrateLegacyBottles as migrateLegacyBottlesRepo,
} from '@/data/repos/mix';
import type { BlendStockInput, DiluteStockInput, MixStockPayload } from '@/data/repos/mix';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError, notifyUndoable } from './ui';

export interface MixSlice {
  bottles: Bottle[];
  /** 调漆台当前选中的批次 */
  activeBottleId: string | null;
  hydrateBottles: () => Promise<void>;
  refreshBottles: () => Promise<void>;
  selectBottle: (bottleId: string | null) => void;
  newBottle: (input: CreateBottleInput) => Promise<Result<Bottle>>;
  /** 2.2 稀释（调漆台 · 稀释模式）：扣库存 + 产物自动入库（同配方合并） */
  diluteBatch: (input: DiluteStockInput) => Promise<Result<MixStockPayload>>;
  /** 2.2 调漆（调漆台 · 调漆模式）：扣库存 + 产物自动入库（同配方合并） */
  blendBatch: (input: BlendStockInput) => Promise<Result<MixStockPayload>>;
  /** 2.2 升级迁移：2.1.x 遗留的调漆台批次静默入库（不产生撤销步骤） */
  migrateLegacyBottles: () => Promise<{ migrated: number; removed: number }>;
  useBottle: (input: BottleUseInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  clearBottle: (input: { bottleId: string }) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 改批容量（5–2500 整数；新容量 < 余量时结构化失败） */
  updateBottleCapacity: (input: BottleCapacityInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 重命名批次（1–16 字，可撤销） */
  renameBottle: (input: RenameBottleInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 设置批次展示色（HEX + 透明度，可撤销） */
  recolorBottle: (input: BottleColorInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 入库：批次内容变成一条仓库库存条目 */
  stockInBottle: (input: StockInBottleInput) => Promise<Result<{ command: Command; item: StockItem }>>;
  getBottleById: (id: string) => Bottle | undefined;
}

export const createMixSlice: StateCreator<AppState, [], [], MixSlice> = (set, get) => ({
  bottles: [],
  activeBottleId: null,

  async refreshBottles() {
    try {
      const bottles = await listBottles(getStore());
      const current = get().activeBottleId;
      const active = current && bottles.some((bottle) => bottle.id === current) ? current : (bottles[0]?.id ?? null);
      set({ bottles, activeBottleId: active });
    } catch {
      /* 无持久化环境 */
    }
  },

  async hydrateBottles() {
    await get().refreshBottles();
  },

  selectBottle(bottleId) {
    set({ activeBottleId: bottleId });
  },

  async newBottle(input) {
    const result = await createBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().selectBottle(result.data.id);
    get().pushToast({ message: '已新建批次「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async diluteBatch(input) {
    const result = await diluteAndStockInRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    if (result.data.lowVolume.length > 0) get().showLowVolumeAlert(result.data.lowVolume);
    return result;
  },

  async blendBatch(input) {
    const result = await blendAndStockInRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, result.data.message);
    if (result.data.lowVolume.length > 0) get().showLowVolumeAlert(result.data.lowVolume);
    return result;
  },

  async migrateLegacyBottles() {
    try {
      const result = await migrateLegacyBottlesRepo(getStore());
      if (result.migrated > 0 || result.removed > 0) {
        await get().refreshAllReadModels();
      }
      return result;
    } catch {
      return { migrated: 0, removed: 0 };
    }
  },

  async useBottle(input) {
    const result = await useBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().refreshHistory();
    notifyUndoable(get, '已使用 ' + input.amountMl.toFixed(1) + ' ml');
    return result;
  },

  async clearBottle(input) {
    const result = await clearBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().refreshHistory();
    notifyUndoable(get, '已清空「' + result.data.bottle.name + '」');
    return result;
  },

  async updateBottleCapacity(input) {
    const result = await setBottleCapacityRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().refreshHistory();
    notifyUndoable(get, '容量已改为 ' + String(result.data.bottle.capacityMl) + ' ml');
    return result;
  },

  async renameBottle(input) {
    const result = await renameBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().refreshHistory();
    notifyUndoable(get, '已重命名为「' + result.data.bottle.name + '」');
    return result;
  },

  async recolorBottle(input) {
    const result = await setBottleColorRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().refreshHistory();
    // 最近使用色（设置项，不进撤销栈）
    const recent = get().settings.recentBottleColors ?? [];
    const next = [{ hex: input.colorHex.toUpperCase(), alpha: Math.round(input.colorAlpha) }, ...recent.filter(
      (entry) => !(entry.hex.toUpperCase() === input.colorHex.toUpperCase() && entry.alpha === Math.round(input.colorAlpha)),
    )].slice(0, 12);
    void get().updateSetting('recentBottleColors', next);
    notifyUndoable(get, '已更新「' + result.data.bottle.name + '」的颜色');
    return result;
  },

  async stockInBottle(input) {
    const result = await stockInBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, '已入库 ' + result.data.item.volumeMl.toFixed(1) + ' ml');
    return result;
  },

  getBottleById(id) {
    return get().bottles.find((bottle) => bottle.id === id);
  },
});
