import { useEffect, useState } from 'react';
import { cn } from './cn';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 小数位，默认 1 */
  precision?: number;
  unit?: string;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: number) => void;
  className?: string;
}

const roundTo = (n: number, precision: number) => {
  const f = Math.pow(10, precision);
  return Math.round(n * f) / f;
};

/** NumericStepper：32px 高，[-] 值 [+]，输入非法时红描边 + 60ms 抖动（4.5.3） */
export function Stepper({
  value,
  min,
  max,
  step = 0.1,
  precision = 1,
  unit,
  disabled,
  ariaLabel,
  onChange,
  className,
}: StepperProps) {
  const [text, setText] = useState(value.toFixed(precision));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value.toFixed(precision));
  }, [value, precision]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setInvalid(true);
      window.setTimeout(() => setInvalid(false), 200);
      setText(value.toFixed(precision));
      return;
    }
    setText(roundTo(parsed, precision).toFixed(precision));
    onChange(roundTo(parsed, precision));
  };

  const nudge = (dir: 1 | -1) => {
    const next = roundTo(Math.min(max, Math.max(min, value + dir * step)), precision);
    onChange(next);
    setText(next.toFixed(precision));
  };

  return (
    <div
      className={cn(
        'inline-flex h-8 items-stretch border bg-bg-1',
        invalid ? 'border-danger' : 'border-line',
        invalid && 'animate-[shake_60ms_ease-in-out_2]',
        className,
      )}
    >
      <button
        type="button"
        aria-label={'减少' + ariaLabel}
        disabled={disabled || value <= min}
        onClick={() => nudge(-1)}
        className="w-7 text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1 disabled:opacity-40"
      >
        −
      </button>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        className="t-readout w-14 border-x border-line bg-transparent px-1 text-center text-xs text-text-1 disabled:opacity-40"
      />
      {unit && <span className="flex items-center pr-1 text-[10px] text-text-3">{unit}</span>}
      <button
        type="button"
        aria-label={'增加' + ariaLabel}
        disabled={disabled || value >= max}
        onClick={() => nudge(1)}
        className="w-7 text-text-2 transition-colors duration-hover hover:bg-surface-2 hover:text-text-1 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
