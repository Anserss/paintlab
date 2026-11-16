import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 主按钮右端斜切角（4.4） */
  chamfer?: boolean;
  children?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-[var(--accent-ink)] border border-accent hover:bg-[color-mix(in_srgb,var(--accent)_88%,white)]',
  secondary: 'bg-surface-2 text-text-1 border border-line hover:border-line-strong',
  ghost: 'bg-transparent text-text-2 border border-transparent hover:bg-surface-2 hover:text-text-1',
  danger: 'bg-transparent text-danger border border-danger hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2 text-[11px]',
  md: 'h-8 px-3 text-xs',
};

/** 按钮：工业硬边，圆角 0；主按钮恒为琥珀（4.2 使用规则） */
export function Button({
  variant = 'secondary',
  size = 'md',
  chamfer = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-none font-medium tracking-[0.02em]',
        'transition-colors duration-hover disabled:cursor-not-allowed disabled:opacity-40',
        SIZE[size],
        VARIANT[variant],
        chamfer && 'u-chamfer pr-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
