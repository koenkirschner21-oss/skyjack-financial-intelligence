import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CUSTOMS_ENTRIES,
  DEMO_USERS,
  DOMESTIC_SHIPMENT_RECORDS,
  IRREGULAR_COSTS,
  OPERATING_EARNINGS_WALKS,
  PARTIAL_LEDGER_TRANSACTIONS,
} from '../data/caseSeed';
import {
  toUploadedCustomsRecord,
  toUploadedLedgerTransaction,
} from '../domain/ingestionPipeline';
import {
  canAccessRoute,
  canApproveCorrectionRequest,
  canManageRecordInvestigation,
  canPerformAction,
  canUserReviewItem,
  filterCustomsEntriesForUser,
  filterIrregularCostsForUser,
  getRoleDefinition,
} from '../domain/permissions';
import {
  evaluateBusinessRules,
  formatCad,
  fromMinorCents,
  groupRuleEvaluationsByRecord,
  toMinorCents,
} from '../domain/rulesEngine';
import {
  convertFromCad,
  formatOverviewReportingCompact,
  formatReportingCompact,
  formatReportingMoney,
  formatReportingShort,
} from '../domain/currencyService';
import {
  costIntelligenceRepo,
  mapLegacyToWorkflowStatus,
  mapWorkflowToLegacyStatus,
  PersistedWorkspaceState,
} from '../repositories/costIntelligenceRepo';
import {
  AiInvestigationBrief,
  AppNotification,
  ApprovalRequest,
  ApprovalStepRecord,
  AuditEvent,
  BusinessRuleConfig,
  CurrencyCode,
  NotificationCategory,
  CustomsEntry,
  EvidenceEntityType,
  EvidenceSourceType,
  GovernanceRequestType,
  GroupedRuleAlert,
  ImportBatch,
  Investigation,
  InvestigationStatus,
  InvestigationWorkflowStatus,
  IrregularCost,
  OperatingEarningsWalkEntry,
  OpportunityWorkflowStatus,
  PermissionAction,
  QuarterId,
  RegionId,
  ReportConfiguration,
  ReportExportFormat,
  ReportExportHistoryRecord,
  ReportLaunchPreset,
  ReportSnapshotRecord,
  ReviewWorkflowStatus,
  RoutePath,
  RuleEvaluationResult,
  SavedScenario,
  SupportingEvidence,
  UploadedCustomsRecord,
  UploadedLedgerTransaction,
  User,
  UserRoleId,
} from '../types/domain';

export type DrawerRecord =
  | { type: 'irregular_cost'; record: IrregularCost }
  | { type: 'customs_entry'; record: CustomsEntry }
  | { type: 'walk_entry'; record: OperatingEarningsWalkEntry; walkTitle: string }
  | { type: 'rule_evaluation'; record: RuleEvaluationResult }
  | { type: 'uploaded_ledger'; record: UploadedLedgerTransaction }
  | { type: 'uploaded_customs'; record: UploadedCustomsRecord }
  | null;

export const VALID_ROUTES: RoutePath[] = [
  '/overview',
  '/global-operations',
  '/financials',
  '/trade',
  '/simulator',
  '/investigations',
  '/opportunities',
  '/reports',
  '/data-gateway',
  '/approvals',
  '/audit',
  '/settings',
];

function normalizeRoute(pathname: string): RoutePath {
  const cleaned = pathname.replace(/\/+$/, '') || '/overview';
  if (VALID_ROUTES.includes(cleaned as RoutePath)) {
    return cleaned as RoutePath;
  }
  return '/overview';
}

export interface AddEvidenceInput {
  linkedRecordId: string;
  linkedEntityType?: EvidenceEntityType;
  title: string;
  summary: string;
  sourceType?: EvidenceSourceType;
  fileName?: string;
  fileSizeBytes?: number;
  persistenceScope?: SupportingEvidence['persistenceScope'];
}

export interface CreateGovernanceRequestInput {
  linkedRecordId: string;
  requestType: GovernanceRequestType;
  title: string;
  amountCad: number;
  rationale: string;
  batchId?: string;
  requiredApprovalsCount?: number;
}

interface AppContextValue {
  currentRoute: RoutePath;
  navigate: (route: RoutePath) => void;
  state: PersistedWorkspaceState;
  activeUser: User;
  setQuarterFilter: (quarterId: QuarterId) => void;
  setRegionFilter: (regionId: RegionId) => void;
  setPlantFilter: (plantId: string) => void;
  setCurrencyPreference: (currency: CurrencyCode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  formatMoney: (
    amountCad: number,
    options?: { compact?: boolean; showSign?: boolean; includeDecimalsWhenWhole?: boolean }
  ) => string;
  formatCompactMoney: (amountCad: number, options?: { showSign?: boolean }) => string;
  formatShortMoney: (amountCad: number, options?: { showSign?: boolean }) => string;
  formatOverviewMoney: (amountCad: number, options?: { showSign?: boolean }) => string;
  convertAmount: (amountCad: number) => number;
  visibleNotifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotification: (notificationId: string) => void;
  clearAllNotifications: () => void;
  drawerRecord: DrawerRecord;
  openDrawer: (record: DrawerRecord) => void;
  openRecordById: (recordId: string) => boolean;
  closeDrawer: () => void;
  askModalOpen: boolean;
  setAskModalOpen: (open: boolean) => void;
  scopedIrregularCosts: IrregularCost[];
  scopedCustomsEntries: CustomsEntry[];
  ruleEvaluations: RuleEvaluationResult[];
  groupedAlerts: GroupedRuleAlert[];
  authorizedAnalytics: {
    ledgerCount: number;
    ledgerTotalCad: number;
    ledgerSelectedPeriodCad: number;
    customsCount: number;
    customsGoodsValueCad: number;
    customsDutyCad: number;
    customsBrokerFeeCad: number;
    customsBrokerVarianceCad: number;
    customsTotalCostCad: number;
    combinedUploadedSelectedPeriodCad: number;
    openQuarantinedCount: number;
  };
  simulatorPresetEntryIds: string[];
  sendEntriesToSimulator: (entryIds: string[]) => void;
  saveScenario: (
    scenario: Omit<SavedScenario, 'id' | 'createdAtIso' | 'createdByUserId' | 'provenance'>
  ) => SavedScenario | null;
  deleteScenario: (scenarioId: string) => void;
  updateInvestigationStatus: (linkedRecordId: string, status: InvestigationStatus) => void;
  updateInvestigationWorkflow: (
    investigationId: string,
    params: {
      workflowStatus?: InvestigationWorkflowStatus;
      ownerUserId?: string;
      dismissalReason?: string;
      notes?: string;
      aiBrief?: AiInvestigationBrief;
    }
  ) => { ok: boolean; message: string };
  promoteQuarantinedToInvestigation: (reviewItemId: string) => { ok: boolean; message: string; investigation?: Investigation };
  saveAiInvestigationNote: (linkedRecordId: string, brief: AiInvestigationBrief) => { ok: boolean; message: string };
  updateCostOpportunity: (params: {
    opportunityId: string;
    status: OpportunityWorkflowStatus;
    verifiedAmountCad: number;
    realizedAmountCad: number;
    resolutionNote: string;
  }) => { ok: boolean; message: string };
  recordAiAuditEvent: (
    actionType:
      | 'ai_query_executed'
      | 'ai_briefing_generated'
      | 'ai_gateway_assist_used'
      | 'ai_evidence_extracted'
      | 'ai_report_summary_generated',
    summary: string,
    targetRecordId?: string
  ) => void;
  reportPreset: ReportLaunchPreset | null;
  clearReportPreset: () => void;
  openReportStudioWithPreset: (preset: ReportLaunchPreset) => void;
  saveReportConfig: (config: ReportConfiguration) => ReportConfiguration | null;
  duplicateReportConfig: (reportId: string) => ReportConfiguration | null;
  deleteReportConfig: (reportId: string) => boolean;
  recordReportExport: (params: {
    config: ReportConfiguration;
    format: ReportExportFormat;
    fileName: string;
    slideCount?: number;
    byteSize?: number;
    downloadTriggered: boolean;
    outcomeNote: string;
    sourceRecordRefs: string[];
    headlineMetrics: { label: string; value: string }[];
    failed?: boolean;
  }) => void;
  addEvidenceNote: (linkedRecordId: string, title: string, summary: string) => void;
  addSupportingEvidence: (input: AddEvidenceInput) => { ok: boolean; message: string };
  submitCorrectionRequest: (linkedRecordId: string, title: string, amountCad: number, rationale: string) => void;
  createGovernanceRequest: (input: CreateGovernanceRequestInput) => { ok: boolean; message: string; request?: ApprovalRequest };
  approveCorrectionRequest: (requestId: string, approve: boolean) => { ok: boolean; message: string };
  reviewGovernanceRequest: (
    requestId: string,
    decision: ReviewWorkflowStatus,
    reason: string
  ) => { ok: boolean; message: string };
  recordStagedBatch: (batch: ImportBatch) => void;
  submitBatchForAuthorization: (batchId: string) => { ok: boolean; message: string };
  authorizeAndCommitBatch: (batchId: string, reason?: string) => { ok: boolean; message: string; committedCount: number };
  updateReviewQueueItem: (
    itemId: string,
    params: {
      status: ReviewWorkflowStatus;
      reason: string;
      resolutionNote?: string;
      releaseToAuthorized?: boolean;
    }
  ) => { ok: boolean; message: string };
  toggleBusinessRule: (ruleId: BusinessRuleConfig['id']) => void;
  updateRuleThreshold: (ruleId: BusinessRuleConfig['id'], value: number) => void;
  resetDemoState: () => void;
  hasPermission: (action: PermissionAction) => boolean;
  canViewRoute: (route: RoutePath) => boolean;
  persistenceNotice: string;
  actionBanner: { type: 'info' | 'warning' | 'success'; message: string } | null;
  dismissBanner: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ authenticatedUser: User; children: React.ReactNode }> = ({
  authenticatedUser,
  children,
}) => {
  const [state, setState] = useState<PersistedWorkspaceState>(() => costIntelligenceRepo.loadState());
  const [currentRoute, setCurrentRoute] = useState<RoutePath>(() => {
    const initial = normalizeRoute(window.location.pathname);
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState({}, '', '/overview');
    }
    return initial;
  });
  const [drawerRecord, setDrawerRecord] = useState<DrawerRecord>(null);
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [simulatorPresetEntryIds, setSimulatorPresetEntryIds] = useState<string[]>(['E-04', 'E-05', 'E-06']);
  const [reportPreset, setReportPreset] = useState<ReportLaunchPreset | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    type: 'info' | 'warning' | 'success';
    message: string;
  } | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setCurrentRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const persistState = useCallback((updater: (prev: PersistedWorkspaceState) => PersistedWorkspaceState) => {
    setState((prev) => {
      const next = updater(prev);
      costIntelligenceRepo.saveState(next);
      return next;
    });
  }, []);

  const activeUser = authenticatedUser;

  useEffect(() => {
    setState((prev) => {
      if (prev.activeRoleId === authenticatedUser.roleId) return prev;
      const next = { ...prev, activeRoleId: authenticatedUser.roleId };
      costIntelligenceRepo.saveState(next);
      return next;
    });
  }, [authenticatedUser]);

  const navigate = useCallback((route: RoutePath) => {
    if (window.location.pathname !== route) {
      window.history.pushState({}, '', route);
    }
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const buildAuditEvent = useCallback(
    (
      actor: User,
      actionType: AuditEvent['actionType'],
      summary: string,
      targetRecordId?: string,
      extra?: {
        actorType?: 'user' | 'system';
        batchId?: string;
        previousState?: string;
        newState?: string;
        authorizationRef?: string;
        reason?: string;
      }
    ): AuditEvent => ({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampIso: new Date().toISOString(),
      actorType: extra?.actorType ?? 'user',
      actorUserId: extra?.actorType === 'system' ? 'system-gateway' : actor.id,
      actorName: extra?.actorType === 'system' ? 'Data Gateway Validation Engine' : actor.name,
      actorRoleLabel:
        extra?.actorType === 'system' ? 'Automated Deterministic Rule Engine' : getRoleDefinition(actor.roleId).label,
      actionType,
      targetRecordId,
      batchId: extra?.batchId,
      previousState: extra?.previousState,
      newState: extra?.newState,
      authorizationRef: extra?.authorizationRef,
      reason: extra?.reason,
      summary,
      provenance: 'demonstration_state',
    }),
    []
  );

  const setQuarterFilter = useCallback(
    (quarterId: QuarterId) => {
      persistState((prev) => ({
        ...prev,
        selectedQuarterId: quarterId,
      }));
    },
    [persistState]
  );

  const setRegionFilter = useCallback(
    (regionId: RegionId) => {
      persistState((prev) => ({
        ...prev,
        selectedRegionId: regionId,
      }));
    },
    [persistState]
  );

  const setPlantFilter = useCallback(
    (plantId: string) => {
      persistState((prev) => ({
        ...prev,
        selectedPlantId: plantId,
      }));
    },
    [persistState]
  );

  const setCurrencyPreference = useCallback(
    (currency: CurrencyCode) => {
      persistState((prev) => ({
        ...prev,
        currency,
      }));
    },
    [persistState]
  );

  const setSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      persistState((prev) => ({
        ...prev,
        sidebarCollapsed: collapsed,
      }));
    },
    [persistState]
  );

  const formatMoney = useCallback(
    (
      amountCad: number,
      options?: { compact?: boolean; showSign?: boolean; includeDecimalsWhenWhole?: boolean }
    ) => formatReportingMoney(amountCad, state.currency, options),
    [state.currency]
  );

  const formatCompactMoney = useCallback(
    (amountCad: number, options?: { showSign?: boolean }) =>
      formatReportingCompact(amountCad, state.currency, options),
    [state.currency]
  );

  const formatShortMoney = useCallback(
    (amountCad: number, options?: { showSign?: boolean }) =>
      formatReportingShort(amountCad, state.currency, options),
    [state.currency]
  );

  const formatOverviewMoney = useCallback(
    (amountCad: number, options?: { showSign?: boolean }) =>
      formatOverviewReportingCompact(amountCad, state.currency, options),
    [state.currency]
  );

  const convertAmount = useCallback(
    (amountCad: number) => convertFromCad(amountCad, state.currency),
    [state.currency]
  );

  const appendNotification = useCallback(
    (
      prevList: AppNotification[],
      draft: {
        eventKey: string;
        title: string;
        description: string;
        category: NotificationCategory;
        route?: RoutePath;
        targetRecordId?: string;
        visibleToRoles?: UserRoleId[];
      }
    ): AppNotification[] => {
      if (prevList.some((n) => n.eventKey === draft.eventKey)) {
        return prevList;
      }
      const nextItem: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        eventKey: draft.eventKey,
        title: draft.title,
        description: draft.description,
        timestampIso: new Date().toISOString(),
        read: false,
        dismissed: false,
        category: draft.category,
        route: draft.route,
        targetRecordId: draft.targetRecordId,
        visibleToRoles: draft.visibleToRoles,
      };
      return [nextItem, ...prevList].slice(0, 50);
    },
    []
  );

  const visibleNotifications = useMemo(() => {
    return (state.notifications ?? []).filter((n) => {
      if (n.dismissed) return false;
      if (n.visibleToRoles && n.visibleToRoles.length > 0) {
        return n.visibleToRoles.includes(activeUser.roleId);
      }
      return true;
    });
  }, [activeUser.roleId, state.notifications]);

  const unreadNotificationCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read).length,
    [visibleNotifications]
  );

  const markNotificationRead = useCallback(
    (notificationId: string) => {
      persistState((prev) => ({
        ...prev,
        notifications: (prev.notifications ?? []).map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        ),
      }));
    },
    [persistState]
  );

  const markAllNotificationsRead = useCallback(() => {
    persistState((prev) => ({
      ...prev,
      notifications: (prev.notifications ?? []).map((n) => ({ ...n, read: true })),
    }));
  }, [persistState]);

  const dismissNotification = useCallback(
    (notificationId: string) => {
      persistState((prev) => ({
        ...prev,
        notifications: (prev.notifications ?? []).map((n) =>
          n.id === notificationId ? { ...n, dismissed: true, read: true } : n
        ),
      }));
    },
    [persistState]
  );

  const clearAllNotifications = useCallback(() => {
    persistState((prev) => ({
      ...prev,
      notifications: (prev.notifications ?? []).map((n) => ({ ...n, dismissed: true, read: true })),
    }));
  }, [persistState]);

  const scopedIrregularCosts = useMemo(
    () => filterIrregularCostsForUser(activeUser, IRREGULAR_COSTS),
    [activeUser]
  );

  const scopedCustomsEntries = useMemo(
    () => filterCustomsEntriesForUser(activeUser, CUSTOMS_ENTRIES),
    [activeUser]
  );

  const allWalkEntries = useMemo(
    () => OPERATING_EARNINGS_WALKS.flatMap((w) => w.entries),
    []
  );

  const ruleEvaluations = useMemo(
    () =>
      evaluateBusinessRules({
        rules: state.businessRules,
        irregularCosts: scopedIrregularCosts,
        walkEntries: allWalkEntries,
        customsEntries: scopedCustomsEntries,
        domesticRecords: DOMESTIC_SHIPMENT_RECORDS,
      }),
    [state.businessRules, scopedIrregularCosts, allWalkEntries, scopedCustomsEntries]
  );

  const groupedAlerts = useMemo(
    () => groupRuleEvaluationsByRecord(ruleEvaluations),
    [ruleEvaluations]
  );

  const authorizedAnalytics = useMemo(() => {
    const ledgerTotalCad = fromMinorCents(
      state.uploadedLedgerTransactions.reduce((s, r) => s + toMinorCents(r.amountCad), 0)
    );
    const ledgerSelectedPeriodCad = fromMinorCents(
      state.uploadedLedgerTransactions
        .filter((r) => r.accountingPeriod === state.selectedQuarterId)
        .filter((r) => state.selectedRegionId === 'all' || r.regionId === state.selectedRegionId)
        .reduce((s, r) => s + toMinorCents(r.amountCad), 0)
    );

    const customsGoodsValueCad = fromMinorCents(
      state.uploadedCustomsRecords.reduce((s, r) => s + toMinorCents(r.goodsValueCad), 0)
    );
    const customsDutyCad = fromMinorCents(
      state.uploadedCustomsRecords.reduce((s, r) => s + toMinorCents(r.actualDutyCad), 0)
    );
    const customsBrokerFeeCad = fromMinorCents(
      state.uploadedCustomsRecords.reduce((s, r) => s + toMinorCents(r.actualBrokerFeeCad), 0)
    );
    const customsBrokerVarianceCad = fromMinorCents(
      state.uploadedCustomsRecords.reduce((s, r) => s + toMinorCents(r.brokerVarianceCad), 0)
    );
    const customsTotalCostCad = fromMinorCents(toMinorCents(customsDutyCad) + toMinorCents(customsBrokerFeeCad));
    const customsSelectedPeriodCad = fromMinorCents(
      state.uploadedCustomsRecords
        .filter((r) => r.accountingPeriod === state.selectedQuarterId)
        .reduce((s, r) => s + toMinorCents(r.actualDutyCad) + toMinorCents(r.actualBrokerFeeCad), 0)
    );
    const openQuarantinedCount = state.reviewQueueItems.filter(
      (i) => i.reviewStatus !== 'Approved' && i.reviewStatus !== 'Rejected' && i.reviewStatus !== 'Resolved'
    ).length;

    return {
      ledgerCount: state.uploadedLedgerTransactions.length,
      ledgerTotalCad,
      ledgerSelectedPeriodCad,
      customsCount: state.uploadedCustomsRecords.length,
      customsGoodsValueCad,
      customsDutyCad,
      customsBrokerFeeCad,
      customsBrokerVarianceCad,
      customsTotalCostCad,
      combinedUploadedSelectedPeriodCad: fromMinorCents(
        toMinorCents(ledgerSelectedPeriodCad) + toMinorCents(customsSelectedPeriodCad)
      ),
      openQuarantinedCount,
    };
  }, [
    state.uploadedLedgerTransactions,
    state.uploadedCustomsRecords,
    state.reviewQueueItems,
    state.selectedQuarterId,
    state.selectedRegionId,
  ]);

  const sendEntriesToSimulator = useCallback(
    (entryIds: string[]) => {
      if (!canPerformAction(activeUser, 'run_tariff_simulator')) {
        setActionBanner({
          type: 'warning',
          message: 'Tariff Simulator requires Customs & Trade Coordinator or Group Controller role.',
        });
        return;
      }
      setSimulatorPresetEntryIds(entryIds.length > 0 ? entryIds : ['E-04', 'E-05', 'E-06']);
      setDrawerRecord(null);
      navigate('/simulator');
    },
    [activeUser, navigate]
  );

  const saveScenario = useCallback(
    (
      scenarioInput: Omit<SavedScenario, 'id' | 'createdAtIso' | 'createdByUserId' | 'provenance'>
    ): SavedScenario | null => {
      if (!canPerformAction(activeUser, 'save_tariff_scenario')) {
        setActionBanner({
          type: 'warning',
          message: 'Only Customs & Trade Coordinator (Marco Silva) or Group Controller (Helen Park) may save tariff scenarios.',
        });
        return null;
      }
      const created: SavedScenario = {
        ...scenarioInput,
        id: `scen-${Date.now()}`,
        createdAtIso: new Date().toISOString(),
        createdByUserId: activeUser.id,
        provenance: 'hypothetical_scenario',
      };
      persistState((prev) => ({
        ...prev,
        savedScenarios: [created, ...prev.savedScenarios],
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'scenario_saved',
            `Saved hypothetical tariff scenario "${created.name}" (${created.chinaTariffRatePct}% across ${created.selectedEntryIds.length} entries; historical records untouched).`,
            created.id
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({
        type: 'success',
        message: `Scenario "${created.name}" saved to shared repository.`,
      });
      return created;
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const deleteScenario = useCallback(
    (scenarioId: string) => {
      if (!canPerformAction(activeUser, 'save_tariff_scenario')) {
        setActionBanner({
          type: 'warning',
          message: 'Your current role does not have permission to delete saved scenarios.',
        });
        return;
      }
      const target = state.savedScenarios.find((s) => s.id === scenarioId);
      persistState((prev) => ({
        ...prev,
        savedScenarios: prev.savedScenarios.filter((s) => s.id !== scenarioId),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'scenario_deleted',
            `Deleted saved scenario "${target?.name ?? scenarioId}".`,
            scenarioId
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({
        type: 'info',
        message: `Removed scenario "${target?.name ?? scenarioId}".`,
      });
    },
    [activeUser, buildAuditEvent, persistState, state.savedScenarios]
  );

  const openRecordById = useCallback(
    (recordId: string): boolean => {
      const ir = scopedIrregularCosts.find((c) => c.id.toUpperCase() === recordId.toUpperCase());
      if (ir) {
        setDrawerRecord({ type: 'irregular_cost', record: ir });
        return true;
      }
      const cust = scopedCustomsEntries.find((e) => e.id.toUpperCase() === recordId.toUpperCase());
      if (cust) {
        setDrawerRecord({ type: 'customs_entry', record: cust });
        return true;
      }
      const upLed = state.uploadedLedgerTransactions.find(
        (t) => t.transactionId.toUpperCase() === recordId.toUpperCase()
      );
      if (upLed) {
        setDrawerRecord({ type: 'uploaded_ledger', record: upLed });
        return true;
      }
      const upCust = state.uploadedCustomsRecords.find(
        (c) => c.entryId.toUpperCase() === recordId.toUpperCase()
      );
      if (upCust) {
        setDrawerRecord({ type: 'uploaded_customs', record: upCust });
        return true;
      }
      return false;
    },
    [scopedCustomsEntries, scopedIrregularCosts, state.uploadedCustomsRecords, state.uploadedLedgerTransactions]
  );

  const updateInvestigationStatus = useCallback(
    (linkedRecordId: string, status: InvestigationStatus) => {
      const targetCost = IRREGULAR_COSTS.find((c) => c.id === linkedRecordId);
      const allowed = targetCost
        ? canManageRecordInvestigation(activeUser, targetCost)
        : canPerformAction(activeUser, 'manage_investigations') ||
          canPerformAction(activeUser, 'manage_trade_investigations');
      if (!allowed) {
        setActionBanner({
          type: 'warning',
          message: 'Your current role does not have edit permission for this investigation.',
        });
        return;
      }
      const mappedWorkflow = mapLegacyToWorkflowStatus(status);
      persistState((prev) => ({
        ...prev,
        investigations: prev.investigations.map((inv) =>
          inv.linkedRecordId === linkedRecordId
            ? { ...inv, status, workflowStatus: mappedWorkflow, updatedAtIso: new Date().toISOString() }
            : inv
        ),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'investigation_status_updated',
            `Updated demonstration investigation state for ${linkedRecordId} to ${mappedWorkflow}.`,
            linkedRecordId,
            { newState: mappedWorkflow }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const updateInvestigationWorkflow = useCallback(
    (
      investigationId: string,
      params: {
        workflowStatus?: InvestigationWorkflowStatus;
        ownerUserId?: string;
        dismissalReason?: string;
        notes?: string;
        aiBrief?: AiInvestigationBrief;
      }
    ): { ok: boolean; message: string } => {
      const inv = state.investigations.find((i) => i.id === investigationId || i.linkedRecordId === investigationId);
      if (!inv) return { ok: false, message: 'Investigation not found.' };

      const targetCost = IRREGULAR_COSTS.find((c) => c.id === inv.linkedRecordId);
      const isTradeScoped =
        inv.linkedRecordType === 'customs_entry' ||
        inv.department === 'Customs and Trade' ||
        inv.department === 'Logistics';
      const allowed = targetCost
        ? canManageRecordInvestigation(activeUser, targetCost)
        : canPerformAction(activeUser, 'manage_investigations') ||
          (isTradeScoped && canPerformAction(activeUser, 'manage_trade_investigations'));

      if (!allowed) {
        const msg = 'Your active role does not have permission to update this investigation.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      if (params.workflowStatus === 'Dismissed with Reason' && !params.dismissalReason?.trim()) {
        const msg = 'A documented reason is required when dismissing an investigation.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      const nowIso = new Date().toISOString();
      const nextWorkflow = params.workflowStatus ?? inv.workflowStatus;
      const nextLegacy = mapWorkflowToLegacyStatus(nextWorkflow);
      const actionType: AuditEvent['actionType'] =
        params.workflowStatus === 'Dismissed with Reason'
          ? 'investigation_dismissed'
          : params.ownerUserId && params.ownerUserId !== inv.ownerUserId
            ? 'investigation_assigned'
            : 'investigation_status_updated';

      persistState((prev) => ({
        ...prev,
        investigations: prev.investigations.map((item) =>
          item.id === inv.id
            ? {
                ...item,
                workflowStatus: nextWorkflow,
                status: nextLegacy,
                ownerUserId: params.ownerUserId ?? item.ownerUserId,
                dismissalReason: params.dismissalReason ?? item.dismissalReason,
                notes: params.notes !== undefined ? params.notes : item.notes,
                aiBrief: params.aiBrief ?? item.aiBrief,
                updatedAtIso: nowIso,
              }
            : item
        ),
        notifications:
          params.workflowStatus || (params.ownerUserId && params.ownerUserId !== inv.ownerUserId)
            ? appendNotification(prev.notifications ?? [], {
                eventKey: `inv-${inv.id}-${nextWorkflow}-${params.ownerUserId ?? inv.ownerUserId}-${nowIso.slice(0, 16)}`,
                title: `Investigation updated: ${inv.linkedRecordId}`,
                description:
                  params.ownerUserId && params.ownerUserId !== inv.ownerUserId
                    ? `Assigned to ${DEMO_USERS.find((u) => u.id === params.ownerUserId)?.name ?? 'team member'} (${nextWorkflow}).`
                    : `Status changed from ${inv.workflowStatus} to ${nextWorkflow}.`,
                category: 'investigations',
                route: '/investigations',
                targetRecordId: inv.linkedRecordId,
                visibleToRoles: isTradeScoped
                  ? ['controller', 'cost_accountant', 'trade_coordinator']
                  : ['controller', 'cost_accountant'],
              })
            : prev.notifications ?? [],
        auditEvents: [
          buildAuditEvent(
            activeUser,
            actionType,
            params.aiBrief && !params.workflowStatus
              ? `Generated AI Investigation Brief for ${inv.linkedRecordId} (${params.aiBrief.modelName}).`
              : `Investigation ${inv.linkedRecordId} updated (${inv.workflowStatus} → ${nextWorkflow}).`,
            inv.linkedRecordId,
            {
              previousState: inv.workflowStatus,
              newState: nextWorkflow,
              reason: params.dismissalReason?.trim() || undefined,
            }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));

      return { ok: true, message: `Updated investigation ${inv.linkedRecordId}.` };
    },
    [activeUser, appendNotification, buildAuditEvent, persistState, state.investigations]
  );

  const promoteQuarantinedToInvestigation = useCallback(
    (reviewItemId: string): { ok: boolean; message: string; investigation?: Investigation } => {
      const qItem = state.reviewQueueItems.find((q) => q.id === reviewItemId);
      if (!qItem) return { ok: false, message: 'Quarantined record not found.' };

      const existing = state.investigations.find((i) => i.linkedRecordId === qItem.stableRecordId);
      if (existing) {
        return {
          ok: true,
          message: `Linked existing investigation for ${qItem.stableRecordId} (no duplicate created).`,
          investigation: existing,
        };
      }

      if (!canPerformAction(activeUser, 'review_quarantined_records')) {
        return { ok: false, message: 'Role restricted from creating investigations from quarantined records.' };
      }

      const newInv: Investigation = {
        id: `inv-${qItem.stableRecordId.toLowerCase()}`,
        linkedRecordType: 'quarantined_record',
        linkedRecordId: qItem.stableRecordId,
        title: `${qItem.stableRecordId}: Quarantined ${qItem.schemaType === 'customs_shipments' ? 'Customs Shipment' : 'Ledger Transaction'}`,
        ownerUserId: qItem.assignedReviewerId ?? activeUser.id,
        regionId: 'north_america',
        department: qItem.department,
        exposureCad: qItem.amountCad,
        priority: qItem.highestSeverity === 'high' ? 'High' : 'Medium',
        status: 'demo_in_review',
        workflowStatus: 'In Review',
        ruleCodes: qItem.ruleResults.map((r) => r.ruleCode),
        notes: qItem.reasons.join(' | '),
        updatedAtIso: new Date().toISOString(),
        provenance: 'user_uploaded',
      };

      persistState((prev) => ({
        ...prev,
        investigations: [newInv, ...prev.investigations],
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'investigation_status_updated',
            `Created unified investigation ${newInv.id} from Data Gateway quarantined record ${qItem.stableRecordId}.`,
            qItem.stableRecordId,
            { batchId: qItem.batchId, newState: 'In Review' }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));

      return { ok: true, message: `Opened investigation for ${qItem.stableRecordId}.`, investigation: newInv };
    },
    [activeUser, buildAuditEvent, persistState, state.investigations, state.reviewQueueItems]
  );

  const saveAiInvestigationNote = useCallback(
    (linkedRecordId: string, brief: AiInvestigationBrief): { ok: boolean; message: string } => {
      if (!canPerformAction(activeUser, 'submit_correction_request')) {
        return { ok: false, message: 'Current role cannot save evidence notes.' };
      }
      const note: SupportingEvidence = {
        id: `ev-ai-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        linkedRecordId,
        linkedEntityType: linkedRecordId.startsWith('E-') ? 'customs_entry' : 'irregular_cost',
        title: `[AI-Assisted Brief · ${brief.modelName}] Investigation Analysis`,
        evidenceType: 'demo_note',
        sourceType: 'note',
        persistenceScope: 'metadata_only_local_demo',
        status: 'pending_verification',
        uploadedByUserId: activeUser.id,
        createdAtIso: new Date().toISOString(),
        summary: `UNVERIFIED AI INTERPRETATION — Summary: ${brief.executiveSummary} | Missing Info: ${brief.missingInformation.join('; ') || 'None noted'} | Next Steps: ${brief.recommendedSteps.slice(0, 2).join('; ')}`,
        provenance: 'demonstration_state',
      };

      persistState((prev) => ({
        ...prev,
        evidence: [note, ...prev.evidence],
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'ai_investigation_note_saved',
            `Saved AI-assisted investigation note for ${linkedRecordId} (${brief.modelName}; underlying financial record & approval status unchanged).`,
            linkedRecordId,
            { reason: brief.executiveSummary }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));

      setActionBanner({
        type: 'success',
        message: `Saved AI analysis note to ${linkedRecordId} evidence trail (unverified until human review).`,
      });
      return { ok: true, message: 'AI note saved to evidence trail.' };
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const updateCostOpportunity = useCallback(
    (params: {
      opportunityId: string;
      status: OpportunityWorkflowStatus;
      verifiedAmountCad: number;
      realizedAmountCad: number;
      resolutionNote: string;
    }): { ok: boolean; message: string } => {
      if (
        !canPerformAction(activeUser, 'manage_investigations') &&
        !canPerformAction(activeUser, 'manage_trade_investigations')
      ) {
        const msg = 'Your active role does not have permission to modify Cost Opportunity status.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }
      if ((params.status === 'Realized' || params.status === 'Rejected') && !params.resolutionNote.trim()) {
        const msg = 'Documented evidence/rationale is required before marking an opportunity Realized or Rejected.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }
      if (params.status === 'Realized' && !canPerformAction(activeUser, 'approve_material_correction')) {
        const msg = 'Confirming Realized financial savings requires Group Controller (Helen Park).';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      const nowIso = new Date().toISOString();
      persistState((prev) => {
        const others = (prev.opportunityOverrides ?? []).filter(
          (o) => o.opportunityId !== params.opportunityId
        );
        return {
          ...prev,
          opportunityOverrides: [
            {
              opportunityId: params.opportunityId,
              status: params.status,
              verifiedAmountCad: params.verifiedAmountCad,
              realizedAmountCad: params.realizedAmountCad,
              resolutionNote: params.resolutionNote.trim(),
              updatedByUserId: activeUser.id,
              updatedAtIso: nowIso,
            },
            ...others,
          ],
          auditEvents: [
            buildAuditEvent(
              activeUser,
              'opportunity_updated',
              `Updated opportunity ${params.opportunityId} to ${params.status} (Verified: ${formatCad(params.verifiedAmountCad)}, Realized: ${formatCad(params.realizedAmountCad)}).`,
              params.opportunityId,
              { newState: params.status, reason: params.resolutionNote.trim() }
            ),
            ...prev.auditEvents,
          ].slice(0, 200),
        };
      });

      setActionBanner({
        type: 'success',
        message: `Opportunity updated to ${params.status}.`,
      });
      return { ok: true, message: `Updated opportunity to ${params.status}.` };
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const recordAiAuditEvent = useCallback(
    (
      actionType:
        | 'ai_query_executed'
        | 'ai_briefing_generated'
        | 'ai_gateway_assist_used'
        | 'ai_evidence_extracted'
        | 'ai_report_summary_generated',
      summary: string,
      targetRecordId?: string
    ) => {
      persistState((prev) => ({
        ...prev,
        auditEvents: [
          buildAuditEvent(activeUser, actionType, summary, targetRecordId),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const openReportStudioWithPreset = useCallback(
    (preset: ReportLaunchPreset) => {
      if (!canPerformAction(activeUser, 'generate_reports')) {
        setActionBanner({
          type: 'warning',
          message: `Report Studio is restricted for ${activeUser.title}.`,
        });
        return;
      }
      setReportPreset(preset);
      setDrawerRecord(null);
      navigate('/reports');
    },
    [activeUser, navigate]
  );

  const saveReportConfig = useCallback(
    (config: ReportConfiguration): ReportConfiguration | null => {
      if (!canPerformAction(activeUser, 'generate_reports')) {
        setActionBanner({
          type: 'warning',
          message: `Active role (${activeUser.title}) does not have permission to save reports.`,
        });
        return null;
      }
      const nowIso = new Date().toISOString();
      const saved: ReportConfiguration = {
        ...config,
        id: config.id || `rep-${Date.now()}`,
        modifiedAtIso: nowIso,
        configMode: 'live_configuration',
        status: 'saved',
      };
      persistState((prev) => {
        const exists = (prev.savedReports ?? []).some((r) => r.id === saved.id);
        const nextReports = exists
          ? prev.savedReports.map((r) => (r.id === saved.id ? saved : r))
          : [saved, ...(prev.savedReports ?? [])];
        return {
          ...prev,
          savedReports: nextReports,
          auditEvents: [
            buildAuditEvent(
              activeUser,
              'report_saved',
              `Saved live report configuration "${saved.title}" (${saved.reportingPeriod}, ${saved.includedSections.length} sections, scope: ${saved.datasetScope}).`,
              saved.id
            ),
            ...prev.auditEvents,
          ].slice(0, 200),
        };
      });
      setActionBanner({
        type: 'success',
        message: `Saved report configuration "${saved.title}".`,
      });
      return saved;
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const duplicateReportConfig = useCallback(
    (reportId: string): ReportConfiguration | null => {
      if (!canPerformAction(activeUser, 'generate_reports')) return null;
      const source = (state.savedReports ?? []).find((r) => r.id === reportId);
      if (!source) return null;
      const nowIso = new Date().toISOString();
      const copy: ReportConfiguration = {
        ...source,
        id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: `${source.title} (Copy)`,
        ownerUserId: activeUser.id,
        authorName: `${activeUser.name} (${activeUser.title})`,
        createdAtIso: nowIso,
        modifiedAtIso: nowIso,
        lastGeneratedAtIso: undefined,
        status: 'saved',
      };
      persistState((prev) => ({
        ...prev,
        savedReports: [copy, ...(prev.savedReports ?? [])],
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'report_duplicated',
            `Duplicated report configuration "${source.title}" -> "${copy.title}".`,
            copy.id
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({ type: 'success', message: `Duplicated report "${copy.title}".` });
      return copy;
    },
    [activeUser, buildAuditEvent, persistState, state.savedReports]
  );

  const deleteReportConfig = useCallback(
    (reportId: string): boolean => {
      if (!canPerformAction(activeUser, 'generate_reports')) return false;
      const target = (state.savedReports ?? []).find((r) => r.id === reportId);
      if (!target) return false;
      persistState((prev) => ({
        ...prev,
        savedReports: (prev.savedReports ?? []).filter((r) => r.id !== reportId),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'report_deleted',
            `Deleted saved report configuration "${target.title}".`,
            reportId
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({ type: 'info', message: `Deleted saved report "${target.title}".` });
      return true;
    },
    [activeUser, buildAuditEvent, persistState, state.savedReports]
  );

  const recordReportExport = useCallback(
    (params: {
      config: ReportConfiguration;
      format: ReportExportFormat;
      fileName: string;
      slideCount?: number;
      byteSize?: number;
      downloadTriggered: boolean;
      outcomeNote: string;
      sourceRecordRefs: string[];
      headlineMetrics: { label: string; value: string }[];
      failed?: boolean;
    }) => {
      const nowIso = new Date().toISOString();
      const snapId = !params.failed ? `snap-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` : undefined;
      const roleLabel = getRoleDefinition(activeUser.roleId).label;

      const snapshot: ReportSnapshotRecord | null = !params.failed && snapId
        ? {
            id: snapId,
            reportId: params.config.id,
            reportTitle: params.config.title,
            templateId: params.config.templateId,
            reportingPeriod: params.config.reportingPeriod,
            comparisonPeriod: params.config.comparisonPeriod,
            regionFilter: params.config.regionFilter,
            departmentFilter: params.config.departmentFilter,
            datasetScope: params.config.datasetScope,
            includedSections: params.config.includedSections,
            exportFormat: params.format,
            generatedByUserId: activeUser.id,
            generatedByName: activeUser.name,
            generatedAtIso: nowIso,
            sourceRecordRefs: params.sourceRecordRefs,
            headlineMetrics: params.headlineMetrics,
            snapshotType: 'export_snapshot',
          }
        : null;

      const historyItem: ReportExportHistoryRecord = {
        id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        reportId: params.config.id,
        reportTitle: params.config.title,
        format: params.format,
        fileName: params.fileName,
        generatedByUserId: activeUser.id,
        generatedByName: activeUser.name,
        generatedByRoleLabel: roleLabel,
        generatedAtIso: nowIso,
        reportingPeriod: params.config.reportingPeriod,
        datasetScope: params.config.datasetScope,
        selectedSections: params.config.includedSections,
        slideCount: params.slideCount,
        byteSize: params.byteSize,
        outcome: params.failed ? 'generation_failed' : 'generated_browser_download_triggered',
        outcomeNote: params.outcomeNote,
        snapshotId: snapId,
      };

      persistState((prev) => ({
        ...prev,
        savedReports: (prev.savedReports ?? []).map((r) =>
          r.id === params.config.id ? { ...r, lastGeneratedAtIso: nowIso } : r
        ),
        reportSnapshots: snapshot ? [snapshot, ...(prev.reportSnapshots ?? [])].slice(0, 60) : (prev.reportSnapshots ?? []),
        exportHistory: [historyItem, ...(prev.exportHistory ?? [])].slice(0, 100),
        notifications: appendNotification(prev.notifications ?? [], {
          eventKey: `report-export-${historyItem.id}`,
          title: params.failed
            ? `Report export failed: ${params.config.title}`
            : `Report exported: ${params.config.title}`,
          description: `${params.format.toUpperCase()} (${params.fileName}) · ${params.config.reportingPeriod}`,
          category: 'reports',
          route: '/reports',
          visibleToRoles: ['controller', 'cost_accountant', 'trade_coordinator'],
        }),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'report_exported',
            `${params.failed ? 'Failed' : 'Generated'} ${params.format.toUpperCase()} export "${params.fileName}" for report "${params.config.title}" (${params.config.reportingPeriod}; ${params.config.includedSections.length} sections).`,
            params.config.id,
            { newState: historyItem.outcome, reason: params.outcomeNote }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
    },
    [activeUser, appendNotification, buildAuditEvent, persistState]
  );

  const addSupportingEvidence = useCallback(
    (input: AddEvidenceInput): { ok: boolean; message: string } => {
      if (!input.title.trim() || !input.summary.trim()) {
        return { ok: false, message: 'Evidence title and summary are required.' };
      }
      const evType: SupportingEvidence['evidenceType'] =
        input.sourceType && input.sourceType !== 'note' && input.sourceType !== 'reference'
          ? 'uploaded_attachment'
          : 'demo_note';

      const note: SupportingEvidence = {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        linkedRecordId: input.linkedRecordId,
        linkedEntityType: input.linkedEntityType,
        title: input.title.trim(),
        evidenceType: evType,
        sourceType: input.sourceType ?? 'note',
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        persistenceScope:
          input.persistenceScope ??
          (input.fileName ? 'metadata_only_local_demo' : 'case_reference'),
        status: 'pending_verification',
        uploadedByUserId: activeUser.id,
        createdAtIso: new Date().toISOString(),
        summary: input.summary.trim(),
        provenance: 'demonstration_state',
      };
      persistState((prev) => ({
        ...prev,
        evidence: [note, ...prev.evidence],
        notifications: appendNotification(prev.notifications ?? [], {
          eventKey: `evidence-${note.id}`,
          title: `Evidence attached to ${input.linkedRecordId}`,
          description: `"${note.title}" added by ${activeUser.name} for review.`,
          category: 'investigations',
          route: '/investigations',
          targetRecordId: input.linkedRecordId,
          visibleToRoles: ['controller', 'cost_accountant', 'trade_coordinator'],
        }),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'evidence_added',
            `Attached supporting evidence "${note.title}" (${note.sourceType}${note.fileName ? ` · ${note.fileName}` : ''}) on ${input.linkedRecordId}.`,
            input.linkedRecordId,
            {
              newState: 'pending_verification',
              reason: note.summary,
            }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({
        type: 'success',
        message: `Supporting evidence "${note.title}" linked to ${input.linkedRecordId}.`,
      });
      return { ok: true, message: 'Supporting evidence recorded.' };
    },
    [activeUser, appendNotification, buildAuditEvent, persistState]
  );

  const addEvidenceNote = useCallback(
    (linkedRecordId: string, title: string, summary: string) => {
      addSupportingEvidence({
        linkedRecordId,
        linkedEntityType: linkedRecordId.startsWith('E-') ? 'customs_entry' : 'irregular_cost',
        title,
        summary,
        sourceType: 'note',
        persistenceScope: 'metadata_only_local_demo',
      });
    },
    [addSupportingEvidence]
  );

  const createGovernanceRequest = useCallback(
    (input: CreateGovernanceRequestInput): { ok: boolean; message: string; request?: ApprovalRequest } => {
      if (!canPerformAction(activeUser, 'submit_correction_request')) {
        return { ok: false, message: 'Current role cannot submit governance requests.' };
      }
      if (!input.title.trim() || !input.rationale.trim()) {
        return { ok: false, message: 'Request title and rationale are required.' };
      }
      const stepsCount = input.requiredApprovalsCount ?? 1;
      const history: ApprovalStepRecord[] =
        stepsCount > 1
          ? [
              {
                stepNumber: 1,
                stepLabel: 'Step 1 · Specialist Accounting Review',
                requiredRoleLabel: 'Cost Accountant (Dana Morales)',
              },
              {
                stepNumber: 2,
                stepLabel: 'Step 2 · Operations / Trade Confirmation',
                requiredRoleLabel: 'Customs & Trade Coordinator (Marco Silva)',
              },
              {
                stepNumber: 3,
                stepLabel: 'Step 3 · Final Controller Authorization',
                requiredRoleLabel: 'Group Controller (Helen Park)',
              },
            ].slice(0, stepsCount)
          : [
              {
                stepNumber: 1,
                stepLabel: 'Step 1 · Authorized Reviewer Sign-Off',
                requiredRoleLabel:
                  input.requestType === 'broker_discrepancy'
                    ? 'Trade Coordinator or Group Controller'
                    : 'Group Controller (Helen Park)',
              },
            ];

      const nowIso = new Date().toISOString();
      const req: ApprovalRequest = {
        id: `apr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        linkedRecordId: input.linkedRecordId,
        batchId: input.batchId,
        requestType: input.requestType,
        title: input.title.trim(),
        requestedByUserId: activeUser.id,
        assignedReviewerId:
          input.requestType === 'broker_discrepancy' ? 'user-marco-silva' : 'user-helen-park',
        amountCad: input.amountCad,
        isMaterial: Math.abs(input.amountCad) >= 250_000,
        status: 'demo_pending_controller',
        workflowStatus: 'Submitted',
        resolutionStatus: 'Open',
        requiredApprovalsCount: stepsCount,
        approvalsHistory: history,
        rationale: input.rationale.trim(),
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        provenance: 'demonstration_state',
      };

      persistState((prev) => ({
        ...prev,
        approvalRequests: [req, ...prev.approvalRequests],
        notifications: appendNotification(prev.notifications ?? [], {
          eventKey: `apr-req-${req.id}`,
          title: `Approval requested: ${req.title}`,
          description: `Submitted by ${activeUser.name} for ${req.linkedRecordId} (${formatReportingMoney(req.amountCad, prev.currency ?? 'CAD')}).`,
          category: 'approvals',
          route: '/approvals',
          targetRecordId: req.linkedRecordId,
        }),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'correction_requested',
            `Submitted ${input.requestType.replace(/_/g, ' ')} request "${req.title}" for ${req.linkedRecordId} (${formatCad(req.amountCad)}); official Appendix case data remains unaltered.`,
            req.linkedRecordId,
            {
              batchId: input.batchId,
              newState: 'Submitted',
              reason: req.rationale,
            }
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
      setActionBanner({
        type: 'success',
        message: `Governance request "${req.title}" routed to Approvals.`,
      });
      return { ok: true, message: 'Governance request submitted.', request: req };
    },
    [activeUser, appendNotification, buildAuditEvent, persistState]
  );

  const submitCorrectionRequest = useCallback(
    (linkedRecordId: string, title: string, amountCad: number, rationale: string) => {
      createGovernanceRequest({
        linkedRecordId,
        requestType: 'financial_correction',
        title,
        amountCad,
        rationale,
      });
    },
    [createGovernanceRequest]
  );

  const commitBatchValidatedRecords = useCallback(
    (
      prev: PersistedWorkspaceState,
      batch: ImportBatch,
      authorizer: User,
      reason?: string
    ): {
      nextState: PersistedWorkspaceState;
      committedCount: number;
      skippedDuplicateCount: number;
      authRef: string;
    } => {
      const nowIso = new Date().toISOString();
      const authRef = `AUTH-${batch.id.slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;

      const existingLedgerIds = new Set([
        ...PARTIAL_LEDGER_TRANSACTIONS.map((t) => t.journalOrPostingRef.toUpperCase()),
        ...prev.uploadedLedgerTransactions.map((t) => t.transactionId.toUpperCase()),
      ]);
      const existingCustomsIds = new Set([
        ...CUSTOMS_ENTRIES.map((e) => e.id.toUpperCase()),
        ...prev.uploadedCustomsRecords.map((e) => e.entryId.toUpperCase()),
      ]);

      const newLedger: UploadedLedgerTransaction[] = [];
      const newCustoms: UploadedCustomsRecord[] = [];
      let skippedDuplicateCount = 0;

      const validated = batch.records.filter((r) => r.outcome === 'VALIDATED');
      for (const item of validated) {
        if (item.schemaType === 'ledger_transactions') {
          const idKey = item.stableRecordId.toUpperCase();
          if (existingLedgerIds.has(idKey)) {
            skippedDuplicateCount += 1;
            continue;
          }
          existingLedgerIds.add(idKey);
          newLedger.push(toUploadedLedgerTransaction(item, authorizer.id, nowIso));
        } else {
          const idKey = item.stableRecordId.toUpperCase();
          if (existingCustomsIds.has(idKey)) {
            skippedDuplicateCount += 1;
            continue;
          }
          existingCustomsIds.add(idKey);
          newCustoms.push(toUploadedCustomsRecord(item, authorizer.id, nowIso));
        }
      }

      const quarantinedItems = batch.records.filter((r) => r.outcome === 'QUARANTINED');
      const existingReviewIds = new Set(prev.reviewQueueItems.map((q) => q.id));
      const newReviewItems = quarantinedItems.filter((q) => !existingReviewIds.has(q.id));

      const committedCount = newLedger.length + newCustoms.length;
      const updatedBatches = prev.importBatches.map((b) =>
        b.id === batch.id
          ? {
              ...b,
              status: 'authorized_committed' as const,
              authorizedAtIso: nowIso,
              authorizedByUserId: authorizer.id,
            }
          : b
      );

      const updatedApprovals = prev.approvalRequests.map((req) =>
        req.batchId === batch.id && req.requestType === 'import_authorization'
          ? {
              ...req,
              status: 'demo_approved' as const,
              workflowStatus: 'Approved' as const,
              resolutionStatus: 'Resolved' as const,
              approverUserId: authorizer.id,
              decisionReason: reason || 'Authorized validated batch records for inclusion in shared analytics.',
              updatedAtIso: nowIso,
            }
          : req
      );

      const auditEvent = buildAuditEvent(
        authorizer,
        'import_authorized',
        `Authorized batch "${batch.fileName}": committed ${committedCount} validated record(s) (${formatCad(batch.acceptedTotalCad)}); excluded ${batch.quarantinedCount} quarantined and ${batch.rejectedCount} rejected record(s)${skippedDuplicateCount > 0 ? `; skipped ${skippedDuplicateCount} already-committed ID(s)` : ''}.`,
        batch.id,
        {
          batchId: batch.id,
          previousState: batch.status,
          newState: 'authorized_committed',
          authorizationRef: authRef,
          reason: reason || 'Controller authorization of validated batch records.',
        }
      );

      return {
        committedCount,
        skippedDuplicateCount,
        authRef,
        nextState: {
          ...prev,
          importBatches: updatedBatches,
          uploadedLedgerTransactions: [...newLedger, ...prev.uploadedLedgerTransactions],
          uploadedCustomsRecords: [...newCustoms, ...prev.uploadedCustomsRecords],
          reviewQueueItems: [...newReviewItems, ...prev.reviewQueueItems],
          approvalRequests: updatedApprovals,
          notifications: appendNotification(prev.notifications ?? [], {
            eventKey: `batch-authorized-${batch.id}`,
            title: `Import authorized: ${batch.fileName}`,
            description: `${committedCount} validated record(s) committed to reporting totals.${batch.quarantinedCount > 0 ? ` ${batch.quarantinedCount} quarantined.` : ''}`,
            category: 'data_gateway',
            route: '/data-gateway',
            visibleToRoles: ['controller', 'cost_accountant', 'trade_coordinator'],
          }),
          auditEvents: [auditEvent, ...prev.auditEvents].slice(0, 200),
        },
      };
    },
    [appendNotification, buildAuditEvent]
  );

  const recordStagedBatch = useCallback(
    (batch: ImportBatch) => {
      persistState((prev) => {
        const events: AuditEvent[] = [];
        if (batch.rejectedCount > 0 || batch.status === 'rejected') {
          events.push(
            buildAuditEvent(
              activeUser,
              'record_rejected',
              batch.records.length === 0
                ? `Rejected upload "${batch.fileName}": ${batch.fileErrors[0] ?? batch.classificationReason}`
                : `Rejected ${batch.rejectedCount} row(s) in "${batch.fileName}" due to schema/field errors or duplicate IDs.`,
              batch.id,
              {
                actorType: 'system',
                batchId: batch.id,
                newState: 'REJECTED',
                reason: batch.fileErrors[0] ?? 'Validation blocking rules failed.',
              }
            )
          );
        }
        if (batch.quarantinedCount > 0) {
          events.push(
            buildAuditEvent(
              activeUser,
              'record_quarantined',
              `Quarantined ${batch.quarantinedCount} record(s) in "${batch.fileName}" for governance review (excluded from trusted reporting).`,
              batch.id,
              {
                actorType: 'system',
                batchId: batch.id,
                newState: 'QUARANTINED',
                reason: 'One or more Business Rules A–H or existing ID conflicts triggered.',
              }
            )
          );
        }
        events.push(
          buildAuditEvent(
            activeUser,
            'validation_completed',
            `Validated "${batch.fileName}" (${batch.schemaType}): ${batch.validatedCount} validated, ${batch.quarantinedCount} quarantined, ${batch.rejectedCount} rejected.`,
            batch.id,
            {
              actorType: 'system',
              batchId: batch.id,
              newState: batch.status,
            }
          )
        );
        events.push(
          buildAuditEvent(
            activeUser,
            'file_uploaded',
            `Staged file "${batch.fileName}" (${batch.recordCount} rows, ${batch.fileType.toUpperCase()}) in Data Gateway.`,
            batch.id,
            {
              actorType: 'user',
              batchId: batch.id,
              newState: 'staged_preview',
            }
          )
        );

        const withoutSame = prev.importBatches.filter((b) => b.id !== batch.id);
        let nextNotifs = prev.notifications ?? [];
        if (batch.status === 'rejected' || (batch.records.length === 0 && batch.fileErrors.length > 0)) {
          nextNotifs = appendNotification(nextNotifs, {
            eventKey: `batch-rejected-${batch.id}`,
            title: `Import failed: ${batch.fileName}`,
            description: batch.fileErrors[0] ?? 'File rejected during schema validation.',
            category: 'data_gateway',
            route: '/data-gateway',
          });
        } else if (batch.quarantinedCount > 0) {
          nextNotifs = appendNotification(nextNotifs, {
            eventKey: `batch-quarantined-${batch.id}`,
            title: `Quarantined records in ${batch.fileName}`,
            description: `${batch.quarantinedCount} record(s) require review; ${batch.validatedCount} passed validation.`,
            category: 'data_gateway',
            route: '/data-gateway',
          });
        } else {
          nextNotifs = appendNotification(nextNotifs, {
            eventKey: `batch-imported-${batch.id}`,
            title: `File imported: ${batch.fileName}`,
            description: `${batch.validatedCount} validated record(s) ready for authorization.`,
            category: 'data_gateway',
            route: '/data-gateway',
          });
        }

        return {
          ...prev,
          importBatches: [batch, ...withoutSame].slice(0, 40),
          notifications: nextNotifs,
          auditEvents: [...events, ...prev.auditEvents].slice(0, 200),
        };
      });
    },
    [activeUser, appendNotification, buildAuditEvent, persistState]
  );

  const submitBatchForAuthorization = useCallback(
    (batchId: string): { ok: boolean; message: string } => {
      const batch = state.importBatches.find((b) => b.id === batchId);
      if (!batch) return { ok: false, message: 'Import batch not found.' };
      if (batch.authorizedAtIso || batch.status === 'authorized_committed') {
        return { ok: false, message: 'Batch is already authorized and committed.' };
      }
      if (batch.status === 'submitted_for_authorization') {
        return { ok: false, message: 'Batch has already been submitted for authorization.' };
      }

      const quarantinedItems = batch.records.filter((r) => r.outcome === 'QUARANTINED');
      const nowIso = new Date().toISOString();

      persistState((prev) => {
        const existingQueueIds = new Set(prev.reviewQueueItems.map((q) => q.id));
        const newQueueItems = quarantinedItems.filter((q) => !existingQueueIds.has(q.id));

        const nextApprovals = [...prev.approvalRequests];
        if (batch.validatedCount > 0) {
          const authReq: ApprovalRequest = {
            id: `apr-batch-${batch.id.slice(-6)}`,
            linkedRecordId: batch.id,
            batchId: batch.id,
            requestType: 'import_authorization',
            title: `Authorize Import Batch: ${batch.fileName} (${batch.validatedCount} validated rows)`,
            requestedByUserId: activeUser.id,
            assignedReviewerId: 'user-helen-park',
            amountCad: batch.acceptedTotalCad,
            isMaterial: batch.acceptedTotalCad >= 250_000,
            status: 'demo_pending_controller',
            workflowStatus: 'Submitted',
            resolutionStatus: 'Open',
            requiredApprovalsCount: 1,
            approvalsHistory: [
              {
                stepNumber: 1,
                stepLabel: 'Step 1 · Group Controller Import Authorization',
                requiredRoleLabel: 'Group Controller (Helen Park)',
              },
            ],
            rationale: `${batch.validatedCount} validated ${batch.targetDomain} rows totaling ${formatCad(batch.acceptedTotalCad)} awaiting Group Controller commit (${batch.quarantinedCount} quarantined rows routed to Review Queue).`,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
            provenance: 'demonstration_state',
          };
          nextApprovals.unshift(authReq);
        }

        const updatedBatches = prev.importBatches.map((b) =>
          b.id === batchId
            ? {
                ...b,
                status:
                  batch.validatedCount > 0
                    ? ('submitted_for_authorization' as const)
                    : ('quarantined' as const),
              }
            : b
        );

        const auditEv = buildAuditEvent(
          activeUser,
          'import_submitted',
          `Submitted batch "${batch.fileName}" (${batch.validatedCount} validated for Controller authorization; ${quarantinedItems.length} quarantined routed to Review Queue).`,
          batch.id,
          {
            batchId: batch.id,
            previousState: batch.status,
            newState: batch.validatedCount > 0 ? 'submitted_for_authorization' : 'quarantined',
          }
        );

        return {
          ...prev,
          importBatches: updatedBatches,
          reviewQueueItems: [...newQueueItems, ...prev.reviewQueueItems],
          approvalRequests: nextApprovals,
          notifications: appendNotification(prev.notifications ?? [], {
            eventKey: `batch-submitted-${batch.id}`,
            title: `Import submitted for authorization`,
            description:
              batch.validatedCount > 0
                ? `"${batch.fileName}" (${batch.validatedCount} validated rows) queued for Controller sign-off.`
                : `"${batch.fileName}" routed ${quarantinedItems.length} quarantined item(s) to Review Queue.`,
            category: 'data_gateway',
            route: batch.validatedCount > 0 ? '/approvals' : '/data-gateway',
          }),
          auditEvents: [auditEv, ...prev.auditEvents].slice(0, 200),
        };
      });

      setActionBanner({
        type: 'success',
        message:
          batch.validatedCount > 0
            ? `Submitted ${batch.validatedCount} validated rows to Controller Approvals and routed ${quarantinedItems.length} quarantined items to Review Queue.`
            : `Routed ${quarantinedItems.length} quarantined record(s) to Review Queue (0 validated rows to commit).`,
      });
      return { ok: true, message: 'Batch submitted.' };
    },
    [activeUser, appendNotification, buildAuditEvent, persistState, state.importBatches]
  );

  const authorizeAndCommitBatch = useCallback(
    (batchId: string, reason?: string): { ok: boolean; message: string; committedCount: number } => {
      if (!canPerformAction(activeUser, 'authorize_data_import')) {
        const msg = 'Unauthorized: only Group Controller (Helen Park) may authorize data imports into trusted reporting.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg, committedCount: 0 };
      }

      const batch = state.importBatches.find((b) => b.id === batchId);
      if (!batch) return { ok: false, message: 'Import batch not found.', committedCount: 0 };
      if (batch.authorizedAtIso || batch.status === 'authorized_committed') {
        const msg = `Batch "${batch.fileName}" has already been authorized and committed (idempotent guard).`;
        setActionBanner({ type: 'info', message: msg });
        return { ok: false, message: msg, committedCount: 0 };
      }
      if (batch.validatedCount === 0) {
        const msg = 'This batch has zero VALIDATED records to commit. Quarantined or rejected rows cannot be committed.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg, committedCount: 0 };
      }

      let resultCount = 0;
      let skippedCount = 0;
      persistState((prev) => {
        const freshBatch = prev.importBatches.find((b) => b.id === batchId) ?? batch;
        if (freshBatch.authorizedAtIso) return prev;
        const res = commitBatchValidatedRecords(prev, freshBatch, activeUser, reason);
        resultCount = res.committedCount;
        skippedCount = res.skippedDuplicateCount;
        return res.nextState;
      });

      const msg =
        resultCount > 0
          ? `Authorized and committed ${resultCount} validated record(s) to shared analytics (${batch.quarantinedCount} quarantined & ${batch.rejectedCount} rejected excluded).`
          : `No new records committed (${skippedCount} record ID(s) already exist in repository).`;
      setActionBanner({ type: resultCount > 0 ? 'success' : 'info', message: msg });
      return { ok: true, message: msg, committedCount: resultCount };
    },
    [activeUser, commitBatchValidatedRecords, persistState, state.importBatches]
  );

  const updateReviewQueueItem = useCallback(
    (
      itemId: string,
      params: {
        status: ReviewWorkflowStatus;
        reason: string;
        resolutionNote?: string;
        releaseToAuthorized?: boolean;
      }
    ): { ok: boolean; message: string } => {
      const target = state.reviewQueueItems.find((i) => i.id === itemId);
      if (!target) return { ok: false, message: 'Review queue item not found.' };

      const perm = canUserReviewItem(activeUser, {
        schemaType: target.schemaType,
        department: target.department,
      });
      if (!perm.allowed) {
        setActionBanner({ type: 'warning', message: perm.reason ?? 'Not authorized to review this item.' });
        return { ok: false, message: perm.reason ?? 'Not authorized to review this item.' };
      }

      if (
        (target.amountCad >= 250_000 ||
          params.status === 'Approved' ||
          params.status === 'Rejected' ||
          params.status === 'Resolved') &&
        !params.reason.trim()
      ) {
        const msg = 'A review reason / justification note is required before changing status on this record.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      if (params.releaseToAuthorized) {
        if (!canPerformAction(activeUser, 'authorize_data_import')) {
          const msg = 'Releasing a quarantined record into authorized analytics requires Group Controller (Helen Park).';
          setActionBanner({ type: 'warning', message: msg });
          return { ok: false, message: msg };
        }
        if (target.isExistingConflict) {
          const msg = 'Existing ID conflicts cannot be released into authorized analytics directly; resolve or reject duplicate instead.';
          setActionBanner({ type: 'warning', message: msg });
          return { ok: false, message: msg };
        }
      }

      const nowIso = new Date().toISOString();
      const prevStatus = target.reviewStatus;
      const authRef = params.releaseToAuthorized ? `REL-${target.stableRecordId}-${Date.now().toString().slice(-4)}` : undefined;

      persistState((prev) => {
        const updatedQueue = prev.reviewQueueItems.map((q) =>
          q.id === itemId
            ? {
                ...q,
                reviewStatus: params.status,
                resolutionNote: params.resolutionNote?.trim() || params.reason.trim(),
                assignedReviewerId: activeUser.id,
                updatedAtIso: nowIso,
                outcome: params.releaseToAuthorized && params.status === 'Approved' ? ('VALIDATED' as const) : q.outcome,
              }
            : q
        );

        let nextLedger = prev.uploadedLedgerTransactions;
        let nextCustoms = prev.uploadedCustomsRecords;
        if (params.releaseToAuthorized && params.status === 'Approved') {
          if (target.schemaType === 'ledger_transactions') {
            const exists = nextLedger.some(
              (t) => t.transactionId.toUpperCase() === target.stableRecordId.toUpperCase()
            );
            if (!exists) {
              nextLedger = [toUploadedLedgerTransaction(target, activeUser.id, nowIso), ...nextLedger];
            }
          } else {
            const exists = nextCustoms.some(
              (c) => c.entryId.toUpperCase() === target.stableRecordId.toUpperCase()
            );
            if (!exists) {
              nextCustoms = [toUploadedCustomsRecord(target, activeUser.id, nowIso), ...nextCustoms];
            }
          }
        }

        const actionType: AuditEvent['actionType'] =
          params.status === 'Approved'
            ? 'request_approved'
            : params.status === 'Rejected'
              ? 'request_rejected'
              : 'record_resolution_updated';

        const auditEv = buildAuditEvent(
          activeUser,
          actionType,
          `Review Queue ${target.stableRecordId}: ${prevStatus} → ${params.status}${params.releaseToAuthorized ? ' (released to authorized analytics)' : ''}.`,
          target.stableRecordId,
          {
            batchId: target.batchId,
            previousState: prevStatus,
            newState: params.status,
            authorizationRef: authRef,
            reason: params.reason.trim(),
          }
        );

        return {
          ...prev,
          reviewQueueItems: updatedQueue,
          uploadedLedgerTransactions: nextLedger,
          uploadedCustomsRecords: nextCustoms,
          notifications: appendNotification(prev.notifications ?? [], {
            eventKey: `review-item-${itemId}-${params.status}-${nowIso.slice(0, 16)}`,
            title:
              params.releaseToAuthorized && params.status === 'Approved'
                ? `Quarantined record released: ${target.stableRecordId}`
                : `Review item ${params.status.toLowerCase()}: ${target.stableRecordId}`,
            description: `${activeUser.name} updated ${target.stableRecordId} to ${params.status}.`,
            category: 'data_gateway',
            route: '/data-gateway',
            targetRecordId: target.stableRecordId,
            visibleToRoles: ['controller', 'cost_accountant', 'trade_coordinator'],
          }),
          auditEvents: [auditEv, ...prev.auditEvents].slice(0, 200),
        };
      });

      setActionBanner({
        type: 'success',
        message: `${target.stableRecordId} updated to ${params.status}${params.releaseToAuthorized ? ' and released to authorized totals' : ''}.`,
      });
      return { ok: true, message: `Updated ${target.stableRecordId} to ${params.status}.` };
    },
    [activeUser, appendNotification, buildAuditEvent, persistState, state.reviewQueueItems]
  );

  const reviewGovernanceRequest = useCallback(
    (requestId: string, decision: ReviewWorkflowStatus, reason: string): { ok: boolean; message: string } => {
      const target = state.approvalRequests.find((r) => r.id === requestId);
      if (!target) return { ok: false, message: 'Approval request not found.' };

      const linkedIr = IRREGULAR_COSTS.find((c) => c.id === target.linkedRecordId);
      const check = canUserReviewItem(activeUser, {
        requestType: target.requestType,
        department: linkedIr?.department,
        requestedByUserId: target.requestedByUserId,
      });

      if (!check.allowed) {
        setActionBanner({ type: 'warning', message: check.reason ?? 'Not authorized.' });
        return { ok: false, message: check.reason ?? 'Not authorized.' };
      }

      if (
        (target.isMaterial || decision === 'Approved' || decision === 'Rejected' || decision === 'Resolved') &&
        !reason.trim()
      ) {
        const msg = 'A documented decision reason is required for material or final governance actions.';
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      // Check multi-step duplicate signer guard
      const alreadySigned = target.approvalsHistory.some(
        (s) => s.actorUserId === activeUser.id && s.decision === 'Approved'
      );
      if (decision === 'Approved' && target.requiredApprovalsCount > 1 && alreadySigned) {
        const msg = `Segregation of duties: ${activeUser.name} already signed an earlier approval step on ${target.id}. A distinct reviewer must sign the next step.`;
        setActionBanner({ type: 'warning', message: msg });
        return { ok: false, message: msg };
      }

      const nowIso = new Date().toISOString();
      const prevState = target.workflowStatus;

      let resultMessage = `Updated request ${target.linkedRecordId} to ${decision}.`;

      persistState((prev) => {
        const current = prev.approvalRequests.find((r) => r.id === requestId) ?? target;
        let nextHistory = [...current.approvalsHistory];
        let nextWorkflowStatus: ReviewWorkflowStatus = decision;
        let nextLegacyStatus: ApprovalRequest['status'] = current.status;
        let nextResolutionStatus: 'Open' | 'Resolved' = current.resolutionStatus;
        let authRef: string | undefined;

        if (decision === 'Approved') {
          const nextPendingIdx = nextHistory.findIndex((s) => s.decision !== 'Approved');
          if (nextPendingIdx >= 0) {
            nextHistory[nextPendingIdx] = {
              ...nextHistory[nextPendingIdx],
              actorUserId: activeUser.id,
              actorName: activeUser.name,
              decision: 'Approved',
              reason: reason.trim(),
              timestampIso: nowIso,
            };
          }
          const approvedCount = nextHistory.filter((s) => s.decision === 'Approved').length;
          if (approvedCount < current.requiredApprovalsCount) {
            nextWorkflowStatus = 'In Review';
            nextLegacyStatus = 'demo_pending_controller';
            resultMessage = `Recorded approval step ${approvedCount} of ${current.requiredApprovalsCount} on ${current.title}. Remaining step(s) required before final approval.`;
          } else {
            nextWorkflowStatus = 'Approved';
            nextLegacyStatus = 'demo_approved';
            authRef = `APR-${current.id.slice(-6).toUpperCase()}`;
            resultMessage = `Final approval recorded for ${current.title} (${approvedCount}/${current.requiredApprovalsCount} steps signed).`;
          }
        } else if (decision === 'Rejected') {
          const nextPendingIdx = nextHistory.findIndex((s) => !s.decision || s.decision === 'In Review');
          if (nextPendingIdx >= 0) {
            nextHistory[nextPendingIdx] = {
              ...nextHistory[nextPendingIdx],
              actorUserId: activeUser.id,
              actorName: activeUser.name,
              decision: 'Rejected',
              reason: reason.trim(),
              timestampIso: nowIso,
            };
          }
          nextLegacyStatus = 'demo_rejected';
          nextResolutionStatus = 'Resolved';
        } else if (decision === 'Resolved') {
          nextResolutionStatus = 'Resolved';
        }

        const updatedRequests = prev.approvalRequests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: nextLegacyStatus,
                workflowStatus: nextWorkflowStatus,
                resolutionStatus: nextResolutionStatus,
                approvalsHistory: nextHistory,
                approverUserId: nextWorkflowStatus === 'Approved' ? activeUser.id : r.approverUserId,
                decisionReason: reason.trim() || r.decisionReason,
                updatedAtIso: nowIso,
              }
            : r
        );

        const actionType: AuditEvent['actionType'] =
          decision === 'Approved'
            ? 'request_approved'
            : decision === 'Rejected'
              ? 'request_rejected'
              : 'record_resolution_updated';

        const auditEv = buildAuditEvent(
          activeUser,
          actionType,
          `${resultMessage}`,
          current.linkedRecordId,
          {
            batchId: current.batchId,
            previousState: prevState,
            newState: nextWorkflowStatus,
            authorizationRef: authRef,
            reason: reason.trim(),
          }
        );

        let nextState: PersistedWorkspaceState = {
          ...prev,
          approvalRequests: updatedRequests,
          notifications: appendNotification(prev.notifications ?? [], {
            eventKey: `apr-decision-${requestId}-${nextWorkflowStatus}-${nowIso.slice(0, 16)}`,
            title:
              decision === 'Rejected'
                ? `Request rejected: ${current.title}`
                : nextWorkflowStatus === 'Approved'
                  ? `Approval granted: ${current.title}`
                  : `Approval step recorded: ${current.title}`,
            description: resultMessage,
            category: 'approvals',
            route: '/approvals',
            targetRecordId: current.linkedRecordId,
          }),
          auditEvents: [auditEv, ...prev.auditEvents].slice(0, 200),
        };

        // If this was an import_authorization and just reached final Approved, commit validated records!
        if (
          nextWorkflowStatus === 'Approved' &&
          current.requestType === 'import_authorization' &&
          current.batchId &&
          canPerformAction(activeUser, 'authorize_data_import')
        ) {
          const linkedBatch = prev.importBatches.find((b) => b.id === current.batchId);
          if (linkedBatch && !linkedBatch.authorizedAtIso && linkedBatch.validatedCount > 0) {
            const committed = commitBatchValidatedRecords(nextState, linkedBatch, activeUser, reason.trim());
            nextState = committed.nextState;
            resultMessage = `Authorized & committed ${committed.committedCount} validated record(s) from batch "${linkedBatch.fileName}".`;
          }
        }

        return nextState;
      });

      setActionBanner({ type: decision === 'Rejected' ? 'info' : 'success', message: resultMessage });
      return { ok: true, message: resultMessage };
    },
    [activeUser, appendNotification, buildAuditEvent, commitBatchValidatedRecords, persistState, state.approvalRequests]
  );

  const approveCorrectionRequest = useCallback(
    (requestId: string, approve: boolean): { ok: boolean; message: string } => {
      const target = state.approvalRequests.find((r) => r.id === requestId);
      if (!target) return { ok: false, message: 'Approval request not found.' };

      const check = canApproveCorrectionRequest(activeUser, target.requestedByUserId);
      if (!check.allowed) {
        setActionBanner({ type: 'warning', message: check.reason ?? 'Not authorized.' });
        return { ok: false, message: check.reason ?? 'Not authorized.' };
      }

      return reviewGovernanceRequest(
        requestId,
        approve ? 'Approved' : 'Rejected',
        approve ? 'Approved via Controller decision.' : 'Rejected via Controller decision.'
      );
    },
    [activeUser, reviewGovernanceRequest, state.approvalRequests]
  );

  const toggleBusinessRule = useCallback(
    (ruleId: BusinessRuleConfig['id']) => {
      if (!canPerformAction(activeUser, 'configure_business_rules')) {
        setActionBanner({
          type: 'warning',
          message: 'Only Group Controller may modify business rule configurations.',
        });
        return;
      }
      persistState((prev) => ({
        ...prev,
        businessRules: prev.businessRules.map((r) =>
          r.id === ruleId ? { ...r, enabled: !r.enabled } : r
        ),
        auditEvents: [
          buildAuditEvent(activeUser, 'rule_threshold_updated', `Toggled rule ${ruleId}.`, ruleId),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const updateRuleThreshold = useCallback(
    (ruleId: BusinessRuleConfig['id'], value: number) => {
      if (!canPerformAction(activeUser, 'configure_business_rules')) return;
      persistState((prev) => ({
        ...prev,
        businessRules: prev.businessRules.map((r) =>
          r.id === ruleId ? { ...r, thresholdValue: value } : r
        ),
        auditEvents: [
          buildAuditEvent(
            activeUser,
            'rule_threshold_updated',
            `Updated ${ruleId} threshold to ${value}.`,
            ruleId
          ),
          ...prev.auditEvents,
        ].slice(0, 200),
      }));
    },
    [activeUser, buildAuditEvent, persistState]
  );

  const resetDemoState = useCallback(() => {
    const fresh = costIntelligenceRepo.resetToOfficialCaseBaseline();
    const next = { ...fresh, activeRoleId: authenticatedUser.roleId };
    costIntelligenceRepo.saveState(next);
    setState(next);
    setActionBanner({
      type: 'info',
      message: 'Workspace reset to official Appendix baseline (all uploaded batches and review items cleared).',
    });
  }, [authenticatedUser.roleId]);

  const hasPermission = useCallback(
    (action: PermissionAction) => canPerformAction(activeUser, action),
    [activeUser]
  );

  const canViewRoute = useCallback(
    (route: RoutePath) => canAccessRoute(activeUser, route),
    [activeUser]
  );

  const value: AppContextValue = {
    currentRoute,
    navigate,
    state,
    activeUser,
    setQuarterFilter,
    setRegionFilter,
    setPlantFilter,
    setCurrencyPreference,
    setSidebarCollapsed,
    formatMoney,
    formatCompactMoney,
    formatShortMoney,
    formatOverviewMoney,
    convertAmount,
    visibleNotifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
    clearAllNotifications,
    drawerRecord,
    openDrawer: setDrawerRecord,
    openRecordById,
    closeDrawer: () => setDrawerRecord(null),
    askModalOpen,
    setAskModalOpen,
    scopedIrregularCosts,
    scopedCustomsEntries,
    ruleEvaluations,
    groupedAlerts,
    authorizedAnalytics,
    simulatorPresetEntryIds,
    sendEntriesToSimulator,
    saveScenario,
    deleteScenario,
    updateInvestigationStatus,
    updateInvestigationWorkflow,
    promoteQuarantinedToInvestigation,
    saveAiInvestigationNote,
    updateCostOpportunity,
    recordAiAuditEvent,
    reportPreset,
    clearReportPreset: () => setReportPreset(null),
    openReportStudioWithPreset,
    saveReportConfig,
    duplicateReportConfig,
    deleteReportConfig,
    recordReportExport,
    addEvidenceNote,
    addSupportingEvidence,
    submitCorrectionRequest,
    createGovernanceRequest,
    approveCorrectionRequest,
    reviewGovernanceRequest,
    recordStagedBatch,
    submitBatchForAuthorization,
    authorizeAndCommitBatch,
    updateReviewQueueItem,
    toggleBusinessRule,
    updateRuleThreshold,
    resetDemoState,
    hasPermission,
    canViewRoute,
    persistenceNotice: costIntelligenceRepo.persistenceNotice,
    actionBanner,
    dismissBanner: () => setActionBanner(null),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
