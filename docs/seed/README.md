# 漆料种子数据 / Seed Paint Catalog

`paint-catalog.seed.json` —— **637 条**漆料（郡士 / 匠域），由 paintlab 的厂商合并表重建
（另加 `paint-catalog.extra.json` 手补 20 条郡士 CL 系列），供应用初始化目录，并拆成运行时品牌包 `public/catalog/{gsi,jy}.json`。

## 统计

| 品牌 | 产品线 | 条数 | 成分 |
|---|---|---|---|
| 郡士 GSI Creos（`gsi`） | 25 条系列（Mr.COLOR / GX / GGX / SPRAY / WEATHERING / SURFACER / UG / LASCIVUS CL…） | 468 | 色卡 + 辅料 |
| 匠域 Jumpwind（`jy`） | 11 条系列（NEO COLOR / MEKA / CLEAR / GLAZE / EXTRA METAL / CT…） | 169 | 色卡 + 辅料 |
| **合计** | **36** | **637** | |

漆类：实色 546 ｜ 透明 60 ｜ 辅助 31
光泽：光泽 182 · 半光 147 · 消光 60 · 金属 90 · 珍珠 24 · 透明 55 · 辅助 31 · 旧化 23 · 补土 11 · 荧光 8 · 其他 6

## 数据来源与色值纪律

- **型号 / 容量 / 类别 / 系列 / 来源**：paintlab《郡士_匠域_油性漆_合并》(617 行)。
  每条 `source` 记录出处；`verified=true` 表示该行的型号 / 容量有来源页。
- **手补 20 条**（郡士 CL01~09 / CL101~111）来自 GSI Creos 官方产品页与 `color_lineup` 色卡图，
  写在 `paint-catalog.extra.json`，由导入脚本合并；色值是**色卡图取样**，仍带 `hexEstimated`。
  详见 `docs/PAINTLAB-2.1.2-目录补录.md`。
- **色值**（`hex`）：
  1. 按 `(brandId, 色号)` 命中旧目录中已核验过的色值时直接复用（121 条）；
  2. 未命中时按色名推定近似色，并写 `hexEstimated: true`（465 条），界面显示 **≈ 推定色**；
  3. 手补条目按官方色卡图取样（20 条，同样 `hexEstimated`）；
  4. 辅料按项目约定统一 `#ffffff`（色块由 `paintClass='aux'` 渲染成白色 70%）。
- **不谎报**：推定色值不写 `verified` 之外的任何"已核验"标记；详情页注明「色值按色名推定」。
- 重跑导入会从现有 `public/catalog` 复用色值，并**保留 `hexEstimated` 标记**（否则推定色会被洗成已核验色）。

> 后续若有厂商官网色卡，请按设计书 6.7 的 SOP 抽样核验后回填 `hex`、去掉 `hexEstimated`，
> 并更新 `source`。

## 重新生成

```bash
# 1) paintlab CSV → seed（默认再合并 paint-catalog.extra.json；--no-extra 可跳过）
node scripts/import-paintlab.mjs

# 2) 核验（0 错误才算过；警告为语义提示）
node scripts/verify-catalog.mjs --file docs/seed/paint-catalog.seed.json

# 3) 拆成运行时品牌包
node scripts/build-catalog.mjs --file docs/seed/paint-catalog.seed.json --out public/catalog
```

或 `npm run import:catalog && npm run check`。

## 字段

```jsonc
{
  "id": "gsi-c1",                 // brandId + 色号 slug
  "brandId": "gsi",
  "lineId": "gsi-mr-color",       // 由「系列」生成
  "code": "C1",                   // 厂商代号
  "name": "白色",                  // 原名 / 英文名，缺失时回落中文名
  "nameZh": "白色",                // 名称（中文）
  "hex": "#f2f2f2",
  "hexEstimated": true,           // 仅推定色值带此字段
  "paintClass": "solid",          // solid | clear | aux
  "finish": "gloss",
  "category": "color",
  "volumeMl": 10,
  "sourceUrl": "https://…",
  "source": "paintlab 合并表（型号/容量/来源）；色值按色名推定",
  "verified": true,
  "verifiedAt": "2026-11-17"
}
```

## 已知待补

1. 485 条色值为推定 / 色卡取样（`hexEstimated`），未按实物色卡核验。
2. 7 条匠域珍珠色（GC004–GC010）名称缺失（官网不可达），`source` 已标注「名称待补」。
3. 郡士 SF/WC/WP 系列共 34 条存在 `finish=primer/wash` 与 `paintClass=solid` 的语义提示
   （verify 警告，属预期：这些是底漆 / 旧化液，但仍作为漆料显示原色）。
4. 手补机制目前只收了 CL 系列；`CLC`（LASCIVUS Decor 粉末）与 `LDL`（デコラ イナー 粉彩笔）
   不是瓶装漆，未纳入 `Paint` 模型。
