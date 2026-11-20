import { useMemo } from 'react';
import { hslToHex, lightnessBucket } from '@/core/math/color';
import { swatchAttrs } from '@/core/render/swatch';
import { PaintSwatch } from '@/components/paint';
import { Badge, cn } from '@/components/ui';
import { RowList } from './RowList';
import type { DepotRowActions } from './RowList';
import {
  binKey,
  binLabel,
  binOf,
  countOfBin,
  HUE_LABELS,
  hueMatrix,
  matchesHue,
  sectorCounts,
  sectorPath,
} from './model';
import type { DepotRow, HueBin } from './model';

export interface HueViewProps {
  rows: DepotRow[];
  selection: HueBin | null;
  onSelectionChange: (selection: HueBin | null) => void;
  actions: DepotRowActions;
  selectedIds: readonly string[];
  onSelectRow: (row: DepotRow) => void;
}

const SIZE = 280;
const CENTER = SIZE / 2;
const R_OUTER = 132;
const R_INNER = 78;
const BAND_LABELS = ['L 0–20', 'L 20–40', 'L 40–60', 'L 60–80', 'L 80–100'];
const ACHROMATIC: HueBin = { kind: 'achromatic' };
const AUX: HueBin = { kind: 'aux' };

function bandOf(row: DepotRow): number {
  return Math.min(4, Math.max(0, lightnessBucket(row.paint.hex)));
}

/** 色环视图：12 个 30° 扇区 + 12 列 × 5 行色板矩阵（spec 3.3:392-397） */
export function HueView({
  rows,
  selection,
  onSelectionChange,
  actions,
  selectedIds,
  onSelectRow,
}: HueViewProps) {
  const counts = useMemo(() => sectorCounts(rows), [rows]);
  const matrix = useMemo(() => hueMatrix(rows), [rows]);
  const achromaticRows = useMemo(() => rows.filter((row) => binOf(row.paint).kind === 'achromatic'), [rows]);
  const auxRows = useMemo(() => rows.filter((row) => binOf(row.paint).kind === 'aux'), [rows]);
  const activeKey = selection ? binKey(selection) : null;

  const toggle = (bin: HueBin) => {
    onSelectionChange(activeKey === binKey(bin) ? null : bin);
  };

  const filtered = rows.filter((row) => matchesHue(row, selection));
  const auxSwatch = swatchAttrs('#ffffff', 'aux');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 p-3 xl:flex-row">
        <figure className="flex shrink-0 flex-col items-center">
          <svg
            data-hue-wheel=""
            role="img"
            aria-label="色环：12 个 30 度色相扇区"
            width={SIZE}
            height={SIZE}
            viewBox={'0 0 ' + SIZE + ' ' + SIZE}
          >
            <circle cx={CENTER} cy={CENTER} r={R_OUTER + 10} fill="none" stroke="var(--line)" strokeWidth={1} />
            {HUE_LABELS.map((label, index) => {
              const bin: HueBin = { kind: 'hue', index };
              const active = activeKey === binKey(bin);
              return (
                <g key={label + index}>
                  <path
                    data-hue-sector={index}
                    aria-label={label + ' ' + counts[index] + ' 件'}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(bin)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggle(bin);
                      }
                    }}
                    d={sectorPath(CENTER, CENTER, R_INNER, R_OUTER, index * 30, (index + 1) * 30)}
                    fill={hslToHex(index * 30 + 15, 62, 52)}
                    fillOpacity={active ? 1 : 0.72}
                    stroke={active ? 'var(--accent)' : 'var(--line)'}
                    strokeWidth={active ? 2 : 1}
                    className="cursor-pointer"
                  />
                  <text
                    x={CENTER + Math.cos((((index * 30 + 15) - 90) * Math.PI) / 180) * ((R_INNER + R_OUTER) / 2)}
                    y={CENTER + Math.sin((((index * 30 + 15) - 90) * Math.PI) / 180) * ((R_INNER + R_OUTER) / 2) + 4}
                    textAnchor="middle"
                    className="t-readout"
                    fontSize={11}
                    fill="var(--text-1)"
                    pointerEvents="none"
                  >
                    {counts[index]}
                  </text>
                </g>
              );
            })}

            <circle
              data-hue-sector="achromatic"
              aria-label={'灰黑白 ' + achromaticRows.length + ' 件'}
              role="button"
              tabIndex={0}
              cx={CENTER}
              cy={CENTER}
              r={R_INNER - 8}
              fill={hslToHex(0, 0, 34)}
              stroke={activeKey === 'achromatic' ? 'var(--accent)' : 'var(--line-strong)'}
              strokeWidth={activeKey === 'achromatic' ? 2 : 1}
              className="cursor-pointer"
              onClick={() => toggle(ACHROMATIC)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(ACHROMATIC);
                }
              }}
            />
            <text x={CENTER} y={CENTER - 4} textAnchor="middle" fontSize={11} fill="var(--text-1)" className="t-label">
              灰黑白
            </text>
            <text x={CENTER} y={CENTER + 14} textAnchor="middle" fontSize={12} fill="var(--text-1)" className="t-readout">
              {achromaticRows.length}
            </text>

            <circle
              data-hue-sector="aux"
              aria-label={'辅助 ' + auxRows.length + ' 件'}
              role="button"
              tabIndex={0}
              cx={CENTER}
              cy={CENTER}
              r={R_OUTER + 4}
              fill="none"
              stroke={auxSwatch.fill}
              strokeOpacity={activeKey === 'aux' ? 0.9 : 0.55}
              strokeWidth={10}
              className="cursor-pointer"
              onClick={() => toggle(AUX)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(AUX);
                }
              }}
            />
            <text x={CENTER} y={16} textAnchor="middle" fontSize={10} fill="var(--text-3)" className="t-label">
              {'辅助 ' + auxRows.length}
            </text>
          </svg>
          <figcaption className="t-label mt-1">点击扇区过滤 · 再点取消</figcaption>
        </figure>

        <div className="min-w-0 flex-1">
          {selection && (
            <div
              data-hue-filter=""
              className="mb-2 flex items-center gap-2 border border-line bg-bg-1 px-2 py-1 text-xs text-text-2"
            >
              <Badge tone="accent">{binLabel(selection)}</Badge>
              <span className="t-readout">{countOfBin(rows, selection)} 件</span>
              <button
                type="button"
                onClick={() => onSelectionChange(null)}
                className="t-label ml-auto transition-colors duration-hover hover:text-text-1"
              >
                取消筛选
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table data-hue-matrix="" className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  <th className="t-label w-14 border border-line bg-bg-1 px-1 py-1 text-left">L</th>
                  {HUE_LABELS.map((label) => (
                    <th key={label} className="t-label border border-line bg-bg-1 px-0.5 py-1 text-center">
                      {label}
                    </th>
                  ))}
                  <th className="t-label border border-line bg-bg-1 px-1 py-1 text-center">灰黑白</th>
                  <th className="t-label border border-line bg-bg-1 px-1 py-1 text-center">辅助</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((line, band) => (
                  <tr key={BAND_LABELS[band]}>
                    <th scope="row" className="t-label border border-line px-1 text-left text-[9px]">
                      {BAND_LABELS[band]}
                    </th>
                    {line.map((cell) => {
                      const bin: HueBin = { kind: 'hue', index: cell.hue };
                      const active = activeKey === binKey(bin);
                      return (
                        <td
                          key={cell.hue}
                          data-hue-cell={band + '-' + cell.hue}
                          onClick={() => {
                            if (cell.rows.length > 0) toggle(bin);
                          }}
                          className={cn(
                            'h-9 border px-0.5 align-middle',
                            cell.rows.length > 0 ? 'cursor-pointer' : 'cursor-default',
                            active ? 'border-accent bg-surface-2' : 'border-line',
                          )}
                        >
                          <div className="flex items-center justify-center gap-px">
                            {cell.rows.slice(0, 4).map((row) => (
                              <PaintSwatch
                                key={row.item.id}
                                hex={row.paint.hex}
                                paintClass={row.paint.paintClass}
                                size={12}
                              />
                            ))}
                            {cell.rows.length > 4 && (
                              <span className="t-readout text-[9px] text-text-3">+{cell.rows.length - 4}</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td
                      data-hue-cell={band + '-achromatic'}
                      onClick={() => {
                        if (achromaticRows.some((row) => bandOf(row) === band)) toggle(ACHROMATIC);
                      }}
                      className={cn(
                        'h-9 border px-0.5',
                        activeKey === 'achromatic' ? 'border-accent bg-surface-2' : 'border-line',
                      )}
                    >
                      <div className="flex items-center justify-center gap-px">
                        {achromaticRows
                          .filter((row) => bandOf(row) === band)
                          .slice(0, 4)
                          .map((row) => (
                            <PaintSwatch key={row.item.id} hex={row.paint.hex} paintClass={row.paint.paintClass} size={12} />
                          ))}
                      </div>
                    </td>
                    <td
                      data-hue-cell={band + '-aux'}
                      onClick={() => {
                        if (auxRows.some((row) => bandOf(row) === band)) toggle(AUX);
                      }}
                      className={cn(
                        'h-9 border px-0.5',
                        activeKey === 'aux' ? 'border-accent bg-surface-2' : 'border-line',
                      )}
                    >
                      <div className="flex items-center justify-center gap-px">
                        {auxRows
                          .filter((row) => bandOf(row) === band)
                          .slice(0, 4)
                          .map((row) => (
                            <PaintSwatch key={row.item.id} hex={row.paint.hex} paintClass={row.paint.paintClass} size={12} />
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <RowList
        key={activeKey ?? 'all'}
        rows={filtered}
        actions={actions}
        selectedIds={selectedIds}
        onSelect={onSelectRow}
        className="border-t border-line"
      />
    </div>
  );
}
