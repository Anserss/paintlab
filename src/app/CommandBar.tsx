import { NavLink } from 'react-router-dom';
import { APP_VERSION, isDesktop } from '@/platform';
import { useAppStore } from '@/store';
import { NAV_ITEMS } from './nav';

/** 命令栏（40px）：字标 + 一级导航 + 主题切换；桌面壳里兼作窗口标题栏拖拽区 */
export function CommandBar() {
  const theme = useAppStore((state) => state.settings.theme);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const desktop = isDesktop();

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="ef-cmd" aria-label="命令栏">
      <div className="ef-cmd__brand">
        <span aria-hidden="true" className="ef-cmd__logo" />
        <span className="ef-cmd__wordmark">PAINTLAB</span>
        <span className="ef-cmd__version">{APP_VERSION}</span>
      </div>

      <nav aria-label="一级导航" className="ef-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className="ef-nav__item">
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
          aria-label={nextTheme === 'dark' ? '切换到深色主题' : '切换到浅色主题'}
          title={nextTheme === 'dark' ? '切换到深色主题' : '切换到浅色主题'}
          onClick={() => {
            void updateSetting('theme', nextTheme);
          }}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}
