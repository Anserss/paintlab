import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bottle, MixRecord, Paint } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { useAppStore } from '@/store';
import { BottleStage } from './BottleStage';
import { MixCalculator } from './MixCalculator';
import { MixRecents } from './MixRecents';
import { NeatPicker } from './NeatPicker';
import type { MixMode } from './mixMath';
import {
  CAPACITY_MAX,
  CAPACITY_MIN,
  parseMl,
  parseRatio,
  planFor,
  stockShortText,
} from './mixMath';
import { useMixRecords, useNeatRows, useThinnerRows } from './useMixData';

type PaintRef = Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'hex' | 'paintClass'>;

const paintRefOf = (paint: Paint): PaintRef => ({
  id: paint.id,
  brandId: paint.brandId,
  code: paint.code,
  name: paint.name,
  hex: paint.hex,
  paintClass: paint.paintClass,
});

/** 调漆台（3.4）：左取用 / 中瓶 / 右计算器 + 最近配方 */
export function MixPage() {
  const bottles = useAppStore((state) => state.bottles);
  const brands = useAppStore((state) => state.brands);
  const paintsById = useAppStore((state) => state.paintsById);
  const settings = useAppStore((state) => state.settings);
  const refreshInventory = useAppStore((state) => state.refreshInventory);
  const refreshBottles = useAppStore((state) => state.refreshBottles);
  const ensureBrand = useAppStore((state) => state.ensureBrand);
  const newBottle = useAppStore((state) => state.newBottle);
  const mixIntoBottle = useAppStore((state) => state.mixIntoBottle);
  const useBottleAction = useAppStore((state) => state.useBottle);
  const clearBottle = useAppStore((state) => state.clearBottle);
  const updateBottleCapacity = useAppStore((state) => state.updateBottleCapacity);
  const archiveBottle = useAppStore((state) => state.archiveBottle);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const pushToast = useAppStore((state) => state.pushToast);

  const neatRows = useNeatRows();
  const thinnerRows = useThinnerRows();
  const records = useMixRecords(8);

  const bottle: Bottle | undefined = bottles.length > 0 ? bottles[0] : undefined;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thinnerId, setThinnerId] = useState<string | null>(null);
  const [mode, setMode] = useState<MixMode>('fill');
  const [ratioN, setRatioN] = useState(bottle?.ratioN ?? settings.defaultRatio);
  const [ratioText, setRatioText] = useState(String(bottle?.ratioN ?? settings.defaultRatio));
  const [ratioClamped, setRatioClamped] = useState(false);
  const [neatText, setNeatText] = useState('10.0');
  const [totalText, setTotalText] = useState('30.0');
  const [capacity, setCapacity] = useState(settings.defaultBottleMl);
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);
  const [useAmount, setUseAmount] = useState(10);

  useEffect(() => {
    void refreshInventory();
    void refreshBottles();
  }, [refreshInventory, refreshBottles]);

  /** 目录包懒加载：本页只依赖 paintsById，缺漆料时无法取用 */
  const brandsRequested = useRef(false);
  useEffect(() => {
    if (brandsRequested.current || brands.length === 0) return;
    brandsRequested.current = true;
    void (async () => {
      for (const brand of brands) {
        if (!useAppStore.getState().isBrandLoaded(brand.id)) await ensureBrand(brand.id);
      }
    })();
  }, [brands, ensureBrand]);

  const bottleId = bottle?.id;
  useEffect(() => {
    if (!bottle) return;
    setRatioN(bottle.ratioN);
    setRatioText(String(bottle.ratioN));
    setCapacityNotice(null);
    setUseAmount((current) => Math.min(current, Math.max(0.1, bottle.remainingMl)));
    // 只在换瓶（id 变化）时同步，避免调配后覆盖用户输入
  }, [bottleId]);

  useEffect(() => {
    if (selectedId && neatRows.some((row) => row.item.id === selectedId)) return;
    setSelectedId(neatRows.length > 0 ? neatRows[0].item.id : null);
  }, [neatRows, selectedId]);

  const selectedRow = neatRows.find((row) => row.item.id === selectedId) ?? null;
  const sourcePaint = selectedRow?.paint ?? null;

  const thinnerOptions = useMemo(
    () => thinnerRows.filter((row) => row.item.id !== selectedId),
    [thinnerRows, selectedId],
  );
  const thinnerRow = thinnerOptions.find((row) => row.item.id === thinnerId) ?? thinnerOptions[0] ?? null;

  const plan = useMemo(() => {
    if (!bottle) return null;
    return planFor({
      mode,
      capacityMl: bottle.capacityMl,
      remainingMl: bottle.remainingMl,
      ratioN,
      neatMl: parseMl(neatText),
      totalMl: parseMl(totalText),
    });
  }, [bottle, mode, ratioN, neatText, totalText]);

  const blockers = useMemo(() => {
    const list: string[] = [];
    if (!bottle || !plan) return list;
    if (!selectedRow) list.push('请选择原浆条目');
    else if (!sourcePaint) list.push('该漆料的目录信息未加载，无法取用');
    if (!plan.overflow.ok && plan.overflow.message) list.push(plan.overflow.message);
    if (selectedRow && plan.neatMl <= 0) list.push('原浆量必须大于 0');
    if (selectedRow && sourcePaint && plan.neatMl > selectedRow.volumeMl + 1e-6) {
      list.push(
        stockShortText(
          selectedRow.code === '—' ? selectedRow.name : selectedRow.code,
          selectedRow.volumeMl,
          plan.neatMl,
        ),
      );
    }
    if (settings.trackThinner && thinnerRow && plan.thinnerMl > 0 && plan.thinnerMl > thinnerRow.volumeMl + 1e-6) {
      list.push('稀释剂不足：' + thinnerRow.name + ' 仅剩 ' + formatMl(thinnerRow.volumeMl) + ' ml');
    }
    return list;
  }, [bottle, plan, selectedRow, sourcePaint, settings.trackThinner, thinnerRow]);

  /** 开了「扣减稀释剂库存」但手里没有 aux 条目：由可行动面板处理，不进通用 blocker 列表 */
  const thinnerMissing = Boolean(
    bottle && plan && settings.trackThinner && plan.thinnerMl > 0 && !thinnerRow,
  );

  const canMix = Boolean(
    bottle &&
      plan &&
      selectedRow &&
      sourcePaint &&
      plan.neatMl > 0 &&
      !thinnerMissing &&
      blockers.length === 0,
  );

  const brandName = useMemo(() => {
    if (!bottle) return undefined;
    const brandId = bottle.components[0]?.brandId ?? bottle.labelBrandId;
    if (!brandId) return undefined;
    const brand = brands.find((entry) => entry.id === brandId);
    return brand?.nameZh || brand?.shortName || brandId;
  }, [bottle, brands]);

  const thinnerLabel =
    settings.trackThinner && thinnerRow
      ? thinnerRow.code + ' ' + thinnerRow.name + ' · ' + formatMl(thinnerRow.volumeMl) + ' ml'
      : null;

  const handleMix = useCallback(async () => {
    if (!bottle || !plan || !selectedRow || !sourcePaint) return;
    if (blockers.length > 0 || plan.neatMl <= 0) return;
    await mixIntoBottle({
      bottleId: bottle.id,
      mode: mode === 'fill' ? 'fill' : 'neat',
      neatMl: plan.neatMl,
      ratioN,
      sourceStockItemId: selectedRow.item.id,
      thinnerStockItemId: settings.trackThinner && thinnerRow ? thinnerRow.item.id : undefined,
      trackThinner: settings.trackThinner,
      paint: paintRefOf(sourcePaint),
    });
  }, [bottle, plan, selectedRow, sourcePaint, blockers, mixIntoBottle, mode, ratioN, settings.trackThinner, thinnerRow]);

  const handleRatioChange = useCallback((raw: string) => {
    setRatioText(raw);
    const parsed = parseRatio(raw);
    if (!parsed) return;
    setRatioN(parsed.value);
    setRatioClamped(parsed.clamped);
    if (parsed.clamped) setRatioText(parsed.value.toFixed(1));
  }, []);

  const handleRatioPreset = useCallback((next: number) => {
    setRatioN(next);
    setRatioText(String(next));
    setRatioClamped(false);
  }, []);

  /** 改容量：5–250 的判定与「新容量 < 余量」的禁令都由 store 负责，这里只透传 Result */
  const handleCapacitySelect = useCallback(
    async (next: number) => {
      const target = Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, Math.round(next)));
      setCapacityNotice(null);
      if (!bottle) {
        setCapacity(target);
        return;
      }
      if (target === bottle.capacityMl) return;
      const result = await updateBottleCapacity({ bottleId: bottle.id, capacityMl: target });
      if (!result.ok) {
        setCapacityNotice(result.error);
        return;
      }
      setCapacity(result.data.bottle.capacityMl);
    },
    [bottle, updateBottleCapacity],
  );

  const handleSkipThinner = useCallback(async () => {
    const result = await updateSetting('trackThinner', false);
    if (!result.ok) return;
    pushToast({
      message: '已关闭「扣减稀释剂库存」：立即生效，且不进入撤销栈',
      tone: 'neutral',
    });
  }, [updateSetting, pushToast]);

  const handleCreate = useCallback(async () => {
    await newBottle({ name: capacity + ' ml 瓶', capacityMl: capacity, ratioN });
  }, [newBottle, capacity, ratioN]);

  const handleUse = useCallback(async () => {
    if (!bottle) return;
    const amount = parseMl(String(useAmount));
    if (amount <= 0 || amount > bottle.remainingMl + 1e-6) return;
    await useBottleAction({ bottleId: bottle.id, amountMl: amount });
  }, [bottle, useBottleAction, useAmount]);

  const handleClear = useCallback(async () => {
    if (!bottle) return;
    await clearBottle({ bottleId: bottle.id });
  }, [bottle, clearBottle]);

  const handleArchive = useCallback(async () => {
    if (!bottle) return;
    await archiveBottle({ bottleId: bottle.id });
  }, [bottle, archiveBottle]);

  const handleReproduce = useCallback((record: MixRecord) => {
    setMode('neat');
    setNeatText(formatMl(record.neatMl));
    setRatioN(record.ratioN);
    setRatioText(String(record.ratioN));
    setRatioClamped(false);
  }, []);

  return (
    <section data-page="mix" className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h1 className="t-display text-lg text-text-1">MIX // 调漆台</h1>
        <p className="t-readout text-[11px] text-text-3">
          {bottle ? '当前瓶 ' + bottle.name + ' · ' + formatMl(bottle.remainingMl) + ' ml' : '未装载调漆瓶'}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        <NeatPicker rows={neatRows} selectedId={selectedId} onSelect={setSelectedId} />

        <BottleStage
          bottle={bottle}
          brandName={brandName}
          capacity={capacity}
          activeCapacity={bottle?.capacityMl}
          onCapacitySelect={(capacityMl) => {
            void handleCapacitySelect(capacityMl);
          }}
          capacityNotice={capacityNotice}
          onCreate={handleCreate}
          onMix={() => {
            void handleMix();
          }}
          onUse={() => {
            void handleUse();
          }}
          onClear={() => {
            void handleClear();
          }}
          onArchive={() => {
            void handleArchive();
          }}
          useAmountMl={useAmount}
          onUseAmountChange={setUseAmount}
          mixDisabled={!canMix}
          canArchive={Boolean(bottle && bottle.components.length > 0 && bottle.remainingMl > 0)}
        />

        <div className="flex min-h-0 flex-col gap-3">
          <MixCalculator
            mode={mode}
            onModeChange={setMode}
            plan={plan}
            capacityMl={bottle?.capacityMl ?? 0}
            remainingMl={bottle?.remainingMl ?? 0}
            ratioText={ratioText}
            ratioN={ratioN}
            ratioClamped={ratioClamped}
            onRatioChange={handleRatioChange}
            onRatioPreset={handleRatioPreset}
            neatText={neatText}
            onNeatChange={setNeatText}
            totalText={totalText}
            onTotalChange={setTotalText}
            blockers={blockers}
            thinnerLabel={thinnerLabel}
            thinnerMissing={thinnerMissing}
            thinnerMl={plan?.thinnerMl ?? 0}
            thinnerUntracked={!settings.trackThinner}
            onSkipThinner={() => {
              void handleSkipThinner();
            }}
            canMix={canMix}
            onMix={() => {
              void handleMix();
            }}
          />
          <MixRecents records={records} onReproduce={handleReproduce} />
        </div>
      </div>
    </section>
  );
}
