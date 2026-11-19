import { formatMl, formatRatio } from '@/core/math/quantity';
import { isLowVolume } from '@/core/rules/low-volume';
import { cn } from '@/components/ui';
import { DilutionTag, LowVolumeTag, PaintSwatch } from '@/components/paint';
import type { StockRow } from './useMixData';

export interface StockPickerProps {
  rows: StockRow[];
  /** 稀释：单选；调漆：多选（组分） */
  multiple: boolean;
  selectedIds: string[];
  onToggle: (itemId: string) => void;
}

/** 调漆台左栏取用列表：原浆与已稀释漆料都在这里，单选（稀释）或多选（调漆） */
export function StockPicker({ rows, multiple, selectedIds, onToggle }: StockPickerProps) {
  const selected = new Set(selectedIds);

  return (
    <aside
      aria-label="取用漆料"
      data-mix-panel="stock"
      className="flex min-h-0 flex-col border bg-surface"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4"
        style={{ height: 56, borderColor: 'var(--ef-rule)' }}
      >
        <h2 className="text-[15px] font-bold">取用漆料</h2>
        <span data-stock-count="" className="ef-field text-[12px] text-text-2">
          {'已选 ' + selectedIds.length + ' 件'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] leading-relaxed text-text-2">
          仓库里没有可用的漆料。
          <br />
          先去采购入库，或把调漆台批次入库。
        </p>
      ) : (
        <div
          role={multiple ? 'group' : 'radiogroup'}
          aria-label={multiple ? '调漆组分列表' : '取用漆料列表'}
          className="min-h-0 flex-1 overflow-auto"
        >
          <ul>
            {rows.map((row) => {
              const checked = selected.has(row.item.id);
              const low = isLowVolume(row.volumeMl, row.item.initialMl);
              return (
                <li key={row.item.id}>
                  <button
                    type="button"
                    role={multiple ? 'checkbox' : 'radio'}
                    aria-checked={checked}
                    aria-label={(low ? '容量偏低，' : '') + (row.mixed ? row.name : row.code + ' ' + row.name)}
                    data-stock-item={row.item.id}
                    data-code={row.code}
                    data-state={row.state}
                    data-mixed={row.mixed ? '' : undefined}
                    data-dilution={row.dilutionRatioN ?? undefined}
                    data-low-volume={low ? '' : undefined}
                    onClick={() => onToggle(row.item.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 border-b border-l-4 px-3 py-2 text-left transition-colors duration-hover',
                      checked
                        ? 'border-l-[var(--ef-trace)] bg-surface-2'
                        : 'border-l-transparent hover:border-l-[var(--ef-rule)] hover:bg-surface-2',
                    )}
                    style={{ minHeight: 68, borderBottomColor: 'var(--ef-rule)' }}
                  >
                    {row.paint ? (
                      <PaintSwatch
                        hex={row.hex}
                        paintClass={row.paint.paintClass}
                        size={36}
                        alpha={row.alpha}
                        undefinedColor={row.undefinedColor}
                      />
                    ) : (
                      <span aria-hidden="true" className="h-9 w-9 shrink-0 border bg-surface-3" style={{ borderColor: 'var(--ef-rule)' }} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="ef-field flex items-baseline justify-between gap-2 text-[12px] text-text-1">
                        <span className="truncate">{row.mixed ? row.name : row.code}</span>
                        <span className="shrink-0 text-[11px] text-text-2">{formatMl(row.volumeMl) + ' ml'}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {low && <LowVolumeTag />}
                        {row.dilutionRatioN !== null && <DilutionTag ratioN={row.dilutionRatioN} />}
                        {!row.mixed && <span className="truncate text-[13px] text-text-1">{row.name}</span>}
                        {row.mixed ? (
                          <span className="ef-tag shrink-0" title="库里的调漆产物，只按自定义名称显示">
                            调漆
                          </span>
                        ) : row.state === 'thinned' && row.dilutionRatioN === null ? (
                          <span className="ef-tag shrink-0" title="仓库里的已稀释漆料（可直接调漆，也可继续稀释）">
                            {formatRatio(row.ratioN)}
                          </span>
                        ) : row.state === 'neat' ? (
                          <span
                            className="shrink-0 border px-1 text-[10px] text-text-2"
                            title="未经稀释的原浆：只能在仓库与调漆台之间流转"
                            style={{ borderColor: 'var(--ef-rule)' }}
                          >
                            原浆
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-text-2" style={{ borderColor: 'var(--ef-rule)' }}>
        {multiple
          ? '调漆：勾选多个组分（可含调漆产物），右侧选算法并填配比 / 用量'
          : '稀释：选中一支原浆或已稀释漆料'}
      </p>
    </aside>
  );
}
