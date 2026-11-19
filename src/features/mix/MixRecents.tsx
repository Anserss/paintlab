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

/** 最近配方（2.2 紧凑横条）：时间 / 合计 / 比例 + 稀释记录可复现 */
export function MixRecents({ records, onReproduce }: MixRecentsProps) {
  return (
    <section
      aria-label="最近配方"
      data-mix-panel="recents"
      className="flex shrink-0 flex-col border bg-surface"
      style={{ borderColor: 'var(--ef-rule)' }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-1.5">
        <h2 className="text-[12px] font-bold">最近配方</h2>
        <span className="ef-field text-[11px] text-text-2">{records.length + ' 条'}</span>
      </div>
      {records.length === 0 ? (
        <p className="px-4 pb-2 text-[11px] leading-relaxed text-text-2">
          本次会话暂无配方；完成一次稀释 / 调漆后会出现在这里。
        </p>
      ) : (
        <ul className="flex min-w-0 gap-1.5 overflow-x-auto px-3 pb-2">
          {records.map((record) => {
            const dilute = record.mode !== 'blend';
            return (
              <li
                key={record.id}
                data-recipe={record.id}
                className="flex shrink-0 items-center gap-2 border px-2 py-1"
                style={{ borderColor: 'var(--ef-rule)' }}
              >
                <time dateTime={new Date(record.at).toISOString()} className="ef-field shrink-0 text-[11px] text-text-2">
                  {clockOf(record.at)}
                </time>
                <span className="ef-field shrink-0 text-[11px] text-text-1">
                  {(dilute ? '稀释 ' : '调漆 ') + formatMl(record.totalMl) + ' ml · ' + formatRatio(record.ratioN)}
                </span>
                <span className="ef-field shrink-0 text-[10px] text-text-2">
                  {dilute
                    ? '原浆 ' + formatMl(record.neatMl) + ' / 稀释剂 ' + formatMl(record.thinnerMl)
                    : '组分 ' + String(record.parts?.length ?? 0) + ' 件'}
                </span>
                {dilute && (
                  <Button size="sm" variant="ghost" data-action="reproduce" onClick={() => onReproduce(record)}>
                    复现
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
