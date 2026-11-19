import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
  className?: string;
}

const TONE: Record<BadgeTone, string> = {
  neutral: 'text-ink-2',
  accent: 'bg-ink text-panel px-1.5',
  ok: 'bg-ink text-panel px-1.5',
  warn: 'bg-chip text-ink px-1.5',
  danger: 'text-danger',
};

/** 字段式徽标（替代旧带框 Badge）：13px 宽体数字，可点击但不是按钮 */
export function Badge({ children, tone = 'neutral', title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'ef-field inline-flex h-[22px] items-center whitespace-nowrap text-[11px] uppercase tracking-[0.06em]',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
