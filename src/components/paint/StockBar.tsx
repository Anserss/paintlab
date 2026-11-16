import { clamp } from '@/core/math/quantity';
import { cn } from '@/components/ui';

export interface StockBarProps {
  volumeMl: number;
  initialMl: number;
  /** 低库存阈值，默认 0.15（4.5.1 / 4.2） */
  lowThreshold?: number;
  className?: string;
}

/** 4px 余量进度条；低库存时末端追加 3px 红块（4.5.1） */
export function StockBar({ volumeMl, initialMl, lowThreshold = 0.15, className }: StockBarProps) {
  const fraction = initialMl > 0 ? clamp(volumeMl / initialMl, 0, 1) : 0;
  const low = initialMl > 0 && fraction < lowThreshold;
  const pct = Math.round(fraction * 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="余量"
      data-stock-bar=""
      className={cn('relative h-1 w-full overflow-hidden bg-surface-3', className)}
    >
      <div
        data-stock-fill=""
        className="relative h-full bg-accent"
        style={{ width: pct + '%' }}
      >
        {low && (
          <span data-stock-low-mark="" className="absolute right-0 top-0 h-full w-[3px] bg-bh-red" />
        )}
      </div>
    </div>
  );
}
