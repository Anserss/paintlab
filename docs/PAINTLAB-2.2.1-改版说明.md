# PAINTLAB 2.2.1 · 改版说明

> 版本：`package.json` → `2.2.1`；`src/platform.ts` 兜底 → `2.2.1`；桌面壳 `desktop/electron/package.json` → `2.2.1`
> 基线：2.2.0（`docs/PAINTLAB-2.2-改版说明.md`）；生成时间：2026-11-19（Asia/Shanghai）
> 触发：用户 2026-11-19 实机截图指出「调漆台 / 工作台里的调漆产物名称显示『调漆14』而不是 JW020」，并补充：**调漆产物的命名逻辑是用户自定义；不定义才默认「调漆X」**。

---

## 0. 一句话

**调漆产物恢复用户自定义命名：调漆确认前可填「产物名称」（例如 JW020），留空才默认「调漆N」；已入库产物可在仓库详情「改名」，改名可撤销。**

## 1. 问题

### 1.1 现场

- 调漆台取料行 / 工作台磁贴 / 用量面板里，一瓶实际由 JW020 中灰 + JW024 钴蓝调出的漆显示为 **`调漆14`**（2.2 自动命名）。
- 用户期望的名称是 **`JW020`**（或自己的叫法），并且明确：**名称是用户自定义的，只有没定义时才应回落到「调漆X」**。

### 1.2 根因

- 2.2.0 把「入库」提前到调漆确认，同时删除了批次阶段（含改名入口），但 `blendAndStockIn` 仍然固定写 `customName = '调漆' + seq`。
- 结果：用户既不能在调漆时定义名称，也不能在入库后改名，所有调漆产物只能叫「调漆N」。

## 2. 新规则（唯一真相）

### 2.1 调漆确认时的名称

`feat: 产物名称（可选）`

- 1–16 字；留空 / 全空格 = 未定义。
- **定义了**：`StockItem.customName = 用户名称`，**不消耗** `settings.mixSeq`。
- **未定义**：`customName = 「调漆N」`，N = `settings.mixSeq + 1`（沿用 2.1 规则；删除不回收序号）。
- 稀释产物仍按 2.1 规则：名称 = 原浆名称 + 「(1:N)稀释」小牌，不参与本规则。

### 2.2 同配方合并时的名称

- 未填名称：并入同配方瓶，保留目标瓶原名称。
- 填了名称：并入同配方瓶，并把**那一瓶改名为用户名称**（同一 Command，撤销恢复旧名与旧容量）。

### 2.3 已入库产物改名

- 入口：仓库 → 选中调漆产物 → 详情抽屉 → **「改名」**。
- 限制：只允许已有 `customName` 的调漆产物（原浆 / 纯稀释漆料没有独立名称，不能改名）。
- 校验：1–16 字；与当前名称相同 / 空 / 超长会拒绝；名字不要求唯一。
- 落库：`patch customName` + ledger（`type:'adjust'`, `meta.action='stock-rename'`），一个 Command，可撤销。
- 只改显示名称，不改组分快照、比例、余量、`mixKey`。

### 2.4 详情补强

仓库详情里对调漆产物显示配方：

```
调漆产物 · 配方：中灰 20.0 ml + 钴蓝 10.0 ml（原漆 JW020）
```

来源是 `StockItem.mixLabel`（2.2 起写入；旧数据迁移时补算）。这样两个不同配方但同名的调漆产物仍能区分。

## 3. 数据契约

```ts
// data/repos/mix.ts
interface BlendStockInput {
  parts: BlendStockPartInput[];
  targetMl?: number | null;
  /** 2.2.1：用户自定义名称；留空 = 调漆N */
  name?: string;
}

// data/repos/stock.ts
interface RenameStockInput { itemId: string; name: string; }
renameStockItem(s, input): Result<StockWriteResult>
```

- 没有新增持久化字段：仍用 `StockItem.customName`；旧数据无需迁移。
- `settings.mixSeq` 保留：只有「未定义名称的新调漆产物」才发号；自定义名称不占号。
- 旧 `repos/bottle.ts` 的 `调漆N` 流程保留（只服务旧数据 / 历史测试）。

## 4. 界面

### 4.1 调漆台

- 右侧结果卡下方新增 **「产物名称（可选）」** 输入框（`data-mix-name`，`aria-label="产物名称"`，`maxLength=16`，占位「留空 = 调漆N」）。
- 输入框显示 `n/16`；提示「用户自定义名称；留空按调漆N 自动命名。同配方合并时填了名称会给那一瓶改名。」

### 4.2 仓库详情

- 调漆产物（`customMixed && dilutionRatioN == null`）的底部动作新增 **「改名」**（`data-detail-action="rename"`）。
- 弹层：`data-dialog="rename-stock"`、`aria-label="新名称"`、`data-action="confirm-rename-stock"`；显示当前名称 + 原漆；保存后状态条回执「已改名为「…」」，可撤销。
- 配方行：`data-custom-mixed` 显示 `mixLabel`。

## 5. 实测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | **34 文件 / 392 用例通过** |
| `npm run build:desktop` / `npm run desktop` | 安装版 exe **2.2.1** |
| 安装版走查 | 把库里的「调漆14」在仓库详情改名为 `JW020` → 调漆台取料行 / 工作台磁贴 / 用量面板都显示 `JW020`；改名可撤销；调漆面板自定义名称输入生效 |

相关截图：`reports/shots/2-2-1-rename-dialog.png`、`2-2-1-mix-name.png`、`2-2-1-workbench-jw020.png`。

新增 / 改写的用例：

- `tests/unit/data/mix-stockin.test.ts`：自定义名称不消耗序号、留空回落「调漆1」、合并时改名 + 撤销、`renameStockItem` 落库/撤销/空名/超长/原浆拒绝。
- `tests/unit/features/mix.test.tsx`：调漆面板「产物名称」输入 → `customName`；留空 → `调漆1`。
- `tests/unit/features/depot-decompose.test.tsx`：调漆产物「调漆14」→「JW020」改名并撤销。

## 6. 2.2.0 提交记录（前置工作）

2.2.0 的 129 项改动已按层拆成 7 个 commit（在当前 `master`）：

| commit | 内容 |
|---|---|
| `chore(build)` | 桌面壳、构建/启动/调试脚本、字体、入口配置、`.gitignore` |
| `feat(core/data)` | 领域模型、配方签名、自动入库、容量偏低、迁移的数据层 |
| `feat(ui)` | 2.0 视觉 token / UI 基元 / 小牌 / 偏低红牌 |
| `feat(pages)` | 五个页面（含 2.2 调漆台、仓库改名入口） |
| `feat(catalog)` | 2.1.2 郡士 CL 20 条 + 手补管线 |
| `docs` | 2.0 规格、2.1 / 2.1.1 / 2.2 说明、README / IMPLEMENTATION |
| `test` | 34 文件 / 388 用例（2.2.0 时点） |

> 2.2.1 的代码、测试、版本文档单独提交，不混入 2.2.0 的提交。

## 7. 兼容与注意

- 旧 `调漆N` 名称原样保留（用户可自行改名）；不做自动改名，避免覆盖用户已有叫法。
- 自动名与自定义名没有唯一性约束：两个配方可以同名，详情里的配方行用于区分。
- 改名只对调漆产物开放；稀释漆料的名称仍由原浆决定。
- 自动快照 / 分发链路等 2.2.0 遗留项未在本版处理。
