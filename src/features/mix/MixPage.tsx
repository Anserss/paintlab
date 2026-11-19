import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Paint } from '@/core/model/types';
import { formatMl, formatRatio } from '@/core/math/quantity';
import { canEnterWorkbench, dilutionTagText, WORKBENCH_NEAT_BLOCK } from '@/core/render/batch';
import { useAppStore } from '@/store';
import { Button, Dialog, Segmented } from '@/components/ui';
import { BlendPanel } from './BlendPanel';
import { DilutePanel } from './DilutePanel';
import { MixRecents } from './MixRecents';
import { RecipePreview } from './RecipePreview';
import type { RecipePreviewPart } from './RecipePreview';
import { StockPicker } from './StockPicker';
import type { BlendLogic, BlendPartRow, DiluteInputMode, MixMode } from './mixMath';
import { MIX_MODES, parseMl, parseRatio, planBlendFor, planDilution, stockShortText } from './mixMath';
import type { StockRow } from './useMixData';
import { useMixRecords, useMixStockRows, useThinnerRows } from './useMixData';

type PaintRef = Pick<Paint, 'id' | 'brandId' | 'code' | 'name' | 'nameZh' | 'hex' | 'paintClass'>;

interface LastMixResult {
  itemId: string;
  label: string;
  addedMl: number;
  merged: boolean;
}

const MODE_OPTIONS = MIX_MODES.map((mode) => ({ value: mode.value, label: mode.label }));

/** StockRow 的展示身份 → 写库用的漆料引用（调漆产物用自定义名/色） */
function paintRefOfRow(row: StockRow): PaintRef | null {
  if (!row.paint) return null;
  return {
    id: row.paint.id,
    brandId: row.paint.brandId,
    ...(row.paint.code ? { code: row.paint.code } : {}),
    name: row.name,
    nameZh: row.name,
    hex: row.hex,
    paintClass: row.paint.paintClass,
  };
}

/**
 * 调漆台 2.2：
 * - 稀释 / 调漆确认后自动扣减库存并入库（不再产生“当前批次”，也没有使用 / 清空键）；
 * - 同配方自动合并容量；
 * - 左：取用候选；右上：操作（SOP + 计算 + 确认）；右下：紧凑配方条；底部：最近配方。
 */
export function MixPage() {
  const location = useLocation();
  const stockItems = useAppStore((state) => state.stockItems);
  const brands = useAppStore((state) => state.brands);
  const settings = useAppStore((state) => state.settings);
  const workbenches = useAppStore((state) => state.workbenches);
  const refreshInventory = useAppStore((state) => state.refreshInventory);
  const refreshBottles = useAppStore((state) => state.refreshBottles);
  const ensureBrand = useAppStore((state) => state.ensureBrand);
  const diluteBatch = useAppStore((state) => state.diluteBatch);
  const blendBatch = useAppStore((state) => state.blendBatch);
  const openCoat = useAppStore((state) => state.openCoat);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const pushToast = useAppStore((state) => state.pushToast);

  const stockRows = useMixStockRows();
  const thinnerRows = useThinnerRows();
  const records = useMixRecords(6);

  const [mode, setMode] = useState<MixMode>('dilute');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<LastMixResult | null>(null);
  const [coatPicker, setCoatPicker] = useState(false);

  // 稀释
  const [inputMode, setInputMode] = useState<DiluteInputMode>('neat');
  const [ratioN, setRatioN] = useState(settings.defaultRatio);
  const [ratioText, setRatioText] = useState(String(settings.defaultRatio));
  const [ratioClamped, setRatioClamped] = useState(false);
  const [neatText, setNeatText] = useState('10.0');
  const [totalText, setTotalText] = useState('30.0');
  const [takenText, setTakenText] = useState('10.0');
  const [thinnerId, setThinnerId] = useState<string | null>(null);

  // 调漆
  const [blendLogic, setBlendLogic] = useState<BlendLogic>('ratio');
  const [targetText, setTargetText] = useState('30.0');
  const [blendName, setBlendName] = useState('');
  const [ratioTexts, setRatioTexts] = useState<Record<string, string>>({});
  const [amountTexts, setAmountTexts] = useState<Record<string, string>>({});

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

  /** 稀释单选 / 调漆多选；切换模式时保留仍有效的选择 */
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

  /** 调漆份量默认值：配比口径默认 1 份，用量口径默认 10 ml */
  useEffect(() => {
    setRatioTexts((prev) => {
      const next: Record<string, string> = {};
      for (const id of selectedIds) next[id] = prev[id] ?? '1';
      return next;
    });
    setAmountTexts((prev) => {
      const next: Record<string, string> = {};
      for (const id of selectedIds) next[id] = prev[id] ?? '10.0';
      return next;
    });
  }, [selectedIds]);

  /**
   * 仓库 / 工作台 → 调漆台：跳转时带 stockItemId，这里直接选中那一条
   * （只应用一次，之后用户手动改动不再被覆盖）。
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

  /** 产物被用完 / 撤销删除后，页头的「最近产出」不再指向幽灵条目 */
  useEffect(() => {
    if (lastResult && !stockItems.some((item) => item.id === lastResult.itemId)) setLastResult(null);
  }, [stockItems, lastResult]);

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
        hex: row.hex,
        weightText:
          blendLogic === 'ratio' ? (ratioTexts[row.item.id] ?? '1') : (amountTexts[row.item.id] ?? '10.0'),
        ratioN: row.ratioN,
        availableMl: row.volumeMl,
        state: row.state,
        dilutionRatioN: row.dilutionRatioN,
        mixed: Boolean(row.item.customName) && row.dilutionRatioN === null,
      })),
    [selectedRows, blendLogic, ratioTexts, amountTexts],
  );

  const blendPlan = useMemo(() => {
    if (mode !== 'blend') return null;
    return planBlendFor(partRows, blendLogic === 'ratio' ? parseMl(targetText) : null);
  }, [mode, partRows, blendLogic, targetText]);

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
      list.push(
        stockShortText(
          sourceRow.code === '—' ? sourceRow.name : sourceRow.code,
          sourceRow.volumeMl,
          dilutionPlan.takenMl,
        ),
      );
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
    if (selectedRows.some((row) => !row.paint)) list.push('有组分的目录信息未加载，暂不能调漆');
    if (blendLogic === 'ratio' && parseMl(targetText) <= 0) list.push('目标总容量必须大于 0');
    if (!blendPlan) return list;
    if (blendPlan.totalMl <= 0) list.push('产物体积必须大于 0');
    for (const shortfall of blendPlan.shortfalls) {
      const row = partRows.find((part) => part.id === shortfall.id);
      list.push(stockShortText(row?.code ?? shortfall.id, shortfall.availableMl, shortfall.needMl));
    }
    return list;
  }, [mode, partRows, selectedRows, blendPlan, blendLogic, targetText]);

  const canDilute = Boolean(
    mode === 'dilute' &&
      sourceRow &&
      sourceRow.paint &&
      dilutionPlan &&
      dilutionPlan.totalMl > 0 &&
      !thinnerMissing &&
      dilutionBlockers.length === 0,
  );

  const canBlend = Boolean(
    mode === 'blend' &&
      selectedRows.every((row) => row.paint) &&
      partRows.length > 0 &&
      blendPlan &&
      blendPlan.totalMl > 0 &&
      blendBlockers.length === 0,
  );

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

  const handleLogicChange = useCallback((next: BlendLogic) => {
    setBlendLogic(next);
  }, []);

  const rememberResult = useCallback(
    (itemId: string, label: string, addedMl: number, merged: boolean) => {
      setLastResult({ itemId, label, addedMl, merged });
      setSelectedIds([itemId]);
    },
    [],
  );

  const handleDilute = useCallback(async () => {
    if (busy || !sourceRow || !dilutionPlan) return;
    const paint = paintRefOfRow(sourceRow);
    if (!paint) return;
    const thinned = sourceRow.state === 'thinned';
    setBusy(true);
    const result = await diluteBatch({
      sourceStockItemId: sourceRow.item.id,
      sourceIsThinned: thinned,
      ...(thinned
        ? { takenMl: dilutionPlan.takenMl, currentRatioN: sourceRow.ratioN }
        : { neatMl: dilutionPlan.neatMl }),
      targetRatioN: ratioN,
      ...(settings.trackThinner && thinnerRow ? { thinnerStockItemId: thinnerRow.item.id } : {}),
      ...(thinnerRow?.paint ? { thinnerPaint: paintRefOfRow(thinnerRow) ?? undefined } : {}),
      trackThinner: settings.trackThinner,
      paint,
    });
    setBusy(false);
    if (!result.ok) return;
    const item = result.data.item;
    const label =
      typeof item.dilutionRatioN === 'number' && item.dilutionRatioN > 0
        ? dilutionTagText(item.dilutionRatioN) + ' ' + (item.customName ?? '稀释漆料')
        : (item.customName ?? item.mixLabel ?? '稀释漆料');
    rememberResult(item.id, label, result.data.addedMl, result.data.merged);
  }, [busy, sourceRow, dilutionPlan, diluteBatch, ratioN, settings.trackThinner, thinnerRow, rememberResult]);

  const handleBlend = useCallback(async () => {
    if (busy || !blendPlan) return;
    const parts = blendPlan.parts
      .map((share) => {
        const row = selectedRows.find((entry) => entry.item.id === share.id);
        const paint = row ? paintRefOfRow(row) : null;
        if (!paint) return null;
        return { stockItemId: share.id, paint, ml: share.ml };
      })
      .filter((part): part is { stockItemId: string; paint: PaintRef; ml: number } => part !== null);
    if (parts.length === 0) return;
    setBusy(true);
    const result = await blendBatch({ parts, targetMl: null, name: blendName.trim() || undefined });
    setBusy(false);
    if (!result.ok) return;
    const item = result.data.item;
    rememberResult(
      item.id,
      item.customName ?? item.mixLabel ?? '调漆产物',
      result.data.addedMl,
      result.data.merged,
    );
  }, [busy, blendPlan, selectedRows, blendBatch, rememberResult, blendName]);

  const handleSkipThinner = useCallback(async () => {
    const result = await updateSetting('trackThinner', false);
    if (!result.ok) return;
    pushToast({ message: '已关闭「扣减稀释剂库存」：立即生效，且不进入撤销栈', tone: 'neutral' });
  }, [updateSetting, pushToast]);

  const handleReproduce = useCallback((record: { ratioN: number; neatMl: number }) => {
    setRatioN(record.ratioN);
    setRatioText(String(record.ratioN));
    setRatioClamped(false);
    setNeatText(formatMl(record.neatMl));
    setMode('dilute');
    setInputMode('neat');
  }, []);

  const producedItem = lastResult ? stockItems.find((item) => item.id === lastResult.itemId) : undefined;
  const producedCanCoat = Boolean(producedItem && canEnterWorkbench(producedItem.state));

  const handleCoat = useCallback(() => {
    if (!producedItem) {
      pushToast({ message: '该产物已用完或被删除', tone: 'warn' });
      return;
    }
    if (!canEnterWorkbench(producedItem.state)) {
      pushToast({ message: WORKBENCH_NEAT_BLOCK, tone: 'warn' });
      return;
    }
    if (workbenches.length === 0) {
      pushToast({ message: '还没有工作台，先去工作台页新建一个', tone: 'warn' });
      return;
    }
    if (workbenches.length === 1) {
      void openCoat({
        workbenchId: workbenches[0].id,
        refs: [{ refType: 'stock', refId: producedItem.id }],
      });
      return;
    }
    setCoatPicker(true);
  }, [producedItem, workbenches, openCoat, pushToast]);

  /** 配方条：稀释 = 原浆 + 稀释剂；调漆 = 各组分 */
  const recipeParts: RecipePreviewPart[] = useMemo(() => {
    if (mode === 'dilute') {
      if (!dilutionPlan || !sourceRow || dilutionPlan.totalMl <= 0) return [];
      const total = dilutionPlan.totalMl;
      const parts: RecipePreviewPart[] = [];
      if (dilutionPlan.neatMl > 0) {
        parts.push({
          key: 'neat',
          label: sourceRow.name,
          code: sourceRow.code,
          hex: sourceRow.hex,
          ml: dilutionPlan.neatMl,
          share: dilutionPlan.neatMl / total,
        });
      }
      if (dilutionPlan.thinnerMl > 0) {
        parts.push({
          key: 'thinner',
          label: thinnerRow?.name ?? '稀释剂',
          code: thinnerRow?.code,
          hex: thinnerRow?.hex ?? '#dededb',
          ml: dilutionPlan.thinnerMl,
          share: dilutionPlan.thinnerMl / total,
          aux: true,
        });
      }
      return parts;
    }
    if (!blendPlan || blendPlan.totalMl <= 0) return [];
    return blendPlan.parts
      .map((share): RecipePreviewPart | null => {
        const row = selectedRows.find((entry) => entry.item.id === share.id);
        if (!row) return null;
        return {
          key: row.item.id,
          label: row.name,
          code: row.code,
          hex: row.hex,
          ml: share.ml,
          share: share.ml / blendPlan.totalMl,
          ...(typeof row.alpha === 'number' ? { alpha: row.alpha } : {}),
        };
      })
      .filter((part): part is RecipePreviewPart => part !== null);
  }, [mode, dilutionPlan, sourceRow, thinnerRow, blendPlan, selectedRows]);

  const recipeTotal = mode === 'dilute' ? (dilutionPlan?.totalMl ?? 0) : (blendPlan?.totalMl ?? 0);
  const recipeRatio = mode === 'dilute' ? ratioN : (blendPlan?.ratioN ?? 0);
  const recipeModeLabel =
    mode === 'dilute'
      ? '稀释 · ' + formatRatio(ratioN)
      : '调漆 · ' + (blendLogic === 'ratio' ? '总量 ÷ 配比' : '各组分用量');

  return (
    <section data-page="mix" className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="ef-page-head shrink-0">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="ef-eyebrow">// MIX</p>
            <h1 className="ef-title">调漆台</h1>
          </div>
          <Segmented
            ariaLabel="调漆台模式"
            options={MODE_OPTIONS}
            value={mode}
            onChange={(next) => setMode(next as MixMode)}
          />
          <span className="ef-tag" data-auto-stock-in="">
            自动入库
          </span>
        </div>
        <p className="ef-field flex flex-wrap items-center gap-2 text-[12px] text-text-2">
          {lastResult ? (
            <>
              <span data-last-result="">
                {'最近产出 ' +
                  lastResult.label +
                  ' · +' +
                  formatMl(lastResult.addedMl) +
                  ' ml' +
                  (lastResult.merged ? '（已并入同配方瓶）' : '')}
              </span>
              <Button
                size="sm"
                variant="secondary"
                data-action="coat-last"
                disabled={!producedCanCoat}
                title={producedCanCoat ? undefined : WORKBENCH_NEAT_BLOCK}
                onClick={handleCoat}
              >
                开涂
              </Button>
            </>
          ) : (
            '稀释 / 调漆确认后自动扣减库存并入库；同配方合并，余量 0 ml 自动删除。'
          )}
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <StockPicker rows={stockRows} multiple={mode === 'blend'} selectedIds={selectedIds} onToggle={handleToggle} />

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
              busy={busy}
            />
          ) : (
            <BlendPanel
              rows={partRows}
              logic={blendLogic}
              onLogicChange={handleLogicChange}
              onChangeWeight={(itemId, raw) => {
                if (blendLogic === 'ratio') setRatioTexts((prev) => ({ ...prev, [itemId]: raw }));
                else setAmountTexts((prev) => ({ ...prev, [itemId]: raw }));
              }}
              onRemove={(itemId) => setSelectedIds((prev) => prev.filter((id) => id !== itemId))}
              onEqualize={() =>
                setRatioTexts((prev) => {
                  const next = { ...prev };
                  for (const id of selectedIds) next[id] = '1';
                  return next;
                })
              }
              targetText={targetText}
              onTargetChange={setTargetText}
              nameText={blendName}
              onNameChange={setBlendName}
              plan={blendPlan}
              blockers={blendBlockers}
              canCommit={canBlend}
              onCommit={() => {
                void handleBlend();
              }}
              busy={busy}
            />
          )}

          <RecipePreview
            parts={recipeParts}
            totalMl={recipeTotal}
            ratioN={recipeRatio}
            modeLabel={recipeModeLabel}
            lastResult={
              lastResult
                ? { label: lastResult.label, addedMl: lastResult.addedMl, merged: lastResult.merged }
                : null
            }
          />
        </div>
      </div>

      <MixRecents records={records} onReproduce={handleReproduce} />

      <Dialog
        open={coatPicker}
        onOpenChange={setCoatPicker}
        title="开涂"
        description={'把「' + (producedItem?.customName ?? lastResult?.label ?? '') + '」送到哪个工作台'}
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
                if (!producedItem) return;
                void openCoat({
                  workbenchId: workbench.id,
                  refs: [{ refType: 'stock', refId: producedItem.id }],
                });
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
