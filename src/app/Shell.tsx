import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { hydrateApp, useAppStore } from '@/store';
import { CommandBar } from './CommandBar';
import { LowVolumeDialog } from './LowVolumeDialog';
import { shutter } from './motion';
import { NAV_ITEMS } from './nav';
import { StatusBar } from './StatusBar';

/** 应用外壳（2.1）：命令栏 40 + 三色条 3 + 状态条 36 + 内容区；右下角浮动提示已删除 */
export function Shell() {
  const navigate = useNavigate();

  useEffect(() => {
    void hydrateApp();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (typing) return;

      const withMeta = event.ctrlKey || event.metaKey;
      if (withMeta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        const state = useAppStore.getState();
        if (event.shiftKey) void state.redo();
        else void state.undo();
        return;
      }

      if (!withMeta && !event.altKey) {
        const index = Number(event.key) - 1;
        if (Number.isInteger(index) && index >= 0 && index < NAV_ITEMS.length) {
          shutter(() => navigate(NAV_ITEMS[index].to));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-0 text-text-1">
      <CommandBar />
      <div className="ef-tristrip ef-in-sweep" aria-hidden="true">
        <span style={{ background: 'var(--ef-tri-a)' }} />
        <span style={{ background: 'var(--ef-tri-b)' }} />
        <span style={{ background: 'var(--ef-tri-c)' }} />
      </div>
      <StatusBar />
      <main className="ef-page-boot min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <LowVolumeDialog />
    </div>
  );
}
