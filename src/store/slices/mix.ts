import type { StateCreator } from 'zustand';
import type { Bottle, Command, StockItem } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  archiveBottle as archiveBottleRepo,
  clearBottle as clearBottleRepo,
  createBottle as createBottleRepo,
  listBottles,
  mixBottle as mixBottleRepo,
  setBottleCapacity as setBottleCapacityRepo,
  useBottle as useBottleRepo,
} from '@/data/repos/bottle';
import type {
  ArchiveBottleInput,
  BottleCapacityInput,
  BottleUseInput,
  CreateBottleInput,
  MixBottleInput,
  MixBottlePayload,
} from '@/data/repos/bottle';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError, notifyUndoable } from './ui';

export interface MixSlice {
  bottles: Bottle[];
  hydrateBottles: () => Promise<void>;
  refreshBottles: () => Promise<void>;
  newBottle: (input: CreateBottleInput) => Promise<Result<Bottle>>;
  mixIntoBottle: (input: MixBottleInput) => Promise<Result<MixBottlePayload>>;
  useBottle: (input: BottleUseInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  clearBottle: (input: { bottleId: string }) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  /** 改瓶容量（5–250 整数；新容量 < 余量时结构化失败，spec 3.4.3） */
  updateBottleCapacity: (input: BottleCapacityInput) => Promise<Result<{ command: Command; bottle: Bottle }>>;
  archiveBottle: (input: ArchiveBottleInput) => Promise<Result<{ command: Command; item: StockItem }>>;
  getBottleById: (id: string) => Bottle | undefined;
}

export const createMixSlice: StateCreator<AppState, [], [], MixSlice> = (set, get) => ({
  bottles: [],

  async refreshBottles() {
    try {
      set({ bottles: await listBottles(getStore()) });
    } catch {
      /* 无持久化环境 */
    }
  },

  async hydrateBottles() {
    await get().refreshBottles();
  },

  async newBottle(input) {
    const result = await createBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    get().pushToast({ message: '已新建调漆瓶「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async mixIntoBottle(input) {
    const result = await mixBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshBottles();
    await get().refreshInventory();
    get().refreshHistory();
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
    notifyUndoable(get, '瓶容量已改为 ' + String(result.data.bottle.capacityMl) + ' ml');
    return result;
  },

  async archiveBottle(input) {
    const result = await archiveBottleRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, '已归档进仓库 ' + result.data.item.volumeMl.toFixed(1) + ' ml');
    return result;
  },

  getBottleById(id) {
    return get().bottles.find((bottle) => bottle.id === id);
  },
});
