import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  GitBranch,
  ShieldAlert,
  Sliders,
  X,
} from 'lucide-react';
import { IRREGULAR_COSTS } from '../../data/caseSeed';
import { useApp } from '../../context/AppContext';
import { canManageRecordInvestigation } from '../../domain/permissions';
import { calculateExpectedBrokerFeeCad } from '../../domain/rulesEngine';
import { formatInvestigationStatus } from '../../repositories/costIntelligenceRepo';
import { EvidenceSourceType, InvestigationStatus } from '../../types/domain';
import { ProvenanceText } from '../common/StateViews';
import { FinancialDigitalThreadView } from '../intelligence/FinancialDigitalThreadView';

export const RecordDetailDrawer: React.FC = () => {
  const {
    drawerRecord,
    openDrawer,
    closeDrawer,
    state,
    activeUser,
    ruleEvaluations,
    hasPermission,
    updateInvestigationStatus,
    addSupportingEvidence,
    submitCorrectionRequest,
    sendEntriesToSimulator,
    navigate,
    formatMoney,
  } = useApp();

  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [evidenceSourceType, setEvidenceSourceType] = useState<EvidenceSourceType>('note');
  const [evidenceFileMeta, setEvidenceFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [correctionTitle, setCorrectionTitle] = useState('');
  const [correctionRationale, setCorrectionRationale] = useState('');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);

  if (!drawerRecord) return null;

  const canSubmitCorrection = hasPermission('submit_correction_request');
  const canSimulate = hasPermission('run_tariff_simulator');

  const handleEvidenceSubmit = (e: React.FormEvent, recordId: string) => {
    e.preventDefault();
    if (!evidenceTitle.trim() || !evidenceSummary.trim()) return;
    addSupportingEvidence({
      linkedRecordId: recordId,
      linkedEntityType:
        drawerRecord.type === 'customs_entry'
          ? 'customs_entry'
          : drawerRecord.type === 'uploaded_ledger'
            ? 'uploaded_ledger'
            : drawerRecord.type === 'uploaded_customs'
              ? 'uploaded_customs'
              : 'irregular_cost',
      title: evidenceTitle,
      summary: evidenceSummary,
      sourceType: evidenceSourceType,
      fileName: evidenceFileMeta?.name,
      fileSizeBytes: evidenceFileMeta?.size,
      persistenceScope: evidenceFileMeta ? 'metadata_only_local_demo' : 'case_reference',
    });
    setEvidenceTitle('');
    setEvidenceSummary('');
    setEvidenceFileMeta(null);
  };

  const handleCorrectionSubmit = (e: React.FormEvent, recordId: string, amountCad: number) => {
    e.preventDefault();
    if (!correctionTitle.trim() || !correctionRationale.trim()) return;
    submitCorrectionRequest(recordId, correctionTitle, amountCad, correctionRationale);
    setCorrectionTitle('');
    setCorrectionRationale('');
    setShowCorrectionForm(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#231F20]/30"
      role="dialog"
      aria-modal="true"
      aria-label="Record Detail Inspector"
    >
      <div className="fixed inset-0" onClick={closeDrawer} />
      <aside className="relative z-10 w-full max-w-xl bg-white h-full border-l border-[#E2E5E8] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E5E8] flex items-center justify-between gap-4 bg-white">
          <div className="min-w-0">
            <div className="text-xs text-[#5F6368] uppercase tracking-wider font-medium">
              Record Detail Inspector
            </div>
            <h2 className="text-base font-semibold text-[#231F20] truncate mt-0.5">
              {drawerRecord.type === 'irregular_cost' && `${drawerRecord.record.id} · ${drawerRecord.record.item}`}
              {drawerRecord.type === 'customs_entry' && `${drawerRecord.record.id} · ${drawerRecord.record.goods}`}
              {drawerRecord.type === 'walk_entry' && drawerRecord.record.stepLabel}
              {drawerRecord.type === 'rule_evaluation' && `${drawerRecord.record.ruleCode} · ${drawerRecord.record.recordLabel}`}
              {drawerRecord.type === 'uploaded_ledger' && `${drawerRecord.record.transactionId} · ${drawerRecord.record.department}`}
              {drawerRecord.type === 'uploaded_customs' && `${drawerRecord.record.entryId} · ${drawerRecord.record.goodsDescription}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-2 text-[#5F6368] hover:text-[#231F20] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
            aria-label="Close detail drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {drawerRecord.type === 'irregular_cost' && (() => {
            const cost = drawerRecord.record;
            const relatedFlags = ruleEvaluations.filter((r) => r.recordId === cost.id);
            const investigation = state.investigations.find((i) => i.linkedRecordId === cost.id);
            const evidenceList = state.evidence.filter((ev) => ev.linkedRecordId === cost.id);
            const canEditThisInv = canManageRecordInvestigation(activeUser, cost);

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E5E8]">
                  <ProvenanceText provenance={cost.provenance} sourceRef={cost.sourceRef} />
                  <span className="text-xs font-medium text-[#5F6368]">
                    Source unit: {cost.sourceUnit === 'full_cad' ? 'Full CAD' : 'Thousands CAD'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Recorded Amount</div>
                    <div className="text-lg font-semibold text-[#231F20] tabular-nums mt-0.5">
                      {formatMoney(cost.amountCad)}
                    </div>
                    <div className="text-xs text-[#5F6368] mt-1">
                      OE Effect: <span className="tabular-nums text-[#DC2626]">{formatMoney(cost.effectOnOeCad)}</span>
                    </div>
                  </div>
                  <div className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Classification & Bucket</div>
                    <div className="text-sm font-semibold text-[#231F20] mt-0.5">
                      {cost.timing} · {cost.walkBucket}
                    </div>
                    <div className="text-xs text-[#5F6368] mt-1">
                      {cost.department} · {cost.regionName}
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">What happened</dt>
                    <dd className="text-[#231F20]">{cost.fiveWs.what}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">Location and date</dt>
                    <dd className="text-[#231F20]">{cost.fiveWs.where}. {cost.fiveWs.when}.</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">Financial exposure</dt>
                    <dd className="font-mono tabular-nums text-[#231F20]">{formatMoney(cost.amountCad)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">Investigation status</dt>
                    <dd className="text-[#231F20]">
                      {investigation ? formatInvestigationStatus(investigation.status) : 'No investigation record'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">Why flagged</dt>
                    <dd className="text-[#231F20]">{relatedFlags[0]?.summary ?? cost.approvalNote}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-[#5F6368]">Next action</dt>
                    <dd className="text-[#231F20]">
                      {canEditThisInv
                        ? 'Update the investigation state or request a correction review below.'
                        : 'Review the record. Status changes are read-only for this role.'}
                    </dd>
                  </div>
                </dl>

                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Source events and five Ws</summary>
                  <div className="px-3 pb-3 space-y-2.5">
                  <dl className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded bg-white">
                    {([
                      ['Who', cost.fiveWs.who],
                      ['What', cost.fiveWs.what],
                      ['Where', cost.fiveWs.where],
                      ['When', cost.fiveWs.when],
                      ['Why', cost.fiveWs.why],
                      ['How it reached books', cost.fiveWs.how],
                    ] as const).map(([label, val]) => (
                      <div key={label} className="px-3.5 py-2.5 grid grid-cols-3 gap-3 text-xs">
                        <dt className="font-medium text-[#5F6368]">{label}</dt>
                        <dd className="col-span-2 text-[#231F20]">{val}</dd>
                      </div>
                    ))}
                  </dl>
                  </div>
                </details>

                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Financial statement context and rule flags</summary>
                  <div className="px-3 pb-3 space-y-2.5">
                  <div className="p-3.5 border border-[#E2E5E8] rounded bg-white space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#231F20]">Approval Reference Status</span>
                      <span
                        className={`font-medium ${
                          cost.approvalStatus === 'explicitly_missing' ? 'text-[#E53C2E]' : 'text-[#5F6368]'
                        }`}
                      >
                        {cost.approvalStatus === 'explicitly_missing'
                          ? 'Explicitly Missing in Case'
                          : 'Not Supplied in Appendix'}
                      </span>
                    </div>
                    <p className="text-xs text-[#5F6368] leading-relaxed">{cost.approvalNote}</p>
                  </div>

                  {relatedFlags.map((flag) => (
                    <div key={flag.id} className="p-3 border border-[#E2E5E8] rounded bg-[#F5F6F7] text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[#231F20]">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#E53C2E]" />
                        <span>{flag.ruleCode}: {flag.summary}</span>
                      </div>
                      <p className="text-[#5F6368]">{flag.nonFraudDisclaimer}</p>
                    </div>
                  ))}
                  </div>
                </details>

                {investigation && (
                  <div className="space-y-2 pt-2 border-t border-[#E2E5E8]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5F6368]">
                        Demonstration Investigation State
                      </h3>
                      <span className="text-xs text-[#5F6368]">Demo workflow only</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 border border-[#E2E5E8] rounded">
                      <div className="text-xs">
                        <div className="font-medium text-[#231F20]">
                          Current: {formatInvestigationStatus(investigation.status)}
                        </div>
                        <div className="text-[#5F6368] mt-0.5">Priority: {investigation.priority}</div>
                      </div>
                      {canEditThisInv ? (
                        <select
                          aria-label="Update demonstration investigation state"
                          value={investigation.status}
                          onChange={(e) =>
                            updateInvestigationStatus(cost.id, e.target.value as InvestigationStatus)
                          }
                          className="text-xs border border-[#E2E5E8] rounded px-2.5 py-1.5 bg-white text-[#231F20]"
                        >
                          <option value="demo_open">Open (Demo)</option>
                          <option value="demo_in_review">In Review (Demo)</option>
                          <option value="demo_documented">Documented (Demo)</option>
                        </select>
                      ) : (
                        <span className="text-xs text-[#5F6368]">Read-only for current role</span>
                      )}
                    </div>
                  </div>
                )}

                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Supporting evidence ({evidenceList.length})</summary>
                  <div className="px-3 pb-3 space-y-2">
                  {evidenceList.length > 0 ? (
                    <div className="space-y-2">
                      {evidenceList.map((ev) => (
                        <div key={ev.id} className="p-3 border border-[#E2E5E8] rounded text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[#231F20] flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#5F6368]" />
                              {ev.title}
                            </span>
                            <ProvenanceText provenance={ev.provenance} />
                          </div>
                          <p className="text-[#5F6368]">{ev.summary}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#5F6368]">No additional demonstration evidence attached yet.</p>
                  )}
                  </div>
                </details>

                  {canSubmitCorrection && (
                    <div className="space-y-3 pt-2">
                      <form onSubmit={(e) => handleEvidenceSubmit(e, cost.id)} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#231F20]">Attach Supporting Evidence / Note</span>
                          <span className="text-[10px] text-[#5F6368]">Session attachment metadata</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={evidenceTitle}
                            onChange={(e) => setEvidenceTitle(e.target.value)}
                            placeholder="Evidence reference title"
                            className="col-span-2 text-xs border border-[#E2E5E8] rounded px-3 py-1.5 focus:outline-none focus:border-[#231F20]"
                          />
                          <select
                            aria-label="Evidence type"
                            value={evidenceSourceType}
                            onChange={(e) => setEvidenceSourceType(e.target.value as EvidenceSourceType)}
                            className="text-xs border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
                          >
                            <option value="note">Note</option>
                            <option value="reference">Reference</option>
                            <option value="pdf">PDF Metadata</option>
                            <option value="image">Image Metadata</option>
                            <option value="spreadsheet">Spreadsheet</option>
                          </select>
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              setEvidenceFileMeta({ name: f.name, size: f.size });
                              if (!evidenceTitle) setEvidenceTitle(f.name);
                            }
                          }}
                          className="text-[11px] text-[#5F6368]"
                        />
                        <textarea
                          rows={2}
                          value={evidenceSummary}
                          onChange={(e) => setEvidenceSummary(e.target.value)}
                          placeholder="Documented finding or attachment reference..."
                          className="w-full text-xs border border-[#E2E5E8] rounded px-3 py-2 focus:outline-none focus:border-[#231F20]"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] transition-colors cursor-pointer"
                          >
                            Record Evidence
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCorrectionForm((v) => !v)}
                            className="px-3 py-1.5 text-xs font-medium text-[#231F20] border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                          >
                            {showCorrectionForm ? 'Cancel Correction Request' : 'Request Correction Review'}
                          </button>
                        </div>
                      </form>

                      {showCorrectionForm && (
                        <form
                          onSubmit={(e) => handleCorrectionSubmit(e, cost.id, cost.amountCad)}
                          className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded space-y-2"
                        >
                          <div className="text-xs font-semibold text-[#231F20]">
                            Submit Correction Request (Requires Controller Approval)
                          </div>
                          <p className="text-[11px] text-[#5F6368]">
                            Original Appendix financial history cannot be overwritten. Requests are routed to Approvals.
                          </p>
                          <input
                            type="text"
                            value={correctionTitle}
                            onChange={(e) => setCorrectionTitle(e.target.value)}
                            placeholder="Proposed adjustment title"
                            className="w-full text-xs border border-[#E2E5E8] rounded px-3 py-1.5 bg-white"
                          />
                          <textarea
                            rows={2}
                            value={correctionRationale}
                            onChange={(e) => setCorrectionRationale(e.target.value)}
                            placeholder="Supporting rationale and audit reference..."
                            className="w-full text-xs border border-[#E2E5E8] rounded px-3 py-1.5 bg-white"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3326] transition-colors cursor-pointer"
                          >
                            Submit for Controller Approval
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Investigation history and financial thread</summary>
                  <div className="px-3 pb-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5F6368] flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-[#E53C2E]" />
                      <span>Financial Digital Thread</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        closeDrawer();
                        navigate('/investigations');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#E53C2E] hover:underline cursor-pointer"
                    >
                      <span>Open Investigations</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FinancialDigitalThreadView
                    recordId={cost.id}
                    compact
                    onNavigateAway={closeDrawer}
                  />
                  </div>
                </details>
              </>
            );
          })()}

          {drawerRecord.type === 'customs_entry' && (() => {
            const entry = drawerRecord.record;
            const expectedFee = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
            const variance = entry.brokerFeeChargedCad - expectedFee;
            const relatedFlags = ruleEvaluations.filter((r) => r.recordId === entry.id);
            const evidenceList = state.evidence.filter((ev) => ev.linkedRecordId === entry.id);

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E5E8]">
                  <ProvenanceText provenance={entry.provenance} sourceRef={entry.sourceRef} />
                  <span className="text-xs text-[#5F6368]">
                    HS Code: <span className="font-mono">{entry.hsCode}</span> (illustrative · broker confirmation required)
                  </span>
                </div>

                {/* One-Page Shipment Profile Route Strip */}
                <div className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#231F20]">One-Page Shipment Profile</span>
                    <span className="text-[#5F6368]">
                      {entry.direction === 'import' ? 'Inbound Import' : `Outbound Export (${entry.incoterm ?? 'Standard'})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[#231F20]">
                    <span className="px-2 py-1 bg-white border border-[#E2E5E8] rounded">{entry.originCountry}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#E53C2E]" />
                    <span className="px-2 py-1 bg-white border border-[#E2E5E8] rounded">{entry.destination}</span>
                    <span className="text-[#5F6368] ml-auto font-mono">Q3 2026</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Declared Goods Value</div>
                    <div className="text-lg font-semibold text-[#231F20] tabular-nums mt-0.5">
                      {formatMoney(entry.goodsValueCad)}
                    </div>
                    <div className="text-xs text-[#5F6368] mt-1">{entry.goods}</div>
                  </div>
                  <div className="p-3.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Total Duty & Tariff</div>
                    <div className="text-lg font-semibold text-[#231F20] tabular-nums mt-0.5">
                      {formatMoney(entry.totalDutyAndTariffCad)}
                    </div>
                    <div className="text-xs text-[#5F6368] mt-1">{entry.rateDescription}</div>
                  </div>
                </div>

                <div className="border border-[#E2E5E8] rounded divide-y divide-[#E2E5E8] text-xs">
                  <div className="px-3.5 py-2.5 flex justify-between">
                    <span className="text-[#5F6368]">Normal (MFN) Duty ({entry.mfnRatePct}%)</span>
                    <span className="font-mono font-medium tabular-nums">{formatMoney(entry.mfnDutyCad)}</span>
                  </div>
                  <div className="px-3.5 py-2.5 flex justify-between">
                    <span className="text-[#5F6368]">Additional Tariff ({entry.additionalTariffPct}%)</span>
                    <span className="font-mono font-medium tabular-nums">{formatMoney(entry.additionalTariffCad)}</span>
                  </div>
                  <div className="px-3.5 py-2.5 flex justify-between">
                    <span className="text-[#5F6368]">Export Duty ({entry.exportDutyPct}% {entry.incoterm ?? ''})</span>
                    <span className="font-mono font-medium tabular-nums">{formatMoney(entry.exportDutyCad)}</span>
                  </div>
                  <div className="px-3.5 py-2.5 flex justify-between">
                    <span className="text-[#5F6368]">Contractual Broker Fee (0.2% × value)</span>
                    <span className="font-mono font-medium tabular-nums">{formatMoney(expectedFee)}</span>
                  </div>
                  <div className="px-3.5 py-2.5 flex justify-between bg-[#F5F6F7]">
                    <span className="text-[#231F20] font-medium">Actual Broker Fee & Variance</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatMoney(entry.brokerFeeChargedCad)} (
                      <span className={variance > 0 ? 'text-[#DC2626]' : variance < 0 ? 'text-[#16A34A]' : 'text-[#5F6368]'}>
                        {variance > 0 ? `+${formatMoney(variance)} overcharge` : variance < 0 ? `${formatMoney(variance)} undercharge` : 'On contract'}
                      </span>
                      )
                    </span>
                  </div>
                </div>

                <div className="p-3.5 border border-[#E2E5E8] rounded text-xs space-y-1.5">
                  <div className="font-semibold text-[#231F20]">Trade Agreement & Origin Status</div>
                  <div className="flex justify-between text-[#5F6368]">
                    <span>Agreement Status:</span>
                    <span className="font-medium text-[#231F20]">{entry.tradeAgreementStatus.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between text-[#5F6368]">
                    <span>Origin Documentation:</span>
                    <span className="font-medium text-[#231F20]">{entry.originDocumentationStatus.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {evidenceList.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5F6368]">
                      Supporting Evidence ({evidenceList.length})
                    </h3>
                    {evidenceList.map((ev) => (
                      <div key={ev.id} className="p-3 border border-[#E2E5E8] rounded text-xs space-y-1">
                        <div className="font-medium text-[#231F20]">{ev.title}</div>
                        <p className="text-[#5F6368]">{ev.summary}</p>
                      </div>
                    ))}
                  </div>
                )}

                {relatedFlags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5F6368]">
                      Individual Rule Evaluations ({relatedFlags.length})
                    </h3>
                    {relatedFlags.map((flag) => (
                      <div key={flag.id} className="p-3 border border-[#E2E5E8] rounded bg-[#F5F6F7] text-xs space-y-1">
                        <div className="font-semibold text-[#231F20]">{flag.ruleCode}: {flag.summary}</div>
                        <p className="text-[#5F6368]">{flag.detail}</p>
                        <p className="text-[11px] text-[#5F6368]">{flag.nonFraudDisclaimer}</p>
                      </div>
                    ))}
                  </div>
                )}

                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Supporting evidence and financial thread</summary>
                  <div className="px-3 pb-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5F6368] flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-[#E53C2E]" />
                      <span>Financial Digital Thread</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        closeDrawer();
                        navigate('/opportunities');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#E53C2E] hover:underline cursor-pointer"
                    >
                      <span>View Cost Opportunities</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FinancialDigitalThreadView
                    recordId={entry.id}
                    compact
                    onNavigateAway={closeDrawer}
                  />
                  </div>
                </details>

                <div className="pt-2 border-t border-[#E2E5E8] flex flex-wrap justify-between items-center gap-2">
                  {canSimulate && (
                    <button
                      type="button"
                      onClick={() => sendEntriesToSimulator([entry.id])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] transition-colors cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Model in Tariff Simulator</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      closeDrawer();
                      navigate('/trade');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#E53C2E] hover:underline cursor-pointer ml-auto"
                  >
                    Open Shipments & Trade <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            );
          })()}

          {drawerRecord.type === 'walk_entry' && (() => {
            const entry = drawerRecord.record;
            const isEndpoint = entry.bucket === 'Start' || entry.bucket === 'End';
            const isMaterial = Math.abs(entry.amountCad) >= 1_000_000 && !isEndpoint;
            const linkedIr = entry.linkedIrregularCostId
              ? IRREGULAR_COSTS.find((c) => c.id === entry.linkedIrregularCostId)
              : undefined;

            return (
              <div className="space-y-4">
                <ProvenanceText provenance={entry.provenance} sourceRef={entry.sourceRef} />
                <div className="p-4 bg-[#F5F6F7] border border-[#E2E5E8] rounded space-y-1">
                  <div className="text-xs text-[#5F6368]">{drawerRecord.walkTitle}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums ${
                      isEndpoint
                        ? 'text-[#231F20]'
                        : entry.amountCad >= 0
                          ? 'text-[#16A34A]'
                          : 'text-[#DC2626]'
                    }`}
                  >
                    {formatMoney(entry.amountCad, { showSign: !isEndpoint })}
                  </div>
                  <div className="text-xs text-[#5F6368]">
                    Financial Category: <span className="font-medium text-[#231F20]">{entry.bucket}</span> · Direction:{' '}
                    {isEndpoint ? 'Bridge Endpoint' : entry.amountCad >= 0 ? 'Positive Contribution' : 'Adverse Cost / Negative Contribution'}
                  </div>
                </div>

                <div className="p-3.5 border border-[#E2E5E8] rounded text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[#231F20]">
                    {isMaterial ? (
                      <AlertCircle className="w-4 h-4 text-[#E53C2E]" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#5F6368]" />
                    )}
                    <span>
                      Rule 03 Materiality: {isMaterial ? 'Material Variance (≥ CAD 1,000,000)' : 'Below CAD 1,000,000 Threshold'}
                    </span>
                  </div>
                  <p className="text-[#5F6368] leading-relaxed">
                    {entry.supportingExplanation ??
                      (isMaterial
                        ? 'Leadership requires an explanation before close for every walk line with an absolute change of CAD 1 million or more.'
                        : 'Below the CAD 1 million walk materiality threshold.')}
                  </p>
                </div>

                <div className="p-3.5 border border-[#E2E5E8] rounded text-xs space-y-2">
                  <div className="font-semibold text-[#231F20]">Irregular Cost Relationship</div>
                  {linkedIr ? (
                    <>
                      <div className="text-[#5F6368]">
                        Relationship:{' '}
                        <span className="font-medium text-[#231F20]">
                          {entry.linkClassification === 'direct_appendix_link'
                            ? 'Direct Appendix Link'
                            : 'Contextual Bucket Link (YoY/QoQ baseline differs from standalone Q3 amount)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openDrawer({ type: 'irregular_cost', record: linkedIr })}
                        className="w-full text-left p-2.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded hover:border-[#231F20] flex items-center justify-between cursor-pointer"
                      >
                        <span>
                          <span className="font-mono font-semibold text-[#E53C2E] mr-2">{linkedIr.id}</span>
                          <span className="font-medium text-[#231F20]">{linkedIr.item}</span>
                        </span>
                        <span className="font-mono font-medium">{formatMoney(linkedIr.amountCad)}</span>
                      </button>
                    </>
                  ) : (
                    <p className="text-[#5F6368]">
                      Not independently linked to a single irregular cost line in the Appendix. (Per Appendix 2.3 note, items such as IR-03 through IR-07 sit within aggregate totals or prior-year comparatives.)
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {drawerRecord.type === 'rule_evaluation' && (() => {
            const flag = drawerRecord.record;
            return (
              <div className="space-y-4">
                <ProvenanceText provenance="derived_calculation" sourceRef={flag.ruleCode} />
                <div className="p-4 bg-[#F5F6F7] border border-[#E2E5E8] rounded space-y-2">
                  <div className="text-xs font-semibold text-[#E53C2E]">{flag.ruleCode}</div>
                  <div className="text-sm font-semibold text-[#231F20]">{flag.summary}</div>
                  <p className="text-xs text-[#5F6368]">{flag.detail}</p>
                  {flag.monetaryExposureCad !== undefined && (
                    <div className="text-xs font-medium text-[#231F20] tabular-nums pt-1">
                      Evaluated Exposure: {formatMoney(flag.monetaryExposureCad)}
                    </div>
                  )}
                </div>
                <p className="text-xs text-[#5F6368] border border-[#E2E5E8] rounded p-3">
                  {flag.nonFraudDisclaimer}
                </p>
              </div>
            );
          })()}

          {drawerRecord.type === 'uploaded_ledger' && (() => {
            const tx = drawerRecord.record;
            const evidenceList = state.evidence.filter((ev) => ev.linkedRecordId === tx.transactionId);
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E5E8]">
                  <ProvenanceText provenance="user_uploaded" sourceRef={`Batch ${tx.batchId.slice(-6)}`} />
                  <span className="text-xs font-mono text-[#16A34A] font-medium">Authorized & Committed</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Amount ({state.currency})</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                      {formatMoney(tx.amountCad)}
                    </div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">{tx.accountingPeriod} · {tx.postingDate}</div>
                  </div>
                  <div className="p-3 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">GL & Department</div>
                    <div className="text-sm font-semibold text-[#231F20]">{tx.glAccount}</div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">{tx.department} · {tx.regionName}</div>
                  </div>
                </div>
                <dl className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded text-xs">
                  {([
                    ['Description', tx.description || tx.expenseCategory],
                    ['Plant', tx.plant],
                    ['Supplier / Invoice', `${tx.supplierId || '—'} / ${tx.invoiceReference || '—'}`],
                    ['Approval Ref', tx.approvalReference || '—'],
                    ['Prepared By', tx.preparedBy || '—'],
                    ['Supporting Ref', tx.supportingReference || '—'],
                    ['Authorized At', new Date(tx.authorizedAtIso).toLocaleString()],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="px-3 py-2 grid grid-cols-3 gap-2">
                      <dt className="text-[#5F6368] font-medium">{k}</dt>
                      <dd className="col-span-2 text-[#231F20]">{v}</dd>
                    </div>
                  ))}
                </dl>
                {evidenceList.length > 0 && (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-[#231F20]">Supporting Evidence ({evidenceList.length})</div>
                    {evidenceList.map((ev) => (
                      <div key={ev.id} className="p-2.5 border border-[#E2E5E8] rounded bg-[#F5F6F7]">
                        <div className="font-medium text-[#231F20]">{ev.title}</div>
                        <div className="text-[#5F6368]">{ev.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Source events and financial thread</summary>
                  <div className="px-3 pb-3 space-y-2">
                  <FinancialDigitalThreadView
                    recordId={tx.transactionId}
                    compact
                    onNavigateAway={closeDrawer}
                  />
                  </div>
                </details>
              </div>
            );
          })()}

          {drawerRecord.type === 'uploaded_customs' && (() => {
            const rec = drawerRecord.record;
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E5E8]">
                  <ProvenanceText provenance="user_uploaded" sourceRef={`Batch ${rec.batchId.slice(-6)}`} />
                  <span className="text-xs font-mono text-[#16A34A] font-medium">Authorized & Committed</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Declared Value</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                      {formatMoney(rec.goodsValueCad)}
                    </div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">{rec.originCountry} → {rec.destination}</div>
                  </div>
                  <div className="p-3 bg-[#F5F6F7] border border-[#E2E5E8] rounded">
                    <div className="text-xs text-[#5F6368]">Duty & Broker Fee</div>
                    <div className="text-lg font-semibold font-mono tabular-nums text-[#231F20]">
                      {formatMoney(rec.actualDutyCad + rec.actualBrokerFeeCad)}
                    </div>
                    <div className="text-[11px] text-[#5F6368] mt-0.5">
                      Broker Var: {rec.brokerVarianceCad > 0 ? `+${formatMoney(rec.brokerVarianceCad)}` : formatMoney(rec.brokerVarianceCad)}
                    </div>
                  </div>
                </div>
                <dl className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded text-xs">
                  {([
                    ['Goods / HS Code', `${rec.goodsDescription} (${rec.hsCode || 'N/A'})`],
                    ['Shipment Date / Period', `${rec.shipmentDate} · ${rec.accountingPeriod}`],
                    ['Rates (MFN / Extra)', `${rec.baseDutyRatePct}% / ${rec.additionalTariffRatePct}%`],
                    ['Expected Broker (0.2%)', formatMoney(rec.expectedBrokerFeeCad)],
                    ['Trade Agreement / Cert', `${rec.tradeAgreement} (${rec.originCertificateReference || 'None'})`],
                    ['Approval / Shipment Ref', `${rec.approvalReference || '—'} / ${rec.shipmentReference || '—'}`],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="px-3 py-2 grid grid-cols-3 gap-2">
                      <dt className="text-[#5F6368] font-medium">{k}</dt>
                      <dd className="col-span-2 text-[#231F20]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <details className="border border-[#E2E5E8] rounded">
                  <summary className="px-3 py-2 text-xs font-medium text-[#231F20] cursor-pointer">Source events and financial thread</summary>
                  <div className="px-3 pb-3 space-y-2">
                  <FinancialDigitalThreadView
                    recordId={rec.entryId}
                    compact
                    onNavigateAway={closeDrawer}
                  />
                  </div>
                </details>
              </div>
            );
          })()}
        </div>
      </aside>
    </div>
  );
};
