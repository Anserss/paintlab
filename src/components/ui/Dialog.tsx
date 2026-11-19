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
  /** ConfirmDialog 宽度 420；普通弹层 520；大表 720 */
  width?: 420 | 520 | 720;
}

/** 弹层：纸面白板 + 1px 墨线 + 右下 26 切角；无投影、无模糊 */
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
        <RadixDialog.Overlay
          className="fixed inset-0 z-[var(--ef-z-modal)]"
          style={{ background: 'var(--ef-scrim)' }}
        />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[var(--ef-z-modal)] max-h-[86vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-auto',
            'border bg-surface p-6',
          )}
          style={{
            maxWidth: width,
            borderColor: 'var(--ef-ink)',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%)',
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-4 border-b pb-3" style={{ borderColor: 'var(--ef-rule)' }}>
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="ef-title !text-[22px]">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-[13px] leading-relaxed text-text-2">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="关闭"
              className="flex h-10 w-10 shrink-0 items-center justify-center border text-text-2 hover:border-text-1 hover:text-text-1"
              style={{ borderColor: 'var(--ef-rule)' }}
            >
              ×
            </RadixDialog.Close>
          </div>
          <div className="text-sm text-text-1">{children}</div>
          {footer && (
            <div
              className="mt-5 flex justify-end gap-2 border-t pt-4"
              style={{ borderColor: 'var(--ef-rule)' }}
            >
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
