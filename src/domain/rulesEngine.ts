import {
  BROKER_CONTRACT_SUMMARY_Q3_2026,
  CUSTOMS_ENTRIES,
  DOMESTIC_SHIPMENT_RECORDS,
  HISTORICAL_TRADE_COSTS,
  INCOME_STATEMENTS,
  IRREGULAR_COSTS,
  OPERATING_EARNINGS_WALKS,
  QUARTERLY_TRADE_SUMMARY_Q3_2026,
  REGIONAL_SALES,
  TARIFF_SCENARIOS,
} from '../data/caseSeed';
import {
  BusinessRuleConfig,
  CustomsEntry,
  DomesticShipmentRecord,
  GroupedRuleAlert,
  IrregularCost,
  OperatingEarningsWalkEntry,
  RuleEvaluationResult,
  RuleSeverity,
} from '../types/domain';

/**
 * Precision-safe minor-unit (cents) helpers for decimal-safe currency arithmetic.
 */
export function toMinorCents(cadAmount: number): number {
  return Math.round(cadAmount * 100);
}

export function fromMinorCents(cents: number): number {
  return cents / 100;
}

/**
 * Format exact CAD currency (preserves cents if non-integer minor units exist).
 */
export function formatCad(
  amountCad: number,
  options?: { compact?: boolean; showSign?: boolean; includeDecimalsWhenWhole?: boolean }
): string {
  const cents = toMinorCents(amountCad);
  const absCents = Math.abs(cents);
  const absVal = absCents / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';

  if (options?.compact) {
    if (absVal >= 1_000_000) {
      return `${sign}$${(absVal / 1_000_000).toFixed(1)}M`;
    }
    if (absVal >= 1_000) {
      return `${sign}$${(absVal / 1_000).toFixed(1)}K`;
    }
  }

  const hasCents = absCents % 100 !== 0;
  const formatted = absVal.toLocaleString('en-CA', {
    minimumFractionDigits: hasCents || options?.includeDecimalsWhenWhole ? 2 : 0,
    maximumFractionDigits: hasCents || options?.includeDecimalsWhenWhole ? 2 : 0,
  });

  return `${sign}CAD ${formatted}`;
}

export function formatCadCompact(amountCad: number, options?: { showSign?: boolean }): string {
  const cents = toMinorCents(amountCad);
  const absVal = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';

  if (absVal >= 1_000_000) {
    return `${sign}$${(absVal / 1_000_000).toFixed(1)}M`;
  }
  if (absVal >= 1_000) {
    return `${sign}$${(absVal / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${Math.round(absVal).toLocaleString('en-CA')}`;
}

export function formatCadShort(amountCad: number, options?: { showSign?: boolean }): string {
  const cents = toMinorCents(amountCad);
  const absCents = Math.abs(cents);
  const absVal = absCents / 100;
  const sign = cents < 0 ? '-' : options?.showSign && cents > 0 ? '+' : '';
  const hasCents = absCents % 100 !== 0;
  return `${sign}$${absVal.toLocaleString('en-CA', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function calculateOperatingMarginPct(operatingEarningsCad: number, salesCad: number): number {
  if (salesCad === 0) return 0;
  return Math.round(((operatingEarningsCad / salesCad) * 100) * 10) / 10;
}

export function calculateExpectedBrokerFeeCad(goodsValueCad: number, contractRatePct = 0.2): number {
  // Precision-safe minor-unit arithmetic: (goodsValue * 100 cents) * rate / 100
  const goodsCents = toMinorCents(goodsValueCad);
  const feeCents = Math.round((goodsCents * contractRatePct) / 100);
  return fromMinorCents(feeCents);
}

export function calculateChinaTariffScenario(goodsValueCad: number, tariffRatePct: number) {
  const baselineRatePct = 25;
  const goodsCents = toMinorCents(goodsValueCad);
  const baselineQuarterlyCents = Math.round((goodsCents * baselineRatePct) / 100);
  const projectedQuarterlyCents = Math.round((goodsCents * tariffRatePct) / 100);
  const deltaQuarterlyCents = projectedQuarterlyCents - baselineQuarterlyCents;
  const deltaAnnualCents = deltaQuarterlyCents * 4;

  return {
    goodsValueCad,
    tariffRatePct,
    projectedQuarterly: fromMinorCents(projectedQuarterlyCents),
    deltaQuarterly: fromMinorCents(deltaQuarterlyCents),
    deltaAnnual: fromMinorCents(deltaAnnualCents),
  };
}

export interface MultiEntryTariffInput {
  entries: CustomsEntry[];
  hypotheticalAdditionalRatePct: number;
  annualizationQuarters: number;
  transitionCostCad?: number;
  recurringAltSupplierDeltaPerQuarterCad?: number;
}

export interface MultiEntryTariffOutput {
  selectedCount: number;
  dutiableGoodsValueCad: number;
  normalMfnDutyCad: number;
  exportDutyCad: number;
  currentAdditionalTariffCad: number;
  hypotheticalAdditionalTariffCad: number;
  quarterlyTariffDifferenceCad: number;
  annualizedTariffDifferenceCad: number;
  transitionCostCad: number;
  recurringAltSupplierDeltaPerQuarterCad: number;
  annualizedNetImpactWithSupplierCostsCad: number;
  estimatedOeImpactQuarterlyCad: number;
  estimatedOeImpactAnnualCad: number;
  perEntryBreakdown: Array<{
    entryId: string;
    goods: string;
    originCountry: string;
    goodsValueCad: number;
    mfnDutyCad: number;
    currentAdditionalTariffCad: number;
    hypotheticalAdditionalTariffCad: number;
    quarterlyDeltaCad: number;
  }>;
}

/**
 * Deterministic multi-entry tariff simulator supporting 0%..500% rates while keeping normal MFN duties separate.
 */
export function calculateMultiEntryTariffScenario(
  input: MultiEntryTariffInput
): MultiEntryTariffOutput {
  const clampedRate = Math.max(0, Math.min(500, input.hypotheticalAdditionalRatePct));
  const quarters = Math.max(1, Math.min(8, Math.round(input.annualizationQuarters)));
  const transitionCostCents = toMinorCents(Math.max(0, input.transitionCostCad ?? 0));
  const recurringAltCentsPerQtr = toMinorCents(input.recurringAltSupplierDeltaPerQuarterCad ?? 0);

  let goodsCents = 0;
  let mfnCents = 0;
  let exportCents = 0;
  let currentAddCents = 0;
  let hypoAddCents = 0;

  const perEntryBreakdown = input.entries.map((entry) => {
    const entryGoodsCents = toMinorCents(entry.goodsValueCad);
    const entryCurrentAddCents = toMinorCents(entry.additionalTariffCad);
    const entryHypoAddCents = Math.round((entryGoodsCents * clampedRate) / 100);

    goodsCents += entryGoodsCents;
    mfnCents += toMinorCents(entry.mfnDutyCad);
    exportCents += toMinorCents(entry.exportDutyCad);
    currentAddCents += entryCurrentAddCents;
    hypoAddCents += entryHypoAddCents;

    return {
      entryId: entry.id,
      goods: entry.goods,
      originCountry: entry.originCountry,
      goodsValueCad: entry.goodsValueCad,
      mfnDutyCad: entry.mfnDutyCad,
      currentAdditionalTariffCad: entry.additionalTariffCad,
      hypotheticalAdditionalTariffCad: fromMinorCents(entryHypoAddCents),
      quarterlyDeltaCad: fromMinorCents(entryHypoAddCents - entryCurrentAddCents),
    };
  });

  const qtrDiffCents = hypoAddCents - currentAddCents;
  const annTariffDiffCents = qtrDiffCents * quarters;
  const annNetWithSupplierCents =
    annTariffDiffCents + transitionCostCents + recurringAltCentsPerQtr * quarters;

  // Higher cost lowers OE (-1x); lower cost increases OE (+1x)
  const oeQtrImpactCents = -(qtrDiffCents + recurringAltCentsPerQtr);
  const oeAnnImpactCents = -annNetWithSupplierCents;

  return {
    selectedCount: input.entries.length,
    dutiableGoodsValueCad: fromMinorCents(goodsCents),
    normalMfnDutyCad: fromMinorCents(mfnCents),
    exportDutyCad: fromMinorCents(exportCents),
    currentAdditionalTariffCad: fromMinorCents(currentAddCents),
    hypotheticalAdditionalTariffCad: fromMinorCents(hypoAddCents),
    quarterlyTariffDifferenceCad: fromMinorCents(qtrDiffCents),
    annualizedTariffDifferenceCad: fromMinorCents(annTariffDiffCents),
    transitionCostCad: fromMinorCents(transitionCostCents),
    recurringAltSupplierDeltaPerQuarterCad: fromMinorCents(recurringAltCentsPerQtr),
    annualizedNetImpactWithSupplierCostsCad: fromMinorCents(annNetWithSupplierCents),
    estimatedOeImpactQuarterlyCad: fromMinorCents(oeQtrImpactCents),
    estimatedOeImpactAnnualCad: fromMinorCents(oeAnnImpactCents),
    perEntryBreakdown,
  };
}

const NON_FRAUD_DISCLAIMER =
  'Flagged records indicate rule-based review priority only and are not automatically fraudulent, incorrect, or recoverable.';

export function evaluateBusinessRules(params: {
  rules: BusinessRuleConfig[];
  irregularCosts: IrregularCost[];
  walkEntries: OperatingEarningsWalkEntry[];
  customsEntries: CustomsEntry[];
  domesticRecords: DomesticShipmentRecord[];
}): RuleEvaluationResult[] {
  const results: RuleEvaluationResult[] = [];
  const ruleMap = new Map(params.rules.map((r) => [r.id, r]));

  // RULE 01: Individual cost >= threshold (default CAD 250,000)
  const r1 = ruleMap.get('RULE_01_INDIVIDUAL_COST_SCREEN');
  if (r1?.enabled) {
    const threshold = r1.thresholdValue ?? 250_000;
    for (const cost of params.irregularCosts) {
      if (cost.amountCad >= threshold) {
        results.push({
          id: `eval-r1-${cost.id}`,
          ruleId: r1.id,
          ruleCode: r1.code,
          recordType: 'irregular_cost',
          recordId: cost.id,
          recordLabel: `${cost.id} · ${cost.item}`,
          severity: cost.amountCad >= 500_000 ? 'high' : 'medium',
          flagged: true,
          summary: `Cost (${formatCad(cost.amountCad)}) meets or exceeds ${formatCad(threshold)} entry screening threshold.`,
          detail: `${cost.department} (${cost.regionName}) · Timing: ${cost.timing}.`,
          monetaryExposureCad: cost.amountCad,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 02: Approval screening
  const r2 = ruleMap.get('RULE_02_APPROVAL_SCREEN');
  if (r2?.enabled) {
    for (const cost of params.irregularCosts) {
      if (cost.approvalStatus === 'explicitly_missing' || cost.approvalStatus === 'not_supplied_in_appendix') {
        const isExplicit = cost.approvalStatus === 'explicitly_missing';
        results.push({
          id: `eval-r2-${cost.id}`,
          ruleId: r2.id,
          ruleCode: r2.code,
          recordType: 'irregular_cost',
          recordId: cost.id,
          recordLabel: `${cost.id} · ${cost.item}`,
          severity: isExplicit ? 'high' : 'medium',
          flagged: true,
          summary: isExplicit
            ? 'Approval / originator explicitly missing in case record.'
            : 'Approval reference not supplied in Appendix.',
          detail: cost.approvalNote,
          monetaryExposureCad: cost.amountCad,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 03: Material variance (>= CAD 1,000,000 on walk line)
  const r3 = ruleMap.get('RULE_03_MATERIAL_VARIANCE');
  if (r3?.enabled) {
    const threshold = r3.thresholdValue ?? 1_000_000;
    for (const entry of params.walkEntries) {
      if (entry.bucket === 'Start' || entry.bucket === 'End') continue;
      if (Math.abs(entry.amountCad) >= threshold) {
        results.push({
          id: `eval-r3-${entry.id}`,
          ruleId: r3.id,
          ruleCode: r3.code,
          recordType: 'walk_entry',
          recordId: entry.id,
          recordLabel: entry.stepLabel,
          severity: 'info',
          flagged: true,
          summary: `Material walk variance (${formatCad(entry.amountCad, { showSign: true })}) requires documented explanation before close.`,
          detail: `Source: ${entry.sourceRef} · Absolute variance >= ${formatCad(threshold)}.`,
          monetaryExposureCad: Math.abs(entry.amountCad),
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 04: Broker contract (0.2% of goods value)
  const r4 = ruleMap.get('RULE_04_BROKER_CONTRACT');
  if (r4?.enabled) {
    const contractPct = r4.thresholdValue ?? 0.2;
    for (const entry of params.customsEntries) {
      const expected = calculateExpectedBrokerFeeCad(entry.goodsValueCad, contractPct);
      const diff = fromMinorCents(toMinorCents(entry.brokerFeeChargedCad) - toMinorCents(expected));
      if (diff !== 0) {
        results.push({
          id: `eval-r4-${entry.id}`,
          ruleId: r4.id,
          ruleCode: r4.code,
          recordType: 'customs_entry',
          recordId: entry.id,
          recordLabel: `${entry.id} · ${entry.goods} (${entry.route})`,
          severity: diff > 1000 ? 'high' : 'medium',
          flagged: true,
          summary:
            diff > 0
              ? `Broker fee overcharged by ${formatCad(diff)} vs. ${contractPct}% contract (${formatCad(expected)}).`
              : `Broker fee undercharged by ${formatCad(Math.abs(diff))} vs. ${contractPct}% contract (${formatCad(expected)}).`,
          detail: `Charged ${formatCad(entry.brokerFeeChargedCad)} on ${formatCad(entry.goodsValueCad)} goods value.`,
          monetaryExposureCad: diff,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 05: Tariff separation (normal MFN vs additional China tariff)
  const r5 = ruleMap.get('RULE_05_TARIFF_SEPARATION');
  if (r5?.enabled) {
    for (const entry of params.customsEntries) {
      if (entry.additionalTariffCad > 0) {
        results.push({
          id: `eval-r5-${entry.id}`,
          ruleId: r5.id,
          ruleCode: r5.code,
          recordType: 'customs_entry',
          recordId: entry.id,
          recordLabel: `${entry.id} · ${entry.goods}`,
          severity: 'info',
          flagged: true,
          summary: `Additional ${entry.additionalTariffPct}% tariff (${formatCad(entry.additionalTariffCad)}) separated from MFN duty (${formatCad(entry.mfnDutyCad)}).`,
          detail: `Practice rate assumption applied to ${entry.originCountry} origin goods.`,
          monetaryExposureCad: entry.additionalTariffCad,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 06: Trade agreement exemption check
  const r6 = ruleMap.get('RULE_06_TRADE_AGREEMENT_OPPORTUNITY');
  if (r6?.enabled) {
    for (const entry of params.customsEntries) {
      if (entry.tradeAgreementStatus === 'CUSMA_not_claimed') {
        results.push({
          id: `eval-r6-${entry.id}`,
          ruleId: r6.id,
          ruleCode: r6.code,
          recordType: 'customs_entry',
          recordId: entry.id,
          recordLabel: `${entry.id} · ${entry.goods} (${entry.route})`,
          severity: 'medium',
          flagged: true,
          summary: `Possible CUSMA duty exemption (${formatCad(entry.totalDutyAndTariffCad)} paid at ${entry.mfnRatePct}% MFN); eligibility unconfirmed pending origin documentation verification.`,
          detail:
            'Case narrative notes origin certificate located in email, but formal border/compliance verification is required before confirming eligibility.',
          monetaryExposureCad: entry.totalDutyAndTariffCad,
          nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
        });
      }
    }
  }

  // RULE 07: Domestic interprovincial separation
  const r7 = ruleMap.get('RULE_07_DOMESTIC_SEPARATION');
  if (r7?.enabled && params.domesticRecords.length > 0) {
    const totalSalesTax = params.domesticRecords.reduce((s, r) => s + r.salesTaxCad, 0);
    const totalFreight = params.domesticRecords.reduce((s, r) => s + r.freightCad, 0);
    results.push({
      id: 'eval-r7-domestic',
      ruleId: r7.id,
      ruleCode: r7.code,
      recordType: 'domestic_summary',
      recordId: 'DOMESTIC-Q3-2026',
      recordLabel: 'Interprovincial Sales Tax & Freight (5 Provinces)',
      severity: 'info',
      flagged: false,
      summary: `Excluded ${formatCad(totalSalesTax)} in provincial sales taxes and ${formatCad(totalFreight)} in domestic freight from customs duty totals.`,
      detail: 'Interprovincial Canadian deliveries carry CAD 0 customs duty.',
      monetaryExposureCad: totalSalesTax + totalFreight,
      nonFraudDisclaimer: NON_FRAUD_DISCLAIMER,
    });
  }

  return results;
}

const SEVERITY_RANK: Record<RuleSeverity, number> = { high: 3, medium: 2, info: 1 };

/**
 * Group multiple rule violations on a single record into one actionable alert
 * while keeping all individual rule evaluations inside the alert payload.
 */
export function groupRuleEvaluationsByRecord(evaluations: RuleEvaluationResult[]): GroupedRuleAlert[] {
  const map = new Map<string, RuleEvaluationResult[]>();
  for (const ev of evaluations) {
    if (!ev.flagged) continue;
    const key = `${ev.recordType}::${ev.recordId}`;
    const existing = map.get(key) ?? [];
    existing.push(ev);
    map.set(key, existing);
  }

  const grouped: GroupedRuleAlert[] = [];
  for (const [key, list] of map.entries()) {
    const sorted = [...list].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const primary = sorted[0];
    grouped.push({
      id: `grp-${key}`,
      recordType: primary.recordType,
      recordId: primary.recordId,
      recordLabel: primary.recordLabel,
      highestSeverity: primary.severity,
      ruleCodes: Array.from(new Set(sorted.map((item) => item.ruleCode))),
      primarySummary: primary.summary,
      evaluations: sorted,
      monetaryExposureCad: primary.monetaryExposureCad,
    });
  }

  return grouped.sort((a, b) => SEVERITY_RANK[b.highestSeverity] - SEVERITY_RANK[a.highestSeverity]);
}

export interface AcceptanceCheckItem {
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
}

/**
 * Deterministic verification of all Section 9 (Phase 1) + Section 8 (Phase 2) checks.
 */
export function runFinancialAcceptanceChecks(): AcceptanceCheckItem[] {
  const q3_2026 = INCOME_STATEMENTS.find((i) => i.quarterId === 'Q3 2026')!;
  const q3_2025 = INCOME_STATEMENTS.find((i) => i.quarterId === 'Q3 2025')!;
  const q2_2026 = INCOME_STATEMENTS.find((i) => i.quarterId === 'Q2 2026')!;

  const totalIrregular = IRREGULAR_COSTS.reduce((sum, c) => sum + c.amountCad, 0);
  const largestIrregular = Math.max(...IRREGULAR_COSTS.map((c) => c.amountCad));

  const totalGoodsValue = CUSTOMS_ENTRIES.reduce((sum, e) => sum + e.goodsValueCad, 0);
  const totalDutiesTariffs = CUSTOMS_ENTRIES.reduce((sum, e) => sum + e.totalDutyAndTariffCad, 0);
  const totalBrokerFees = CUSTOMS_ENTRIES.reduce((sum, e) => sum + e.brokerFeeChargedCad, 0);
  const totalTradeCosts = totalDutiesTariffs + totalBrokerFees;

  const expectedContractFees = CUSTOMS_ENTRIES.reduce(
    (sum, e) => sum + calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2),
    0
  );
  const all12BrokerMatch = CUSTOMS_ENTRIES.every((e) => {
    const exp = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
    return exp === e.brokerFeeExpectedCad && e.brokerFeeChargedCad - exp === e.brokerVarianceReportedCad;
  });

  const grossOvercharges = CUSTOMS_ENTRIES.reduce(
    (sum, e) => sum + Math.max(0, e.brokerFeeChargedCad - calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2)),
    0
  );
  const undercharges = CUSTOMS_ENTRIES.reduce(
    (sum, e) => sum + Math.min(0, e.brokerFeeChargedCad - calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2)),
    0
  );
  const netOverContract = grossOvercharges + undercharges;

  const chinaEntries = CUSTOMS_ENTRIES.filter((e) => e.originCountry === 'China');
  const chinaValue = chinaEntries.reduce((sum, e) => sum + e.goodsValueCad, 0);
  const china0 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 0, annualizationQuarters: 4 });
  const china15 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 15, annualizationQuarters: 4 });
  const china25 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 25, annualizationQuarters: 4 });
  const china35 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 35, annualizationQuarters: 4 });
  const china100 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 100, annualizationQuarters: 4 });
  const china200 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 200, annualizationQuarters: 4 });
  const china500 = calculateMultiEntryTariffScenario({ entries: chinaEntries, hypotheticalAdditionalRatePct: 500, annualizationQuarters: 4 });

  // Single shipment E-04 tariff check (CAD 900,000)
  const e04 = CUSTOMS_ENTRIES.filter((e) => e.id === 'E-04');
  const e04At15 = calculateMultiEntryTariffScenario({ entries: e04, hypotheticalAdditionalRatePct: 15, annualizationQuarters: 4 });

  const regionalSalesSum = REGIONAL_SALES.reduce((s, r) => s + r.salesCurrentCad, 0);
  const domesticSalesTaxSum = DOMESTIC_SHIPMENT_RECORDS.reduce((s, r) => s + r.salesTaxCad, 0);
  const domesticFreightSum = DOMESTIC_SHIPMENT_RECORDS.reduce((s, r) => s + r.freightCad, 0);
  const domesticSalesSum = DOMESTIC_SHIPMENT_RECORDS.reduce((s, r) => s + r.salesCad, 0);

  const yoyWalk = OPERATING_EARNINGS_WALKS.find((w) => w.comparisonType === 'YoY')!;
  const qoqWalk = OPERATING_EARNINGS_WALKS.find((w) => w.comparisonType === 'QoQ')!;
  const yoyWalkSum = yoyWalk.entries
    .filter((e) => e.bucket !== 'End')
    .reduce((s, e) => s + e.amountCad, 0);
  const qoqWalkSum = qoqWalk.entries
    .filter((e) => e.bucket !== 'End')
    .reduce((s, e) => s + e.amountCad, 0);

  const yoyMaterialCount = yoyWalk.entries.filter(
    (e) => e.bucket !== 'Start' && e.bucket !== 'End' && Math.abs(e.amountCad) >= 1_000_000
  ).length;
  const qoqMaterialCount = qoqWalk.entries.filter(
    (e) => e.bucket !== 'Start' && e.bucket !== 'End' && Math.abs(e.amountCad) >= 1_000_000
  ).length;

  const historicalQ3_2026 = HISTORICAL_TRADE_COSTS.find((h) => h.quarterId === 'Q3 2026')!;
  const scenario15 = TARIFF_SCENARIOS.find((s) => s.tariffRatePct === 15)!;

  return [
    { label: 'Q3 2026 Sales', expected: 'CAD 329,700,000', actual: formatCad(q3_2026.salesCad), passed: q3_2026.salesCad === 329_700_000 },
    { label: 'Q3 2026 Sales == Regional Sum', expected: 'CAD 329,700,000', actual: formatCad(regionalSalesSum), passed: regionalSalesSum === 329_700_000 },
    { label: 'Q3 2026 Operating Earnings', expected: 'CAD 20,700,000', actual: formatCad(q3_2026.operatingEarningsCad), passed: q3_2026.operatingEarningsCad === 20_700_000 },
    { label: 'Q3 2025 Operating Earnings', expected: 'CAD 15,200,000', actual: formatCad(q3_2025.operatingEarningsCad), passed: q3_2025.operatingEarningsCad === 15_200_000 },
    { label: 'Q2 2026 Operating Earnings', expected: 'CAD 16,500,000', actual: formatCad(q2_2026.operatingEarningsCad), passed: q2_2026.operatingEarningsCad === 16_500_000 },
    { label: 'Q3 2026 OE Margin', expected: '6.3%', actual: `${calculateOperatingMarginPct(q3_2026.operatingEarningsCad, q3_2026.salesCad)}%`, passed: calculateOperatingMarginPct(q3_2026.operatingEarningsCad, q3_2026.salesCad) === 6.3 },
    { label: 'YoY & QoQ Walk Reconciliation', expected: 'CAD 20,700,000', actual: `${formatCad(yoyWalkSum)} / ${formatCad(qoqWalkSum)}`, passed: yoyWalkSum === 20_700_000 && qoqWalkSum === 20_700_000 },
    { label: 'Rule 03 Material Walk Lines (>= CAD 1M)', expected: '4 YoY / 4 QoQ', actual: `${yoyMaterialCount} YoY / ${qoqMaterialCount} QoQ`, passed: yoyMaterialCount === 4 && qoqMaterialCount === 4 },
    { label: 'Total Irregular Costs (7 records)', expected: 'CAD 2,818,000 (7)', actual: `${formatCad(totalIrregular)} (${IRREGULAR_COSTS.length})`, passed: totalIrregular === 2_818_000 && IRREGULAR_COSTS.length === 7 },
    { label: 'Largest Individual Irregular Cost', expected: 'CAD 900,000', actual: formatCad(largestIrregular), passed: largestIrregular === 900_000 },
    { label: 'Q3 2026 Customs Entries Count', expected: '12', actual: `${CUSTOMS_ENTRIES.length}`, passed: CUSTOMS_ENTRIES.length === 12 },
    { label: 'Total Customs Entry Goods Value', expected: 'CAD 9,980,000', actual: formatCad(totalGoodsValue), passed: totalGoodsValue === 9_980_000 },
    { label: 'Total Duties and Tariffs', expected: 'CAD 711,250', actual: formatCad(totalDutiesTariffs), passed: totalDutiesTariffs === 711_250 },
    { label: 'Total Broker Fees', expected: 'CAD 25,520', actual: formatCad(totalBrokerFees), passed: totalBrokerFees === 25_520 },
    { label: 'Total Q3 2026 Trade Costs (Exact vs. Rounded)', expected: 'CAD 736,770 (vs $737.0K)', actual: `${formatCad(totalTradeCosts)} (vs ${formatCadCompact(historicalQ3_2026.totalRoundedCad)})`, passed: totalTradeCosts === QUARTERLY_TRADE_SUMMARY_Q3_2026.totalTradeCostCad && totalTradeCosts === 736_770 },
    { label: 'All 12 Entry Broker Calculations (0.2%)', expected: '12/12 exact', actual: all12BrokerMatch ? '12/12 exact' : 'mismatch', passed: all12BrokerMatch && expectedContractFees === BROKER_CONTRACT_SUMMARY_Q3_2026.feesAtContractCad },
    { label: 'Gross Broker Overcharges / Undercharges / Net', expected: '+8,260 / -2,700 / +5,560', actual: `+${grossOvercharges.toLocaleString()} / ${undercharges.toLocaleString()} / +${netOverContract.toLocaleString()}`, passed: grossOvercharges === 8_260 && undercharges === -2_700 && netOverContract === 5_560 },
    { label: 'China-Made Goods Value & 25% Tariff', expected: 'CAD 2,100,000 / CAD 525,000', actual: `${formatCad(chinaValue)} / ${formatCad(china25.hypotheticalAdditionalTariffCad)}`, passed: chinaValue === 2_100_000 && china25.hypotheticalAdditionalTariffCad === 525_000 },
    { label: 'China Tariff 15% (Qtr / Delta / Annual)', expected: '315,000 / -210,000 / -840,000', actual: `${china15.hypotheticalAdditionalTariffCad.toLocaleString()} / ${china15.quarterlyTariffDifferenceCad.toLocaleString()} / ${china15.annualizedTariffDifferenceCad.toLocaleString()}`, passed: china15.hypotheticalAdditionalTariffCad === 315_000 && scenario15.changePerQuarterCad === -210_000 && china15.annualizedTariffDifferenceCad === -840_000 },
    { label: 'China Tariff 0%, 35%, 100%, 200%, 500%', expected: '0 / 735K / 2.1M / 4.2M / 10.5M', actual: `${china0.hypotheticalAdditionalTariffCad} / ${china35.hypotheticalAdditionalTariffCad} / ${china100.hypotheticalAdditionalTariffCad} / ${china200.hypotheticalAdditionalTariffCad} / ${china500.hypotheticalAdditionalTariffCad}`, passed: china0.hypotheticalAdditionalTariffCad === 0 && china35.hypotheticalAdditionalTariffCad === 735_000 && china100.hypotheticalAdditionalTariffCad === 2_100_000 && china200.hypotheticalAdditionalTariffCad === 4_200_000 && china500.hypotheticalAdditionalTariffCad === 10_500_000 },
    { label: 'Single Shipment E-04 at 15% (MFN Unchanged)', expected: '135,000 tariff / 31,500 MFN', actual: `${e04At15.hypotheticalAdditionalTariffCad.toLocaleString()} tariff / ${e04At15.normalMfnDutyCad.toLocaleString()} MFN`, passed: e04At15.hypotheticalAdditionalTariffCad === 135_000 && e04At15.normalMfnDutyCad === 31_500 },
    { label: 'Domestic Sales / Tax / Freight Separated (Rule 07)', expected: '7.3M / 799,525 / 95,400', actual: `${domesticSalesSum.toLocaleString()} / ${domesticSalesTaxSum.toLocaleString()} / ${domesticFreightSum.toLocaleString()}`, passed: domesticSalesSum === 7_300_000 && domesticSalesTaxSum === 799_525 && domesticFreightSum === 95_400 },
  ];
}
