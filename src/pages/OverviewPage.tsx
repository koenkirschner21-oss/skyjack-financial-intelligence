import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Compass,
  FileCheck2,
  Globe2,
  ShieldAlert,
  Ship,
  Sliders,
  UploadCloud,
} from 'lucide-react';
import {
  BROKER_CONTRACT_SUMMARY_Q3_2026,
  HISTORICAL_TRADE_COSTS,
  INCOME_STATEMENTS,
  QUARTERLY_TRADE_SUMMARY_Q3_2026,
  REGIONAL_SALES,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import {
  buildCostOpportunities,
  computeOpportunityAnalytics,
  OPPORTUNITY_CATEGORY_META,
} from '../domain/opportunityEngine';
import { computeQuarterEndReadiness } from '../domain/readinessEngine';
import {
  EightQuarterPerformanceChart,
  RegionalComparisonChart,
  TradeCostTrendChart,
} from '../components/charts/FinancialCharts';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';
import { QuarterEndReadinessPanel } from '../components/intelligence/QuarterEndReadinessPanel';
import { buildNeedsAttentionQueue } from '../components/overview/overviewViewModels';

const SEVERITY_BADGE: Record<'high' | 'medium' | 'info', string> = {
  high: 'text-[#DC2626] bg-red-50 border-red-200',
  medium: 'text-amber-800 bg-amber-50 border-amber-300',
  info: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]',
};

export const OverviewPage: React.FC = () => {
  const {
    state,
    activeUser,
    navigate,
    setQuarterFilter,
    setRegionFilter,
    scopedIrregularCosts,
    scopedCustomsEntries,
    groupedAlerts,
    authorizedAnalytics,
    openDrawer,
    openRecordById,
    hasPermission,
    formatMoney,
    formatCompactMoney,
    formatShortMoney,
    formatOverviewMoney,
  } = useApp();

  // Default 8-quarter trend metric to Operating Earnings
  const [chartMode, setChartMode] = useState<'sales' | 'operating_earnings' | 'margin'>('operating_earnings');
  const [showReadinessDetail, setShowReadinessDetail] = useState(false);

  const canOpenFinancials = hasPermission('view_financials');
  const canOpenTrade = hasPermission('view_trade');
  const canRunSimulator = hasPermission('run_tariff_simulator');
  const canOpenGlobalOps = hasPermission('view_global_operations');
  const canOpenOpportunities = hasPermission('view_opportunities');
  const isContributor = activeUser.roleId === 'operational_contributor';
  const isTradeCoordinator = activeUser.roleId === 'trade_coordinator';

  const selectedPeriod = useMemo(
    () => REPORTING_PERIODS.find((p) => p.id === state.selectedQuarterId) ?? REPORTING_PERIODS[7],
    [state.selectedQuarterId]
  );

  const currentStatement = useMemo(
    () => INCOME_STATEMENTS.find((s) => s.quarterId === state.selectedQuarterId) ?? INCOME_STATEMENTS[7],
    [state.selectedQuarterId]
  );

  const priorYearStatement = useMemo(
    () =>
      selectedPeriod.priorYearQuarterId
        ? INCOME_STATEMENTS.find((s) => s.quarterId === selectedPeriod.priorYearQuarterId)
        : undefined,
    [selectedPeriod]
  );

  const priorQuarterStatement = useMemo(
    () =>
      selectedPeriod.priorQuarterId
        ? INCOME_STATEMENTS.find((s) => s.quarterId === selectedPeriod.priorQuarterId)
        : undefined,
    [selectedPeriod]
  );

  const selectedHistoricalTrade = useMemo(
    () => HISTORICAL_TRADE_COSTS.find((h) => h.quarterId === state.selectedQuarterId),
    [state.selectedQuarterId]
  );

  const selectedRegionalSale = useMemo(() => {
    if (state.selectedRegionId === 'all' || !selectedPeriod.hasRegionalSalesBreakdown) return null;
    return REGIONAL_SALES.find((r) => r.regionId === state.selectedRegionId) ?? null;
  }, [state.selectedRegionId, selectedPeriod]);

  const filteredIrregularCosts = useMemo(() => {
    if (!selectedPeriod.hasIrregularCostBreakdown) return [];
    if (state.selectedRegionId === 'all') return scopedIrregularCosts;
    return scopedIrregularCosts.filter((c) => c.regionId === state.selectedRegionId);
  }, [selectedPeriod, state.selectedRegionId, scopedIrregularCosts]);

  const totalIrregularVisibleCad = useMemo(
    () => filteredIrregularCosts.reduce((sum, c) => sum + c.amountCad, 0),
    [filteredIrregularCosts]
  );

  const oneTimeIrregularCount = useMemo(
    () => filteredIrregularCosts.filter((c) => c.timing === 'One-time').length,
    [filteredIrregularCosts]
  );

  const trendIrregularCount = useMemo(
    () => filteredIrregularCosts.filter((c) => c.timing === 'Trend').length,
    [filteredIrregularCosts]
  );

  const salesYoYPct = useMemo(() => {
    if (!priorYearStatement) return null;
    return ((currentStatement.salesCad - priorYearStatement.salesCad) / priorYearStatement.salesCad) * 100;
  }, [currentStatement, priorYearStatement]);

  const salesQoQPct = useMemo(() => {
    if (!priorQuarterStatement) return null;
    return ((currentStatement.salesCad - priorQuarterStatement.salesCad) / priorQuarterStatement.salesCad) * 100;
  }, [currentStatement, priorQuarterStatement]);

  const oeYoYDelta = priorYearStatement
    ? currentStatement.operatingEarningsCad - priorYearStatement.operatingEarningsCad
    : null;
  const oeQoQDelta = priorQuarterStatement
    ? currentStatement.operatingEarningsCad - priorQuarterStatement.operatingEarningsCad
    : null;

  const marginYoYDeltaPp = priorYearStatement
    ? currentStatement.oeShareOfSalesPct - priorYearStatement.oeShareOfSalesPct
    : null;
  const marginQoQDeltaPp = priorQuarterStatement
    ? currentStatement.oeShareOfSalesPct - priorQuarterStatement.oeShareOfSalesPct
    : null;

  const isExactTradePeriod = state.selectedQuarterId === 'Q3 2026';
  const tradeKpiValueCad = isExactTradePeriod
    ? QUARTERLY_TRADE_SUMMARY_Q3_2026.totalTradeCostCad
    : (selectedHistoricalTrade?.totalRoundedCad ?? 0);

  // Deduplicated, role-scoped Needs Attention queue (3-5 items)
  const attentionQueue = useMemo(
    () =>
      buildNeedsAttentionQueue({
        state,
        activeUser,
        groupedAlerts,
        scopedIrregularCosts,
        scopedCustomsEntries,
        maxItems: 5,
        currency: state.currency,
      }),
    [state, activeUser, groupedAlerts, scopedIrregularCosts, scopedCustomsEntries]
  );

  // Layer 3A: Quarter-End Readiness snapshot
  const readiness = useMemo(
    () => computeQuarterEndReadiness(state, activeUser, state.selectedQuarterId, state.currency),
    [state, activeUser]
  );

  const invIndicator = readiness.indicators.find((i) => i.id === 'ind-investigations');
  const aprIndicator = readiness.indicators.find((i) => i.id === 'ind-approvals');
  const quarIndicator = readiness.indicators.find((i) => i.id === 'ind-quarantine');
  const evIndicator = readiness.indicators.find((i) => i.id === 'ind-evidence');

  // Layer 3B: Cost Opportunities (strict non-overlapping category breakdown)
  const opportunities = useMemo(
    () => (canOpenOpportunities ? buildCostOpportunities(state, activeUser) : []),
    [canOpenOpportunities, state, activeUser]
  );
  const oppAnalytics = useMemo(() => computeOpportunityAnalytics(opportunities), [opportunities]);

  const highlightedOpportunities = useMemo(() => {
    if (!opportunities.length) return [];
    const priorityOrder = [
      'opp-ir03-duplicate',
      'opp-fta-cusma-e08',
      'opp-broker-overcharge-e04',
      'opp-ir02-freight-reclass',
    ];
    const picked = [...opportunities].sort((a, b) => {
      const aIdx = priorityOrder.indexOf(a.id);
      const bIdx = priorityOrder.indexOf(b.id);
      const aRank = aIdx === -1 ? 99 : aIdx;
      const bRank = bIdx === -1 ? 99 : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return b.estimatedAmountCad - a.estimatedAmountCad;
    });
    return picked.slice(0, 3);
  }, [opportunities]);

  // Trade Exception Spotlight (1 high-signal clickable entry)
  const tradeSpotlightEntry = useMemo(() => {
    if (!scopedCustomsEntries.length) return null;
    return (
      scopedCustomsEntries.find((e) => e.id === 'E-08') ??
      scopedCustomsEntries.find((e) => e.id === 'E-04') ??
      scopedCustomsEntries[0]
    );
  }, [scopedCustomsEntries]);

  // Operational Contributor scoped views
  const myRequests = useMemo(
    () => state.approvalRequests.filter((r) => r.requestedByUserId === activeUser.id),
    [state.approvalRequests, activeUser.id]
  );
  const myOpenRequests = useMemo(
    () => myRequests.filter((r) => r.resolutionStatus === 'Open'),
    [myRequests]
  );
  const scopedMissingEvidenceCount = useMemo(() => {
    const allowedIds = new Set(scopedIrregularCosts.map((c) => c.id));
    return state.evidence.filter(
      (ev) =>
        allowedIds.has(ev.linkedRecordId) &&
        (ev.status === 'missing_in_case' || ev.status === 'pending_verification')
    ).length;
  }, [state.evidence, scopedIrregularCosts]);

  const hasNonDefaultFilters =
    state.selectedQuarterId !== 'Q3 2026' || state.selectedRegionId !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Overview"
        subtitle="Financial performance, risks, and priorities."
        actions={
          hasNonDefaultFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuarterFilter('Q3 2026');
                setRegionFilter('all');
              }}
              className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] transition-colors whitespace-nowrap cursor-pointer"
            >
              Reset to Q3 2026 Baseline
            </button>
          ) : undefined
        }
      />

      {/* ================================================================== */}
      {/* LAYER 1 — FINANCIAL PULSE (4 primary role-scoped KPI cards)         */}
      {/* ================================================================== */}
      <section aria-label="Financial Pulse">
        {canOpenFinancials ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {/* KPI 1: Total Sales */}
            <button
              type="button"
              title={`Exact ${state.selectedQuarterId} Total Sales: ${formatMoney(currentStatement.salesCad)}`}
              onClick={() => navigate('/financials')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Total Sales</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId} · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {formatOverviewMoney(currentStatement.salesCad)}
                </div>
                {selectedRegionalSale ? (
                  <div className="text-[11px] text-[#5F6368] mt-0.5 truncate tabular-nums">
                    {selectedRegionalSale.regionName}: {formatOverviewMoney(selectedRegionalSale.salesCurrentCad)} (+{selectedRegionalSale.changePctReported.toFixed(1)}% YoY)
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                    {formatMoney(currentStatement.salesCad)}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] tabular-nums">
                <span className={salesYoYPct !== null && salesYoYPct >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  YoY {salesYoYPct !== null ? `${salesYoYPct >= 0 ? '+' : ''}${salesYoYPct.toFixed(1)}%` : 'N/A'}
                </span>
                <span className={salesQoQPct !== null && salesQoQPct >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  QoQ {salesQoQPct !== null ? `${salesQoQPct >= 0 ? '+' : ''}${salesQoQPct.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </button>

            {/* KPI 2: Operating Earnings */}
            <button
              type="button"
              title={`Exact ${state.selectedQuarterId} Operating Earnings: ${formatMoney(currentStatement.operatingEarningsCad)}`}
              onClick={() => navigate('/financials')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Operating Earnings</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId} · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {formatOverviewMoney(currentStatement.operatingEarningsCad)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {formatMoney(currentStatement.operatingEarningsCad)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] tabular-nums">
                <span className={oeYoYDelta !== null && oeYoYDelta >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  YoY {oeYoYDelta !== null ? formatOverviewMoney(oeYoYDelta, { showSign: true }) : 'N/A'}
                </span>
                <span className={oeQoQDelta !== null && oeQoQDelta >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  QoQ {oeQoQDelta !== null ? formatOverviewMoney(oeQoQDelta, { showSign: true }) : 'N/A'}
                </span>
              </div>
            </button>

            {/* KPI 3: Operating Margin */}
            <button
              type="button"
              title={`Operating Earnings as % of Sales (${state.selectedQuarterId}): ${currentStatement.oeShareOfSalesPct.toFixed(1)}%`}
              onClick={() => navigate('/financials')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Operating Margin</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {currentStatement.oeShareOfSalesPct.toFixed(1)}%
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  OE share of sales (Appendix 1.1)
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] tabular-nums">
                <span className={marginYoYDeltaPp !== null && marginYoYDeltaPp >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  YoY {marginYoYDeltaPp !== null ? `${marginYoYDeltaPp >= 0 ? '+' : ''}${marginYoYDeltaPp.toFixed(1)} pp` : 'N/A'}
                </span>
                <span className={marginQoQDeltaPp !== null && marginQoQDeltaPp >= 0 ? 'text-[#16A34A] font-medium' : 'text-[#5F6368]'}>
                  QoQ {marginQoQDeltaPp !== null ? `${marginQoQDeltaPp >= 0 ? '+' : ''}${marginQoQDeltaPp.toFixed(1)} pp` : 'N/A'}
                </span>
              </div>
            </button>

            {/* KPI 4: Irregular Costs */}
            <button
              type="button"
              title={
                selectedPeriod.hasIrregularCostBreakdown
                  ? `Exact irregular costs in scope: ${formatMoney(totalIrregularVisibleCad)} across ${filteredIrregularCosts.length} records`
                  : `Appendix 2.1/2.3 irregular cost log is supplied only for Q3 2026`
              }
              onClick={() => navigate('/investigations')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Irregular Costs</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">
                    {selectedPeriod.hasIrregularCostBreakdown ? `${state.selectedQuarterId} · ${state.currency}` : 'Q3 2026 Only'}
                  </span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {selectedPeriod.hasIrregularCostBreakdown
                    ? formatOverviewMoney(totalIrregularVisibleCad)
                    : 'Not supplied'}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {selectedPeriod.hasIrregularCostBreakdown
                    ? formatMoney(totalIrregularVisibleCad)
                    : `No Appendix 2.1 log for ${state.selectedQuarterId}`}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] tabular-nums text-[#5F6368]">
                {selectedPeriod.hasIrregularCostBreakdown ? (
                  <>
                    <span>{filteredIrregularCosts.length} flagged records</span>
                    <span>
                      {oneTimeIrregularCount} one-time · {trendIrregularCount} trend
                    </span>
                  </>
                ) : (
                  <>
                    <span>Authorized uploads: {formatCompactMoney(authorizedAnalytics.ledgerSelectedPeriodCad)}</span>
                    <span className="text-[#E53C2E] font-medium">View Q3 log</span>
                  </>
                )}
              </div>
            </button>
          </div>
        ) : isTradeCoordinator ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <button
              type="button"
              title={`Exact ${state.selectedQuarterId} Trade Costs: ${formatMoney(tradeKpiValueCad)}`}
              onClick={() => navigate('/trade')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Total Trade Costs</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId} · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {formatOverviewMoney(tradeKpiValueCad)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {formatMoney(tradeKpiValueCad)} {isExactTradePeriod ? '(Exact)' : '(000s Series)'}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] text-[#5F6368] tabular-nums">
                <span>
                  YoY:{' '}
                  {selectedHistoricalTrade?.yoyChangeRoundedCad != null
                    ? formatShortMoney(selectedHistoricalTrade.yoyChangeRoundedCad, { showSign: true })
                    : 'N/A'}
                </span>
                <span>{isExactTradePeriod ? '12 customs entries' : 'Historical total'}</span>
              </div>
            </button>

            <button
              type="button"
              title="China-origin 25% additional tariffs across E-04, E-05, E-06 (Q3 2026)"
              onClick={() => navigate('/simulator')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">China Additional Tariffs</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Q3 2026 · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {formatOverviewMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.extraTariffsChinaCad)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  25% rate · {formatCompactMoney(2_100_000)} dutiable goods
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] text-[#5F6368]">
                <span>E-04, E-05, E-06</span>
                <span className="text-[#E53C2E] font-medium">Run simulator</span>
              </div>
            </button>

            <button
              type="button"
              title="Q3 2026 broker fees charged vs 0.2% contract threshold"
              onClick={() => navigate('/trade')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Broker Net Variance</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Q3 2026 · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#DC2626] tabular-nums whitespace-nowrap mt-1.5">
                  {formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.netOverContractCad, { showSign: true })}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  Charged {formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.feesChargedCad)} vs {formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.feesAtContractCad)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] text-[#5F6368] tabular-nums">
                <span>Over: {formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.grossOverchargesCad, { showSign: true })}</span>
                <span>Under: {formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.underchargesCad)}</span>
              </div>
            </button>

            <button
              type="button"
              title={`Scoped Customs & Logistics irregular costs: ${formatMoney(totalIrregularVisibleCad)}`}
              onClick={() => navigate('/investigations')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Scoped Trade Anomalies</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">
                    {selectedPeriod.hasIrregularCostBreakdown ? `Q3 2026 · ${state.currency}` : 'Q3 2026 Only'}
                  </span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {selectedPeriod.hasIrregularCostBreakdown
                    ? formatOverviewMoney(totalIrregularVisibleCad)
                    : 'Not supplied'}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  Logistics &amp; Customs scope ({filteredIrregularCosts.length} records)
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px] text-[#5F6368]">
                <span>IR-02 · IR-07</span>
                <span className="text-[#E53C2E] font-medium">Open queue</span>
              </div>
            </button>
          </div>
        ) : (
          /* Operational Contributor Scoped KPI Row (zero restricted corporate financials) */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => navigate('/data-gateway')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">NA Operations &amp; Logistics</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Q3 2026 · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums mt-1.5">
                  {selectedPeriod.hasIrregularCostBreakdown
                    ? formatOverviewMoney(totalIrregularVisibleCad)
                    : 'Q3 2026 Only'}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  {filteredIrregularCosts.length} scoped North America anomalies
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] text-[#5F6368]">
                Plant 2 scrap &amp; yard rush freight
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/data-gateway')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Staged Import Batches</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Data Gateway</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums mt-1.5">
                  {state.importBatches.length}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  {authorizedAnalytics.openQuarantinedCount} quarantined items pending review
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] text-[#E53C2E] font-medium">
                Stage CSV / XLSX files
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/approvals')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">My Correction Requests</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Governance</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums mt-1.5">
                  {myOpenRequests.length}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  {myRequests.length} total requests submitted
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] text-[#5F6368]">
                Segregation of duties enforced
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/data-gateway')}
              className="h-full text-left bg-white border border-[#E2E5E8] rounded-md p-4 hover:border-[#7E8082] transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5F6368]">Scoped Evidence Gaps</span>
                  <span className="text-[11px] font-mono text-[#5F6368]">Operations</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums mt-1.5">
                  {scopedMissingEvidenceCount}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  Supporting documents needed in scope
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] text-[#5F6368]">
                Controller sign-off required for close
              </div>
            </button>
          </div>
        )}
      </section>

      {/* ================================================================== */}
      {/* LAYER 2 — PERFORMANCE & PRIORITIES (62% Left / 38% Right)          */}
      {/* ================================================================== */}
      <section
        aria-label="Performance and Priorities"
        className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] gap-4 items-stretch"
      >
        {/* Left Column: 8-Quarter Financial Chart (or Trade / Contributor view) */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
          {canOpenFinancials ? (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#231F20]">
                      Eight-Quarter Financial Trajectory
                    </h2>
                    <p className="text-xs text-[#5F6368] mt-0.5">
                      Q4 2024 – Q3 2026 ({state.currency}). Click any quarter bar or point to synchronize the dashboard.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex bg-[#F5F6F7] p-0.5 rounded-md border border-[#E2E5E8] text-xs">
                      {(
                        [
                          { id: 'operating_earnings', label: 'Operating Earnings' },
                          { id: 'sales', label: 'Sales' },
                          { id: 'margin', label: 'OE Margin %' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setChartMode(tab.id)}
                          className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer whitespace-nowrap ${
                            chartMode === tab.id
                              ? 'bg-[#231F20] text-white font-medium'
                              : 'text-[#5F6368] hover:text-[#231F20]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <EightQuarterPerformanceChart
                  statements={INCOME_STATEMENTS}
                  selectedQuarterId={state.selectedQuarterId}
                  onSelectQuarter={setQuarterFilter}
                  mode={chartMode}
                />
              </div>

              <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#5F6368]">
                  Appendix 1.1 quarterly income statement series (000s normalized to CAD)
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/financials')}
                  className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
                >
                  <span>Open Financial Intelligence</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : isTradeCoordinator ? (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#231F20]">
                      Eight-Quarter Trade Cost Trajectory
                    </h2>
                    <p className="text-xs text-[#5F6368] mt-0.5">
                      Duty, tariff, and broker fees from Q4 2024 to Q3 2026 (extra tariffs begin Q1 2026).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/simulator')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] cursor-pointer whitespace-nowrap"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#E53C2E]" />
                    <span>Tariff Simulator</span>
                  </button>
                </div>

                <TradeCostTrendChart
                  history={HISTORICAL_TRADE_COSTS}
                  selectedQuarterId={state.selectedQuarterId}
                  onSelectQuarter={setQuarterFilter}
                />
              </div>

              <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#5F6368]">
                  Appendix 3.6 rounded series; Q3 2026 exact table total {formatMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.totalTradeCostCad)}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/trade')}
                  className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
                >
                  <span>Open Shipments &amp; Trade</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            /* Operational Contributor left panel */
            <>
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#231F20]">
                      Scoped Operations Records &amp; Gateway Staging
                    </h2>
                    <p className="text-xs text-[#5F6368] mt-0.5">
                      Permitted North America operations anomalies and your Data Gateway upload batches.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/data-gateway')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] cursor-pointer whitespace-nowrap"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-[#E53C2E]" />
                    <span>Stage Upload</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {scopedIrregularCosts.map((cost) => (
                    <button
                      key={cost.id}
                      type="button"
                      onClick={() => openDrawer({ type: 'irregular_cost', record: cost })}
                      className="w-full text-left p-3.5 bg-[#F5F6F7]/70 hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#E53C2E]">{cost.id}</span>
                          <span className="font-medium text-[#231F20] truncate">{cost.item}</span>
                        </div>
                        <div className="text-[11px] text-[#5F6368] mt-1">
                          {cost.department} · {cost.regionName} · {cost.timing}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-semibold text-[#231F20] tabular-nums">
                          {formatMoney(cost.amountCad)}
                        </div>
                        <div className="text-[11px] text-[#E53C2E] mt-0.5">Inspect details</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-between text-xs">
                <span className="text-[#5F6368]">
                  Corporate P&amp;L and customs records require Controller or specialist permissions
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/data-gateway')}
                  className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer"
                >
                  <span>Open Data Gateway</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Needs Attention (3-5 deduplicated high-priority actions) */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3 mb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#E53C2E]" />
                  <h2 className="text-sm font-semibold text-[#231F20]">Needs Attention</h2>
                </div>
                <p className="text-xs text-[#5F6368] mt-0.5">
                  Top {attentionQueue.length} deduplicated priorities in your role scope.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#5F6368] tabular-nums shrink-0">
                {attentionQueue.length} active
              </span>
            </div>

            {attentionQueue.length === 0 ? (
              <div className="p-4 bg-[#F5F6F7] border border-[#E2E5E8] rounded-md text-xs text-[#5F6368]">
                No unresolved high-priority items in your active scope.
              </div>
            ) : (
              <div className="divide-y divide-[#F0F1F3]">
                {attentionQueue.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.actionType === 'drawer') {
                        const opened = openRecordById(item.recordId);
                        if (opened) return;
                      }
                      navigate(item.routeTarget);
                    }}
                    className="w-full text-left py-3 first:pt-1 last:pb-1 hover:bg-[#F5F6F7]/80 -mx-2 px-2 rounded transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-[#E53C2E] shrink-0">
                          {item.recordId}
                        </span>
                        <span className="text-[11px] text-[#5F6368] truncate">
                          · {item.categoryLabel}
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded border shrink-0 ${SEVERITY_BADGE[item.severity]}`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-[#231F20] mt-1 line-clamp-1 group-hover:text-[#E53C2E] transition-colors">
                      {item.title}
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono tabular-nums text-[#5F6368]">
                        {item.amountLabel ?? 'Governance review'}
                      </span>
                      <span className="text-[#231F20] font-medium inline-flex items-center gap-0.5 shrink-0">
                        {item.actionLabel}
                        <ArrowRight className="w-3 h-3 text-[#5F6368] group-hover:text-[#E53C2E]" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-between text-xs">
            <span className="text-[#5F6368]">
              {isContributor ? 'Operations & Gateway queue' : 'Deduplicated across alerts, approvals & close'}
            </span>
            <button
              type="button"
              onClick={() => navigate(isContributor ? '/data-gateway' : '/investigations')}
              className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
            >
              <span>{isContributor ? 'Open Data Gateway' : 'View all investigations'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* LAYER 3 — READINESS & OPPORTUNITIES (2 Equal-Height Cards)         */}
      {/* ================================================================== */}
      <section
        aria-label="Quarter-End Readiness and Cost Opportunities"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
      >
        {/* Card A: Quarter-End Readiness (compact summary + progressive disclosure) */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-[#E53C2E]" />
                <h2 className="text-sm font-semibold text-[#231F20]">
                  Quarter-End Readiness ({readiness.quarterId})
                </h2>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded border ${
                  readiness.totalBlockingCount === 0
                    ? 'text-[#16A34A] bg-emerald-50 border-emerald-200'
                    : 'text-amber-800 bg-amber-50 border-amber-300'
                }`}
              >
                {readiness.totalBlockingCount === 0
                  ? 'Close Ready'
                  : `${readiness.totalBlockingCount} open governance items`}
              </span>
            </div>

            <p className="text-xs text-[#5F6368] mt-1">
              Non-overlapping close checklist summed across investigations, approvals, quarantine, and evidence gaps.
            </p>

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => navigate(isContributor ? '/data-gateway' : '/investigations')}
                className="text-left p-3 bg-[#F5F6F7]/70 hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer"
              >
                <div className="text-[11px] text-[#5F6368]">Scoped Investigations</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                    {invIndicator?.unresolvedCount ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5F6368] tabular-nums">
                    of {invIndicator?.totalCount ?? 0} open
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/approvals')}
                className="text-left p-3 bg-[#F5F6F7]/70 hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer"
              >
                <div className="text-[11px] text-[#5F6368]">Pending Approvals</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                    {aprIndicator?.unresolvedCount ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5F6368] tabular-nums">
                    awaiting sign-off
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/data-gateway')}
                className="text-left p-3 bg-[#F5F6F7]/70 hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer"
              >
                <div className="text-[11px] text-[#5F6368]">Quarantined Imports</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                    {quarIndicator?.unresolvedCount ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5F6368]">held out of totals</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate(isContributor ? '/data-gateway' : '/investigations')}
                className="text-left p-3 bg-[#F5F6F7]/70 hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer"
              >
                <div className="text-[11px] text-[#5F6368]">Missing Evidence</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                    {evIndicator?.unresolvedCount ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5F6368]">pending verification</span>
                </div>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowReadinessDetail((v) => !v)}
              aria-expanded={showReadinessDetail}
              className="inline-flex items-center gap-1.5 font-medium text-[#231F20] hover:text-[#E53C2E] transition-colors cursor-pointer"
            >
              <span>{showReadinessDetail ? 'Hide detailed indicators & AI briefing' : 'Inspect 6 close indicators & AI briefing'}</span>
              {showReadinessDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/approvals')}
                className="font-medium text-[#5F6368] hover:text-[#231F20] cursor-pointer"
              >
                Approvals
              </button>
              <button
                type="button"
                onClick={() => navigate(isContributor ? '/data-gateway' : '/investigations')}
                className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer"
              >
                <span>{isContributor ? 'Data Gateway' : 'Investigations'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Card B: Cost Opportunities (or Scoped Governance Actions for Contributor) */}
        {canOpenOpportunities ? (
          <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#E53C2E]" />
                  <h2 className="text-sm font-semibold text-[#231F20]">Cost Opportunities</h2>
                </div>
                <span className="text-[11px] font-mono text-[#5F6368] tabular-nums">
                  {opportunities.length} tracked · {oppAnalytics.outstandingVerificationsCount} unverified
                </span>
              </div>

              <p className="text-xs text-[#5F6368] mt-1">
                Strictly separated by impact type so cash recoveries, non-cash corrections, and avoidable losses are never conflated.
              </p>

              {/* Separated Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                <div className="p-2.5 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md">
                  <div className="text-[11px] text-[#5F6368] truncate">Cash Recoveries</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#231F20] mt-0.5">
                    {formatCompactMoney(
                      oppAnalytics.potentialCashRecoveryCad +
                        oppAnalytics.brokerDiscrepancyGrossCad
                    )}
                  </div>
                </div>
                {canOpenFinancials && (
                  <div className="p-2.5 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md">
                    <div className="text-[11px] text-[#5F6368] truncate">Accounting Adj.</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-[#231F20] mt-0.5">
                      {formatOverviewMoney(oppAnalytics.accountingAdjustmentExposureCad)}
                    </div>
                  </div>
                )}
                <div className="p-2.5 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md">
                  <div className="text-[11px] text-[#5F6368] truncate">Avoidable Costs</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#231F20] mt-0.5">
                    {formatOverviewMoney(oppAnalytics.avoidableOperatingCostCad)}
                  </div>
                </div>
                <div className="p-2.5 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md">
                  <div className="text-[11px] text-[#5F6368] truncate">Verified / Realized</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#16A34A] mt-0.5">
                    {formatCompactMoney(oppAnalytics.totalVerifiedCad)} / {formatCompactMoney(oppAnalytics.totalRealizedCad)}
                  </div>
                </div>
              </div>

              {/* Top 3 Highlighted Opportunities */}
              <div className="mt-3.5 divide-y divide-[#F0F1F3]">
                {highlightedOpportunities.map((opp) => {
                  const meta = OPPORTUNITY_CATEGORY_META[opp.category];
                  return (
                    <button
                      key={opp.id}
                      type="button"
                      onClick={() => {
                        if (opp.sourceRecordId && openRecordById(opp.sourceRecordId)) return;
                        navigate('/opportunities');
                      }}
                      className="w-full text-left py-2.5 first:pt-1 last:pb-1 hover:bg-[#F5F6F7]/80 -mx-2 px-2 rounded transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#231F20] truncate">
                          {opp.title}
                        </div>
                        <div className="text-[11px] text-[#5F6368] mt-0.5 flex items-center gap-1.5">
                          <span>{meta.shortLabel}</span>
                          <span>·</span>
                          <span>{opp.status}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-semibold tabular-nums text-[#231F20]">
                          {formatMoney(opp.estimatedAmountCad)}
                        </div>
                        <div className="text-[10px] text-[#5F6368]">{opp.financialImpactType}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-between text-xs">
              <span className="text-[#5F6368]">
                {canRunSimulator ? 'Hypothetical scenarios tracked separately in Simulator' : 'Requires verification before realization'}
              </span>
              <button
                type="button"
                onClick={() => navigate('/opportunities')}
                className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
              >
                <span>Open Cost Opportunities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#E53C2E]" />
                <h2 className="text-sm font-semibold text-[#231F20]">
                  Operational Submission &amp; Governance Workflow
                </h2>
              </div>
              <p className="text-xs text-[#5F6368] mt-1">
                Stage new plant files in the Data Gateway or submit reclassification requests for Controller review.
              </p>
              <div className="mt-4 space-y-2 text-xs text-[#231F20]">
                <div className="p-3 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md flex items-center justify-between">
                  <span>Open correction requests submitted by {activeUser.name}</span>
                  <span className="font-mono font-semibold tabular-nums">{myOpenRequests.length}</span>
                </div>
                <div className="p-3 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md flex items-center justify-between">
                  <span>Authorized uploaded ledger rows committed to trusted baseline</span>
                  <span className="font-mono font-semibold tabular-nums">{authorizedAnalytics.ledgerCount}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => navigate('/approvals')}
                className="font-medium text-[#231F20] hover:underline cursor-pointer"
              >
                Track My Approvals
              </button>
              <button
                type="button"
                onClick={() => navigate('/data-gateway')}
                className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer"
              >
                <span>Open Data Gateway</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Progressive Disclosure: Full 6-Indicator Readiness Panel + AI Briefing */}
      {showReadinessDetail && (
        <QuarterEndReadinessPanel />
      )}

      {/* ================================================================== */}
      {/* LAYER 4 — SUPPORTING ANALYTICS (2 Compact Cards Only)              */}
      {/* ================================================================== */}
      {!isContributor && (
        <section
          aria-label="Supporting Regional and Trade Analytics"
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
        >
          {/* Card A: Regional Performance */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-[#E53C2E]" />
                    <h2 className="text-sm font-semibold text-[#231F20]">Regional Performance</h2>
                  </div>
                  <p className="text-xs text-[#5F6368] mt-0.5">
                    {state.selectedQuarterId === 'Q3 2026'
                      ? `Q3 2026 vs Q3 2025 regional sales (${state.currency}). Click a region to cross-filter.`
                      : selectedPeriod.hasRegionalSalesBreakdown
                        ? `Appendix 1.4 Q3 2026 vs Q3 2025 regional comparison (${state.currency}). Click a region to cross-filter.`
                        : `Regional breakdown is not supplied in Appendix 1.4 for ${state.selectedQuarterId}.`}
                  </p>
                </div>
                {state.selectedRegionId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setRegionFilter('all')}
                    className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
                  >
                    Clear region
                  </button>
                )}
              </div>

              {selectedPeriod.hasRegionalSalesBreakdown ? (
                <RegionalComparisonChart
                  sales={REGIONAL_SALES}
                  selectedRegionId={state.selectedRegionId}
                  onSelectRegion={(rid) =>
                    setRegionFilter(state.selectedRegionId === rid ? 'all' : rid)
                  }
                />
              ) : (
                <UnavailableDataState
                  title={`No regional sales table for ${state.selectedQuarterId}`}
                  description="Appendix 1.4 provides regional sales comparisons only for Q3 2025 and Q3 2026."
                  actionLabel="Switch to Q3 2026"
                  onAction={() => setQuarterFilter('Q3 2026')}
                />
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-between text-xs">
              <span className="text-[#5F6368]">
                {selectedPeriod.hasRegionalSalesBreakdown
                  ? `Sum matches Q3 2026 sales (${formatCompactMoney(329_700_000)})`
                  : 'All-quarter totals remain visible in KPIs above'}
              </span>
              {canOpenGlobalOps && (
                <button
                  type="button"
                  onClick={() => navigate('/global-operations')}
                  className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
                >
                  <span>Open Global Operations</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Card B: Trade Intelligence Summary (no 12-row customs or domestic tables) */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Ship className="w-4 h-4 text-[#E53C2E]" />
                    <h2 className="text-sm font-semibold text-[#231F20]">Trade Intelligence</h2>
                  </div>
                  <p className="text-xs text-[#5F6368] mt-0.5">
                    Duty, China tariff, and brokerage cost summary ({state.selectedQuarterId}).
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#5F6368] whitespace-nowrap">
                  {selectedHistoricalTrade?.extraTariffsActive
                    ? '25% China tariff active'
                    : 'Pre-tariff regime'}
                </span>
              </div>

              <div className="p-3.5 bg-[#F5F6F7]/70 border border-[#E2E5E8] rounded-md flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-[11px] text-[#5F6368]">
                    {isExactTradePeriod ? 'Exact Q3 2026 Trade Cost' : `${state.selectedQuarterId} Trade Cost (000s)`}
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums text-[#231F20] mt-0.5">
                    {formatMoney(tradeKpiValueCad)}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums">
                  <div className="font-mono text-[#231F20]">
                    YoY:{' '}
                    {selectedHistoricalTrade?.yoyChangeRoundedCad != null
                      ? formatShortMoney(selectedHistoricalTrade.yoyChangeRoundedCad, { showSign: true })
                      : 'N/A'}
                  </div>
                  <div className="text-[11px] text-[#5F6368]">
                    {isExactTradePeriod
                      ? `Broker net variance ${formatShortMoney(BROKER_CONTRACT_SUMMARY_Q3_2026.netOverContractCad, { showSign: true })}`
                      : 'Detailed entries in Q3 2026'}
                  </div>
                </div>
              </div>

              {/* Concise 4-part Composition (Q3 2026 exact) */}
              {isExactTradePeriod ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  <div className="p-2 border border-[#E2E5E8] rounded">
                    <div className="text-[10px] text-[#5F6368]">Normal MFN</div>
                    <div className="text-xs font-mono font-semibold tabular-nums text-[#231F20] mt-0.5">
                      {formatShortMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.dutyAtNormalMfnCad)}
                    </div>
                  </div>
                  <div className="p-2 border border-[#E2E5E8] rounded">
                    <div className="text-[10px] text-[#5F6368]">China Tariffs</div>
                    <div className="text-xs font-mono font-semibold tabular-nums text-[#E53C2E] mt-0.5">
                      {formatShortMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.extraTariffsChinaCad)}
                    </div>
                  </div>
                  <div className="p-2 border border-[#E2E5E8] rounded">
                    <div className="text-[10px] text-[#5F6368]">DDP Export</div>
                    <div className="text-xs font-mono font-semibold tabular-nums text-[#231F20] mt-0.5">
                      {formatShortMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.exportDutyDdpCad)}
                    </div>
                  </div>
                  <div className="p-2 border border-[#E2E5E8] rounded">
                    <div className="text-[10px] text-[#5F6368]">Broker Fees</div>
                    <div className="text-xs font-mono font-semibold tabular-nums text-[#231F20] mt-0.5">
                      {formatShortMoney(QUARTERLY_TRADE_SUMMARY_Q3_2026.brokerFeesCad)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 p-3 bg-white border border-[#E2E5E8] rounded text-xs text-[#5F6368]">
                  Detailed 12-shipment breakdown and 0.2% broker contract reconciliation are supplied in Appendix 3.1–3.3 for Q3 2026.
                </div>
              )}

              {/* 1 Clickable Trade Exception Spotlight */}
              {tradeSpotlightEntry && (
                <button
                  type="button"
                  onClick={() => openDrawer({ type: 'customs_entry', record: tradeSpotlightEntry })}
                  className="mt-3 w-full text-left p-3 bg-white hover:bg-[#F5F6F7] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-mono font-semibold text-[#E53C2E]">
                        {tradeSpotlightEntry.id}
                      </span>
                      <span className="text-[#5F6368]">· Spotlight Exception</span>
                    </div>
                    <div className="text-xs font-medium text-[#231F20] truncate mt-0.5">
                      {tradeSpotlightEntry.goods} ({tradeSpotlightEntry.route}) —{' '}
                      {tradeSpotlightEntry.tradeAgreementStatus === 'CUSMA_not_claimed'
                        ? 'CUSMA origin certificate unconfirmed'
                        : 'Broker fee variance vs 0.2% contract'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold tabular-nums text-[#231F20]">
                      {formatMoney(tradeSpotlightEntry.totalDutyAndTariffCad)}
                    </div>
                    <div className="text-[11px] text-[#E53C2E]">Inspect entry</div>
                  </div>
                </button>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[#5F6368]">
                Interprovincial {formatCompactMoney(7_300_000)} freight &amp; sales tax separated
              </span>
              <div className="flex items-center gap-3">
                {canRunSimulator && (
                  <button
                    type="button"
                    onClick={() => navigate('/simulator')}
                    className="font-medium text-[#231F20] hover:text-[#E53C2E] cursor-pointer whitespace-nowrap"
                  >
                    Tariff Simulator
                  </button>
                )}
                {canOpenTrade && (
                  <button
                    type="button"
                    onClick={() => navigate('/trade')}
                    className="inline-flex items-center gap-1 font-medium text-[#E53C2E] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    <span>Open Shipments &amp; Trade</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
