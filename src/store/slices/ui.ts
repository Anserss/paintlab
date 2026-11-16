import type { StateCreator } from 'zustand';
import { newId } from '@/core/history/command';
import type { AppState } from '../index';

export type ToastTone = 'neutral' | 'ok' | 'warn' | 'danger';

/** 与 src/components/ui/Toast.tsx 的 ToastItem 结构兼容（最多同时 3 条） */
export interface Toast {
  id: string;
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

export const MAX_TOASTS = 3;

export type SelectMode = 'single' | 'multi';

export interface UiSlice {
  toasts: Toast[];
  breadcrumb: string[] | null;
  selected: string[];
  selectMode: SelectMode;
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

  pushToast(toast) {
    const id = toast.id ?? newId('toast');
    const item: Toast = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, item].slice(-MAX_TOASTS) }));
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

/** 写入成功后的回执：带"撤销"动作链接（spec 3.1 / 3.6） */
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
