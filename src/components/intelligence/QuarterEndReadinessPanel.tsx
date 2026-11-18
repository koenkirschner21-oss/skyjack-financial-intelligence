import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { computeQuarterEndReadiness } from '../../domain/readinessEngine';
import { requestAiQuarterEndBriefing } from '../../services/aiService';
import { AiQuarterEndBriefing } from '../../types/domain';

export const QuarterEndReadinessPanel: React.FC = () => {
  const { state, activeUser, navigate, hasPermission, recordAiAuditEvent, openReportStudioWithPreset } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<AiQuarterEndBriefing | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const snapshot = useMemo(
    () => computeQuarterEndReadiness(state, activeUser, state.selectedQuarterId, state.currency),
    [state, activeUser]
  );

  const canGenerateBriefing = hasPermission('approve_material_correction') || hasPermission('manage_investigations');

  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    setBriefingError(null);
    const res = await requestAiQuarterEndBriefing(snapshot);
    setLoadingBriefing(false);
    if (!res.ok) {
      setBriefingError(res.userMessage);
      return;
    }
    setBriefing(res.briefing);
    recordAiAuditEvent(
      'ai_briefing_generated',
      `Generated AI Quarter-End Close Briefing for ${snapshot.quarterId} (${res.briefing.modelName}; ${snapshot.totalBlockingCount} open governance items).`,
      snapshot.quarterId
    );
  };

  return (
    <section
      aria-label="Quarter-End Close Readiness"
      className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-[#E53C2E]" />
            <h2 className="text-sm font-semibold text-[#231F20]">
              Quarter-End Readiness ({snapshot.quarterId})
            </h2>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded border ${
                snapshot.totalBlockingCount === 0
                  ? 'text-[#16A34A] bg-emerald-50 border-emerald-200'
                  : 'text-amber-800 bg-amber-50 border-amber-300'
              }`}
            >
              {snapshot.totalBlockingCount === 0
                ? '0 Open Governance Blockers'
                : `${snapshot.totalBlockingCount} Open Governance Item(s)`}
            </span>
          </div>
          <p className="text-xs text-[#5F6368] mt-1">
            Transparent deterministic close indicators computed from repository records, approvals, quarantined uploads, and evidence gaps (no arbitrary AI score).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('generate_reports') && (
            <button
              type="button"
              onClick={() =>
                openReportStudioWithPreset({
                  templateId: 'quarter_end_close_report',
                  reportingPeriod: snapshot.quarterId,
                  includedSections: [
                    'str_quarter_end_readiness',
                    'gov_outstanding_approvals',
                    'gov_material_variance_status',
                    'gov_gateway_batches',
                    'gov_quarantined_summary',
                    'gov_evidence_requirements',
                    'fin_income_statement',
                  ],
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#E53C2E]" />
              <span>Quarter-End Report</span>
            </button>
          )}
          {canGenerateBriefing && (
            <button
              type="button"
              disabled={loadingBriefing}
              onClick={handleGenerateBriefing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {loadingBriefing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
              )}
              <span>{loadingBriefing ? 'Synthesizing Briefing…' : 'AI Quarter-End Briefing'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {snapshot.indicators.map((ind) => {
          const isExpanded = expandedId === ind.id;
          const badgeCls =
            ind.status === 'ready'
              ? 'text-[#16A34A] bg-emerald-50 border-emerald-200'
              : ind.status === 'action_blocked'
                ? 'text-[#DC2626] bg-red-50 border-red-200'
                : 'text-amber-800 bg-amber-50 border-amber-300';

          return (
            <div
              key={ind.id}
              className="border border-[#E2E5E8] rounded bg-[#F5F6F7]/60 p-3 flex flex-col justify-between space-y-2"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-[#231F20]">{ind.label}</div>
                  <span className={`px-1.5 py-0.5 text-[10px] font-mono border rounded shrink-0 ${badgeCls}`}>
                    {ind.unresolvedCount === 0 ? 'Clear' : `${ind.unresolvedCount} Open`}
                  </span>
                </div>
                <p className="text-[11px] text-[#5F6368] mt-1 leading-snug">{ind.definition}</p>
              </div>

              <div className="pt-2 border-t border-[#E2E5E8] flex items-center justify-between text-[11px]">
                <span className="font-mono text-[#231F20]">
                  {ind.resolvedCount}/{ind.totalCount} cleared
                </span>
                <div className="flex items-center gap-2">
                  {ind.unresolvedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : ind.id)}
                      className="text-[#5F6368] hover:text-[#231F20] underline cursor-pointer"
                    >
                      {isExpanded ? 'Hide items' : `View (${ind.unresolvedItems.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(ind.targetRoute)}
                    className="inline-flex items-center gap-0.5 text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    Open <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isExpanded && ind.unresolvedItems.length > 0 && (
                <ul className="pt-2 border-t border-[#E2E5E8] space-y-1 text-[11px]">
                  {ind.unresolvedItems.map((u) => (
                    <li key={u.id} className="text-[#231F20] leading-snug">
                      <span className="font-medium">• {u.label}</span>
                      {u.detail && <span className="text-[#5F6368]"> — {u.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {snapshot.dataAvailabilityNotes.length > 0 && (
        <div className="text-[11px] text-[#5F6368] bg-[#F5F6F7] border border-[#E2E5E8] rounded px-3 py-2 space-y-0.5">
          {snapshot.dataAvailabilityNotes.map((n) => (
            <div key={n}>• {n}</div>
          ))}
        </div>
      )}

      {briefingError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">AI Briefing Unavailable</div>
            <p className="text-[11px] mt-0.5">{briefingError}</p>
          </div>
        </div>
      )}

      {briefing && (
        <div className="p-4 bg-[#F5F6F7] border border-[#E2E5E8] rounded space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5E8] pb-2">
            <div className="font-semibold text-[#231F20] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
              <span>Controller Quarter-End Briefing · {briefing.executiveHeadline}</span>
            </div>
            <span className="text-[10px] font-mono text-[#5F6368]">
              Model: {briefing.modelName} · {new Date(briefing.generatedAtIso).toLocaleTimeString()}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white border border-[#E2E5E8] rounded p-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#16A34A] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Established Repository Facts
              </div>
              <ul className="space-y-1 text-[11px] text-[#231F20]">
                {briefing.establishedFacts.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-[#E2E5E8] rounded p-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#DC2626]">
                Blocking Close Issues
              </div>
              <ul className="space-y-1 text-[11px] text-[#231F20]">
                {briefing.blockingIssues.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-[#E2E5E8] rounded p-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">
                AI Recommendations (Advisory)
              </div>
              <ul className="space-y-1 text-[11px] text-[#231F20]">
                {briefing.recommendedActions.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="text-[10px] text-[#5F6368]">{briefing.limitationsAndScopeNote}</div>
        </div>
      )}
    </section>
  );
};
