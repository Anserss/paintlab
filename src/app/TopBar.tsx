import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatMl } from '@/core/math/quantity';
import { useAppStore } from '@/store';

export const ROUTE_LABELS: Record<string, string> = {
  '/procure': '采购',
  '/depot': '仓库',
  '/mix': '调漆',
  '/station': '工位',
  '/settings': '设置',
};

const pad = (value: number): string => (value < 10 ? '0' + value : String(value));

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

/** 顶部状态栏（高 44px）：面包屑槽位 + 库存总量 + 撤销/反撤销 + 等宽时钟（spec 3.1） */
export function TopBar() {
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
  const clock = useClock();

  const routeLabel = ROUTE_LABELS[location.pathname] ?? '采购';
  const crumbs = breadcrumb && breadcrumb.length > 0 ? breadcrumb : [routeLabel];
  const undoTitle =
    undoCount === 0 ? '没有可撤销的操作（最多 ' + undoDepth + ' 步）' : '撤销：' + (undoLabel ?? '') + '（Ctrl+Z）';
  const redoTitle =
    redoCount === 0 ? '没有可反撤销的操作（最多 ' + undoDepth + ' 步）' : '反撤销：' + (redoLabel ?? '') + '（Ctrl+Shift+Z）';

  return (
    <header className="tex-scan sticky top-0 z-[var(--z-topbar)] flex h-topbar shrink-0 items-center justify-between gap-4 border-b border-line bg-[rgba(10,11,12,.94)] px-4 backdrop-blur-[2px]">
      <nav
        aria-label="面包屑"
        data-slot="breadcrumb"
        className="flex min-w-0 items-center gap-1 overflow-hidden text-xs"
      >
        <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-text-3">PD</span>
        {crumbs.map((crumb, index) => (
          <span key={crumb + '-' + index} className="flex min-w-0 items-center gap-1">
            <span className="text-text-3">/</span>
            <span className={index === crumbs.length - 1 ? 'truncate text-text-1' : 'truncate text-text-2'}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-3">
        <span
          data-slot="stock-total"
          title="库存总量"
          className="inline-flex h-[18px] items-center border border-line px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text-2"
        >
          库存 {formatMl(stockTotalMl)} ml
        </span>

        <div role="group" aria-label="撤销与反撤销" className="flex items-center gap-1">
          <button
            type="button"
            data-action="undo"
            onClick={() => {
              void undo();
            }}
            disabled={undoCount === 0}
            title={undoTitle}
            className="inline-flex h-6 items-center border border-line px-1.5 font-mono text-[11px] text-text-1 transition-colors duration-hover hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
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
            className="inline-flex h-6 items-center border border-line px-1.5 font-mono text-[11px] text-text-1 transition-colors duration-hover hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {'↷ 反撤销 (' + redoCount + '/' + undoDepth + ')'}
          </button>
        </div>

        <time className="font-mono text-xs tabular-nums text-text-2" dateTime={clock}>
          {clock}
        </time>
      </div>
    </header>
  );
}
