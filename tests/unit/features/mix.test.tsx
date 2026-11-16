import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Bottle, Paint } from '@/core/model/types';
import { DEFAULT_SETTINGS } from '@/core/model/types';
import { fractionLabel, levelFraction, levelReading, quantizeLevel } from '@/core/render/bottle';
import { createBottle } from '@/data/repos/bottle';
import type { DepotStore } from '@/data/db';
import { createMemoryStore, setStore } from '@/data/db';
import { clearHistory } from '@/data/repos/history';
import { createStockItem } from '@/data/repos/stock';
import { MixPage } from '@/features/mix/MixPage';
import { useAppStore } from '@/store';

const PAINT: Paint = {
  id: 'gsi-c80',
  lineId: 'gsi-mr-color',
  brandId: 'gsi',
  code: 'C80',
  name: 'German Grey',
  nameZh: '钴蓝',
  hex: '#2E5E9F',
  paintClass: 'solid',
  category: 'color',
  finish: 'gloss',
  origin: 'seed',
};

const THINNER: Paint = {
  id: 'gsi-t111',
  lineId: 'gsi-mr-thinner',
  brandId: 'gsi',
  code: 'T111',
  name: 'Mr. Thinner',
  nameZh: '稀释剂',
  hex: '#F5F5F5',
  paintClass: 'aux',
  category: 'thinner',
  origin: 'seed',
};

let store: DepotStore;

const resetAppState = () => {
  useAppStore.setState({
    bottles: [],
    stockItems: [],
    groups: [],
    tree: [],
    stockAggregate: {},
    stockTotalMl: 0,
    inventoryReady: false,
    paintsById: { [PAINT.id]: PAINT, [THINNER.id]: THINNER },
    brands: [],
    toasts: [],
    selected: [],
    settings: { ...DEFAULT_SETTINGS },
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
  });
};

beforeEach(async () => {
  store = createMemoryStore();
  setStore(store);
  await clearHistory(store);
  resetAppState();
});

async function seedStocks(neatMl: number, thinnerMl: number): Promise<{ sourceId: string; thinnerId: string }> {
  const source = await createStockItem(store, { paint: PAINT, initialMl: neatMl, state: 'neat', groupId: null });
  if (!source.ok) throw new Error(source.error);
  const thinner = await createStockItem(store, { paint: THINNER, initialMl: thinnerMl, state: 'neat', groupId: null });
  if (!thinner.ok) throw new Error(thinner.error);
  await useAppStore.getState().refreshInventory();
  return { sourceId: source.data.item.id, thinnerId: thinner.data.item.id };
}

async function seedBottle(
  capacityMl: number,
  remainingMl: number,
  options: { baselineMl?: number; ratioN?: number } = {},
): Promise<Bottle> {
  const created = await createBottle(store, {
    name: capacityMl + ' ml 瓶',
    capacityMl,
    ratioN: options.ratioN ?? 2,
  });
  if (!created.ok) throw new Error(created.error);
  const bottle: Bottle = {
    ...created.data,
    remainingMl,
    baselineMl: options.baselineMl ?? remainingMl,
  };
  await store.bottles.put(bottle);
  await useAppStore.getState().refreshBottles();
  return bottle;
}

const resultOf = (key: 'neat' | 'thinner' | 'total'): string =>
  document.querySelector('[data-result="' + key + '"]')?.textContent ?? '';

describe('AC-01 稀释正算（指定原浆量）', () => {
  it('A=10、N=2 → 稀释剂 20.0、合计 30.0，且在界面上可见', async () => {
    await seedBottle(60, 0);
    await seedStocks(18, 100);
    const view = render(<MixPage />);

    await screen.findByText('取用原浆');
    fireEvent.click(screen.getByLabelText('指定原浆量'));

    const neatInput = screen.getByLabelText('原浆量 A') as HTMLInputElement;
    fireEvent.change(neatInput, { target: { value: '10' } });

    expect(resultOf('neat')).toBe('10.0');
    expect(resultOf('thinner')).toBe('20.0');
    expect(resultOf('total')).toBe('30.0');

    // 界面上可见（不只是 data 属性）
    const results = view.container.querySelector('[data-mix-results]') as HTMLElement;
    expect(within(results).getByText('稀释剂')).not.toBeNull();
    expect(within(results).getByText('合计')).not.toBeNull();
    expect(results.textContent).toContain('20.0');
    expect(results.textContent).toContain('30.0');
  });
});

describe('AC-02 补满算法', () => {
  it('C=60、R=10、N=2 → 16.6 / 33.2 / 49.8，调配后 remaining=baseline=59.8', async () => {
    const bottle = await seedBottle(60, 10);
    const { sourceId, thinnerId } = await seedStocks(18, 100);
    const view = render(<MixPage />);

    await screen.findByText('取用原浆');
    await waitFor(() => expect(resultOf('neat')).toBe('16.6'));

    expect(resultOf('thinner')).toBe('33.2');
    expect(resultOf('total')).toBe('49.8');
    expect(document.querySelector('[data-raw="neat"]')?.textContent).toBe('取整前 16.67');

    // 补满模式的已知量来自瓶身
    expect((screen.getByLabelText('瓶容量 C') as HTMLInputElement).value).toBe('60.0');
    expect((screen.getByLabelText('当前余量 R') as HTMLInputElement).value).toBe('10.0');

    // 左栏为 state='neat' 的条目，单选
    const rows = view.container.querySelectorAll('[data-neat-item]');
    expect(rows).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-neat-item][aria-checked="true"]')).toHaveLength(1);

    const mixButton = view.container.querySelector('[data-action="mix"]') as HTMLButtonElement;
    expect(mixButton.disabled).toBe(false);
    fireEvent.click(mixButton);

    await waitFor(() => expect(useAppStore.getState().bottles[0]?.remainingMl).toBe(59.8));
    expect(useAppStore.getState().bottles[0]?.baselineMl).toBe(59.8);

    const state = useAppStore.getState();
    const toast = state.toasts[state.toasts.length - 1];
    expect(toast?.message).toContain('已调配');
    expect(toast?.actionLabel).toBe('撤销');

    const records = await store.mixRecords.toArray();
    expect(records).toHaveLength(1);
    expect(records[0].neatMl).toBe(16.6);
    expect(records[0].thinnerMl).toBe(33.2);
    expect(records[0].totalMl).toBe(49.8);
    expect(records[0].filledToMl).toBe(59.8);

    expect((await store.stockItems.get(sourceId))?.volumeMl).toBe(1.4);
    expect((await store.stockItems.get(thinnerId))?.volumeMl).toBe(66.8);

    // 最近配方随调配出现，并带「复现」
    await waitFor(() => expect(view.container.querySelector('[data-recipe]')).not.toBeNull());
    expect(view.container.querySelector('[data-recipe]')?.textContent).toContain('原浆 16.6');
    expect(view.container.querySelector('[data-recipe]')?.textContent).toContain('49.8');
    expect(view.container.querySelectorAll('[data-action="reproduce"]')).toHaveLength(1);
    expect(bottle.id).toBe(records[0].bottleId);
  });
});

describe('AC-03 液位读数直接来自 core', () => {
  it('baseline 60 / remaining 40 → 读数「≈ 2/3（67%）」', async () => {
    await seedBottle(60, 40, { baselineMl: 60 });
    await seedStocks(18, 100);
    const view = render(<MixPage />);

    const expected = levelReading(levelFraction(40, 60, 60, 'baseline'));
    expect(expected).toBe('≈ 2/3（67%）');
    expect(fractionLabel(quantizeLevel(levelFraction(40, 60, 60, 'baseline')))).toBe('2/3');

    await screen.findByText('取用原浆');

    const stage = view.container.querySelector('[data-stage-reading]');
    expect(stage?.getAttribute('data-stage-reading')).toBe(expected);
    expect(stage?.textContent).toContain('≈ 2/3（67%）');

    const svg = view.container.querySelector('[data-bottle-view]');
    expect(svg?.getAttribute('data-level-reading')).toBe(expected);
    expect(view.container.querySelector('[data-baseline]')?.textContent).toBe('基准 上次 60.0 ml');
  });
});

describe('AC-05 溢出拦截', () => {
  it('C=100、R=9、N=1、A=99 → 提示 45.5，瓶与库存均不变', async () => {
    const bottle = await seedBottle(100, 9);
    const { sourceId } = await seedStocks(99, 100);
    const view = render(<MixPage />);

    await screen.findByText('取用原浆');
    fireEvent.click(screen.getByLabelText('指定原浆量'));
    fireEvent.change(screen.getByLabelText('原浆量 A'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('比例 N'), { target: { value: '1' } });

    const alerts = await screen.findAllByRole('alert');
    const overflow = alerts.find((node) => (node.textContent ?? '').includes('45.5'));
    expect(overflow).toBeTruthy();
    expect(overflow?.textContent).toBe('超出瓶容量：本次最多可加原浆 45.5 ml（1:1）');
    expect(view.container.querySelectorAll('[data-blocker]')).toHaveLength(1);

    const mixButton = view.container.querySelector('[data-action="mix"]') as HTMLButtonElement;
    expect(mixButton.disabled).toBe(true);
    fireEvent.click(mixButton);

    expect(await store.mixRecords.toArray()).toHaveLength(0);
    expect(useAppStore.getState().bottles[0]?.remainingMl).toBe(9);
    expect(await store.bottles.get(bottle.id)).toMatchObject({ remainingMl: 9, baselineMl: 9 });
    expect((await store.stockItems.get(sourceId))?.volumeMl).toBe(99);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});

describe('比例输入（3.4.2 0–10 / 步进 0.1 / 非法钳制）', () => {
  it('超出范围钳制到 0–10 并给出抖动提示，结果按钳制后的比例重算', async () => {
    await seedBottle(60, 0);
    await seedStocks(18, 100);
    render(<MixPage />);
    await screen.findByText('取用原浆');

    const ratio = screen.getByLabelText('比例 N') as HTMLInputElement;
    await waitFor(() => expect(resultOf('neat')).toBe('20.0'));

    fireEvent.change(ratio, { target: { value: '99' } });
    expect(ratio.value).toBe('10.0');
    expect(document.querySelector('[data-ratio-clamped]')).not.toBeNull();
    // 补满：剩余空间 60，N=10 → 原浆 floor1(60/11) = 5.4
    expect(resultOf('neat')).toBe('5.4');

    fireEvent.change(ratio, { target: { value: '-1' } });
    expect(ratio.value).toBe('0.0');
    expect(document.querySelector('[data-ratio-clamped]')).not.toBeNull();
    expect(resultOf('neat')).toBe('60.0');
    expect(resultOf('thinner')).toBe('0.0');

    fireEvent.change(ratio, { target: { value: '2' } });
    expect(ratio.value).toBe('2');
    expect(document.querySelector('[data-ratio-clamped]')).toBeNull();
    expect(resultOf('neat')).toBe('20.0');

    // 预设按钮 1:2.5 → 比例 2.5
    fireEvent.click(screen.getByText('1:2.5'));
    expect(ratio.value).toBe('2.5');
    expect(resultOf('neat')).toBe('17.1');
  });
});

describe('空状态与新建瓶（3.10 / 3.4.3）', () => {
  it('无瓶时显示「未装载调漆瓶」+ [新建 60 ml 瓶]，点击后创建 60 ml 瓶', async () => {
    await seedStocks(18, 100);
    const view = render(<MixPage />);

    const stage = view.container.querySelector('[data-mix-panel="bottle"]') as HTMLElement;
    expect(await within(stage).findByText('未装载调漆瓶')).not.toBeNull();
    expect(within(stage).getByText('选择容量后开始调配。')).not.toBeNull();

    fireEvent.click(within(stage).getByText('新建 60 ml 瓶'));
    await waitFor(() => expect(useAppStore.getState().bottles).toHaveLength(1));
    expect(useAppStore.getState().bottles[0].capacityMl).toBe(60);

    await waitFor(() =>
      expect(view.container.querySelector('[data-baseline]')?.textContent).toBe('基准 上次 0.0 ml'),
    );
  });
});

describe('AC-04 使用扣减', () => {
  it('瓶内 60.0 ml，使用 20.0 ml → remaining=40.0，baseline 不变', async () => {
    const bottle = await seedBottle(60, 60, { baselineMl: 60 });
    await seedStocks(18, 100);
    const view = render(<MixPage />);
    await screen.findByText('取用原浆');

    const amount = screen.getByLabelText('使用量') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '20' } });
    fireEvent.blur(amount);

    fireEvent.click(view.container.querySelector('[data-action="use"]') as HTMLButtonElement);

    await waitFor(() => expect(useAppStore.getState().bottles[0]?.remainingMl).toBe(40));
    expect(useAppStore.getState().bottles[0]?.baselineMl).toBe(60);
    expect((await store.bottles.get(bottle.id))?.remainingMl).toBe(40);
    const usage = await store.usageRecords.toArray();
    expect(usage).toHaveLength(1);
    expect(usage[0].amountMl).toBe(20);
  });
});

describe('瓶容量切换（updateBottleCapacity，3.4.3）', () => {
  it('60 → 30：瓶身容量变 30、余量不变、回执带撤销', async () => {
    const bottle = await seedBottle(60, 15);
    await seedStocks(18, 100);
    const view = render(<MixPage />);
    await screen.findByText('取用原浆');
    expect(view.container.querySelector('[data-capacity="60"]')?.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(view.container.querySelector('[data-capacity="30"]') as HTMLButtonElement);

    await waitFor(() => expect(useAppStore.getState().bottles[0]?.capacityMl).toBe(30));
    const next = useAppStore.getState().bottles[0];
    expect(next?.remainingMl).toBe(15);
    expect(await store.bottles.get(bottle.id)).toMatchObject({
      capacityMl: 30,
      remainingMl: 15,
      baselineMl: 15,
    });

    expect(view.container.querySelector('[data-capacity="30"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).toContain('瓶容量 · 30 ml');
    expect(view.container.textContent).toContain('剩余 15.0 / 15.0 ml');

    const state = useAppStore.getState();
    const toast = state.toasts[state.toasts.length - 1];
    expect(toast?.message).toContain('瓶容量已改为 30 ml');
    expect(toast?.actionLabel).toBe('撤销');
    expect((await store.ledger.toArray()).some((entry) => entry.type === 'adjust')).toBe(true);
  });

  it('新容量小于余量时被拒：容量不变，提示与 store 的 error 逐字一致', async () => {
    const bottle = await seedBottle(100, 40);
    await seedStocks(18, 100);
    const view = render(<MixPage />);
    await screen.findByText('取用原浆');

    fireEvent.click(view.container.querySelector('[data-capacity="30"]') as HTMLButtonElement);

    const notice = await waitFor(() => {
      const node = view.container.querySelector('[data-capacity-notice]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    const state = useAppStore.getState();
    const toast = state.toasts[state.toasts.length - 1];
    expect(notice.textContent).toBe('瓶内尚有 40 ml，请先倒出或选择 ≥ 40 ml 的瓶');
    expect(notice.textContent).toBe(toast?.message);

    expect(state.bottles[0]?.capacityMl).toBe(100);
    expect(state.bottles[0]?.remainingMl).toBe(40);
    expect((await store.bottles.get(bottle.id))?.capacityMl).toBe(100);
    expect(view.container.querySelector('[data-capacity="100"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((await store.ledger.toArray()).some((entry) => entry.type === 'adjust')).toBe(false);
  });
});

describe('无稀释剂库存的可行动提示（3.10：发生了什么 + 为什么 + 怎么办）', () => {
  async function seedOnlyNeat(neatMl: number): Promise<void> {
    const created = await createStockItem(store, { paint: PAINT, initialMl: neatMl, state: 'neat', groupId: null });
    if (!created.ok) throw new Error(created.error);
    await useAppStore.getState().refreshInventory();
  }

  it('缺 aux 稀释剂时给出三段式说明与「本次不扣减稀释剂」按钮', async () => {
    await seedBottle(60, 0);
    await seedOnlyNeat(30);
    const view = render(<MixPage />);
    await screen.findByText('取用原浆');

    const panel = await waitFor(() => {
      const node = view.container.querySelector('[data-thinner-missing]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // 发生了什么
    expect(panel.textContent).toContain('稀释剂 40.0 ml 无法从库存扣减');
    // 为什么
    expect(panel.textContent).toContain('原因：');
    expect(panel.textContent).toContain('暂无 aux 类稀释剂');
    expect(panel.textContent).toContain('扣减稀释剂库存');
    // 怎么办
    expect(panel.textContent).toContain('怎么办：');

    const skip = view.container.querySelector('[data-action="skip-thinner"]') as HTMLButtonElement;
    expect(skip).not.toBeNull();
    expect(skip.textContent).toBe('本次不扣减稀释剂');
    expect(skip.disabled).toBe(false);

    // 尚未关闭扣减：不标注「未扣库存」，且调配被拦
    expect(view.container.querySelector('[data-thinner-untracked]')).toBeNull();
    expect((view.container.querySelector('[data-action="mix"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('点击后 trackThinner=false、按钮消失、结果区标注未扣库存，且不产生 Command', async () => {
    await seedBottle(60, 0);
    await seedOnlyNeat(30);
    const view = render(<MixPage />);
    await screen.findByText('取用原浆');

    await useAppStore.getState().refreshHistory();
    const undoBefore = useAppStore.getState().undoCount;
    const commandsBefore = (await store.commands.toArray()).length;

    fireEvent.click(view.container.querySelector('[data-action="skip-thinner"]') as HTMLButtonElement);

    await waitFor(() => expect(useAppStore.getState().settings.trackThinner).toBe(false));
    await waitFor(() => expect(view.container.querySelector('[data-thinner-missing]')).toBeNull());

    const mark = view.container.querySelector('[data-thinner-untracked]');
    expect(mark?.textContent).toBe('（未扣库存）');
    expect(view.container.querySelector('[data-mix-results]')?.textContent).toContain('未扣库存');

    // 设置项立即生效、不进撤销栈
    expect((await store.settings.get('trackThinner'))?.value).toBe(false);
    expect(useAppStore.getState().undoCount).toBe(undoBefore);
    expect((await store.commands.toArray()).length).toBe(commandsBefore);
    const state = useAppStore.getState();
    const toast = state.toasts[state.toasts.length - 1];
    expect(toast?.message).toContain('已关闭「扣减稀释剂库存」');
    expect(toast?.message).toContain('不进入撤销栈');

    // 关闭后可以调配，且稀释剂确实不扣库存
    const mixButton = view.container.querySelector('[data-action="mix"]') as HTMLButtonElement;
    expect(mixButton.disabled).toBe(false);
    fireEvent.click(mixButton);

    await waitFor(() => expect(useAppStore.getState().bottles[0]?.remainingMl).toBe(60));
    const records = await store.mixRecords.toArray();
    expect(records).toHaveLength(1);
    expect(records[0].thinnerMl).toBe(40);
    expect(await store.stockItems.toArray()).toHaveLength(1);

    useAppStore.getState().refreshHistory();
    expect(useAppStore.getState().undoCount).toBe(undoBefore + 1);
  });
});
