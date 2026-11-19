import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Paint, StockItem } from '@/core/model/types';
import { LOW_VOLUME_MESSAGE } from '@/core/rules/low-volume';
import { LowVolumeDialog } from '@/app/LowVolumeDialog';
import { useAppStore } from '@/store';

const PAINT: Paint = {
  id: 'gsi-c80',
  lineId: 'gsi-mr-color',
  brandId: 'gsi',
  code: 'C80',
  name: 'Cobalt Blue',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const ITEM: StockItem = {
  id: 'stock-1',
  paintId: PAINT.id,
  volumeMl: 8,
  initialMl: 60,
  state: 'neat',
  groupId: null,
  origin: 'custom',
  createdAt: 1,
};

beforeEach(() => {
  useAppStore.setState({
    lowVolumeAlert: null,
    stockItems: [],
    paintsById: {},
  });
});

describe('2.2 容量偏低弹窗', () => {
  it('展示需求原文 + 条目名称与余量；点「知道了」关闭', async () => {
    act(() => {
      useAppStore.setState({
        stockItems: [ITEM],
        paintsById: { [PAINT.id]: PAINT },
        lowVolumeAlert: [{ itemId: ITEM.id, volumeMl: 8, initialMl: 60 }],
      });
    });

    render(<LowVolumeDialog />);
    await waitFor(() => expect(screen.getByText('容量偏低')).not.toBeNull());
    expect(document.body.textContent).toContain(LOW_VOLUME_MESSAGE);
    expect(document.body.textContent).toContain('C80');
    expect(document.body.textContent).toContain('钴蓝');
    expect(document.body.textContent).toContain('8.0 / 60.0 ml');

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    await waitFor(() => expect(useAppStore.getState().lowVolumeAlert).toBeNull());
  });

  it('没有提示时不渲染弹窗', () => {
    render(<LowVolumeDialog />);
    expect(document.body.textContent).not.toContain(LOW_VOLUME_MESSAGE);
  });
});
