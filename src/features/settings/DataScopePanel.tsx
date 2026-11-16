import { Panel } from './controls';
import {
  DATA_PARTITIONS,
  FIELD_PERMISSIONS,
  QUOTA_ROWS,
  UNDO_DEPTH_MAX,
  UNDO_DEPTH_MIN,
} from './settingsData';
import type { FieldSource } from './settingsData';

const SOURCE_LABEL: Record<FieldSource, string> = {
  catalog: 'catalog（随版本发布）',
  user: 'user',
  custom: 'custom',
  'derived+user': 'derived + user',
  derived: 'derived（系统计算）',
  system: 'system',
};

/** 数据范围 + 字段级权限（spec 3.7，同时满足 AC-12 口径） */
export function DataScopePanel() {
  const writable = FIELD_PERMISSIONS.filter((row) => row.writable);
  const readOnly = FIELD_PERMISSIONS.filter((row) => !row.writable);

  return (
    <Panel
      id="data-scope"
      code="//01"
      title="数据范围与字段级权限"
      description="系统让你写到什么程度、写到哪一层：目录只读，用户数据可写，派生数据只能经由业务动作改变。"
    >
      <h3 className="t-label mb-1">数据分区（3.7.1）</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-left text-text-3">
              <th className="py-1 pr-3 font-normal">分区</th>
              <th className="py-1 pr-3 font-normal">归属</th>
              <th className="py-1 pr-3 font-normal">可写性</th>
              <th className="py-1 font-normal">说明</th>
            </tr>
          </thead>
          <tbody>
            {DATA_PARTITIONS.map((row) => (
              <tr key={row.key} data-partition={row.key} className="border-b border-line text-text-2 last:border-b-0">
                <td className="py-1.5 pr-3 font-mono text-[11px] text-text-1">{row.name}</td>
                <td className="py-1.5 pr-3">{row.owner}</td>
                <td className="py-1.5 pr-3">{row.writable}</td>
                <td className="py-1.5 leading-snug">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="t-label mb-1 mt-5">字段级写入权限（3.7.2）</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-left text-text-3">
              <th className="py-1 pr-3 font-normal">实体.字段</th>
              <th className="py-1 pr-3 font-normal">可写</th>
              <th className="py-1 pr-3 font-normal">来源</th>
              <th className="py-1 font-normal">校验 / 备注</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_PERMISSIONS.map((row) => (
              <tr
                key={row.id}
                data-permission={row.id}
                data-writable={row.writable ? 'true' : 'false'}
                className="border-b border-line text-text-2 last:border-b-0"
              >
                <td className="py-1.5 pr-3 align-top">
                  <span
                    data-field={row.id}
                    aria-readonly={row.writable ? undefined : 'true'}
                    className={row.writable ? 'text-text-1' : 'font-mono text-[11px] text-text-3'}
                  >
                    {row.field}
                  </span>
                </td>
                <td className="py-1.5 pr-3 align-top">{row.writable ? '✓' : '✕'}</td>
                <td className="py-1.5 pr-3 align-top">{SOURCE_LABEL[row.source]}</td>
                <td className="py-1.5 align-top leading-snug">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p data-note="readonly-fields" className="mt-2 text-[11px] leading-snug text-text-3">
        目录字段（品牌名 / 规格 / 色值 / sourceUrl / verifiedAt）在本页一律渲染为只读文本并标注 aria-readonly，
        DOM 里不是 input、select 或 textarea —— 共 {readOnly.length} 项只读、{writable.length} 项可写。
        需要目录外的颜色请使用 custom 命名空间的自定义漆料（用户自带色值，不覆盖 catalog）。
      </p>

      <h3 className="t-label mb-1 mt-5">用户可写字段（白名单）</h3>
      <ul className="grid gap-1 text-xs text-text-2 sm:grid-cols-2">
        {writable.map((row) => (
          <li key={row.id} data-writable-field={row.id} className="leading-snug">
            <span className="text-ok">✓</span> {row.field}
            <span className="text-text-3"> — {row.note}</span>
          </li>
        ))}
      </ul>

      <h3 className="t-label mb-1 mt-5">配额与上限（3.7.3）</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-left text-text-3">
              <th className="py-1 pr-3 font-normal">项</th>
              <th className="py-1 pr-3 font-normal">上限</th>
              <th className="py-1 font-normal">达到时</th>
            </tr>
          </thead>
          <tbody>
            {QUOTA_ROWS.map((row) => (
              <tr key={row.id} data-quota={row.id} className="border-b border-line text-text-2 last:border-b-0">
                <td className="py-1.5 pr-3">{row.item}</td>
                <td className="py-1.5 pr-3 text-text-1">{row.limit}</td>
                <td className="py-1.5 leading-snug">{row.atLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-text-3">
        撤销深度可在 {UNDO_DEPTH_MIN}–{UNDO_DEPTH_MAX} 之间调整（默认 {UNDO_DEPTH_MIN}）；每次写入都走 Zod
        校验并追加 ledger，任何显示数值都能回溯到账本记录。
      </p>
    </Panel>
  );
}
