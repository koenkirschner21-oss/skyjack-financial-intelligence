import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CURRENCY_METADATA } from '../../domain/currencyService';
import {
  HistoricalTradeCost,
  IncomeStatement,
  QuarterId,
  RegionalSale,
} from '../../types/domain';

interface EightQuarterChartProps {
  statements: IncomeStatement[];
  selectedQuarterId: QuarterId;
  onSelectQuarter: (q: QuarterId) => void;
  mode: 'sales' | 'operating_earnings' | 'margin';
}

export const EightQuarterPerformanceChart: React.FC<EightQuarterChartProps> = ({
  statements,
  selectedQuarterId,
  onSelectQuarter,
  mode,
}) => {
  const { state, convertAmount, formatMoney } = useApp();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const currencyPrefix = CURRENCY_METADATA[state.currency].compactPrefix;

  const width = 680;
  const height = 240;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 34;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const values = statements.map((s) =>
    mode === 'sales'
      ? s.salesCad
      : mode === 'operating_earnings'
        ? s.operatingEarningsCad
        : s.oeShareOfSalesPct
  );

  const maxVal =
    mode === 'sales'
      ? 360_000_000
      : mode === 'operating_earnings'
        ? 24_000_000
        : 7.5;

  const yTicks =
    mode === 'sales'
      ? [0, 90_000_000, 180_000_000, 270_000_000, 360_000_000]
      : mode === 'operating_earnings'
        ? [0, 6_000_000, 12_000_000, 18_000_000, 24_000_000]
        : [0, 2.5, 5.0, 7.5];

  const slotW = innerW / statements.length;
  const barW = Math.min(42, slotW * 0.56);

  const yPos = (v: number) => padTop + innerH - (v / maxVal) * innerH;

  const linePoints = statements
    .map((_, i) => {
      const cx = padLeft + i * slotW + slotW / 2;
      const cy = yPos(values[i]);
      return `${cx},${cy}`;
    })
    .join(' ');

  const hovered = hoveredIdx !== null ? statements[hoveredIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`Eight-quarter ${mode.replace('_', ' ')} chart`}
      >
        {/* Horizontal Gridlines */}
        {yTicks.map((tick) => {
          const y = yPos(tick);
          return (
            <g key={tick}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#E2E5E8" strokeWidth={1} />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[#5F6368] text-[10px] font-mono"
              >
                {mode === 'margin'
                  ? `${tick.toFixed(1)}%`
                  : tick === 0
                    ? '0'
                    : `${currencyPrefix}${(convertAmount(tick) / 1_000_000).toFixed(0)}M`}
              </text>
            </g>
          );
        })}

        {/* Data Series */}
        {mode === 'margin' ? (
          <>
            <polyline
              fill="none"
              stroke="#E53C2E"
              strokeWidth={2.5}
              points={linePoints}
            />
            {statements.map((s, i) => {
              const cx = padLeft + i * slotW + slotW / 2;
              const cy = yPos(s.oeShareOfSalesPct);
              const isSelected = s.quarterId === selectedQuarterId;
              return (
                <g
                  key={s.quarterId}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => onSelectQuarter(s.quarterId)}
                >
                  <rect
                    x={padLeft + i * slotW}
                    y={padTop}
                    width={slotW}
                    height={innerH}
                    fill="transparent"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected || hoveredIdx === i ? 5.5 : 4}
                    fill={isSelected ? '#E53C2E' : '#231F20'}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                  />
                  <text
                    x={cx}
                    y={cy - 10}
                    textAnchor="middle"
                    className="fill-[#231F20] text-[10px] font-mono font-medium"
                  >
                    {s.oeShareOfSalesPct.toFixed(1)}%
                  </text>
                  <text
                    x={cx}
                    y={height - 10}
                    textAnchor="middle"
                    className={`text-[10px] font-mono ${
                      isSelected ? 'fill-[#E53C2E] font-semibold' : 'fill-[#5F6368]'
                    }`}
                  >
                    {s.quarterId}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          statements.map((s, i) => {
            const val = values[i];
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            const y = yPos(val);
            const barH = Math.max(2, padTop + innerH - y);
            const isSelected = s.quarterId === selectedQuarterId;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={s.quarterId}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onSelectQuarter(s.quarterId)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={2}
                  fill={
                    isSelected
                      ? '#E53C2E'
                      : isHovered
                        ? '#3E3A3B'
                        : mode === 'sales'
                          ? '#231F20'
                          : '#4B4F54'
                  }
                />
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-[#231F20] text-[9.5px] font-mono"
                >
                  {currencyPrefix}{(convertAmount(val) / 1_000_000).toFixed(1)}M
                </text>
                <text
                  x={x + barW / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[10px] font-mono ${
                    isSelected ? 'fill-[#E53C2E] font-semibold' : 'fill-[#5F6368]'
                  }`}
                >
                  {s.quarterId}
                </text>
              </g>
            );
          })
        )}
      </svg>

      {/* Interactive Tooltip / Active Quarter Readout */}
      {(() => {
        const displayStmt = hovered ?? statements.find((s) => s.quarterId === selectedQuarterId) ?? statements[statements.length - 1];
        if (!displayStmt) return null;
        return (
          <div className="mt-2 px-3 py-2 bg-[#F5F6F7] border border-[#E2E5E8] rounded flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#231F20]">
              {hovered ? `${displayStmt.quarterId} · Hover` : `${displayStmt.quarterId} · Selected`}
            </span>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#231F20]">
              <span>Sales: {formatMoney(displayStmt.salesCad)}</span>
              <span>OE: {formatMoney(displayStmt.operatingEarningsCad)}</span>
              <span>Margin: {displayStmt.oeShareOfSalesPct.toFixed(1)}%</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

interface TradeCostTrendChartProps {
  history: HistoricalTradeCost[];
  selectedQuarterId: QuarterId;
  onSelectQuarter: (q: QuarterId) => void;
}

export const TradeCostTrendChart: React.FC<TradeCostTrendChartProps> = ({
  history,
  selectedQuarterId,
  onSelectQuarter,
}) => {
  const { state, convertAmount, formatMoney, formatShortMoney } = useApp();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const currencyPrefix = CURRENCY_METADATA[state.currency].compactPrefix;

  const width = 620;
  const height = 210;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 24;
  const padBottom = 32;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = 800_000;
  const ticks = [0, 200_000, 400_000, 600_000, 800_000];
  const slotW = innerW / history.length;
  const barW = Math.min(38, slotW * 0.55);
  const yPos = (v: number) => padTop + innerH - (v / maxVal) * innerH;
  const hovered = hoveredIdx !== null ? history[hoveredIdx] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Eight-quarter trade cost trend">
        {ticks.map((tick) => {
          const y = yPos(tick);
          return (
            <g key={tick}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#E2E5E8" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" className="fill-[#5F6368] text-[10px] font-mono">
                {tick === 0 ? '0' : `${currencyPrefix}${Math.round(convertAmount(tick) / 1000)}K`}
              </text>
            </g>
          );
        })}

        {/* Vertical divider marking Extra Tariff onset in Q1 2026 */}
        <line
          x1={padLeft + 5 * slotW}
          x2={padLeft + 5 * slotW}
          y1={padTop}
          y2={padTop + innerH}
          stroke="#E53C2E"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <text x={padLeft + 5 * slotW + 4} y={padTop + 10} className="fill-[#E53C2E] text-[9.5px] font-medium">
          Extra tariffs begin (Q1 2026)
        </text>

        {history.map((h, i) => {
          const x = padLeft + i * slotW + (slotW - barW) / 2;
          const y = yPos(h.totalRoundedCad);
          const barH = padTop + innerH - y;
          const isSelected = h.quarterId === selectedQuarterId;
          return (
            <g
              key={h.quarterId}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectQuarter(h.quarterId)}
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={2}
                fill={
                  isSelected
                    ? '#E53C2E'
                    : h.extraTariffsActive
                      ? '#231F20'
                      : '#7E8082'
                }
              />
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" className="fill-[#231F20] text-[9.5px] font-mono">
                {currencyPrefix}{Math.round(convertAmount(h.totalRoundedCad) / 1000)}K
              </text>
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                className={`text-[9.5px] font-mono ${isSelected ? 'fill-[#E53C2E] font-semibold' : 'fill-[#5F6368]'}`}
              >
                {h.quarterId}
              </text>
            </g>
          );
        })}
      </svg>

      {(() => {
        const displayPoint =
          hovered ??
          history.find((h) => h.quarterId === selectedQuarterId) ??
          history[history.length - 1];
        if (!displayPoint) return null;
        return (
          <div className="mt-2 px-3 py-2 bg-[#F5F6F7] border border-[#E2E5E8] rounded flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#231F20]">
              {hovered
                ? `${displayPoint.quarterId} · Hover (000s Series)`
                : `${displayPoint.quarterId} · Selected (000s Series)`}
            </span>
            <div className="flex items-center gap-4 font-mono tabular-nums text-[#231F20]">
              <span>Total: {formatMoney(displayPoint.totalRoundedCad)}</span>
              <span>
                YoY Delta:{' '}
                {displayPoint.yoyChangeRoundedCad !== null
                  ? formatShortMoney(displayPoint.yoyChangeRoundedCad, { showSign: true })
                  : 'N/A'}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

interface RegionalComparisonChartProps {
  sales: RegionalSale[];
  selectedRegionId: string;
  onSelectRegion: (id: RegionalSale['regionId']) => void;
}

export const RegionalComparisonChart: React.FC<RegionalComparisonChartProps> = ({
  sales,
  selectedRegionId,
  onSelectRegion,
}) => {
  const { formatMoney } = useApp();
  const maxSales = Math.max(...sales.map((s) => s.salesCurrentCad));

  return (
    <div className="space-y-3">
      {sales.map((reg) => {
        const pctWidth = (reg.salesCurrentCad / maxSales) * 100;
        const isSelected = selectedRegionId === reg.regionId;
        return (
          <button
            key={reg.id}
            type="button"
            onClick={() => onSelectRegion(reg.regionId)}
            className={`w-full text-left p-2.5 rounded border transition-colors cursor-pointer ${
              isSelected
                ? 'bg-[#F5F6F7] border-[#231F20]'
                : 'bg-white border-transparent hover:bg-[#F5F6F7]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span className="font-medium text-[#231F20]">{reg.regionName}</span>
              <span className="font-mono tabular-nums text-[#231F20]">
                {formatMoney(reg.salesCurrentCad)}{' '}
                <span className="text-[#5F6368] ml-1">(+{reg.changePctReported.toFixed(1)}% YoY)</span>
              </span>
            </div>
            <div className="h-2 bg-[#ECEEF0] rounded overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${pctWidth}%`,
                  backgroundColor: isSelected ? '#E53C2E' : '#231F20',
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};
