import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEMO_USERS } from '../data/caseSeed';
import { canAccessRoute, canPerformAction } from './permissions';
import { DEMO_AUTH_ACCOUNTS, userFromAssignedRole } from './demoAuthAccounts';
import {
  authorizeRequest,
  classifySignInFailure,
  sessionIsRestorable,
  type AuthorizeRequestResult,
} from '../server/authorizeRequest';

export interface AuthAccessCheck {
  label: string;
  passed: boolean;
  detail: string;
  live: false;
}

const ACCEPTED_PASSWORD = 'accepted-by-mock-provider';

function mockSignIn(email: string, password: string): { ok: true; roleId: string } | { ok: false; message: string } {
  const account = DEMO_AUTH_ACCOUNTS.find((item) => item.email === email.trim().toLowerCase());
  if (!account || password !== ACCEPTED_PASSWORD) {
    return { ok: false, message: 'Invalid login credentials' };
  }
  return { ok: true, roleId: account.roleId };
}

async function resolveRole(
  roleId: string,
  options?: { claimedRoleId?: string; requiredAction?: 'view_financials' | 'view_overview' }
): Promise<AuthorizeRequestResult> {
  return authorizeRequest({
    authConfigured: true,
    authorizationHeader: 'Bearer mock-token',
    claimedRoleId: options?.claimedRoleId,
    requiredAction: options?.requiredAction,
    verifyAccessToken: async () => ({ authUserId: `auth-${roleId}` }),
    loadAssignedRole: async () => roleId,
  });
}

export function runAuthAccessChecks(): AuthAccessCheck[] {
  const checks: AuthAccessCheck[] = [];
  const now = 1_700_000_000;
  const signIns = DEMO_AUTH_ACCOUNTS.map((account) => mockSignIn(account.email, ACCEPTED_PASSWORD));
  checks.push({
    label: 'Valid login for the three demonstration accounts',
    live: false,
    passed: signIns.every((result, index) => {
      if (!result.ok) return false;
      const user = userFromAssignedRole(result.roleId);
      return user?.roleId === DEMO_AUTH_ACCOUNTS[index].roleId && user.name === DEMO_AUTH_ACCOUNTS[index].displayName;
    }),
    detail: signIns.map((result) => (result.ok ? result.roleId : 'rejected')).join(', '),
  });

  const wrongPassword = mockSignIn('helen.park@skyjack.com', 'wrong-password');
  checks.push({
    label: 'Invalid password is rejected',
    live: false,
    passed: !wrongPassword.ok && classifySignInFailure(wrongPassword.ok ? '' : wrongPassword.message) === 'rejected',
    detail: wrongPassword.ok ? 'unexpected session' : wrongPassword.message,
  });

  const unknown = mockSignIn('unknown.person@skyjack.com', ACCEPTED_PASSWORD);
  checks.push({
    label: 'Unknown account is rejected',
    live: false,
    passed: !unknown.ok && classifySignInFailure(unknown.ok ? '' : unknown.message) === 'rejected',
    detail: unknown.ok ? 'unexpected session' : unknown.message,
  });

  checks.push({
    label: 'Session restoration accepts a live token and rejects an expired one',
    live: false,
    passed:
      sessionIsRestorable({ accessToken: 'token', expiresAt: now + 60 }, now) &&
      !sessionIsRestorable({ accessToken: 'token', expiresAt: now - 1 }, now) &&
      !sessionIsRestorable(null, now),
    detail: 'expiry compared with the token timestamp',
  });

  return checks;
}

export async function runAuthAccessChecksAsync(): Promise<AuthAccessCheck[]> {
  const checks = runAuthAccessChecks();

  const signedIn = await resolveRole('controller', { requiredAction: 'view_overview' });
  const afterLogout = await authorizeRequest({
    authConfigured: true,
    authorizationHeader: undefined,
    verifyAccessToken: async () => ({ authUserId: 'auth-controller' }),
    loadAssignedRole: async () => 'controller',
  });
  checks.push({
    label: 'Logout removes the credential required for a later request',
    live: false,
    passed: signedIn.ok && !afterLogout.ok && afterLogout.status === 401,
    detail: afterLogout.ok ? 'still authorized' : afterLogout.errorCode,
  });

  const anonymous = await authorizeRequest({
    authConfigured: true,
    verifyAccessToken: async () => null,
    loadAssignedRole: async () => null,
  });
  checks.push({
    label: 'Unauthenticated API request is rejected',
    live: false,
    passed: !anonymous.ok && anonymous.status === 401,
    detail: anonymous.ok ? 'allowed' : `${anonymous.status} ${anonymous.errorCode}`,
  });

  const helen = userFromAssignedRole('controller')!;
  const dana = userFromAssignedRole('cost_accountant')!;
  const marco = userFromAssignedRole('trade_coordinator')!;
  const contributor = DEMO_USERS.find((user) => user.roleId === 'operational_contributor')!;
  checks.push({
    label: 'Role-specific navigation follows the existing permission model',
    live: false,
    passed:
      canAccessRoute(helen, '/financials') &&
      canAccessRoute(dana, '/financials') &&
      !canAccessRoute(marco, '/financials') &&
      canAccessRoute(marco, '/trade') &&
      canAccessRoute(marco, '/opportunities') &&
      !canAccessRoute(contributor, '/opportunities') &&
      canPerformAction(contributor, 'view_overview'),
    detail: 'controller and accountant: financials; trade: trade and opportunities, not financials; contributor has no opportunity route',
  });

  const tradeFinancials = await resolveRole('trade_coordinator', { requiredAction: 'view_financials' });
  const controllerOverview = await resolveRole('controller', { requiredAction: 'view_overview' });
  checks.push({
    label: 'Restricted backend action is denied for the trade role',
    live: false,
    passed:
      !tradeFinancials.ok &&
      tradeFinancials.status === 403 &&
      controllerOverview.ok &&
      controllerOverview.user.roleId === 'controller',
    detail: tradeFinancials.ok ? 'allowed' : tradeFinancials.errorCode,
  });

  const impersonated = await resolveRole('trade_coordinator', {
    claimedRoleId: 'controller',
    requiredAction: 'view_financials',
  });
  const impersonatedIdentity = await resolveRole('trade_coordinator', { claimedRoleId: 'controller' });
  checks.push({
    label: 'Client-supplied role does not change the authorized user',
    live: false,
    passed:
      !impersonated.ok &&
      impersonated.status === 403 &&
      impersonatedIdentity.ok &&
      impersonatedIdentity.user.roleId === 'trade_coordinator',
    detail: impersonatedIdentity.ok ? impersonatedIdentity.user.roleId : 'rejected',
  });

  const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/20261118000000_auth_role_foundation.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8').toLowerCase().replace(/--[^\n]*/g, '');
  const policies = sql.match(/create policy[\s\S]*?;/g) ?? [];
  const mutatingPolicies = policies.filter((policy) => /for\s+(insert|update|delete|all)\b/.test(policy));
  checks.push({
    label: 'Authenticated users cannot insert, update, or delete role assignments',
    live: false,
    passed:
      sql.includes('enable row level security') &&
      sql.includes('auth.uid() = user_id') &&
      policies.length === 1 &&
      mutatingPolicies.length === 0 &&
      !/grant\s+(insert|update|delete|all)\b/.test(sql),
    detail: `${policies.length} select policy, ${mutatingPolicies.length} mutating policies`,
  });

  return checks;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectRun) {
  const checks = await runAuthAccessChecksAsync();
  for (const check of checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} [mock] ${check.label} — ${check.detail}`);
  }
  if (checks.some((check) => !check.passed)) process.exit(1);
}
