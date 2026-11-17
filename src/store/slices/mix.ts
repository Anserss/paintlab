import type { StateCreator } from 'zustand';
import type { Bottle, Command, StockItem } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  blendIntoBatch as blendIntoBatchRepo,
  clearBottle as clearBottleRepo,
  createBottle as createBottleRepo,
  diluteIntoBatch as diluteIntoBatchRepo,
  listBottles,
  setBottleCapacity as setBottleCapacityRepo,
  stockInBottle as stockInBottleRepo,
  useBottle as useBottleRepo,
} from '@/data/repos/bottle';
import type {
  BlendBatchInput,
  BottleCapacityInput,
  BottleUseInput,
  CreateBottleInput,
  DiluteBatchInput,
  MixBatchPayload,
  StockInBottleInput,
} from '@/data/repos/bottle';
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
  /** 稀释（调漆台 · 稀释模式） */
  diluteBatch: (input: DiluteBatchInput) => Promise<Result<MixBatchPayload>>;
  /** 调漆（调漆台 · 调漆模式） */
  blendBatch: (input: BlendBatchInput) => Promise<Result<MixBatchPayload>>;
  useBottle: (input: BottleUseInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  clearBottle: (input: { bottleId: string }) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 改批容量（5–2500 整数；新容量 < 余量时结构化失败） */
  updateBottleCapacity: (input: BottleCapacityInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
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
    const result = await diluteIntoBatchRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    await get().refreshInventory();
    get().refreshHistory();
    get().selectBottle(result.data.bottle.id);
    notifyUndoable(get, result.data.message);
    return result;
  },

  async blendBatch(input) {
    const result = await blendIntoBatchRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    await get().refreshInventory();
    get().refreshHistory();
    get().selectBottle(result.data.bottle.id);
    notifyUndoable(get, result.data.message);
    return result;
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
