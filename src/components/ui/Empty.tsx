import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyProps {
  /** 主文案，例如 DEPOT // 空仓 */
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** 空状态（3.10 文案表）：主文案 + 副文案 + 单个动作 */
export function Empty({ title, description, action, className }: EmptyProps) {
  return (
    <div
      className={cn(
        'tex-grid flex min-h-[240px] flex-col items-center justify-center gap-3 border border-dashed border-line p-8 text-center',
        className,
      )}
    >
      <p className="t-display text-lg text-text-2">{title}</p>
      {description && <p className="max-w-sm text-xs text-text-3">{description}</p>}
      {action}
    </div>
  );
}
