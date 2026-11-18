import { pathToFileURL } from 'node:url';
import { DEMO_USERS, INCOME_STATEMENTS, IRREGULAR_COSTS } from '../data/caseSeed';
import { buildInitialDemoState } from '../repositories/costIntelligenceRepo';
import { actionNeededBy, evaluateGovernanceAction } from './governanceWorkflow';
import type { ApprovalRequest, User } from '../types/domain';

export interface GovernanceCheck {
  label: string;
  passed: boolean;
  detail: string;
}

const NOW = '2026-11-18T16:00:00.000Z';

function user(roleId: User['roleId']): User {
  return DEMO_USERS.find((item) => item.roleId === roleId)!;
}

function baseRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  const seed = buildInitialDemoState().approvalRequests[0];
  return {
    ...seed,
    approvalsHistory: seed.approvalsHistory.map((step) => ({ ...step })),
    ...overrides,
  };
}

export function runGovernanceWorkflowChecks(): GovernanceCheck[] {
  const helen = user('controller');
  const dana = user('cost_accountant');
  const marco = user('trade_coordinator');
  const alex = user('operational_contributor');
  const checks: GovernanceCheck[] = [];
  const record = (label: string, passed: boolean, detail: string) => checks.push({ label, passed, detail });

  const created = baseRequest({
    id: 'apr-test-new',
    title: 'Test-only reclassification proposal',
    requestedByUserId: alex.id,
    workflowStatus: 'Submitted',
    resolutionStatus: 'Open',
    provenance: 'demonstration_state',
  });
  record('new request stays open for the controller', created.workflowStatus === 'Submitted' && created.amountCad === 600_000, created.id);

  const needsHelen = actionNeededBy(helen, created, 'Logistics');
  const needsDana = actionNeededBy(dana, created, 'Logistics');
  const needsMarco = actionNeededBy(marco, created, 'Logistics');
  const needsAlex = actionNeededBy(alex, created, 'Logistics');
  record('Needs My Action includes Helen, Dana, and Marco', needsHelen && needsDana && needsMarco && !needsAlex, `${needsHelen}/${needsDana}/${needsMarco}/${needsAlex}`);

  record('Open Resolutions includes the submitted request', created.resolutionStatus === 'Open', created.resolutionStatus);

  const danaReview = evaluateGovernanceAction({
    request: created,
    actor: dana,
    kind: 'recommend_approve',
    reason: 'Accounting classification should move from SG&A to freight out.',
    evidenceCount: 0,
    department: 'Logistics',
    nowIso: NOW,
  });
  record(
    'Dana can recommend without authorizing',
    danaReview.ok && danaReview.request.workflowStatus === 'In Review' && danaReview.request.status !== 'demo_approved',
    danaReview.ok ? danaReview.request.workflowStatus : danaReview.message
  );

  const marcoReview = evaluateGovernanceAction({
    request: created,
    actor: marco,
    kind: 'recommend_approve',
    reason: 'Carrier invoices support the freight coding.',
    evidenceCount: 0,
    department: 'Logistics',
    nowIso: NOW,
  });
  record('Marco can recommend on the logistics record', marcoReview.ok && marcoReview.request.workflowStatus !== 'Approved', marcoReview.ok ? marcoReview.message : marcoReview.message);

  const alexDecision = evaluateGovernanceAction({
    request: { ...created, requestedByUserId: dana.id },
    actor: alex,
    kind: 'reject',
    reason: 'Trying to reject another person’s request.',
    evidenceCount: 1,
    department: 'Logistics',
    nowIso: NOW,
  });
  record('Alex cannot grant final approval or rejection', !alexDecision.ok, alexDecision.ok ? 'unexpected success' : alexDecision.message);

  const blocked = evaluateGovernanceAction({
    request: created,
    actor: helen,
    kind: 'finalize',
    reason: 'Authorize reclassification.',
    evidenceCount: 0,
    department: 'Logistics',
    nowIso: NOW,
  });
  record('Helen cannot bypass missing evidence', !blocked.ok, blocked.ok ? 'unexpected approval' : blocked.message);

  const approved = evaluateGovernanceAction({
    request: created,
    actor: helen,
    kind: 'finalize',
    reason: 'Authorize the proposed reclassification step.',
    evidenceCount: 1,
    department: 'Logistics',
    nowIso: NOW,
  });
  record(
    'Helen can finalize without a prior specialist signature',
    approved.ok && approved.request.workflowStatus === 'Approved' && approved.request.approverUserId === helen.id,
    approved.ok ? approved.request.workflowStatus : approved.message
  );

  const rejected = evaluateGovernanceAction({
    request: created,
    actor: helen,
    kind: 'reject',
    reason: 'The proposed coding change is not supported.',
    evidenceCount: 0,
    department: 'Logistics',
    nowIso: NOW,
  });
  record(
    'Reject with a reason closes the request',
    rejected.ok && rejected.request.workflowStatus === 'Rejected' && rejected.request.resolutionStatus === 'Resolved',
    rejected.ok ? rejected.request.decisionReason ?? '' : rejected.message
  );

  const emptyReject = evaluateGovernanceAction({
    request: created,
    actor: helen,
    kind: 'reject',
    reason: '   ',
    evidenceCount: 1,
    department: 'Logistics',
    nowIso: NOW,
  });
  record('Reject without a reason is refused', !emptyReject.ok, emptyReject.ok ? 'unexpected reject' : emptyReject.message);

  const changes = evaluateGovernanceAction({
    request: created,
    actor: dana,
    kind: 'request_changes',
    reason: 'Add the carrier invoice reference.',
    evidenceCount: 0,
    department: 'Logistics',
    nowIso: NOW,
  });
  const resubmit = changes.ok
    ? evaluateGovernanceAction({
        request: changes.request,
        actor: alex,
        kind: 'resubmit',
        reason: 'Added carrier invoice reference AP-CARRIER-W30-35.',
        evidenceCount: 1,
        department: 'Logistics',
        nowIso: NOW,
      })
    : changes;
  record(
    'Request Changes lets the requester resubmit',
    changes.ok && resubmit.ok && resubmit.request.workflowStatus === 'Submitted',
    resubmit.ok ? resubmit.request.workflowStatus : resubmit.message
  );

  const conflict = evaluateGovernanceAction({
    request: { ...created, requestedByUserId: helen.id },
    actor: helen,
    kind: 'finalize',
    reason: 'Approving my own request.',
    evidenceCount: 2,
    department: 'Logistics',
    nowIso: NOW,
  });
  record('A requester cannot approve their own request', !conflict.ok, conflict.ok ? 'unexpected approval' : conflict.message);

  const repeat = rejected.ok
    ? evaluateGovernanceAction({
        request: rejected.request,
        actor: helen,
        kind: 'finalize',
        reason: 'Trying to approve after rejection.',
        evidenceCount: 2,
        department: 'Logistics',
        nowIso: NOW,
      })
    : rejected;
  record('A rejected request cannot be approved later', !repeat.ok, repeat.ok ? 'unexpected approval' : repeat.message);

  record(
    'Decisions write an audit action',
    rejected.ok && rejected.auditAction === 'request_rejected' && approved.ok && approved.auditAction === 'request_approved',
    rejected.ok ? rejected.auditAction : 'missing'
  );

  const q3 = INCOME_STATEMENTS.find((row) => row.quarterId === 'Q3 2026');
  const irregularTotal = IRREGULAR_COSTS.reduce((sum, row) => sum + row.amountCad, 0);
  record(
    'Official financial figures stay unchanged',
    q3?.salesCad === 329_700_000 && irregularTotal === 2_818_000 && IRREGULAR_COSTS.find((row) => row.id === 'IR-02')?.amountCad === 600_000,
    `sales ${q3?.salesCad} irregular ${irregularTotal}`
  );

  return checks;
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === executedPath) {
  const results = runGovernanceWorkflowChecks();
  for (const check of results) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.label} — ${check.detail}`);
  }
  const failed = results.filter((check) => !check.passed).length;
  console.log(`${results.length - failed}/${results.length} governance checks passed`);
  if (failed) process.exit(1);
}
