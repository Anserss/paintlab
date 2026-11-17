import type { Bottle } from '@/core/model/types';
import { formatMl, formatRatio } from '@/core/math/quantity';
import { isBelowOneTick, isEmptyBottle, levelFraction, levelReading } from '@/core/render/bottle';
import { Button, Empty, Stepper, cn } from '@/components/ui';
import { BottleView } from '@/components/bottle';

export interface BatchOption {
  id: string;
  name: string;
}

export interface BottleStageProps {
  bottle?: Bottle;
  brandName?: string;
  /** 调漆台里的批次（最近的在前），用于切换当前批次 */
  batches: BatchOption[];
  activeBatchId: string | null;
  onSelectBatch: (bottleId: string) => void;
  /** 入库：批次内容变成一条仓库条目 */
  onStockIn: () => void;
  /** 开涂：把批次送到工作台 */
  onCoat: () => void;
  onUse: () => void;
  onClear: () => void;
  useAmountMl: number;
  onUseAmountChange: (amountMl: number) => void;
  canStockIn: boolean;
  coatHint: string | null;
}

/** 中栏：当前批次瓶身 + 批次切换 + 入库 / 开涂 / 使用 / 清空（不再有瓶容量选择） */
export function BottleStage({
  bottle,
  brandName,
  batches,
  activeBatchId,
  onSelectBatch,
  onStockIn,
  onCoat,
  onUse,
  onClear,
  useAmountMl,
  onUseAmountChange,
  canStockIn,
  coatHint,
}: BottleStageProps) {
  if (!bottle) {
    return (
      <div
        data-mix-panel="bottle"
        className="flex min-h-0 flex-col justify-center gap-4 border border-line bg-bg-1 p-4"
      >
        <Empty
          title="调漆台空"
          description="左侧选好漆料，再点「稀释」或「调漆」；产物会自动装入调漆台。"
        />
      </div>
    );
  }

  const fraction = levelFraction(bottle.remainingMl, bottle.baselineMl, bottle.capacityMl, bottle.levelMode);
  const reading = levelReading(fraction);
  const empty = isEmptyBottle(bottle.remainingMl);
  const hint = isBelowOneTick(fraction) ? '余量不足 1 格，建议清空' : null;
  const maxUse = Math.max(bottle.remainingMl, 0.1);
  const modeLabel = bottle.mode === 'blend' ? '调漆' : '稀释';

  return (
    <div
      data-mix-panel="bottle"
      className="flex min-h-0 flex-col items-center gap-2 border border-line bg-bg-1 p-3"
    >
      <div className="flex w-full items-baseline justify-between gap-2 text-[11px] text-text-2">
        <span data-stage-name="" className="truncate">
          <span className="mr-1 border border-line px-1 text-[9px] uppercase tracking-[0.08em] text-text-3">
            {modeLabel}
          </span>
          {bottle.name}
        </span>
        <span data-baseline="" className="t-readout shrink-0 text-[10px] text-text-3">
          {'本次产出 ' + formatMl(bottle.baselineMl) + ' ml · ' + formatRatio(bottle.ratioN)}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <BottleView bottle={bottle} brandName={brandName} size={200} showTicks />
      </div>

      <p data-stage-reading={reading} className="t-readout text-center text-xs text-text-1">
        {'剩余 ' + formatMl(bottle.remainingMl) + ' / ' + formatMl(bottle.baselineMl) + ' ml · ' + reading}
      </p>
      {hint && <p className="text-[10px] text-warn">{hint}</p>}

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button data-action="stock-in" variant="secondary" disabled={!canStockIn} onClick={onStockIn}>
          入库
        </Button>
        <Button data-action="coat" variant="primary" chamfer disabled={empty} title={coatHint ?? undefined} onClick={onCoat}>
          开涂
        </Button>
        <Button data-action="use" disabled={empty} onClick={onUse}>
          使用
        </Button>
        <Button data-action="clear" disabled={empty} onClick={onClear}>
          清空
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

      {batches.length > 1 && (
        <div className="flex w-full flex-wrap items-center gap-1 border-t border-line pt-1.5">
          <span className="text-[10px] text-text-3">批次</span>
          {batches.map((batch) => (
            <button
              key={batch.id}
              type="button"
              data-batch={batch.id}
              aria-pressed={batch.id === activeBatchId}
              onClick={() => onSelectBatch(batch.id)}
              className={cn(
                'max-w-[120px] truncate border px-1.5 py-0.5 text-[10px] transition-colors duration-hover',
                batch.id === activeBatchId
                  ? 'border-accent text-accent'
                  : 'border-line text-text-2 hover:border-line-strong hover:text-text-1',
              )}
            >
              {batch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
