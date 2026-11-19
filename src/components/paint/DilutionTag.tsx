import { formatRatio } from '@/core/math/quantity';
import { dilutionTagText } from '@/core/render/batch';
import { cn } from '@/components/ui';

export interface DilutionTagProps {
  /** 稀释比例 1:N */
  ratioN: number;
  className?: string;
}

/**
 * 稀释漆料名称前的灰底白字小牌：(1:2)稀释（2.1）。
 * 只做展示，不参与点击/拖拽；直角、无圆角，符合视觉铁律。
 */
export function DilutionTag({ ratioN, className }: DilutionTagProps) {
  return (
    <span
      data-dilution-tag={ratioN}
      title={'稀释漆料：原浆按 ' + formatRatio(ratioN) + ' 稀释，名称与色值沿用原浆'}
      className={cn('ef-dilution-tag shrink-0', className)}
    >
      {dilutionTagText(ratioN)}
    </span>
  );
}
