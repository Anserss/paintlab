# PIGMENT DEPOT · 实现说明（Application Implementation）

设计包 `v1.3` 的可运行实现：Vite 5 + React 18 + TypeScript 5.6(strict) + Tailwind 3.4 + Zustand 4 + Dexie 4 + Zod 3。
本文件记录「已实现什么 / 怎么跑 / 验收怎么过 / 与规格的已知偏差」，设计依据仍是 `docs/漆料管理软件-项目设计描述书.md`。

## 快速开始

```bash
npm install --ignore-scripts   # 本机沙箱下 esbuild 的 postinstall 会被拦，平台包已随 optionalDependencies 安装
npm run dev                    # http://localhost:5175
npm run typecheck              # tsc --noEmit，期望 0 错
npm test                       # vitest run，21 文件 / 304 用例
npm run build                  # tsc --noEmit && vite build（PWA 壳）
npm run preview                # 预览产物
npm run verify:catalog         # 目录核验（设计包自带脚本）
```

## 分层（spec 5.2 铁律）

```
features → store → data → core        方向不可逆
```

| 层 | 目录 | 约束 |
|---|---|---|
| core | `src/core/**` | 纯 TS，零 React / 零 Dexie；类型、Zod、稀释与液位算法、三档色块、I1–I8 不变量、分组三级规则、撤销栈 |
| data | `src/data/**` | Dexie 表 + 仓储 + 目录包加载/归一化；所有写入走「补丁事务」并产出 Command |
| store | `src/store/**` | Zustand 切片（ui/settings/catalog/inventory/mix/station/history）；读模型 + 回执 |
| features | `src/features/**` | 五个页面，只消费 store 与展示组件 |
| components | `src/components/**` | UI 原语 + 色卡原子（PaintRow/PaintTile/PaintSwatch）+ 瓶身 SVG |
| app | `src/app/**` | Shell / TopBar / SideNav / 路由 |

## 已实现（M0–M6）

- **M0** 脚手架、`tokens.css`（4.2 全量令牌 + 浅色主题）、Shell（72px 导航 / 44px 状态栏 / 撤销计数 / 等宽时钟）。
- **M1** Dexie 表与仓储、目录包懒加载 + 归一化 + 校验、256 条种子数据可读、刷新不丢、撤销栈持久化。
- **M2** 采购大厅（纯文字品牌列表、搜索/筛选/排序、批量登记、入库弹层）、仓库三视图（品牌/色环 12×30°+5×12 矩阵/分组 ≤3 层）、详情抽屉、盘点调整。
- **M3** 调漆台：三模式稀释计算器（补满/指定原浆/反算目标）、BottleView（12 刻度、弯月面、空瓶态）、调配/使用/清空/归档事务、最近配方。
- **M4** 工位：≤5 工位、用量面板（滑块 + 预设 + 数字）、多选批量（记录用量/放回仓库/移出/转移）、产能估算。
- **M5** 撤销/反撤销 3+3：补丁层、命令持久化、不变量校验失败即回滚、回执带「撤销」。
- **M6** 设置（数据范围权限矩阵、白名单设置项、导出/导入/重置、存储占用、快捷键、关于与 MIT 署名）、PWA 离线壳、空状态与错误文案统一。

## 骨架级回补（评审与实测发现，已修）

| # | 缺陷 | 处理 |
|---|---|---|
| 1 | `undo/redo` 只刷新库存读模型，调漆瓶与工位脏读 | 统一 `refreshAllReadModels()`，undo/redo 成功与回滚两条路径都调用 |
| 2 | 删除条目、归档瓶后工位出现幽灵条目 | 同上统一入口 |
| 3 | 无改瓶容量接口（3.4.3 要求可切换） | 新增 `updateBottleCapacity`（校验 + 原文文案 + ledger + 可撤销） |
| 4 | 分组无排序写入 API（3.3 要求手动拖拽排序） | 新增 `reorderGroups({ parentId, orderedIds })`（同父校验 + 可撤销） |
| 5 | 深链接直进仓库/工位时品牌包未加载，条目解析不出 | 改为 `hydrateApp()` 在已有库存或工位时统一预热品牌包 |
| 6 | 浅色主题下顶部状态栏/回执/批量条仍是深底深字 | 新增 `--chrome-bg` 令牌随主题切换 |

## 验收（7.1 AC 与实测方式）

| AC | 内容 | 证据 |
|---|---|---|
| AC-01/02/03 | 稀释正算 / 补满 / 液位读数 | 单测 + 浏览器实测：1:2 下 A=10 → 合计 30.0、`基准=剩余=30.0`、读数`≈1`；使用 10 ml 后 `≈2/3` |
| AC-04 | 使用扣减不改 baseline | `tests/unit/features/mix.test.tsx` |
| AC-05 | 溢出拦截且库存不变 | 单测断言文案含 `45.5`、按钮 disabled、点击无副作用 |
| AC-06 | 三档透明度 1 / 0.4 / 0.7 | 组件单测 + 仓库/采购实拍 |
| AC-07 | 分组第 4 层拒绝 | `tests/unit/features/depot.test.tsx` + `tests/unit/core/groups.test.ts` |
| AC-08 | 5 工位后新建按钮禁用 | `tests/unit/features/station.test.tsx` |
| AC-09 | 放回仓库扣减用量 | 单测 + 浏览器实测：17.0 类算例等价（10.0 − 5.0 → 5.0/10.0 ml，工位条目清零） |
| AC-10/11/14 | 撤销 3+3 / 越界保护 / 刷新后仍可撤销 | 单测 + 浏览器实测撤销标签「放回仓库「喷涂台」×1」并成功回滚、重做重回 5.0 |
| AC-12 | 种子漆料色值只读 | 设置页与抽屉断言：字段为 `aria-readonly` 的 span，面板内 input 数为 0 |
| AC-13 | 空仓文案 | 实拍：`DEPOT // 空仓` + `[去采购]` |
| AC-15 | 中文属性行词表 | 组件与页面断言文本严格等于 `油性 · 光泽 · 实色` / `油性 · — · 辅助` |
| AC-16 | 品牌纯文字、无图标 | DOM 中 `<img>` 计数 0（单测断言） |
| AC-17 | 非油性拒收 / 同号异线不合并 | 由设计包的 `verify-catalog` 与导入校验覆盖（应用不做厂商数据导入） |

## 桌面启动器（单文件 exe）

```bash
npm run launcher      # = npm run build && node scripts/make-launcher.mjs
```

产物：`release/PIGMENT-DEPOT.exe`（约 1.1 MB，单文件）。双击即用：

1. 进程内起一个只监听 `127.0.0.1` 的静态服务（端口 8787 起，占用则顺延），把 `dist/` 全部文件编译期嵌入 exe；
2. 自动用默认浏览器打开 `http://127.0.0.1:8787/`；
3. 关闭那个控制台窗口即停止服务。

不需要安装 Node、不需要联网、不需要管理员权限（用 TcpListener 手写 HTTP 响应，避开 HttpListener 的 URL ACL 限制）。
运行前提只有 Windows 自带的 .NET Framework 4.x（Win10/11 默认存在）。
数据仍存在浏览器的 IndexedDB 里，按 origin（`127.0.0.1:8787`）隔离；换端口等于换一份数据，所以不要随意改端口。

已知限制：这是「启动器」而不是原生窗口应用——它用系统默认浏览器承载界面（要原生窗口得走 Electron/Tauri，属规格 5.6 的 P1，本包未做）。

## 已知缺口与偏差（均为声明项，不是隐藏缺陷）

1. **目录里没有 aux 类稀释剂**（`grep '"paintClass": "aux"' public/catalog` → 0），而默认 `trackThinner=true`。调漆台已给出三段式可行动提示 + 「本次不扣减稀释剂」一键出路，但**真实的稀释剂扣减流程需要先有稀释剂 SKU**（属设计包 M7 数据补齐范围，需有来源的色卡，不虚构）。
2. **自动快照（`snapshots`）未实现**：规格 3.8 将其列为 P1；数据层无快照仓储，设置页显式标注「P1 未实现」并提供「导出全量」替代。
3. **跨页面拖拽未实现**（仓库卡→工位 Tab 等）：拖拽只在页面内实现；跨页面用行内「加入工位 / 取用调漆」菜单路径，符合 9.6「移动端默认关闭拖拽、必须提供菜单路径」的要求。
4. **补满模式 C/R 只读**（取自瓶身），避免界面值与落库值分叉；3.4.2 的三模式公式本身完全按 `floor1` 实现。
5. **「规格待核验」徽标位置**：3.2 要求显示在规格处，当前由 `PaintRow.badges` 渲染在行尾动作区（信息完整、带 title）。
6. **ESLint 未接入**：DoD 提到 `lint` 全绿，当前闸门为 `tsc --noEmit` + `vitest` + `vite build`。
7. **Playwright E2E（7.3）未跑**：浏览器走查由人工驱动完成（截图见交付说明），e2e 目录留空待补。
8. 打包体积 **193.4 KB gzip**（预算 < 250 KB），单 chunk 612 KB 触发 Vite 的 500 KB 提示，未做 manualChunks 拆分。

## 目录

```
public/catalog/      目录包（4 个品牌，256 条）
scripts/             设计包自带：verify-catalog / build-catalog
src/core/            领域层（types/schemas/math/render/rules/history）
src/data/            db / repos / catalog
src/store/           切片 + hydrateApp
src/components/      ui / paint / bottle
src/features/        procure / depot / mix / station / settings
src/app/             Shell / TopBar / SideNav / App
tests/unit/          core 207 · data 21+ · components 15 · features 58
```