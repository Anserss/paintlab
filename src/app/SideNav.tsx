import { NavLink } from 'react-router-dom';
import { cn } from '@/components/ui';

interface NavItem {
  to: string;
  code: string;
  label: string;
  /** 纯字符图标：不使用厂商 Logo / 图片 */
  glyph: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/procure', code: '//01', label: '采购', glyph: '▤' },
  { to: '/depot', code: '//02', label: '仓库', glyph: '▦' },
  { to: '/mix', code: '//03', label: '调漆', glyph: '◐' },
  { to: '/station', code: '//04', label: '工位', glyph: '▣' },
  { to: '/settings', code: '//05', label: '设置', glyph: '◇' },
];

/** 左侧竖向工具条：宽 72px，图标 + 竖排 2 字标签 + 序号（spec 3.1） */
export function SideNav() {
  return (
    <nav
      aria-label="一级导航"
      className="sticky top-0 flex h-screen w-sidenav shrink-0 flex-col border-r border-line bg-bg-1"
    >
      <div className="flex h-topbar shrink-0 items-center justify-center border-b border-line">
        <span className="font-mono text-[10px] tracking-[0.14em] text-accent">PD</span>
      </div>
      <ul className="flex flex-1 flex-col overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 border-l-2 py-3 transition-colors duration-hover',
                  isActive
                    ? 'border-accent bg-surface-2 text-accent'
                    : 'border-transparent text-text-3 hover:bg-surface-2 hover:text-text-2',
                )
              }
            >
              <span aria-hidden="true" className="text-base leading-none">
                {item.glyph}
              </span>
              <span className="font-mono text-[9px] leading-none tracking-[0.06em]">{item.code}</span>
              <span className="flex flex-col items-center gap-px text-[11px] leading-none">
                {Array.from(item.label).map((char, index) => (
                  <span key={item.to + '-' + index}>{char}</span>
                ))}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
