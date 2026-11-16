import type { MixRecord } from '@/core/model/types';
import { formatMl, formatRatio } from '@/core/math/quantity';
import { Button } from '@/components/ui';

export interface MixRecentsProps {
  records: MixRecord[];
  onReproduce: (record: MixRecord) => void;
}

const clockOf = (at: number): string => {
  const date = new Date(at);
  const pad = (value: number): string => (value < 10 ? '0' + value : String(value));
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
};

/** 最近配方：原浆 / 稀释剂 / 合计 / 比例 / 时间 + 复现（3.4.2 配方记忆） */
export function MixRecents({ records, onReproduce }: MixRecentsProps) {
  return (
    <section
      aria-label="最近配方"
      data-mix-panel="recents"
      className="flex min-h-0 flex-col border border-line bg-bg-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="t-display text-[11px] tracking-[0.1em] text-text-2">最近配方</h2>
        <span className="t-readout text-[10px] text-text-3">{records.length + ' 条'}</span>
      </div>

      {records.length === 0 ? (
        <p className="px-3 py-3 text-[11px] leading-relaxed text-text-3">
          本次会话暂无配方。
          <br />
          完成一次调配后会出现在这里。
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {records.map((record) => (
            <li
              key={record.id}
              data-recipe={record.id}
              className="flex items-center gap-2 border-b border-line px-3 py-1.5"
            >
              <time
                dateTime={new Date(record.at).toISOString()}
                className="t-readout shrink-0 text-[10px] text-text-3"
              >
                {clockOf(record.at)}
              </time>
              <span className="t-readout min-w-0 flex-1 truncate text-[10px] text-text-2">
                {'原浆 ' + formatMl(record.neatMl) + ' · 稀释剂 ' + formatMl(record.thinnerMl) + ' · 合计 ' + formatMl(record.totalMl) + ' · ' + formatRatio(record.ratioN)}
              </span>
              <Button size="sm" variant="ghost" data-action="reproduce" onClick={() => onReproduce(record)}>
                复现
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
