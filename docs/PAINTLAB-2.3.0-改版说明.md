# PAINTLAB 2.3.0 · 改版说明

> 版本：`package.json` → `2.3.0`；`src/platform.ts` 兜底 → `2.3.0`；桌面壳 `desktop/electron/package.json` → `2.3.0`
> 基线：2.2.2（`paintlab/HANDOFF-2.2.2.md`）
> 本轮需求（2026-11-20 用户原话）：「@paintlab\HANDOFF-2.2.2.md /motion-web 使用这个 skill 按照 /endfield-ui 的风格添加适度动效，版本号为正式版 2.3.0」
> 生成时间：2026-11-20（Asia/Shanghai）

---

## 0. 一句话

**按终末地（`endfield-ui`）的动效清单，给 PAINTLAB 补上一层「短、硬、机械」的动效：打开应用三色条扫过 + 页面通电、换页斜切快门、深浅主题从按钮圆形揭幕、采购结果逐行亮起、弹层通电 / 详情抽屉推入、按钮亮边与按下缩 1.5%、状态条回执擦入擦出、主读数乱码后落定。所有动效都在 1 秒内结束、不循环；系统「减少动态效果」打开时全部关闭。版本号 2.3.0。**

## 1. 变体卡（2.3.0 更新）

```text
变体：标准（yellow / neutral / standard / grid / standard / full）
主视觉：采购大厅的色号货架 + 左栏品牌件数；动效只服务真实数据（色号 / 件数 / 库存 ml / 时钟）。
页面类型：采购 / 仓库 / 调漆台 / 工作台 = 控制台（大胆但要好用）；设置 = 阅读（安静）。
```

- 与 2.0–2.2.2 的差异只在一个维度：**motion 由 `calm` 改为 `full`**。
- 「full」在本项目里按 endfield 的数值执行：回应 100–400ms、单个入场 ≤ 650ms、整段入场 ≤ 1000ms；不做持续循环的装饰动画。
- 强调色（`#FFFA00`）、纸色、切角、底纹、密度不变——2.3.0 只动「怎么出现 / 怎么回应 / 怎么退出」。

## 2. 动效层

新增两个文件，职责分开：

| 文件 | 职责 |
|---|---|
| `src/styles/motion.css` | 所有 CSS 动效：关键帧、入场编排、按钮亮边、弹层 / 抽屉 / 状态条、加载条、换页与揭幕的伪元素规则 |
| `src/app/motion.ts` | CSS 做不了的三件事：换页快门、主题圆形揭幕、主读数落定；以及「减少动态效果 / 不支持 View Transitions」的回退 |

`src/main.tsx` 在 `texture.css` 之后引入 `motion.css`。`motion.css` 里写 `@tailwind components;` 再追加 `@layer components`（Tailwind 要求同一文件出现指令），工具类仍然可以覆盖组件动效。

### 2.1 新增 token（`src/styles/tokens.css`）

| token | 值 | 用在 |
|---|---|---|
| `--ef-dur-come` | 320ms | 逐行亮起 |
| `--ef-dur-power` | 520ms | 页面 / 列表通电 |
| `--ef-dur-sweep` | 600ms | 三色条扫过 |
| `--ef-dur-shutter` | 360ms | 换页快门 |
| `--ef-dur-edge` | 300ms | 按钮亮边扫过 |
| `--ef-dur-exit` | 180ms | 弹层退出（≈ 进入的 2/3） |
| `--ef-stagger-row` | 38ms | 行与行的错开 |
| `--ef-stagger-block` | 100ms | 大块内容的错开 |

曲线仍然只有三条：`--ef-snap`（出现）、`--ef-mech`（擦入 / 快门 / 所有退出）、`--ef-ease`（普通过渡）。`prefers-reduced-motion: reduce` 下这些时长全部归零，且 `motion.css` 里所有动画都只写在 `no-preference` 媒体查询内。

### 2.2 动效清单

| 动效 | 触发 | 时长 | 曲线 | 实现 |
|---|---|---|---|---|
| 三色条扫过 | 一次访问的第一页 | 600ms | ease | `.ef-tristrip.ef-in-sweep`（`ef-sweep`） |
| 页面通电 | 打开应用 | 520ms（延迟 120） | mech | `main.ef-page-boot`（`ef-power`，`animation-fill-mode: backwards`） |
| 逐行亮起 | 换品牌 / 换货架 / 换产品线 / 排序；工作台切 Tab | 320ms，每行晚 38ms | snap | `.ef-rows-enter` 前 14 个直接子元素（`ef-come`），总长 814ms |
| 列表 / 视图通电 | 仓库切换品牌 / 色环 / 分组 | 520ms（延迟 120） | mech | `RowList` 的 `.ef-in-power` |
| 换页快门 | 一级导航、数字键 1–5、跨页按钮 | 360ms | mech | View Transitions + `ef-shutter` |
| 深浅揭幕 | 命令栏主题按钮 / 设置页主题分段 | 240–600ms（约 3000px/s） | mech | View Transitions + WAAPI 圆形 `clip-path` |
| 按钮亮边 | 悬停 / 键盘聚焦按钮 | 300ms | mech | `.ef-btn::after`（3px 墨色亮边扫过） |
| 按下 | 点击按钮 | 100ms | — | `translateY(1px) scale(0.985)` |
| 弹层打开 | 打开任意对话框 | 280ms | mech | `.ef-dialog[data-state='open']`（`ef-dialog-in`，顶部展开） |
| 弹层关闭 | 关闭对话框 | 180ms | mech | `ef-dialog-out`（收向底边；Radix 等动画结束再卸载） |
| 遮罩 | 打开 / 关闭弹层 | 200 / 160ms | ease | `.ef-dialog__overlay` |
| 详情抽屉 | 仓库行「详情」 | 360ms | mech | `.ef-drawer`（从右推入） |
| 详情抽屉退出 | 关闭 / Esc | 240ms | mech | `.ef-drawer.is-closing`（推回右侧后卸载） |
| 状态条回执 | 任何回执 | 280ms 擦入 / 160ms 擦出 | mech | `.ef-status__message.ef-in-wipe / .ef-out-wipe` |
| 处理中 | 入库 / 稀释 / 调漆提交 | 静态 | — | `.ef-btn[aria-busy='true']` 铺 45° 斜线纹、暂停响应 |
| 未知进度加载 | 品牌包加载中 | 1.1s linear（元素移除即停） | linear | `.ef-scan` |
| 读数落定 | 打开应用 / 库存总量变化 | 420ms | — | `settleReadout()`：数字与拉丁字母逐位锁定 |

### 2.3 为什么是「适度」

- **每个动效对应一次操作或状态变化**：打开、换页、切品牌、开弹层、关抽屉、按钮、回执、数据到达。没有为了好看一直在动的背景。
- **唯一的循环是未知进度加载条**（endfield 明确允许的例外），且它随「正在加载品牌包…」一起被移除。
- **入场总长受控**：页面 120 + 520 = 640ms；最晚一行 13×38 + 320 = 814ms；都小于 1s。
- **不做**：弹跳 / 弹簧 / 果冻、文字逐字缩放、错误抖动、滚动触发的逐段淡入、视差背景、Material 涟漪。
- **不编造技术感**：落定的是真实库存读数，不是假坐标 / 二进制串。
- **减少动态效果**：CSS 动画不定义、JS 编排直接执行最终动作，内容和布局完全可见。

### 2.4 回退与兼容

- `motionAllowed()`：`prefers-reduced-motion: reduce` 或环境不支持 `matchMedia` 时为 false。
- `supportsViewTransition()`：没有 `document.startViewTransition` 时，换页 / 换主题直接执行，不补假动画（Firefox 当前没有 View Transitions；Electron 43 / Chrome / Edge 有）。
- `shutter()` / `revealTheme()` 用递增 serial 防止「上一场 finished 清掉下一场标记」。
- 测试环境（jsdom，`css: false`）没有 View Transitions，CSS 动画也不参与断言：单测只锁编排函数的回退路径和外壳类名。

## 3. 接入点

| 文件 | 改动 |
|---|---|
| `src/app/Shell.tsx` | 三色条加 `ef-in-sweep`；`main` 加 `ef-page-boot`；数字键 1–5 换页走 `shutter()` |
| `src/app/CommandBar.tsx` | 一级导航点击走快门（保留 Ctrl/Cmd/Shift/中键的浏览器默认行为；当前页不重播）；主题按钮从按钮中心 `revealTheme()` |
| `src/app/StatusBar.tsx` | 回执保留到退出动画结束（`MESSAGE_EXIT_MS = 160`）；库存总量单独包一层 `span` 做 `settleReadout()` |
| `src/app/motion.ts`（新增） | `motionAllowed` / `supportsViewTransition` / `shutter` / `revealTheme` / `settleReadout` |
| `src/app/useShutterNavigate.ts`（新增） | 同源换页统一走快门；仓库、工作台、Shell 共用 |
| `src/styles/motion.css`（新增） | 见 §2 |
| `src/styles/tokens.css` | 新增动效 token；减少动态效果时全部归零 |
| `src/main.tsx` | 引入 `motion.css` |
| `src/components/ui/Dialog.tsx` | Content 加 `ef-dialog`，Overlay 加 `ef-dialog__overlay`（Radix 用 `data-state` 驱动进出） |
| `src/components/ui/Segmented.tsx` | 分段按钮加 `data-seg`：不参与按钮亮边 / 按下缩放，保持「当前段墨底反白」的控件语义 |
| `src/features/procure/ProcurePage.tsx` | 结果区按 `brandId + kind + lineId + sort + loadedCount` 重建（搜索输入不重建）；列表加 `ef-rows-enter`；加载行加扫描条 |
| `src/features/workbench/WorkbenchPage.tsx` | 磁贴网格按当前工作台 id 重挂载 |
| `src/features/workbench/WorkbenchTileGrid.tsx` | 网格加 `ef-rows-enter`（切 Tab 时磁贴逐行亮起） |
| `src/features/depot/RowList.tsx` | 列表根加 `ef-in-power`（切视图 / 选筛选时通电） |
| `src/features/depot/BrandView / HueView / GroupView` | RowList 按当前选择重挂载，通电动画随之重播 |
| `src/features/depot/DepotPage.tsx` | 详情抽屉关闭：先 `is-closing` 240ms 再卸载；减少动态效果时立即卸载 |
| `src/features/depot/PaintDetail.tsx` | 根节点加 `ef-drawer` / `is-closing` |
| `src/features/procure/RegisterDialog.tsx`、`src/features/mix/DilutePanel.tsx`、`BlendPanel.tsx` | 提交按钮加 `aria-busy`（处理中铺斜线纹） |
| `src/features/settings/SettingsItemsPanel.tsx` | 设置页主题分段也从控件中心做圆形揭幕 |
| `src/store/slices/catalog.ts` | 顺带修：品牌包加载不再覆盖 index 顺序（见 §4） |

## 4. 顺带修复：品牌包加载导致左栏重排

- **现象**：点一个品牌（例如田宫），左栏品牌顺序会变——田宫跳到队尾，再点另一个又变一次。
- **原因**：`index.json` 只给数组顺序，`loadCatalog` 把它转成 `sort = 0…6`；品牌包里的 `brand.sort` 是 `10…70`。`ensureBrand` 加载品牌包时 `mergeBrands` 用品牌包的 `sort` 覆盖了 index 的 `sort`，排序值混用两种量纲。
- **修法**：`mergeBrands` 对已见过的品牌保留第一次的 `sort`，只合并元数据（名称 / 别名 / 颜色 / 国家）。
- **为什么放在 2.3.0**：2.3.0 让「换品牌 → 结果逐行亮起」成为主要动效，左栏在同时重排会让整页看起来在抽搐；不修的话动效反而放大原有缺陷。
- **测试**：`tests/unit/data/brand-order.test.ts`（2 条）：加载 index 后顺序为 `gsi/jy/gaia/tamiya/hobbymio/sunin7/qnc`；连续懒加载 `tamiya`、`gsi/gaia/jy` 后顺序不变，且品牌包元数据仍合并进来。

## 5. 版本号与目录版本

- 应用版本三处同步到 **2.3.0**：`package.json`、`src/platform.ts` 兜底、`desktop/electron/package.json`。
- `public/catalog/*.json` 的 `version` / `catalogVersion` **仍为 2.2.2**：2.3.0 没有改目录数据，重建目录只会改 `generatedAt` 并让 411 条目录断言重新对时；目录版本与应用版本不是同一条线。
- 版本号规则继续有效：未经用户明确指示不得改版本（本轮是用户明确要求 2.3.0）。

## 6. 测试与验收（2026-11-20）

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | **38 文件 / 422 用例通过**（2.2.2 为 35 / 411） |
| `npm run build:desktop` | 成功；CSS 38.83 kB / JS 666.14 kB（gzip 210.12 kB） |
| `npm run verify:motion` | **24 / 24 通过**（需要先 `npm run dev`，Playwright 驱动真实点击 / 键盘 / 滚轮） |
| `npm run desktop` | **已执行**：安装 2.3.0（`version.txt` / app package / 角标一致；`resources/app/dist` 与仓库构建产物 SHA256 一致），并用 Explorer 实机启动验证（7 品牌 1038 条、真实数据已加载；截图 `reports/shots/2-3-0-desktop-installed.png`） |

新增用例：

- `tests/unit/app/motion.test.ts`（6 条）：减少动态效果判定；不支持 View Transitions 时 `shutter` / `revealTheme` 直接执行；支持时进入 `startViewTransition` 并在 `finished` 后清理 `data-ef-vt`；`settleReadout` 在减少动态效果时不动文本，在可用时经历乱码态后落定回真实读数并移除临时 `aria-label`。
- `tests/unit/app/status-bar.test.tsx`（2 条）：回执擦入后保留、清空时先进入 `ef-out-wipe` 退出态；减少动态效果时清空立即卸载，不保留退出帧。
- `tests/unit/data/brand-order.test.ts`（2 条）：见 §4。
- `tests/unit/data/shell.test.tsx`：新增一条，锁住 `ef-tristrip.ef-in-sweep` 与 `main.ef-page-boot` 挂在正确的外壳元素上。

`npm run verify:motion` 覆盖（真实浏览器，不是 jsdom）：

1. 版本角标 2.3.0；外壳动效类挂载；
2. 打开应用动画事件：`ef-sweep` + `ef-power` + `ef-come` + `ef-scan`；
3. 状态条主读数落定（DOM 上出现临时 `aria-label`）；
4. 换品牌：结果逐行亮起（`ef-come`）；
5. 按钮悬停：`ef-edge`；
6. 深浅切换：`theme` View Transition、`data-ef-vt` 清理、深色截图；
7. 换页：`page` View Transition、快门 `ef-shutter`、`data-ef-vt` 清理；
8. 弹层：`ef-dialog-in` / 关闭保留 ≥ 120ms / `ef-dialog-out`；
9. 状态条回执：`ef-wipe-in` → 4.2s 后 `ef-wipe-out` → 卸载；
10. 详情抽屉：`ef-drawer-in` → 关闭 `is-closing` → 退出后卸载；
11. 减少动态效果：不跑入场动画、行 / 页面 `clip-path: none`、内容完整；
12. 手机 390 宽：文档无横向溢出；
13. 全程无 console error / pageerror。

截图（`reports/shots/`，已 gitignore）：`2-3-0-procure-loaded.png`、`2-3-0-rows-enter-mid.png`、`2-3-0-theme-reveal.png`、`2-3-0-dark.png`、`2-3-0-dialog.png`、`2-3-0-drawer.png`、`2-3-0-reduced-motion.png`、`2-3-0-mobile-390.png`。

## 7. 文件清单

新增：

```
src/styles/motion.css            动效层（CSS）
src/app/motion.ts                快门 / 揭幕 / 读数落定 / 回退
src/app/useShutterNavigate.ts    同源换页统一走快门
scripts/verify-motion.mjs        真实浏览器动效验收（24 项）
tests/unit/app/motion.test.ts    6 条
tests/unit/app/status-bar.test.tsx  2 条
tests/unit/data/brand-order.test.ts  2 条
```

改动：见 §3 表格；另有 `package.json`（版本 + `verify:motion` 脚本）、`desktop/electron/package.json`、`README.md`、`IMPLEMENTATION.md`、`tests/unit/data/shell.test.tsx`。

## 8. 已知限制 / 注意

1. **View Transitions 需要 Chromium 111+**：Electron 43 / Chrome / Edge 有；Firefox 没有 → 换页和主题切换直接完成，不补别的动画（内容不受影响）。
2. **浏览器窄屏仍是 2.0 的桌面布局**：本项目定位桌面应用（窗口最小 1120×720）。390 宽下文档没有横向滚动，但左栏 + 工具栏会裁切；本轮没有做移动端版式。
3. **读数落定只用于状态条库存总量**：搜索框 / 过滤器的计数不做，避免打字时数字乱跳；若以后想扩，只给「池级摘要」，不要给每行。
4. **动效依赖 `@tailwind components` 指令**：`motion.css` 里必须保留，否则 Tailwind 会报「`@layer components` 无匹配指令」；如果以后把动效并进 `base.css`，可以删掉这条指令。
5. **测试环境没有 View Transitions**：`shutter` / `revealTheme` 在 jsdom 里走「直接执行」分支；动画本身靠 `verify:motion` 在真实浏览器里验。
6. **快速连续换页**：用 serial 保证上一场的 `finished` 不清掉下一场的 `data-ef-vt`；但如果浏览器直接取消了前一场，前一场的 `finished` 会 reject，回调仍会触发清理，不会留下死标记。
7. **安装版窗口在 150% 缩放下右侧被裁（旧问题）**：本机 1707×960 / DPI 144，Electron 渲染视口比窗口客户区宽——工具栏第二行、行尾「+入库」、状态条右侧看不到；同尺寸 Playwright（Chromium）截图完整，2.2.2 安装版截图同样被裁，**不是 2.3.0 动效引入**。下一轮单独查 `desktop/electron/main.cjs` 的窗口尺寸 / DPI，非最大化 1280×800 可暂时绕开。

## 9. 常用命令

```powershell
cd H:\AI\DEEPSEEK\harmess\paint-depot

# 开发 / 验收
npm run dev                    # http://localhost:5175
npm run verify:motion          # 另开一个终端，动效 24 项验收
npx tsc --noEmit
npx vitest run

# 桌面构建（TEMP 指到项目内，避免 esbuild 清理临时文件被拒）
$env:TEMP="H:\AI\DEEPSEEK\harmess\paint-depot\.tmpbuild"; $env:TMP=$env:TEMP
npm run build:desktop
```
