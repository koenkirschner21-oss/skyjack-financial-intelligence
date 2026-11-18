import {
  CUSTOMS_ENTRIES,
  IRREGULAR_COSTS,
  OPERATING_EARNINGS_WALKS,
  PARTIAL_LEDGER_TRANSACTIONS,
} from '../data/caseSeed';
import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  CostOpportunity,
  CurrencyCode,
  DigitalThreadEdge,
  DigitalThreadNode,
  DigitalThreadTimelineEvent,
  FinancialDigitalThread,
  User,
} from '../types/domain';
import { formatReportingMoney } from './currencyService';
import { buildCostOpportunities } from './opportunityEngine';
import { calculateExpectedBrokerFeeCad, fromMinorCents, toMinorCents } from './rulesEngine';

/**
 * Builds a source-grounded Financial Digital Thread from actual repository records,
 * live demonstration evidence, approvals, opportunities, and audit events.
 * Explicitly exposes missing relationships rather than inventing nodes.
 */
export function buildFinancialDigitalThread(
  targetId: string,
  state: PersistedWorkspaceState,
  user: User,
  currency: CurrencyCode = 'CAD'
): FinancialDigitalThread {
  const nodes: DigitalThreadNode[] = [];
  const edges: DigitalThreadEdge[] = [];
  const timeline: DigitalThreadTimelineEvent[] = [];
  const missingLinks: string[] = [];

  const opportunities: CostOpportunity[] = buildCostOpportunities(state, user);

  const ir = IRREGULAR_COSTS.find((c) => c.id === targetId);
  const customs = CUSTOMS_ENTRIES.find((e) => e.id === targetId);
  const uploadedLedger = state.uploadedLedgerTransactions.find(
    (t) => t.transactionId === targetId || t.id === targetId
  );
  const uploadedCustoms = state.uploadedCustomsRecords.find(
    (c) => c.entryId === targetId || c.id === targetId
  );
  const quarantined = state.reviewQueueItems.find(
    (q) => q.stableRecordId === targetId || q.id === targetId
  );

  const stableId =
    ir?.id ??
    customs?.id ??
    uploadedLedger?.transactionId ??
    uploadedCustoms?.entryId ??
    quarantined?.stableRecordId ??
    targetId;

  const matchingInvestigation = state.investigations.find(
    (i) => i.linkedRecordId === stableId || i.id === targetId
  );
  const matchingEvidence = state.evidence.filter((ev) => ev.linkedRecordId === stableId);
  const matchingApprovals = state.approvalRequests.filter((a) => a.linkedRecordId === stableId);
  const matchingOpps = opportunities.filter(
    (o) => o.sourceRecordId === stableId || o.linkedRecordIds.includes(stableId)
  );
  const matchingAudit = state.auditEvents
    .filter((a) => a.targetRecordId === stableId || (matchingInvestigation && a.targetRecordId === matchingInvestigation.linkedRecordId))
    .slice(0, 8);

  const attachSharedGovernanceNodes = (rootNodeId: string) => {
    // Investigation node
    if (matchingInvestigation) {
      const invNodeId = `node-inv-${matchingInvestigation.id}`;
      nodes.push({
        id: invNodeId,
        kind: 'investigation',
        label: `Investigation · ${matchingInvestigation.workflowStatus}`,
        sublabel: `${matchingInvestigation.priority} Priority · ${matchingInvestigation.ruleCodes?.join(', ') ?? 'Flagged'}`,
        amountCad: matchingInvestigation.exposureCad,
        linkNature: 'demonstration_workflow',
        provenanceLabel: 'Demo Workflow',
        clickableRecordId: matchingInvestigation.linkedRecordId,
        clickableRoute: '/investigations',
        lane: 3,
      });
      edges.push({
        id: `edge-${rootNodeId}-${invNodeId}`,
        fromNodeId: rootNodeId,
        toNodeId: invNodeId,
        relationshipLabel: 'Tracked in Investigation',
        linkNature: 'demonstration_workflow',
      });
    }

    // Supporting Evidence nodes
    const nonMissingEvidence = matchingEvidence.filter((e) => e.status !== 'missing_in_case');
    const missingEvidence = matchingEvidence.filter((e) => e.status === 'missing_in_case');

    nonMissingEvidence.forEach((ev, idx) => {
      const evNodeId = `node-ev-${ev.id}`;
      nodes.push({
        id: evNodeId,
        kind: 'supporting_evidence',
        label: ev.title,
        sublabel: `${ev.sourceType ?? ev.evidenceType} · ${ev.status.replace(/_/g, ' ')}`,
        linkNature: ev.provenance === 'official_case_data' ? 'direct_source' : 'demonstration_workflow',
        provenanceLabel: ev.provenance === 'official_case_data' ? 'Case Reference' : 'Demo Evidence',
        lane: 3,
      });
      edges.push({
        id: `edge-${rootNodeId}-${evNodeId}-${idx}`,
        fromNodeId: rootNodeId,
        toNodeId: evNodeId,
        relationshipLabel: 'Supporting Evidence',
        linkNature: ev.provenance === 'official_case_data' ? 'direct_source' : 'demonstration_workflow',
      });
      timeline.push({
        id: `tl-ev-${ev.id}`,
        timestampLabel: ev.createdAtIso.slice(0, 10),
        title: `Evidence Logged: ${ev.title}`,
        detail: ev.summary,
        linkNature: 'demonstration_workflow',
        actorOrSource: ev.persistenceScope ?? 'repository',
      });
    });

    if (missingEvidence.length > 0) {
      missingEvidence.forEach((ev) => {
        const gapId = `node-gap-${ev.id}`;
        nodes.push({
          id: gapId,
          kind: 'missing_gap',
          label: `Missing: ${ev.title}`,
          sublabel: ev.summary,
          linkNature: 'missing_information',
          provenanceLabel: 'Missing / Unverified',
          lane: 3,
        });
        edges.push({
          id: `edge-gap-${rootNodeId}-${gapId}`,
          fromNodeId: rootNodeId,
          toNodeId: gapId,
          relationshipLabel: 'Missing Documentation',
          linkNature: 'missing_information',
        });
        missingLinks.push(`${ev.title}: ${ev.summary}`);
      });
    }

    // Approval Requests
    matchingApprovals.forEach((apr) => {
      const aprNodeId = `node-apr-${apr.id}`;
      const signed = apr.approvalsHistory.filter((s) => s.decision === 'Approved').length;
      nodes.push({
        id: aprNodeId,
        kind: 'approval_request',
        label: `Approval: ${apr.workflowStatus} (${signed}/${apr.requiredApprovalsCount})`,
        sublabel: apr.title,
        amountCad: apr.amountCad,
        linkNature: 'demonstration_workflow',
        provenanceLabel: 'Governance Queue',
        clickableRoute: '/approvals',
        lane: 4,
      });
      edges.push({
        id: `edge-${rootNodeId}-${aprNodeId}`,
        fromNodeId: matchingInvestigation ? `node-inv-${matchingInvestigation.id}` : rootNodeId,
        toNodeId: aprNodeId,
        relationshipLabel: 'Governance Routing',
        linkNature: 'demonstration_workflow',
      });
      timeline.push({
        id: `tl-apr-${apr.id}`,
        timestampLabel: (apr.updatedAtIso ?? apr.createdAtIso).slice(0, 10),
        title: `Approval Request (${apr.workflowStatus})`,
        detail: `${apr.title} — ${signed}/${apr.requiredApprovalsCount} sign-off(s)`,
        linkNature: 'demonstration_workflow',
        actorOrSource: apr.requestType,
      });
    });

    // Opportunities
    matchingOpps.forEach((opp) => {
      const oppNodeId = `node-opp-${opp.id}`;
      nodes.push({
        id: oppNodeId,
        kind: 'opportunity',
        label: opp.title,
        sublabel: `${opp.financialImpactType} · ${opp.status}`,
        amountCad: opp.estimatedAmountCad,
        linkNature:
          opp.category === 'trade_agreement_savings' || opp.category === 'hypothetical_tariff_scenario'
            ? 'potential_unverified'
            : 'contextual',
        provenanceLabel: 'Opportunity Centre',
        clickableRoute: '/opportunities',
        lane: 4,
      });
      edges.push({
        id: `edge-${rootNodeId}-${oppNodeId}`,
        fromNodeId: matchingInvestigation ? `node-inv-${matchingInvestigation.id}` : rootNodeId,
        toNodeId: oppNodeId,
        relationshipLabel: 'Evaluated Opportunity',
        linkNature: 'potential_unverified',
      });
    });

    // Audit Events
    matchingAudit.slice(0, 3).forEach((aud, idx) => {
      const audNodeId = `node-aud-${aud.id}`;
      nodes.push({
        id: audNodeId,
        kind: 'audit_event',
        label: aud.actionType.replace(/_/g, ' '),
        sublabel: aud.summary,
        linkNature: 'demonstration_workflow',
        provenanceLabel: 'Audit Log',
        clickableRoute: '/audit',
        lane: 4,
      });
      edges.push({
        id: `edge-aud-${rootNodeId}-${idx}`,
        fromNodeId: matchingInvestigation ? `node-inv-${matchingInvestigation.id}` : rootNodeId,
        toNodeId: audNodeId,
        relationshipLabel: 'Audit Trace',
        linkNature: 'demonstration_workflow',
      });
      timeline.push({
        id: `tl-aud-${aud.id}`,
        timestampLabel: aud.timestampIso.slice(0, 16).replace('T', ' '),
        title: `Audit: ${aud.actionType.replace(/_/g, ' ')}`,
        detail: aud.summary,
        linkNature: 'demonstration_workflow',
        actorOrSource: aud.actorName,
      });
    });
  };

  // CASE A: Official Irregular Cost (IR-01 .. IR-07)
  if (ir) {
    const rootNodeId = `node-ir-${ir.id}`;
    nodes.push({
      id: rootNodeId,
      kind: 'irregular_cost',
      label: `${ir.id} · ${ir.item}`,
      sublabel: `${ir.department} · ${ir.regionName} · ${ir.fiveWs.when}`,
      amountCad: ir.amountCad,
      linkNature: 'direct_source',
      provenanceLabel: ir.sourceRef,
      clickableRecordId: ir.id,
      lane: 1,
    });

    // Partial ledger transaction if available (e.g., IR-01 JE-260931 / GL 6410)
    const ledger = PARTIAL_LEDGER_TRANSACTIONS.find((t) => t.linkedIrregularCostId === ir.id);
    if (ledger) {
      const ledNodeId = `node-led-${ledger.id}`;
      nodes.push({
        id: ledNodeId,
        kind: 'ledger_transaction',
        label: `${ledger.journalOrPostingRef} · ${ledger.glAccount}`,
        sublabel: `${ledger.postingDateLabel} · Preparer: ${ledger.preparerLabel}`,
        amountCad: ledger.amountCad,
        linkNature: 'direct_source',
        provenanceLabel: ledger.sourceRef,
        clickableRecordId: ir.id,
        lane: 2,
      });
      edges.push({
        id: `edge-${rootNodeId}-${ledNodeId}`,
        fromNodeId: rootNodeId,
        toNodeId: ledNodeId,
        relationshipLabel: 'Posted via Journal Entry',
        linkNature: 'direct_source',
      });
      timeline.push({
        id: `tl-led-${ledger.id}`,
        timestampLabel: ledger.postingDateLabel,
        title: `Journal Posting ${ledger.journalOrPostingRef} (${ledger.glAccount})`,
        detail: `${ledger.description} · ${formatReportingMoney(ledger.amountCad, currency)}`,
        linkNature: 'direct_source',
        actorOrSource: ledger.preparerLabel,
        clickableRecordId: ir.id,
      });
    } else if (ir.journalEntryRef || ir.glAccount || ir.vendorOrBatchRef) {
      const refNodeId = `node-ref-${ir.id}`;
      nodes.push({
        id: refNodeId,
        kind: 'ledger_transaction',
        label: [ir.journalEntryRef, ir.glAccount, ir.vendorOrBatchRef].filter(Boolean).join(' · '),
        sublabel: ir.fiveWs.how,
        amountCad: ir.amountCad,
        linkNature: 'direct_source',
        provenanceLabel: ir.sourceRef,
        clickableRecordId: ir.id,
        lane: 2,
      });
      edges.push({
        id: `edge-${rootNodeId}-${refNodeId}`,
        fromNodeId: rootNodeId,
        toNodeId: refNodeId,
        relationshipLabel: 'Accounting / Vendor Anchor',
        linkNature: 'direct_source',
      });
    } else {
      const gapLedId = `node-gap-led-${ir.id}`;
      nodes.push({
        id: gapLedId,
        kind: 'missing_gap',
        label: 'Individual Journal / GL Entry Not Supplied',
        sublabel: 'Appendix 2.3 describes event context without an individual transaction extract.',
        linkNature: 'missing_information',
        provenanceLabel: 'Appendix Boundary',
        lane: 2,
      });
      edges.push({
        id: `edge-${rootNodeId}-${gapLedId}`,
        fromNodeId: rootNodeId,
        toNodeId: gapLedId,
        relationshipLabel: 'Missing GL Detail',
        linkNature: 'missing_information',
      });
      missingLinks.push(`Individual ERP journal extract not supplied in Appendix for ${ir.id}.`);
    }

    // Walk / Financial Category link
    const walkLinks = OPERATING_EARNINGS_WALKS.flatMap((w) =>
      w.entries
        .filter((e) => e.linkedIrregularCostId === ir.id)
        .map((e) => ({ walkTitle: w.title, entry: e }))
    );
    if (walkLinks.length > 0) {
      walkLinks.forEach(({ walkTitle, entry }) => {
        const catId = `node-walk-${entry.id}`;
        const isDirect = entry.linkClassification === 'direct_appendix_link';
        nodes.push({
          id: catId,
          kind: 'financial_category',
          label: `${ir.walkBucket} (${walkTitle.includes('YoY') ? 'YoY' : 'QoQ'} Walk)`,
          sublabel: entry.stepLabel,
          amountCad: entry.amountCad,
          linkNature: isDirect ? 'direct_source' : 'contextual',
          provenanceLabel: entry.sourceRef,
          clickableRoute: '/financials',
          lane: 2,
        });
        edges.push({
          id: `edge-${rootNodeId}-${catId}`,
          fromNodeId: rootNodeId,
          toNodeId: catId,
          relationshipLabel: isDirect ? 'Direct Earnings Bridge Link' : 'Contextual Category Link',
          linkNature: isDirect ? 'direct_source' : 'contextual',
        });
      });
    } else {
      const catId = `node-cat-${ir.id}`;
      nodes.push({
        id: catId,
        kind: 'financial_category',
        label: `Financial Bucket: ${ir.walkBucket}`,
        sublabel: `${ir.timing} item · Not independently broken out in Q3 earnings bridge`,
        amountCad: ir.effectOnOeCad,
        linkNature: 'contextual',
        provenanceLabel: ir.sourceRef,
        clickableRoute: '/financials',
        lane: 2,
      });
      edges.push({
        id: `edge-${rootNodeId}-${catId}`,
        fromNodeId: rootNodeId,
        toNodeId: catId,
        relationshipLabel: 'Reported Financial Category',
        linkNature: 'contextual',
      });
    }

    // Flagship missing inspection / approval gaps when no user-added replacement exists
    if (ir.id === 'IR-01' && !matchingEvidence.some((e) => e.provenance !== 'official_case_data' && e.status !== 'missing_in_case')) {
      missingLinks.push('Failed weld inspection report and signed Plant 2 approval record are not included in the Appendix.');
    }
    if (ir.approvalStatus === 'explicitly_missing' && matchingApprovals.length === 0) {
      const gapAprId = `node-gap-apr-${ir.id}`;
      nodes.push({
        id: gapAprId,
        kind: 'missing_gap',
        label: 'Approval Reference Explicitly Missing',
        sublabel: ir.approvalNote,
        linkNature: 'missing_information',
        provenanceLabel: 'Rule 02 Flag',
        lane: 3,
      });
      edges.push({
        id: `edge-${rootNodeId}-${gapAprId}`,
        fromNodeId: rootNodeId,
        toNodeId: gapAprId,
        relationshipLabel: 'Unapproved Exception',
        linkNature: 'missing_information',
      });
      missingLinks.push(`Approval reference explicitly missing in case data for ${ir.id}.`);
    }

    timeline.push({
      id: `tl-ir-event-${ir.id}`,
      timestampLabel: ir.fiveWs.when,
      title: `${ir.id} Recorded Event: ${ir.item}`,
      detail: `${ir.fiveWs.what} (${formatReportingMoney(ir.amountCad, currency)}) — ${ir.fiveWs.why}`,
      linkNature: 'direct_source',
      actorOrSource: `${ir.department} (${ir.sourceRef})`,
      clickableRecordId: ir.id,
    });

    timeline.push({
      id: `tl-ir-cat-${ir.id}`,
      timestampLabel: 'Q3 2026 Close',
      title: `Reflected in ${ir.walkBucket} (${formatReportingMoney(ir.effectOnOeCad, currency)} OE Impact)`,
      detail: ir.fiveWs.how,
      linkNature: walkLinks.some((w) => w.entry.linkClassification === 'direct_appendix_link')
        ? 'direct_source'
        : 'contextual',
      actorOrSource: ir.sourceRef,
      clickableRecordId: ir.id,
    });

    if (matchingInvestigation) {
      timeline.push({
        id: `tl-ir-inv-${ir.id}`,
        timestampLabel: 'Rule Screen',
        title: `Flagged for Investigation (${matchingInvestigation.ruleCodes?.join(', ') || 'Rule Screen'})`,
        detail: `${matchingInvestigation.priority} Priority · Status: ${matchingInvestigation.workflowStatus}`,
        linkNature: 'demonstration_workflow',
        actorOrSource: 'SKYJACK Rules Engine',
        clickableRecordId: ir.id,
      });
    }

    attachSharedGovernanceNodes(rootNodeId);

    return {
      rootId: ir.id,
      rootTitle: `${ir.id} · ${ir.item}`,
      rootSummary: `${ir.fiveWs.what} (${formatReportingMoney(ir.amountCad, currency)} in ${ir.walkBucket})`,
      nodes,
      edges,
      timeline,
      missingLinks: Array.from(new Set(missingLinks)),
    };
  }

  // CASE B: Official Customs Entry (E-01 .. E-12)
  if (customs) {
    const rootNodeId = `node-cust-${customs.id}`;
    const expectedFee = calculateExpectedBrokerFeeCad(customs.goodsValueCad, 0.2);
    const brokerVariance = fromMinorCents(
      toMinorCents(customs.brokerFeeChargedCad) - toMinorCents(expectedFee)
    );

    nodes.push({
      id: rootNodeId,
      kind: 'customs_entry',
      label: `${customs.id} · ${customs.goods} (${customs.originCountry})`,
      sublabel: `${customs.route} · Value ${formatReportingMoney(customs.goodsValueCad, currency)} · HS ${customs.hsCode}`,
      amountCad: customs.goodsValueCad,
      linkNature: 'direct_source',
      provenanceLabel: customs.sourceRef,
      clickableRecordId: customs.id,
      lane: 1,
    });

    // Duty & Tariff breakdown node
    const dutyNodeId = `node-duty-${customs.id}`;
    nodes.push({
      id: dutyNodeId,
      kind: 'financial_category',
      label: `Duty & Tariff: ${formatReportingMoney(customs.totalDutyAndTariffCad, currency)}`,
      sublabel: `MFN ${customs.mfnRatePct}% (${formatReportingMoney(customs.mfnDutyCad, currency)}) + Extra ${customs.additionalTariffPct}% (${formatReportingMoney(customs.additionalTariffCad, currency)})`,
      amountCad: customs.totalDutyAndTariffCad,
      linkNature: 'direct_source',
      provenanceLabel: 'Appendix 3.2',
      clickableRoute: '/trade',
      lane: 2,
    });
    edges.push({
      id: `edge-${rootNodeId}-${dutyNodeId}`,
      fromNodeId: rootNodeId,
      toNodeId: dutyNodeId,
      relationshipLabel: 'Assessed Border Duties',
      linkNature: 'direct_source',
    });

    // Broker Invoice Audit node
    const brokerNodeId = `node-broker-${customs.id}`;
    nodes.push({
      id: brokerNodeId,
      kind: 'broker_invoice',
      label: `Broker Fee: ${formatReportingMoney(customs.brokerFeeChargedCad, currency)} vs ${formatReportingMoney(expectedFee, currency)}`,
      sublabel:
        brokerVariance > 0
          ? `Overcharged by ${formatReportingMoney(brokerVariance, currency)} (Rule 04 · 0.2% contract)`
          : brokerVariance < 0
            ? `Undercharged by ${formatReportingMoney(Math.abs(brokerVariance), currency)}`
            : 'Aligned with 0.2% contract',
      amountCad: brokerVariance,
      linkNature: 'direct_source',
      provenanceLabel: 'Appendix 3.2 / 3.3',
      clickableRoute: '/trade',
      lane: 2,
    });
    edges.push({
      id: `edge-${rootNodeId}-${brokerNodeId}`,
      fromNodeId: rootNodeId,
      toNodeId: brokerNodeId,
      relationshipLabel: 'Broker Contract Check',
      linkNature: 'direct_source',
    });

    // Tariff Simulator connection for China tariff entries
    if (customs.additionalTariffCad > 0) {
      const simNodeId = `node-sim-${customs.id}`;
      nodes.push({
        id: simNodeId,
        kind: 'tariff_simulator',
        label: 'Tariff Simulator Baseline (25% China Surtax)',
        sublabel: `${state.savedScenarios.length} saved scenario(s) modeling rate sensitivity`,
        amountCad: customs.additionalTariffCad,
        linkNature: 'contextual',
        provenanceLabel: 'Appendix 3.4',
        clickableRoute: '/simulator',
        lane: 4,
      });
      edges.push({
        id: `edge-${dutyNodeId}-${simNodeId}`,
        fromNodeId: dutyNodeId,
        toNodeId: simNodeId,
        relationshipLabel: 'Tariff Sensitivity Model',
        linkNature: 'contextual',
      });
    }

    // Trade Agreement / Missing Certificate of Origin for E-08
    if (customs.tradeAgreementStatus === 'CUSMA_not_claimed') {
      const ftaGapId = `node-gap-fta-${customs.id}`;
      nodes.push({
        id: ftaGapId,
        kind: 'missing_gap',
        label: 'Unverified CUSMA Origin Certificate',
        sublabel: `${formatReportingMoney(customs.totalDutyAndTariffCad, currency)} duty paid; eligibility unconfirmed without formal Certificate of Origin.`,
        amountCad: customs.totalDutyAndTariffCad,
        linkNature: 'potential_unverified',
        provenanceLabel: 'Rule 06 Review',
        lane: 3,
      });
      edges.push({
        id: `edge-${rootNodeId}-${ftaGapId}`,
        fromNodeId: rootNodeId,
        toNodeId: ftaGapId,
        relationshipLabel: 'Requires Origin Verification',
        linkNature: 'potential_unverified',
      });
      missingLinks.push(`Formal supplier Certificate of Origin missing for ${customs.id} (${customs.originCountry} ${customs.goods}).`);
    }

    timeline.push({
      id: `tl-cust-${customs.id}`,
      timestampLabel: customs.quarterId,
      title: `${customs.id} Customs Clearance (${customs.route})`,
      detail: `${customs.goods} declared at ${formatReportingMoney(customs.goodsValueCad, currency)}; duty ${formatReportingMoney(customs.totalDutyAndTariffCad, currency)}; broker fee ${formatReportingMoney(customs.brokerFeeChargedCad, currency)}.`,
      linkNature: 'direct_source',
      actorOrSource: customs.sourceRef,
      clickableRecordId: customs.id,
    });

    timeline.push({
      id: `tl-cust-brk-${customs.id}`,
      timestampLabel: 'Rule 04/05 Screen',
      title:
        brokerVariance > 0
          ? `Broker Overcharge Detected (+${formatReportingMoney(brokerVariance, currency)})`
          : `Broker Fee Verified (${formatReportingMoney(expectedFee, currency)} contract)`,
      detail: `Charged ${formatReportingMoney(customs.brokerFeeChargedCad, currency)} vs contractual 0.2% (${formatReportingMoney(expectedFee, currency)}).`,
      linkNature: 'direct_source',
      actorOrSource: 'SKYJACK Trade Rules',
      clickableRecordId: customs.id,
    });

    if (matchingInvestigation) {
      timeline.push({
        id: `tl-cust-inv-${customs.id}`,
        timestampLabel: 'Investigation',
        title: `Investigation Active (${matchingInvestigation.workflowStatus})`,
        detail: `${matchingInvestigation.priority} Priority · ${matchingInvestigation.ruleCodes?.join(', ') || 'Trade Exception'}`,
        linkNature: 'demonstration_workflow',
        actorOrSource: 'Investigations',
        clickableRecordId: customs.id,
      });
    }

    attachSharedGovernanceNodes(rootNodeId);

    return {
      rootId: customs.id,
      rootTitle: `${customs.id} · ${customs.goods} (${customs.originCountry} → ${customs.destination})`,
      rootSummary: `Goods value ${formatReportingMoney(customs.goodsValueCad, currency)} · Duty ${formatReportingMoney(customs.totalDutyAndTariffCad, currency)} · Broker fee ${formatReportingMoney(customs.brokerFeeChargedCad, currency)}`,
      nodes,
      edges,
      timeline,
      missingLinks: Array.from(new Set(missingLinks)),
    };
  }

  // CASE C: Uploaded / Quarantined record
  if (uploadedLedger || uploadedCustoms || quarantined) {
    const idLabel =
      uploadedLedger?.transactionId ??
      uploadedCustoms?.entryId ??
      quarantined?.stableRecordId ??
      targetId;
    const rootNodeId = `node-up-${idLabel}`;
    const amountCad =
      uploadedLedger?.amountCad ??
      (uploadedCustoms ? uploadedCustoms.actualDutyCad + uploadedCustoms.actualBrokerFeeCad : undefined) ??
      quarantined?.amountCad ??
      0;

    nodes.push({
      id: rootNodeId,
      kind: quarantined
        ? 'quarantined_record'
        : uploadedLedger
          ? 'uploaded_ledger'
          : 'uploaded_customs',
      label: `${idLabel} (${quarantined ? 'Quarantined' : 'Authorized Upload'})`,
      sublabel:
        uploadedLedger?.description ??
        uploadedCustoms?.goodsDescription ??
        quarantined?.reasons[0] ??
        'Uploaded record',
      amountCad,
      linkNature: quarantined ? 'potential_unverified' : 'direct_source',
      provenanceLabel: quarantined ? 'Data Gateway Quarantine' : 'Authorized Upload',
      clickableRecordId: idLabel,
      clickableRoute: quarantined ? '/data-gateway' : uploadedLedger ? '/financials' : '/trade',
      lane: 1,
    });

    const batchId = uploadedLedger?.batchId ?? uploadedCustoms?.batchId ?? quarantined?.batchId;
    const batch = state.importBatches.find((b) => b.id === batchId);
    if (batch) {
      const batchNodeId = `node-batch-${batch.id}`;
      nodes.push({
        id: batchNodeId,
        kind: 'supporting_evidence',
        label: `Import Batch: ${batch.fileName}`,
        sublabel: `${batch.validatedCount} validated · ${batch.quarantinedCount} quarantined · ${batch.status}`,
        linkNature: 'demonstration_workflow',
        provenanceLabel: 'Data Gateway',
        clickableRoute: '/data-gateway',
        lane: 2,
      });
      edges.push({
        id: `edge-${rootNodeId}-${batchNodeId}`,
        fromNodeId: rootNodeId,
        toNodeId: batchNodeId,
        relationshipLabel: 'Ingested via Batch',
        linkNature: 'demonstration_workflow',
      });
      timeline.push({
        id: `tl-batch-${batch.id}`,
        timestampLabel: batch.createdAtIso.slice(0, 16).replace('T', ' '),
        title: `Staged in Data Gateway (${batch.fileName})`,
        detail: `${batch.classificationReason}`,
        linkNature: 'demonstration_workflow',
        actorOrSource: 'Data Gateway Pipeline',
      });
    }

    attachSharedGovernanceNodes(rootNodeId);

    return {
      rootId: idLabel,
      rootTitle: `${idLabel} · ${quarantined ? 'Quarantined Upload Record' : 'Authorized Uploaded Record'}`,
      rootSummary: `Amount ${formatReportingMoney(amountCad, currency)} · Provenance: ${quarantined ? 'Quarantined (excluded from trusted totals)' : 'User Uploaded (Authorized)'}`,
      nodes,
      edges,
      timeline,
      missingLinks: Array.from(new Set(missingLinks)),
    };
  }

  return {
    rootId: targetId,
    rootTitle: `Record ${targetId}`,
    rootSummary: 'No matching source record found in current repository.',
    nodes: [],
    edges: [],
    timeline: [],
    missingLinks: [`No linked entity found for identifier "${targetId}".`],
  };
}
