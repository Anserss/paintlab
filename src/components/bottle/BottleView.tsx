import { useId } from 'react';
import type { KeyboardEvent } from 'react';
import type { Bottle, LevelMode } from '@/core/model/types';
import {
  BOTTLE,
  fractionLabel,
  isBelowOneTick,
  isEmptyBottle,
  levelBubble,
  levelFraction,
  levelReading,
  liquidHeight,
  quantizeLevel,
} from '@/core/render/bottle';
import { swatchAttrs } from '@/core/render/swatch';
import { clamp, formatRatio } from '@/core/math/quantity';
import { Button, cn } from '@/components/ui';
import { BottleLabel } from '@/components/bottle/BottleLabel';
import { BottleTicks } from '@/components/bottle/BottleTicks';
import type { SvgSize } from '@/components/paint/PaintSwatch';

export interface BottleViewProps {
  bottle: Bottle;
  /** 默认沿用 bottle.levelMode（3.4.4） */
  levelMode?: LevelMode;
  showTicks?: boolean;
  size?: SvgSize;
  /** Bottle 只存 labelBrandId，显示名由调用方给 */
  brandName?: string;
  onOpen?: (bottle: Bottle) => void;
  onUse?: (bottle: Bottle) => void;
  onMix?: (bottle: Bottle) => void;
  className?: string;
}

const VB = BOTTLE.viewBox;
const CAVITY = {
  x: BOTTLE.body.x + 10,
  y: BOTTLE.innerTop,
  w: BOTTLE.body.w - 20,
  h: BOTTLE.innerHeight,
};
const PLATE_W = 108;
const PLATE_H = 44;
const PLATE_X = VB.width / 2 - PLATE_W / 2;

/** 顶部信息牌之外，瓶身上只留液位、刻度与最小读数（4.5.2） */
export function BottleView({
  bottle,
  levelMode,
  showTicks = true,
  size = 'fill',
  brandName,
  onOpen,
  onUse,
  onMix,
  className,
}: BottleViewProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = 'bottle-clip-' + rawId;
  const meniscusId = 'bottle-surface-' + rawId;

  const mode: LevelMode = levelMode ?? bottle.levelMode;
  const fraction = levelFraction(bottle.remainingMl, bottle.baselineMl, bottle.capacityMl, mode);
  /** 3.4.4 边界：0 < R/L < 1/12 仍按最小 1 格显示（读数与液位一致） */
  const shown = isBelowOneTick(fraction) ? 1 / BOTTLE.ticks : fraction;
  const height = liquidHeight(shown);
  const surfaceY = BOTTLE.innerBottom - height;
  const empty = isEmptyBottle(bottle.remainingMl);
  const reading = levelReading(fraction);
  const quantized = quantizeLevel(shown);
  const pct = Math.round(clamp(fraction, 0, 1) * 100);
  const liquid = swatchAttrs(bottle.hex, bottle.paintClass);
  const bubble = levelBubble(bottle.remainingMl, bottle.baselineMl, fraction);
  const hint = isBelowOneTick(fraction) ? '余量不足 1 格，建议清空' : null;
  const ariaLabel = [bottle.name, empty ? '空瓶 · 可归档' : reading, hint]
    .filter(Boolean)
    .join('，');

  const plateY = empty
    ? (BOTTLE.innerTop + BOTTLE.innerBottom) / 2 - PLATE_H / 2
    : Math.max(BOTTLE.innerTop + 4, surfaceY - PLATE_H - 6);

  const box =
    size === 'fill'
      ? { width: '100%' as const }
      : { width: size, height: Math.round((size * VB.height) / VB.width) };

  function handleKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(bottle);
    }
  }

  return (
    <div className={cn('group relative inline-flex flex-col', size === 'fill' && 'w-full', className)}>
      <svg
        viewBox={'0 0 ' + VB.width + ' ' + VB.height}
        {...box}
        role={onOpen ? 'button' : 'img'}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={ariaLabel}
        data-bottle-view=""
        data-level-reading={reading}
        data-level-fraction={fraction.toFixed(4)}
        data-empty={empty ? '' : undefined}
        onClick={onOpen ? () => onOpen(bottle) : undefined}
        onKeyDown={onOpen ? handleKeyDown : undefined}
        className={cn('block', size === 'fill' && 'h-auto w-full', onOpen && 'cursor-pointer')}
      >
        <title>{bubble + (hint ? ' · ' + hint : '')}</title>

        <defs>
          <clipPath id={clipId}>
            <rect x={CAVITY.x} y={CAVITY.y} width={CAVITY.w} height={CAVITY.h} rx={4} />
          </clipPath>
          <linearGradient id={meniscusId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={0.18} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
        </defs>

        <BottleLabel
          brandName={brandName ?? bottle.labelBrandId ?? '—'}
          code={bottle.labelCode ?? '—'}
          colorName={bottle.name}
          remainingMl={bottle.remainingMl}
          baselineMl={bottle.baselineMl}
        />

        {/* L0 瓶体轮廓 */}
        <g data-bottle-shell="">
          <rect
            x={BOTTLE.body.x}
            y={BOTTLE.body.y}
            width={BOTTLE.body.w}
            height={BOTTLE.body.h}
            rx={BOTTLE.body.r}
            fill="var(--surface)"
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray={empty ? '4 4' : undefined}
          />
          <rect
            x={BOTTLE.neck.x}
            y={BOTTLE.neck.y}
            width={BOTTLE.neck.w}
            height={BOTTLE.neck.h}
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth={1}
          />
          <rect
            x={BOTTLE.cap.x}
            y={BOTTLE.cap.y}
            width={BOTTLE.cap.w}
            height={BOTTLE.cap.h}
            rx={2}
            fill="var(--surface-3)"
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
          {Array.from({ length: 5 }, (_, i) => {
            const y = BOTTLE.cap.y + 4 + i * 3.4;
            return (
              <line
                key={i}
                x1={BOTTLE.cap.x + 6}
                y1={y}
                x2={BOTTLE.cap.x + BOTTLE.cap.w - 6}
                y2={y}
                stroke="var(--line)"
                strokeWidth={1}
              />
            );
          })}
        </g>

        {/* L1 玻璃高光 / 暗边 */}
        <g clipPath={'url(#' + clipId + ')'}>
          <rect
            x={CAVITY.x + 6}
            y={CAVITY.y + 6}
            width={14}
            height={CAVITY.h - 12}
            rx={7}
            fill="var(--ghost)"
          />
          <rect
            x={CAVITY.x + CAVITY.w - 10}
            y={CAVITY.y}
            width={10}
            height={CAVITY.h}
            fill="var(--bg-0)"
            opacity={0.35}
          />
        </g>

        {/* L2 液体（颜色与透明度全部来自 core） */}
        {!empty && (
          <g clipPath={'url(#' + clipId + ')'} data-liquid-layer="">
            <rect
              data-liquid=""
              x={CAVITY.x}
              y={surfaceY}
              width={CAVITY.w}
              height={height}
              fill={liquid.fill}
              opacity={liquid.opacity}
            />
            {height > 0 && (
              <rect
                data-meniscus=""
                x={CAVITY.x}
                y={surfaceY}
                width={CAVITY.w}
                height={6}
                fill={'url(#' + meniscusId + ')'}
              />
            )}
          </g>
        )}

        {/* L3 刻度 */}
        <BottleTicks showTicks={showTicks} />

        {/* L4 瓶内最小读数 */}
        <g data-bottle-plate="">
          <rect x={PLATE_X} y={plateY} width={PLATE_W} height={PLATE_H} rx={2} fill="var(--bg-0)" fillOpacity={0.72} />
          {empty ? (
            <text x={VB.width / 2} y={plateY + PLATE_H / 2 + 4} textAnchor="middle" fontSize={12} fill="var(--text-2)">
              空瓶 · 可归档
            </text>
          ) : (
            <>
              <text
                data-level-label=""
                x={VB.width / 2}
                y={plateY + 25}
                textAnchor="middle"
                fontSize={20}
                fill="var(--text-1)"
                className="t-readout"
              >
                {'≈ ' + fractionLabel(quantized)}
              </text>
              <text
                data-level-pct=""
                x={VB.width / 2}
                y={plateY + 39}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-2)"
                className="t-readout"
              >
                {pct + '%'}
              </text>
            </>
          )}
        </g>

        {/* L5 状态角标 */}
        <text
          x={BOTTLE.body.x + BOTTLE.body.w - 8}
          y={BOTTLE.body.y + 14}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-3)"
          className="t-readout"
        >
          {empty ? '空' : formatRatio(bottle.ratioN)}
        </text>
      </svg>

      {(onUse || onMix) && (
        <div className="absolute inset-x-2 bottom-2 flex justify-center gap-1 opacity-0 transition-opacity duration-hover group-focus-within:opacity-100 group-hover:opacity-100">
          {onMix && (
            <Button variant="ghost" size="sm" aria-label="调配" onClick={() => onMix(bottle)}>
              调配
            </Button>
          )}
          {onUse && (
            <Button variant="ghost" size="sm" aria-label="使用" onClick={() => onUse(bottle)}>
              使用
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
