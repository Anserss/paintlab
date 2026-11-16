import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { DataPanel } from './DataPanel';
import { DataScopePanel } from './DataScopePanel';
import { AboutPanel, ShortcutsPanel } from './InfoPanels';
import { SettingsItemsPanel } from './SettingsItemsPanel';

/** 设置页（/settings）：数据范围、设置项白名单、数据运维、快捷键、关于 */
export function SettingsPage() {
  const applyAppearance = useAppStore((state) => state.applyAppearance);

  useEffect(() => {
    applyAppearance();
  }, [applyAppearance]);

  return (
    <section className="mx-auto flex max-w-[1024px] flex-col gap-5 p-6" data-page="settings">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <p className="t-label">//05 SETTINGS</p>
          <h1 className="t-display text-2xl text-text-1">设置</h1>
        </div>
        <p className="max-w-[52ch] text-xs leading-snug text-text-3">
          数据范围、设置项白名单、备份与运维、快捷键与关于。设置项改动立即生效并回执，且不进撤销栈。
        </p>
      </header>
      <DataScopePanel />
      <SettingsItemsPanel />
      <DataPanel />
      <ShortcutsPanel />
      <AboutPanel />
    </section>
  );
}
