# PAINTLAB 1.0 · 漆料资产与调漆工作台

> 工程代号 **PAINTLAB**（前身：PIGMENT DEPOT 设计包 v1.3）。
> 交班要点与工程描述：`docs/PAINTLAB-1.0-交班总结与工程描述.md`；分层与脚本速查：`IMPLEMENTATION.md`。
> 单文件启动器：`release/PAINTLAB.exe`（`npm run launcher` 重建）。

---
面向模型涂装玩家的**漆料资产与调漆工作台**：采购登记 → 仓库管理 → 稀释调配 → 工位使用，
本地优先、离线可用，视觉走「明日方舟式工业实用主义 × 包豪斯构成」。

本包 = **一份可执行的设计说明书 + 一份真实的 256 条色卡数据 + 两个跑得通的零依赖脚本**。

---

## 包内结构

```
PIGMENT-DEPOT-v1.3/
├─ README.md                        # 本文件
├─ package.json                     # npm scripts（可选，直接 node 也能跑）
├─ MANIFEST.txt                     # 文件清单 + SHA256
├─ docs/
│  ├─ 漆料管理软件-项目设计描述书.md      # 主交付物，v1.3，2000 行
│  └─ seed/
│     ├─ paint-catalog.seed.json     # 256 条真实色卡（郡士/匠域/田宫/AK）
│     └─ README.md                  # 数据字段说明 + MIT 署名
├─ scripts/
│  ├─ verify-catalog.mjs            # 目录核验：6 类检查 + 待办 CSV + 退出码
│  └─ build-catalog.mjs             # seed → 运行时品牌包
├─ public/catalog/                  # 已构建产物，可直接被前端 fetch
│  ├─ index.json                    # 品牌索引
│  ├─ gsi.json / jy.json / tamiya.json / ak.json
└─ reports/
   └─ catalog-todo.csv              # 511 行待办（缺中文名 / 未核验）
```

## 快速开始

需要 Node.js ≥ 18（开发时为 v24）。

```bash
# 核验数据（0 错误 0 警告才算过）
node scripts/verify-catalog.mjs --file docs/seed/paint-catalog.seed.json --out reports/catalog-todo.csv

# 重新构建品牌包
node scripts/build-catalog.mjs --file docs/seed/paint-catalog.seed.json --out public/catalog
```

或：

```bash
npm run verify:catalog
npm run build:catalog
```

## 数据实况

| 品牌 | 产品线 | 条数 | 规格 | 溶剂 |
|---|---|---|---|---|
| 郡士 GSI Creos | Mr.Color（C 系列） | 130 | 10 ml | 油性 |
| 匠域 Jumpwind | JW（含 MC 系列） | 106 | 10 ml | 油性 |
| 田宫 Tamiya | LP 硝基漆 | 17 | 10 ml | 油性 |
| AK Interactive | Real Colors | 3 | 10 ml | 油性 |
| **合计** | | **256** | | |

- 漆类：实色 251 / 透明 5
- 光泽：光泽 215、金属 20、消光 12、半光 4、透明 5
- 中文名：1 / 256（仅匠域 MC97「制空蓝」）
- 已核验：0 / 256（`verified` 全为 false）

**重要结论**：田宫 `X-` / `XF-` 属**水性丙烯**（源数据 `type=acrylic`，94 条已排除），
田宫油性本批只有 `LP-`。详见设计书 6.3。

## 许可与署名

主数据源 **[afzafri/modkit-swatch](https://github.com/afzafri/modkit-swatch)**，**MIT License**：
保留其版权声明与许可文本即可用于商业项目。3 条 AK 数据为公开页面观察样本，已在
`source` 字段单独标注。**不要把 GK-Mixer（PolyForm Noncommercial）的数据集搬进来。**

## 已知缺口

1. 中文名 255 条待补 → 影响色卡第二行的「中文优先」显示。
2. 田宫 LP 仅 17 条、AK 仅 3 条 → 需按设计书 6.7 的 SOP 补齐。
3. `verified` 全为 false → 色值需抽样校验（每批 10 条，ΔE ≤ 3）。
4. 应用本体尚未开始：设计书 8.2 有 14 张可直接执行的任务卡，M0–M6 约 23 人日。