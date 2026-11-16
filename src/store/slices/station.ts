import type { StateCreator } from 'zustand';
import type { Command, Workstation, WorkstationItem } from '@/core/model/types';
import { getStore } from '@/data/db';
import {
  addToStation as addToStationRepo,
  createWorkstation as createWorkstationRepo,
  deleteWorkstation as deleteWorkstationRepo,
  listStationItems,
  listWorkstations,
  moveStationItems as moveStationItemsRepo,
  recordUsageAndReturn as recordUsageAndReturnRepo,
  removeStationItems as removeStationItemsRepo,
  setPlannedUse as setPlannedUseRepo,
  stationStats,
  updateWorkstation as updateWorkstationRepo,
} from '@/data/repos/station';
import type {
  AddToStationInput,
  CreateWorkstationInput,
  DeleteWorkstationInput,
  RenameWorkstationInput,
  ReturnToDepotInput,
  StationStats,
} from '@/data/repos/station';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError, notifyUndoable } from './ui';

export interface StationSlice {
  workstations: Workstation[];
  stationItems: WorkstationItem[];
  hydrateStations: () => Promise<void>;
  refreshStations: () => Promise<void>;
  newWorkstation: (input: CreateWorkstationInput) => Promise<Result<Workstation>>;
  editWorkstation: (input: RenameWorkstationInput) => Promise<Result<Workstation>>;
  removeWorkstation: (input: DeleteWorkstationInput) => Promise<Result<{ command: Command; removedItems: number }>>;
  addToStation: (input: AddToStationInput) => Promise<Result<{ command: Command; added: WorkstationItem[] }>>;
  changePlannedUse: (input: { itemId: string; plannedUseMl: number }) => Promise<Result<WorkstationItem>>;
  returnToDepot: (input: ReturnToDepotInput) => Promise<Result<{ command: Command; count: number; usedMl: number }>>;
  moveInStation: (input: { itemIds: string[]; targetWorkstationId: string }) => Promise<Result<{ command: Command; count: number }>>;
  removeFromStation: (itemIds: string[]) => Promise<Result<{ command: Command; count: number }>>;
  itemsOfStation: (workstationId: string) => WorkstationItem[];
  statsOfStation: (workstationId: string) => StationStats;
}

export const createStationSlice: StateCreator<AppState, [], [], StationSlice> = (set, get) => ({
  workstations: [],
  stationItems: [],

  async refreshStations() {
    try {
      const store = getStore();
      const [workstations, stationItems] = await Promise.all([listWorkstations(store), listStationItems(store)]);
      set({ workstations, stationItems });
    } catch {
      /* 无持久化环境 */
    }
  },

  async hydrateStations() {
    await get().refreshStations();
  },

  async newWorkstation(input) {
    const result = await createWorkstationRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().pushToast({ message: '已新建工位「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async editWorkstation(input) {
    const result = await updateWorkstationRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().pushToast({ message: '已更新工位「' + result.data.name + '」', tone: 'ok' });
    return result;
  },

  async removeWorkstation(input) {
    const result = await deleteWorkstationRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().refreshHistory();
    notifyUndoable(get, '工位已删除，' + result.data.removedItems + ' 件回到仓库');
    return result;
  },

  async addToStation(input) {
    const result = await addToStationRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().refreshHistory();
    get().clearSelection();
    notifyUndoable(get, '已加入工位 ×' + result.data.added.length);
    return result;
  },

  async changePlannedUse(input) {
    const result = await setPlannedUseRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    return result;
  },

  async returnToDepot(input) {
    const result = await recordUsageAndReturnRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshAllReadModels();
    notifyUndoable(get, '已记录用量并放回仓库 ×' + result.data.count);
    return result;
  },

  async moveInStation(input) {
    const result = await moveStationItemsRepo(getStore(), input);
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().refreshHistory();
    notifyUndoable(get, '已移到目标工位 ×' + result.data.count);
    return result;
  },

  async removeFromStation(itemIds) {
    const result = await removeStationItemsRepo(getStore(), { itemIds });
    if (!result.ok) {
      notifyError(get, result.error);
      return result;
    }
    await get().refreshStations();
    get().refreshHistory();
    notifyUndoable(get, '已移出工位 ×' + result.data.count);
    return result;
  },

  itemsOfStation(workstationId) {
    return get().stationItems.filter((item) => item.workstationId === workstationId);
  },

  statsOfStation(workstationId) {
    const items = get().stationItems.filter((item) => item.workstationId === workstationId);
    return stationStats(items, get().stockItems, get().bottles, get().settings.mlPerKit);
  },
});
