# PAINTLAB 1.0 · 交班总结与工程描述

> **后续版本**：本轮之后的改版见 `docs/PAINTLAB-1.1-改版说明.md`
> （统一动线命名 入库 / 调漆 / 开涂、工位更名工作台、漆料数据换代为 paintlab 的 617 条、
> 调漆台改为「稀释 / 调漆」双模式并取消瓶容量选择）。本文档保留 1.0 当时的现状描述。

> 项目代号：**PAINTLAB**（前身：PIGMENT DEPOT 设计包 v1.3）
> 版本：1.0.0 ｜ 交付日期：2026-11-16 ｜ 仓库根：`paint-depot/` ｜ 代码提交：见 `git log`
> 本文件分两部分：**A. 交班总结**（接手需要知道的全部现状）与 **B. 工程描述**（架构、契约、算法、运维）。

---

# A. 交班总结

## A1. 一句话现状

设计包里的 M0–M6 已实现为**可运行应用**，并由单文件启动器分发；本轮为四品牌补齐了**稀释剂/缓干剂等辅料目录（11 个 SKU）**，采购页新增**辅料货架**，调漆台把辅料与「原浆」彻底分开，稀释剂扣减链路已跑通并留证。

## A2. 交付物

| 交付物 | 位置 | 说明 |
|---|---|---|
| 应用源码 | `src/` | 五页 + core/data/store/components/app 分层 |
| 设计令牌 | `src/styles/tokens.css` | 4.2 全量令牌 + 浅色主题 + `--chrome-bg` |
| 目录数据 | `docs/seed/paint-catalog.seed.json` → `public/catalog/*.json` | 267 条（256 色卡 + 11 辅料），可被 `verify-catalog` 复核 |
| 单文件启动器 | `release/PAINTLAB.exe` | 1.11 MB，双击即用，内嵌 `dist/` |
| 测试 | `tests/unit/**` | 23 文件 / 308 用例 |
| 工程说明 | `IMPLEMENTATION.md` | 分层、脚本、AC 覆盖 |
| 本文件 | `docs/PAINTLAB-1.0-交班总结与工程描述.md` | 交班 + 工程描述 |

## A3. 质量闸门（最后一次全量实测）

```
npx tsc --noEmit      → 0 error
npx vitest run        → 23 files / 308 tests passed
npx vite build        → ✓ built（JS 约 612 KB → gzip 约 193 KB，预算 250 KB 内）
node scripts/verify-catalog.mjs → 错误 0 / 警告 0（267 条）
release/PAINTLAB.exe  → HTTP 200（index / bundle / catalog），浏览器实测可交互
```

## A4. 本轮新增：辅料目录（4 品牌 / 4 产品线 / 11 SKU）

采购页顶部新增「**颜色 ｜ 辅料**」货架切换；辅料行的第二行固定为 `油性 · — · 辅助`（规格词表见 2.3.1），第三行显示**品牌 · 产品线**，行尾显示 **SKU 规格**（来自新增字段 `Paint.volumeMl`）。

| SKU | 中文名 | 容量 | 类型 | 来源 | 核验 |
|---|---|---|---|---|---|
| T-101 | 郡士 标准稀释剂 50 ml | 50 | 稀释剂（普通） | mrhobby-europe 商品页 | ✅ 已核对型号与容量 |
| T-102 | 郡士 标准稀释剂 110 ml | 110 | 稀释剂（普通） | 同上 | ✅ |
| T-103 | 郡士 标准稀释剂 250 ml | 250 | 稀释剂（普通） | 同上 | ✅ |
| T-104 | 郡士 标准稀释剂 400 ml | 400 | 稀释剂（普通） | 同上 | ✅ |
| T-105 | 郡士 缓干剂 40 ml | 40 | **缓干剂** | Mr. Hobby EU 稀释剂类目页 | ✅ |
| T-106 | 郡士 缓干型稀释剂 110 ml | 110 | 稀释剂（**缓干型** Leveling） | 同上 | ✅ |
| T-108 | 郡士 缓干型稀释剂 400 ml | 400 | 稀释剂（缓干型） | 同上 | ✅ |
| RC701 | AK Real Colors 稀释剂 200 ml | 200 | 稀释剂（普通） | 零售页观察 | ⚠ 待官方页复核 |
| 87077 | 田宫 硝基稀释剂 250 ml | 250 | 稀释剂（普通） | 常见零售目录 | ⚠ **待核验**（本次未取到官方页） |
| 87198 | 田宫 缓干型稀释剂 250 ml | 250 | 稀释剂（缓干型） | 常见零售目录 | ⚠ **待核验** |
| CT01 | 匠域 CT01 缓干型稀释剂 100 ml | 100 | 稀释剂（缓干型） | 零售页标题 | ⚠ **待核验**（容量待复核） |

**数据纪律**：未取到官方页的行不谎报，`verified=false` + `source` 字段写明「待核验」，界面照 3.2 显示 `⚠ 待核验` 徽标，悬停提示会带出来源说明。田宫/匠域的型号与容量请在有人工核验条件时按 6.7 SOP 回填。

## A5. 本轮修掉的两个真缺陷

1. **辅料被当成原浆**：库存里出现稀释剂后，调漆台「调漆原浆」把它列成可选的漆。已改为 `useMixableNeatRows()`（排除 `paintClass='aux'`），辅料只出现在「稀释剂来源」。回归用例：`tests/unit/features/mix-aux.test.tsx`。
2. **规格显示错位**：辅料按容量分 SKU，但行内规格读的是产品线默认值（110 ml），T-103 会被显示成 110 ml。已改为 `paint.volumeMl ?? line.defaultVolumeMl`，采购/仓库/调漆三处一致；入库弹层默认容量同样取 SKU 规格。

## A6. 已跑通的端到端链路（本轮实拍留证）

```
采购 · 辅料货架 → 郡士 → T-103 250 ml → 入库（默认容量自动取 250）
调漆台 → 新建/切换 15 ml 瓶 → 补满（C=15,R=0,N=2）→ 原浆 5.0 / 稀释剂 10.0 / 合计 15.0
      → 调漆 → 库存 260.0 → 245.0 ml，稀释剂来源 250.0 → 240.0 ml，瓶 15.0/15.0 ≈ 1（100%）
```

## A7. 已知缺口（接手先看这里）

| # | 缺口 | 影响 | 建议 |
|---|---|---|---|
| 1 | 田宫 / 匠域辅料的**型号与容量未获官方页确认** | 用户可能按错规格记账 | 按 6.7 SOP 人工核验后回填 `verifiedAt` 与 `sourceUrl` |
| 2 | 目录仍是 4 品牌 267 条，M7（郡士 GX/UG、匠域 MEKA、田宫 LP 全量、AK 全量）未做 | 品类覆盖不足 | 按品牌分 2 周一批补齐 |
| 3 | 自动快照（`snapshots`）未实现（规格 3.8 标 P1） | 无法一键回滚 | 设置页已显式标注「P1 未实现」+ 导出全量替代 |
| 4 | 跨页面拖拽未做（仓库卡 → 工作台 Tab 等） | 交互效率 | 已用行内菜单路径覆盖；移动端本就要求菜单路径（9.6） |
| 5 | Playwright E2E（7.3 八条）未接入 | 回归保护弱 | 现有 308 条单测 + 人工走查，建议补 e2e |
| 6 | ESLint 未接入（DoD 提到 lint 全绿） | 风格漂移 | 闸门暂为 tsc + vitest + build |
| 7 | 打包单 chunk 612 KB（gzip 193 KB，达标但触发 Vite 500 KB 提示） | 加载不并行 | 必要时加 `manualChunks` |
| 8 | 界面内品牌名仍是「PIGMENT DEPOT」 | 代号与显示的命名不一致 | 全域改名需要动 tokens/文案/图标，建议 1.1 统一做 |
| 9 | 改瓶容量后瓶名不跟着改（例如 60 ml 瓶实际容量 15 ml） | 轻微误导 | 可在 `updateBottleCapacity` 里同步默认名 |

## A8. 接手三步

```bash
cd paint-depot
npm install --ignore-scripts   # 沙箱里 esbuild 的 postinstall 会被拦；平台包已随可选依赖装好
npm run typecheck && npm test && npm run build
npm run launcher               # 重新产出 release/PAINTLAB.exe
```

**两个环境坑（都踩过，务必知道）**：
1. 构建前把 `TEMP`/`TMP` 指到**存在且可写**的目录（如 `$PWD/.tmpbuild`）。本机 MSYS2 的临时目录 ACL 会让 esbuild 报 `Access is denied`；`TEMP` 指到已删除目录还会让 `csc` 报 `CS0016 目录名无效`。
2. 验证产物请用 `vite preview` 或启动器 + **新端口**：PWA 的 Service Worker 会缓存旧 bundle，同一 origin 反复重建容易看到"改了没生效"的假象。

---

# B. 工程描述

## B1. 技术栈

Vite 5 · React 18 · TypeScript 5.6(strict) · Tailwind 3.4（令牌走 CSS 变量）· Zustand 4 · Dexie 4 · Zod 3 · @dnd-kit · Radix 原语 · Vitest + Testing Library。

## B2. 分层铁律

```
features → store → data → core      方向不可逆
```

- `src/core/**`：纯 TS，零 React / 零 Dexie。类型、Zod、稀释与液位算法、三档色块、I1–I8 不变量、分组三级规则、撤销栈。
- `src/data/**`：Dexie 表 + 仓储 + 目录包加载/归一化；所有写入走「补丁事务」并产出 Command。
- `src/store/**`：Zustand 切片（ui/settings/catalog/inventory/mix/workbench/history）+ `hydrateApp()`。
- `src/features/**`：五页，只消费 store 与展示组件。
- `src/components/**`：UI 原语、色卡原子（PaintRow/PaintTile/PaintSwatch/PaintMeta/StockBar）、瓶身 SVG。
- `src/app/**`：Shell / TopBar / SideNav / 路由。

## B3. 数据契约要点（本轮有增补）

```ts
interface Paint {
  id; lineId; brandId; code?; name; nameZh?;
  hex; paintClass: 'solid'|'clear'|'aux'; category; finish?;
  sourceUrl?;      // 规格/色值来源
  source?;         // ★ 新增：来源说明（辅料常写"待核验：…"）
  volumeMl?;       // ★ 新增：单件规格（辅料按容量分 SKU）；缺省沿用 PaintLine.defaultVolumeMl
  verifiedAt?;     // 为空 → 界面显示 ⚠ 待核验
  origin;
}
```

辅料的 `hex` 统一 `#ffffff`，实际渲染由 `swatchStyle` 按 `paintClass='aux'` 强制白底 70% 透明度（2.3），因此色值不携带语义。

## B4. 核心算法（都在 core，可单测）

- 稀释三模式：`fromNeat(A,N)` / `fromTotal(V,N)` / `toFill(C,R,N)`，结果一律 `floor1` 到 0.1 ml；溢出用 `checkOverflow` 给出「本次最多可加原浆 X ml（1:N）」。
- 液位：`levelFraction(R, baseline, C, mode)` → `quantizeLevel`（1/12 吸附）→ `liquidHeight`（×212px）→ `fractionLabel`（"2/3"）；`levelReading` 产出「≈ 2/3（67%）」。
- 色块：`swatchStyle(hex, cls)` 唯一实现——solid 1.0 / clear 0.4 / aux 白 0.7。
- 混色：`mixHex` 体积加权，clear 权重 ×0.5。
- 撤销：命令 = forward/inverse 补丁数组，一次 Dexie 事务应用；撤销后跑 `checkUndoPreconditions`，失败即回滚数据与指针。

## B5. 状态与不变量

库存条目单归属分组、分组 ≤3 层且 `child.depth = parent.depth + 1`、工作台 ≤5、`0 ≤ volumeMl ≤ initialMl`、`0 ≤ remaining ≤ baseline ≤ capacity`、比例 0–10、扣减必须原子写 `UsageRecord`、撤销栈深 3（可配 3–20）。

## B6. 测试策略

`tests/unit/core`（207 条）钉死数学与规则；`tests/unit/data` 钉死补丁事务、撤销回滚、目录归一化；`tests/unit/components` 钉死 AC-03/06/15；`tests/unit/features` 钉死五页交互（AC-07/08/09/10/11/12/13 等）。断言优先比对 core 的输出而不是页面自算值。

## B7. 桌面启动器（单文件 exe）

`npm run launcher` = `vite build` + `scripts/make-launcher.mjs`：

1. 把 `dist/` 每个文件作为**嵌入资源**编译进 C# 程序（`/resource:`），生成 1.1 MB 单文件；
2. 运行时用 `TcpListener` 在 `127.0.0.1:8787`（占用则顺延）手写 HTTP 响应服务这些资源；
3. 自动打开默认浏览器；
4. 关闭控制台窗口即停止服务。

为什么不用 Electron/Tauri：本机 Electron GUI 无法启动（裸 `electron.exe --version` 直接退出 3），Tauri 需要 Rust 工具链；而「启动器」只要 .NET Framework 4.x（Win10/11 自带），零安装、零联网。要原生窗口再评估 Electron/Tauri（规格 5.6 的 P1）。

**注意**：必须以 `/codepage:65001` 编译（源码 UTF-8），否则中文串在 exe 里变乱码；`TEMP` 必须指向存在的目录，否则 csc 报 CS0016。

## B8. 关键决策记录

| 决策 | 理由 |
|---|---|
| 辅料按容量拆 SKU（T-102/T-103/T-104 各一条） | 用户要"规格"这一层信息；一个产品多容量若合并会丢失库存粒度 |
| `Paint.volumeMl` 而非改 `PaintLine.defaultVolumeMl` | 产品线默认值仍服务色卡（10 ml），辅料容量是 SKU 级事实 |
| 采购新增「颜色/辅料」货架 | 辅料混在 267 条色卡里不可发现；分货架后搜索/筛选语义也更干净 |
| 辅料不进「调漆原浆」 | 稀释剂是配料，不是漆；混入会让用户拿稀释剂当漆记账 |
| 待核验数据如实标注、不虚构官方页 | 项目数据纪律（6.2）明确：不可核验的字段不写猜测值 |
| 数据库名保持 `pigment-depot` | 改名会让既有 IndexedDB 数据失联；代号变更只动工程侧命名 |
