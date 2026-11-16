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
  neutral: 'border-line text-text-2',
  accent: 'border-accent text-accent',
  ok: 'border-ok text-ok',
  warn: 'border-warn text-warn',
  danger: 'border-danger text-danger',
};

/** Badge：高 18，padding 0 6px，10px 字，1px 描边，无底色（4.5.3） */
export function Badge({ children, tone = 'neutral', title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[18px] items-center border px-1.5 text-[10px] uppercase tracking-[0.08em]',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
