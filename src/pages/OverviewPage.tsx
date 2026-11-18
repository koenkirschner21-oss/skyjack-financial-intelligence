import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
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
  REGIONS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import {
  buildCostOpportunities,
  computeOpportunityAnalytics,
  OPPORTUNITY_CATEGORY_META,
} from '../domain/opportunityEngine';
import { computeQuarterEndReadiness } from '../domain/readinessEngine';
import { canAccessRoute } from '../domain/permissions';
import {
  EightQuarterPerformanceChart,
  RegionalSalesDonut,
  ChinaTariffScenarioChart,
  TradeCostTrendChart,
} from '../components/charts/FinancialCharts';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';
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

  const regionalSlices = useMemo(() => {
    if (state.selectedQuarterId === 'Q3 2026') {
      return REGIONAL_SALES.map((row) => ({
        regionId: row.regionId,
        regionName: row.regionName,
        salesCad: row.salesCurrentCad,
      }));
    }
    if (state.selectedQuarterId === 'Q3 2025') {
      return REGIONAL_SALES.map((row) => ({
        regionId: row.regionId,
        regionName: row.regionName,
        salesCad: row.salesPriorYearCad,
      }));
    }
    return null;
  }, [state.selectedQuarterId]);

  const activeRegionalSlice =
    state.selectedRegionId === 'all'
      ? null
      : regionalSlices?.find((row) => row.regionId === state.selectedRegionId) ?? null;
  const regionalSharePct =
    activeRegionalSlice && currentStatement.salesCad > 0
      ? (activeRegionalSlice.salesCad / currentStatement.salesCad) * 100
      : null;
  const regionalKpiMode: 'group' | 'region' | 'unavailable' =
    state.selectedRegionId === 'all' ? 'group' : activeRegionalSlice ? 'region' : 'unavailable';

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
        maxItems: 8,
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

  const attentionPreview = useMemo(() => {
    const regionId = state.selectedRegionId;
    const inScope = attentionQueue.filter((item) => {
      if (regionId === 'all') return true;
      const investigation = state.investigations.find((row) => row.linkedRecordId === item.recordId);
      if (investigation) return investigation.regionId === regionId;
      const cost = scopedIrregularCosts.find((row) => row.id === item.recordId);
      if (cost) return cost.regionId === regionId;
      return false;
    });
    return inScope.slice(0, 3);
  }, [attentionQueue, scopedIrregularCosts, state.investigations, state.selectedRegionId]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Overview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 bg-white border border-[#E2E5E8] rounded-md px-2.5 py-1.5 text-[#5F6368]">
              <span className="text-[11px] font-medium">Period</span>
              <select
                aria-label="Reporting period"
                value={state.selectedQuarterId}
                onChange={(event) => setQuarterFilter(event.target.value as typeof state.selectedQuarterId)}
                className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer"
              >
                {REPORTING_PERIODS.map((period) => (
                  <option key={period.id} value={period.id}>{period.label}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 bg-white border border-[#E2E5E8] rounded-md px-2.5 py-1.5 text-[#5F6368]">
              <span className="text-[11px] font-medium">Region</span>
              <select
                aria-label="Region"
                value={state.selectedRegionId}
                onChange={(event) => setRegionFilter(event.target.value as typeof state.selectedRegionId)}
                className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer"
              >
                <option value="all">All Regions</option>
                {REGIONS.map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            </label>
            {(state.selectedQuarterId !== 'Q3 2026' || state.selectedRegionId !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuarterFilter('Q3 2026');
                  setRegionFilter('all');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
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
                  <span className="text-xs font-medium text-[#5F6368]">
                    {regionalKpiMode === 'group' ? 'Group Sales' : 'Regional Sales'}
                  </span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId} · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {regionalKpiMode === 'region' && activeRegionalSlice
                    ? formatOverviewMoney(activeRegionalSlice.salesCad)
                    : regionalKpiMode === 'unavailable'
                      ? 'Not reported'
                      : formatOverviewMoney(currentStatement.salesCad)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {regionalKpiMode === 'region' && activeRegionalSlice
                    ? formatMoney(activeRegionalSlice.salesCad)
                    : regionalKpiMode === 'unavailable'
                      ? `No Appendix 1.4 split for ${state.selectedQuarterId}`
                      : formatMoney(currentStatement.salesCad)}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] tabular-nums text-[#5F6368]">
                {regionalKpiMode === 'group' ? (
                  <div className="flex items-center justify-between">
                    <span className={salesYoYPct !== null && salesYoYPct >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      YoY {salesYoYPct !== null ? `${salesYoYPct >= 0 ? '+' : ''}${salesYoYPct.toFixed(1)}%` : 'N/A'}
                    </span>
                    <span className={salesQoQPct !== null && salesQoQPct >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      QoQ {salesQoQPct !== null ? `${salesQoQPct >= 0 ? '+' : ''}${salesQoQPct.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                ) : (
                  <span>Selected-region sales only</span>
                )}
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
                  <span className="text-xs font-medium text-[#5F6368]">
                    {regionalKpiMode === 'group' ? 'Operating Earnings' : 'Share of Group Sales'}
                  </span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId} · {state.currency}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {regionalKpiMode === 'group'
                    ? formatOverviewMoney(currentStatement.operatingEarningsCad)
                    : regionalSharePct !== null
                      ? `${regionalSharePct.toFixed(1)}%`
                      : 'Not reported'}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {regionalKpiMode === 'group'
                    ? formatMoney(currentStatement.operatingEarningsCad)
                    : 'Regional operating earnings are not in the case'}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] tabular-nums text-[#5F6368]">
                {regionalKpiMode === 'group' ? (
                  <div className="flex items-center justify-between">
                    <span className={oeYoYDelta !== null && oeYoYDelta >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      YoY {oeYoYDelta !== null ? formatOverviewMoney(oeYoYDelta, { showSign: true }) : 'N/A'}
                    </span>
                    <span className={oeQoQDelta !== null && oeQoQDelta >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      QoQ {oeQoQDelta !== null ? formatOverviewMoney(oeQoQDelta, { showSign: true }) : 'N/A'}
                    </span>
                  </div>
                ) : (
                  <span>Share of the selected period's group sales</span>
                )}
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
                  <span className="text-xs font-medium text-[#5F6368]">
                    {regionalKpiMode === 'group' ? 'Operating Margin' : 'Regional Irregular-Cost Exposure'}
                  </span>
                  <span className="text-[11px] font-mono text-[#5F6368]">{state.selectedQuarterId}</span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {regionalKpiMode === 'group'
                    ? `${currentStatement.oeShareOfSalesPct.toFixed(1)}%`
                    : regionalKpiMode === 'region' && selectedPeriod.hasIrregularCostBreakdown
                      ? formatOverviewMoney(totalIrregularVisibleCad)
                      : 'Not reported'}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5">
                  {regionalKpiMode === 'group'
                    ? 'OE share of sales (Appendix 1.1)'
                    : selectedPeriod.hasIrregularCostBreakdown
                      ? formatMoney(totalIrregularVisibleCad)
                      : `No irregular-cost log for ${state.selectedQuarterId}`}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] text-[11px] tabular-nums text-[#5F6368]">
                {regionalKpiMode === 'group' ? (
                  <div className="flex items-center justify-between">
                    <span className={marginYoYDeltaPp !== null && marginYoYDeltaPp >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      YoY {marginYoYDeltaPp !== null ? `${marginYoYDeltaPp >= 0 ? '+' : ''}${marginYoYDeltaPp.toFixed(1)} pp` : 'N/A'}
                    </span>
                    <span className={marginQoQDeltaPp !== null && marginQoQDeltaPp >= 0 ? 'text-[#16A34A] font-medium' : ''}>
                      QoQ {marginQoQDeltaPp !== null ? `${marginQoQDeltaPp >= 0 ? '+' : ''}${marginQoQDeltaPp.toFixed(1)} pp` : 'N/A'}
                    </span>
                  </div>
                ) : (
                  <span>{selectedPeriod.hasIrregularCostBreakdown ? 'Scoped irregular costs' : 'Not in the irregular-cost log'}</span>
                )}
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
                  <span className="text-xs font-medium text-[#5F6368]">
                    {regionalKpiMode === 'region' ? 'Regional Issue Count' : 'Irregular-Cost Exposure'}
                  </span>
                  <span className="text-[11px] font-mono text-[#5F6368]">
                    {selectedPeriod.hasIrregularCostBreakdown ? `${state.selectedQuarterId} · ${state.currency}` : 'Q3 2026 Only'}
                  </span>
                </div>
                <div className="text-2xl font-semibold text-[#231F20] tabular-nums whitespace-nowrap mt-1.5">
                  {regionalKpiMode === 'region'
                    ? selectedPeriod.hasIrregularCostBreakdown
                      ? filteredIrregularCosts.length
                      : 'Not reported'
                    : selectedPeriod.hasIrregularCostBreakdown
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
                      Group-wide Appendix 1.1 series, Q4 2024 – Q3 2026 ({state.currency}). Regional operating earnings are not reported.
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

              <div className="mt-3 pt-3 border-t border-[#F0F1F3] flex items-center justify-end text-xs">
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
                  Three highest-priority items in the selected scope.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#5F6368] tabular-nums shrink-0">
                {attentionQueue.length} in scope
              </span>
            </div>

            {attentionPreview.length === 0 ? (
              <div className="p-4 bg-[#F5F6F7] border border-[#E2E5E8] rounded-md text-xs text-[#5F6368]">
                No unresolved high-priority items in your active scope.
              </div>
            ) : (
              <div className="divide-y divide-[#F0F1F3]">
                {attentionPreview.map((item) => (
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

                    <div className="text-xs font-medium text-[#231F20] mt-1">{item.title}</div>
                    <p className="text-[11px] text-[#5F6368] mt-1">{item.categoryLabel}. Status: {item.statusLabel}.</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono tabular-nums text-[#231F20]">{item.amountLabel ?? 'No amount on this item'}</span>
                      <span className="font-medium text-[#E53C2E] inline-flex items-center gap-0.5">{item.actionLabel}<ArrowRight className="w-3 h-3" /></span>
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
              <span>View all</span>
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
        {/* Card B: Cost Opportunities (or Scoped Governance Actions for Contributor) */}
        {canOpenOpportunities ? (
          <div className="order-1 bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#E53C2E]" />
                  <h2 className="text-sm font-semibold text-[#231F20]">Cost Opportunities</h2>
                </div>
                <span className="text-[11px] font-mono text-[#5F6368] tabular-nums">
                  {oppAnalytics.totalRealizedCad === 0 ? 'Realized CAD 0' : `${opportunities.length} tracked`}
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
              <span className="text-[#5F6368]">Potential until verified</span>
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
          <div className="order-1 bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
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
        {canOpenFinancials && (
          <>
          {/* Card A: Regional Performance */}
          <div className="order-2 bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-[#E53C2E]" />
                    <h2 className="text-sm font-semibold text-[#231F20]">Regional Performance</h2>
                  </div>
                  <p className="text-xs text-[#5F6368] mt-0.5">
                    Sales by region for {state.selectedQuarterId} ({state.currency}). Select a region to scope the page.
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

              {selectedPeriod.hasRegionalSalesBreakdown && regionalSlices ? (
                <RegionalSalesDonut
                  slices={regionalSlices}
                  selectedRegionId={state.selectedRegionId}
                  totalCad={regionalSlices.reduce((sum, row) => sum + row.salesCad, 0)}
                  onSelectRegion={(regionId) =>
                    setRegionFilter(state.selectedRegionId === regionId ? 'all' : regionId)
                  }
                />
              ) : (
                <UnavailableDataState
                  title={`No regional sales table for ${state.selectedQuarterId}`}
                  description="Appendix 1.4 provides regional sales for Q3 2025 and Q3 2026 only."
                  actionLabel="Switch to Q3 2026"
                  onAction={() => setQuarterFilter('Q3 2026')}
                />
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F1F3] flex items-center justify-between text-xs">
              <span className="text-[#5F6368]">
                {state.selectedQuarterId === 'Q3 2026'
                  ? `Sales by region, total ${formatCompactMoney(329_700_000)}`
                  : state.selectedQuarterId === 'Q3 2025'
                    ? `Prior-year regional sales, total ${formatCompactMoney(312_600_000)}`
                    : 'Regional sales are not reported for this period'}
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
          </>
        )}

      </section>

      <section
        aria-label="Close readiness and China tariff exposure"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
      >
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 flex flex-col">
          <h2 className="text-sm font-semibold text-[#231F20]">Close Readiness ({readiness.quarterId})</h2>
          <p className="text-xs text-[#5F6368] mt-1">
            Open work from existing records. This checklist is not a quarter-end approval.
          </p>
          <ul className="mt-3 divide-y divide-[#F0F1F3]">
            {([
              {
                label: 'Unresolved investigations',
                count: invIndicator?.unresolvedCount ?? 0,
                detail: `${invIndicator?.unresolvedCount ?? 0} open of ${invIndicator?.totalCount ?? 0}`,
                route: canAccessRoute(activeUser, '/investigations')
                  ? '/investigations'
                  : canAccessRoute(activeUser, '/data-gateway')
                    ? '/data-gateway'
                    : null,
              },
              {
                label: 'Pending approvals',
                count: aprIndicator?.unresolvedCount ?? 0,
                detail: `${aprIndicator?.unresolvedCount ?? 0} open of ${aprIndicator?.totalCount ?? 0}`,
                route: canAccessRoute(activeUser, '/approvals') ? '/approvals' : null,
              },
              {
                label: 'Missing supporting evidence',
                count: evIndicator?.unresolvedCount ?? 0,
                detail: `${evIndicator?.unresolvedCount ?? 0} missing or pending verification`,
                route: canAccessRoute(activeUser, '/investigations')
                  ? '/investigations'
                  : canAccessRoute(activeUser, '/data-gateway')
                    ? '/data-gateway'
                    : null,
              },
              {
                label: 'Data validation / quarantined imports',
                count: quarIndicator?.unresolvedCount ?? 0,
                detail: `${quarIndicator?.unresolvedCount ?? 0} held out of trusted totals`,
                route: canAccessRoute(activeUser, '/data-gateway') ? '/data-gateway' : null,
              },
            ] as const).map((item) => {
              const clear = item.count === 0;
              const route = item.route;
              const body = (
                <>
                  {clear ? (
                    <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#E53C2E] shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-[#231F20]">{item.label}</span>
                    <span className="block text-[11px] text-[#5F6368]">{item.detail}</span>
                  </span>
                  <span className="text-sm font-semibold font-mono tabular-nums text-[#231F20]">{item.count}</span>
                </>
              );
              return (
                <li key={item.label}>
                  {route ? (
                    <button
                      type="button"
                      onClick={() => navigate(route)}
                      className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-[#F8F9FA] cursor-pointer"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 flex flex-col">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-[#E53C2E]" />
            <h2 className="text-sm font-semibold text-[#231F20]">China Tariff Exposure</h2>
          </div>
          {canOpenTrade || canRunSimulator ? (
            isExactTradePeriod ? (
              <>
                <p className="text-xs text-[#5F6368] mt-1">
                  Q3 2026 additional China tariffs on the CAD 2,100,000 goods base.
                  {state.selectedRegionId !== 'all' ? ' Group-wide case scenario, not split by region.' : ''}
                </p>
                <div className="mt-3">
                  <ChinaTariffScenarioChart />
                </div>
                {canRunSimulator && (
                  <div className="mt-3 pt-3 border-t border-[#F0F1F3] flex justify-end">
                    <button
                      type="button"
                      onClick={() => navigate('/simulator')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#E53C2E] hover:underline cursor-pointer"
                    >
                      <span>Tariff Simulator</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-3">
                <UnavailableDataState
                  title="Tariff comparison is the Q3 2026 case"
                  description={`These rates are not a ${state.selectedQuarterId} result.`}
                  actionLabel="Switch to Q3 2026"
                  onAction={() => setQuarterFilter('Q3 2026')}
                />
              </div>
            )
          ) : (
            <p className="text-xs text-[#5F6368] mt-3">
              China tariff scenarios are outside this role. No Q3 2026 tariff amounts are shown.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
