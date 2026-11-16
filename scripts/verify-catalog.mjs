#!/usr/bin/env node
/**
 * verify-catalog.mjs —— 漆料目录核验脚本（零依赖）
 *
 * 用法：
 *   node scripts/verify-catalog.mjs --file ../docs/seed/paint-catalog.seed.json
 *   node scripts/verify-catalog.mjs --file <seed.json> --out <todo.csv>
 *
 * 检查项（对应设计书 6.3 / 6.7）：
 *   1) 文件格式与必填字段
 *   2) hex 合法性（#RRGGBB）
 *   3) paintClass / finish 枚举
 *   4) paintClass 与 finish 一致性（clear 必须 clear）
 *   5) 跨线同号检测（同品牌同 code 出现在不同 lineId → 警告）
 *   6) 重复 id 检测
 *   7) nameZh 缺失统计 + verified 统计
 *
 * 退出码：0 = 通过（允许警告）；1 = 存在错误
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PAINT_CLASS = new Set(['solid', 'clear', 'aux']);
const FINISH = new Set([
  'gloss', 'semiGloss', 'matte', 'metal', 'pearl',
  'clear', 'fluorescent', 'primer', 'additive', 'wash', 'ink', 'other',
]);
const SOLVENT = new Set(['oil', 'water', 'na']);
const HEX_RE = /^#[0-9a-f]{6}$/;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const file = arg('file');
if (!file) {
  console.error('用法: node scripts/verify-catalog.mjs --file <seed.json> [--out todo.csv]');
  process.exit(1);
}

const abs = resolve(file);
let doc;
try {
  doc = JSON.parse(readFileSync(abs, 'utf8'));
} catch (err) {
  console.error(`✗ 无法解析 JSON: ${abs}\n  ${err.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// 1) 顶层格式
if (doc.format !== 'pigment-depot/seed/v1') err(`format 应为 pigment-depot/seed/v1，实际 ${doc.format}`);
if (!Array.isArray(doc.paints) || doc.paints.length === 0) err('paints 为空');
if (!Array.isArray(doc.brands)) err('brands 缺失');
if (!Array.isArray(doc.lines)) err('lines 缺失');

const brandIds = new Set((doc.brands ?? []).map((b) => b.id));
const lineById = new Map((doc.lines ?? []).map((l) => [l.id, l]));

// line 级校验
for (const l of doc.lines ?? []) {
  if (!brandIds.has(l.brandId)) err(`line ${l.id}: brandId ${l.brandId} 不存在`);
  if (!SOLVENT.has(l.solvent)) err(`line ${l.id}: solvent 非法 "${l.solvent}"`);
  if (!(l.defaultVolumeMl > 0)) err(`line ${l.id}: defaultVolumeMl 必须 > 0`);
  if (l.resin && !['lacquer', 'acrylic', 'enamel'].includes(l.resin)) {
    warn(`line ${l.id}: resin "${l.resin}" 不在枚举内，按 solvent 推断`);
  }
}

// paint 级校验
const seenId = new Set();
const codeIndex = new Map(); // `${brandId}::${code}` -> [lineId]
const missingZh = [];
const unverified = [];

for (const p of doc.paints ?? []) {
  const tag = `${p.brandId}/${p.code ?? '?'}`;
  if (!p.id) err(`${tag}: 缺 id`);
  if (seenId.has(p.id)) err(`${tag}: id 重复 ${p.id}`);
  seenId.add(p.id);

  if (!brandIds.has(p.brandId)) err(`${tag}: brandId 不存在`);
  const line = lineById.get(p.lineId);
  if (!line) err(`${tag}: lineId "${p.lineId}" 不存在`);

  for (const f of ['code', 'name', 'hex', 'paintClass', 'finish']) {
    if (!p[f]) err(`${tag}: 缺必填字段 ${f}`);
  }
  if (p.hex && !HEX_RE.test(p.hex)) err(`${tag}: hex 非法 "${p.hex}"`);
  if (p.paintClass && !PAINT_CLASS.has(p.paintClass)) err(`${tag}: paintClass 非法 "${p.paintClass}"`);
  if (p.finish && !FINISH.has(p.finish)) err(`${tag}: finish 非法 "${p.finish}"`);

  // 4) 一致性
  if (p.finish === 'clear' && p.paintClass !== 'clear') {
    warn(`${tag}: finish=clear 但 paintClass=${p.paintClass}，界面会按实色渲染`);
  }
  if (p.paintClass === 'aux' && p.finish !== 'other' && !['primer', 'additive'].includes(p.finish)) {
    warn(`${tag}: paintClass=aux 但 finish=${p.finish}`);
  }
  if (p.paintClass !== 'aux' && ['primer', 'additive', 'ink', 'wash'].includes(p.finish)) {
    warn(`${tag}: finish=${p.finish} 属辅助类，建议 paintClass='aux'`);
  }

  // 5) 跨线同号
  const key = `${p.brandId}::${p.code}`;
  const arr = codeIndex.get(key) ?? [];
  arr.push(p.lineId);
  codeIndex.set(key, arr);

  if (!p.nameZh) missingZh.push(p);
  if (p.verified !== true) unverified.push(p);
}

for (const [key, lines] of codeIndex) {
  const uniq = [...new Set(lines)];
  if (uniq.length > 1) warn(`跨线同号 ${key} 出现在 ${uniq.join(' / ')}（必须以 lineId 为键）`);
}

// 统计
const byBrand = {};
const byFinish = {};
for (const p of doc.paints ?? []) {
  byBrand[p.brandId] = (byBrand[p.brandId] ?? 0) + 1;
  byFinish[p.finish] = (byFinish[p.finish] ?? 0) + 1;
}

const bar = '─'.repeat(52);
console.log(`\n${bar}\n  PIGMENT-DEPOT 目录核验  ${file}\n${bar}`);
console.log(`  条目       ${doc.paints?.length ?? 0}`);
console.log(`  品牌       ${Object.entries(byBrand).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log(`  光泽分布   ${Object.entries(byFinish).map(([k, v]) => `${k}:${v}`).join('  ')}`);
console.log(`  中文名     ${missingZh.length} 条缺失`);
console.log(`  未核验     ${unverified.length} 条（verified=false）`);
console.log(`  错误       ${errors.length}`);
console.log(`  警告       ${warnings.length}`);
console.log(bar);

const show = (arr, label) => {
  if (!arr.length) return;
  console.log(`\n${label}`);
  arr.slice(0, 40).forEach((m) => console.log(`  · ${m}`));
  if (arr.length > 40) console.log(`  … 另有 ${arr.length - 40} 条`);
};
show(errors, '✗ 错误');
show(warnings, '⚠ 警告');

// 待办 CSV
const outPath = arg('out');
if (outPath) {
  const rows = [['type', 'paint_id', 'brand', 'code', 'name', 'issue']];
  for (const p of missingZh) rows.push(['nameZh', p.id, p.brandId, p.code, p.name, '缺少中文名']);
  for (const p of unverified) rows.push(['verify', p.id, p.brandId, p.code, p.name, '色值未核验']);
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const absOut = resolve(outPath);
  mkdirSync(dirname(absOut), { recursive: true });
  writeFileSync(absOut, csv, 'utf8');
  console.log(`\n→ 待办已写入 ${outPath}（${rows.length - 1} 行）`);
}

console.log(errors.length ? '\n结果：未通过\n' : '\n结果：通过\n');
process.exit(errors.length ? 1 : 0);
