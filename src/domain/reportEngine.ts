import {
  BROKER_CONTRACT_SUMMARY_Q3_2026,
  CUSTOMS_ENTRIES,
  DEPARTMENT_COST_TOTALS,
  DOMESTIC_SHIPMENT_RECORDS,
  HISTORICAL_TRADE_COSTS,
  INCOME_STATEMENTS,
  IRREGULAR_COSTS,
  OPERATING_EARNINGS_WALKS,
  QUARTERLY_TRADE_SUMMARY_Q3_2026,
  REGIONAL_SALES,
  REGION_COST_TOTALS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  CostOpportunity,
  CurrencyCode,
  CustomsEntry,
  IrregularCost,
  QuarterId,
  ReportChartType,
  ReportConfiguration,
  ReportDatasetScope,
  ReportSectionGroup,
  ReportSectionId,
  ReportTemplateId,
  SavedScenario,
  User,
} from '../types/domain';
import {
  convertFromCad,
  DEMO_CAD_TO_USD_RATE,
  formatReportingCompact,
  formatReportingMoney,
} from './currencyService';
import {
  buildCostOpportunities,
  computeOpportunityAnalytics,
  OPPORTUNITY_CATEGORY_META,
} from './opportunityEngine';
import {
  filterCustomsEntriesForUser,
  filterIrregularCostsForUser,
  getReportPermissionPolicy,
  ReportPermissionPolicy,
} from './permissions';
import { computeQuarterEndReadiness } from './readinessEngine';
import {
  calculateExpectedBrokerFeeCad,
  calculateOperatingMarginPct,
} from './rulesEngine';

export interface ReportTemplateSpec {
  id: ReportTemplateId;
  title: string;
  shortTitle: string;
  audience: string;
  description: string;
  defaultComparisonType: 'YoY' | 'QoQ' | 'None';
  defaultDatasetScope: ReportDatasetScope;
  defaultSections: ReportSectionId[];
}

export const REPORT_TEMPLATES: ReportTemplateSpec[] = [
  {
    id: 'executive_financial_review',
    title: 'Executive Financial Review',
    shortTitle: 'Executive Review',
    audience: 'Board / Group Controller / Executive Leadership',
    description:
      'Consolidated quarterly financial performance, operating earnings walks, regional sales, irregular cost drivers, trade cost tie-out, and close readiness.',
    defaultComparisonType: 'YoY',
    defaultDatasetScope: 'authorized_uploads_included',
    defaultSections: [
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
  },
  {
    id: 'trade_tariff_review',
    title: 'Trade & Tariff Review',
    shortTitle: 'Trade & Tariff',
    audience: 'Customs, Trade & Procurement Leadership',
    description:
      'Shipment-level duty & China additional tariff separation, 0.2% broker contract reconciliation, CUSMA opportunities, domestic separation, and tariff scenarios.',
    defaultComparisonType: 'YoY',
    defaultDatasetScope: 'combined_with_hypothetical',
    defaultSections: [
      'trd_customs_summary',
      'trd_historical_trends',
      'trd_cost_composition',
      'trd_broker_reconciliation',
      'trd_agreement_opportunities',
      'trd_domestic_separation',
      'str_tariff_scenarios',
    ],
  },
  {
    id: 'financial_risk_review',
    title: 'Financial Risk Review',
    shortTitle: 'Risk & Controls',
    audience: 'Internal Audit / Controller / Risk Governance',
    description:
      'Flagged irregular cost exposure, priority investigations, pending multi-step approvals, quarantined Data Gateway records, and evidence gaps.',
    defaultComparisonType: 'YoY',
    defaultDatasetScope: 'authorized_uploads_included',
    defaultSections: [
      'reg_irregular_costs',
      'reg_dept_irregular_costs',
      'gov_investigation_summary',
      'gov_outstanding_approvals',
      'gov_quarantined_summary',
      'gov_evidence_requirements',
    ],
  },
  {
    id: 'quarter_end_close_report',
    title: 'Quarter-End Close Report',
    shortTitle: 'Quarter-End Close',
    audience: 'Group Controller / External Audit Liaison',
    description:
      'Close-readiness sign-off pack covering period income summary, Rule 03 material walk variances, investigation & approval blockers, and open close actions.',
    defaultComparisonType: 'QoQ',
    defaultDatasetScope: 'authorized_uploads_included',
    defaultSections: [
      'fin_income_statement',
      'gov_material_variance_status',
      'gov_investigation_summary',
      'gov_outstanding_approvals',
      'gov_evidence_requirements',
      'str_quarter_end_readiness',
    ],
  },
  {
    id: 'cost_optimization_report',
    title: 'Cost Optimization Report',
    shortTitle: 'Cost Optimization',
    audience: 'CFO / Operations & Trade Transformation',
    description:
      'Non-overlapping value recovery pipeline separating cash recoveries, non-cash accounting adjustments, avoidable costs, broker variance, and hypothetical scenarios.',
    defaultComparisonType: 'YoY',
    defaultDatasetScope: 'combined_with_hypothetical',
    defaultSections: [
      'str_opportunity_pipeline',
      'trd_broker_reconciliation',
      'trd_agreement_opportunities',
      'str_tariff_scenarios',
      'str_realized_opportunities',
    ],
  },
  {
    id: 'custom_report',
    title: 'Custom Report',
    shortTitle: 'Custom Builder',
    audience: 'Authorized Role-Scoped Analysts',
    description:
      'Start from a clean canvas and assemble any permitted financial, regional, trade, governance, or strategic modules in custom slide order.',
    defaultComparisonType: 'YoY',
    defaultDatasetScope: 'official_case_data',
    defaultSections: ['fin_income_statement', 'reg_irregular_costs', 'gov_investigation_summary'],
  },
];

export interface ReportSectionSpec {
  id: ReportSectionId;
  group: ReportSectionGroup;
  title: string;
  shortLabel: string;
  description: string;
  defaultChartType: ReportChartType;
  supportedChartTypes: ReportChartType[];
  sourceRef: string;
  requiredPermission:
    | 'financial_performance'
    | 'regional_sales'
    | 'irregular_costs_scoped'
    | 'trade_summary'
    | 'tariff_scenarios'
    | 'governance_scoped'
    | 'opportunities_scoped';
  customSlideBuilder?: (slideNumber: number, period: QuarterId) => ReportSlideModel;
}

const INITIAL_SECTION_REGISTRY: ReportSectionSpec[] = [
  // FINANCIAL PERFORMANCE
  {
    id: 'fin_income_statement',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Income Statement Summary',
    shortLabel: 'Income Statement',
    description: 'Sales, variable costs, fixed plant, SG&A, amortization, operating earnings, and margin.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar', 'kpi_grid'],
    sourceRef: 'Appendix 1.1',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_sales_trend',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Eight-Quarter Sales Trend',
    shortLabel: 'Sales Trend',
    description: 'Quarterly CAD sales progression across Q4 2024 – Q3 2026.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'line', 'table'],
    sourceRef: 'Appendix 1.1',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_oe_trend',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Operating Earnings Trend',
    shortLabel: 'OE Trend',
    description: 'Quarterly operating earnings recovery across 8 reported quarters.',
    defaultChartType: 'line',
    supportedChartTypes: ['line', 'bar', 'table'],
    sourceRef: 'Appendix 1.1',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_margin_trend',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Operating Margin (%) Trend',
    shortLabel: 'Margin % Trend',
    description: 'Operating earnings share of sales percentage across Q4 2024 – Q3 2026.',
    defaultChartType: 'line',
    supportedChartTypes: ['line', 'bar', 'table'],
    sourceRef: 'Appendix 1.1',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_yoy_comparison',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Year-over-Year Financial Comparison',
    shortLabel: 'YoY Comparison',
    description: 'Selected quarter vs prior-year quarter variance across all income statement lines.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 1.1 / 1.2',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_qoq_comparison',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Quarter-over-Quarter Financial Comparison',
    shortLabel: 'QoQ Comparison',
    description: 'Sequential quarterly income statement bridge vs prior quarter.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 1.1 / 1.2',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'fin_profit_walk',
    group: 'FINANCIAL PERFORMANCE',
    title: 'Operating Earnings Profit Walk',
    shortLabel: 'Profit Walk',
    description: 'Material variance bridge from starting OE to Q3 2026 CAD 20.7M.',
    defaultChartType: 'waterfall',
    supportedChartTypes: ['waterfall', 'bar', 'table'],
    sourceRef: 'Appendix 1.2 & 2.3',
    requiredPermission: 'financial_performance',
  },
  // REGIONAL INTELLIGENCE
  {
    id: 'reg_sales_by_region',
    group: 'REGIONAL INTELLIGENCE',
    title: 'Sales by Region (Q3 2026 vs Q3 2025)',
    shortLabel: 'Regional Sales',
    description: 'Five-region net sales split reconciling to CAD 329.7M.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 2.1',
    requiredPermission: 'regional_sales',
  },
  {
    id: 'reg_sales_growth',
    group: 'REGIONAL INTELLIGENCE',
    title: 'Regional Sales Growth (YoY % & CAD)',
    shortLabel: 'Regional Growth',
    description: 'Reported year-over-year regional expansion rates and dollar contribution.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 2.1',
    requiredPermission: 'regional_sales',
  },
  {
    id: 'reg_irregular_costs',
    group: 'REGIONAL INTELLIGENCE',
    title: 'Irregular Costs by Region',
    shortLabel: 'Irregular by Region',
    description: 'Scoped irregular cost records aggregated by operating region.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 2.2 / 2.3',
    requiredPermission: 'irregular_costs_scoped',
  },
  {
    id: 'reg_dept_irregular_costs',
    group: 'REGIONAL INTELLIGENCE',
    title: 'Irregular Costs by Department',
    shortLabel: 'Irregular by Dept',
    description: 'Scoped cost anomalies segmented across responsible departments.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 2.2 / 2.3',
    requiredPermission: 'irregular_costs_scoped',
  },
  // TRADE INTELLIGENCE
  {
    id: 'trd_customs_summary',
    group: 'TRADE INTELLIGENCE',
    title: 'Customs Shipment Summary (12 Entries)',
    shortLabel: 'Customs Summary',
    description: 'Detailed Q3 2026 international imports/exports totaling CAD 9.98M goods value.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar'],
    sourceRef: 'Appendix 3.2',
    requiredPermission: 'trade_summary',
  },
  {
    id: 'trd_historical_trends',
    group: 'TRADE INTELLIGENCE',
    title: 'Historical Duty & Trade Cost Trend',
    shortLabel: 'Trade Cost Trend',
    description: 'Eight-quarter rounded trade cost progression reflecting China tariff activation.',
    defaultChartType: 'line',
    supportedChartTypes: ['line', 'bar', 'table'],
    sourceRef: 'Appendix 3.1',
    requiredPermission: 'trade_summary',
  },
  {
    id: 'trd_cost_composition',
    group: 'TRADE INTELLIGENCE',
    title: 'Trade Cost Composition (Exact CAD 736,770)',
    shortLabel: 'Trade Composition',
    description: 'MFN duties, China 25% additional tariffs, DDP export duties, and broker fees.',
    defaultChartType: 'stacked_bar',
    supportedChartTypes: ['stacked_bar', 'bar', 'table'],
    sourceRef: 'Appendix 3.2 & 3.3',
    requiredPermission: 'trade_summary',
  },
  {
    id: 'trd_broker_reconciliation',
    group: 'TRADE INTELLIGENCE',
    title: 'Broker Fee Reconciliation (0.2% Contract)',
    shortLabel: 'Broker Audit',
    description: 'Gross overcharges (CAD 8,260), undercharges (-CAD 2,700), and net variance (+CAD 5,560).',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 3.2 / 3.3',
    requiredPermission: 'trade_summary',
  },
  {
    id: 'trd_agreement_opportunities',
    group: 'TRADE INTELLIGENCE',
    title: 'Trade Agreement & CUSMA Review',
    shortLabel: 'CUSMA / FTA Review',
    description: 'Unclaimed preferential exemption candidates (e.g., E-08 CAD 11,020) awaiting COO verification.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar'],
    sourceRef: 'Appendix 3.2 & Rule 06',
    requiredPermission: 'trade_summary',
  },
  {
    id: 'trd_domestic_separation',
    group: 'TRADE INTELLIGENCE',
    title: 'Domestic Sales Tax & Freight Separation',
    shortLabel: 'Domestic Separation',
    description: 'Interprovincial deliveries separated cleanly from customs duties (Rule 07).',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar'],
    sourceRef: 'Appendix 3.5 & Rule 07',
    requiredPermission: 'trade_summary',
  },
  // FINANCIAL GOVERNANCE
  {
    id: 'gov_investigation_summary',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Investigation Pipeline Summary',
    shortLabel: 'Investigations',
    description: 'Active scoped investigations, workflow stages, owners, and exposure.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar'],
    sourceRef: 'Shared Repository',
    requiredPermission: 'governance_scoped',
  },
  {
    id: 'gov_material_variance_status',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Material Variance Documentation Status',
    shortLabel: 'Material Variances',
    description: 'Rule 03 screening across YoY and QoQ walk lines >= CAD 1.0M.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'kpi_grid'],
    sourceRef: 'Appendix 1.2 & Rule 03',
    requiredPermission: 'financial_performance',
  },
  {
    id: 'gov_outstanding_approvals',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Outstanding Governance Approvals',
    shortLabel: 'Open Approvals',
    description: 'Pending multi-step reclassifications, correction requests, and batch authorizations.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'kpi_grid'],
    sourceRef: 'Governance Queue',
    requiredPermission: 'governance_scoped',
  },
  {
    id: 'gov_gateway_batches',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Data Gateway Batch Outcomes',
    shortLabel: 'Gateway Batches',
    description: 'Ingestion validation counts separating authorized uploads from held records.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'bar'],
    sourceRef: 'Data Gateway Pipeline',
    requiredPermission: 'governance_scoped',
  },
  {
    id: 'gov_quarantined_summary',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Quarantined Record Summary (Excluded)',
    shortLabel: 'Quarantined Items',
    description: 'Records blocked from trusted reporting due to duplicates, missing approvals, or Rules A–H.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'kpi_grid'],
    sourceRef: 'Data Gateway Quarantine',
    requiredPermission: 'governance_scoped',
  },
  {
    id: 'gov_evidence_requirements',
    group: 'FINANCIAL GOVERNANCE',
    title: 'Supporting Evidence Requirements & Gaps',
    shortLabel: 'Evidence Gaps',
    description: 'Missing case records and pending verifications required for audit closure.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'kpi_grid'],
    sourceRef: 'Evidence Repository',
    requiredPermission: 'governance_scoped',
  },
  // STRATEGIC INTELLIGENCE
  {
    id: 'str_tariff_scenarios',
    group: 'STRATEGIC INTELLIGENCE',
    title: 'Tariff Scenario Comparisons (Hypothetical)',
    shortLabel: 'Tariff Scenarios',
    description: 'Saved China tariff rate stress tests (15% / 35% / custom) vs 25% baseline.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Appendix 3.4 & Tariff Simulator',
    requiredPermission: 'tariff_scenarios',
  },
  {
    id: 'str_opportunity_pipeline',
    group: 'STRATEGIC INTELLIGENCE',
    title: 'Cost Opportunity Pipeline (6 Categories)',
    shortLabel: 'Opportunity Pipeline',
    description: 'Non-overlapping recovery, adjustment, avoidance, broker, FTA, and scenario pipeline.',
    defaultChartType: 'bar',
    supportedChartTypes: ['bar', 'table'],
    sourceRef: 'Opportunity Centre',
    requiredPermission: 'opportunities_scoped',
  },
  {
    id: 'str_realized_opportunities',
    group: 'STRATEGIC INTELLIGENCE',
    title: 'Verified & Realized Opportunity Tracking',
    shortLabel: 'Realized Savings',
    description: 'Distinguishes unverified estimates from controller-verified realized amounts.',
    defaultChartType: 'table',
    supportedChartTypes: ['table', 'kpi_grid'],
    sourceRef: 'Opportunity Centre',
    requiredPermission: 'opportunities_scoped',
  },
  {
    id: 'str_quarter_end_readiness',
    group: 'STRATEGIC INTELLIGENCE',
    title: 'Quarter-End Close Readiness Assessment',
    shortLabel: 'Close Readiness',
    description: 'Six deterministic control indicators governing financial close sign-off.',
    defaultChartType: 'kpi_grid',
    supportedChartTypes: ['kpi_grid', 'table'],
    sourceRef: 'Quarter-End Readiness Engine',
    requiredPermission: 'governance_scoped',
  },
];

const EXTRA_REGISTERED_SECTIONS: ReportSectionSpec[] = [];

export function getAllRegisteredSections(): ReportSectionSpec[] {
  return [...INITIAL_SECTION_REGISTRY, ...EXTRA_REGISTERED_SECTIONS];
}

/**
 * Extensibility hook allowing additional reusable sections to be registered without rewriting the builder.
 */
export function registerReportSection(spec: ReportSectionSpec): void {
  if (!getAllRegisteredSections().some((s) => s.id === spec.id)) {
    EXTRA_REGISTERED_SECTIONS.push(spec);
  }
}

export function isSectionPermittedForUser(spec: ReportSectionSpec, user: User): boolean {
  const policy = getReportPermissionPolicy(user);
  if (!policy.canAccessStudio) return false;
  switch (spec.requiredPermission) {
    case 'financial_performance':
      return policy.allowFinancialPerformance;
    case 'regional_sales':
      return policy.allowRegionalSales;
    case 'irregular_costs_scoped':
      return true; // Filtered by filterIrregularCostsForUser
    case 'trade_summary':
      return policy.allowTradeAndCustoms;
    case 'tariff_scenarios':
      return policy.allowTariffScenarios;
    case 'governance_scoped':
      return true;
    case 'opportunities_scoped':
      return true;
  }
}

export function getPermittedSectionsForUser(user: User): ReportSectionSpec[] {
  return getAllRegisteredSections().filter((spec) => isSectionPermittedForUser(spec, user));
}

export function getPermittedTemplatesForUser(user: User): ReportTemplateSpec[] {
  const policy = getReportPermissionPolicy(user);
  return REPORT_TEMPLATES.filter((t) => policy.allowedTemplates.includes(t.id));
}

export function buildDefaultReportConfig(
  templateId: ReportTemplateId,
  user: User,
  overrides?: Partial<ReportConfiguration>
): ReportConfiguration {
  const tpl = REPORT_TEMPLATES.find((t) => t.id === templateId) ?? REPORT_TEMPLATES[0];
  const permittedSectionIds = new Set(getPermittedSectionsForUser(user).map((s) => s.id));
  const rawSections = overrides?.includedSections ?? tpl.defaultSections;
  const scopedSections = rawSections.filter((id) => permittedSectionIds.has(id));
  const finalSections =
    scopedSections.length > 0
      ? scopedSections
      : Array.from(permittedSectionIds).slice(0, 3);

  const nowIso = new Date().toISOString();
  const period = overrides?.reportingPeriod ?? 'Q3 2026';
  const compType = overrides?.comparisonType ?? tpl.defaultComparisonType;
  const periodMeta = REPORTING_PERIODS.find((p) => p.id === period);

  return {
    id: overrides?.id ?? `rep-${templateId}-${Date.now()}`,
    title: overrides?.title ?? `${period} ${tpl.title}`,
    subtitle: overrides?.subtitle ?? `${tpl.audience} · ${getReportPermissionPolicy(user).scopeTitle}`,
    templateId: tpl.id,
    reportingPeriod: period,
    comparisonType: compType,
    comparisonPeriod:
      overrides?.comparisonPeriod ??
      (compType === 'YoY'
        ? periodMeta?.priorYearQuarterId
        : compType === 'QoQ'
          ? periodMeta?.priorQuarterId
          : undefined),
    regionFilter: overrides?.regionFilter ?? 'all',
    departmentFilter: overrides?.departmentFilter ?? 'all',
    datasetScope: overrides?.datasetScope ?? tpl.defaultDatasetScope,
    includedSections: finalSections,
    sectionChartOverrides: overrides?.sectionChartOverrides ?? {},
    sectionMetricIds: overrides?.sectionMetricIds ?? {},
    managementCommentary: overrides?.managementCommentary ?? '',
    aiExecutiveSummary: overrides?.aiExecutiveSummary,
    focusedRecordIds: overrides?.focusedRecordIds ?? [],
    ownerUserId: user.id,
    authorName: `${user.name} (${user.title})`,
    createdAtIso: overrides?.createdAtIso ?? nowIso,
    modifiedAtIso: nowIso,
    configMode: 'live_configuration',
    status: overrides?.status ?? 'saved',
  };
}

export interface ReportKpiMetric {
  id: string;
  label: string;
  compactValue: string;
  exactValue: string;
  subtext: string;
  provenance: string;
}

export interface ReportChartSeries {
  name: string;
  values: number[];
  colorHex: string;
}

export interface ReportChartModel {
  kind: ReportChartType;
  title: string;
  unitLabel: string;
  categories: string[];
  series: ReportChartSeries[];
  waterfallSteps?: {
    label: string;
    bucket: string;
    deltaCad: number;
    startCad: number;
    endCad: number;
    isEndpoint: boolean;
  }[];
  chartLimitationNote?: string;
}

export interface ReportTableModel {
  headers: string[];
  rows: (string | number)[][];
  numericColumnIndices: number[];
}

export type ReportSlideLayoutKind =
  | 'cover'
  | 'executive_kpi'
  | 'trend_chart'
  | 'comparison_chart'
  | 'waterfall'
  | 'regional'
  | 'trade_breakdown'
  | 'investigations'
  | 'opportunities'
  | 'readiness'
  | 'table'
  | 'recommendations'
  | 'sources_assumptions';

export interface ReportSlideModel {
  id: string;
  slideNumber: number;
  sectionId?: ReportSectionId;
  layoutKind: ReportSlideLayoutKind;
  title: string;
  subtitle: string;
  provenanceTag: string;
  sourceRef: string;
  unavailableReason?: string;
  kpis?: ReportKpiMetric[];
  chart?: ReportChartModel;
  table?: ReportTableModel;
  bullets?: string[];
  calloutNote?: string;
}

export interface BuiltReportModel {
  config: ReportConfiguration;
  currency: CurrencyCode;
  policy: ReportPermissionPolicy;
  generatedAtIso: string;
  datasetScopeLabel: string;
  availableKpiOptions: ReportKpiMetric[];
  selectedKpis: ReportKpiMetric[];
  slides: ReportSlideModel[];
  sourceRecordRefs: string[];
  scopedData: {
    incomeStatements: typeof INCOME_STATEMENTS;
    irregularCosts: IrregularCost[];
    customsEntries: CustomsEntry[];
    savedScenarios: SavedScenario[];
    opportunities: CostOpportunity[];
    quarantinedCount: number;
    authorizedLedgerCount: number;
    authorizedCustomsCount: number;
  };
}

export const DATASET_SCOPE_LABELS: Record<ReportDatasetScope, string> = {
  official_case_data: 'Official Competition Case Data Only',
  authorized_uploads_included: 'Official Case Data + Authorized Uploads (Separate)',
  combined_with_hypothetical: 'Official + Authorized Uploads + Hypothetical Scenarios',
};

function mapSlideLayoutKind(sectionId: ReportSectionId, chartType: ReportChartType): ReportSlideLayoutKind {
  if (chartType === 'waterfall' || sectionId === 'fin_profit_walk') return 'waterfall';
  if (sectionId === 'fin_sales_trend' || sectionId === 'fin_oe_trend' || sectionId === 'fin_margin_trend' || sectionId === 'trd_historical_trends') {
    return chartType === 'table' ? 'table' : 'trend_chart';
  }
  if (sectionId === 'fin_yoy_comparison' || sectionId === 'fin_qoq_comparison') {
    return chartType === 'table' ? 'table' : 'comparison_chart';
  }
  if (sectionId.startsWith('reg_')) return chartType === 'table' ? 'table' : 'regional';
  if (sectionId.startsWith('trd_')) return chartType === 'table' ? 'table' : 'trade_breakdown';
  if (sectionId === 'gov_investigation_summary') return 'investigations';
  if (sectionId === 'str_opportunity_pipeline' || sectionId === 'str_realized_opportunities') return 'opportunities';
  if (sectionId === 'str_quarter_end_readiness') return 'readiness';
  if (sectionId === 'str_tariff_scenarios') return chartType === 'table' ? 'table' : 'comparison_chart';
  return 'table';
}

export function buildReportRenderModel(
  rawConfig: ReportConfiguration,
  state: PersistedWorkspaceState,
  user: User,
  currency: CurrencyCode = 'CAD'
): BuiltReportModel {
  const fMoney = (cad: number, opts?: { showSign?: boolean }) =>
    formatReportingMoney(cad, currency, opts);
  const fCompact = (cad: number, opts?: { showSign?: boolean }) =>
    formatReportingCompact(cad, currency, opts);
  const policy = getReportPermissionPolicy(user);
  const generatedAtIso = new Date().toISOString();
  const sectionSpecsMap = new Map(getAllRegisteredSections().map((s) => [s.id, s]));

  // Enforce permission filtering at data retrieval & section level (never UI-only!)
  const permittedSections = rawConfig.includedSections.filter((secId) => {
    const spec = sectionSpecsMap.get(secId);
    return spec ? isSectionPermittedForUser(spec, user) : false;
  });

  const config: ReportConfiguration = {
    ...rawConfig,
    includedSections: permittedSections,
  };

  const period = config.reportingPeriod;
  const periodMeta = REPORTING_PERIODS.find((p) => p.id === period) ?? REPORTING_PERIODS[7];
  const stmt = INCOME_STATEMENTS.find((s) => s.quarterId === period) ?? INCOME_STATEMENTS[7];
  const priorYearStmt = periodMeta.priorYearQuarterId
    ? INCOME_STATEMENTS.find((s) => s.quarterId === periodMeta.priorYearQuarterId)
    : undefined;
  const priorQtrStmt = periodMeta.priorQuarterId
    ? INCOME_STATEMENTS.find((s) => s.quarterId === periodMeta.priorQuarterId)
    : undefined;

  const baseIrregularCosts = filterIrregularCostsForUser(user, IRREGULAR_COSTS).filter((c) => {
    if (config.regionFilter !== 'all' && c.regionId !== config.regionFilter) return false;
    if (config.departmentFilter !== 'all' && c.department !== config.departmentFilter) return false;
    if (config.focusedRecordIds?.length && !config.focusedRecordIds.includes(c.id)) {
      // If focusedRecordIds are strictly IR records, honor focus filter
      if (config.focusedRecordIds.some((id) => id.startsWith('IR-'))) return false;
    }
    return true;
  });

  const periodIrregularCosts = periodMeta.hasIrregularCostBreakdown ? baseIrregularCosts : [];
  const baseCustoms = policy.allowTradeAndCustoms ? filterCustomsEntriesForUser(user, CUSTOMS_ENTRIES) : [];
  const periodCustoms = periodMeta.hasDetailedCustomsEntries
    ? baseCustoms.filter((e) => {
        if (config.focusedRecordIds?.length && config.focusedRecordIds.some((id) => id.startsWith('E-'))) {
          return config.focusedRecordIds.includes(e.id);
        }
        return true;
      })
    : [];

  const includeAuthorizedUploads = config.datasetScope !== 'official_case_data';
  const includeHypothetical = config.datasetScope === 'combined_with_hypothetical';

  const authorizedLedger = includeAuthorizedUploads
    ? state.uploadedLedgerTransactions.filter((t) => {
        if (user.roleId === 'trade_coordinator') {
          return t.department === 'Customs and Trade' || t.department === 'Logistics';
        }
        if (config.regionFilter !== 'all' && t.regionId !== config.regionFilter) return false;
        if (config.departmentFilter !== 'all' && t.department !== config.departmentFilter) return false;
        return t.accountingPeriod === period;
      })
    : [];

  const authorizedCustoms = includeAuthorizedUploads && policy.allowTradeAndCustoms
    ? state.uploadedCustomsRecords.filter((c) => c.accountingPeriod === period)
    : [];

  const openQuarantined = state.reviewQueueItems.filter(
    (q) => q.reviewStatus !== 'Approved' && q.reviewStatus !== 'Rejected' && q.reviewStatus !== 'Resolved'
  );

  const scopedInvestigations = state.investigations.filter((inv) => {
    if (user.roleId === 'trade_coordinator') {
      return inv.department === 'Customs and Trade' || inv.department === 'Logistics';
    }
    if (config.regionFilter !== 'all' && inv.regionId !== config.regionFilter) return false;
    if (config.departmentFilter !== 'all' && inv.department !== config.departmentFilter) return false;
    return true;
  });

  const scopedOpportunities = buildCostOpportunities(state, user).filter((opp) =>
    includeHypothetical ? true : opp.category !== 'hypothetical_tariff_scenario'
  );
  const oppAnalytics = computeOpportunityAnalytics(scopedOpportunities);
  const readiness = computeQuarterEndReadiness(state, user, period, currency);
  const scopedScenarios =
    policy.allowTariffScenarios && includeHypothetical ? state.savedScenarios : [];

  // Available KPI options (strictly role-scoped & period-honest)
  const availableKpiOptions: ReportKpiMetric[] = [];
  if (policy.allowFinancialPerformance) {
    const oeYoyDelta = priorYearStmt ? stmt.operatingEarningsCad - priorYearStmt.operatingEarningsCad : null;
    const oeQoqDelta = priorQtrStmt ? stmt.operatingEarningsCad - priorQtrStmt.operatingEarningsCad : null;
    availableKpiOptions.push(
      {
        id: 'kpi_sales',
        label: `${period} Sales`,
        compactValue: fCompact(stmt.salesCad),
        exactValue: fMoney(stmt.salesCad),
        subtext: priorYearStmt
          ? `YoY ${fMoney(stmt.salesCad - priorYearStmt.salesCad, { showSign: true })}`
          : 'Appendix 1.1',
        provenance: 'Official Case Data',
      },
      {
        id: 'kpi_oe',
        label: `${period} Operating Earnings`,
        compactValue: fCompact(stmt.operatingEarningsCad),
        exactValue: fMoney(stmt.operatingEarningsCad),
        subtext:
          oeYoyDelta !== null
            ? `YoY ${fMoney(oeYoyDelta, { showSign: true })}${oeQoqDelta !== null ? ` · QoQ ${fMoney(oeQoqDelta, { showSign: true })}` : ''}`
            : 'Appendix 1.1',
        provenance: 'Official Case Data',
      },
      {
        id: 'kpi_margin',
        label: `${period} OE Margin`,
        compactValue: `${calculateOperatingMarginPct(stmt.operatingEarningsCad, stmt.salesCad).toFixed(1)}%`,
        exactValue: `${stmt.oeShareOfSalesPct.toFixed(1)}% reported`,
        subtext: priorQtrStmt
          ? `vs ${priorQtrStmt.oeShareOfSalesPct.toFixed(1)}% in ${priorQtrStmt.quarterId}`
          : 'Appendix 1.1',
        provenance: 'Derived Calculation',
      }
    );
  }

  const irregularSumCad = periodIrregularCosts.reduce((s, c) => s + c.amountCad, 0);
  availableKpiOptions.push({
    id: 'kpi_irregular',
    label: periodMeta.hasIrregularCostBreakdown ? `Irregular Costs (${period})` : `Irregular Costs (${period})`,
    compactValue: periodMeta.hasIrregularCostBreakdown ? fCompact(irregularSumCad) : 'N/A',
    exactValue: periodMeta.hasIrregularCostBreakdown
      ? `${fMoney(irregularSumCad)} (${periodIrregularCosts.length} records)`
      : `Not supplied in Appendix for ${period}`,
    subtext: periodMeta.hasIrregularCostBreakdown
      ? `${periodIrregularCosts.length} scoped cost record(s)`
      : 'Detailed breakdown supplied for Q3 2026',
    provenance: 'Official Case Data',
  });

  if (policy.allowTradeAndCustoms) {
    const exactTradeCad = periodCustoms.reduce(
      (s, e) => s + e.totalDutyAndTariffCad + e.brokerFeeChargedCad,
      0
    );
    const grossOvercharge = periodCustoms.reduce(
      (s, e) => s + Math.max(0, e.brokerFeeChargedCad - calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2)),
      0
    );
    const netVariance = periodCustoms.reduce(
      (s, e) => s + (e.brokerFeeChargedCad - calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2)),
      0
    );
    const histTrade = HISTORICAL_TRADE_COSTS.find((h) => h.quarterId === period);

    availableKpiOptions.push(
      {
        id: 'kpi_trade_cost',
        label: periodMeta.hasDetailedCustomsEntries ? 'Exact Trade Costs' : `Trade Costs (${period} Rounded)`,
        compactValue: periodMeta.hasDetailedCustomsEntries
          ? fCompact(exactTradeCad)
          : histTrade
            ? fCompact(histTrade.totalRoundedCad)
            : 'N/A',
        exactValue: periodMeta.hasDetailedCustomsEntries
          ? `${fMoney(exactTradeCad)} (${periodCustoms.length} entries)`
          : histTrade
            ? `${fMoney(histTrade.totalRoundedCad)} rounded (Appendix 3.1)`
            : 'Unavailable',
        subtext: periodMeta.hasDetailedCustomsEntries
          ? `Duties ${fMoney(711_250)} + Broker ${fMoney(25_520)}`
          : 'Detailed entry table supplied for Q3 2026',
        provenance: 'Official Case Data',
      },
      {
        id: 'kpi_broker_variance',
        label: 'Broker Contract Variance',
        compactValue: periodMeta.hasDetailedCustomsEntries ? fCompact(grossOvercharge) : 'N/A',
        exactValue: periodMeta.hasDetailedCustomsEntries
          ? `Gross +${fMoney(grossOvercharge)} · Net +${fMoney(netVariance)}`
          : `Not supplied for ${period}`,
        subtext: periodMeta.hasDetailedCustomsEntries ? 'vs 0.2% contract clause' : 'Q3 2026 detailed audit',
        provenance: 'Rule 04 Audit',
      }
    );
  }

  availableKpiOptions.push({
    id: 'kpi_quarantine_blockers',
    label: 'Open Governance Items',
    compactValue: `${readiness.totalBlockingCount}`,
    exactValue: `${readiness.totalBlockingCount} open · ${openQuarantined.length} quarantined`,
    subtext: `Quarantined records excluded from totals`,
    provenance: 'Governance Controls',
  });

  const chosenMetricIds = config.sectionMetricIds?.fin_income_statement;
  const selectedKpis =
    chosenMetricIds && chosenMetricIds.length > 0
      ? availableKpiOptions.filter((k) => chosenMetricIds.includes(k.id))
      : availableKpiOptions.slice(0, 6);

  // Build normalized slides array
  const slides: ReportSlideModel[] = [];
  let slideCounter = 1;

  // Slide 1: Cover Slide
  slides.push({
    id: 'slide-cover',
    slideNumber: slideCounter++,
    layoutKind: 'cover',
    title: config.title || 'SKYJACK Financial Intelligence Executive Report',
    subtitle:
      config.subtitle ||
      `${period} · ${DATASET_SCOPE_LABELS[config.datasetScope]}`,
    provenanceTag: 'Fictional Competition Case Data · Team Group 12',
    sourceRef: `Prepared by ${config.authorName} · Reporting Currency: ${currency}`,
    bullets: [
      `Reporting Period: ${period}${config.comparisonPeriod ? ` (vs ${config.comparisonPeriod} ${config.comparisonType})` : ''}`,
      `Filter Scope: Region = ${config.regionFilter === 'all' ? 'All Regions' : config.regionFilter} · Dept = ${config.departmentFilter === 'all' ? 'All Departments' : config.departmentFilter}`,
      `Dataset Scope: ${DATASET_SCOPE_LABELS[config.datasetScope]}`,
      `Included Modules: ${config.includedSections.length} selected section(s)`,
    ],
  });

  // Slide 2: Executive KPI Summary
  slides.push({
    id: 'slide-kpi-summary',
    slideNumber: slideCounter++,
    layoutKind: 'executive_kpi',
    title: `Executive KPI Summary — ${period}`,
    subtitle: `${policy.scopeTitle} · ${DATASET_SCOPE_LABELS[config.datasetScope]}`,
    provenanceTag: 'Authoritative Shared Repository',
    sourceRef: 'Appendix 1.1–3.5 & Governance State',
    kpis: selectedKpis,
    calloutNote:
      includeAuthorizedUploads && (authorizedLedger.length > 0 || authorizedCustoms.length > 0)
        ? `Authorized Uploads Active (Tracked Separately): ${authorizedLedger.length} ledger row(s) (${fMoney(authorizedLedger.reduce((s, r) => s + r.amountCad, 0))}) and ${authorizedCustoms.length} customs row(s). ${openQuarantined.length} quarantined item(s) excluded.`
        : `Quarantined Data Gateway items (${openQuarantined.length}) remain strictly excluded from all financial aggregates.`,
  });

  // Build one slide per enabled & permitted section
  for (const sectionId of config.includedSections) {
    const spec = sectionSpecsMap.get(sectionId);
    if (!spec) continue;
    const chartType = config.sectionChartOverrides?.[sectionId] ?? spec.defaultChartType;
    const layoutKind = mapSlideLayoutKind(sectionId, chartType);
    const slide = buildSectionSlide({
      slideNumber: slideCounter++,
      sectionId,
      spec,
      chartType,
      layoutKind,
      config,
      currency,
      policy,
      state,
      period,
      periodMeta,
      stmt,
      priorYearStmt,
      priorQtrStmt,
      periodIrregularCosts,
      periodCustoms,
      authorizedLedger,
      authorizedCustoms,
      openQuarantined,
      scopedInvestigations,
      scopedOpportunities,
      oppAnalytics,
      readiness,
      scopedScenarios,
    });
    slides.push(slide);
  }

  // Optional Reviewed AI Executive Summary slide (ONLY if explicitly approved by human!)
  if (config.aiExecutiveSummary && config.aiExecutiveSummary.reviewedAndApprovedForExport) {
    slides.push({
      id: 'slide-ai-summary',
      slideNumber: slideCounter++,
      layoutKind: 'recommendations',
      title: 'Executive Commentary & Synthesis (Human-Reviewed AI)',
      subtitle: config.aiExecutiveSummary.executiveHeadline,
      provenanceTag: `AI-Generated Interpretation · Reviewed by ${user.name} (${config.aiExecutiveSummary.modelName})`,
      sourceRef: config.aiExecutiveSummary.limitationsNote,
      bullets: [
        `Financial Performance: ${config.aiExecutiveSummary.financialPerformanceCommentary}`,
        `Investigations & Risk: ${config.aiExecutiveSummary.investigationSummary}`,
        `Quarter-End Readiness: ${config.aiExecutiveSummary.quarterEndBriefing}`,
        ...config.aiExecutiveSummary.suggestedActions.map((a) => `Recommended Action: ${a}`),
      ],
      calloutNote: config.aiExecutiveSummary.hypotheticalDisclaimer,
    });
  }

  // Human Management Commentary & Next Steps (if provided or always conclude cleanly)
  if (config.managementCommentary?.trim()) {
    slides.push({
      id: 'slide-management-commentary',
      slideNumber: slideCounter++,
      layoutKind: 'recommendations',
      title: 'Management Commentary & Next Steps',
      subtitle: `Authored by ${config.authorName}`,
      provenanceTag: 'Human-Authored Management Commentary',
      sourceRef: 'Executive Review Sign-Off Notes',
      bullets: config.managementCommentary
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
  }

  // Final Slide: Supporting Data, Boundaries & Sources
  slides.push({
    id: 'slide-sources-assumptions',
    slideNumber: slideCounter++,
    layoutKind: 'sources_assumptions',
    title: 'Supporting Data, Boundaries & Assumptions',
    subtitle: 'Data Integrity, Fictional Case Disclosure & Reporting Scope',
    provenanceTag: 'SKYJACK Financial Intelligence Governance Charter',
    sourceRef: 'Prompt to Pitch 2026 Case & Appendix 1.1–4.1',
    bullets: [
      `Competition Disclosure: All financial, operational, supplier, and customs values originate from fictional SKYJACK Prompt to Pitch 2026 competition case materials (authoritative values stored in CAD${currency === 'USD' ? `; displayed in USD using static demonstration FX rate 1 CAD = ${DEMO_CAD_TO_USD_RATE} USD` : ''}).`,
      `Active Scope: ${DATASET_SCOPE_LABELS[config.datasetScope]} | Role Scope: ${policy.scopeTitle}.`,
      `Quarantine Firewall: ${openQuarantined.length} quarantined Data Gateway item(s) are strictly excluded from sales, operating earnings, trade cost totals, and opportunity estimates.`,
      `Financial Distinctions: Potential cash recoveries, non-cash accounting adjustments (e.g., IR-02 ${fCompact(600_000)}, IR-06 ${fCompact(410_000)}), avoidable operating costs (IR-01 ${fCompact(900_000)}), unconfirmed FTA exemptions (E-08 ${fMoney(11_020)}), and hypothetical tariff scenarios (Appendix 3.4) are never summed blindly into guaranteed savings.`,
      'Authorized partial uploaded ledger records are displayed separately from reported historical Appendix income statements.',
    ],
  });

  const sourceRecordRefs = Array.from(
    new Set([
      ...periodIrregularCosts.map((c) => c.id),
      ...periodCustoms.map((e) => e.id),
      ...scopedScenarios.map((s) => s.id),
      ...authorizedLedger.map((t) => t.transactionId),
      ...authorizedCustoms.map((c) => c.entryId),
    ])
  );

  return {
    config,
    currency,
    policy,
    generatedAtIso,
    datasetScopeLabel: DATASET_SCOPE_LABELS[config.datasetScope],
    availableKpiOptions,
    selectedKpis,
    slides,
    sourceRecordRefs,
    scopedData: {
      incomeStatements: policy.allowFinancialPerformance ? INCOME_STATEMENTS : [],
      irregularCosts: periodIrregularCosts,
      customsEntries: periodCustoms,
      savedScenarios: scopedScenarios,
      opportunities: scopedOpportunities,
      quarantinedCount: openQuarantined.length,
      authorizedLedgerCount: authorizedLedger.length,
      authorizedCustomsCount: authorizedCustoms.length,
    },
  };
}

function buildSectionSlide(ctx: {
  slideNumber: number;
  sectionId: ReportSectionId;
  spec: ReportSectionSpec;
  chartType: ReportChartType;
  layoutKind: ReportSlideLayoutKind;
  config: ReportConfiguration;
  currency: CurrencyCode;
  policy: ReportPermissionPolicy;
  state: PersistedWorkspaceState;
  period: QuarterId;
  periodMeta: (typeof REPORTING_PERIODS)[number];
  stmt: (typeof INCOME_STATEMENTS)[number];
  priorYearStmt?: (typeof INCOME_STATEMENTS)[number];
  priorQtrStmt?: (typeof INCOME_STATEMENTS)[number];
  periodIrregularCosts: IrregularCost[];
  periodCustoms: CustomsEntry[];
  authorizedLedger: PersistedWorkspaceState['uploadedLedgerTransactions'];
  authorizedCustoms: PersistedWorkspaceState['uploadedCustomsRecords'];
  openQuarantined: PersistedWorkspaceState['reviewQueueItems'];
  scopedInvestigations: PersistedWorkspaceState['investigations'];
  scopedOpportunities: CostOpportunity[];
  oppAnalytics: ReturnType<typeof computeOpportunityAnalytics>;
  readiness: ReturnType<typeof computeQuarterEndReadiness>;
  scopedScenarios: SavedScenario[];
}): ReportSlideModel {
  const {
    slideNumber,
    sectionId,
    spec,
    chartType,
    layoutKind,
    currency,
    period,
    periodMeta,
    stmt,
    priorYearStmt,
    priorQtrStmt,
    periodIrregularCosts,
    periodCustoms,
    authorizedLedger,
    openQuarantined,
    scopedInvestigations,
    scopedOpportunities,
    oppAnalytics,
    readiness,
    scopedScenarios,
  } = ctx;

  const fMoney = (cad: number, opts?: { showSign?: boolean }) =>
    formatReportingMoney(cad, currency, opts);
  const fCompact = (cad: number, opts?: { showSign?: boolean }) =>
    formatReportingCompact(cad, currency, opts);
  const toM = (cad: number, dec = 1) => Number((convertFromCad(cad, currency) / 1e6).toFixed(dec));
  const toK = (cad: number, dec = 1) => Number((convertFromCad(cad, currency) / 1000).toFixed(dec));
  const toU = (cad: number) => convertFromCad(cad, currency);

  if (spec.customSlideBuilder) {
    return spec.customSlideBuilder(slideNumber, period);
  }

  const base: Omit<ReportSlideModel, 'layoutKind'> = {
    id: `slide-${sectionId}`,
    slideNumber,
    sectionId,
    title: spec.title,
    subtitle: `${period} · ${spec.description}`,
    provenanceTag: 'Official Case & Deterministic Analytics',
    sourceRef: spec.sourceRef,
  };

  switch (sectionId) {
    case 'fin_income_statement': {
      const margin = calculateOperatingMarginPct(stmt.operatingEarningsCad, stmt.salesCad);
      const rows: (string | number)[][] = [
        ['Sales Revenue', fMoney(stmt.salesCad), '100.0%', priorYearStmt ? fMoney(priorYearStmt.salesCad) : 'N/A'],
        ['Variable Costs', fMoney(stmt.variableCostsCad), `${((stmt.variableCostsCad / stmt.salesCad) * 100).toFixed(1)}%`, priorYearStmt ? fMoney(priorYearStmt.variableCostsCad) : 'N/A'],
        ['Fixed Plant Costs', fMoney(stmt.fixedPlantCostsCad), `${((stmt.fixedPlantCostsCad / stmt.salesCad) * 100).toFixed(1)}%`, priorYearStmt ? fMoney(priorYearStmt.fixedPlantCostsCad) : 'N/A'],
        ['SG&A Expenses', fMoney(stmt.sgaCad), `${((stmt.sgaCad / stmt.salesCad) * 100).toFixed(1)}%`, priorYearStmt ? fMoney(priorYearStmt.sgaCad) : 'N/A'],
        ['Amortization', fMoney(stmt.amortizationCad), `${((stmt.amortizationCad / stmt.salesCad) * 100).toFixed(1)}%`, priorYearStmt ? fMoney(priorYearStmt.amortizationCad) : 'N/A'],
        ['Operating Earnings', fMoney(stmt.operatingEarningsCad), `${margin.toFixed(1)}%`, priorYearStmt ? fMoney(priorYearStmt.operatingEarningsCad) : 'N/A'],
      ];
      return {
        ...base,
        layoutKind,
        kpis: [
          { id: 's', label: 'Sales', compactValue: fCompact(stmt.salesCad), exactValue: fMoney(stmt.salesCad), subtext: period, provenance: 'Appendix 1.1' },
          { id: 'oe', label: 'Operating Earnings', compactValue: fCompact(stmt.operatingEarningsCad), exactValue: fMoney(stmt.operatingEarningsCad), subtext: `Margin ${margin.toFixed(1)}%`, provenance: 'Appendix 1.1' },
        ],
        chart:
          chartType === 'bar'
            ? {
                kind: 'bar',
                title: `${period} Cost Structure vs Operating Earnings (${currency} Millions)`,
                unitLabel: `${currency} Millions`,
                categories: ['Sales', 'Variable', 'Fixed Plant', 'SG&A', 'Amort.', 'Op. Earnings'],
                series: [
                  {
                    name: period,
                    values: [
                      toM(stmt.salesCad, 2),
                      toM(stmt.variableCostsCad, 2),
                      toM(stmt.fixedPlantCostsCad, 2),
                      toM(stmt.sgaCad, 2),
                      toM(stmt.amortizationCad, 2),
                      toM(stmt.operatingEarningsCad, 2),
                    ],
                    colorHex: '#231F20',
                  },
                ],
              }
            : undefined,
        table: {
          headers: ['Line Item', `${period} (${currency})`, '% of Sales', priorYearStmt ? `${priorYearStmt.quarterId} (${currency})` : 'Prior Year'],
          rows,
          numericColumnIndices: [1, 2, 3],
        },
        calloutNote:
          authorizedLedger.length > 0
            ? `Note: ${authorizedLedger.length} authorized uploaded ledger transaction(s) (${fMoney(authorizedLedger.reduce((s, r) => s + r.amountCad, 0))}) are tracked separately and not added to Appendix 1.1 reported OE.`
            : undefined,
      };
    }

    case 'fin_sales_trend':
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType,
          title: `Quarterly Sales Revenue (Q4 2024 – Q3 2026, ${currency} Millions)`,
          unitLabel: `${currency} Millions`,
          categories: INCOME_STATEMENTS.map((s) => s.quarterId),
          series: [
            {
              name: `Sales (${currency} M)`,
              values: INCOME_STATEMENTS.map((s) => toM(s.salesCad, 1)),
              colorHex: '#231F20',
            },
          ],
        },
        table: {
          headers: ['Quarter', `Sales (${currency})`, `OE (${currency})`, 'OE Margin %'],
          rows: INCOME_STATEMENTS.map((s) => [s.quarterId, fMoney(s.salesCad), fMoney(s.operatingEarningsCad), `${s.oeShareOfSalesPct.toFixed(1)}%`]),
          numericColumnIndices: [1, 2, 3],
        },
      };

    case 'fin_oe_trend':
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType,
          title: `Quarterly Operating Earnings (Q4 2024 – Q3 2026, ${currency} Millions)`,
          unitLabel: `${currency} Millions`,
          categories: INCOME_STATEMENTS.map((s) => s.quarterId),
          series: [
            {
              name: `Operating Earnings (${currency} M)`,
              values: INCOME_STATEMENTS.map((s) => toM(s.operatingEarningsCad, 1)),
              colorHex: '#E53C2E',
            },
          ],
        },
        table: {
          headers: ['Quarter', `Operating Earnings (${currency})`, `Sales (${currency})`, 'Margin %'],
          rows: INCOME_STATEMENTS.map((s) => [s.quarterId, fMoney(s.operatingEarningsCad), fMoney(s.salesCad), `${s.oeShareOfSalesPct.toFixed(1)}%`]),
          numericColumnIndices: [1, 2, 3],
        },
      };

    case 'fin_margin_trend':
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType,
          title: 'Operating Earnings Margin % (Q4 2024 – Q3 2026)',
          unitLabel: 'Percent (%)',
          categories: INCOME_STATEMENTS.map((s) => s.quarterId),
          series: [
            {
              name: 'OE Margin %',
              values: INCOME_STATEMENTS.map((s) => s.oeShareOfSalesPct),
              colorHex: '#E53C2E',
            },
          ],
        },
        table: {
          headers: ['Quarter', 'Reported OE %', 'Computed Margin %', `Operating Earnings (${currency})`],
          rows: INCOME_STATEMENTS.map((s) => [
            s.quarterId,
            `${s.oeShareOfSalesPct.toFixed(1)}%`,
            `${calculateOperatingMarginPct(s.operatingEarningsCad, s.salesCad).toFixed(1)}%`,
            fMoney(s.operatingEarningsCad),
          ]),
          numericColumnIndices: [1, 2, 3],
        },
      };

    case 'fin_yoy_comparison':
    case 'fin_qoq_comparison': {
      const compStmt = sectionId === 'fin_yoy_comparison' ? priorYearStmt : priorQtrStmt;
      if (!compStmt) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `No ${sectionId === 'fin_yoy_comparison' ? 'prior-year' : 'prior-quarter'} comparison period is supplied in Appendix 1.1 for ${period}.`,
          bullets: [`Selected Period: ${period}`, 'Comparison Basis: Unavailable in Appendix 1.1.'],
        };
      }
      const lines = [
        { label: 'Sales', cur: stmt.salesCad, prev: compStmt.salesCad },
        { label: 'Variable Costs', cur: stmt.variableCostsCad, prev: compStmt.variableCostsCad },
        { label: 'Fixed Plant', cur: stmt.fixedPlantCostsCad, prev: compStmt.fixedPlantCostsCad },
        { label: 'SG&A', cur: stmt.sgaCad, prev: compStmt.sgaCad },
        { label: 'Operating Earnings', cur: stmt.operatingEarningsCad, prev: compStmt.operatingEarningsCad },
      ];
      return {
        ...base,
        layoutKind,
        title: `${period} vs ${compStmt.quarterId} (${sectionId === 'fin_yoy_comparison' ? 'YoY' : 'QoQ'})`,
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `${compStmt.quarterId} vs ${period} (${currency} Millions)`,
          unitLabel: `${currency} Millions`,
          categories: lines.map((l) => l.label),
          series: [
            { name: compStmt.quarterId, values: lines.map((l) => toM(l.prev, 1)), colorHex: '#7E8082' },
            { name: period, values: lines.map((l) => toM(l.cur, 1)), colorHex: '#231F20' },
          ],
        },
        table: {
          headers: ['Metric', compStmt.quarterId, period, `Variance (${currency})`],
          rows: lines.map((l) => [l.label, fMoney(l.prev), fMoney(l.cur), fMoney(l.cur - l.prev, { showSign: true })]),
          numericColumnIndices: [1, 2, 3],
        },
      };
    }

    case 'fin_profit_walk': {
      const walkType = ctx.config.comparisonType === 'QoQ' ? 'QoQ' : 'YoY';
      if (period !== 'Q3 2026') {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Detailed Operating Earnings Profit Walk (Appendix 1.2) is supplied only for Q3 2026 (YoY and QoQ). Selected period: ${period}.`,
          bullets: [`Income statement totals for ${period} remain available in the Financial Performance trend slides.`],
        };
      }
      const walk = OPERATING_EARNINGS_WALKS.find((w) => w.comparisonType === walkType) ?? OPERATING_EARNINGS_WALKS[0];
      let running = 0;
      const waterfallSteps = walk.entries.map((entry) => {
        const isStart = entry.bucket === 'Start';
        const isEnd = entry.bucket === 'End';
        if (isStart) {
          running = entry.amountCad;
          return { label: entry.stepLabel, bucket: entry.bucket, deltaCad: entry.amountCad, startCad: 0, endCad: running, isEndpoint: true };
        }
        if (isEnd) {
          return { label: entry.stepLabel, bucket: entry.bucket, deltaCad: entry.amountCad, startCad: 0, endCad: entry.amountCad, isEndpoint: true };
        }
        const prev = running;
        running += entry.amountCad;
        return { label: entry.stepLabel, bucket: entry.bucket, deltaCad: entry.amountCad, startCad: prev, endCad: running, isEndpoint: false };
      });
      return {
        ...base,
        layoutKind: chartType === 'table' ? 'table' : 'waterfall',
        title: `${walk.title}`,
        chart: {
          kind: chartType,
          title: `${walk.title} (${currency} Millions)`,
          unitLabel: `${currency} Millions`,
          categories: walk.entries.map((e) => e.stepLabel),
          series: [
            {
              name: `Bridge Impact (${currency} M)`,
              values: walk.entries.map((e) => toM(e.amountCad, 2)),
              colorHex: '#E53C2E',
            },
          ],
          waterfallSteps,
          chartLimitationNote:
            'PPTX Export Note: Because PptxGenJS does not provide a native waterfall chart primitive, the PowerPoint slide renders floating proportional editable shapes and native bridge labels backed by the exact table values.',
        },
        table: {
          headers: ['Walk Step', 'Bucket', `Amount (${currency})`, 'Material (Rule 03)'],
          rows: walk.entries.map((e) => [
            e.stepLabel,
            e.bucket,
            fMoney(e.amountCad, { showSign: e.bucket !== 'Start' && e.bucket !== 'End' }),
            e.bucket === 'Start' || e.bucket === 'End' ? 'Endpoint' : Math.abs(e.amountCad) >= 1_000_000 ? 'Yes (Rule 03)' : 'No',
          ]),
          numericColumnIndices: [2],
        },
      };
    }

    case 'reg_sales_by_region':
    case 'reg_sales_growth': {
      if (!periodMeta.hasRegionalSalesBreakdown) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Regional sales breakdown (Appendix 2.1) is supplied only for Q3 2026 vs Q3 2025. Selected period (${period}) has company-level totals only.`,
          bullets: [`Q3 2026 Regional Sales sum identically to ${fMoney(329_700_000)} when Q3 2026 is selected.`],
        };
      }
      const isGrowth = sectionId === 'reg_sales_growth';
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: isGrowth ? 'YoY Sales Growth % by Region (Q3 2026 vs Q3 2025)' : `Net Sales by Region (${currency} Millions)`,
          unitLabel: isGrowth ? 'Growth %' : `${currency} Millions`,
          categories: REGIONAL_SALES.map((r) => r.regionName),
          series: isGrowth
            ? [{ name: 'YoY Growth %', values: REGIONAL_SALES.map((r) => r.changePctReported), colorHex: '#E53C2E' }]
            : [
                { name: `Q3 2025 (${currency} M)`, values: REGIONAL_SALES.map((r) => toM(r.salesPriorYearCad, 1)), colorHex: '#7E8082' },
                { name: `Q3 2026 (${currency} M)`, values: REGIONAL_SALES.map((r) => toM(r.salesCurrentCad, 1)), colorHex: '#231F20' },
              ],
        },
        table: {
          headers: ['Region', `Q3 2025 (${currency})`, `Q3 2026 (${currency})`, 'YoY Change', 'Growth %'],
          rows: REGIONAL_SALES.map((r) => [
            r.regionName,
            fMoney(r.salesPriorYearCad),
            fMoney(r.salesCurrentCad),
            fMoney(r.changeCad, { showSign: true }),
            `${r.changePctReported > 0 ? '+' : ''}${r.changePctReported.toFixed(1)}%`,
          ]),
          numericColumnIndices: [1, 2, 3, 4],
        },
      };
    }

    case 'reg_irregular_costs':
    case 'reg_dept_irregular_costs': {
      if (!periodMeta.hasIrregularCostBreakdown) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Detailed irregular cost log (Appendix 2.2/2.3) is supplied only for Q3 2026.`,
          bullets: [`Switch Reporting Period to Q3 2026 to include the ${IRREGULAR_COSTS.length} Appendix irregular cost records (${fMoney(2_818_000)}).`],
        };
      }
      const isDept = sectionId === 'reg_dept_irregular_costs';
      const grouped = new Map<string, number>();
      periodIrregularCosts.forEach((c) => {
        const key = isDept ? c.department : c.regionName;
        grouped.set(key, (grouped.get(key) ?? 0) + c.amountCad);
      });
      const labels = Array.from(grouped.keys());
      const vals = labels.map((l) => toK(grouped.get(l) ?? 0, 1));
      const totalScoped = periodIrregularCosts.reduce((s, c) => s + c.amountCad, 0);
      const refTotalsNote =
        ctx.config.regionFilter === 'all' && ctx.config.departmentFilter === 'all' && ctx.policy.allowAllIrregularCosts
          ? `Full Q3 2026 Irregular Cost Baseline: ${fMoney(totalScoped)} across ${periodIrregularCosts.length} records (Appendix 2.2 totals: ${isDept ? DEPARTMENT_COST_TOTALS.length + ' depts' : REGION_COST_TOTALS.length + ' regions'}).`
          : `Role/Filter Scoped Irregular Costs: ${fMoney(totalScoped)} across ${periodIrregularCosts.length} record(s).`;
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `${isDept ? 'Department' : 'Regional'} Irregular Cost Exposure (${currency} Thousands)`,
          unitLabel: `${currency} Thousands`,
          categories: labels.length ? labels : ['No Scoped Records'],
          series: [{ name: `Irregular Cost (${currency} K)`, values: vals.length ? vals : [0], colorHex: '#E53C2E' }],
        },
        table: {
          headers: ['ID', 'Item', isDept ? 'Department' : 'Region', 'Timing', `Amount (${currency})`, 'Approval Status'],
          rows: periodIrregularCosts.map((c) => [
            c.id,
            c.item,
            isDept ? c.department : c.regionName,
            c.timing,
            fMoney(c.amountCad),
            c.approvalStatus.replace(/_/g, ' '),
          ]),
          numericColumnIndices: [4],
        },
        calloutNote: refTotalsNote,
      };
    }

    case 'trd_customs_summary': {
      if (!periodMeta.hasDetailedCustomsEntries) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Detailed 12-shipment customs entry log (Appendix 3.2) is supplied for Q3 2026 only.`,
        };
      }
      return {
        ...base,
        layoutKind: 'table',
        kpis: [
          { id: 'gv', label: 'Goods Value', compactValue: fCompact(9_980_000), exactValue: fMoney(9_980_000), subtext: `${periodCustoms.length} shipments`, provenance: 'Appendix 3.2' },
          { id: 'dt', label: 'Duties & Tariffs', compactValue: fCompact(711_250), exactValue: fMoney(711_250), subtext: 'MFN + China 25% + DDP', provenance: 'Appendix 3.2' },
          { id: 'tc', label: 'Exact Trade Cost', compactValue: fCompact(QUARTERLY_TRADE_SUMMARY_Q3_2026.totalTradeCostCad), exactValue: fMoney(736_770), subtext: `Includes ${fMoney(25_520)} broker fees`, provenance: 'Appendix 3.2/3.3' },
        ],
        table: {
          headers: ['Entry', 'Route', 'Origin', 'Goods Value', 'MFN Duty', 'Add. Tariff', 'Broker Fee', 'Total Cost'],
          rows: periodCustoms.map((e) => [
            e.id,
            e.route,
            e.originCountry,
            fMoney(e.goodsValueCad),
            fMoney(e.mfnDutyCad),
            fMoney(e.additionalTariffCad),
            fMoney(e.brokerFeeChargedCad),
            fMoney(e.totalDutyAndTariffCad + e.brokerFeeChargedCad),
          ]),
          numericColumnIndices: [3, 4, 5, 6, 7],
        },
      };
    }

    case 'trd_historical_trends':
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType === 'table' ? 'line' : chartType,
          title: `Historical Rounded Trade Costs (Q4 2024 – Q3 2026, ${currency} Thousands)`,
          unitLabel: `${currency} Thousands`,
          categories: HISTORICAL_TRADE_COSTS.map((h) => h.quarterId),
          series: [
            {
              name: `Trade Cost (${currency} K Rounded)`,
              values: HISTORICAL_TRADE_COSTS.map((h) => toK(h.totalRoundedCad, 1)),
              colorHex: '#E53C2E',
            },
          ],
        },
        table: {
          headers: ['Quarter', `Rounded Trade Cost (${currency})`, 'YoY Change', 'China 25% Tariff Active'],
          rows: HISTORICAL_TRADE_COSTS.map((h) => [
            h.quarterId,
            fMoney(h.totalRoundedCad),
            h.yoyChangeRoundedCad !== null ? fMoney(h.yoyChangeRoundedCad, { showSign: true }) : 'N/A',
            h.extraTariffsActive ? 'Yes (25% Practice)' : 'No',
          ]),
          numericColumnIndices: [1, 2],
        },
        calloutNote:
          `Appendix 3.1 reports rounded Q3 2026 trade costs at ${fMoney(737_000)} vs Appendix 3.2/3.3 exact transaction total ${fMoney(736_770)}.`,
      };

    case 'trd_cost_composition': {
      const mfnTotal = periodCustoms.reduce((s, e) => s + e.mfnDutyCad, 0);
      const addTotal = periodCustoms.reduce((s, e) => s + e.additionalTariffCad, 0);
      const exportTotal = periodCustoms.reduce((s, e) => s + e.exportDutyCad, 0);
      const brokerTotal = periodCustoms.reduce((s, e) => s + e.brokerFeeChargedCad, 0);
      if (!periodMeta.hasDetailedCustomsEntries) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Trade cost component split (MFN vs China 25% vs DDP Export vs Broker) requires Q3 2026 detailed customs entries.`,
        };
      }
      return {
        ...base,
        layoutKind,
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `Q3 2026 Exact Trade Cost Composition (Total ${fMoney(736_770)})`,
          unitLabel: `${currency} Thousands`,
          categories: ['Normal MFN Duty', 'China 25% Add. Tariff', 'Export DDP Duty', 'Broker Fees Billed'],
          series: [
            {
              name: `Cost (${currency} K)`,
              values: [
                toK(mfnTotal, 2),
                toK(addTotal, 2),
                toK(exportTotal, 2),
                toK(brokerTotal, 2),
              ],
              colorHex: '#E53C2E',
            },
          ],
        },
        table: {
          headers: ['Cost Component', `Exact (${currency})`, 'Share of Total', 'Source Reference'],
          rows: [
            ['Normal MFN Duty', fMoney(mfnTotal), `${((mfnTotal / 736_770) * 100).toFixed(1)}%`, 'Appendix 3.2 / Rule 05'],
            ['China 25% Additional Tariff (E-04..E-06)', fMoney(addTotal), `${((addTotal / 736_770) * 100).toFixed(1)}%`, 'Appendix 3.2 / 3.4'],
            ['Export DDP Duty (E-11 UK)', fMoney(exportTotal), `${((exportTotal / 736_770) * 100).toFixed(1)}%`, 'Appendix 3.2'],
            ['Customs Broker Fees Charged', fMoney(brokerTotal), `${((brokerTotal / 736_770) * 100).toFixed(1)}%`, 'Appendix 3.2 / 3.3'],
            ['Total Q3 2026 Exact Trade Costs', fMoney(mfnTotal + addTotal + exportTotal + brokerTotal), '100.0%', 'Appendix 3.2 Tie-Out'],
          ],
          numericColumnIndices: [1, 2],
        },
      };
    }

    case 'trd_broker_reconciliation': {
      if (!periodMeta.hasDetailedCustomsEntries) {
        return {
          ...base,
          layoutKind,
          unavailableReason: `Shipment-level broker fee audit (0.2% contract) is supplied for Q3 2026 only.`,
        };
      }
      const varied = periodCustoms.filter((e) => e.brokerVarianceReportedCad !== 0);
      return {
        ...base,
        layoutKind,
        kpis: [
          { id: 'bg', label: 'Gross Overcharges', compactValue: fCompact(BROKER_CONTRACT_SUMMARY_Q3_2026.grossOverchargesCad), exactValue: fMoney(8_260), subtext: `6 entries (incl. ${fMoney(6_300)} China)`, provenance: 'Appendix 3.3' },
          { id: 'bn', label: 'Net Contract Variance', compactValue: fCompact(BROKER_CONTRACT_SUMMARY_Q3_2026.netOverContractCad), exactValue: fMoney(5_560), subtext: `After -${fMoney(2_700)} undercharges`, provenance: 'Appendix 3.3' },
        ],
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `Broker Fee Charged vs 0.2% Contract Expected (Varied Shipments, ${currency})`,
          unitLabel: currency,
          categories: varied.map((e) => e.id),
          series: [
            { name: 'Contract (0.2%)', values: varied.map((e) => toU(e.brokerFeeExpectedCad)), colorHex: '#7E8082' },
            { name: 'Billed Fee', values: varied.map((e) => toU(e.brokerFeeChargedCad)), colorHex: '#E53C2E' },
          ],
        },
        table: {
          headers: ['Entry', 'Origin', 'Goods Value', 'Expected (0.2%)', 'Charged', 'Variance'],
          rows: varied.map((e) => [
            e.id,
            e.originCountry,
            fMoney(e.goodsValueCad),
            fMoney(e.brokerFeeExpectedCad),
            fMoney(e.brokerFeeChargedCad),
            fMoney(e.brokerVarianceReportedCad, { showSign: true }),
          ]),
          numericColumnIndices: [2, 3, 4, 5],
        },
      };
    }

    case 'trd_agreement_opportunities': {
      const ftaRows = periodCustoms.filter(
        (e) => e.tradeAgreementStatus === 'CUSMA_not_claimed' || e.tradeAgreementStatus === 'CUSMA_claimed' || e.tradeAgreementStatus === 'CPTPP_claimed'
      );
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Entry', 'Origin', 'Goods', 'Agreement Status', 'Duty Paid', 'Verification Status'],
          rows: ftaRows.map((e) => [
            e.id,
            e.originCountry,
            e.goods,
            e.tradeAgreementStatus.replace(/_/g, ' '),
            fMoney(e.totalDutyAndTariffCad),
            e.tradeAgreementStatus === 'CUSMA_not_claimed' ? 'Unconfirmed — Certificate Verification Required' : 'Claimed in Entry Record',
          ]),
          numericColumnIndices: [4],
        },
        calloutNote: `E-08 (Mexico Wire Harnesses, ${fMoney(11_020)} MFN duty) is flagged under Rule 06 as a potential CUSMA exemption requiring formal Certificate of Origin validation.`,
      };
    }

    case 'trd_domestic_separation': {
      const totalDomSales = DOMESTIC_SHIPMENT_RECORDS.reduce((s, d) => s + d.salesCad, 0);
      const totalTax = DOMESTIC_SHIPMENT_RECORDS.reduce((s, d) => s + d.salesTaxCad, 0);
      const totalFreight = DOMESTIC_SHIPMENT_RECORDS.reduce((s, d) => s + d.freightCad, 0);
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Record', 'Destination (Province)', `Sales (${currency})`, 'Sales Tax (Excluded)', 'Freight (Excluded)', 'Customs Duty'],
          rows: [
            ...DOMESTIC_SHIPMENT_RECORDS.map((d) => [
              d.id,
              `${d.destination} (${d.province})`,
              fMoney(d.salesCad),
              fMoney(d.salesTaxCad),
              fMoney(d.freightCad),
              fMoney(0),
            ]),
            ['Total Domestic', '5 Provinces', fMoney(totalDomSales), fMoney(totalTax), fMoney(totalFreight), fMoney(0)],
          ],
          numericColumnIndices: [2, 3, 4],
        },
        calloutNote: `Rule 07 confirms ${fMoney(799_525)} provincial sales tax and ${fMoney(95_400)} domestic freight carry ${fMoney(0)} customs duty and are excluded from import trade totals.`,
      };
    }

    case 'gov_investigation_summary':
      return {
        ...base,
        layoutKind: 'investigations',
        table: {
          headers: ['Record', 'Title', 'Department', 'Status', `Exposure (${currency})`],
          rows: scopedInvestigations.slice(0, 10).map((inv) => [
            inv.linkedRecordId,
            inv.title,
            inv.department,
            inv.workflowStatus,
            fMoney(inv.exposureCad),
          ]),
          numericColumnIndices: [4],
        },
        calloutNote: `Total scoped investigations: ${scopedInvestigations.length} (${scopedInvestigations.filter((i) => i.workflowStatus !== 'Resolved' && i.workflowStatus !== 'Dismissed with Reason').length} active). Flagged items are review priorities, not confirmed fraud.`,
      };

    case 'gov_material_variance_status': {
      const matInd = readiness.indicators.find((i) => i.id === 'ind-variances');
      const matLines = period === 'Q3 2026'
        ? OPERATING_EARNINGS_WALKS.flatMap((w) =>
            w.entries
              .filter((e) => e.bucket !== 'Start' && e.bucket !== 'End' && Math.abs(e.amountCad) >= 1_000_000)
              .map((e) => [w.comparisonType, e.stepLabel, e.bucket, fMoney(e.amountCad, { showSign: true }), e.linkedIrregularCostId ?? 'Operational / Mix'])
          )
        : [];
      return {
        ...base,
        layoutKind: 'table',
        unavailableReason: period !== 'Q3 2026' ? `Rule 03 walk variance screening applies to Q3 2026 Appendix 1.2 walks.` : undefined,
        table: {
          headers: ['Walk', 'Line Item', 'Bucket', `Variance (${currency})`, 'Linked Driver'],
          rows: matLines,
          numericColumnIndices: [3],
        },
        calloutNote: matInd ? `${matInd.resolvedCount}/${matInd.totalCount} material walk lines documented.` : undefined,
      };
    }

    case 'gov_outstanding_approvals': {
      const openApps = ctx.state.approvalRequests.filter((a) => a.resolutionStatus === 'Open');
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Request', 'Record', 'Type', 'Workflow Stage', 'Signed Steps', `Amount (${currency})`],
          rows: ctx.state.approvalRequests.map((a) => [
            a.title,
            a.linkedRecordId,
            a.requestType.replace(/_/g, ' '),
            a.workflowStatus,
            `${a.approvalsHistory.filter((s) => s.decision === 'Approved').length}/${a.requiredApprovalsCount}`,
            fMoney(a.amountCad),
          ]),
          numericColumnIndices: [5],
        },
        calloutNote: `${openApps.length} approval request(s) remain open before financial close sign-off.`,
      };
    }

    case 'gov_gateway_batches':
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Batch File', 'Domain', 'Total Rows', 'Validated', 'Quarantined', 'Rejected', 'Status'],
          rows: ctx.state.importBatches.length
            ? ctx.state.importBatches.map((b) => [
                b.fileName,
                b.targetDomain,
                b.recordCount,
                b.validatedCount,
                b.quarantinedCount,
                b.rejectedCount,
                b.status.replace(/_/g, ' '),
              ])
            : [['No uploaded batches in current session', '—', 0, 0, 0, 0, 'Appendix Baseline Only']],
          numericColumnIndices: [2, 3, 4, 5],
        },
      };

    case 'gov_quarantined_summary':
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Record ID', 'Schema', 'Department', `Amount (${currency})`, 'Review Status', 'Primary Reason'],
          rows: openQuarantined.length
            ? openQuarantined.map((q) => [
                q.stableRecordId,
                q.schemaType.replace(/_/g, ' '),
                q.department,
                fMoney(q.amountCad),
                q.reviewStatus,
                q.reasons[0] ?? 'Rule screening exception',
              ])
            : [['None', '—', '—', fMoney(0), 'Clean', 'No unresolved quarantined items in queue']],
          numericColumnIndices: [3],
        },
        calloutNote: 'Security & Integrity Boundary: Quarantined records shown above are strictly excluded from all trusted financial totals.',
      };

    case 'gov_evidence_requirements': {
      const gapItems = ctx.state.evidence.filter(
        (ev) => ev.status === 'missing_in_case' || ev.status === 'pending_verification'
      );
      return {
        ...base,
        layoutKind: 'table',
        table: {
          headers: ['Record ID', 'Evidence Item', 'Type', 'Status', 'Summary'],
          rows: gapItems.length
            ? gapItems.map((ev) => [
                ev.linkedRecordId,
                ev.title,
                ev.evidenceType.replace(/_/g, ' '),
                ev.status.replace(/_/g, ' '),
                ev.summary,
              ])
            : [['All Resolved', 'No open evidence gaps', '—', 'Verified', 'All linked evidence items verified']],
          numericColumnIndices: [],
        },
      };
    }

    case 'str_tariff_scenarios': {
      if (!scopedScenarios.length) {
        return {
          ...base,
          layoutKind,
          unavailableReason:
            ctx.config.datasetScope !== 'combined_with_hypothetical'
              ? 'Hypothetical tariff scenarios are excluded because Dataset Scope excludes hypothetical scenarios.'
              : 'No saved tariff scenarios available for this role scope.',
        };
      }
      return {
        ...base,
        layoutKind,
        provenanceTag: 'Hypothetical Strategic Scenarios (Non-Historical)',
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `Hypothetical Tariff Projections vs Baseline (Quarterly ${currency} Thousands)`,
          unitLabel: `${currency} Thousands`,
          categories: scopedScenarios.map((s) => `${s.chinaTariffRatePct}% (${s.selectedEntryIds.length} entries)`),
          series: [
            {
              name: `Baseline 25% (${currency} K)`,
              values: scopedScenarios.map((s) => toK(s.baselineAdditionalTariffCostCad, 1)),
              colorHex: '#7E8082',
            },
            {
              name: `Projected Tariff (${currency} K)`,
              values: scopedScenarios.map((s) => toK(s.projectedQuarterlyTariffCad, 1)),
              colorHex: '#E53C2E',
            },
          ],
        },
        table: {
          headers: ['Scenario', 'Dutiable Base', 'Rate %', 'Projected Qtr', 'Qtr Delta', 'Annualized Delta'],
          rows: scopedScenarios.map((s) => [
            s.name,
            fMoney(s.dutiableGoodsValueCad),
            `${s.chinaTariffRatePct}%`,
            fMoney(s.projectedQuarterlyTariffCad),
            fMoney(s.quarterlyDifferenceCad, { showSign: true }),
            fMoney(s.annualizedDifferenceCad, { showSign: true }),
          ]),
          numericColumnIndices: [1, 2, 3, 4, 5],
        },
        calloutNote: 'Hypothetical Assumption: Annualized values assume unchanged quarterly import volume (4 quarters) and exclude unmodeled switching costs unless explicitly entered.',
      };
    }

    case 'str_opportunity_pipeline':
      return {
        ...base,
        layoutKind: 'opportunities',
        chart: {
          kind: chartType === 'table' ? 'bar' : chartType,
          title: `Non-Overlapping Opportunity Categories (Estimated ${currency} Thousands)`,
          unitLabel: `${currency} Thousands`,
          categories: oppAnalytics.byCategory.map((c) => OPPORTUNITY_CATEGORY_META[c.category].shortLabel),
          series: [
            {
              name: `Estimated Exposure / Potential (${currency} K)`,
              values: oppAnalytics.byCategory.map((c) => toK(c.estimatedCad, 1)),
              colorHex: '#231F20',
            },
            {
              name: `Realized (Verified ${currency} K)`,
              values: oppAnalytics.byCategory.map((c) => toK(c.realizedCad, 1)),
              colorHex: '#16A34A',
            },
          ],
        },
        table: {
          headers: ['Opportunity', 'Impact Type', 'Source', 'Estimated', 'Verified', 'Realized', 'Status'],
          rows: scopedOpportunities.map((o) => [
            o.title,
            o.financialImpactType,
            o.sourceRecordId,
            fMoney(o.estimatedAmountCad),
            fMoney(o.verifiedAmountCad),
            fMoney(o.realizedAmountCad),
            o.status,
          ]),
          numericColumnIndices: [3, 4, 5],
        },
        calloutNote: oppAnalytics.overlapNotes[0] ?? 'Categories are strictly separated to avoid double counting non-cash adjustments, avoidable costs, and hypothetical policy scenarios.',
      };

    case 'str_realized_opportunities':
      return {
        ...base,
        layoutKind: 'table',
        kpis: [
          { id: 'ver', label: 'Verified Value', compactValue: fCompact(oppAnalytics.totalVerifiedCad), exactValue: fMoney(oppAnalytics.totalVerifiedCad), subtext: 'Controller-reviewed', provenance: 'Opportunity Engine' },
          { id: 'real', label: 'Realized Savings', compactValue: fCompact(oppAnalytics.totalRealizedCad), exactValue: fMoney(oppAnalytics.totalRealizedCad), subtext: `${oppAnalytics.outstandingVerificationsCount} pending verification`, provenance: 'Opportunity Engine' },
        ],
        table: {
          headers: ['Category', 'Count', `Estimated (${currency})`, `Verified (${currency})`, `Realized (${currency})`],
          rows: oppAnalytics.byCategory.map((c) => [
            c.label,
            c.count,
            fMoney(c.estimatedCad),
            fMoney(c.verifiedCad),
            fMoney(c.realizedCad),
          ]),
          numericColumnIndices: [1, 2, 3, 4],
        },
      };

    case 'str_quarter_end_readiness':
      return {
        ...base,
        layoutKind: 'readiness',
        table: {
          headers: ['Control Indicator', 'Resolved', 'Open / Blocking', 'Status'],
          rows: readiness.indicators.map((ind) => [
            ind.label,
            `${ind.resolvedCount}/${ind.totalCount}`,
            ind.unresolvedCount,
            ind.status.replace(/_/g, ' ').toUpperCase(),
          ]),
          numericColumnIndices: [2],
        },
        calloutNote: `Total Open Governance Items for ${period} Close: ${readiness.totalBlockingCount}.`,
      };
  }
}

export function buildReportAiContextPacket(model: BuiltReportModel) {
  return {
    reportTitle: model.config.title,
    reportingPeriod: model.config.reportingPeriod,
    comparisonType: model.config.comparisonType,
    datasetScope: model.datasetScopeLabel,
    roleScope: model.policy.scopeTitle,
    selectedKpis: model.selectedKpis.map((k) => ({
      label: k.label,
      value: k.exactValue,
      context: k.subtext,
      provenance: k.provenance,
    })),
    slideFacts: model.slides
      .filter((s) => s.sectionId)
      .map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        unavailableReason: s.unavailableReason,
        tableHeaders: s.table?.headers,
        tableRows: s.table?.rows.slice(0, 10),
        calloutNote: s.calloutNote,
      })),
    quarantinedExcludedCount: model.scopedData.quarantinedCount,
    authorizedUploadedCounts: {
      ledger: model.scopedData.authorizedLedgerCount,
      customs: model.scopedData.authorizedCustomsCount,
    },
  };
}
