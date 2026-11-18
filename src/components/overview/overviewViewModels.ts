import {
  CurrencyCode,
  GroupedRuleAlert,
  IrregularCost,
  CustomsEntry,
  RoutePath,
  User,
} from '../../types/domain';
import { PersistedWorkspaceState } from '../../repositories/costIntelligenceRepo';
import { formatReportingMoney } from '../../domain/currencyService';
import {
  calculateExpectedBrokerFeeCad,
  fromMinorCents,
  toMinorCents,
} from '../../domain/rulesEngine';

export interface AttentionItem {
  id: string;
  recordId: string;
  title: string;
  categoryLabel: string;
  statusLabel: string;
  severity: 'high' | 'medium' | 'info';
  amountCad?: number;
  amountLabel?: string;
  actionType: 'drawer' | 'route';
  routeTarget: RoutePath;
  actionLabel: string;
  priorityScore: number;
}

/**
 * Presentation-only compact CAD formatting for Executive Overview KPIs.
 * Preserves $2.82M precision for irregular costs while keeping >=10M figures at 1 decimal ($329.7M, $20.7M).
 */
export function formatOverviewCompactCad(amountCad: number, options?: { showSign?: boolean }): string {
  const cents = toMinorCents(amountCad);
  const absVal = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';

  if (absVal >= 10_000_000) {
    return `${sign}$${(absVal / 1_000_000).toFixed(1)}M`;
  }
  if (absVal >= 1_000_000) {
    return `${sign}$${(absVal / 1_000_000).toFixed(2)}M`;
  }
  if (absVal >= 1_000) {
    return `${sign}$${(absVal / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${Math.round(absVal).toLocaleString('en-CA')}`;
}

/**
 * Builds a deterministic, deduplicated, role-scoped "Needs Attention" queue (3–5 top priorities).
 * Combines live approval requests, quarantined Data Gateway items, open investigations,
 * and rule-grouped alerts without duplicating the same underlying record.
 */
export function buildNeedsAttentionQueue(params: {
  state: PersistedWorkspaceState;
  activeUser: User;
  groupedAlerts: GroupedRuleAlert[];
  scopedIrregularCosts: IrregularCost[];
  scopedCustomsEntries: CustomsEntry[];
  maxItems?: number;
  currency?: CurrencyCode;
}): AttentionItem[] {
  const {
    state,
    activeUser,
    groupedAlerts,
    scopedIrregularCosts,
    scopedCustomsEntries,
    maxItems = 5,
    currency = state.currency ?? 'CAD',
  } = params;

  const byCanonicalRecord = new Map<string, AttentionItem>();

  const registerItem = (item: AttentionItem) => {
    const key = item.recordId.toUpperCase();
    const existing = byCanonicalRecord.get(key);
    if (!existing || item.priorityScore > existing.priorityScore) {
      byCanonicalRecord.set(key, item);
    }
  };

  const allowedRecordIds = new Set<string>([
    ...scopedIrregularCosts.map((c) => c.id),
    ...scopedCustomsEntries.map((e) => e.id),
  ]);

  const isRoleScopedInvestigation = (dept: string, regionId: string) => {
    if (activeUser.roleId === 'operational_contributor') {
      return regionId === 'north_america' && (dept === 'Operations' || dept === 'Logistics');
    }
    if (activeUser.roleId === 'trade_coordinator') {
      return dept === 'Customs and Trade' || dept === 'Logistics';
    }
    return true;
  };

  // 1. Open governance approvals (highest workflow urgency when scoped to role)
  for (const req of state.approvalRequests) {
    if (req.resolutionStatus !== 'Open') continue;

    if (
      activeUser.roleId === 'operational_contributor' &&
      req.requestedByUserId !== activeUser.id &&
      !allowedRecordIds.has(req.linkedRecordId)
    ) {
      continue;
    }
    if (
      activeUser.roleId === 'trade_coordinator' &&
      req.requestType !== 'broker_discrepancy' &&
      !allowedRecordIds.has(req.linkedRecordId)
    ) {
      continue;
    }

    const canOpenRecord = allowedRecordIds.has(req.linkedRecordId);
    const completedSteps = req.approvalsHistory.filter((s) => s.decision === 'Approved').length;
    registerItem({
      id: `attn-apr-${req.id}`,
      recordId: req.linkedRecordId,
      title: req.title,
      categoryLabel: req.isMaterial ? 'Material Approval' : 'Pending Approval',
      statusLabel:
        req.requiredApprovalsCount > 1
          ? `Step ${completedSteps}/${req.requiredApprovalsCount} · ${req.workflowStatus}`
          : req.workflowStatus,
      severity: req.isMaterial ? 'high' : 'medium',
      amountCad: req.amountCad,
      amountLabel: formatReportingMoney(req.amountCad, currency),
      actionType: canOpenRecord ? 'drawer' : 'route',
      routeTarget: '/approvals',
      actionLabel: canOpenRecord ? 'Inspect record' : 'Open approvals',
      priorityScore: 900 + Math.min(99, req.amountCad / 10_000),
    });
  }

  // 2. Open quarantined upload records from Data Gateway
  for (const qItem of state.reviewQueueItems) {
    if (
      qItem.reviewStatus === 'Approved' ||
      qItem.reviewStatus === 'Rejected' ||
      qItem.reviewStatus === 'Resolved'
    ) {
      continue;
    }
    if (
      activeUser.roleId === 'trade_coordinator' &&
      qItem.schemaType !== 'customs_shipments' &&
      !(qItem.department ?? '').toLowerCase().includes('logistics')
    ) {
      continue;
    }
    if (
      activeUser.roleId === 'operational_contributor' &&
      qItem.schemaType === 'customs_shipments'
    ) {
      continue;
    }

    registerItem({
      id: `attn-quar-${qItem.id}`,
      recordId: qItem.stableRecordId,
      title: `${qItem.stableRecordId} quarantined from Data Gateway (${qItem.department || 'Import Batch'})`,
      categoryLabel: 'Data Quarantine',
      statusLabel: qItem.reviewStatus,
      severity: 'high',
      amountCad: qItem.amountCad,
      amountLabel: formatReportingMoney(qItem.amountCad, currency),
      actionType: 'route',
      routeTarget: '/data-gateway',
      actionLabel: 'Review quarantine',
      priorityScore: 850 + Math.min(99, qItem.amountCad / 10_000),
    });
  }

  // 3. Open scoped investigations (prioritize explicitly missing approvals, material items, & CUSMA verification)
  for (const inv of state.investigations) {
    if (inv.workflowStatus === 'Resolved' || inv.workflowStatus === 'Dismissed with Reason') {
      continue;
    }
    if (!isRoleScopedInvestigation(inv.department, inv.regionId)) continue;
    if (activeUser.roleId === 'operational_contributor' && inv.linkedRecordType === 'customs_entry') {
      continue;
    }

    const isCustomRecord = inv.linkedRecordType === 'customs_entry';
    const isMaterialIr = inv.linkedRecordType === 'irregular_cost';
    const baseScore =
      inv.priority === 'High' ? 760 : inv.priority === 'Medium' ? 680 : 610;
    const missingEvidenceBonus = inv.workflowStatus === 'Evidence Required' ? 40 : 0;
    // Surface CUSMA verification & top broker discrepancy clearly for trade & controller views
    const cusmaBonus = inv.linkedRecordId === 'E-08' ? 75 : 0;
    const brokerBonus = inv.linkedRecordId === 'E-04' ? 50 : 0;

    let amountDisplay = formatReportingMoney(inv.exposureCad, currency);
    if (isCustomRecord) {
      const entry = scopedCustomsEntries.find((e) => e.id === inv.linkedRecordId);
      if (entry) {
        const expected = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
        const variance = fromMinorCents(
          toMinorCents(entry.brokerFeeChargedCad) - toMinorCents(expected)
        );
        if (entry.tradeAgreementStatus === 'CUSMA_not_claimed') {
          amountDisplay = `${formatReportingMoney(entry.totalDutyAndTariffCad, currency)} MFN at stake`;
        } else if (variance > 0) {
          amountDisplay = `+${formatReportingMoney(variance, currency)} broker overcharge`;
        }
      }
    }

    const canInspectDrawer =
      allowedRecordIds.has(inv.linkedRecordId) ||
      activeUser.roleId === 'controller' ||
      activeUser.roleId === 'cost_accountant';

    registerItem({
      id: `attn-inv-${inv.id}`,
      recordId: inv.linkedRecordId,
      title: inv.title,
      categoryLabel: isCustomRecord
        ? 'Trade Exception'
        : isMaterialIr
          ? `${inv.department} Anomaly`
          : 'Investigation',
      statusLabel: inv.workflowStatus,
      severity: inv.priority === 'High' ? 'high' : 'medium',
      amountCad: inv.exposureCad,
      amountLabel: amountDisplay,
      actionType: canInspectDrawer ? 'drawer' : 'route',
      routeTarget: activeUser.roleId === 'operational_contributor' ? '/data-gateway' : '/investigations',
      actionLabel: canInspectDrawer ? 'Inspect record' : 'Open queue',
      priorityScore:
        baseScore +
        missingEvidenceBonus +
        cusmaBonus +
        brokerBonus +
        Math.min(80, inv.exposureCad / 20_000),
    });
  }

  // 4. Fallback: grouped alerts not already represented in active investigations
  for (const alert of groupedAlerts) {
    if (alert.recordType === 'walk_entry' || alert.recordType === 'domestic_summary') continue;
    if (activeUser.roleId === 'operational_contributor' && !allowedRecordIds.has(alert.recordId)) {
      continue;
    }

    const exposure = alert.monetaryExposureCad ?? 0;
    registerItem({
      id: `attn-alert-${alert.id}`,
      recordId: alert.recordId,
      title: alert.recordLabel,
      categoryLabel: alert.ruleCodes.join(' · '),
      statusLabel: alert.evaluations.length > 1 ? `${alert.evaluations.length} flags` : 'Rule flag',
      severity: alert.highestSeverity,
      amountCad: exposure,
      amountLabel: exposure !== 0 ? formatReportingMoney(exposure, currency) : 'Rule check',
      actionType: 'drawer',
      routeTarget: '/investigations',
      actionLabel: 'Inspect alert',
      priorityScore:
        (alert.highestSeverity === 'high' ? 620 : 540) +
        Math.min(40, Math.abs(exposure) / 25_000),
    });
  }

  return Array.from(byCanonicalRecord.values())
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, maxItems);
}
