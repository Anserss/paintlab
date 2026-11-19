# PAINTLAB 2.2.0 · 改版说明

> 版本：`package.json` → `2.2.0`；`src/platform.ts` 兜底 → `2.2.0`；桌面壳 `desktop/electron/package.json` → `2.2.0`
> 基线：2.1.2（`paintlab/HANDOFF-2.1.2.md`）；本轮为 2026-11-19 用户提出的 5 项需求 + 交班文件。
> 生成时间：2026-11-19（Asia/Shanghai）

---

## 0. 一句话

**调漆台的「稀释 / 调漆」确认后直接扣库存并自动入库，不再有批次与「使用 / 清空」；同配方自动合并成一个瓶；任何扣减后余量 < 原有容量 20% 或 < 10 ml 会弹窗并在名称前挂红底白字「容量偏低」，余量 0 ml 直接删除；调漆台重排为「左取料 → 右上操作 → 右下紧凑配方」，调漆 SOP 提供“总量÷配比”和“各组分用量”两种算法，组分可选调漆产物。**

## 1. 稀释 / 调漆确认后自动入库（需求 1）

### 1.1 行为

- 点「稀释并入库」「调漆并入库」后，同一个事务里完成：
  1. 扣减来源 / 各组分库存；
  2. 余量归 0 的条目删除（连带工作台引用）；
  3. 产物写入仓库（新建或并入同配方瓶）；
  4. 写 `mixRecords`（`stockItemId`）与 `ledger`；
  5. 一个 `Command`，整单可撤销。
- 去掉了 2.1 调漆台中栏的 **使用 / 清空 / 入库** 三个按键，以及批次改名 / 改色 / 切换批次（2.2 不再产生调漆台批次）。
- 页头保留「开涂」：把最近一次产出的**库存条目**直接送到工作台（多个工作台时弹选择）。

### 1.2 为什么不再产生 bottle

2.1 的 `Bottle` 是“调漆台当前批次”，入库后删除。2.2 把“入库”提前到确认动作里，产物直接就是 `StockItem`，所以调漆台不再需要 bottle。旧 `repos/bottle.ts` 保留，只服务旧数据迁移与历史测试。

### 1.3 升级迁移

`data/repos/mix.ts · migrateLegacyBottles()` 在 `hydrateApp` 的读库存之前执行：

- 2.1.x 留在 `bottles` 表里、有余量的批次 → 转成 `StockItem`（`origin:'mixed'`，保留 `parts`、稀释比例、自定义名/色、自定义透明度）；
- 同配方旧批次按配方签名合并成一瓶；
- 工作台上的 `bottle` 引用改成对应 `stock` 引用（重复引用去重）；
- `bottles` 行删除；随后 `purgeEmptyStockItems()` 清掉历史遗留的 0 ml 条目（连带工作台引用）。两者都**不写 Command**（属于版本搬家，不进撤销栈）。

## 2. 同配方自动合并（需求 2）

### 2.1 配方签名

`core/rules/formula.ts`：

```ts
formulaKeyOfParts(parts) =
  'f:' + sort(parts.map(p =>
    (aux ? 'a' : dilute ? 'd' : 'p')
    + ':' + (p.sourceKey ?? p.paintId)   // 来源是调漆产物时用来源签名
    + ':' + p.state
    + ':' + (thinned ? ratioN : '-')
    + ':' + (p.ml / Σp.ml 四舍五入 4 位)
  )).join('|')
```

- 只看**组分身份 + 稀释状态 + 比例 + 体积占比**，不看批次大小：10+10 与 20+20 都是 1:1。
- 调漆产物作为别的调漆的组分时，`BatchPart.sourceKey` 记录来源签名；避免“两支不同混合漆恰好以同一原浆打底”被误判成同一种料。
- 签名超过 520 字符时压成 `f#<FNV-1a>`（嵌套配方可能很长，schema 上限 640）。
- 旧条目没有 `mixKey` 时：按 `parts` 现算；再退化到 `p:<paintId>@<ratioN>`；保证 2.1.x 入库的稀释漆料也能与新批次合并。

### 2.2 合并

`data/repos/mix.ts · diluteAndStockIn / blendAndStockIn`：

- 找库中签名相同、且不是本次被取用组分的条目（`findFormulaTarget`）；
- 命中：`volumeMl` 与 `initialMl` 同步累加；`parts` 按组分键把 `ml` 相加（顺序沿用目标条目）；`mixKey/mixLabel` 补齐；
- 未命中：新建 `StockItem`；调漆产物才发 `settings.mixSeq` 号（“调漆N”）。

### 2.3 展示

- 合并后仓库里只有一条，容量条显示累计容量（`volumeMl / initialMl`）。
- 最近配方 / 配方条显示本次**新增**容量，并在回执里写「已并入同配方瓶」。

## 3. 容量偏低与 0 ml 删除（需求 3）

### 3.1 判定（唯一真相：`core/rules/low-volume.ts`）

```ts
isLowVolume(volumeMl, initialMl) =
  volumeMl > 0 && (volumeMl < initialMl * 0.2 || volumeMl < 10)
```

- “原有容量” = `StockItem.initialMl`（采购规格 / 产物入档容量；合并时同步累加）。
- 边界：恰好 20%（如 12/60）与恰好 10 ml 不触发（严格小于）。

### 3.2 触发点

所有会减少库存余量的路径：

| 路径 | 结果 |
|---|---|
| 稀释 / 调漆 | 被取用的来源 / 组分：余量 > 0 且偏低 → `lowVolume`；余量 ≤ 0 → 删除 |
| 工作台「记录用量 / 入库」 | 同上；删除时连带清掉该条目的所有工作台引用 |
| 仓库「调整余量」 | 调到 0 → 删除；调到偏低 → `lowVolume` |
| 同配方合并 | 合并后的瓶若仍偏低 → 也进提示（新增容量不一定能救回） |

新建产物本身不弹窗（没有“原有容量”），但如果产物 < 10 ml，名称栏仍会显示「容量偏低」红牌。

### 3.3 弹窗与红牌

- 全局弹窗 `app/LowVolumeDialog.tsx`（Shell 挂载）：标题「容量偏低」，描述为需求原文
  **「此操作后容量偏低，为防止影响你的涂装请注意。」**，列出本次受影响条目的色号 / 名称 / `余量 / 原有容量`，按钮「知道了」。
- 红牌 `components/paint/LowVolumeTag.tsx`（`.ef-low-volume-tag`，`#B3261E` 红底 + 白字，18px 高）：
  - 仓库行（`PaintMeta`）+ 行 aria-label；
  - 仓库详情抽屉；
  - 工作台磁贴（`PaintTile`）；
  - 调漆台取料行（`StockPicker`）。
  - 位置固定为**名称栏最前面**（在稀释小牌之前）。
- 视觉纪律例外：原规则「红色只给删除」；2.2 按用户明确要求新增红底白字状态牌，是唯一例外，已在 README / IMPLEMENTATION 标注。

## 4. 调漆台布局与 SOP（需求 4 / 5）

### 4.1 布局

```
┌ 页头：// MIX 调漆台  [稀释 | 调漆]  自动入库   最近产出 + 开涂 ┐
├──────────────┬──────────────────────────────────────┤
│ 取用漆料      │ 右上：操作区（SOP + 数据 + 计算 + 确认）    │
│ （单选/多选）  │ 右下：紧凑配方条（真实体积占比 + 图例）      │
├──────────────┴──────────────────────────────────────┤
│ 最近配方（横向紧凑条，稀释记录可复现）                    │
└────────────────────────────────────────────────────┘
```

- 去掉了 2.1 中栏的大瓶身 / 配方环 / 批次栏；配方压缩成底部一条按体积占比分段的色条（`data-recipe-preview`）。
- 「① 选料 → ② 填量/比例 → ③ 确认入库」SOP 文案固定在操作区标题旁。

### 4.2 稀释 SOP

- 输入口径二选一：**按原浆量 A**（正推稀释剂）/ **按目标总量 V**（反推原浆）。
- 比例 1:N（0–10，步进 0.1，6 个预设）；已稀释漆料再稀释时填取用 ml + 目标比例。
- 结果实时显示原浆 / 稀释剂 / 合计（含取整前值）；稀释剂来源自动取第一条有余量的辅料。
- 阻断：库存不足、比例不增、稀释剂缺失（可点「本次不扣减稀释剂」一键关闭扣减）。
- 确认按钮「稀释并入库」。

### 4.3 调漆 SOP（两种算法）

| 算法 | 用户给什么 | 自动算什么 |
|---|---|---|
| **按总量 ÷ 配比** | 目标总容量 V + 各组分配比权重 | 各组分 ml（合计严格 = V）、组分占比、等效比例 |
| **按各组分用量** | 各组分 ml | 合计、各组分占比、等效比例 |

- 组分列表每一行都显示：色样、色号/名称、可用 ml、组分类型（原浆 / 稀释比例牌 / 「调漆」标签）、本行份量输入、分摊结果与占比。
- **组分支持已调漆产物**：左侧列表包含 `origin:'mixed'` 的调漆产物，勾选即可作为组分；组分的 `parts → sourceKey` 快照保证同配方判定正确。
- 确认按钮「调漆并入库」。

### 4.4 最近配方 / 复现

- 底部横条显示最近 6 条配方（时间 / 稀释或调漆 / 合计 / 比例 / 原浆 / 稀释剂或组分数）。
- 稀释记录保留「复现」（带回比例与原浆量）；调漆记录只展示，不复现（2.2 两种算法的输入口径不唯一，避免误覆盖）。

## 5. 数据契约与撤销

### 5.1 新增可选字段（无需 Dexie 版本升级）

```ts
// core/model/types.ts
interface BatchPart {
  // 2.2
  sourceKey?: string;    // 来源条目配方签名（调漆产物 / 已稀释漆料作为组分）
  sourceLabel?: string;  // 来源展示名
}
interface StockItem {
  mixKey?: string;       // 同配方合并签名
  mixLabel?: string;     // 配方说明（≤80 字）
}
interface MixRecord {
  bottleId?: string;     // 2.1 及更早（转可选）
  stockItemId?: string;  // 2.2 自动入库后的库存条目
}
```

- `MixRecordSchema` 只要求 `bottleId` / `stockItemId` 至少一个；旧记录照常通过。
- `StockItemSchema` 增加 `mixKey/mixLabel`（可选）；`BatchPartSchema` 增加 `sourceKey/sourceLabel`（可选）。

### 5.2 撤销

- 稀释 / 调漆：一个 Command 覆盖“扣组分 + 删除 0 ml 条目 + 新建/合并产物 + 配方记录 + ledger”；`inverse` 完整恢复（包括被删条目的工作台引用、合并前的 `initialMl/parts`）。
- 盘点归零 / 工作台用量归零：同样一个 Command，撤销后条目与工作台引用一起回来。
- 同配方合并的 `mixSeq` 不递增（只有新建调漆产物才发号）；撤销不回收已发序号（2.1 规则延续）。

## 6. 界面锚点（测试 / 自动化用）

新增：

- `data-auto-stock-in`、`data-last-result`、`data-action="coat-last"`
- `data-recipe-preview`、`data-recipe-bar`、`data-recipe-part`、`data-recipe-total`、`data-recipe-mode`、`data-last-mix`
- `data-low-volume-tag`、`data-low-volume`（行）、`data-low-volume-dialog`、`data-low-volume-item`
- `data-part-mode`（`ratio` / `amount`）、`data-part-share`
- 调漆算法单选 aria-label：`按总量 ÷ 配比` / `按各组分用量`
- 份量输入 aria-label：`配比 <色号>` / `用量 <色号>`
- 确认按钮：`稀释并入库` / `调漆并入库`

保留：`data-page="mix"`、`data-mix-panel="stock|dilute|blend|recents"`、`data-source-line`、`data-mix-results`、`data-blend-results`、`data-result`、`data-raw`、`data-ratio-input`、`data-ratio-preset`、`data-ratio-clamped`、`data-ratio-invalid`、`data-target-input`、`data-thinner-missing`、`data-thinner-untracked`、`data-blocker`、`data-action="skip-thinner"`、`data-action="dilute-commit"`、`data-action="blend-commit"`、`data-action="blend-equalize"`、`data-recipe`、`data-action="reproduce"`。

移除：`data-mix-panel="bottle"`、`data-stage-name/reading`、`data-dilution-swatch`、`data-bottle-color`、`data-batch`、`data-action="stock-in|use|clear"`、`data-mix-panel="blend"` 里的「清空组分」按钮。

## 7. 测试与验收

（见 §9 实测结果；命令：`npx tsc --noEmit` / `npx vitest run` / `npm run desktop`。）

新增/改写的重点用例：

- `tests/unit/core/formula.test.ts`：签名比例归一、顺序无关、不同比例 / sourceKey 区分、组分 ml 合并、旧数据签名退化。
- `tests/unit/core/low-volume.test.ts`：20% 与 10 ml 边界、0 ml 不算偏低、提示去重、文案原文。
- `tests/unit/data/mix-stockin.test.ts`：稀释合并 / 不同比例不合并 / 偏低提示 / 归零删除与撤销、调漆合并、调漆产物作组分、盘点归零、工作台归零、旧 bottle 迁移与工作台引用迁移。
- `tests/unit/features/mix.test.tsx`：2.2 自动入库、同配方二次合并、两种调漆算法、调漆产物作组分、无使用/清空/入库键、偏低红牌与弹窗状态、归零删除。
- `tests/unit/features/low-volume.test.tsx`：全局弹窗文案 / 条目 / 关闭。
- `tests/unit/features/dilution-flow.test.tsx`：原有三边流转 + 新的自动入库断言。

## 8. 兼容与已知缺口

- 旧 `Bottle` 数据：启动时静默迁移（§1.3）；迁移后 `bottles` 表为空，`settings` 导出的 `user.bottles` 也会是空数组。
- 旧调漆产物没有 `mixKey`：按 `parts` 现算签名；2.0 时代没有 `parts` 的条目无法参与合并（只按普通条目显示）。
- 库中既有的同配方多条（2.1 及更早各批次各自一条）不会在启动时自动合并；2.2 新批次只并入最早的一条。要一次性合并需先确认（会改写/删除旧条目，调漆产物可能丢名称/手动色）。
- 调漆产物不再支持就地改名 / 改色（批次 UI 已下线）；颜色由各组分原浆量加权自动计算。如后续需要手动改色，可在库存详情上重新引入颜色编辑器。
- 「容量偏低」按 `initialMl` 判定；采购规格本身 < 10 ml 的条目会一直带红牌（这是需求的字面结果）。
- 自动快照 / 分发链路 / 色值核验等 2.1.2 遗留项未在本轮处理，见交班文件。

## 9. 实测结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | **34 文件 / 388 用例通过** |
| `npm run build:desktop` | 成功；CSS 32.99 kB / JS 653.67 kB（gzip 206.04 kB），无 sw.js |
| `npm run desktop` | 成功；安装版 exe **2.2.0** |
| 安装版启动 / 走查 | `app://paintlab`，版本角标 2.2.0；旧 bottle 迁移、0 ml 清理、自动入库 + 同配方合并、偏低弹窗 + 红牌、撤销、两种调漆算法均通过（详见 `paintlab/HANDOFF-2.2.0.md` §7） |

实机截图：`reports/shots/2-2-mix-final.png`、`2-2-mix-blend-final.png`、`2-2-depot-final.png`、`2-2-workbench.png`、`2-2-mix-commit.png`、`2-2-mix-after-undo.png`。

