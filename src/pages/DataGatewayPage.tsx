import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  HelpCircle,
  History,
  Info,
  Lock,
  Paperclip,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { CUSTOMS_ENTRIES, DEMO_USERS, IRREGULAR_COSTS } from '../data/caseSeed';
import { JUDGE_SAMPLE_DATASETS } from '../data/sampleDatasets';
import { useApp } from '../context/AppContext';
import {
  CUSTOMS_SCHEMA_FIELDS,
  exportSafeCsv,
  inspectSchemaAndMappings,
  LEDGER_SCHEMA_FIELDS,
  ParsedFilePayload,
  parseUploadedFileBytes,
  runIngestionValidationPipeline,
} from '../domain/ingestionPipeline';
import { canUserReviewItem } from '../domain/permissions';
import { requestAiGatewayAssist } from '../services/aiService';
import {
  AiGatewayAssistResult,
  EvidenceSourceType,
  ImportBatch,
  RecordValidationOutcome,
  ReviewWorkflowStatus,
  StagedRecordItem,
} from '../types/domain';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';

type WorkflowStep = 'upload' | 'review' | 'authorize';
type DrawerView = 'none' | 'reviews' | 'history' | 'rules';

const OUTCOME_STYLE: Record<RecordValidationOutcome, { label: string; cls: string }> = {
  VALIDATED: { label: 'Validated', cls: 'text-[#15803D] border-emerald-200 bg-emerald-50' },
  QUARANTINED: { label: 'Quarantined', cls: 'text-[#B45309] border-amber-200 bg-amber-50' },
  REJECTED: { label: 'Rejected', cls: 'text-[#DC2626] border-red-200 bg-red-50' },
};

const REVIEW_STATUS_STYLE: Record<ReviewWorkflowStatus, string> = {
  Submitted: 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]',
  'In Review': 'text-[#1D4ED8] bg-blue-50 border-blue-200',
  'Additional Evidence Required': 'text-[#B45309] bg-amber-50 border-amber-200',
  Approved: 'text-[#15803D] bg-emerald-50 border-emerald-200',
  Rejected: 'text-[#DC2626] bg-red-50 border-red-200',
  Resolved: 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]',
};

const BATCH_STATUS_META: Record<ImportBatch['status'], { label: string; cls: string }> = {
  staged_preview: { label: 'Staged Preview', cls: 'text-[#231F20] bg-[#F5F6F7] border-[#E2E5E8]' },
  validated: { label: 'Validated', cls: 'text-[#15803D] bg-emerald-50 border-emerald-200' },
  submitted_for_authorization: { label: 'Awaiting Authorization', cls: 'text-[#B45309] bg-amber-50 border-amber-200' },
  authorized_committed: { label: 'Authorized & Committed', cls: 'text-[#15803D] bg-emerald-50 border-emerald-200' },
  quarantined: { label: 'Quarantined Only', cls: 'text-[#B45309] bg-amber-50 border-amber-200' },
  rejected: { label: 'Rejected', cls: 'text-[#DC2626] bg-red-50 border-red-200' },
};

function formatSchemaLabel(schemaType: ImportBatch['schemaType']): string {
  if (schemaType === 'ledger_transactions') return 'Ledger & Irregular Costs';
  if (schemaType === 'customs_shipments') return 'Customs & Shipments';
  if (schemaType === 'incomplete') return 'Incomplete Schema';
  return 'Unsupported File';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DataGatewayPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    recordStagedBatch,
    submitBatchForAuthorization,
    authorizeAndCommitBatch,
    updateReviewQueueItem,
    addSupportingEvidence,
    promoteQuarantinedToInvestigation,
    recordAiAuditEvent,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  // Primary workflow state
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('upload');
  const [activeDrawer, setActiveDrawer] = useState<DrawerView>('none');
  const [scopeHelpOpen, setScopeHelpOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [schemaGuideOpen, setSchemaGuideOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);

  // Upload & parsing state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rawUploadBuffer, setRawUploadBuffer] = useState<{
    fileName: string;
    fileSizeBytes: number;
    bytes: Uint8Array;
  } | null>(null);
  const [stagedSourceBatchId, setStagedSourceBatchId] = useState<string | null>(null);
  const [parsedPayload, setParsedPayload] = useState<ParsedFilePayload | null>(null);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});

  // Review & Row Inspector state
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | RecordValidationOutcome>('ALL');
  const [rowSearch, setRowSearch] = useState('');
  const [selectedStagedRow, setSelectedStagedRow] = useState<StagedRecordItem | null>(null);
  const [authReason, setAuthReason] = useState('');

  // AI Assistant state (advisory only)
  const [gatewayAiLoading, setGatewayAiLoading] = useState(false);
  const [gatewayAiError, setGatewayAiError] = useState<string | null>(null);
  const [gatewayAiAssist, setGatewayAiAssist] = useState<AiGatewayAssistResult | null>(null);

  // Pending Reviews Drawer state
  const [queueSchemaFilter, setQueueSchemaFilter] = useState<'all' | 'ledger_transactions' | 'customs_shipments'>('all');
  const [queueDeptFilter, setQueueDeptFilter] = useState('all');
  const [queueSeverityFilter, setQueueSeverityFilter] = useState<'all' | 'high' | 'medium' | 'info'>('all');
  const [queueStatusFilter, setQueueStatusFilter] = useState<'all' | ReviewWorkflowStatus>('all');
  const [queueBatchFilter, setQueueBatchFilter] = useState('all');
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Evidence attachment form inside Pending Reviews
  const [evTitle, setEvTitle] = useState('');
  const [evSummary, setEvSummary] = useState('');
  const [evSourceType, setEvSourceType] = useState<EvidenceSourceType>('reference');
  const [evFileMeta, setEvFileMeta] = useState<{ name: string; size: number } | null>(null);

  // History & Rules drawer state
  const [historySearch, setHistorySearch] = useState('');
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const canStage = hasPermission('stage_data_upload');
  const canAuthorizeImport = hasPermission('authorize_data_import');
  const canViewQueue = hasPermission('review_quarantined_records');

  const activeBatch: ImportBatch | null = useMemo(() => {
    if (!activeBatchId) return state.importBatches[0] ?? null;
    return state.importBatches.find((b) => b.id === activeBatchId) ?? state.importBatches[0] ?? null;
  }, [activeBatchId, state.importBatches]);

  const openQueueCount = useMemo(
    () => state.reviewQueueItems.filter((q) => !['Approved', 'Rejected', 'Resolved'].includes(q.reviewStatus)).length,
    [state.reviewQueueItems]
  );

  const sampleDatasets = useMemo(
    () => JUDGE_SAMPLE_DATASETS.filter((d) => !d.fileName.startsWith('Template_')),
    []
  );
  const templateDatasets = useMemo(
    () => JUDGE_SAMPLE_DATASETS.filter((d) => d.fileName.startsWith('Template_')),
    []
  );

  // Dynamic inspection of active batch column mappings & unresolved ambiguities
  const batchMappingInspection = useMemo(() => {
    if (!activeBatch || activeBatch.columnMappings.length === 0) return null;
    const overrides = activeBatch.id === stagedSourceBatchId ? mappingOverrides : undefined;
    return inspectSchemaAndMappings(
      activeBatch.columnMappings.map((m) => m.sourceHeader),
      overrides
    );
  }, [activeBatch, mappingOverrides, stagedSourceBatchId]);

  const hasAmbiguousMappings = useMemo(() => {
    if (!activeBatch) return false;
    return (
      activeBatch.columnMappings.some((m) => m.confidence === 'ambiguous') ||
      Boolean(batchMappingInspection?.hasAmbiguousMappings)
    );
  }, [activeBatch, batchMappingInspection]);

  const missingRequiredFields = batchMappingInspection?.missingRequiredFields ?? [];

  const isBatchBlockedForAuthorization = useMemo(() => {
    if (!activeBatch) return true;
    if (activeBatch.schemaType === 'unsupported' || activeBatch.schemaType === 'incomplete') return true;
    if (hasAmbiguousMappings || missingRequiredFields.length > 0) return true;
    return false;
  }, [activeBatch, hasAmbiguousMappings, missingRequiredFields]);

  // Dynamic Rules A–H reference anchored to live state.businessRules thresholds
  const gatewayRuleSpecs = useMemo(() => {
    const costRule = state.businessRules.find((r) => r.id === 'RULE_01_INDIVIDUAL_COST_SCREEN');
    const approvalRule = state.businessRules.find((r) => r.id === 'RULE_02_APPROVAL_SCREEN');
    const brokerRule = state.businessRules.find((r) => r.id === 'RULE_04_BROKER_CONTRACT');
    const tariffRule = state.businessRules.find((r) => r.id === 'RULE_05_TARIFF_SEPARATION');
    const materialCad = costRule?.thresholdValue ?? 250_000;
    const brokerPct = brokerRule?.thresholdValue ?? 0.2;
    const tariffPct = tariffRule?.thresholdValue ?? 25;

    return [
      {
        code: 'RULE A',
        title: 'Material Cost Threshold',
        summary: `Quarantines transactions or shipments at or above ${formatMoney(materialCad)} for controller review.`,
        outcome: 'Quarantined',
        technical: `Reads live Business Rule "${costRule?.code ?? 'RULE 01'}" (${formatMoney(materialCad)}). Records below threshold pass unless another rule triggers.`,
        example: `AmountCAD 250,000.00 -> Quarantined | 249,999.99 -> Cleared (if other rules pass).`,
      },
      {
        code: 'RULE B',
        title: 'Missing Approval Reference',
        summary: 'Quarantines ledger transactions that omit a required approval reference.',
        outcome: 'Quarantined',
        technical: `Enforces "${approvalRule?.code ?? 'RULE 02'}" (${approvalRule?.sourceRef ?? 'Appendix 4.1'}). Empty, N/A, or missing approval reference tokens prevent auto-approval.`,
        example: `ApprovalReference = "" or "N/A" -> Quarantined for supporting documentation.`,
      },
      {
        code: 'RULE C',
        title: 'Broker Fee & Tariff Math Variance',
        summary: `Screens customs shipments for broker fees diverging from ${brokerPct}% of goods value or unexpected ${tariffPct}% tariff splits.`,
        outcome: 'Quarantined',
        technical: `Verifies contracted broker fee (${brokerPct}% of GoodsValueCAD per Appendix 3.3) and validates AdditionalTariffCAD against origin/tariff math.`,
        example: `GoodsValue CAD 400,000 with BrokerFee CAD 2,400 (0.6% vs 0.2% expected CAD 800) -> Quarantined.`,
      },
      {
        code: 'RULE D',
        title: 'Unsupported or Future Accounting Period',
        summary: 'Quarantines records dated into future or unrecognized accounting quarters.',
        outcome: 'Quarantined',
        technical: 'Checks AccountingPeriod against governed reporting quarters (Q1 2025 – Q3 2026) and screens out post-cutoff future dates.',
        example: 'AccountingPeriod = "Q4 2027" or PostingDate > cutoff -> Quarantined.',
      },
      {
        code: 'RULE E',
        title: 'Non-Positive Financial Amount',
        summary: 'Rejects records with zero, negative, or non-numeric monetary amounts.',
        outcome: 'Rejected',
        technical: 'Blocks invalid negative/zero AmountCAD or GoodsValueCAD entries from entering staging queues or analytics.',
        example: 'AmountCAD <= 0 or NaN -> Rejected at ingestion gate.',
      },
      {
        code: 'RULE F',
        title: 'Duplicate Record ID Within Batch',
        summary: 'Rejects repeated TransactionID or EntryID rows inside the same uploaded file.',
        outcome: 'Rejected',
        technical: 'Detects intra-file duplicate stable keys (e.g., second occurrence of TX-ANM-015) so totals cannot be double-counted.',
        example: 'Row 16 repeating TX-ANM-015 -> Rejected as intra-batch duplicate.',
      },
      {
        code: 'RULE G',
        title: 'Schema Recognition & Required Fields',
        summary: 'Rejects unrelated files or rows missing mandatory schema fields before validation.',
        outcome: 'Rejected',
        technical: 'Requires unambiguous header matches to Ledger or Customs schemas and non-empty core identifiers, dates, and domains.',
        example: 'Irrelevant_Data.csv (HR/inventory columns) -> Rejected as unsupported schema.',
      },
      {
        code: 'RULE H',
        title: 'Existing Trusted Record Conflict',
        summary: 'Quarantines records whose ID already exists in committed uploads or Appendix baseline tables.',
        outcome: 'Quarantined',
        technical: 'Cross-checks TransactionID/EntryID against committed repository & Appendix records and blocks direct release to prevent double-counting.',
        example: 'Re-uploading committed TX-001 -> Quarantined with Existing Conflict lock.',
      },
    ];
  }, [state.businessRules, formatMoney]);

  const handleDownloadCsv = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportBatchReport = (batch: ImportBatch) => {
    const headers = ['Row', 'RecordID', 'Outcome', 'AmountCAD', 'Department', 'Period', 'Reasons'];
    const rows = batch.records.map((r) => ({
      Row: r.rowNumber,
      RecordID: r.stableRecordId,
      Outcome: r.outcome,
      AmountCAD: r.amountCad,
      Department: r.department,
      Period: r.accountingPeriod,
      Reasons: r.reasons.join(' | ') || 'Passed deterministic checks',
    }));
    const safeCsv = exportSafeCsv(headers, rows);
    handleDownloadCsv(`Validation_Report_${batch.fileName.replace(/\.[^.]+$/, '')}.csv`, safeCsv);
  };

  const processFileBytes = (
    fileName: string,
    fileSizeBytes: number,
    bytes: Uint8Array,
    worksheet?: string,
    overrides: Record<string, string> = {}
  ) => {
    setUploadBusy(true);
    setUploadError(null);
    try {
      const parsed = parseUploadedFileBytes({
        fileName,
        fileSizeBytes,
        bytes,
        requestedWorksheet: worksheet,
      });
      setRawUploadBuffer({ fileName, fileSizeBytes, bytes });
      setParsedPayload(parsed);
      setMappingOverrides(overrides);

      const batch = runIngestionValidationPipeline({
        parsed,
        uploadedByUserId: activeUser.id,
        businessRules: state.businessRules,
        existingLedgerTransactions: state.uploadedLedgerTransactions,
        existingCustomsRecords: state.uploadedCustomsRecords,
        mappingOverrides: overrides,
      });

      recordStagedBatch(batch);
      setActiveBatchId(batch.id);
      setStagedSourceBatchId(batch.id);
      setOutcomeFilter('ALL');
      setRowSearch('');
      setSelectedStagedRow(batch.records[0] ?? null);
      setGatewayAiAssist(null);
      setGatewayAiError(null);

      // Auto-expand mapping section if ambiguities or missing fields need user resolution
      const needsMappingReview =
        batch.columnMappings.some((m) => m.confidence === 'ambiguous') ||
        batch.schemaType === 'incomplete';
      setMappingOpen(needsMappingReview);

      if (!parsed.ok && parsed.errors.length > 0) {
        setUploadError(parsed.errors[0]);
      }

      setWorkflowStep('review');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Unable to parse file. Verify the file is a valid .csv or .xlsx workbook under 5 MB.'
      );
    } finally {
      setUploadBusy(false);
    }
  };

  const handleFileInput = async (file: File | undefined) => {
    if (!file) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      processFileBytes(file.name, file.size, new Uint8Array(buffer), undefined, {});
    } catch (err) {
      setUploadBusy(false);
      setUploadError(err instanceof Error ? err.message : 'Failed to read selected file.');
    }
  };

  const handleLoadSampleDataset = (fileName: string, csvContent: string) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(csvContent);
    processFileBytes(fileName, bytes.byteLength, bytes, undefined, {});
  };

  const handleSwitchWorksheet = (sheetName: string) => {
    if (!rawUploadBuffer) return;
    processFileBytes(
      rawUploadBuffer.fileName,
      rawUploadBuffer.fileSizeBytes,
      rawUploadBuffer.bytes,
      sheetName,
      {}
    );
  };

  const handleUpdateColumnMapping = (sourceHeader: string, targetField: string) => {
    if (!rawUploadBuffer || !parsedPayload) return;
    const nextOverrides = { ...mappingOverrides };
    if (!targetField) {
      delete nextOverrides[sourceHeader];
    } else {
      nextOverrides[sourceHeader] = targetField;
    }
    processFileBytes(
      rawUploadBuffer.fileName,
      rawUploadBuffer.fileSizeBytes,
      rawUploadBuffer.bytes,
      parsedPayload.selectedWorksheet,
      nextOverrides
    );
  };

  const handleRunGatewayAiAssist = async () => {
    if (!activeBatch) return;
    setGatewayAiLoading(true);
    setGatewayAiError(null);
    const schemaFields = (
      activeBatch.schemaType === 'customs_shipments' ? CUSTOMS_SCHEMA_FIELDS : LEDGER_SCHEMA_FIELDS
    ).map((f) => f.field);
    const headers = parsedPayload?.headers ?? activeBatch.columnMappings.map((m) => m.sourceHeader);
    const sampleRows = activeBatch.records.slice(0, 4).map((r) => r.rawRow);

    const res = await requestAiGatewayAssist({
      headers,
      sampleRows,
      targetFields: schemaFields,
      anomalySummary: {
        fileName: activeBatch.fileName,
        schemaType: activeBatch.schemaType,
        validatedCount: activeBatch.validatedCount,
        quarantinedCount: activeBatch.quarantinedCount,
        rejectedCount: activeBatch.rejectedCount,
        topReasons: activeBatch.records
          .filter((r) => r.outcome !== 'VALIDATED')
          .slice(0, 8)
          .map((r) => ({ id: r.stableRecordId, outcome: r.outcome, reasons: r.reasons })),
      },
    });
    setGatewayAiLoading(false);
    if (!res.ok) {
      setGatewayAiError(res.userMessage);
      return;
    }
    setGatewayAiAssist(res.assist);
    recordAiAuditEvent(
      'ai_gateway_assist_used',
      `AI Gateway Assist reviewed ${activeBatch.fileName} (advisory only; zero auto-applied changes)`,
      activeBatch.id
    );
  };

  const visibleStagedRows = useMemo(() => {
    if (!activeBatch) return [];
    const query = rowSearch.trim().toLowerCase();
    return activeBatch.records.filter((r) => {
      if (outcomeFilter !== 'ALL' && r.outcome !== outcomeFilter) return false;
      if (!query) return true;
      return (
        r.stableRecordId.toLowerCase().includes(query) ||
        r.department.toLowerCase().includes(query) ||
        r.accountingPeriod.toLowerCase().includes(query) ||
        r.reasons.some((reason) => reason.toLowerCase().includes(query)) ||
        r.ruleResults.some((rule) => rule.ruleCode.toLowerCase().includes(query))
      );
    });
  }, [activeBatch, outcomeFilter, rowSearch]);

  // Review Queue memos
  const queueDepartments = useMemo(
    () => Array.from(new Set(state.reviewQueueItems.map((i) => i.department))).sort(),
    [state.reviewQueueItems]
  );

  const filteredQueueItems = useMemo(() => {
    return state.reviewQueueItems.filter((item) => {
      if (queueSchemaFilter !== 'all' && item.schemaType !== queueSchemaFilter) return false;
      if (queueDeptFilter !== 'all' && item.department !== queueDeptFilter) return false;
      if (queueSeverityFilter !== 'all' && item.highestSeverity !== queueSeverityFilter) return false;
      if (queueStatusFilter !== 'all' && item.reviewStatus !== queueStatusFilter) return false;
      if (queueBatchFilter !== 'all' && item.batchId !== queueBatchFilter) return false;
      return true;
    });
  }, [
    state.reviewQueueItems,
    queueSchemaFilter,
    queueDeptFilter,
    queueSeverityFilter,
    queueStatusFilter,
    queueBatchFilter,
  ]);

  const selectedQueueItem = useMemo(() => {
    if (!filteredQueueItems.length) return null;
    if (selectedQueueId) {
      const hit = filteredQueueItems.find((i) => i.id === selectedQueueId);
      if (hit) return hit;
    }
    return filteredQueueItems[0];
  }, [filteredQueueItems, selectedQueueId]);

  const selectedQueueEvidence = useMemo(() => {
    if (!selectedQueueItem) return [];
    return state.evidence.filter(
      (ev) =>
        ev.linkedRecordId === selectedQueueItem.stableRecordId ||
        ev.linkedRecordId === selectedQueueItem.id
    );
  }, [selectedQueueItem, state.evidence]);

  const relatedExistingRecords = useMemo(() => {
    if (!selectedQueueItem) return [];
    const hits: { id: string; label: string; amountCad: number; source: string }[] = [];
    const deptLower = selectedQueueItem.department.toLowerCase();
    IRREGULAR_COSTS.forEach((ir) => {
      if (ir.department.toLowerCase() === deptLower || Math.abs(ir.amountCad - selectedQueueItem.amountCad) < 50_000) {
        hits.push({
          id: ir.id,
          label: `${ir.item} (${ir.department})`,
          amountCad: ir.amountCad,
          source: 'Appendix 2.1/2.3',
        });
      }
    });
    state.uploadedLedgerTransactions.forEach((tx) => {
      if (
        tx.transactionId === selectedQueueItem.stableRecordId ||
        (tx.invoiceReference &&
          selectedQueueItem.normalizedData.invoiceReference &&
          tx.invoiceReference.slice(0, 8) === String(selectedQueueItem.normalizedData.invoiceReference).slice(0, 8))
      ) {
        hits.push({
          id: tx.transactionId,
          label: `${tx.description || tx.expenseCategory} (${tx.invoiceReference})`,
          amountCad: tx.amountCad,
          source: 'Committed Upload',
        });
      }
    });
    CUSTOMS_ENTRIES.forEach((ce) => {
      if (ce.id === selectedQueueItem.stableRecordId) {
        hits.push({
          id: ce.id,
          label: `${ce.route} · ${ce.goods}`,
          amountCad: ce.totalDutyAndTariffCad + ce.brokerFeeChargedCad,
          source: 'Appendix 3.2',
        });
      }
    });
    return hits.slice(0, 5);
  }, [selectedQueueItem, state.uploadedLedgerTransactions]);

  const filteredHistoryBatches = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return state.importBatches;
    return state.importBatches.filter(
      (b) =>
        b.fileName.toLowerCase().includes(q) ||
        formatSchemaLabel(b.schemaType).toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
    );
  }, [historySearch, state.importBatches]);

  const handleAttachQueueEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueItem) return;
    const res = addSupportingEvidence({
      linkedRecordId: selectedQueueItem.stableRecordId,
      linkedEntityType: 'quarantined_record',
      title: evTitle,
      summary: evSummary,
      sourceType: evSourceType,
      fileName: evFileMeta?.name,
      fileSizeBytes: evFileMeta?.size,
      persistenceScope: evFileMeta ? 'metadata_only_local_demo' : 'case_reference',
    });
    if (res.ok) {
      setEvTitle('');
      setEvSummary('');
      setEvFileMeta(null);
      setReviewFeedback({ ok: true, message: res.message });
    } else {
      setReviewFeedback({ ok: false, message: res.message });
    }
  };

  const handleOpenQuarantineForRow = (row: StagedRecordItem) => {
    if (!activeBatch) return;
    const existingItem = state.reviewQueueItems.find(
      (q) => q.id === row.id || (q.batchId === activeBatch.id && q.stableRecordId === row.stableRecordId)
    );
    if (!existingItem && activeBatch.status === 'staged_preview') {
      submitBatchForAuthorization(activeBatch.id);
    }
    setQueueBatchFilter(activeBatch.id);
    setSelectedQueueId(row.id);
    setReviewFeedback(null);
    setActiveDrawer('reviews');
  };

  const handleInspectHistoryBatch = (batch: ImportBatch) => {
    setActiveBatchId(batch.id);
    setOutcomeFilter('ALL');
    setRowSearch('');
    setSelectedStagedRow(batch.records[0] ?? null);
    setMappingOpen(batch.columnMappings.some((m) => m.confidence === 'ambiguous'));
    setActiveDrawer('none');
    setWorkflowStep('review');
  };

  const handleStepClick = (step: WorkflowStep) => {
    if (step === 'upload') {
      setWorkflowStep('upload');
      return;
    }
    if (!activeBatch) return;
    if (step === 'authorize' && isBatchBlockedForAuthorization) return;
    setWorkflowStep(step);
  };

  if (!canStage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Data Gateway" />
        <UnavailableDataState
          title={`Data Gateway restricted for ${activeUser.title}`}
          description="Switch to an authorized account in Settings to upload files or review quarantined records."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  // Validation visualization bar percentages
  const totalCount = activeBatch?.recordCount || 0;
  const validatedPct = totalCount > 0 && activeBatch ? Math.round((activeBatch.validatedCount / totalCount) * 100) : 0;
  const quarantinedPct = totalCount > 0 && activeBatch ? Math.round((activeBatch.quarantinedCount / totalCount) * 100) : 0;
  const rejectedPct = totalCount > 0 && activeBatch ? Math.max(0, 100 - validatedPct - quarantinedPct) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Gateway"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScopeHelpOpen((v) => !v)}
              aria-expanded={scopeHelpOpen}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap cursor-pointer transition-colors ${
                scopeHelpOpen
                  ? 'bg-[#231F20] text-white border-[#231F20]'
                  : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20] hover:bg-[#F5F6F7]'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How it Works</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setReviewFeedback(null);
                setActiveDrawer('reviews');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer transition-colors"
            >
              <ShieldAlert className={`w-3.5 h-3.5 ${openQueueCount > 0 ? 'text-[#B45309]' : 'text-[#5F6368]'}`} />
              <span>Pending Reviews</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
                  openQueueCount > 0 ? 'bg-amber-50 text-[#B45309] border border-amber-200' : 'bg-[#F5F6F7] text-[#5F6368]'
                }`}
              >
                {openQueueCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDrawer('history')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer transition-colors"
            >
              <History className="w-3.5 h-3.5 text-[#5F6368]" />
              <span>History</span>
              <span className="text-[11px] font-semibold text-[#5F6368] tabular-nums">
                ({state.importBatches.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveDrawer('rules')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#5F6368]" />
              <span>Rules (A–H)</span>
            </button>
          </div>
        }
      />

      {/* Contextual Help Popover (replaces long subtitle & metadata banner) */}
      {scopeHelpOpen && (
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4 text-xs text-[#5F6368] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold text-[#231F20]">
              Three-Stage Ingestion Governance: Upload → Review → Authorize
            </p>
            <p className="leading-relaxed">
              Uploaded CSV and Excel workbooks are classified from their actual headers and row contents—dashboard period or plant filters never tag uploads automatically. Validated rows require explicit authorization before entering shared analytics; quarantined anomalies route to Pending Reviews; rejected rows remain blocked.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScopeHelpOpen(false)}
            className="text-[#5F6368] hover:text-[#231F20] self-end sm:self-start cursor-pointer"
            aria-label="Close help"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Guided 3-Step Workflow Bar */}
      <nav
        aria-label="Data ingestion workflow"
        className="bg-white border border-[#E2E5E8] rounded-md px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <ol className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          {[
            { id: 'upload' as const, num: 1, label: 'Upload', enabled: true },
            { id: 'review' as const, num: 2, label: 'Review', enabled: Boolean(activeBatch) },
            {
              id: 'authorize' as const,
              num: 3,
              label: 'Authorize',
              enabled: Boolean(activeBatch) && !isBatchBlockedForAuthorization,
            },
          ].map((step, index) => {
            const isActive = workflowStep === step.id;
            const isCompleted =
              (step.id === 'upload' && workflowStep !== 'upload' && Boolean(activeBatch)) ||
              (step.id === 'review' && workflowStep === 'authorize') ||
              (step.id === 'authorize' && activeBatch?.status === 'authorized_committed');

            return (
              <React.Fragment key={step.id}>
                <li>
                  <button
                    type="button"
                    disabled={!step.enabled}
                    onClick={() => handleStepClick(step.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#231F20] text-white border-[#231F20] cursor-pointer'
                        : step.enabled
                          ? 'bg-white text-[#231F20] border-[#E2E5E8] hover:bg-[#F5F6F7] cursor-pointer'
                          : 'bg-[#F8F9FA] text-[#9AA0A6] border-[#E2E5E8] cursor-not-allowed'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[11px] font-semibold flex items-center justify-center tabular-nums ${
                        isActive
                          ? 'bg-[#E53C2E] text-white'
                          : isCompleted
                            ? 'bg-emerald-100 text-[#15803D]'
                            : 'bg-[#F0F1F3] text-[#5F6368]'
                      }`}
                    >
                      {isCompleted && !isActive ? '✓' : step.num}
                    </span>
                    <span>{step.label}</span>
                  </button>
                </li>
                {index < 2 && <ChevronRight className="w-3.5 h-3.5 text-[#9AA0A6] hidden sm:inline" />}
              </React.Fragment>
            );
          })}
        </ol>

        {activeBatch && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5F6368]">
            <span className="font-medium text-[#231F20] truncate max-w-[220px]" title={activeBatch.fileName}>
              {activeBatch.fileName}
            </span>
            <span className={`px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${BATCH_STATUS_META[activeBatch.status].cls}`}>
              {BATCH_STATUS_META[activeBatch.status].label}
            </span>
          </div>
        )}
      </nav>

      {/* ============================================================ */}
      {/* STEP 1: UPLOAD                                                */}
      {/* ============================================================ */}
      {workflowStep === 'upload' && (
        <div className="space-y-4">
          <section className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#231F20]">Upload Financial or Customs File</h2>
                <p className="text-xs text-[#5F6368]">
                  Supports CSV and Excel (.xlsx) up to 5 MB and 2,500 rows. Macro-enabled workbooks (.xlsm) are blocked.
                </p>
              </div>
              {activeBatch && (
                <button
                  type="button"
                  onClick={() => setWorkflowStep('review')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md hover:bg-[#F0F1F3] whitespace-nowrap cursor-pointer"
                >
                  <span>Resume Active Batch</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void handleFileInput(e.dataTransfer.files?.[0]);
              }}
              className={`border border-dashed rounded-md px-5 py-7 text-center transition-colors ${
                dragActive ? 'border-[#E53C2E] bg-red-50/40' : 'border-[#C8CACD] bg-[#F8F9FA]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xlsm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleFileInput(file);
                }}
              />
              <UploadCloud className="w-7 h-7 text-[#E53C2E] mx-auto mb-2.5" />
              <p className="text-sm font-medium text-[#231F20]">
                {uploadBusy ? 'Parsing workbook and running validation checks...' : 'Drag and drop a CSV or XLSX file here'}
              </p>
              <p className="text-xs text-[#5F6368] mt-1">
                Processed locally in your browser. Schema detection and column matching run automatically.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{uploadBusy ? 'Processing...' : 'Select File'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSamplesOpen((v) => !v)}
                  aria-expanded={samplesOpen}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-[#5F6368]" />
                  <span>{samplesOpen ? 'Hide Sample Data & Templates' : 'Sample Data & Templates'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${samplesOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2.5 text-xs text-[#DC2626]">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Upload validation warning</p>
                  <p>{uploadError}</p>
                </div>
              </div>
            )}

            {/* Collapsible Sample Datasets & Blank Templates Drawer */}
            {samplesOpen && (
              <div className="border-t border-[#E2E5E8] pt-4 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Group 1: Sample Datasets */}
                  <div className="border border-[#E2E5E8] rounded-md p-4 space-y-3 bg-[#F8F9FA]">
                    <div>
                      <h3 className="text-xs font-semibold text-[#231F20]">Sample Datasets</h3>
                      <p className="text-[11px] text-[#5F6368]">
                        Load directly into the Review step or download as CSV.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {sampleDatasets.map((ds) => {
                        const shortTitle =
                          ds.fileName.includes('Clean')
                            ? 'Clean example'
                            : ds.fileName.includes('Anomalous')
                              ? 'Anomalous example'
                              : 'Unsupported example';
                        return (
                          <div
                            key={ds.id}
                            className="bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#231F20]">
                                {shortTitle}{' '}
                                <span className="font-normal text-[#5F6368]">({ds.fileName})</span>
                              </p>
                              <p className="text-[11px] text-[#5F6368] mt-0.5">{ds.description}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleLoadSampleDataset(ds.fileName, ds.csvContent)}
                                className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] whitespace-nowrap cursor-pointer"
                              >
                                Load & Review
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadCsv(ds.fileName, ds.csvContent)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
                                title={`Download ${ds.fileName}`}
                              >
                                <Download className="w-3 h-3" />
                                <span>CSV</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Group 2: Blank Templates */}
                  <div className="border border-[#E2E5E8] rounded-md p-4 space-y-3 bg-[#F8F9FA]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-[#231F20]">Blank Templates</h3>
                        <p className="text-[11px] text-[#5F6368]">
                          Standardized CSV templates with required SKYJACK schema headers.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSchemaGuideOpen((v) => !v)}
                        className="text-[11px] font-medium text-[#E53C2E] hover:underline whitespace-nowrap cursor-pointer"
                      >
                        {schemaGuideOpen ? 'Hide Field Specs' : 'View Field Specs'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {templateDatasets.map((ds) => {
                        const shortTitle = ds.fileName.includes('Ledger')
                          ? 'Financial transactions'
                          : 'Customs shipments';
                        return (
                          <div
                            key={ds.id}
                            className="bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#231F20]">
                                {shortTitle}{' '}
                                <span className="font-normal text-[#5F6368]">({ds.fileName})</span>
                              </p>
                              <p className="text-[11px] text-[#5F6368] mt-0.5">{ds.description}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadCsv(ds.fileName, ds.csvContent)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download Template</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {schemaGuideOpen && (
                      <div className="bg-white border border-[#E2E5E8] rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <p className="font-semibold text-[#231F20] mb-1">Financial Transactions Fields</p>
                          <ul className="space-y-0.5 text-[#5F6368]">
                            {LEDGER_SCHEMA_FIELDS.map((f) => (
                              <li key={f.field}>
                                <span className="font-medium text-[#231F20]">{f.field}</span>
                                {f.required ? ' (required)' : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-[#231F20] mb-1">Customs Shipments Fields</p>
                          <ul className="space-y-0.5 text-[#5F6368]">
                            {CUSTOMS_SCHEMA_FIELDS.map((f) => (
                              <li key={f.field}>
                                <span className="font-medium text-[#231F20]">{f.field}</span>
                                {f.required ? ' (required)' : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 2: REVIEW (Schema, Mapping, Visualization & Inspector)   */}
      {/* ============================================================ */}
      {workflowStep === 'review' && activeBatch && (
        <div className="space-y-4">
          {/* Card 1: Schema Detection, Worksheet & Column Mapping */}
          <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#231F20]">
                    {formatSchemaLabel(activeBatch.schemaType)}
                  </span>
                  <span className="text-xs text-[#5F6368] tabular-nums">
                    {activeBatch.fileName} · {formatFileSize(activeBatch.fileSizeBytes)} · {activeBatch.recordCount} rows
                  </span>
                  {hasAmbiguousMappings && (
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded border text-[#B45309] bg-amber-50 border-amber-200">
                      Ambiguous columns require confirmation
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5F6368]">{activeBatch.classificationReason}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(activeBatch.availableWorksheets ?? []).length > 1 && rawUploadBuffer && activeBatch.id === stagedSourceBatchId && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#5F6368] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-2.5 py-1.5">
                    <span>Worksheet</span>
                    <select
                      aria-label="Excel worksheet selector"
                      value={activeBatch.selectedWorksheet ?? activeBatch.availableWorksheets?.[0] ?? ''}
                      onChange={(e) => handleSwitchWorksheet(e.target.value)}
                      className="bg-transparent font-semibold text-[#231F20] focus:outline-none cursor-pointer"
                    >
                      {(activeBatch.availableWorksheets ?? []).map((ws) => (
                        <option key={ws} value={ws}>
                          {ws}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {activeBatch.columnMappings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMappingOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
                  >
                    <span>Column Mapping ({activeBatch.columnMappings.length})</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mappingOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRunGatewayAiAssist}
                  disabled={gatewayAiLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
                  <span>{gatewayAiLoading ? 'Analyzing...' : 'AI Mapping Assist'}</span>
                </button>
              </div>
            </div>

            {/* File-level Errors Banner */}
            {activeBatch.fileErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#DC2626]">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">File rejected at schema gate</p>
                    {activeBatch.fileErrors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkflowStep('upload')}
                  className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap self-start sm:self-center cursor-pointer"
                >
                  Upload Different File
                </button>
              </div>
            )}

            {/* Ambiguous Mapping Blocker */}
            {hasAmbiguousMappings && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2.5 text-xs text-[#B45309]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Ambiguous headers detected — manual confirmation required</p>
                  <p>
                    Resolve all ambiguous column mappings below before proceeding to final authorization.
                    {missingRequiredFields.length > 0 && ` Missing required fields: ${missingRequiredFields.join(', ')}.`}
                  </p>
                </div>
              </div>
            )}

            {/* Collapsible Column Mapping Grid */}
            {mappingOpen && activeBatch.columnMappings.length > 0 && (
              <div className="border-t border-[#E2E5E8] pt-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5F6368]">
                  <span>
                    Verify how source file columns map to the {formatSchemaLabel(activeBatch.schemaType)} schema.
                  </span>
                  {activeBatch.id !== stagedSourceBatchId && (
                    <span className="text-[11px] italic">
                      Viewing historical snapshot — re-upload file in Step 1 to modify mappings.
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto border border-[#E2E5E8] rounded-md">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                      <tr>
                        <th className="py-2 px-3 font-medium">Source Column</th>
                        <th className="py-2 px-3 font-medium">Target Schema Field</th>
                        <th className="py-2 px-3 font-medium">Detection Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E5E8]">
                      {activeBatch.columnMappings.map((m) => {
                        const isManual = activeBatch.id === stagedSourceBatchId && Boolean(mappingOverrides[m.sourceHeader]);
                        const targetSpecs =
                          activeBatch.schemaType === 'customs_shipments' ? CUSTOMS_SCHEMA_FIELDS : LEDGER_SCHEMA_FIELDS;
                        const canEditMapping = Boolean(rawUploadBuffer && activeBatch.id === stagedSourceBatchId);
                        const statusLabel = isManual
                          ? 'Manually confirmed'
                          : m.confidence === 'exact'
                            ? 'System-detected (exact)'
                            : m.confidence === 'alias'
                              ? 'System-detected (alias)'
                              : m.confidence === 'ambiguous'
                                ? 'Ambiguous — confirm mapping'
                                : 'Ignored (extra column)';

                        return (
                          <tr key={m.sourceHeader} className={m.confidence === 'ambiguous' ? 'bg-amber-50/40' : ''}>
                            <td className="py-2 px-3 font-medium text-[#231F20]">{m.sourceHeader}</td>
                            <td className="py-2 px-3">
                              {canEditMapping && activeBatch.schemaType !== 'unsupported' ? (
                                <select
                                  aria-label={`Map column ${m.sourceHeader}`}
                                  value={m.targetField ?? ''}
                                  onChange={(e) => handleUpdateColumnMapping(m.sourceHeader, e.target.value)}
                                  className={`text-xs rounded border px-2 py-1 bg-white focus:outline-none focus:border-[#231F20] ${
                                    m.confidence === 'ambiguous' ? 'border-amber-400 text-[#231F20]' : 'border-[#E2E5E8] text-[#231F20]'
                                  }`}
                                >
                                  <option value="">-- Ignore / Unmapped --</option>
                                  {targetSpecs.map((spec) => (
                                    <option key={spec.field} value={spec.field}>
                                      {spec.field}
                                      {spec.required ? ' *' : ''}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[#231F20]">{m.targetField ?? 'Unmapped'}</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                                  m.confidence === 'ambiguous'
                                    ? 'text-[#B45309] bg-amber-50 border-amber-200'
                                    : isManual
                                      ? 'text-[#1D4ED8] bg-blue-50 border-blue-200'
                                      : m.confidence === 'unmapped'
                                        ? 'text-[#5F6368] bg-[#F5F6F7] border-[#E2E5E8]'
                                        : 'text-[#15803D] bg-emerald-50 border-emerald-200'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Advisory AI Assist Output */}
            {gatewayAiError && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-[#B45309]">
                AI Mapping Assist unavailable: {gatewayAiError} Deterministic Rules A–H remain active.
              </div>
            )}

            {gatewayAiAssist && (
              <div className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#231F20] inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
                    AI Mapping & Anomaly Triage Advisory
                  </span>
                  <span className="text-[11px] text-[#5F6368]">Advisory only · requires user confirmation</span>
                </div>
                <p className="text-[#231F20] leading-relaxed">{gatewayAiAssist.batchAnomalySummary}</p>
                {gatewayAiAssist.recommendedReviewFocus.length > 0 && (
                  <ul className="list-disc pl-4 text-[#5F6368] space-y-0.5">
                    {gatewayAiAssist.recommendedReviewFocus.map((focus, idx) => (
                      <li key={idx}>{focus}</li>
                    ))}
                  </ul>
                )}
                {gatewayAiAssist.suggestedMappings.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {gatewayAiAssist.suggestedMappings.map((sug, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-[#E2E5E8] rounded px-2.5 py-1.5 flex items-center gap-2"
                      >
                        <span>
                          <strong>{sug.sourceHeader}</strong> → <strong>{sug.suggestedTargetField}</strong> ({sug.confidence})
                        </span>
                        {rawUploadBuffer && activeBatch.id === stagedSourceBatchId && (
                          <button
                            type="button"
                            onClick={() => handleUpdateColumnMapping(sug.sourceHeader, sug.suggestedTargetField)}
                            className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Card 2: Validation Results Visualization */}
          <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#231F20]">Validation Outcome Summary</h2>
                <p className="text-xs text-[#5F6368]">
                  Deterministic screening across Rules A–H. Quarantined and rejected rows cannot enter trusted reporting.
                </p>
              </div>
              {activeBatch.records.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleExportBatchReport(activeBatch)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Validation CSV</span>
                </button>
              )}
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="border border-[#E2E5E8] rounded-md p-3 bg-[#F8F9FA]">
                <p className="text-[11px] font-medium text-[#5F6368]">Total Records</p>
                <p className="text-xl font-semibold text-[#231F20] tabular-nums mt-0.5">{activeBatch.recordCount}</p>
              </div>
              <div className="border border-emerald-200 rounded-md p-3 bg-emerald-50/40">
                <p className="text-[11px] font-medium text-[#15803D]">Validated</p>
                <p className="text-xl font-semibold text-[#15803D] tabular-nums mt-0.5">
                  {activeBatch.validatedCount}{' '}
                  <span className="text-xs font-medium">({validatedPct}%)</span>
                </p>
              </div>
              <div className="border border-amber-200 rounded-md p-3 bg-amber-50/40">
                <p className="text-[11px] font-medium text-[#B45309]">Quarantined</p>
                <p className="text-xl font-semibold text-[#B45309] tabular-nums mt-0.5">
                  {activeBatch.quarantinedCount}{' '}
                  <span className="text-xs font-medium">({quarantinedPct}%)</span>
                </p>
              </div>
              <div className="border border-red-200 rounded-md p-3 bg-red-50/40">
                <p className="text-[11px] font-medium text-[#DC2626]">Rejected</p>
                <p className="text-xl font-semibold text-[#DC2626] tabular-nums mt-0.5">
                  {activeBatch.rejectedCount}{' '}
                  <span className="text-xs font-medium">({rejectedPct}%)</span>
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 border border-[#E2E5E8] rounded-md p-3 bg-white">
                <p className="text-[11px] font-medium text-[#5F6368]">Validated Value</p>
                <p className="text-xl font-semibold text-[#231F20] tabular-nums mt-0.5">
                  {formatCompactMoney(activeBatch.acceptedTotalCad)}
                </p>
              </div>
            </div>

            {/* Proportional Horizontal Stacked Bar */}
            {totalCount > 0 && (
              <div className="space-y-1.5">
                <div
                  className="h-3.5 w-full rounded-full overflow-hidden bg-[#F0F1F3] flex"
                  role="img"
                  aria-label={`Validation breakdown: ${activeBatch.validatedCount} validated, ${activeBatch.quarantinedCount} quarantined, ${activeBatch.rejectedCount} rejected`}
                >
                  {activeBatch.validatedCount > 0 && (
                    <div
                      style={{ width: `${(activeBatch.validatedCount / totalCount) * 100}%` }}
                      className="bg-[#16A34A] h-full transition-all"
                      title={`Validated: ${activeBatch.validatedCount} (${validatedPct}%)`}
                    />
                  )}
                  {activeBatch.quarantinedCount > 0 && (
                    <div
                      style={{ width: `${(activeBatch.quarantinedCount / totalCount) * 100}%` }}
                      className="bg-[#D97706] h-full transition-all"
                      title={`Quarantined: ${activeBatch.quarantinedCount} (${quarantinedPct}%)`}
                    />
                  )}
                  {activeBatch.rejectedCount > 0 && (
                    <div
                      style={{ width: `${(activeBatch.rejectedCount / totalCount) * 100}%` }}
                      className="bg-[#DC2626] h-full transition-all"
                      title={`Rejected: ${activeBatch.rejectedCount} (${rejectedPct}%)`}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6368]">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A]" /> Validated (eligible for commit)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#D97706]" /> Quarantined (routed to review)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626]" /> Rejected (blocked)
                    </span>
                  </div>
                  <span className="tabular-nums">
                    Accepted Total: <strong className="text-[#231F20]">{formatMoney(activeBatch.acceptedTotalCad)}</strong>
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Card 3: Filterable Row Results & Side-by-Side Row Inspector */}
          {activeBatch.records.length > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Row Results Table */}
              <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md overflow-hidden flex flex-col">
                <div className="p-3.5 border-b border-[#E2E5E8] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'ALL', label: `All (${activeBatch.recordCount})` },
                          { id: 'VALIDATED', label: `Validated (${activeBatch.validatedCount})` },
                          { id: 'QUARANTINED', label: `Quarantined (${activeBatch.quarantinedCount})` },
                          { id: 'REJECTED', label: `Rejected (${activeBatch.rejectedCount})` },
                        ] as const
                      ).map((pill) => (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => setOutcomeFilter(pill.id)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border whitespace-nowrap cursor-pointer transition-colors ${
                            outcomeFilter === pill.id
                              ? 'bg-[#231F20] text-white border-[#231F20]'
                              : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:text-[#231F20]'
                          }`}
                        >
                          {pill.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative flex-1 min-w-[180px] max-w-[240px]">
                      <Search className="w-3.5 h-3.5 text-[#9AA0A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rowSearch}
                        onChange={(e) => setRowSearch(e.target.value)}
                        placeholder="Search ID, rule, dept..."
                        className="w-full pl-8 pr-2.5 py-1 text-xs border border-[#E2E5E8] rounded bg-[#F8F9FA] text-[#231F20] focus:outline-none focus:bg-white focus:border-[#231F20]"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368] sticky top-0">
                      <tr>
                        <th className="py-2 px-3 font-medium">Row</th>
                        <th className="py-2 px-3 font-medium">Record ID</th>
                        <th className="py-2 px-3 font-medium">Status</th>
                        <th className="py-2 px-3 font-medium">Department</th>
                        <th className="py-2 px-3 font-medium text-right">Amount ({state.currency})</th>
                        <th className="py-2 px-3 font-medium">Triggered Rules</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E5E8]">
                      {visibleStagedRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#5F6368]">
                            No records match the current status filter or search query.
                          </td>
                        </tr>
                      ) : (
                        visibleStagedRows.map((row) => {
                          const isSelected = selectedStagedRow?.id === row.id;
                          return (
                            <tr
                              key={row.id}
                              onClick={() => setSelectedStagedRow(row)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#F5F6F7]' : 'hover:bg-[#F8F9FA]'
                              }`}
                            >
                              <td className="py-2 px-3 text-[#5F6368] tabular-nums">{row.rowNumber}</td>
                              <td className="py-2 px-3 font-semibold text-[#231F20] whitespace-nowrap">
                                {row.stableRecordId}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${OUTCOME_STYLE[row.outcome].cls}`}
                                >
                                  {OUTCOME_STYLE[row.outcome].label}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-[#231F20]">{row.department}</td>
                              <td className="py-2 px-3 text-right font-medium text-[#231F20] tabular-nums whitespace-nowrap">
                                {formatMoney(row.amountCad)}
                              </td>
                              <td className="py-2 px-3 text-[#5F6368]">
                                {row.ruleResults.length > 0
                                  ? row.ruleResults.map((r) => r.ruleCode).join(', ')
                                  : 'Cleared'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Row Inspector Panel */}
              <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3.5">
                {selectedStagedRow ? (
                  <>
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#E2E5E8]">
                      <div>
                        <p className="text-[11px] font-medium text-[#5F6368]">
                          Row {selectedStagedRow.rowNumber} Inspector
                        </p>
                        <h3 className="text-sm font-semibold text-[#231F20]">{selectedStagedRow.stableRecordId}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium ${OUTCOME_STYLE[selectedStagedRow.outcome].cls}`}
                      >
                        {OUTCOME_STYLE[selectedStagedRow.outcome].label}
                      </span>
                    </div>

                    {selectedStagedRow.isExistingConflict && (
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-[#B45309] flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Existing Record Conflict</p>
                          <p>{selectedStagedRow.conflictDetail ?? 'Record ID already exists in trusted repository.'}</p>
                        </div>
                      </div>
                    )}

                    {/* Triggered Rules & Reasons */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-[#231F20]">Screening Outcome & Triggered Rules</p>
                      {selectedStagedRow.ruleResults.length === 0 && selectedStagedRow.reasons.length === 0 ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2.5 text-xs text-[#15803D] flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Passed all deterministic Rules A–H. Eligible for commit authorization.</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedStagedRow.ruleResults.map((rule, idx) => (
                            <div key={idx} className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md p-2.5 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#231F20]">
                                  {rule.ruleCode} · {rule.ruleTitle}
                                </span>
                                <span
                                  className={`text-[11px] font-medium ${
                                    rule.severity === 'high' ? 'text-[#DC2626]' : 'text-[#B45309]'
                                  }`}
                                >
                                  {rule.severity === 'high' ? 'High Severity' : 'Review Required'}
                                </span>
                              </div>
                              <p className="text-[#5F6368]">{rule.message}</p>
                              <p className="text-[11px] text-[#231F20]">
                                <strong>Recommended:</strong> {rule.recommendedAction}
                              </p>
                            </div>
                          ))}
                          {selectedStagedRow.ruleResults.length === 0 &&
                            selectedStagedRow.reasons.map((reason, idx) => (
                              <div key={idx} className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-[#DC2626]">
                                {reason}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Side-by-Side Raw vs Normalized Comparison */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-[#231F20]">Original Raw vs. Normalized Values</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="border border-[#E2E5E8] rounded-md p-2.5 bg-[#F8F9FA] space-y-1 max-h-48 overflow-y-auto">
                          <p className="font-semibold text-[#5F6368] mb-1">Original Raw Row</p>
                          {Object.entries(selectedStagedRow.rawRow).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 border-b border-[#E2E5E8]/60 pb-0.5 last:border-b-0">
                              <span className="text-[#5F6368] truncate">{k}</span>
                              <span className="font-medium text-[#231F20] text-right break-all">{v || '—'}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border border-[#E2E5E8] rounded-md p-2.5 bg-white space-y-1 max-h-48 overflow-y-auto">
                          <p className="font-semibold text-[#5F6368] mb-1">Normalized Candidate</p>
                          {Object.entries(selectedStagedRow.normalizedData).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 border-b border-[#E2E5E8]/60 pb-0.5 last:border-b-0">
                              <span className="text-[#5F6368] truncate">{k}</span>
                              <span className="font-medium text-[#231F20] text-right break-all">
                                {v === undefined || v === null || v === '' ? '—' : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {selectedStagedRow.outcome === 'QUARANTINED' && canViewQueue && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenQuarantineForRow(selectedStagedRow)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B45309] bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100/70 cursor-pointer"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Inspect & Resolve in Pending Reviews</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[#5F6368] py-8 text-center">
                    Select any row from the table to inspect raw values, normalized schema fields, and triggered rules.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Step 2 Footer Actions */}
          <div className="bg-white border border-[#E2E5E8] rounded-md px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setWorkflowStep('upload')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Upload Different File</span>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {isBatchBlockedForAuthorization && (
                <span className="text-xs text-[#B45309]">
                  {activeBatch.schemaType === 'unsupported' || activeBatch.schemaType === 'incomplete'
                    ? 'Unsupported or incomplete schema cannot advance to authorization.'
                    : 'Resolve ambiguous column mappings before proceeding.'}
                </span>
              )}
              <button
                type="button"
                disabled={isBatchBlockedForAuthorization}
                onClick={() => setWorkflowStep('authorize')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                <span>Continue to Authorize</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* STEP 3: AUTHORIZE                                             */}
      {/* ============================================================ */}
      {workflowStep === 'authorize' && activeBatch && (
        <section className="bg-white border border-[#E2E5E8] rounded-md p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#E2E5E8]">
            <div>
              <h2 className="text-base font-semibold text-[#231F20]">Batch Authorization Summary</h2>
              <p className="text-xs text-[#5F6368]">
                Only validated records enter shared analytics upon Group Controller authorization. Quarantined and rejected rows remain isolated.
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded border text-xs font-medium ${BATCH_STATUS_META[activeBatch.status].cls}`}>
              {BATCH_STATUS_META[activeBatch.status].label}
            </span>
          </div>

          {/* Authorization Scope Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-md p-3.5">
              <p className="text-[11px] font-medium text-[#15803D]">Eligible Validated Rows</p>
              <p className="text-xl font-semibold text-[#15803D] tabular-nums mt-1">
                {activeBatch.validatedCount}
              </p>
              <p className="text-xs text-[#15803D] tabular-nums mt-0.5">
                {formatMoney(activeBatch.acceptedTotalCad)}
              </p>
            </div>
            <div className="border border-amber-200 bg-amber-50/40 rounded-md p-3.5">
              <p className="text-[11px] font-medium text-[#B45309]">Quarantined (Excluded)</p>
              <p className="text-xl font-semibold text-[#B45309] tabular-nums mt-1">
                {activeBatch.quarantinedCount}
              </p>
              <p className="text-xs text-[#5F6368] mt-0.5">Routed to Pending Reviews</p>
            </div>
            <div className="border border-red-200 bg-red-50/40 rounded-md p-3.5">
              <p className="text-[11px] font-medium text-[#DC2626]">Rejected (Blocked)</p>
              <p className="text-xl font-semibold text-[#DC2626] tabular-nums mt-1">
                {activeBatch.rejectedCount}
              </p>
              <p className="text-xs text-[#5F6368] mt-0.5">Never committed</p>
            </div>
            <div className="border border-[#E2E5E8] bg-[#F8F9FA] rounded-md p-3.5 space-y-1">
              <p className="text-[11px] font-medium text-[#5F6368]">Affected Scope</p>
              <p className="text-xs text-[#231F20]">
                <strong>Periods:</strong> {activeBatch.affectedPeriods.join(', ') || 'None'}
              </p>
              <p className="text-xs text-[#231F20]">
                <strong>Departments:</strong> {activeBatch.affectedDepartments.join(', ') || 'None'}
              </p>
            </div>
          </div>

          {/* Ambiguity / Zero-Validated Guards */}
          {isBatchBlockedForAuthorization && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#B45309]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Authorization is blocked while column mapping ambiguities or schema errors remain unresolved.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setWorkflowStep('review')}
                className="px-3 py-1.5 font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] cursor-pointer"
              >
                Return to Review
              </button>
            </div>
          )}

          {/* Role & Status Action Area */}
          {activeBatch.status === 'authorized_committed' ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-[#15803D]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    Authorized & Committed ({activeBatch.validatedCount} validated rows)
                  </p>
                  <p>
                    Committed on {activeBatch.authorizedAtIso ? new Date(activeBatch.authorizedAtIso).toLocaleString() : 'Session'}.
                    {activeBatch.quarantinedCount > 0 &&
                      ` ${activeBatch.quarantinedCount} quarantined row(s) remain isolated in Pending Reviews.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(activeBatch.schemaType === 'customs_shipments' ? '/trade' : '/financials')
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#231F20] rounded-md hover:bg-[#3A3536] cursor-pointer"
                >
                  <span>
                    {activeBatch.schemaType === 'customs_shipments'
                      ? 'View in Shipments & Trade'
                      : 'View in Financial Intelligence'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {activeBatch.quarantinedCount > 0 && canViewQueue && (
                  <button
                    type="button"
                    onClick={() => {
                      setQueueBatchFilter(activeBatch.id);
                      setActiveDrawer('reviews');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B45309] bg-white border border-amber-200 rounded-md hover:bg-amber-50 cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Review Quarantined Rows ({activeBatch.quarantinedCount})</span>
                  </button>
                )}
              </div>
            </div>
          ) : activeBatch.status === 'submitted_for_authorization' && !canAuthorizeImport ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-3 text-xs text-[#B45309]">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Awaiting Group Controller Authorization</p>
                  <p>
                    {activeBatch.validatedCount} validated record(s) have been routed to Group Controller Helen Park for final authorization. Analytics remain unchanged until authorized.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/approvals')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] cursor-pointer"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Open Approvals Queue</span>
                </button>
                {activeBatch.quarantinedCount > 0 && canViewQueue && (
                  <button
                    type="button"
                    onClick={() => {
                      setQueueBatchFilter(activeBatch.id);
                      setActiveDrawer('reviews');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B45309] bg-white border border-amber-200 rounded-md hover:bg-amber-50 cursor-pointer"
                  >
                    <span>Open Pending Reviews ({activeBatch.quarantinedCount})</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-[#E2E5E8] rounded-md p-4 space-y-4 bg-[#F8F9FA]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-semibold text-[#231F20]">
                    Acting Role: {activeUser.name} ({activeUser.title})
                  </p>
                  <p className="text-[#5F6368] mt-0.5">
                    {canAuthorizeImport
                      ? 'Your Group Controller authority can authorize and commit validated records directly to shared analytics.'
                      : 'Your role stages validated batches for Group Controller Helen Park and routes quarantined anomalies to Pending Reviews.'}
                  </p>
                </div>
              </div>

              {canAuthorizeImport && activeBatch.validatedCount > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#231F20] mb-1">
                    Authorization Note (optional)
                  </label>
                  <input
                    type="text"
                    value={authReason}
                    onChange={(e) => setAuthReason(e.target.value)}
                    placeholder="e.g., Reconciled against period close checklist and broker contract limits"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5E8] rounded-md text-[#231F20] focus:outline-none focus:border-[#231F20]"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWorkflowStep('review')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Review</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {activeBatch.status === 'staged_preview' && !canAuthorizeImport && (
                    <button
                      type="button"
                      disabled={isBatchBlockedForAuthorization}
                      onClick={() => submitBatchForAuthorization(activeBatch.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#E53C2E] rounded-md hover:bg-[#C93225] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>
                        {activeBatch.validatedCount > 0
                          ? 'Submit for Authorization'
                          : 'Route Quarantine to Pending Reviews'}
                      </span>
                    </button>
                  )}

                  {canAuthorizeImport && (
                    <>
                      {activeBatch.status === 'staged_preview' && activeBatch.quarantinedCount > 0 && (
                        <button
                          type="button"
                          disabled={isBatchBlockedForAuthorization}
                          onClick={() => submitBatchForAuthorization(activeBatch.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] disabled:opacity-40 whitespace-nowrap cursor-pointer"
                        >
                          <span>Stage & Route Quarantine Only</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isBatchBlockedForAuthorization || activeBatch.validatedCount === 0}
                        onClick={() => authorizeAndCommitBatch(activeBatch.id, authReason || undefined)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#E53C2E] rounded-md hover:bg-[#C93225] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Authorize Validated Records ({activeBatch.validatedCount})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============================================================ */}
      {/* SECONDARY DRAWER 1: PENDING REVIEWS (QUARANTINE QUEUE)        */}
      {/* ============================================================ */}
      {activeDrawer === 'reviews' && (
        <div className="fixed inset-0 z-50 bg-black/35 flex justify-end" role="dialog" aria-modal="true" aria-label="Pending Reviews">
          <div className="bg-[#F8F9FA] w-full max-w-5xl h-full overflow-y-auto border-l border-[#E2E5E8] flex flex-col">
            <div className="bg-white border-b border-[#E2E5E8] px-5 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-10">
              <div>
                <h2 className="text-base font-semibold text-[#231F20]">
                  Pending Reviews ({state.reviewQueueItems.length})
                </h2>
                <p className="text-xs text-[#5F6368]">
                  Inspect quarantined records, attach evidence, escalate to investigations, or resolve under role permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer('none')}
                className="p-1.5 rounded-md text-[#5F6368] hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer"
                aria-label="Close Pending Reviews"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {!canViewQueue ? (
                <UnavailableDataState
                  title={`Quarantine review restricted for ${activeUser.title}`}
                  description="Switch to Group Controller, Senior Cost Accountant, or Trade Compliance Coordinator to review quarantined items."
                  actionLabel="Open Settings"
                  onAction={() => {
                    setActiveDrawer('none');
                    navigate('/settings');
                  }}
                />
              ) : (
                <>
                  {/* Filter Strip */}
                  <div className="bg-white border border-[#E2E5E8] rounded-md p-3 flex flex-wrap items-center gap-2 text-xs">
                    <Filter className="w-3.5 h-3.5 text-[#5F6368]" />
                    <select
                      aria-label="Filter by schema"
                      value={queueSchemaFilter}
                      onChange={(e) => setQueueSchemaFilter(e.target.value as 'all' | 'ledger_transactions' | 'customs_shipments')}
                      className="border border-[#E2E5E8] rounded px-2 py-1 bg-[#F8F9FA] text-[#231F20]"
                    >
                      <option value="all">All Schemas</option>
                      <option value="ledger_transactions">Ledger Transactions</option>
                      <option value="customs_shipments">Customs & Shipments</option>
                    </select>
                    <select
                      aria-label="Filter by department"
                      value={queueDeptFilter}
                      onChange={(e) => setQueueDeptFilter(e.target.value)}
                      className="border border-[#E2E5E8] rounded px-2 py-1 bg-[#F8F9FA] text-[#231F20]"
                    >
                      <option value="all">All Departments</option>
                      {queueDepartments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by severity"
                      value={queueSeverityFilter}
                      onChange={(e) => setQueueSeverityFilter(e.target.value as 'all' | 'high' | 'medium' | 'info')}
                      className="border border-[#E2E5E8] rounded px-2 py-1 bg-[#F8F9FA] text-[#231F20]"
                    >
                      <option value="all">All Severities</option>
                      <option value="high">High Severity</option>
                      <option value="medium">Medium Severity</option>
                    </select>
                    <select
                      aria-label="Filter by workflow status"
                      value={queueStatusFilter}
                      onChange={(e) => setQueueStatusFilter(e.target.value as 'all' | ReviewWorkflowStatus)}
                      className="border border-[#E2E5E8] rounded px-2 py-1 bg-[#F8F9FA] text-[#231F20]"
                    >
                      <option value="all">All Statuses</option>
                      <option value="Submitted">Submitted</option>
                      <option value="In Review">In Review</option>
                      <option value="Additional Evidence Required">Additional Evidence Required</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                    <select
                      aria-label="Filter by import batch"
                      value={queueBatchFilter}
                      onChange={(e) => setQueueBatchFilter(e.target.value)}
                      className="border border-[#E2E5E8] rounded px-2 py-1 bg-[#F8F9FA] text-[#231F20] max-w-[200px]"
                    >
                      <option value="all">All Import Batches</option>
                      {state.importBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.fileName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {reviewFeedback && (
                    <div
                      className={`rounded-md p-3 text-xs border ${
                        reviewFeedback.ok
                          ? 'bg-emerald-50 border-emerald-200 text-[#15803D]'
                          : 'bg-amber-50 border-amber-200 text-[#B45309]'
                      }`}
                    >
                      {reviewFeedback.message}
                    </div>
                  )}

                  {filteredQueueItems.length === 0 ? (
                    <div className="bg-white border border-[#E2E5E8] rounded-md p-8 text-center text-xs text-[#5F6368]">
                      No quarantined records match the selected filters. Submit a batch with quarantined rows or clear active filters.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Queue List */}
                      <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8] max-h-[650px] overflow-y-auto">
                        {filteredQueueItems.map((item) => {
                          const isSelected = selectedQueueItem?.id === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedQueueId(item.id);
                                setReviewReason(item.resolutionNote ?? '');
                                setReviewFeedback(null);
                              }}
                              className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                                isSelected ? 'bg-[#F5F6F7]' : 'hover:bg-[#F8F9FA]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-[#231F20]">{item.stableRecordId}</span>
                                <span
                                  className={`px-2 py-0.5 rounded border text-[11px] font-medium ${REVIEW_STATUS_STYLE[item.reviewStatus]}`}
                                >
                                  {item.reviewStatus}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-1 text-xs text-[#5F6368]">
                                <span>
                                  {item.department} · {item.accountingPeriod}
                                </span>
                                <span className="font-semibold text-[#231F20] tabular-nums">
                                  {formatMoney(item.amountCad)}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#B45309] mt-1 line-clamp-2">
                                {item.ruleResults.map((r) => r.ruleCode).join(', ') || item.reasons[0]}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Queue Inspector */}
                      {selectedQueueItem && (
                        <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#E2E5E8]">
                            <div>
                              <h3 className="text-sm font-semibold text-[#231F20]">
                                {selectedQueueItem.stableRecordId} · {formatSchemaLabel(selectedQueueItem.schemaType)}
                              </h3>
                              <p className="text-xs text-[#5F6368]">
                                {selectedQueueItem.department} · {selectedQueueItem.accountingPeriod} ·{' '}
                                <strong className="text-[#231F20] tabular-nums">{formatMoney(selectedQueueItem.amountCad)}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-medium ${REVIEW_STATUS_STYLE[selectedQueueItem.reviewStatus]}`}
                              >
                                {selectedQueueItem.reviewStatus}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const res = promoteQuarantinedToInvestigation(selectedQueueItem.id);
                                  setReviewFeedback({ ok: res.ok, message: res.message });
                                  if (res.ok) {
                                    setActiveDrawer('none');
                                    navigate('/investigations');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded hover:bg-[#F0F1F3] cursor-pointer"
                              >
                                <span>Promote to Investigation</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {selectedQueueItem.isExistingConflict && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-[#B45309] flex items-start gap-2">
                              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold">Existing Record Conflict Lock</p>
                                <p>
                                  {selectedQueueItem.conflictDetail ??
                                    'Existing ID conflicts cannot be released into authorized analytics directly; mark Resolved or Reject.'}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Triggered Rules */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-[#231F20]">Triggered Governance Rules</p>
                            <div className="space-y-2">
                              {selectedQueueItem.ruleResults.map((r, i) => (
                                <div key={i} className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md p-2.5 text-xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-[#231F20]">
                                      {r.ruleCode} · {r.ruleTitle}
                                    </span>
                                    <span className="text-[11px] text-[#5F6368]">{r.severity}</span>
                                  </div>
                                  <p className="text-[#5F6368]">{r.message}</p>
                                  <p className="text-[11px] text-[#231F20]">
                                    <strong>Action:</strong> {r.recommendedAction}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Raw vs Normalized */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                            <div className="border border-[#E2E5E8] rounded-md p-2.5 bg-[#F8F9FA] max-h-36 overflow-y-auto space-y-1">
                              <p className="font-semibold text-[#5F6368]">Original Raw Row</p>
                              {Object.entries(selectedQueueItem.rawRow).map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-2">
                                  <span className="text-[#5F6368] truncate">{k}</span>
                                  <span className="font-medium text-[#231F20] text-right">{v || '—'}</span>
                                </div>
                              ))}
                            </div>
                            <div className="border border-[#E2E5E8] rounded-md p-2.5 bg-white max-h-36 overflow-y-auto space-y-1">
                              <p className="font-semibold text-[#5F6368]">Normalized Candidate</p>
                              {Object.entries(selectedQueueItem.normalizedData).map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-2">
                                  <span className="text-[#5F6368] truncate">{k}</span>
                                  <span className="font-medium text-[#231F20] text-right">
                                    {v === undefined || v === null || v === '' ? '—' : String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Related Records */}
                          {relatedExistingRecords.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-[#231F20]">Related Case & Repository Records</p>
                              <div className="border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8] text-xs">
                                {relatedExistingRecords.map((hit) => (
                                  <div key={hit.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                    <span className="text-[#231F20] truncate">
                                      <strong>{hit.id}</strong> · {hit.label} ({hit.source})
                                    </span>
                                    <span className="tabular-nums font-medium text-[#231F20] shrink-0">
                                      {formatMoney(hit.amountCad)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Evidence Attachment */}
                          <div className="border-t border-[#E2E5E8] pt-3 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-[#231F20] inline-flex items-center gap-1.5">
                                <Paperclip className="w-3.5 h-3.5 text-[#5F6368]" />
                                Supporting Evidence ({selectedQueueEvidence.length})
                              </p>
                            </div>
                            {selectedQueueEvidence.length > 0 && (
                              <div className="space-y-1.5">
                                {selectedQueueEvidence.map((ev) => (
                                  <div key={ev.id} className="bg-[#F8F9FA] border border-[#E2E5E8] rounded px-3 py-2 text-xs">
                                    <p className="font-medium text-[#231F20]">{ev.title}</p>
                                    <p className="text-[#5F6368]">{ev.summary}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <form onSubmit={handleAttachQueueEvidence} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <input
                                type="text"
                                required
                                value={evTitle}
                                onChange={(e) => setEvTitle(e.target.value)}
                                placeholder="Evidence title (e.g., Signed PO / Origin Cert)"
                                className="px-2.5 py-1.5 border border-[#E2E5E8] rounded bg-[#F8F9FA] focus:bg-white focus:outline-none"
                              />
                              <select
                                value={evSourceType}
                                onChange={(e) => setEvSourceType(e.target.value as EvidenceSourceType)}
                                className="px-2.5 py-1.5 border border-[#E2E5E8] rounded bg-[#F8F9FA] focus:bg-white focus:outline-none"
                              >
                                <option value="reference">Case / ERP Reference</option>
                                <option value="invoice">Vendor Invoice</option>
                                <option value="customs_declaration">Customs Declaration</option>
                                <option value="contract_schedule">Contract Schedule</option>
                              </select>
                              <input
                                type="text"
                                required
                                value={evSummary}
                                onChange={(e) => setEvSummary(e.target.value)}
                                placeholder="Summary or verification note..."
                                className="sm:col-span-2 px-2.5 py-1.5 border border-[#E2E5E8] rounded bg-[#F8F9FA] focus:bg-white focus:outline-none"
                              />
                              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                                <label className="text-[11px] text-[#5F6368] cursor-pointer hover:text-[#231F20]">
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) setEvFileMeta({ name: f.name, size: f.size });
                                    }}
                                  />
                                  {evFileMeta ? `Attached: ${evFileMeta.name}` : '+ Attach file reference (metadata only)'}
                                </label>
                                <button
                                  type="submit"
                                  className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer"
                                >
                                  Add Evidence
                                </button>
                              </div>
                            </form>
                          </div>

                          {/* Reviewer Decision Controls */}
                          {(() => {
                            const roleScope = canUserReviewItem(activeUser, {
                              schemaType: selectedQueueItem.schemaType,
                              department: selectedQueueItem.department,
                            });
                            return (
                              <div className="border-t border-[#E2E5E8] pt-3 space-y-2.5">
                                <p className="text-xs font-semibold text-[#231F20]">Reviewer Decision</p>
                                {!roleScope.allowed ? (
                                  <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-[#B45309]">
                                    {roleScope.reason}
                                  </div>
                                ) : (
                                  <>
                                    <textarea
                                      rows={2}
                                      value={reviewReason}
                                      onChange={(e) => setReviewReason(e.target.value)}
                                      placeholder="Mandatory justification note for Resolved, Approved, Rejected, or items >= CAD 250,000..."
                                      className="w-full px-3 py-2 text-xs border border-[#E2E5E8] rounded-md bg-[#F8F9FA] focus:bg-white focus:outline-none focus:border-[#231F20]"
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const r = updateReviewQueueItem(selectedQueueItem.id, {
                                            status: 'In Review',
                                            reason: reviewReason || 'Assigned for active verification',
                                          });
                                          setReviewFeedback(r);
                                        }}
                                        className="px-2.5 py-1.5 text-xs font-medium text-[#1D4ED8] bg-blue-50 border border-blue-200 rounded hover:bg-blue-100/70 cursor-pointer"
                                      >
                                        Mark In Review
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const r = updateReviewQueueItem(selectedQueueItem.id, {
                                            status: 'Additional Evidence Required',
                                            reason: reviewReason || 'Supporting invoice / origin certificate requested',
                                          });
                                          setReviewFeedback(r);
                                        }}
                                        className="px-2.5 py-1.5 text-xs font-medium text-[#B45309] bg-amber-50 border border-amber-200 rounded hover:bg-amber-100/70 cursor-pointer"
                                      >
                                        Request Evidence
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const r = updateReviewQueueItem(selectedQueueItem.id, {
                                            status: 'Resolved',
                                            reason: reviewReason,
                                          });
                                          setReviewFeedback(r);
                                        }}
                                        className="px-2.5 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer"
                                      >
                                        Mark Resolved
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canAuthorizeImport || selectedQueueItem.isExistingConflict}
                                        onClick={() => {
                                          const r = updateReviewQueueItem(selectedQueueItem.id, {
                                            status: 'Approved',
                                            reason: reviewReason,
                                            releaseToAuthorized: true,
                                          });
                                          setReviewFeedback(r);
                                        }}
                                        title={
                                          !canAuthorizeImport
                                            ? 'Requires Group Controller (Helen Park)'
                                            : selectedQueueItem.isExistingConflict
                                              ? 'Existing conflict items cannot be released'
                                              : 'Approve & release to analytics'
                                        }
                                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#15803D] rounded hover:bg-[#166534] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                      >
                                        Approve & Release
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const r = updateReviewQueueItem(selectedQueueItem.id, {
                                            status: 'Rejected',
                                            reason: reviewReason,
                                          });
                                          setReviewFeedback(r);
                                        }}
                                        className="px-2.5 py-1.5 text-xs font-medium text-[#DC2626] bg-red-50 border border-red-200 rounded hover:bg-red-100/70 cursor-pointer"
                                      >
                                        Reject Record
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECONDARY DRAWER 2: IMPORT HISTORY                            */}
      {/* ============================================================ */}
      {activeDrawer === 'history' && (
        <div className="fixed inset-0 z-50 bg-black/35 flex justify-end" role="dialog" aria-modal="true" aria-label="Import History">
          <div className="bg-[#F8F9FA] w-full max-w-4xl h-full overflow-y-auto border-l border-[#E2E5E8] flex flex-col">
            <div className="bg-white border-b border-[#E2E5E8] px-5 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-10">
              <div>
                <h2 className="text-base font-semibold text-[#231F20]">
                  Import History ({state.importBatches.length})
                </h2>
                <p className="text-xs text-[#5F6368]">
                  Session staging & authorization ledger. Inspect reloads parsed validation records without modifying committed data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer('none')}
                className="p-1.5 rounded-md text-[#5F6368] hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer"
                aria-label="Close Import History"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {state.importBatches.length === 0 ? (
                <div className="bg-white border border-[#E2E5E8] rounded-md p-8 text-center space-y-2">
                  <FileText className="w-6 h-6 text-[#9AA0A6] mx-auto" />
                  <p className="text-sm font-medium text-[#231F20]">No files imported in this session yet</p>
                  <p className="text-xs text-[#5F6368]">
                    Upload a CSV/XLSX workbook or load a sample dataset in Step 1 to begin tracking import batches.
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative max-w-xs">
                    <Search className="w-3.5 h-3.5 text-[#9AA0A6] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Filter by file name or status..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E5E8] rounded-md focus:outline-none focus:border-[#231F20]"
                    />
                  </div>

                  <div className="bg-white border border-[#E2E5E8] rounded-md overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">File</th>
                          <th className="py-2.5 px-3 font-medium">Schema</th>
                          <th className="py-2.5 px-3 font-medium">Uploaded</th>
                          <th className="py-2.5 px-3 font-medium text-right">Val / Quar / Rej</th>
                          <th className="py-2.5 px-3 font-medium text-right">Accepted ({state.currency})</th>
                          <th className="py-2.5 px-3 font-medium">Status</th>
                          <th className="py-2.5 px-3 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E5E8]">
                        {filteredHistoryBatches.map((batch) => {
                          const uploader = DEMO_USERS.find((u) => u.id === batch.uploadedByUserId)?.name ?? batch.uploadedByUserId;
                          return (
                            <tr key={batch.id} className="hover:bg-[#F8F9FA]">
                              <td className="py-2.5 px-3">
                                <p className="font-semibold text-[#231F20]">{batch.fileName}</p>
                                <p className="text-[11px] text-[#5F6368]">{uploader}</p>
                              </td>
                              <td className="py-2.5 px-3 text-[#231F20]">{formatSchemaLabel(batch.schemaType)}</td>
                              <td className="py-2.5 px-3 text-[#5F6368] tabular-nums whitespace-nowrap">
                                {new Date(batch.createdAtIso).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                                <span className="text-[#15803D] font-semibold">{batch.validatedCount}</span>
                                {' / '}
                                <span className="text-[#B45309] font-semibold">{batch.quarantinedCount}</span>
                                {' / '}
                                <span className="text-[#DC2626] font-semibold">{batch.rejectedCount}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-[#231F20] tabular-nums whitespace-nowrap">
                                {formatMoney(batch.acceptedTotalCad)}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded border text-[11px] font-medium ${BATCH_STATUS_META[batch.status].cls}`}>
                                  {BATCH_STATUS_META[batch.status].label}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleInspectHistoryBatch(batch)}
                                  className="px-2.5 py-1 text-[11px] font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECONDARY DRAWER 3: VALIDATION RULES (A–H)                    */}
      {/* ============================================================ */}
      {activeDrawer === 'rules' && (
        <div className="fixed inset-0 z-50 bg-black/35 flex justify-end" role="dialog" aria-modal="true" aria-label="Validation Rules">
          <div className="bg-[#F8F9FA] w-full max-w-3xl h-full overflow-y-auto border-l border-[#E2E5E8] flex flex-col">
            <div className="bg-white border-b border-[#E2E5E8] px-5 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-10">
              <div>
                <h2 className="text-base font-semibold text-[#231F20]">Deterministic Validation Rules (A–H)</h2>
                <p className="text-xs text-[#5F6368]">
                  Active screening rules enforced on every CSV and XLSX upload. Thresholds sync live with Settings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer('none')}
                className="p-1.5 rounded-md text-[#5F6368] hover:text-[#231F20] hover:bg-[#F5F6F7] cursor-pointer"
                aria-label="Close Validation Rules"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 flex-1">
              {gatewayRuleSpecs.map((rule) => {
                const expanded = expandedRuleId === rule.code;
                return (
                  <div key={rule.code} className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedRuleId(expanded ? null : rule.code)}
                      className="w-full px-4 py-3 text-left flex items-start justify-between gap-3 hover:bg-[#F8F9FA] cursor-pointer"
                    >
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[#231F20]">
                            {rule.code} · {rule.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                              rule.outcome === 'Rejected'
                                ? 'text-[#DC2626] bg-red-50 border-red-200'
                                : 'text-[#B45309] bg-amber-50 border-amber-200'
                            }`}
                          >
                            {rule.outcome}
                          </span>
                        </div>
                        <p className="text-xs text-[#5F6368]">{rule.summary}</p>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-[#5F6368] shrink-0 mt-0.5 transition-transform ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3 pt-2 border-t border-[#E2E5E8] bg-[#F8F9FA] text-xs space-y-1.5 text-[#5F6368]">
                        <p>
                          <strong className="text-[#231F20]">Condition:</strong> {rule.technical}
                        </p>
                        <p>
                          <strong className="text-[#231F20]">Example:</strong> {rule.example}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="bg-white border border-[#E2E5E8] rounded-md p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2 text-[#5F6368]">
                  <Info className="w-4 h-4 text-[#231F20] shrink-0 mt-0.5" />
                  <span>
                    Thresholds are governed centrally by the Group Controller and cannot be bypassed inside Data Gateway.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDrawer('none');
                    navigate('/settings');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-[#231F20] bg-[#F8F9FA] border border-[#E2E5E8] rounded-md hover:bg-[#F0F1F3] whitespace-nowrap cursor-pointer"
                >
                  <span>Configure Thresholds in Settings</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
