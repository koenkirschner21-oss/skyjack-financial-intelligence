import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  Info,
  Lock,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  buildCostOpportunities,
  computeOpportunityAnalytics,
  getUserDisplayName,
  OPPORTUNITY_CATEGORY_META,
  OPPORTUNITY_STATUS_ORDER,
} from '../domain/opportunityEngine';
import {
  CostOpportunity,
  OpportunityCategory,
  OpportunityWorkflowStatus,
} from '../types/domain';
import { PageHeader, ProvenanceText, UnavailableDataState } from '../components/common/StateViews';

const CATEGORY_VISUAL_SYSTEM: Record<
  OpportunityCategory,
  { badgeCls: string; barColor: string; accentText: string }
> = {
  potential_cash_recovery: {
    badgeCls: 'text-[#15803D] bg-emerald-50 border-emerald-200',
    barColor: '#16A34A',
    accentText: 'text-[#15803D]',
  },
  accounting_correction: {
    badgeCls: 'text-[#1D4ED8] bg-blue-50 border-blue-200',
    barColor: '#2563EB',
    accentText: 'text-[#1D4ED8]',
  },
  avoidable_operating_cost: {
    badgeCls: 'text-[#C2410C] bg-orange-50 border-orange-200',
    barColor: '#EA580C',
    accentText: 'text-[#C2410C]',
  },
  broker_discrepancy: {
    badgeCls: 'text-[#B45309] bg-amber-50 border-amber-200',
    barColor: '#D97706',
    accentText: 'text-[#B45309]',
  },
  trade_agreement_savings: {
    badgeCls: 'text-[#0F766E] bg-teal-50 border-teal-200',
    barColor: '#0D9488',
    accentText: 'text-[#0F766E]',
  },
  hypothetical_tariff_scenario: {
    badgeCls: 'text-[#5B21B6] bg-violet-50 border-violet-200',
    barColor: '#7C3AED',
    accentText: 'text-[#5B21B6]',
  },
};

const STATUS_BADGE_STYLES: Record<OpportunityWorkflowStatus, string> = {
  Identified: 'text-[#4B5563] bg-[#F5F6F7] border-[#E2E5E8]',
  'Under Review': 'text-[#B45309] bg-amber-50 border-amber-200',
  'Validated Opportunity': 'text-[#1D4ED8] bg-blue-50 border-blue-200',
  'Approved Action': 'text-[#1D4ED8] bg-blue-50 border-blue-200',
  'In Progress': 'text-[#C2410C] bg-orange-50 border-orange-200',
  Realized: 'text-[#15803D] bg-emerald-50 border-emerald-200',
  Rejected: 'text-[#5F6368] bg-[#F8F9FA] border-[#E2E5E8]',
};

export const OpportunitiesPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    openRecordById,
    updateCostOpportunity,
    openReportStudioWithPreset,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  const canView = hasPermission('view_opportunities');
  const canEdit =
    hasPermission('manage_investigations') || hasPermission('manage_trade_investigations');
  const canRealize = hasPermission('approve_material_correction');

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | OpportunityCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | OpportunityWorkflowStatus>('all');
  const [selectedId, setSelectedId] = useState<string>('opp-ir03-duplicate');

  const [editStatus, setEditStatus] = useState<OpportunityWorkflowStatus>('Identified');
  const [editVerifiedCad, setEditVerifiedCad] = useState<string>('0');
  const [editRealizedCad, setEditRealizedCad] = useState<string>('0');
  const [editNote, setEditNote] = useState<string>('');
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showInfoPopover) return;
    const onMouseDown = (e: MouseEvent) => {
      if (infoPopoverRef.current && !infoPopoverRef.current.contains(e.target as Node)) {
        setShowInfoPopover(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowInfoPopover(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showInfoPopover]);

  const opportunities = useMemo(
    () => buildCostOpportunities(state, activeUser),
    [state, activeUser]
  );
  const analytics = useMemo(() => computeOpportunityAnalytics(opportunities), [opportunities]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return opportunities.filter((o) => {
      if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        o.sourceRecordId.toLowerCase().includes(q) ||
        o.department.toLowerCase().includes(q) ||
        getUserDisplayName(o.ownerUserId).toLowerCase().includes(q)
      );
    });
  }, [opportunities, categoryFilter, statusFilter, searchTerm]);

  const selectedOpp: CostOpportunity | null = useMemo(() => {
    return (
      filtered.find((o) => o.id === selectedId) ??
      filtered[0] ??
      opportunities.find((o) => o.id === selectedId) ??
      opportunities[0] ??
      null
    );
  }, [filtered, opportunities, selectedId]);

  useEffect(() => {
    if (!selectedOpp) return;
    setEditStatus(selectedOpp.status);
    setEditVerifiedCad(String(selectedOpp.verifiedAmountCad));
    setEditRealizedCad(String(selectedOpp.realizedAmountCad));
    setEditNote(selectedOpp.resolutionNote ?? '');
    setSaveFeedback(null);
  }, [
    selectedOpp?.id,
    selectedOpp?.status,
    selectedOpp?.verifiedAmountCad,
    selectedOpp?.realizedAmountCad,
    selectedOpp?.resolutionNote,
  ]);

  const selectOpportunity = (opp: CostOpportunity) => {
    setSelectedId(opp.id);
    setEditStatus(opp.status);
    setEditVerifiedCad(String(opp.verifiedAmountCad));
    setEditRealizedCad(String(opp.realizedAmountCad));
    setEditNote(opp.resolutionNote ?? '');
    setSaveFeedback(null);
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cost Opportunity Centre" />
        <UnavailableDataState
          title={`Cost Opportunity Centre is restricted for ${activeUser.title}`}
          description="Operational Contributors cannot view cross-departmental financial opportunity registers."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const maxCategoryEstCad = Math.max(1, ...analytics.byCategory.map((c) => c.estimatedCad));
  const sortedDepartments = [...analytics.byDepartment].sort(
    (a, b) => b.estimatedCad - a.estimatedCad
  );
  const maxDeptEstCad = Math.max(1, ...sortedDepartments.map((d) => d.estimatedCad));
  const hasQueueFilters =
    searchTerm.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cost Opportunity Centre"
        actions={
          <div className="flex flex-wrap items-center gap-2 relative" ref={infoPopoverRef}>
            <button
              type="button"
              onClick={() => setShowInfoPopover((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5F6368] bg-white border border-[#E2E5E8] rounded hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer"
              aria-expanded={showInfoPopover}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Scope &amp; Guardrails</span>
            </button>

            {hasPermission('generate_reports') && (
              <button
                type="button"
                onClick={() =>
                  openReportStudioWithPreset({
                    templateId: 'cost_optimization_report',
                    reportingPeriod: state.selectedQuarterId,
                    datasetScope: 'combined_with_hypothetical',
                    includedSections: [
                      'str_opportunity_pipeline',
                      'trd_broker_reconciliation',
                      'trd_agreement_opportunities',
                      'str_tariff_scenarios',
                      'str_realized_opportunities',
                    ],
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#C93326] cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Optimization Report</span>
              </button>
            )}

            {showInfoPopover && (
              <div className="absolute right-0 top-10 z-30 w-80 sm:w-96 bg-white border border-[#E2E5E8] rounded-md shadow-sm p-4 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#231F20]">
                    Category Separation &amp; Verification Policy
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInfoPopover(false)}
                    className="text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                    aria-label="Close scope popover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-[#5F6368] leading-relaxed">
                  Cash recoveries, non-cash accounting adjustments, avoidable operating costs, trade
                  agreement candidates, broker variances, and hypothetical tariff scenarios are tracked
                  strictly without cross-category summing. Only Group Controller sign-off confirms
                  Realized savings.
                </p>
                <div className="text-[11px] text-[#5F6368] pt-1 border-t border-[#F0F1F3]">
                  Tracked Candidates: <strong className="text-[#231F20]">{opportunities.length}</strong> ·{' '}
                  Pending Verification: <strong className="text-[#231F20]">{analytics.outstandingVerificationsCount}</strong>
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* 1. CLEANER & CONSISTENT KPI SUMMARY CARDS */}
      <section aria-label="Opportunity KPIs" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Potential Cash Recoveries</span>
            <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-xl font-semibold text-[#15803D] font-mono tabular-nums mt-1.5">
            {formatCompactMoney(analytics.potentialCashRecoveryCad + analytics.brokerDiscrepancyGrossCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] font-mono tabular-nums mt-1">
            AP ({formatCompactMoney(analytics.potentialCashRecoveryCad)}) · Broker ({formatCompactMoney(analytics.brokerDiscrepancyGrossCad)})
          </div>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Accounting Adj. (Non-Cash)</span>
            <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-xl font-semibold text-[#1D4ED8] font-mono tabular-nums mt-1.5">
            {formatCompactMoney(analytics.accountingAdjustmentExposureCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1">
            Reclassifications &amp; accrual reversals
          </div>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Avoidable Operating Costs</span>
            <span className="w-2 h-2 rounded-full bg-[#EA580C] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-xl font-semibold text-[#C2410C] font-mono tabular-nums mt-1.5">
            {formatCompactMoney(analytics.avoidableOperatingCostCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1">
            Future process &amp; quality control target
          </div>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Trade Agreement Potential</span>
            <span className="w-2 h-2 rounded-xs bg-[#0D9488] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-xl font-semibold text-[#0F766E] font-mono tabular-nums mt-1.5">
            {formatCompactMoney(analytics.tradeAgreementPotentialCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1">
            Unconfirmed · Certificate of Origin req.
          </div>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Realized Savings (Confirmed)</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0" aria-hidden="true" />
          </div>
          <div
            className={`text-xl font-semibold font-mono tabular-nums mt-1.5 ${
              analytics.totalRealizedCad > 0 ? 'text-[#15803D]' : 'text-[#231F20]'
            }`}
          >
            {formatCompactMoney(analytics.totalRealizedCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] font-mono tabular-nums mt-1">
            Verified: {formatMoney(analytics.totalVerifiedCad)} · {analytics.outstandingVerificationsCount} pending
          </div>
        </div>
      </section>

      {/* 2. RESTRAINED GUARDRAIL & ANTI-DOUBLE-COUNTING GOVERNANCE BANNER */}
      {analytics.overlapNotes.length > 0 && (
        <section
          aria-label="Double-Counting Guardrails"
          className="bg-white border border-amber-300 rounded-md px-4 py-3 text-xs flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="font-semibold text-[#231F20]">Domain Overlap Prevention: </span>
              <span className="text-[#5F6368]">{analytics.overlapNotes.join(' · ')}</span>
            </div>
            <div>
              <span className="font-semibold text-[#231F20]">Scenario Exclusion: </span>
              <span className="text-[#5F6368]">
                Hypothetical tariff scenarios (
                <span className="font-mono text-[#231F20]">
                  {formatMoney(analytics.hypotheticalScenarioAnnualCad)}/yr
                </span>
                ) remain isolated from historical cash recovery totals.
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 3. VISUAL OVERVIEW: CATEGORY BREAKDOWN (NON-SUMMED) + PIPELINE BY STATUS & DEPARTMENT */}
      <section aria-label="Opportunity Overview Breakdown" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A. Opportunity Category Breakdown (Explicitly Non-Summed) */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#231F20]">
              Breakdown by Opportunity Category
            </h2>
            <span className="text-[11px] font-medium text-[#5F6368]">
              Non-Summed · Click row to filter
            </span>
          </div>

          <div className="space-y-2.5">
            {analytics.byCategory.map((c) => {
              const vis = CATEGORY_VISUAL_SYSTEM[c.category];
              const widthPct = c.estimatedCad > 0 ? Math.max(3, (c.estimatedCad / maxCategoryEstCad) * 100) : 0;
              const isSelectedCat = categoryFilter === c.category;

              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === c.category ? 'all' : c.category))
                  }
                  className={`w-full text-left p-2 rounded border transition-colors cursor-pointer ${
                    isSelectedCat
                      ? 'bg-[#FDF2F1] border-[#E53C2E]/40'
                      : 'border-transparent hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: vis.barColor }}
                      />
                      <span className="font-medium text-[#231F20] truncate">{c.label}</span>
                      <span className="text-[11px] font-mono text-[#5F6368] shrink-0">
                        ({c.count})
                      </span>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-[#231F20] shrink-0">
                      {formatMoney(c.estimatedCad)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-[#ECEEF0] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-200"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: vis.barColor,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* B. Pipeline by Status & Department */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#231F20]">
              Pipeline by Status &amp; Department
            </h2>
            <span className="text-[11px] text-[#5F6368]">Click status chip to filter queue</span>
          </div>

          {/* Clickable Status Chips */}
          <div className="flex flex-wrap gap-1.5">
            {analytics.byStatus.map((s) => {
              const active = statusFilter === s.status;
              return (
                <button
                  key={s.status}
                  type="button"
                  onClick={() =>
                    setStatusFilter((prev) => (prev === s.status ? 'all' : s.status))
                  }
                  className={`px-2.5 py-1 rounded border text-[11px] inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#231F20] text-white border-[#231F20]'
                      : `${STATUS_BADGE_STYLES[s.status]} hover:border-[#231F20]`
                  }`}
                >
                  <span className="font-medium">{s.status}</span>
                  <span className="font-mono font-semibold tabular-nums">{s.count}</span>
                </button>
              );
            })}
          </div>

          {/* Horizontal Department Exposure Bars */}
          <div className="space-y-2.5 pt-2 border-t border-[#E2E5E8]">
            <div className="text-[11px] font-medium text-[#5F6368]">
              Department Modeled / Exposed Value
            </div>
            {sortedDepartments.map((d) => {
              const widthPct = d.estimatedCad > 0 ? Math.max(3, (d.estimatedCad / maxDeptEstCad) * 100) : 0;
              return (
                <div key={d.department} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#231F20]">
                      {d.department}{' '}
                      <span className="text-[11px] font-mono text-[#5F6368]">({d.count})</span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#231F20]">
                      {formatMoney(d.estimatedCad)}
                      {d.realizedCad > 0 && (
                        <span className="text-[#15803D] font-normal ml-1.5">
                          ({formatCompactMoney(d.realizedCad)} realized)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#ECEEF0] rounded overflow-hidden">
                    <div
                      className="h-full bg-[#231F20] rounded transition-all duration-200"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. MAIN WORKSPACE: OPPORTUNITY QUEUE + EXECUTIVE REVIEW & WORKFLOW DETAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: OPPORTUNITY QUEUE */}
        <section
          aria-label="Opportunity Queue"
          className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
        >
          <div className="p-3.5 border-b border-[#E2E5E8] bg-[#F8F9FA] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#231F20]">
                Opportunity Queue ({filtered.length})
              </span>
              {hasQueueFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                  }}
                  className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search title, source ID (IR-03, E-08), or owner..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E5E8] rounded focus:outline-none focus:border-[#231F20]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <select
                aria-label="Filter by opportunity category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | OpportunityCategory)}
                className="bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs text-[#231F20]"
              >
                <option value="all">All 6 Categories</option>
                {(Object.keys(OPPORTUNITY_CATEGORY_META) as OpportunityCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {OPPORTUNITY_CATEGORY_META[cat].label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by opportunity status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | OpportunityWorkflowStatus)}
                className="bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs text-[#231F20]"
              >
                <option value="all">All Statuses</option>
                {OPPORTUNITY_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-[#E2E5E8] max-h-[680px] overflow-y-auto">
            {filtered.map((opp) => {
              const meta = OPPORTUNITY_CATEGORY_META[opp.category];
              const vis = CATEGORY_VISUAL_SYSTEM[opp.category];
              const active = selectedOpp?.id === opp.id;

              return (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => selectOpportunity(opp)}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    active ? 'bg-[#FDF2F1]' : 'bg-white hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] border rounded font-medium shrink-0 ${vis.badgeCls}`}
                      >
                        {meta.shortLabel}
                      </span>
                      <span className="font-mono text-[#5F6368] truncate">
                        {opp.sourceRecordId}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] border rounded font-medium shrink-0 ${
                        STATUS_BADGE_STYLES[opp.status]
                      }`}
                    >
                      {opp.status}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-[#231F20] mt-1.5 leading-snug">
                    {opp.title}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#5F6368] mt-1.5">
                    <span className="truncate">
                      {opp.financialImpactType} · {getUserDisplayName(opp.ownerUserId)}
                    </span>
                    <span className="font-mono font-semibold text-[#231F20] tabular-nums shrink-0 text-xs">
                      {formatMoney(opp.estimatedAmountCad)}
                    </span>
                  </div>
                </button>
              );
            })}

            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-[#5F6368] space-y-2">
                <div>No opportunities match the active category or status filters.</div>
                {hasQueueFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCategoryFilter('all');
                      setStatusFilter('all');
                    }}
                    className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: SELECTED OPPORTUNITY EXECUTIVE REVIEW & WORKFLOW */}
        <section
          aria-label="Selected Opportunity Detail"
          className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
        >
          {selectedOpp ? (
            <div className="divide-y divide-[#E2E5E8]">
              {/* 1. Opportunity Summary */}
              <div className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] border rounded font-medium ${
                        CATEGORY_VISUAL_SYSTEM[selectedOpp.category].badgeCls
                      }`}
                    >
                      {OPPORTUNITY_CATEGORY_META[selectedOpp.category].shortLabel}
                    </span>
                    <ProvenanceText
                      provenance={selectedOpp.provenance}
                      sourceRef={selectedOpp.sourceRecordId}
                    />
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[11px] border rounded font-medium ${
                      STATUS_BADGE_STYLES[selectedOpp.status]
                    }`}
                  >
                    {selectedOpp.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-[#231F20] leading-snug">
                    {selectedOpp.title}
                  </h3>
                  <div className="text-xs text-[#5F6368] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{selectedOpp.financialImpactType}</span>
                    <span>·</span>
                    <span>{selectedOpp.department}</span>
                    <span>·</span>
                    <span>Owner: <strong className="text-[#231F20]">{getUserDisplayName(selectedOpp.ownerUserId)}</strong></span>
                  </div>
                </div>

                <p className="text-xs text-[#231F20] leading-relaxed">{selectedOpp.description}</p>
              </div>

              {/* 2. Financial Impact Values */}
              <div className="p-5 bg-[#F8F9FA]">
                <div className="text-[11px] font-medium text-[#5F6368] mb-2">
                  Financial Impact Progression ({selectedOpp.isGuaranteedRecoverable ? 'Confirmed' : 'Unverified until sign-off'})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-[#E2E5E8] rounded">
                    <div className="text-[11px] text-[#5F6368]">Estimated Potential</div>
                    <div className="text-base font-mono font-semibold text-[#231F20] tabular-nums mt-0.5">
                      {formatMoney(selectedOpp.estimatedAmountCad)}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-[#E2E5E8] rounded">
                    <div className="text-[11px] text-[#5F6368]">Verified Amount</div>
                    <div className="text-base font-mono font-semibold text-[#1D4ED8] tabular-nums mt-0.5">
                      {formatMoney(selectedOpp.verifiedAmountCad)}
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-[#E2E5E8] rounded">
                    <div className="text-[11px] text-[#5F6368]">Realized (Confirmed)</div>
                    <div
                      className={`text-base font-mono font-semibold tabular-nums mt-0.5 ${
                        selectedOpp.realizedAmountCad > 0 ? 'text-[#15803D]' : 'text-[#231F20]'
                      }`}
                    >
                      {formatMoney(selectedOpp.realizedAmountCad)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Verification Gate / Blocker / Dependency */}
              <div className="p-5 space-y-3">
                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-md space-y-1.5 text-xs">
                  <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#B45309] shrink-0" />
                    <span>Required Verification Gate</span>
                  </div>
                  <p className="text-[11px] text-amber-950 leading-relaxed">
                    {selectedOpp.verificationRequired}
                  </p>
                </div>

                {selectedOpp.overlapWarning && (
                  <div className="p-3 bg-white border border-amber-300 rounded-md flex items-start gap-2 text-[11px] text-[#231F20]">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
                    <span>{selectedOpp.overlapWarning}</span>
                  </div>
                )}
              </div>

              {/* 4. Actions & Navigation */}
              <div className="px-5 py-3.5 bg-[#F8F9FA] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#5F6368]">
                  Trace underlying documentation &amp; investigation workflow
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOpp.sourceRecordType !== 'tariff_scenario' && (
                    <button
                      type="button"
                      onClick={() => openRecordById(selectedOpp.sourceRecordId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer"
                    >
                      <span>Inspect Source ({selectedOpp.sourceRecordId})</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selectedOpp.associatedInvestigationId && (
                    <button
                      type="button"
                      onClick={() => navigate('/investigations')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#E53C2E] bg-white border border-[#E2E5E8] rounded hover:border-[#E53C2E] cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Open Investigation</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 5. Workflow Update Controls */}
              <div className="p-5">
                {canEdit ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const res = updateCostOpportunity({
                        opportunityId: selectedOpp.id,
                        status: editStatus,
                        verifiedAmountCad: Number(editVerifiedCad) || 0,
                        realizedAmountCad: Number(editRealizedCad) || 0,
                        resolutionNote: editNote,
                      });
                      setSaveFeedback({
                        type: res.ok ? 'success' : 'error',
                        message: res.message,
                      });
                    }}
                    className="space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#231F20]">Workflow Update</span>
                      {!canRealize && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6368]">
                          <Lock className="w-3 h-3" />
                          <span>Realized sign-off requires Group Controller</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[#5F6368] block">
                          Workflow Status
                        </span>
                        <select
                          aria-label="Opportunity workflow status"
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(e.target.value as OpportunityWorkflowStatus)
                          }
                          className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
                        >
                          {OPPORTUNITY_STATUS_ORDER.map((s) => (
                            <option key={s} value={s} disabled={s === 'Realized' && !canRealize}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[#5F6368] block">
                          Verified Amount (CAD)
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editVerifiedCad}
                          onChange={(e) => setEditVerifiedCad(e.target.value)}
                          aria-label="Verified CAD amount"
                          className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 font-mono tabular-nums text-xs"
                        />
                      </label>

                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-[#5F6368] block">
                          Realized Amount (CAD)
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canRealize}
                          value={editRealizedCad}
                          onChange={(e) => setEditRealizedCad(e.target.value)}
                          aria-label="Realized CAD amount"
                          className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 font-mono tabular-nums text-xs disabled:opacity-50"
                        />
                      </label>
                    </div>

                    <label className="space-y-1 block">
                      <span className="text-[11px] font-medium text-[#5F6368] block">
                        Supporting Evidence / Resolution Note
                      </span>
                      <textarea
                        rows={2}
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Document verification evidence, vendor credit reference, or Controller rationale..."
                        className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
                      />
                    </label>

                    {saveFeedback && (
                      <div
                        className={`p-2.5 rounded border text-[11px] ${
                          saveFeedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                            : 'bg-red-50 border-red-200 text-[#DC2626]'
                        }`}
                      >
                        {saveFeedback.message}
                      </div>
                    )}

                    <div className="flex items-center justify-end">
                      <button
                        type="submit"
                        className="px-4 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
                      >
                        Save Opportunity Update
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="text-[11px] text-[#5F6368] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      Workflow updates are restricted for {activeUser.title}; read-only review enabled.
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#5F6368]">
              Select an opportunity from the queue to inspect verification gates and financial details.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
