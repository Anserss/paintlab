/**
 * 领域类型（spec 6.1）。纯 TypeScript，零 React / 零 Dexie 依赖。
 * 分层铁律：features -> store -> data -> core，方向不可逆。
 */

export type PaintClass = 'solid' | 'clear' | 'aux';
export type PaintCategory =
  | 'color'
  | 'varnish'
  | 'matte'
  | 'thinner'
  | 'retarder'
  | 'primer'
  | 'surfacer'
  | 'wash'
  | 'effect'
  | 'other';
export type Packaging = 'dropper' | 'pot' | 'jar' | 'tinlet' | 'bottle';
export type PaintState = 'neat' | 'thinned';
/** 调漆台的两种模式：稀释（原浆 + 稀释剂）/ 调漆（多组分混合） */
export type MixBatchMode = 'dilute' | 'blend';
export type Origin = 'seed' | 'custom' | 'import' | 'mixed';
export type LevelMode = 'baseline' | 'capacity';

export type Solvent = 'oil' | 'water' | 'na';
export type ResinType = 'lacquer' | 'acrylic' | 'enamel';
export type Finish =
  | 'gloss'
  | 'semiGloss'
  | 'matte'
  | 'metal'
  | 'pearl'
  | 'clear'
  | 'fluorescent'
  | 'primer'
  | 'additive'
  | 'wash'
  | 'ink'
  | 'other';

export interface Brand {
  id: string;
  name: string;
  nameZh: string;
  shortName: string;
  aliases: string[];
  accentHex: string;
  country: string;
  sort: number;
  displayAlias?: string;
}

export interface PaintLine {
  id: string;
  brandId: string;
  name: string;
  nameZh?: string;
  packaging: Packaging;
  defaultVolumeMl: number;
  kind: 'acrylic' | 'enamel' | 'lacquer' | 'auxiliary';
  resin: ResinType;
  solvent: Solvent;
  defaultFinish: Finish;
  thinnerFamily?: string;
  defaultRatioN?: number;
}

export interface Paint {
  id: string;
  lineId: string;
  brandId: string;
  code?: string;
  name: string;
  nameZh?: string;
  hex: string;
  paintClass: PaintClass;
  category: PaintCategory;
  finish?: Finish;
  opacityOverride?: number;
  sourceUrl?: string;
  /** 来源说明；辅料常带"待核验"字样 */
  source?: string;
  /** 单件规格：辅料按 50/110/250/400 ml 分 SKU，色卡缺省沿用 PaintLine.defaultVolumeMl */
  volumeMl?: number;
  /** 色值是按色名推定的近似值（未取到厂商官方色卡）：界面用 ≈ 标注，不谎称已核验 */
  hexEstimated?: boolean;
  verifiedAt?: string;
  origin: Origin;
}

/**
 * 2.1.1 分解快照：批次/库存条目入库时按组分记下「从哪来、各多少 ml」，
 * 删除条目时可以选择「分解回仓库」而不是直接丢掉。
 */
export interface BatchPart {
  paintId: string;
  brandId: string;
  code?: string;
  name: string;
  nameZh?: string;
  hex: string;
  paintClass: PaintClass;
  /** 该组分在产品里的体积（ml） */
  ml: number;
  state: PaintState;
  ratioN?: number;
  /** 稀释剂 / 缓干剂等辅料：分解后单独作为辅料条目回仓库 */
  aux?: boolean;
  /** 来源本身是「稀释漆料」（带比例牌）：分解后按稀释漆料还原 */
  dilute?: boolean;
  /**
   * 2.2：来源条目本身的配方签名（调漆产物 / 已稀释漆料作为组分时写入）。
   * 同配方合并按它判等，避免「两支不同混合漆恰好以同一原浆打底」被误合并。
   */
  sourceKey?: string;
  /** 2.2：来源条目的展示名（配方说明 / 分解文案用） */
  sourceLabel?: string;
}

export interface StockItem {
  id: string;
  paintId: string;
  volumeMl: number;
  initialMl: number;
  state: PaintState;
  ratioN?: number;
  groupId: string | null;
  note?: string;
  origin: Origin;
  createdAt: number;
  openedAt?: number;
  /** 冗余缓存：色环坐标（9.7），由写入层计算，读取层可直接用 */
  cachedHsl?: { h: number; s: number; l: number };
  /** 调漆产物入库时保留的自定义名称 / 颜色（仓库行优先显示） */
  customName?: string;
  customHex?: string;
  customAlpha?: number;
  /**
   * 2.1 稀释漆料标记：来源批次是「稀释」时记下比例 1:N。
   * 有它 = 稀释漆料：名称与色值沿用原浆，显示时名称前加「(1:N)稀释」灰底白字小牌；
   * 缺省 = 采购原浆或调漆产物（调漆沿用 2.0 的自定义名/色）。
   */
  dilutionRatioN?: number;
  /** 2.1.1 组分快照：删除时可「分解回原浆 / 辅料 / 调漆前的稀释漆料」 */
  parts?: BatchPart[];
  /**
   * 2.2：配方签名（同配方自动合并的唯一判定键）。
   * 稀释产物 = 原浆 + 稀释剂 + 比例；调漆产物 = 各组分身份 + 体积占比。缺省时按 parts 现算。
   */
  mixKey?: string;
  /** 2.2：配方说明（例如「钴蓝 10.0 ml + 白 10.0 ml」），只用于展示 */
  mixLabel?: string;
}

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  depth: 1 | 2 | 3;
  sort: number;
  system?: boolean;
}

export interface Bottle {
  id: string;
  name: string;
  capacityMl: number;
  baselineMl: number;
  remainingMl: number;
  ratioN: number;
  paintClass: PaintClass;
  hex: string;
  components: BottleComponent[];
  labelBrandId?: string;
  labelCode?: string;
  levelMode: LevelMode;
  updatedAt: number;
  /** 这一批是「稀释」还是「调漆」产出的（界面标签用） */
  mode?: MixBatchMode;
  /** 调漆序号（调漆1、调漆2…）：递增、删除不回收 */
  seq?: number;
  /** 自定义展示色（#RRGGBB）；缺省 = 未定色白 */
  colorHex?: string;
  /** 自定义透明度 0–100；缺省 = 70 */
  colorAlpha?: number;
  /** 2.1.1 组分快照：入库后写到 StockItem.parts，删除时可分解回仓库 */
  parts?: BatchPart[];
}

export interface BottleComponent {
  stockItemId: string;
  paintId: string;
  neatMl: number;
  brandId: string;
  code?: string;
  name: string;
  hex: string;
  paintClass: PaintClass;
}

export interface Workbench {
  id: string;
  name: string;
  note?: string;
  accent: string;
  sort: number;
  createdAt: number;
}

/** Dexie 表名 workbenchItems 存的就是 WorkbenchItem */
export interface WorkbenchItem {
  id: string;
  workbenchId: string;
  refType: 'stock' | 'bottle';
  refId: string;
  plannedUseMl: number;
  addedAt: number;
}

export interface MixRecord {
  id: string;
  /** 2.1 及更早：调漆台批次 id（2.2 起不再产生新 bottle，保留给旧记录） */
  bottleId?: string;
  /** 2.2：自动入库后的库存条目 id（同配方合并时指向被合并的那一瓶） */
  stockItemId?: string;
  neatMl: number;
  thinnerMl: number;
  ratioN: number;
  totalMl: number;
  filledToMl: number;
  at: number;
  /** 稀释产物 / 调漆产物；缺省视为旧的「调配」记录 */
  mode?: MixBatchMode;
  /** 调漆模式下的组分明细 */
  parts?: MixRecordPart[];
}

export interface MixRecordPart {
  stockItemId: string;
  paintId: string;
  ml: number;
  ratioN: number;
}

export type UsageReason = 'paint' | 'return' | 'spill' | 'evaporate' | 'manual';

export interface UsageRecord {
  id: string;
  targetType: 'stock' | 'bottle' | 'workbench';
  targetId: string;
  amountMl: number;
  reason?: UsageReason;
  at: number;
}

export interface LedgerEntry {
  id: string;
  type: 'purchase' | 'mix' | 'use' | 'adjust' | 'group' | 'workbench' | 'archive';
  deltaMl?: number;
  refId: string;
  at: number;
  meta?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* 撤销：命令 + 数据补丁（spec 3.6 / 5.3）                              */
/* ------------------------------------------------------------------ */

export type CollectionName =
  | 'brands'
  | 'paints'
  | 'stockItems'
  | 'groups'
  | 'bottles'
  | 'workbenches'
  | 'workbenchItems'
  | 'mixRecords'
  | 'usageRecords'
  | 'ledger'
  | 'settings';

export type Patch =
  | { op: 'replace'; collection: CollectionName; id: string; path: string; value: unknown }
  | { op: 'add'; collection: CollectionName; doc: Record<string, unknown> }
  | { op: 'remove'; collection: CollectionName; id: string }
  | { op: 'append'; collection: CollectionName; doc: Record<string, unknown> };

export type CommandType =
  | 'purchase'
  | 'group'
  | 'workbench'
  | 'mix'
  | 'use'
  | 'adjust'
  | 'archive'
  | 'batch';

export interface Command {
  id: string;
  type: CommandType;
  label: string;
  at: number;
  forward: Patch[];
  inverse: Patch[];
}

/* ------------------------------------------------------------------ */
/* 设置项白名单（spec 3.9）                                            */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'dark' | 'light' | 'auto';
export type Density = 'compact' | 'normal' | 'comfy';

export interface Settings {
  theme: ThemeMode;
  density: Density;
  levelMode: LevelMode;
  showTicks: boolean;
  trackThinner: boolean;
  defaultRatio: number;
  defaultBottleMl: number;
  neatStockWarn: boolean;
  mlPerKit: number;
  undoDepth: number;
  confirmDestructive: boolean;
  catalogMirror: string;
  /** 调漆序号计数器：只增不减，删除批次不回收 */
  mixSeq: number;
  /** 颜色编辑器最近使用色（最多 12 条，最近在前） */
  recentBottleColors: { hex: string; alpha: number }[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  density: 'normal',
  levelMode: 'baseline',
  showTicks: true,
  trackThinner: true,
  defaultRatio: 2,
  defaultBottleMl: 60,
  neatStockWarn: true,
  mlPerKit: 2.5,
  undoDepth: 3,
  confirmDestructive: true,
  catalogMirror: 'bundled',
  mixSeq: 0,
  recentBottleColors: [],
};

/** 目录包（public/catalog/{brandId}.json 与 index.json） */
export interface CatalogIndex {
  catalogVersion: string;
  generatedAt?: string;
  brands: { id: string; name: string; nameZh: string; shortName: string; count: number }[];
}

export interface CatalogBundle {
  catalogVersion: string;
  brand: Brand;
  lines: PaintLine[];
  paints: Paint[];
}
