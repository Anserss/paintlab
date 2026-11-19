import { formatMl } from '@/core/math/quantity';
import { stockLook } from '@/core/render/batch';
import { LOW_VOLUME_MESSAGE } from '@/core/rules/low-volume';
import { Button, Dialog } from '@/components/ui';
import { useAppStore } from '@/store';

interface AlertRow {
  id: string;
  name: string;
  code: string;
  volumeMl: number;
  initialMl: number;
}

/**
 * 2.2 容量偏低弹窗（全局一处）：
 * 任何一次扣减操作后，若有条目余量低于「原有容量 20%」或「10 ml」，
 * 由 store 的 lowVolumeAlert 触发；这里只负责把 itemId 解析成名称并展示。
 */
export function LowVolumeDialog() {
  const alert = useAppStore((state) => state.lowVolumeAlert);
  const stockItems = useAppStore((state) => state.stockItems);
  const paintsById = useAppStore((state) => state.paintsById);
  const dismissLowVolumeAlert = useAppStore((state) => state.dismissLowVolumeAlert);

  const rows: AlertRow[] = (alert ?? []).map((notice) => {
    const item = stockItems.find((row) => row.id === notice.itemId);
    const paint = item ? paintsById[item.paintId] : undefined;
    const look = item && paint ? stockLook(item, paint) : null;
    return {
      id: notice.itemId,
      name: look?.name ?? paint?.nameZh ?? paint?.name ?? '漆料',
      code: paint?.code ?? '—',
      volumeMl: item?.volumeMl ?? notice.volumeMl,
      initialMl: item?.initialMl ?? notice.initialMl,
    };
  });

  return (
    <Dialog
      open={rows.length > 0}
      onOpenChange={(open) => {
        if (!open) dismissLowVolumeAlert();
      }}
      title="容量偏低"
      description={LOW_VOLUME_MESSAGE}
      width={420}
      footer={
        <Button variant="primary" data-action="dismiss-low-volume" onClick={dismissLowVolumeAlert}>
          知道了
        </Button>
      }
    >
      <div data-low-volume-dialog="" className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={row.id}
              data-low-volume-item={row.id}
              className="flex items-baseline justify-between gap-2 border px-2 py-1.5"
              style={{ borderColor: 'var(--ef-rule)' }}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="ef-field shrink-0 text-[12px] text-text-2">{row.code}</span>
                <span className="truncate text-[13px] text-text-1">{row.name}</span>
              </span>
              <span className="ef-field shrink-0 text-[12px] text-text-1">
                {formatMl(row.volumeMl) + ' / ' + formatMl(row.initialMl) + ' ml'}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-relaxed text-text-2">
          判定线：余量低于原有容量的 20% 或 10 ml。余量归 0 ml 的条目已自动从仓库删除（可撤销）。
        </p>
      </div>
    </Dialog>
  );
}
