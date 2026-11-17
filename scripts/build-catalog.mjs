#!/usr/bin/env node
/**
 * build-catalog.mjs —— 把 seed 文件拆成运行时使用的品牌包（零依赖）
 *
 * 用法：
 *   node scripts/build-catalog.mjs --file ../docs/seed/paint-catalog.seed.json --out ../public/catalog
 *
 * 产出（对应设计书 6.2）：
 *   public/catalog/index.json         品牌索引
 *   public/catalog/{brandId}.json     品牌包（brand + lines + paints）
 *
 * 规则：
 *   - line 上的 solvent / defaultFinish / thinnerFamily 一并带出
 *   - paint.finish 缺省时取所属 line 的 defaultFinish
 *   - paintClass 缺省时：finish=clear → clear，line.kind=auxiliary → aux，否则 solid
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const file = arg('file');
const outDir = arg('out', 'public/catalog');
if (!file) {
  console.error('用法: node scripts/build-catalog.mjs --file <seed.json> [--out <dir>]');
  process.exit(1);
}

const doc = JSON.parse(readFileSync(resolve(file), 'utf8'));
const outAbs = resolve(outDir);
mkdirSync(outAbs, { recursive: true });

const lineById = new Map(doc.lines.map((l) => [l.id, l]));
const brandById = new Map(doc.brands.map((b) => [b.id, b]));

const buckets = new Map();
for (const p of doc.paints) {
  const line = lineById.get(p.lineId);
  const paintClass =
    p.paintClass ?? (p.finish === 'clear' ? 'clear' : line?.kind === 'auxiliary' ? 'aux' : 'solid');
  const out = {
    id: p.id,
    lineId: p.lineId,
    brandId: p.brandId,
    code: p.code ?? '',
    name: p.name,
    nameZh: p.nameZh ?? null,
    hex: p.hex,
    paintClass,
    finish: p.finish ?? line?.defaultFinish ?? 'gloss',
    category: p.category ?? 'color',
    volumeMl: p.volumeMl ?? line?.defaultVolumeMl ?? 10,
    sourceUrl: p.sourceUrl ?? null,
    verifiedAt: p.verified ? (p.verifiedAt ?? null) : null,
    source: p.source ?? null,
    origin: 'seed',
  };
  if (p.hexEstimated === true) out.hexEstimated = true;
  if (!buckets.has(p.brandId)) buckets.set(p.brandId, []);
  buckets.get(p.brandId).push(out);
}

const index = { format: 'pigment-depot/catalog/v1', generatedAt: new Date().toISOString(), brands: [] };
const report = [];

for (const [brandId, paints] of [...buckets.entries()].sort()) {
  const brand = brandById.get(brandId) ?? { id: brandId, name: brandId };
  const lines = doc.lines.filter((l) => l.brandId === brandId);
  const pkg = {
    format: 'pigment-depot/brand/v1',
    brand,
    version: doc.format.includes('seed') ? 'seed-1' : '1',
    verifiedAt: null,
    lines: lines.map((l) => ({
      id: l.id,
      brandId: l.brandId,
      name: l.name,
      nameZh: l.nameZh ?? null,
      packaging: l.packaging ?? 'bottle',
      defaultVolumeMl: l.defaultVolumeMl ?? 10,
      kind: l.kind ?? 'lacquer',
      resin: l.resin ?? 'lacquer',
      solvent: l.solvent ?? 'oil',
      defaultFinish: l.defaultFinish ?? 'gloss',
      thinnerFamily: l.thinnerFamily ?? null,
      defaultRatioN: l.defaultRatioN ?? 2,
    })),
    paints: paints.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
  const name = `${brandId}.json`;
  writeFileSync(join(outAbs, name), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  index.brands.push({
    id: brandId,
    name: brand.name,
    nameZh: brand.nameZh ?? null,
    shortName: brand.shortName ?? null,
    accentHex: brand.accentHex ?? null,
    count: paints.length,
    file: name,
  });
  report.push(`${name.padEnd(16)} ${String(paints.length).padStart(4)} 条  ${brand.nameZh ?? brand.name}`);
}

writeFileSync(join(outAbs, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log('\n品牌包构建完成');
console.log('─'.repeat(52));
report.forEach((r) => console.log('  ' + r));
console.log('─'.repeat(52));
console.log(`  合计 ${doc.paints.length} 条 → ${outDir}/`);
console.log(`  索引 ${outDir}/index.json\n`);
