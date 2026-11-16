# 首批漆料种子数据 / Seed Paint Catalog

`paint-catalog.seed.json` —— 256 条真实色卡，供 PIGMENT-DEPOT 初始化目录。

## 统计

| 品牌 | 产品线 | 条数 | 溶剂 |
|---|---|---|---|
| 郡士 GSI Creos | `gsi-mr-color`（Mr.Color C 系列） | 130 | 油性 |
| 匠域 Jumpwind | `jy-lacquer`（JW 系列） | 106 | 油性 |
| 田宫 Tamiya | `tamiya-lp`（LP 硝基漆） | 17 | 油性 |
| AK Interactive | `ak-real-colors`（Real Colors） | 3 | 油性 |
| **合计** | | **256** | |

漆类：实色 251 / 透明 5 ｜ 光泽：光泽 215、金属 20、消光 12、半光 4、透明 5
中文名：1 / 256 已填（仅匠域 MC97「制空蓝」，其余待补录）｜ 已核验：0 / 256（`verified` 全为 false）

## 许可与署名（保留本段）

主数据源为 **[afzafri/modkit-swatch](https://github.com/afzafri/modkit-swatch)**，采用 **MIT License**。

> Paint colour data derived from ModKit Swatch
> (https://github.com/afzafri/modkit-swatch), MIT License.
> Copyright (c) modkit-swatch contributors.

MIT 允许商业使用与修改，但**必须保留上述版权声明与许可文本**。请在应用的"关于"页与
`THIRD_PARTY_NOTICES.md` 中同步列出。

其中 3 条 AK 数据（`RC236` / `RC291` / `RC316`）来自 GK-Mixer 公开页面的观察记录，
仅作流程样本，`source` 字段已单独标注。**GK-Mixer 采用 PolyForm Noncommercial 1.0.0
许可，禁止批量搬运其数据集**，请勿用本文件以外的来源替换这 3 条。

## 色值可信度

`hex` 为社区测量值，**不是厂商官方色值**。上线前须按设计书 **6.7 色卡采集与核验 SOP**
抽样校验（每批随机 10 条，CIEDE2000 ΔE ≤ 3 判合格），通过后回填 `verified: true` 与
`verifiedAt`。

## 字段

```jsonc
{
  "id": "gsi-c1",              // brand + code 的 slug
  "brandId": "gsi",            // 对应 seed.brands[].id
  "lineId": "gsi-mr-color",    // 对应 seed.lines[].id（唯一键之一）
  "code": "C1",                // 厂商色号
  "name": "White",             // 英文/日文名
  "nameZh": null,              // 中文名，待补录
  "hex": "#ffffff",            // 色值（社区测量）
  "paintClass": "solid",       // solid | clear | aux
  "finish": "gloss",           // gloss | semiGloss | matte | metal | clear | ...
  "category": "color",
  "volumeMl": 10,
  "source": "modkit-swatch (MIT)",
  "verified": false
}
```

## 重新生成

色卡数据由设计书 **6.6 / 6.7** 定义的流程产生；重新生成前请先跑：

```bash
node scripts/verify-catalog.ts --file docs/seed/paint-catalog.seed.json
```
