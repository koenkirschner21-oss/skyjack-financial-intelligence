import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Info,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { CUSTOMS_ENTRIES, DEMO_USERS, IRREGULAR_COSTS, REGIONS } from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import { buildFinancialDigitalThread } from '../domain/digitalThreadBuilder';
import { canManageRecordInvestigation, canPerformAction } from '../domain/permissions';
import { requestAiEvidenceExtraction, requestAiInvestigationBrief } from '../services/aiService';
import {
  AiInvestigationBrief,
  Investigation,
  InvestigationWorkflowStatus,
} from '../types/domain';
import { FinancialDigitalThreadView } from '../components/intelligence/FinancialDigitalThreadView';
import {
  InvestigationActionsTab,
  InvestigationEvidenceTab,
  InvestigationOverviewTab,
} from '../components/investigations/InvestigationTabViews';
import { PageHeader, ProvenanceText, UnavailableDataState } from '../components/common/StateViews';

type WorkspaceTab = 'overview' | 'thread' | 'evidence' | 'actions';
type QueueStatusFilter = 'all' | 'unresolved' | 'needs_action' | InvestigationWorkflowStatus;
type QueueCategoryFilter = 'all' | 'irregular_cost' | 'customs_entry' | 'quarantined_record';

const WORKFLOW_STATUSES: InvestigationWorkflowStatus[] = [
  'Open',
  'Assigned',
  'In Review',
  'Evidence Required',
  'Pending Approval',
  'Resolved',
  'Dismissed with Reason',
];

const STATUS_TEXT_CLS: Record<InvestigationWorkflowStatus, string> = {
  Open: 'text-[#E53C2E]',
  Assigned: 'text-[#1D4ED8]',
  'In Review': 'text-[#1D4ED8]',
  'Evidence Required': 'text-[#B45309]',
  'Pending Approval': 'text-[#B45309]',
  Resolved: 'text-[#16A34A]',
  'Dismissed with Reason': 'text-[#5F6368]',
};

const PRIORITY_TEXT_CLS: Record<Investigation['priority'], string> = {
  High: 'text-[#E53C2E]',
  Medium: 'text-[#B45309]',
  Standard: 'text-[#5F6368]',
};

function getExposureCategoryLabel(inv: Investigation): {
  category: string;
  shortTag: string;
} {
  if (inv.linkedRecordType === 'irregular_cost') {
    return { category: 'Recorded Irregular Expense', shortTag: 'Expense' };
  }
  if (inv.linkedRecordType === 'customs_entry') {
    const customs = CUSTOMS_ENTRIES.find((e) => e.id === inv.linkedRecordId);
    if (customs?.tradeAgreementStatus === 'CUSMA_not_claimed') {
      return { category: 'Potential CUSMA Recovery (Unverified)', shortTag: 'CUSMA Potential' };
    }
    return { category: 'Broker Fee Variance (Rule 04)', shortTag: 'Broker Δ' };
  }
  return { category: 'Quarantined Upload (Excluded)', shortTag: 'Quarantine' };
}

export const InvestigationsPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    ruleEvaluations,
    openRecordById,
    navigate,
    setRegionFilter,
    setQuarterFilter,
    updateInvestigationWorkflow,
    promoteQuarantinedToInvestigation,
    saveAiInvestigationNote,
    addSupportingEvidence,
    createGovernanceRequest,
    recordAiAuditEvent,
    openReportStudioWithPreset,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  const canAccess =
    hasPermission('manage_investigations') || hasPermission('manage_trade_investigations');
  const canSubmitGovernance = hasPermission('submit_correction_request');

  // Queue & navigation state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Standard'>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<QueueCategoryFilter>('all');

  const [selectedId, setSelectedId] = useState<string>('inv-ir-01');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileView, setMobileView] = useState<'queue' | 'detail'>('queue');

  // Header info popover
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);

  // AI Brief state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [ephemeralBrief, setEphemeralBrief] = useState<Record<string, AiInvestigationBrief>>({});

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

  // Role- and Region-scoped investigations
  const scopedInvestigations = useMemo(() => {
    return state.investigations.filter((inv) => {
      if (activeUser.roleId === 'trade_coordinator') {
        if (inv.department !== 'Customs and Trade' && inv.department !== 'Logistics') return false;
      } else if (activeUser.roleId === 'operational_contributor') {
        if (
          inv.regionId !== 'north_america' ||
          (inv.department !== 'Operations' && inv.department !== 'Logistics')
        ) {
          return false;
        }
      }
      if (state.selectedRegionId !== 'all' && inv.regionId !== state.selectedRegionId) {
        return false;
      }
      return true;
    });
  }, [activeUser.roleId, state.investigations, state.selectedRegionId]);

  // Quarantined records from Data Gateway not yet promoted into unified investigation state
  const unlinkedQuarantined = useMemo(() => {
    const existingIds = new Set(state.investigations.map((i) => i.linkedRecordId));
    return state.reviewQueueItems.filter(
      (q) =>
        !existingIds.has(q.stableRecordId) &&
        q.reviewStatus !== 'Rejected' &&
        q.reviewStatus !== 'Resolved'
    );
  }, [state.investigations, state.reviewQueueItems]);

  // Helper to determine if an investigation requires evidence or approval
  const requiresEvidenceOrApproval = (inv: Investigation) => {
    if (inv.workflowStatus === 'Resolved' || inv.workflowStatus === 'Dismissed with Reason') {
      return false;
    }
    if (inv.workflowStatus === 'Evidence Required' || inv.workflowStatus === 'Pending Approval') {
      return true;
    }
    const hasOpenMissingEv = state.evidence.some(
      (e) =>
        e.linkedRecordId === inv.linkedRecordId &&
        (e.status === 'missing_in_case' || e.status === 'pending_verification')
    );
    const hasOpenApproval = state.approvalRequests.some(
      (a) =>
        a.linkedRecordId === inv.linkedRecordId &&
        a.workflowStatus !== 'Approved' &&
        a.workflowStatus !== 'Rejected' &&
        a.workflowStatus !== 'Resolved'
    );
    return hasOpenMissingEv || hasOpenApproval;
  };

  // Filtered queue
  const filteredInvestigations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return scopedInvestigations.filter((inv) => {
      const isUnresolved =
        inv.workflowStatus !== 'Resolved' && inv.workflowStatus !== 'Dismissed with Reason';

      if (statusFilter === 'unresolved' && !isUnresolved) return false;
      if (statusFilter === 'needs_action' && !requiresEvidenceOrApproval(inv)) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'unresolved' &&
        statusFilter !== 'needs_action' &&
        inv.workflowStatus !== statusFilter
      ) {
        return false;
      }

      if (priorityFilter !== 'all' && inv.priority !== priorityFilter) return false;
      if (ownerFilter !== 'all' && inv.ownerUserId !== ownerFilter) return false;
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'quarantined_record') {
          if (
            inv.linkedRecordType !== 'quarantined_record' &&
            inv.linkedRecordType !== 'uploaded_discrepancy'
          ) {
            return false;
          }
        } else if (inv.linkedRecordType !== categoryFilter) {
          return false;
        }
      }

      if (!q) return true;
      return (
        inv.id.toLowerCase().includes(q) ||
        inv.linkedRecordId.toLowerCase().includes(q) ||
        inv.title.toLowerCase().includes(q) ||
        inv.department.toLowerCase().includes(q) ||
        inv.notes.toLowerCase().includes(q)
      );
    });
  }, [
    scopedInvestigations,
    statusFilter,
    priorityFilter,
    ownerFilter,
    categoryFilter,
    searchTerm,
    state.evidence,
    state.approvalRequests,
  ]);

  const selectedInv: Investigation | null = useMemo(() => {
    return (
      filteredInvestigations.find((i) => i.id === selectedId) ??
      filteredInvestigations[0] ??
      scopedInvestigations.find((i) => i.id === selectedId) ??
      scopedInvestigations[0] ??
      null
    );
  }, [filteredInvestigations, scopedInvestigations, selectedId]);

  // Actionable Summary Metrics (strictly non-overlapping & categorized)
  const summary = useMemo(() => {
    const unresolved = scopedInvestigations.filter(
      (i) => i.workflowStatus !== 'Resolved' && i.workflowStatus !== 'Dismissed with Reason'
    );
    const highPriority = unresolved.filter((i) => i.priority === 'High');
    const needsAction = unresolved.filter((i) => requiresEvidenceOrApproval(i));

    let irregularExpensesCad = 0;
    let brokerVarianceCad = 0;
    let potentialRecoveryCad = 0;
    let quarantinedCad = 0;

    for (const inv of unresolved) {
      if (inv.linkedRecordType === 'irregular_cost') {
        irregularExpensesCad += inv.exposureCad;
      } else if (inv.linkedRecordType === 'customs_entry') {
        const customs = CUSTOMS_ENTRIES.find((e) => e.id === inv.linkedRecordId);
        if (customs?.tradeAgreementStatus === 'CUSMA_not_claimed') {
          potentialRecoveryCad += inv.exposureCad;
        } else {
          brokerVarianceCad += inv.exposureCad;
        }
      } else {
        quarantinedCad += inv.exposureCad;
      }
    }

    return {
      totalScoped: scopedInvestigations.length,
      unresolvedCount: unresolved.length,
      highCount: highPriority.length,
      needsActionCount: needsAction.length,
      irregularExpensesCad,
      brokerVarianceCad,
      potentialRecoveryCad,
      quarantinedCad,
    };
  }, [scopedInvestigations, state.evidence, state.approvalRequests]);

  const hasActiveQueueFilters =
    searchTerm.trim() !== '' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    ownerFilter !== 'all' ||
    categoryFilter !== 'all';

  const resetQueueFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setOwnerFilter('all');
    setCategoryFilter('all');
  };

  // Selected Investigation Details
  const selectedThread = useMemo(
    () =>
      selectedInv
        ? buildFinancialDigitalThread(selectedInv.linkedRecordId, state, activeUser, state.currency)
        : null,
    [selectedInv, state, activeUser]
  );

  const selectedEvidence = useMemo(
    () =>
      selectedInv
        ? state.evidence.filter((e) => e.linkedRecordId === selectedInv.linkedRecordId)
        : [],
    [selectedInv, state.evidence]
  );

  const savedAiNotes = useMemo(
    () =>
      selectedEvidence.filter((e) =>
        e.title.startsWith('[AI-Assisted Brief') || e.summary.startsWith('UNVERIFIED AI INTERPRETATION')
      ),
    [selectedEvidence]
  );

  const selectedApprovals = useMemo(
    () =>
      selectedInv
        ? state.approvalRequests.filter((a) => a.linkedRecordId === selectedInv.linkedRecordId)
        : [],
    [selectedInv, state.approvalRequests]
  );

  const selectedAudit = useMemo(
    () =>
      selectedInv
        ? state.auditEvents
            .filter((a) => a.targetRecordId === selectedInv.linkedRecordId)
            .slice(0, 10)
        : [],
    [selectedInv, state.auditEvents]
  );

  const selectedRules = useMemo(
    () =>
      selectedInv
        ? ruleEvaluations.filter((r) => r.recordId === selectedInv.linkedRecordId)
        : [],
    [selectedInv, ruleEvaluations]
  );

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="Investigations" />
        <UnavailableDataState
          title={`Investigations restricted for ${activeUser.title}`}
          description="Group Controller, Cost Accountant, and Customs & Trade Coordinator roles manage scoped investigations. Switch accounts or review access in Settings."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const activeBrief = selectedInv
    ? ephemeralBrief[selectedInv.id] ?? selectedInv.aiBrief
    : undefined;

  const canEditSelected = selectedInv
    ? (() => {
        const ir = IRREGULAR_COSTS.find((c) => c.id === selectedInv.linkedRecordId);
        if (ir) return canManageRecordInvestigation(activeUser, ir);
        const isTrade =
          selectedInv.linkedRecordType === 'customs_entry' ||
          selectedInv.department === 'Customs and Trade' ||
          selectedInv.department === 'Logistics';
        return (
          canPerformAction(activeUser, 'manage_investigations') ||
          (isTrade && canPerformAction(activeUser, 'manage_trade_investigations'))
        );
      })()
    : false;

  const handleAnalyzeWithAi = async () => {
    if (!selectedInv || !selectedThread) return;
    setAiLoading(true);
    setAiError(null);
    setActiveTab('actions');

    const ir = IRREGULAR_COSTS.find((c) => c.id === selectedInv.linkedRecordId);
    const cust = CUSTOMS_ENTRIES.find((c) => c.id === selectedInv.linkedRecordId);
    const qItem = state.reviewQueueItems.find(
      (q) => q.stableRecordId === selectedInv.linkedRecordId
    );
    const sourceRecord =
      ir ?? cust ?? qItem ?? { recordId: selectedInv.linkedRecordId, notes: selectedInv.notes };
    const ruleSummaries = selectedRules.map((r) => `${r.ruleCode}: ${r.summary} (${r.detail})`);

    const res = await requestAiInvestigationBrief({
      investigation: selectedInv,
      sourceRecord,
      ruleSummaries: ruleSummaries.length ? ruleSummaries : selectedInv.ruleCodes ?? [],
      evidenceItems: selectedEvidence.map((e) => ({
        title: e.title,
        status: e.status,
        summary: e.summary,
      })),
      missingLinks: selectedThread.missingLinks,
      approvalSummaries: selectedApprovals.map((a) => ({
        title: a.title,
        workflowStatus: a.workflowStatus,
        amountCad: a.amountCad,
      })),
    });

    setAiLoading(false);
    if (!res.ok) {
      setAiError(res.userMessage);
      return;
    }

    setEphemeralBrief((prev) => ({ ...prev, [selectedInv.id]: res.brief }));
    updateInvestigationWorkflow(selectedInv.id, { aiBrief: res.brief });
  };

  const handleQueueKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (filteredInvestigations.length === 0) return;
    const currentIndex = filteredInvestigations.findIndex((i) => i.id === selectedInv?.id);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next =
        filteredInvestigations[Math.min(filteredInvestigations.length - 1, currentIndex + 1)];
      if (next) {
        setSelectedId(next.id);
        setAiError(null);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredInvestigations[Math.max(0, currentIndex - 1)];
      if (prev) {
        setSelectedId(prev.id);
        setAiError(null);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedId(filteredInvestigations[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedId(filteredInvestigations[filteredInvestigations.length - 1].id);
    }
  };

  const activeRegionLabel =
    state.selectedRegionId === 'all'
      ? null
      : REGIONS.find((r) => r.id === state.selectedRegionId)?.name ??
        (state.selectedRegionId === 'corporate' ? 'Corporate' : state.selectedRegionId);

  const selectedOwner = selectedInv
    ? DEMO_USERS.find((u) => u.id === selectedInv.ownerUserId)
    : undefined;
  const selectedExposureMeta = selectedInv ? getExposureCategoryLabel(selectedInv) : null;
  const selectedPendingGapsCount = selectedInv
    ? selectedEvidence.filter(
        (e) => e.status === 'missing_in_case' || e.status === 'pending_verification'
      ).length + (selectedThread?.missingLinks.length ?? 0)
    : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Investigations"
        actions={
          <div className="flex flex-wrap items-center gap-2 relative" ref={infoPopoverRef}>
            <button
              type="button"
              onClick={() => setShowInfoPopover((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5F6368] bg-white border border-[#E2E5E8] rounded hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer"
              aria-expanded={showInfoPopover}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Scope &amp; Sources</span>
            </button>

            {hasPermission('generate_reports') && (
              <button
                type="button"
                onClick={() =>
                  openReportStudioWithPreset({
                    templateId: 'financial_risk_review',
                    reportingPeriod: state.selectedQuarterId,
                    includedSections: [
                      'gov_investigation_summary',
                      'reg_irregular_costs',
                      'gov_outstanding_approvals',
                      'gov_quarantined_summary',
                      'gov_evidence_requirements',
                    ],
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#E53C2E]" />
                <span>Export Risk Review</span>
              </button>
            )}

            {showInfoPopover && (
              <div className="absolute right-0 top-10 z-30 w-80 sm:w-96 bg-white border border-[#E2E5E8] rounded-md shadow-sm p-4 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#231F20]">Investigation Scope &amp; Provenance</span>
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
                  Investigations unify irregular operating costs (App. 2.1/2.3), customs and broker
                  discrepancies (App. 3.2/3.3), and promoted Data Gateway quarantines. Recorded
                  expenses, broker variances, and unverified CUSMA recoveries are tracked separately
                  and never combined into a single total.
                </p>
                <div className="text-[11px] text-[#5F6368] pt-1 border-t border-[#F0F1F3]">
                  Active Role: <strong className="text-[#231F20]">{activeUser.name}</strong> ({activeUser.title})
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Period Applicability Notice when Layer 2 Period != Q3 2026 */}
      {state.selectedQuarterId !== 'Q3 2026' && (
        <div className="px-3.5 py-2 bg-white border border-[#E2E5E8] rounded-md flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#5F6368]">
            Case investigations reflect Q3 2026 operational &amp; customs exceptions (Appendix 2.1/2.3 &amp; 3.2).
          </span>
          <button
            type="button"
            onClick={() => setQuarterFilter('Q3 2026')}
            className="font-medium text-[#E53C2E] hover:underline cursor-pointer"
          >
            Switch to Q3 2026
          </button>
        </div>
      )}

      {/* Concise Actionable Investigation Summary Strip */}
      <section
        aria-label="Investigation Summary"
        className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E5E8]">
          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'unresolved' ? 'all' : 'unresolved'));
              setMobileView('queue');
            }}
            className={`p-3.5 text-left transition-colors cursor-pointer ${
              statusFilter === 'unresolved' ? 'bg-[#FDF2F1]' : 'hover:bg-[#F8F9FA]'
            }`}
          >
            <div className="text-[11px] font-medium text-[#5F6368]">Unresolved Investigations</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-[#E53C2E] tabular-nums">
                {summary.unresolvedCount}
              </span>
              <span className="text-[11px] text-[#5F6368] tabular-nums">
                of {summary.totalScoped} scoped
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setPriorityFilter((prev) => (prev === 'High' ? 'all' : 'High'));
              setMobileView('queue');
            }}
            className={`p-3.5 text-left transition-colors cursor-pointer ${
              priorityFilter === 'High' ? 'bg-[#FDF2F1]' : 'hover:bg-[#F8F9FA]'
            }`}
          >
            <div className="text-[11px] font-medium text-[#5F6368]">High Priority (Active)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-[#231F20] tabular-nums">
                {summary.highCount}
              </span>
              <span className="text-[11px] text-[#5F6368]">
                {priorityFilter === 'High' ? 'Filter active' : 'Click to filter'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'needs_action' ? 'all' : 'needs_action'));
              setMobileView('queue');
            }}
            className={`p-3.5 text-left transition-colors cursor-pointer ${
              statusFilter === 'needs_action' ? 'bg-[#FDF2F1]' : 'hover:bg-[#F8F9FA]'
            }`}
          >
            <div className="text-[11px] font-medium text-[#5F6368]">
              Requires Evidence or Approval
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold text-[#B45309] tabular-nums">
                {summary.needsActionCount}
              </span>
              <span className="text-[11px] text-[#5F6368]">
                {statusFilter === 'needs_action' ? 'Filter active' : 'Pending review / docs'}
              </span>
            </div>
          </button>

          {/* Separated Financial Exposure Categories (Never summed across heterogeneous types) */}
          <div className="p-3.5 space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-2 text-[#5F6368]">
              <span className="font-medium">Scoped Amounts (By Type)</span>
              {activeRegionLabel && (
                <button
                  type="button"
                  onClick={() => setRegionFilter('all')}
                  className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                >
                  {activeRegionLabel} · Reset
                </button>
              )}
            </div>
            {summary.unresolvedCount === 0 ? (
              <div className="text-[#5F6368] pt-0.5">No unresolved exposure in current scope.</div>
            ) : (
              <div className="space-y-0.5 font-mono tabular-nums text-[#231F20]">
                {summary.irregularExpensesCad > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[#5F6368]">Recorded Expenses</span>
                    <span className="font-semibold">{formatMoney(summary.irregularExpensesCad)}</span>
                  </div>
                )}
                {summary.brokerVarianceCad > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[#5F6368]">Broker Variances</span>
                    <span className="font-semibold">{formatMoney(summary.brokerVarianceCad)}</span>
                  </div>
                )}
                {summary.potentialRecoveryCad > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[#5F6368]">Potential CUSMA (Unverified)</span>
                    <span className="font-semibold">{formatMoney(summary.potentialRecoveryCad)}</span>
                  </div>
                )}
                {summary.quarantinedCad > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[#5F6368]">Quarantined (Excluded)</span>
                    <span className="font-semibold">{formatMoney(summary.quarantinedCad)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Unlinked Quarantined Records from Data Gateway */}
      {unlinkedQuarantined.length > 0 && hasPermission('review_quarantined_records') && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-amber-950 font-medium">
            {unlinkedQuarantined.length} quarantined Data Gateway item(s) ready to promote into Investigations:
          </span>
          <div className="flex flex-wrap gap-2">
            {unlinkedQuarantined.slice(0, 4).map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  const res = promoteQuarantinedToInvestigation(q.id);
                  if (res.investigation) {
                    setSelectedId(res.investigation.id);
                    setMobileView('detail');
                  }
                }}
                className="px-2.5 py-1 text-xs font-medium text-[#231F20] bg-white border border-amber-300 rounded hover:border-[#231F20] cursor-pointer"
              >
                + Link {q.stableRecordId} ({formatMoney(q.amountCad)})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TWO-PANEL INVESTIGATION WORKBENCH (Queue ~33% / Workspace ~67%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: INVESTIGATION QUEUE */}
        <section
          aria-label="Investigation Queue"
          className={`lg:col-span-4 bg-white border border-[#E2E5E8] rounded-md overflow-hidden lg:sticky lg:top-4 ${
            mobileView === 'detail' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Search & Filters */}
          <div className="p-3 border-b border-[#E2E5E8] bg-[#F8F9FA] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#231F20]">
                Queue ({filteredInvestigations.length})
              </span>
              {hasActiveQueueFilters && (
                <button
                  type="button"
                  onClick={resetQueueFilters}
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
                placeholder="Search ID (IR-01, E-08), title, department..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E5E8] rounded focus:outline-none focus:border-[#231F20]"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <select
                aria-label="Filter by workflow status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as QueueStatusFilter)}
                className="bg-white border border-[#E2E5E8] rounded px-2 py-1 text-[#231F20]"
              >
                <option value="all">All Statuses</option>
                <option value="unresolved">Unresolved Only</option>
                <option value="needs_action">Needs Evidence / Approval</option>
                {WORKFLOW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as 'all' | 'High' | 'Medium' | 'Standard')
                }
                className="bg-white border border-[#E2E5E8] rounded px-2 py-1 text-[#231F20]"
              >
                <option value="all">All Priorities</option>
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Standard">Standard Priority</option>
              </select>

              <select
                aria-label="Filter by owner"
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="bg-white border border-[#E2E5E8] rounded px-2 py-1 text-[#231F20]"
              >
                <option value="all">All Owners</option>
                {DEMO_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as QueueCategoryFilter)}
                className="bg-white border border-[#E2E5E8] rounded px-2 py-1 text-[#231F20]"
              >
                <option value="all">All Categories</option>
                <option value="irregular_cost">Irregular Costs</option>
                <option value="customs_entry">Customs &amp; Broker</option>
                <option value="quarantined_record">Quarantined Uploads</option>
              </select>
            </div>
          </div>

          {/* Scrollable Queue List with Keyboard Support */}
          <div
            role="listbox"
            aria-label="Investigation items"
            tabIndex={0}
            onKeyDown={handleQueueKeyDown}
            className="divide-y divide-[#E2E5E8] max-h-[calc(100vh-290px)] min-h-[320px] overflow-y-auto focus:outline-none"
          >
            {filteredInvestigations.map((inv) => {
              const active = selectedInv?.id === inv.id;
              const owner = DEMO_USERS.find((u) => u.id === inv.ownerUserId);
              const expMeta = getExposureCategoryLabel(inv);

              return (
                <button
                  key={inv.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedId(inv.id);
                    setAiError(null);
                    setMobileView('detail');
                  }}
                  className={`w-full text-left p-3 transition-colors cursor-pointer ${
                    active ? 'bg-[#FDF2F1]' : 'bg-white hover:bg-[#F8F9FA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`font-mono font-semibold ${
                          active ? 'text-[#E53C2E]' : 'text-[#231F20]'
                        }`}
                      >
                        {inv.linkedRecordId}
                      </span>
                      <span className="text-[#D4D8DD]">·</span>
                      <span className={`font-medium ${PRIORITY_TEXT_CLS[inv.priority]}`}>
                        {inv.priority}
                      </span>
                    </div>
                    <span
                      className={`font-semibold text-[11px] shrink-0 ${
                        STATUS_TEXT_CLS[inv.workflowStatus]
                      }`}
                    >
                      {inv.workflowStatus}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-[#231F20] mt-1 leading-snug line-clamp-2">
                    {inv.title}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#5F6368] mt-1.5">
                    <span className="truncate">
                      {inv.department} · {owner?.name ?? 'Unassigned'}
                    </span>
                    <span className="font-mono font-semibold text-[#231F20] tabular-nums shrink-0">
                      {formatCompactMoney(inv.exposureCad)}{' '}
                      <span className="font-sans font-normal text-[#5F6368]">
                        ({expMeta.shortTag})
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredInvestigations.length === 0 && (
              <div className="p-6 text-center space-y-2 text-xs text-[#5F6368]">
                <div>No investigations match the active filters.</div>
                {(hasActiveQueueFilters || state.selectedRegionId !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      resetQueueFilters();
                      if (state.selectedRegionId !== 'all') setRegionFilter('all');
                    }}
                    className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: INVESTIGATION WORKSPACE */}
        <section
          aria-label="Investigation Workspace"
          className={`lg:col-span-8 bg-white border border-[#E2E5E8] rounded-md overflow-hidden ${
            mobileView === 'queue' ? 'hidden lg:block' : 'block'
          }`}
        >
          {selectedInv && selectedThread && selectedExposureMeta ? (
            <div>
              {/* Mobile Back-to-Queue Bar */}
              <div className="lg:hidden px-4 py-2.5 border-b border-[#E2E5E8] bg-[#F8F9FA]">
                <button
                  type="button"
                  onClick={() => setMobileView('queue')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#231F20] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#E53C2E]" />
                  <span>Back to Queue ({filteredInvestigations.length})</span>
                </button>
              </div>

              {/* Selected Investigation Header */}
              <div className="p-4 sm:p-5 border-b border-[#E2E5E8] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#5F6368]">
                      <span className="font-mono font-semibold text-[#E53C2E]">
                        {selectedInv.linkedRecordId}
                      </span>
                      <span>·</span>
                      <span>{selectedInv.department}</span>
                      <span>·</span>
                      <ProvenanceText provenance={selectedInv.provenance} />
                    </div>
                    <h2 className="text-base font-semibold text-[#231F20] leading-snug">
                      {selectedInv.title}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openRecordById(selectedInv.linkedRecordId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer whitespace-nowrap"
                    >
                      <span>Inspect Source</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={handleAnalyzeWithAi}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {aiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
                      )}
                      <span>{aiLoading ? 'Analyzing…' : 'Analyze with AI'}</span>
                    </button>
                  </div>
                </div>

                {/* Key Context Summary Row */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-[#F0F1F3] text-xs">
                  <div>
                    <div className="text-[11px] text-[#5F6368]">{selectedExposureMeta.shortTag}</div>
                    <div className="font-mono font-semibold text-[#231F20] tabular-nums mt-0.5">
                      {formatMoney(selectedInv.exposureCad)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Assigned Owner</div>
                    <div className="font-medium text-[#231F20] mt-0.5 truncate">
                      {selectedOwner?.name ?? 'Unassigned'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Status</div>
                    <div className={`font-semibold mt-0.5 ${STATUS_TEXT_CLS[selectedInv.workflowStatus]}`}>
                      {selectedInv.workflowStatus}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Priority</div>
                    <div className={`font-semibold mt-0.5 ${PRIORITY_TEXT_CLS[selectedInv.priority]}`}>
                      {selectedInv.priority}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F6368]">Open Gaps</div>
                    <div className="font-medium text-[#231F20] mt-0.5">
                      {selectedPendingGapsCount > 0
                        ? `${selectedPendingGapsCount} item(s) pending`
                        : selectedApprovals.length > 0
                          ? `Approval: ${selectedApprovals[0].workflowStatus}`
                          : 'None flagged'}
                    </div>
                  </div>
                </div>

                {/* Inline AI Error Feedback if triggered from header */}
                {aiError && activeTab !== 'actions' && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}
              </div>

              {/* Four Workspace Tabs */}
              <div
                role="tablist"
                aria-label="Investigation sections"
                className="px-4 sm:px-5 border-b border-[#E2E5E8] bg-[#F8F9FA] flex items-center gap-1 overflow-x-auto"
              >
                {(
                  [
                    { id: 'overview', label: 'Overview' },
                    {
                      id: 'thread',
                      label: `Digital Thread (${selectedThread.nodes.length})`,
                    },
                    {
                      id: 'evidence',
                      label: `Evidence (${selectedEvidence.length})`,
                    },
                    {
                      id: 'actions',
                      label: `Actions & AI`,
                    },
                  ] as const
                ).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#E53C2E] text-[#231F20] font-semibold'
                          : 'border-transparent text-[#5F6368] hover:text-[#231F20]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Body */}
              <div className="p-4 sm:p-5">
                {activeTab === 'overview' && (
                  <InvestigationOverviewTab
                    investigation={selectedInv}
                    rules={selectedRules}
                    evidence={selectedEvidence}
                    approvals={selectedApprovals}
                    thread={selectedThread}
                    activeBrief={activeBrief}
                    onGoToTab={(tab) => setActiveTab(tab)}
                    onInspectRecord={openRecordById}
                  />
                )}

                {activeTab === 'thread' && (
                  <FinancialDigitalThreadView
                    recordId={selectedInv.linkedRecordId}
                    onOpenEvidenceTab={() => setActiveTab('evidence')}
                  />
                )}

                {activeTab === 'evidence' && (
                  <InvestigationEvidenceTab
                    investigation={selectedInv}
                    evidence={selectedEvidence}
                    missingLinks={selectedThread.missingLinks}
                    canSubmitGovernance={canSubmitGovernance}
                    onAddEvidence={addSupportingEvidence}
                    onExtractClaims={requestAiEvidenceExtraction}
                    onRouteEvidenceForReview={(title, rationale) =>
                      createGovernanceRequest({
                        linkedRecordId: selectedInv.linkedRecordId,
                        requestType: 'evidence_submission',
                        title,
                        amountCad: selectedInv.exposureCad,
                        rationale,
                        requiredApprovalsCount: 1,
                      })
                    }
                  />
                )}

                {activeTab === 'actions' && (
                  <InvestigationActionsTab
                    investigation={selectedInv}
                    activeUser={activeUser}
                    canEditSelected={canEditSelected}
                    canSubmitGovernance={canSubmitGovernance}
                    approvals={selectedApprovals}
                    auditEvents={selectedAudit}
                    savedAiNotes={savedAiNotes}
                    activeBrief={activeBrief}
                    aiLoading={aiLoading}
                    aiError={aiError}
                    onAnalyzeWithAi={handleAnalyzeWithAi}
                    onSaveAiNote={saveAiInvestigationNote}
                    onUpdateWorkflow={updateInvestigationWorkflow}
                    onCreateEscalation={createGovernanceRequest}
                    onNavigate={(route) => navigate(route)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#5F6368] space-y-2">
              <div>No investigation selected or none match the active region and queue filters.</div>
              {(hasActiveQueueFilters || state.selectedRegionId !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    resetQueueFilters();
                    if (state.selectedRegionId !== 'all') setRegionFilter('all');
                  }}
                  className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                >
                  Reset filters to view scoped investigations
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
