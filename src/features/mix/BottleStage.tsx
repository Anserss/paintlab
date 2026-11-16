import { useState } from 'react';
import type { Bottle } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import {
  isBelowOneTick,
  isEmptyBottle,
  levelFraction,
  levelReading,
} from '@/core/render/bottle';
import { Button, Empty, Stepper, cn } from '@/components/ui';
import { BottleView } from '@/components/bottle';
import {
  CAPACITY_MAX,
  CAPACITY_MIN,
  CAPACITY_PRESETS,
  parseCapacity,
} from './mixMath';

export interface BottleStageProps {
  bottle?: Bottle;
  brandName?: string;
  /** 新建瓶容量（无瓶时决定按钮文案） */
  capacity: number;
  /** 已有瓶时的瓶身容量（选择器的选中态） */
  activeCapacity?: number;
  onCapacitySelect: (capacityMl: number) => void;
  capacityNotice: string | null;
  onCreate: () => void;
  onMix: () => void;
  onUse: () => void;
  onClear: () => void;
  onArchive: () => void;
  useAmountMl: number;
  onUseAmountChange: (amountMl: number) => void;
  mixDisabled: boolean;
  canArchive: boolean;
}

function CapacityPicker({
  capacity,
  remainingMl,
  onSelect,
  notice,
}: {
  capacity: number;
  /** 有瓶时用于标记低于余量的选项（只做视觉提示，判定仍在 store） */
  remainingMl?: number;
  onSelect: (capacityMl: number) => void;
  notice: string | null;
}) {
  const [customText, setCustomText] = useState('');

  const commitCustom = () => {
    const parsed = parseCapacity(customText);
    if (parsed !== null) onSelect(parsed);
    setCustomText('');
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="t-readout text-[10px] tracking-[0.08em] text-text-3">
        {'瓶容量 · ' + capacity + ' ml'}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <div role="group" aria-label="瓶容量" className="flex items-center gap-1">
          {CAPACITY_PRESETS.map((ml) => {
            const below = typeof remainingMl === 'number' && ml < remainingMl;
            return (
              <button
                key={ml}
                type="button"
                data-capacity={ml}
                data-below-remaining={below ? '' : undefined}
                aria-pressed={capacity === ml}
                onClick={() => onSelect(ml)}
                className={cn(
                  't-readout h-7 border px-2 text-[11px] transition-colors duration-hover',
                  capacity === ml
                    ? 'border-accent text-accent'
                    : below
                      ? 'border-line text-text-3 line-through'
                      : 'border-line text-text-2 hover:border-line-strong hover:text-text-1',
                )}
              >
                {ml}
              </button>
            );
          })}
        </div>
        <input
          aria-label="自定义容量"
          inputMode="numeric"
          placeholder={CAPACITY_MIN + '–' + CAPACITY_MAX}
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          onBlur={commitCustom}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitCustom();
          }}
          className="t-readout h-7 w-20 border border-line bg-bg-1 px-1 text-center text-[11px] text-text-1"
        />
      </div>
      {notice && (
        <p role="status" data-capacity-notice="" className="text-center text-[10px] leading-snug text-warn">
          {notice}
        </p>
      )}
    </div>
  );
}

/** 中栏 BottleStage：BottleView + 瓶容量选择 + 基准显示 + 四个动作（3.4.1） */
export function BottleStage({
  bottle,
  brandName,
  capacity,
  activeCapacity,
  onCapacitySelect,
  capacityNotice,
  onCreate,
  onMix,
  onUse,
  onClear,
  onArchive,
  useAmountMl,
  onUseAmountChange,
  mixDisabled,
  canArchive,
}: BottleStageProps) {
  if (!bottle) {
    return (
      <div
        data-mix-panel="bottle"
        className="flex min-h-0 flex-col justify-center gap-4 border border-line bg-bg-1 p-4"
      >
        <CapacityPicker capacity={capacity} onSelect={onCapacitySelect} notice={capacityNotice} />
        <Empty
          title="未装载调漆瓶"
          description="选择容量后开始调配。"
          action={
            <Button data-action="new-bottle" variant="primary" chamfer onClick={onCreate}>
              {'新建 ' + capacity + ' ml 瓶'}
            </Button>
          }
        />
      </div>
    );
  }

  const fraction = levelFraction(bottle.remainingMl, bottle.baselineMl, bottle.capacityMl, bottle.levelMode);
  const reading = levelReading(fraction);
  const empty = isEmptyBottle(bottle.remainingMl);
  const hint = isBelowOneTick(fraction) ? '余量不足 1 格，建议清空' : null;
  const maxUse = Math.max(bottle.remainingMl, 0.1);

  return (
    <div
      data-mix-panel="bottle"
      className="flex min-h-0 flex-col items-center gap-2 border border-line bg-bg-1 p-3"
    >
      <div className="flex w-full items-baseline justify-between gap-2 text-[11px] text-text-2">
        <span data-stage-name="" className="truncate">
          {bottle.name}
        </span>
        <span data-baseline="" className="t-readout shrink-0 text-[10px] text-text-3">
          {'基准 上次 ' + formatMl(bottle.baselineMl) + ' ml'}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <BottleView bottle={bottle} brandName={brandName} size={200} showTicks />
      </div>

      <p
        data-stage-reading={reading}
        className="t-readout text-center text-xs text-text-1"
      >
        {'剩余 ' + formatMl(bottle.remainingMl) + ' / ' + formatMl(bottle.baselineMl) + ' ml · ' + reading}
      </p>
      {hint && <p className="text-[10px] text-warn">{hint}</p>}

      <CapacityPicker
        capacity={activeCapacity ?? bottle.capacityMl}
        remainingMl={bottle.remainingMl}
        onSelect={onCapacitySelect}
        notice={capacityNotice}
      />

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button data-action="mix" variant="primary" chamfer disabled={mixDisabled} onClick={onMix}>
          调配
        </Button>
        <Button data-action="use" disabled={empty} onClick={onUse}>
          使用
        </Button>
        <Button data-action="clear" disabled={empty} onClick={onClear}>
          清空
        </Button>
        <Button data-action="archive" disabled={!canArchive} onClick={onArchive}>
          归档
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-3">使用量</span>
        <Stepper
          ariaLabel="使用量"
          value={useAmountMl}
          min={0.1}
          max={maxUse}
          step={0.1}
          unit="ml"
          disabled={empty}
          onChange={onUseAmountChange}
        />
      </div>
    </div>
  );
}
