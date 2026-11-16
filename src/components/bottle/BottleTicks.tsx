import { BOTTLE } from '@/core/render/bottle';
import { cn } from '@/components/ui';

export interface BottleTicksProps {
  showTicks: boolean;
  className?: string;
}

const INNER_RIGHT = BOTTLE.body.x + BOTTLE.body.w - 10;
const STEP = BOTTLE.innerHeight / BOTTLE.ticks;
/** 每 3 格加长并标数字（4.5.2） */
const MARKS: Record<number, string> = { 3: '1/4', 6: '1/2', 9: '3/4' };

/** 刻度层 L3：12 等分，奇数格 8px，每 3 格 14px + 数字 */
export function BottleTicks({ showTicks, className }: BottleTicksProps) {
  if (!showTicks) return null;

  return (
    <g data-bottle-ticks="" className={cn(className)}>
      {Array.from({ length: BOTTLE.ticks }, (_, idx) => idx + 1).map((i) => {
        const y = BOTTLE.innerBottom - i * STEP;
        const mark = MARKS[i];
        const len = mark ? 14 : i % 2 === 1 ? 8 : 4;
        return (
          <g key={i}>
            <line
              x1={INNER_RIGHT - len}
              y1={y}
              x2={INNER_RIGHT}
              y2={y}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
            {mark && (
              <text
                x={INNER_RIGHT - len - 4}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--text-3)"
                className="t-readout"
              >
                {mark}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
