import pkg from '../../../package.json';
import { isDesktop, platform } from '@/platform';
import { useAppStore } from '@/store';
import { Panel } from './controls';
import { ABOUT_NOTICES, MIT_NOTICE, SHORTCUT_ROWS } from './settingsData';

const APP_VERSION = typeof pkg.version === 'string' ? pkg.version : 'unknown';

/** 快捷键（spec 10.1） */
export function ShortcutsPanel() {
  return (
    <Panel
      id="shortcuts"
      code="//04"
      title="快捷键"
      description="键盘可完成全部关键操作；卡片聚焦时按 Space / Enter 打开详情与移动菜单。"
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-left text-text-3">
            <th className="py-1 pr-3 font-normal">快捷键</th>
            <th className="py-1 font-normal">动作</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUT_ROWS.map((row) => (
            <tr key={row.id} data-shortcut={row.id} className="border-b border-line text-text-2 last:border-b-0">
              <td className="t-readout whitespace-nowrap py-1.5 pr-3 align-top text-text-1">{row.combo}</td>
              <td className="py-1.5 leading-snug">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-snug text-text-3">
        macOS 上 Ctrl 对应 ⌘。全站可用 Tab 走遍控件，Esc 关闭弹层并取消选择。
      </p>
    </Panel>
  );
}

/** 关于：非官方声明、色值免责、素材声明、MIT 署名（spec 9.1 ③ / 9.4） */
export function AboutPanel() {
  const catalogVersion = useAppStore((state) => state.catalogVersion);

  return (
    <Panel
      id="about"
      code="//05"
      title="关于"
      description="非官方项目；色值为社区测量值；第三方数据许可与署名。"
    >
      <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-2">
        <div className="flex items-baseline gap-2">
          <dt className="ef-eyebrow">应用版本</dt>
          <dd className="ef-field text-text-1">v{APP_VERSION}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="ef-eyebrow">目录版本</dt>
          <dd className="ef-field text-text-1">{catalogVersion}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="ef-eyebrow">许可</dt>
          <dd className="ef-field text-text-1">MIT</dd>
        </div>
        {isDesktop() && (
          <div className="flex min-w-[280px] items-baseline gap-2">
            <dt className="ef-eyebrow shrink-0">数据目录</dt>
            <dd className="ef-field break-all text-[11px] text-text-1">{platform()?.dataPath}</dd>
          </div>
        )}
      </dl>

      <ul className="space-y-2.5">
        {ABOUT_NOTICES.map((notice) => (
          <li key={notice.id} data-notice={notice.id}>
            <p className="text-xs text-text-1">{notice.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-text-3">{notice.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <p className="t-label mb-1">MIT 署名（原文照抄 docs/seed/README.md）</p>
        <pre data-notice="mit" className="t-readout whitespace-pre-wrap break-all border border-line bg-bg-1 p-2 text-[11px] leading-relaxed text-text-2">
          {MIT_NOTICE}
        </pre>
        <p className="mt-1 text-[11px] leading-snug text-text-3">
          MIT 允许商业使用与修改，但必须保留上述版权声明与许可文本。
        </p>
      </div>
    </Panel>
  );
}
