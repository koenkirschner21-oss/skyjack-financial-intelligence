import {
  CUSTOMS_ENTRIES,
  DEMO_USERS,
  IRREGULAR_COSTS,
} from '../data/caseSeed';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  CostOpportunity,
  OpportunityCategory,
  OpportunityWorkflowStatus,
  User,
} from '../types/domain';
import {
  calculateExpectedBrokerFeeCad,
  fromMinorCents,
  toMinorCents,
} from './rulesEngine';

export const OPPORTUNITY_CATEGORY_META: Record<
  OpportunityCategory,
  {
    label: string;
    shortLabel: string;
    description: string;
    isCashRecoveryCandidate: boolean;
    isHypothetical: boolean;
    badgeCls: string;
  }
> = {
  potential_cash_recovery: {
    label: 'Potential Cash Recoveries',
    shortLabel: 'Cash Recovery',
    description: 'Duplicate payments or unmatched charges where vendor/counterparty refund or credit memo may be recoverable after AP verification.',
    isCashRecoveryCandidate: true,
    isHypothetical: false,
    badgeCls: 'text-[#16A34A] bg-emerald-50 border-emerald-200',
  },
  accounting_correction: {
    label: 'Accounting Corrections (Non-Cash)',
    shortLabel: 'Accounting Adj.',
    description: 'Accrual reversals or GL reclassifications that correct financial reporting without generating external cash inflows.',
    isCashRecoveryCandidate: false,
    isHypothetical: false,
    badgeCls: 'text-blue-800 bg-blue-50 border-blue-200',
  },
  avoidable_operating_cost: {
    label: 'Avoidable Operating Costs',
    shortLabel: 'Avoidable Cost',
    description: 'Historical operational losses (e.g., scrap write-offs, expediting) targeting future process controls rather than retroactive recovery.',
    isCashRecoveryCandidate: false,
    isHypothetical: false,
    badgeCls: 'text-amber-800 bg-amber-50 border-amber-300',
  },
  broker_discrepancy: {
    label: 'Broker Fee Discrepancies',
    shortLabel: 'Broker Recovery',
    description: 'Contractual 0.2% brokerage billing variances identified in Q3 customs audits and authorized uploads.',
    isCashRecoveryCandidate: true,
    isHypothetical: false,
    badgeCls: 'text-[#16A34A] bg-emerald-50 border-emerald-200',
  },
  trade_agreement_savings: {
    label: 'Potential Trade Agreement Savings',
    shortLabel: 'FTA / CUSMA',
    description: 'Potential preferential duty exemptions requiring formal Certificates of Origin before claiming refunds or adjustments.',
    isCashRecoveryCandidate: true,
    isHypothetical: false,
    badgeCls: 'text-[#E53C2E] bg-red-50 border-red-200',
  },
  hypothetical_tariff_scenario: {
    label: 'Hypothetical Strategic Tariff Scenarios',
    shortLabel: 'Tariff Scenario',
    description: 'Policy sensitivity projections from saved Tariff Simulator runs; strictly separate from historical financials.',
    isCashRecoveryCandidate: false,
    isHypothetical: true,
    badgeCls: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]',
  },
};

export const OPPORTUNITY_STATUS_ORDER: OpportunityWorkflowStatus[] = [
  'Identified',
  'Under Review',
  'Validated Opportunity',
  'Approved Action',
  'In Progress',
  'Realized',
  'Rejected',
];

export interface OpportunityAnalyticsSummary {
  potentialCashRecoveryCad: number;
  accountingAdjustmentExposureCad: number;
  avoidableOperatingCostCad: number;
  brokerDiscrepancyGrossCad: number;
  tradeAgreementPotentialCad: number;
  hypotheticalScenarioAnnualCad: number;
  totalVerifiedCad: number;
  totalRealizedCad: number;
  overlapNotes: string[];
  byCategory: {
    category: OpportunityCategory;
    label: string;
    count: number;
    estimatedCad: number;
    verifiedCad: number;
    realizedCad: number;
  }[];
  byDepartment: {
    department: string;
    count: number;
    estimatedCad: number;
    realizedCad: number;
  }[];
  byStatus: {
    status: OpportunityWorkflowStatus;
    count: number;
    estimatedCad: number;
  }[];
  outstandingVerificationsCount: number;
}

export function buildCostOpportunities(
  state: PersistedWorkspaceState,
  user: User
): CostOpportunity[] {
  const overrideMap = new Map(
    (state.opportunityOverrides ?? []).map((o) => [o.opportunityId, o])
  );
  const invByRecord = new Map(
    state.investigations.map((i) => [i.linkedRecordId, i.id])
  );

  const applyOverride = (base: CostOpportunity): CostOpportunity => {
    const ov = overrideMap.get(base.id);
    if (!ov) return base;
    return {
      ...base,
      status: ov.status,
      verifiedAmountCad: ov.verifiedAmountCad,
      realizedAmountCad: ov.realizedAmountCad,
      resolutionNote: ov.resolutionNote,
      updatedAtIso: ov.updatedAtIso,
    };
  };

  const list: CostOpportunity[] = [];
  const canSeeTrade = user.roleId !== 'operational_contributor';
  const canSeeFinance = user.roleId === 'controller' || user.roleId === 'cost_accountant';

  // 1. IR-03 Duplicate vendor invoice (Cash recovery candidate)
  const ir03 = IRREGULAR_COSTS.find((c) => c.id === 'IR-03');
  if (ir03 && canSeeFinance) {
    list.push(
      applyOverride({
        id: 'opp-ir03-duplicate',
        title: 'IR-03 Duplicate Vendor Payment Recovery (Supplier V-4471)',
        category: 'potential_cash_recovery',
        financialImpactType: 'Cash Recovery (Unverified)',
        department: ir03.department,
        sourceRecordId: 'IR-03',
        sourceRecordType: 'irregular_cost',
        linkedRecordIds: ['IR-03'],
        estimatedAmountCad: ir03.amountCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description:
          'Appendix 2.3 identifies CAD 265,000 duplicate invoice payment using -A suffix on Supplier V-4471. Candidate for vendor credit memo or cash refund pending AP reconciliation.',
        verificationRequired:
          'Obtain vendor statement reconciliation, AP payment trace, and written credit/refund confirmation from Supplier V-4471.',
        ownerUserId: 'user-dana-morales',
        status: 'Identified',
        associatedInvestigationId: invByRecord.get('IR-03'),
        provenance: 'official_case_data',
      })
    );
  }

  // 2. IR-06 Unreversed warranty accrual (Accounting correction — NOT cash recovery)
  const ir06 = IRREGULAR_COSTS.find((c) => c.id === 'IR-06');
  if (ir06 && canSeeFinance) {
    list.push(
      applyOverride({
        id: 'opp-ir06-warranty',
        title: 'IR-06 Unreversed Prior Warranty Accrual Adjustment',
        category: 'accounting_correction',
        financialImpactType: 'Non-Cash Accounting Adjustment',
        department: ir06.department,
        sourceRecordId: 'IR-06',
        sourceRecordType: 'irregular_cost',
        linkedRecordIds: ['IR-06'],
        estimatedAmountCad: ir06.amountCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description:
          'Appendix 2.3 documents CAD 410,000 unreversed warranty accrual in Corporate Finance. Releasing excess accrual corrects P&L misstatement but does not yield external cash inflow.',
        verificationRequired:
          'Validate active warranty reserve schedule and obtain Group Controller sign-off on reversal journal.',
        ownerUserId: 'user-dana-morales',
        status: 'Identified',
        associatedInvestigationId: invByRecord.get('IR-06'),
        provenance: 'official_case_data',
      })
    );
  }

  // 3. IR-02 Rush freight reclassification (Accounting correction — zero net OE cash impact)
  const ir02 = IRREGULAR_COSTS.find((c) => c.id === 'IR-02');
  if (ir02 && (canSeeFinance || user.roleId === 'trade_coordinator')) {
    list.push(
      applyOverride({
        id: 'opp-ir02-reclass',
        title: 'IR-02 SG&A to Freight Out Cost Reclassification',
        category: 'accounting_correction',
        financialImpactType: 'Non-Cash Accounting Adjustment',
        department: ir02.department,
        sourceRecordId: 'IR-02',
        sourceRecordType: 'irregular_cost',
        linkedRecordIds: ['IR-02'],
        estimatedAmountCad: ir02.amountCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description:
          'CAD 600,000 rush freight recorded in SG&A rather than Freight Out (Variable Costs). Reclassification improves departmental cost accuracy without cash recovery.',
        verificationRequired:
          'Complete 3-step approval chain (Accounting, Logistics/Trade, Group Controller) with carrier freight invoices.',
        ownerUserId: 'user-marco-silva',
        status: 'Under Review',
        associatedInvestigationId: invByRecord.get('IR-02'),
        provenance: 'official_case_data',
      })
    );
  }

  // 4. IR-07 Unmatched broker fee accrual (Cash recovery candidate, overlap-checked against Q3 customs broker audit)
  const ir07 = IRREGULAR_COSTS.find((c) => c.id === 'IR-07');
  if (ir07 && (canSeeFinance || canSeeTrade)) {
    list.push(
      applyOverride({
        id: 'opp-ir07-broker-unmatched',
        title: 'IR-07 Unmatched Customs Broker Accrual Audit',
        category: 'potential_cash_recovery',
        financialImpactType: 'Cash Recovery (Unverified)',
        department: ir07.department,
        sourceRecordId: 'IR-07',
        sourceRecordType: 'irregular_cost',
        linkedRecordIds: ['IR-07'],
        estimatedAmountCad: ir07.amountCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description:
          'Appendix 2.3 identifies CAD 118,000 customs broker fee recorded without matched shipment entries. Potential credit recovery or accrual clean-up once matched.',
        verificationRequired:
          'Match broker statements against Appendix 3.2 shipment entries (E-01..E-12) to rule out overlap before claiming cash recovery.',
        ownerUserId: 'user-marco-silva',
        status: 'Identified',
        associatedInvestigationId: invByRecord.get('IR-07'),
        overlapGroupId: 'broker-fee-domain',
        overlapWarning:
          'Potential domain overlap with Q3 Customs Broker Overcharges (CAD 8,260 gross). Verify shipment-level matching before summing.',
        provenance: 'official_case_data',
      })
    );
  }

  // 5. IR-01 Plant 2 Scrap Write-Off (Avoidable operating cost)
  const ir01 = IRREGULAR_COSTS.find((c) => c.id === 'IR-01');
  if (ir01) {
    list.push(
      applyOverride({
        id: 'opp-ir01-scrap-control',
        title: 'IR-01 Hydraulic Cylinder Weld Quality & Scrap Prevention',
        category: 'avoidable_operating_cost',
        financialImpactType: 'Future Cost Avoidance',
        department: ir01.department,
        sourceRecordId: 'IR-01',
        sourceRecordType: 'irregular_cost',
        linkedRecordIds: ['IR-01'],
        estimatedAmountCad: ir01.amountCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description:
          'CAD 900,000 one-time Plant 2 scrap write-off (JE-260931 / GL 6410) due to failed hydraulic cylinder weld inspection. Not retroactively recoverable; informs future quality gates.',
        verificationRequired:
          'Review weld inspection records, supplier material certification, and preventive containment controls.',
        ownerUserId: 'user-dana-morales',
        status: 'Identified',
        associatedInvestigationId: invByRecord.get('IR-01'),
        provenance: 'official_case_data',
      })
    );
  }

  // 6. Customs Gross Broker Overcharges (Appendix 3.2/3.3: E-02, E-04, E-05, E-06, E-07, E-12 = CAD 8,260 gross)
  if (canSeeTrade) {
    const overchargeEntries = CUSTOMS_ENTRIES.filter((entry) => {
      const exp = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
      return toMinorCents(entry.brokerFeeChargedCad) > toMinorCents(exp);
    });
    const grossOverchargeCad = fromMinorCents(
      overchargeEntries.reduce((sum, entry) => {
        const exp = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
        return sum + (toMinorCents(entry.brokerFeeChargedCad) - toMinorCents(exp));
      }, 0)
    );

    list.push(
      applyOverride({
        id: 'opp-customs-broker-gross',
        title: `Q3 2026 Customs Broker Fee Gross Overcharges (${overchargeEntries.map((e) => e.id).join(', ')})`,
        category: 'broker_discrepancy',
        financialImpactType: 'Contractual Broker Recovery',
        department: 'Customs and Trade',
        sourceRecordId: 'E-04',
        sourceRecordType: 'customs_entry',
        linkedRecordIds: overchargeEntries.map((e) => e.id),
        estimatedAmountCad: grossOverchargeCad,
        verifiedAmountCad: 0,
        realizedAmountCad: 0,
        isGuaranteedRecoverable: false,
        description: `Aggregate gross broker fee overcharges vs. 0.2% contract across ${overchargeEntries.length} Q3 shipments (includes CAD 6,300 across China entries E-04, E-05, E-06). Note: Net over-contract variance is CAD 5,560 after CAD 2,700 undercharges on E-01/E-09/E-10.`,
        verificationRequired:
          'Reconcile individual broker bills against 0.2% contract fee clause and confirm whether undercharges offset gross claim.',
        ownerUserId: 'user-marco-silva',
        status: 'Identified',
        associatedInvestigationId: invByRecord.get('E-04'),
        overlapGroupId: 'broker-fee-domain',
        overlapWarning:
          'Reconcile against IR-07 unmatched broker accrual (CAD 118,000) and E-01/E-09/E-10 undercharges (CAD 2,700) before booking recovery.',
        provenance: 'official_case_data',
      })
    );

    // 7. E-08 Potential CUSMA Exemption (CAD 11,020)
    const e08 = CUSTOMS_ENTRIES.find((e) => e.id === 'E-08');
    if (e08) {
      list.push(
        applyOverride({
          id: 'opp-e08-cusma',
          title: 'E-08 Mexico Wire Harnesses Potential CUSMA Duty Exemption',
          category: 'trade_agreement_savings',
          financialImpactType: 'Unconfirmed Duty Reduction',
          department: 'Customs and Trade',
          sourceRecordId: 'E-08',
          sourceRecordType: 'customs_entry',
          linkedRecordIds: ['E-08'],
          estimatedAmountCad: e08.totalDutyAndTariffCad,
          verifiedAmountCad: 0,
          realizedAmountCad: 0,
          isGuaranteedRecoverable: false,
          description:
            'CAD 11,020 MFN duty (2.9% on CAD 380,000 value) paid on Mexican wire harnesses where CUSMA preference was not claimed. Eligibility is unconfirmed.',
          verificationRequired:
            'Obtain supplier Certificate of Origin meeting CUSMA automotive/electrical rules of origin before filing drawback/B2 adjustment.',
          ownerUserId: 'user-marco-silva',
          status: 'Under Review',
          associatedInvestigationId: invByRecord.get('E-08'),
          provenance: 'official_case_data',
        })
      );
    }

    // 8. Authorized uploaded customs broker overcharges (separate from official Appendix 3.2)
    const uploadedOvercharges = state.uploadedCustomsRecords.filter((r) => r.brokerVarianceCad > 0);
    if (uploadedOvercharges.length > 0) {
      const uploadedGrossCad = fromMinorCents(
        uploadedOvercharges.reduce((s, r) => s + toMinorCents(r.brokerVarianceCad), 0)
      );
      list.push(
        applyOverride({
          id: 'opp-uploaded-customs-broker',
          title: `Authorized Uploaded Customs Broker Variances (${uploadedOvercharges.length} shipment(s))`,
          category: 'broker_discrepancy',
          financialImpactType: 'Contractual Broker Recovery',
          department: 'Customs and Trade',
          sourceRecordId: uploadedOvercharges[0].entryId,
          sourceRecordType: 'uploaded_customs',
          linkedRecordIds: uploadedOvercharges.map((r) => r.entryId),
          estimatedAmountCad: uploadedGrossCad,
          verifiedAmountCad: 0,
          realizedAmountCad: 0,
          isGuaranteedRecoverable: false,
          description: `Contractual 0.2% brokerage overcharges across ${uploadedOvercharges.length} authorized uploaded customs record(s).`,
          verificationRequired: 'Audit uploaded carrier/broker invoices against master brokerage agreement.',
          ownerUserId: 'user-marco-silva',
          status: 'Identified',
          provenance: 'user_uploaded',
        })
      );
    }
  }

  // 9. Saved Tariff Scenarios (Strictly hypothetical policy impact, never mixed with cash recoveries)
  if (canSeeTrade || canSeeFinance) {
    state.savedScenarios.forEach((scen) => {
      if (scen.annualizedDifferenceCad < 0) {
        const savingsAbs = Math.abs(scen.annualizedDifferenceCad);
        list.push(
          applyOverride({
            id: `opp-scen-${scen.id}`,
            title: `Scenario Projection: ${scen.name}`,
            category: 'hypothetical_tariff_scenario',
            financialImpactType: 'Hypothetical Policy Scenario',
            department: 'Customs and Trade',
            sourceRecordId: scen.id,
            sourceRecordType: 'tariff_scenario',
            linkedRecordIds: scen.selectedEntryIds,
            estimatedAmountCad: savingsAbs,
            verifiedAmountCad: 0,
            realizedAmountCad: 0,
            isGuaranteedRecoverable: false,
            description: `Hypothetical annualized tariff reduction of CAD ${savingsAbs.toLocaleString('en-CA')} (${Math.abs(scen.quarterlyDifferenceCad).toLocaleString('en-CA')}/quarter) assuming ${scen.chinaTariffRatePct}% rate and unchanged import volume.`,
            verificationRequired:
              'Subject to statutory tariff policy changes or validated supplier resourcing plan; cannot be booked as realized operational savings.',
            ownerUserId: scen.createdByUserId,
            status: 'Identified',
            provenance: 'hypothetical_scenario',
          })
        );
      }
    });
  }

  return list;
}

export function detectOverlappingOpportunities(opportunities: CostOpportunity[]): string[] {
  const warnings: string[] = [];
  const groups = new Map<string, CostOpportunity[]>();

  for (const opp of opportunities) {
    if (opp.overlapGroupId) {
      groups.set(opp.overlapGroupId, [...(groups.get(opp.overlapGroupId) ?? []), opp]);
    }
  }

  groups.forEach((items, groupId) => {
    if (items.length > 1) {
      const names = items.map((i) => `${i.sourceRecordId} (${i.estimatedAmountCad.toLocaleString('en-CA')} CAD)`).join(' vs. ');
      warnings.push(
        `Domain overlap (${groupId}): ${names}. Excluded from blind cross-category summing until shipment-level matching completes.`
      );
    }
  });

  // Also flag any shared sourceRecordIds
  const bySource = new Map<string, CostOpportunity[]>();
  for (const opp of opportunities) {
    bySource.set(opp.sourceRecordId, [...(bySource.get(opp.sourceRecordId) ?? []), opp]);
  }
  bySource.forEach((items, src) => {
    if (items.length > 1) {
      warnings.push(
        `Shared source record (${src}) appears in ${items.length} opportunities; prevent double counting before realizing.`
      );
    }
  });

  return warnings;
}

export function computeOpportunityAnalytics(opportunities: CostOpportunity[]): OpportunityAnalyticsSummary {
  const sumCategory = (cat: OpportunityCategory) =>
    fromMinorCents(
      opportunities
        .filter((o) => o.category === cat && o.status !== 'Rejected')
        .reduce((s, o) => s + toMinorCents(o.estimatedAmountCad), 0)
    );

  const byCategory = (Object.keys(OPPORTUNITY_CATEGORY_META) as OpportunityCategory[]).map((cat) => {
    const items = opportunities.filter((o) => o.category === cat && o.status !== 'Rejected');
    return {
      category: cat,
      label: OPPORTUNITY_CATEGORY_META[cat].label,
      count: items.length,
      estimatedCad: fromMinorCents(items.reduce((s, o) => s + toMinorCents(o.estimatedAmountCad), 0)),
      verifiedCad: fromMinorCents(items.reduce((s, o) => s + toMinorCents(o.verifiedAmountCad), 0)),
      realizedCad: fromMinorCents(items.reduce((s, o) => s + toMinorCents(o.realizedAmountCad), 0)),
    };
  });

  const deptMap = new Map<string, { count: number; estCents: number; realCents: number }>();
  for (const opp of opportunities) {
    if (opp.status === 'Rejected') continue;
    const prev = deptMap.get(opp.department) ?? { count: 0, estCents: 0, realCents: 0 };
    deptMap.set(opp.department, {
      count: prev.count + 1,
      estCents: prev.estCents + toMinorCents(opp.estimatedAmountCad),
      realCents: prev.realCents + toMinorCents(opp.realizedAmountCad),
    });
  }
  const byDepartment = Array.from(deptMap.entries()).map(([department, d]) => ({
    department,
    count: d.count,
    estimatedCad: fromMinorCents(d.estCents),
    realizedCad: fromMinorCents(d.realCents),
  }));

  const byStatus = OPPORTUNITY_STATUS_ORDER.map((status) => {
    const items = opportunities.filter((o) => o.status === status);
    return {
      status,
      count: items.length,
      estimatedCad: fromMinorCents(items.reduce((s, o) => s + toMinorCents(o.estimatedAmountCad), 0)),
    };
  });

  return {
    potentialCashRecoveryCad: sumCategory('potential_cash_recovery'),
    accountingAdjustmentExposureCad: sumCategory('accounting_correction'),
    avoidableOperatingCostCad: sumCategory('avoidable_operating_cost'),
    brokerDiscrepancyGrossCad: sumCategory('broker_discrepancy'),
    tradeAgreementPotentialCad: sumCategory('trade_agreement_savings'),
    hypotheticalScenarioAnnualCad: sumCategory('hypothetical_tariff_scenario'),
    totalVerifiedCad: fromMinorCents(
      opportunities.reduce((s, o) => s + toMinorCents(o.verifiedAmountCad), 0)
    ),
    totalRealizedCad: fromMinorCents(
      opportunities.reduce((s, o) => s + toMinorCents(o.realizedAmountCad), 0)
    ),
    overlapNotes: detectOverlappingOpportunities(opportunities),
    byCategory,
    byDepartment,
    byStatus,
    outstandingVerificationsCount: opportunities.filter(
      (o) =>
        o.status === 'Identified' ||
        o.status === 'Under Review'
    ).length,
  };
}

export function getUserDisplayName(userId: string): string {
  return DEMO_USERS.find((u) => u.id === userId)?.name ?? 'Unassigned';
}
