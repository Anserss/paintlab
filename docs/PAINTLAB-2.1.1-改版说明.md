# PAINTLAB 2.1.1 · 改版说明

> 版本：`package.json` → `2.1.1`
> 基线：2.1（`docs/PAINTLAB-2.1-改版说明.md`）；本轮 3 个需求，**2 项已完成，1 项被环境阻塞（见 §4）**。

---

## 0. 一句话

**辅料采购不再问「原浆 / 稀释」；删除稀释漆料或调漆产物时可以「分解回仓库」（原浆 + 辅料 / 调漆前的稀释漆料）；郡士 CL 系列因本机断网无法联网检索，未落数据。**

## 1. 辅料采购不出现「原浆 / 稀释」（已完成）

- 触发：采购入库弹层里选中的漆料**全部是辅料**（`paintClass === 'aux'`，即稀释剂 / 缓干剂 / 脱漆剂等）。
- 行为：隐藏「初始状态」分段（原浆 / 稀释）与稀释比例输入，换成一句说明「稀释剂 / 缓干剂等辅料直接入库，不分原浆与稀释。」；提交时强制 `state: 'neat'`，`ratioN` 不写。
- 容量 / 分组 / 备注 / 货架与「颜色」混选时保持原样（混选时无法按行区分状态，仍显示选项）。
- 落地：`src/features/procure/RegisterDialog.tsx`（`isAuxOnly` + `data-aux-no-state` 锚点）。
- 兼容：2.0 里若有人把稀释剂登记成「稀释」，仍按原数据渲染（不会自动改），本版只约束新入库。

## 2. 删除条目：直接删除 / 分解回仓库（已完成）

### 2.1 数据契约（可选字段，向后兼容）

```ts
// core/model/types.ts
interface BatchPart {
  paintId: string; brandId: string; code?: string; name: string; nameZh?: string;
  hex: string; paintClass: PaintClass;
  ml: number;                       // 该组分在产品里的体积
  state: PaintState; ratioN?: number;
  aux?: boolean;                    // 稀释剂等辅料
  dilute?: boolean;                 // 来源本身是「稀释漆料」（带比例牌）
}
Bottle.parts?: BatchPart[];         // 批次生成时快照
StockItem.parts?: BatchPart[];      // 入库时从批次复制，删除时用
```

- `diluteIntoBatch`：快照 = 原浆（neatMl）+ 稀释剂（thinnerMl，`aux: true`）。稀释剂身份优先级：界面传入 `thinnerPaint` > 目录缓存 `paints` 表 > 来源条目已有的辅料组分；**都拿不到时不留快照（不编造组分）**。
- `blendIntoBatch`：快照 = 调漆前的各组分；`ml` 为该组分在产品里的体积，`state/ratioN` 取该组分入库时的状态，`dilute` 标记来源是否稀释漆料。
- `stockInBottle`：把 `bottle.parts` 复制到 `StockItem.parts`。
- schema：`BatchPartSchema` + `BottleSchema.parts` + `StockItemSchema.parts`（全部可选，旧数据照常通过）。

### 2.2 分解规则（唯一真相）

`src/core/rules/decompose.ts`：

- `decompositionOf(item)`：有快照、有余量才可分解；按 `当前余量 / 快照总量` 等比还原各组分；四舍五入误差由最后一段兜住，**分解合计严格等于当前余量**。
- `decompositionPartLabel(part)`：`名称 · 原浆/辅料/稀释漆料 1:N · x.x ml`。
- `decompositionTitle(item)`：含辅料 → **分解为原浆和辅料**；多组分/已稀释 → **分解为调漆前的组分**；单组分 → 分解回仓库。

### 2.3 写入与撤销

`data/repos/stock.ts · decomposeStockItem`：

- 一个 Dexie 事务 + 一个 `Command`：删除原条目（连带工作台引用）→ 按组分新建库存条目（同分组、`origin: 'mixed'`、备注「分解自「…」」）→ 写 ledger（`type: 'adjust'`, `meta.action = 'decompose'`）。
- 组分为稀释漆料时写 `dilutionRatioN`，分解后仍按「(1:N)稀释」显示；原浆 / 辅料写 `state: 'neat'`。
- inverse 完整：撤销后原条目与工作台引用回来，分解产物全部删除。
- Store：`inventory.decomposeStockItem()`，成功回执「已分解为 N 件回仓库」。

### 2.4 界面

- 仓库详情抽屉「删除条目」→ 弹层（`features/depot/Dialogs.tsx · DeleteItemDialog`）：
  - 有快照：标题「这条漆料记着组分：可以直接删除，也可以分解回仓库。」+ 组分清单（`data-decomposition` / `data-decomposition-part`）+ 两个动作：`分解为原浆和辅料` / `分解为调漆前的组分`（secondary）与 `确认删除`（danger）。
  - 无快照：说明「该条目没有组分记录（2.0 之前入库或采购原浆），只能直接删除」，只保留 `确认删除`。
  - 危险色仍只给「确认删除」；分解是次要按钮，不抢主操作。

## 3. 测试与验收

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | 30 文件 / **362** 用例通过 |
| `npm run build:desktop` | 成功 |

新增用例：

- `tests/unit/core/decompose.test.ts`（7）：可分解判定、等比还原、多组分带比例、误差兜底、三种文案。
- `tests/unit/data/decompose.test.ts`（6）：稀释入库快照、缺稀释剂身份不留快照、分解回仓库、按余量还原、调漆产物还原稀释漆料、无快照拒绝分解、撤销恢复。
- `tests/unit/features/depot-decompose.test.tsx`（2）：弹层列出组分并分解入库；无快照只能直接删除。
- `tests/unit/features/procure-aux.test.tsx`：补断言——辅料弹层无「初始状态」分段，显示 `data-aux-no-state`。

## 4. 郡士 CL 系列：2.1.1 被断网阻塞 → **2.1.2 已补录**

> **2026-11-18 外网恢复后已补录 20 条（CL01~09 肤色 / CL101~111 发色）**，见 `docs/PAINTLAB-2.1.2-目录补录.md`。下方保留 2.1.1 当时的排查记录。

- 需求：联网搜索补充郡士 CL 系列漆。
- 实测（2026-11-18 20:0x）：

  | 通道 | 结果 |
  |---|---|
  | `web_search` | `fetch failed`（搜索端点不可达） |
  | `web_fetch` | `fetch failed` |
  | `Invoke-WebRequest https://www.mr-hobby.com/ja/` | 无法连接到远程服务器 |
  | 浏览器插件 `browser_navigate` | `chrome-error://chromewebdata/` |

- 本地也没有现成数据：源表 `H:\AI\DEEPSEEK\harmess\paintlab\郡士_匠域_油性漆_合并.csv`（617 行）、`郡士_匠域_油性漆数据表.xlsx`（4 个工作表）、`docs/seed/paint-catalog.seed.json`（617 条，23 条郡士产品线）里都**没有 CL 系列**（唯一含 "CL" 的是 `Mr.CLEAR COLOR GX`）。
- 结论：没有可核验的 CL 系列色号 / 名称 / 色值来源，**不编造数据**（违反项目「数字必须真实 / 色值不谎称已核验」的纪律）。
- 恢复方式（任选其一，给我数据即可落库）：
  1. 把 CL 系列抓取成 CSV（列同 `序号,品牌,系列,类别,名称（中文）,原名/英文名,厂商代号,色号,特性,容量,参考价,备注,来源`），放在 `H:\AI\DEEPSEEK\harmess\paintlab\` 下并告诉我文件名 → `node scripts/import-paintlab.mjs --csv <文件> && npm run check`；
  2. 直接在对话里贴「色号 / 名称 / 色值」清单，我追加进 seed 后跑 `npm run check`；
  3. 恢复外网后让我重新联网检索（优先 mr-hobby 官方色卡，其次经销商页，色值缺失时按色名推定并标 `hexEstimated`）。

## 5. 兼容

- 无需 Dexie 版本升级：只加可选字段。
- 2.1.0 及更早入库的条目没有 `parts` → 删除时只提供「直接删除」，界面如实说明原因。
- 分解创建的新条目 `origin: 'mixed'`，与调漆产物一致；分组沿用被删条目。
