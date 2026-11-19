import { cn } from '@/components/ui';

/**
 * 2.2「容量偏低」小牌：红底白字，只出现在名称栏最前面（用户明确要求）。
 * 数据判定在 core/rules/low-volume.ts；本组件不带任何业务状态。
 */
export function LowVolumeTag({ className, title }: { className?: string; title?: string }) {
  return (
    <span
      data-low-volume-tag=""
      title={title ?? '此操作后容量偏低，为防止影响你的涂装请注意。'}
      className={cn('ef-low-volume-tag', className)}
    >
      容量偏低
    </span>
  );
}
