# PAINTLAB 2.2.2 · 改版说明

> 版本：`package.json` → `2.2.2`；`src/platform.ts` 兜底 → `2.2.2`；桌面壳 `desktop/electron/package.json` → `2.2.2`
> 基线：2.2.1（`paintlab/HANDOFF-2.2.1.md`）；本轮为 2026-11-20 用户提出的三项需求：
> ① 参考 `paintlab/modkit-swatch` 补充漆料数据；② 按其涉及的品牌补充各品牌辅料；③ 优化采购页对漆料的显示。
> 生成时间：2026-11-20（Asia/Shanghai）

---

## 0. 一句话

**目录从「2 品牌 637 条」扩到「7 品牌 1030 条」（盖亚 / 郡士 / 匠域 / 田宫 / 喵酱 / 星影 / 青鸟川），补了 4 个品牌的辅料（郡士 29、匠域 13、田宫 4、盖亚 2，后两者待核验）；采购页按「颜色 / 辅料」两个货架重排——底漆与补土并入辅料、辅料行第二行改显示类目、选「全部」时按品牌分段、色值与核验提示从逐行小牌收成工具栏摘要 + 行内 ≈ 记号。**

## 1. 漆料数据扩充（需求 1）

### 1.1 数据来源

- 上游：`paintlab/modkit-swatch/data/paints.json`（MIT，591 条，7 品牌，与上游 git blob 逐字节一致）。
- 上游字段：`brand` / `code` / `name` / `hex` / `finish` / `type` / `suitableFor`；本地只做映射，不改数值。
- 重跑：`node scripts/build-catalog-2.2.2.mjs`（幂等，重复跑结果一致）。

### 1.2 新增 5 个品牌（355 条）

| 品牌 | id | 产品线 | 条数 | 建模口径 |
|---|---|---|---|---|
| 盖亚 Gaianotes | `gaia` | 数字色号（122）/ GE（14）/ GP（9）/ EX 大瓶（6）/ TL 铁道（5）/ 辅料 | 158 | 硝基 lacquer · 油性；EX 18 ml，其余 10 ml |
| 田宫 Tamiya | `tamiya` | XF 水性消光（65）/ X 水性光泽（29）/ LP 硝基（17）/ 辅料 | 115 | X / XF = acrylic + **water**；LP = lacquer + oil |
| 喵酱 Hobby Mio | `hobbymio` | HM 基础色 | 45 | lacquer · oil · 18 ml |
| 星影 Sunin7 | `sunin7` | 数字（27）/ J 系列（5） | 32 | lacquer · oil · 18 ml |
| 青鸟川 QNC | `qnc` | QNC 水性色 | 11 | acrylic + **water** · 18 ml |

### 1.3 郡士 / 匠域：补号 + 校正推定色（不覆盖已核验色值）

| 品牌 | 变更前 | 变更后 | 说明 |
|---|---|---|---|
| 郡士 `gsi` | 468 | **476** | 补 8 条 Mr.COLOR 缺号：C24 / C82 / C83 / C84 / C85 / C102 / C103 / C134 |
| 匠域 `jy` | 169 | **193** | 补 24 条 `JW-A01…JW-A24`（新线 `jy-aqueous`），其余 49 条 `MC51–MC99` 与既有 `JWMC51–JWMC99` 合并为同一支漆，不重复建 |

- **色值覆盖规则**：只有 `hexEstimated === true`（按色名推定的）才换成 modkit 色值，`verifiedAt` 已核验的条目一个都不动。
  - 郡士：仅 C1（白）从 `#f2f2f2` 校正到 `#ffffff`；其余推定色本来就和 modkit 一致。
  - 匠域：82 条推定色按 modkit 校正，`source` 追加「色值校正自 modkit-swatch（MIT）」。
- **同漆合并**：modkit 的 `MC51` 与既有的 `JWMC51` 名称一致（Cool White / 冷白），按 `JWMC` 归一，避免一支漆两条记录。

### 1.4 建模口径的判定：`JW-A` 按水性

`JW-A01…JW-A24` 两份本地数据说法不同：

- `modkit-swatch`（用户指定的参考数据）：`type: lacquer`、`suitableFor.handPainting: false`；
- `analysis/PaintCatalog.json`（经 gk-mixer）：把这个 code 段单独归为 `Aqueous`（水性）。

**2026-11-20 用户确认：按水性建模。** 实现口径：

| 字段 | 值 |
|---|---|
| 产品线 | `jy-aqueous`「AQUEOUS 水性色（JW-A）」/ 中文名「水性色（A 系列）」 |
| `kind` / `resin` / `solvent` | `acrylic` / `acrylic` / **`water`** |
| 容量 | 18 ml |
| 界面描述 | `水性 · 光泽 · 实色`（不再是 `油性 · 光泽 · 实色`） |

- 这段口径写在 `scripts/build-catalog-2.2.2.mjs` 的 `LINES.jy` 里；脚本重跑会把已有 `jy-aqueous` 的 `solvent/resin/kind` 一并同步，**不需要手工改 JSON**。
- `tests/unit/data/catalog.test.ts` 已加断言锁住：`jy-aqueous` 的 `solvent === 'water'`、`resin/kind === 'acrylic'`。

## 2. 辅料补充（需求 2）

### 2.1 现状（辅料货架口径）

| 品牌 | 辅料条数 | 来源 | 核验 |
|---|---|---|---|
| 郡士 `gsi` | 29 | `data/mrh_oil.json`（Mr.HOBBY 官方 2026 版色卡中文转录）+ 2.1.x 既有合并表 | 已核验（`verifiedAt: 2026-11-17`） |
| 匠域 `jy` | 13 | `data/jiangyu_aux.json`（经销商完整变体表 + 官方说明） | 已核验 |
| 田宫 `tamiya` | 4 | X-20A / X-20 / 87077 / 87198 | **待核验**：官网不可达 |
| 盖亚 `gaia` | 2 | T-01 标准稀释剂 / T-02 缓干型稀释剂 | **待核验**：官网不可达 |
| 喵酱 / 星影 / 青鸟川 | 0 | — | 无可用来源 |

- 郡士辅料明细：稀释剂 T101–T104 / T106 / T108 / T115 / T117 / T204 / T217 / WCT101 / WCT102、缓干剂 T105、洗笔液 T113 / T116、脱漆剂 GT33、消光添加剂 C30 / C188 / C189，加 10 条 Mr.SURFACER 水补土（SF283–SF292）。
- 匠域辅料明细：CT01 / CT01P / CT02 / CT02P / CT03 / CT04 / CT04P / CT05 / CT05P / CT06P / CT07P / CT08 + MP01 附着力底液。
- 手补文件：`scripts/data/aux-2.2.2.json`（每条带 `sourceUrl` 与核验说明；待核验的 `verifiedAt` 留空）。

### 2.2 本轮没能做的事（如实记录）

用户要求「到官网或官网平台补充」。本次会话的网络环境只放通了 `mr-hobby.com`（郡士），其余站点全部不可达：

- `www.gaianotes.co.jp`、`www.tamiya.com`、`tamiyausa.com`、`jumpwind.com`、`www.hobbymio.com`、`www.sunin7.com`、`duckduckgo`、`bing`、`wikipedia`、`raw.githubusercontent.com` 均 fetch 失败；
- 宿主机浏览器访问同样超时（`chrome-error://chromewebdata`）；沙箱内的 `Invoke-WebRequest` 直连也被 TLS 层拒绝；
- `web_search` 工具本身返回 provider 端点错误（`api.deepseek.com/v1/tools/search`）。

所以辅料分三档交付：**已核验（郡士 / 匠域）→ 官方线但待核验（田宫 / 盖亚）→ 缺（喵酱 / 星影 / 青鸟川）**，界面上用「待核验」小牌与工具栏摘要如实标注，没有编造型号。补齐方法见 §8。

## 3. 采购页显示优化（需求 3）

### 3.1 辅料归类不再只看 `paintClass === 'aux'`

```ts
// src/features/procure/procureFilters.ts
isAuxPaint(paint) = paint.paintClass === 'aux'
                 || category ∈ { thinner, retarder, primer, surfacer }
```

- 原因：郡士 Mr.SURFACER SF283–SF292、匠域 MP01 在目录里是 `paintClass: 'solid'` + `finish: 'primer'`，2.2.1 之前被埋在**颜色货架**里，一屏水补土挤掉真正的色漆，而辅料货架又看不到底漆。
- 影响：郡士辅料货架从 19 → 29，匠域 12 → 13；颜色货架相应少 11 条底漆 / 补土。
- 连带：`RegisterDialog` 的「不分原浆 / 稀释」判定也改用 `isAuxPaint`，底漆入库不再问稀释比例。

### 3.2 辅料行第二行改显示类目

| 场景 | 2.2.1 | 2.2.2 |
|---|---|---|
| 稀释剂 | `油性 · — · 辅助`（光泽位用 — 占位） | `油性 · 稀释剂` |
| 水补土 | `油性 · — · 辅助` | `油性 · 底漆` |
| 色漆 | `油性 · 光泽 · 实色` | 不变 |

实现：`procureDescription(paint, line)` + `PaintMeta/PaintRow` 新增可选 `descOverride`；core 的 `paintDescription` 与 AC-15 契约（「aux 光泽位用 — 占位」）**保持不变**，`tests/unit/core/label.test.ts` 继续通过。

### 3.3 「全部」品牌按品牌分段

- 选「全部」时列表插入品牌分组头（`data-procure-group`，显示短名 + 中文名 + 该品牌条数），按品牌 `sort` 排列；单品牌仍是平铺列表。
- 7 个品牌共 1030 条，如果按色号字母序打散（`CT01` / `C1` / `HM-001` / `LP-1` / `QNC03`…），用户根本认不出哪条属于谁。

### 3.4 提示降噪：从逐行挂牌到池级摘要

| 提示 | 2.2.1 | 2.2.2 |
|---|---|---|
| `≈ 推定色` | 每行一块 warn 小牌 | 行内一个 `≈` 记号（`data-hex-estimated`，hover 出完整说明）+ 工具栏 `≈ N` |
| `⚠ 待核验` | 每行一块 warn 小牌 | 只在**辅料行**保留（买之前要看规格），颜色行不再挂；工具栏 `未核验 N` |

新增工具栏锚点：`data-procure-shelf`（货架组）、`data-shelf-counts`（`颜色数 / 辅料数`）、`data-procure-estimated`、`data-procure-unverified`。

### 3.5 其他

- 产品线下拉、左栏二级列表、面包屑统一用**中文产品线名**（`lineLabelOf`：`nameZh || name`）。
- 辅料货架空态：品牌没有辅料条目时给「该品牌还没有辅料数据」空状态，而不是「没有匹配的色号」。
- 搜索支持**类目词**：输入「稀释剂」「缓干剂」「底漆」能命中辅料。

### 3.6 顺手修的显示缺陷：分段页签选中时文字被 hover 层盖住

`Segmented` 的标签原来是**裸文本节点**，而 `.ef-btn::before` 是 hover 时扫过的黄色斜切层（`z-index: 0`，`.ef-btn > *` 才抬到 `z-index: 1`）。结果：鼠标停在选中页签上时，黄色盖层压住白字 → 「辅料」页签变成一块黄底无字。

修法：标签与计数都包一层 `relative z-[1]` 的 `<span>`，并给选中态补 `hover:!text-[color:var(--ef-ink)]`（和 `.ef-btn--go:hover` 的既有约定一致）。修完两种状态都可读：静止 = 墨底白字，悬停 = 黄底墨字。

## 4. 数据管线

```bash
node scripts/build-catalog-2.2.2.mjs          # 写 public/catalog/
node scripts/build-catalog-2.2.2.mjs --dry    # 只打印统计
```

```
paintlab/modkit-swatch/data/paints.json   591 条（MIT）
scripts/data/aux-2.2.2.json               手补辅料 6 条（田宫 4 / 盖亚 2）
public/catalog/{gsi,jy}.json              既有 2.1.2 口径（保留 verifiedAt / source）
        ↓
scripts/build-catalog-2.2.2.mjs
        ↓
public/catalog/{gaia,gsi,hobbymio,jy,qnc,sunin7,tamiya}.json + index.json
```

- 脚本内置校验：`paint.id` 唯一、`lineId` 必须存在、色号必须能归到某个产品线，否则直接抛错。
- 旧的 CSV 管线（`npm run import:catalog` + `npm run check`）保留不动，两套口径互不影响。

## 5. 界面锚点（2.2.2 新增）

- 货架分组：`data-procure-shelf`
- 货架计数：`data-shelf-counts`（文案 `颜色 / 辅料`）
- 品牌分组头：`data-procure-group="{brandId}"`
- 近似色值摘要：`data-procure-estimated="{n}"`
- 未核验摘要：`data-procure-unverified="{n}"`
- 行内近似记号：`data-hex-estimated`

保留：`data-page="procure"`、`data-procure-brands`、`data-brand-row`、`data-line-row`、`data-paint-row`、`data-code`、`data-paint-desc`、`data-procure-count`、`data-aux-no-state`、`data-paint-line`。

## 6. 契约与兼容

- `Paint.description` 这条 AC-15 文案**没动**：`paintDescription()` 仍是唯一真相，采购页只是多了一个 `descOverride` 出口。
- 辅料归类的唯一判定是 `isAuxPaint()`；漆料本体 / 库存 / 调漆的 `paintClass` 语义不变，底漆仍是 `solid`（不进调漆台当漆用，也不会被误判成辅料稀释剂）。
- 新品牌 `hexEstimated: true`：modkit 色值是社区色值库，不是厂方色卡，界面继续用 ≈ 标注，不谎称已核验。
- 旧数据零迁移：2.2.2 只动目录 JSON 与采购页，Dexie 版本、库存 / 配方 / 撤销栈字段全部不变。

## 7. 测试与验收

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | **35 文件 / 411 用例通过**（2.2.1 为 34 / 396） |
| `npm run build:desktop` | 成功；CSS 33.23 kB / JS 661.81 kB（gzip 208.53 kB） |
| `node scripts/build-catalog-2.2.2.mjs --dry` | 7 品牌 / 1030 条，重跑「补号 0、校正 0」（幂等） |

新增 / 改写的用例：

- `tests/unit/data/catalog.test.ts`：索引 7 品牌 + `catalogVersion: 2.2.2`；郡士 25 线 476 条；5 个新品牌整包全部过 `normalizeBrandBundle`、每条漆落在本品牌产品线上；盖亚 6 线 158 条、田宫 4 线 115 条（XF 水性 / LP 油性分得开）、匠域 193 条且 `JWMC51` 只有一条；辅料 SKU 带 `volumeMl` + `sourceUrl` + `source`。
- `tests/unit/features/procure-2.2.2.test.tsx`（12 条）：`isAuxPaint` / `paintsOfKind` / `procureDescription` / `summarizePool` 纯函数；水补土进辅料货架且描述为「油性 · 底漆」；底漆入库不问稀释；无辅料品牌的空状态；工具栏摘要只出现一次 + 行内只有 ≈ 记号；类目词搜索；「全部」分段与面包屑；产品线中文名随货架收敛。
- `tests/unit/features/procure-aux.test.tsx`：辅料行第二行期望值从「油性 · — · 辅助」改为「油性 · 稀释剂」。

### 7.1 实机走查（2026-11-20，浏览器版 `npm run dev` @ 5175）

| 走查项 | 结果 |
|---|---|
| 左栏 7 品牌 + 件数（全部 1030 / 郡士 476 / 匠域 193 / 盖亚 158 / 田宫 115 / 喵酱 45 / 星影 32 / 青鸟川 11） | ✅ |
| 郡士辅料货架 29 条，含 10 条水补土；第二行「油性 · 稀释剂」/「油性 · 底漆」 | ✅ |
| 「全部」→ 品牌分组头（`GSI 郡士 … 29 条` 等），辅料口径合计 48 | ✅ |
| 田宫辅料货架 4 条全部带「待核验」小牌，规格 250 ml | ✅ |
| 喵酱辅料货架空状态「该品牌还没有辅料数据」 | ✅ |
| 工具栏摘要 `≈ 872 / 未核验 393`（全部）随品牌收敛（郡士 `≈ 336 / 未核验 8`） | ✅ |
| 分段页签静止墨底白字、悬停黄底墨字（§3.6 的缺陷已修） | ✅ |

截图：`reports/shots/2-2-2-procure-7brands.png`、`2-2-2-procure-aux-gsi.png`、`2-2-2-procure-all-grouped.png`、`2-2-2-procure-aux-tamiya.png`、`2-2-2-procure-aux-empty.png`（`reports/shots/` 在 `.gitignore` 内）。

## 8. 已知缺口与补齐方法

1. **喵酱 / 星影 / 青鸟川没有辅料**：本次会话三家官网不可达，也没有本地可核来源。补齐只需在 `scripts/data/aux-2.2.2.json` 里补 `lines[]` 与 `paints[]`（照抄田宫那几条的结构），再重跑脚本——不需要改任何 TS 代码。
2. **田宫 / 盖亚的辅料型号待核验**（`source` 已写「待核验」、`verifiedAt` 留空）：拿到官网页后补 `sourceUrl` 精确商品页 + `verifiedAt` 即可。
3. **新品牌没有中文漆名**：盖亚沿用上游日文名、田宫 / 喵酱 / 星影 / 青鸟川沿用英文名；中文检索只能命中色号与类目词，要补中文名需逐条对齐（不要机翻）。
4. **modkit 色值只是社区色值库**：872 条仍标 `hexEstimated`，未按实物色卡核验；要做色卡核验得逐条取厂方 swatch。
5. **`JW-A` 按水性建模是用户 2026-11-20 确认的口径**（§1.4）。若厂方页面确认它其实是 lacquer，改 `scripts/build-catalog-2.2.2.mjs` 里 `jy-aqueous` 的 `solvent/resin/kind` 再重跑即可（脚本会同步已有产品线）。
6. 采购页单行仍只显示「品牌 · 产品线」一行来源，没有价格 / 库存深度列——如果后续要按「库存够不够」排序，需要在 `StockBar` 之外再加一列。
