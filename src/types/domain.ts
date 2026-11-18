export type CurrencyCode = 'CAD' | 'USD';

export type DataSourceProvenance =
  | 'official_case_data'
  | 'derived_calculation'
  | 'hypothetical_scenario'
  | 'demonstration_state'
  | 'user_uploaded';

export type SourceUnit = 'thousands_cad' | 'full_cad' | 'percent';

export type PermissionTier = 'LEVEL_1_CONTROLLER' | 'LEVEL_2_SPECIALIST' | 'LEVEL_3_CONTRIBUTOR';

export type UserRoleId =
  | 'controller'
  | 'cost_accountant'
  | 'trade_coordinator'
  | 'operational_contributor';

export type RoutePath =
  | '/overview'
  | '/global-operations'
  | '/financials'
  | '/trade'
  | '/simulator'
  | '/investigations'
  | '/opportunities'
  | '/reports'
  | '/data-gateway'
  | '/approvals'
  | '/audit'
  | '/settings';

export type PermissionAction =
  | 'view_overview'
  | 'view_global_operations'
  | 'view_financials'
  | 'view_trade'
  | 'run_tariff_simulator'
  | 'save_tariff_scenario'
  | 'manage_investigations'
  | 'manage_trade_investigations'
  | 'view_opportunities'
  | 'generate_reports'
  | 'stage_data_upload'
  | 'authorize_data_import'
  | 'review_quarantined_records'
  | 'resolve_review_item'
  | 'submit_correction_request'
  | 'approve_material_correction'
  | 'view_audit_history'
  | 'manage_access_settings'
  | 'configure_business_rules';

export interface PermissionRole {
  id: UserRoleId;
  tier: PermissionTier;
  label: string;
  description: string;
  scopedRegions: RegionId[] | 'all';
  scopedDomains: ('financial' | 'trade' | 'operations' | 'governance')[];
  allowedActions: PermissionAction[];
}

export interface User {
  id: string;
  name: string;
  title: string;
  roleId: UserRoleId;
  tier: PermissionTier;
  plantId: string;
  department: string;
  isFictionalDemoUser: boolean;
  initials: string;
}

export type RegionId =
  | 'all'
  | 'north_america'
  | 'europe'
  | 'south_america'
  | 'anz'
  | 'asia'
  | 'corporate';

export interface Region {
  id: Exclude<RegionId, 'all'>;
  name: string;
  isSalesRegion: boolean;
  notes?: string;
}

export interface Plant {
  id: string;
  code: string;
  name: string;
  location: string;
  regionId: Exclude<RegionId, 'all'>;
}

export type QuarterId =
  | 'Q4 2024'
  | 'Q1 2025'
  | 'Q2 2025'
  | 'Q3 2025'
  | 'Q4 2025'
  | 'Q1 2026'
  | 'Q2 2026'
  | 'Q3 2026';

export interface ReportingPeriod {
  id: QuarterId;
  label: string;
  fiscalYear: number;
  quarterNumber: 1 | 2 | 3 | 4;
  priorYearQuarterId?: QuarterId;
  priorQuarterId?: QuarterId;
  hasIncomeStatement: boolean;
  hasRegionalSalesBreakdown: boolean;
  hasIrregularCostBreakdown: boolean;
  hasDetailedCustomsEntries: boolean;
  hasHistoricalTradeTotal: boolean;
}

export interface IncomeStatement {
  id: string;
  quarterId: QuarterId;
  salesCad: number;
  variableCostsCad: number;
  fixedPlantCostsCad: number;
  sgaCad: number;
  amortizationCad: number;
  operatingEarningsCad: number;
  oeShareOfSalesPct: number;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export type WalkBucket = 'Start' | 'Sales' | 'Variable costs' | 'Fixed plant' | 'SG&A' | 'Amortization' | 'End';

export type WalkLinkClassification =
  | 'direct_appendix_link'
  | 'contextual_bucket_link'
  | 'not_independently_listed';

export interface OperatingEarningsWalkEntry {
  id: string;
  walkId: string;
  sequence: number;
  stepLabel: string;
  bucket: WalkBucket;
  amountCad: number;
  isMaterialReported: boolean | null;
  linkedIrregularCostId?: string;
  linkClassification?: WalkLinkClassification;
  supportingExplanation?: string;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface OperatingEarningsWalk {
  id: string;
  comparisonType: 'YoY' | 'QoQ';
  fromQuarterId: QuarterId;
  toQuarterId: QuarterId;
  title: string;
  entries: OperatingEarningsWalkEntry[];
  sourceRef: string;
}

export interface RegionalSale {
  id: string;
  regionId: Exclude<RegionId, 'all' | 'corporate'>;
  regionName: string;
  quarterId: 'Q3 2026';
  priorYearQuarterId: 'Q3 2025';
  salesPriorYearCad: number;
  salesCurrentCad: number;
  changeCad: number;
  changePctReported: number;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface FiveWsAndHow {
  who: string;
  what: string;
  where: string;
  when: string;
  why: string;
  how: string;
}

export type CostTiming = 'One-time' | 'Trend';
export type ApprovalStatus = 'not_supplied_in_appendix' | 'explicitly_missing' | 'pending_review' | 'documented';

export interface IrregularCost {
  id: string; // IR-01 .. IR-07
  quarterId: QuarterId;
  item: string;
  department: string;
  regionId: Exclude<RegionId, 'all'>;
  regionName: string;
  amountCad: number;
  timing: CostTiming;
  effectOnOeCad: number;
  walkBucket: 'Fixed plant' | 'SG&A' | 'Variable costs';
  approvalStatus: ApprovalStatus;
  approvalNote: string;
  fiveWs: FiveWsAndHow;
  glAccount?: string;
  journalEntryRef?: string;
  vendorOrBatchRef?: string;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface DepartmentCostTotal {
  department: string;
  quarterId: QuarterId;
  amountCad: number;
  sourceRef: string;
  sourceUnit: SourceUnit;
}

export interface RegionCostTotal {
  regionId: Exclude<RegionId, 'all'>;
  regionName: string;
  quarterId: QuarterId;
  amountCad: number;
  sourceRef: string;
  sourceUnit: SourceUnit;
}

export interface LedgerTransaction {
  id: string;
  quarterId: QuarterId;
  linkedIrregularCostId: string;
  journalOrPostingRef: string;
  glAccount: string;
  amountCad: number;
  postingDateLabel: string;
  preparerLabel: string;
  description: string;
  isPartialAppendixRecord: true;
  sourceRef: string;
  provenance: DataSourceProvenance;
}

export type TradeAgreementStatus =
  | 'CUSMA_claimed'
  | 'CUSMA_not_claimed'
  | 'CPTPP_claimed'
  | 'none'
  | 'export_ddp'
  | 'export_cusma_dap';

export interface CustomsEntry {
  id: string; // E-01 .. E-12
  quarterId: QuarterId;
  route: string;
  direction: 'import' | 'export';
  originCountry: string;
  destination: string;
  incoterm?: 'DDP' | 'DAP';
  goods: string;
  hsCode: string;
  hsCodeIllustrative: boolean;
  goodsValueCad: number;
  rateDescription: string;
  mfnRatePct: number;
  additionalTariffPct: number;
  exportDutyPct: number;
  mfnDutyCad: number;
  additionalTariffCad: number;
  exportDutyCad: number;
  totalDutyAndTariffCad: number;
  brokerFeeChargedCad: number;
  brokerFeeExpectedCad: number;
  brokerVarianceReportedCad: number;
  tradeAgreementStatus: TradeAgreementStatus;
  originDocumentationStatus: 'on_file_per_case_narrative' | 'claimed' | 'not_applicable' | 'unconfirmed';
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface QuarterlyTradeSummary {
  quarterId: QuarterId;
  dutyAtNormalMfnCad: number;
  extraTariffsChinaCad: number;
  exportDutyDdpCad: number;
  brokerFeesCad: number;
  totalTradeCostCad: number;
  shipmentCount: number;
  totalGoodsValueCad: number;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface BrokerContractSummary {
  quarterId: QuarterId;
  contractRatePct: number;
  feesChargedCad: number;
  feesAtContractCad: number;
  grossOverchargesCad: number;
  underchargesCad: number;
  netOverContractCad: number;
  sourceRef: string;
  provenance: DataSourceProvenance;
}

export interface HistoricalTradeCost {
  quarterId: QuarterId;
  totalRoundedCad: number;
  yoyChangeRoundedCad: number | null;
  extraTariffsActive: boolean;
  note?: string;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface DomesticShipmentRecord {
  id: string;
  quarterId: QuarterId;
  destination: string;
  province: string;
  taxRuleSimplified: string;
  salesCad: number;
  salesTaxCad: number;
  freightCad: number;
  customsDutyCad: 0;
  sourceRef: string;
  sourceUnit: SourceUnit;
  provenance: DataSourceProvenance;
}

export interface TariffRule {
  id: string;
  name: string;
  originCountry: string;
  ratePct: number;
  effectiveFromQuarter: QuarterId;
  isPracticeAssumption: true;
  sourceRef: string;
}

export interface TariffScenario {
  id: string;
  name: string;
  tariffRatePct: number;
  quarterlyTariffCad: number;
  changePerQuarterCad: number;
  changePerYearCad: number;
  assumptions: string;
  sourceRef: string;
  provenance: DataSourceProvenance;
}

export type RuleId =
  | 'RULE_01_INDIVIDUAL_COST_SCREEN'
  | 'RULE_02_APPROVAL_SCREEN'
  | 'RULE_03_MATERIAL_VARIANCE'
  | 'RULE_04_BROKER_CONTRACT'
  | 'RULE_05_TARIFF_SEPARATION'
  | 'RULE_06_TRADE_AGREEMENT_OPPORTUNITY'
  | 'RULE_07_DOMESTIC_SEPARATION';

export type RuleSeverity = 'high' | 'medium' | 'info';

export interface BusinessRuleConfig {
  id: RuleId;
  code: string;
  title: string;
  description: string;
  thresholdValue?: number;
  thresholdUnit?: 'CAD' | 'PERCENT';
  enabled: boolean;
  isCaseAssumption: boolean;
  sourceRef: string;
}

export interface RuleEvaluationResult {
  id: string;
  ruleId: RuleId;
  ruleCode: string;
  recordType: 'irregular_cost' | 'walk_entry' | 'customs_entry' | 'domestic_summary';
  recordId: string;
  recordLabel: string;
  severity: RuleSeverity;
  flagged: boolean;
  summary: string;
  detail: string;
  monetaryExposureCad?: number;
  nonFraudDisclaimer: string;
}

export interface GroupedRuleAlert {
  id: string;
  recordType: RuleEvaluationResult['recordType'];
  recordId: string;
  recordLabel: string;
  highestSeverity: RuleSeverity;
  ruleCodes: string[];
  primarySummary: string;
  evaluations: RuleEvaluationResult[];
  monetaryExposureCad?: number;
}

export type InvestigationStatus = 'demo_open' | 'demo_in_review' | 'demo_documented';

export type InvestigationWorkflowStatus =
  | 'Open'
  | 'Assigned'
  | 'In Review'
  | 'Evidence Required'
  | 'Pending Approval'
  | 'Resolved'
  | 'Dismissed with Reason';

export interface AiInvestigationBrief {
  generatedAtIso: string;
  modelName: string;
  executiveSummary: string;
  whatOccurred: string;
  financialAmountSummary: string;
  relevantRecordIds: string[];
  whyFlagged: string;
  availableSupportingEvidence: string[];
  missingInformation: string[];
  possibleExplanations: string[];
  recommendedSteps: string[];
  relevantBusinessRules: string[];
  limitationsAndUncertainties: string;
  provenance: 'ai_generated_interpretation';
}

export interface Investigation {
  id: string;
  linkedRecordType:
    | 'irregular_cost'
    | 'customs_entry'
    | 'walk_variance'
    | 'quarantined_record'
    | 'uploaded_discrepancy';
  linkedRecordId: string;
  title: string;
  ownerUserId: string;
  regionId: Exclude<RegionId, 'all'>;
  department: string;
  exposureCad: number;
  priority: 'High' | 'Medium' | 'Standard';
  status: InvestigationStatus;
  workflowStatus: InvestigationWorkflowStatus;
  ruleCodes?: string[];
  linkedApprovalId?: string;
  dismissalReason?: string;
  notes: string;
  aiBrief?: AiInvestigationBrief;
  updatedAtIso?: string;
  provenance: DataSourceProvenance;
}

export type EvidenceSourceType = 'reference' | 'note' | 'pdf' | 'image' | 'spreadsheet';
export type EvidenceEntityType =
  | 'irregular_cost'
  | 'customs_entry'
  | 'uploaded_ledger'
  | 'uploaded_customs'
  | 'approval_request'
  | 'import_batch'
  | 'quarantined_record';

export interface SupportingEvidence {
  id: string;
  linkedRecordId: string;
  linkedEntityType?: EvidenceEntityType;
  title: string;
  evidenceType: 'journal_reference' | 'origin_certificate' | 'broker_contract' | 'carrier_invoice' | 'demo_note' | 'uploaded_attachment';
  sourceType?: EvidenceSourceType;
  fileName?: string;
  fileSizeBytes?: number;
  persistenceScope?: 'case_reference' | 'metadata_only_local_demo' | 'session_blob_preview';
  status: 'case_documented' | 'pending_verification' | 'missing_in_case' | 'reviewed' | 'accepted';
  uploadedByUserId?: string;
  createdAtIso: string;
  summary: string;
  provenance: DataSourceProvenance;
}

export type GovernanceRequestType =
  | 'import_authorization'
  | 'quarantined_transaction'
  | 'financial_correction'
  | 'evidence_submission'
  | 'broker_discrepancy';

export type ReviewWorkflowStatus =
  | 'Submitted'
  | 'In Review'
  | 'Additional Evidence Required'
  | 'Approved'
  | 'Rejected'
  | 'Resolved';

export interface ApprovalStepRecord {
  stepNumber: number;
  stepLabel: string;
  requiredRoleLabel: string;
  actorUserId?: string;
  actorName?: string;
  decision?: 'Approved' | 'Rejected' | 'In Review' | 'Additional Evidence Required';
  reason?: string;
  timestampIso?: string;
}

export interface ApprovalRequest {
  id: string;
  linkedRecordId: string;
  batchId?: string;
  requestType: GovernanceRequestType;
  title: string;
  requestedByUserId: string;
  assignedReviewerId?: string;
  approverUserId?: string;
  amountCad: number;
  isMaterial: boolean;
  status: 'demo_pending_controller' | 'demo_approved' | 'demo_rejected';
  workflowStatus: ReviewWorkflowStatus;
  resolutionStatus: 'Open' | 'Resolved';
  requiredApprovalsCount: number;
  approvalsHistory: ApprovalStepRecord[];
  rationale: string;
  decisionReason?: string;
  createdAtIso: string;
  updatedAtIso?: string;
  provenance: DataSourceProvenance;
}

export type ImportSchemaType = 'ledger_transactions' | 'customs_shipments' | 'incomplete' | 'unsupported';
export type RecordValidationOutcome = 'VALIDATED' | 'QUARANTINED' | 'REJECTED';

export interface ColumnMappingEntry {
  sourceHeader: string;
  targetField: string | null;
  confidence: 'exact' | 'alias' | 'ambiguous' | 'unmapped';
  candidateFields?: string[];
}

export interface StagedRuleViolation {
  ruleCode: string;
  ruleTitle: string;
  severity: RuleSeverity;
  outcomeImpact: 'QUARANTINED' | 'REJECTED';
  message: string;
  recommendedAction: string;
}

export interface StagedRecordItem {
  id: string;
  batchId: string;
  rowNumber: number;
  stableRecordId: string;
  schemaType: 'ledger_transactions' | 'customs_shipments';
  rawRow: Record<string, string>;
  normalizedData: Record<string, unknown>;
  amountCad: number;
  department: string;
  regionName: string;
  accountingPeriod: string;
  outcome: RecordValidationOutcome;
  highestSeverity: RuleSeverity;
  ruleResults: StagedRuleViolation[];
  reasons: string[];
  recommendedNextSteps: string[];
  isExistingConflict: boolean;
  conflictDetail?: string;
  reviewStatus: ReviewWorkflowStatus;
  assignedReviewerId?: string;
  resolutionNote?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface UploadedLedgerTransaction {
  id: string;
  batchId: string;
  transactionId: string;
  postingDate: string;
  accountingPeriod: string;
  regionId: Exclude<RegionId, 'all'>;
  regionName: string;
  plant: string;
  department: string;
  glAccount: string;
  expenseCategory: string;
  description: string;
  amountCad: number;
  supplierId: string;
  invoiceReference: string;
  approvalReference: string;
  preparedBy: string;
  supportingReference: string;
  authorizedByUserId: string;
  authorizedAtIso: string;
  provenance: 'user_uploaded';
}

export interface UploadedCustomsRecord {
  id: string;
  batchId: string;
  entryId: string;
  shipmentDate: string;
  accountingPeriod: string;
  originCountry: string;
  destination: string;
  goodsDescription: string;
  hsCode: string;
  goodsValueCad: number;
  baseDutyRatePct: number;
  additionalTariffRatePct: number;
  actualDutyCad: number;
  actualBrokerFeeCad: number;
  expectedBrokerFeeCad: number;
  brokerVarianceCad: number;
  tradeAgreement: string;
  originCertificateReference: string;
  approvalReference: string;
  shipmentReference: string;
  authorizedByUserId: string;
  authorizedAtIso: string;
  provenance: 'user_uploaded';
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: 'csv' | 'xlsx' | 'unsupported';
  selectedWorksheet?: string;
  availableWorksheets?: string[];
  targetDomain: 'ledger' | 'customs' | 'interprovincial' | 'unsupported';
  schemaType: ImportSchemaType;
  classificationReason: string;
  uploadedByUserId: string;
  status: 'staged_preview' | 'submitted_for_authorization' | 'authorized_committed' | 'rejected' | 'quarantined' | 'validated';
  recordCount: number;
  validatedCount: number;
  quarantinedCount: number;
  rejectedCount: number;
  acceptedTotalCad: number;
  affectedPeriods: string[];
  affectedDepartments: string[];
  affectedRegions: string[];
  columnMappings: ColumnMappingEntry[];
  records: StagedRecordItem[];
  fileErrors: string[];
  createdAtIso: string;
  authorizedAtIso?: string;
  authorizedByUserId?: string;
  provenance: DataSourceProvenance;
}

export interface ValidationResult {
  batchId: string;
  passedCount: number;
  flaggedCount: number;
  quarantinedCount: number;
  rejectedCount?: number;
  messages: string[];
}

export interface AuditEvent {
  id: string;
  timestampIso: string;
  actorType?: 'user' | 'system';
  actorUserId: string;
  actorName: string;
  actorRoleLabel: string;
  actionType:
    | 'role_switched'
    | 'filter_changed'
    | 'rule_threshold_updated'
    | 'investigation_status_updated'
    | 'evidence_note_added'
    | 'evidence_added'
    | 'correction_requested'
    | 'correction_approved'
    | 'request_approved'
    | 'request_rejected'
    | 'record_resolution_updated'
    | 'file_uploaded'
    | 'validation_completed'
    | 'record_quarantined'
    | 'record_rejected'
    | 'import_submitted'
    | 'import_authorized'
    | 'scenario_saved'
    | 'scenario_deleted'
    | 'demo_state_reset'
    | 'ai_query_executed'
    | 'ai_investigation_note_saved'
    | 'ai_briefing_generated'
    | 'ai_gateway_assist_used'
    | 'ai_evidence_extracted'
    | 'investigation_assigned'
    | 'investigation_dismissed'
    | 'opportunity_updated'
    | 'report_saved'
    | 'report_duplicated'
    | 'report_deleted'
    | 'report_exported'
    | 'ai_report_summary_generated';
  targetRecordId?: string;
  batchId?: string;
  previousState?: string;
  newState?: string;
  authorizationRef?: string;
  reason?: string;
  summary: string;
  provenance: DataSourceProvenance;
}

export type NotificationCategory =
  | 'data_gateway'
  | 'approvals'
  | 'investigations'
  | 'reports'
  | 'governance';

export interface AppNotification {
  id: string;
  eventKey: string;
  title: string;
  description: string;
  timestampIso: string;
  read: boolean;
  dismissed: boolean;
  category: NotificationCategory;
  route?: RoutePath;
  targetRecordId?: string;
  visibleToRoles?: UserRoleId[];
}

export interface SavedScenario {
  id: string;
  name: string;
  quarterId: QuarterId;
  originFilter: string;
  goodsFilter: string;
  selectedEntryIds: string[];
  dutiableGoodsValueCad: number;
  baselineAdditionalTariffCostCad: number;
  mfnDutyCostCad: number;
  chinaTariffRatePct: number;
  annualizationQuarters: number;
  transitionCostCad: number;
  recurringAltSupplierDeltaPerQuarterCad: number;
  projectedQuarterlyTariffCad: number;
  quarterlyDifferenceCad: number;
  projectedAnnualTariffCad: number;
  annualizedDifferenceCad: number;
  notes?: string;
  createdAtIso: string;
  createdByUserId: string;
  provenance: DataSourceProvenance;
}

export type OpportunityCategory =
  | 'potential_cash_recovery'
  | 'accounting_correction'
  | 'avoidable_operating_cost'
  | 'broker_discrepancy'
  | 'trade_agreement_savings'
  | 'hypothetical_tariff_scenario';

export type OpportunityWorkflowStatus =
  | 'Identified'
  | 'Under Review'
  | 'Validated Opportunity'
  | 'Approved Action'
  | 'In Progress'
  | 'Realized'
  | 'Rejected';

export interface CostOpportunity {
  id: string;
  title: string;
  category: OpportunityCategory;
  financialImpactType:
    | 'Cash Recovery (Unverified)'
    | 'Non-Cash Accounting Adjustment'
    | 'Future Cost Avoidance'
    | 'Contractual Broker Recovery'
    | 'Unconfirmed Duty Reduction'
    | 'Hypothetical Policy Scenario';
  department: string;
  sourceRecordId: string;
  sourceRecordType: 'irregular_cost' | 'customs_entry' | 'uploaded_customs' | 'tariff_scenario';
  linkedRecordIds: string[];
  estimatedAmountCad: number;
  verifiedAmountCad: number;
  realizedAmountCad: number;
  isGuaranteedRecoverable: false;
  description: string;
  verificationRequired: string;
  ownerUserId: string;
  status: OpportunityWorkflowStatus;
  associatedInvestigationId?: string;
  overlapGroupId?: string;
  overlapWarning?: string;
  resolutionNote?: string;
  updatedAtIso?: string;
  provenance: DataSourceProvenance;
}

export interface OpportunityOverrideRecord {
  opportunityId: string;
  status: OpportunityWorkflowStatus;
  verifiedAmountCad: number;
  realizedAmountCad: number;
  resolutionNote: string;
  updatedByUserId: string;
  updatedAtIso: string;
}

export type ReportTemplateId =
  | 'executive_financial_review'
  | 'trade_tariff_review'
  | 'financial_risk_review'
  | 'quarter_end_close_report'
  | 'cost_optimization_report'
  | 'custom_report';

export type ReportSectionGroup =
  | 'FINANCIAL PERFORMANCE'
  | 'REGIONAL INTELLIGENCE'
  | 'TRADE INTELLIGENCE'
  | 'FINANCIAL GOVERNANCE'
  | 'STRATEGIC INTELLIGENCE';

export type ReportSectionId =
  | 'fin_sales_trend'
  | 'fin_oe_trend'
  | 'fin_margin_trend'
  | 'fin_income_statement'
  | 'fin_yoy_comparison'
  | 'fin_qoq_comparison'
  | 'fin_profit_walk'
  | 'reg_sales_by_region'
  | 'reg_sales_growth'
  | 'reg_irregular_costs'
  | 'reg_dept_irregular_costs'
  | 'trd_customs_summary'
  | 'trd_historical_trends'
  | 'trd_cost_composition'
  | 'trd_broker_reconciliation'
  | 'trd_agreement_opportunities'
  | 'trd_domestic_separation'
  | 'gov_investigation_summary'
  | 'gov_material_variance_status'
  | 'gov_outstanding_approvals'
  | 'gov_gateway_batches'
  | 'gov_quarantined_summary'
  | 'gov_evidence_requirements'
  | 'str_tariff_scenarios'
  | 'str_opportunity_pipeline'
  | 'str_realized_opportunities'
  | 'str_quarter_end_readiness';

export type ReportDatasetScope =
  | 'official_case_data'
  | 'authorized_uploads_included'
  | 'combined_with_hypothetical';

export type ReportChartType = 'bar' | 'line' | 'stacked_bar' | 'waterfall' | 'table' | 'kpi_grid';

export type ReportExportFormat = 'pptx' | 'xlsx' | 'csv' | 'print_pdf';

export interface AiReportSummaryBlock {
  generatedAtIso: string;
  modelName: string;
  executiveHeadline: string;
  financialPerformanceCommentary: string;
  investigationSummary: string;
  quarterEndBriefing: string;
  suggestedActions: string[];
  hypotheticalDisclaimer: string;
  limitationsNote: string;
  reviewedAndApprovedForExport: boolean;
}

export interface ReportConfiguration {
  id: string;
  title: string;
  subtitle?: string;
  templateId: ReportTemplateId;
  reportingPeriod: QuarterId;
  comparisonType: 'YoY' | 'QoQ' | 'None';
  comparisonPeriod?: QuarterId;
  regionFilter: RegionId;
  departmentFilter: string;
  datasetScope: ReportDatasetScope;
  includedSections: ReportSectionId[];
  sectionChartOverrides?: Partial<Record<ReportSectionId, ReportChartType>>;
  sectionMetricIds?: Partial<Record<ReportSectionId, string[]>>;
  managementCommentary?: string;
  aiExecutiveSummary?: AiReportSummaryBlock;
  focusedRecordIds?: string[];
  ownerUserId: string;
  authorName: string;
  createdAtIso: string;
  modifiedAtIso: string;
  lastGeneratedAtIso?: string;
  configMode: 'live_configuration';
  status: 'draft' | 'saved' | 'ready_for_export';
}

export interface ReportSnapshotRecord {
  id: string;
  reportId: string;
  reportTitle: string;
  templateId: ReportTemplateId;
  reportingPeriod: QuarterId;
  comparisonPeriod?: string;
  regionFilter: RegionId;
  departmentFilter: string;
  datasetScope: ReportDatasetScope;
  includedSections: ReportSectionId[];
  exportFormat: ReportExportFormat;
  generatedByUserId: string;
  generatedByName: string;
  generatedAtIso: string;
  sourceRecordRefs: string[];
  headlineMetrics: { label: string; value: string }[];
  snapshotType: 'export_snapshot';
}

export interface ReportExportHistoryRecord {
  id: string;
  reportId: string;
  reportTitle: string;
  format: ReportExportFormat;
  fileName: string;
  generatedByUserId: string;
  generatedByName: string;
  generatedByRoleLabel: string;
  generatedAtIso: string;
  reportingPeriod: QuarterId;
  datasetScope: ReportDatasetScope;
  selectedSections: ReportSectionId[];
  slideCount?: number;
  byteSize?: number;
  outcome: 'generated_browser_download_triggered' | 'generation_failed';
  outcomeNote: string;
  snapshotId?: string;
}

export interface ReportLaunchPreset {
  templateId: ReportTemplateId;
  title?: string;
  reportingPeriod?: QuarterId;
  comparisonType?: 'YoY' | 'QoQ' | 'None';
  regionFilter?: RegionId;
  departmentFilter?: string;
  datasetScope?: ReportDatasetScope;
  includedSections?: ReportSectionId[];
  focusedRecordIds?: string[];
  managementCommentary?: string;
}

export interface DataDiscrepancy {
  id: string;
  title: string;
  affectedReferences: string[];
  description: string;
  handlingPolicy: string;
}

export type ThreadLinkNature =
  | 'direct_source'
  | 'contextual'
  | 'demonstration_workflow'
  | 'potential_unverified'
  | 'missing_information';

export type ThreadEntityKind =
  | 'irregular_cost'
  | 'ledger_transaction'
  | 'customs_entry'
  | 'uploaded_ledger'
  | 'uploaded_customs'
  | 'quarantined_record'
  | 'broker_invoice'
  | 'financial_category'
  | 'supporting_evidence'
  | 'investigation'
  | 'approval_request'
  | 'audit_event'
  | 'opportunity'
  | 'tariff_simulator'
  | 'missing_gap';

export interface DigitalThreadNode {
  id: string;
  kind: ThreadEntityKind;
  label: string;
  sublabel: string;
  amountCad?: number;
  linkNature: ThreadLinkNature;
  provenanceLabel: string;
  clickableRecordId?: string;
  clickableRoute?: RoutePath;
  lane: 1 | 2 | 3 | 4;
}

export interface DigitalThreadEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationshipLabel: string;
  linkNature: ThreadLinkNature;
}

export interface DigitalThreadTimelineEvent {
  id: string;
  timestampLabel: string;
  title: string;
  detail: string;
  linkNature: ThreadLinkNature;
  actorOrSource: string;
  clickableRecordId?: string;
}

export interface FinancialDigitalThread {
  rootId: string;
  rootTitle: string;
  rootSummary: string;
  nodes: DigitalThreadNode[];
  edges: DigitalThreadEdge[];
  timeline: DigitalThreadTimelineEvent[];
  missingLinks: string[];
}

export interface ReadinessIndicator {
  id: string;
  label: string;
  definition: string;
  resolvedCount: number;
  unresolvedCount: number;
  totalCount: number;
  status: 'ready' | 'attention_required' | 'action_blocked';
  targetRoute: RoutePath;
  unresolvedItems: { id: string; label: string; detail?: string }[];
}

export interface QuarterEndReadinessSnapshot {
  quarterId: QuarterId;
  activeScopeLabel: string;
  generatedAtIso: string;
  indicators: ReadinessIndicator[];
  totalBlockingCount: number;
  dataAvailabilityNotes: string[];
}

export interface AskSkyjackKpiItem {
  label: string;
  valueFormatted: string;
  contextNote: string;
  provenance: string;
}

export interface AskSkyjackCitation {
  recordId: string;
  recordType: 'irregular_cost' | 'customs_entry' | 'uploaded_ledger' | 'uploaded_customs' | 'investigation' | 'approval' | 'batch' | 'route';
  label: string;
  route?: RoutePath;
}

export interface AskSkyjackChartSpec {
  title: string;
  unitLabel: string;
  bars: { label: string; value: number; formattedValue: string; highlight?: boolean }[];
}

export interface AskSkyjackResponse {
  ok: true;
  modelName: string;
  mode: 'gemini_grounded' | 'deterministic_fallback';
  narrative: string;
  kpiHighlights: AskSkyjackKpiItem[];
  tableColumns: string[];
  tableRows: string[][];
  suggestedChart?: AskSkyjackChartSpec;
  investigationSummaries: { id: string; title: string; status: string; exposureFormatted: string; note: string }[];
  suggestedNextActions: { label: string; route?: RoutePath; recordId?: string }[];
  sourceCitations: AskSkyjackCitation[];
  followUpQuestions: string[];
  dataAvailabilityNote?: string;
  groundingBoundaryNote: string;
}

export interface AiQuarterEndBriefing {
  generatedAtIso: string;
  modelName: string;
  quarterId: QuarterId;
  executiveHeadline: string;
  establishedFacts: string[];
  blockingIssues: string[];
  recommendedActions: string[];
  limitationsAndScopeNote: string;
}

export interface AiGatewayAssistResult {
  generatedAtIso: string;
  modelName: string;
  suggestedMappings: {
    sourceHeader: string;
    suggestedTargetField: string;
    rationale: string;
    confidence: 'high' | 'medium' | 'low';
  }[];
  batchAnomalySummary: string;
  recommendedReviewFocus: string[];
  verificationDisclaimer: string;
}

export interface AiExtractedEvidenceClaims {
  generatedAtIso: string;
  modelName: string;
  fileName: string;
  invoiceReference: string;
  supplierIdentifier: string;
  financialAmount: string;
  documentDate: string;
  shipmentReference: string;
  supportingDescription: string;
  extractionCaveats: string;
  verificationStatus: 'unverified_until_reviewed';
}

/**
 * Phase 4 Extension Point Interfaces (Implemented via server-side Gemini proxy routes).
 */
export interface SemanticClassificationExtensionPoint {
  readonly phaseTarget: 'Phase 4';
  readonly providerStatus: 'server_proxy_active';
  classifyUnmappedHeaders(headers: string[], sampleRows: Record<string, string>[]): Promise<{
    suggestedSchema: ImportSchemaType;
    suggestedMappings: ColumnMappingEntry[];
    confidenceNote: string;
  }>;
}

export interface EvidenceExtractionExtensionPoint {
  readonly phaseTarget: 'Phase 4';
  readonly providerStatus: 'server_proxy_active';
  extractDocumentClaims(evidenceId: string, fileName: string): Promise<{
    extractedFields: Record<string, string>;
    verificationNote: string;
  }>;
}
