import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  StopCircle,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  executeAskSkyjackQuery,
  executeDeterministicAskFallback,
  fetchAiStatus,
} from '../../services/aiService';
import { AskSkyjackResponse } from '../../types/domain';

interface ConversationTurn {
  id: string;
  question: string;
  response?: AskSkyjackResponse;
  errorMessage?: string;
}

const SUGGESTED_QUESTIONS = [
  'Why did operating earnings change in Q3 2026?',
  'Which financial costs require investigation?',
];

export const AskSkyjackModal: React.FC = () => {
  const {
    state,
    activeUser,
    askModalOpen,
    setAskModalOpen,
    askPromptSeed,
    openRecordById,
    navigate,
    recordAiAuditEvent,
  } = useApp();

  const [questionInput, setQuestionInput] = useState('');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiStatusMode, setAiStatusMode] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!askModalOpen || !askPromptSeed) return;
    setQuestionInput(askPromptSeed);
  }, [askModalOpen, askPromptSeed]);

  useEffect(() => {
    if (!askModalOpen) return;
    fetchAiStatus().then((st) => setAiStatusMode(st.mode));
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [askModalOpen]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  if (!askModalOpen) return null;

  const submitQuestion = async (rawQ: string) => {
    const q = rawQ.trim();
    if (!q || loading) return;

    const turnId = `turn-${Date.now()}`;
    setQuestionInput('');

    // Honest deterministic fallback only when server explicitly reports missing GEMINI_API_KEY
    if (aiStatusMode === 'unavailable_no_key') {
      const detResp = executeDeterministicAskFallback(q, state, activeUser);
      setTurns((prev) => [...prev, { id: turnId, question: q, response: detResp }]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setTurns((prev) => [...prev, { id: turnId, question: q }]);

    const history = turns.flatMap((t) => {
      const msgs: Array<{ role: 'user' | 'assistant'; text: string }> = [
        { role: 'user', text: t.question },
      ];
      if (t.response?.narrative) {
        msgs.push({ role: 'assistant', text: t.response.narrative });
      }
      return msgs;
    });

    const result = await executeAskSkyjackQuery({
      question: q,
      conversationHistory: history,
      state,
      user: activeUser,
      signal: controller.signal,
    });

    setLoading(false);
    abortRef.current = null;

    if (!result.ok) {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, errorMessage: result.userMessage } : t))
      );
      return;
    }

    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, response: result } : t))
    );
    recordAiAuditEvent(
      'ai_query_executed',
      `Ask SKYJACK query (${result.modelName}): "${q.slice(0, 90)}"`,
      result.sourceCitations[0]?.recordId
    );
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const handleReset = () => {
    handleCancel();
    setTurns([]);
    setQuestionInput('');
  };

  const handleRetryTurn = async (turnId: string, q: string) => {
    if (loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, errorMessage: undefined } : t))
    );

    const history = turns
      .filter((t) => t.id !== turnId && t.response?.narrative)
      .flatMap((t) => [
        { role: 'user' as const, text: t.question },
        { role: 'assistant' as const, text: t.response!.narrative },
      ]);

    const result = await executeAskSkyjackQuery({
      question: q,
      conversationHistory: history,
      state,
      user: activeUser,
      signal: controller.signal,
    });

    setLoading(false);
    abortRef.current = null;

    if (!result.ok) {
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, errorMessage: result.userMessage } : t))
      );
      return;
    }

    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, response: result } : t)));
    recordAiAuditEvent(
      'ai_query_executed',
      `Ask SKYJACK query (${result.modelName}): "${q.slice(0, 90)}"`,
      result.sourceCitations[0]?.recordId
    );
  };

  const handleRunDeterministicOnTurn = (turnId: string, q: string) => {
    const det = executeDeterministicAskFallback(q, state, activeUser);
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, errorMessage: undefined, response: det } : t))
    );
  };

  const handleCitationClick = (recordId: string, route?: Parameters<typeof navigate>[0]) => {
    const opened = openRecordById(recordId);
    if (opened) {
      setAskModalOpen(false);
      return;
    }
    if (route) {
      setAskModalOpen(false);
      navigate(route);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#231F20]/45 flex items-start justify-center pt-8 sm:pt-14 px-3 sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ask SKYJACK"
    >
      <div className="fixed inset-0" onClick={() => setAskModalOpen(false)} />

      <div className="relative z-10 w-full max-w-3xl max-h-[82vh] bg-white border border-[#E2E5E8] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Clean Enterprise Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#E2E5E8] bg-[#231F20] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[#E53C2E]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">Ask SKYJACK</h2>
              <p className="text-[11px] text-[#B8BABC] truncate">
                {activeUser.name} · {state.selectedQuarterId} · {state.currency}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                title="Start new conversation"
                aria-label="Reset conversation"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-[#C8CACC] hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAskModalOpen(false)}
              className="p-1.5 text-[#C8CACC] hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close Ask SKYJACK"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conversational Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F8F9FA]">
          {turns.length === 0 && (
            <div className="py-6 space-y-5 max-w-xl mx-auto">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-[#231F20]">
                  How can I help inspect your financial &amp; trade data?
                </p>
                <p className="text-xs text-[#5F6368] leading-relaxed">
                  Ask questions about quarterly results, flagged irregular costs, customs entries, tariff scenarios, approvals, or uploaded batches within your workspace permissions.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-medium text-[#5F6368]">Suggested questions</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(askPromptSeed ? [askPromptSeed, ...SUGGESTED_QUESTIONS] : SUGGESTED_QUESTIONS).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => submitQuestion(q)}
                      className="text-left p-3 text-xs bg-white border border-[#E2E5E8] rounded-md hover:border-[#231F20] hover:shadow-xs transition-all flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-[#231F20] font-medium leading-snug">{q}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#E53C2E] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              {/* User Bubble (Right Aligned) */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-[#231F20] text-white text-xs sm:text-[13px] leading-relaxed px-3.5 py-2.5 rounded-lg rounded-br-xs shadow-xs">
                  {turn.question}
                </div>
              </div>

              {/* Assistant Error Bubble */}
              {turn.errorMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[92%] p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Unable to complete AI response</div>
                        <p className="text-xs text-amber-900 mt-0.5">{turn.errorMessage}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRetryTurn(turn.id, turn.question)}
                        className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-amber-300 rounded hover:bg-amber-100 cursor-pointer"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRunDeterministicOnTurn(turn.id, turn.question)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
                      >
                        Run Verified Data Lookup
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Assistant Bubble (Left Aligned) */}
              {turn.response && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[95%] bg-white border border-[#E2E5E8] rounded-lg rounded-bl-xs p-4 space-y-3.5 shadow-2xs">
                    <p className="text-xs sm:text-[13px] text-[#231F20] leading-relaxed whitespace-pre-line">
                      {turn.response.narrative}
                    </p>

                    {turn.response.dataAvailabilityNote && (
                      <div className="p-2.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded text-[11px] text-[#5F6368]">
                        {turn.response.dataAvailabilityNote}
                      </div>
                    )}

                    {/* KPI Highlights */}
                    {turn.response.kpiHighlights.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {turn.response.kpiHighlights.map((kpi, idx) => (
                          <div key={idx} className="p-2.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md">
                            <div className="text-[11px] text-[#5F6368]">{kpi.label}</div>
                            <div className="text-sm sm:text-base font-semibold text-[#231F20] tabular-nums mt-0.5">
                              {kpi.valueFormatted}
                            </div>
                            {kpi.contextNote && (
                              <div className="text-[11px] text-[#5F6368] mt-0.5">{kpi.contextNote}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Data Table */}
                    {turn.response.tableColumns.length > 0 && turn.response.tableRows.length > 0 && (
                      <div className="overflow-x-auto border border-[#E2E5E8] rounded-md">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[11px] text-[#5F6368]">
                            <tr>
                              {turn.response.tableColumns.map((col, idx) => (
                                <th key={idx} className="px-3 py-2 font-semibold whitespace-nowrap">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E5E8]">
                            {turn.response.tableRows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-[#F8F9FA]">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-3 py-1.5 text-[#231F20] tabular-nums">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Grounded Chart Comparison */}
                    {turn.response.suggestedChart && turn.response.suggestedChart.bars.length > 0 && (
                      <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md space-y-2">
                        <div className="text-[11px] font-semibold text-[#231F20] flex items-center gap-1.5">
                          <BarChart2 className="w-3.5 h-3.5 text-[#E53C2E]" />
                          <span>{turn.response.suggestedChart.title}</span>
                        </div>
                        <div className="space-y-1.5">
                          {(() => {
                            const maxAbs = Math.max(
                              ...turn.response!.suggestedChart!.bars.map((b) => Math.abs(b.value)),
                              1
                            );
                            return turn.response!.suggestedChart!.bars.map((bar) => (
                              <div key={bar.label} className="flex items-center gap-2 text-[11px]">
                                <span className="w-20 font-medium text-[#231F20] shrink-0">{bar.label}</span>
                                <div className="flex-1 bg-white border border-[#E2E5E8] rounded h-4 overflow-hidden">
                                  <div
                                    className={`h-full ${bar.highlight ? 'bg-[#E53C2E]' : 'bg-[#7E8082]'}`}
                                    style={{
                                      width: `${Math.max(4, Math.round((Math.abs(bar.value) / maxAbs) * 100))}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-24 text-right font-mono tabular-nums text-[#231F20]">
                                  {bar.formattedValue}
                                </span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Related Investigations */}
                    {turn.response.investigationSummaries.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-[#5F6368]">Related Investigations</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {turn.response.investigationSummaries.map((inv) => (
                            <div key={inv.id} className="p-2.5 border border-[#E2E5E8] rounded-md text-[11px]">
                              <div className="flex items-center justify-between gap-2 font-semibold text-[#231F20]">
                                <span className="truncate">{inv.title}</span>
                                <span className="font-mono text-[#E53C2E] shrink-0">{inv.exposureFormatted}</span>
                              </div>
                              <div className="text-[#5F6368] mt-0.5 line-clamp-2">
                                {inv.status} · {inv.note}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Citations & Next Route Actions */}
                    {(turn.response.sourceCitations.length > 0 || turn.response.suggestedNextActions.length > 0) && (
                      <div className="pt-2.5 border-t border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {turn.response.sourceCitations.length > 0 && (
                            <span className="text-[11px] text-[#5F6368]">Records:</span>
                          )}
                          {turn.response.sourceCitations.map((cit) => (
                            <button
                              key={cit.recordId}
                              type="button"
                              onClick={() => handleCitationClick(cit.recordId, cit.route)}
                              className="px-2 py-0.5 text-[11px] font-mono bg-[#F5F6F7] border border-[#E2E5E8] rounded hover:border-[#231F20] text-[#231F20] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>{cit.recordId}</span>
                              <ArrowUpRight className="w-3 h-3 text-[#E53C2E]" />
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {turn.response.suggestedNextActions.map((act, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (act.route) {
                                  setAskModalOpen(false);
                                  navigate(act.route);
                                }
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-ups */}
                    {turn.response.followUpQuestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {turn.response.followUpQuestions.slice(0, 2).map((fq) => (
                          <button
                            key={fq}
                            type="button"
                            onClick={() => submitQuestion(fq)}
                            className="px-2.5 py-1 text-[11px] text-[#5F6368] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md hover:border-[#231F20] hover:text-[#231F20] transition-colors cursor-pointer"
                          >
                            {fq}
                          </button>
                        ))}
                      </div>
                    )}

                    {turn.response.mode === 'deterministic_fallback' && turn.response.groundingBoundaryNote && (
                      <div className="text-[11px] text-[#7E8082]">{turn.response.groundingBoundaryNote}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="p-3.5 border border-[#E2E5E8] rounded-lg bg-white flex items-center justify-between gap-4 text-xs shadow-2xs">
                <span className="flex items-center gap-2 text-[#231F20]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#E53C2E]" />
                  <span>Analyzing workspace financial &amp; governance records…</span>
                </span>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#DC2626] bg-white border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Clean Composer Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuestion(questionInput);
          }}
          className="p-3.5 border-t border-[#E2E5E8] bg-white flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="Ask a question about earnings, flagged costs, customs, approvals, or uploads..."
            className="flex-1 min-w-0 px-3 py-2 text-xs sm:text-[13px] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md focus:bg-white focus:outline-none focus:border-[#231F20]"
          />
          <button
            type="submit"
            disabled={loading || !questionInput.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#E53C2E] rounded-md hover:bg-[#CC3326] disabled:opacity-45 cursor-pointer transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
