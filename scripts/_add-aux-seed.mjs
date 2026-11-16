// 一次性补数据：把稀释剂/缓干剂等辅料写入 seed（含型号、规格、来源与核验状态），再交给 build-catalog。
import fs from 'node:fs';
const file = 'docs/seed/paint-catalog.seed.json';
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

const EU = 'https://mrhobby-europe.com/products/thinners/mr-color/';
const lines = [
  { id: 'gsi-thinner', brandId: 'gsi', name: 'Mr. Color Thinner / Retarder', nameZh: '郡士 稀释与缓干系列', packaging: 'bottle', defaultVolumeMl: 110, kind: 'auxiliary', resin: 'lacquer', solvent: 'oil', defaultFinish: 'other', thinnerFamily: undefined, defaultRatioN: undefined },
  { id: 'ak-aux', brandId: 'ak', name: 'Real Colors Auxiliaries', nameZh: 'AK 稀释与缓干', packaging: 'bottle', defaultVolumeMl: 200, kind: 'auxiliary', resin: 'lacquer', solvent: 'oil', defaultFinish: 'other' },
  { id: 'tamiya-lacquer-aux', brandId: 'tamiya', name: 'Lacquer Auxiliaries', nameZh: '田宫 硝基辅料', packaging: 'bottle', defaultVolumeMl: 250, kind: 'auxiliary', resin: 'lacquer', solvent: 'oil', defaultFinish: 'other' },
  { id: 'jw-aux', brandId: 'jy', name: 'Jumpwind Auxiliaries', nameZh: '匠域 辅料', packaging: 'bottle', defaultVolumeMl: 100, kind: 'auxiliary', resin: 'lacquer', solvent: 'oil', defaultFinish: 'other' },
];

const V = { verified: false };
const aux = [
  { id: 'gsi-t101', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-101', name: 'Mr. Color Thinner 50', nameZh: '郡士 标准稀释剂 50 ml', volumeMl: 50, category: 'thinner', sourceUrl: EU + 'mr-color-thinner-50/', source: 'Mr. Hobby EU 商品页' },
  { id: 'gsi-t102', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-102', name: 'Mr. Color Thinner 110', nameZh: '郡士 标准稀释剂 110 ml', volumeMl: 110, category: 'thinner', sourceUrl: EU + 'mr-color-thinner-110/', source: 'Mr. Hobby EU 商品页' },
  { id: 'gsi-t103', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-103', name: 'Mr. Color Thinner 250', nameZh: '郡士 标准稀释剂 250 ml', volumeMl: 250, category: 'thinner', sourceUrl: EU + 'mr-color-thinner-250/', source: 'Mr. Hobby EU 商品页' },
  { id: 'gsi-t104', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-104', name: 'Mr. Color Thinner 400', nameZh: '郡士 标准稀释剂 400 ml', volumeMl: 400, category: 'thinner', sourceUrl: EU + 'mr-color-thinner-400/', source: 'Mr. Hobby EU 商品页' },
  { id: 'gsi-t105', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-105', name: 'Mr. Retarder Mild 40', nameZh: '郡士 缓干剂 40 ml', volumeMl: 40, category: 'retarder', sourceUrl: EU, source: 'Mr. Hobby EU 稀释剂类目页' },
  { id: 'gsi-t106', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-106', name: 'Mr. Color Leveling Thinner 110', nameZh: '郡士 缓干型稀释剂 110 ml', volumeMl: 110, category: 'thinner', sourceUrl: EU + 'mr-color-leveling-thinner-110/', source: 'Mr. Hobby EU 商品页' },
  { id: 'gsi-t108', brandId: 'gsi', lineId: 'gsi-thinner', code: 'T-108', name: 'Mr. Color Leveling Thinner 400', nameZh: '郡士 缓干型稀释剂 400 ml', volumeMl: 400, category: 'thinner', sourceUrl: EU + 'mr-color-leveling-thinner-400/', source: 'Mr. Hobby EU 商品页' },
  { id: 'ak-rc701', brandId: 'ak', lineId: 'ak-aux', code: 'RC701', name: 'Real Colors Thinner 200', nameZh: 'AK Real Colors 稀释剂 200 ml', volumeMl: 200, category: 'thinner', sourceUrl: 'https://www.ozone.bg/product/universalen-razreditel-ak-interactive-za-seriia-boi-real-colors-podhodiashch-i-za-drugi-akrilni-boi-200ml-rc701/', source: '零售页观察（待官方页复核）' },
  { id: 'tamiya-87077', brandId: 'tamiya', lineId: 'tamiya-lacquer-aux', code: '87077', name: 'Lacquer Thinner 250', nameZh: '田宫 硝基稀释剂 250 ml', volumeMl: 250, category: 'thinner', sourceUrl: 'https://www.tamiya.com/english/products/87077/index.htm', source: '待核验：型号与规格来自常见零售目录，本次会话未取到官方页' },
  { id: 'tamiya-87198', brandId: 'tamiya', lineId: 'tamiya-lacquer-aux', code: '87198', name: 'Lacquer Thinner (Retarder Type) 250', nameZh: '田宫 缓干型稀释剂 250 ml', volumeMl: 250, category: 'thinner', sourceUrl: 'https://www.tamiya.com/english/products/87198/index.htm', source: '待核验：同上' },
  { id: 'jw-ct01', brandId: 'jy', lineId: 'jw-aux', code: 'CT01', name: 'Levelling Thinner', nameZh: '匠域 CT01 缓干型稀释剂 100 ml', volumeMl: 100, category: 'thinner', sourceUrl: 'https://www.txrevo.com/collections/jumpwind-paint', source: '待核验：规格来自零售页标题，型号 CT01 已见，容量待复核' },
];

for (const line of lines) {
  if (!doc.lines.some((l) => l.id === line.id)) {
    const clean = {};
    for (const [k, v] of Object.entries(line)) if (v !== undefined) clean[k] = v;
    doc.lines.push(clean);
  }
}
for (const item of aux) {
  if (doc.paints.some((p) => p.id === item.id)) continue;
  doc.paints.push({
    id: item.id,
    brandId: item.brandId,
    lineId: item.lineId,
    code: item.code,
    name: item.name,
    nameZh: item.nameZh,
    hex: '#ffffff',
    paintClass: 'aux',
    finish: 'additive',
    category: item.category,
    volumeMl: item.volumeMl,
    sourceUrl: item.sourceUrl,
    source: item.source,
    ...V,
  });
}

const byBrand = {};
const byFinish = {};
const byClass = {};
let nameZhFilled = 0;
for (const p of doc.paints) {
  byBrand[p.brandId] = (byBrand[p.brandId] ?? 0) + 1;
  const finish = p.finish ?? 'gloss';
  byFinish[finish] = (byFinish[finish] ?? 0) + 1;
  const cls = p.paintClass ?? 'solid';
  byClass[cls] = (byClass[cls] ?? 0) + 1;
  if (p.nameZh) nameZhFilled += 1;
}
doc.stats = { total: doc.paints.length, byBrand, byFinish, byClass, nameZhFilled };
doc.generatedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
console.log('lines=' + doc.lines.length + ' paints=' + doc.paints.length + ' aux=' + doc.paints.filter((p) => p.paintClass === 'aux').length);
