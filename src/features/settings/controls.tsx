import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/components/ui';
import { clampNumber, formatNumber } from './settingsData';

export interface PanelProps {
  id: string;
  code: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** 设置页面板：描边分层，不用阴影（4.4） */
export function Panel({ id, code, title, description, children, className }: PanelProps) {
  const titleId = id + '-title';
  return (
    <section id={id} data-panel={id} aria-labelledby={titleId} className={cn('border border-line bg-surface', className)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <span className="t-label">{code}</span>
        <h2 id={titleId} className="t-display text-sm text-text-1">
          {title}
        </h2>
        {description && <p className="w-full text-xs leading-snug text-text-3">{description}</p>}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export interface SettingRowProps {
  setting?: string;
  value?: string | number | boolean;
  label: string;
  hint?: string;
  control: ReactNode;
}

export function SettingRow({ setting, value, label, hint, control }: SettingRowProps) {
  return (
    <div
      data-setting={setting}
      data-value={value === undefined ? undefined : String(value)}
      className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
    >
      <div className="min-w-0">
        <p className="text-xs text-text-1">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-text-3">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** 开关：role=switch + aria-checked，键盘可达 */
export function Switch({ checked, label, disabled, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-6 w-11 items-center border px-0.5 transition-colors duration-hover disabled:opacity-40',
        checked ? 'border-accent bg-surface-3' : 'border-line bg-surface-2',
      )}
    >
      <span
        className={cn(
          'block h-4 w-4 transition-transform duration-panel',
          checked ? 'translate-x-[22px] bg-accent' : 'translate-x-0 bg-text-3',
        )}
      />
    </button>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  precision?: number;
  unit?: string;
  onCommit: (value: number) => void;
}

/** 数值输入：越界输入被钳制进 [min, max] 后回写，不静默丢弃 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  precision = 0,
  unit,
  onCommit,
}: NumberFieldProps) {
  const [text, setText] = useState(formatNumber(value, precision));

  useEffect(() => {
    setText(formatNumber(value, precision));
  }, [value, precision]);

  const commit = (raw: string): void => {
    if (raw.trim() === '') {
      setText(formatNumber(value, precision));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setText(formatNumber(value, precision));
      return;
    }
    const next = clampNumber(parsed, min, max, precision);
    setText(formatNumber(next, precision));
    if (next !== value) onCommit(next);
  };

  const nudge = (direction: 1 | -1): void => {
    const next = clampNumber(value + direction * step, min, max, precision);
    setText(formatNumber(next, precision));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="inline-flex h-8 items-stretch border border-line bg-bg-1">
      <button
        type="button"
        aria-label={'减少' + label}
        disabled={value <= min}
        onClick={() => nudge(-1)}
        className="w-7 text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1 disabled:opacity-40"
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit((event.target as HTMLInputElement).value);
        }}
        className="t-readout w-14 border-x border-line bg-transparent px-1 text-center text-xs text-text-1"
      />
      {unit && <span className="flex items-center pr-1 text-[10px] text-text-3">{unit}</span>}
      <button
        type="button"
        aria-label={'增加' + label}
        disabled={value >= max}
        onClick={() => nudge(1)}
        className="w-7 text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
