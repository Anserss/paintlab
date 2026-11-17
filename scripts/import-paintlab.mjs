#!/usr/bin/env node
/**
 * import-paintlab.mjs —— 把 paintlab 的厂商数据表（CSV）重建为项目目录种子
 *
 * 用法：
 *   node scripts/import-paintlab.mjs [--csv <合并表.csv>] [--out docs/seed/paint-catalog.seed.json]
 *
 * 数据来源（唯一）：
 *   H:/AI/DEEPSEEK/harmess/paintlab/郡士_匠域_油性漆_合并.csv
 *   列：序号,品牌,系列,类别,名称（中文）,原名 / 英文名,厂商代号,色号,特性,容量,参考价(日元含税),备注,来源
 *
 * 色值规则（数据纪律）：
 *   1) 先按 (brandId, 色号) 复用旧目录里已核验过的色值（旧目录的 #ffffff 是辅料占位，不复用）；
 *   2) 未命中时按「色名 + 特性」推定近似色，写入 hexEstimated: true，界面以 ≈ 标注；
 *   3) 辅料（aux）按项目约定统一 #ffffff（色块由 paintClass 渲染为白色 70%）。
 *
 * 零依赖，Node ESM。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = process.cwd();
const CSV_PATH = resolve(arg('csv', 'H:/AI/DEEPSEEK/harmess/paintlab/郡士_匠域_油性漆_合并.csv'));
const OUT_PATH = resolve(arg('out', 'docs/seed/paint-catalog.seed.json'));

/* ------------------------------------------------------------------ */
/* CSV                                                                */
/* ------------------------------------------------------------------ */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      /* skip */
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const raw = parseCsv(readFileSync(CSV_PATH, 'utf8').replace(/^\ufeff/, ''));
const header = raw.shift().map((h) => h.trim());
const col = (name) => header.indexOf(name);
const idx = {
  brand: col('品牌'),
  series: col('系列'),
  category: col('类别'),
  nameZh: col('名称（中文）'),
  nameEn: col('原名 / 英文名'),
  code: col('厂商代号'),
  codeNo: col('色号'),
  feature: col('特性'),
  volume: col('容量'),
  note: col('备注'),
  source: col('来源'),
};
for (const [key, value] of Object.entries(idx)) {
  if (value < 0) throw new Error(`CSV 缺少列：${key}`);
}

const rows = raw
  .filter((r) => r.length > 1 && (r[idx.code] ?? '').trim())
  .map((r) => ({
    brand: r[idx.brand].trim(),
    series: r[idx.series].trim(),
    category: r[idx.category].trim(),
    nameZh: r[idx.nameZh].trim(),
    nameEn: (r[idx.nameEn] ?? '').trim(),
    code: r[idx.code].trim(),
    feature: (r[idx.feature] ?? '').trim(),
    volume: Number((r[idx.volume] ?? '').replace(/[^\d.]/g, '')) || 0,
    note: (r[idx.note] ?? '').trim(),
    source: (r[idx.source] ?? '').trim(),
  }));

/* ------------------------------------------------------------------ */
/* 品牌 / 产品线                                                       */
/* ------------------------------------------------------------------ */
const BRANDS = [
  { id: 'gsi', name: 'GSI Creos', nameZh: '郡士', shortName: 'GSI', accentHex: '#1B4FA0', country: 'JP', sort: 10 },
  { id: 'jy', name: 'Jumpwind', nameZh: '匠域', shortName: 'JW', accentHex: '#C0453A', country: 'CN', sort: 20 },
];
const brandIdOf = (label) => (label.includes('郡士') ? 'gsi' : label.includes('匠域') ? 'jy' : null);

/** 系列 → 产品线 slug（ASCII，稳定、可读） */
const SERIES_SLUG = {
  'GUNDAM COLOR 油性 (UG)': 'ug',
  'Mr.CLEAR COLOR GX': 'gx-clear',
  'Mr.COLOR GGX': 'ggx',
  'Mr.COLOR GGX 稀释剂': 'ggx-thinner',
  'Mr.COLOR GX': 'gx',
  'Mr.COLOR GX 特效保护漆': 'gx-effect',
  'Mr.COLOR SPRAY': 'spray',
  'Mr.COLOR 基础色': 'mr-color',
  'Mr.COLOR 复刻色 (CRE)': 'cre',
  'Mr.COLOR 天鹅绒色 (CV)': 'cv',
  'Mr.COLOR 灰烬与机甲色 (CA)': 'ca',
  'Mr.COLOR 特种超级金属色 (UM)': 'um',
  'Mr.COLOR 稀释剂与辅助剂': 'aux',
  'Mr.COLOR 色之源 (CR)': 'cr',
  'Mr.COLOR 超级金属色2 (SM)': 'sm',
  'Mr.CRYSTAL COLOR': 'crystal',
  'Mr.METALLIC COLOR GX': 'metallic-gx',
  'Mr.SUPER CLEAR 油性保护漆喷罐': 'super-clear-spray',
  'Mr.SURFACER 瓶装水补土': 'surfacer',
  'Mr.WEATHERING COLOR 油性旧化液': 'weathering',
  'Mr.WEATHERING COLOR 稀释剂': 'weathering-thinner',
  'Mr.WEATHERING PASTE 旧化膏': 'weathering-paste',
  '合作油性漆 (LAC 等)': 'co-lacquer',
  'CLEAR 透明色': 'clear',
  'COLOR THINNER 稀释液系列（CT）': 'ct',
  'EXTRA METAL 特级金属色': 'extra-metal',
  'FLUORESCENT 荧光色': 'fluorescent',
  'GLAZE 珍珠色': 'glaze',
  'MEKA COLOR 科幻色': 'meka',
  'METALLIC CHROMA 金属彩色': 'metallic-chroma',
  'MULTI PRIMER 附着力底液系列（MP）': 'mp',
  'NEO COLOR 基本色': 'neo',
  'NEO COLOR 超级白/黑': 'neo-super',
  'PRIME METAL 专业级金属色': 'prime-metal',
};

const slugify = (text, fallback) => {
  const ascii = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || fallback;
};

/* ------------------------------------------------------------------ */
/* 类别 / 漆类 / 光泽 映射（设计书 6.4 + 2.3）                          */
/* ------------------------------------------------------------------ */
const AUX_CATEGORIES = new Set(['稀释剂', '缓干剂', '清洗剂', '脱漆剂', '消光添加剂', '溶解恢复剂']);
const CLEAR_CATEGORIES = new Set(['透明色', '清漆保护', '保护漆喷罐']);

const CATEGORY_MAP = {
  色漆: 'color',
  喷罐色漆: 'color',
  金属色: 'color',
  珍珠色: 'color',
  透明色: 'color',
  清漆保护: 'varnish',
  保护漆喷罐: 'varnish',
  稀释剂: 'thinner',
  缓干剂: 'retarder',
  消光添加剂: 'matte',
  下地处理剂: 'primer',
  '底涂/附着力底液': 'primer',
  旧化液: 'wash',
  旧化膏: 'effect',
  清洗剂: 'other',
  脱漆剂: 'other',
  溶解恢复剂: 'other',
};

const paintClassOf = (category) => (AUX_CATEGORIES.has(category) ? 'aux' : CLEAR_CATEGORIES.has(category) ? 'clear' : 'solid');

function finishOf(row, paintClass) {
  if (paintClass === 'aux') return 'additive';
  if (paintClass === 'clear') return 'clear';
  const { category, feature, series } = row;
  const text = `${category} ${feature} ${series}`;
  if (category === '金属色' || /金属|metal/i.test(category)) return 'metal';
  if (category === '珍珠色' || /珍珠|pearl/i.test(text)) return 'pearl';
  if (/荧光|fluorescent/i.test(text)) return 'fluorescent';
  if (category === '旧化液' || category === '旧化膏') return 'wash';
  if (category === '下地处理剂' || category === '底涂/附着力底液') return 'primer';
  if (/消光|哑光|matte/i.test(text)) return 'matte';
  if (/半光泽|semi/i.test(text)) return 'semiGloss';
  if (/光泽|gloss/i.test(text)) return 'gloss';
  return 'other';
}

/* ------------------------------------------------------------------ */
/* 色值：旧目录复用 + 色名推定                                          */
/* ------------------------------------------------------------------ */
const normalizeCode = (code) => {
  const text = String(code ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const match = /^([A-Z]+)0*(\d+)$/.exec(text);
  return match ? `${match[1]}${Number(match[2])}` : text;
};

function loadOldHex() {
  const map = new Map();
  for (const brand of ['gsi', 'jy']) {
    const file = resolve(ROOT, 'public/catalog', `${brand}.json`);
    if (!existsSync(file)) continue;
    try {
      const bundle = JSON.parse(readFileSync(file, 'utf8'));
      for (const paint of bundle.paints ?? []) {
        const hex = String(paint.hex ?? '').toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(hex) || hex === '#ffffff') continue;
        if (paint.paintClass === 'aux') continue;
        map.set(`${brand}|${normalizeCode(paint.code)}`, hex);
      }
    } catch {
      /* 单个品牌包损坏不影响导入 */
    }
  }
  return map;
}

/** 色名 → RGB 基色；长词优先 */
const HUE_WORDS = [
  ['天蓝', [86, 156, 214]],
  ['海军蓝', [26, 46, 88]],
  ['钴蓝', [24, 78, 162]],
  ['湖蓝', [46, 139, 156]],
  ['午夜蓝', [24, 34, 66]],
  ['冰蓝', [150, 190, 210]],
  ['蓝绿', [38, 120, 122]],
  ['绿松石', [64, 160, 160]],
  ['橄榄', [107, 107, 58]],
  ['卡其', [176, 158, 118]],
  ['沙黄', [198, 168, 96]],
  ['沙色', [206, 178, 122]],
  ['米色', [215, 201, 168]],
  ['象牙', [238, 229, 200]],
  ['奶油', [242, 232, 194]],
  ['酒红', [114, 22, 40]],
  ['朱红', [200, 60, 40]],
  ['玫红', [196, 56, 104]],
  ['樱粉', [232, 170, 190]],
  ['粉红', [232, 124, 154]],
  ['橙红', [214, 88, 40]],
  ['黄绿', [154, 178, 62]],
  ['土黄', [186, 152, 84]],
  ['灰绿', [116, 132, 108]],
  ['灰紫', [134, 122, 148]],
  ['蓝灰', [106, 126, 148]],
  ['红棕', [126, 70, 52]],
  ['紫棕', [104, 74, 84]],
  ['棕红', [140, 74, 54]],
  ['白', [242, 242, 242]],
  ['黑', [26, 26, 26]],
  ['灰', [140, 140, 140]],
  ['银', [190, 193, 196]],
  ['金', [201, 162, 39]],
  ['铜', [184, 115, 51]],
  ['红', [198, 40, 40]],
  ['橙', [239, 108, 0]],
  ['黄', [242, 194, 0]],
  ['绿', [46, 125, 50]],
  ['蓝', [21, 101, 192]],
  ['紫', [106, 27, 154]],
  ['粉', [232, 124, 154]],
  ['棕', [109, 76, 65]],
  ['褐', [112, 84, 62]],
  ['赭', [160, 106, 66]],
  ['米', [215, 201, 168]],
  ['肤', [224, 176, 144]],
  ['桃', [226, 138, 120]],
  ['樱', [232, 170, 190]],
  ['木', [124, 92, 66]],
  ['土', [168, 140, 102]],
  ['栗', [110, 60, 46]],
];

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
const lighten = (rgb, amount) => rgb.map((v) => v + (255 - v) * amount);
const darken = (rgb, amount) => rgb.map((v) => v * (1 - amount));
const desaturate = (rgb, amount) => {
  const gray = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return rgb.map((v) => v + (gray - v) * amount);
};

const NEUTRAL_HEX = '#b0b0b0';

function estimateHex(row) {
  const text = `${row.nameZh} ${row.nameEn} ${row.feature}`.toLowerCase();
  const hit = HUE_WORDS.find(([word]) => text.includes(word.toLowerCase()));
  if (!hit) return { hex: NEUTRAL_HEX, estimated: true };
  let rgb = [...hit[1]];
  if (/深|暗|浓|dark|shadow/.test(text)) rgb = darken(rgb, 0.38);
  if (/浅|淡|亮|明|浅色|light|bright|pale/.test(text)) rgb = lighten(rgb, 0.42);
  if (/金属|metal|metallic|铬|chrome|钛|titan/.test(text)) rgb = desaturate(rgb, 0.28);
  if (/银|铝|钢|钛|chrome|alumin/.test(text)) rgb = lighten(desaturate(rgb, 0.55), 0.2);
  if (/透明|clear|translucent/.test(text)) rgb = lighten(rgb, 0.18);
  return { hex: toHex(rgb), estimated: true };
}

/* ------------------------------------------------------------------ */
/* 生成                                                                */
/* ------------------------------------------------------------------ */
const oldHex = loadOldHex();
const brandSet = new Map(BRANDS.map((b) => [b.id, b]));
const missingBrand = rows.filter((row) => !brandIdOf(row.brand));
if (missingBrand.length > 0) {
  throw new Error(`无法识别品牌：${[...new Set(missingBrand.map((r) => r.brand))].join(', ')}`);
}

/** 产品线：按 品牌 + 系列 归并 */
const lineMap = new Map();
for (const row of rows) {
  const brandId = brandIdOf(row.brand);
  const key = `${brandId}|${row.series}`;
  if (lineMap.has(key)) continue;
  const slug = SERIES_SLUG[row.series] ?? slugify(row.series, `line-${lineMap.size + 1}`);
  lineMap.set(key, { id: `${brandId}-${slug}`, brandId, series: row.series, rows: [] });
}
for (const row of rows) {
  lineMap.get(`${brandIdOf(row.brand)}|${row.series}`).rows.push(row);
}

const lines = [];
const paints = [];
const seenIds = new Set();
let reusedHex = 0;
let estimatedHex = 0;

for (const line of lineMap.values()) {
  const brand = brandSet.get(line.brandId);
  const volumeCount = new Map();
  const finishCount = new Map();
  let auxCount = 0;
  for (const row of line.rows) {
    volumeCount.set(row.volume, (volumeCount.get(row.volume) ?? 0) + 1);
    const cls = paintClassOf(row.category);
    const finish = finishOf(row, cls);
    finishCount.set(finish, (finishCount.get(finish) ?? 0) + 1);
    if (cls === 'aux') auxCount += 1;
  }
  const mode = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const defaultVolumeMl = mode(volumeCount) || 10;
  const defaultFinish = mode(finishCount) || 'gloss';
  const nameZh = line.series.replace(/^[A-Za-z0-9 .,()（）/·\-]+/, '').trim() || line.series;

  lines.push({
    id: line.id,
    brandId: line.brandId,
    name: line.series,
    nameZh,
    packaging: /喷罐|SPRAY|喷漆/i.test(line.series) ? 'tinlet' : 'bottle',
    defaultVolumeMl,
    kind: auxCount === line.rows.length ? 'auxiliary' : 'lacquer',
    resin: 'lacquer',
    solvent: 'oil',
    defaultFinish,
    thinnerFamily: brand.id === 'gsi' ? 'Mr.COLOR 稀释剂' : '匠域 CT 稀释液',
    defaultRatioN: 2,
  });

  for (const row of line.rows) {
    const paintClass = paintClassOf(row.category);
    const finish = finishOf(row, paintClass);
    const category = CATEGORY_MAP[row.category] ?? 'other';
    /** 名称缺失的行（官网不可达）用「类别 + 色号」占位，并如实标为名称待补 */
    const nameMissing = !row.nameZh && !row.nameEn;
    const displayName = row.nameEn || row.nameZh || `${row.category} ${row.code}`;
    const displayNameZh = row.nameZh || undefined;
    let hex = '#ffffff';
    let hexEstimated = false;
    let sourceNote = 'paintlab 合并表（型号/容量/来源）';
    if (paintClass === 'aux') {
      hex = '#ffffff';
    } else {
      const reused = oldHex.get(`${line.brandId}|${normalizeCode(row.code)}`);
      if (reused) {
        hex = reused;
        reusedHex += 1;
        sourceNote += '；色值沿用既有目录';
      } else {
        const estimate = estimateHex(row);
        hex = estimate.hex;
        hexEstimated = true;
        estimatedHex += 1;
        sourceNote += '；色值按色名推定';
      }
    }

    let id = `${line.brandId}-${slugify(row.code, 'sku')}`;
    if (seenIds.has(id)) id = `${id}-${seenIds.size}`;
    seenIds.add(id);

    paints.push({
      id,
      brandId: line.brandId,
      lineId: line.id,
      code: row.code,
      name: displayName,
      ...(displayNameZh ? { nameZh: displayNameZh } : {}),
      hex,
      ...(hexEstimated ? { hexEstimated: true } : {}),
      paintClass,
      finish,
      category,
      volumeMl: row.volume || defaultVolumeMl,
      source: nameMissing ? `${sourceNote}；名称待补（官网不可达）` : sourceNote,
      ...(row.source ? { sourceUrl: row.source } : {}),
      verified: Boolean(row.source),
      verifiedAt: row.source ? '2026-11-17' : null,
    });
  }
}

const stats = {
  brands: BRANDS.length,
  lines: lines.length,
  paints: paints.length,
  byClass: paints.reduce((acc, p) => {
    acc[p.paintClass] = (acc[p.paintClass] ?? 0) + 1;
    return acc;
  }, {}),
  hexReused: reusedHex,
  hexEstimated: estimatedHex,
};

const doc = {
  format: 'pigment-depot/seed/v1',
  generatedAt: new Date().toISOString(),
  license: 'SOURCE: paintlab 郡士/匠域 油性漆合并表（型号/容量/来源）；色值来源见各条 source 字段',
  brands: BRANDS,
  lines,
  stats,
  paints,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

console.log(`→ ${OUT_PATH}`);
console.log(`   品牌 ${stats.brands} / 产品线 ${stats.lines} / 漆料 ${stats.paints}`);
console.log(`   漆类 ${JSON.stringify(stats.byClass)}`);
console.log(`   色值：复用既有目录 ${reusedHex} 条，按色名推定 ${estimatedHex} 条`);
