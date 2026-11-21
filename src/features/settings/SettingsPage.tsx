import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { DataPanel } from './DataPanel';
import { AboutPanel, ShortcutsPanel } from './InfoPanels';
import { SettingsItemsPanel } from './SettingsItemsPanel';

/**
 * 设置页（/settings）：设置项白名单、数据运维、快捷键、关于。
 * 「数据范围与字段级权限」不再占用设置页，改为随应用包发布的说明文档
 * （`docs/数据范围与字段级权限.md` / `.html`，见关于面板的入口）。
 */
export function SettingsPage() {
  const applyAppearance = useAppStore((state) => state.applyAppearance);

  useEffect(() => {
    applyAppearance();
  }, [applyAppearance]);

  return (
    <section className="mx-auto flex min-h-full w-full max-w-[1024px] flex-col gap-5 p-6" data-page="settings">
      <header className="ef-page-head">
        <div>
          <p className="ef-eyebrow">// SETTINGS</p>
          <h1 className="ef-title">设置</h1>
        </div>
        <p className="max-w-[52ch] text-[12px] leading-relaxed text-text-2">
          设置项白名单、备份与运维、快捷键与关于。设置项改动立即生效并回执，且不进撤销栈。
        </p>
      </header>
      <SettingsItemsPanel />
      <DataPanel />
      <ShortcutsPanel />
      <AboutPanel />
    </section>
  );
}
