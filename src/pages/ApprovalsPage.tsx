import React, { useMemo, useState } from 'react';
import { HelpCircle, Lock, Plus, Search, X } from 'lucide-react';
import { CUSTOMS_ENTRIES, DEMO_USERS, IRREGULAR_COSTS } from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import {
  actionNeededBy,
  decisionOwnerLabel,
  type GovernanceDecisionKind,
} from '../domain/governanceWorkflow';
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

const WORKFLOW_STYLE: Record<ReviewWorkflowStatus, string> = {
  Submitted: 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]',
  'In Review': 'text-[#1D4ED8] bg-blue-50 border-blue-200',
  'Additional Evidence Required': 'text-[#B45309] bg-amber-50 border-amber-200',
  Approved: 'text-[#15803D] bg-emerald-50 border-emerald-200',
  Rejected: 'text-[#DC2626] bg-red-50 border-red-200',
  Resolved: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]',
};

const ILLUSTRATIONS = [
  { status: 'Approved', tone: 'text-[#15803D]', text: 'Controller authorization recorded. Appendix figures stay unchanged.' },
  { status: 'Rejected', tone: 'text-[#DC2626]', text: 'A reason is required. The request closes and cannot be approved afterward.' },
  { status: 'Awaiting Helen', tone: 'text-[#231F20]', text: 'A specialist recommendation can exist first. Helen can still decide without it.' },
  { status: 'Changes requested', tone: 'text-[#B45309]', text: 'The requester revises the reason or reference, then resubmits.' },
];

function recordAmount(recordId: string): number | null {
  const irregular = IRREGULAR_COSTS.find((item) => item.id === recordId);
  if (irregular) return irregular.amountCad;
  const customs = CUSTOMS_ENTRIES.find((item) => item.id === recordId);
  if (customs) return customs.totalDutyAndTariffCad;
  return null;
}

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
  } = useApp();

  const [quickFilter, setQuickFilter] = useState<QuickQueueFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(state.approvalRequests[0]?.id ?? null);
  const [rulesHelpOpen, setRulesHelpOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [decisionReason, setDecisionReason] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [newReqType, setNewReqType] = useState<GovernanceRequestType>('financial_correction');
  const [newLinkedId, setNewLinkedId] = useState('IR-02');
  const [newTitle, setNewTitle] = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [newReference, setNewReference] = useState('');
  const [composerFeedback, setComposerFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evType, setEvType] = useState<EvidenceSourceType>('reference');
  const [evFeedback, setEvFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const canSubmit = hasPermission('submit_correction_request');
  const linkedAmount = recordAmount(newLinkedId);

  const departmentFor = (request: ApprovalRequest) => {
    const irregular = IRREGULAR_COSTS.find((item) => item.id === request.linkedRecordId);
    if (irregular) return irregular.department;
    if (CUSTOMS_ENTRIES.some((item) => item.id === request.linkedRecordId)) return 'Customs and Trade';
    return undefined;
  };

  const needsAction = (request: ApprovalRequest) => actionNeededBy(activeUser, request, departmentFor(request));

  const needsMyActionCount = state.approvalRequests.filter(needsAction).length;
  const openResolutionCount = state.approvalRequests.filter((request) => request.resolutionStatus === 'Open').length;

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return state.approvalRequests.filter((request) => {
      if (quickFilter === 'needs_my_action' && !actionNeededBy(activeUser, request, departmentFor(request))) return false;
      if (quickFilter === 'open' && request.resolutionStatus !== 'Open') return false;
      if (!query) return true;
      const requester = DEMO_USERS.find((user) => user.id === request.requestedByUserId)?.name.toLowerCase() ?? '';
      return (
        request.title.toLowerCase().includes(query) ||
        request.linkedRecordId.toLowerCase().includes(query) ||
        request.id.toLowerCase().includes(query) ||
        requester.includes(query)
      );
    });
  }, [activeUser, quickFilter, searchQuery, state.approvalRequests]);

  const selectedRequest = useMemo(() => {
    const pinned = state.approvalRequests.find((request) => request.id === selectedRequestId);
    if (pinned) return pinned;
    return filteredRequests[0] ?? null;
  }, [filteredRequests, selectedRequestId, state.approvalRequests]);

  const linkedEvidence = useMemo(() => {
    if (!selectedRequest) return [];
    return state.evidence.filter(
      (item) => item.linkedRecordId === selectedRequest.linkedRecordId || item.linkedRecordId === selectedRequest.id
    );
  }, [selectedRequest, state.evidence]);

  const selectRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    setActionFeedback(null);
    setEvFeedback(null);
    setDecisionReason('');
  };

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (linkedAmount == null) {
      setComposerFeedback({ ok: false, message: 'Choose a case or authorized upload record. Amounts cannot be typed in.' });
      return;
    }
    const created = createGovernanceRequest({
      linkedRecordId: newLinkedId,
      requestType: newReqType,
      title: newTitle,
      amountCad: linkedAmount,
      rationale: newRationale,
    });
    if (!created.ok || !created.request) {
      setComposerFeedback({ ok: false, message: created.message });
      return;
    }
    if (newReference.trim()) {
      addSupportingEvidence({
        linkedRecordId: created.request.linkedRecordId,
        linkedEntityType: 'approval_request',
        title: 'Supporting reference',
        summary: `${newReference.trim()} Entered by the requester. This is not a stored or verified file.`,
        sourceType: 'reference',
        persistenceScope: 'metadata_only_local_demo',
      });
    }
    setSelectedRequestId(created.request.id);
    setNewTitle('');
    setNewRationale('');
    setNewReference('');
    setComposerFeedback(null);
    setShowNewForm(false);
    setQuickFilter('all');
    setActionFeedback({ ok: true, message: `${created.message} Saved in this browser only.` });
  };

  const handleAttachEvidence = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest) return;
    const result = addSupportingEvidence({
      linkedRecordId: selectedRequest.linkedRecordId,
      linkedEntityType: 'approval_request',
      title: evTitle,
      summary: evSummary,
      sourceType: evType,
      persistenceScope: 'metadata_only_local_demo',
    });
    setEvFeedback({ ok: result.ok, message: result.message });
    if (result.ok) {
      setEvTitle('');
      setEvSummary('');
      setShowEvidenceForm(false);
    }
  };

  const decide = (kind: GovernanceDecisionKind) => {
    if (!selectedRequest) return;
    const result = reviewGovernanceRequest(selectedRequest.id, kind, decisionReason);
    setActionFeedback({ ok: result.ok, message: result.message });
    if (result.ok) setDecisionReason('');
  };

  if (!canSubmit) {
    return (
      <div className="space-y-6">
        <PageHeader title="Approvals" />
        <UnavailableDataState
          title="Approvals unavailable for this role"
          description="This account cannot submit or review governance requests."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const requester = selectedRequest
    ? DEMO_USERS.find((user) => user.id === selectedRequest.requestedByUserId)
    : undefined;
  const decidedSteps = selectedRequest?.approvalsHistory.filter((step) => step.decision && step.actorName) ?? [];
  const closed = selectedRequest
    ? selectedRequest.workflowStatus === 'Approved' || selectedRequest.workflowStatus === 'Rejected'
    : false;
  const userCanAct = selectedRequest ? needsAction(selectedRequest) : false;
  const isController = activeUser.roleId === 'controller';
  const isRequester = selectedRequest?.requestedByUserId === activeUser.id;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRulesHelpOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#E2E5E8] bg-white text-[#5F6368] hover:text-[#231F20] cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Governance Rules</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm((open) => !open)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded-md hover:bg-[#CC3124] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showNewForm ? 'Close' : 'New Governance Request'}</span>
            </button>
          </div>
        }
      />

      {rulesHelpOpen && (
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 text-xs text-[#5F6368] space-y-1">
          <p className="font-semibold text-[#231F20]">Authority and local storage</p>
          <p>
            A specialist recommendation is not final authorization. Helen Park authorizes financial and governance requests. Dana Morales reviews accounting requests. Marco Silva reviews trade requests. Alex Chen can submit operational requests and cannot approve them.
          </p>
          <p>
            Requests and decisions are stored in this browser only. They are not shared with other devices or accounts. Approval does not edit Appendix figures, post to an ERP, or mark evidence verified.
          </p>
        </div>
      )}

      {showNewForm && (
        <form onSubmit={handleCreateSubmit} className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#231F20]">New request</h2>
            <span className="text-[#5F6368]">Submitted by {activeUser.name}. Saved in this browser only.</span>
          </div>
          {composerFeedback && !composerFeedback.ok && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[#B45309]">{composerFeedback.message}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[#5F6368] font-medium block">Request type</span>
              <select
                aria-label="Request type"
                value={newReqType}
                onChange={(event) => setNewReqType(event.target.value as GovernanceRequestType)}
                className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white"
              >
                <option value="financial_correction">Financial correction</option>
                <option value="broker_discrepancy">Broker discrepancy</option>
                <option value="evidence_submission">Evidence submission</option>
                <option value="quarantined_transaction">Quarantined transaction</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[#5F6368] font-medium block">Related record</span>
              <select
                aria-label="Related record"
                value={newLinkedId}
                onChange={(event) => setNewLinkedId(event.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md bg-white"
              >
                {IRREGULAR_COSTS.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · {item.item}</option>
                ))}
                {CUSTOMS_ENTRIES.map((item) => (
                  <option key={item.id} value={item.id}>{item.id} · {item.goods}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[#5F6368]">
            Record amount: <strong className="text-[#231F20] tabular-nums">{linkedAmount == null ? 'Unavailable' : formatMoney(linkedAmount)}</strong>
          </p>
          <label className="space-y-1 block">
            <span className="text-[#5F6368] font-medium">Proposed action</span>
            <input
              aria-label="Proposed action"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="mt-1 w-full px-3 py-2 border border-[#E2E5E8] rounded-md"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[#5F6368] font-medium">Reason</span>
            <textarea
              aria-label="Request reason"
              rows={2}
              value={newRationale}
              onChange={(event) => setNewRationale(event.target.value)}
              className="mt-1 w-full px-3 py-2 border border-[#E2E5E8] rounded-md"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[#5F6368] font-medium">Supporting reference</span>
            <input
              aria-label="Supporting reference"
              value={newReference}
              onChange={(event) => setNewReference(event.target.value)}
              placeholder="Optional note or source reference. Not a file upload."
              className="mt-1 w-full px-3 py-2 border border-[#E2E5E8] rounded-md"
            />
          </label>
          <div className="flex justify-end">
            <button type="submit" className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded-md cursor-pointer">
              Submit request
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', `All (${state.approvalRequests.length})`],
              ['needs_my_action', `Needs My Action (${needsMyActionCount})`],
              ['open', `Open Resolutions (${openResolutionCount})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQuickFilter(id)}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer ${
                quickFilter === id ? 'bg-[#231F20] text-white border-[#231F20]' : 'bg-white text-[#5F6368] border-[#E2E5E8]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-[#9AA0A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search requests"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, ID, or record"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E5E8] rounded-md"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8] max-h-[720px] overflow-y-auto">
          {filteredRequests.length === 0 ? (
            <p className="p-4 text-xs text-[#5F6368]">No requests match this view.</p>
          ) : (
            filteredRequests.map((request) => {
              const owner = decisionOwnerLabel(
                request,
                DEMO_USERS.find((user) => user.id === request.requestedByUserId)?.name ?? 'Requester',
                departmentFor(request)
              );
              const selected = selectedRequest?.id === request.id;
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => selectRequest(request.id)}
                  className={`w-full text-left p-3 cursor-pointer ${selected ? 'bg-[#F8F9FA]' : 'hover:bg-[#F8F9FA]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#231F20] break-words">{request.title}</p>
                      <p className="text-[11px] text-[#5F6368] mt-0.5">{request.id} · {request.linkedRecordId}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded border text-[11px] font-medium ${WORKFLOW_STYLE[request.workflowStatus]}`}>
                      {request.workflowStatus}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3 text-[11px]">
                    <span className="text-[#5F6368] min-w-0 break-words">{owner}</span>
                    <span className="tabular-nums text-[#231F20] font-medium shrink-0">{formatMoney(request.amountCad)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-4">
          {!selectedRequest || !requester ? (
            <p className="text-xs text-[#5F6368]">Select a request.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#231F20]">{selectedRequest.title}</h2>
                  <p className="text-xs text-[#5F6368] mt-1">
                    {selectedRequest.id} · {REQUEST_TYPE_LABELS[selectedRequest.requestType]} · {selectedRequest.linkedRecordId}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${WORKFLOW_STYLE[selectedRequest.workflowStatus]}`}>
                  {selectedRequest.workflowStatus}
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-[#5F6368]">What is requested</dt>
                  <dd className="text-[#231F20] mt-0.5">{selectedRequest.title}</dd>
                </div>
                <div>
                  <dt className="text-[#5F6368]">Record and amount</dt>
                  <dd className="text-[#231F20] mt-0.5 tabular-nums">{selectedRequest.linkedRecordId} · {formatMoney(selectedRequest.amountCad)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[#5F6368]">Why it is needed</dt>
                  <dd className="text-[#231F20] mt-0.5 whitespace-pre-wrap">{selectedRequest.rationale}</dd>
                </div>
                <div>
                  <dt className="text-[#5F6368]">Who can decide</dt>
                  <dd className="text-[#231F20] mt-0.5">{decisionOwnerLabel(selectedRequest, requester.name, departmentFor(selectedRequest))}</dd>
                </div>
                <div>
                  <dt className="text-[#5F6368]">After a decision</dt>
                  <dd className="text-[#231F20] mt-0.5">
                    Approval authorizes the next step. It does not change official case figures or verify missing files.
                  </dd>
                </div>
              </dl>

              <div className="border border-[#E2E5E8] rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[#231F20]">Evidence</h3>
                  <button
                    type="button"
                    onClick={() => setShowEvidenceForm((open) => !open)}
                    className="text-[11px] font-medium text-[#231F20] cursor-pointer"
                  >
                    {showEvidenceForm ? 'Cancel' : 'Add reference'}
                  </button>
                </div>
                {linkedEvidence.length === 0 ? (
                  <p className="text-xs text-[#B45309]">No supporting reference is attached. A missing file is not treated as verified.</p>
                ) : (
                  linkedEvidence.map((item) => (
                    <div key={item.id} className="text-xs">
                      <p className="font-medium text-[#231F20]">{item.title}</p>
                      <p className="text-[#5F6368]">{item.summary}</p>
                      <p className="text-[11px] text-[#5F6368]">{item.fileName ? item.fileName : 'Reference note, not a verified file'}</p>
                    </div>
                  ))
                )}
                {evFeedback && <p className="text-xs text-[#5F6368]">{evFeedback.message}</p>}
                {showEvidenceForm && (
                  <form onSubmit={handleAttachEvidence} className="space-y-2">
                    <input aria-label="Evidence title" value={evTitle} onChange={(event) => setEvTitle(event.target.value)} placeholder="Title" className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md text-xs" />
                    <textarea aria-label="Evidence summary" value={evSummary} onChange={(event) => setEvSummary(event.target.value)} rows={2} placeholder="What the reference shows" className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md text-xs" />
                    <select aria-label="Evidence type" value={evType} onChange={(event) => setEvType(event.target.value as EvidenceSourceType)} className="w-full px-2.5 py-1.5 border border-[#E2E5E8] rounded-md text-xs">
                      <option value="reference">Reference</option>
                      <option value="note">Note</option>
                    </select>
                    <button type="submit" className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded-md cursor-pointer">Save reference</button>
                  </form>
                )}
              </div>

              {decidedSteps.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-[#231F20]">Decision history</h3>
                  {decidedSteps.map((step) => (
                    <p key={`${step.stepNumber}-${step.timestampIso}`} className="text-xs text-[#5F6368]">
                      <span className="text-[#231F20]">{step.actorName}</span> · {step.stepLabel} · {step.timestampIso?.slice(0, 16).replace('T', ' ')} · {step.reason}
                    </p>
                  ))}
                </div>
              )}

              <div className="border-t border-[#E2E5E8] pt-3 space-y-2">
                {actionFeedback && (
                  <p className={`text-xs rounded-md border px-3 py-2 ${
                    actionFeedback.message.startsWith('Approved')
                      ? 'border-emerald-200 bg-emerald-50 text-[#15803D]'
                      : actionFeedback.message.startsWith('Rejected')
                        ? 'border-red-200 bg-red-50 text-[#DC2626]'
                        : actionFeedback.ok
                          ? 'border-[#E2E5E8] bg-[#F7F8F9] text-[#231F20]'
                          : 'border-amber-200 bg-amber-50 text-[#B45309]'
                  }`}>
                    {actionFeedback.message}
                  </p>
                )}
                {closed ? (
                  <p className="text-xs text-[#5F6368] inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    This decision is final in this browser.
                  </p>
                ) : userCanAct && selectedRequest.workflowStatus === 'Additional Evidence Required' && isRequester ? (
                  <>
                    <textarea aria-label="Resubmission note" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={2} placeholder="What changed" className="w-full px-3 py-2 border border-[#E2E5E8] rounded-md text-xs" />
                    <button type="button" onClick={() => decide('resubmit')} className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded-md cursor-pointer">Resubmit</button>
                  </>
                ) : userCanAct ? (
                  <>
                    <textarea aria-label="Decision reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={2} placeholder="Reason for this decision" className="w-full px-3 py-2 border border-[#E2E5E8] rounded-md text-xs" />
                    <div className="flex flex-wrap gap-2">
                      {isController ? (
                        <button type="button" onClick={() => decide('finalize')} className="px-3 py-1.5 text-xs font-medium text-white bg-[#15803D] rounded-md cursor-pointer">Approve</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => decide('recommend_approve')} className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md cursor-pointer">Recommend approval</button>
                          <button type="button" onClick={() => decide('recommend_reject')} className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md cursor-pointer">Recommend rejection</button>
                        </>
                      )}
                      <button type="button" onClick={() => decide('request_changes')} className="px-3 py-1.5 text-xs font-medium text-[#B45309] bg-amber-50 border border-amber-200 rounded-md cursor-pointer">Request Changes</button>
                      {isController && (
                        <button type="button" onClick={() => decide('reject')} className="px-3 py-1.5 text-xs font-medium text-[#DC2626] bg-white border border-red-200 rounded-md cursor-pointer">Reject</button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[#5F6368]">
                    {isRequester
                      ? 'You submitted this request. Another authorized person has to decide it.'
                      : 'This request is outside your decision authority.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E2E5E8] rounded-md">
        <button
          type="button"
          onClick={() => setExamplesOpen((open) => !open)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-[#231F20] cursor-pointer"
        >
          <span>Illustration only — not live decisions</span>
          <X className={`w-3.5 h-3.5 ${examplesOpen ? '' : 'rotate-45'}`} />
        </button>
        {examplesOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-4 pb-4">
            {ILLUSTRATIONS.map((item) => (
              <div key={item.status} className="border border-[#E2E5E8] rounded-md p-3">
                <p className={`text-xs font-semibold ${item.tone}`}>{item.status}</p>
                <p className="text-[11px] text-[#5F6368] mt-1">{item.text} These cards are not requests and are not attributed to a signed-in user.</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
