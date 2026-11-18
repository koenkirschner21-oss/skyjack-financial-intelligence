import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  Loader2,
  Plus,
  Presentation,
  Printer,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { REGIONS, REPORTING_PERIODS } from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import { ReportDatasetExportKey } from '../domain/permissions';
import {
  buildDefaultReportConfig,
  buildReportAiContextPacket,
  buildReportRenderModel,
  DATASET_SCOPE_LABELS,
  getPermittedSectionsForUser,
  getPermittedTemplatesForUser,
  REPORT_TEMPLATES,
} from '../domain/reportEngine';
import { requestAiReportExecutiveSummary } from '../services/aiService';
import {
  buildReportFileName,
  generatePptxPresentation,
  triggerBrowserFileDownload,
} from '../services/pptxExportService';
import {
  buildConsolidatedExcelWorkbook,
  generateDatasetCsvExport,
} from '../services/spreadsheetExportService';
import {
  QuarterId,
  RegionId,
  ReportChartType,
  ReportConfiguration,
  ReportDatasetScope,
  ReportSectionGroup,
  ReportSectionId,
  ReportTemplateId,
} from '../types/domain';
import { PageHeader, UnavailableDataState } from '../components/common/StateViews';
import { PrintManagementBriefModal } from '../components/reports/PrintManagementBriefModal';
import { ReportPresentationPreview } from '../components/reports/ReportPresentationPreview';

type StudioView = 'create' | 'my_reports';
type EditorSectionKey = 'setup' | 'contents' | 'finishing';

const SECTION_GROUPS: { key: ReportSectionGroup; label: string }[] = [
  { key: 'FINANCIAL PERFORMANCE', label: 'Financial Performance' },
  { key: 'REGIONAL INTELLIGENCE', label: 'Regional Intelligence' },
  { key: 'TRADE INTELLIGENCE', label: 'Trade Intelligence' },
  { key: 'FINANCIAL GOVERNANCE', label: 'Financial Governance' },
  { key: 'STRATEGIC INTELLIGENCE', label: 'Strategic Intelligence' },
];

const CHART_TYPE_LABELS: Record<ReportChartType, string> = {
  table: 'Data Table',
  bar: 'Bar Chart',
  line: 'Line Chart',
  stacked_bar: 'Stacked Bar',
  waterfall: 'Waterfall Bridge',
  kpi_grid: 'KPI Grid',
};

const CSV_DATASET_LABELS: Record<ReportDatasetExportKey, string> = {
  income_statements: 'Income Statements (8 Quarters)',
  irregular_costs: 'Irregular Costs (Scoped)',
  customs_entries: 'Customs Entries (Q3 2026)',
  broker_reconciliation: 'Broker Contract Audit (0.2%)',
  tariff_scenarios: 'Saved Tariff Scenarios',
  investigations: 'Investigation Summaries',
  opportunities: 'Cost Opportunities',
  authorized_uploads: 'Authorized Uploaded Records',
};

const DEPARTMENTS = [
  'all',
  'Operations',
  'Logistics',
  'Procurement',
  'Finance',
  'Sales',
  'Customs and Trade',
];

const REGION_OR_DEPT_SENSITIVE_SECTIONS = new Set<ReportSectionId>([
  'reg_irregular_costs',
  'reg_dept_irregular_costs',
  'gov_investigation_summary',
  'gov_outstanding_approvals',
  'gov_evidence_requirements',
  'str_quarter_end_readiness',
]);

export const ReportStudioPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    reportPreset,
    clearReportPreset,
    saveReportConfig,
    duplicateReportConfig,
    deleteReportConfig,
    recordReportExport,
    recordAiAuditEvent,
  } = useApp();

  const canGenerate = hasPermission('generate_reports');
  const permittedTemplates = useMemo(() => getPermittedTemplatesForUser(activeUser), [activeUser]);
  const permittedSections = useMemo(() => getPermittedSectionsForUser(activeUser), [activeUser]);

  const [activeView, setActiveView] = useState<StudioView>('create');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [openEditorSection, setOpenEditorSection] = useState<EditorSectionKey>('setup');
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [showKpiPicker, setShowKpiPicker] = useState(false);
  const [showSectionLibrary, setShowSectionLibrary] = useState(false);
  const [sectionSearch, setSectionSearch] = useState('');

  const [showExportHistory, setShowExportHistory] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [config, setConfig] = useState<ReportConfiguration>(() => {
    const firstTpl = permittedTemplates[0]?.id ?? 'custom_report';
    return buildDefaultReportConfig(firstTpl, activeUser, {
      reportingPeriod: 'Q3 2026',
      regionFilter: 'all',
    });
  });

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedCsvKey, setSelectedCsvKey] = useState<ReportDatasetExportKey>('irregular_costs');

  // AI Executive Summary states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Sync cross-module launch presets cleanly
  useEffect(() => {
    if (!reportPreset || !canGenerate) return;
    const nextCfg = buildDefaultReportConfig(reportPreset.templateId, activeUser, {
      title: reportPreset.title,
      reportingPeriod: reportPreset.reportingPeriod ?? state.selectedQuarterId,
      comparisonType: reportPreset.comparisonType,
      regionFilter: reportPreset.regionFilter ?? 'all',
      departmentFilter: reportPreset.departmentFilter ?? 'all',
      datasetScope: reportPreset.datasetScope,
      includedSections: reportPreset.includedSections,
      focusedRecordIds: reportPreset.focusedRecordIds,
      managementCommentary: reportPreset.managementCommentary,
    });
    setConfig(nextCfg);
    setActiveView('create');
    setWizardStep(1);
    setActiveSlideIdx(0);
    setExportFeedback(null);
    clearReportPreset();
  }, [reportPreset, canGenerate, activeUser, state.selectedQuarterId, clearReportPreset]);

  // Re-scope config safely if demonstration role changes
  useEffect(() => {
    if (!canGenerate) return;
    const allowedTplIds = new Set(permittedTemplates.map((t) => t.id));
    const allowedSecIds = new Set(permittedSections.map((s) => s.id));
    setConfig((prev) => {
      const nextTpl = allowedTplIds.has(prev.templateId)
        ? prev.templateId
        : (permittedTemplates[0]?.id ?? 'custom_report');
      const filteredSecs = prev.includedSections.filter((id) => allowedSecIds.has(id));
      const fallbackSecs =
        filteredSecs.length > 0
          ? filteredSecs
          : buildDefaultReportConfig(nextTpl, activeUser).includedSections;
      return {
        ...prev,
        templateId: nextTpl,
        includedSections: fallbackSecs,
      };
    });
  }, [activeUser.roleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reportModel = useMemo(
    () => buildReportRenderModel(config, state, activeUser, state.currency),
    [config, state, activeUser]
  );

  useEffect(() => {
    if (
      reportModel.policy.allowedCsvDatasets.length > 0 &&
      !reportModel.policy.allowedCsvDatasets.includes(selectedCsvKey)
    ) {
      setSelectedCsvKey(reportModel.policy.allowedCsvDatasets[0]);
    }
  }, [reportModel.policy.allowedCsvDatasets, selectedCsvKey]);

  if (!canGenerate) {
    return (
      <div className="space-y-5">
        <PageHeader title="Report Studio" />
        <UnavailableDataState
          title={`Report Studio is restricted for ${activeUser.title}`}
          description="Operational Contributors cannot generate or export executive financial or customs reports. Switch to Helen Park (Group Controller), Dana Morales (Cost Accountant), or Marco Silva (Customs & Trade Coordinator) to access role-scoped reporting."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const activePeriodMeta =
    REPORTING_PERIODS.find((p) => p.id === config.reportingPeriod) ?? REPORTING_PERIODS[7];
  const supportsYoY = Boolean(activePeriodMeta.priorYearQuarterId);
  const supportsQoQ = Boolean(activePeriodMeta.priorQuarterId);
  const supportsAnyComparison = supportsYoY || supportsQoQ;

  // Only show Region and Department filters when the active report & period data actually use them
  const regionDeptScopeApplies =
    (activePeriodMeta.hasIrregularCostBreakdown &&
      config.includedSections.some(
        (id) => id === 'reg_irregular_costs' || id === 'reg_dept_irregular_costs'
      )) ||
    config.includedSections.some((id) => REGION_OR_DEPT_SENSITIVE_SECTIONS.has(id)) ||
    (config.datasetScope !== 'official_case_data' &&
      state.uploadedLedgerTransactions.some((t) => t.accountingPeriod === config.reportingPeriod)) ||
    config.regionFilter !== 'all' ||
    config.departmentFilter !== 'all';

  const handleApplyTemplate = (templateId: ReportTemplateId) => {
    const tpl = REPORT_TEMPLATES.find((t) => t.id === templateId);
    const tplSupportsFilter = tpl?.defaultSections.some((id) =>
      REGION_OR_DEPT_SENSITIVE_SECTIONS.has(id)
    );
    let nextCompType = tpl?.defaultComparisonType ?? config.comparisonType;
    if (nextCompType === 'YoY' && !supportsYoY) {
      nextCompType = supportsQoQ ? 'QoQ' : 'None';
    } else if (nextCompType === 'QoQ' && !supportsQoQ) {
      nextCompType = supportsYoY ? 'YoY' : 'None';
    }

    const fresh = buildDefaultReportConfig(templateId, activeUser, {
      reportingPeriod: config.reportingPeriod,
      comparisonType: nextCompType,
      regionFilter: tplSupportsFilter ? config.regionFilter : 'all',
      departmentFilter: tplSupportsFilter ? config.departmentFilter : 'all',
    });
    setConfig(fresh);
    setActiveSlideIdx(0);
    setExportFeedback(null);
    setSavedNotice(false);
    setOpenEditorSection('contents');
  };

  const handlePeriodChange = (nextPeriod: QuarterId) => {
    const pMeta = REPORTING_PERIODS.find((p) => p.id === nextPeriod);
    setConfig((prev) => {
      let nextCompType = prev.comparisonType;
      if (nextCompType === 'YoY' && !pMeta?.priorYearQuarterId) {
        nextCompType = pMeta?.priorQuarterId ? 'QoQ' : 'None';
      } else if (nextCompType === 'QoQ' && !pMeta?.priorQuarterId) {
        nextCompType = pMeta?.priorYearQuarterId ? 'YoY' : 'None';
      }
      const resetFilters = !pMeta?.hasIrregularCostBreakdown &&
        !prev.includedSections.some((id) => REGION_OR_DEPT_SENSITIVE_SECTIONS.has(id));
      return {
        ...prev,
        reportingPeriod: nextPeriod,
        comparisonType: nextCompType,
        comparisonPeriod:
          nextCompType === 'YoY'
            ? pMeta?.priorYearQuarterId
            : nextCompType === 'QoQ'
              ? pMeta?.priorQuarterId
              : undefined,
        regionFilter: resetFilters ? 'all' : prev.regionFilter,
        departmentFilter: resetFilters ? 'all' : prev.departmentFilter,
        modifiedAtIso: new Date().toISOString(),
      };
    });
  };

  const handleComparisonChange = (nextType: 'YoY' | 'QoQ' | 'None') => {
    const pMeta = REPORTING_PERIODS.find((p) => p.id === config.reportingPeriod);
    setConfig((prev) => ({
      ...prev,
      comparisonType: nextType,
      comparisonPeriod:
        nextType === 'YoY'
          ? pMeta?.priorYearQuarterId
          : nextType === 'QoQ'
            ? pMeta?.priorQuarterId
            : undefined,
      modifiedAtIso: new Date().toISOString(),
    }));
  };

  const toggleSection = (sectionId: ReportSectionId) => {
    setConfig((prev) => {
      const exists = prev.includedSections.includes(sectionId);
      const nextSections = exists
        ? prev.includedSections.filter((id) => id !== sectionId)
        : [...prev.includedSections, sectionId];
      return {
        ...prev,
        includedSections: nextSections,
        modifiedAtIso: new Date().toISOString(),
      };
    });
  };

  const moveSection = (sectionId: ReportSectionId, dir: -1 | 1) => {
    const currentSlide = reportModel.slides[activeSlideIdx];
    setConfig((prev) => {
      const idx = prev.includedSections.indexOf(sectionId);
      if (idx < 0) return prev;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= prev.includedSections.length) return prev;
      const copy = [...prev.includedSections];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      if (currentSlide?.sectionId === sectionId) {
        setActiveSlideIdx(2 + targetIdx);
      }
      return {
        ...prev,
        includedSections: copy,
        modifiedAtIso: new Date().toISOString(),
      };
    });
  };

  const toggleKpiMetric = (metricId: string) => {
    const allIds = reportModel.availableKpiOptions.map((k) => k.id);
    const current = config.sectionMetricIds?.fin_income_statement?.length
      ? config.sectionMetricIds.fin_income_statement
      : allIds.slice(0, 6);
    const exists = current.includes(metricId);
    const next = exists ? current.filter((id) => id !== metricId) : [...current, metricId];
    if (next.length === 0) return;
    setConfig((prev) => ({
      ...prev,
      sectionMetricIds: {
        ...(prev.sectionMetricIds ?? {}),
        fin_income_statement: next,
      },
      modifiedAtIso: new Date().toISOString(),
    }));
  };

  const handleSaveConfig = () => {
    const saved = saveReportConfig(config);
    if (saved) {
      setConfig(saved);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    }
  };

  const handleExportPptx = async (targetModel = reportModel) => {
    if (exportingFormat) return;
    if (targetModel.config.includedSections.length === 0) {
      setExportFeedback({
        type: 'error',
        message: 'Include at least one report section before generating PowerPoint.',
      });
      return;
    }
    setExportingFormat('pptx');
    setExportFeedback(null);
    try {
      const res = await generatePptxPresentation(targetModel);
      const downloaded = triggerBrowserFileDownload(
        res.bytes,
        res.fileName,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      recordReportExport({
        config: targetModel.config,
        format: 'pptx',
        fileName: res.fileName,
        slideCount: res.slideCount,
        byteSize: res.byteSize,
        downloadTriggered: downloaded,
        outcomeNote: downloaded
          ? `Generated ${res.slideCount}-slide editable 16:9 PowerPoint (${(res.byteSize / 1024).toFixed(1)} KB); downloaded to your device.`
          : `Generated ${res.slideCount}-slide PowerPoint (${(res.byteSize / 1024).toFixed(1)} KB).`,
        sourceRecordRefs: targetModel.sourceRecordRefs,
        headlineMetrics: targetModel.selectedKpis.map((k) => ({ label: k.label, value: k.exactValue })),
      });
      if (!downloaded) {
        setExportFeedback({
          type: 'error',
          message: 'The PowerPoint was generated, but the browser did not start the download.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PowerPoint generation failed.';
      recordReportExport({
        config: targetModel.config,
        format: 'pptx',
        fileName: buildReportFileName(targetModel.config.title, targetModel.config.reportingPeriod, 'pptx'),
        downloadTriggered: false,
        outcomeNote: msg,
        sourceRecordRefs: targetModel.sourceRecordRefs,
        headlineMetrics: [],
        failed: true,
      });
      setExportFeedback({ type: 'error', message: msg });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportXlsx = (targetModel = reportModel) => {
    if (exportingFormat) return;
    setExportingFormat('xlsx');
    setExportFeedback(null);
    try {
      const res = buildConsolidatedExcelWorkbook(targetModel, state, activeUser);
      const downloaded = triggerBrowserFileDownload(
        res.bytes,
        res.fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      recordReportExport({
        config: targetModel.config,
        format: 'xlsx',
        fileName: res.fileName,
        byteSize: res.byteSize,
        downloadTriggered: downloaded,
        outcomeNote: `Generated ${res.sheetNames.length}-sheet workbook (${res.sheetNames.join(', ')}); downloaded to your device.`,
        sourceRecordRefs: targetModel.sourceRecordRefs,
        headlineMetrics: targetModel.selectedKpis.map((k) => ({ label: k.label, value: k.exactValue })),
      });
      if (!downloaded) {
        setExportFeedback({
          type: 'error',
          message: 'The workbook was generated, but the browser did not start the download.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Excel workbook generation failed.';
      setExportFeedback({ type: 'error', message: msg });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportCsv = () => {
    if (exportingFormat) return;
    setExportingFormat('csv');
    setExportFeedback(null);
    try {
      const res = generateDatasetCsvExport(selectedCsvKey, reportModel, state, activeUser);
      const downloaded = triggerBrowserFileDownload(res.csvText, res.fileName, 'text/csv;charset=utf-8;');
      const byteSize = new Blob([res.csvText]).size;
      recordReportExport({
        config: reportModel.config,
        format: 'csv',
        fileName: res.fileName,
        byteSize,
        downloadTriggered: downloaded,
        outcomeNote: `Exported ${res.rowCount} formula-sanitized CSV rows for ${CSV_DATASET_LABELS[selectedCsvKey]}; downloaded to your device.`,
        sourceRecordRefs: reportModel.sourceRecordRefs,
        headlineMetrics: reportModel.selectedKpis.map((k) => ({ label: k.label, value: k.exactValue })),
      });
      if (!downloaded) {
        setExportFeedback({
          type: 'error',
          message: 'The CSV was generated, but the browser did not start the download.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CSV export failed.';
      setExportFeedback({ type: 'error', message: msg });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleGenerateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    const ctx = buildReportAiContextPacket(reportModel);
    const res = await requestAiReportExecutiveSummary(ctx);
    setAiLoading(false);
    if (!res.ok) {
      setAiError(res.userMessage);
      return;
    }
    setConfig((prev) => ({
      ...prev,
      aiExecutiveSummary: res.summary,
      modifiedAtIso: new Date().toISOString(),
    }));
    recordAiAuditEvent(
      'ai_report_summary_generated',
      `Generated AI executive summary draft for "${reportModel.config.title}" (${res.summary.modelName}; requires human approval before export).`,
      reportModel.config.id
    );
  };

  const savedReports = state.savedReports ?? [];
  const exportHistory = state.exportHistory ?? [];
  const snapshots = state.reportSnapshots ?? [];
  const activeTemplateSpec =
    REPORT_TEMPLATES.find((t) => t.id === config.templateId) ?? REPORT_TEMPLATES[0];

  const availableToAdd = permittedSections.filter((spec) => {
    if (config.includedSections.includes(spec.id)) return false;
    const q = sectionSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      spec.title.toLowerCase().includes(q) ||
      spec.shortLabel.toLowerCase().includes(q) ||
      spec.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className={printModalOpen ? 'space-y-4 print:hidden' : 'space-y-4'}>
        {/* Simplified Page Header */}
        <PageHeader
          title="Report Studio"
          actions={
            <div className="flex flex-wrap items-center gap-2 relative">
              <div
                role="tablist"
                aria-label="Report Studio views"
                className="inline-flex items-center gap-1 bg-[#F5F6F7] p-1 rounded border border-[#E2E5E8]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'create'}
                  onClick={() => setActiveView('create')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeView === 'create'
                      ? 'bg-[#231F20] text-white'
                      : 'text-[#5F6368] hover:text-[#231F20]'
                  }`}
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Create Report</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'my_reports'}
                  onClick={() => setActiveView('my_reports')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeView === 'my_reports'
                      ? 'bg-[#231F20] text-white'
                      : 'text-[#5F6368] hover:text-[#231F20]'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>My Reports ({savedReports.length})</span>
                </button>
              </div>
            </div>
          }
        />

        {/* VIEW 1: CREATE REPORT (Connected Template Selector + 35%/65% Builder & Preview) */}
        {activeView === 'create' && (
          <div className="space-y-4">
            <nav aria-label="Report creation steps" className="bg-white border border-[#E2E5E8] rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
              {([
                [1, 'Template & Setup'],
                [2, 'Report Contents'],
                [3, 'Review & Export'],
              ] as const).map(([step, label], index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setWizardStep(step)}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer ${
                    wizardStep === step ? 'bg-[#231F20] text-white' : 'text-[#5F6368] hover:text-[#231F20]'
                  }`}
                >
                  <span className="font-mono">{index + 1}</span>
                  <span className="font-medium">{label}</span>
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[#5F6368] truncate">{activeTemplateSpec.title}</span>
            </nav>

            {/* Step 2 & 3: Balanced ~35% Report Editor (Left) / ~65% Live Preview & Export (Right) */}
            <div className="grid grid-cols-1 gap-4 items-start min-w-0">
              {wizardStep < 3 && (
              <aside
                aria-label="Report Editor"
                className="bg-white border border-[#E2E5E8] rounded-md divide-y divide-[#E2E5E8] min-w-0"
              >
                {/* SECTION A: REPORT SETUP */}
                <div className={wizardStep === 1 ? undefined : 'hidden'}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenEditorSection((prev) => (prev === 'setup' ? 'contents' : 'setup'))
                    }
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-[#F8F9FA] cursor-pointer"
                    aria-expanded={wizardStep === 1}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#231F20]">1. Report Setup</div>
                      <div className="text-[11px] text-[#5F6368] truncate">
                        {config.reportingPeriod}
                        {supportsAnyComparison && config.comparisonType !== 'None'
                          ? ` · ${config.comparisonType}`
                          : ''}
                        {' · '}
                        {DATASET_SCOPE_LABELS[config.datasetScope]}
                      </div>
                    </div>
                    {wizardStep === 1 ? (
                      <ChevronDown className="w-4 h-4 text-[#5F6368] shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#5F6368] shrink-0" />
                    )}
                  </button>

                  {wizardStep === 1 && (
                    <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-[#5F6368] block">
                          Report Title
                        </span>
                        <input
                          type="text"
                          value={config.title}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              title: e.target.value,
                              modifiedAtIso: new Date().toISOString(),
                            }))
                          }
                          className="w-full border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs text-[#231F20] focus:outline-none focus:border-[#231F20]"
                        />
                      </label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-medium text-[#5F6368] block">
                            Template
                          </span>
                          <select
                            aria-label="Report template"
                            value={config.templateId}
                            onChange={(e) => handleApplyTemplate(e.target.value as ReportTemplateId)}
                            className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                          >
                            {permittedTemplates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-medium text-[#5F6368] block">
                            Reporting Period
                          </span>
                          <select
                            aria-label="Report period"
                            value={config.reportingPeriod}
                            onChange={(e) => handlePeriodChange(e.target.value as QuarterId)}
                            className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                          >
                            {REPORTING_PERIODS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {supportsAnyComparison && (
                          <label className="block space-y-1">
                            <span className="text-[11px] font-medium text-[#5F6368] block">
                              Comparison Basis
                            </span>
                            <select
                              aria-label="Comparison basis"
                              value={config.comparisonType}
                              onChange={(e) =>
                                handleComparisonChange(e.target.value as 'YoY' | 'QoQ' | 'None')
                              }
                              className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                            >
                              {supportsYoY && <option value="YoY">Year-over-Year (YoY)</option>}
                              {supportsQoQ && <option value="QoQ">Quarter-over-Quarter (QoQ)</option>}
                              <option value="None">Single Period Only</option>
                            </select>
                          </label>
                        )}

                        <label className="block space-y-1">
                          <span className="text-[11px] font-medium text-[#5F6368] block">
                            Dataset Scope
                          </span>
                          <select
                            aria-label="Dataset scope"
                            value={config.datasetScope}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                datasetScope: e.target.value as ReportDatasetScope,
                                modifiedAtIso: new Date().toISOString(),
                              }))
                            }
                            className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                          >
                            <option value="official_case_data">Official Case Data Only</option>
                            <option value="authorized_uploads_included">
                              Official + Authorized Uploads
                            </option>
                            <option value="combined_with_hypothetical">
                              Include Hypothetical Scenarios
                            </option>
                          </select>
                        </label>

                        {regionDeptScopeApplies && (
                          <>
                            <label className="block space-y-1">
                              <span className="text-[11px] font-medium text-[#5F6368] block">
                                Region Scope
                              </span>
                              <select
                                aria-label="Report region filter"
                                value={config.regionFilter}
                                onChange={(e) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    regionFilter: e.target.value as RegionId,
                                    modifiedAtIso: new Date().toISOString(),
                                  }))
                                }
                                className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                              >
                                <option value="all">All Regions</option>
                                {REGIONS.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block space-y-1">
                              <span className="text-[11px] font-medium text-[#5F6368] block">
                                Department Scope
                              </span>
                              <select
                                aria-label="Report department filter"
                                value={config.departmentFilter}
                                onChange={(e) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    departmentFilter: e.target.value,
                                    modifiedAtIso: new Date().toISOString(),
                                  }))
                                }
                                className="w-full border border-[#E2E5E8] rounded px-2 py-1.5 text-xs bg-white text-[#231F20]"
                              >
                                {DEPARTMENTS.map((d) => (
                                  <option key={d} value={d}>
                                    {d === 'all' ? 'All Departments' : d}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
                        )}
                      </div>

                      {/* Progressive Disclosure: Advanced Settings */}
                      <div className="pt-1 border-t border-[#F0F1F3]">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedSetup((prev) => !prev)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                          aria-expanded={showAdvancedSetup}
                        >
                          {showAdvancedSetup ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>Advanced Settings</span>
                        </button>

                        {showAdvancedSetup && (
                          <div className="mt-2.5 space-y-2.5 text-[11px] text-[#5F6368]">
                            <label className="block space-y-1">
                              <span className="font-medium block">Cover Subtitle</span>
                              <input
                                type="text"
                                value={config.subtitle}
                                onChange={(e) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    subtitle: e.target.value,
                                    modifiedAtIso: new Date().toISOString(),
                                  }))
                                }
                                className="w-full border border-[#E2E5E8] rounded px-2.5 py-1.5 text-xs text-[#231F20]"
                              />
                            </label>

                            {config.focusedRecordIds && config.focusedRecordIds.length > 0 && (
                              <div className="flex items-center justify-between gap-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded px-2.5 py-1.5">
                                <span>
                                  Focused Records: <strong className="font-mono text-[#231F20]">{config.focusedRecordIds.join(', ')}</strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfig((prev) => ({
                                      ...prev,
                                      focusedRecordIds: [],
                                      modifiedAtIso: new Date().toISOString(),
                                    }))
                                  }
                                  className="text-[#E53C2E] font-medium hover:underline cursor-pointer shrink-0"
                                >
                                  Clear
                                </button>
                              </div>
                            )}

                            <div className="bg-[#F8F9FA] rounded px-2.5 py-2 space-y-0.5">
                              <div>
                                Author: <strong className="text-[#231F20]">{config.authorName}</strong>
                              </div>
                              <div>
                                Modified:{' '}
                                <span className="font-mono tabular-nums text-[#231F20]">
                                  {config.modifiedAtIso.slice(0, 16).replace('T', ' ')}Z
                                </span>
                              </div>
                              <div>
                                Quarantined Excluded: <strong className="text-[#231F20]">{reportModel.scopedData.quarantinedCount}</strong>
                              </div>
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-[#5F6368] leading-snug">{activeTemplateSpec.description}</p>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setWizardStep(2)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3124] cursor-pointer"
                          >
                            Continue
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION B: REPORT CONTENTS (Unified Metrics, Slide Order, Chart Types & Add Sections) */}
                <div className={wizardStep === 2 ? undefined : 'hidden'}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenEditorSection((prev) => (prev === 'contents' ? 'finishing' : 'contents'))
                    }
                    className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-[#F8F9FA] cursor-pointer"
                    aria-expanded={wizardStep === 2}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#231F20]">
                        2. Report Contents ({reportModel.slides.length} slides)
                      </div>
                      <div className="text-[11px] text-[#5F6368]">
                        {config.includedSections.length} modules · {reportModel.selectedKpis.length} summary metrics
                      </div>
                    </div>
                    {wizardStep === 2 ? (
                      <ChevronDown className="w-4 h-4 text-[#5F6368] shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#5F6368] shrink-0" />
                    )}
                  </button>

                  {wizardStep === 2 && (
                    <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
                      {/* Executive Summary KPI Metrics Selector */}
                      <div className="border border-[#E2E5E8] rounded-md">
                        <button
                          type="button"
                          onClick={() => setShowKpiPicker((prev) => !prev)}
                          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left bg-[#F8F9FA] hover:bg-[#F0F1F3] rounded-t-md cursor-pointer"
                          aria-expanded={showKpiPicker}
                        >
                          <span className="min-w-0 text-[11px] font-semibold text-[#231F20]">
                            Summary Slide Metrics ({reportModel.selectedKpis.length} of{' '}
                            {reportModel.availableKpiOptions.length})
                          </span>
                          <span className="text-[11px] text-[#5F6368]">
                            {showKpiPicker ? 'Done' : 'Customize'}
                          </span>
                        </button>

                        {showKpiPicker && (
                          <div className="p-2.5 grid grid-cols-1 gap-1.5 border-t border-[#E2E5E8]">
                            {reportModel.availableKpiOptions.map((kpi) => {
                              const checked = reportModel.selectedKpis.some((s) => s.id === kpi.id);
                              return (
                                <label
                                  key={kpi.id}
                                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[#F8F9FA] text-[11px] cursor-pointer"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleKpiMetric(kpi.id)}
                                      className="accent-[#E53C2E]"
                                    />
                                    <span className="truncate text-[#231F20]">{kpi.label}</span>
                                  </span>
                                  <span className="font-mono tabular-nums text-[#5F6368] shrink-0">
                                    {kpi.compactValue}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Unified Slide Outline: Click to preview, reorder, pick chart type, or remove */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[#5F6368]">
                          <span className="font-semibold text-[#231F20]">Deck Slide Order</span>
                          <span>Click slide to preview</span>
                        </div>

                        <div className="space-y-1">
                          {/* Cover & KPI Summary fixed lead slides */}
                          {reportModel.slides.slice(0, 2).map((slide, idx) => (
                            <button
                              key={slide.id}
                              type="button"
                              onClick={() => setActiveSlideIdx(idx)}
                              className={`w-full text-left px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                activeSlideIdx === idx
                                  ? 'border-[#E53C2E] bg-[#FDF2F1] text-[#231F20]'
                                  : 'border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368] hover:text-[#231F20]'
                              }`}
                            >
                              <span className="truncate font-medium">
                                <span className="font-mono tabular-nums mr-1.5">{slide.slideNumber}.</span>
                                {idx === 0 ? 'Cover Slide' : 'Executive KPI Summary'}
                              </span>
                              <span className="text-[10px] shrink-0">Included</span>
                            </button>
                          ))}

                          {/* Configurable Report Section Slides */}
                          {config.includedSections.length === 0 ? (
                            <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded text-[11px] text-[#5F6368]">
                              No report modules selected yet. Add one below to build your deck.
                            </div>
                          ) : (
                            config.includedSections.map((secId, idx) => {
                              const spec = permittedSections.find((s) => s.id === secId);
                              if (!spec) return null;
                              const slideIdx = reportModel.slides.findIndex((s) => s.sectionId === secId);
                              const slideNum = slideIdx >= 0 ? reportModel.slides[slideIdx].slideNumber : idx + 3;
                              const isPreviewed = slideIdx >= 0 && activeSlideIdx === slideIdx;
                              const activeChart =
                                config.sectionChartOverrides?.[secId] ?? spec.defaultChartType;

                              return (
                                <div
                                  key={secId}
                                  className={`rounded border p-2 space-y-1.5 transition-colors ${
                                    isPreviewed
                                      ? 'border-[#E53C2E] bg-[#FDF2F1]/70'
                                      : 'border-[#E2E5E8] bg-white hover:bg-[#F8F9FA]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => slideIdx >= 0 && setActiveSlideIdx(slideIdx)}
                                      className="flex-1 min-w-0 text-left text-xs font-medium text-[#231F20] hover:text-[#E53C2E] truncate cursor-pointer"
                                    >
                                      <span className="font-mono tabular-nums text-[#5F6368] mr-1.5">
                                        {slideNum}.
                                      </span>
                                      {spec.shortLabel}
                                    </button>

                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => moveSection(secId, -1)}
                                        className="p-1 text-[#5F6368] hover:text-[#231F20] disabled:opacity-30 cursor-pointer"
                                        aria-label={`Move ${spec.shortLabel} up`}
                                        title="Move up"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={idx === config.includedSections.length - 1}
                                        onClick={() => moveSection(secId, 1)}
                                        className="p-1 text-[#5F6368] hover:text-[#231F20] disabled:opacity-30 cursor-pointer"
                                        aria-label={`Move ${spec.shortLabel} down`}
                                        title="Move down"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => toggleSection(secId)}
                                        className="p-1 text-[#5F6368] hover:text-[#DC2626] cursor-pointer"
                                        aria-label={`Remove ${spec.shortLabel}`}
                                        title="Remove section"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {spec.supportedChartTypes.length > 1 && (
                                    <div className="flex items-center justify-between gap-2 pl-4">
                                      <span className="text-[10.5px] text-[#5F6368]">Layout</span>
                                      <select
                                        aria-label={`Chart type for ${spec.shortLabel}`}
                                        value={activeChart}
                                        onChange={(e) =>
                                          setConfig((prev) => ({
                                            ...prev,
                                            sectionChartOverrides: {
                                              ...(prev.sectionChartOverrides ?? {}),
                                              [secId]: e.target.value as ReportChartType,
                                            },
                                            modifiedAtIso: new Date().toISOString(),
                                          }))
                                        }
                                        className="border border-[#E2E5E8] bg-white rounded px-2 py-0.5 text-[11px] text-[#231F20]"
                                      >
                                        {spec.supportedChartTypes.map((ct) => (
                                          <option key={ct} value={ct}>
                                            {CHART_TYPE_LABELS[ct] ?? ct}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}

                          {/* Closing Governance / Commentary Slides */}
                          {reportModel.slides
                            .filter(
                              (s) =>
                                s.id === 'slide-ai-summary' ||
                                s.id === 'slide-management-commentary' ||
                                s.id === 'slide-sources-assumptions'
                            )
                            .map((slide) => {
                              const idx = reportModel.slides.findIndex((s) => s.id === slide.id);
                              return (
                                <button
                                  key={slide.id}
                                  type="button"
                                  onClick={() => idx >= 0 && setActiveSlideIdx(idx)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded border text-[11px] flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                    activeSlideIdx === idx
                                      ? 'border-[#E53C2E] bg-[#FDF2F1] text-[#231F20]'
                                      : 'border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368] hover:text-[#231F20]'
                                  }`}
                                >
                                  <span className="truncate font-medium">
                                    <span className="font-mono tabular-nums mr-1.5">{slide.slideNumber}.</span>
                                    {slide.title}
                                  </span>
                                  <span className="text-[10px] shrink-0">Auto</span>
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Add More Permitted Sections (Non-duplicated library) */}
                      <div className="pt-1 border-t border-[#F0F1F3]">
                        <button
                          type="button"
                          onClick={() => setShowSectionLibrary((prev) => !prev)}
                          className="w-full py-1.5 px-2.5 rounded border border-[#E2E5E8] bg-[#F8F9FA] hover:bg-[#F0F1F3] text-xs font-medium text-[#231F20] flex items-center justify-between gap-2 cursor-pointer"
                          aria-expanded={showSectionLibrary}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5 text-[#E53C2E]" />
                            <span>
                              Add Report Sections ({permittedSections.length - config.includedSections.length} available)
                            </span>
                          </span>
                          {showSectionLibrary ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#5F6368]" />
                          )}
                        </button>

                        {showSectionLibrary && (
                          <div className="mt-2.5 space-y-2.5">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                              <input
                                type="text"
                                value={sectionSearch}
                                onChange={(e) => setSectionSearch(e.target.value)}
                                placeholder="Filter available sections..."
                                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-[#E2E5E8] rounded focus:outline-none focus:border-[#231F20]"
                              />
                            </div>

                            {availableToAdd.length === 0 ? (
                              <div className="p-2.5 text-[11px] text-[#5F6368] bg-[#F8F9FA] rounded">
                                {permittedSections.length === config.includedSections.length
                                  ? 'All permitted report sections are already included.'
                                  : 'No available sections match your search.'}
                              </div>
                            ) : (
                              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                                {SECTION_GROUPS.map(({ key, label }) => {
                                  const items = availableToAdd.filter((s) => s.group === key);
                                  if (items.length === 0) return null;
                                  return (
                                    <div key={key} className="space-y-1">
                                      <div className="text-[11px] font-semibold text-[#5F6368]">
                                        {label}
                                      </div>
                                      <div className="space-y-1">
                                        {items.map((spec) => (
                                          <button
                                            key={spec.id}
                                            type="button"
                                            onClick={() => toggleSection(spec.id)}
                                            className="w-full text-left p-2 border border-[#E2E5E8] rounded hover:bg-[#F8F9FA] flex items-start justify-between gap-2 cursor-pointer"
                                          >
                                            <div className="min-w-0">
                                              <div className="text-xs font-medium text-[#231F20]">
                                                {spec.title}
                                              </div>
                                              <div className="text-[11px] text-[#5F6368] leading-snug">
                                                {spec.description}
                                              </div>
                                            </div>
                                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#E53C2E] shrink-0 pt-0.5">
                                              <Plus className="w-3 h-3" /> Add
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setWizardStep(1)}
                          className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardStep(3)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3124] cursor-pointer"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </aside>
              )}

              {wizardStep === 3 && (
              <div className="space-y-3 min-w-0">
                {/* Unified Export Toolbar */}
                <section
                  aria-label="Report Export Actions"
                  className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-[#231F20] truncate">
                        {config.title || 'Untitled Report'}
                      </h2>
                      <p className="text-[11px] text-[#5F6368] mt-0.5">
                        {config.reportingPeriod}
                        {supportsAnyComparison && config.comparisonType !== 'None'
                          ? ` (${config.comparisonType})`
                          : ''}
                        {' · '}
                        {DATASET_SCOPE_LABELS[config.datasetScope]}
                        {' · '}
                        <span className="font-mono tabular-nums">{reportModel.slides.length} slides</span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F8F9FA] cursor-pointer shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savedNotice ? 'Saved' : 'Save to My Reports'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#F0F1F3]">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="px-3 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={handleGenerateAiSummary}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F8F9FA] disabled:opacity-50 cursor-pointer"
                    >
                      {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>{aiLoading ? 'Drafting…' : 'Generate Executive Summary'}</span>
                    </button>
                  </div>

                  {aiError && (
                    <div className="p-2.5 rounded border border-amber-200 bg-amber-50 text-[11px] text-amber-950">
                      AI executive summary is unavailable. {aiError}
                    </div>
                  )}
                  {config.aiExecutiveSummary && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[#5F6368]">
                        AI-assisted commentary from {config.aiExecutiveSummary.modelName}. It does not change official records and stays out of the export until you approve it.
                      </p>
                      <p className="text-xs font-medium text-[#231F20]">{config.aiExecutiveSummary.executiveHeadline}</p>
                      <p className="text-[11px] text-[#231F20] leading-snug">{config.aiExecutiveSummary.financialPerformanceCommentary}</p>
                      <p className="text-[11px] text-[#5F6368] leading-snug">{config.aiExecutiveSummary.hypotheticalDisclaimer}</p>
                      <label className="flex items-start gap-2 text-[11px] text-[#231F20] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.aiExecutiveSummary.reviewedAndApprovedForExport}
                          onChange={(e) =>
                            setConfig((prev) =>
                              prev.aiExecutiveSummary
                                ? {
                                    ...prev,
                                    aiExecutiveSummary: {
                                      ...prev.aiExecutiveSummary,
                                      reviewedAndApprovedForExport: e.target.checked,
                                    },
                                  }
                                : prev
                            )
                          }
                          className="mt-0.5 accent-[#E53C2E]"
                        />
                        <span>Reviewed against SKYJACK figures. Include this labeled AI commentary in the preview and export.</span>
                      </label>
                    </div>
                  )}

                  {exportFeedback?.type === 'error' && (
                    <div className="p-2.5 rounded border text-xs flex items-center gap-2 bg-red-50 border-red-200 text-[#DC2626]">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{exportFeedback.message}</span>
                    </div>
                  )}
                </section>

                {/* Live 16:9 Slide Preview Canvas */}
                <section
                  aria-label="Live Report Preview"
                  className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={Boolean(exportingFormat)}
                      onClick={() => handleExportPptx(reportModel)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E53C2E] rounded hover:bg-[#C93023] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {exportingFormat === 'pptx' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Presentation className="w-3.5 h-3.5" />
                      )}
                      <span>{exportingFormat === 'pptx' ? 'Generating .pptx…' : 'Export PowerPoint'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#C93023] cursor-pointer whitespace-nowrap"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print / PDF</span>
                    </button>
                  </div>
                  <ReportPresentationPreview
                    model={reportModel}
                    activeSlideIdx={activeSlideIdx}
                    onSelectSlide={setActiveSlideIdx}
                  />
                </section>

                <section aria-label="Supporting Data" className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-2">
                  <h2 className="text-sm font-semibold text-[#231F20]">Supporting Data</h2>
                  <p className="text-[11px] text-[#5F6368]">
                    Workbook and dataset files are separate from the presentation.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={Boolean(exportingFormat) || !reportModel.policy.allowExecutiveWorkbook}
                      onClick={() => handleExportXlsx(reportModel)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F8F9FA] disabled:opacity-50 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel (.xlsx)</span>
                    </button>
                    <div className="inline-flex items-center gap-1 border border-[#E2E5E8] rounded bg-[#F8F9FA] p-0.5">
                      <select
                        aria-label="Select CSV dataset"
                        value={selectedCsvKey}
                        onChange={(e) => setSelectedCsvKey(e.target.value as ReportDatasetExportKey)}
                        className="bg-transparent px-2 py-1 text-xs text-[#231F20] focus:outline-none max-w-[220px]"
                      >
                        {reportModel.policy.allowedCsvDatasets.map((k) => (
                          <option key={k} value={k}>
                            {CSV_DATASET_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={Boolean(exportingFormat)}
                        onClick={handleExportCsv}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-[#E2E5E8] rounded cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>CSV</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: MY REPORTS (Saved Configurations + Expandable History & Snapshots) */}
        {activeView === 'my_reports' && (
          <div className="space-y-4">
            {exportFeedback?.type === 'error' && (
              <div className="p-3 rounded-md border text-xs flex items-center justify-between gap-2 bg-red-50 border-red-200 text-[#DC2626]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{exportFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExportFeedback(null)}
                  className="text-current opacity-70 hover:opacity-100 cursor-pointer"
                  aria-label="Dismiss export notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Primary Content: Saved Report Configurations */}
            <section
              aria-label="Saved Reports"
              className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#231F20]">
                    Saved Reports ({savedReports.length})
                  </h2>
                  <p className="text-xs text-[#5F6368] mt-0.5">
                    Live configurations regenerate from current authorized repository figures when reopened or exported.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('create');
                    setWizardStep(1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#C93023] cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Report</span>
                </button>
              </div>

              {savedReports.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <div className="text-xs text-[#5F6368]">
                    No saved report configurations yet. Choose a template in Create Report and save it here for reuse.
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('create')}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
                  >
                    Create Your First Report
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#E2E5E8]">
                  {savedReports.map((rep) => {
                    const tplAllowed = permittedTemplates.some((t) => t.id === rep.templateId);
                    const tplTitle =
                      REPORT_TEMPLATES.find((t) => t.id === rep.templateId)?.title ?? 'Custom Report';
                    return (
                      <div
                        key={rep.id}
                        className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 hover:bg-[#F8F9FA]/60 transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#E53C2E] shrink-0" />
                            <span className="text-xs font-semibold text-[#231F20] truncate">
                              {rep.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#5F6368] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{tplTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span>{rep.reportingPeriod}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {rep.includedSections.length} sections
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{rep.authorName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Modified {rep.modifiedAtIso.slice(0, 10)}
                            </span>
                            {rep.lastGeneratedAtIso && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Exported {rep.lastGeneratedAtIso.slice(0, 16).replace('T', ' ')}Z
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {tplAllowed ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfig(rep);
                                  setActiveSlideIdx(0);
                                  setWizardStep(1);
                                  setActiveView('create');
                                  setExportFeedback(null);
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer whitespace-nowrap"
                              >
                                Open Report
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(exportingFormat)}
                                onClick={() =>
                                  handleExportPptx(buildReportRenderModel(rep, state, activeUser, state.currency))
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#E53C2E] bg-white border border-[#E53C2E]/40 rounded hover:bg-[#FDF2F1] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                              >
                                <Presentation className="w-3.5 h-3.5" />
                                <span>Export .pptx</span>
                              </button>
                              {reportModel.policy.allowExecutiveWorkbook && (
                                <button
                                  type="button"
                                  disabled={Boolean(exportingFormat)}
                                  onClick={() =>
                                    handleExportXlsx(buildReportRenderModel(rep, state, activeUser, state.currency))
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  <FileSpreadsheet className="w-3.5 h-3.5" />
                                  <span>.xlsx</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => duplicateReportConfig(rep.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer whitespace-nowrap"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Duplicate</span>
                              </button>
                              {confirmDeleteId === rep.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      deleteReportConfig(rep.id);
                                      setConfirmDeleteId(null);
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] rounded cursor-pointer whitespace-nowrap"
                                  >
                                    Confirm Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2.5 py-1.5 text-xs text-[#5F6368] bg-white border border-[#E2E5E8] rounded cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(rep.id)}
                                  className="p-1.5 text-[#5F6368] hover:text-[#DC2626] bg-white border border-[#E2E5E8] rounded cursor-pointer"
                                  aria-label={`Delete ${rep.title}`}
                                  title="Delete saved report"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-[#7E8082]">
                              Outside {activeUser.title} role scope
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Secondary Expandable Section: Export History */}
            <section
              aria-label="Export History"
              className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowExportHistory((prev) => !prev)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8F9FA] cursor-pointer"
                aria-expanded={showExportHistory}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <History className="w-4 h-4 text-[#5F6368] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[#231F20]">
                      Export History ({exportHistory.length})
                    </span>
                    <span className="text-[11px] text-[#5F6368] ml-2">
                      Governance log of generated exports
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5F6368] shrink-0">
                  <span>{showExportHistory ? 'Hide' : 'Show'}</span>
                  {showExportHistory ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </span>
              </button>

              {showExportHistory && (
                <div className="border-t border-[#E2E5E8]">
                  <div className="px-5 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] text-[11px] text-[#5F6368]">
                    Exported files download directly to your local device; binary files are not retained inside the application.
                  </div>
                  {exportHistory.length === 0 ? (
                    <div className="p-5 text-xs text-[#5F6368]">
                      No export events logged yet in this workspace session.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                            <th className="py-2 px-4 text-left font-medium">Timestamp</th>
                            <th className="py-2 px-4 text-left font-medium">Report / File</th>
                            <th className="py-2 px-4 text-left font-medium">Format</th>
                            <th className="py-2 px-4 text-left font-medium">Generating User</th>
                            <th className="py-2 px-4 text-left font-medium">Scope</th>
                            <th className="py-2 px-4 text-left font-medium">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E5E8]">
                          {exportHistory.map((ev) => (
                            <tr key={ev.id}>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#5F6368] whitespace-nowrap">
                                {ev.generatedAtIso.slice(0, 19).replace('T', ' ')}Z
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="font-medium text-[#231F20]">{ev.reportTitle}</div>
                                <div className="text-[11px] font-mono text-[#5F6368]">{ev.fileName}</div>
                              </td>
                              <td className="py-2.5 px-4 font-mono uppercase text-[#231F20]">
                                {ev.format}
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="text-[#231F20]">{ev.generatedByName}</div>
                                <div className="text-[10px] text-[#7E8082]">
                                  {ev.generatedByRoleLabel}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-[#5F6368] whitespace-nowrap">
                                {ev.reportingPeriod} · {ev.selectedSections.length} sections
                              </td>
                              <td className="py-2.5 px-4">
                                <div
                                  className={`font-medium ${
                                    ev.outcome === 'generated_browser_download_triggered'
                                      ? 'text-[#15803D]'
                                      : 'text-[#DC2626]'
                                  }`}
                                >
                                  {ev.outcome === 'generated_browser_download_triggered'
                                    ? 'Downloaded to device'
                                    : 'Failed'}
                                </div>
                                <div className="text-[11px] text-[#5F6368]">{ev.outcomeNote}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Secondary Expandable Section: Point-in-Time Export Snapshots */}
            <section
              aria-label="Point-in-Time Export Snapshots"
              className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowSnapshots((prev) => !prev)}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8F9FA] cursor-pointer"
                aria-expanded={showSnapshots}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-[#5F6368] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[#231F20]">
                      Point-in-Time Export Snapshots ({snapshots.length})
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5F6368] shrink-0">
                  <span>{showSnapshots ? 'Hide' : 'Show'}</span>
                  {showSnapshots ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </span>
              </button>

              {showSnapshots && (
                <div className="border-t border-[#E2E5E8]">
                  {snapshots.length === 0 ? (
                    <div className="p-5 text-xs text-[#5F6368]">
                      No exports recorded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F8F9FA] border-b border-[#E2E5E8] text-[#5F6368]">
                            <th className="py-2 px-4 text-left font-medium">Snapshot Time</th>
                            <th className="py-2 px-4 text-left font-medium">Report Title</th>
                            <th className="py-2 px-4 text-left font-medium">Format</th>
                            <th className="py-2 px-4 text-left font-medium">Period / Scope</th>
                            <th className="py-2 px-4 text-left font-medium">Key Metrics Captured</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E5E8]">
                          {snapshots.map((sn) => (
                            <tr key={sn.id}>
                              <td className="py-2 px-4 font-mono tabular-nums text-[11px] text-[#5F6368] whitespace-nowrap">
                                {sn.generatedAtIso.slice(0, 19).replace('T', ' ')}Z
                              </td>
                              <td className="py-2 px-4 font-medium text-[#231F20]">{sn.reportTitle}</td>
                              <td className="py-2 px-4 uppercase font-mono">{sn.exportFormat}</td>
                              <td className="py-2 px-4 text-[#5F6368]">
                                {sn.reportingPeriod} · {sn.sourceRecordRefs.length} source refs
                              </td>
                              <td className="py-2 px-4 text-[11px] text-[#231F20] font-mono tabular-nums">
                                {sn.headlineMetrics
                                  .slice(0, 3)
                                  .map((m) => `${m.label}: ${m.value}`)
                                  .join(' · ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {printModalOpen && (
        <PrintManagementBriefModal
          model={reportModel}
          onClose={() => setPrintModalOpen(false)}
          onTriggeredPrint={() => {
            recordReportExport({
              config: reportModel.config,
              format: 'print_pdf',
              fileName: buildReportFileName(
                reportModel.config.title,
                reportModel.config.reportingPeriod,
                'csv'
              ).replace(/\.csv$/, '_Print_Brief'),
              downloadTriggered: true,
              outcomeNote: 'Opened browser Print / Save as PDF management layout (client print dialog).',
              sourceRecordRefs: reportModel.sourceRecordRefs,
              headlineMetrics: reportModel.selectedKpis.map((k) => ({
                label: k.label,
                value: k.exactValue,
              })),
            });
          }}
        />
      )}
    </div>
  );
};
