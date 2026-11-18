import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CURRENCY_METADATA } from '../../domain/currencyService';
import { OperatingEarningsWalkEntry } from '../../types/domain';

interface WaterfallChartProps {
  entries: OperatingEarningsWalkEntry[];
  onSelectEntry: (entry: OperatingEarningsWalkEntry) => void;
  materialOnly?: boolean;
  selectedEntryId?: string | null;
  onResetMaterialOnly?: () => void;
}

interface ComputedWaterfallBar {
  id: string;
  entry: OperatingEarningsWalkEntry;
  startYVal: number;
  endYVal: number;
  isMaterial: boolean;
  isGroupedMinor?: boolean;
  groupedItems?: OperatingEarningsWalkEntry[];
}

export const OperatingEarningsWaterfallChart: React.FC<WaterfallChartProps> = ({
  entries,
  onSelectEntry,
  materialOnly = false,
  selectedEntryId = null,
  onResetMaterialOnly,
}) => {
  const { state, convertAmount, formatMoney, formatCompactMoney } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeGroupedInspect, setActiveGroupedInspect] = useState(false);
  const currencyPrefix = CURRENCY_METADATA[state.currency].compactPrefix;

  // Compute full walk cumulative totals first
  let running = 0;
  const fullBars: ComputedWaterfallBar[] = entries.map((entry) => {
    if (entry.bucket === 'Start') {
      running = entry.amountCad;
      return {
        id: entry.id,
        entry,
        startYVal: 0,
        endYVal: entry.amountCad,
        isMaterial: false,
      };
    }
    if (entry.bucket === 'End') {
      return {
        id: entry.id,
        entry,
        startYVal: 0,
        endYVal: entry.amountCad,
        isMaterial: false,
      };
    }
    const prev = running;
    running += entry.amountCad;
    return {
      id: entry.id,
      entry,
      startYVal: prev,
      endYVal: running,
      isMaterial: Math.abs(entry.amountCad) >= 1_000_000,
    };
  });

  // In Material Only mode, group below-$1M variances into one reconciling bridge bar so Start -> End reconciles 100%
  const visibleBars: ComputedWaterfallBar[] = (() => {
    if (!materialOnly) return fullBars;

    const startBar = fullBars.find((b) => b.entry.bucket === 'Start');
    const endBar = fullBars.find((b) => b.entry.bucket === 'End');
    const materialIntermediate = fullBars.filter(
      (b) => b.entry.bucket !== 'Start' && b.entry.bucket !== 'End' && b.isMaterial
    );
    const minorIntermediate = fullBars.filter(
      (b) => b.entry.bucket !== 'Start' && b.entry.bucket !== 'End' && !b.isMaterial
    );

    const rebuilt: ComputedWaterfallBar[] = [];
    let matRunning = startBar ? startBar.entry.amountCad : 0;

    if (startBar) {
      rebuilt.push(startBar);
    }

    for (const bar of materialIntermediate) {
      const prev = matRunning;
      matRunning += bar.entry.amountCad;
      rebuilt.push({
        ...bar,
        startYVal: prev,
        endYVal: matRunning,
      });
    }

    if (minorIntermediate.length > 0) {
      const minorSum = minorIntermediate.reduce((sum, b) => sum + b.entry.amountCad, 0);
      const prev = matRunning;
      matRunning += minorSum;
      const syntheticEntry: OperatingEarningsWalkEntry = {
        id: '__minor_variances_grouped__',
        walkId: entries[0]?.walkId ?? 'walk',
        sequence: 99,
        stepLabel: `Other minor variances (< $1M · ${minorIntermediate.length} items)`,
        bucket: 'SG&A',
        amountCad: minorSum,
        isMaterialReported: false,
        supportingExplanation: `Net sum of ${minorIntermediate.length} below-$1.0M line items so the bridge reconciles exactly to Ending Operating Earnings.`,
        sourceRef: entries[0]?.sourceRef ?? 'Appendix',
        sourceUnit: 'thousands_cad',
        provenance: 'derived_calculation',
      };
      rebuilt.push({
        id: syntheticEntry.id,
        entry: syntheticEntry,
        startYVal: prev,
        endYVal: matRunning,
        isMaterial: false,
        isGroupedMinor: true,
        groupedItems: minorIntermediate.map((m) => m.entry),
      });
    }

    if (endBar) {
      rebuilt.push(endBar);
    }

    return rebuilt;
  })();

  const allVals = visibleBars.flatMap((b) => [b.startYVal, b.endYVal, 0]);
  const minVal = Math.min(0, ...allVals);
  const maxRaw = Math.max(32_000_000, ...allVals);
  const maxVal = maxRaw * 1.14;

  const width = visibleBars.length <= 8 ? 820 : 980;
  const height = 355;
  const padLeft = 72;
  const padRight = 24;
  const padTop = 30;
  const padBottom = 86;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const yPos = (val: number) =>
    padTop + innerH - ((val - minVal) / (maxVal - minVal)) * innerH;

  const slotW = innerW / Math.max(1, visibleBars.length);
  const barW = Math.min(44, Math.max(24, slotW * 0.58));

  const ticks = [0, 10_000_000, 20_000_000, 30_000_000, 40_000_000].filter((t) => t <= maxVal);
  const activeId = hoveredId ?? (activeGroupedInspect ? '__minor_variances_grouped__' : selectedEntryId);
  const activeBar =
    visibleBars.find((b) => b.id === activeId) ??
    visibleBars[visibleBars.length - 1];

  const formatStepShortLabel = (bar: ComputedWaterfallBar) => {
    if (bar.isGroupedMinor) {
      return `Minor (< $1M, ${bar.groupedItems?.length ?? 0})`;
    }
    return bar.entry.stepLabel
      .replace('Start: ', '')
      .replace('End: ', '')
      .replace(' operating earnings', ' OE')
      .replace('Variable costs: ', 'VC: ')
      .replace('Fixed plant: ', 'FP: ')
      .replace('Sales: ', 'Sales: ')
      .replace(' (IR-01)', '')
      .replace(' (IR-02)', '');
  };

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5F6368]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#231F20] inline-block" />
            Starting OE
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#16A34A] inline-block" />
            Favorable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#DC2626] inline-block" />
            Adverse
          </span>
          {materialOnly && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#64748B] inline-block" />
              Grouped Minor (&lt; $1M)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#E53C2E] inline-block" />
            Ending OE (Q3 2026)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border-2 border-[#231F20] bg-white inline-block" />
            Material (≥ CAD 1.0M)
          </span>
        </div>
        <span className="text-[11px] text-[#5F6368] font-mono">
          {visibleBars.length} steps shown · Exact net bridge
        </span>
      </div>

      <div className="overflow-x-auto border border-[#ECEEF0] rounded bg-[#FCFCFD] px-2 pt-2 pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`w-full h-auto ${visibleBars.length <= 8 ? 'min-w-[640px]' : 'min-w-[820px]'}`}
          role="img"
          aria-label="Operating earnings waterfall bridge"
        >
          {/* Y-axis unit label */}
          <text
            x={16}
            y={padTop + innerH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${padTop + innerH / 2})`}
            className="fill-[#5F6368] text-[10px] font-medium tracking-wide"
          >
            Operating Earnings ({state.currency} $M)
          </text>

          {/* Gridlines */}
          {ticks.map((tick) => {
            const y = yPos(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke={tick === 0 ? '#CBD0D6' : '#E2E5E8'}
                  strokeWidth={tick === 0 ? 1.2 : 1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[#5F6368] text-[10px] font-mono"
                >
                  {tick === 0 ? `${currencyPrefix}0` : `${currencyPrefix}${(convertAmount(tick) / 1_000_000).toFixed(0)}M`}
                </text>
              </g>
            );
          })}

          {visibleBars.map((bar, i) => {
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            const yTop = yPos(Math.max(bar.startYVal, bar.endYVal));
            const yBot = yPos(Math.min(bar.startYVal, bar.endYVal));
            const barH = Math.max(4, yBot - yTop);

            const isEndpoint = bar.entry.bucket === 'Start' || bar.entry.bucket === 'End';
            const isPositive = bar.entry.amountCad >= 0;
            const isActive = activeId === bar.id;
            const isDimmed = hoveredId !== null && hoveredId !== bar.id;

            const fill = bar.isGroupedMinor
              ? '#64748B'
              : isEndpoint
                ? bar.entry.bucket === 'End'
                  ? '#E53C2E'
                  : '#231F20'
                : isPositive
                  ? '#16A34A'
                  : '#DC2626';

            const nextBar = visibleBars[i + 1];
            const connectorY = yPos(bar.endYVal);
            const shortLabel = formatStepShortLabel(bar);

            // Position value label above upward/endpoint bars and below downward bars (when clear of baseline)
            const placeLabelBelow =
              !isEndpoint && !isPositive && yBot + 16 < padTop + innerH - 4;
            const valueLabelY = placeLabelBelow ? yBot + 13 : yTop - 7;

            return (
              <g
                key={bar.id}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredId(bar.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => {
                  if (bar.isGroupedMinor) {
                    setActiveGroupedInspect((v) => !v);
                  } else {
                    setActiveGroupedInspect(false);
                    onSelectEntry(bar.entry);
                  }
                }}
              >
                {/* Hover column highlight */}
                <rect
                  x={padLeft + i * slotW + 2}
                  y={padTop}
                  width={Math.max(10, slotW - 4)}
                  height={innerH}
                  rx={3}
                  fill={isActive ? '#F0F2F5' : 'transparent'}
                />

                {/* Connector line to next bar */}
                {nextBar && (
                  <line
                    x1={x + barW}
                    x2={padLeft + (i + 1) * slotW + (slotW - barW) / 2}
                    y1={connectorY}
                    y2={connectorY}
                    stroke="#9CA3AF"
                    strokeDasharray="3 2"
                    strokeWidth={1}
                  />
                )}

                <rect
                  x={x}
                  y={yTop}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={fill}
                  opacity={isDimmed ? 0.65 : 1}
                  stroke={isActive ? '#231F20' : bar.isMaterial ? '#231F20' : 'none'}
                  strokeWidth={isActive ? 2 : bar.isMaterial ? 1.5 : 0}
                />

                {/* Value label */}
                <text
                  x={x + barW / 2}
                  y={valueLabelY}
                  textAnchor="middle"
                  className={`text-[9.5px] font-mono ${
                    isActive || bar.isMaterial || isEndpoint
                      ? 'fill-[#231F20] font-semibold'
                      : 'fill-[#4B5563] font-medium'
                  }`}
                >
                  {formatCompactMoney(bar.entry.amountCad, { showSign: !isEndpoint })}
                </text>

                {/* X-axis angled label */}
                <text
                  x={x + barW / 2}
                  y={padTop + innerH + 14}
                  textAnchor="end"
                  transform={`rotate(-34 ${x + barW / 2} ${padTop + innerH + 14})`}
                  className={`text-[10px] ${
                    isActive
                      ? 'fill-[#E53C2E] font-semibold'
                      : bar.isMaterial || isEndpoint
                        ? 'fill-[#231F20] font-semibold'
                        : 'fill-[#5F6368]'
                  }`}
                >
                  {shortLabel.length > 21 ? `${shortLabel.slice(0, 20)}…` : shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Persistent Active / Hovered Step Summary Bar */}
      {activeBar && (
        <div className="px-3.5 py-2.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded flex flex-col gap-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-semibold text-[#231F20]">
                {activeBar.entry.stepLabel}
              </span>
              {activeBar.isMaterial && (
                <span className="text-[11px] font-semibold text-[#E53C2E]">
                  Material (≥ CAD 1.0M)
                </span>
              )}
              {activeBar.entry.linkedIrregularCostId && (
                <span className="text-[11px] font-mono font-semibold text-[#231F20] bg-white border border-[#E2E5E8] px-1.5 py-0.5 rounded">
                  Linked: {activeBar.entry.linkedIrregularCostId}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
              <span
                className={`font-semibold ${
                  activeBar.entry.bucket === 'Start' || activeBar.entry.bucket === 'End'
                    ? 'text-[#231F20]'
                    : activeBar.entry.amountCad >= 0
                      ? 'text-[#16A34A]'
                      : 'text-[#DC2626]'
                }`}
              >
                {formatMoney(activeBar.entry.amountCad, {
                  showSign: activeBar.entry.bucket !== 'Start' && activeBar.entry.bucket !== 'End',
                })}
              </span>
              {activeBar.entry.bucket !== 'Start' && activeBar.entry.bucket !== 'End' && (
                <span className="text-[#5F6368]">
                  Running OE: {formatCompactMoney(activeBar.endYVal)}
                </span>
              )}
              {!activeBar.isGroupedMinor && (
                <button
                  type="button"
                  onClick={() => onSelectEntry(activeBar.entry)}
                  className="font-sans text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
                >
                  Inspect step
                </button>
              )}
            </div>
          </div>

          {activeBar.isGroupedMinor && activeBar.groupedItems && (
            <div className="pt-2 border-t border-[#E2E5E8] space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6368]">
                <span>
                  Included below-threshold items ({activeBar.groupedItems.length} lines summing to{' '}
                  <strong className="text-[#231F20] font-mono">
                    {formatMoney(activeBar.entry.amountCad, { showSign: true })}
                  </strong>
                  ):
                </span>
                {onResetMaterialOnly && (
                  <button
                    type="button"
                    onClick={onResetMaterialOnly}
                    className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    Expand all {entries.length} steps
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-[#231F20]">
                {activeBar.groupedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectEntry(item)}
                    className="hover:text-[#E53C2E] hover:underline cursor-pointer text-left"
                  >
                    {item.stepLabel}: {formatCompactMoney(item.amountCad, { showSign: true })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface TariffComparisonChartProps {
  baselineTariffCad: number;
  hypotheticalTariffCad: number;
  mfnDutyCad: number;
  hypotheticalRatePct: number;
  quarterlyDifferenceCad: number;
}

export const TariffScenarioComparisonChart: React.FC<TariffComparisonChartProps> = ({
  baselineTariffCad,
  hypotheticalTariffCad,
  mfnDutyCad,
  hypotheticalRatePct,
  quarterlyDifferenceCad,
}) => {
  const { formatMoney } = useApp();
  const maxVal = Math.max(
    100_000,
    baselineTariffCad + mfnDutyCad,
    hypotheticalTariffCad + mfnDutyCad
  ) * 1.15;

  const baselineTotal = baselineTariffCad + mfnDutyCad;
  const hypoTotal = hypotheticalTariffCad + mfnDutyCad;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {/* Baseline Row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#231F20]">
              Current Baseline (25% Additional + MFN)
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#231F20]">
              {formatMoney(baselineTotal)} / qtr
            </span>
          </div>
          <div className="h-7 bg-[#ECEEF0] rounded overflow-hidden flex">
            <div
              className="h-full bg-[#7E8082] transition-all duration-200"
              style={{ width: `${(mfnDutyCad / maxVal) * 100}%` }}
              title={`Normal MFN Duty: ${formatMoney(mfnDutyCad)}`}
            />
            <div
              className="h-full bg-[#231F20] transition-all duration-200"
              style={{ width: `${(baselineTariffCad / maxVal) * 100}%` }}
              title={`Baseline Additional Tariff: ${formatMoney(baselineTariffCad)}`}
            />
          </div>
        </div>

        {/* Hypothetical Row */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#231F20]">
              Hypothetical Scenario ({hypotheticalRatePct}% Additional + MFN)
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#E53C2E]">
              {formatMoney(hypoTotal)} / qtr
            </span>
          </div>
          <div className="h-7 bg-[#ECEEF0] rounded overflow-hidden flex">
            <div
              className="h-full bg-[#7E8082] transition-all duration-200"
              style={{ width: `${(mfnDutyCad / maxVal) * 100}%` }}
              title={`Normal MFN Duty (Unchanged): ${formatMoney(mfnDutyCad)}`}
            />
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${(hypotheticalTariffCad / maxVal) * 100}%`,
                backgroundColor:
                  quarterlyDifferenceCad < 0
                    ? '#16A34A'
                    : quarterlyDifferenceCad > 0
                      ? '#E53C2E'
                      : '#231F20',
              }}
              title={`Hypothetical Additional Tariff: ${formatMoney(hypotheticalTariffCad)}`}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#5F6368] pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#7E8082] inline-block" />
          Normal MFN Duty (Unchanged: {formatMoney(mfnDutyCad)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#231F20] inline-block" />
          Baseline Additional Tariff
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#16A34A] inline-block" />
          Lower Tariff Cost
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs bg-[#E53C2E] inline-block" />
          Higher Tariff Cost
        </span>
      </div>
    </div>
  );
};
