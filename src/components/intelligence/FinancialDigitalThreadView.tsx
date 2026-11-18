import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  Link2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { buildFinancialDigitalThread } from '../../domain/digitalThreadBuilder';
import { DigitalThreadNode, ThreadLinkNature } from '../../types/domain';

const LINK_NATURE_META: Record<
  ThreadLinkNature,
  { label: string; textCls: string; borderCls: string; bgCls: string }
> = {
  direct_source: {
    label: 'Direct Source Link',
    textCls: 'text-[#16A34A]',
    borderCls: 'border-[#E2E5E8]',
    bgCls: 'bg-white',
  },
  contextual: {
    label: 'Contextual Association',
    textCls: 'text-[#1D4ED8]',
    borderCls: 'border-[#E2E5E8]',
    bgCls: 'bg-white',
  },
  demonstration_workflow: {
    label: 'Workflow Record',
    textCls: 'text-[#231F20]',
    borderCls: 'border-[#E2E5E8]',
    bgCls: 'bg-white',
  },
  potential_unverified: {
    label: 'Unverified / Potential',
    textCls: 'text-[#B45309]',
    borderCls: 'border-amber-300 border-dashed',
    bgCls: 'bg-amber-50/40',
  },
  missing_information: {
    label: 'Missing / Unverified Gap',
    textCls: 'text-[#DC2626]',
    borderCls: 'border-red-300 border-dashed',
    bgCls: 'bg-red-50/40',
  },
};

const STAGE_DEFINITIONS: Array<{
  lane: 1 | 2 | 3 | 4;
  stepNum: string;
  title: string;
  subtitle: string;
}> = [
  {
    lane: 1,
    stepNum: '01',
    title: 'Source Event',
    subtitle: 'Originating cost, shipment, or upload',
  },
  {
    lane: 2,
    stepNum: '02',
    title: 'Ledger / Shipment',
    subtitle: 'Posting, walk bucket, duty, or batch',
  },
  {
    lane: 3,
    stepNum: '03',
    title: 'Evidence & Investigation',
    subtitle: 'Case review, documents, and gaps',
  },
  {
    lane: 4,
    stepNum: '04',
    title: 'Governance & Resolution',
    subtitle: 'Approvals, opportunities, and audit',
  },
];

interface FinancialDigitalThreadViewProps {
  recordId: string;
  compact?: boolean;
  onNavigateAway?: () => void;
  onOpenEvidenceTab?: () => void;
}

export const FinancialDigitalThreadView: React.FC<FinancialDigitalThreadViewProps> = ({
  recordId,
  compact = false,
  onNavigateAway,
  onOpenEvidenceTab,
}) => {
  const { state, activeUser, openRecordById, navigate, formatMoney } = useApp();
  const [mode, setMode] = useState<'graph' | 'timeline'>('graph');
  const [focusedLane, setFocusedLane] = useState<1 | 2 | 3 | 4 | 'all'>('all');
  const [collapsedLanes, setCollapsedLanes] = useState<Record<number, boolean>>({});

  const thread = useMemo(
    () => buildFinancialDigitalThread(recordId, state, activeUser, state.currency),
    [recordId, state, activeUser]
  );

  const handleNodeClick = (node: DigitalThreadNode) => {
    if (node.kind === 'missing_gap' && onOpenEvidenceTab) {
      onOpenEvidenceTab();
      return;
    }
    if (node.clickableRecordId) {
      const opened = openRecordById(node.clickableRecordId);
      if (opened) return;
    }
    if (node.clickableRoute) {
      onNavigateAway?.();
      navigate(node.clickableRoute);
    }
  };

  const toggleLaneCollapse = (lane: number) => {
    setCollapsedLanes((prev) => ({ ...prev, [lane]: !prev[lane] }));
  };

  if (thread.nodes.length === 0) {
    return (
      <div className="p-4 border border-[#E2E5E8] rounded bg-[#F8F9FA] text-xs text-[#5F6368]">
        No relationship thread available for identifier <span className="font-mono">{recordId}</span>.
      </div>
    );
  }

  const stageSummaries = STAGE_DEFINITIONS.map((stage) => {
    const laneNodes = thread.nodes.filter((n) => n.lane === stage.lane);
    const hasMissing = laneNodes.some((n) => n.linkNature === 'missing_information');
    const hasUnverified = laneNodes.some((n) => n.linkNature === 'potential_unverified');
    const hasDirect = laneNodes.some((n) => n.linkNature === 'direct_source');
    return {
      ...stage,
      nodes: laneNodes,
      hasMissing,
      hasUnverified,
      hasDirect,
    };
  });

  const visibleStages =
    focusedLane === 'all'
      ? stageSummaries
      : stageSummaries.filter((s) => s.lane === focusedLane);

  return (
    <div className="space-y-4">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#231F20] flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-[#E53C2E] shrink-0" />
            <span>Financial Digital Thread · {thread.rootId}</span>
          </div>
          <p className="text-[11px] text-[#5F6368] mt-0.5 leading-snug">{thread.rootSummary}</p>
        </div>

        <div className="inline-flex border border-[#E2E5E8] rounded bg-[#F5F6F7] p-0.5 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => setMode('graph')}
            className={`px-2.5 py-1 rounded inline-flex items-center gap-1 font-medium whitespace-nowrap cursor-pointer transition-colors ${
              mode === 'graph'
                ? 'bg-white text-[#231F20] border border-[#E2E5E8]'
                : 'text-[#5F6368] hover:text-[#231F20] border border-transparent'
            }`}
          >
            <Link2 className="w-3 h-3" />
            <span>Connected Sequence</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('timeline')}
            className={`px-2.5 py-1 rounded inline-flex items-center gap-1 font-medium whitespace-nowrap cursor-pointer transition-colors ${
              mode === 'timeline'
                ? 'bg-white text-[#231F20] border border-[#E2E5E8]'
                : 'text-[#5F6368] hover:text-[#231F20] border border-transparent'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Chronological ({thread.timeline.length})</span>
          </button>
        </div>
      </div>

      {/* Mode A: Connected 4-Stage Visual Sequence */}
      {mode === 'graph' && (
        <div className="space-y-4">
          {/* Desktop Horizontal Connected Sequence Stepper */}
          {!compact && (
            <div className="hidden md:block">
              <div className="flex items-stretch gap-2">
                {stageSummaries.map((stage, idx) => {
                  const isFocused = focusedLane === stage.lane;
                  const statusLabel = stage.hasMissing
                    ? 'Gap / Missing'
                    : stage.hasUnverified
                      ? 'Unverified'
                      : stage.nodes.length === 0
                        ? 'No Links'
                        : stage.hasDirect
                          ? 'Direct Link'
                          : 'Workflow';
                  const statusTextCls = stage.hasMissing
                    ? 'text-[#DC2626]'
                    : stage.hasUnverified
                      ? 'text-[#B45309]'
                      : stage.nodes.length === 0
                        ? 'text-[#7E8082]'
                        : stage.hasDirect
                          ? 'text-[#16A34A]'
                          : 'text-[#5F6368]';

                  return (
                    <React.Fragment key={stage.lane}>
                      <button
                        type="button"
                        onClick={() =>
                          setFocusedLane((prev) => (prev === stage.lane ? 'all' : stage.lane))
                        }
                        className={`flex-1 min-w-0 text-left p-3 rounded border transition-colors cursor-pointer ${
                          isFocused
                            ? 'bg-[#FDF2F1] border-[#E53C2E]'
                            : 'bg-[#F8F9FA] border-[#E2E5E8] hover:border-[#231F20]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="font-mono font-semibold text-[#5F6368]">
                            Stage {stage.stepNum}
                          </span>
                          <span className={`font-medium ${statusTextCls}`}>{statusLabel}</span>
                        </div>
                        <div className="text-xs font-semibold text-[#231F20] mt-1 leading-snug">
                          {stage.title}
                        </div>
                        <div className="text-[11px] text-[#5F6368] mt-1 font-mono tabular-nums">
                          {stage.nodes.length} {stage.nodes.length === 1 ? 'record' : 'records'}
                        </div>
                      </button>

                      {idx < stageSummaries.length - 1 && (
                        <div
                          className="flex items-center justify-center shrink-0 text-[#9AA0A6]"
                          aria-hidden="true"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {focusedLane !== 'all' && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-[#5F6368]">
                  <span>
                    Showing Stage 0{focusedLane} supporting records.
                  </span>
                  <button
                    type="button"
                    onClick={() => setFocusedLane('all')}
                    className="font-medium text-[#E53C2E] hover:underline cursor-pointer"
                  >
                    Show all 4 stages
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Stage Supporting Records: Vertical Connected Progression (responsive & readable) */}
          <div className="space-y-3">
            {visibleStages.map((stage, idx) => {
              const isCollapsed = Boolean(collapsedLanes[stage.lane]) && focusedLane === 'all';
              const showVerticalConnector =
                (compact || focusedLane === 'all') && idx < visibleStages.length - 1;

              return (
                <div key={stage.lane} className="relative">
                  <div className="border border-[#E2E5E8] rounded-md bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleLaneCollapse(stage.lane)}
                      className="w-full px-3.5 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2 text-left hover:bg-[#F0F1F3] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-[#5F6368] shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#5F6368] shrink-0" />
                        )}
                        <span className="font-mono text-[11px] font-semibold text-[#E53C2E] shrink-0">
                          {stage.stepNum}
                        </span>
                        <span className="text-xs font-semibold text-[#231F20]">
                          {stage.title}
                        </span>
                        <span className="text-[11px] text-[#5F6368] hidden sm:inline">
                          — {stage.subtitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] shrink-0">
                        {stage.hasMissing && (
                          <span className="font-medium text-[#DC2626]">Missing Gap</span>
                        )}
                        {!stage.hasMissing && stage.hasUnverified && (
                          <span className="font-medium text-[#B45309]">Unverified Link</span>
                        )}
                        <span className="font-mono text-[#5F6368] tabular-nums">
                          {stage.nodes.length} {stage.nodes.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="p-3">
                        {stage.nodes.length === 0 ? (
                          <div className="p-3 border border-dashed border-[#E2E5E8] rounded text-[11px] text-[#5F6368]">
                            No linked entities recorded in this stage.
                          </div>
                        ) : (
                          <div
                            className={`grid gap-2.5 ${
                              compact || stage.nodes.length === 1
                                ? 'grid-cols-1'
                                : 'grid-cols-1 md:grid-cols-2'
                            }`}
                          >
                            {stage.nodes.map((node) => {
                              const meta = LINK_NATURE_META[node.linkNature];
                              const interactive = Boolean(
                                node.clickableRecordId ||
                                  node.clickableRoute ||
                                  (node.kind === 'missing_gap' && onOpenEvidenceTab)
                              );
                              return (
                                <div
                                  key={node.id}
                                  onClick={() => (interactive ? handleNodeClick(node) : undefined)}
                                  className={`p-3 border rounded text-xs space-y-1.5 ${meta.borderCls} ${meta.bgCls} ${
                                    interactive
                                      ? 'hover:border-[#231F20] cursor-pointer transition-colors'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className={`font-semibold inline-flex items-center gap-1 ${meta.textCls}`}>
                                      {node.linkNature === 'direct_source' && (
                                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                                      )}
                                      {node.linkNature === 'potential_unverified' && (
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                      )}
                                      {node.linkNature === 'missing_information' && (
                                        <AlertCircle className="w-3 h-3 shrink-0" />
                                      )}
                                      <span>{meta.label}</span>
                                    </span>
                                    {interactive && (
                                      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#5F6368] shrink-0">
                                        <span>
                                          {node.kind === 'missing_gap' && onOpenEvidenceTab
                                            ? 'Add Evidence'
                                            : 'Open'}
                                        </span>
                                        <ArrowUpRight className="w-3 h-3" />
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-semibold text-[#231F20] leading-snug">
                                    {node.label}
                                  </div>
                                  <div className="text-[11px] text-[#5F6368] leading-relaxed">
                                    {node.sublabel}
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#E2E5E8]/80 text-[11px] text-[#5F6368]">
                                    <span className="font-mono">{node.provenanceLabel}</span>
                                    {node.amountCad !== undefined && (
                                      <span className="font-mono font-semibold text-[#231F20] tabular-nums">
                                        {formatMoney(node.amountCad)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {showVerticalConnector && (
                    <div
                      className={`pl-5 py-1 ${compact ? 'flex' : 'flex md:hidden'} items-center gap-1.5 text-[10px] text-[#7E8082]`}
                      aria-hidden="true"
                    >
                      <span className="inline-block w-px h-3 bg-[#D4D8DD]" />
                      <span>Next stage</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode B: Chronological Event Timeline */}
      {mode === 'timeline' && (
        <div className="border border-[#E2E5E8] rounded-md bg-white divide-y divide-[#E2E5E8]">
          {thread.timeline.map((ev) => {
            const meta = LINK_NATURE_META[ev.linkNature];
            return (
              <div
                key={ev.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-[11px] font-semibold text-[#231F20]">
                      {ev.timestampLabel}
                    </span>
                    <span className="text-[#D4D8DD]">·</span>
                    <span className="font-semibold text-[#231F20]">{ev.title}</span>
                    <span className="text-[#D4D8DD]">·</span>
                    <span className={`text-[11px] font-medium ${meta.textCls}`}>{meta.label}</span>
                  </div>
                  <p className="text-[11px] text-[#5F6368] leading-relaxed">{ev.detail}</p>
                  <div className="text-[10px] text-[#7E8082]">
                    Source / Actor: {ev.actorOrSource}
                  </div>
                </div>
                {ev.clickableRecordId && (
                  <button
                    type="button"
                    onClick={() => openRecordById(ev.clickableRecordId!)}
                    className="text-[11px] font-medium text-[#E53C2E] hover:underline shrink-0 self-start cursor-pointer"
                  >
                    Inspect Record
                  </button>
                )}
              </div>
            );
          })}
          {thread.timeline.length === 0 && (
            <div className="p-4 text-xs text-[#5F6368]">
              No dated chronological events recorded yet.
            </div>
          )}
        </div>
      )}

      {/* Explicit Missing Information & Unverified Links Callout */}
      {thread.missingLinks.length > 0 && (
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-md text-[11px] text-amber-950 space-y-1">
          <div className="font-semibold flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Explicit Missing Information &amp; Unverified Links ({thread.missingLinks.length})</span>
            </span>
            {onOpenEvidenceTab && (
              <button
                type="button"
                onClick={onOpenEvidenceTab}
                className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
              >
                Go to Evidence Tab
              </button>
            )}
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {thread.missingLinks.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
