import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** 视图切换：高 32，无圆角，选中项底 --surface-3 + 底部 2px --accent（4.5.3） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex h-8 items-stretch border border-line bg-bg-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative px-3 text-xs tracking-[0.02em] transition-colors duration-hover',
              active
                ? 'bg-surface-3 text-text-1'
                : 'text-text-3 hover:bg-surface-2 hover:text-text-2',
              active && 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent',
            )}
          >
            {opt.label}
            {typeof opt.count === 'number' && (
              <span className="t-readout ml-1.5 text-text-3">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
