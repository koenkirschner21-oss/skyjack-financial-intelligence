import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Lock,
  Paperclip,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { CUSTOMS_ENTRIES, DEMO_USERS, IRREGULAR_COSTS } from '../../data/caseSeed';
import { useApp } from '../../context/AppContext';
import {
  AiExtractedEvidenceClaims,
  AiInvestigationBrief,
  ApprovalRequest,
  AuditEvent,
  EvidenceSourceType,
  FinancialDigitalThread,
  Investigation,
  InvestigationWorkflowStatus,
  RuleEvaluationResult,
  SupportingEvidence,
  User,
} from '../../types/domain';

const WORKFLOW_STATUSES: InvestigationWorkflowStatus[] = [
  'Open',
  'Assigned',
  'In Review',
  'Evidence Required',
  'Pending Approval',
  'Resolved',
  'Dismissed with Reason',
];

const EVIDENCE_STATUS_LABELS: Record<SupportingEvidence['status'], { label: string; cls: string }> = {
  case_documented: { label: 'Case Documented', cls: 'text-[#16A34A]' },
  reviewed: { label: 'Human Reviewed', cls: 'text-[#1D4ED8]' },
  accepted: { label: 'Accepted', cls: 'text-[#16A34A]' },
  pending_verification: { label: 'Pending Verification', cls: 'text-[#B45309]' },
  missing_in_case: { label: 'Missing in Case', cls: 'text-[#DC2626]' },
};

/* ==========================================================================
   TAB 1: OVERVIEW
   ========================================================================== */
interface OverviewTabProps {
  investigation: Investigation;
  rules: RuleEvaluationResult[];
  evidence: SupportingEvidence[];
  approvals: ApprovalRequest[];
  thread: FinancialDigitalThread;
  activeBrief?: AiInvestigationBrief;
  onGoToTab: (tab: 'overview' | 'thread' | 'evidence' | 'actions') => void;
  onInspectRecord: (recordId: string) => void;
}

export const InvestigationOverviewTab: React.FC<OverviewTabProps> = ({
  investigation,
  rules,
  evidence,
  approvals,
  thread,
  activeBrief,
  onGoToTab,
  onInspectRecord,
}) => {
  const { formatMoney } = useApp();
  const ir = IRREGULAR_COSTS.find((c) => c.id === investigation.linkedRecordId);
  const customs = CUSTOMS_ENTRIES.find((c) => c.id === investigation.linkedRecordId);
  const owner = DEMO_USERS.find((u) => u.id === investigation.ownerUserId);

  const documentedEvidence = evidence.filter(
    (e) => e.status === 'case_documented' || e.status === 'reviewed' || e.status === 'accepted'
  );
  const pendingOrMissingEvidence = evidence.filter(
    (e) => e.status === 'missing_in_case' || e.status === 'pending_verification'
  );

  const recommendedSteps: Array<{ label: string; actionLabel?: string; tab?: 'thread' | 'evidence' | 'actions' }> = [];
  if (pendingOrMissingEvidence.length > 0 || thread.missingLinks.length > 0) {
    recommendedSteps.push({
      label: 'Review missing documentation gaps and attach or verify supporting evidence.',
      actionLabel: 'Open Evidence',
      tab: 'evidence',
    });
  }
  if (customs?.tradeAgreementStatus === 'CUSMA_not_claimed') {
    recommendedSteps.push({
      label: 'Verify formal CUSMA Certificate of Origin against border entry E-08 before confirming 0% duty eligibility.',
      actionLabel: 'Inspect Evidence',
      tab: 'evidence',
    });
  }
  if (ir && ir.amountCad >= 250_000 && approvals.length === 0) {
    recommendedSteps.push({
      label: 'Route material expense exception for segregated governance review and approval.',
      actionLabel: 'Open Actions',
      tab: 'actions',
    });
  }
  if (approvals.length > 0) {
    recommendedSteps.push({
      label: `Track pending approval request (${approvals[0].workflowStatus}) through multi-step sign-off.`,
      actionLabel: 'View Approval',
      tab: 'actions',
    });
  }
  recommendedSteps.push({
    label: 'Trace connected ledger, shipment, and audit relationships across the 4-stage Financial Digital Thread.',
    actionLabel: 'View Thread',
    tab: 'thread',
  });

  return (
    <div className="space-y-5 text-xs">
      {/* What Was Flagged & Why It Matters */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[#231F20]">What Was Flagged &amp; Why It Matters</h3>
        <p className="text-[#231F20] leading-relaxed">{investigation.notes}</p>

        {ir && (
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-[#5F6368] block">Event &amp; Timing</span>
              <span className="text-[#231F20] font-medium">{ir.fiveWs.what} · {ir.fiveWs.when}</span>
            </div>
            <div>
              <span className="text-[#5F6368] block">Accounting &amp; Walk Impact</span>
              <span className="text-[#231F20] font-medium">
                {ir.walkBucket} ({formatMoney(ir.effectOnOeCad)} OE impact) · {ir.sourceRef}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block">Stated Cause</span>
              <span className="text-[#231F20]">{ir.fiveWs.why}</span>
            </div>
            <div>
              <span className="text-[#5F6368] block">How Coded / Source Detail</span>
              <span className="text-[#231F20]">{ir.fiveWs.how}</span>
            </div>
          </div>
        )}

        {customs && (
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-[#5F6368] block">Route &amp; Goods</span>
              <span className="text-[#231F20] font-medium">
                {customs.goods} ({customs.route}) · HS {customs.hsCode}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block">Declared Value &amp; Duty</span>
              <span className="text-[#231F20] font-mono tabular-nums">
                Goods {formatMoney(customs.goodsValueCad)} · Duty {formatMoney(customs.totalDutyAndTariffCad)}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block">Broker Fee vs. 0.2% Contract</span>
              <span className="text-[#231F20] font-mono tabular-nums">
                Charged {formatMoney(customs.brokerFeeChargedCad)} vs. Expected {formatMoney(customs.brokerFeeExpectedCad)}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block">Trade Agreement Status</span>
              <span className="text-[#231F20]">{customs.tradeAgreementStatus.replace(/_/g, ' ')} · {customs.sourceRef}</span>
            </div>
          </div>
        )}
      </div>

      {/* Deterministic Rule Triggers */}
      <div className="space-y-2 pt-3 border-t border-[#E2E5E8]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#231F20] inline-flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#E53C2E]" />
            <span>Deterministic Rule Triggers ({rules.length || investigation.ruleCodes?.length || 0})</span>
          </h3>
          <button
            type="button"
            onClick={() => onInspectRecord(investigation.linkedRecordId)}
            className="text-[11px] font-medium text-[#E53C2E] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
          >
            <span>Inspect Source Record</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {rules.length > 0 ? (
          <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded-md">
            {rules.map((r) => (
              <div key={r.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[#231F20]">{r.ruleCode}</span>
                  <span className="text-[11px] font-medium text-[#5F6368] capitalize">{r.severity} priority</span>
                </div>
                <p className="text-[#231F20] font-medium">{r.summary}</p>
                <p className="text-[11px] text-[#5F6368]">{r.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 border border-[#E2E5E8] rounded-md text-[11px] text-[#5F6368]">
            Rule screen references: <span className="font-mono text-[#231F20]">{investigation.ruleCodes?.join(', ') || 'Data Gateway Quarantine'}</span>.
          </div>
        )}
        <p className="text-[11px] text-[#5F6368]">
          Rule screening flags items for review priority only; flagged records are not treated as proven fraud or automatic error.
        </p>
      </div>

      {/* Verified vs. Uncertain / Missing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#E2E5E8]">
        <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md space-y-2">
          <div className="text-xs font-semibold text-[#16A34A] inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Verified &amp; Documented</span>
          </div>
          <ul className="space-y-1 text-[11px] text-[#231F20]">
            <li>
              • Assigned owner: <span className="font-medium">{owner?.name ?? 'Unassigned'}</span> ({investigation.workflowStatus})
            </li>
            <li>
              • Source record anchored in repository (<span className="font-mono">{investigation.linkedRecordId}</span>)
            </li>
            {documentedEvidence.map((ev) => (
              <li key={ev.id}>• {ev.title}</li>
            ))}
            {documentedEvidence.length === 0 && (
              <li className="text-[#5F6368]">• No verified supporting attachments logged yet.</li>
            )}
          </ul>
        </div>

        <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-md space-y-2">
          <div className="text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>Uncertain &amp; Missing Requirements</span>
          </div>
          {thread.missingLinks.length === 0 && pendingOrMissingEvidence.length === 0 ? (
            <p className="text-[11px] text-amber-950">
              No unresolved evidence gaps flagged in case metadata; complete workflow review in Actions.
            </p>
          ) : (
            <ul className="space-y-1 text-[11px] text-amber-950">
              {pendingOrMissingEvidence.map((ev) => (
                <li key={ev.id}>
                  • <span className="font-medium">{ev.title}</span> ({ev.status.replace(/_/g, ' ')})
                </li>
              ))}
              {thread.missingLinks.slice(0, 3).map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {recommendedSteps[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E2E5E8]">
          <div>
            <h3 className="text-xs font-semibold text-[#231F20]">Next Action</h3>
            <p className="text-[11px] text-[#5F6368] mt-0.5">{recommendedSteps[0].label}</p>
          </div>
          {recommendedSteps[0].tab && recommendedSteps[0].actionLabel && (
            <button
              type="button"
              onClick={() => onGoToTab(recommendedSteps[0].tab!)}
              className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
            >
              {recommendedSteps[0].actionLabel}
            </button>
          )}
        </div>
      )}

      {/* Compact AI Brief Callout if already available */}
      {activeBrief && (
        <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#231F20] inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
              <span>AI Investigation Brief Available ({activeBrief.modelName})</span>
            </span>
            <button
              type="button"
              onClick={() => onGoToTab('actions')}
              className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
            >
              View Full Brief &amp; Save Note
            </button>
          </div>
          <p className="text-[11px] text-[#5F6368]">{activeBrief.executiveSummary}</p>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   TAB 3: EVIDENCE
   ========================================================================== */
interface EvidenceTabProps {
  investigation: Investigation;
  evidence: SupportingEvidence[];
  missingLinks: string[];
  canSubmitGovernance: boolean;
  onAddEvidence: (input: {
    linkedRecordId: string;
    linkedEntityType: 'irregular_cost' | 'customs_entry';
    title: string;
    summary: string;
    sourceType: EvidenceSourceType;
    fileName?: string;
    fileSizeBytes?: number;
    persistenceScope: 'case_reference' | 'metadata_only_local_demo';
  }) => { ok: boolean; message: string };
  onExtractClaims: (params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    linkedRecordId: string;
  }) => Promise<{ ok: true; claims: AiExtractedEvidenceClaims } | { ok: false; userMessage: string }>;
  onRouteEvidenceForReview: (title: string, rationale: string) => { ok: boolean; message: string };
}

export const InvestigationEvidenceTab: React.FC<EvidenceTabProps> = ({
  investigation,
  evidence,
  missingLinks,
  canSubmitGovernance,
  onAddEvidence,
  onExtractClaims,
  onRouteEvidenceForReview,
}) => {
  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evSourceType, setEvSourceType] = useState<EvidenceSourceType>('reference');
  const [evFileMeta, setEvFileMeta] = useState<{
    name: string;
    size: number;
    mimeType: string;
    base64Data?: string;
  } | null>(null);
  const [extractingEv, setExtractingEv] = useState(false);
  const [extractedClaims, setExtractedClaims] = useState<AiExtractedEvidenceClaims | null>(null);
  const [claimsHumanReviewed, setClaimsHumanReviewed] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const missingEvidenceItems = evidence.filter((e) => e.status === 'missing_in_case');
  const pendingItems = evidence.filter((e) => e.status === 'pending_verification');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setExtractedClaims(null);
    setClaimsHumanReviewed(false);
    setExtractError(null);
    setSubmitFeedback(null);
    if (!f) {
      setEvFileMeta(null);
      return;
    }
    if (!evTitle) setEvTitle(f.name);

    const isSupportedMedia =
      f.type === 'application/pdf' ||
      f.type === 'image/png' ||
      f.type === 'image/jpeg' ||
      f.type === 'image/webp';

    if (isSupportedMedia && f.size <= 4 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result ?? '');
        const base64 = res.includes(',') ? res.split(',')[1] : '';
        setEvFileMeta({ name: f.name, size: f.size, mimeType: f.type, base64Data: base64 });
      };
      reader.readAsDataURL(f);
    } else {
      setEvFileMeta({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' });
    }
  };

  const handleExtract = async () => {
    if (!evFileMeta?.base64Data) return;
    setExtractingEv(true);
    setExtractError(null);
    setClaimsHumanReviewed(false);
    const res = await onExtractClaims({
      fileName: evFileMeta.name,
      mimeType: evFileMeta.mimeType,
      base64Data: evFileMeta.base64Data,
      linkedRecordId: investigation.linkedRecordId,
    });
    setExtractingEv(false);
    if (!res.ok) {
      setExtractError(res.userMessage);
      return;
    }
    setExtractedClaims(res.claims);
    if (!evSummary) {
      setEvSummary(
        `[Unverified AI Extraction] Invoice: ${res.claims.invoiceReference} | Supplier: ${res.claims.supplierIdentifier} | Amount: ${res.claims.financialAmount} | Date: ${res.claims.documentDate} — ${res.claims.supportingDescription}`
      );
    }
  };

  const handleSubmitEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitFeedback(null);
    if (!evTitle.trim() || !evSummary.trim()) {
      setSubmitFeedback({ type: 'error', message: 'Evidence title and summary are required.' });
      return;
    }
    if (extractedClaims && !claimsHumanReviewed) {
      setSubmitFeedback({
        type: 'error',
        message: 'Confirm human review of AI-extracted claims before saving to the evidence record.',
      });
      return;
    }

    const res = onAddEvidence({
      linkedRecordId: investigation.linkedRecordId,
      linkedEntityType:
        investigation.linkedRecordType === 'customs_entry' ? 'customs_entry' : 'irregular_cost',
      title: evTitle,
      summary: claimsHumanReviewed
        ? `${evSummary.trim()} [Employee-reviewed against attached file; governance verification pending]`
        : evSummary,
      sourceType: evSourceType,
      fileName: evFileMeta?.name,
      fileSizeBytes: evFileMeta?.size,
      persistenceScope: evFileMeta ? 'metadata_only_local_demo' : 'case_reference',
    });

    if (!res.ok) {
      setSubmitFeedback({ type: 'error', message: res.message });
      return;
    }
    setSubmitFeedback({
      type: 'success',
      message: `${res.message} Recorded as Pending Verification.`,
    });
    setEvTitle('');
    setEvSummary('');
    setEvFileMeta(null);
    setExtractedClaims(null);
    setClaimsHumanReviewed(false);
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Missing Documentation & Verification Checklist */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[#231F20]">
          Missing Evidence &amp; Verification Requirements
        </h3>
        {missingEvidenceItems.length === 0 && pendingItems.length === 0 && missingLinks.length === 0 ? (
          <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md text-[11px] text-[#16A34A] inline-flex items-center gap-1.5 w-full">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>No open missing-document gaps flagged for {investigation.linkedRecordId}.</span>
          </div>
        ) : (
          <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-md space-y-2 text-[11px] text-amber-950">
            {missingEvidenceItems.map((ev) => (
              <div key={ev.id} className="flex items-start justify-between gap-2">
                <span>
                  <strong className="text-[#DC2626]">[Missing]</strong> {ev.title} — {ev.summary}
                </span>
              </div>
            ))}
            {pendingItems.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="text-amber-900">[Pending Verification]</strong> {ev.title}
                </span>
                {canSubmitGovernance && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = onRouteEvidenceForReview(
                        `Evidence Verification: ${ev.title}`,
                        `Verify attached evidence "${ev.title}" for ${investigation.linkedRecordId}: ${ev.summary}`
                      );
                      setSubmitFeedback({
                        type: res.ok ? 'success' : 'error',
                        message: res.message,
                      });
                    }}
                    className="text-[#E53C2E] font-medium hover:underline cursor-pointer shrink-0"
                  >
                    Route to Approvals
                  </button>
                )}
              </div>
            ))}
            {missingLinks.map((m) => (
              <div key={m}>• {m}</div>
            ))}
          </div>
        )}
      </div>

      {/* Existing Evidence & References */}
      <div className="space-y-2 pt-3 border-t border-[#E2E5E8]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#231F20]">
            Evidence References &amp; Attached Metadata ({evidence.length})
          </h3>
          <span className="text-[11px] text-[#5F6368]">
            Session-only file handling: document bytes are not stored in browser storage
          </span>
        </div>

        {evidence.length > 0 ? (
          <div className="border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8]">
            {evidence.map((ev) => {
              const st = EVIDENCE_STATUS_LABELS[ev.status];
              return (
                <div key={ev.id} className="p-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[#231F20] inline-flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#5F6368] shrink-0" />
                      <span>{ev.title}</span>
                    </span>
                    <div className="flex items-center gap-2 text-[11px] shrink-0">
                      <span className="text-[#5F6368] font-mono">
                        {ev.persistenceScope === 'metadata_only_local_demo'
                          ? 'Metadata Only'
                          : 'Case Ref'}
                      </span>
                      <span className="text-[#D4D8DD]">·</span>
                      <span className={`font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#5F6368] leading-relaxed">{ev.summary}</p>
                  {ev.fileName && (
                    <div className="text-[10px] font-mono text-[#7E8082]">
                      Attached file (session only): {ev.fileName}
                      {ev.fileSizeBytes ? ` (${Math.max(1, Math.round(ev.fileSizeBytes / 1024))} KB)` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[#5F6368] p-3 border border-dashed border-[#E2E5E8] rounded-md">
            No supporting evidence references logged for this record yet.
          </p>
        )}
      </div>

      {/* Attach Evidence Metadata & Optional Multimodal Extraction */}
      <form
        onSubmit={handleSubmitEvidence}
        className="p-4 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-[#231F20] inline-flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-[#E53C2E]" />
            <span>Attach Evidence Reference or Extract PDF/Image Claims</span>
          </span>
          <span className="text-[10px] text-[#5F6368]">
            Metadata persists locally; source files remain session-only
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={evTitle}
            onChange={(e) => setEvTitle(e.target.value)}
            placeholder="Evidence title or document reference"
            className="sm:col-span-2 bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
          />
          <select
            aria-label="Evidence source type"
            value={evSourceType}
            onChange={(e) => setEvSourceType(e.target.value as EvidenceSourceType)}
            className="bg-white border border-[#E2E5E8] rounded px-2 py-1.5 text-xs"
          >
            <option value="reference">Reference</option>
            <option value="note">Note</option>
            <option value="pdf">PDF Document</option>
            <option value="image">Image / Scan</option>
            <option value="spreadsheet">Spreadsheet</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx"
            onChange={handleFileChange}
            className="text-[11px] text-[#5F6368]"
          />
          {evFileMeta?.base64Data && (
            <button
              type="button"
              disabled={extractingEv}
              onClick={handleExtract}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] disabled:opacity-50 cursor-pointer"
            >
              {extractingEv ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
              )}
              <span>{extractingEv ? 'Extracting Claims…' : 'Extract Claims with Gemini (Unverified)'}</span>
            </button>
          )}
        </div>

        {extractError && (
          <div className="p-2.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <span>{extractError}</span>
          </div>
        )}

        {extractedClaims && (
          <div className="p-3 bg-white border border-amber-300 rounded-md text-[11px] space-y-2">
            <div className="font-semibold text-amber-900">
              Unverified AI Document Extraction ({extractedClaims.modelName}) — Human Review Required
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[#231F20]">
              <span>Invoice Ref: <strong className="font-mono">{extractedClaims.invoiceReference}</strong></span>
              <span>Supplier: <strong>{extractedClaims.supplierIdentifier}</strong></span>
              <span>Amount: <strong className="font-mono">{extractedClaims.financialAmount}</strong></span>
              <span>Date: <strong className="font-mono">{extractedClaims.documentDate}</strong></span>
              <span>Shipment Ref: <strong className="font-mono">{extractedClaims.shipmentReference}</strong></span>
            </div>
            <div className="text-[#5F6368]">{extractedClaims.extractionCaveats}</div>
            <label className="pt-1.5 border-t border-[#E2E5E8] flex items-center gap-2 text-[#231F20] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={claimsHumanReviewed}
                onChange={(e) => setClaimsHumanReviewed(e.target.checked)}
                className="accent-[#E53C2E]"
              />
              <span>I have reviewed these extracted claims against the source document.</span>
            </label>
          </div>
        )}

        <textarea
          rows={2}
          value={evSummary}
          onChange={(e) => setEvSummary(e.target.value)}
          placeholder="Documented evidence summary, invoice citation, or review notes..."
          className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
        />

        {submitFeedback && (
          <div
            className={`p-2.5 rounded border text-[11px] ${
              submitFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-[#16A34A]'
                : 'bg-red-50 border-red-200 text-[#DC2626]'
            }`}
          >
            {submitFeedback.message}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="submit"
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
          >
            Save Evidence Metadata
          </button>
        </div>
      </form>
    </div>
  );
};

/* ==========================================================================
   TAB 4: ACTIONS (WORKFLOW, ESCALATION, AI BRIEF & AUDIT)
   ========================================================================== */
interface ActionsTabProps {
  investigation: Investigation;
  activeUser: User;
  canEditSelected: boolean;
  canSubmitGovernance: boolean;
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  savedAiNotes: SupportingEvidence[];
  activeBrief?: AiInvestigationBrief;
  aiLoading: boolean;
  aiError: string | null;
  onAnalyzeWithAi: () => void;
  onSaveAiNote: (linkedRecordId: string, brief: AiInvestigationBrief) => { ok: boolean; message: string };
  onUpdateWorkflow: (
    investigationId: string,
    params: {
      workflowStatus?: InvestigationWorkflowStatus;
      ownerUserId?: string;
      dismissalReason?: string;
      notes?: string;
    }
  ) => { ok: boolean; message: string };
  onCreateEscalation: (params: {
    linkedRecordId: string;
    requestType: 'financial_correction' | 'broker_discrepancy' | 'evidence_submission';
    title: string;
    amountCad: number;
    rationale: string;
    requiredApprovalsCount: number;
  }) => { ok: boolean; message: string };
  onNavigate: (route: '/approvals' | '/audit') => void;
}

export const InvestigationActionsTab: React.FC<ActionsTabProps> = ({
  investigation,
  activeUser,
  canEditSelected,
  canSubmitGovernance,
  approvals,
  auditEvents,
  savedAiNotes,
  activeBrief,
  aiError,
  onSaveAiNote,
  onUpdateWorkflow,
  onCreateEscalation,
  onNavigate,
}) => {
  const { formatMoney } = useApp();
  const [dismissReason, setDismissReason] = useState(investigation.dismissalReason ?? '');
  const [notesDraft, setNotesDraft] = useState(investigation.notes);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Escalation composer
  const [showEscalate, setShowEscalate] = useState(false);
  const [escTitle, setEscTitle] = useState(`Governance Review: ${investigation.linkedRecordId}`);
  const [escRationale, setEscRationale] = useState('');
  const [escMultiStep, setEscMultiStep] = useState(investigation.exposureCad >= 250_000);

  // Keep notes draft synced when selected investigation switches
  React.useEffect(() => {
    setNotesDraft(investigation.notes);
    setDismissReason(investigation.dismissalReason ?? '');
    setEscTitle(`Governance Review: ${investigation.linkedRecordId}`);
    setEscRationale('');
    setEscMultiStep(investigation.exposureCad >= 250_000);
    setShowEscalate(false);
    setActionFeedback(null);
  }, [investigation.id, investigation.linkedRecordId, investigation.notes, investigation.dismissalReason, investigation.exposureCad]);

  return (
    <div className="space-y-5 text-xs">
      {/* Workflow Status, Ownership & Notes */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#231F20]">Workflow Assignment &amp; Status</h3>
          {!canEditSelected && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6368]">
              <Lock className="w-3 h-3" />
              <span>Read-only for {activeUser.title}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md">
          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-[#5F6368]">Assigned Owner</span>
            <select
              disabled={!canEditSelected}
              value={investigation.ownerUserId}
              onChange={(e) => {
                const res = onUpdateWorkflow(investigation.id, { ownerUserId: e.target.value });
                setActionFeedback(res.message);
              }}
              className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs disabled:opacity-60"
            >
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.title})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-[#5F6368]">Workflow Status</span>
            <select
              disabled={!canEditSelected}
              value={investigation.workflowStatus}
              onChange={(e) => {
                const nextStatus = e.target.value as InvestigationWorkflowStatus;
                const reasonText =
                  nextStatus === 'Dismissed with Reason'
                    ? dismissReason.trim() || 'Verified benign variance with supporting documentation.'
                    : undefined;
                if (nextStatus === 'Dismissed with Reason' && !dismissReason.trim()) {
                  setDismissReason('Verified benign variance with supporting documentation.');
                }
                const res = onUpdateWorkflow(investigation.id, {
                  workflowStatus: nextStatus,
                  dismissalReason: reasonText,
                });
                setActionFeedback(res.message);
              }}
              className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs disabled:opacity-60"
            >
              {WORKFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {investigation.workflowStatus === 'Dismissed with Reason' && (
            <div className="sm:col-span-2 space-y-1">
              <span className="block text-[11px] font-medium text-[#5F6368]">Dismissal Rationale</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!canEditSelected}
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  className="flex-1 bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs disabled:opacity-60"
                />
                {canEditSelected && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = onUpdateWorkflow(investigation.id, {
                        workflowStatus: 'Dismissed with Reason',
                        dismissalReason: dismissReason.trim() || 'Documented dismissal rationale required.',
                      });
                      setActionFeedback(res.message);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-[#231F20] text-white rounded hover:bg-[#3A3536] cursor-pointer"
                  >
                    Update Reason
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="sm:col-span-2 space-y-1.5">
            <span className="block text-[11px] font-medium text-[#5F6368]">Investigation Notes</span>
            <textarea
              rows={2}
              disabled={!canEditSelected}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs disabled:opacity-60"
            />
            {canEditSelected && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const res = onUpdateWorkflow(investigation.id, { notes: notesDraft });
                    setActionFeedback(res.message);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer"
                >
                  Save Investigation Note
                </button>
                {actionFeedback && (
                  <span className="text-[11px] text-[#5F6368]">{actionFeedback}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escalation & Governance Approval Pathways */}
      <div className="space-y-2.5 pt-3 border-t border-[#E2E5E8]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#231F20]">
            Governance &amp; Approval Pathways
          </h3>
          {canSubmitGovernance && (
            <button
              type="button"
              onClick={() => setShowEscalate((prev) => !prev)}
              className="text-[11px] font-medium text-[#E53C2E] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>{showEscalate ? 'Cancel Escalation' : 'Route to Approvals'}</span>
            </button>
          )}
        </div>

        {approvals.length > 0 ? (
          <div className="border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8]">
            {approvals.map((apr) => {
              const signed = apr.approvalsHistory.filter((s) => s.decision === 'Approved').length;
              return (
                <div key={apr.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#231F20]">{apr.title}</div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">
                      Status: <strong className="text-[#231F20]">{apr.workflowStatus}</strong> · Sign-offs:{' '}
                      <span className="font-mono">{signed}/{apr.requiredApprovalsCount}</span> ·{' '}
                      <span className="font-mono">{formatMoney(apr.amountCad)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('/approvals')}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded hover:border-[#231F20] cursor-pointer"
                  >
                    Open in Approvals
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[#5F6368]">
            No approval request currently linked to {investigation.linkedRecordId}. Segregation of duties prevents self-approval of material corrections.
          </p>
        )}

        {showEscalate && canSubmitGovernance && (
          <div className="p-3.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md space-y-2.5">
            <div className="text-[11px] font-semibold text-[#231F20]">
              Submit Segregated Governance Request (Approvals Queue)
            </div>
            <input
              type="text"
              value={escTitle}
              onChange={(e) => setEscTitle(e.target.value)}
              placeholder="Request title"
              className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
            />
            <textarea
              rows={2}
              value={escRationale}
              onChange={(e) => setEscRationale(e.target.value)}
              placeholder="Document accounting/trade rationale and supporting reference..."
              className="w-full bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#5F6368] cursor-pointer">
                <input
                  type="checkbox"
                  checked={escMultiStep}
                  onChange={(e) => setEscMultiStep(e.target.checked)}
                  className="accent-[#E53C2E]"
                />
                <span>Require 3-step material sign-off</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const res = onCreateEscalation({
                    linkedRecordId: investigation.linkedRecordId,
                    requestType:
                      investigation.linkedRecordType === 'customs_entry'
                        ? 'broker_discrepancy'
                        : 'financial_correction',
                    title: escTitle,
                    amountCad: investigation.exposureCad,
                    rationale: escRationale,
                    requiredApprovalsCount: escMultiStep ? 3 : 1,
                  });
                  setActionFeedback(res.message);
                  if (res.ok) setShowEscalate(false);
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
              >
                Submit to Approvals
              </button>
            </div>
          </div>
        )}
      </div>

      {aiError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-950 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">AI Investigation Analysis Unavailable</div>
              <p className="mt-0.5 text-[11px]">{aiError}</p>
            </div>
          </div>
        )}

        {activeBrief && (
          <div className="border border-[#E2E5E8] rounded-md p-4 space-y-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E2E5E8]">
              <div className="text-[11px] text-[#5F6368]">
                Model: <strong className="text-[#231F20]">{activeBrief.modelName}</strong> ·{' '}
                {new Date(activeBrief.generatedAtIso).toLocaleString()} · Unverified AI Brief
              </div>
              {canSubmitGovernance && (
                <button
                  type="button"
                  onClick={() => {
                    const res = onSaveAiNote(investigation.linkedRecordId, activeBrief);
                    setActionFeedback(res.message);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3326] cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save AI Note</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded space-y-1">
                <div className="font-semibold text-[#16A34A]">Established Facts &amp; Financial Exposure</div>
                <p className="text-[#231F20] font-medium">{activeBrief.executiveSummary}</p>
                <p className="text-[#5F6368]">{activeBrief.whatOccurred}</p>
                <div className="font-mono text-[#231F20] pt-1">{activeBrief.financialAmountSummary}</div>
              </div>

              <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded space-y-1">
                <div className="font-semibold text-[#231F20]">Why Flagged &amp; Possible Explanations</div>
                <p className="text-[#231F20]">{activeBrief.whyFlagged}</p>
                <ul className="space-y-0.5 text-[#5F6368]">
                  {activeBrief.possibleExplanations.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded space-y-1">
                <div className="font-semibold text-amber-900">Missing Evidence &amp; Uncertainties</div>
                <ul className="space-y-0.5 text-amber-950">
                  {activeBrief.missingInformation.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-900 pt-1">{activeBrief.limitationsAndUncertainties}</p>
              </div>

              <div className="p-3 border border-[#E2E5E8] rounded space-y-1">
                <div className="font-semibold text-[#231F20]">Recommended Next Steps</div>
                <ol className="list-decimal pl-4 space-y-0.5 text-[#231F20]">
                  {activeBrief.recommendedSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        {savedAiNotes.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-[#5F6368]">
              Saved AI Analysis Notes ({savedAiNotes.length})
            </div>
            {savedAiNotes.map((n) => (
              <div key={n.id} className="p-2.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded text-[11px] space-y-0.5">
                <div className="flex items-center justify-between gap-2 font-medium text-[#231F20]">
                  <span>{n.title}</span>
                  <span className="font-mono text-[#5F6368]">{n.createdAtIso.slice(0, 10)}</span>
                </div>
                <p className="text-[#5F6368]">{n.summary}</p>
              </div>
            ))}
          </div>
        )}

      {/* Relevant Audit History */}
      <div className="space-y-2 pt-3 border-t border-[#E2E5E8]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[#231F20] inline-flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#5F6368]" />
            <span>Audit History ({auditEvents.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => onNavigate('/audit')}
            className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
          >
            Open Full Audit Log
          </button>
        </div>

        {auditEvents.length > 0 ? (
          <div className="border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8]">
            {auditEvents.map((a) => (
              <div key={a.id} className="px-3 py-2 flex items-start justify-between gap-3 text-[11px]">
                <span className="text-[#231F20]">
                  <strong className="font-semibold">{a.actorName}</strong>: {a.summary}
                </span>
                <span className="font-mono text-[#5F6368] shrink-0">{a.timestampIso.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#5F6368]">No audit log entries recorded for {investigation.linkedRecordId} yet.</p>
        )}
      </div>
    </div>
  );
};
