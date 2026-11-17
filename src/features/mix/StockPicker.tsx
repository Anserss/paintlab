import { formatMl, formatRatio } from '@/core/math/quantity';
import { Badge, cn } from '@/components/ui';
import { PaintSwatch } from '@/components/paint';
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
      className="flex min-h-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">取用漆料</h2>
        <span data-stock-count="" className="t-readout text-[10px] text-text-3">
          {'已选 ' + selectedIds.length + ' 件'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-text-3">
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
              return (
                <li key={row.item.id}>
                  <button
                    type="button"
                    role={multiple ? 'checkbox' : 'radio'}
                    aria-checked={checked}
                    aria-label={row.code + ' ' + row.name}
                    data-stock-item={row.item.id}
                    data-code={row.code}
                    data-state={row.state}
                    onClick={() => onToggle(row.item.id)}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors duration-hover',
                      checked ? 'bg-surface-2 u-selected' : 'hover:bg-surface-2',
                    )}
                  >
                    {row.paint ? (
                      <PaintSwatch hex={row.paint.hex} paintClass={row.paint.paintClass} size={24} />
                    ) : (
                      <span aria-hidden="true" className="h-6 w-6 shrink-0 border border-line bg-surface-3" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="t-readout text-[11px] text-text-1">{row.code}</span>
                        <span className="t-readout text-[10px] text-text-2">
                          {formatMl(row.volumeMl) + ' ml'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[11px] text-text-2">{row.name}</span>
                        {row.state === 'thinned' ? (
                          <Badge tone="accent" title="仓库里的已稀释漆料（可直接调漆，也可继续稀释）">
                            {formatRatio(row.ratioN)}
                          </Badge>
                        ) : (
                          <Badge title="未经稀释的原浆">原浆</Badge>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-text-3">
        {multiple
          ? '调漆：勾选多个组分，在右侧填份量或目标总容量'
          : '稀释：选中一支原浆或已稀释漆料'}
      </p>
    </aside>
  );
}
