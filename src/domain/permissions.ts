import {
  CustomsEntry,
  IrregularCost,
  PermissionAction,
  PermissionRole,
  RoutePath,
  User,
  UserRoleId,
} from '../types/domain';

export const PERMISSION_ROLES: Record<UserRoleId, PermissionRole> = {
  controller: {
    id: 'controller',
    tier: 'LEVEL_1_CONTROLLER',
    label: 'Group Controller',
    description:
      'Organization-wide visibility, executive reporting, material correction approvals, tariff simulation governance, and settings management.',
    scopedRegions: 'all',
    scopedDomains: ['financial', 'trade', 'operations', 'governance'],
    allowedActions: [
      'view_overview',
      'view_global_operations',
      'view_financials',
      'view_trade',
      'run_tariff_simulator',
      'save_tariff_scenario',
      'manage_investigations',
      'manage_trade_investigations',
      'view_opportunities',
      'generate_reports',
      'stage_data_upload',
      'authorize_data_import',
      'review_quarantined_records',
      'resolve_review_item',
      'submit_correction_request',
      'approve_material_correction',
      'view_audit_history',
      'manage_access_settings',
      'configure_business_rules',
    ],
  },
  cost_accountant: {
    id: 'cost_accountant',
    tier: 'LEVEL_2_SPECIALIST',
    label: 'Cost Accountant',
    description:
      'Full Financial Intelligence, ledger references, financial review queue, and trade summary tie-out.',
    scopedRegions: 'all',
    scopedDomains: ['financial', 'operations', 'governance'],
    allowedActions: [
      'view_overview',
      'view_global_operations',
      'view_financials',
      'view_trade',
      'manage_investigations',
      'view_opportunities',
      'generate_reports',
      'stage_data_upload',
      'review_quarantined_records',
      'resolve_review_item',
      'submit_correction_request',
      'view_audit_history',
    ],
  },
  trade_coordinator: {
    id: 'trade_coordinator',
    tier: 'LEVEL_2_SPECIALIST',
    label: 'Customs & Trade Coordinator',
    description:
      'Full Shipments & Trade, broker reconciliation, Tariff Simulator, Global Operations, and customs/trade review queue.',
    scopedRegions: 'all',
    scopedDomains: ['trade', 'operations', 'governance'],
    allowedActions: [
      'view_overview',
      'view_global_operations',
      'view_trade',
      'run_tariff_simulator',
      'save_tariff_scenario',
      'manage_trade_investigations',
      'view_opportunities',
      'generate_reports',
      'stage_data_upload',
      'review_quarantined_records',
      'resolve_review_item',
      'submit_correction_request',
      'view_audit_history',
    ],
  },
  operational_contributor: {
    id: 'operational_contributor',
    tier: 'LEVEL_3_CONTRIBUTOR',
    label: 'Operational Contributor',
    description:
      'Stage operational files for review, attach supporting references, and submit or track correction requests.',
    scopedRegions: ['north_america'],
    scopedDomains: ['operations'],
    allowedActions: [
      'view_overview',
      'stage_data_upload',
      'submit_correction_request',
    ],
  },
};

export function getRoleDefinition(roleId: UserRoleId): PermissionRole {
  return PERMISSION_ROLES[roleId];
}

export function canPerformAction(user: User, action: PermissionAction): boolean {
  const role = PERMISSION_ROLES[user.roleId];
  return role.allowedActions.includes(action);
}

export const ROUTE_REQUIRED_ACTION: Record<RoutePath, PermissionAction> = {
  '/overview': 'view_overview',
  '/global-operations': 'view_global_operations',
  '/financials': 'view_financials',
  '/trade': 'view_trade',
  '/simulator': 'run_tariff_simulator',
  '/investigations': 'manage_investigations',
  '/opportunities': 'view_opportunities',
  '/reports': 'generate_reports',
  '/data-gateway': 'stage_data_upload',
  '/approvals': 'submit_correction_request',
  '/audit': 'view_audit_history',
  '/settings': 'view_overview',
};

export function canAccessRoute(user: User, route: RoutePath): boolean {
  if (route === '/investigations') {
    return (
      canPerformAction(user, 'manage_investigations') ||
      canPerformAction(user, 'manage_trade_investigations')
    );
  }
  const required = ROUTE_REQUIRED_ACTION[route];
  return canPerformAction(user, required);
}

/**
 * Determine whether the user can edit a specific irregular cost's investigation status.
 */
export function canManageRecordInvestigation(user: User, cost: IrregularCost): boolean {
  if (canPerformAction(user, 'manage_investigations')) return true;
  if (
    canPerformAction(user, 'manage_trade_investigations') &&
    (cost.department === 'Customs and Trade' || cost.department === 'Logistics')
  ) {
    return true;
  }
  return false;
}

/**
 * Scope irregular cost records based on role & tier.
 */
export function filterIrregularCostsForUser(user: User, items: IrregularCost[]): IrregularCost[] {
  switch (user.roleId) {
    case 'controller':
    case 'cost_accountant':
      return items;
    case 'trade_coordinator':
      return items.filter(
        (item) =>
          item.department === 'Customs and Trade' ||
          item.department === 'Logistics'
      );
    case 'operational_contributor':
      return items.filter(
        (item) =>
          item.regionId === 'north_america' &&
          (item.department === 'Operations' || item.department === 'Logistics')
      );
  }
}

/**
 * Scope customs entries based on role & tier.
 * - Controller, Trade Coordinator, Cost Accountant (read-only tie-out): all 12 entries
 * - Operational Contributor: restricted
 */
export function filterCustomsEntriesForUser(user: User, entries: CustomsEntry[]): CustomsEntry[] {
  if (user.roleId === 'operational_contributor') {
    return [];
  }
  return entries;
}

/**
 * Governance invariant: No user may approve their own material correction.
 */
export function canApproveCorrectionRequest(
  actingUser: User,
  requestedByUserId: string
): { allowed: boolean; reason?: string } {
  if (!canPerformAction(actingUser, 'approve_material_correction')) {
    return {
      allowed: false,
      reason: 'Only the Group Controller may approve material corrections.',
    };
  }
  if (actingUser.id === requestedByUserId) {
    return {
      allowed: false,
      reason: 'Segregation of duties: no user may approve their own request or material correction.',
    };
  }
  return { allowed: true };
}

/**
 * Determine scoped reviewer eligibility for Phase 3 Review Queue and Approvals Workspace.
 */
export function canUserReviewItem(
  user: User,
  params: {
    requestType?: string;
    department?: string;
    schemaType?: 'ledger_transactions' | 'customs_shipments';
    requestedByUserId?: string;
  }
): { allowed: boolean; reason?: string } {
  if (params.requestedByUserId && params.requestedByUserId === user.id) {
    return {
      allowed: false,
      reason: 'Segregation of duties: requester cannot review or approve their own submission.',
    };
  }
  if (user.roleId === 'controller') {
    return { allowed: true };
  }
  if (user.roleId === 'operational_contributor') {
    return {
      allowed: false,
      reason: 'Operational Contributors may submit and track requests but cannot authorize or review items.',
    };
  }
  if (params.requestType === 'import_authorization') {
    return {
      allowed: false,
      reason: 'Final data import authorization requires Group Controller approval.',
    };
  }
  if (user.roleId === 'trade_coordinator') {
    const dept = (params.department ?? '').toLowerCase();
    const isTradeScoped =
      params.schemaType === 'customs_shipments' ||
      params.requestType === 'broker_discrepancy' ||
      dept.includes('customs') ||
      dept.includes('logistics');
    if (isTradeScoped) return { allowed: true };
    return {
      allowed: false,
      reason: 'Customs & Trade Coordinator review scope is limited to customs, broker, and logistics items.',
    };
  }
  if (user.roleId === 'cost_accountant') {
    const isTradeOnly = params.requestType === 'broker_discrepancy' || params.schemaType === 'customs_shipments';
    if (!isTradeOnly) return { allowed: true };
    return {
      allowed: false,
      reason: 'Cost Accountant cannot sign off customs-specific broker discrepancies without Trade/Controller review.',
    };
  }
  return { allowed: false, reason: 'Role not authorized.' };
}

export type ReportDatasetExportKey =
  | 'income_statements'
  | 'irregular_costs'
  | 'customs_entries'
  | 'broker_reconciliation'
  | 'tariff_scenarios'
  | 'investigations'
  | 'opportunities'
  | 'authorized_uploads';

export interface ReportPermissionPolicy {
  canAccessStudio: boolean;
  scopeTitle: string;
  scopeDescription: string;
  allowedTemplates: string[];
  allowFinancialPerformance: boolean;
  allowRegionalSales: boolean;
  allowAllIrregularCosts: boolean;
  allowTradeAndCustoms: boolean;
  allowTariffScenarios: boolean;
  allowExecutiveWorkbook: boolean;
  allowedCsvDatasets: ReportDatasetExportKey[];
}

export function getReportPermissionPolicy(user: User): ReportPermissionPolicy {
  switch (user.roleId) {
    case 'controller':
      return {
        canAccessStudio: true,
        scopeTitle: 'Organization-Wide Executive Reporting',
        scopeDescription:
          'Full access to all 6 templates, 27 report sections, consolidated financial/trade datasets, tariff scenarios, and executive exports.',
        allowedTemplates: [
          'executive_financial_review',
          'trade_tariff_review',
          'financial_risk_review',
          'quarter_end_close_report',
          'cost_optimization_report',
          'custom_report',
        ],
        allowFinancialPerformance: true,
        allowRegionalSales: true,
        allowAllIrregularCosts: true,
        allowTradeAndCustoms: true,
        allowTariffScenarios: true,
        allowExecutiveWorkbook: true,
        allowedCsvDatasets: [
          'income_statements',
          'irregular_costs',
          'customs_entries',
          'broker_reconciliation',
          'tariff_scenarios',
          'investigations',
          'opportunities',
          'authorized_uploads',
        ],
      };

    case 'cost_accountant':
      return {
        canAccessStudio: true,
        scopeTitle: 'Scoped Financial & Investigation Reporting',
        scopeDescription:
          'Permitted financial performance, profit walk, irregular costs, quarter-end readiness, investigations, and non-scenario cost opportunities; excludes speculative tariff scenario policy modeling.',
        allowedTemplates: [
          'executive_financial_review',
          'financial_risk_review',
          'quarter_end_close_report',
          'cost_optimization_report',
          'custom_report',
        ],
        allowFinancialPerformance: true,
        allowRegionalSales: true,
        allowAllIrregularCosts: true,
        allowTradeAndCustoms: true, // Read-only trade cost summary tie-out permitted
        allowTariffScenarios: false,
        allowExecutiveWorkbook: true,
        allowedCsvDatasets: [
          'income_statements',
          'irregular_costs',
          'investigations',
          'opportunities',
          'authorized_uploads',
        ],
      };

    case 'trade_coordinator':
      return {
        canAccessStudio: true,
        scopeTitle: 'Scoped Trade, Customs, Broker & Tariff Reporting',
        scopeDescription:
          'Permitted customs shipments, broker reconciliation, trade agreement opportunities, tariff scenarios, and trade/logistics cost exceptions; restricted from organization-wide Income Statements and non-trade GL allocations.',
        allowedTemplates: [
          'trade_tariff_review',
          'financial_risk_review',
          'cost_optimization_report',
          'custom_report',
        ],
        allowFinancialPerformance: false,
        allowRegionalSales: false,
        allowAllIrregularCosts: false, // Filtered to Customs and Trade + Logistics via filterIrregularCostsForUser
        allowTradeAndCustoms: true,
        allowTariffScenarios: true,
        allowExecutiveWorkbook: true,
        allowedCsvDatasets: [
          'irregular_costs',
          'customs_entries',
          'broker_reconciliation',
          'tariff_scenarios',
          'investigations',
          'opportunities',
          'authorized_uploads',
        ],
      };

    case 'operational_contributor':
      return {
        canAccessStudio: false,
        scopeTitle: 'Restricted (Operational Contributor)',
        scopeDescription:
          'Operational Contributors do not have access to executive financial reports or unrestricted trade/finance exports. Use Data Gateway to stage authorized operational files.',
        allowedTemplates: [],
        allowFinancialPerformance: false,
        allowRegionalSales: false,
        allowAllIrregularCosts: false,
        allowTradeAndCustoms: false,
        allowTariffScenarios: false,
        allowExecutiveWorkbook: false,
        allowedCsvDatasets: [],
      };
  }
}

