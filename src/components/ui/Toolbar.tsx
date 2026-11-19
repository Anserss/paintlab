import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ToolbarProps {
  /** 已选件数 */
  count: number;
  children: ReactNode;
  className?: string;
}

/** 批量条：52 高，纸底 + 上 1px 墨线；贴内容底部，不遮提示 */
export function Toolbar({ count, children, className }: ToolbarProps) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="批量操作"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--ef-z-dock)] mx-auto flex h-[52px] max-w-[1600px] items-center justify-between gap-4 border-t bg-paper px-6',
        className,
      )}
      style={{ borderColor: 'var(--ef-ink)' }}
    >
      <span className="ef-field text-[13px] text-ink-2">已选 {count} 件</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
