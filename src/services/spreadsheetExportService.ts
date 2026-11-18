import * as XLSX from 'xlsx';
import {
  DOMESTIC_SHIPMENT_RECORDS,
  INCOME_STATEMENTS,
  OPERATING_EARNINGS_WALKS,
  REGIONAL_SALES,
} from '../data/caseSeed';
import { convertFromCad, DEMO_CAD_TO_USD_RATE } from '../domain/currencyService';
import { exportSafeCsv, sanitizeSpreadsheetCell } from '../domain/ingestionPipeline';
import {
  getReportPermissionPolicy,
  ReportDatasetExportKey,
} from '../domain/permissions';
import { computeQuarterEndReadiness } from '../domain/readinessEngine';
import { BuiltReportModel } from '../domain/reportEngine';
import { calculateExpectedBrokerFeeCad } from '../domain/rulesEngine';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import { User } from '../types/domain';
import { buildReportFileName } from './pptxExportService';

function safeSheetCell(val: unknown): string | number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  return sanitizeSpreadsheetCell(val);
}

function appendAoASheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  aoa: unknown[][],
  colWidths: number[],
  currencyCols: number[] = [],
  pctCols: number[] = []
): void {
  const safeAoa = aoa.map((row) => row.map((cell) => safeSheetCell(cell)));
  const ws = XLSX.utils.aoa_to_sheet(safeAoa);
  ws['!cols'] = colWidths.map((wch) => ({ wch }));

  // Apply readable Excel numeric formats without altering underlying numeric values
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const currSet = new Set(currencyCols);
  const pctSet = new Set(pctCols);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell || cell.t !== 'n') continue;
      if (currSet.has(C)) {
        cell.z = '$#,##0;($#,##0);"-"';
      } else if (pctSet.has(C)) {
        cell.z = '0.0%';
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

export interface WorkbookExportResult {
  ok: true;
  fileName: string;
  sheetNames: string[];
  byteSize: number;
  bytes: Uint8Array;
}

export function buildConsolidatedExcelWorkbook(
  model: BuiltReportModel,
  state: PersistedWorkspaceState,
  user: User
): WorkbookExportResult {
  const policy = getReportPermissionPolicy(user);
  if (!policy.allowExecutiveWorkbook) {
    throw new Error('Active role is not permitted to export the consolidated executive workbook.');
  }

  const cur = model.currency;
  const cVal = (cad: number) => convertFromCad(cad, cur);

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: model.config.title,
    Author: model.config.authorName,
    Company: 'SKYJACK Financial Intelligence',
    Subject: `${model.config.reportingPeriod} Consolidated Financial & Trade Workbook`,
  };

  // 1. Executive Summary
  const execRows: unknown[][] = [
    ['SKYJACK Financial Intelligence — Consolidated Executive Report Workbook'],
    ['Report Title', model.config.title],
    ['Reporting Period', model.config.reportingPeriod],
    ['Reporting Currency', cur === 'USD' ? `USD (Converted from CAD at 1 CAD = ${DEMO_CAD_TO_USD_RATE} USD)` : 'CAD (Authoritative Case Currency)'],
    ['Comparison Mode', `${model.config.comparisonType}${model.config.comparisonPeriod ? ` (${model.config.comparisonPeriod})` : ''}`],
    ['Dataset Scope', model.datasetScopeLabel],
    ['Prepared By / Role Scope', `${model.config.authorName} — ${policy.scopeTitle}`],
    ['Generated At (ISO)', model.generatedAtIso],
    ['Quarantined Records Excluded', model.scopedData.quarantinedCount],
    [],
    ['KPI Label', 'Display Value', 'Context', 'Provenance'],
    ...model.selectedKpis.map((k) => [k.label, k.exactValue, k.subtext, k.provenance]),
  ];
  if (model.config.managementCommentary?.trim()) {
    execRows.push([], ['Human-Authored Management Commentary'], [model.config.managementCommentary.trim()]);
  }
  if (model.config.aiExecutiveSummary?.reviewedAndApprovedForExport) {
    execRows.push(
      [],
      ['Human-Reviewed AI Executive Summary', model.config.aiExecutiveSummary.modelName],
      ['Headline', model.config.aiExecutiveSummary.executiveHeadline],
      ['Financial Commentary', model.config.aiExecutiveSummary.financialPerformanceCommentary],
      ['Investigations Summary', model.config.aiExecutiveSummary.investigationSummary],
      ['Limitations', model.config.aiExecutiveSummary.limitationsNote]
    );
  }
  appendAoASheet(wb, 'Executive Summary', execRows, [34, 42, 34, 24]);

  // 2. Income Statements (Numeric & Margin % cells)
  if (policy.allowFinancialPerformance) {
    const incRows: unknown[][] = [
      ['Quarter', `Sales (${cur})`, `Variable Costs (${cur})`, `Fixed Plant (${cur})`, `SG&A (${cur})`, `Amortization (${cur})`, `Operating Earnings (${cur})`, 'Reported Margin %', 'Source Ref'],
      ...INCOME_STATEMENTS.map((s) => [
        s.quarterId,
        cVal(s.salesCad),
        cVal(s.variableCostsCad),
        cVal(s.fixedPlantCostsCad),
        cVal(s.sgaCad),
        cVal(s.amortizationCad),
        cVal(s.operatingEarningsCad),
        s.oeShareOfSalesPct / 100,
        s.sourceRef,
      ]),
    ];
    appendAoASheet(wb, 'Income Statements', incRows, [14, 18, 20, 18, 16, 18, 22, 16, 16], [1, 2, 3, 4, 5, 6], [7]);

    // 3. Profit Walk
    const walkRows: unknown[][] = [
      ['Walk Comparison', 'Sequence', 'Step Label', 'Bucket', `Amount (${cur})`, 'Material (Rule 03)', 'Linked IR ID', 'Source Ref'],
      ...OPERATING_EARNINGS_WALKS.flatMap((w) =>
        w.entries.map((e) => [
          w.comparisonType,
          e.sequence,
          e.stepLabel,
          e.bucket,
          cVal(e.amountCad),
          e.isMaterialReported === null ? 'Endpoint' : e.isMaterialReported ? 'Yes' : 'No',
          e.linkedIrregularCostId ?? '',
          e.sourceRef,
        ])
      ),
    ];
    appendAoASheet(wb, 'Profit Walk', walkRows, [16, 10, 32, 16, 18, 16, 14, 18], [4]);
  }

  // 4. Regional Sales
  if (policy.allowRegionalSales) {
    const regRows: unknown[][] = [
      ['Region', `Q3 2025 Sales (${cur})`, `Q3 2026 Sales (${cur})`, `YoY Change (${cur})`, 'Reported Growth %', 'Source Ref'],
      ...REGIONAL_SALES.map((r) => [
        r.regionName,
        cVal(r.salesPriorYearCad),
        cVal(r.salesCurrentCad),
        cVal(r.changeCad),
        r.changePctReported / 100,
        r.sourceRef,
      ]),
    ];
    appendAoASheet(wb, 'Regional Sales', regRows, [28, 20, 20, 18, 18, 16], [1, 2, 3], [4]);
  }

  // 5. Irregular Costs
  const irRows: unknown[][] = [
    ['ID', 'Quarter', 'Item', 'Department', 'Region', `Amount (${cur})`, 'Timing', 'Walk Bucket', 'Approval Status', 'GL Account', 'JE Ref'],
    ...model.scopedData.irregularCosts.map((c) => [
      c.id,
      c.quarterId,
      c.item,
      c.department,
      c.regionName,
      cVal(c.amountCad),
      c.timing,
      c.walkBucket,
      c.approvalStatus,
      c.glAccount ?? '',
      c.journalEntryRef ?? '',
    ]),
  ];
  appendAoASheet(wb, 'Irregular Costs', irRows, [10, 12, 34, 20, 18, 16, 12, 16, 22, 14, 14], [5]);

  // 6. Customs Entries & 7. Broker Audit
  if (policy.allowTradeAndCustoms) {
    const custRows: unknown[][] = [
      ['Entry ID', 'Quarter', 'Route', 'Direction', 'Origin', 'Goods', 'HS Code', `Goods Value (${cur})`, `MFN Duty (${cur})`, `Add. Tariff (${cur})`, `Export Duty (${cur})`, `Total Duty & Tariff (${cur})`, 'Agreement Status'],
      ...model.scopedData.customsEntries.map((e) => [
        e.id,
        e.quarterId,
        e.route,
        e.direction,
        e.originCountry,
        e.goods,
        e.hsCode,
        cVal(e.goodsValueCad),
        cVal(e.mfnDutyCad),
        cVal(e.additionalTariffCad),
        cVal(e.exportDutyCad),
        cVal(e.totalDutyAndTariffCad),
        e.tradeAgreementStatus,
      ]),
    ];
    appendAoASheet(wb, 'Customs Entries', custRows, [10, 12, 22, 12, 14, 24, 14, 18, 16, 16, 16, 20, 20], [7, 8, 9, 10, 11]);

    const brokerRows: unknown[][] = [
      ['Entry ID', 'Origin', `Goods Value (${cur})`, 'Contract Rate %', `Expected Fee (${cur})`, `Charged Fee (${cur})`, `Variance (${cur})`, 'Audit Flag'],
      ...model.scopedData.customsEntries.map((e) => {
        const exp = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
        const variance = e.brokerFeeChargedCad - exp;
        return [
          e.id,
          e.originCountry,
          cVal(e.goodsValueCad),
          0.002,
          cVal(exp),
          cVal(e.brokerFeeChargedCad),
          cVal(variance),
          variance > 0 ? 'Overcharge' : variance < 0 ? 'Undercharge' : 'Compliant',
        ];
      }),
    ];
    appendAoASheet(wb, 'Broker Audit', brokerRows, [10, 14, 18, 14, 18, 18, 16, 14], [2, 4, 5, 6], [3]);

    // Domestic Tax & Freight Separation row block
    const domRows: unknown[][] = [
      ['Record', 'Province', `Sales (${cur})`, `Sales Tax Excluded (${cur})`, `Domestic Freight Excluded (${cur})`, 'Customs Duty'],
      ...DOMESTIC_SHIPMENT_RECORDS.map((d) => [d.id, d.province, cVal(d.salesCad), cVal(d.salesTaxCad), cVal(d.freightCad), 0]),
    ];
    appendAoASheet(wb, 'Domestic Separation', domRows, [12, 18, 16, 22, 24, 14], [2, 3, 4, 5]);
  }

  // 8. Tariff Scenarios (Hypothetical)
  if (policy.allowTariffScenarios && model.scopedData.savedScenarios.length > 0) {
    const scenRows: unknown[][] = [
      ['Scenario Name', 'Rate %', `Dutiable Base (${cur})`, `Baseline 25% (${cur})`, `Projected Qtr (${cur})`, `Qtr Delta (${cur})`, `Annualized Delta (${cur})`, 'Provenance'],
      ...model.scopedData.savedScenarios.map((s) => [
        s.name,
        s.chinaTariffRatePct / 100,
        cVal(s.dutiableGoodsValueCad),
        cVal(s.baselineAdditionalTariffCostCad),
        cVal(s.projectedQuarterlyTariffCad),
        cVal(s.quarterlyDifferenceCad),
        cVal(s.annualizedDifferenceCad),
        'Hypothetical Scenario (Non-Historical)',
      ]),
    ];
    appendAoASheet(wb, 'Tariff Scenarios', scenRows, [38, 10, 18, 18, 18, 16, 20, 32], [2, 3, 4, 5, 6], [1]);
  }

  // 9. Opportunities
  const oppRows: unknown[][] = [
    ['ID', 'Title', 'Category', 'Impact Type', 'Source ID', `Estimated (${cur})`, `Verified (${cur})`, `Realized (${cur})`, 'Status'],
    ...model.scopedData.opportunities.map((o) => [
      o.id,
      o.title,
      o.category,
      o.financialImpactType,
      o.sourceRecordId,
      cVal(o.estimatedAmountCad),
      cVal(o.verifiedAmountCad),
      cVal(o.realizedAmountCad),
      o.status,
    ]),
  ];
  appendAoASheet(wb, 'Opportunities', oppRows, [20, 42, 24, 26, 12, 16, 16, 16, 20], [5, 6, 7]);

  // 10. Quarter-End Readiness
  const readiness = computeQuarterEndReadiness(state, user, model.config.reportingPeriod, cur);
  const readyRows: unknown[][] = [
    ['Indicator', 'Resolved', 'Open / Blocking', 'Total', 'Status', 'Definition'],
    ...readiness.indicators.map((i) => [i.label, i.resolvedCount, i.unresolvedCount, i.totalCount, i.status, i.definition]),
  ];
  appendAoASheet(wb, 'Close Readiness', readyRows, [32, 10, 16, 10, 18, 55], [1, 2, 3]);

  // 11. Authorized Uploads (Strictly separated from official Appendix)
  if (model.config.datasetScope !== 'official_case_data') {
    const upRows: unknown[][] = [
      ['Type', 'Record ID', 'Period', 'Department / Origin', `Amount / Value (${cur})`, 'Approval Ref', 'Status'],
      ...state.uploadedLedgerTransactions.map((t) => [
        'Authorized Ledger',
        t.transactionId,
        t.accountingPeriod,
        t.department,
        cVal(t.amountCad),
        t.approvalReference,
        'Authorized Upload (Separate from Appendix)',
      ]),
      ...(policy.allowTradeAndCustoms
        ? state.uploadedCustomsRecords.map((c) => [
            'Authorized Customs',
            c.entryId,
            c.accountingPeriod,
            c.originCountry,
            cVal(c.actualDutyCad + c.actualBrokerFeeCad),
            c.approvalReference,
            'Authorized Upload (Separate from Appendix)',
          ])
        : []),
    ];
    appendAoASheet(wb, 'Authorized Uploads', upRows, [18, 16, 12, 22, 18, 18, 36], [4]);
  }

  // 12. Sources & Assumptions
  const srcRows: unknown[][] = [
    ['Governance Principle / Source', 'Detail'],
    ['Fictional Competition Data', `All figures originate from fictional SKYJACK Prompt to Pitch 2026 case materials stored in authoritative CAD${cur === 'USD' ? ` and converted to USD at the static demonstration rate 1 CAD = ${DEMO_CAD_TO_USD_RATE} USD` : ''}.`],
    ['Quarantine Exclusion', `${model.scopedData.quarantinedCount} quarantined Data Gateway item(s) are strictly excluded from workbook sums.`],
    ['Role Permission Scope', `${policy.scopeTitle} — ${policy.scopeDescription}`],
    ['Formula Safety', 'All string cells are sanitized against spreadsheet formula prefixes (=, +, -, @, tab, CR).'],
  ];
  appendAoASheet(wb, 'Sources & Assumptions', srcRows, [32, 92]);

  const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const bytes = new Uint8Array(rawBuf);

  return {
    ok: true,
    fileName: buildReportFileName(model.config.title, model.config.reportingPeriod, 'xlsx'),
    sheetNames: wb.SheetNames,
    byteSize: bytes.byteLength,
    bytes,
  };
}

export function generateDatasetCsvExport(
  datasetKey: ReportDatasetExportKey,
  model: BuiltReportModel,
  state: PersistedWorkspaceState,
  user: User
): { ok: true; fileName: string; csvText: string; rowCount: number } {
  const policy = getReportPermissionPolicy(user);
  if (!policy.allowedCsvDatasets.includes(datasetKey)) {
    throw new Error(`Active role (${user.title}) is not authorized to export CSV dataset "${datasetKey}".`);
  }

  let headers: string[] = [];
  let rows: Record<string, unknown>[] = [];

  switch (datasetKey) {
    case 'income_statements':
      headers = ['Quarter', 'Sales_CAD', 'Variable_Costs_CAD', 'Fixed_Plant_CAD', 'SGA_CAD', 'Amortization_CAD', 'Operating_Earnings_CAD', 'OE_Margin_Pct', 'Source_Ref'];
      rows = INCOME_STATEMENTS.map((s) => ({
        Quarter: s.quarterId,
        Sales_CAD: s.salesCad,
        Variable_Costs_CAD: s.variableCostsCad,
        Fixed_Plant_CAD: s.fixedPlantCostsCad,
        SGA_CAD: s.sgaCad,
        Amortization_CAD: s.amortizationCad,
        Operating_Earnings_CAD: s.operatingEarningsCad,
        OE_Margin_Pct: s.oeShareOfSalesPct,
        Source_Ref: s.sourceRef,
      }));
      break;

    case 'irregular_costs':
      headers = ['ID', 'Quarter', 'Item', 'Department', 'Region', 'Amount_CAD', 'Timing', 'Walk_Bucket', 'Approval_Status', 'GL_Account', 'Journal_Ref'];
      rows = model.scopedData.irregularCosts.map((c) => ({
        ID: c.id,
        Quarter: c.quarterId,
        Item: c.item,
        Department: c.department,
        Region: c.regionName,
        Amount_CAD: c.amountCad,
        Timing: c.timing,
        Walk_Bucket: c.walkBucket,
        Approval_Status: c.approvalStatus,
        GL_Account: c.glAccount ?? '',
        Journal_Ref: c.journalEntryRef ?? '',
      }));
      break;

    case 'customs_entries':
      headers = ['Entry_ID', 'Quarter', 'Route', 'Direction', 'Origin', 'Goods', 'Goods_Value_CAD', 'MFN_Duty_CAD', 'Additional_Tariff_CAD', 'Export_Duty_CAD', 'Total_Duty_Tariff_CAD', 'Agreement_Status'];
      rows = model.scopedData.customsEntries.map((e) => ({
        Entry_ID: e.id,
        Quarter: e.quarterId,
        Route: e.route,
        Direction: e.direction,
        Origin: e.originCountry,
        Goods: e.goods,
        Goods_Value_CAD: e.goodsValueCad,
        MFN_Duty_CAD: e.mfnDutyCad,
        Additional_Tariff_CAD: e.additionalTariffCad,
        Export_Duty_CAD: e.exportDutyCad,
        Total_Duty_Tariff_CAD: e.totalDutyAndTariffCad,
        Agreement_Status: e.tradeAgreementStatus,
      }));
      break;

    case 'broker_reconciliation':
      headers = ['Entry_ID', 'Origin', 'Goods_Value_CAD', 'Expected_Contract_0_2_Pct_CAD', 'Charged_Broker_Fee_CAD', 'Variance_CAD'];
      rows = model.scopedData.customsEntries.map((e) => {
        const exp = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
        return {
          Entry_ID: e.id,
          Origin: e.originCountry,
          Goods_Value_CAD: e.goodsValueCad,
          Expected_Contract_0_2_Pct_CAD: exp,
          Charged_Broker_Fee_CAD: e.brokerFeeChargedCad,
          Variance_CAD: e.brokerFeeChargedCad - exp,
        };
      });
      break;

    case 'tariff_scenarios':
      headers = ['Scenario_ID', 'Name', 'China_Tariff_Pct', 'Dutiable_Value_CAD', 'Baseline_25Pct_CAD', 'Projected_Quarterly_CAD', 'Quarterly_Delta_CAD', 'Annualized_Delta_CAD', 'Provenance'];
      rows = model.scopedData.savedScenarios.map((s) => ({
        Scenario_ID: s.id,
        Name: s.name,
        China_Tariff_Pct: s.chinaTariffRatePct,
        Dutiable_Value_CAD: s.dutiableGoodsValueCad,
        Baseline_25Pct_CAD: s.baselineAdditionalTariffCostCad,
        Projected_Quarterly_CAD: s.projectedQuarterlyTariffCad,
        Quarterly_Delta_CAD: s.quarterlyDifferenceCad,
        Annualized_Delta_CAD: s.annualizedDifferenceCad,
        Provenance: 'hypothetical_scenario',
      }));
      break;

    case 'investigations':
      headers = ['Investigation_ID', 'Linked_Record', 'Title', 'Department', 'Priority', 'Workflow_Status', 'Exposure_CAD'];
      rows = state.investigations
        .filter((inv) =>
          user.roleId === 'trade_coordinator'
            ? inv.department === 'Customs and Trade' || inv.department === 'Logistics'
            : true
        )
        .map((inv) => ({
          Investigation_ID: inv.id,
          Linked_Record: inv.linkedRecordId,
          Title: inv.title,
          Department: inv.department,
          Priority: inv.priority,
          Workflow_Status: inv.workflowStatus,
          Exposure_CAD: inv.exposureCad,
        }));
      break;

    case 'opportunities':
      headers = ['Opportunity_ID', 'Title', 'Category', 'Financial_Impact_Type', 'Source_Record', 'Estimated_CAD', 'Verified_CAD', 'Realized_CAD', 'Status'];
      rows = model.scopedData.opportunities.map((o) => ({
        Opportunity_ID: o.id,
        Title: o.title,
        Category: o.category,
        Financial_Impact_Type: o.financialImpactType,
        Source_Record: o.sourceRecordId,
        Estimated_CAD: o.estimatedAmountCad,
        Verified_CAD: o.verifiedAmountCad,
        Realized_CAD: o.realizedAmountCad,
        Status: o.status,
      }));
      break;

    case 'authorized_uploads':
      headers = ['Record_Type', 'Record_ID', 'Period', 'Department_Or_Origin', 'Amount_CAD', 'Approval_Ref', 'Authorized_By'];
      rows = [
        ...state.uploadedLedgerTransactions.map((t) => ({
          Record_Type: 'authorized_ledger',
          Record_ID: t.transactionId,
          Period: t.accountingPeriod,
          Department_Or_Origin: t.department,
          Amount_CAD: t.amountCad,
          Approval_Ref: t.approvalReference,
          Authorized_By: t.authorizedByUserId,
        })),
        ...(policy.allowTradeAndCustoms
          ? state.uploadedCustomsRecords.map((c) => ({
              Record_Type: 'authorized_customs',
              Record_ID: c.entryId,
              Period: c.accountingPeriod,
              Department_Or_Origin: c.originCountry,
              Amount_CAD: c.actualDutyCad + c.actualBrokerFeeCad,
              Approval_Ref: c.approvalReference,
              Authorized_By: c.authorizedByUserId,
            }))
          : []),
      ];
      break;
  }

  const csvText = exportSafeCsv(headers, rows);
  return {
    ok: true,
    fileName: buildReportFileName(`SKYJACK_${datasetKey}`, model.config.reportingPeriod, 'csv'),
    csvText,
    rowCount: rows.length,
  };
}
