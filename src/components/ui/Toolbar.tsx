import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ToolbarProps {
  /** 已选件数 */
  count: number;
  children: ReactNode;
  className?: string;
}

/** Toolbar：高 48，贴底浮层，rgba(10,11,12,.94) + 上描边，左侧"已选 n 件"（4.5.3） */
export function Toolbar({ count, children, className }: ToolbarProps) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label="批量操作"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-toolbar)] mx-auto flex h-12 max-w-[1600px] items-center justify-between gap-4 border-t border-line-strong px-6',
        'bg-[rgba(10,11,12,.94)] backdrop-blur-[2px]',
        className,
      )}
    >
      <span className="t-readout text-xs text-text-2">已选 {count} 件</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
