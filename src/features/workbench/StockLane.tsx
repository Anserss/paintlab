import { formatMl } from '@/core/math/quantity';
import { cn } from '@/components/ui';
import { DilutionTag, PaintSwatch } from '@/components/paint';
import type { WorkbenchStockRow } from './workbenchModel';

export interface StockLaneProps {
  rows: WorkbenchStockRow[];
  /** 因为「原浆只能在仓库与调漆台之间流转」被拦下的条数 */
  neatBlocked: number;
  /** 没有活动工作台时不能加入 */
  canAdd: boolean;
  onPick: (stockItemId: string) => void;
  className?: string;
}

/**
 * 工作台左栏「从仓库调取」（2.1）：与调漆台左栏同一套行式色卡，
 * 只列稀释 / 调漆产物 —— 原浆不上工作台。
 */
export function StockLane({ rows, neatBlocked, canAdd, onPick, className }: StockLaneProps) {
  return (
    <aside
      aria-label="从仓库调取"
      data-workbench-panel="stock"
      className={cn('flex min-h-0 flex-col border bg-surface', className)}
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4"
        style={{ height: 56, borderColor: 'var(--ef-rule)' }}
      >
        <h2 className="text-[15px] font-bold">从仓库调取</h2>
        <span data-slot="stock-lane-count" className="ef-field text-[12px] text-text-2">
          {rows.length + ' 件'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p
          data-workbench-stock-empty=""
          className="px-4 py-8 text-center text-[13px] leading-relaxed text-text-2"
        >
          仓库里没有可用于工作台的漆料。
          <br />
          先在调漆台稀释或调漆，再把批次入库。
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {rows.map((row) => {
            const disabled = !canAdd || row.alreadyIn;
            const disabledReason = row.alreadyIn ? '已在当前工作台' : canAdd ? '加入当前工作台' : '先新建工作台';
            return (
              <li key={row.item.id}>
                <button
                  type="button"
                  data-pick-stock={row.item.id}
                  data-code={row.code}
                  data-dilution={row.dilutionRatioN ?? undefined}
                  data-in-workbench={row.alreadyIn ? '' : undefined}
                  aria-label={row.code + ' ' + row.name + '，' + disabledReason}
                  disabled={disabled}
                  title={disabledReason}
                  onClick={() => onPick(row.item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 border-b border-l-4 px-3 py-2 text-left transition-colors duration-hover',
                    disabled
                      ? 'cursor-not-allowed border-l-transparent opacity-55'
                      : 'border-l-transparent hover:border-l-[var(--ef-trace)] hover:bg-surface-2',
                  )}
                  style={{ minHeight: 64, borderBottomColor: 'var(--ef-rule)' }}
                >
                  <PaintSwatch
                    hex={row.hex}
                    paintClass={row.paint.paintClass}
                    size={32}
                    alpha={row.alpha}
                    undefinedColor={row.undefinedColor}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="ef-field flex items-baseline justify-between gap-2 text-[12px] text-text-1">
                      <span className="truncate">{row.code}</span>
                      <span className="shrink-0 text-[11px] text-text-2">{formatMl(row.item.volumeMl) + ' ml'}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {row.dilutionRatioN !== null && <DilutionTag ratioN={row.dilutionRatioN} />}
                      <span className="truncate text-[13px] text-text-1">{row.name}</span>
                      {row.alreadyIn && <span className="ef-eyebrow shrink-0">已加入</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p
        className="border-t px-4 py-3 text-[11px] leading-relaxed text-text-2"
        style={{ borderColor: 'var(--ef-rule)' }}
      >
        稀释漆料可在仓库 / 调漆台 / 工作台之间流转。
        {neatBlocked > 0 ? '原浆 ' + neatBlocked + ' 支只能在仓库与调漆台之间流转。' : ''}
      </p>
    </aside>
  );
}
