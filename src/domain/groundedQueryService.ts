import {
  BROKER_CONTRACT_SUMMARY_Q3_2026,
  CUSTOMS_ENTRIES,
  DEPARTMENT_COST_TOTALS,
  DOMESTIC_SHIPMENT_RECORDS,
  HISTORICAL_TRADE_COSTS,
  INCOME_STATEMENTS,
  IRREGULAR_COSTS,
  OPERATING_EARNINGS_WALKS,
  PARTIAL_LEDGER_TRANSACTIONS,
  QUARTERLY_TRADE_SUMMARY_Q3_2026,
  REGIONAL_SALES,
  REGION_COST_TOTALS,
  REPORTING_PERIODS,
  TARIFF_SCENARIOS,
} from '../data/caseSeed';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  AskSkyjackChartSpec,
  AskSkyjackCitation,
  AskSkyjackKpiItem,
  AskSkyjackResponse,
  CurrencyCode,
  QuarterId,
  User,
} from '../types/domain';
import {
  convertFromCad,
  DEMO_CAD_TO_USD_RATE,
  formatReportingCompact,
  formatReportingMoney,
} from './currencyService';
import { buildCostOpportunities, computeOpportunityAnalytics } from './opportunityEngine';
import {
  canPerformAction,
  filterCustomsEntriesForUser,
  filterIrregularCostsForUser,
} from './permissions';
import { computeQuarterEndReadiness } from './readinessEngine';
import {
  calculateExpectedBrokerFeeCad,
  fromMinorCents,
  toMinorCents,
} from './rulesEngine';

export type AllowedQueryToolName =
  | 'queryIncomeStatements'
  | 'compareReportingPeriods'
  | 'findFinancialRecords'
  | 'searchUploadedTransactions'
  | 'searchCustomsEntries'
  | 'calculateFinancialAggregates'
  | 'retrieveInvestigations'
  | 'retrieveApprovalRequests'
  | 'retrieveTariffScenarios'
  | 'retrieveImportBatchResults'
  | 'retrieveAuditHistory'
  | 'retrieveEvidenceMetadata'
  | 'retrieveCostOpportunities'
  | 'retrieveQuarterEndReadiness';

export interface GroundedContextPacket {
  userRole: string;
  userTitle: string;
  activeQuarter: QuarterId;
  activeRegion: string;
  reportingCurrency: CurrencyCode;
  fxNote?: string;
  invokedTools: AllowedQueryToolName[];
  permissionRestrictions: string[];
  unavailableDataRequested: string[];
  officialCaseFacts: Record<string, unknown>;
  authorizedUploadsFacts: Record<string, unknown>;
  quarantinedReviewContext: Record<string, unknown>;
  hypotheticalScenarioFacts: Record<string, unknown>;
  allowedCitations: AskSkyjackCitation[];
  deterministicChartCandidate?: AskSkyjackChartSpec;
}

/**
 * Mitigates prompt injection embedded in untrusted uploaded descriptions or evidence strings.
 */
export function sanitizeUntrustedText(raw: string, maxLen = 220): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/(ignore\s+previous\s+instructions|system\s*:|assistant\s*:|<\s*\/?\s*(system|prompt|instruction)[^>]*>)/gi, '[filtered-control-phrase]')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}

function detectQuarterMentions(qLower: string): { matchedQuarters: QuarterId[]; unsupportedQuarters: string[] } {
  const regex = /\bq([1-4])\s*(20\d{2})\b/gi;
  const matchedQuarters: QuarterId[] = [];
  const unsupportedQuarters: string[] = [];
  const validIds = new Set(REPORTING_PERIODS.map((p) => p.id.toUpperCase()));

  let match: RegExpExecArray | null;
  while ((match = regex.exec(qLower)) !== null) {
    const label = `Q${match[1]} ${match[2]}`;
    if (validIds.has(label.toUpperCase())) {
      matchedQuarters.push(label as QuarterId);
    } else {
      unsupportedQuarters.push(label);
    }
  }
  return { matchedQuarters: Array.from(new Set(matchedQuarters)), unsupportedQuarters: Array.from(new Set(unsupportedQuarters)) };
}

/**
 * Allowlisted Read-Only Query Functions & Structured Query Planner.
 * Applies role-based permissions BEFORE and AFTER data retrieval.
 */
export function buildGroundedContextPacket(
  question: string,
  state: PersistedWorkspaceState,
  user: User
): GroundedContextPacket {
  const qLower = question.toLowerCase();
  const invokedTools: AllowedQueryToolName[] = [];
  const permissionRestrictions: string[] = [];
  const unavailableDataRequested: string[] = [];
  const allowedCitations: AskSkyjackCitation[] = [];

  const { matchedQuarters, unsupportedQuarters } = detectQuarterMentions(qLower);
  if (unsupportedQuarters.length > 0) {
    unavailableDataRequested.push(
      `Requested period(s) ${unsupportedQuarters.join(', ')} are outside the competition dataset (which spans Q4 2024 through Q3 2026 only).`
    );
  }

  // Pre-retrieval permission gates
  const canViewFinancials = canPerformAction(user, 'view_financials');
  const canViewTrade = canPerformAction(user, 'view_trade') && user.roleId !== 'operational_contributor';
  const canViewApprovals = canPerformAction(user, 'submit_correction_request');
  const canViewQuarantine = canPerformAction(user, 'review_quarantined_records');
  const canViewAudit = canPerformAction(user, 'view_audit_history');

  const officialCaseFacts: Record<string, unknown> = {};
  const authorizedUploadsFacts: Record<string, unknown> = {};
  const quarantinedReviewContext: Record<string, unknown> = {};
  const hypotheticalScenarioFacts: Record<string, unknown> = {};
  let deterministicChartCandidate: AskSkyjackChartSpec | undefined;

  // Intent classification
  const mentionsEarningsOrRevenue =
    /operating earnings|earnings|revenue|sales|margin|q[1-4]\s*20\d{2}|compare|improve|growth|yoy|qoq|walk|bridge|statement/i.test(qLower);
  const mentionsIrregularOrInv =
    /ir-0\d|irregular|flag|scrap|weld|freight|duplicate|warranty|investigation|investigate|cost.*require|anomaly|anomalies|write-off/i.test(qLower);
  const mentionsCustomsOrTrade =
    /e-\d{2}|shipment|customs|duty|duties|tariff|broker|overcharge|china|chinese|germany|german|mexico|mexican|cusma|cptpp|hs\s*code|export|domestic|trade/i.test(qLower);
  const mentionsTariffScenario =
    /tariff.*(fall|drop|reduce|increase|change|15%|35%)|scenario|simulat|what happens if/i.test(qLower);
  const mentionsUploadsOrQuarantine =
    /upload|batch|quarantin|rejected|import|gateway|most recent|latest/i.test(qLower);
  const mentionsApprovals = /approv|pending|outstanding|request|reclass/i.test(qLower);
  const mentionsOpportunities = /opportunit|saving|recover|realized|avoidable/i.test(qLower);
  const mentionsReadiness = /readiness|quarter-end|close|blocking/i.test(qLower);
  const mentionsAudit = /audit|history|trail|evidence/i.test(qLower);

  const currency: CurrencyCode = state.currency ?? 'CAD';
  const fxNote =
    currency === 'USD'
      ? `Reporting figures formatted in USD using static demonstration conversion rate 1 CAD = ${DEMO_CAD_TO_USD_RATE.toFixed(2)} USD. Authoritative stored baselines remain in CAD.`
      : undefined;

  // 1. Income statements & period comparisons (available on Overview for all roles; detailed statements scoped)
  if (mentionsEarningsOrRevenue || matchedQuarters.length > 0 || unsupportedQuarters.length > 0) {
    invokedTools.push('queryIncomeStatements');
    const isComparisonQuestion =
      matchedQuarters.length >= 2 ||
      /why|improve|compar|change|yoy|qoq|driver|explain|walk|bridge|margin|from\s+q[1-4]/i.test(qLower);

    const periodIdsOrder = REPORTING_PERIODS.map((p) => p.id);
    const expandedQuarters = new Set<QuarterId>(
      matchedQuarters.length > 0 ? matchedQuarters : (['Q3 2026', 'Q3 2025', 'Q2 2026'] as QuarterId[])
    );

    let inferredPriorQ: QuarterId | undefined;
    let inferredYearAgoQ: QuarterId | undefined;
    if (matchedQuarters.length === 1 && isComparisonQuestion) {
      const targetQ = matchedQuarters[0];
      const idx = periodIdsOrder.indexOf(targetQ);
      if (idx > 0) {
        inferredPriorQ = periodIdsOrder[idx - 1];
        expandedQuarters.add(inferredPriorQ);
      }
      const matchParts = targetQ.match(/^(Q[1-4])\s+(\d{4})$/);
      if (matchParts) {
        const candidateYearAgo = `${matchParts[1]} ${Number(matchParts[2]) - 1}` as QuarterId;
        if (periodIdsOrder.includes(candidateYearAgo)) {
          inferredYearAgoQ = candidateYearAgo;
          expandedQuarters.add(candidateYearAgo);
        }
      }
    }

    const targetQuarters = Array.from(expandedQuarters);

    officialCaseFacts.incomeStatements = INCOME_STATEMENTS.filter((s) =>
      targetQuarters.includes(s.quarterId)
    ).map((s) => ({
      quarterId: s.quarterId,
      salesCad: s.salesCad,
      salesFormatted: formatReportingMoney(s.salesCad, currency),
      operatingEarningsCad: s.operatingEarningsCad,
      operatingEarningsFormatted: formatReportingMoney(s.operatingEarningsCad, currency),
      oeShareOfSalesPct: s.oeShareOfSalesPct,
      variableCostsCad: s.variableCostsCad,
      fixedPlantCostsCad: s.fixedPlantCostsCad,
      sgaCad: s.sgaCad,
      amortizationCad: s.amortizationCad,
      sourceRef: s.sourceRef,
    }));

    if (isComparisonQuestion) {
      invokedTools.push('compareReportingPeriods');
      const toQ =
        matchedQuarters.length >= 2
          ? matchedQuarters[1]
          : matchedQuarters[0] ?? 'Q3 2026';
      const fromQ =
        matchedQuarters.length >= 2
          ? matchedQuarters[0]
          : inferredYearAgoQ ?? inferredPriorQ ?? 'Q3 2025';
      const fromStmt = INCOME_STATEMENTS.find((s) => s.quarterId === fromQ);
      const toStmt = INCOME_STATEMENTS.find((s) => s.quarterId === toQ);
      if (fromStmt && toStmt && fromQ !== toQ) {
        const salesDiff = fromMinorCents(toMinorCents(toStmt.salesCad) - toMinorCents(fromStmt.salesCad));
        const oeDiff = fromMinorCents(
          toMinorCents(toStmt.operatingEarningsCad) - toMinorCents(fromStmt.operatingEarningsCad)
        );
        officialCaseFacts.periodComparison = {
          fromQuarter: fromQ,
          toQuarter: toQ,
          fromOperatingEarningsCad: fromStmt.operatingEarningsCad,
          fromOperatingEarningsFormatted: formatReportingMoney(fromStmt.operatingEarningsCad, currency),
          toOperatingEarningsCad: toStmt.operatingEarningsCad,
          toOperatingEarningsFormatted: formatReportingMoney(toStmt.operatingEarningsCad, currency),
          operatingEarningsChangeCad: oeDiff,
          operatingEarningsChangeFormatted: formatReportingMoney(oeDiff, currency, { showSign: true }),
          salesChangeCad: salesDiff,
          salesChangeFormatted: formatReportingMoney(salesDiff, currency, { showSign: true }),
          sourceRef: 'Appendix 1.1 & 1.2',
        };
        deterministicChartCandidate = {
          title: `Operating Earnings Comparison (${fromQ} vs ${toQ})`,
          unitLabel: currency,
          bars: [
            {
              label: fromQ,
              value: convertFromCad(fromStmt.operatingEarningsCad, currency),
              formattedValue: formatReportingCompact(fromStmt.operatingEarningsCad, currency),
            },
            {
              label: toQ,
              value: convertFromCad(toStmt.operatingEarningsCad, currency),
              formattedValue: formatReportingCompact(toStmt.operatingEarningsCad, currency),
              highlight: true,
            },
          ],
        };
      }

      if (inferredPriorQ && inferredPriorQ !== toQ && inferredPriorQ !== fromQ) {
        const qoqFrom = INCOME_STATEMENTS.find((s) => s.quarterId === inferredPriorQ);
        if (qoqFrom && toStmt) {
          const qoqOeDiff = fromMinorCents(
            toMinorCents(toStmt.operatingEarningsCad) - toMinorCents(qoqFrom.operatingEarningsCad)
          );
          const qoqSalesDiff = fromMinorCents(
            toMinorCents(toStmt.salesCad) - toMinorCents(qoqFrom.salesCad)
          );
          officialCaseFacts.priorQuarterComparison = {
            fromQuarter: inferredPriorQ,
            toQuarter: toQ,
            operatingEarningsChangeFormatted: formatReportingMoney(qoqOeDiff, currency, { showSign: true }),
            salesChangeFormatted: formatReportingMoney(qoqSalesDiff, currency, { showSign: true }),
          };
        }
      }
    }

    if (/region|sales/i.test(qLower)) {
      officialCaseFacts.regionalSalesQ3_2026 = REGIONAL_SALES.map((r) => ({
        ...r,
        salesPriorYearFormatted: formatReportingMoney(r.salesPriorYearCad, currency),
        salesCurrentFormatted: formatReportingMoney(r.salesCurrentCad, currency),
        changeFormatted: formatReportingMoney(r.changeCad, currency, { showSign: true }),
      }));
    }
    if (/walk|bridge|why|change|driver|improve|earnings/i.test(qLower) && canViewFinancials) {
      officialCaseFacts.operatingEarningsWalks = OPERATING_EARNINGS_WALKS.map((w) => ({
        id: w.id,
        comparisonType: w.comparisonType,
        fromQuarterId: w.fromQuarterId,
        toQuarterId: w.toQuarterId,
        title: w.title,
        sourceRef: w.sourceRef,
        entries: w.entries.map((e) => ({
          id: e.id,
          sequence: e.sequence,
          stepLabel: e.stepLabel,
          bucket: e.bucket,
          amountCad: e.amountCad,
          amountFormatted: formatReportingMoney(e.amountCad, currency, {
            showSign: e.bucket !== 'Start' && e.bucket !== 'End',
          }),
          amountCompact: formatReportingCompact(e.amountCad, currency, {
            showSign: e.bucket !== 'Start' && e.bucket !== 'End',
          }),
          isMaterialReported: e.isMaterialReported,
          linkedIrregularCostId: e.linkedIrregularCostId,
          sourceRef: e.sourceRef,
        })),
      }));
    }
  }

  // 2. Irregular Costs & Financial Records (Scoped via filterIrregularCostsForUser!)
  if (mentionsIrregularOrInv || /cost|expense|department|je-|gl\s*\d/i.test(qLower)) {
    invokedTools.push('findFinancialRecords');
    const scopedIr = filterIrregularCostsForUser(user, IRREGULAR_COSTS);
    const idHits = scopedIr.filter((c) => qLower.includes(c.id.toLowerCase()));
    const targetIr = idHits.length > 0 ? idHits : scopedIr;

    officialCaseFacts.irregularCosts = targetIr.map((c) => {
      const ledger = PARTIAL_LEDGER_TRANSACTIONS.find((t) => t.linkedIrregularCostId === c.id);
      return {
        id: c.id,
        item: c.item,
        department: c.department,
        regionName: c.regionName,
        amountCad: c.amountCad,
        amountFormatted: formatReportingMoney(c.amountCad, currency),
        timing: c.timing,
        walkBucket: c.walkBucket,
        approvalStatus: c.approvalStatus,
        approvalNote: c.approvalNote,
        glAccount: ledger?.glAccount ?? c.glAccount,
        journalEntryRef: ledger?.journalOrPostingRef ?? c.journalEntryRef,
        postingDate: ledger?.postingDateLabel ?? c.fiveWs.when,
        fiveWs: c.fiveWs,
        sourceRef: c.sourceRef,
      };
    });

    targetIr.slice(0, 7).forEach((c) => {
      allowedCitations.push({
        recordId: c.id,
        recordType: 'irregular_cost',
        label: `${c.id} · ${c.item}`,
        route: '/financials',
      });
    });

    if (canViewFinancials) {
      officialCaseFacts.departmentCostTotalsQ3_2026 = DEPARTMENT_COST_TOTALS;
      officialCaseFacts.regionCostTotalsQ3_2026 = REGION_COST_TOTALS;
    } else if (/v-4471|warranty|corporate finance/i.test(qLower)) {
      permissionRestrictions.push(
        `Role ${user.title} is scoped out of Finance/Procurement corporate records outside North America Operations & Logistics.`
      );
    }
  }

  // 3. Customs & Trade Records (Pre-retrieval role enforcement!)
  if (mentionsCustomsOrTrade) {
    if (!canViewTrade) {
      permissionRestrictions.push(
        `Customs entries, broker fee audits, and international trade records are restricted for ${user.title} (${user.roleId}).`
      );
    } else {
      invokedTools.push('searchCustomsEntries');
      const scopedEntries = filterCustomsEntriesForUser(user, CUSTOMS_ENTRIES);

      // Filter by country or entry ID if explicitly mentioned, otherwise include all 12 Q3 entries (compact)
      const matchedEntries = scopedEntries.filter((e) => {
        if (qLower.includes(e.id.toLowerCase())) return true;
        if (qLower.includes('china') || qLower.includes('chinese')) return e.originCountry.toLowerCase() === 'china';
        if (qLower.includes('germany') || qLower.includes('german')) return e.originCountry.toLowerCase() === 'germany';
        if (qLower.includes('mexico') || qLower.includes('mexican') || qLower.includes('cusma')) {
          return e.originCountry.toLowerCase() === 'mexico';
        }
        if (qLower.includes('japan') || qLower.includes('cptpp')) return e.originCountry.toLowerCase() === 'japan';
        if (qLower.includes('overcharge') || qLower.includes('broker')) {
          const exp = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
          return toMinorCents(e.brokerFeeChargedCad) > toMinorCents(exp);
        }
        return true;
      });

      const finalEntries = matchedEntries.length > 0 ? matchedEntries : scopedEntries;
      const grossOverchargeFiltered = fromMinorCents(
        finalEntries.reduce((s, e) => {
          const exp = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
          const diff = toMinorCents(e.brokerFeeChargedCad) - toMinorCents(exp);
          return diff > 0 ? s + diff : s;
        }, 0)
      );

      officialCaseFacts.customsEntries = finalEntries.map((e) => {
        const expFee = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
        const variance = fromMinorCents(toMinorCents(e.brokerFeeChargedCad) - toMinorCents(expFee));
        return {
          id: e.id,
          quarterId: e.quarterId,
          direction: e.direction,
          originCountry: e.originCountry,
          destination: e.destination,
          route: e.route,
          goods: e.goods,
          hsCode: e.hsCode,
          goodsValueCad: e.goodsValueCad,
          mfnRatePct: e.mfnRatePct,
          additionalTariffPct: e.additionalTariffPct,
          totalDutyAndTariffCad: e.totalDutyAndTariffCad,
          brokerFeeChargedCad: e.brokerFeeChargedCad,
          brokerFeeExpectedCad: expFee,
          brokerVarianceCad: variance,
          tradeAgreementStatus: e.tradeAgreementStatus,
          originDocumentationStatus: e.originDocumentationStatus,
          sourceRef: e.sourceRef,
        };
      });
      officialCaseFacts.filteredBrokerGrossOverchargeCad = grossOverchargeFiltered;
      officialCaseFacts.q3TradeSummary = QUARTERLY_TRADE_SUMMARY_Q3_2026;
      officialCaseFacts.q3BrokerSummary = BROKER_CONTRACT_SUMMARY_Q3_2026;
      officialCaseFacts.historicalTradeCosts = HISTORICAL_TRADE_COSTS;
      if (/domestic|canada|gst|hst/i.test(qLower)) {
        officialCaseFacts.domesticShipmentsQ3_2026 = DOMESTIC_SHIPMENT_RECORDS;
      }

      finalEntries.slice(0, 8).forEach((e) => {
        allowedCitations.push({
          recordId: e.id,
          recordType: 'customs_entry',
          label: `${e.id} · ${e.originCountry} ${e.goods}`,
          route: '/trade',
        });
      });

      if (finalEntries.some((e) => e.brokerFeeChargedCad > calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2))) {
        deterministicChartCandidate = {
          title: `Filtered Broker Fee Variance by Entry (${currency})`,
          unitLabel: currency,
          bars: finalEntries
            .map((e) => {
              const varCad = fromMinorCents(
                toMinorCents(e.brokerFeeChargedCad) -
                  toMinorCents(calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2))
              );
              return {
                label: e.id,
                value: convertFromCad(varCad, currency),
                formattedValue: formatReportingMoney(varCad, currency, { showSign: true }),
                highlight: varCad > 0,
              };
            })
            .filter((b) => b.value !== 0)
            .slice(0, 6),
        };
      }
    }
  }

  // 4. Tariff Scenarios (Hypothetical only)
  if (mentionsTariffScenario) {
    if (!canViewTrade && !canViewFinancials) {
      permissionRestrictions.push(
        `Tariff sensitivity modelling is restricted for ${user.title}.`
      );
    } else {
      invokedTools.push('retrieveTariffScenarios');
      hypotheticalScenarioFacts.officialAppendix3_4Scenarios = TARIFF_SCENARIOS;
      hypotheticalScenarioFacts.savedUserScenarios = state.savedScenarios.map((s) => ({
        id: s.id,
        name: sanitizeUntrustedText(s.name, 120),
        chinaTariffRatePct: s.chinaTariffRatePct,
        dutiableGoodsValueCad: s.dutiableGoodsValueCad,
        baselineAdditionalTariffCostCad: s.baselineAdditionalTariffCostCad,
        projectedQuarterlyTariffCad: s.projectedQuarterlyTariffCad,
        quarterlyDifferenceCad: s.quarterlyDifferenceCad,
        annualizedDifferenceCad: s.annualizedDifferenceCad,
        notes: sanitizeUntrustedText(s.notes ?? '', 180),
      }));
      // Deterministic calculation if user asks for an arbitrary custom percentage (e.g. 10%, 15%, 20%, 35%)
      const pctMatch = qLower.match(/(\d+(?:\.\d+)?)\s*%/g);
      if (pctMatch && pctMatch.length > 0) {
        const lastPct = parseFloat(pctMatch[pctMatch.length - 1].replace('%', ''));
        if (!Number.isNaN(lastPct) && lastPct >= 0 && lastPct <= 500) {
          const chinaDutiable = 2_100_000;
          const baselineAddl = 525_000; // 25% of 2.1M
          const projectedQtr = fromMinorCents(Math.round((toMinorCents(chinaDutiable) * lastPct) / 100));
          const qtrDiff = fromMinorCents(toMinorCents(projectedQtr) - toMinorCents(baselineAddl));
          const annDiff = fromMinorCents(toMinorCents(qtrDiff) * 4);
          hypotheticalScenarioFacts.deterministicChinaRateSensitivity = {
            targetRatePct: lastPct,
            baselineRatePct: 25,
            dutiableChinaGoodsValueCad: chinaDutiable,
            baselineQuarterlyTariffCad: baselineAddl,
            projectedQuarterlyTariffCad: projectedQtr,
            quarterlyChangeCad: qtrDiff,
            illustrativeAnnualChangeCad: annDiff,
            assumptions: 'Unchanged Q3 2026 volume (E-04, E-05, E-06 = CAD 2.1M) and zero supplier switching cost.',
          };
        }
      }
    }
  }

  // 5. Authorized Uploaded Records & Latest Import Batch / Quarantine
  if (
    mentionsUploadsOrQuarantine ||
    state.uploadedLedgerTransactions.length > 0 ||
    state.uploadedCustomsRecords.length > 0
  ) {
    invokedTools.push('searchUploadedTransactions');
    invokedTools.push('calculateFinancialAggregates');

    const scopedUploadedLedger = canViewFinancials
      ? state.uploadedLedgerTransactions
      : state.uploadedLedgerTransactions.filter(
          (t) => t.regionId === 'north_america' && (t.department === 'Operations' || t.department === 'Logistics')
        );
    const scopedUploadedCustoms = canViewTrade ? state.uploadedCustomsRecords : [];

    authorizedUploadsFacts.authorizedLedgerCount = scopedUploadedLedger.length;
    authorizedUploadsFacts.authorizedLedgerTotalCad = fromMinorCents(
      scopedUploadedLedger.reduce((s, r) => s + toMinorCents(r.amountCad), 0)
    );
    authorizedUploadsFacts.authorizedLedgerRecords = scopedUploadedLedger.slice(0, 25).map((r) => ({
      transactionId: r.transactionId,
      postingDate: r.postingDate,
      accountingPeriod: r.accountingPeriod,
      regionName: r.regionName,
      department: r.department,
      glAccount: r.glAccount,
      amountCad: r.amountCad,
      description: sanitizeUntrustedText(r.description, 160),
      invoiceReference: r.invoiceReference,
    }));

    authorizedUploadsFacts.authorizedCustomsCount = scopedUploadedCustoms.length;
    authorizedUploadsFacts.authorizedCustomsRecords = scopedUploadedCustoms.slice(0, 20).map((c) => ({
      entryId: c.entryId,
      shipmentDate: c.shipmentDate,
      originCountry: c.originCountry,
      destination: c.destination,
      goodsDescription: sanitizeUntrustedText(c.goodsDescription, 140),
      goodsValueCad: c.goodsValueCad,
      actualDutyCad: c.actualDutyCad,
      actualBrokerFeeCad: c.actualBrokerFeeCad,
      brokerVarianceCad: c.brokerVarianceCad,
    }));

    scopedUploadedLedger.slice(0, 5).forEach((t) => {
      allowedCitations.push({
        recordId: t.transactionId,
        recordType: 'uploaded_ledger',
        label: `${t.transactionId} · ${t.department} (Uploaded)`,
        route: '/financials',
      });
    });
    scopedUploadedCustoms.slice(0, 5).forEach((c) => {
      allowedCitations.push({
        recordId: c.entryId,
        recordType: 'uploaded_customs',
        label: `${c.entryId} · ${c.originCountry} (Uploaded)`,
        route: '/trade',
      });
    });
  }

  if (mentionsUploadsOrQuarantine) {
    invokedTools.push('retrieveImportBatchResults');
    const latestBatch = state.importBatches[0];
    if (!latestBatch) {
      quarantinedReviewContext.latestBatch = null;
      quarantinedReviewContext.note = 'No import batches have been uploaded yet in this demonstration workspace.';
    } else {
      const quarantinedRows = canViewQuarantine
        ? latestBatch.records
            .filter((r) => r.outcome === 'QUARANTINED')
            .slice(0, 25)
            .map((r) => ({
              recordId: r.stableRecordId,
              rowNumber: r.rowNumber,
              amountCad: r.amountCad,
              department: r.department,
              reviewStatus: r.reviewStatus,
              reasons: r.reasons.map((msg) => sanitizeUntrustedText(msg, 180)),
            }))
        : [];
      if (!canViewQuarantine && latestBatch.quarantinedCount > 0) {
        permissionRestrictions.push(
          `Detailed quarantined record inspection requires Controller or specialist reviewer permissions (${user.title} sees batch summary counts only).`
        );
      }
      quarantinedReviewContext.latestBatch = {
        id: latestBatch.id,
        fileName: sanitizeUntrustedText(latestBatch.fileName, 120),
        status: latestBatch.status,
        createdAtIso: latestBatch.createdAtIso,
        recordCount: latestBatch.recordCount,
        validatedCount: latestBatch.validatedCount,
        quarantinedCount: latestBatch.quarantinedCount,
        rejectedCount: latestBatch.rejectedCount,
        quarantinedNote: 'Excluded from all trusted financial totals until reviewed and released by Controller.',
        quarantinedRecords: quarantinedRows,
      };
      allowedCitations.push({
        recordId: latestBatch.id,
        recordType: 'batch',
        label: `Batch: ${latestBatch.fileName}`,
        route: '/data-gateway',
      });
    }
  }

  // 6. Investigations
  if (mentionsIrregularOrInv || mentionsCustomsOrTrade || mentionsReadiness || /open|investigat/i.test(qLower)) {
    invokedTools.push('retrieveInvestigations');
    const scopedInvs = state.investigations.filter((inv) => {
      if (user.roleId === 'operational_contributor') {
        return inv.regionId === 'north_america' && (inv.department === 'Operations' || inv.department === 'Logistics');
      }
      if (user.roleId === 'trade_coordinator') {
        return inv.department === 'Customs and Trade' || inv.department === 'Logistics';
      }
      return true;
    });
    officialCaseFacts.investigations = scopedInvs.map((inv) => ({
      id: inv.id,
      linkedRecordId: inv.linkedRecordId,
      title: inv.title,
      department: inv.department,
      exposureCad: inv.exposureCad,
      priority: inv.priority,
      workflowStatus: inv.workflowStatus,
      ruleCodes: inv.ruleCodes ?? [],
      notes: sanitizeUntrustedText(inv.notes, 160),
    }));
  }

  // 7. Approvals
  if (mentionsApprovals || mentionsReadiness) {
    if (!canViewApprovals) {
      permissionRestrictions.push(`Approval governance queues require submission/review permissions.`);
    } else {
      invokedTools.push('retrieveApprovalRequests');
      const scopedApprovals = state.approvalRequests.filter((r) => {
        if (user.roleId === 'operational_contributor') return r.requestedByUserId === user.id;
        return true;
      });
      officialCaseFacts.approvalRequests = scopedApprovals.map((r) => ({
        id: r.id,
        linkedRecordId: r.linkedRecordId,
        requestType: r.requestType,
        title: sanitizeUntrustedText(r.title, 120),
        amountCad: r.amountCad,
        workflowStatus: r.workflowStatus,
        resolutionStatus: r.resolutionStatus,
        stepsCompleted: r.approvalsHistory.filter((s) => s.decision === 'Approved').length,
        requiredApprovalsCount: r.requiredApprovalsCount,
        rationale: sanitizeUntrustedText(r.rationale, 180),
      }));
      scopedApprovals.slice(0, 6).forEach((r) => {
        allowedCitations.push({
          recordId: r.id,
          recordType: 'approval',
          label: r.title,
          route: '/approvals',
        });
      });
    }
  }

  // 8. Opportunities & Quarter-End Readiness & Evidence/Audit
  if (mentionsOpportunities) {
    invokedTools.push('retrieveCostOpportunities');
    const opps = buildCostOpportunities(state, user);
    officialCaseFacts.costOpportunities = opps.map((o) => ({
      id: o.id,
      title: o.title,
      category: o.category,
      financialImpactType: o.financialImpactType,
      estimatedAmountCad: o.estimatedAmountCad,
      verifiedAmountCad: o.verifiedAmountCad,
      realizedAmountCad: o.realizedAmountCad,
      status: o.status,
      sourceRecordId: o.sourceRecordId,
    }));
    officialCaseFacts.opportunityAnalytics = computeOpportunityAnalytics(opps);
  }

  if (mentionsReadiness) {
    invokedTools.push('retrieveQuarterEndReadiness');
    officialCaseFacts.quarterEndReadiness = computeQuarterEndReadiness(state, user, state.selectedQuarterId);
  }

  if (mentionsAudit) {
    if (canViewAudit) {
      invokedTools.push('retrieveAuditHistory');
      officialCaseFacts.recentAuditEvents = state.auditEvents.slice(0, 15).map((a) => ({
        timestampIso: a.timestampIso,
        actorName: a.actorName,
        actionType: a.actionType,
        targetRecordId: a.targetRecordId,
        summary: sanitizeUntrustedText(a.summary, 160),
      }));
    }
    invokedTools.push('retrieveEvidenceMetadata');
    officialCaseFacts.supportingEvidence = state.evidence.slice(0, 15).map((ev) => ({
      id: ev.id,
      linkedRecordId: ev.linkedRecordId,
      title: sanitizeUntrustedText(ev.title, 100),
      status: ev.status,
      summary: sanitizeUntrustedText(ev.summary, 160),
    }));
  }

  // Default fallback anchor if query was broad
  if (invokedTools.length === 0) {
    invokedTools.push('queryIncomeStatements', 'retrieveInvestigations');
    const q3 = INCOME_STATEMENTS.find((s) => s.quarterId === state.selectedQuarterId) ?? INCOME_STATEMENTS[7];
    officialCaseFacts.activePeriodSummary = {
      quarterId: q3.quarterId,
      salesFormatted: formatReportingMoney(q3.salesCad, currency),
      operatingEarningsFormatted: formatReportingMoney(q3.operatingEarningsCad, currency),
      oeShareOfSalesPct: q3.oeShareOfSalesPct,
    };
  }

  return {
    userRole: user.roleId,
    userTitle: user.title,
    activeQuarter: state.selectedQuarterId,
    activeRegion: state.selectedRegionId,
    reportingCurrency: currency,
    fxNote,
    invokedTools: Array.from(new Set(invokedTools)),
    permissionRestrictions,
    unavailableDataRequested,
    officialCaseFacts,
    authorizedUploadsFacts,
    quarantinedReviewContext,
    hypotheticalScenarioFacts,
    allowedCitations,
    deterministicChartCandidate,
  };
}

/**
 * Clearly-labelled non-AI deterministic fallback query builder used only when Gemini API
 * is unavailable or explicitly toggled off. Never pretends to be LLM output.
 */
export function runDeterministicFallbackQuery(
  question: string,
  state: PersistedWorkspaceState,
  user: User
): AskSkyjackResponse {
  const currency: CurrencyCode = state.currency ?? 'CAD';
  const packet = buildGroundedContextPacket(question, state, user);
  const kpiHighlights: AskSkyjackKpiItem[] = [];
  const tableColumns: string[] = [];
  const tableRows: string[][] = [];
  const nextActions: AskSkyjackResponse['suggestedNextActions'] = [];
  const narrativeParts: string[] = [];

  if (packet.permissionRestrictions.length > 0) {
    narrativeParts.push(`Access Scope Notice: ${packet.permissionRestrictions.join(' ')}`);
  }

  if (packet.unavailableDataRequested.length > 0) {
    narrativeParts.push(
      `Data Not Available: ${packet.unavailableDataRequested.join(' ')} Available Appendix financial statements span Q4 2024 through Q3 2026.`
    );
  }

  const stmts = (packet.officialCaseFacts.incomeStatements as Array<{
    quarterId: string;
    salesCad: number;
    salesFormatted: string;
    operatingEarningsCad: number;
    operatingEarningsFormatted: string;
    oeShareOfSalesPct: number;
  }>) ?? [];

  const comp = packet.officialCaseFacts.periodComparison as
    | {
        fromQuarter: string;
        toQuarter: string;
        operatingEarningsChangeFormatted: string;
      }
    | undefined;

  if (stmts.length > 0 && packet.unavailableDataRequested.length === 0) {
    const primary = (comp ? stmts.find((s) => s.quarterId === comp.toQuarter) : undefined) ?? stmts[stmts.length - 1];
    kpiHighlights.push({
      label: `${primary.quarterId} Operating Earnings`,
      valueFormatted: primary.operatingEarningsFormatted,
      contextNote: `${primary.oeShareOfSalesPct}% of Sales (${primary.salesFormatted})`,
      provenance: 'Official Appendix 1.1',
    });
    narrativeParts.push(
      `${primary.quarterId} recorded ${primary.operatingEarningsFormatted} in operating earnings on ${primary.salesFormatted} in sales (${primary.oeShareOfSalesPct}% margin).`
    );
  }

  if (comp) {
    kpiHighlights.push({
      label: `OE Change (${comp.fromQuarter} → ${comp.toQuarter})`,
      valueFormatted: comp.operatingEarningsChangeFormatted,
      contextNote: 'Verified Appendix 1.1/1.2 comparison',
      provenance: 'Official Case Data',
    });
    narrativeParts.push(
      `Operating earnings changed by ${comp.operatingEarningsChangeFormatted} from ${comp.fromQuarter} to ${comp.toQuarter}.`
    );
  }

  const qoqComp = packet.officialCaseFacts.priorQuarterComparison as
    | {
        fromQuarter: string;
        toQuarter: string;
        operatingEarningsChangeFormatted: string;
      }
    | undefined;
  if (qoqComp) {
    narrativeParts.push(
      `Quarter-over-quarter from ${qoqComp.fromQuarter} to ${qoqComp.toQuarter}, operating earnings moved ${qoqComp.operatingEarningsChangeFormatted}.`
    );
  }

  const customs = (packet.officialCaseFacts.customsEntries as Array<{
    id: string;
    originCountry: string;
    goods: string;
    totalDutyAndTariffCad: number;
    brokerVarianceCad: number;
  }>) ?? [];
  if (customs.length > 0) {
    const grossOver = Number(packet.officialCaseFacts.filteredBrokerGrossOverchargeCad ?? 0);
    kpiHighlights.push({
      label: `Matched Customs Entries (${customs.length})`,
      valueFormatted: formatReportingMoney(grossOver, currency),
      contextNote: 'Gross broker overcharge in matched scope',
      provenance: 'Appendix 3.2/3.3',
    });
    if (tableColumns.length === 0) {
      tableColumns.push('Entry', 'Origin', 'Goods', 'Duty & Tariff', 'Broker Var.');
      customs.slice(0, 8).forEach((e) => {
        tableRows.push([
          e.id,
          e.originCountry,
          e.goods,
          formatReportingMoney(e.totalDutyAndTariffCad, currency),
          formatReportingMoney(e.brokerVarianceCad, currency, { showSign: true }),
        ]);
      });
    }
    narrativeParts.push(
      `Found ${customs.length} scoped customs record(s) (${customs.map((e) => e.id).join(', ')})${grossOver > 0 ? ` with ${formatReportingMoney(grossOver, currency)} combined gross broker overcharge` : ''}.`
    );
    nextActions.push({ label: 'Open Shipments & Trade', route: '/trade' });
  }

  const irList = (packet.officialCaseFacts.irregularCosts as Array<{
    id: string;
    item: string;
    amountFormatted: string;
    department: string;
    journalEntryRef?: string;
    glAccount?: string;
    fiveWs?: { why?: string };
  }>) ?? [];
  if (irList.length > 0 && tableColumns.length === 0) {
    tableColumns.push('ID', 'Item', 'Department', 'Amount', 'Reference');
    irList.slice(0, 7).forEach((c) => {
      tableRows.push([
        c.id,
        c.item,
        c.department,
        c.amountFormatted,
        [c.journalEntryRef, c.glAccount].filter(Boolean).join(' / ') || 'Appendix 2.3',
      ]);
    });
    if (irList.length === 1) {
      const only = irList[0];
      const refs = [only.journalEntryRef, only.glAccount].filter(Boolean).join(', ');
      kpiHighlights.push({
        label: `${only.id} · ${only.item}`,
        valueFormatted: only.amountFormatted,
        contextNote: refs || `${only.department} · Appendix 2.3`,
        provenance: 'Official Appendix 2.1/2.3',
      });
      narrativeParts.push(
        `${only.id} (${only.item}, ${only.department}) totals ${only.amountFormatted}${refs ? ` [Refs: ${refs}]` : ''}. ${only.fiveWs?.why ?? ''}`
      );
    } else {
      narrativeParts.push(
        `Matched ${irList.length} scoped irregular cost record(s): ${irList.map((c) => `${c.id} (${c.amountFormatted})`).join(', ')}.`
      );
    }
    nextActions.push({ label: 'Open Investigations', route: '/investigations' });
  }

  const invSummaries = ((packet.officialCaseFacts.investigations as Array<{
    id: string;
    linkedRecordId: string;
    title: string;
    workflowStatus: string;
    exposureCad: number;
    notes: string;
  }>) ?? []).slice(0, 4).map((inv) => ({
    id: inv.linkedRecordId,
    title: inv.title,
    status: inv.workflowStatus,
    exposureFormatted: formatReportingMoney(inv.exposureCad, currency),
    note: inv.notes,
  }));

  const sens = packet.hypotheticalScenarioFacts.deterministicChinaRateSensitivity as
    | {
        targetRatePct: number;
        baselineRatePct: number;
        quarterlyChangeCad: number;
        illustrativeAnnualChangeCad: number;
      }
    | undefined;
  if (sens) {
    kpiHighlights.push({
      label: `China Tariff ${sens.baselineRatePct}% → ${sens.targetRatePct}%`,
      valueFormatted: `${formatReportingMoney(sens.quarterlyChangeCad, currency, { showSign: true })} / qtr`,
      contextNote: `${formatReportingMoney(sens.illustrativeAnnualChangeCad, currency, { showSign: true })} annualized (unchanged volume)`,
      provenance: 'Hypothetical Appendix 3.4',
    });
    narrativeParts.push(
      `Changing China additional tariff from ${sens.baselineRatePct}% to ${sens.targetRatePct}% across E-04/E-05/E-06 yields ${formatReportingMoney(sens.quarterlyChangeCad, currency, { showSign: true })} per quarter (${formatReportingMoney(sens.illustrativeAnnualChangeCad, currency, { showSign: true })} annualized) assuming constant volume.`
    );
    nextActions.push({ label: 'Open Tariff Simulator', route: '/simulator' });
  }

  const latestBatch = packet.quarantinedReviewContext.latestBatch as
    | {
        fileName: string;
        quarantinedCount: number;
        quarantinedRecords: { recordId: string; amountCad: number; reasons: string[] }[];
      }
    | null
    | undefined;
  if (latestBatch !== undefined) {
    if (!latestBatch) {
      narrativeParts.push('No import batches have been staged or committed in Data Gateway yet.');
    } else {
      narrativeParts.push(
        `Most recent batch "${latestBatch.fileName}" has ${latestBatch.quarantinedCount} quarantined record(s) (excluded from trusted totals).`
      );
      if (latestBatch.quarantinedRecords.length > 0 && tableColumns.length === 0) {
        tableColumns.push('Record ID', 'Amount', 'Primary Quarantine Reason');
        latestBatch.quarantinedRecords.slice(0, 8).forEach((r) => {
          tableRows.push([r.recordId, formatReportingMoney(r.amountCad, currency), r.reasons[0] ?? 'Rule review']);
        });
      }
    }
    nextActions.push({ label: 'Open Data Gateway', route: '/data-gateway' });
  }

  const uploadedLedgerCount = Number(packet.authorizedUploadsFacts.authorizedLedgerCount ?? 0);
  const uploadedLedgerTotalCad = Number(packet.authorizedUploadsFacts.authorizedLedgerTotalCad ?? 0);
  const uploadedLedgerRecs = (packet.authorizedUploadsFacts.authorizedLedgerRecords as Array<{
    transactionId: string;
    department: string;
    accountingPeriod: string;
    amountCad: number;
    description: string;
  }>) ?? [];
  if (uploadedLedgerCount > 0 && /upload|authorized|ledger|batch/i.test(question)) {
    narrativeParts.push(
      `Workspace contains ${uploadedLedgerCount} authorized uploaded ledger transaction(s) totaling ${formatReportingMoney(uploadedLedgerTotalCad, currency)} (separate from official baselines and quarantined items).`
    );
    if (tableColumns.length === 0) {
      tableColumns.push('Transaction ID', 'Department', 'Period', 'Amount');
      uploadedLedgerRecs.slice(0, 8).forEach((tx) => {
        tableRows.push([tx.transactionId, tx.department, tx.accountingPeriod, formatReportingMoney(tx.amountCad, currency)]);
      });
    }
  }

  const approvals = (packet.officialCaseFacts.approvalRequests as Array<{
    id: string;
    title: string;
    workflowStatus: string;
    resolutionStatus: string;
    amountCad: number;
  }>) ?? [];
  if (approvals.length > 0) {
    const openApps = approvals.filter((a) => a.resolutionStatus === 'Open');
    narrativeParts.push(
      `There are ${openApps.length} open approval request(s) out of ${approvals.length} total.`
    );
    if (tableColumns.length === 0 && openApps.length > 0) {
      tableColumns.push('Request', 'Status', 'Amount');
      openApps.forEach((a) => tableRows.push([a.title, a.workflowStatus, formatReportingMoney(a.amountCad, currency)]));
    }
    nextActions.push({ label: 'Open Approvals', route: '/approvals' });
  }

  if (narrativeParts.length === 0) {
    narrativeParts.push(
      'Retrieved verified repository records for your active workspace scope.'
    );
  }

  return {
    ok: true,
    modelName: 'Deterministic Query Fallback (Non-AI)',
    mode: 'deterministic_fallback',
    narrative: narrativeParts.join(' '),
    kpiHighlights,
    tableColumns,
    tableRows,
    suggestedChart: packet.deterministicChartCandidate,
    investigationSummaries: invSummaries,
    suggestedNextActions: nextActions,
    sourceCitations: packet.allowedCitations.slice(0, 8),
    followUpQuestions: [
      'Why was IR-01 flagged?',
      'Which Chinese shipments had broker overcharges?',
    ],
    dataAvailabilityNote: packet.unavailableDataRequested.join(' ') || undefined,
    groundingBoundaryNote:
      currency === 'USD'
        ? `Showing verified repository lookup in USD (1 CAD = ${DEMO_CAD_TO_USD_RATE.toFixed(2)} USD; AI service unavailable).`
        : 'Showing verified repository lookup (AI service unavailable).',
  };
}
