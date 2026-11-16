import type { ChangeEvent } from 'react';
import { CLASS_ZH, FINISH_ZH } from '@/core/render/label';
import { Segmented } from '@/components/ui';
import type { FilterOptions, ProcureFilters, ProcureSort } from './procureFilters';

const SORT_OPTIONS: readonly { value: ProcureSort; label: string }[] = [
  { value: 'code', label: '色号' },
  { value: 'hue', label: '色相' },
];

const SELECT_CLASS =
  'h-8 cursor-pointer border border-line bg-bg-0 px-2 text-xs text-text-2 transition-colors duration-hover hover:border-line-strong';

export interface ProcureToolbarProps {
  filters: ProcureFilters;
  options: FilterOptions;
  total: number;
  onChange: (patch: Partial<ProcureFilters>) => void;
}

/** 色号列表顶部：搜索 + 产品线 / 漆类 / 光泽 / 仅未入库 + 排序（spec 3.2） */
export function ProcureToolbar({ filters, options, total, onChange }: ProcureToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-1 px-3 py-2">
      <input
        aria-label="搜索色号、名称、色值或属性"
        value={filters.query}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ query: event.target.value })}
        placeholder="搜索 色号 / 名称 / 色值 / 属性"
        className="h-8 w-60 border border-line bg-bg-0 px-2 text-xs text-text-1 placeholder:text-text-3 hover:border-line-strong"
      />
      <select
        aria-label="产品线"
        value={filters.lineId}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange({ lineId: event.target.value })}
        className={SELECT_CLASS}
      >
        <option value="">全部产品线</option>
        {options.lines.map((line) => (
          <option key={line.id} value={line.id}>
            {line.name}
          </option>
        ))}
      </select>
      <select
        aria-label="漆类"
        value={filters.paintClass}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange({ paintClass: event.target.value as ProcureFilters['paintClass'] })
        }
        className={SELECT_CLASS}
      >
        <option value="">全部漆类</option>
        {options.classes.map((value) => (
          <option key={value} value={value}>
            {CLASS_ZH[value]}
          </option>
        ))}
      </select>
      <select
        aria-label="光泽"
        value={filters.finish}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange({ finish: event.target.value as ProcureFilters['finish'] })
        }
        className={SELECT_CLASS}
      >
        <option value="">全部光泽</option>
        {options.finishes.map((value) => (
          <option key={value} value={value}>
            {FINISH_ZH[value]}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-2">
        <input
          type="checkbox"
          aria-label="仅未入库"
          checked={filters.unregisteredOnly}
          onChange={(event) => onChange({ unregisteredOnly: event.target.checked })}
          className="accent-accent"
        />
        仅未入库
      </label>
      <div className="ml-auto flex items-center gap-2">
        <span className="t-readout text-[11px] text-text-3" data-procure-count="">
          {total} 条
        </span>
        <Segmented<ProcureSort>
          options={SORT_OPTIONS}
          value={filters.sort}
          onChange={(sort) => onChange({ sort })}
          ariaLabel="排序"
        />
      </div>
    </div>
  );
}
