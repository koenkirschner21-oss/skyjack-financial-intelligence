import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateMultiEntryTariffScenario } from '../../domain/rulesEngine';
import { CustomsEntry, SavedScenario } from '../../types/domain';

interface TariffSensitivityChartProps {
  entries: CustomsEntry[];
  hypotheticalRatePct: number;
  baselineEffectiveRatePct: number;
  currentAdditionalTariffCad: number;
  hypotheticalAdditionalTariffCad: number;
  normalMfnDutyCad: number;
  onSelectRate?: (ratePct: number) => void;
}

const QUICK_BENCHMARK_RATES = [0, 15, 20, 25, 35, 50];

export const TariffSensitivityChart: React.FC<TariffSensitivityChartProps> = ({
  entries,
  hypotheticalRatePct,
  baselineEffectiveRatePct,
  currentAdditionalTariffCad,
  hypotheticalAdditionalTariffCad,
  normalMfnDutyCad,
  onSelectRate,
}) => {
  const { formatMoney, formatCompactMoney } = useApp();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverRatePct, setHoverRatePct] = useState<number | null>(null);

  // Auto-scale X-axis domain so 0-50% remains spacious and readable while still accommodating 0-500%
  const chartMaxRate = useMemo(() => {
    const peak = Math.max(hypotheticalRatePct, baselineEffectiveRatePct);
    if (peak <= 60) return 60;
    if (peak <= 100) return 100;
    if (peak <= 200) return 200;
    if (peak <= 350) return 350;
    return 500;
  }, [hypotheticalRatePct, baselineEffectiveRatePct]);

  const xTicks = useMemo(() => {
    if (chartMaxRate === 60) return [0, 15, 25, 35, 50, 60];
    if (chartMaxRate === 100) return [0, 20, 40, 60, 80, 100];
    if (chartMaxRate === 200) return [0, 50, 100, 150, 200];
    if (chartMaxRate === 350) return [0, 50, 150, 250, 350];
    return [0, 100, 200, 300, 400, 500];
  }, [chartMaxRate]);

  // Compute deterministic curve points using the exact calculation engine
  const curvePoints = useMemo(() => {
    if (entries.length === 0) return [];
    const sampleRates = Array.from(
      new Set([
        ...xTicks,
        ...QUICK_BENCHMARK_RATES.filter((r) => r <= chartMaxRate),
        Math.round(baselineEffectiveRatePct),
        Math.round(hypotheticalRatePct),
        0,
        chartMaxRate,
      ])
    ).sort((a, b) => a - b);

    return sampleRates.map((rate) => {
      const sim = calculateMultiEntryTariffScenario({
        entries,
        hypotheticalAdditionalRatePct: rate,
        annualizationQuarters: 4,
      });
      return {
        rate,
        costCad: sim.hypotheticalAdditionalTariffCad,
        deltaCad: sim.quarterlyTariffDifferenceCad,
      };
    });
  }, [entries, xTicks, chartMaxRate, baselineEffectiveRatePct, hypotheticalRatePct]);

  const maxY = useMemo(() => {
    const maxCurveCost = curvePoints.reduce((m, p) => Math.max(m, p.costCad), 0);
    const highest = Math.max(100_000, maxCurveCost, currentAdditionalTariffCad, hypotheticalAdditionalTariffCad);
    return highest * 1.15;
  }, [curvePoints, currentAdditionalTariffCad, hypotheticalAdditionalTariffCad]);

  // Chart geometry (SVG viewBox 580 x 250)
  const width = 580;
  const height = 250;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toX = (rate: number) => padLeft + (Math.max(0, Math.min(chartMaxRate, rate)) / chartMaxRate) * plotW;
  const toY = (costCad: number) => padTop + plotH - (Math.max(0, costCad) / maxY) * plotH;

  const hoverStats = useMemo(() => {
    if (hoverRatePct === null || entries.length === 0) return null;
    return calculateMultiEntryTariffScenario({
      entries,
      hypotheticalAdditionalRatePct: hoverRatePct,
      annualizationQuarters: 4,
    });
  }, [hoverRatePct, entries]);

  if (entries.length === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center border border-dashed border-[#E2E5E8] rounded bg-[#F8F9FA] text-xs text-[#5F6368] px-4 text-center">
        Select at least one customs entry in Scenario Controls to visualize tariff rate sensitivity.
      </div>
    );
  }

  const linePath = curvePoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.rate).toFixed(1)} ${toY(p.costCad).toFixed(1)}`)
    .join(' ');

  const areaPath =
    curvePoints.length > 0
      ? `${linePath} L ${toX(chartMaxRate).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${toX(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const activeX = toX(hypotheticalRatePct);
  const activeY = toY(hypotheticalAdditionalTariffCad);
  const baseX = toX(Math.min(chartMaxRate, baselineEffectiveRatePct));
  const baseY = toY(currentAdditionalTariffCad);

  const yGridValues = [0, 0.25, 0.5, 0.75, 1].map((frac) => maxY * frac);

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    if (relX < padLeft || relX > width - padRight) {
      setHoverRatePct(null);
      return;
    }
    const pct = Math.round(((relX - padLeft) / plotW) * chartMaxRate);
    setHoverRatePct(Math.max(0, Math.min(chartMaxRate, pct)));
  };

  // Position active callout pill-free cleanly inside plot bounds
  const calloutAlignRight = activeX > width - 165;
  const calloutBelow = activeY < padTop + 44;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6368]">
        <span>
          Modeled Quarterly Additional Tariff vs. Rate (Scale: 0%–{chartMaxRate}%)
        </span>
        <span className="font-mono tabular-nums text-[#231F20]">
          {hoverRatePct !== null && hoverStats ? (
            <>
              Hover <strong className="text-[#E53C2E]">{hoverRatePct}%</strong>:{' '}
              <strong>{formatMoney(hoverStats.hypotheticalAdditionalTariffCad)}</strong>/qtr (
              {formatMoney(hoverStats.quarterlyTariffDifferenceCad, { showSign: true })})
            </>
          ) : (
            <>Click any preset marker or drag slider to inspect rates</>
          )}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Tariff rate sensitivity curve showing quarterly additional tariff cost across hypothetical tariff rates"
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverRatePct(null)}
          onClick={() => {
            if (hoverRatePct !== null && onSelectRate) {
              onSelectRate(hoverRatePct);
            }
          }}
        >
          <defs>
            <linearGradient id="tariffCurveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E53C2E" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#E53C2E" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Ticks */}
          {yGridValues.map((val, i) => {
            const y = toY(val);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={i === 0 ? '#D4D8DD' : '#ECEEF0'}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-[#5F6368] text-[10px] font-mono tabular-nums"
                >
                  {val === 0 ? formatCompactMoney(0) : formatCompactMoney(val)}
                </text>
              </g>
            );
          })}

          {/* X-Axis Rate Ticks */}
          {xTicks.map((tick) => {
            const x = toX(tick);
            return (
              <g key={tick}>
                <line
                  x1={x}
                  y1={padTop + plotH}
                  x2={x}
                  y2={padTop + plotH + 4}
                  stroke="#D4D8DD"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={padTop + plotH + 17}
                  textAnchor="middle"
                  className="fill-[#5F6368] text-[10px] font-mono tabular-nums"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          {/* Axis Caption */}
          <text
            x={padLeft + plotW / 2}
            y={height - 3}
            textAnchor="middle"
            className="fill-[#5F6368] text-[10px]"
          >
            Hypothetical Additional Tariff Rate (%)
          </text>

          {/* Area Fill & Linear Sensitivity Curve */}
          {areaPath && <path d={areaPath} fill="url(#tariffCurveFill)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#231F20"
              strokeWidth={2.25}
              strokeLinejoin="round"
            />
          )}

          {/* Baseline Horizontal Reference Line */}
          <line
            x1={padLeft}
            y1={baseY}
            x2={width - padRight}
            y2={baseY}
            stroke="#7E8082"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />

          {/* Baseline Vertical Drop Line */}
          <line
            x1={baseX}
            y1={baseY}
            x2={baseX}
            y2={padTop + plotH}
            stroke="#7E8082"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {/* Hover Vertical Crosshair */}
          {hoverRatePct !== null && hoverStats && (
            <g className="pointer-events-none">
              <line
                x1={toX(hoverRatePct)}
                y1={padTop}
                x2={toX(hoverRatePct)}
                y2={padTop + plotH}
                stroke="#C8CACD"
                strokeWidth={1}
              />
              <circle
                cx={toX(hoverRatePct)}
                cy={toY(hoverStats.hypotheticalAdditionalTariffCad)}
                r={4}
                fill="#FFFFFF"
                stroke="#231F20"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Clickable Quick Preset Points along Curve */}
          {QUICK_BENCHMARK_RATES.filter((r) => r <= chartMaxRate).map((rate) => {
            const pt = curvePoints.find((c) => c.rate === rate);
            if (!pt || Math.abs(rate - hypotheticalRatePct) < 0.5) return null;
            const px = toX(pt.rate);
            const py = toY(pt.costCad);
            return (
              <g
                key={rate}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRate?.(rate);
                }}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={3.5}
                  fill="#FFFFFF"
                  stroke="#5F6368"
                  strokeWidth={1.5}
                />
                <title>{`${rate}%: ${formatMoney(pt.costCad)} / qtr`}</title>
              </g>
            );
          })}

          {/* Baseline Reference Marker */}
          <g>
            <circle
              cx={baseX}
              cy={baseY}
              r={5}
              fill="#231F20"
              stroke="#FFFFFF"
              strokeWidth={1.75}
            />
            <text
              x={baseX > width - 140 ? baseX - 8 : baseX + 8}
              y={Math.max(padTop + 12, baseY - 8)}
              textAnchor={baseX > width - 140 ? 'end' : 'start'}
              className="fill-[#231F20] text-[10px] font-semibold font-mono tabular-nums"
            >
              Base {baselineEffectiveRatePct.toFixed(0)}%: {formatCompactMoney(currentAdditionalTariffCad)}
            </text>
          </g>

          {/* Active Hypothetical Scenario Marker & Drop Line */}
          <g className="pointer-events-none">
            <line
              x1={activeX}
              y1={activeY}
              x2={activeX}
              y2={padTop + plotH}
              stroke="#E53C2E"
              strokeWidth={1.25}
              strokeDasharray="2 2"
            />
            <circle cx={activeX} cy={activeY} r={8.5} fill="#E53C2E" fillOpacity={0.16} />
            <circle
              cx={activeX}
              cy={activeY}
              r={5.5}
              fill="#E53C2E"
              stroke="#FFFFFF"
              strokeWidth={2}
            />
            <g
              transform={`translate(${calloutAlignRight ? activeX - 134 : activeX + 10}, ${
                calloutBelow ? activeY + 10 : Math.max(padTop + 2, activeY - 34)
              })`}
            >
              <rect
                width={124}
                height={26}
                rx={4}
                fill="#231F20"
              />
              <text
                x={8}
                y={16.5}
                className="fill-white text-[10px] font-mono tabular-nums font-semibold"
              >
                {hypotheticalRatePct}% → {formatCompactMoney(hypotheticalAdditionalTariffCad)}/qtr
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* Compact Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5F6368] pt-1 border-t border-[#F0F1F3]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E53C2E] inline-block" />
          Active Scenario ({hypotheticalRatePct}%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#231F20] inline-block" />
          Current Baseline ({baselineEffectiveRatePct.toFixed(1)}%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-[#7E8082] inline-block" />
          Baseline Tariff Reference ({formatMoney(currentAdditionalTariffCad)})
        </span>
        <span className="ml-auto font-mono text-[10px] text-[#5F6368]">
          MFN Duty Isolated: {formatMoney(normalMfnDutyCad)}
        </span>
      </div>
    </div>
  );
};

interface BurdenComparisonBarsProps {
  baselineTariffCad: number;
  hypotheticalTariffCad: number;
  mfnDutyCad: number;
  baselineEffectiveRatePct: number;
  hypotheticalRatePct: number;
  quarterlyDifferenceCad: number;
}

export const BurdenComparisonBars: React.FC<BurdenComparisonBarsProps> = ({
  baselineTariffCad,
  hypotheticalTariffCad,
  mfnDutyCad,
  baselineEffectiveRatePct,
  hypotheticalRatePct,
  quarterlyDifferenceCad,
}) => {
  const { formatMoney } = useApp();
  const baselineTotal = baselineTariffCad + mfnDutyCad;
  const hypoTotal = hypotheticalTariffCad + mfnDutyCad;
  const maxVal = Math.max(100_000, baselineTotal, hypoTotal) * 1.1;

  return (
    <div className="space-y-2.5 pt-3 border-t border-[#E2E5E8]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-[#231F20]">
          Baseline vs. Hypothetical Quarterly Total (Additional Tariff + Unchanged MFN)
        </span>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5F6368]">
              Current Baseline ({baselineEffectiveRatePct.toFixed(0)}% Addl. + MFN)
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#231F20]">
              {formatMoney(baselineTotal)} / qtr
            </span>
          </div>
          <div className="h-5 bg-[#ECEEF0] rounded overflow-hidden flex">
            {mfnDutyCad > 0 && (
              <div
                className="h-full bg-[#7E8082] transition-all duration-200"
                style={{ width: `${(mfnDutyCad / maxVal) * 100}%` }}
                title={`Normal MFN Duty (Unchanged): ${formatMoney(mfnDutyCad)}`}
              />
            )}
            <div
              className="h-full bg-[#231F20] transition-all duration-200"
              style={{ width: `${(baselineTariffCad / maxVal) * 100}%` }}
              title={`Baseline Additional Tariff: ${formatMoney(baselineTariffCad)}`}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#231F20] font-medium">
              Hypothetical ({hypotheticalRatePct}% Addl. + MFN)
            </span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                quarterlyDifferenceCad < 0
                  ? 'text-[#16A34A]'
                  : quarterlyDifferenceCad > 0
                    ? 'text-[#DC2626]'
                    : 'text-[#231F20]'
              }`}
            >
              {formatMoney(hypoTotal)} / qtr
            </span>
          </div>
          <div className="h-5 bg-[#ECEEF0] rounded overflow-hidden flex">
            {mfnDutyCad > 0 && (
              <div
                className="h-full bg-[#7E8082] transition-all duration-200"
                style={{ width: `${(mfnDutyCad / maxVal) * 100}%` }}
                title={`Normal MFN Duty (Unchanged): ${formatMoney(mfnDutyCad)}`}
              />
            )}
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

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#5F6368]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#7E8082] inline-block" />
          Normal MFN ({formatMoney(mfnDutyCad)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#231F20] inline-block" />
          Baseline Addl. ({formatMoney(baselineTariffCad)})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-xs inline-block ${
              quarterlyDifferenceCad < 0
                ? 'bg-[#16A34A]'
                : quarterlyDifferenceCad > 0
                  ? 'bg-[#E53C2E]'
                  : 'bg-[#231F20]'
            }`}
          />
          Hypothetical Addl. ({formatMoney(hypotheticalTariffCad)})
        </span>
      </div>
    </div>
  );
};

interface ScenarioComparisonChartProps {
  activeDraft: {
    ratePct: number;
    projectedQuarterlyTariffCad: number;
    quarterlyDifferenceCad: number;
    annualizedNetImpactCad: number;
  };
  comparedScenarios: SavedScenario[];
}

export const ScenarioComparisonChart: React.FC<ScenarioComparisonChartProps> = ({
  activeDraft,
  comparedScenarios,
}) => {
  const { formatMoney } = useApp();
  const rows = [
    {
      id: '__active_draft__',
      label: `Active Draft (${activeDraft.ratePct}%)`,
      ratePct: activeDraft.ratePct,
      projectedQtr: activeDraft.projectedQuarterlyTariffCad,
      qtrDiff: activeDraft.quarterlyDifferenceCad,
      annDiff: activeDraft.annualizedNetImpactCad,
      isActive: true,
    },
    ...comparedScenarios.map((s) => ({
      id: s.id,
      label: s.name,
      ratePct: s.chinaTariffRatePct,
      projectedQtr: s.projectedQuarterlyTariffCad,
      qtrDiff: s.quarterlyDifferenceCad,
      annDiff: s.annualizedDifferenceCad,
      isActive: false,
    })),
  ];

  const maxTariff = Math.max(100_000, ...rows.map((r) => r.projectedQtr));

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const widthPct = Math.max(2, (row.projectedQtr / maxTariff) * 100);
        const diffColor =
          row.qtrDiff < 0
            ? 'text-[#16A34A]'
            : row.qtrDiff > 0
              ? 'text-[#DC2626]'
              : 'text-[#5F6368]';

        return (
          <div
            key={row.id}
            className={`p-2.5 rounded border text-xs space-y-1.5 ${
              row.isActive
                ? 'border-[#E53C2E]/40 bg-[#FDF2F1]/50'
                : 'border-[#E2E5E8] bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-[#231F20] truncate">
                  {row.label}
                </span>
                <span className="text-[11px] font-mono text-[#5F6368] shrink-0">
                  {row.ratePct}%
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] shrink-0">
                <span className="text-[#231F20] font-semibold">
                  {formatMoney(row.projectedQtr)}/qtr
                </span>
                <span className={`font-semibold ${diffColor}`}>
                  {row.qtrDiff === 0 ? `${formatMoney(0)} Δ` : `${formatMoney(row.qtrDiff, { showSign: true })}/qtr`}
                </span>
                <span className="text-[#5F6368] hidden sm:inline">
                  Ann: {row.annDiff === 0 ? formatMoney(0) : formatMoney(row.annDiff, { showSign: true })}
                </span>
              </div>
            </div>
            <div className="h-2 bg-[#ECEEF0] rounded overflow-hidden">
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, widthPct)}%`,
                  backgroundColor: row.isActive ? '#E53C2E' : '#231F20',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
