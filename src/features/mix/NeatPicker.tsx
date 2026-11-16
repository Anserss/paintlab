import { formatMl } from '@/core/math/quantity';
import { cn } from '@/components/ui';
import { PaintSwatch } from '@/components/paint';
import type { NeatRow } from './useMixData';

export interface NeatPickerProps {
  rows: NeatRow[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
}

/** 左栏「取用原浆」：色块 + 色号 + 中文名 + 余量，单选（3.4.1） */
export function NeatPicker({ rows, selectedId, onSelect }: NeatPickerProps) {
  return (
    <aside
      aria-label="取用原浆"
      data-mix-panel="neat"
      className="flex min-h-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">取用原浆</h2>
        <span data-neat-count="" className="t-readout text-[10px] text-text-3">
          {'已选 ' + (selectedId ? 1 : 0) + ' 件'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] leading-relaxed text-text-3">
          暂无原浆条目。
          <br />
          先去仓库登记或采购。
        </p>
      ) : (
        <div role="radiogroup" aria-label="原浆列表" className="min-h-0 flex-1 overflow-auto">
          <ul>
            {rows.map((row) => {
              const selected = row.item.id === selectedId;
              return (
                <li key={row.item.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={row.code + ' ' + row.name}
                    data-neat-item={row.item.id}
                    data-code={row.code}
                    onClick={() => onSelect(row.item.id)}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors duration-hover',
                      selected ? 'bg-surface-2 u-selected' : 'hover:bg-surface-2',
                    )}
                  >
                    {row.paint ? (
                      <PaintSwatch hex={row.paint.hex} paintClass={row.paint.paintClass} size={24} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-6 w-6 shrink-0 border border-line bg-surface-3"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="t-readout text-[11px] text-text-1">{row.code}</span>
                        <span className="t-readout text-[10px] text-text-2">
                          {formatMl(row.volumeMl) + ' ml'}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-text-2">{row.name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="border-t border-line px-3 py-2 text-[10px] text-text-3">
        仅列出 state=neat 的原浆条目
      </p>
    </aside>
  );
}
