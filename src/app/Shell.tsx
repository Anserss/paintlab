import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { ToastStack } from '@/components/ui';
import { hydrateApp, useAppStore } from '@/store';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

/** 应用外壳（spec 3.1 / 4.4）：左导航 72px + 顶部状态栏 44px + 内容区 Outlet */
export function Shell() {
  const toasts = useAppStore((state) => state.toasts);
  const dismissToast = useAppStore((state) => state.dismissToast);

  useEffect(() => {
    void hydrateApp();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withMeta = event.ctrlKey || event.metaKey;
      if (!withMeta || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      const state = useAppStore.getState();
      if (event.shiftKey) void state.redo();
      else void state.undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-bg-0 text-text-1">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>
      <ToastStack items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
