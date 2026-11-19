import type { StateCreator } from 'zustand';
import { newId } from '@/core/history/command';
import type { LowVolumeNotice } from '@/core/rules/low-volume';
import type { AppState } from '../index';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

/** 与 src/components/ui/Toast.tsx 的 ToastItem 结构兼容（最多同时 3 条） */
export interface Toast {
  id: string;
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  /** 合并键：同一键 1.5s 内重复触发只重置时长并计数 */
  key?: string;
  count?: number;
  createdAt?: number;
}

export const MAX_TOASTS = 3;

export type SelectMode = 'single' | 'multi';

export interface UiSlice {
  toasts: Toast[];
  breadcrumb: string[] | null;
  selected: string[];
  selectMode: SelectMode;
  /** 2.2：一次扣减操作后「容量偏低」的条目；非空时 Shell 弹窗提示 */
  lowVolumeAlert: LowVolumeNotice[] | null;
  showLowVolumeAlert: (items: LowVolumeNotice[]) => void;
  dismissLowVolumeAlert: () => void;
  pushToast: (toast: Omit<Toast, 'id'> & { id?: string }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  setBreadcrumb: (crumb: string[] | null) => void;
  select: (id: string) => void;
  toggleSelect: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelection: () => void;
  setSelectMode: (mode: SelectMode) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  toasts: [],
  breadcrumb: null,
  selected: [],
  selectMode: 'single',
  lowVolumeAlert: null,

  showLowVolumeAlert(items) {
    if (items.length === 0) return;
    set({ lowVolumeAlert: items });
  },

  dismissLowVolumeAlert() {
    set({ lowVolumeAlert: null });
  },

  pushToast(toast) {
    const id = toast.id ?? newId('toast');
    const now = Date.now();
    const item: Toast = { ...toast, id, count: 1, createdAt: now };
    set((state) => {
      // 同 key 1.5s 内合并：不新增，只重置时长并显示 ×n
      if (toast.key) {
        const existing = state.toasts.find((entry) => entry.key === toast.key);
        if (existing && now - (existing.createdAt ?? 0) < 1500) {
          return {
            toasts: state.toasts.map((entry) =>
              entry.id === existing.id
                ? {
                    ...entry,
                    message: toast.message,
                    tone: toast.tone,
                    count: (entry.count ?? 1) + 1,
                    createdAt: now,
                  }
                : entry,
            ),
          };
        }
      }

      // 新的可撤销回执到来时，上一条撤销条降级为普通提示（避免撤销错的那一条）
      let toasts = toast.actionLabel
        ? state.toasts.map((entry) =>
            entry.actionLabel
              ? { ...entry, actionLabel: undefined, onAction: undefined, createdAt: now }
              : entry,
          )
        : state.toasts;

      let next = [...toasts, item];
      if (next.length > MAX_TOASTS) {
        // 溢出：先收最旧的非撤销、非错误条；都不可移除时收最旧一条
        const removable =
          next.find((entry) => !entry.actionLabel && entry.tone !== 'danger') ?? next[0];
        next = next.filter((entry) => entry.id !== removable.id);
        if (next.length > MAX_TOASTS) next = next.slice(-MAX_TOASTS);
      }
      return { toasts: next };
    });
    return id;
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  clearToasts() {
    set({ toasts: [] });
  },

  setBreadcrumb(crumb) {
    set({ breadcrumb: crumb });
  },

  select(id) {
    set({ selected: id ? [id] : [] });
  },

  toggleSelect(id) {
    set((state) => ({
      selected: state.selected.includes(id)
        ? state.selected.filter((entry) => entry !== id)
        : [...state.selected, id],
    }));
  },

  setSelected(ids) {
    set({ selected: Array.from(new Set(ids)) });
  },

  clearSelection() {
    set({ selected: [] });
  },

  setSelectMode(mode) {
    set({ selectMode: mode });
  },
});

/** 写入成功后的回执：带"撤销"动作链接（可撤销回执保留 8s） */
export function notifyUndoable(get: () => AppState, message: string): void {
  get().pushToast({
    message,
    tone: 'ok',
    actionLabel: '撤销',
    onAction: () => {
      void get().undo();
    },
  });
}

export function notifyError(get: () => AppState, message: string): void {
  get().pushToast({ message, tone: 'danger' });
}

export const isSelected = (state: AppState, id: string): boolean => state.selected.includes(id);
