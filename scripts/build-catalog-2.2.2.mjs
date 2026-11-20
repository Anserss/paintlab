#!/usr/bin/env node
/**
 * build-catalog-2.2.2.mjs —— 2.2.2 目录构建（零依赖）
 *
 * 用法：
 *   node scripts/build-catalog-2.2.2.mjs            # 写 public/catalog/
 *   node scripts/build-catalog-2.2.2.mjs --dry      # 只打印统计，不写文件
 *
 * 输入：
 *   ../paintlab/modkit-swatch/data/paints.json   上游 modkit-swatch 591 条（7 品牌）
 *   scripts/data/aux-2.2.2.json                  手补辅料（盖亚 / 田宫的稀释剂）
 *   public/catalog/gsi.json / jy.json            既有品牌包（2.1.2 口径，保留 verifiedAt/source）
 *
 * 产出：
 *   public/catalog/index.json                    7 个品牌的索引
 *   public/catalog/{brandId}.json                盖亚 / 郡士 / 匠域 / 田宫 / 喵酱 / 星影 / 青鸟川
 *
 * 规则：
 *   - 新品牌整包由 modkit-swatch 生成；郡士 / 匠域只做「补号 + 校正推定色」，不改已核验色值。
 *   - 推定色（hexEstimated=true）才允许换成 modkit 色值，已核验/官方取样色不动。
 *   - modkit 的 MC51 与既有的 JWMC51 是同一支漆（名称一致），统一成 JWMC51，避免同漆两条。
 *   - 辅料按 SKU 建条目（volumeMl 各自成行），source 写明核验程度。
 *
 * 幂等：重复运行结果一致（已有 paint.id 跳过；色值已一致则不重复改写 source）。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'catalog');
const MODKIT = resolve(ROOT, '..', 'paintlab', 'modkit-swatch', 'data', 'paints.json');
const AUX_SEED = join(HERE, 'data', 'aux-2.2.2.json');
const DRY = process.argv.includes('--dry');
const CATALOG_VERSION = '2.2.2';
const MODKIT_URL = 'https://github.com/afzafri/modkit-swatch';
const MODKIT_SOURCE = 'modkit-swatch 色值库（MIT，上游 591 条）';

/* ------------------------------------------------------------------ */
/* 品牌与产品线                                                        */
/* ------------------------------------------------------------------ */

const BRANDS = {
  gsi: { name: 'GSI Creos', nameZh: '郡士', shortName: 'GSI', accentHex: '#1B4FA0', country: 'JP', sort: 10 },
  jy: { name: 'Jumpwind', nameZh: '匠域', shortName: 'JW', accentHex: '#C0453A', country: 'CN', sort: 20 },
  gaia: { name: 'Gaianotes', nameZh: '盖亚', shortName: 'GAIA', accentHex: '#E4572E', country: 'JP', sort: 30 },
  tamiya: { name: 'Tamiya', nameZh: '田宫', shortName: 'TAMIYA', accentHex: '#00539B', country: 'JP', sort: 40 },
  hobbymio: { name: 'Hobby Mio', nameZh: '喵酱', shortName: 'HM', accentHex: '#D64550', country: 'CN', sort: 50 },
  sunin7: { name: 'Sunin7', nameZh: '星影', shortName: 'SUNIN7', accentHex: '#6A4C93', country: 'CN', sort: 60 },
  qnc: { name: 'QNC', nameZh: '青鸟川', shortName: 'QNC', accentHex: '#2A9D8F', country: 'CN', sort: 70 },
};

/** modkit 的 brand 字段 -> 本地 brandId */
const MODKIT_BRAND = {
  'Mr. Color': 'gsi',
  Jumpwind: 'jy',
  Gaianotes: 'gaia',
  Tamiya: 'tamiya',
  'Hobby Mio': 'hobbymio',
  Sunin7: 'sunin7',
  QNC: 'qnc',
};

const lacquerLine = (extra) => ({
  packaging: 'bottle',
  defaultVolumeMl: 10,
  kind: 'lacquer',
  resin: 'lacquer',
  solvent: 'oil',
  defaultFinish: 'gloss',
  ...extra,
});

/** 每条产品线的判定规则：按顺序匹配 code 前缀，第一条命中即归属 */
const LINES = {
  gaia: [
    { id: 'gaia-color', name: 'Gaia Color 数字系列', nameZh: '数字色号', match: (c) => /^\d+$/.test(c), line: lacquerLine({}) },
    { id: 'gaia-ge', name: 'GE 系列', nameZh: 'GE 特殊色', match: (c) => /^GE-/i.test(c), line: lacquerLine({}) },
    { id: 'gaia-gp', name: 'GP 系列', nameZh: 'GP 高级色', match: (c) => /^GP-/i.test(c), line: lacquerLine({}) },
    { id: 'gaia-ex', name: 'EX 大瓶装系列', nameZh: 'EX 大瓶装', match: (c) => /^EX-/i.test(c), line: lacquerLine({ defaultVolumeMl: 18 }) },
    { id: 'gaia-tl', name: 'TL 铁道模型色', nameZh: 'TL 铁道模型色', match: (c) => /^TL-/i.test(c), line: lacquerLine({}) },
  ],
  tamiya: [
    { id: 'tamiya-xf', name: 'XF 水性消光色', nameZh: '水性消光色（XF）', match: (c) => /^XF-/i.test(c), line: { packaging: 'bottle', defaultVolumeMl: 10, kind: 'acrylic', resin: 'acrylic', solvent: 'water', defaultFinish: 'matte' } },
    { id: 'tamiya-x', name: 'X 水性光泽色', nameZh: '水性光泽色（X）', match: (c) => /^X-/i.test(c), line: { packaging: 'bottle', defaultVolumeMl: 10, kind: 'acrylic', resin: 'acrylic', solvent: 'water', defaultFinish: 'gloss' } },
    { id: 'tamiya-lp', name: 'LP 硝基色', nameZh: '硝基色（LP）', match: (c) => /^LP-/i.test(c), line: lacquerLine({}) },
  ],
  hobbymio: [
    { id: 'hobbymio-basic', name: 'HM 基础色', nameZh: '基础色（HM）', match: () => true, line: lacquerLine({ defaultVolumeMl: 18 }) },
  ],
  sunin7: [
    { id: 'sunin7-color', name: '数字系列', nameZh: '数字色号', match: (c) => /^\d+[A-Z]?$/.test(c), line: lacquerLine({ defaultVolumeMl: 18 }) },
    { id: 'sunin7-j', name: 'J 系列', nameZh: 'J 系列', match: (c) => /^J\d+/i.test(c), line: lacquerLine({ defaultVolumeMl: 18 }) },
  ],
  qnc: [
    { id: 'qnc-water', name: 'QNC 水性色', nameZh: '水性色', match: () => true, line: { packaging: 'bottle', defaultVolumeMl: 18, kind: 'acrylic', resin: 'acrylic', solvent: 'water', defaultFinish: 'gloss' } },
  ],
  gsi: [{ id: 'gsi-mr-color', name: 'Mr.COLOR 实色', nameZh: '实色', match: () => true, line: lacquerLine({}) }],
  jy: [
    /*
     * AQUEOUS 系列（JW-A01…JW-A24）：上游 modkit-swatch 把这 24 条标成 lacquer、
     * suitableFor.handPainting=false；另一份本地目录（analysis/PaintCatalog.json，
     * 经 gk-mixer）把这个 code 段命名为「Aqueous 水性」。两份本地数据冲突，
     * 本轮按用户指定的参考数据（modkit-swatch）建模 = 油性硝基，产品线名里不写「水性」，
     * 留待拿到厂方页面后再改 solvent/resin。
     */
    { id: 'jy-aqueous', name: 'AQUEOUS 系列（JW-A）', nameZh: 'A 系列', match: (c) => /^JW-A/i.test(c), line: lacquerLine({ defaultVolumeMl: 18 }) },
    { id: 'jy-meka', name: 'MEKA COLOR 机甲色', nameZh: '机甲色', match: (c) => /^JWMC/i.test(c), line: lacquerLine({ defaultVolumeMl: 18 }) },
    { id: 'jy-neo', name: 'NEO COLOR 基本色', nameZh: '基本色', match: () => true, line: lacquerLine({ defaultVolumeMl: 18 }) },
  ],
};

const FINISH_MAP = {
  gloss: 'gloss',
  flat: 'matte',
  matte: 'matte',
  'semi-gloss': 'semiGloss',
  semiGloss: 'semiGloss',
  metallic: 'metal',
  metal: 'metal',
  clear: 'clear',
  pearl: 'pearl',
  fluorescent: 'fluorescent',
};

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normKey = (value) => String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** modkit -> 本地统一色号：MC51 与既有 JWMC51 是同一支漆 */
function canonCode(brandId, code) {
  const raw = String(code ?? '').trim();
  if (brandId === 'jy' && /^MC\d+$/i.test(raw)) return 'JWMC' + raw.replace(/^MC/i, '');
  return raw;
}

function lineFor(brandId, code) {
  const rules = LINES[brandId];
  if (!rules) throw new Error('缺少产品线定义：' + brandId);
  const hit = rules.find((rule) => rule.match(code));
  if (!hit) throw new Error(brandId + ' 的色号无法归属产品线：' + code);
  return hit;
}

function sortCodes(paints) {
  return paints.slice().sort((a, b) => {
    const ac = a.code ?? '';
    const bc = b.code ?? '';
    return ac.localeCompare(bc, 'en', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name);
  });
}

function paintIdOf(brandId, code) {
  return brandId + '-' + slug(code);
}

/* ------------------------------------------------------------------ */
/* 读取输入                                                            */
/* ------------------------------------------------------------------ */

const modkit = JSON.parse(readFileSync(MODKIT, 'utf8'));
const auxSeed = JSON.parse(readFileSync(AUX_SEED, 'utf8'));
const existing = {
  gsi: JSON.parse(readFileSync(join(OUT_DIR, 'gsi.json'), 'utf8')),
  jy: JSON.parse(readFileSync(join(OUT_DIR, 'jy.json'), 'utf8')),
};

const report = [];
const warnings = [];

/* ------------------------------------------------------------------ */
/* 1) 既有郡士 / 匠域：补号 + 校正推定色                                */
/* ------------------------------------------------------------------ */

const bundles = {};

for (const brandId of ['gsi', 'jy']) {
  const bundle = existing[brandId];
  const byNorm = new Map();
  for (const paint of bundle.paints) {
    if (paint.code) byNorm.set(normKey(paint.code), paint);
  }

  let upgradedHex = 0;
  let added = 0;

  for (const row of modkit) {
    if (MODKIT_BRAND[row.brand] !== brandId) continue;
    const code = canonCode(brandId, row.code);
    const target = byNorm.get(normKey(code));

    if (target) {
      // 只覆盖「按色名推定」的色值；已核验/官方取样的色值保持不变
      if (target.hexEstimated === true && row.hex && target.hex.toLowerCase() !== row.hex.toLowerCase()) {
        target.hex = row.hex;
        if (!String(target.source ?? '').includes('modkit-swatch')) {
          target.source = String(target.source ?? '') + '；色值校正自 modkit-swatch（MIT）';
        }
        upgradedHex += 1;
      }
      continue;
    }

    const rule = lineFor(brandId, code);
    const paint = {
      id: paintIdOf(brandId, code),
      lineId: rule.id,
      brandId,
      code,
      name: row.name,
      hex: row.hex,
      paintClass: row.finish === 'clear' ? 'clear' : 'solid',
      category: 'color',
      finish: FINISH_MAP[row.finish] ?? 'gloss',
      origin: 'seed',
      source: MODKIT_SOURCE,
      sourceUrl: MODKIT_URL,
      hexEstimated: true,
    };
    const sameLine = bundle.lines.find((line) => line.id === rule.id);
    if (!sameLine) {
      bundle.lines.push({ id: rule.id, brandId, name: rule.name, nameZh: rule.nameZh, ...rule.line });
    }
    bundle.paints.push(paint);
    byNorm.set(normKey(code), paint);
    added += 1;
  }

  /*
   * 脚本自建的辅线：名字以本脚本为准（重跑也能同步改名）。
   * 郡士 / 匠域已有的厂线名不动，避免覆盖 2.1.2 的官方口径。
   */
  const aqueous = LINES[brandId].find((rule) => rule.id === 'jy-aqueous');
  const aqueousLine = aqueous ? bundle.lines.find((line) => line.id === aqueous.id) : undefined;
  if (aqueous && aqueousLine) {
    aqueousLine.name = aqueous.name;
    aqueousLine.nameZh = aqueous.nameZh;
  }

  report.push(`${brandId.padEnd(9)} ${String(bundle.paints.length).padStart(4)} 条  （补号 ${added}，校正推定色 ${upgradedHex}）`);
  bundles[brandId] = bundle;
}

/* ------------------------------------------------------------------ */
/* 2) 新品牌整包                                                       */
/* ------------------------------------------------------------------ */

for (const [modkitName, brandId] of Object.entries(MODKIT_BRAND)) {
  if (brandId === 'gsi' || brandId === 'jy') continue;
  const meta = BRANDS[brandId];
  const rows = modkit.filter((row) => row.brand === modkitName);
  const lines = [];
  const paints = [];
  const seen = new Set();

  for (const row of rows) {
    const code = canonCode(brandId, row.code);
    const id = paintIdOf(brandId, code);
    if (seen.has(id)) {
      warnings.push(`重复 id ${id}（${modkitName}），已跳过`);
      continue;
    }
    seen.add(id);
    const rule = lineFor(brandId, code);
    if (!lines.some((line) => line.id === rule.id)) {
      lines.push({ id: rule.id, brandId, name: rule.name, nameZh: rule.nameZh, ...rule.line });
    }
    paints.push({
      id,
      lineId: rule.id,
      brandId,
      code,
      name: row.name,
      hex: row.hex,
      paintClass: row.finish === 'clear' ? 'clear' : 'solid',
      category: 'color',
      finish: FINISH_MAP[row.finish] ?? 'gloss',
      origin: 'seed',
      source: MODKIT_SOURCE,
      sourceUrl: MODKIT_URL,
      hexEstimated: true,
    });
  }

  bundles[brandId] = {
    format: 'pigment-depot/brand/v1',
    brand: { id: brandId, ...meta, aliases: [] },
    version: CATALOG_VERSION,
    verifiedAt: null,
    lines,
    paints,
  };
  report.push(`${brandId.padEnd(9)} ${String(paints.length).padStart(4)} 条  （新增整包）`);
}

/* ------------------------------------------------------------------ */
/* 3) 手补辅料                                                         */
/* ------------------------------------------------------------------ */

let auxAdded = 0;
for (const line of auxSeed.lines ?? []) {
  const bundle = bundles[line.brandId];
  if (!bundle) {
    warnings.push(`辅料产品线 ${line.id} 的 brandId ${line.brandId} 不存在`);
    continue;
  }
  if (!bundle.lines.some((item) => item.id === line.id)) {
    bundle.lines.push({ ...line });
  }
}

for (const paint of auxSeed.paints ?? []) {
  const bundle = bundles[paint.brandId];
  if (!bundle) {
    warnings.push(`辅料 ${paint.id} 的 brandId ${paint.brandId} 不存在`);
    continue;
  }
  if (!bundle.lines.some((line) => line.id === paint.lineId)) {
    warnings.push(`辅料 ${paint.id} 的 lineId ${paint.lineId} 不存在，已跳过`);
    continue;
  }
  if (bundle.paints.some((item) => item.id === paint.id)) continue;
  bundle.paints.push({ ...paint, origin: 'seed' });
  auxAdded += 1;
}

/* ------------------------------------------------------------------ */
/* 4) 收尾：排序、去重、写盘                                           */
/* ------------------------------------------------------------------ */

const index = {
  format: 'pigment-depot/catalog/v1',
  version: CATALOG_VERSION,
  generatedAt: new Date().toISOString(),
  brands: [],
};

let total = 0;
for (const brandId of Object.keys(BRANDS)) {
  const bundle = bundles[brandId];
  if (!bundle) continue;
  bundle.paints = sortCodes(bundle.paints);
  bundle.lines = bundle.lines.slice().sort((a, b) => a.id.localeCompare(b.id));
  bundle.version = CATALOG_VERSION;

  const ids = new Set();
  for (const paint of bundle.paints) {
    if (ids.has(paint.id)) throw new Error(`${brandId}: paint.id 重复 ${paint.id}`);
    ids.add(paint.id);
  }
  const lineIds = new Set(bundle.lines.map((line) => line.id));
  for (const paint of bundle.paints) {
    if (!lineIds.has(paint.lineId)) throw new Error(`${brandId}: ${paint.id} 的 lineId ${paint.lineId} 缺失`);
  }

  const auxCount = bundle.paints.filter((paint) => paint.paintClass === 'aux').length;
  const meta = BRANDS[brandId];
  index.brands.push({
    id: brandId,
    name: meta.name,
    nameZh: meta.nameZh,
    shortName: meta.shortName,
    accentHex: meta.accentHex,
    count: bundle.paints.length,
    auxCount,
    file: `${brandId}.json`,
  });
  total += bundle.paints.length;

  if (!DRY) {
    writeFileSync(join(OUT_DIR, `${brandId}.json`), JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  }
}

if (!DRY) {
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
}

console.log('\n目录构建（2.2.2）');
console.log('─'.repeat(60));
for (const line of report) console.log('  ' + line);
console.log('  辅料补充 ' + auxAdded + ' 条');
console.log('─'.repeat(60));
console.log(`  品牌 ${index.brands.length} / 条目 ${total}`);
console.log(`  索引 → ${DRY ? '(dry-run，未写盘)' : 'public/catalog/index.json'}`);
for (const brand of index.brands) {
  console.log(`    ${brand.id.padEnd(9)} ${String(brand.count).padStart(4)} 条（辅料 ${brand.auxCount}）${brand.nameZh}`);
}
if (warnings.length > 0) {
  console.log('\n⚠ 警告');
  for (const warning of warnings.slice(0, 20)) console.log('  · ' + warning);
  if (warnings.length > 20) console.log(`  … 另有 ${warnings.length - 20} 条`);
}
console.log('');
