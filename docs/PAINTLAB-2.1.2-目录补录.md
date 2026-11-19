# PAINTLAB 2.1.2 · 漆料目录补录（郡士 CL 系列）

> 版本：`package.json` → `2.1.2`
> 触发：2.1.1 遗留项「联网搜索补充郡士 CL 系列漆」。2.1.1 当时断网，本版在外网恢复后按官方来源补录。

---

## 1. 结论

**郡士 CL 系列 = Mr.カラー LASCIVUS（ラスキウス）系列**，官方分为两支，共 **20 个 SKU**：

| 产品线（seed id） | 官方名 | 条数 | 用途 | 容量 |
|---|---|---|---|---|
| `gsi-lascivus` | Mr.COLOR LASCIVUS (CL) | 9（CL01~09） | 角色肌肤底色 / 罩染 / 珍珠罩光 | 10 / 18 ml |
| `gsi-lascivus-aura` | Mr.COLOR LASCIVUS AURA (CL1xx) | 11（CL101~111） | 发色 | 10 ml |

## 2. 官方来源

- 系列页（CL01~09）：<https://www.mr-hobby.com/ja/products/detail/5>
- 系列页（CL101~111）：<https://www.mr-hobby.com/ja/products/detail/6>
- 官方色卡图（页面「ラインナップ」下载图，2026-11-18 抓取）：
  - CL01~09：`uploads/products/color_lineup/01JHHMC88BHMG59SKE1KAVJ4K1.jpg`
  - CL101~111：`uploads/products/color_lineup/01JHHMEYN8ESGP9VJKVCHR8S60.jpg`

型号 / 系列 / 容量 / 光泽来自产品页；**色值来自官方色卡图取样**（取样脚本见 `docs/seed/paint-catalog.extra.json` 的 note），因此仍写 `hexEstimated: true`，界面显示「≈ 推定色」，不谎称已按色卡核验。

## 3. 条目清单

### CL01~09 · LASCIVUS 肤色

| 色号 | 原名 | 中文名 | 类别 | 体积 | 取样色值 |
|---|---|---|---|---|---|
| CL01 | ホワイトピーチ | 白桃色 | 实色·光泽 | 18 ml | `#fbd7bd` |
| CL02 | ココアミルク | 可可奶色 | 实色·光泽 | 18 ml | `#a97f71` |
| CL03 | クリアベールレッド | 清透罩染红 | 透明·光泽 | 10 ml | `#fadbd4` |
| CL04 | クリアベールオレンジ | 清透罩染橙 | 透明·光泽 | 10 ml | `#fbdbb2` |
| CL05 | クリアベールブラウン | 清透罩染棕 | 透明·光泽 | 10 ml | `#f6b480` |
| CL06 | クリアホワイト | 清透白 | 透明·光泽 | 18 ml | `#ffffff` |
| CL07 | 鴇羽色（ときいろ） | 鴇羽色 | 实色·光泽 | 18 ml | `#f7bcb4` |
| CL08 | ナッツホワイト | 坚果白 | 实色·光泽 | 18 ml | `#fffcf7` |
| CL09 | スムースパールコート | 平滑珍珠罩光 | 透明·珍珠 | 18 ml | `#ffffff` |

### CL101~111 · LASCIVUS AURA 发色

| 色号 | 原名 | 中文名 | 取样色值 |
|---|---|---|---|
| CL101 | ブロンド | 金发色 | `#f3f298` |
| CL102 | 栗毛色 | 栗色 | `#c4532b` |
| CL103 | 濡烏（ぬれがらす） | 濡乌色 | `#3c3c3e` |
| CL104 | ピンクパープル | 粉紫 | `#e799c0` |
| CL105 | ライラック | 丁香紫 | `#c9a0ca` |
| CL106 | 白雪色 | 雪白 | `#ffffff` |
| CL107 | 亜麻色 | 亚麻色 | `#aba692` |
| CL108 | 浅葱色 | 浅葱色 | `#009fad` |
| CL109 | ライムグリーン | 青柠绿 | `#9ccb61` |
| CL110 | 緋色 | 绯红 | `#e82663` |
| CL111 | 空色 | 天空蓝 | `#6ec2ee` |

**未收录**（不是液体漆，不进漆料目录）：`CLC101-103 LASCIVUS Decor`（フィギュア用ウェットタイプパウダー，粉状）与 `LDL01-03 ラスキウス・デコライナー`（粉彩笔）；两者均为人物/手办用粉末类产品，与 `Paint`（瓶装漆）模型不匹配，避免污染库存单位。

## 4. 管线改动

CSV 管线（`paintlab/郡士_匠域_油性漆_合并.csv`，617 行）里没有 CL 系列，且 CSV 无法表达「色卡取样色值」。为避免手改生成物，新增**手补目录**机制：

```
docs/seed/paint-catalog.extra.json     # 手补条目（自带 hex / 来源 / 容量）
        ↓ merge
scripts/import-paintlab.mjs            # CSV 生成 seed 后合并手补（按 id 去重）
        ↓
docs/seed/paint-catalog.seed.json      # 637 条 / 36 条产品线
        ↓ verify-catalog + build-catalog
public/catalog/{gsi,jy}.json           # gsi 468 / jy 169
```

- 用法：`node scripts/import-paintlab.mjs`（默认读 extra）；`--extra <file>` 换文件；`--no-extra` 跳过。
- 同时修掉一个重跑陷阱：旧目录复用色值时会**保留 `hexEstimated` 标记**（否则重跑导入会把 465 条「推定色」洗成「已核验色」）。

## 5. 验证

| 项 | 结果 |
|---|---|
| `node scripts/import-paintlab.mjs` | 637 条 / 36 产品线；solid 546 · clear 60 · aux 31；色值：复用 121 + 推定 485 |
| `npm run check`（verify + build） | **通过**；gsi 468 / jy 169；`public/catalog/gsi.json` 含 20 条 CL |
| `npx tsc --noEmit` | 0 错 |
| `npx vitest run` | 30 文件 / 362 用例通过 |
| `npm run desktop` | 安装版 2.1.2；采购页「郡士」下可见「肤色系列 (CL)」「发色系列 (CL1xx)」，搜索 `CL01` / `CL101` 可入库 |

## 6. 后续可做

1. 官方色卡图是屏幕取样，若要更准可对实物色卡比色后回填 `hex` 并去掉 `hexEstimated`。
2. `CLC / LDL` 粉末类若要管理，建议另建「辅材/粉末」模型，不要塞进 `Paint`。
3. 其他 LASCIVUS 姊妹品（如 `XUC` 奥特曼色）如需要可按同一 extra 机制补录。
