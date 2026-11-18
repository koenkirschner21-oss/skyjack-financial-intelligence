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
import { DATA_DISCREPANCIES, DEMO_USERS } from '../data/caseSeed';
import { getRoleDefinition, PERMISSION_ROLES } from '../domain/permissions';
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

function getActionOutcomeTone(ev: AuditEvent): { label: string; cls: string } {
  const newState = ev.newState;
  if (ev.actionType === 'record_rejected' || ev.actionType === 'request_rejected') {
    return { label: newState ?? 'Rejected', cls: 'text-[#DC2626] bg-red-50 border-red-200' };
  }
  if (ev.actionType === 'record_quarantined') {
    return { label: newState ?? 'Quarantined', cls: 'text-[#B45309] bg-amber-50 border-amber-200' };
  }
  if (
    ev.actionType === 'request_approved' ||
    ev.actionType === 'correction_approved' ||
    ev.actionType === 'import_authorized' ||
    ev.actionType === 'report_exported'
  ) {
    return { label: newState ?? 'Completed', cls: 'text-[#15803D] bg-emerald-50 border-emerald-200' };
  }
  if (newState) {
    return { label: newState, cls: 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]' };
  }
  return { label: 'Recorded', cls: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]' };
}

function summarizeEvent(ev: AuditEvent): string {
  const raw = ev.summary.trim();
  if (raw.length <= 125) return raw;
  return `${raw.slice(0, 122).trimEnd()}...`;
}

export const AuditHistoryPage: React.FC = () => {
  const { state, hasPermission } = useApp();
  const checks = useMemo(() => runFinancialAcceptanceChecks(), []);
  const passedChecksCount = useMemo(() => checks.filter((c) => c.passed).length, [checks]);
  const allPassed = passedChecksCount === checks.length;

  const [activeTab, setActiveTab] = useState<AuditTab>('activity');
  const [contextHelpOpen, setContextHelpOpen] = useState(false);

  // Activity Log state
  const [auditSearch, setAuditSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Data Verification state
  const [checksTableExpanded, setChecksTableExpanded] = useState(false);
  const [expandedDiscrepancyId, setExpandedDiscrepancyId] = useState<string | null>(null);
  const [unitRulesExpanded, setUnitRulesExpanded] = useState(false);

  const uniqueActions = useMemo(
    () => Array.from(new Set(state.auditEvents.map((e) => e.actionType))).sort(),
    [state.auditEvents]
  );

  const uniqueActors = useMemo(() => {
    const names = new Set<string>();
    state.auditEvents.forEach((e) => names.add(e.actorName));
    return Array.from(names).sort();
  }, [state.auditEvents]);

  const filteredAuditEvents = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return state.auditEvents.filter((ev) => {
      if (actionFilter !== 'all' && ev.actionType !== actionFilter) return false;
      if (actorFilter !== 'all') {
        if (actorFilter === '__system__' && (ev.actorType ?? 'user') !== 'system') return false;
        if (actorFilter !== '__system__' && ev.actorName !== actorFilter) return false;
      }
      if (batchFilter !== 'all' && ev.batchId !== batchFilter) return false;
      if (dateFilter === 'today') {
        if (ev.timestampIso.slice(0, 10) !== todayKey) return false;
      } else if (dateFilter === 'last_7_days') {
        const ts = Date.parse(ev.timestampIso);
        if (!Number.isNaN(ts) && ts < sevenDaysAgoMs) return false;
      }
      if (q) {
        const hit =
          ev.id.toLowerCase().includes(q) ||
          ev.summary.toLowerCase().includes(q) ||
          ev.actorName.toLowerCase().includes(q) ||
          formatActionLabel(ev.actionType).toLowerCase().includes(q) ||
          (ev.targetRecordId ?? '').toLowerCase().includes(q) ||
          (ev.authorizationRef ?? '').toLowerCase().includes(q) ||
          (ev.reason ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [actionFilter, actorFilter, auditSearch, batchFilter, dateFilter, state.auditEvents]);

  const hasActiveActivityFilters =
    auditSearch.trim().length > 0 ||
    actionFilter !== 'all' ||
    actorFilter !== 'all' ||
    dateFilter !== 'all' ||
    batchFilter !== 'all';

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
              The Activity Log tracks session actions locally for review (resettable via Settings) rather than writing to a production ERP audit server. Reference checks verify official case figures against Appendix baselines and do not validate arbitrary user uploads.
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
          <span className="ml-1 text-[11px] text-[#5F6368] tabular-nums">({state.auditEvents.length})</span>
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
              aria-label="Filter by action type"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>
                  {formatActionLabel(a)}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by user"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            >
              <option value="all">All Users</option>
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
              className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
            </select>

            {state.importBatches.length > 0 && (
              <select
                aria-label="Filter by import batch"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] max-w-[180px] focus:bg-white focus:outline-none focus:border-[#231F20]"
              >
                <option value="all">All Import Batches</option>
                {state.importBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.fileName}
                  </option>
                ))}
              </select>
            )}

            {hasActiveActivityFilters && (
              <button
                type="button"
                onClick={() => {
                  setAuditSearch('');
                  setActionFilter('all');
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

          {filteredAuditEvents.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-medium text-[#231F20]">No matching activity events</p>
              <p className="text-xs text-[#5F6368]">
                {state.auditEvents.length === 0
                  ? 'Session governance, upload, and export actions appear here as they occur.'
                  : 'Try clearing active search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Action</th>
                    <th className="py-2.5 px-4 font-medium">User</th>
                    <th className="py-2.5 px-4 font-medium">Date & Time</th>
                    <th className="py-2.5 px-4 font-medium">Affected Record</th>
                    <th className="py-2.5 px-4 font-medium">Summary & Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8]">
                  {filteredAuditEvents.map((ev) => {
                    const isExpanded = expandedEventId === ev.id;
                    const outcome = getActionOutcomeTone(ev);
                    return (
                      <React.Fragment key={ev.id}>
                        <tr
                          onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? 'bg-[#F5F6F7]' : 'hover:bg-[#F8F9FA]'
                          }`}
                        >
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-medium text-[#231F20]">
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-[#5F6368] transition-transform ${
                                  isExpanded ? 'rotate-90 text-[#231F20]' : ''
                                }`}
                              />
                              <span>{formatActionLabel(ev.actionType)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="font-medium text-[#231F20]">{ev.actorName}</div>
                            <div className="text-[11px] text-[#5F6368]">{ev.actorRoleLabel}</div>
                          </td>
                          <td className="py-2.5 px-4 text-[#5F6368] tabular-nums whitespace-nowrap">
                            {new Date(ev.timestampIso).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-[#231F20] whitespace-nowrap">
                            {ev.targetRecordId ?? '—'}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[#231F20]">{summarizeEvent(ev)}</span>
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${outcome.cls}`}
                              >
                                {outcome.label}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#F8F9FA]">
                            <td colSpan={5} className="px-4 py-3.5 border-t border-[#E2E5E8]">
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
          )}
        </section>
      )}

      {/* ============================================================ */}
      {/* TAB 2: DATA VERIFICATION                                     */}
      {/* ============================================================ */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          {/* Compact Reference Check Summary + Expandable Table */}
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
                    Verifies normalized official case repository values against published Appendix baselines. Does not validate user-uploaded datasets.
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

          {/* Documented Source Discrepancies */}
          <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[#231F20]">
                Documented Source Discrepancies ({DATA_DISCREPANCIES.length})
              </h2>
              <p className="text-xs text-[#5F6368]">
                Conflicting or differently scaled Appendix figures are preserved verbatim without silent alteration.
              </p>
            </div>

            <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded-md">
              {DATA_DISCREPANCIES.map((d) => {
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
    switchRole,
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
            Personalize reporting display currency and navigation layout for your current session.
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
              Active employee session, temporary role switching, and workspace reset controls.
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
              <span className="text-red-900 font-medium">Clear uploads, review queue, notifications &amp; edits?</span>
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
            </div>
            <span className="text-[11px] text-[#5F6368] bg-white border border-[#E2E5E8] px-2.5 py-1 rounded self-start whitespace-nowrap">
              {activeUser.department}
            </span>
          </div>

          <div className="pt-3 border-t border-[#E2E5E8] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#5F6368]">Switch Account:</span>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_USERS.map((user) => {
                const isCurrent = user.id === activeUser.id;
                const role = PERMISSION_ROLES[user.roleId];
                return (
                  <button
                    key={user.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => switchRole(user.roleId)}
                    title={role.description}
                    className={`px-2.5 py-1.5 text-xs rounded border transition-colors whitespace-nowrap ${
                      isCurrent
                        ? 'bg-[#231F20] text-white border-[#231F20] font-medium cursor-default'
                        : 'bg-white text-[#231F20] border-[#E2E5E8] hover:bg-[#ECEEF0] cursor-pointer'
                    }`}
                  >
                    {user.name} <span className={isCurrent ? 'text-[#C8CACC]' : 'text-[#5F6368]'}>· {role.label}</span>
                  </button>
                );
              })}
            </div>
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
                <strong className="text-[#231F20]">Session Changes:</strong> Uploaded batches, investigation updates, approval decisions, notifications, and report drafts persist in your browser session and can be restored anytime using <strong>Reset Demo State</strong>.
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

