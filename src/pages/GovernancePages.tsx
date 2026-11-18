import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { CUSTOMS_ENTRIES, DATA_DISCREPANCIES, INCOME_STATEMENTS, IRREGULAR_COSTS } from '../data/caseSeed';
import { filterCustomsEntriesForUser, filterIrregularCostsForUser, getRoleDefinition } from '../domain/permissions';
import { runFinancialAcceptanceChecks } from '../domain/rulesEngine';
import { AuditEvent } from '../types/domain';
import { useApp } from '../context/AppContext';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';

type AuditTab = 'activity' | 'verification';
type DateRangeFilter = 'all' | 'today' | 'last_7_days';

const ACTION_TYPE_LABELS: Record<AuditEvent['actionType'], string> = {
  role_switched: 'Role Switched',
  filter_changed: 'Filter Changed',
  rule_threshold_updated: 'Rule Threshold Updated',
  investigation_status_updated: 'Investigation Updated',
  evidence_note_added: 'Evidence Note Added',
  evidence_added: 'Evidence Added',
  correction_requested: 'Correction Requested',
  correction_approved: 'Correction Approved',
  request_approved: 'Request Approved',
  request_rejected: 'Request Rejected',
  record_resolution_updated: 'Resolution Updated',
  file_uploaded: 'File Uploaded',
  validation_completed: 'Validation Completed',
  record_quarantined: 'Record Quarantined',
  record_rejected: 'Record Rejected',
  import_submitted: 'Import Submitted',
  import_authorized: 'Import Authorized',
  scenario_saved: 'Scenario Saved',
  scenario_deleted: 'Scenario Deleted',
  demo_state_reset: 'Demo State Reset',
  ai_query_executed: 'AI Query Executed',
  ai_investigation_note_saved: 'AI Note Saved',
  ai_briefing_generated: 'AI Briefing Generated',
  ai_gateway_assist_used: 'AI Mapping Assist Used',
  ai_evidence_extracted: 'AI Evidence Extracted',
  investigation_assigned: 'Investigation Assigned',
  investigation_dismissed: 'Investigation Dismissed',
  opportunity_updated: 'Opportunity Updated',
  report_saved: 'Report Saved',
  report_duplicated: 'Report Duplicated',
  report_deleted: 'Report Deleted',
  report_exported: 'Report Exported',
  ai_report_summary_generated: 'AI Report Summary',
};

const PROVENANCE_LABELS: Record<AuditEvent['provenance'], string> = {
  official_case_data: 'Official Case Data',
  derived_calculation: 'Derived Calculation',
  hypothetical_scenario: 'Hypothetical Scenario',
  demonstration_state: 'Session Demonstration State',
  user_uploaded: 'User Uploaded Dataset',
};

function formatActionLabel(actionType: AuditEvent['actionType']): string {
  return ACTION_TYPE_LABELS[actionType] ?? actionType.replace(/_/g, ' ');
}

function mapRecordedStatus(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('reject')) return 'Rejected';
  if (normalized.includes('quarant')) return 'Quarantined';
  if (
    normalized === 'approved' ||
    normalized === 'demo_approved' ||
    normalized === 'authorized_committed' ||
    normalized.includes('approv')
  ) {
    return 'Approved';
  }
  if (normalized.includes('pending') || normalized === 'pending_verification') return 'Pending';
  if (normalized === 'in_review') return 'In Review';
  if (normalized === 'additional_evidence_required') return 'Additional Evidence Required';
  if (normalized === 'submitted') return 'Submitted';
  if (normalized.includes('stage') || normalized === 'staged_preview' || normalized === 'submitted_for_authorization') {
    return 'Staged';
  }
  return value.trim();
}

function recordedOutcome(ev: AuditEvent): string | null {
  const recorded = ev.newState?.trim();
  if (recorded) return mapRecordedStatus(recorded);
  switch (ev.actionType) {
    case 'request_rejected':
    case 'record_rejected':
    case 'investigation_dismissed':
      return 'Rejected';
    case 'record_quarantined':
      return 'Quarantined';
    case 'request_approved':
    case 'correction_approved':
    case 'import_authorized':
      return 'Approved';
    case 'file_uploaded':
    case 'import_submitted':
      return 'Staged';
    default:
      return null;
  }
}

function outcomeTone(label: string | null): string {
  if (label === 'Rejected') return 'text-[#DC2626] bg-red-50 border-red-200';
  if (label === 'Approved') return 'text-[#15803D] bg-emerald-50 border-emerald-200';
  if (label === 'Quarantined' || label === 'Pending') return 'text-[#B45309] bg-amber-50 border-amber-200';
  return 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]';
}

function batchStatusLabel(status: string): string {
  switch (status) {
    case 'staged_preview':
      return 'Staged';
    case 'submitted_for_authorization':
      return 'Pending';
    case 'authorized_committed':
      return 'Authorized';
    case 'rejected':
      return 'Rejected';
    case 'quarantined':
      return 'Quarantined';
    case 'validated':
      return 'Validated';
    default:
      return status;
  }
}

function formatAuditTimestamp(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Toronto',
  }).format(ts);
}

function summarizeEvent(ev: AuditEvent): string {
  const raw = ev.summary.trim();
  if (raw.length <= 125) return raw;
  return `${raw.slice(0, 122).trimEnd()}...`;
}

const FINANCIAL_DISCREPANCY_IDS = new Set(['DISC-03', 'DISC-04']);

export const AuditHistoryPage: React.FC = () => {
  const { state, activeUser, hasPermission } = useApp();
  const checks = useMemo(() => runFinancialAcceptanceChecks(), []);
  const passedChecksCount = useMemo(() => checks.filter((c) => c.passed).length, [checks]);
  const allPassed = passedChecksCount === checks.length;

  const [activeTab, setActiveTab] = useState<AuditTab>('activity');
  const [contextHelpOpen, setContextHelpOpen] = useState(false);

  // Activity Log state
  const [auditSearch, setAuditSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Data Verification state
  const [checksTableExpanded, setChecksTableExpanded] = useState(false);
  const [expandedDiscrepancyId, setExpandedDiscrepancyId] = useState<string | null>(null);
  const [unitRulesExpanded, setUnitRulesExpanded] = useState(false);

  const canSeeFinancials = hasPermission('view_financials');
  const canSeeTrade = hasPermission('view_trade');

  const scopedAuditEvents = useMemo(() => {
    const visibleIrregular = new Set(filterIrregularCostsForUser(activeUser, IRREGULAR_COSTS).map((item) => item.id));
    const visibleCustoms = new Set(filterCustomsEntriesForUser(activeUser, CUSTOMS_ENTRIES).map((item) => item.id));
    return state.auditEvents.filter((ev) => {
      if (ev.targetRecordId && IRREGULAR_COSTS.some((item) => item.id === ev.targetRecordId)) {
        return visibleIrregular.has(ev.targetRecordId);
      }
      if (ev.targetRecordId && CUSTOMS_ENTRIES.some((item) => item.id === ev.targetRecordId)) {
        return visibleCustoms.has(ev.targetRecordId);
      }
      if (!canSeeFinancials && ev.batchId) {
        const batch = state.importBatches.find((item) => item.id === ev.batchId);
        if (batch?.targetDomain === 'ledger') return false;
      }
      return true;
    });
  }, [activeUser, canSeeFinancials, state.auditEvents, state.importBatches]);

  const uniqueActions = useMemo(
    () => Array.from(new Set(scopedAuditEvents.map((e) => e.actionType))).sort(),
    [scopedAuditEvents]
  );

  const uniqueOutcomes = useMemo(() => {
    const labels = new Set<string>();
    scopedAuditEvents.forEach((event) => {
      const label = recordedOutcome(event);
      if (label) labels.add(label);
    });
    return Array.from(labels).sort();
  }, [scopedAuditEvents]);

  const uniqueActors = useMemo(() => {
    const names = new Set<string>();
    scopedAuditEvents.forEach((e) => names.add(e.actorName));
    return Array.from(names).sort();
  }, [scopedAuditEvents]);

  const filteredAuditEvents = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return scopedAuditEvents.filter((ev) => {
      if (actionFilter !== 'all' && ev.actionType !== actionFilter) return false;
      if (outcomeFilter !== 'all' && (recordedOutcome(ev) ?? 'Not recorded') !== outcomeFilter) return false;
      if (actorFilter !== 'all') {
        if (actorFilter === '__system__' && (ev.actorType ?? 'user') !== 'system') return false;
        if (actorFilter !== '__system__' && ev.actorName !== actorFilter) return false;
      }
      if (batchFilter !== 'all' && ev.batchId !== batchFilter) return false;
      if (dateFilter === 'today') {
        const eventDay = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(ev.timestampIso));
        if (eventDay !== todayKey) return false;
      } else if (dateFilter === 'last_7_days') {
        const ts = Date.parse(ev.timestampIso);
        if (!Number.isNaN(ts) && ts < sevenDaysAgoMs) return false;
      }
      if (q) {
        const outcome = recordedOutcome(ev) ?? '';
        const hit =
          ev.id.toLowerCase().includes(q) ||
          ev.summary.toLowerCase().includes(q) ||
          ev.actorName.toLowerCase().includes(q) ||
          formatActionLabel(ev.actionType).toLowerCase().includes(q) ||
          outcome.toLowerCase().includes(q) ||
          (ev.targetRecordId ?? '').toLowerCase().includes(q) ||
          (ev.authorizationRef ?? '').toLowerCase().includes(q) ||
          (ev.reason ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [actionFilter, actorFilter, auditSearch, batchFilter, dateFilter, outcomeFilter, scopedAuditEvents]);

  const hasActiveActivityFilters =
    auditSearch.trim().length > 0 ||
    actionFilter !== 'all' ||
    outcomeFilter !== 'all' ||
    actorFilter !== 'all' ||
    dateFilter !== 'all' ||
    batchFilter !== 'all';

  const visibleDiscrepancies = DATA_DISCREPANCIES.filter(
    (item) => canSeeFinancials || !FINANCIAL_DISCREPANCY_IDS.has(item.id)
  );
  const visibleBatches = state.importBatches.filter(
    (batch) => canSeeFinancials || batch.targetDomain !== 'ledger'
  );

  if (!hasPermission('view_audit_history')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit History" />
        <UnavailableDataState
          title="Audit History restricted for Operational Contributor"
          description="Switch to Helen Park (Group Controller), Dana Morales (Cost Accountant), or Marco Silva (Customs & Trade Coordinator) to inspect audit history and verification checks."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit History"
        actions={
          <button
            type="button"
            onClick={() => setContextHelpOpen((v) => !v)}
            aria-expanded={contextHelpOpen}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap cursor-pointer transition-colors ${
              contextHelpOpen
                ? 'bg-[#231F20] text-white border-[#231F20]'
                : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20] hover:bg-[#F5F6F7]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Scope & Persistence</span>
          </button>
        }
      />

      {/* Contextual Scope & Limitations Disclosure */}
      {contextHelpOpen && (
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 text-xs text-[#5F6368] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold text-[#231F20]">Demonstration Audit Persistence & Scope</p>
            <p className="leading-relaxed">
              The activity log is kept in this browser. Resetting demonstration workspace data does not delete it, and it is not written to a production ERP. Reference checks compare official case figures with Appendix baselines. A validated upload remains demonstration data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setContextHelpOpen(false)}
            className="text-[#5F6368] hover:text-[#231F20] self-end sm:self-start cursor-pointer"
            aria-label="Close scope disclosure"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-View Tab Switcher */}
      <div className="border-b border-[#E2E5E8] flex items-center gap-1" role="tablist" aria-label="Audit History views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'activity'}
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'activity'
              ? 'border-[#E53C2E] text-[#231F20] font-semibold'
              : 'border-transparent text-[#5F6368] hover:text-[#231F20]'
          }`}
        >
          Activity Log{' '}
          <span className="ml-1 text-[11px] text-[#5F6368] tabular-nums">({scopedAuditEvents.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'verification'}
          onClick={() => setActiveTab('verification')}
          className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'verification'
              ? 'border-[#E53C2E] text-[#231F20] font-semibold'
              : 'border-transparent text-[#5F6368] hover:text-[#231F20]'
          }`}
        >
          <span>Data Verification</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
              allPassed ? 'bg-emerald-50 text-[#15803D]' : 'bg-red-50 text-[#DC2626]'
            }`}
          >
            {passedChecksCount}/{checks.length}
          </span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: ACTIVITY LOG (DEFAULT)                                */}
      {/* ============================================================ */}
      {activeTab === 'activity' && (
        <section className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
          {/* Search & Filters */}
          <div className="p-3.5 border-b border-[#E2E5E8] flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[#9AA0A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action, user, record ID, approval ref, or rationale..."
                className="w-full pl-8 pr-3 py-1.5 border border-[#E2E5E8] rounded-md bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
              />
            </div>

            <select
              aria-label="Filter by event type"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            >
              <option value="all">All Event Types</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>
                  {formatActionLabel(a)}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by outcome"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            >
              <option value="all">All Outcomes</option>
              <option value="Not recorded">Not recorded</option>
              {uniqueOutcomes.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcome}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
              className="px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-[#231F20] cursor-pointer"
            >
              More filters
            </button>

            {hasActiveActivityFilters && (
              <button
                type="button"
                onClick={() => {
                  setAuditSearch('');
                  setActionFilter('all');
                  setOutcomeFilter('all');
                  setActorFilter('all');
                  setDateFilter('all');
                  setBatchFilter('all');
                }}
                className="px-2 py-1.5 text-xs font-medium text-[#E53C2E] hover:underline whitespace-nowrap cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          {moreFiltersOpen && (
            <div className="px-3.5 py-2.5 border-b border-[#E2E5E8] flex flex-wrap items-center gap-2 text-xs bg-[#F8F9FA]">
              <select
                aria-label="Filter by actor"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-white text-[#231F20] focus:outline-none focus:border-[#231F20]"
              >
                <option value="all">All Actors</option>
                <option value="__system__">Validation Engine</option>
                {uniqueActors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
                className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-white text-[#231F20] focus:outline-none focus:border-[#231F20]"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="last_7_days">Last 7 Days</option>
              </select>
              {visibleBatches.length > 0 && (
                <select
                  aria-label="Filter by import batch"
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-white text-[#231F20] max-w-[180px] focus:outline-none focus:border-[#231F20]"
                >
                  <option value="all">All Import Batches</option>
                  {visibleBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.fileName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs text-left border-collapse">
                <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                  <tr>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Timestamp</th>
                    <th className="py-2.5 px-3 font-medium">Actor</th>
                    <th className="py-2.5 px-3 font-medium">Action / Event Type</th>
                    <th className="py-2.5 px-3 font-medium">Related Record</th>
                    <th className="py-2.5 px-3 font-medium">Outcome / Status</th>
                    <th className="py-2.5 px-3 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8]">
                  {filteredAuditEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center">
                        <p className="text-sm font-medium text-[#231F20]">No matching activity events</p>
                        <p className="text-xs text-[#5F6368] mt-1">
                          {scopedAuditEvents.length === 0
                            ? 'Session governance, upload, and export actions appear here as they occur.'
                            : 'Try clearing active search or filter criteria.'}
                        </p>
                      </td>
                    </tr>
                  )}
                  {filteredAuditEvents.map((ev) => {
                    const isExpanded = expandedEventId === ev.id;
                    const outcome = recordedOutcome(ev);
                    return (
                      <React.Fragment key={ev.id}>
                        <tr
                          onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          className={`cursor-pointer align-top transition-colors ${
                            isExpanded ? 'bg-[#F5F6F7]' : 'hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-[#5F6368] tabular-nums whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform ${
                                  isExpanded ? 'rotate-90 text-[#231F20]' : ''
                                }`}
                              />
                              <span title={ev.timestampIso}>{formatAuditTimestamp(ev.timestampIso)}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[#231F20]">{ev.actorName}</div>
                            <div className="text-[11px] text-[#5F6368]">{ev.actorRoleLabel}</div>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#231F20]">{formatActionLabel(ev.actionType)}</td>
                          <td className="py-2.5 px-3 font-medium text-[#231F20] break-all">{ev.targetRecordId ?? '—'}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${outcomeTone(outcome)}`}>
                              {outcome ?? 'Not recorded'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#231F20] min-w-[16rem] break-words">{summarizeEvent(ev)}</td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#F8F9FA]">
                            <td colSpan={6} className="px-4 py-3.5 border-t border-[#E2E5E8]">
                              <div className="space-y-3 text-xs">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">Event ID</p>
                                    <p className="font-medium text-[#231F20] break-all">{ev.id}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">Exact Timestamp</p>
                                    <p className="font-medium text-[#231F20] tabular-nums">{ev.timestampIso}</p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">Related Record & Source</p>
                                    <p className="font-medium text-[#231F20]">
                                      {ev.targetRecordId ?? 'Not specified'} · {PROVENANCE_LABELS[ev.provenance]}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">State Transition</p>
                                    <p className="font-medium text-[#231F20]">
                                      {ev.previousState || ev.newState
                                        ? `${ev.previousState ?? 'Not recorded'} → ${ev.newState ?? 'Not recorded'}`
                                        : 'Not recorded'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">Approval / Import Reference</p>
                                    <p className="font-medium text-[#231F20]">
                                      {ev.authorizationRef || ev.batchId
                                        ? [ev.authorizationRef, ev.batchId].filter(Boolean).join(' · ')
                                        : 'None'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-[#5F6368]">Actor & Event Type</p>
                                    <p className="font-medium text-[#231F20]">
                                      {ev.actorType === 'system' ? 'System' : 'User'} · {ev.actionType}
                                    </p>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-[#E2E5E8] space-y-1">
                                  <p className="text-[11px] font-medium text-[#5F6368]">Full Summary</p>
                                  <p className="text-[#231F20] leading-relaxed">{ev.summary}</p>
                                  {ev.reason && (
                                    <p className="text-[#231F20] pt-1">
                                      <strong>Decision Rationale:</strong> {ev.reason}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* TAB 2: DATA VERIFICATION                                     */}
      {/* ============================================================ */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#231F20]">Sources and coverage</h2>
              <p className="text-xs text-[#5F6368] mt-0.5">
                Official case records come from the Appendix dataset. Uploads in this browser stay demonstration data even after validation or authorization.
              </p>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[#5F6368]">Official case source</dt>
                <dd className="text-[#231F20] mt-0.5">Appendix competition dataset · official case records</dd>
              </div>
              {canSeeTrade && (
                <div>
                  <dt className="text-[#5F6368]">Customs coverage</dt>
                  <dd className="text-[#231F20] mt-0.5 tabular-nums">{CUSTOMS_ENTRIES.length} official customs entries</dd>
                </div>
              )}
              {canSeeFinancials && (
                <div>
                  <dt className="text-[#5F6368]">Financial coverage</dt>
                  <dd className="text-[#231F20] mt-0.5 tabular-nums">
                    {INCOME_STATEMENTS.length} income statements · {IRREGULAR_COSTS.length} irregular cost records
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[#5F6368]">Uploaded demonstration data</dt>
                <dd className="text-[#231F20] mt-0.5 tabular-nums">
                  {visibleBatches.length === 0 ? 'None in this browser' : `${visibleBatches.length} batch${visibleBatches.length === 1 ? '' : 'es'}`}
                </dd>
              </div>
            </dl>
            {visibleBatches.length > 0 && (
              <div className="border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8]">
                {visibleBatches.map((batch) => {
                  const open = expandedBatchId === batch.id;
                  return (
                    <div key={batch.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedBatchId(open ? null : batch.id)}
                        aria-expanded={open}
                        className="w-full px-3 py-2 text-left flex items-center justify-between gap-3 hover:bg-[#F8F9FA] cursor-pointer"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-[#231F20] break-words">{batch.fileName}</span>
                          <span className="block text-[11px] text-[#5F6368] mt-0.5">
                            {batch.targetDomain} · {batchStatusLabel(batch.status)} · demonstration upload
                          </span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[#5F6368] shrink-0 ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="px-3 pb-3 text-xs text-[#5F6368] space-y-1">
                          <p className="tabular-nums">
                            {batch.recordCount} records · {batch.validatedCount} validated · {batch.quarantinedCount} quarantined · {batch.rejectedCount} rejected
                          </p>
                          <p>Provenance: {PROVENANCE_LABELS[batch.provenance] ?? 'User uploaded dataset'}. Validation does not make these official case records.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {canSeeFinancials && (
          <section className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className={`w-5 h-5 shrink-0 mt-0.5 ${allPassed ? 'text-[#15803D]' : 'text-[#DC2626]'}`}
                />
                <div className="space-y-0.5">
                  <h2 className="text-sm font-semibold text-[#231F20] tabular-nums">
                    {passedChecksCount} / {checks.length} Financial Reference Checks Passed
                  </h2>
                  <p className="text-xs text-[#5F6368]">
                    Compares official case figures with Appendix baselines. It does not validate uploaded files or turn them into case records.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setChecksTableExpanded((v) => !v)}
                aria-expanded={checksTableExpanded}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md hover:bg-[#F0F1F3] whitespace-nowrap self-start sm:self-center cursor-pointer"
              >
                <span>{checksTableExpanded ? 'Hide Verification Table' : `View Verification Table (${checks.length})`}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${checksTableExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {checksTableExpanded && (
              <div className="border-t border-[#E2E5E8] overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368]">
                      <th className="py-2 px-4 text-left font-medium">Reference Criterion</th>
                      <th className="py-2 px-4 text-right font-medium">Appendix Expected</th>
                      <th className="py-2 px-4 text-right font-medium">Computed Actual</th>
                      <th className="py-2 px-4 text-center font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                    {checks.map((c) => (
                      <tr key={c.label}>
                        <td className="py-2 px-4 text-[#231F20] font-medium">{c.label}</td>
                        <td className="py-2 px-4 text-right text-[#5F6368]">{c.expected}</td>
                        <td className="py-2 px-4 text-right font-medium text-[#231F20]">{c.actual}</td>
                        <td className="py-2 px-4 text-center whitespace-nowrap">
                          {c.passed ? (
                            <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#DC2626] font-medium">
                              <XCircle className="w-3.5 h-3.5" /> Fail
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}

          {/* Documented Source Discrepancies */}
          <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#231F20]">
                Unresolved source discrepancies ({visibleDiscrepancies.length})
              </h2>
              <p className="text-xs text-[#5F6368]">
                Conflicting or differently scaled Appendix figures are preserved verbatim without silent alteration.
              </p>
            </div>

            <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded-md">
              {visibleDiscrepancies.map((d) => {
                const expanded = expandedDiscrepancyId === d.id;
                return (
                  <div key={d.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedDiscrepancyId(expanded ? null : d.id)}
                      aria-expanded={expanded}
                      className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-[#F8F9FA] cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#E53C2E]">{d.id}</span>
                          <span className="font-semibold text-[#231F20]">{d.title}</span>
                        </div>
                        <p className="text-[11px] text-[#5F6368] mt-0.5">{d.affectedReferences.join(' · ')}</p>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-[#5F6368] shrink-0 transition-transform ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {expanded && (
                      <div className="px-4 pb-3.5 pt-2.5 border-t border-[#E2E5E8] bg-[#F8F9FA] text-xs space-y-2">
                        <p className="text-[#5F6368] leading-relaxed">{d.description}</p>
                        <p className="text-[#231F20]">
                          <strong>Handling Policy:</strong> {d.handlingPolicy}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Unit-Conversion & Normalization Rules */}
          <section className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setUnitRulesExpanded((v) => !v)}
              aria-expanded={unitRulesExpanded}
              className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-[#F8F9FA] cursor-pointer"
            >
              <div>
                <h2 className="text-sm font-semibold text-[#231F20]">Unit-Conversion & Normalization Rules</h2>
                <p className="text-xs text-[#5F6368]">
                  How Appendix tables reported in thousands of CAD are aligned with full-CAD transaction schedules.
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#5F6368] shrink-0 transition-transform ${
                  unitRulesExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {unitRulesExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-[#E2E5E8] bg-[#F8F9FA] text-xs text-[#5F6368] space-y-2">
                <p>
                  <strong className="text-[#231F20]">Thousands-scaled statements (`thousands_cad`):</strong> Appendix 1.1–1.4, 2.2, and 3.6 are published in thousands of CAD and normalized by multiplying by 1,000 when stored in full CAD while retaining original `sourceUnit` metadata.
                </p>
                <p>
                  <strong className="text-[#231F20]">Exact full-CAD schedules (`full_cad`):</strong> Appendix 2.1, 2.3, and 3.1–3.5 are recorded at exact CAD dollar-cent precision using integer minor cents (`toMinorCents` / `fromMinorCents`) to avoid floating-point drift.
                </p>
                <p>
                  <strong className="text-[#231F20]">Rounding preservation:</strong> Exact operational totals (such as Q3 2026 trade spend CAD 736,770) are never overwritten by rounded series figures (CAD 737,000 in Appendix 3.6); both remain accessible with source references.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export const SettingsAccessPage: React.FC = () => {
  const {
    activeUser,
    state,
    hasPermission,
    toggleBusinessRule,
    updateRuleThreshold,
    setCurrencyPreference,
    setSidebarCollapsed,
    resetDemoState,
  } = useApp();

  const [confirmReset, setConfirmReset] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const canConfigRules = hasPermission('configure_business_rules');
  const activeRole = getRoleDefinition(activeUser.roleId);

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader title="Settings" />

      {/* 1. Preferences */}
      <section className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[#231F20]">Preferences</h2>
            <p className="text-xs text-[#5F6368] mt-0.5">
            Reporting currency and sidebar width for this browser.
          </p>
        </div>

        <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded-md">
          {/* Reporting Currency */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[#231F20]">Reporting Currency</div>
              <p className="text-xs text-[#5F6368]">
                {state.currency === 'USD'
                  ? 'Converted at static demonstration rate 1 CAD = 0.72 USD (1 USD ≈ 1.3889 CAD). Underlying case baselines remain in CAD.'
                  : 'Displaying authoritative CAD financial and customs baselines. Switch to USD using static rate 1 CAD = 0.72 USD.'}
              </p>
            </div>
            <div
              className="inline-flex bg-[#F5F6F7] border border-[#E2E5E8] rounded-md p-0.5 shrink-0 self-start sm:self-center"
              role="group"
              aria-label="Reporting currency"
            >
              {(['CAD', 'USD'] as const).map((cur) => {
                const selected = state.currency === cur;
                return (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setCurrencyPreference(cur)}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? 'bg-[#231F20] text-white shadow-xs'
                        : 'text-[#5F6368] hover:text-[#231F20]'
                    }`}
                  >
                    {cur === 'CAD' ? 'CAD ($)' : 'USD (US$)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sidebar Layout */}
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[#231F20]">Navigation Sidebar</div>
              <p className="text-xs text-[#5F6368]">
                Choose whether the left navigation rail stays expanded with labels or compact with icons.
              </p>
            </div>
            <div
              className="inline-flex bg-[#F5F6F7] border border-[#E2E5E8] rounded-md p-0.5 shrink-0 self-start sm:self-center"
              role="group"
              aria-label="Sidebar layout"
            >
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-pressed={!state.sidebarCollapsed}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  !state.sidebarCollapsed
                    ? 'bg-[#231F20] text-white shadow-xs'
                    : 'text-[#5F6368] hover:text-[#231F20]'
                }`}
              >
                Expanded
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                aria-pressed={state.sidebarCollapsed}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  state.sidebarCollapsed
                    ? 'bg-[#231F20] text-white shadow-xs'
                    : 'text-[#5F6368] hover:text-[#231F20]'
                }`}
              >
                Compact
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Business Rules */}
      <section className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#231F20]">Business Rules</h2>
            <p className="text-xs text-[#5F6368] mt-0.5">
              Deterministic rules evaluating financial records, customs entries, and incoming uploads.
            </p>
          </div>
          {!canConfigRules && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#5F6368] bg-[#F5F6F7] border border-[#E2E5E8] px-2.5 py-1 rounded">
              <Lock className="w-3.5 h-3.5" /> Read-only for {activeRole.label}
            </span>
          )}
        </div>

        <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded-md">
          {state.businessRules.map((rule) => {
            const expanded = expandedRuleId === rule.id;
            const convertedPreview =
              state.currency === 'USD' &&
              rule.thresholdValue !== undefined &&
              rule.thresholdUnit === 'CAD'
                ? Math.round(rule.thresholdValue * 0.72).toLocaleString('en-CA')
                : null;
            return (
              <div key={rule.id} className="bg-white">
                <div className="p-3.5 sm:px-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedRuleId(expanded ? null : rule.id)}
                      aria-expanded={expanded}
                      aria-label={`Toggle details for ${rule.code}`}
                      className="mt-0.5 p-1 rounded text-[#5F6368] hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer shrink-0"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          expanded ? 'rotate-180 text-[#231F20]' : ''
                        }`}
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#E53C2E]">{rule.code}</span>
                        <span className="font-semibold text-[#231F20]">{rule.title}</span>
                      </div>
                      <p className="text-xs text-[#5F6368] mt-0.5 line-clamp-1">{rule.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0 pl-7 lg:pl-0">
                    {rule.thresholdValue !== undefined && (
                      <label className="flex items-center gap-1.5 text-xs text-[#5F6368]">
                        <span>Threshold:</span>
                        <input
                          type="number"
                          step={rule.thresholdUnit === 'PERCENT' ? '0.05' : '10000'}
                          disabled={!canConfigRules}
                          value={rule.thresholdValue}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (!Number.isNaN(val) && val >= 0) {
                              updateRuleThreshold(rule.id, val);
                            }
                          }}
                          className="w-24 px-2 py-1 border border-[#E2E5E8] rounded font-mono text-xs text-[#231F20] bg-white disabled:bg-[#F5F6F7] focus:outline-none focus:border-[#231F20]"
                        />
                        <span className="font-mono text-[11px]">{rule.thresholdUnit}</span>
                        {convertedPreview && (
                          <span className="text-[11px] text-[#5F6368] tabular-nums">
                            (≈ US${convertedPreview})
                          </span>
                        )}
                      </label>
                    )}

                    <button
                      type="button"
                      disabled={!canConfigRules}
                      onClick={() => toggleBusinessRule(rule.id)}
                      className={`px-3 py-1 text-xs font-medium rounded border cursor-pointer disabled:opacity-60 transition-colors whitespace-nowrap ${
                        rule.enabled
                          ? 'bg-[#231F20] text-white border-[#231F20] hover:bg-[#3A3536]'
                          : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20]'
                      }`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-4 pb-3.5 pt-2.5 pl-11 bg-[#F8F9FA] border-t border-[#E2E5E8] text-xs space-y-1.5">
                    <p className="text-[#231F20] leading-relaxed">{rule.description}</p>
                    <p className="text-[11px] text-[#5F6368]">
                      Source Reference: <span className="font-medium text-[#231F20]">{rule.sourceRef}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Workspace Management */}
      <section className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#231F20]">Workspace Management</h2>
            <p className="text-xs text-[#5F6368] mt-0.5">
              Sign out before using another account. Reset clears this browser’s demonstration workspace only.
            </p>
          </div>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] transition-colors cursor-pointer self-start sm:self-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo State</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 text-xs">
              <span className="text-red-900 font-medium">Clear this browser’s uploads, drafts, and review items? Official case records, accounts, and audit history stay.</span>
              <button
                type="button"
                onClick={() => {
                  resetDemoState();
                  setConfirmReset(false);
                }}
                className="px-2.5 py-1 bg-[#E53C2E] text-white font-medium rounded hover:bg-[#CC3124] cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2 py-1 bg-white border border-[#E2E5E8] text-[#5F6368] rounded cursor-pointer hover:text-[#231F20]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Active Account & Temporary Switcher */}
        <div className="border border-[#E2E5E8] rounded-md p-4 bg-[#F8F9FA] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#5F6368]">
                Active Session
              </div>
              <div className="text-sm font-semibold text-[#231F20] mt-0.5">
                {activeUser.name} · {activeUser.title}
              </div>
              <div className="text-xs text-[#5F6368] mt-0.5">{activeRole.description}</div>
              <div className="text-xs text-[#5F6368] mt-1">
                Sign out from the profile menu before using another account.
              </div>
            </div>
            <span className="text-[11px] text-[#5F6368] bg-white border border-[#E2E5E8] px-2.5 py-1 rounded self-start whitespace-nowrap">
              {activeUser.department}
            </span>
          </div>
        </div>

        {/* Collapsible About & Data Provenance */}
        <div className="border border-[#E2E5E8] rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setAboutOpen((v) => !v)}
            aria-expanded={aboutOpen}
            className="w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-[#F8F9FA] cursor-pointer text-xs"
          >
            <span className="font-semibold text-[#231F20]">About &amp; Data Provenance</span>
            <ChevronDown
              className={`w-4 h-4 text-[#5F6368] transition-transform ${aboutOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {aboutOpen && (
            <div className="px-4 pb-3.5 pt-2.5 border-t border-[#E2E5E8] bg-[#F8F9FA] text-xs text-[#5F6368] space-y-1.5 leading-relaxed">
              <p>
                <strong className="text-[#231F20]">Dataset Scope:</strong> Financial and customs analytics cover the competition case period (Q4 2024 – Q3 2026) and do not connect to a live SKYJACK ERP server.
              </p>
              <p>
                <strong className="text-[#231F20]">Session Changes:</strong> Uploads, investigation updates, approval decisions, and report drafts stay in this browser until Reset Demo State clears them. Official Appendix records, accounts, and the audit log are not deleted.
              </p>
              <p>
                <strong className="text-[#231F20]">Currency &amp; Scenarios:</strong> USD reporting values use a static demonstration conversion rate (1 CAD = 0.72 USD). Tariff simulator projections represent hypothetical scenarios only.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

