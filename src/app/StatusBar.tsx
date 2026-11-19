import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatMl } from '@/core/math/quantity';
import { useAppStore } from '@/store';
import { ROUTE_LABELS } from './nav';

const pad = (value: number): string => (value < 10 ? '0' + value : String(value));

/** 单条回执在状态条上的停留时长（2.1：不再有右下角浮动提示） */
export const MESSAGE_HOLD_MS = 4200;

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

/**
 * 状态条（36px）：面包屑 / 最近一条回执 / 库存总量 / 撤销·反撤销 / 时钟。
 * 2.1 把「右下角操作提示」收成这里的一行原文，4.2 s 自动消失，不遮挡操作区。
 */
export function StatusBar() {
  const location = useLocation();
  const breadcrumb = useAppStore((state) => state.breadcrumb);
  const undoCount = useAppStore((state) => state.undoCount);
  const redoCount = useAppStore((state) => state.redoCount);
  const undoLabel = useAppStore((state) => state.undoLabel);
  const redoLabel = useAppStore((state) => state.redoLabel);
  const undoDepth = useAppStore((state) => state.undoDepth);
  const stockTotalMl = useAppStore((state) => state.stockTotalMl);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const messages = useAppStore((state) => state.toasts);
  const clearToasts = useAppStore((state) => state.clearToasts);
  const clock = useClock();

  const latest = messages.length > 0 ? messages[messages.length - 1] : null;
  const latestId = latest?.id ?? null;
  const latestAt = latest?.createdAt ?? 0;

  useEffect(() => {
    if (!latestId) return;
    const timer = window.setTimeout(() => clearToasts(), MESSAGE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [latestId, latestAt, clearToasts]);

  const routeLabel = ROUTE_LABELS[location.pathname] ?? '采购';
  const crumbs = breadcrumb && breadcrumb.length > 0 ? breadcrumb : [routeLabel];
  const undoTitle =
    undoCount === 0 ? '没有可撤销的操作（最多 ' + undoDepth + ' 步）' : '撤销：' + (undoLabel ?? '') + '（Ctrl+Z）';
  const redoTitle =
    redoCount === 0 ? '没有可反撤销的操作（最多 ' + undoDepth + ' 步）' : '反撤销：' + (redoLabel ?? '') + '（Ctrl+Shift+Z）';

  return (
    <div className="ef-status">
      <nav aria-label="面包屑" data-slot="breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="t-label shrink-0">PD</span>
        {crumbs.map((crumb, index) => (
          <span key={crumb + '-' + index} className="flex min-w-0 items-center gap-1.5">
            <span className="text-text-3">/</span>
            <span
              className={
                index === crumbs.length - 1
                  ? 'truncate font-medium text-text-1'
                  : 'truncate text-text-3'
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {latest && (
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-slot="message"
          data-tone={latest.tone ?? 'neutral'}
          title={latest.message}
          className="ef-status__message"
        >
          {latest.message}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span data-slot="stock-total" title="库存总量" className="ef-field text-text-2">
          库存 {formatMl(stockTotalMl)} ml
        </span>

        <div role="group" aria-label="撤销与反撤销" className="flex items-center gap-1.5">
          <button
            type="button"
            data-action="undo"
            onClick={() => {
              void undo();
            }}
            disabled={undoCount === 0}
            title={undoTitle}
            className="ef-status__undo"
          >
            {'↶ 撤销 (' + undoCount + '/' + undoDepth + ')'}
          </button>
          <button
            type="button"
            data-action="redo"
            onClick={() => {
              void redo();
            }}
            disabled={redoCount === 0}
            title={redoTitle}
            className="ef-status__undo"
          >
            {'↷ 反撤销 (' + redoCount + '/' + undoDepth + ')'}
          </button>
        </div>

        <time className="ef-field text-text-2" dateTime={clock}>
          {clock}
        </time>
      </div>
    </div>
  );
}
