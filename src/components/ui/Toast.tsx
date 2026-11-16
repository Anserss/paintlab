export interface ToastItem {
  id: string;
  message: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
  /** 单个动作链接，例如"撤销" */
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastStackProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

const STRIPE: Record<NonNullable<ToastItem['tone']>, string> = {
  neutral: 'bg-line-strong',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

/** Toast：右下，宽 320，斜切角，左侧 3px 状态色竖条，最多 3 条（3.1 / 4.5.3） */
export function ToastStack({ items, onDismiss }: ToastStackProps) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[320px] flex-col gap-2"
    >
      {items.slice(0, 3).map((item) => (
        <div
          key={item.id}
          role="status"
          className="u-chamfer pointer-events-auto flex items-stretch bg-[var(--chrome-bg)] text-xs text-text-1"
        >
          <span className={'w-[3px] shrink-0 ' + STRIPE[item.tone ?? 'neutral']} />
          <div className="flex flex-1 items-center justify-between gap-3 px-3 py-2">
            <span className="leading-snug">{item.message}</span>
            <span className="flex shrink-0 items-center gap-2">
              {item.actionLabel && (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    onDismiss(item.id);
                  }}
                  className="text-accent underline decoration-dotted underline-offset-2 hover:opacity-80"
                >
                  {item.actionLabel}
                </button>
              )}
              <button
                type="button"
                aria-label="关闭回执"
                onClick={() => onDismiss(item.id)}
                className="text-text-3 hover:text-text-1"
              >
                ×
              </button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
