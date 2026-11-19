import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyProps {
  /** 主文案，例如 DEPOT // 空仓 */
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** 空状态：45° 细斜线框 + 一句完整的话 + 一个主按钮 */
export function Empty({ title, description, action, className }: EmptyProps) {
  return (
    <div
      className={cn(
        'tex-hatch flex min-h-[240px] flex-col items-center justify-center gap-4 border p-8 text-center',
        className,
      )}
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <p className="ef-title !text-[22px]">{title}</p>
      {description && <p className="max-w-md text-[13px] leading-relaxed text-text-2">{description}</p>}
      {action}
    </div>
  );
}
