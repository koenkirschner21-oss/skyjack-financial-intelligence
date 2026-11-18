import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  FileSpreadsheet,
  Info,
  Lock,
  Search,
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
            <div
              className="inline-flex items-center gap-2 bg-white border border-[#E2E5E8] rounded-md px-2.5 py-1.5 text-[#5F6368]"
              aria-label="Reporting period Q3 2026"
            >
              <span className="text-[11px] font-medium">Period</span>
              <span className="text-xs font-semibold text-[#231F20]">Q3 2026</span>
            </div>
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
                    reportingPeriod: 'Q3 2026',
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
                  strictly without cross-category summing. Saved tariff scenarios (
                  {formatMoney(analytics.hypotheticalScenarioAnnualCad)}) stay outside cash, accounting,
                  and realized totals. Only Group Controller sign-off confirms Realized savings.
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

      <section aria-label="Opportunity KPIs" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'Potential Cash Recoveries',
            amount: analytics.potentialCashRecoveryCad,
            note: 'Unverified. Not realized cash.',
            tone: 'neutral' as const,
          },
          {
            label: 'Accounting Corrections',
            amount: analytics.accountingAdjustmentExposureCad,
            note: 'Not recoverable cash.',
            tone: 'neutral' as const,
          },
          {
            label: 'Future Avoidable Costs',
            amount: analytics.avoidableOperatingCostCad,
            note: 'Not recovered cash.',
            tone: 'neutral' as const,
          },
          {
            label: 'Trade Agreement Review',
            amount: analytics.tradeAgreementPotentialCad,
            note: 'Unconfirmed. Not recovered cash.',
            tone: 'neutral' as const,
          },
          {
            label: 'Verified / Realized',
            amount: analytics.totalRealizedCad,
            note: analytics.totalVerifiedCad > 0
              ? `Verified ${formatMoney(analytics.totalVerifiedCad)}`
              : 'None verified or realized.',
            tone: analytics.totalRealizedCad > 0 ? 'favourable' as const : 'neutral' as const,
          },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-[#E2E5E8] rounded-md p-3">
            <div className="text-[11px] font-medium text-[#5F6368] leading-snug">{card.label}</div>
            <div
              className={`text-xl font-semibold tabular-nums mt-1 ${
                card.tone === 'favourable' ? 'text-[#15803D]' : 'text-[#231F20]'
              }`}
            >
              {formatCompactMoney(card.amount)}
            </div>
            <div className="text-[11px] text-[#5F6368] mt-1">{card.note}</div>
          </div>
        ))}
      </section>

      {/* 3. VISUAL OVERVIEW: CATEGORY BREAKDOWN (NON-SUMMED) + PIPELINE BY STATUS & DEPARTMENT */}
      <section aria-label="Opportunity Overview Breakdown" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A. Opportunity Category Breakdown (Explicitly Non-Summed) */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-3 space-y-2">
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
              const widthPct = c.estimatedCad > 0 ? Math.max(3, (c.estimatedCad / maxCategoryEstCad) * 100) : 0;
              const isSelectedCat = categoryFilter === c.category;

              return (
                <button
                  key={c.category}
                  type="button"
                  aria-pressed={isSelectedCat}
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === c.category ? 'all' : c.category))
                  }
                  className={`w-full text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                    isSelectedCat
                      ? 'bg-[#F8F9FA] border-[#231F20]'
                      : 'border-transparent hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#231F20] truncate">
                      {c.label}{' '}
                      <span className="text-[11px] font-normal text-[#5F6368]">({c.count})</span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#231F20] shrink-0">
                      {c.count === 0 ? 'No records' : formatMoney(c.estimatedCad)}
                    </span>
                  </div>
                  {c.count > 0 && (
                    <div className="mt-1 h-1.5 bg-[#ECEEF0] rounded overflow-hidden">
                      <div
                        className="h-full rounded bg-[#231F20]"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* B. Pipeline by Status & Department */}
        <div className="bg-white border border-[#E2E5E8] rounded-md p-3 space-y-3">
          <h2 className="text-sm font-semibold text-[#231F20]">Pipeline by Status</h2>
          <div className="space-y-1.5">
            {analytics.byStatus.filter((s) => s.count > 0).map((s) => {
              const active = statusFilter === s.status;
              const maxStatus = Math.max(1, ...analytics.byStatus.map((item) => item.estimatedCad));
              const widthPct = s.estimatedCad > 0 ? Math.max(3, (s.estimatedCad / maxStatus) * 100) : 0;
              return (
                <button
                  key={s.status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter((prev) => (prev === s.status ? 'all' : s.status))}
                  className={`w-full text-left px-2 py-1.5 rounded border transition-colors cursor-pointer ${
                    active ? 'bg-[#F8F9FA] border-[#231F20]' : 'border-transparent hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[#231F20]">
                      {s.status}{' '}
                      <span className="text-[11px] font-normal text-[#5F6368]">({s.count})</span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-[#231F20]">
                      {formatMoney(s.estimatedCad)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-[#ECEEF0] rounded overflow-hidden">
                    <div className="h-full rounded bg-[#5F6368]" style={{ width: `${widthPct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E2E5E8]">
            <div className="text-[11px] font-medium text-[#5F6368]">Estimated value by department</div>
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
              const active = selectedOpp?.id === opp.id;
              return (
                <button
                  key={opp.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectOpportunity(opp)}
                  className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#F8F9FA] border-[#E53C2E]'
                      : 'bg-white border-transparent hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-[#5F6368] truncate">{opp.sourceRecordId}</span>
                    <span
                      className={`shrink-0 font-medium ${
                        opp.status === 'Realized' ? 'text-[#15803D]' : 'text-[#5F6368]'
                      }`}
                    >
                      {opp.status}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#231F20] mt-1 leading-snug">{opp.title}</div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#5F6368] mt-1">
                    <span className="truncate">{OPPORTUNITY_CATEGORY_META[opp.category].shortLabel}</span>
                    <span className="font-mono font-semibold text-[#231F20] tabular-nums shrink-0">
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
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#5F6368]">
                      {selectedOpp.sourceRecordId} · {OPPORTUNITY_CATEGORY_META[selectedOpp.category].label}
                    </div>
                    <h3 className="text-base font-semibold text-[#231F20] leading-snug mt-0.5">
                      {selectedOpp.title}
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-[#5F6368] shrink-0">{selectedOpp.status}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Estimated</div>
                    <div className="font-semibold tabular-nums text-[#231F20] mt-0.5">
                      {formatMoney(selectedOpp.estimatedAmountCad)}
                    </div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">{selectedOpp.financialImpactType}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Verified</div>
                    <div className="font-semibold tabular-nums text-[#231F20] mt-0.5">
                      {formatMoney(selectedOpp.verifiedAmountCad)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Realized</div>
                    <div
                      className={`font-semibold tabular-nums mt-0.5 ${
                        selectedOpp.realizedAmountCad > 0 ? 'text-[#15803D]' : 'text-[#231F20]'
                      }`}
                    >
                      {formatMoney(selectedOpp.realizedAmountCad)}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-[#231F20] leading-relaxed">{selectedOpp.description}</p>
                <p className="text-[11px] text-[#5F6368] leading-relaxed">
                  <span className="font-medium text-[#231F20]">Still required: </span>
                  {selectedOpp.verificationRequired}
                </p>
                <ProvenanceText provenance={selectedOpp.provenance} sourceRef={selectedOpp.sourceRecordId} />
                {selectedOpp.overlapWarning && (
                  <p className="text-[11px] text-[#5F6368] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{selectedOpp.overlapWarning}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {selectedOpp.sourceRecordType !== 'tariff_scenario' && (
                    <button
                      type="button"
                      onClick={() => openRecordById(selectedOpp.sourceRecordId)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer"
                    >
                      <span>Inspect {selectedOpp.sourceRecordId}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selectedOpp.associatedInvestigationId && (
                    <button
                      type="button"
                      onClick={() => navigate('/investigations')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Open Investigations</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4">
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
                      <span className="font-semibold text-[#231F20]">Next Action</span>
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
