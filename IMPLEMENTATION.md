# PAINTLAB 2.2.1 · 实现说明

> 2.1 变更清单见 `docs/PAINTLAB-2.1-改版说明.md`；2.1.1 见 `docs/PAINTLAB-2.1.1-改版说明.md`；2.1.2 目录补录见 `docs/PAINTLAB-2.1.2-目录补录.md`；2.2.0 见 `docs/PAINTLAB-2.2-改版说明.md`；2.2.1 见 `docs/PAINTLAB-2.2.1-改版说明.md`；视觉与交互规格见 `docs/PAINTLAB-2.0-桌面化与视觉重做规格.md`。
> 本文件偏目录、分层、脚本与验收命令。
>
> **版本号规则：未经用户明确指示，不得修改版本号**（`package.json` 的 `version` 与 `src/platform.ts` 的兜底值）；改版本前必须先得到用户明确许可。

Vite 5 + React 18 + TypeScript 5.6(strict) + Tailwind 3.4 + Zustand 4 + Dexie 4 + Zod 3，
桌面壳 Electron（`desktop/electron`，固定 origin `app://paintlab`）。

## 快速开始

```bash
npm install --ignore-scripts
npm run dev            # http://localhost:5175（浏览器）
npm run build          # PWA 构建
npm run build:desktop  # 桌面构建（关闭 Service Worker）
npm run desktop        # 构建 + 安装到 %LOCALAPPDATA%\Programs\PAINTLAB + 快捷方式
npm run typecheck      # tsc --noEmit，期望 0 错
npm test               # vitest run，34 文件 / 392 用例（2.2.1 实测）
npm run check          # 目录核验 + 重建 public/catalog
npm run launcher       # 浏览器版单文件启动器（固定端口 8787）
```

## 分层（方向不可逆）

```
features → store → data → core
```

| 层 | 目录 | 2.2.x 变化 |
|---|---|---|
| core | `src/core/**` | 新增 `rules/low-volume.ts`（20% / 10 ml 判定、红牌文案、通知结构）与 `rules/formula.ts`（配方签名 / 合并 / 说明）；`StockItem.mixKey/mixLabel`、`BatchPart.sourceKey/sourceLabel`、`MixRecord.stockItemId`（`bottleId` 转可选） |
| data | `src/data/**` | 新增 `repos/mix.ts`：`diluteAndStockIn` / `blendAndStockIn`（一事务一 Command：扣组分 + 零量删除 + 同配方合并 + 自动入库）、`migrateLegacyBottles`（升级搬家，不写 Command）；`adjustStockVolume` / `recordUsageAndStockIn` 支持 0 ml 删除与 lowVolume 回传；2.2.1 新增 `renameStockItem`（调漆产物改名可撤销） |
| store | `src/store/**` | `ui.lowVolumeAlert` + `showLowVolumeAlert/dismissLowVolumeAlert`；`diluteBatch/blendBatch` 改用新 repo 并弹提示；`migrateLegacyBottles` 进 `hydrateApp` |
| features | `src/features/**` | 调漆台重做：`MixPage` + `DilutePanel` + `BlendPanel`（两种算法 + 2.2.1 产物名称输入）+ `RecipePreview`（紧凑配方条）+ `StockPicker`（调漆产物 / 容量偏低标记）；仓库详情 2.2.1 增加「改名」；删除 `BottleStage.tsx` / `ColorEditor.tsx`（批次动作与批次改色下线） |
| components | `src/components/**` | 新增 `paint/LowVolumeTag.tsx`；`PaintMeta/PaintRow/PaintTile` 名称栏最前面挂「容量偏低」 |
| app | `src/app/**` | 新增全局 `LowVolumeDialog`（Shell 挂载），显示需求原文 + 受影响条目 |
| desktop | `desktop/electron/**` | 无结构变化；`package.json` 版本随根版本（2.2.1） |

## 桌面化要点

- origin 固定 `app://paintlab`（protocol standard + secure），IndexedDB 作用域稳定；数据在 `%APPDATA%\PAINTLAB`。
- 窗口 1280×800、最小 1120×720；`titleBarStyle: hidden` + `titleBarOverlay` 深色 40px，命令栏即标题栏拖拽区。
- preload 只暴露 `window.platform.saveFile/openFile/info`，渲染层不接触 Node。
- 导出走原生保存框；导入在桌面端额外提供「从文件选择…」按钮，浏览器端保留 `<input type=file>`。
- 桌面构建 `vite build --mode desktop` 关闭 PWA（WebView 里 SW 会造成更新不可见）。
- 安装脚本 `scripts/make-desktop.mjs`：优先使用 `desktop/electron-runtime`，缺失时从 `%LOCALAPPDATA%\electron\Cache` 解压 Electron win32-x64 包，复制到安装目录并建快捷方式。

## 调漆台数据流（2.2，当前）

```
稀释提交（调漆台 · 稀释）
  → 校验来源 / 稀释剂 / 比例；算 neat + thinner + total
  → 组分快照 parts：原浆（+稀释剂 aux，身份已知时）
  → mixKey = formulaKeyOfParts(parts)
  → 找库中同配方条目（排除本次被取用的条目）
       命中 → volumeMl / initialMl / parts.ml 累加（同配方合并）
       未命中 → 新建 StockItem（origin='mixed'，名称 = 原浆名 / 调漆N，色值 = 原浆色 / 加权混色）
  → 扣减来源与稀释剂：next > 0 改余量；next ≤ 0 删除条目 + 清工作台引用
  → 一个事务 + 一个 Command（forward/inverse 成对，撤销恢复合并前的容量与被删条目）
  → 返回 { item, merged, addedMl, mixRecord, lowVolume }

调漆提交（调漆台 · 调漆）
  → 两种算法都落成 parts[{ stockItemId, paint, ml }]：
      ratio  ：weight = 配比，targetMl = V，planBlend 分摊
      amount ：weight = 各组分 ml，targetMl = null
  → 每个组分按自身 state/ratioN 折算 neat / thinner，等效比例 = Σthinner / Σneat
  → 调漆产物作为组分时，快照写 sourceKey（来源配方签名），避免不同混合漆误合并
  → 新建条目才占 settings.mixSeq（同配方合并不发新号）
```

- 展示：稀释漆料用 `dilutionRatioN` + 原浆名称/色值；调漆产物用 `customName` + 加权混色。展示解析仍在 `core/render/batch.ts`。
- 平台流转：稀释漆料 / 调漆产物（`state==='thinned'`）可在仓库 / 调漆台 / 工作台三边流转；原浆 `state==='neat'` 被 `openCoat` 拒绝。
- 工作台侧栏读模型：`buildStockLane()` 只列非原浆、非辅料、有余量的条目。
- **升级迁移**：`migrateLegacyBottles()` 在 `hydrateApp` 里、读库存之前执行：2.1.x 遗留 bottle 有余量的转成 StockItem（同配方合并、工作台 bottle 引用改成 stock 引用），bottle 删除；随后 `purgeEmptyStockItems()` 清掉历史遗留的 0 ml 条目（连带工作台引用）。两者都**不写 Command**（版本搬家，不进撤销栈）。

### 2.2 容量偏低与归零

```
任何扣减（稀释 / 调漆 / 工作台用量 / 盘点）后：
  next = r1(volumeMl - used)
  next <= 0 → 删除 StockItem + 其所有 workbenchItems（可撤销）
  next > 0 且 (next < initialMl × 0.2 || next < 10)
            → data 层返回 lowVolume[{ itemId, volumeMl, initialMl }]
            → store.showLowVolumeAlert() → Shell 的 LowVolumeDialog 弹窗（需求原文）
            → 仓库行 / 详情 / 工作台磁贴 / 调漆台取料行：名称栏最前面红底白字「容量偏低」
```

- 判定唯一处：`core/rules/low-volume.ts`（`isLowVolume` / `LOW_VOLUME_MESSAGE` / `LowVolumeNotice`）。
- 红牌样式：`.ef-low-volume-tag` + `--ef-low-volume-bg/fg`；这是「红色只给删除」的唯一例外（用户 2026-11-19 明确要求红底白字）。
- 同配方合并时 `initialMl` 与 `volumeMl` 一起累加，所以 20% 始终相对这瓶的累计容量。

### 2.2.1 调漆产物命名（用户自定义）

```
调漆确认
  → 面板「产物名称（可选）」：trim 后 1–16 字
  → 填了名称：customName = 用户名称；不消耗 settings.mixSeq
  → 留空：customName = 「调漆N」（N = mixSeq + 1，同 2.1 规则）
  → 同配方合并时填了名称：合并进同一瓶，并把 customName 改成用户名称（inverse 恢复旧名）

仓库详情「改名」
  → renameStockItem(itemId, name)：只允许已有 customName 的调漆产物
  → patch customName + ledger(adjust, action=stock-rename)，一个 Command，可撤销
```

- 名称只影响展示；组分快照、比例、余量、`mixKey` 不变。
- 2.0 手动改过的名称（如「夜航蓝」）继续原样显示；未定义的自动名「调漆N」也可通过「改名」改成色号。
- 详情抽屉同时显示 `mixLabel`（例如「中灰 20.0 ml + 钴蓝 10.0 ml」），避免不同配方的同名产物无法区分。

### 附：2.1 批次流程（仅旧数据 / 迁移参考）

- `repos/bottle.ts` 的 `diluteIntoBatch` / `blendIntoBatch` / `stockInBottle` 保留，供旧数据迁移与历史测试使用；2.2 调漆台不再调用。
- 旧批次：稀释名称 = 原浆名、不占 `mixSeq`；调漆名称 = `调漆N`、`colorHex:'#FFFFFF'` + `colorAlpha:70` 为「未定色」。
- 旧入库：`stockInBottle` 把 `bottle.parts` 复制到 `StockItem.parts`；旧条目没有 `mixKey`，2.2 合并时按 `parts` 现算签名。


### 2.1.1 删除分解

```
删除条目（仓库详情）
  → decompositionOf(item)   （core/rules/decompose.ts）
      · 无 parts / 余量 0 → null：弹层只给「确认删除」
      · 有 parts → 按 item.volumeMl / Σparts.ml 等比还原，最后一段兜误差
  → decomposeStockItem()    （data/repos/stock.ts）
      · 一个事务 + 一个 Command：删原条目（连带 workbenchItems）→ 按组分新建库存条目 → ledger(adjust, action=decompose)
      · 组分为稀释漆料时写 dilutionRatioN（显示 (1:N)稀释）
      · inverse 完整：撤销后原条目 + 工作台引用回来，分解产物删除
```

- 组分快照来源：`diluteIntoBatch` = 原浆 + 稀释剂（`aux`）；`blendIntoBatch` = 调漆前各组分（带各自 `state/ratioN/dilute`）。
- 辅料采购：`RegisterDialog` 里 `paints.every(paintClass==='aux')` 时隐藏「原浆/稀释」，提交强制 `state:'neat'`。

### 2.1.2 目录管线：CSV + 手补

```
paintlab/郡士_匠域_油性漆_合并.csv        （617 行，CSV 管线）
        +
docs/seed/paint-catalog.extra.json        （手补：郡士 CL01~09 / CL101~111，20 条，自带官方色卡取样色值）
        ↓ node scripts/import-paintlab.mjs
docs/seed/paint-catalog.seed.json         （637 条 / 36 产品线；--no-extra 可跳过手补）
        ↓ npm run check（verify-catalog + build-catalog）
public/catalog/{gsi,jy}.json              （gsi 468 / jy 169）
```

- 手补条目会被校验 `brandId/lineId` 存在、id 去重；色值原样保留（不再按色名推定）。
- 重跑导入复用 `public/catalog` 的色值时**保留 `hexEstimated`**，避免把推定色洗成已核验色。
- 官方来源与 20 条清单见 `docs/PAINTLAB-2.1.2-目录补录.md`；`CLC / LDL` 为粉末类，未纳入。

## 视觉 token（唯一真相）

`src/styles/tokens.css` 是唯一真相；`base.css` 定义部件（`.ef-btn` / `.ef-input` / `.ef-cmd` / `.ef-dilution-tag` / `.ef-low-volume-tag` / `.ef-status__message` / `.ef-flag` / `.ef-board`）。
Tailwind 颜色键保留旧名但值全部指向 `--ef-*`；组件不再硬编码色值。

浅色：纸 `#F4F4F2` / 板 `#FFF` / 墨 `#161616` / 强调色 `#FFFA00`（只做填充） / 稀释小牌灰底 `#5C5C5C` / 容量偏低红底 `#B3261E` + 白字；
深色：纸 `#191919` / 板 `#222` / 墨 `#EDEDED` / trace 用黄 / 稀释小牌灰底 `#3F3F3F` / 容量偏低沿用红底白字。
切角只在可点元素上；红色只给删除与「容量偏低」状态牌（2.2 需求例外）；无圆角、投影、发光、装饰渐变；右下角不再有浮动提示。

## 测试

```
npx tsc --noEmit        → 0 error
npx vitest run          → 34 文件 / 392 用例通过
npx vite build          → ✓（PWA）
npx vite build --mode desktop → ✓（无 sw.js）
```

2.2.0 / 2.2.1 新增/改写用例：

- `tests/unit/core/formula.test.ts`（9 条）：配方签名比例归一、顺序无关、不同比例 / `sourceKey` 区分、组分 ml 合并、旧数据签名退化、说明截断。
- `tests/unit/core/low-volume.test.ts`（5 条）：20% / 10 ml 边界、0 ml 不算偏低、提示去重、文案原文。
- `tests/unit/data/mix-stockin.test.ts`（10 条）：稀释自动入库 + 同配方合并、不同比例不合并、偏低 / 归零删除与撤销、调漆合并、调漆产物作组分、2.2.1 自定义名称 / 合并改名 / 改名校验、盘点归零、工作台归零、旧 bottle 迁移与工作台引用迁移。
- `tests/unit/features/mix.test.tsx`（14 条）：自动入库、二次稀释合并、两种调漆算法、2.2.1 产物名称输入、调漆产物作组分、库存不足阻断、稀释剂缺失、偏低红牌 + `lowVolumeAlert`、归零删除、无使用 / 清空 / 入库键。
- `tests/unit/features/low-volume.test.tsx`（2 条）：全局弹窗展示需求原文 + 条目，点「知道了」关闭。
- `tests/unit/features/dilution-flow.test.tsx`：仍是三边流转，最后一个用例改成 2.2 自动入库断言。
- `tests/unit/features/depot-decompose.test.tsx`：2.1.1 分解两条 + **2.2.1 调漆产物改名并撤销**。
- 保留并通过：`core/batch`、`core/decompose`、`data/decompose`、`data/bottle-color` 等旧用例（旧 `repos/bottle.ts` 流程仍被直接测试）。

## 已知缺口（声明项）

1. 485 条色值按色名推定 / 官方色卡图取样（`hexEstimated`），未按实物色卡核验；7 条珍珠色名称待补。
2. `CLC`（LASCIVUS Decor 粉末）与 `LDL`（粉彩笔）不是瓶装漆，未纳入 `Paint` 模型。
3. 自动快照未实现（桌面版也是手动导出留档）；设置页如实标注。
4. Playwright E2E 未接入；桌面实机走查覆盖：启动/五页导航/稀释批次/调漆批次改名改色/删除分解/撤销/导入导出/窗口记忆。
5. 单 chunk 654 KB（gzip 206 KB），未拆包。
6. 桌面壳依赖本机 Electron 运行时缓存；未做签名与自动更新。
