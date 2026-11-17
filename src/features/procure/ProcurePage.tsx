import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Paint } from '@/core/model/types';
import { Badge, Button, Dialog, Empty, Toolbar } from '@/components/ui';
import { PaintRow } from '@/components/paint';
import { useAppStore } from '@/store';
import { BrandColumn } from './BrandColumn';
import type { BrandRowModel } from './BrandColumn';
import { ProcureToolbar } from './ProcureToolbar';
import { RegisterDialog } from './RegisterDialog';
import type { RegisterPayload } from './RegisterDialog';
import {
  ALL_BRANDS,
  DEFAULT_PROCURE_FILTERS,
  filterOptionsOf,
  filterPaints,
  paintsOfKind,
  sortPaints,
} from './procureFilters';
import type { ProcureFilters } from './procureFilters';

/** 采购大厅（spec 3.2 / AC-15 / AC-16）：用户见到应用的第一屏。 */
export function ProcurePage() {
  const brands = useAppStore((state) => state.brands);
  const bundles = useAppStore((state) => state.bundles);
  const linesById = useAppStore((state) => state.linesById);
  const brandState = useAppStore((state) => state.brandState);
  const stockAggregate = useAppStore((state) => state.stockAggregate);
  const groups = useAppStore((state) => state.groups);
  const defaultRatio = useAppStore((state) => state.settings.defaultRatio);
  const purchase = useAppStore((state) => state.purchase);
  const setBreadcrumb = useAppStore((state) => state.setBreadcrumb);
  const pushToast = useAppStore((state) => state.pushToast);

  const [brandId, setBrandId] = useState('');
  const [filters, setFilters] = useState<ProcureFilters>(DEFAULT_PROCURE_FILTERS);
  const [selection, setSelection] = useState<string[]>([]);
  const [indexCounts, setIndexCounts] = useState<Record<string, number>>({});
  const [dialogPaints, setDialogPaints] = useState<Paint[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupChoice, setGroupChoice] = useState('');

  /* 首屏只读目录索引的件数；品牌包按需懒加载（spec 3.2 性能要求） */
  useEffect(() => {
    if (useAppStore.getState().brands.length > 0) return;
    let cancelled = false;
    void (async () => {
      const result = await useAppStore.getState().loadCatalog();
      if (cancelled || !result.ok) return;
      const next: Record<string, number> = {};
      for (const entry of result.data.brands) next[entry.id] = entry.count;
      setIndexCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 默认进入第一个品牌（而不是一次加载全部品牌包） */
  useEffect(() => {
    if (brandId || brands.length === 0) return;
    setBrandId(brands[0].id);
  }, [brandId, brands]);

  /* 进入品牌：ensureBrand 懒加载品牌包 */
  useEffect(() => {
    if (!brandId) return;
    const state = useAppStore.getState();
    if (brandId === ALL_BRANDS) {
      void Promise.all(state.brands.map((brand) => state.ensureBrand(brand.id)));
      return;
    }
    void state.ensureBrand(brandId);
  }, [brandId]);

  const activeBrandName = useMemo(() => {
    if (brandId === ALL_BRANDS) return '全部';
    const brand = brands.find((entry) => entry.id === brandId);
    return brand ? brand.nameZh || brand.name : '';
  }, [brandId, brands]);

  const lineName = filters.lineId ? linesById[filters.lineId]?.name : undefined;

  /* 面包屑：采购 / 郡士 / Mr.Color；离开本页时清空，避免顶部栏残留上一页的面包屑 */
  useEffect(() => {
    if (!activeBrandName) return;
    setBreadcrumb(lineName ? ['采购', activeBrandName, lineName] : ['采购', activeBrandName]);
  }, [activeBrandName, lineName, setBreadcrumb]);

  useEffect(() => () => setBreadcrumb(null), [setBreadcrumb]);

  const loadedPaints = useMemo(() => {
    const map = new Map<string, Paint>();
    for (const bundle of Object.values(bundles)) {
      for (const paint of bundle.paints) map.set(paint.id, paint);
    }
    return Array.from(map.values());
  }, [bundles]);

  const pool = useMemo(() => {
    if (!brandId) return [];
    if (brandId === ALL_BRANDS) return loadedPaints;
    const bundle = bundles[brandId];
    return bundle ? bundle.paints : loadedPaints.filter((paint) => paint.brandId === brandId);
  }, [brandId, bundles, loadedPaints]);

  const visible = useMemo(() => {
    const filtered = filterPaints(
      pool,
      linesById,
      filters,
      (paint) => stockAggregate[paint.id]?.count ?? 0,
    );
    return sortPaints(filtered, filters.sort);
  }, [pool, linesById, filters, stockAggregate]);

  const options = useMemo(
    () => filterOptionsOf(paintsOfKind(pool, filters.kind), linesById),
    [pool, linesById, filters.kind],
  );

  const brandRows = useMemo<BrandRowModel[]>(() => {
    const loadedCount = (id: string): number | undefined => bundles[id]?.paints.length;
    const total = brands.reduce(
      (sum, brand) => sum + (indexCounts[brand.id] ?? loadedCount(brand.id) ?? 0),
      0,
    );
    const rows: BrandRowModel[] = [
      { id: ALL_BRANDS, nameZh: '全部', shortName: 'ALL', count: total || undefined, lines: [] },
    ];
    for (const brand of brands) {
      const bundle = bundles[brand.id];
      const lines = bundle
        ? bundle.lines.map((line) => ({
            id: line.id,
            name: line.name,
            count: bundle.paints.filter((paint) => paint.lineId === line.id).length,
          }))
        : [];
      rows.push({
        id: brand.id,
        nameZh: brand.nameZh || brand.name,
        shortName: brand.shortName,
        count: indexCounts[brand.id] ?? loadedCount(brand.id),
        state: brandState[brand.id],
        lines,
      });
    }
    return rows;
  }, [brands, bundles, brandState, indexCounts]);

  const brandNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const brand of brands) map[brand.id] = brand.nameZh || brand.name;
    return map;
  }, [brands]);

  const selectedPaints = useMemo(
    () => pool.filter((paint) => selection.includes(paint.id)),
    [pool, selection],
  );

  const togglePaint = useCallback((paint: Paint, event?: MouseEvent<HTMLElement>) => {
    const additive = Boolean(event && (event.metaKey || event.ctrlKey || event.shiftKey));
    setSelection((prev) => {
      if (!additive) return [paint.id];
      return prev.includes(paint.id)
        ? prev.filter((id) => id !== paint.id)
        : [...prev, paint.id];
    });
  }, []);

  const openRegister = useCallback((paints: Paint[]) => {
    if (paints.length === 0) return;
    setDialogPaints(paints);
    setRegisterOpen(true);
  }, []);

  async function handleRegister(payload: RegisterPayload) {
    if (dialogPaints.length === 0) return;
    setBusy(true);
    try {
      for (const paint of dialogPaints) {
        const brand = brands.find((entry) => entry.id === paint.brandId);
        const result = await purchase({
          paint: {
            id: paint.id,
            code: paint.code,
            name: paint.name,
            nameZh: paint.nameZh,
            hex: paint.hex,
            brandName: brand ? brand.nameZh || brand.name : undefined,
          },
          initialMl: payload.volumeMl,
          volumeMl: payload.volumeMl,
          state: payload.state,
          ratioN: payload.ratioN,
          groupId: payload.groupId,
          note: payload.note,
          origin: paint.origin,
        });
        if (!result.ok) break;
      }
    } finally {
      setBusy(false);
      setRegisterOpen(false);
      setDialogPaints([]);
      setSelection([]);
    }
  }

  async function applyGroup() {
    const selectedIds = new Set(selection);
    const state = useAppStore.getState();
    setGroupOpen(false);
    const stockIds = state.stockItems
      .filter((item) => selectedIds.has(item.paintId))
      .map((item) => item.id);
    if (stockIds.length === 0) {
      pushToast({ message: '所选漆料尚未入库，无法加入分组', tone: 'warn' });
      return;
    }
    state.setSelected(stockIds);
    const result = await state.moveSelectedToGroup(groupChoice || null);
    state.clearSelection();
    if (result.ok) setSelection([]);
  }

  const loading = brandId !== ALL_BRANDS && brandId !== '' && brandState[brandId] === 'loading';
  const failed = brandId !== ALL_BRANDS && brandId !== '' && brandState[brandId] === 'error';

  return (
    <section className="flex h-full min-h-0" data-page="procure">
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-bg-1" aria-label="品牌">
        <div className="border-b border-line px-3 py-2">
          <h1 className="t-display text-sm text-text-1">PROCURE // 采购大厅</h1>
          <p className="t-label mt-1">//01 选择你拥有的漆</p>
        </div>
        <BrandColumn
          rows={brandRows}
          selectedId={brandId}
          selectedLineId={filters.lineId}
          onSelect={(id) => setBrandId(id)}
          onSelectLine={(lineId) => setFilters((prev) => ({ ...prev, lineId }))}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ProcureToolbar
          filters={filters}
          options={options}
          total={visible.length}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        />

        <div role="listbox" aria-label="色号列表" className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <p data-procure-loading="" className="border-b border-line px-3 py-2 text-xs text-text-2">
              正在加载品牌包…
            </p>
          )}

          {failed && (
            <Empty
              className="border-0"
              title="品牌包加载失败"
              description="目录文件不可用或格式不正确，检查后再试一次。"
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    void useAppStore.getState().ensureBrand(brandId);
                  }}
                >
                  重试
                </Button>
              }
            />
          )}

          {!loading && !failed && visible.length === 0 && (
            <Empty
              className="border-0"
              title="没有匹配的色号"
              description="换个色号、色值或属性词试试，例如 C80 / #1838a8 / 消光。"
            />
          )}

          {!failed &&
            visible.map((paint) => {
              const line = linesById[paint.lineId];
              if (!line) return null;
              const brand = brands.find((entry) => entry.id === paint.brandId);
              const registered = stockAggregate[paint.id]?.count ?? 0;
              return (
                <div
                  key={paint.id}
                  className="flex items-stretch border-b border-line"
                  data-paint-line={paint.lineId}
                >
                  <PaintRow
                    paint={paint}
                    line={line}
                    brand={brand}
                    selected={selection.includes(paint.id)}
                    onSelect={togglePaint}
                    badges={
                      <>
                        {registered > 0 && <Badge tone="accent">已入库 ×{registered}</Badge>}
                        {!paint.verifiedAt && (
                          <Badge
                            tone="warn"
                            title={
                              '该规格尚未核验，按 ' +
                              (paint.volumeMl ?? line.defaultVolumeMl) +
                              ' ml 记账' +
                              (paint.source ? '（来源：' + paint.source + '）' : '')
                            }
                          >
                            ⚠ 待核验
                          </Badge>
                        )}
                      </>
                    }
                    className="flex-1"
                  />
                  <div className="flex shrink-0 items-center pr-2">
                    <Button
                      size="sm"
                      variant={registered > 0 ? 'secondary' : 'primary'}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRegister([paint]);
                      }}
                    >
                      {registered > 0 ? '再入库一份' : '+ 入库'}
                    </Button>
                  </div>
                </div>
              );
            })}
        </div>

        <Toolbar count={selection.length}>
          <Button variant="primary" size="sm" onClick={() => openRegister(selectedPaints)}>
            入库 ({selection.length})
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setGroupChoice('');
              setGroupOpen(true);
            }}
          >
            加入分组
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelection([])}>
            清空选择
          </Button>
        </Toolbar>
      </div>

      <RegisterDialog
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open);
          if (!open) setDialogPaints([]);
        }}
        paints={dialogPaints}
        linesById={linesById}
        groups={groups}
        brandNames={brandNames}
        defaultRatio={defaultRatio}
        busy={busy}
        onSubmit={(payload) => {
          void handleRegister(payload);
        }}
      />

      <Dialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        title="加入分组"
        description="把所选漆已入库的条目移入一个分组（可撤销）。"
        width={420}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setGroupOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={() => void applyGroup()}>
              确认
            </Button>
          </>
        }
      >
        <span className="t-label mb-1 block">目标分组</span>
        <select
          aria-label="目标分组"
          value={groupChoice}
          onChange={(event) => setGroupChoice(event.target.value)}
          className="h-8 w-full cursor-pointer border border-line bg-bg-0 px-2 text-xs text-text-1 hover:border-line-strong"
        >
          <option value="">未分组</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {'·'.repeat(Math.max(0, group.depth - 1))}
              {group.name}
            </option>
          ))}
        </select>
      </Dialog>
    </section>
  );
}
