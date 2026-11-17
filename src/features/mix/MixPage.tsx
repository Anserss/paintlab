import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Bottle, Paint } from '@/core/model/types';
import { formatMl } from '@/core/math/quantity';
import { useAppStore } from '@/store';
import { Button, Dialog, Segmented } from '@/components/ui';
import { BlendPanel } from './BlendPanel';
import { BottleStage } from './BottleStage';
import { DilutePanel } from './DilutePanel';
import { MixRecents } from './MixRecents';
import { StockPicker } from './StockPicker';
import type { BlendPartRow, DiluteInputMode, MixMode } from './mixMath';
import { MIX_MODES, parseMl, parseRatio, planBlendFor, planDilution, stockShortText } from './mixMath';
import { useMixRecords, useMixStockRows, useThinnerRows } from './useMixData';

type PaintRef = Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'hex' | 'paintClass'>;

const paintRefOf = (paint: Paint): PaintRef => ({
  id: paint.id,
  brandId: paint.brandId,
  code: paint.code,
  name: paint.name,
  hex: paint.hex,
  paintClass: paint.paintClass,
});

const MODE_OPTIONS = MIX_MODES.map((mode) => ({ value: mode.value, label: mode.label }));

/** 调漆台：左取用 / 中批次 / 右计算器；稀释与调漆两种模式 */
export function MixPage() {
  const location = useLocation();
  const bottles = useAppStore((state) => state.bottles);
  const activeBottleId = useAppStore((state) => state.activeBottleId);
  const selectBottle = useAppStore((state) => state.selectBottle);
  const brands = useAppStore((state) => state.brands);
  const settings = useAppStore((state) => state.settings);
  const workbenches = useAppStore((state) => state.workbenches);
  const refreshInventory = useAppStore((state) => state.refreshInventory);
  const refreshBottles = useAppStore((state) => state.refreshBottles);
  const ensureBrand = useAppStore((state) => state.ensureBrand);
  const diluteBatch = useAppStore((state) => state.diluteBatch);
  const blendBatch = useAppStore((state) => state.blendBatch);
  const useBottle = useAppStore((state) => state.useBottle);
  const clearBottle = useAppStore((state) => state.clearBottle);
  const stockInBottle = useAppStore((state) => state.stockInBottle);
  const openCoat = useAppStore((state) => state.openCoat);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const pushToast = useAppStore((state) => state.pushToast);

  const stockRows = useMixStockRows();
  const thinnerRows = useThinnerRows();
  const records = useMixRecords(8);

  const bottle: Bottle | undefined = useMemo(
    () => bottles.find((row) => row.id === activeBottleId) ?? bottles[0],
    [bottles, activeBottleId],
  );

  const [mode, setMode] = useState<MixMode>('dilute');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<DiluteInputMode>('neat');
  const [ratioN, setRatioN] = useState(bottle?.ratioN ?? settings.defaultRatio);
  const [ratioText, setRatioText] = useState(String(bottle?.ratioN ?? settings.defaultRatio));
  const [ratioClamped, setRatioClamped] = useState(false);
  const [neatText, setNeatText] = useState('10.0');
  const [totalText, setTotalText] = useState('30.0');
  const [takenText, setTakenText] = useState('10.0');
  const [useTarget, setUseTarget] = useState(true);
  const [targetText, setTargetText] = useState('30.0');
  const [partTexts, setPartTexts] = useState<Record<string, string>>({});
  const [thinnerId, setThinnerId] = useState<string | null>(null);
  const [useAmount, setUseAmount] = useState(10);
  const [coatPicker, setCoatPicker] = useState(false);

  useEffect(() => {
    void refreshInventory();
    void refreshBottles();
  }, [refreshInventory, refreshBottles]);

  /** 目录包懒加载：本页依赖 paintsById 解析色号与色值 */
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
    setUseAmount((current) => Math.min(current, Math.max(0.1, bottle.remainingMl)));
  }, [bottleId]);

  /** 稀释：单选；调漆：多选。切换模式时保留仍有效的选择 */
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = prev.filter((id) => stockRows.some((row) => row.item.id === id));
      if (mode === 'dilute') {
        if (valid.length > 0) return [valid[0]];
        return stockRows.length > 0 ? [stockRows[0].item.id] : [];
      }
      return valid;
    });
  }, [stockRows, mode]);

  /** 调漆组分默认份量：10 ml */
  useEffect(() => {
    setPartTexts((prev) => {
      const next: Record<string, string> = {};
      for (const id of selectedIds) next[id] = prev[id] ?? '10.0';
      return next;
    });
  }, [selectedIds]);

  /**
   * 仓库 → 调漆：从仓库点「调漆」跳转时带 stockItemId，
   * 这里直接选中那一条（只应用一次，之后用户手动改动不再被覆盖）。
   */
  const navStockId = (location.state as { stockItemId?: string } | null)?.stockItemId ?? null;
  const appliedNavStock = useRef<string | null>(null);
  useEffect(() => {
    if (!navStockId || appliedNavStock.current === navStockId) return;
    if (!stockRows.some((row) => row.item.id === navStockId)) return;
    appliedNavStock.current = navStockId;
    setMode('dilute');
    setSelectedIds([navStockId]);
  }, [navStockId, stockRows]);

  const selectedRows = stockRows.filter((row) => selectedIds.includes(row.item.id));
  const sourceRow = mode === 'dilute' ? (selectedRows[0] ?? null) : null;

  const thinnerOptions = useMemo(
    () => thinnerRows.filter((row) => row.item.id !== sourceRow?.item.id),
    [thinnerRows, sourceRow?.item.id],
  );
  const thinnerRow = thinnerOptions.find((row) => row.item.id === thinnerId) ?? thinnerOptions[0] ?? null;

  const dilutionPlan = useMemo(() => {
    if (mode !== 'dilute' || !sourceRow) return null;
    return planDilution({
      sourceState: sourceRow.state === 'thinned' ? 'thinned' : 'neat',
      inputMode,
      fromRatioN: sourceRow.ratioN,
      targetRatioN: ratioN,
      neatMl: parseMl(neatText),
      totalMl: parseMl(totalText),
      takenMl: parseMl(takenText),
    });
  }, [mode, sourceRow, inputMode, ratioN, neatText, totalText, takenText]);

  const partRows: BlendPartRow[] = useMemo(
    () =>
      selectedRows.map((row) => ({
        id: row.item.id,
        code: row.code,
        name: row.name,
        mlText: partTexts[row.item.id] ?? '10.0',
        ratioN: row.ratioN,
        availableMl: row.volumeMl,
      })),
    [selectedRows, partTexts],
  );

  const blendPlan = useMemo(() => {
    if (mode !== 'blend') return null;
    return planBlendFor(partRows, useTarget ? parseMl(targetText) : null);
  }, [mode, partRows, useTarget, targetText]);

  const dilutionBlockers = useMemo(() => {
    const list: string[] = [];
    if (mode !== 'dilute') return list;
    if (!sourceRow) {
      list.push('请选择取用漆料');
      return list;
    }
    if (!sourceRow.paint) list.push('该漆料的目录信息未加载，无法取用');
    if (!dilutionPlan) return list;
    if (sourceRow.state === 'thinned' && ratioN <= sourceRow.ratioN) {
      list.push('目标比例必须大于当前比例 1:' + String(sourceRow.ratioN));
    }
    if (dilutionPlan.totalMl <= 0) list.push('产物体积必须大于 0');
    if (sourceRow.volumeMl + 1e-6 < dilutionPlan.takenMl) {
      list.push(stockShortText(sourceRow.code === '—' ? sourceRow.name : sourceRow.code, sourceRow.volumeMl, dilutionPlan.takenMl));
    }
    if (settings.trackThinner && thinnerRow && dilutionPlan.addedThinnerMl > 0) {
      if (thinnerRow.volumeMl + 1e-6 < dilutionPlan.addedThinnerMl) {
        list.push('稀释剂不足：' + thinnerRow.name + ' 仅剩 ' + formatMl(thinnerRow.volumeMl) + ' ml');
      }
    }
    return list;
  }, [mode, sourceRow, dilutionPlan, ratioN, settings.trackThinner, thinnerRow]);

  const thinnerMissing = Boolean(
    mode === 'dilute' && dilutionPlan && settings.trackThinner && dilutionPlan.addedThinnerMl > 0 && !thinnerRow,
  );

  const blendBlockers = useMemo(() => {
    const list: string[] = [];
    if (mode !== 'blend') return list;
    if (partRows.length === 0) list.push('请至少勾选一个漆料组分');
    if (!blendPlan) return list;
    if (blendPlan.totalMl <= 0) list.push('产物体积必须大于 0');
    for (const shortfall of blendPlan.shortfalls) {
      const row = partRows.find((part) => part.id === shortfall.id);
      list.push(stockShortText(row?.code ?? shortfall.id, shortfall.availableMl, shortfall.needMl));
    }
    return list;
  }, [mode, partRows, blendPlan]);

  const canDilute = Boolean(
    mode === 'dilute' &&
      sourceRow &&
      sourceRow.paint &&
      dilutionPlan &&
      dilutionPlan.totalMl > 0 &&
      !thinnerMissing &&
      dilutionBlockers.length === 0,
  );

  const canBlend = Boolean(mode === 'blend' && blendPlan && blendPlan.totalMl > 0 && blendBlockers.length === 0);

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

  const handleToggle = useCallback(
    (itemId: string) => {
      if (mode === 'dilute') {
        setSelectedIds([itemId]);
        return;
      }
      setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
    },
    [mode],
  );

  const handleDilute = useCallback(async () => {
    if (!sourceRow?.paint || !dilutionPlan) return;
    const thinned = sourceRow.state === 'thinned';
    await diluteBatch({
      sourceStockItemId: sourceRow.item.id,
      sourceIsThinned: thinned,
      ...(thinned
        ? { takenMl: dilutionPlan.takenMl, currentRatioN: sourceRow.ratioN }
        : { neatMl: dilutionPlan.neatMl }),
      targetRatioN: ratioN,
      ...(settings.trackThinner && thinnerRow ? { thinnerStockItemId: thinnerRow.item.id } : {}),
      trackThinner: settings.trackThinner,
      paint: paintRefOf(sourceRow.paint),
    });
  }, [sourceRow, dilutionPlan, diluteBatch, ratioN, settings.trackThinner, thinnerRow]);

  const handleBlend = useCallback(async () => {
    if (!blendPlan) return;
    const parts = blendPlan.parts
      .map((share) => {
        const row = selectedRows.find((entry) => entry.item.id === share.id);
        if (!row?.paint) return null;
        return { stockItemId: share.id, paint: paintRefOf(row.paint), ml: parseMl(partTexts[share.id] ?? '0') };
      })
      .filter((part): part is { stockItemId: string; paint: PaintRef; ml: number } => part !== null);
    if (parts.length === 0) return;
    await blendBatch({ parts, targetMl: useTarget ? parseMl(targetText) : null });
  }, [blendPlan, selectedRows, partTexts, blendBatch, useTarget, targetText]);

  const handleSkipThinner = useCallback(async () => {
    const result = await updateSetting('trackThinner', false);
    if (!result.ok) return;
    pushToast({ message: '已关闭「扣减稀释剂库存」：立即生效，且不进入撤销栈', tone: 'neutral' });
  }, [updateSetting, pushToast]);

  const handleStockIn = useCallback(async () => {
    if (!bottle) return;
    await stockInBottle({ bottleId: bottle.id });
  }, [bottle, stockInBottle]);

  const handleCoat = useCallback(() => {
    if (!bottle) return;
    if (workbenches.length === 0) {
      pushToast({ message: '还没有工作台，先去工作台页新建一个', tone: 'warn' });
      return;
    }
    if (workbenches.length === 1) {
      void openCoat({ workbenchId: workbenches[0].id, refs: [{ refType: 'bottle', refId: bottle.id }] });
      return;
    }
    setCoatPicker(true);
  }, [bottle, workbenches, openCoat, pushToast]);

  const handleUse = useCallback(async () => {
    if (!bottle) return;
    const amount = parseMl(String(useAmount));
    if (amount <= 0 || amount > bottle.remainingMl + 1e-6) return;
    await useBottle({ bottleId: bottle.id, amountMl: amount });
  }, [bottle, useBottle, useAmount]);

  const handleClear = useCallback(async () => {
    if (!bottle) return;
    await clearBottle({ bottleId: bottle.id });
  }, [bottle, clearBottle]);

  /** 复现：把记录里的比例带回来（稀释模式） */
  const handleReproduce = useCallback((record: { ratioN: number; neatMl: number }) => {
    setRatioN(record.ratioN);
    setRatioText(String(record.ratioN));
    setRatioClamped(false);
    setNeatText(formatMl(record.neatMl));
    setMode('dilute');
    setInputMode('neat');
  }, []);

  const batches = useMemo(() => bottles.map((row) => ({ id: row.id, name: row.name })), [bottles]);

  return (
    <section data-page="mix" className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="t-display text-lg text-text-1">MIX // 调漆台</h1>
          <Segmented ariaLabel="调漆台模式" options={MODE_OPTIONS} value={mode} onChange={(next) => setMode(next as MixMode)} />
        </div>
        <p className="t-readout text-[11px] text-text-3">
          {bottle
            ? '当前批次 ' + bottle.name + ' · ' + formatMl(bottle.remainingMl) + ' ml'
            : '调漆台空 · 选好漆料后点「稀释」或「调漆」'}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_340px]">
        <StockPicker rows={stockRows} multiple={mode === 'blend'} selectedIds={selectedIds} onToggle={handleToggle} />

        <BottleStage
          bottle={bottle}
          brandName={brandName}
          batches={batches}
          activeBatchId={bottle?.id ?? null}
          onSelectBatch={selectBottle}
          onStockIn={() => {
            void handleStockIn();
          }}
          onCoat={handleCoat}
          onUse={() => {
            void handleUse();
          }}
          onClear={() => {
            void handleClear();
          }}
          useAmountMl={useAmount}
          onUseAmountChange={setUseAmount}
          canStockIn={Boolean(bottle && bottle.components.length > 0 && bottle.remainingMl > 0)}
          coatHint={workbenches.length === 0 ? '先去工作台新建一个工作台' : null}
        />

        <div className="flex min-h-0 flex-col gap-3">
          {mode === 'dilute' ? (
            <DilutePanel
              source={sourceRow}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              ratioText={ratioText}
              ratioN={ratioN}
              ratioClamped={ratioClamped}
              onRatioChange={handleRatioChange}
              onRatioPreset={handleRatioPreset}
              neatText={neatText}
              onNeatChange={setNeatText}
              totalText={totalText}
              onTotalChange={setTotalText}
              takenText={takenText}
              onTakenChange={setTakenText}
              plan={dilutionPlan}
              thinnerLabel={thinnerLabel}
              thinnerMissing={Boolean(thinnerMissing)}
              thinnerUntracked={!settings.trackThinner}
              onSkipThinner={() => {
                void handleSkipThinner();
              }}
              blockers={dilutionBlockers}
              canCommit={canDilute}
              onCommit={() => {
                void handleDilute();
              }}
            />
          ) : (
            <BlendPanel
              rows={partRows}
              onChangeMl={(itemId, raw) => setPartTexts((prev) => ({ ...prev, [itemId]: raw }))}
              onRemove={(itemId) => setSelectedIds((prev) => prev.filter((id) => id !== itemId))}
              onEqualize={() =>
                setPartTexts((prev) => {
                  const next = { ...prev };
                  for (const id of selectedIds) next[id] = '10.0';
                  return next;
                })
              }
              onClear={() => setSelectedIds([])}
              useTarget={useTarget}
              onUseTargetChange={setUseTarget}
              targetText={targetText}
              onTargetChange={setTargetText}
              plan={blendPlan}
              blockers={blendBlockers}
              canCommit={canBlend}
              onCommit={() => {
                void handleBlend();
              }}
            />
          )}
          <MixRecents records={records} onReproduce={handleReproduce} />
        </div>
      </div>

      <Dialog
        open={coatPicker}
        onOpenChange={setCoatPicker}
        title="开涂"
        description={'把「' + (bottle?.name ?? '') + '」送到哪个工作台'}
        width={420}
        footer={
          <Button variant="ghost" onClick={() => setCoatPicker(false)}>
            取消
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {workbenches.map((workbench) => (
            <button
              key={workbench.id}
              type="button"
              data-coat-target={workbench.id}
              onClick={() => {
                setCoatPicker(false);
                if (!bottle) return;
                void openCoat({ workbenchId: workbench.id, refs: [{ refType: 'bottle', refId: bottle.id }] });
              }}
              className="flex h-8 items-center border border-line px-2 text-xs text-text-1 transition-colors duration-hover hover:border-line-strong hover:bg-surface-2"
            >
              {workbench.name}
            </button>
          ))}
        </div>
      </Dialog>
    </section>
  );
}
