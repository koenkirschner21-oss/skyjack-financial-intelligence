import {
  OPERATING_EARNINGS_WALKS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  CurrencyCode,
  QuarterEndReadinessSnapshot,
  QuarterId,
  ReadinessIndicator,
  User,
} from '../types/domain';
import { formatReportingCompact, formatReportingMoney } from './currencyService';
import { filterIrregularCostsForUser } from './permissions';

/**
 * Deterministic Quarter-End Readiness engine.
 * Computes transparent counts & definitions from active repository state without inventing AI confidence scores.
 */
export function computeQuarterEndReadiness(
  state: PersistedWorkspaceState,
  user: User,
  quarterId: QuarterId = state.selectedQuarterId,
  currency: CurrencyCode = 'CAD'
): QuarterEndReadinessSnapshot {
  const fMoney = (cad: number, opts?: { showSign?: boolean }) =>
    formatReportingMoney(cad, currency, opts);
  const fCompact = (cad: number) => formatReportingCompact(cad, currency);
  const periodMeta = REPORTING_PERIODS.find((p) => p.id === quarterId) ?? REPORTING_PERIODS[7];
  const scopedIr = filterIrregularCostsForUser(user, []);
  void scopedIr;

  // 1. Material walk variances (>= CAD 1,000,000) in Q3 2026 walks
  const materialWalkLines =
    quarterId === 'Q3 2026'
      ? OPERATING_EARNINGS_WALKS.flatMap((w) =>
          w.entries
            .filter(
              (e) =>
                e.bucket !== 'Start' &&
                e.bucket !== 'End' &&
                Math.abs(e.amountCad) >= 1_000_000
            )
            .map((e) => ({ ...e, walkTitle: w.title }))
        )
      : [];

  // A material variance is considered reviewed if it has a direct Appendix explanation or documented supporting evidence
  const documentedVarianceItems = materialWalkLines.filter((e) => {
    const hasLinkExpl = Boolean(e.supportingExplanation);
    const hasLinkedDoc =
      e.linkedIrregularCostId &&
      state.investigations.some(
        (inv) =>
          inv.linkedRecordId === e.linkedIrregularCostId &&
          (inv.workflowStatus === 'Resolved' || inv.workflowStatus === 'Dismissed with Reason')
      );
    return hasLinkExpl || hasLinkedDoc;
  });
  const unresolvedMaterialVariances = materialWalkLines.filter(
    (e) =>
      !e.supportingExplanation ||
      (e.linkedIrregularCostId &&
        !state.investigations.some(
          (inv) =>
            inv.linkedRecordId === e.linkedIrregularCostId &&
            (inv.workflowStatus === 'Resolved' || inv.workflowStatus === 'Dismissed with Reason')
        ))
  );

  // 2. Investigations (unified pipeline: open vs resolved)
  const scopedInvestigations = state.investigations.filter((inv) => {
    if (user.roleId === 'operational_contributor') {
      return inv.regionId === 'north_america' && (inv.department === 'Operations' || inv.department === 'Logistics');
    }
    if (user.roleId === 'trade_coordinator') {
      return inv.department === 'Customs and Trade' || inv.department === 'Logistics';
    }
    return true;
  });
  const resolvedInvs = scopedInvestigations.filter(
    (i) => i.workflowStatus === 'Resolved' || i.workflowStatus === 'Dismissed with Reason'
  );
  const unresolvedInvs = scopedInvestigations.filter(
    (i) => i.workflowStatus !== 'Resolved' && i.workflowStatus !== 'Dismissed with Reason'
  );

  // 3. Pending approval requests
  const openApprovals = state.approvalRequests.filter((r) => r.resolutionStatus === 'Open');
  const resolvedApprovals = state.approvalRequests.filter((r) => r.resolutionStatus === 'Resolved');

  // 4. Quarantined upload records awaiting review
  const openQuarantined = state.reviewQueueItems.filter(
    (q) =>
      q.reviewStatus !== 'Approved' &&
      q.reviewStatus !== 'Rejected' &&
      q.reviewStatus !== 'Resolved'
  );
  const resolvedQuarantined = state.reviewQueueItems.filter(
    (q) =>
      q.reviewStatus === 'Approved' ||
      q.reviewStatus === 'Rejected' ||
      q.reviewStatus === 'Resolved'
  );

  // 5. Outstanding evidence items
  const missingEvidence = state.evidence.filter(
    (ev) => ev.status === 'missing_in_case' || ev.status === 'pending_verification'
  );
  const verifiedEvidence = state.evidence.filter(
    (ev) => ev.status === 'case_documented' || ev.status === 'reviewed' || ev.status === 'accepted'
  );

  // 6. Reporting data availability for selected period
  const dataDimensions = [
    { key: 'Income Statement', available: periodMeta.hasIncomeStatement },
    { key: 'Regional Sales YoY', available: periodMeta.hasRegionalSalesBreakdown },
    { key: 'Irregular Cost Log', available: periodMeta.hasIrregularCostBreakdown },
    { key: 'Detailed Customs Entries', available: periodMeta.hasDetailedCustomsEntries },
    { key: 'Trade Cost Total', available: periodMeta.hasHistoricalTradeTotal },
  ];
  const availableDims = dataDimensions.filter((d) => d.available);
  const unavailableDims = dataDimensions.filter((d) => !d.available);

  const indicators: ReadinessIndicator[] = [
    {
      id: 'ind-variances',
      label: `Material Walk Variances (≥ ${fCompact(1_000_000)})`,
      definition: `Rule 03 requires documented explanations for Q3 2026 walk lines ≥ ${fCompact(1_000_000)} before close.`,
      resolvedCount: documentedVarianceItems.length,
      unresolvedCount: unresolvedMaterialVariances.length,
      totalCount: materialWalkLines.length,
      status:
        materialWalkLines.length === 0
          ? 'ready'
          : unresolvedMaterialVariances.length > 0
            ? 'attention_required'
            : 'ready',
      targetRoute: '/financials',
      unresolvedItems: unresolvedMaterialVariances.map((v) => ({
        id: v.id,
        label: `${v.stepLabel} (${fMoney(v.amountCad, { showSign: true })})`,
        detail: v.linkedIrregularCostId ? `Linked: ${v.linkedIrregularCostId}` : v.walkTitle,
      })),
    },
    {
      id: 'ind-investigations',
      label: 'Scoped Cost & Trade Investigations',
      definition: 'Active investigations across Appendix irregular costs and customs/broker exceptions.',
      resolvedCount: resolvedInvs.length,
      unresolvedCount: unresolvedInvs.length,
      totalCount: scopedInvestigations.length,
      status: unresolvedInvs.length > 0 ? 'attention_required' : 'ready',
      targetRoute: '/investigations',
      unresolvedItems: unresolvedInvs.slice(0, 8).map((i) => ({
        id: i.linkedRecordId,
        label: `${i.title} [${i.workflowStatus}]`,
        detail: `${fMoney(i.exposureCad)} · ${i.department}`,
      })),
    },
    {
      id: 'ind-approvals',
      label: 'Pending Governance Approvals',
      definition: 'Financial reclassifications, import authorizations, and correction requests awaiting sign-off.',
      resolvedCount: resolvedApprovals.length,
      unresolvedCount: openApprovals.length,
      totalCount: state.approvalRequests.length,
      status: openApprovals.length > 0 ? 'action_blocked' : 'ready',
      targetRoute: '/approvals',
      unresolvedItems: openApprovals.map((a) => ({
        id: a.id,
        label: `${a.title} (${a.workflowStatus})`,
        detail: `${fMoney(a.amountCad)} · ${a.approvalsHistory.filter((s) => s.decision === 'Approved').length}/${a.requiredApprovalsCount} steps`,
      })),
    },
    {
      id: 'ind-quarantine',
      label: 'Data Gateway Quarantined Records',
      definition: 'Uploaded ledger/customs rows held out of trusted totals pending review or resolution.',
      resolvedCount: resolvedQuarantined.length,
      unresolvedCount: openQuarantined.length,
      totalCount: state.reviewQueueItems.length,
      status: openQuarantined.length > 0 ? 'action_blocked' : 'ready',
      targetRoute: '/data-gateway',
      unresolvedItems: openQuarantined.slice(0, 8).map((q) => ({
        id: q.stableRecordId,
        label: `${q.stableRecordId} (${fMoney(q.amountCad)})`,
        detail: q.reasons?.[0] ?? q.ruleResults?.[0]?.message ?? q.reviewStatus,
      })),
    },
    {
      id: 'ind-evidence',
      label: 'Supporting Evidence Gaps',
      definition: 'Evidence items flagged as missing in case or awaiting verification.',
      resolvedCount: verifiedEvidence.length,
      unresolvedCount: missingEvidence.length,
      totalCount: state.evidence.length,
      status: missingEvidence.length > 0 ? 'attention_required' : 'ready',
      targetRoute: '/investigations',
      unresolvedItems: missingEvidence.slice(0, 8).map((ev) => ({
        id: ev.linkedRecordId,
        label: `${ev.linkedRecordId}: ${ev.title}`,
        detail: ev.status.replace(/_/g, ' '),
      })),
    },
    {
      id: 'ind-coverage',
      label: `Period Data Coverage (${quarterId})`,
      definition: 'Availability of Appendix financial, regional, irregular cost, and customs tables for the selected quarter.',
      resolvedCount: availableDims.length,
      unresolvedCount: unavailableDims.length,
      totalCount: dataDimensions.length,
      status: unavailableDims.length > 0 ? 'attention_required' : 'ready',
      targetRoute: '/overview',
      unresolvedItems: unavailableDims.map((d) => ({
        id: d.key,
        label: `${d.key} not supplied in Appendix for ${quarterId}`,
        detail: 'Detailed breakdowns exist primarily for Q3 2026',
      })),
    },
  ];

  const totalBlockingCount =
    unresolvedInvs.length +
    openApprovals.length +
    openQuarantined.length +
    missingEvidence.length;

  const dataAvailabilityNotes: string[] = [];
  if (quarterId !== 'Q3 2026') {
    dataAvailabilityNotes.push(
      `${quarterId} includes income statement and quarterly trade cost totals, but detailed Appendix 2.3 irregular costs and Appendix 3.2 customs entries are supplied only for Q3 2026 (unless authorized user uploads exist).`
    );
  }
  if (state.uploadedLedgerTransactions.length > 0 || state.uploadedCustomsRecords.length > 0) {
    dataAvailabilityNotes.push(
      `Includes ${state.uploadedLedgerTransactions.length} authorized uploaded ledger row(s) and ${state.uploadedCustomsRecords.length} authorized uploaded customs row(s); ${openQuarantined.length} quarantined item(s) remain excluded from trusted totals.`
    );
  }

  return {
    quarterId,
    activeScopeLabel: `${user.name} (${user.title})`,
    generatedAtIso: new Date().toISOString(),
    indicators,
    totalBlockingCount,
    dataAvailabilityNotes,
  };
}
