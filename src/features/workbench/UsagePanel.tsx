import { useEffect, useState } from 'react';
import { Button, cn } from '@/components/ui';
import { DilutionTag } from '@/components/paint';
import { formatMl } from '@/core/math/quantity';
import type { WorkbenchEntry } from './workbenchModel';
import {
  PLANNED_MAX_ML,
  PLANNED_MIN_ML,
  PLANNED_PRESETS,
  PLANNED_STEP_ML,
  defaultPlannedMl,
  quantizePlanned,
} from './workbenchModel';

export interface UsagePanelProps {
  entry: WorkbenchEntry | null;
  selectedCount: number;
  onCommit: (itemId: string, plannedUseMl: number) => void;
  onApplyToSelected: (plannedUseMl: number) => void;
  className?: string;
}

function initialValueOf(entry: WorkbenchEntry): number {
  return entry.plannedUseMl > 0 ? quantizePlanned(entry.plannedUseMl) : defaultPlannedMl(entry.remainingMl);
}

/**
 * 右侧用量面板（spec 3.5）：滑块 0–20 ml（步进 0.5）+ 预设 1/2/5/10 + 数字输入。
 * 写入走 store.changePlannedUse；默认 min(2, 剩余)。
 */
export function UsagePanel({ entry, selectedCount, onCommit, onApplyToSelected, className }: UsagePanelProps) {
  const [value, setValue] = useState<number>(() => (entry ? initialValueOf(entry) : PLANNED_MIN_ML));
  const entryId = entry?.id ?? null;

  useEffect(() => {
    setValue(entryId && entry ? initialValueOf(entry) : PLANNED_MIN_ML);
    // 仅在切换条目时重置，避免写入后回跳到默认值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const commit = (next: number) => {
    const snapped = quantizePlanned(next);
    setValue(snapped);
    if (entry) onCommit(entry.id, snapped);
  };

  return (
    <aside
      data-panel="usage"
      aria-label="用量面板"
      className={cn('w-[260px] shrink-0 border border-line bg-surface p-3', className)}
    >
      <div className="flex items-center justify-between border-b border-line pb-2">
        <span className="t-display text-[11px] uppercase tracking-[0.12em] text-text-2">//03 用量面板</span>
        {selectedCount > 0 && <span className="t-readout text-[10px] text-text-3">已选 {selectedCount}</span>}
      </div>

      {!entry ? (
        <p className="mt-3 text-[11px] leading-[1.7] text-text-3">选中一个工作台条目以记录大概使用量。</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-text-1" data-slot="usage-title">
              {entry.dilutionRatioN !== null && <DilutionTag ratioN={entry.dilutionRatioN} />}
              <span className="truncate">{entry.title}</span>
            </div>
            <div className="t-readout mt-0.5 flex items-center justify-between text-[10px] text-text-3">
              <span>{entry.mixed ? '调漆产物' : entry.code}</span>
              <span>余量 {formatMl(entry.remainingMl)} ml</span>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-3">计划用量</span>
            <input
              type="range"
              aria-label="计划用量滑块"
              data-field="planned-slider"
              min={PLANNED_MIN_ML}
              max={PLANNED_MAX_ML}
              step={PLANNED_STEP_ML}
              value={value}
              onChange={(event) => commit(Number(event.target.value))}
              className="h-1 w-full accent-[var(--accent)]"
            />
          </label>

          <div className="flex items-center gap-1">
            {PLANNED_PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                data-preset={preset}
                aria-pressed={value === preset}
                onClick={() => commit(preset)}
                className="flex-1 px-0"
              >
                {preset}
              </Button>
            ))}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="number"
              aria-label="计划用量数值"
              data-field="planned-input"
              min={PLANNED_MIN_ML}
              max={PLANNED_MAX_ML}
              step={PLANNED_STEP_ML}
              value={value}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) commit(parsed);
              }}
              className="t-readout h-8 w-full border border-line bg-bg-1 px-2 text-xs text-text-1"
            />
            <span className="text-[10px] text-text-3">ml</span>
          </label>

          {value > entry.remainingMl && (
            <p className="text-[10px] text-bh-red">计划用量超过当前余量 {formatMl(entry.remainingMl)} ml</p>
          )}

          <p className="text-[10px] leading-[1.6] text-text-3">大概用量即可，用于估算剩余</p>

          {selectedCount > 1 && (
            <Button size="sm" data-action="apply-selected" onClick={() => onApplyToSelected(value)}>
              应用到已选 {selectedCount} 件
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
