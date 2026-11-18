import {
  CUSTOMS_ENTRIES,
  DEFAULT_BUSINESS_RULES,
  DEMO_USERS,
  INITIAL_SUPPORTING_EVIDENCE,
  IRREGULAR_COSTS,
} from '../data/caseSeed';
import { calculateExpectedBrokerFeeCad, fromMinorCents, toMinorCents } from '../domain/rulesEngine';
import {
  AppNotification,
  ApprovalRequest,
  AuditEvent,
  BusinessRuleConfig,
  CurrencyCode,
  ImportBatch,
  Investigation,
  InvestigationStatus,
  InvestigationWorkflowStatus,
  OpportunityOverrideRecord,
  QuarterId,
  RegionId,
  ReportConfiguration,
  ReportExportHistoryRecord,
  ReportSnapshotRecord,
  SavedScenario,
  StagedRecordItem,
  SupportingEvidence,
  UploadedCustomsRecord,
  UploadedLedgerTransaction,
  UserRoleId,
} from '../types/domain';

export interface PersistedWorkspaceState {
  activeRoleId: UserRoleId;
  selectedQuarterId: QuarterId;
  selectedRegionId: RegionId;
  selectedPlantId: string;
  currency: CurrencyCode;
  sidebarCollapsed: boolean;
  businessRules: BusinessRuleConfig[];
  investigations: Investigation[];
  evidence: SupportingEvidence[];
  approvalRequests: ApprovalRequest[];
  importBatches: ImportBatch[];
  reviewQueueItems: StagedRecordItem[];
  uploadedLedgerTransactions: UploadedLedgerTransaction[];
  uploadedCustomsRecords: UploadedCustomsRecord[];
  savedScenarios: SavedScenario[];
  opportunityOverrides: OpportunityOverrideRecord[];
  savedReports: ReportConfiguration[];
  reportSnapshots: ReportSnapshotRecord[];
  exportHistory: ReportExportHistoryRecord[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
}

export interface ICostIntelligenceRepository {
  readonly persistenceMode: 'local_demonstration_storage';
  readonly persistenceNotice: string;
  loadState(): PersistedWorkspaceState;
  saveState(state: PersistedWorkspaceState): void;
  resetToOfficialCaseBaseline(): PersistedWorkspaceState;
}

const STORAGE_KEY = 'skyjack_cost_intelligence_phase3_v1';

export function mapLegacyToWorkflowStatus(status: InvestigationStatus): InvestigationWorkflowStatus {
  switch (status) {
    case 'demo_open':
      return 'Open';
    case 'demo_in_review':
      return 'In Review';
    case 'demo_documented':
      return 'Resolved';
  }
}

export function mapWorkflowToLegacyStatus(workflow: InvestigationWorkflowStatus): InvestigationStatus {
  switch (workflow) {
    case 'Open':
    case 'Assigned':
      return 'demo_open';
    case 'In Review':
    case 'Evidence Required':
    case 'Pending Approval':
      return 'demo_in_review';
    case 'Resolved':
    case 'Dismissed with Reason':
      return 'demo_documented';
  }
}

export function buildInitialDemoState(): PersistedWorkspaceState {
  const irInvestigations: Investigation[] = IRREGULAR_COSTS.map((cost) => {
    const isIr02 = cost.id === 'IR-02';
    const isMissingApproval = cost.approvalStatus === 'explicitly_missing';
    const ruleCodes = [
      ...(cost.amountCad >= 250_000 ? ['RULE 01'] : []),
      ...(cost.approvalStatus !== 'documented' ? ['RULE 02'] : []),
    ];
    return {
      id: `inv-${cost.id.toLowerCase()}`,
      linkedRecordType: 'irregular_cost',
      linkedRecordId: cost.id,
      title: `${cost.id}: ${cost.item}`,
      ownerUserId:
        cost.department === 'Customs and Trade' || cost.department === 'Logistics'
          ? 'user-marco-silva'
          : 'user-dana-morales',
      regionId: cost.regionId,
      department: cost.department,
      exposureCad: cost.amountCad,
      priority:
        cost.amountCad >= 500_000 || isMissingApproval
          ? 'High'
          : cost.amountCad >= 250_000
            ? 'Medium'
            : 'Standard',
      status: isIr02 ? 'demo_in_review' : 'demo_open',
      workflowStatus: isIr02 ? 'Pending Approval' : isMissingApproval ? 'Evidence Required' : 'Open',
      ruleCodes: ruleCodes.length ? ruleCodes : ['RULE 01'],
      linkedApprovalId: isIr02 ? 'apr-ir02-reclass' : undefined,
      notes: 'Initialized in demonstration state from Appendix 2.1/2.3.',
      updatedAtIso: '2026-10-01T14:00:00.000Z',
      provenance: 'demonstration_state',
    };
  });

  // One unified investigation per flagged customs entry (no duplicates for multi-rule records)
  const customsInvestigations: Investigation[] = CUSTOMS_ENTRIES.filter((entry) => {
    const expectedFee = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
    const variance = fromMinorCents(toMinorCents(entry.brokerFeeChargedCad) - toMinorCents(expectedFee));
    const hasBrokerOvercharge = variance > 0;
    const hasPotentialFta = entry.tradeAgreementStatus === 'CUSMA_not_claimed';
    return hasBrokerOvercharge || hasPotentialFta;
  }).map((entry) => {
    const expectedFee = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
    const variance = fromMinorCents(toMinorCents(entry.brokerFeeChargedCad) - toMinorCents(expectedFee));
    const ruleCodes: string[] = [];
    if (variance !== 0) ruleCodes.push('RULE 04');
    if (entry.additionalTariffCad > 0) ruleCodes.push('RULE 05');
    if (entry.tradeAgreementStatus === 'CUSMA_not_claimed') ruleCodes.push('RULE 06');

    const exposureCad =
      entry.tradeAgreementStatus === 'CUSMA_not_claimed'
        ? entry.totalDutyAndTariffCad
        : Math.max(0, variance);

    return {
      id: `inv-${entry.id.toLowerCase()}`,
      linkedRecordType: 'customs_entry',
      linkedRecordId: entry.id,
      title:
        entry.tradeAgreementStatus === 'CUSMA_not_claimed'
          ? `${entry.id}: Unclaimed CUSMA Potential (${entry.originCountry} · ${entry.goods})`
          : `${entry.id}: Broker Fee Overcharge (${entry.originCountry} · ${entry.goods})`,
      ownerUserId: 'user-marco-silva',
      regionId: 'north_america',
      department: 'Customs and Trade',
      exposureCad,
      priority: exposureCad >= 2000 ? 'High' : 'Medium',
      status: 'demo_open',
      workflowStatus:
        entry.tradeAgreementStatus === 'CUSMA_not_claimed' ? 'Evidence Required' : 'Assigned',
      ruleCodes,
      notes:
        entry.tradeAgreementStatus === 'CUSMA_not_claimed'
          ? 'Initialized from Appendix 3.2: requires formal Certificate of Origin verification before confirming CUSMA eligibility.'
          : `Initialized from Appendix 3.2/3.3: billed broker fee exceeds 0.2% contract threshold by CAD ${variance.toLocaleString('en-CA')}.`,
      updatedAtIso: '2026-10-01T14:00:00.000Z',
      provenance: 'demonstration_state',
    };
  });

  // Proposed 3-step demonstration workflow for IR-02 (Case narrative notes 3 approvals required for freight reclassification)
  const initialApprovals: ApprovalRequest[] = [
    {
      id: 'apr-ir02-reclass',
      linkedRecordId: 'IR-02',
      requestType: 'financial_correction',
      title: 'IR-02 Rush Freight Reclassification (SG&A → Freight Out)',
      requestedByUserId: DEMO_USERS[3].id, // Alex Chen (Operations & Logistics)
      assignedReviewerId: DEMO_USERS[1].id, // Dana Morales
      amountCad: 600_000,
      isMaterial: true,
      status: 'demo_pending_controller',
      workflowStatus: 'In Review',
      resolutionStatus: 'Open',
      requiredApprovalsCount: 3,
      approvalsHistory: [
        {
          stepNumber: 1,
          stepLabel: 'Step 1 · Plant Cost Accounting Verification',
          requiredRoleLabel: 'Cost Accountant (Dana Morales)',
        },
        {
          stepNumber: 2,
          stepLabel: 'Step 2 · Logistics / Carrier Invoice Confirmation',
          requiredRoleLabel: 'Customs & Trade Coordinator (Marco Silva)',
        },
        {
          stepNumber: 3,
          stepLabel: 'Step 3 · Final Material Reclassification Authorization',
          requiredRoleLabel: 'Group Controller (Helen Park)',
        },
      ],
      rationale:
        'Case narrative notes CAD 600,000 rush freight coded to SG&A instead of freight out requires three approvals before journal reclassification (proposed demonstration workflow; no fabricated SKYJACK approver names).',
      createdAtIso: '2026-10-01T14:00:00.000Z',
      updatedAtIso: '2026-10-01T14:00:00.000Z',
      provenance: 'demonstration_state',
    },
  ];

  return {
    activeRoleId: 'controller',
    selectedQuarterId: 'Q3 2026',
    selectedRegionId: 'all',
    selectedPlantId: 'all',
    currency: 'CAD',
    sidebarCollapsed: false,
    businessRules: DEFAULT_BUSINESS_RULES,
    investigations: [...irInvestigations, ...customsInvestigations],
    evidence: INITIAL_SUPPORTING_EVIDENCE,
    approvalRequests: initialApprovals,
    importBatches: [],
    reviewQueueItems: [],
    uploadedLedgerTransactions: [],
    uploadedCustomsRecords: [],
    savedScenarios: [
      {
        id: 'scen-case-15pct',
        name: 'Appendix 3.4: China Tariff Reduction (25% to 15%)',
        quarterId: 'Q3 2026',
        originFilter: 'China',
        goodsFilter: 'all',
        selectedEntryIds: ['E-04', 'E-05', 'E-06'],
        dutiableGoodsValueCad: 2_100_000,
        baselineAdditionalTariffCostCad: 525_000,
        mfnDutyCostCad: 56_000,
        chinaTariffRatePct: 15,
        annualizationQuarters: 4,
        transitionCostCad: 0,
        recurringAltSupplierDeltaPerQuarterCad: 0,
        projectedQuarterlyTariffCad: 315_000,
        quarterlyDifferenceCad: -210_000,
        projectedAnnualTariffCad: 1_260_000,
        annualizedDifferenceCad: -840_000,
        notes: 'Official Appendix 3.4 illustrative scenario assuming constant quarterly volume and zero supplier switching cost.',
        createdAtIso: '2026-11-16T00:00:00.000Z',
        createdByUserId: DEMO_USERS[2].id,
        provenance: 'hypothetical_scenario',
      },
      {
        id: 'scen-case-35pct',
        name: 'Appendix 3.4: China Tariff Escalation (25% to 35%)',
        quarterId: 'Q3 2026',
        originFilter: 'China',
        goodsFilter: 'all',
        selectedEntryIds: ['E-04', 'E-05', 'E-06'],
        dutiableGoodsValueCad: 2_100_000,
        baselineAdditionalTariffCostCad: 525_000,
        mfnDutyCostCad: 56_000,
        chinaTariffRatePct: 35,
        annualizationQuarters: 4,
        transitionCostCad: 0,
        recurringAltSupplierDeltaPerQuarterCad: 0,
        projectedQuarterlyTariffCad: 735_000,
        quarterlyDifferenceCad: 210_000,
        projectedAnnualTariffCad: 2_940_000,
        annualizedDifferenceCad: 840_000,
        notes: 'Official Appendix 3.4 upside tariff risk scenario.',
        createdAtIso: '2026-11-16T00:00:00.000Z',
        createdByUserId: DEMO_USERS[2].id,
        provenance: 'hypothetical_scenario',
      },
    ],
    opportunityOverrides: [],
    savedReports: [
      {
        id: 'rep-seed-exec-q3-2026',
        title: 'Q3 2026 Executive Financial Review',
        subtitle: 'Board / Group Controller · Organization-Wide Executive Reporting',
        templateId: 'executive_financial_review',
        reportingPeriod: 'Q3 2026',
        comparisonType: 'YoY',
        comparisonPeriod: 'Q3 2025',
        regionFilter: 'all',
        departmentFilter: 'all',
        datasetScope: 'authorized_uploads_included',
        includedSections: [
          'fin_income_statement',
          'fin_sales_trend',
          'fin_oe_trend',
          'fin_margin_trend',
          'fin_profit_walk',
          'reg_sales_by_region',
          'reg_irregular_costs',
          'trd_cost_composition',
          'str_quarter_end_readiness',
        ],
        sectionChartOverrides: {},
        sectionMetricIds: {},
        managementCommentary:
          'Q3 2026 operating earnings recovered to CAD 20.7M (6.3% margin), +CAD 5.5M YoY and +CAD 4.2M QoQ. Resolve Plant 2 scrap evidence (IR-01) and 3-step IR-02 reclassification prior to quarter close.',
        ownerUserId: DEMO_USERS[0].id,
        authorName: `${DEMO_USERS[0].name} (${DEMO_USERS[0].title})`,
        createdAtIso: '2026-10-02T09:00:00.000Z',
        modifiedAtIso: '2026-10-02T09:00:00.000Z',
        configMode: 'live_configuration',
        status: 'ready_for_export',
      },
      {
        id: 'rep-seed-trade-q3-2026',
        title: 'Q3 2026 Trade, Broker & China Tariff Review',
        subtitle: 'Customs, Trade & Procurement Leadership · Trade Scoped',
        templateId: 'trade_tariff_review',
        reportingPeriod: 'Q3 2026',
        comparisonType: 'YoY',
        comparisonPeriod: 'Q3 2025',
        regionFilter: 'all',
        departmentFilter: 'all',
        datasetScope: 'combined_with_hypothetical',
        includedSections: [
          'trd_customs_summary',
          'trd_historical_trends',
          'trd_cost_composition',
          'trd_broker_reconciliation',
          'trd_agreement_opportunities',
          'trd_domestic_separation',
          'str_tariff_scenarios',
        ],
        sectionChartOverrides: {},
        sectionMetricIds: {},
        managementCommentary:
          'Exact Q3 trade cost totals CAD 736,770 across 12 entries. Focus on CAD 8,260 gross broker overcharges (CAD 5,560 net) and formal CUSMA origin documentation verification for E-08 (CAD 11,020 MFN duty).',
        ownerUserId: DEMO_USERS[2].id,
        authorName: `${DEMO_USERS[2].name} (${DEMO_USERS[2].title})`,
        createdAtIso: '2026-10-02T09:15:00.000Z',
        modifiedAtIso: '2026-10-02T09:15:00.000Z',
        configMode: 'live_configuration',
        status: 'saved',
      },
    ],
    reportSnapshots: [],
    exportHistory: [],
    notifications: [],
    auditEvents: [],
  };
}

class LocalStorageCostRepository implements ICostIntelligenceRepository {
  readonly persistenceMode = 'local_demonstration_storage' as const;
  readonly persistenceNotice =
    'Financial baselines come from the SKYJACK competition dataset (Q4 2024–Q3 2026) and are not connected to live SKYJACK ERP systems. Session uploads, workflow updates, and preferences persist locally in your browser.';

  loadState(): PersistedWorkspaceState {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return buildInitialDemoState();
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = buildInitialDemoState();
        this.saveState(fresh);
        return fresh;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
      const defaults = buildInitialDemoState();

      // Hydrate any missing workflowStatus fields and merge missing Phase 4 customs investigations cleanly
      const existingInvs = (parsed.investigations ?? []).map((inv) => ({
        ...inv,
        workflowStatus: inv.workflowStatus ?? mapLegacyToWorkflowStatus(inv.status),
      }));
      const existingIds = new Set(existingInvs.map((i) => i.linkedRecordId));
      const mergedInvestigations = [
        ...existingInvs,
        ...defaults.investigations.filter((d) => !existingIds.has(d.linkedRecordId)),
      ];

      return {
        ...defaults,
        ...parsed,
        businessRules: parsed.businessRules?.length ? parsed.businessRules : defaults.businessRules,
        investigations: mergedInvestigations.length ? mergedInvestigations : defaults.investigations,
        evidence: parsed.evidence?.length ? parsed.evidence : defaults.evidence,
        approvalRequests: parsed.approvalRequests?.length ? parsed.approvalRequests : defaults.approvalRequests,
        importBatches: parsed.importBatches ?? [],
        reviewQueueItems: parsed.reviewQueueItems ?? [],
        uploadedLedgerTransactions: parsed.uploadedLedgerTransactions ?? [],
        uploadedCustomsRecords: parsed.uploadedCustomsRecords ?? [],
        savedScenarios: parsed.savedScenarios?.length ? parsed.savedScenarios : defaults.savedScenarios,
        opportunityOverrides: parsed.opportunityOverrides ?? [],
        savedReports: parsed.savedReports?.length ? parsed.savedReports : defaults.savedReports,
        reportSnapshots: parsed.reportSnapshots ?? [],
        exportHistory: parsed.exportHistory ?? [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
        auditEvents: parsed.auditEvents ?? [],
      };
    } catch {
      return buildInitialDemoState();
    }
  }

  saveState(state: PersistedWorkspaceState): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in restricted sandboxes
    }
  }

  resetToOfficialCaseBaseline(): PersistedWorkspaceState {
    return buildInitialDemoState();
  }
}

export const costIntelligenceRepo: ICostIntelligenceRepository = new LocalStorageCostRepository();

export function formatInvestigationStatus(status: InvestigationStatus): string {
  switch (status) {
    case 'demo_open':
      return 'Open (Demo)';
    case 'demo_in_review':
      return 'In Review (Demo)';
    case 'demo_documented':
      return 'Documented (Demo)';
  }
}
