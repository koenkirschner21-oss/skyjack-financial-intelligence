import { DEMO_USERS } from '../data/caseSeed';
import type { User, UserRoleId } from '../types/domain';

/**
 * The three competition demonstration identities.
 * The shared password is never stored here. Provisioning reads DEMO_ACCOUNT_PASSWORD.
 * Operational Contributor stays in the permission model for regression checks and has no login.
 */
export const DEMO_AUTH_ACCOUNTS = [
  {
    email: 'helen.park@skyjack.com',
    roleId: 'controller' as const,
    displayName: 'Helen Park',
    jobTitle: 'Group Controller',
    department: 'Finance',
  },
  {
    email: 'dana.morales@skyjack.com',
    roleId: 'cost_accountant' as const,
    displayName: 'Dana Morales',
    jobTitle: 'Cost Accountant',
    department: 'Finance',
  },
  {
    email: 'marco.silva@skyjack.com',
    roleId: 'trade_coordinator' as const,
    displayName: 'Marco Silva',
    jobTitle: 'Customs & Trade Coordinator',
    department: 'Global Trade',
  },
] as const;

const ASSIGNABLE_ROLES = new Set<UserRoleId>([
  'controller',
  'cost_accountant',
  'trade_coordinator',
  'operational_contributor',
]);

export function isAssignableRoleId(value: string): value is UserRoleId {
  return ASSIGNABLE_ROLES.has(value as UserRoleId);
}

/** Maps a server-assigned role onto the existing permission profile. The caller cannot choose the role. */
export function userFromAssignedRole(roleId: string): User | null {
  if (!isAssignableRoleId(roleId)) return null;
  return DEMO_USERS.find((user) => user.roleId === roleId) ?? null;
}
