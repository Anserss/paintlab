# PAINTLAB 1.1 · 实现说明（Application Implementation）

> 交班总结与工程描述见 `docs/PAINTLAB-1.0-交班总结与工程描述.md`；
> 本轮改版（术语统一 / 数据换代 / 调漆台双模式）见 `docs/PAINTLAB-1.1-改版说明.md`。
> 本文件偏目录、脚本与分层的速查。

Vite 5 + React 18 + TypeScript 5.6(strict) + Tailwind 3.4 + Zustand 4 + Dexie 4 + Zod 3。
设计依据仍是 `docs/漆料管理软件-项目设计描述书.md`（3.4 节已按本轮改版加注）。

## 快速开始

```bash
npm install --ignore-scripts   # 本机沙箱下 esbuild 的 postinstall 会被拦，平台包已随 optionalDependencies 安装
npm run dev                    # http://localhost:5175
npm run typecheck              # tsc --noEmit，期望 0 错
npm test                       # vitest run，24 文件 / 323 用例
npm run build                  # tsc --noEmit && vite build（PWA 壳）
npm run import:catalog         # paintlab CSV → docs/seed/paint-catalog.seed.json
npm run check                  # verify:catalog + build:catalog
npm run launcher               # 重新产出 release/PAINTLAB.exe
```

## 分层（spec 5.2 铁律）

```
features → store → data → core        方向不可逆
```

| 层 | 目录 | 约束 |
|---|---|---|
| core | `src/core/**` | 纯 TS，零 React / 零 Dexie；类型、Zod、稀释（dilution）与调漆分摊（blend）算法、三档色块、I1–I8 不变量、分组三级规则、撤销栈 |
| data | `src/data/**` | Dexie 表（v2）+ 仓储 + 目录包加载/归一化；所有写入走「补丁事务」并产出 Command |
| store | `src/store/**` | Zustand 切片（ui/settings/catalog/inventory/mix/workbench/history）；读模型 + 回执 |
| features | `src/features/**` | 五个页面（procure / depot / mix / workbench / settings），只消费 store 与展示组件 |
| components | `src/components/**` | UI 原语 + 色卡原子（PaintRow/PaintTile/PaintSwatch/PaintMeta/StockBar）+ 瓶身 SVG |
| app | `src/app/**` | Shell / TopBar / SideNav / 路由（`/procure` `/depot` `/mix` `/workbench` `/settings`） |

## 术语（v1.1 全站统一）

| 动线 | 统一叫法 | 代码 |
|---|---|---|
| 进入仓库 | **入库** | `createStockItem` / `stockInBottle` / `recordUsageAndStockIn`（工作台放回） |
| 进入调漆台 | **调漆** | 仓库行 `sendToMix` → 路由带 `stockItemId`，调漆台自动选中 |
| 进入工作台 | **开涂** | `openCoat`（store / repo / 按钮 `data-action="coat"`） |
| 调漆台产出 | **稀释 / 调漆** | `diluteIntoBatch` / `blendIntoBatch` |

实体：原「工位」→ **工作台**（`Workbench` / `workbenches` / `workbenchItems` 表）。

## 调漆台（v1.1 重做）

```
稀释：原浆 A + 稀释剂 A×N            → 已稀释漆料 A(1+N)
      已稀释漆料 M（1:r0）+ 补加稀释剂 → 目标 1:rN（N > r0）
调漆：多组分（原浆 / 已稀释漆料）按 ml 或按目标总容量 V 分摊
      每组按自身比例折算原浆，等效比例 = Σ稀释剂 / Σ原浆
```

- **不再选择调漆瓶容量**：批次容量 = 产出体积向上取整（最小 5 ml，Schema 上限放宽到 2500）。
- 每次提交生成一支**批次**（`Bottle.mode = 'dilute' | 'blend'`），可切换历史批次。
- 批次动作：入库（`stockInBottle`，比例为 0 且非调漆产物时记作原浆，否则记作已稀释）/ 开涂（`refType='bottle'`）/ 使用 / 清空。
- 算法都在 core，可单测：`src/core/math/dilution.ts`（正算 / 反算 / 补满 / 溢出）与
  `src/core/math/blend.ts`（`diluteThinned` / `neatShareOf` / `planBlend`）。

## 数据（paintlab 合并表）

| 项目 | 值 |
|---|---|
| 品牌 | 2（gsi 郡士 448 / jy 匠域 169） |
| 产品线 | 34（由「系列」生成） |
| 漆料 | 617（实色 531 / 透明 55 / 辅助 31） |
| 色值 | 复用既有目录 121 条 + 按色名推定 465 条（`hexEstimated`） |

管线：`scripts/import-paintlab.mjs`（CSV → seed）→ `scripts/verify-catalog.mjs`（0 错）→
`scripts/build-catalog.mjs`（seed → `public/catalog/*.json`，透传 `hexEstimated`）。

**数据换代**：`DepotDB` 升到 `version(2)`，升级回调清空全部表（含旧目录缓存与撤销栈），
等于「原有数据清除，重新入库」。旧品牌的 `ak.json` / `tamiya.json` 已删除，索引只剩 gsi/jy。

## 测试

`tests/unit/core`：稀释 / 调漆分摊 / 液位 / 色块 / 不变量 / 分组 / 撤销栈；
`tests/unit/data`：补丁事务、撤销回滚、目录归一化（真实 gsi.json）、数据重置；
`tests/unit/components`：色卡与瓶身；`tests/unit/features`：五页交互。

本轮新增/重写：
- `tests/unit/core/blend.test.ts`（13 条）：再稀释、原浆占比、目标容量分摊、缺口。
- `tests/unit/features/mix.test.tsx`（13 条）：稀释正/反算、再稀释、调漆分摊、稀释剂缺失、
  使用 / 入库 / 开涂、空状态。
- 术语与数据断言同步更新：workbench / procure / catalog / schemas 等。

```
npx tsc --noEmit   → 0 error
npx vitest run     → 24 files / 323 tests passed
npx vite build     → ✓ built（JS 625 KB → gzip 197 KB）
npm run check      → verify 0 error（34 warning：primer/wash 语义提示）
```

## 目录

```
public/catalog/      运行时目录包（gsi / jy / index）
scripts/             import-paintlab / verify-catalog / build-catalog / make-launcher
src/core/            领域层（types / schemas / math / render / rules / history）
src/data/            db（Dexie v2）/ repos / catalog
src/store/           切片 + hydrateApp
src/components/      ui / paint / bottle
src/features/        procure / depot / mix / workbench / settings
src/app/             Shell / TopBar / SideNav / App
docs/                设计书 / 交班文档 / 改版说明 / seed
tests/unit/          core · data · components · features
```

## 已知缺口与偏差（声明项，不是隐藏缺陷）

1. **465 条色值按色名推定**（`hexEstimated`，界面「≈ 推定色」）：未取到厂商官方色卡。
2. **7 条匠域珍珠色名称待补**（GC004–GC010 官网不可达）。
3. **自动快照未实现**（P1）：设置页标注，提供导出全量替代。
4. **Playwright E2E 未接入**：回归靠单测 + 人工走查。
5. **ESLint 未接入**：闸门为 `tsc --noEmit` + `vitest` + `vite build`。
6. 打包单 chunk 约 625 KB（gzip 197 KB，预算 250 KB 内），未做 manualChunks。
7. 品牌代号仍是「PD」：改名会影响启动器与 PWA 缓存，留到后续统一处理。
