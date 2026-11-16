import type { StateCreator } from 'zustand';
import type { Command } from '@/core/model/types';
import { getStore } from '@/data/db';
import { hydrateHistory, redo as redoCommand, snapshotHistory, undo as undoCommand } from '@/data/repos/history';
import type { Result } from '@/data/repos/patch';
import type { AppState } from '../index';
import { notifyError } from './ui';

export interface HistorySlice {
  undoCount: number;
  redoCount: number;
  undoLabel: string | null;
  redoLabel: string | null;
  undoDepth: number;
  canUndo: boolean;
  canRedo: boolean;
  hydrateHistoryState: () => Promise<void>;
  refreshHistory: () => void;
  /** 撤销/反撤销后统一重读所有读模型（库存 / 瓶 / 工位 / 历史计数） */
  refreshAllReadModels: () => Promise<void>;
  undo: () => Promise<Result<Command>>;
  redo: () => Promise<Result<Command>>;
}

function frame(depth: number) {
  return { undoDepth: depth, canUndo: false, canRedo: false };
}

export const createHistorySlice: StateCreator<AppState, [], [], HistorySlice> = (set, get) => ({
  undoCount: 0,
  redoCount: 0,
  undoLabel: null,
  redoLabel: null,
  undoDepth: 3,
  canUndo: false,
  canRedo: false,

  refreshHistory() {
    const snapshot = snapshotHistory();
    set({
      undoCount: snapshot.undoCount,
      redoCount: snapshot.redoCount,
      undoLabel: snapshot.undoLabel,
      redoLabel: snapshot.redoLabel,
      undoDepth: snapshot.depth,
      canUndo: snapshot.undoCount > 0,
      canRedo: snapshot.redoCount > 0,
    });
  },

  async refreshAllReadModels() {
    get().refreshHistory();
    await get().refreshInventory();
    await get().refreshBottles();
    await get().refreshStations();
    get().refreshHistory();
  },

  async hydrateHistoryState() {
    try {
      const result = await hydrateHistory(getStore());
      if (result.ok) {
        set({
          undoCount: result.data.undoCount,
          redoCount: result.data.redoCount,
          undoLabel: result.data.undoLabel,
          redoLabel: result.data.redoLabel,
          undoDepth: result.data.depth,
          canUndo: result.data.undoCount > 0,
          canRedo: result.data.redoCount > 0,
        });
        return;
      }
    } catch {
      /* 无持久化环境：保持空栈 */
    }
    set(frame(3));
  },

  async undo() {
    const result = await undoCommand(getStore());
    if (!result.ok) {
      notifyError(get, result.code === 'invariant' ? result.error : '无法撤销：' + result.error);
      await get().refreshAllReadModels();
      return result;
    }
    await get().refreshAllReadModels();
    get().pushToast({
      message: '已撤销：' + result.data.label,
      tone: 'neutral',
      actionLabel: '反撤销',
      onAction: () => {
        void get().redo();
      },
    });
    return result;
  },

  async redo() {
    const result = await redoCommand(getStore());
    if (!result.ok) {
      notifyError(get, '无法反撤销：' + result.error);
      await get().refreshAllReadModels();
      return result;
    }
    await get().refreshAllReadModels();
    get().pushToast({ message: '已反撤销：' + result.data.label, tone: 'neutral' });
    return result;
  },
});
