# PAINTLAB 1.1 · 漆料资产与调漆工作台

> 工程代号 **PAINTLAB**。交班与工程描述：`docs/PAINTLAB-1.0-交班总结与工程描述.md`；
> 本轮改版说明（术语 / 数据 / 调漆台双模式）见 `docs/PAINTLAB-1.1-改版说明.md`；
> 分层与脚本速查：`IMPLEMENTATION.md`。
> 单文件启动器：`release/PAINTLAB.exe`（`npm run launcher` 重建）。

面向模型涂装玩家的**漆料资产与调漆工作台**：采购入库 → 仓库管理 → 调漆台（稀释 / 调漆）→ 工作台开涂，
本地优先、离线可用，视觉走「明日方舟式工业实用主义 × 包豪斯构成」。

---

## 四个动词，全站统一

| 动线 | 统一叫法 | 说明 |
|---|---|---|
| 任何进入仓库的动作 | **入库** | 采购页入库、工作台放回、调漆台批次入库 |
| 任何进入调漆台的动作 | **调漆** | 仓库行点「调漆」→ 选中该条并进入调漆台 |
| 任何进入工作台的动作 | **开涂** | 仓库多选开涂、调漆台批次开涂 |
| 调漆台内的产出 | **稀释 / 调漆** | 两种模式，见下 |

## 调漆台（本轮重做）

- **稀释模式**：原浆 + 稀释剂按 1:N 直接产出「已稀释漆料」批次；**不再选择调漆瓶容量**。
  也支持取用仓库里的已稀释漆料继续再稀释（填取用 ml + 目标比例）。
- **调漆模式**：多组分（原浆 / 已稀释漆料）按 ml 或按**目标总容量分摊**混合，
  每组按自身比例折算原浆，得出等效比例。
- 批次动作：**入库**（变成仓库条目）/ **开涂**（送到工作台）/ 使用 / 清空；可切换历史批次。

## 快速开始

需要 Node.js ≥ 18。

```bash
npm install --ignore-scripts     # 沙箱里 esbuild 的 postinstall 会被拦，平台包已随可选依赖装好
npm run dev                      # http://localhost:5175
npm run typecheck                # tsc --noEmit，期望 0 错
npm test                         # vitest run，24 文件 / 323 用例
npm run build                    # tsc --noEmit && vite build（PWA 壳）
npm run check                    # 目录核验 + 重建 public/catalog
npm run launcher                 # 重建 release/PAINTLAB.exe
```

## 数据（paintlab 合并表重建）

| 品牌 | 产品线 | 条数 |
|---|---|---|
| 郡士 GSI Creos（`gsi`） | 23 条系列 | 448 |
| 匠域 Jumpwind（`jy`） | 11 条系列 | 169 |
| **合计** | 34 条 | **617** |

- 漆类：实色 531 / 透明 55 / 辅助 31
- 色值：121 条按色号复用既有目录已核验色值；465 条按色名推定，界面标 **≈ 推定色**（不谎报）
- 数据管线（一条命令）：

```bash
npm run import:catalog    # paintlab CSV → docs/seed/paint-catalog.seed.json
npm run check             # 核验 + 拆成 public/catalog/*.json
```

**数据换代**：数据库版本升到 v2，升级时清空全部旧表（旧目录 4 品牌 267 条 + 旧库存 / 分组 /
批次 / 工作台 / 记录 / 撤销栈），即「原有数据清除，重新入库」。

来源与许可：型号 / 容量 / 来源列来自 paintlab 的《郡士_匠域_油性漆_合并》表；
色值沿用既有目录（modkit-swatch MIT 等）或由色名推定，逐条记录在 `paint.source`。

## 目录结构

```
src/core/            领域层（types / schemas / math：dilution + blend / render / rules / history）
src/data/            db（Dexie v2）/ repos / catalog
src/store/           切片 + hydrateApp（ui / settings / catalog / inventory / mix / workbench / history）
src/components/      ui / paint / bottle
src/features/        procure / depot / mix / workbench / settings
src/app/             Shell / TopBar / SideNav / App
tests/unit/          core · data · components · features（24 文件 / 323 用例）
public/catalog/      运行时品牌包（gsi.json / jy.json / index.json）
scripts/             import-paintlab / verify-catalog / build-catalog / make-launcher
docs/                设计书 + 交班文档 + 种子数据
```

## 已知缺口

1. 465 条色值为**按色名推定**（`hexEstimated: true`，界面 ≈ 推定色）—— 建议后续按厂商官网色卡回填。
2. 7 条匠域珍珠色（GC004–GC010）官网不可达，名称待补（`source` 已标注）。
3. 自动快照（`snapshots`）仍未实现；设置页标注 P1 未实现并提供导出替代。
4. Playwright E2E 未接入；回归靠 323 条单测 + 人工走查。
5. 打包单 chunk 约 625 KB（gzip 197 KB），未做 manualChunks 拆分。
