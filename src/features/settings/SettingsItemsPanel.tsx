import { useRef } from 'react';
import { revealTheme } from '@/app/motion';
import { Segmented } from '@/components/ui';
import type { Density, LevelMode, Settings, ThemeMode } from '@/core/model/types';
import { useAppStore } from '@/store';
import { NumberField, Panel, SettingRow, Switch } from './controls';
import { SETTING_LABELS, UNDO_DEPTH_MAX, UNDO_DEPTH_MIN, clampUndoDepth } from './settingsData';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'auto', label: '跟随系统' },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'comfy', label: '宽松' },
];

const LEVEL_MODE_OPTIONS: { value: LevelMode; label: string }[] = [
  { value: 'baseline', label: '上次调漆量' },
  { value: 'capacity', label: '瓶容量' },
];

const THEME_LABEL: Record<ThemeMode, string> = { dark: '深色', light: '浅色', auto: '跟随系统' };
const DENSITY_LABEL: Record<Density, string> = { compact: '紧凑', normal: '标准', comfy: '宽松' };
const LEVEL_MODE_LABEL: Record<LevelMode, string> = { baseline: '上次调漆量', capacity: '瓶容量' };

/** 设置项白名单（spec 3.9）：改完立即生效并回执，但不进撤销栈 */
export function SettingsItemsPanel() {
  const settings = useAppStore((state) => state.settings);
  const updateSetting = useAppStore((state) => state.updateSetting);
  const pushToast = useAppStore((state) => state.pushToast);
  const hydrateHistoryState = useAppStore((state) => state.hydrateHistoryState);
  const themeBoxRef = useRef<HTMLSpanElement | null>(null);

  const commit = async <K extends keyof Settings,>(key: K, value: Settings[K], display: string): Promise<void> => {
    const result = await updateSetting(key, value);
    if (!result.ok) return;
    pushToast({ message: '已更新「' + SETTING_LABELS[key] + '」→ ' + display, tone: 'ok' });
  };

  /** 主题从控件中心扩散揭开（2.3.0）；其余设置项直接生效 */
  const commitTheme = (value: ThemeMode): void => {
    const box = themeBoxRef.current?.getBoundingClientRect();
    const update = () => commit('theme', value, THEME_LABEL[value]);
    if (!box) {
      void update();
      return;
    }
    void revealTheme({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, update);
  };

  const commitUndoDepth = async (next: number): Promise<void> => {
    const depth = clampUndoDepth(next);
    await commit('undoDepth', depth, depth + ' 步');
    await hydrateHistoryState();
  };

  return (
    <Panel
      id="settings"
      code="//02"
      title="设置项（白名单）"
      description="改动立即生效并给出回执；设置项不进撤销栈（spec 3.6 不可撤销清单）。"
    >
      <h3 className="t-label mb-1">显示</h3>
      <SettingRow
        setting="theme"
        value={settings.theme}
        label="主题"
        hint="工业暗色为主；浅色只替换基底与文字层"
        control={
          <span ref={themeBoxRef} className="inline-flex">
            <Segmented
              options={THEME_OPTIONS}
              value={settings.theme}
              ariaLabel="主题"
              onChange={commitTheme}
            />
          </span>
        }
      />
      <SettingRow
        setting="density"
        value={settings.density}
        label="卡片密度"
        hint="列表行高与卡片间距"
        control={<Segmented options={DENSITY_OPTIONS} value={settings.density} ariaLabel="卡片密度" onChange={(value) => void commit('density', value, DENSITY_LABEL[value])} />}
      />
      <SettingRow
        setting="levelMode"
        value={settings.levelMode}
        label="液位分母"
        hint="默认按「本次产出后总量」读数"
        control={<Segmented options={LEVEL_MODE_OPTIONS} value={settings.levelMode} ariaLabel="液位分母" onChange={(value) => void commit('levelMode', value, LEVEL_MODE_LABEL[value])} />}
      />
      <SettingRow
        setting="showTicks"
        value={showTicksLabel(settings.showTicks)}
        label="瓶身刻度"
        hint="批次瓶身液位旁显示刻度线"
        control={<Switch checked={settings.showTicks} label="瓶身刻度" onChange={(checked) => void commit('showTicks', checked, checked ? '显示' : '隐藏')} />}
      />

      <h3 className="t-label mb-1 mt-5">调漆</h3>
      <SettingRow
        setting="trackThinner"
        value={showTicksLabel(settings.trackThinner)}
        label="扣减稀释剂库存"
        hint="调漆时同步扣减稀释剂 SKU 的余量"
        control={<Switch checked={settings.trackThinner} label="扣减稀释剂库存" onChange={(checked) => void commit('trackThinner', checked, checked ? '扣减' : '不扣减')} />}
      />
      <SettingRow
        setting="defaultRatio"
        value={settings.defaultRatio}
        label="默认稀释比例 N"
        hint="1:N，范围 0–10，步进 0.1"
        control={<NumberField label="默认稀释比例" value={settings.defaultRatio} min={0} max={10} step={0.1} precision={1} unit="N" onCommit={(value) => void commit('defaultRatio', value, '1:' + value.toFixed(1))} />}
      />
      <SettingRow
        setting="neatStockWarn"
        value={showTicksLabel(settings.neatStockWarn)}
        label="原浆低量警示"
        hint="原浆余量低于 15% 时标黄提醒"
        control={<Switch checked={settings.neatStockWarn} label="原浆低量警示" onChange={(checked) => void commit('neatStockWarn', checked, checked ? '开启' : '关闭')} />}
      />

      <h3 className="t-label mb-1 mt-5">工作台</h3>
      <SettingRow
        setting="mlPerKit"
        value={settings.mlPerKit}
        label="估算系数"
        hint="单个套件的预估耗漆量（0.5–10 ml）"
        control={<NumberField label="估算系数" value={settings.mlPerKit} min={0.5} max={10} step={0.1} precision={1} unit="ml/套" onCommit={(value) => void commit('mlPerKit', value, value.toFixed(1) + ' ml/套')} />}
      />

      <h3 className="t-label mb-1 mt-5">交互</h3>
      <SettingRow
        setting="undoDepth"
        value={settings.undoDepth}
        label="撤销深度"
        hint={'可配 ' + UNDO_DEPTH_MIN + '–' + UNDO_DEPTH_MAX + '，默认 ' + UNDO_DEPTH_MIN + '；越界输入会被钳制回区间内'}
        control={<NumberField label="撤销深度" value={settings.undoDepth} min={UNDO_DEPTH_MIN} max={UNDO_DEPTH_MAX} step={1} precision={0} unit="步" onCommit={(value) => void commitUndoDepth(value)} />}
      />
      <SettingRow
        setting="confirmDestructive"
        value={showTicksLabel(settings.confirmDestructive)}
        label="破坏性操作二次确认"
        hint="关闭后，删除分组 / 条目 / 清空瓶不再二次确认；重置数据始终要求手动输入 RESET"
        control={<Switch checked={settings.confirmDestructive} label="破坏性操作二次确认" onChange={(checked) => void commit('confirmDestructive', checked, checked ? '开启' : '关闭')} />}
      />

      <h3 className="t-label mb-1 mt-5">数据</h3>
      <SettingRow
        setting="catalogMirror"
        value={settings.catalogMirror}
        label="目录来源"
        hint="由目录加载决定（内置打包 / 自建镜像），当前版本固定为内置目录，不在界面开放修改"
        control={
          <span data-field="catalogMirror" aria-readonly="true" className="t-readout text-xs text-text-2">
            {settings.catalogMirror === 'bundled' ? 'bundled（内置）' : settings.catalogMirror}
          </span>
        }
      />
    </Panel>
  );
}

function showTicksLabel(value: boolean): string {
  return value ? '开启' : '关闭';
}
