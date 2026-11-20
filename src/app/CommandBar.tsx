import type { MouseEvent } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { APP_VERSION, isDesktop } from '@/platform';
import { useAppStore } from '@/store';
import { revealTheme } from './motion';
import { NAV_ITEMS } from './nav';
import { useShutterNavigate } from './useShutterNavigate';

/** 命令栏（40px）：字标 + 一级导航 + 主题切换；桌面壳里兼作窗口标题栏拖拽区 */
export function CommandBar() {
  const theme = useAppStore((state) => state.settings.theme);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const desktop = isDesktop();
  const location = useLocation();
  const go = useShutterNavigate();

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const nextThemeLabel = nextTheme === 'dark' ? '切换到深色主题' : '切换到浅色主题';

  /** 一级导航走换页快门；新标签 / 下载等系统行为保持浏览器默认 */
  const handleNav = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (to === location.pathname) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    go(to);
  };

  /** 深浅切换：从按钮处扩散一个圆揭开新主题（不支持 / 减少动效时直接切） */
  const handleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    void revealTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, async () => {
      await updateSetting('theme', nextTheme);
    });
  };

  return (
    <header className="ef-cmd" aria-label="命令栏">
      <div className="ef-cmd__brand">
        <span aria-hidden="true" className="ef-cmd__logo" />
        <span className="ef-cmd__wordmark">PAINTLAB</span>
        <span className="ef-cmd__version">{APP_VERSION}</span>
      </div>

      <nav aria-label="一级导航" className="ef-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="ef-nav__item"
            onClick={(event) => handleNav(event, item.to)}
          >
            <span aria-hidden="true" className="ef-nav__code">
              {item.code}
            </span>
            <span className="ef-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="ef-cmd__right">
        {desktop && (
          <span className="ef-cmd__version" style={{ fontSize: 11 }}>
            DESKTOP
          </span>
        )}
        <button
          type="button"
          className="ef-cmd__icon"
          aria-label={nextThemeLabel}
          title={nextThemeLabel}
          onClick={handleTheme}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}
