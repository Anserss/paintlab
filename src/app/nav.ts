export interface NavItem {
  to: string;
  code: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/procure', code: '//01', label: '采购' },
  { to: '/depot', code: '//02', label: '仓库' },
  { to: '/mix', code: '//03', label: '调漆台' },
  { to: '/workbench', code: '//04', label: '工作台' },
  { to: '/settings', code: '//05', label: '设置' },
];

export const ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.to, item.label]),
);
