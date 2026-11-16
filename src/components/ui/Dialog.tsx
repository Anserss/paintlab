import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** ConfirmDialog 宽度 420（4.5.3）；普通弹层 520 */
  width?: 420 | 520 | 720;
}

/** 弹层：全站唯一允许阴影的地方（4.4）；标题全大写 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 520,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-[rgba(6,7,8,.72)] backdrop-blur-[1px]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[var(--z-overlay)] max-h-[86vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-auto',
            'border border-line-strong bg-surface p-5 shadow-panel',
          )}
          style={{ maxWidth: width }}
        >
          <div className="mb-3 flex items-start justify-between gap-4 border-b border-line pb-2">
            <div>
              <RadixDialog.Title className="t-display text-sm uppercase tracking-[0.06em] text-text-1">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-xs text-text-3">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="关闭"
              className="h-6 w-6 shrink-0 border border-line text-text-3 transition-colors duration-hover hover:border-line-strong hover:text-text-1"
            >
              ×
            </RadixDialog.Close>
          </div>
          <div className="text-sm text-text-1">{children}</div>
          {footer && <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
