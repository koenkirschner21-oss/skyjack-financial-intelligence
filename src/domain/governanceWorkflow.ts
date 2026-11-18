import type { ApprovalRequest, ApprovalStepRecord, ReviewWorkflowStatus, User } from '../types/domain';

export type GovernanceDecisionKind =
  | 'finalize'
  | 'reject'
  | 'request_changes'
  | 'recommend_approve'
  | 'recommend_reject'
  | 'resubmit';

export type GovernanceDomain = 'import' | 'trade' | 'accounting';

const TERMINAL: ReadonlySet<ReviewWorkflowStatus> = new Set(['Approved', 'Rejected']);

export function governanceDomain(request: ApprovalRequest, department?: string): GovernanceDomain {
  if (request.requestType === 'import_authorization') return 'import';
  if (request.requestType === 'broker_discrepancy') return 'trade';
  const dept = (department ?? '').toLowerCase();
  if (dept.includes('customs') || dept.includes('logistics')) return 'trade';
  return 'accounting';
}

export function specialistMayReview(
  user: User,
  request: ApprovalRequest,
  department?: string
): boolean {
  if (user.roleId === 'cost_accountant') {
    return request.requestType !== 'broker_discrepancy' && request.requestType !== 'import_authorization';
  }
  if (user.roleId === 'trade_coordinator') {
    if (request.requestType === 'import_authorization') return false;
    if (request.requestType === 'broker_discrepancy') return true;
    const dept = (department ?? '').toLowerCase();
    return dept.includes('customs') || dept.includes('logistics');
  }
  return false;
}

function hasSpecialistRecommendation(request: ApprovalRequest, userId: string): boolean {
  return request.approvalsHistory.some(
    (step) =>
      step.actorUserId === userId &&
      (step.decision === 'In Review' || step.decision === 'Additional Evidence Required') &&
      (step.reason ?? '').startsWith('Recommendation:')
  );
}

export function actionNeededBy(
  user: User,
  request: ApprovalRequest,
  department?: string
): boolean {
  if (TERMINAL.has(request.workflowStatus)) return false;
  if (request.workflowStatus === 'Additional Evidence Required') {
    return user.id === request.requestedByUserId;
  }
  if (user.id === request.requestedByUserId) return false;
  if (user.roleId === 'controller') return true;
  if (user.roleId === 'operational_contributor') return false;
  return specialistMayReview(user, request, department) && !hasSpecialistRecommendation(request, user.id);
}

export function decisionOwnerLabel(request: ApprovalRequest, requesterName: string, department?: string): string {
  if (request.workflowStatus === 'Approved') return 'Authorized by the Group Controller';
  if (request.workflowStatus === 'Rejected') return 'Closed by rejection';
  if (request.workflowStatus === 'Additional Evidence Required') return `${requesterName} can revise and resubmit`;
  const trade = governanceDomain(request, department) === 'trade' || request.requestType === 'financial_correction';
  if (request.requestType === 'import_authorization') return 'Helen Park, Group Controller';
  if (trade && request.requestType === 'broker_discrepancy') {
    return 'Marco Silva may recommend. Helen Park authorizes.';
  }
  if (governanceDomain(request, department) === 'trade') {
    return 'Dana Morales or Marco Silva may recommend. Helen Park authorizes.';
  }
  return 'Dana Morales may recommend. Helen Park authorizes.';
}

function evidenceRequired(request: ApprovalRequest): boolean {
  return request.isMaterial || request.requestType === 'financial_correction' || request.requestType === 'broker_discrepancy';
}

function appendStep(
  history: ApprovalStepRecord[],
  label: string,
  actor: User,
  decision: ApprovalStepRecord['decision'],
  reason: string,
  nowIso: string
): ApprovalStepRecord[] {
  return [
    ...history,
    {
      stepNumber: history.length + 1,
      stepLabel: label,
      requiredRoleLabel: actor.title,
      actorUserId: actor.id,
      actorName: actor.name,
      decision,
      reason,
      timestampIso: nowIso,
    },
  ];
}

export function evaluateGovernanceAction(input: {
  request: ApprovalRequest;
  actor: User;
  kind: GovernanceDecisionKind;
  reason: string;
  evidenceCount: number;
  department?: string;
  nowIso: string;
}):
  | { ok: true; request: ApprovalRequest; message: string; auditAction: 'request_approved' | 'request_rejected' | 'record_resolution_updated' }
  | { ok: false; message: string } {
  const { request, actor, kind, evidenceCount, department, nowIso } = input;
  const reason = input.reason.trim();

  if (TERMINAL.has(request.workflowStatus)) {
    return {
      ok: false,
      message: `This request is already ${request.workflowStatus}. A final decision cannot be repeated or reversed here.`,
    };
  }

  if (kind === 'resubmit') {
    if (actor.id !== request.requestedByUserId) {
      return { ok: false, message: 'Only the requester can revise and resubmit this request.' };
    }
    if (request.workflowStatus !== 'Additional Evidence Required') {
      return { ok: false, message: 'Resubmission is available after changes are requested.' };
    }
    if (!reason) return { ok: false, message: 'Describe what changed before resubmitting.' };
    return {
      ok: true,
      auditAction: 'record_resolution_updated',
      message: `Resubmitted ${request.title} for authorization.`,
      request: {
        ...request,
        workflowStatus: 'Submitted',
        resolutionStatus: 'Open',
        status: 'demo_pending_controller',
        updatedAtIso: nowIso,
        approvalsHistory: appendStep(request.approvalsHistory, 'Requester revision', actor, 'In Review', reason, nowIso),
      },
    };
  }

  if (actor.id === request.requestedByUserId) {
    return {
      ok: false,
      message: 'Segregation of duties: the requester cannot review or authorize their own request.',
    };
  }

  if (actor.roleId === 'operational_contributor') {
    return {
      ok: false,
      message: 'Operational Contributors can submit requests. They cannot recommend or authorize them.',
    };
  }

  if (!reason) {
    return { ok: false, message: 'A reason is required before this decision is recorded.' };
  }

  const specialist = specialistMayReview(actor, request, department);
  const controller = actor.roleId === 'controller';

  if (kind === 'recommend_approve' || kind === 'recommend_reject') {
    if (!specialist) {
      return { ok: false, message: 'This recommendation is outside the current role’s review scope.' };
    }
    if (hasSpecialistRecommendation(request, actor.id)) {
      return { ok: false, message: 'You already recorded a recommendation on this request.' };
    }
    const stance = kind === 'recommend_approve' ? 'approval' : 'rejection';
    return {
      ok: true,
      auditAction: 'record_resolution_updated',
      message: `Recorded a specialist recommendation to ${stance === 'approval' ? 'approve' : 'reject'} ${request.title}. This is not final authorization.`,
      request: {
        ...request,
        workflowStatus: 'In Review',
        resolutionStatus: 'Open',
        status: 'demo_pending_controller',
        updatedAtIso: nowIso,
        approvalsHistory: appendStep(
          request.approvalsHistory,
          `Specialist recommendation (${stance})`,
          actor,
          'In Review',
          `Recommendation: ${reason}`,
          nowIso
        ),
      },
    };
  }

  if (kind === 'request_changes') {
    if (!controller && !specialist) {
      return { ok: false, message: 'Only an authorized reviewer can request changes.' };
    }
    return {
      ok: true,
      auditAction: 'record_resolution_updated',
      message: `Changes requested on ${request.title}. The requester can revise and resubmit.`,
      request: {
        ...request,
        workflowStatus: 'Additional Evidence Required',
        resolutionStatus: 'Open',
        status: 'demo_pending_controller',
        decisionReason: reason,
        updatedAtIso: nowIso,
        approvalsHistory: appendStep(
          request.approvalsHistory,
          'Changes requested',
          actor,
          'Additional Evidence Required',
          reason,
          nowIso
        ),
      },
    };
  }

  if (!controller) {
    return {
      ok: false,
      message: 'Final approval and rejection are reserved for Helen Park, Group Controller. A specialist recommendation does not authorize the request.',
    };
  }

  if (kind === 'finalize' && evidenceRequired(request) && evidenceCount < 1) {
    return {
      ok: false,
      message: 'Final approval needs at least one supporting reference or evidence note. This does not verify a file that was not supplied.',
    };
  }

  if (kind === 'reject') {
    return {
      ok: true,
      auditAction: 'request_rejected',
      message: `Rejected ${request.title}. Official case figures were not changed.`,
      request: {
        ...request,
        workflowStatus: 'Rejected',
        resolutionStatus: 'Resolved',
        status: 'demo_rejected',
        approverUserId: actor.id,
        decisionReason: reason,
        updatedAtIso: nowIso,
        approvalsHistory: appendStep(request.approvalsHistory, 'Final rejection', actor, 'Rejected', reason, nowIso),
      },
    };
  }

  return {
    ok: true,
    auditAction: 'request_approved',
    message: `Approved ${request.title}. This authorizes the proposed next step and does not post a journal or change Appendix figures.`,
    request: {
      ...request,
      workflowStatus: 'Approved',
      resolutionStatus: 'Resolved',
      status: 'demo_approved',
      approverUserId: actor.id,
      decisionReason: reason,
      requiredApprovalsCount: 1,
      updatedAtIso: nowIso,
      approvalsHistory: appendStep(request.approvalsHistory, 'Final authorization', actor, 'Approved', reason, nowIso),
    },
  };
}
