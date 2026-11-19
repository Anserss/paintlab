import type { ChangeEvent } from 'react';
import { CLASS_ZH, FINISH_ZH } from '@/core/render/label';
import { Segmented } from '@/components/ui';
import type { FilterOptions, ProcureFilters, ProcureSort } from './procureFilters';

const SORT_OPTIONS: readonly { value: ProcureSort; label: string }[] = [
  { value: 'code', label: '色号' },
  { value: 'hue', label: '色相' },
];

const SELECT_CLASS =
  'h-10 cursor-pointer border bg-transparent px-3 text-[13px] text-text-2 transition-colors duration-hover hover:border-text-1';

export interface ProcureToolbarProps {
  filters: ProcureFilters;
  options: FilterOptions;
  total: number;
  onChange: (patch: Partial<ProcureFilters>) => void;
}

/** 色号列表顶部：搜索 + 产品线 / 漆类 / 光泽 / 仅未入库 + 排序（spec 3.2） */
const KIND_OPTIONS = [
  { value: 'color' as const, label: '颜色' },
  { value: 'aux' as const, label: '辅料' },
];

export function ProcureToolbar({ filters, options, total, onChange }: ProcureToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b bg-surface px-4 py-3"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <Segmented
        ariaLabel="货架"
        options={KIND_OPTIONS}
        value={filters.kind}
        onChange={(kind) => onChange({ kind, lineId: '', paintClass: '' })}
      />
      <input
        aria-label="搜索色号、名称、色值或属性"
        value={filters.query}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange({ query: event.target.value })}
        placeholder="搜索 色号 / 名称 / 色值 / 属性"
        className="ef-input h-10 w-64"
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
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text-2">
        <input
          type="checkbox"
          aria-label="仅未入库"
          checked={filters.unregisteredOnly}
          onChange={(event) => onChange({ unregisteredOnly: event.target.checked })}
          className="h-4 w-4"
          style={{ accentColor: 'var(--ef-ink)' }}
        />
        仅未入库
      </label>
      <div className="ml-auto flex items-center gap-3">
        <span className="ef-field text-[12px] text-text-2" data-procure-count="">
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
