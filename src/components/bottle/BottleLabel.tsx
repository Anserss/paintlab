import { BOTTLE } from '@/core/render/bottle';
import { formatMl } from '@/core/math/quantity';
import { cn } from '@/components/ui';

export interface BottleLabelProps {
  brandName: string;
  code: string;
  colorName: string;
  remainingMl: number;
  baselineMl: number;
  className?: string;
}

const LEFT = 8;
const RIGHT = BOTTLE.viewBox.width - 8;

/**
 * 顶部信息牌 L-1（4.5.2）：无底色、上下 1px 描边。
 * 品牌 / 色号 / 颜色名 / 剩余量全部位于瓶身之上，液体上不压文字。
 */
export function BottleLabel({
  brandName,
  code,
  colorName,
  remainingMl,
  baselineMl,
  className,
}: BottleLabelProps) {
  return (
    <g data-bottle-label="" className={cn(className)}>
      <line x1={0} y1={0.5} x2={BOTTLE.viewBox.width} y2={0.5} stroke="var(--line)" strokeWidth={1} />
      <line
        x1={0}
        y1={BOTTLE.infoBar - 0.5}
        x2={BOTTLE.viewBox.width}
        y2={BOTTLE.infoBar - 0.5}
        stroke="var(--line)"
        strokeWidth={1}
      />
      <text x={LEFT} y={19} fontSize={11} fill="var(--text-2)">
        {brandName}
      </text>
      <text x={RIGHT} y={19} textAnchor="end" fontSize={13} fill="var(--text-1)" className="t-readout">
        {code}
      </text>
      <text x={LEFT} y={41} fontSize={14} fill="var(--text-1)">
        {colorName}
      </text>
      <text x={RIGHT} y={41} textAnchor="end" fontSize={13} fill="var(--text-2)" className="t-readout">
        {formatMl(remainingMl)}/{formatMl(baselineMl)} ml
      </text>
    </g>
  );
}
