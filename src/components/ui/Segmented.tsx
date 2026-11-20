import type { KeyboardEvent } from 'react';
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

/** 分段选择：40 高，当前段墨底反白（不用黄，黄留给主要操作） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = options.findIndex((opt) => opt.value === value);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = options[(current + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('inline-flex h-10 items-stretch border border-ink bg-panel', className)}
      style={{ borderColor: 'var(--ef-ink)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            tabIndex={active ? 0 : -1}
            data-seg=""
            onClick={() => onChange(opt.value)}
            className={cn(
              'ef-btn !h-10 !border-0 !px-4 !text-[13px] transition-none',
              active ? '!bg-ink !text-panel hover:!text-[color:var(--ef-ink)]' : '!bg-transparent !text-ink-2 hover:!text-ink',
            )}
            style={{ clipPath: 'none' }}
          >
            {/*
             * 2.2.2：标签必须包一层 z 轴元素。`.ef-btn::before` 是 hover 时扫过的
             * 黄色斜切层（z-index:0），裸文本节点没有层叠上下文，会被盖住 →
             * 选中页签在鼠标下变成「黄底看不见字」。
             */}
            <span className="relative z-[1]">{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className="ef-field relative z-[1] ml-1.5 opacity-70">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
