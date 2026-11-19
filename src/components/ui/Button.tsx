import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 兼容旧 API：切角现在由 .ef-btn 统一处理 */
  chamfer?: boolean;
  children?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'ef-btn--go',
  secondary: 'ef-btn--default',
  ghost: 'ef-btn--quiet',
  danger: 'ef-btn--danger',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'ef-btn--sm',
  md: 'ef-btn--md',
  lg: 'ef-btn--lg',
};

/** 按钮：切角 = 可点击；主要按钮墨底，悬停黄从左侧擦入；44/40/32 三档 */
export function Button({
  variant = 'secondary',
  size = 'md',
  chamfer: _chamfer = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn('ef-btn', SIZE[size], VARIANT[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
