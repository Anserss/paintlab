import type {
  Brand,
  Group,
  Paint,
  PaintCategory,
  PaintClass,
  Settings,
  StockItem,
  Workbench,
  WorkbenchItem,
} from '@/core/model/types';

/** 撤销深度上限/下限（spec 3.7.3 / 3.9） */
export const UNDO_DEPTH_MIN = 3;
export const UNDO_DEPTH_MAX = 20;

/** 设置项中文名（spec 3.9 白名单） */
export const SETTING_LABELS: Record<keyof Settings, string> = {
  theme: '主题',
  density: '卡片密度',
  levelMode: '液位分母',
  showTicks: '瓶身刻度',
  trackThinner: '扣减稀释剂库存',
  defaultRatio: '默认稀释比例',
  defaultBottleMl: '默认批次容量',
  neatStockWarn: '原浆低量警示',
  mlPerKit: '估算系数',
  undoDepth: '撤销深度',
  confirmDestructive: '破坏性操作二次确认',
  catalogMirror: '目录来源',
  mixSeq: '调漆序号',
  recentBottleColors: '最近使用色',
};

export function formatNumber(value: number, precision: number): string {
  return Number.isFinite(value) ? value.toFixed(precision) : '0';
}

/** 输入钳制：先按精度四舍五入，再夹进 [min, max]（undoDepth 3–20 等） */
export function clampNumber(value: number, min: number, max: number, precision = 0): number {
  if (!Number.isFinite(value)) return min;
  const factor = Math.pow(10, precision);
  const rounded = Math.round(value * factor) / factor;
  return Math.min(max, Math.max(min, rounded));
}

export const clampUndoDepth = (value: number): number =>
  clampNumber(value, UNDO_DEPTH_MIN, UNDO_DEPTH_MAX, 0);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return (index === 0 ? String(Math.round(value)) : value.toFixed(1)) + ' ' + units[index];
}

/* ------------------------------------------------------------------ */
/* 3.7 数据范围 / 字段级权限 / 配额                                      */
/* ------------------------------------------------------------------ */

/**
 * 3.7.1 数据分区、3.7.2 字段级写入权限矩阵、3.7.3 配额与上限的完整说明，
 * 已从设置页迁出，改为随应用包发布的说明文档：
 *   docs/数据范围与字段级权限.md（可读版：同目录 .html）
 * 这里只保留界面仍然需要的撤销深度上下限（spec 3.7.3 / 3.9）。
 */
/* ------------------------------------------------------------------ */
/* 10.1 快捷键                                                         */
/* ------------------------------------------------------------------ */

export interface ShortcutRow {
  id: string;
  combo: string;
  action: string;
}

export const SHORTCUT_ROWS: ShortcutRow[] = [
  { id: 'pages', combo: '1 – 5', action: '切换五个一级页面（采购 / 仓库 / 调漆台 / 工作台 / 设置）' },
  { id: 'undo', combo: 'Ctrl / ⌘ + Z', action: '撤销' },
  { id: 'redo', combo: 'Ctrl / ⌘ + Shift + Z', action: '反撤销' },
  { id: 'search', combo: 'Ctrl / ⌘ + K', action: '全局搜索（漆料 / 代号 / 分组）' },
  { id: 'select-all', combo: 'Ctrl / ⌘ + A', action: '全选当前网格' },
  { id: 'escape', combo: 'Esc', action: '关闭弹层 / 取消选择' },
  { id: 'space', combo: 'Space', action: '卡片聚焦时打开详情' },
  { id: 'enter', combo: 'Enter', action: '卡片聚焦时打开「移动至…」菜单' },
  { id: 'switch-workbench', combo: '[ / ]', action: '切换工作台' },
  { id: 'help', combo: '?', action: '快捷键帮助' },
];

/* ------------------------------------------------------------------ */
/* 关于：许可 / 免责（9.1 ③ / 9.4 / docs\seed\README.md）              */
/* ------------------------------------------------------------------ */

/** 原文照抄 docs/seed/README.md 的 MIT 引用块，不得改写 */
export const MIT_NOTICE = [
  'Paint colour data derived from ModKit Swatch',
  '(https://github.com/afzafri/modkit-swatch), MIT License.',
  'Copyright (c) modkit-swatch contributors.',
].join('\n');

export interface AboutNotice {
  id: string;
  title: string;
  body: string;
}

export const ABOUT_NOTICES: AboutNotice[] = [
  {
    id: 'unofficial',
    title: '非官方声明',
    body:
      '本项目为个人非官方工具，与任何漆料厂商（含 郡士 GSI Creos、匠域 Jumpwind、田宫 Tamiya、AK Interactive）均无隶属关系，未获授权、未获背书，也不代表厂商立场。',
  },
  {
    id: 'measure',
    title: '色值为社区测量值，仅作示意',
    body:
      '目录里的 hex 是社区测量值，不是厂商官方色值；界面色块仅为示意色，实际漆膜受底漆、稀释比例与光线影响。显示本身不暗示厂商背书（设计书 9.1 ③ / 9.4）。',
  },
  {
    id: 'assets',
    title: '商标与素材',
    body:
      '全站不使用、不打包任何厂商 Logo 或图标，品牌仅以文字（中文名 + 英文缩写）标识商品来源，属描述性使用；也不打包任何《明日方舟》素材（9.4）。',
  },
  {
    id: 'third-party',
    title: '第三方数据许可',
    body:
      '主数据源为 afzafri/modkit-swatch，采用 MIT License，必须保留下列版权与许可原文。另有 3 条 AK 数据（RC236 / RC291 / RC316）来自 GK-Mixer 公开页面的观察记录，仅作流程样本，未批量搬运（PolyForm Noncommercial 1.0.0）。',
  },
];

/* ------------------------------------------------------------------ */
/* 库存 CSV（spec 3.8：品牌/代号/名称/色值/类/剩余/分组/工作台）           */
/* ------------------------------------------------------------------ */

const PAINT_CLASS_LABEL: Record<PaintClass, string> = { solid: '实色', clear: '透明', aux: '辅料' };

const PAINT_CATEGORY_LABEL: Record<PaintCategory, string> = {
  color: '色漆',
  varnish: '清漆',
  matte: '消光',
  thinner: '稀释剂',
  retarder: '缓干剂',
  primer: '底漆',
  surfacer: '补土',
  wash: '渗线液',
  effect: '效果',
  other: '其他',
};

export const CSV_HEADER = ['品牌', '代号', '名称', '色值', '类', '剩余 ml', '分组', '工作台'];

export interface InventoryCsvSource {
  stockItems: StockItem[];
  groups: Group[];
  workbenches: Workbench[];
  workbenchItems: WorkbenchItem[];
  paintOf: (id: string) => Paint | undefined;
  brandOf: (id: string) => Brand | undefined;
}

export function buildInventoryCsvRows(source: InventoryCsvSource): string[][] {
  const groupName = new Map(source.groups.map((group) => [group.id, group.name]));
  const workbenchName = new Map(source.workbenches.map((workbench) => [workbench.id, workbench.name]));

  const workbenchesOf = new Map<string, string[]>();
  for (const item of source.workbenchItems) {
    if (item.refType !== 'stock') continue;
    const name = workbenchName.get(item.workbenchId);
    if (!name) continue;
    const list = workbenchesOf.get(item.refId) ?? [];
    list.push(name);
    workbenchesOf.set(item.refId, list);
  }

  const rows: string[][] = [CSV_HEADER];
  for (const item of source.stockItems) {
    const paint = source.paintOf(item.paintId);
    const brand = paint ? source.brandOf(paint.brandId) : undefined;
    rows.push([
      brand ? brand.nameZh || brand.name : '',
      paint?.code ?? '',
      paint ? paint.nameZh || paint.name : '',
      paint?.hex ?? '',
      paint ? PAINT_CLASS_LABEL[paint.paintClass] + ' / ' + PAINT_CATEGORY_LABEL[paint.category] : '',
      item.volumeMl.toFixed(1),
      item.groupId ? groupName.get(item.groupId) ?? '' : '',
      (workbenchesOf.get(item.id) ?? []).join('、'),
    ]);
  }
  return rows;
}
