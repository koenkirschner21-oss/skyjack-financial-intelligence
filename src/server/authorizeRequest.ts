import { userFromAssignedRole } from '../domain/demoAuthAccounts';
import { canPerformAction } from '../domain/permissions';
import type { PermissionAction, User, UserRoleId } from '../types/domain';

export interface VerifiedAccessToken {
  authUserId: string;
}

export interface AuthorizeRequestInput {
  authConfigured: boolean;
  authorizationHeader?: string;
  requiredAction?: PermissionAction;
  requiredAnyOf?: PermissionAction[];
  /** Ignored. Present so tests can prove a client-supplied role does not authorize the request. */
  claimedRoleId?: string;
  verifyAccessToken: (token: string) => Promise<VerifiedAccessToken | null>;
  loadAssignedRole: (authUserId: string, accessToken: string) => Promise<UserRoleId | string | null>;
}

export type AuthorizeRequestResult =
  | { ok: true; user: User; authUserId: string }
  | { ok: false; status: number; errorCode: string; userMessage: string };

export async function authorizeRequest(input: AuthorizeRequestInput): Promise<AuthorizeRequestResult> {
  if (!input.authConfigured) {
    return {
      ok: false,
      status: 503,
      errorCode: 'AUTH_NOT_CONFIGURED',
      userMessage: 'Sign-in is not configured on this server.',
    };
  }

  const header = input.authorizationHeader?.trim() ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    return {
      ok: false,
      status: 401,
      errorCode: 'UNAUTHENTICATED',
      userMessage: 'Sign in is required.',
    };
  }

  const accessToken = match[1];
  const verified = await input.verifyAccessToken(accessToken);
  if (!verified?.authUserId) {
    return {
      ok: false,
      status: 401,
      errorCode: 'INVALID_SESSION',
      userMessage: 'Your session is invalid or expired. Sign in again.',
    };
  }

  const assignedRole = await input.loadAssignedRole(verified.authUserId, accessToken);
  const user = assignedRole ? userFromAssignedRole(assignedRole) : null;
  if (!user) {
    return {
      ok: false,
      status: 403,
      errorCode: 'ROLE_NOT_ASSIGNED',
      userMessage: 'No application role is assigned to this account.',
    };
  }

  const actions = input.requiredAnyOf ?? (input.requiredAction ? [input.requiredAction] : []);
  if (actions.length > 0 && !actions.some((action) => canPerformAction(user, action))) {
    return {
      ok: false,
      status: 403,
      errorCode: 'FORBIDDEN',
      userMessage: 'Your role cannot perform this action.',
    };
  }

  return { ok: true, user, authUserId: verified.authUserId };
}

/** Supabase returns one message for a wrong password and an unknown email. Both must be rejected. */
export function classifySignInFailure(errorMessage: string): 'rejected' | 'unavailable' {
  const message = errorMessage.toLowerCase();
  if (
    message.includes('invalid login') ||
    message.includes('invalid credentials') ||
    message.includes('user not found') ||
    message.includes('unknown')
  ) {
    return 'rejected';
  }
  return 'unavailable';
}

export function sessionIsRestorable(session: { accessToken?: string; expiresAt?: number } | null, nowSeconds: number): boolean {
  if (!session?.accessToken || session.expiresAt == null) return false;
  return session.expiresAt > nowSeconds;
}
