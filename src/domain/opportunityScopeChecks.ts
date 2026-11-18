import { pathToFileURL } from 'node:url';
import { DEMO_USERS } from '../data/caseSeed';
import { buildInitialDemoState } from '../repositories/costIntelligenceRepo';
import { ReportConfiguration } from '../types/domain';
import { buildFinancialDigitalThread } from './digitalThreadBuilder';
import { buildGroundedContextPacket } from './groundedQueryService';
import { buildCostOpportunities, computeOpportunityAnalytics } from './opportunityEngine';
import { buildReportRenderModel } from './reportEngine';

export interface OpportunityScopeCheck {
  label: string;
  passed: boolean;
  detail: string;
}

/**
 * Regression guard for role-scoped opportunity derivation.
 * Operational Contributors lack view_opportunities, so IR-01 and every other
 * opportunity amount must stay out of calculations, exports, and AI context.
 */
export function runOpportunityScopeChecks(): OpportunityScopeCheck[] {
  const state = buildInitialDemoState();
  const contributor = DEMO_USERS.find((user) => user.roleId === 'operational_contributor')!;
  const controller = DEMO_USERS.find((user) => user.roleId === 'controller')!;
  const trade = DEMO_USERS.find((user) => user.roleId === 'trade_coordinator')!;
  const checks: OpportunityScopeCheck[] = [];

  const contributorOpps = buildCostOpportunities(state, contributor);
  const contributorAnalytics = computeOpportunityAnalytics(contributorOpps);
  const contributorExposure =
    contributorAnalytics.potentialCashRecoveryCad +
    contributorAnalytics.brokerDiscrepancyGrossCad +
    contributorAnalytics.tradeAgreementPotentialCad +
    contributorAnalytics.accountingAdjustmentExposureCad +
    contributorAnalytics.avoidableOperatingCostCad +
    contributorAnalytics.hypotheticalScenarioAnnualCad;
  checks.push({
    label: 'Contributor opportunity register is empty',
    passed: contributorOpps.length === 0 && contributorExposure === 0,
    detail: `${contributorOpps.length} opportunities, exposure CAD ${contributorExposure}`,
  });

  const thread = buildFinancialDigitalThread('IR-01', state, contributor);
  const threadOppAmounts = thread.nodes
    .filter((node) => node.kind === 'opportunity')
    .map((node) => node.amountCad ?? 0);
  checks.push({
    label: 'Contributor digital thread omits IR-01 opportunity amount',
    passed: threadOppAmounts.length === 0,
    detail: threadOppAmounts.length ? threadOppAmounts.join(', ') : 'no opportunity nodes',
  });

  const packet = buildGroundedContextPacket(
    'What scrap or cash recovery opportunity can be realized from IR-01?',
    state,
    contributor
  );
  const packetFacts = packet.officialCaseFacts as {
    costOpportunities?: Array<{ sourceRecordId?: string; estimatedAmountCad?: number }>;
    opportunityAnalytics?: { avoidableOperatingCostCad?: number };
  };
  const packetOpps = packetFacts.costOpportunities ?? [];
  checks.push({
    label: 'Contributor AI context excludes opportunity amounts',
    passed:
      packetOpps.length === 0 &&
      packetFacts.opportunityAnalytics === undefined &&
      packet.permissionRestrictions.some((note) => /opportunity/i.test(note)),
    detail: `${packetOpps.length} opportunity facts; restrictions: ${packet.permissionRestrictions.join(' | ') || 'none'}`,
  });

  const exportConfig: ReportConfiguration = {
    id: 'rep-scope-check',
    title: 'Contributor opportunity export check',
    templateId: 'cost_optimization_report',
    reportingPeriod: 'Q3 2026',
    comparisonType: 'YoY',
    comparisonPeriod: 'Q3 2025',
    regionFilter: 'all',
    departmentFilter: 'all',
    datasetScope: 'official_case_data',
    includedSections: ['str_opportunity_pipeline', 'str_realized_opportunities'],
    ownerUserId: contributor.id,
    authorName: contributor.name,
    createdAtIso: '2026-11-18T00:00:00.000Z',
    modifiedAtIso: '2026-11-18T00:00:00.000Z',
    configMode: 'live_configuration',
    status: 'saved',
  };
  const exportModel = buildReportRenderModel(exportConfig, state, contributor);
  const exportedAmounts = exportModel.scopedData.opportunities.reduce(
    (sum, opp) => sum + opp.estimatedAmountCad,
    0
  );
  checks.push({
    label: 'Contributor report model exports no opportunity amounts',
    passed:
      exportModel.scopedData.opportunities.length === 0 &&
      exportedAmounts === 0 &&
      exportModel.config.includedSections.length === 0,
    detail: `${exportModel.scopedData.opportunities.length} rows, CAD ${exportedAmounts}, sections ${exportModel.config.includedSections.length}`,
  });

  const controllerOpps = buildCostOpportunities(state, controller);
  const controllerAnalytics = computeOpportunityAnalytics(controllerOpps);
  const controllerBroker = controllerOpps.find((opp) => opp.id === 'opp-customs-broker-gross');
  checks.push({
    label: 'Controller still sees IR-01 and reconciled broker totals',
    passed:
      controllerOpps.some((opp) => opp.sourceRecordId === 'IR-01' && opp.estimatedAmountCad === 900_000) &&
      controllerBroker?.estimatedAmountCad === 8_260 &&
      controllerBroker.description.includes('undercharge on E-11') &&
      !controllerBroker.description.includes('E-01/E-09/E-10') &&
      controllerAnalytics.tradeAgreementPotentialCad === 11_020 &&
      controllerAnalytics.potentialCashRecoveryCad + controllerAnalytics.brokerDiscrepancyGrossCad === 391_260 &&
      controllerAnalytics.totalVerifiedCad === 0 &&
      controllerAnalytics.totalRealizedCad === 0,
    detail: controllerBroker?.description ?? 'missing broker opportunity',
  });

  const tradeOpps = buildCostOpportunities(state, trade);
  const tradeAnalytics = computeOpportunityAnalytics(tradeOpps);
  checks.push({
    label: 'Trade Coordinator still excludes IR-01 and keeps trade opportunities',
    passed:
      !tradeOpps.some((opp) => opp.sourceRecordId === 'IR-01' || opp.id.includes('ir01')) &&
      tradeAnalytics.avoidableOperatingCostCad === 0 &&
      tradeOpps.some((opp) => opp.id === 'opp-customs-broker-gross') &&
      tradeOpps.some((opp) => opp.id === 'opp-e08-cusma') &&
      tradeAnalytics.brokerDiscrepancyGrossCad === 8_260 &&
      tradeAnalytics.tradeAgreementPotentialCad === 11_020,
    detail: tradeOpps.map((opp) => opp.id).join(', '),
  });

  return checks;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectRun) {
  const checks = runOpportunityScopeChecks();
  for (const check of checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.label} — ${check.detail}`);
  }
  if (checks.some((check) => !check.passed)) {
    process.exit(1);
  }
}
