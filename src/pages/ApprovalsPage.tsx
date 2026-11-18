import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  Paperclip,
  Plus,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { CUSTOMS_ENTRIES, DEMO_USERS, IRREGULAR_COSTS } from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import { canUserReviewItem } from '../domain/permissions';
import {
  ApprovalRequest,
  EvidenceSourceType,
  GovernanceRequestType,
  ReviewWorkflowStatus,
} from '../types/domain';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';

type QuickQueueFilter = 'all' | 'needs_my_action' | 'open';

const REQUEST_TYPE_LABELS: Record<GovernanceRequestType, string> = {
  import_authorization: 'Import Authorization',
  quarantined_transaction: 'Quarantined Transaction',
  financial_correction: 'Financial Correction',
  evidence_submission: 'Evidence Submission',
  broker_discrepancy: 'Broker Discrepancy',
};

const EVIDENCE_TYPE_LABELS: Record<EvidenceSourceType, string> = {
  reference: 'Reference',
  note: 'Note',
  pdf: 'PDF Document',
  image: 'Image',
  spreadsheet: 'Spreadsheet',
};

const WORKFLOW_STYLE: Record<ReviewWorkflowStatus, string> = {
  Submitted: 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]',
  'In Review': 'text-[#1D4ED8] bg-blue-50 border-blue-200',
  'Additional Evidence Required': 'text-[#B45309] bg-amber-50 border-amber-200',
  Approved: 'text-[#15803D] bg-emerald-50 border-emerald-200',
  Rejected: 'text-[#DC2626] bg-red-50 border-red-200',
  Resolved: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]',
};

export const ApprovalsPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    createGovernanceRequest,
    reviewGovernanceRequest,
    addSupportingEvidence,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  // Filters & search
  const [quickFilter, setQuickFilter] = useState<QuickQueueFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GovernanceRequestType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewWorkflowStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    state.approvalRequests[0]?.id ?? null
  );

  // Contextual help & composer toggles
  const [rulesHelpOpen, setRulesHelpOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [rationaleExpanded, setRationaleExpanded] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  // Decision rationale & feedback
  const [decisionReason, setDecisionReason] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // New request composer fields
  const [newReqType, setNewReqType] = useState<GovernanceRequestType>('financial_correction');
  const [newLinkedId, setNewLinkedId] = useState('IR-01');
  const [newTitle, setNewTitle] = useState('');
  const [newAmountCad, setNewAmountCad] = useState('680000');
  const [newRationale, setNewRationale] = useState('');
  const [newMultiStep, setNewMultiStep] = useState(false);
  const [composerFeedback, setComposerFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Evidence attachment fields
  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evType, setEvType] = useState<EvidenceSourceType>('reference');
  const [evFileMeta, setEvFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [evFeedback, setEvFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const canSubmit = hasPermission('submit_correction_request');

  const isActionNeededByActiveUser = useMemo(() => {
    const map = new Map<string, boolean>();
    state.approvalRequests.forEach((req) => {
      const isClosed =
        req.workflowStatus === 'Approved' ||
        req.workflowStatus === 'Rejected' ||
        req.workflowStatus === 'Resolved';
      if (isClosed) {
        map.set(req.id, false);
        return;
      }
      const linkedIr = IRREGULAR_COSTS.find((c) => c.id === req.linkedRecordId);
      const reviewCheck = canUserReviewItem(activeUser, {
        requestType: req.requestType,
        department: linkedIr?.department,
        requestedByUserId: req.requestedByUserId,
      });
      const alreadySigned =
        req.requiredApprovalsCount > 1 &&
        req.approvalsHistory.some((s) => s.actorUserId === activeUser.id && s.decision === 'Approved');
      map.set(req.id, reviewCheck.allowed && !alreadySigned);
    });
    return map;
  }, [activeUser, state.approvalRequests]);

  const needsMyActionCount = useMemo(
    () => state.approvalRequests.filter((r) => isActionNeededByActiveUser.get(r.id)).length,
    [isActionNeededByActiveUser, state.approvalRequests]
  );

  const openResolutionCount = useMemo(
    () => state.approvalRequests.filter((r) => r.resolutionStatus === 'Open').length,
    [state.approvalRequests]
  );

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.approvalRequests.filter((r) => {
      if (quickFilter === 'needs_my_action' && !isActionNeededByActiveUser.get(r.id)) return false;
      if (quickFilter === 'open' && r.resolutionStatus !== 'Open') return false;
      if (typeFilter !== 'all' && r.requestType !== typeFilter) return false;
      if (statusFilter !== 'all' && r.workflowStatus !== statusFilter) return false;
      if (q) {
        const requesterName = DEMO_USERS.find((u) => u.id === r.requestedByUserId)?.name.toLowerCase() ?? '';
        const matches =
          r.title.toLowerCase().includes(q) ||
          r.linkedRecordId.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          requesterName.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [isActionNeededByActiveUser, quickFilter, searchQuery, state.approvalRequests, statusFilter, typeFilter]);

  const hasActiveFilters =
    quickFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim().length > 0;

  const selectedRequest: ApprovalRequest | null = useMemo(() => {
    if (!filteredRequests.length) return null;
    if (selectedRequestId) {
      const hit = filteredRequests.find((r) => r.id === selectedRequestId);
      if (hit) return hit;
    }
    return filteredRequests[0];
  }, [filteredRequests, selectedRequestId]);

  const linkedEvidence = useMemo(() => {
    if (!selectedRequest) return [];
    return state.evidence.filter(
      (ev) =>
        ev.linkedRecordId === selectedRequest.linkedRecordId ||
        ev.linkedRecordId === selectedRequest.id
    );
  }, [selectedRequest, state.evidence]);

  const handleSelectRequest = (reqId: string) => {
    setSelectedRequestId(reqId);
    setRationaleExpanded(false);
    setConfirmReject(false);
    setActionFeedback(null);
    setEvFeedback(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(newAmountCad);
    const res = createGovernanceRequest({
      linkedRecordId: newLinkedId,
      requestType: newReqType,
      title: newTitle,
      amountCad: Number.isFinite(amt) ? amt : 0,
      rationale: newRationale,
      requiredApprovalsCount: newMultiStep ? 3 : 1,
    });
    if (res.ok && res.request) {
      setSelectedRequestId(res.request.id);
      setNewTitle('');
      setNewRationale('');
      setComposerFeedback(null);
      setShowNewForm(false);
      setActionFeedback({ ok: true, message: res.message });
    } else {
      setComposerFeedback({ ok: false, message: res.message });
    }
  };

  const handleAttachEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    const res = addSupportingEvidence({
      linkedRecordId: selectedRequest.linkedRecordId,
      linkedEntityType: 'approval_request',
      title: evTitle,
      summary: evSummary,
      sourceType: evType,
      fileName: evFileMeta?.name,
      fileSizeBytes: evFileMeta?.size,
      persistenceScope: evFileMeta ? 'metadata_only_local_demo' : 'case_reference',
    });
    if (res.ok) {
      setEvTitle('');
      setEvSummary('');
      setEvFileMeta(null);
      setShowEvidenceForm(false);
      setEvFeedback({ ok: true, message: res.message });
    } else {
      setEvFeedback({ ok: false, message: res.message });
    }
  };

  const handleDecision = (decision: ReviewWorkflowStatus, reasonOverride?: string) => {
    if (!selectedRequest) return;
    const res = reviewGovernanceRequest(selectedRequest.id, decision, reasonOverride ?? decisionReason);
    setActionFeedback({ ok: res.ok, message: res.message });
    if (res.ok) {
      setDecisionReason('');
      setConfirmReject(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approvals" />
        <UnavailableDataState
          title="Approvals unavailable for active role"
          description="Switch to an authorized account in Settings to submit or review requests."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRulesHelpOpen((v) => !v)}
              aria-expanded={rulesHelpOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap cursor-pointer transition-colors ${
                rulesHelpOpen
                  ? 'bg-[#231F20] text-white border-[#231F20]'
                  : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20] hover:bg-[#F5F6F7]'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Governance Rules</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerFeedback(null);
                setShowNewForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded-md hover:bg-[#CC3124] whitespace-nowrap cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showNewForm ? 'Close Composer' : 'New Governance Request'}</span>
            </button>
          </div>
        }
      />

      {/* Contextual Governance Disclosure (replaces always-visible banner) */}
      {rulesHelpOpen && (
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 text-xs text-[#5F6368] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold text-[#231F20]">Governance Separation & Audit Controls</p>
            <p className="leading-relaxed">
              Self-approval is blocked across all roles, sequential multi-step chains require distinct reviewers for each step, workflow status is tracked separately from resolution closure, and approving a request logs to Audit History without modifying historical Appendix 1.1–3.6 baselines.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRulesHelpOpen(false)}
            className="text-[#5F6368] hover:text-[#231F20] self-end sm:self-start cursor-pointer"
            aria-label="Close governance rules"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* New Governance Request Composer */}
      {showNewForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2E5E8]">
            <h2 className="text-sm font-semibold text-[#231F20]">New Governance Request</h2>
            <span className="text-[11px] text-[#5F6368]">Submitted by {activeUser.name}</span>
          </div>

          {composerFeedback && !composerFeedback.ok && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-[#B45309]">
              {composerFeedback.message}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="text-[#5F6368] font-medium block">Request Type</span>
              <select
                value={newReqType}
                onChange={(e) => setNewReqType(e.target.value as GovernanceRequestType)}
                className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-[#231F20] focus:outline-none focus:border-[#231F20]"
              >
                <option value="financial_correction">Financial Correction</option>
                <option value="broker_discrepancy">Broker Discrepancy</option>
                <option value="evidence_submission">Evidence Submission</option>
                <option value="quarantined_transaction">Quarantined Transaction</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[#5F6368] font-medium block">Target Record</span>
              <select
                value={newLinkedId}
                onChange={(e) => setNewLinkedId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-[#231F20] focus:outline-none focus:border-[#231F20]"
              >
                {IRREGULAR_COSTS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.item}
                  </option>
                ))}
                {CUSTOMS_ENTRIES.map((ce) => (
                  <option key={ce.id} value={ce.id}>
                    {ce.id} · {ce.goods}
                  </option>
                ))}
                {state.uploadedLedgerTransactions.map((tx) => (
                  <option key={tx.id} value={tx.transactionId}>
                    {tx.transactionId} · {tx.description || tx.department}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[#5F6368] font-medium block">Financial Impact (CAD)</span>
              <input
                type="number"
                value={newAmountCad}
                onChange={(e) => setNewAmountCad(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-[#231F20] tabular-nums focus:outline-none focus:border-[#231F20]"
              />
            </label>
            <label className="flex items-center gap-2 sm:pt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newMultiStep}
                onChange={(e) => setNewMultiStep(e.target.checked)}
                className="rounded border-[#C8CACD]"
              />
              <span className="text-[#231F20] font-medium">Require 3-step approval chain</span>
            </label>
          </div>

          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Request title (e.g., Reclassify Q3 rush freight or recover E-01 broker overcharge)"
            className="w-full px-3 py-2 border border-[#E2E5E8] rounded-md text-[#231F20] focus:outline-none focus:border-[#231F20]"
          />
          <textarea
            rows={2}
            value={newRationale}
            onChange={(e) => setNewRationale(e.target.value)}
            placeholder="Supporting accounting or operational rationale and source references..."
            className="w-full px-3 py-2 border border-[#E2E5E8] rounded-md text-[#231F20] focus:outline-none focus:border-[#231F20]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 border border-[#E2E5E8] rounded-md text-[#5F6368] hover:text-[#231F20] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#231F20] text-white font-medium rounded-md hover:bg-[#3A3536] cursor-pointer"
            >
              Submit Request
            </button>
          </div>
        </form>
      )}

      {/* Search & Queue Filter Bar */}
      <div className="bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `All (${state.approvalRequests.length})` },
              { id: 'needs_my_action', label: `Needs My Action (${needsMyActionCount})` },
              { id: 'open', label: `Open Resolution (${openResolutionCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setQuickFilter(tab.id)}
              className={`px-2.5 py-1.5 rounded-md border font-medium whitespace-nowrap tabular-nums cursor-pointer transition-colors ${
                quickFilter === tab.id
                  ? 'bg-[#231F20] text-white border-[#231F20]'
                  : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20] hover:bg-[#F5F6F7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[190px] sm:flex-initial sm:w-56">
            <Search className="w-3.5 h-3.5 text-[#9AA0A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, ID, requester..."
              className="w-full pl-8 pr-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
            />
          </div>

          <select
            aria-label="Filter approvals by request type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
          >
            <option value="all">All Types</option>
            <option value="import_authorization">Import Authorization</option>
            <option value="financial_correction">Financial Correction</option>
            <option value="broker_discrepancy">Broker Discrepancy</option>
            <option value="quarantined_transaction">Quarantined Transaction</option>
            <option value="evidence_submission">Evidence Submission</option>
          </select>

          <select
            aria-label="Filter approvals by workflow status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-[#E2E5E8] rounded-md px-2.5 py-1.5 bg-[#F8F9FA] text-[#231F20] focus:bg-white focus:outline-none focus:border-[#231F20]"
          >
            <option value="all">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="In Review">In Review</option>
            <option value="Additional Evidence Required">Additional Evidence Required</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Resolved">Resolved</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setQuickFilter('all');
                setTypeFilter('all');
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className="px-2 py-1.5 text-xs font-medium text-[#E53C2E] hover:underline whitespace-nowrap cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Two-Panel Approval Workspace */}
      {filteredRequests.length === 0 ? (
        <UnavailableDataState
          title="No governance requests match your filters"
          description="Clear active filters or submit a new governance request."
          actionLabel={hasActiveFilters ? 'Clear Filters' : undefined}
          onAction={
            hasActiveFilters
              ? () => {
                  setQuickFilter('all');
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setSearchQuery('');
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left — Approval Queue */}
          <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#231F20]">Approval Queue</span>
              <span className="text-xs text-[#5F6368] tabular-nums">
                {filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'}
              </span>
            </div>

            <div className="divide-y divide-[#E2E5E8] lg:max-h-[720px] overflow-y-auto">
              {filteredRequests.map((req) => {
                const requester = DEMO_USERS.find((u) => u.id === req.requestedByUserId);
                const selected = selectedRequest?.id === req.id;
                const approvedSteps = req.approvalsHistory.filter((s) => s.decision === 'Approved').length;
                const actionNeeded = Boolean(isActionNeededByActiveUser.get(req.id));

                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => handleSelectRequest(req.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer relative ${
                      selected
                        ? 'bg-[#F5F6F7] ring-1 ring-inset ring-[#231F20]/20'
                        : 'bg-white hover:bg-[#F8F9FA]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#5F6368]">
                          <span className="font-semibold text-[#231F20]">{req.linkedRecordId}</span>
                          <span>·</span>
                          <span>{REQUEST_TYPE_LABELS[req.requestType]}</span>
                          {actionNeeded && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[#B45309] font-medium">
                              Action needed
                            </span>
                          )}
                        </div>
                        <p className={`text-xs leading-snug ${selected ? 'font-semibold text-[#231F20]' : 'font-medium text-[#231F20]'}`}>
                          {req.title}
                        </p>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-xs font-semibold text-[#231F20] tabular-nums whitespace-nowrap">
                          {formatMoney(req.amountCad)}
                        </p>
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-medium border rounded whitespace-nowrap ${
                            WORKFLOW_STYLE[req.workflowStatus]
                          }`}
                        >
                          {req.workflowStatus}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-[#5F6368]">
                      <span className="truncate">
                        {requester?.name ?? req.requestedByUserId} · {req.resolutionStatus}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-0.5" aria-label={`Approval progress ${approvedSteps} of ${req.requiredApprovalsCount}`}>
                          {req.approvalsHistory.map((step) => (
                            <span
                              key={step.stepNumber}
                              className={`h-1.5 w-3.5 rounded-full ${
                                step.decision === 'Approved'
                                  ? 'bg-[#16A34A]'
                                  : step.decision === 'Rejected'
                                    ? 'bg-[#DC2626]'
                                    : 'bg-[#E2E5E8]'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="tabular-nums font-medium text-[#231F20]">
                          {approvedSteps}/{req.requiredApprovalsCount}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — Selected Approval */}
          <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-5 space-y-5">
            {selectedRequest &&
              (() => {
                const requester = DEMO_USERS.find((u) => u.id === selectedRequest.requestedByUserId);
                const linkedIr = IRREGULAR_COSTS.find((c) => c.id === selectedRequest.linkedRecordId);
                const reviewCheck = canUserReviewItem(activeUser, {
                  requestType: selectedRequest.requestType,
                  department: linkedIr?.department,
                  requestedByUserId: selectedRequest.requestedByUserId,
                });
                const alreadySignedMultiStep =
                  selectedRequest.requiredApprovalsCount > 1 &&
                  selectedRequest.approvalsHistory.some(
                    (s) => s.actorUserId === activeUser.id && s.decision === 'Approved'
                  );
                const approvedCount = selectedRequest.approvalsHistory.filter(
                  (s) => s.decision === 'Approved'
                ).length;
                const isRejected = selectedRequest.workflowStatus === 'Rejected';
                const isWorkflowClosed =
                  selectedRequest.workflowStatus === 'Approved' ||
                  selectedRequest.workflowStatus === 'Rejected' ||
                  selectedRequest.workflowStatus === 'Resolved';

                const nextPendingStepIdx = selectedRequest.approvalsHistory.findIndex((s) => !s.decision);
                const rationaleNeedsClamp = selectedRequest.rationale.length > 180;

                return (
                  <>
                    {/* 1. Header & Financial Impact Summary */}
                    <div className="space-y-3 pb-4 border-b border-[#E2E5E8]">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-[#5F6368]">
                          <span className="font-semibold text-[#231F20]">{selectedRequest.linkedRecordId}</span>
                          <span>·</span>
                          <span>{REQUEST_TYPE_LABELS[selectedRequest.requestType]}</span>
                          {selectedRequest.batchId && (
                            <button
                              type="button"
                              onClick={() => navigate('/data-gateway')}
                              className="inline-flex items-center gap-1 text-[#E53C2E] font-medium hover:underline cursor-pointer"
                            >
                              <span>Open Data Gateway</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-0.5 text-xs font-medium border rounded whitespace-nowrap ${
                            WORKFLOW_STYLE[selectedRequest.workflowStatus]
                          }`}
                        >
                          {selectedRequest.workflowStatus}
                        </span>
                      </div>

                      <h2 className="text-base font-semibold text-[#231F20]">{selectedRequest.title}</h2>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-3 py-2">
                          <p className="text-[11px] font-medium text-[#5F6368]">Financial Impact</p>
                          <p className="text-sm font-semibold text-[#231F20] tabular-nums mt-0.5">
                            {formatMoney(selectedRequest.amountCad)}
                          </p>
                          {selectedRequest.isMaterial && (
                            <p className="text-[11px] text-[#B45309] mt-0.5">
                              Material (≥ {formatCompactMoney(250_000)})
                            </p>
                          )}
                        </div>
                        <div className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-3 py-2">
                          <p className="text-[11px] font-medium text-[#5F6368]">Submitted By</p>
                          <p className="text-sm font-medium text-[#231F20] mt-0.5 truncate">
                            {requester?.name ?? selectedRequest.requestedByUserId}
                          </p>
                          <p className="text-[11px] text-[#5F6368] mt-0.5">
                            {new Date(selectedRequest.createdAtIso).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-3 py-2">
                          <p className="text-[11px] font-medium text-[#5F6368]">Resolution Closure</p>
                          <p className="text-sm font-semibold text-[#231F20] mt-0.5">
                            {selectedRequest.resolutionStatus}
                          </p>
                          <p className="text-[11px] text-[#5F6368] mt-0.5 tabular-nums">
                            {approvedCount} of {selectedRequest.requiredApprovalsCount} sign-offs
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 2. Request Rationale (Compact & Expandable) */}
                    <div className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md p-3.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#231F20]">Request Rationale</span>
                        {rationaleNeedsClamp && (
                          <button
                            type="button"
                            onClick={() => setRationaleExpanded((v) => !v)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                          >
                            <span>{rationaleExpanded ? 'Show less' : 'Show full rationale'}</span>
                            {rationaleExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                      <p
                        className={`text-[#5F6368] leading-relaxed ${
                          rationaleNeedsClamp && !rationaleExpanded ? 'line-clamp-2' : ''
                        }`}
                      >
                        {selectedRequest.rationale}
                      </p>
                      {selectedRequest.decisionReason && (
                        <div className="pt-1.5 border-t border-[#E2E5E8] text-[#231F20]">
                          <strong>Latest Decision Note:</strong> {selectedRequest.decisionReason}
                        </div>
                      )}
                    </div>

                    {/* 3. Visual Step-by-Step Approval Chain */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-[#231F20]">Approval Progression</h3>
                        <span className="text-[11px] text-[#5F6368] tabular-nums">
                          {approvedCount} / {selectedRequest.requiredApprovalsCount} completed
                        </span>
                      </div>

                      <ol className="space-y-2">
                        {selectedRequest.approvalsHistory.map((step, idx) => {
                          const isApproved = step.decision === 'Approved';
                          const isStepRejected = step.decision === 'Rejected';
                          const isCurrent =
                            !step.decision && !isRejected && !isWorkflowClosed && idx === nextPendingStepIdx;
                          const isBlockedByRejection = !step.decision && isRejected;

                          return (
                            <li
                              key={step.stepNumber}
                              className={`border rounded-md p-3 flex items-start justify-between gap-3 ${
                                isApproved
                                  ? 'bg-emerald-50/35 border-emerald-200'
                                  : isStepRejected
                                    ? 'bg-red-50/40 border-red-200'
                                    : isCurrent
                                      ? 'bg-white border-[#231F20]'
                                      : 'bg-[#F8F9FA] border-[#E2E5E8]'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="mt-0.5 shrink-0">
                                  {isApproved ? (
                                    <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                                  ) : isStepRejected ? (
                                    <XCircle className="w-4 h-4 text-[#DC2626]" />
                                  ) : isBlockedByRejection ? (
                                    <Lock className="w-4 h-4 text-[#9AA0A6]" />
                                  ) : isCurrent ? (
                                    <span className="w-4 h-4 rounded-full bg-[#231F20] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                                      {step.stepNumber}
                                    </span>
                                  ) : (
                                    <Clock className="w-4 h-4 text-[#9AA0A6]" />
                                  )}
                                </div>

                                <div className="space-y-0.5 min-w-0">
                                  <p className="font-medium text-[#231F20]">{step.stepLabel}</p>
                                  <p className="text-[11px] text-[#5F6368]">
                                    Required role: {step.requiredRoleLabel}
                                  </p>
                                  {step.reason && (
                                    <p className="text-[11px] text-[#231F20] pt-1">
                                      <strong>Note:</strong> {step.reason}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0 space-y-0.5">
                                {isApproved ? (
                                  <>
                                    <span className="inline-block text-[11px] font-semibold text-[#15803D]">
                                      Completed
                                    </span>
                                    <p className="text-[11px] text-[#5F6368]">{step.actorName}</p>
                                    {step.timestampIso && (
                                      <p className="text-[10px] text-[#9AA0A6] tabular-nums">
                                        {new Date(step.timestampIso).toLocaleDateString()}
                                      </p>
                                    )}
                                  </>
                                ) : isStepRejected ? (
                                  <>
                                    <span className="inline-block text-[11px] font-semibold text-[#DC2626]">
                                      Rejected
                                    </span>
                                    <p className="text-[11px] text-[#5F6368]">{step.actorName}</p>
                                  </>
                                ) : isBlockedByRejection ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-[#F0F1F3] text-[11px] font-medium text-[#5F6368]">
                                    Blocked
                                  </span>
                                ) : isCurrent ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] font-medium text-[#B45309]">
                                    Current Step
                                  </span>
                                ) : (
                                  <span className="inline-block text-[11px] font-medium text-[#9AA0A6]">
                                    Pending
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>

                    {/* 4. Supporting Evidence Section (Expandable Form) */}
                    <div className="pt-3 border-t border-[#E2E5E8] space-y-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-[#231F20] inline-flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-[#5F6368]" />
                          <span>Supporting Evidence ({linkedEvidence.length})</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setEvFeedback(null);
                            setShowEvidenceForm((v) => !v);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{showEvidenceForm ? 'Cancel' : 'Attach Evidence'}</span>
                        </button>
                      </div>

                      {evFeedback && (
                        <div
                          className={`rounded-md px-3 py-2 border text-xs ${
                            evFeedback.ok
                              ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                              : 'bg-amber-50 border-amber-200 text-[#B45309]'
                          }`}
                        >
                          {evFeedback.message}
                        </div>
                      )}

                      {linkedEvidence.length === 0 ? (
                        <p className="text-[11px] text-[#5F6368]">
                          No supporting evidence attached yet. Attach document metadata or case references if required.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {linkedEvidence.map((ev) => (
                            <div
                              key={ev.id}
                              className="p-2.5 border border-[#E2E5E8] rounded-md bg-[#F8F9FA] space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-[#231F20]">{ev.title}</span>
                                <span className="text-[11px] text-[#5F6368] shrink-0">
                                  {EVIDENCE_TYPE_LABELS[ev.sourceType ?? 'reference']}
                                  {ev.fileName ? ` · ${ev.fileName}` : ''}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#5F6368]">{ev.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {showEvidenceForm && (
                        <form
                          onSubmit={handleAttachEvidence}
                          className="p-3 border border-[#E2E5E8] rounded-md bg-[#F8F9FA] space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={evTitle}
                              onChange={(e) => setEvTitle(e.target.value)}
                              placeholder="Evidence reference title"
                              className="sm:col-span-2 px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-xs focus:outline-none focus:border-[#231F20]"
                            />
                            <select
                              aria-label="Evidence type"
                              value={evType}
                              onChange={(e) => setEvType(e.target.value as EvidenceSourceType)}
                              className="px-2 py-1.5 border border-[#E2E5E8] rounded-md text-xs bg-white focus:outline-none focus:border-[#231F20]"
                            >
                              <option value="reference">Reference</option>
                              <option value="note">Note</option>
                              <option value="pdf">PDF Metadata</option>
                              <option value="image">Image Metadata</option>
                              <option value="spreadsheet">Spreadsheet Metadata</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E2E5E8] rounded text-[11px] text-[#231F20] cursor-pointer hover:bg-[#F5F6F7]">
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    setEvFileMeta({ name: f.name, size: f.size });
                                    if (!evTitle) setEvTitle(f.name);
                                  }
                                }}
                              />
                              <span>Select File Metadata</span>
                            </label>
                            {evFileMeta && (
                              <span className="text-[11px] text-[#5F6368] tabular-nums">
                                {evFileMeta.name} ({Math.ceil(evFileMeta.size / 1024)} KB)
                              </span>
                            )}
                          </div>
                          <textarea
                            rows={2}
                            value={evSummary}
                            onChange={(e) => setEvSummary(e.target.value)}
                            placeholder="Summary of verification or document reference..."
                            className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white text-xs focus:outline-none focus:border-[#231F20]"
                          />
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] cursor-pointer"
                            >
                              Record Evidence
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    {/* 5. Governance Actions & Resolution Closure */}
                    <div className="pt-3 border-t border-[#E2E5E8] space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-[#231F20]">Governance Actions</h3>
                        <span className="text-[11px] text-[#5F6368]">
                          Acting as <strong className="text-[#231F20]">{activeUser.name}</strong>
                        </span>
                      </div>

                      {actionFeedback && (
                        <div
                          className={`rounded-md px-3 py-2 border text-xs ${
                            actionFeedback.ok
                              ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                              : 'bg-amber-50 border-amber-200 text-[#B45309]'
                          }`}
                        >
                          {actionFeedback.message}
                        </div>
                      )}

                      {!reviewCheck.allowed ? (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-[#B45309]">
                          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{reviewCheck.reason}</span>
                        </div>
                      ) : (
                        <>
                          {(!isWorkflowClosed || selectedRequest.resolutionStatus === 'Open') && (
                            <div className="space-y-1">
                              <label className="block text-[11px] font-medium text-[#5F6368]">
                                Decision Rationale{' '}
                                {selectedRequest.isMaterial
                                  ? '(required for material requests and all final decisions)'
                                  : '(required for Approve, Reject, or Close Resolution)'}
                              </label>
                              <textarea
                                rows={2}
                                value={decisionReason}
                                onChange={(e) => setDecisionReason(e.target.value)}
                                placeholder="Document accounting basis, verification findings, or reason (logged to Audit History)..."
                                className="w-full px-3 py-2 border border-[#E2E5E8] rounded-md text-xs text-[#231F20] focus:outline-none focus:border-[#231F20]"
                              />
                            </div>
                          )}

                          {/* Primary + Grouped Secondary Workflow Actions */}
                          {!isWorkflowClosed && (
                            <div className="space-y-2.5">
                              {alreadySignedMultiStep && (
                                <div className="p-2.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md flex items-start gap-2 text-[#5F6368]">
                                  <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#231F20]" />
                                  <span>
                                    You already signed an earlier step on this multi-step approval. A distinct authorized reviewer must sign the next step.
                                  </span>
                                </div>
                              )}

                              <div className="flex flex-wrap items-center justify-between gap-2">
                                {/* Primary Next Permitted Action */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {!alreadySignedMultiStep && (
                                    <button
                                      type="button"
                                      onClick={() => handleDecision('Approved')}
                                      className="px-3.5 py-2 text-xs font-medium text-white bg-[#15803D] rounded-md hover:bg-[#166534] whitespace-nowrap cursor-pointer"
                                    >
                                      {selectedRequest.requiredApprovalsCount > 1
                                        ? `Sign Step ${approvedCount + 1} of ${selectedRequest.requiredApprovalsCount}`
                                        : selectedRequest.requestType === 'import_authorization'
                                          ? 'Authorize & Commit Import'
                                          : 'Approve Request'}
                                    </button>
                                  )}

                                  {/* Secondary Status Actions Grouped */}
                                  <div className="inline-flex flex-wrap items-center gap-1.5">
                                    {selectedRequest.workflowStatus !== 'In Review' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDecision(
                                            'In Review',
                                            decisionReason || 'Moved to In Review.'
                                          )
                                        }
                                        className="px-2.5 py-2 text-xs font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md hover:bg-[#F0F1F3] whitespace-nowrap cursor-pointer"
                                      >
                                        Mark In Review
                                      </button>
                                    )}
                                    {selectedRequest.workflowStatus !== 'Additional Evidence Required' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDecision(
                                            'Additional Evidence Required',
                                            decisionReason || 'Additional supporting evidence requested.'
                                          )
                                        }
                                        className="px-2.5 py-2 text-xs font-medium text-[#B45309] bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100/70 whitespace-nowrap cursor-pointer"
                                      >
                                        Request Evidence
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Destructive Reject Action with Inline Confirmation */}
                                <div>
                                  {!confirmReject ? (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmReject(true)}
                                      className="px-3 py-2 text-xs font-medium text-[#DC2626] bg-white border border-red-200 rounded-md hover:bg-red-50 whitespace-nowrap cursor-pointer"
                                    >
                                      Reject
                                    </button>
                                  ) : (
                                    <div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-md px-2 py-1">
                                      <span className="text-[11px] font-medium text-[#DC2626]">
                                        Confirm rejection?
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleDecision('Rejected')}
                                        className="px-2 py-1 text-[11px] font-semibold text-white bg-[#DC2626] rounded hover:bg-red-700 cursor-pointer"
                                      >
                                        Yes, Reject
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmReject(false)}
                                        className="px-2 py-1 text-[11px] text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Separate Resolution Closure Row */}
                          <div className="pt-2.5 border-t border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                            <div className="text-[11px] text-[#5F6368]">
                              Resolution Closure:{' '}
                              <strong className="text-[#231F20]">{selectedRequest.resolutionStatus}</strong>
                              {selectedRequest.resolutionStatus === 'Open'
                                ? ' — tracked separately from approval decision.'
                                : ' — item closed in governance log.'}
                            </div>
                            {selectedRequest.resolutionStatus === 'Open' && (
                              <button
                                type="button"
                                onClick={() => handleDecision('Resolved')}
                                className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
                              >
                                Close Resolution
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
          </div>
        </div>
      )}
    </div>
  );
};
