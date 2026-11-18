import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateExpectedBrokerFeeCad } from '../../domain/rulesEngine';
import { CustomsEntry, DomesticShipmentRecord } from '../../types/domain';

export type TradeCompositionKey = 'china' | 'mfn' | 'ddp' | 'broker';

interface TradeCostCompositionChartProps {
  entries: CustomsEntry[];
  selectedQuarterId: string;
  activeFilterKey: TradeCompositionKey | null;
  onSelectCategory: (key: TradeCompositionKey | null) => void;
}

export const TradeCostCompositionChart: React.FC<TradeCostCompositionChartProps> = ({
  entries,
  selectedQuarterId,
  activeFilterKey,
  onSelectCategory,
}) => {
  const { formatMoney } = useApp();
  const [hoveredKey, setHoveredKey] = useState<TradeCompositionKey | null>(null);

  const breakdown = useMemo(() => {
    let chinaCad = 0;
    let mfnCad = 0;
    let ddpCad = 0;
    let brokerCad = 0;

    for (const e of entries) {
      chinaCad += e.additionalTariffCad;
      mfnCad += e.mfnDutyCad;
      ddpCad += e.exportDutyCad;
      brokerCad += e.brokerFeeChargedCad;
    }

    const totalCad = chinaCad + mfnCad + ddpCad + brokerCad;
    const denom = totalCad || 1;

    const segments: Array<{
      key: TradeCompositionKey;
      label: string;
      shortLabel: string;
      amountCad: number;
      pct: number;
      color: string;
      count: number;
    }> = [
      {
        key: 'china',
        label: 'Additional China Tariffs (25%)',
        shortLabel: 'China 25%',
        amountCad: chinaCad,
        pct: (chinaCad / denom) * 100,
        color: '#E53C2E',
        count: entries.filter((e) => e.additionalTariffCad > 0).length,
      },
      {
        key: 'mfn',
        label: 'Normal MFN Duties',
        shortLabel: 'Normal MFN',
        amountCad: mfnCad,
        pct: (mfnCad / denom) * 100,
        color: '#231F20',
        count: entries.filter((e) => e.mfnDutyCad > 0).length,
      },
      {
        key: 'ddp',
        label: 'DDP Export Duty (E-10 4.0%)',
        shortLabel: 'DDP Export',
        amountCad: ddpCad,
        pct: (ddpCad / denom) * 100,
        color: '#2563EB',
        count: entries.filter((e) => e.exportDutyCad > 0).length,
      },
      {
        key: 'broker',
        label: 'Matched Broker Fees (E-01–E-12)',
        shortLabel: 'Broker Fees',
        amountCad: brokerCad,
        pct: (brokerCad / denom) * 100,
        color: '#7E8082',
        count: entries.length,
      },
    ];

    return { totalCad, segments };
  }, [entries]);

  const activeSegment =
    breakdown.segments.find((s) => s.key === hoveredKey) ??
    breakdown.segments.find((s) => s.key === activeFilterKey) ??
    null;

  return (
    <div className="space-y-3.5">
      {/* Header Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[#5F6368]">
          Exact Q3 2026 Total:{' '}
          <span className="font-mono tabular-nums font-semibold text-[#231F20]">
            {formatMoney(breakdown.totalCad)}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#5F6368]">
          100% Composition ({entries.length} entries)
        </span>
      </div>

      {selectedQuarterId !== 'Q3 2026' && (
        <div className="px-3 py-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded text-[11px] text-[#5F6368]">
          Category breakdown is available for <strong className="text-[#231F20]">Q3 2026</strong> only; earlier quarters in Appendix 3.6 publish aggregate totals without category splits.
        </div>
      )}

      {/* 100% Stacked Horizontal Composition Bar */}
      <div
        className="h-9 w-full rounded border border-[#E2E5E8] bg-[#ECEEF0] overflow-hidden flex"
        role="group"
        aria-label="Q3 2026 trade cost 100 percent composition"
      >
        {breakdown.segments.map((seg, idx) => {
          const isSelected = activeFilterKey === seg.key;
          const isDimmed =
            (activeFilterKey !== null && !isSelected) ||
            (hoveredKey !== null && hoveredKey !== seg.key);

          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => onSelectCategory(isSelected ? null : seg.key)}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${formatMoney(seg.amountCad)} (${seg.pct.toFixed(1)}%)`}
              aria-label={`${seg.label}: ${formatMoney(seg.amountCad)}, ${seg.pct.toFixed(1)}%`}
              className={`h-full flex items-center justify-center transition-opacity cursor-pointer focus:outline-none ${
                idx < breakdown.segments.length - 1 ? 'border-r border-white/80' : ''
              } ${isSelected ? 'ring-2 ring-inset ring-[#231F20]' : ''} ${
                isDimmed ? 'opacity-50 hover:opacity-90' : 'opacity-100'
              }`}
            >
              {seg.pct >= 10 && (
                <span className="text-[11px] font-mono font-semibold text-white px-1 truncate select-none">
                  {seg.pct.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Interactive Breakdown Legend */}
      <div className="divide-y divide-[#ECEEF0] border border-[#E2E5E8] rounded bg-white">
        {breakdown.segments.map((seg) => {
          const isSelected = activeFilterKey === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => onSelectCategory(isSelected ? null : seg.key)}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-xs text-left transition-colors cursor-pointer ${
                isSelected ? 'bg-[#E53C2E]/[0.06]' : 'hover:bg-[#F5F6F7]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className={`truncate ${isSelected ? 'font-semibold text-[#231F20]' : 'font-medium text-[#231F20]'}`}>
                  {seg.label}
                </span>
                <span className="text-[11px] text-[#7E8082] shrink-0">
                  ({seg.count})
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                <span className="font-medium text-[#231F20]">{formatMoney(seg.amountCad)}</span>
                <span className="w-12 text-right text-[#5F6368]">{seg.pct.toFixed(1)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6368]">
        <span>
          {activeSegment
            ? `${activeSegment.label}: ${formatMoney(activeSegment.amountCad)} (${activeSegment.pct.toFixed(1)}% of Q3 trade costs)`
            : 'Click any category segment to filter the 12-entry customs ledger.'}
        </span>
        {activeFilterKey && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
          >
            Clear category filter
          </button>
        )}
      </div>
    </div>
  );
};

interface BrokerAuditChartsProps {
  entries: CustomsEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entry: CustomsEntry) => void;
}

export const BrokerAuditCharts: React.FC<BrokerAuditChartsProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
}) => {
  const { state, formatMoney, formatShortMoney } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const auditData = useMemo(() => {
    let expectedTotal = 0;
    let chargedTotal = 0;
    let grossOvercharge = 0;
    let overchargeCount = 0;
    let undercharge = 0;
    let underchargeCount = 0;
    let exactMatchCount = 0;

    const rows = entries.map((entry) => {
      const expected = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
      const charged = entry.brokerFeeChargedCad;
      const variance = charged - expected;
      expectedTotal += expected;
      chargedTotal += charged;
      if (variance > 0) {
        grossOvercharge += variance;
        overchargeCount += 1;
      } else if (variance < 0) {
        undercharge += variance;
        underchargeCount += 1;
      } else {
        exactMatchCount += 1;
      }
      return { entry, expected, charged, variance };
    });

    const netVariance = chargedTotal - expectedTotal;
    const sortedRows = [...rows].sort((a, b) => {
      if (b.variance !== a.variance) return b.variance - a.variance;
      return a.entry.id.localeCompare(b.entry.id);
    });
    const maxAbsVar = Math.max(100, ...rows.map((r) => Math.abs(r.variance)));

    return {
      expectedTotal,
      chargedTotal,
      grossOvercharge,
      overchargeCount,
      undercharge,
      underchargeCount,
      exactMatchCount,
      netVariance,
      sortedRows,
      maxAbsVar,
    };
  }, [entries]);

  const maxFeeScale = Math.max(1, auditData.expectedTotal, auditData.chargedTotal) * 1.1;
  const pctAboveContract =
    auditData.expectedTotal > 0
      ? ((auditData.chargedTotal - auditData.expectedTotal) / auditData.expectedTotal) * 100
      : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* Visual A: Expected vs Actual Fee Comparison */}
      <div className="xl:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[#231F20]">
            Expected vs. Actual Broker Fees
          </h3>
          <p className="text-[11px] text-[#5F6368]">
            Contractual 0.2% benchmark across {entries.length} matched shipments
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#231F20]">Expected at 0.2% Contract</span>
              <span className="font-mono tabular-nums font-semibold text-[#231F20]">
                {formatMoney(auditData.expectedTotal)}
              </span>
            </div>
            <div className="h-7 bg-[#ECEEF0] rounded overflow-hidden">
              <div
                className="h-full bg-[#231F20] rounded-l transition-all duration-200"
                style={{ width: `${(auditData.expectedTotal / maxFeeScale) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#231F20]">
                Actual Charged ({pctAboveContract >= 0 ? '+' : ''}
                {pctAboveContract.toFixed(1)}% vs. contract)
              </span>
              <span className="font-mono tabular-nums font-semibold text-[#E53C2E]">
                {formatMoney(auditData.chargedTotal)}
              </span>
            </div>
            <div className="h-7 bg-[#ECEEF0] rounded overflow-hidden flex">
              <div
                className="h-full bg-[#231F20]"
                style={{
                  width: `${
                    (Math.min(auditData.expectedTotal, auditData.chargedTotal) / maxFeeScale) * 100
                  }%`,
                }}
                title={`Contract baseline portion: ${formatMoney(auditData.expectedTotal)}`}
              />
              {auditData.netVariance > 0 && (
                <div
                  className="h-full bg-[#E53C2E]"
                  style={{ width: `${(auditData.netVariance / maxFeeScale) * 100}%` }}
                  title={`Net variance above contract: ${formatMoney(auditData.netVariance, { showSign: true })}`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Offset Breakdown */}
        <div className="border border-[#E2E5E8] rounded divide-y divide-[#ECEEF0] bg-[#F8F9FA] text-xs">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[#5F6368]">
              Gross overcharges ({auditData.overchargeCount} entries)
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#DC2626]">
              {formatMoney(auditData.grossOvercharge, { showSign: true })}
            </span>
          </div>
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[#5F6368]">
              Undercharges ({auditData.underchargeCount}{' '}
              {auditData.underchargeCount === 1 ? 'entry · E-11' : 'entries'})
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#16A34A]">
              {formatMoney(auditData.undercharge)}
            </span>
          </div>
          <div className="px-3 py-2 flex items-center justify-between bg-white">
            <span className="font-semibold text-[#231F20]">
              Net variance ({auditData.exactMatchCount} exact matches)
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#231F20]">
              {formatMoney(auditData.netVariance, { showSign: true })}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-[#5F6368]">
          Contractual billing variance flagged for broker review; does not represent recovered cash.
        </p>
      </div>

      {/* Visual B: Diverging Horizontal Variance-by-Entry Chart */}
      <div className="xl:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#231F20]">
              Broker Variance by Shipment Entry ({state.currency})
            </h3>
            <p className="text-[11px] text-[#5F6368]">
              Click any entry bar to open shipment inspection · Zero axis = 0.2% contract baseline
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#5F6368]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A]" />
              Undercharge
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" />
              Overcharge
            </span>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          {/* Column Axis Header */}
          <div className="grid grid-cols-12 items-center text-[10px] font-mono text-[#7E8082] pb-1 border-b border-[#ECEEF0]">
            <div className="col-span-4 sm:col-span-4">Entry · Route</div>
            <div className="col-span-6 sm:col-span-6 flex items-center justify-between px-2">
              <span>{formatShortMoney(-auditData.maxAbsVar)}</span>
              <span className="font-semibold text-[#231F20]">{formatMoney(0)}</span>
              <span>{formatShortMoney(auditData.maxAbsVar, { showSign: true })}</span>
            </div>
            <div className="col-span-2 text-right">Variance</div>
          </div>

          {auditData.sortedRows.map(({ entry, expected, charged, variance }) => {
            const pctHalf = (Math.abs(variance) / auditData.maxAbsVar) * 100;
            const isSelected = selectedEntryId === entry.id;
            const isHovered = hoveredId === entry.id;

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectEntry(entry)}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
                title={`${entry.id} (${entry.route}): Charged ${formatMoney(charged)} vs Expected ${formatMoney(expected)}`}
                className={`w-full grid grid-cols-12 items-center py-1.5 px-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#E53C2E]/[0.06] ring-1 ring-inset ring-[#E53C2E]/40'
                    : isHovered
                      ? 'bg-[#F5F6F7]'
                      : 'hover:bg-[#F8F9FA]'
                }`}
              >
                <div className="col-span-4 pr-2 min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-mono font-semibold text-[#231F20] shrink-0">
                      {entry.id}
                    </span>
                    <span className="text-[11px] text-[#5F6368] truncate">
                      {entry.route}
                    </span>
                  </div>
                </div>

                {/* Diverging Bar Track with Center Zero Line */}
                <div className="col-span-6 px-2">
                  <div className="relative h-5 flex items-center">
                    {/* Left Negative Half */}
                    <div className="w-1/2 h-full flex items-center justify-end pr-0.5">
                      {variance < 0 && (
                        <div
                          className="h-3.5 bg-[#16A34A] rounded-l-xs transition-all duration-200"
                          style={{ width: `${Math.max(4, pctHalf)}%` }}
                        />
                      )}
                    </div>

                    {/* Zero Axis Line */}
                    <div className="w-[1.5px] h-full bg-[#9CA3AF] shrink-0 relative z-10 flex items-center justify-center">
                      {variance === 0 && (
                        <span className="w-2 h-2 rounded-full bg-[#5F6368] border border-white" />
                      )}
                    </div>

                    {/* Right Positive Half */}
                    <div className="w-1/2 h-full flex items-center justify-start pl-0.5">
                      {variance > 0 && (
                        <div
                          className="h-3.5 bg-[#DC2626] rounded-r-xs transition-all duration-200"
                          style={{ width: `${Math.max(4, pctHalf)}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={`col-span-2 text-right font-mono tabular-nums font-semibold text-[11px] ${
                    variance > 0
                      ? 'text-[#DC2626]'
                      : variance < 0
                        ? 'text-[#16A34A]'
                        : 'text-[#5F6368]'
                  }`}
                >
                  {variance === 0
                    ? formatMoney(0)
                    : formatMoney(variance, { showSign: true })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface DomesticProvincialChartProps {
  records: DomesticShipmentRecord[];
}

export const DomesticProvincialChart: React.FC<DomesticProvincialChartProps> = ({
  records,
}) => {
  const { formatMoney, formatCompactMoney } = useApp();
  const [metric, setMetric] = useState<'sales' | 'freight'>('sales');

  const maxSales = Math.max(1, ...records.map((r) => r.salesCad));
  const maxFreight = Math.max(1, ...records.map((r) => r.freightCad));
  const freightTotal = records.reduce((sum, record) => sum + record.freightCad, 0);

  return (
    <div className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#231F20]">
            Provincial Cost &amp; Volume Comparison
          </h3>
          <p className="text-[11px] text-[#5F6368]">
            Five Canadian destinations · All carry {formatMoney(0)} customs duty
          </p>
        </div>
        <div className="inline-flex p-0.5 bg-[#ECEEF0] rounded border border-[#E2E5E8]">
          <button
            type="button"
            onClick={() => setMetric('sales')}
            className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
              metric === 'sales' ? 'bg-white text-[#231F20] shadow-2xs' : 'text-[#5F6368]'
            }`}
          >
            Domestic Sales
          </button>
          <button
            type="button"
            onClick={() => setMetric('freight')}
            className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
              metric === 'freight' ? 'bg-white text-[#231F20] shadow-2xs' : 'text-[#5F6368]'
            }`}
          >
            Freight
          </button>
        </div>
      </div>

      <div className="space-y-2.5 pt-1">
        {records.map((r) => {
          const freightPct = (r.freightCad / maxFreight) * 100;
          const salesPct = (r.salesCad / maxSales) * 100;

          return (
            <div key={r.id} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-[#231F20]">
                  {r.destination}{' '}
                  <span className="text-[11px] font-normal text-[#5F6368]">
                    ({r.taxRuleSimplified})
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[#231F20] font-semibold">
                  {metric === 'freight' ? formatMoney(r.freightCad) : formatCompactMoney(r.salesCad)}
                </span>
              </div>

              <div className="h-2.5 bg-[#ECEEF0] rounded overflow-hidden">
                <div
                  className={`h-full rounded ${metric === 'freight' ? 'bg-[#E53C2E]' : 'bg-[#231F20]'}`}
                  style={{ width: `${metric === 'freight' ? freightPct : salesPct}%` }}
                  title={metric === 'freight' ? `Domestic Freight: ${formatMoney(r.freightCad)}` : `Domestic Sales: ${formatMoney(r.salesCad)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {metric === 'freight' && (
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#5F6368] pt-1 border-t border-[#ECEEF0]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#E53C2E]" />
            Domestic Freight ({formatMoney(freightTotal)})
          </span>
        </div>
      )}
    </div>
  );
};
