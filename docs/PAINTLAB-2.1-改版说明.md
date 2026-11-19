# PAINTLAB 2.1 · 改版说明

> 版本：`package.json` → `2.1.0`；生成时间：2026-11-18（Asia/Shanghai）
> 基线：2.0（桌面版已安装、333 条单测全绿，改动未提交）
> 本文件只记录 2.1 的增量；视觉与交互的完整规格仍看 `docs/PAINTLAB-2.0-桌面化与视觉重做规格.md`。

---

## 0. 一句话

**删掉右下角浮动提示；把「稀释漆料」从调漆产物里独立出来（原浆名 + 原浆色 + `(1:N)稀释` 灰底白字小牌），并让它在仓库 / 调漆台 / 工作台三边互相流转；原浆只在仓库与调漆台之间流转；工作台加一条「从仓库调取」侧栏。**

## 1. 需求与落地

| # | 需求 | 落地 |
|---|---|---|
| 1 | 删掉右下角的操作提示 | `Shell` 不再渲染 `ToastStack`；`ui/Toast.tsx` 与 `.ef-toast*` 样式删除。回执/错误改由状态条（36px）显示一行原文，4.2 s 自动收起；撤销统一走状态条撤销栈 |
| 2 | 稀释漆料在仓库 / 调漆台 / 工作台互相流转 | 仓库 → 工作台：`openCoat` 接受 `state === 'thinned'` 的条目（侧栏调取或行内开涂）；工作台 → 调漆台：批量条新增「去调漆台」（带 `stockItemId` / `bottleId` 跳转）；调漆台 → 仓库：`stockInBottle`；调漆台 → 工作台：`openCoat` 批次；工作台 → 仓库：`recordUsageAndStockIn` |
| 3 | 原浆只能在仓库与调漆台之间流转 | 数据层：`openCoat` 对 `state === 'neat'` 返回失败 `原浆只能在仓库与调漆台之间流转：先在调漆台稀释，再从侧栏调取稀释漆料`；仓库行不再给原浆显示「开涂」；详情抽屉「开涂」禁用并带原因；多选开涂时跳过原浆并提示 |
| 4 | 工作台侧栏从仓库调取稀释漆料 | 新增 `features/workbench/StockLane.tsx` + `useWorkbenchData.ts`；只列非原浆、非辅料、有余量的条目；点击即加入当前工作台；已加入显示「已加入」并禁用；页脚说明平台流转规则 |
| 5 | 稀释漆料按原浆名称/色值显示 + `(稀释比例)稀释` 灰底白字前缀 | 稀释批次 `name = 原浆名`、`hex = 原浆色`、无 `seq`/`colorHex`/`colorAlpha`；新增 `DilutionTag`（灰底 `--ef-tag-grey-bg` + 白字，文案 `(1:2)稀释`），接入仓库行 / 仓库详情 / 调漆台批次头 / 瓶身信息牌 / 工作台磁贴 / 工作台侧栏 / 用量面板；调漆批次保持 2.0 的 `调漆N` + 自定义色 + 未定色 |

## 2. 数据契约变化

### 2.1 `StockItem.dilutionRatioN?: number`（新增，可选）

- 由 `stockInBottle` 在来源批次为「稀释」时写入（`ratioN > 0`）；调漆产物不写。
- 语义：**这是稀释漆料**，仓库/工作台按原浆名称与色值显示，名称前加 `(1:N)稀释`。
- 与 `customName/customHex/customAlpha` 的关系：
  - 稀释：`customName = 原浆名`、`customHex = 原浆色`、**不写 `customAlpha`**、`dilutionRatioN = N`；
  - 调漆：沿用 2.0（`customName = 批次名`、`customHex = 展示色`、`customAlpha = 透明度`），`dilutionRatioN` 缺省。
- `StockItemSchema` 同步新增可选字段；旧备份缺该字段仍通过校验，按普通条目显示。
- 导出 / 导入：随 `stockItems` 原样往返（已加用例）。

### 2.2 `Bottle`（稀释批次）

| 字段 | 2.0 | 2.1 稀释批次 |
|---|---|---|
| `name` | `调漆N` | **原浆名称**（`nameZh` 优先，硬截断 16 字） |
| `seq` / `settings.mixSeq` | 每支批次都发号 | **不发号**（`mixSeq` 只给调漆批次） |
| `hex` | 原浆色 | 原浆色（不变） |
| `colorHex` / `colorAlpha` | `#FFFFFF` + 70 | **不写入**（稀释没有「未定色」语义） |
| `mode` | `dilute` / `blend` | 不变 |

调漆批次完全保持 2.0：`调漆N` + `seq` + 默认 70% 白「未定色」+ 可就地改名/改色（可撤销）。

### 2.3 展示解析唯一处

`src/core/render/batch.ts`：

```ts
dilutionTagText(ratioN)    // (1:2)稀释
bottleLook(bottle)         // 名称/色/透明度/未定色/稀释比例
stockLook(item, paint)     // 同上，仓库侧
bottleDisplayLabel(bottle) // 切换批次 / 页头用：(1:2)稀释 钴蓝
canEnterWorkbench(state)   // 原浆 false
WORKBENCH_NEAT_BLOCK       // 统一的拦截文案
```

组件不得自行拼「稀释」前缀（避免调漆台、仓库、工作台三处文案漂移）。

## 3. 交互与视觉细节

- 稀释小牌：`18px` 高、`11px` 字、灰底白字、直角；**不可点击、不参与拖拽**；出现在名称前。
- 瓶身信息牌（SVG）：小牌是 `<rect>` + `<text>`，宽度按字数估算（`estimateTextWidth`），名称右移，剩余量仍在最右。
- 调漆台的稀释批次：名称只读（`title="稀释漆料的名称沿用原浆（不单独命名）"`），右上角改色换成只读「原浆色」块，不渲染 `ColorEditor`、不显示「未定色」。
- 状态条回执：`data-slot="message"`、`data-tone` 区分 `neutral / ok / warn / danger`；超长省略；`warn/danger` 加浅底强调（不使用红色，红色仍只给删除）。
- 工作台空态文案改为「从左侧「从仓库调取」加入稀释漆料。」

## 4. 删除项
- `src/components/ui/Toast.tsx`（整文件）、`components/ui/index.ts` 的 `ToastStack` 导出。
- `base.css` 的 `.ef-toast / .ef-toast__stripe / __body / __action / __close / __progress`。
- `Shell` 中的 `ToastStack` 渲染与两个 toast selector。

保留：`store/slices/ui.ts` 的 `toasts` 队列与 `pushToast/notifyError/notifyUndoable`（约 40 处调用点不动），现在只由 `StatusBar` 消费最后一条。这样错误仍有出口，改造成本最小。

### 4.1 顺带修掉的两处旧文案

1. 稀释面板「当前比例 1:1:2」「目标比例必须大于当前比例 1:1:2」的双前缀（`DilutePanel.tsx` 里又把 `formatRatio()` 拼了一次 `1:`）。
2. `paintTitle()` 在中英文同名时重复出副标题（仓库行显示「红色 红色」「调漆4 调漆4」）；现在同名不再出 secondary。

## 5. 验证

```bash
npm run typecheck   # 0 错
npm test            # 27 文件 / 347 用例通过
npm run build       # PWA
npm run build:desktop
```

新增 / 改写用例：

- `tests/unit/core/batch.test.ts`（8）：小牌文案、稀释/调漆两套展示、`1:0` 不出牌、原浆不上工作台文案。
- `tests/unit/features/dilution-flow.test.tsx`（3）：稀释 → 入库（带 `dilutionRatioN`）→ `openCoat` 接受/拒绝；工作台侧栏列出并加入稀释漆料、磁贴带小牌；调漆台稀释批次页头 `(1:2)稀释 钴蓝`、无改名改色入口。
- `tests/unit/data/bottle-color.test.ts`（13）：稀释命名/不占序号/无自定义色；调漆 1/2/3 与删除不占号；改名改色可撤销；入库保真（含 `dilutionRatioN`）；导出导入 `dilutionRatioN`；schema 兼容。
- 调整：`workbench.test.tsx`（种子改为 thinned、文案、Router 包裹）、`depot.test.tsx`（不再渲染 ToastStack，回执断言改看 store）、`history.test.ts`（`openCoat` 用 thinned 条目）。

## 6. 兼容与迁移

- **无需 Dexie 版本升级**：只新增可选字段，旧记录通过读取层派生。
- 2.0 已存在的稀释批次（`mode='dilute'` + `调漆N`）在 2.1 会按「稀释」显示：色值取 `hex`（原浆色），名称仍是旧的 `调漆N`。若要让旧批次也显示原浆名，需要一次性数据迁移（按 `components[0].name` 改名）；本版未做，避免误改用户自定义名称。
- 2.0 已入库的「已稀释漆料」没有 `dilutionRatioN`，在仓库/侧栏按普通条目显示（名称/色值仍来自 `customName/customHex`），可正常调取。

## 7. 后续可选（未做）

1. 旧稀释批次的一次性改名迁移（按原浆名回填 `name`）。
2. 仓库视图按「原浆 / 稀释 / 调漆」筛选或分组。
3. 工作台侧栏的搜索与批量加入。
4. 状态条回执的历史列表（点开看最近 N 条）。
