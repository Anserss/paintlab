import type { BatchPart, StockItem } from '../model/types';

/**
 * 2.2 配方签名（同配方自动合并的唯一判定）：
 * - 同一件调漆产物 / 稀释漆料被反复产出时，只要「组分身份 + 稀释状态 + 比例 + 体积占比」一致，
 *   就视为同一配方，入库时把容量加到一起，仓库里始终只显示一个瓶。
 * - 签名只看比例（归一到 4 位小数），不看批次大小：10+10 与 20+20 都是 1:1。
 * - 调漆产物作为别的调漆的组分时，组分会带 sourceKey（来源本身的签名），
 *   避免两瓶混合漆恰好以同一支原浆打底而被误判成同一种料。
 */

const SHARE_DIGITS = 4;

/** 比例归一：去掉末尾 0，保证 0.5 / 0.50 一致 */
function shareText(ml: number, total: number): string {
  if (!(total > 0)) return '0';
  const text = (ml / total).toFixed(SHARE_DIGITS);
  return text.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

/** 比例数值的稳定文本（1:2 与 1:2.0 一致） */
function ratioText(ratioN: number | undefined): string {
  if (typeof ratioN !== 'number' || !Number.isFinite(ratioN)) return '-';
  return String(Math.round(ratioN * 1000) / 1000).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** 单个组分在签名里的身份：优先用来源签名（调漆产物 / 已稀释漆料），否则用目录漆料 id */
export function formulaPartIdentity(part: Pick<BatchPart, 'paintId' | 'sourceKey'>): string {
  return part.sourceKey && part.sourceKey.length > 0 ? part.sourceKey : part.paintId;
}

/** FNV-1a 32 位：嵌套配方签名过长时压成短键（同输入必同输出） */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 组分快照 → 配方签名；没有可比较的组分或总量为 0 时返回 null（不参与合并） */
export function formulaKeyOfParts(parts: readonly BatchPart[] | undefined | null): string | null {
  if (!parts || parts.length === 0) return null;
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.ml), 0);
  if (!(total > 0)) return null;
  const tokens = parts.map((part) =>
    [
      part.aux ? 'a' : part.dilute ? 'd' : 'p',
      formulaPartIdentity(part),
      part.state,
      part.state === 'thinned' ? ratioText(part.ratioN) : '-',
      shareText(Math.max(0, part.ml), total),
    ].join(':'),
  );
  tokens.sort();
  const full = 'f:' + tokens.join('|');
  // schema 上限 640；嵌套调漆签名可能很长，超长时用稳定哈希，避免写库失败
  return full.length <= 520 ? full : 'f#' + fnv1aHex(full);
}

/**
 * 仓库条目的配方签名：新数据直接读 mixKey；2.1.x 入库的旧条目按 parts 现算；
 * 再退化到「原浆 + 稀释比例」，保证新旧稀释漆料也能合并。
 */
export function stockFormulaKey(
  item: Pick<
    StockItem,
    'mixKey' | 'parts' | 'paintId' | 'dilutionRatioN' | 'state' | 'ratioN'
  >,
): string | null {
  if (item.mixKey) return item.mixKey;
  const fromParts = formulaKeyOfParts(item.parts);
  if (fromParts) return fromParts;
  const ratio =
    typeof item.dilutionRatioN === 'number' && item.dilutionRatioN > 0
      ? item.dilutionRatioN
      : item.state === 'thinned' && typeof item.ratioN === 'number' && item.ratioN > 0
        ? item.ratioN
        : null;
  if (ratio !== null) {
    return 'p:' + item.paintId + '@' + ratioText(ratio);
  }
  return 'p:' + item.paintId;
}

/** 组分快照的合并键：同身份 + 同状态 + 同比例（不算体积） */
export function formulaPartKey(part: BatchPart): string {
  return [
    part.aux ? 'a' : part.dilute ? 'd' : 'p',
    formulaPartIdentity(part),
    part.state,
    part.state === 'thinned' ? ratioText(part.ratioN) : '-',
  ].join(':');
}

/** 同配方合并时把两份组分快照的 ml 相加（保持目标条目的顺序） */
export function mergeFormulaParts(
  target: readonly BatchPart[] | undefined,
  incoming: readonly BatchPart[] | undefined,
): BatchPart[] | undefined {
  if (!incoming || incoming.length === 0) return target ? target.map((part) => ({ ...part })) : undefined;
  if (!target || target.length === 0) return incoming.map((part) => ({ ...part }));
  const merged = target.map((part) => ({ ...part }));
  const index = new Map(merged.map((part, position) => [formulaPartKey(part), position]));
  for (const part of incoming) {
    const position = index.get(formulaPartKey(part));
    if (position === undefined) {
      merged.push({ ...part });
      index.set(formulaPartKey(part), merged.length - 1);
      continue;
    }
    merged[position] = { ...merged[position], ml: Math.round((merged[position].ml + part.ml) * 10) / 10 };
  }
  return merged;
}

const MAX_LABEL = 80;

/** 配方的人话说明（详情 / 最近产出用）：截断到 schema 上限 */
export function formulaLabel(parts: readonly BatchPart[] | undefined): string | null {
  if (!parts || parts.length === 0) return null;
  const text = parts
    .map((part) => (part.nameZh || part.name || part.paintId) + ' ' + part.ml.toFixed(1) + ' ml')
    .join(' + ');
  return text.length <= MAX_LABEL ? text : text.slice(0, MAX_LABEL - 1) + '…';
}
