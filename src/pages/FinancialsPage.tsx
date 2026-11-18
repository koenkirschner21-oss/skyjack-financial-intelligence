import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  Database,
  AlertCircle,
  FileText,
  Filter,
  Info,
  Sparkles,
  RotateCcw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  INCOME_STATEMENTS,
  OPERATING_EARNINGS_WALKS,
  PARTIAL_LEDGER_TRANSACTIONS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import { formatInvestigationStatus } from '../repositories/costIntelligenceRepo';
import { EightQuarterPerformanceChart } from '../components/charts/FinancialCharts';
import { OperatingEarningsWaterfallChart } from '../components/charts/WaterfallAndScenarioCharts';
import {
  CostCompositionChart,
  IrregularCostsAnalytics,
  StatementRowField,
} from '../components/financials/FinancialVisualizations';
import {
  PageHeader,
  ProvenanceText,
  UnavailableDataState,
} from '../components/common/StateViews';

type FinancialsTab = 'performance' | 'walk' | 'irregular' | 'ledger';
type ChartMode = 'operating_earnings' | 'sales' | 'margin';
type SortField = 'id' | 'amountCad' | 'department' | 'regionName' | 'timing';
type LedgerDatasetView = 'case_references' | 'authorized_uploads';

const CHART_MODE_STORAGE_KEY = 'skyjack_financials_chart_mode_v1';

const getInitialChartMode = (): ChartMode => {
  if (typeof window === 'undefined') return 'operating_earnings';
  try {
    const saved = window.localStorage.getItem(CHART_MODE_STORAGE_KEY);
    if (saved === 'operating_earnings' || saved === 'sales' || saved === 'margin') {
      return saved;
    }
  } catch {
    // Ignore storage read errors in restricted iframe environments
  }
  return 'operating_earnings';
};

export const FinancialsPage: React.FC = () => {
  const {
    state,
    activeUser,
    navigate,
    setQuarterFilter,
    scopedIrregularCosts,
    openDrawer,
    drawerRecord,
    hasPermission,
    openReportStudioWithPreset,
    openAskWithContext,
    formatMoney,
    formatCompactMoney,
    formatShortMoney,
  } = useApp();

  const [activeTab, setActiveTab] = useState<FinancialsTab>('performance');
  const [chartMode, setChartMode] = useState<ChartMode>(getInitialChartMode);
  const [highlightedStatementField, setHighlightedStatementField] =
    useState<StatementRowField | null>(null);
  const [showSourcePopover, setShowSourcePopover] = useState(false);
  const sourcePopoverRef = useRef<HTMLDivElement | null>(null);

  // Earnings Walk state
  const [walkType, setWalkType] = useState<'YoY' | 'QoQ'>('YoY');
  const [materialOnly, setMaterialOnly] = useState(false);
  const [selectedWalkEntryId, setSelectedWalkEntryId] = useState<string | null>(null);

  // Irregular Costs state
  const [irSearch, setIrSearch] = useState('');
  const [irRegion, setIrRegion] = useState('all');
  const [irDept, setIrDept] = useState('all');
  const [irTiming, setIrTiming] = useState('all');
  const [irStatus, setIrStatus] = useState('all');
  const [irAmountRange, setIrAmountRange] = useState('all');
  const [irPriority, setIrPriority] = useState('all');
  const [irDensity, setIrDensity] = useState<'compact' | 'detailed'>('compact');
  const [sortField, setSortField] = useState<SortField>('amountCad');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Ledger tab state
  const [ledgerView, setLedgerView] = useState<LedgerDatasetView>('case_references');
  const [caseLedgerSearch, setCaseLedgerSearch] = useState('');
  const [caseLedgerStatus, setCaseLedgerStatus] = useState('all');
  const [uploadedSearch, setUploadedSearch] = useState('');
  const [uploadedPeriodFilter, setUploadedPeriodFilter] = useState('all');
  const [uploadedDeptFilter, setUploadedDeptFilter] = useState('all');

  useEffect(() => {
    try {
      window.localStorage.setItem(CHART_MODE_STORAGE_KEY, chartMode);
    } catch {
      // Ignore storage write errors
    }
  }, [chartMode]);

  useEffect(() => {
    if (!showSourcePopover) return;
    const onMouseDown = (e: MouseEvent) => {
      if (sourcePopoverRef.current && !sourcePopoverRef.current.contains(e.target as Node)) {
        setShowSourcePopover(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSourcePopover(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showSourcePopover]);

  const allowed = hasPermission('view_financials');

  const selectedPeriod = useMemo(
    () => REPORTING_PERIODS.find((p) => p.id === state.selectedQuarterId) ?? REPORTING_PERIODS[7],
    [state.selectedQuarterId]
  );

  const currentStatement = useMemo(
    () =>
      INCOME_STATEMENTS.find((s) => s.quarterId === state.selectedQuarterId) ??
      INCOME_STATEMENTS[INCOME_STATEMENTS.length - 1],
    [state.selectedQuarterId]
  );

  const priorYearStatement = useMemo(
    () =>
      selectedPeriod.priorYearQuarterId
        ? INCOME_STATEMENTS.find((s) => s.quarterId === selectedPeriod.priorYearQuarterId)
        : undefined,
    [selectedPeriod]
  );

  const priorQuarterStatement = useMemo(
    () =>
      selectedPeriod.priorQuarterId
        ? INCOME_STATEMENTS.find((s) => s.quarterId === selectedPeriod.priorQuarterId)
        : undefined,
    [selectedPeriod]
  );

  const activeWalk = useMemo(
    () => OPERATING_EARNINGS_WALKS.find((w) => w.comparisonType === walkType)!,
    [walkType]
  );

  const walkSummary = useMemo(() => {
    const startEntry = activeWalk.entries.find((e) => e.bucket === 'Start') ?? activeWalk.entries[0];
    const endEntry =
      activeWalk.entries.find((e) => e.bucket === 'End') ??
      activeWalk.entries[activeWalk.entries.length - 1];
    const startCad = startEntry.amountCad;
    const endCad = endEntry.amountCad;
    const netChangeCad = endCad - startCad;
    const netChangePct = startCad !== 0 ? (netChangeCad / Math.abs(startCad)) * 100 : 0;

    const minorEntries = activeWalk.entries.filter(
      (e) => e.bucket !== 'Start' && e.bucket !== 'End' && Math.abs(e.amountCad) < 1_000_000
    );
    const minorNetCad = minorEntries.reduce((sum, e) => sum + e.amountCad, 0);

    return {
      startCad,
      endCad,
      netChangeCad,
      netChangePct,
      minorCount: minorEntries.length,
      minorNetCad,
    };
  }, [activeWalk]);

  const filteredWalkEntries = useMemo(() => {
    if (!materialOnly) return activeWalk.entries;
    return activeWalk.entries.filter(
      (e) => e.bucket === 'Start' || e.bucket === 'End' || Math.abs(e.amountCad) >= 1_000_000
    );
  }, [activeWalk, materialOnly]);

  // Scoped Irregular Cost summary & filtering
  const irregularSummary = useMemo(() => {
    let totalCad = 0;
    let oneTimeCad = 0;
    let oneTimeCount = 0;
    let trendCad = 0;
    let trendCount = 0;
    let rule01Count = 0;
    let largest = scopedIrregularCosts[0] ?? null;

    for (const c of scopedIrregularCosts) {
      totalCad += c.amountCad;
      if (c.amountCad >= 250_000) rule01Count += 1;
      if (c.timing === 'One-time') {
        oneTimeCad += c.amountCad;
        oneTimeCount += 1;
      } else {
        trendCad += c.amountCad;
        trendCount += 1;
      }
      if (!largest || c.amountCad > largest.amountCad) {
        largest = c;
      }
    }

    return {
      totalCad,
      oneTimeCad,
      oneTimeCount,
      trendCad,
      trendCount,
      rule01Count,
      largest,
    };
  }, [scopedIrregularCosts]);

  const distinctDepartments = useMemo(
    () => Array.from(new Set(scopedIrregularCosts.map((c) => c.department))).sort(),
    [scopedIrregularCosts]
  );

  const distinctRegions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of scopedIrregularCosts) {
      map.set(c.regionId, c.regionName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [scopedIrregularCosts]);

  const enrichedIrregularCosts = useMemo(() => {
    return scopedIrregularCosts.map((cost) => {
      const inv = state.investigations.find((i) => i.linkedRecordId === cost.id);
      const priority =
        inv?.priority ??
        (cost.amountCad >= 500_000 ? 'High' : cost.amountCad >= 250_000 ? 'Medium' : 'Standard');
      const status = inv?.status ?? 'demo_open';
      return { cost, priority, status };
    });
  }, [scopedIrregularCosts, state.investigations]);

  const filteredIrregularCosts = useMemo(() => {
    const q = irSearch.trim().toLowerCase();
    const list = enrichedIrregularCosts.filter(({ cost, priority, status }) => {
      if (q) {
        const hit =
          cost.id.toLowerCase().includes(q) ||
          cost.item.toLowerCase().includes(q) ||
          cost.department.toLowerCase().includes(q) ||
          cost.regionName.toLowerCase().includes(q) ||
          cost.fiveWs.why.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (irRegion !== 'all' && cost.regionId !== irRegion) return false;
      if (irDept !== 'all' && cost.department !== irDept) return false;
      if (irTiming !== 'all' && cost.timing !== irTiming) return false;
      if (irStatus !== 'all' && status !== irStatus) return false;
      if (irPriority !== 'all' && priority !== irPriority) return false;
      if (irAmountRange === 'gte500k' && cost.amountCad < 500_000) return false;
      if (irAmountRange === 'gte250k' && cost.amountCad < 250_000) return false;
      if (irAmountRange === 'lt250k' && cost.amountCad >= 250_000) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      const av = a.cost[sortField];
      const bv = b.cost[sortField];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [
    enrichedIrregularCosts,
    irSearch,
    irRegion,
    irDept,
    irTiming,
    irStatus,
    irPriority,
    irAmountRange,
    sortField,
    sortDir,
  ]);

  const hasIrFilters =
    irSearch.trim() !== '' ||
    irRegion !== 'all' ||
    irDept !== 'all' ||
    irTiming !== 'all' ||
    irStatus !== 'all' ||
    irAmountRange !== 'all' ||
    irPriority !== 'all';

  const resetIrFilters = () => {
    setIrSearch('');
    setIrRegion('all');
    setIrDept('all');
    setIrTiming('all');
    setIrStatus('all');
    setIrAmountRange('all');
    setIrPriority('all');
  };

  const filteredIrTotalCad = useMemo(
    () => filteredIrregularCosts.reduce((sum, item) => sum + item.cost.amountCad, 0),
    [filteredIrregularCosts]
  );

  // Ledger Tab Filtered Lists
  const filteredCaseLedgerRefs = useMemo(() => {
    const q = caseLedgerSearch.trim().toLowerCase();
    return PARTIAL_LEDGER_TRANSACTIONS.filter((tx) => {
      const inv = state.investigations.find((i) => i.linkedRecordId === tx.linkedIrregularCostId);
      const status = inv?.status ?? 'demo_open';
      if (caseLedgerStatus !== 'all' && status !== caseLedgerStatus) return false;
      if (!q) return true;
      return (
        tx.journalOrPostingRef.toLowerCase().includes(q) ||
        tx.glAccount.toLowerCase().includes(q) ||
        tx.linkedIrregularCostId.toLowerCase().includes(q) ||
        tx.preparerLabel.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q)
      );
    });
  }, [caseLedgerSearch, caseLedgerStatus, state.investigations]);

  const uploadedPeriods = useMemo(
    () =>
      Array.from(new Set(state.uploadedLedgerTransactions.map((t) => t.accountingPeriod))).sort(),
    [state.uploadedLedgerTransactions]
  );

  const uploadedDepts = useMemo(
    () => Array.from(new Set(state.uploadedLedgerTransactions.map((t) => t.department))).sort(),
    [state.uploadedLedgerTransactions]
  );

  const filteredUploadedTransactions = useMemo(() => {
    const q = uploadedSearch.trim().toLowerCase();
    return state.uploadedLedgerTransactions.filter((tx) => {
      if (uploadedPeriodFilter !== 'all' && tx.accountingPeriod !== uploadedPeriodFilter) {
        return false;
      }
      if (uploadedDeptFilter !== 'all' && tx.department !== uploadedDeptFilter) {
        return false;
      }
      if (!q) return true;
      return (
        tx.transactionId.toLowerCase().includes(q) ||
        tx.glAccount.toLowerCase().includes(q) ||
        tx.department.toLowerCase().includes(q) ||
        (tx.description ?? '').toLowerCase().includes(q) ||
        (tx.expenseCategory ?? '').toLowerCase().includes(q) ||
        (tx.invoiceReference ?? '').toLowerCase().includes(q) ||
        tx.approvalReference.toLowerCase().includes(q)
      );
    });
  }, [
    state.uploadedLedgerTransactions,
    uploadedSearch,
    uploadedPeriodFilter,
    uploadedDeptFilter,
  ]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'amountCad' ? 'desc' : 'asc');
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Financial Intelligence" />
        <UnavailableDataState
          title={`Financial Intelligence is scoped for ${activeUser.title}`}
          description="General ledger, full income statement analysis, and all seven irregular cost records are accessible to Helen Park (Group Controller) and Dana Morales (Cost Accountant)."
          actionLabel="Return to Executive Overview"
          onAction={() => navigate('/overview')}
        />
      </div>
    );
  }

  const yoySalesDelta = priorYearStatement
    ? currentStatement.salesCad - priorYearStatement.salesCad
    : null;
  const yoySalesPct =
    priorYearStatement && priorYearStatement.salesCad !== 0
      ? (yoySalesDelta! / priorYearStatement.salesCad) * 100
      : null;

  const yoyOeDelta = priorYearStatement
    ? currentStatement.operatingEarningsCad - priorYearStatement.operatingEarningsCad
    : null;
  const yoyOePct =
    priorYearStatement && priorYearStatement.operatingEarningsCad !== 0
      ? (yoyOeDelta! / priorYearStatement.operatingEarningsCad) * 100
      : null;

  const qoqOeDelta = priorQuarterStatement
    ? currentStatement.operatingEarningsCad - priorQuarterStatement.operatingEarningsCad
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financial Intelligence"
        actions={
          <div className="flex flex-wrap items-center gap-2 relative" ref={sourcePopoverRef}>
            <button
              type="button"
              onClick={() => setShowSourcePopover((v) => !v)}
              aria-expanded={showSourcePopover}
              aria-label="Data basis and source references"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#5F6368] bg-white border border-[#E2E5E8] rounded hover:text-[#231F20] hover:bg-[#F5F6F7] transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Data Basis</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const selected =
                  drawerRecord?.type === 'walk_entry'
                    ? ` Selected walk line: ${drawerRecord.record.id}.`
                    : drawerRecord?.type === 'irregular_cost'
                      ? ` Selected irregular cost: ${drawerRecord.record.id}.`
                      : selectedWalkEntryId
                        ? ` Selected walk line: ${selectedWalkEntryId}.`
                        : '';
                const prompt =
                  activeTab === 'walk'
                    ? `Explain the ${walkType} operating-earnings bridge ending ${state.selectedQuarterId} using only the official walk lines and linked records.${selected}`
                    : activeTab === 'irregular'
                      ? `Explain the Q3 2026 irregular costs visible to this role. Identify which records need investigation and cite their source references. Do not treat them as confirmed fraud or recoverable cash.${selected}`
                      : activeTab === 'ledger'
                        ? `Summarize the ledger references available for ${state.selectedQuarterId} and cite the source records.`
                        : `Compare ${state.selectedQuarterId} sales, operating costs, and operating earnings with the prior quarter and prior year using the official income statements.`;
                openAskWithContext(prompt);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#E53C2E]" />
              <span>Analyze with SKYJACK AI</span>
            </button>

            {hasPermission('generate_reports') && (
              <button
                type="button"
                onClick={() =>
                  openReportStudioWithPreset({
                    templateId: 'executive_financial_review',
                    reportingPeriod: state.selectedQuarterId,
                    comparisonType: walkType,
                    includedSections:
                      activeTab === 'walk'
                        ? ['fin_income_statement', 'fin_profit_walk', 'gov_material_variance_status']
                        : activeTab === 'irregular'
                          ? ['reg_irregular_costs', 'reg_dept_irregular_costs', 'fin_profit_walk']
                          : [
                              'fin_income_statement',
                              'fin_sales_trend',
                              'fin_oe_trend',
                              'fin_profit_walk',
                              'reg_sales_by_region',
                              'reg_irregular_costs',
                            ],
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3124] transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Send to Report Studio</span>
              </button>
            )}

            {showSourcePopover && (
              <div
                role="dialog"
                aria-label="Financial data sources and basis"
                className="absolute right-0 top-10 z-30 w-80 sm:w-96 bg-white border border-[#E2E5E8] rounded-md p-4 shadow-lg text-xs text-[#5F6368] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2E5E8]">
                  <span className="font-semibold text-[#231F20]">
                    Financial Data Sources &amp; Accounting Basis
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSourcePopover(false)}
                    aria-label="Close data basis popover"
                    className="p-1 rounded hover:bg-[#F5F6F7] text-[#5F6368] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 leading-relaxed">
                  <p>
                    <strong className="text-[#231F20]">Statements &amp; Walks:</strong> Appendix 1.1–1.3
                    (reported in CAD thousands, normalized ×1,000 to full CAD). Consolidated corporate
                    basis only; regional and plant P&amp;Ls are not published in the case data.
                  </p>
                  <p>
                    <strong className="text-[#231F20]">Irregular Costs &amp; Ledger:</strong> Appendix
                    2.1–2.3 (full CAD). Flagged irregular expenses are already recorded inside Q3 2026
                    Operating Earnings and do not represent guaranteed recoverable savings or confirmed
                    fraud.
                  </p>
                  <p className="text-[11px] text-[#7E8082]">
                    Fictional case simulation dataset for SKYJACK Prompt to Pitch 2026.
                  </p>
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Four-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Financial Intelligence sections"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#ECEEF0] border border-[#E2E5E8] rounded-md"
        >
          {([
            ['performance', 'Performance'],
            ['walk', 'Earnings Walk'],
            ['irregular', 'Irregular Costs'],
            ['ledger', 'Ledger'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === key
                  ? 'bg-white text-[#231F20] shadow-2xs'
                  : 'text-[#5F6368] hover:text-[#231F20]'
              }`}
            >
              {label}
              {key === 'irregular' && (
                <AlertCircle className="ml-1.5 inline w-3.5 h-3.5 text-[#E53C2E]" aria-label="Irregular costs need review" />
              )}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 bg-white border border-[#E2E5E8] rounded-md px-2.5 py-1.5 text-[#5F6368]">
          <span className="text-[11px] font-medium">Period</span>
          <select
            aria-label="Reporting period"
            value={state.selectedQuarterId}
            onChange={(event) => setQuarterFilter(event.target.value as typeof state.selectedQuarterId)}
            className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer"
          >
            {REPORTING_PERIODS.map((period) => (
              <option key={period.id} value={period.id}>{period.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* TAB 1: PERFORMANCE */}
      {activeTab === 'performance' && (
        <div className="space-y-4">
          {/* 4 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              className="bg-white border border-[#E2E5E8] rounded-md p-3"
              title={`Exact ${state.selectedQuarterId} Sales: ${formatMoney(currentStatement.salesCad)}`}
            >
              <div className="text-xs font-medium text-[#5F6368]">Sales</div>
              <div className="text-xl font-semibold tabular-nums text-[#231F20] mt-1">
                {formatCompactMoney(currentStatement.salesCad)}
              </div>
              {yoySalesPct !== null && (
                <div className="mt-1.5 text-[11px] font-medium tabular-nums">
                  <span className={yoySalesPct >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                    {yoySalesPct >= 0 ? '+' : ''}
                    {yoySalesPct.toFixed(1)}% YoY
                  </span>
                </div>
              )}
            </div>

            <div
              className="bg-white border border-[#E2E5E8] rounded-md p-3"
              title={`Exact ${state.selectedQuarterId} Operating Earnings: ${formatMoney(currentStatement.operatingEarningsCad)}`}
            >
              <div className="text-xs font-medium text-[#5F6368]">Operating Earnings</div>
              <div className="text-xl font-semibold tabular-nums text-[#231F20] mt-1">
                {formatCompactMoney(currentStatement.operatingEarningsCad)}
              </div>
              {yoyOePct !== null && (
                <div className="mt-1.5 text-[11px] font-medium tabular-nums">
                  <span className={yoyOePct >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                    {yoyOePct >= 0 ? '+' : ''}
                    {yoyOePct.toFixed(1)}% YoY
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">Operating Margin</div>
              <div className="text-xl font-semibold tabular-nums text-[#E53C2E] mt-1">
                {currentStatement.oeShareOfSalesPct.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">Operating Earnings Change</div>
              <div className="mt-1.5 space-y-1">
                <div
                  className="flex items-center justify-between text-sm font-mono tabular-nums"
                  title={yoyOeDelta !== null ? `YoY Change: ${formatMoney(yoyOeDelta, { showSign: true })}` : undefined}
                >
                  <span className="text-xs font-sans text-[#5F6368]">YoY</span>
                  <span
                    className={`font-semibold ${
                      yoyOeDelta === null
                        ? 'text-[#5F6368]'
                        : yoyOeDelta >= 0
                          ? 'text-[#16A34A]'
                          : 'text-[#DC2626]'
                    }`}
                  >
                    {yoyOeDelta !== null
                      ? formatCompactMoney(yoyOeDelta, { showSign: true })
                      : 'N/A'}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between text-sm font-mono tabular-nums"
                  title={qoqOeDelta !== null ? `QoQ Change: ${formatMoney(qoqOeDelta, { showSign: true })}` : undefined}
                >
                  <span className="text-xs font-sans text-[#5F6368]">QoQ</span>
                  <span
                    className={`font-semibold ${
                      qoqOeDelta === null
                        ? 'text-[#5F6368]'
                        : qoqOeDelta >= 0
                          ? 'text-[#16A34A]'
                          : 'text-[#DC2626]'
                    }`}
                  >
                    {qoqOeDelta !== null
                      ? formatCompactMoney(qoqOeDelta, { showSign: true })
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trend & 100% Stacked Cost Composition Row */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#231F20]">
                    Eight-Quarter Financial Trend
                  </h3>
                  <p className="text-[11px] text-[#5F6368]">
                    Click any quarter to inspect its composition and statement column
                  </p>
                </div>
                <div className="inline-flex p-0.5 bg-[#ECEEF0] rounded border border-[#E2E5E8]">
                  {([
                    ['operating_earnings', 'Operating Earnings'],
                    ['sales', 'Sales'],
                    ['margin', 'OE Margin %'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setChartMode(key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${
                        chartMode === key
                          ? 'bg-white text-[#231F20] shadow-2xs'
                          : 'text-[#5F6368] hover:text-[#231F20]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <EightQuarterPerformanceChart
                statements={INCOME_STATEMENTS}
                selectedQuarterId={state.selectedQuarterId}
                onSelectQuarter={setQuarterFilter}
                mode={chartMode}
              />
            </div>

            <div className="xl:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#231F20]">
                    Revenue Allocation ({state.selectedQuarterId})
                  </h3>
                  <p className="text-[11px] text-[#5F6368]">
                    Sales split into operating costs and operating earnings.
                  </p>
                </div>
                <ProvenanceText provenance="derived_calculation" sourceRef="Appendix 1.1" />
              </div>
              <CostCompositionChart
                statement={currentStatement}
                highlightedField={highlightedStatementField}
                onSelectField={setHighlightedStatementField}
              />
            </div>
          </div>

          {/* 8-Quarter Consolidated Income Statement Table */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#231F20]">
                  Consolidated Income Statements (Eight Quarters · {state.currency})
                </h3>
                <p className="text-[11px] text-[#5F6368]">
                  Corporate consolidated figures only · Click a column header to change period or a composition segment to highlight its row
                </p>
              </div>
              <ProvenanceText provenance="official_case_data" sourceRef="Appendix 1.1 (000s normalized ×1,000)" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1012px] table-fixed text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="w-[180px] py-2.5 px-3 text-left font-medium sticky left-0 z-10 bg-[#F5F6F7] border-r border-[#E2E5E8]">
                      Category
                    </th>
                    {INCOME_STATEMENTS.map((s) => {
                      const isColSelected = s.quarterId === state.selectedQuarterId;
                      return (
                        <th
                          key={s.id}
                          onClick={() => setQuarterFilter(s.quarterId)}
                          className={`w-[104px] py-2.5 px-3 text-right font-mono cursor-pointer whitespace-nowrap transition-colors ${
                            isColSelected
                              ? 'text-[#E53C2E] font-semibold bg-[#FDF2F0]'
                              : 'font-medium hover:text-[#231F20]'
                          }`}
                        >
                          {s.quarterId}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8] tabular-nums font-mono">
                  {([
                    ['Sales', 'salesCad', false],
                    ['Variable costs', 'variableCostsCad', true],
                    ['Fixed plant costs', 'fixedPlantCostsCad', true],
                    ['SG&A', 'sgaCad', true],
                    ['Amortization', 'amortizationCad', true],
                    ['Operating earnings', 'operatingEarningsCad', true],
                  ] as const).map(([label, field, highlightable]) => {
                    const isRowHighlighted =
                      highlightable && highlightedStatementField === field;
                    const isSummaryRow = field === 'operatingEarningsCad' || field === 'salesCad';
                    const rowBg = isRowHighlighted
                      ? 'bg-[#FDF2F0]'
                      : field === 'operatingEarningsCad'
                        ? 'bg-[#F5F6F7]'
                        : 'bg-white';

                    return (
                      <tr
                        key={field}
                        onClick={() => {
                          if (highlightable) {
                            setHighlightedStatementField(
                              isRowHighlighted ? null : (field as StatementRowField)
                            );
                          }
                        }}
                        className={`${rowBg} ${
                          highlightable ? 'cursor-pointer hover:bg-[#F8F9FA]' : ''
                        } ${isSummaryRow ? 'font-semibold' : ''}`}
                      >
                        <td
                          className={`py-2.5 px-3 font-sans sticky left-0 z-10 border-r border-[#E2E5E8] whitespace-nowrap ${rowBg} ${
                            isRowHighlighted
                              ? 'text-[#E53C2E] font-semibold'
                              : field === 'operatingEarningsCad'
                                ? 'text-[#231F20] font-semibold'
                                : 'text-[#231F20]'
                          }`}
                        >
                          {label}
                        </td>
                        {INCOME_STATEMENTS.map((s) => {
                          const isColSelected = s.quarterId === state.selectedQuarterId;
                          return (
                            <td
                              key={s.id}
                              title={formatMoney(s[field])}
                              className={`py-2.5 px-3 text-right whitespace-nowrap ${
                                isRowHighlighted
                                  ? 'bg-[#FDF2F0] text-[#231F20] font-semibold'
                                  : isColSelected
                                    ? 'bg-[#E53C2E]/[0.05] font-semibold text-[#231F20]'
                                    : 'text-[#231F20]'
                              }`}
                            >
                              {formatShortMoney(s[field])}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="bg-white">
                    <td className="py-2.5 px-3 font-sans text-[#5F6368] sticky left-0 z-10 bg-white border-r border-[#E2E5E8] whitespace-nowrap">
                      OE share of sales
                    </td>
                    {INCOME_STATEMENTS.map((s) => {
                      const isColSelected = s.quarterId === state.selectedQuarterId;
                      return (
                        <td
                          key={s.id}
                          className={`py-2.5 px-3 text-right whitespace-nowrap ${
                            isColSelected
                              ? 'text-[#E53C2E] font-semibold bg-[#E53C2E]/[0.05]'
                              : 'text-[#5F6368]'
                          }`}
                        >
                          {s.oeShareOfSalesPct.toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EARNINGS WALK */}
      {activeTab === 'walk' && (
        <div className="space-y-4">
          {/* 3 Compact Bridge Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">
                Starting Operating Earnings ({activeWalk.fromQuarterId})
              </div>
              <div className="text-xl font-semibold tabular-nums text-[#231F20] mt-1">
                {formatMoney(walkSummary.startCad)}
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">
                Net {walkType} Operating Earnings Change
              </div>
              <div
                className={`text-xl font-semibold tabular-nums mt-1 ${
                  walkSummary.netChangeCad >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {formatMoney(walkSummary.netChangeCad, { showSign: true })}
              </div>
              <div className="text-[11px] font-mono text-[#5F6368] mt-1">
                {walkSummary.netChangePct >= 0 ? '+' : ''}
                {walkSummary.netChangePct.toFixed(1)}% ({activeWalk.fromQuarterId} → {activeWalk.toQuarterId})
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">
                Ending Operating Earnings ({activeWalk.toQuarterId})
              </div>
              <div className="text-xl font-semibold tabular-nums text-[#E53C2E] mt-1">
                {formatMoney(walkSummary.endCad)}
              </div>
            </div>
          </div>

          {/* Waterfall Card */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#231F20]">{activeWalk.title}</h3>
                <p className="text-xs text-[#5F6368]">
                  Select a bar to inspect its details. Material lines are at least {formatCompactMoney(1_000_000)}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex p-0.5 bg-[#ECEEF0] rounded border border-[#E2E5E8]">
                  {(['YoY', 'QoQ'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setWalkType(t);
                        setSelectedWalkEntryId(null);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                        walkType === t ? 'bg-white text-[#231F20] shadow-2xs' : 'text-[#5F6368]'
                      }`}
                    >
                      {t === 'YoY' ? 'Q3 2025 → Q3 2026 (YoY)' : 'Q2 2026 → Q3 2026 (QoQ)'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setMaterialOnly((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer transition-colors ${
                    materialOnly
                      ? 'bg-[#231F20] text-white border-[#231F20]'
                      : 'bg-white text-[#231F20] border-[#E2E5E8] hover:bg-[#F5F6F7]'
                  }`}
                >
                  {materialOnly ? 'Material Only (≥ $1M)' : 'Filter Material Only (≥ $1M)'}
                </button>
              </div>
            </div>

            <OperatingEarningsWaterfallChart
              entries={activeWalk.entries}
              materialOnly={materialOnly}
              selectedEntryId={selectedWalkEntryId}
              onResetMaterialOnly={() => setMaterialOnly(false)}
              onSelectEntry={(entry) => {
                setSelectedWalkEntryId(entry.id);
                openDrawer({ type: 'walk_entry', record: entry, walkTitle: activeWalk.title });
              }}
            />
          </div>

          {/* Walk Reconciliation & Link Classification Table */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#231F20]">
                  Walk Line Detail &amp; Irregular Cost Mapping
                </h3>
                <p className="text-[11px] text-[#5F6368]">
                  Linked case records stay attached to the walk line.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A]">
                <CheckCircle2 className="w-4 h-4" />
                Reconciles to {formatMoney(walkSummary.endCad)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="py-2.5 px-3 text-left font-medium">Walk Step</th>
                    <th className="py-2.5 px-3 text-left font-medium">Category</th>
                    <th className="py-2.5 px-3 text-right font-medium">Amount ({state.currency})</th>
                    <th className="py-2.5 px-3 text-left font-medium">Rule 03 Materiality</th>
                    <th className="py-2.5 px-3 text-left font-medium">Irregular Cost Relationship</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8]">
                  {filteredWalkEntries.map((entry) => {
                    const isEndpoint = entry.bucket === 'Start' || entry.bucket === 'End';
                    const isMat = !isEndpoint && Math.abs(entry.amountCad) >= 1_000_000;
                    const isEndRow = entry.bucket === 'End';

                    return (
                      <React.Fragment key={entry.id}>
                        {isEndRow && materialOnly && walkSummary.minorCount > 0 && (
                          <tr className="bg-[#F8F9FA] text-[#5F6368]">
                            <td className="py-2.5 px-3 font-medium text-[#231F20]">
                              Other minor variances (&lt; {formatCompactMoney(1_000_000)} · {walkSummary.minorCount} items grouped)
                            </td>
                            <td className="py-2.5 px-3">Aggregate</td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                                walkSummary.minorNetCad >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                              }`}
                            >
                              {formatMoney(walkSummary.minorNetCad, { showSign: true })}
                            </td>
                            <td className="py-2.5 px-3">Below {formatCompactMoney(1_000_000)}</td>
                            <td className="py-2.5 px-3">
                              <button
                                type="button"
                                onClick={() => setMaterialOnly(false)}
                                className="text-[#E53C2E] hover:underline cursor-pointer"
                              >
                                Expand all {activeWalk.entries.length} walk lines
                              </button>
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={() => {
                            setSelectedWalkEntryId(entry.id);
                            openDrawer({
                              type: 'walk_entry',
                              record: entry,
                              walkTitle: activeWalk.title,
                            });
                          }}
                          className={`hover:bg-[#F5F6F7] cursor-pointer transition-colors ${
                            isEndpoint
                              ? 'bg-[#F5F6F7] font-semibold'
                              : selectedWalkEntryId === entry.id
                                ? 'bg-[#E53C2E]/[0.05]'
                                : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-[#231F20]">{entry.stepLabel}</td>
                          <td className="py-2.5 px-3 text-[#5F6368]">{entry.bucket}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                              isEndpoint
                                ? 'text-[#231F20]'
                                : entry.amountCad >= 0
                                  ? 'text-[#16A34A]'
                                  : 'text-[#DC2626]'
                            }`}
                          >
                            {formatMoney(entry.amountCad, { showSign: !isEndpoint })}
                          </td>
                          <td className="py-2.5 px-3">
                            {isEndpoint ? (
                              <span className="text-[#5F6368]">—</span>
                            ) : isMat ? (
                              <span className="text-[#E53C2E] font-medium">Material (≥ {formatCompactMoney(1_000_000)})</span>
                            ) : (
                              <span className="text-[#5F6368]">Below {formatCompactMoney(1_000_000)}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[#5F6368]">
                            {entry.linkClassification === 'direct_appendix_link' && (
                              <span className="text-[#231F20] font-medium">
                                Direct link → {entry.linkedIrregularCostId}
                              </span>
                            )}
                            {entry.linkClassification === 'contextual_bucket_link' && (
                              <span>
                                Contextual link
                                {entry.linkedIrregularCostId ? ` (${entry.linkedIrregularCostId})` : ''}
                              </span>
                            )}
                            {(!entry.linkClassification ||
                              entry.linkClassification === 'not_independently_listed') && (
                              <span>{isEndpoint ? '—' : 'Not independently listed'}</span>
                            )}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IRREGULAR COSTS */}
      {activeTab === 'irregular' && (
        <div className="space-y-4">
          {/* 4 Summary Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">Flagged Amount (Q3 2026)</div>
              <div className="text-xl font-semibold tabular-nums text-[#231F20] mt-1">
                {formatMoney(irregularSummary.totalCad)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1 leading-snug">
                Recorded in operating earnings. Not confirmed fraud or recoverable cash.
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">Visible Case Records</div>
              <div className="text-xl font-semibold tabular-nums text-[#231F20] mt-1">
                {scopedIrregularCosts.length}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1">
                {irregularSummary.rule01Count} records ≥ {formatMoney(250_000)} (Rule 01 threshold)
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">Largest Irregular Item</div>
              <div className="text-xl font-semibold tabular-nums text-[#E53C2E] mt-1">
                {irregularSummary.largest ? formatMoney(irregularSummary.largest.amountCad) : formatMoney(0)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1 truncate">
                {irregularSummary.largest
                  ? `${irregularSummary.largest.id} · ${irregularSummary.largest.item}`
                  : 'No visible records'}
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-3">
              <div className="text-xs font-medium text-[#5F6368]">One-Time vs. Trend Split</div>
              <div className="mt-1.5 space-y-1 text-xs font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[#5F6368]">
                    One-time ({irregularSummary.oneTimeCount})
                  </span>
                  <span className="font-semibold text-[#231F20]">
                    {formatMoney(irregularSummary.oneTimeCad)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[#5F6368]">
                    Trend ({irregularSummary.trendCount})
                  </span>
                  <span className="font-semibold text-[#E53C2E]">
                    {formatMoney(irregularSummary.trendCad)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Department & Timing Charts */}
          <IrregularCostsAnalytics
            records={scopedIrregularCosts}
            selectedDepartment={irDept}
            selectedTiming={irTiming}
            onSelectDepartment={setIrDept}
            onSelectTiming={setIrTiming}
          />

          {/* Search & Multi-Filter Bar */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[210px]">
                <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={irSearch}
                  onChange={(e) => setIrSearch(e.target.value)}
                  placeholder="Search ID, item, why, or department..."
                  className="w-full pl-8 pr-3 py-1.5 border border-[#E2E5E8] rounded text-xs focus:outline-none focus:border-[#231F20]"
                />
              </div>
              <Filter className="w-3.5 h-3.5 text-[#5F6368]" />
              <select
                aria-label="Filter irregular costs by region"
                value={irRegion}
                onChange={(e) => setIrRegion(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">All Regions</option>
                {distinctRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter irregular costs by department"
                value={irDept}
                onChange={(e) => setIrDept(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">All Departments</option>
                {distinctDepartments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter irregular costs by timing"
                value={irTiming}
                onChange={(e) => setIrTiming(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">All Timing</option>
                <option value="One-time">One-time</option>
                <option value="Trend">Trend</option>
              </select>
              <select
                aria-label="Filter irregular costs by amount"
                value={irAmountRange}
                onChange={(e) => setIrAmountRange(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">Any Amount</option>
                <option value="gte500k">≥ {formatMoney(500_000)}</option>
                <option value="gte250k">≥ {formatMoney(250_000)} (Rule 01)</option>
                <option value="lt250k">&lt; {formatMoney(250_000)}</option>
              </select>
              <select
                aria-label="Filter irregular costs by priority"
                value={irPriority}
                onChange={(e) => setIrPriority(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">All Priorities</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Standard">Standard</option>
              </select>
              <select
                aria-label="Filter irregular costs by status"
                value={irStatus}
                onChange={(e) => setIrStatus(e.target.value)}
                className="border border-[#E2E5E8] rounded px-2 py-1.5 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="demo_open">Open</option>
                <option value="demo_in_review">In Review</option>
                <option value="demo_documented">Documented</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0F1F3] text-[11px] text-[#5F6368]">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Showing <strong className="text-[#231F20]">{filteredIrregularCosts.length}</strong> of{' '}
                  {scopedIrregularCosts.length} records · Filtered Total:{' '}
                  <strong className="font-mono tabular-nums text-[#231F20]">
                    {formatMoney(filteredIrTotalCad)}
                  </strong>
                </span>
                {hasIrFilters && (
                  <button
                    type="button"
                    onClick={resetIrFilters}
                    className="inline-flex items-center gap-1 text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset filters
                  </button>
                )}
              </div>

              <div className="inline-flex items-center gap-1 p-0.5 bg-[#ECEEF0] rounded border border-[#E2E5E8]">
                {(['compact', 'detailed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setIrDensity(mode)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded capitalize cursor-pointer ${
                      irDensity === mode ? 'bg-white text-[#231F20]' : 'text-[#5F6368]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Irregular Costs Table */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th
                      onClick={() => toggleSort('id')}
                      className="py-2.5 px-3 text-left font-medium cursor-pointer whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1">
                        ID <ArrowDownUp className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-left font-medium">Description</th>
                    <th
                      onClick={() => toggleSort('department')}
                      className="py-2.5 px-3 text-left font-medium cursor-pointer whitespace-nowrap"
                    >
                      Department
                    </th>
                    <th
                      onClick={() => toggleSort('regionName')}
                      className="py-2.5 px-3 text-left font-medium cursor-pointer whitespace-nowrap"
                    >
                      Region
                    </th>
                    <th
                      onClick={() => toggleSort('timing')}
                      className="py-2.5 px-3 text-left font-medium cursor-pointer whitespace-nowrap"
                    >
                      Timing
                    </th>
                    <th className="py-2.5 px-3 text-left font-medium whitespace-nowrap">Walk Bucket</th>
                    <th className="py-2.5 px-3 text-left font-medium whitespace-nowrap">Priority</th>
                    <th className="py-2.5 px-3 text-left font-medium whitespace-nowrap">Status</th>
                    <th
                      onClick={() => toggleSort('amountCad')}
                      className="py-2.5 px-3 text-right font-medium cursor-pointer whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1">
                        Amount <ArrowDownUp className="w-3 h-3" />
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">OE Effect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8]">
                  {filteredIrregularCosts.map(({ cost, priority, status }) => (
                    <tr
                      key={cost.id}
                      onClick={() => openDrawer({ type: 'irregular_cost', record: cost })}
                      className="hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#E53C2E] whitespace-nowrap align-top">
                        {cost.id}
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="font-medium text-[#231F20]">{cost.item}</div>
                        {irDensity === 'detailed' && (
                          <div className="text-[11px] text-[#5F6368] mt-0.5 max-w-md">
                            {cost.fiveWs.why}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap align-top">
                        {cost.department}
                      </td>
                      <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap align-top">
                        {cost.regionName}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap align-top">
                        <span
                          className={`font-medium ${
                            cost.timing === 'Trend' ? 'text-[#E53C2E]' : 'text-[#231F20]'
                          }`}
                        >
                          {cost.timing}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap align-top">
                        {cost.walkBucket}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap align-top">
                        <span
                          className={
                            priority === 'High'
                              ? 'text-[#E53C2E]'
                              : priority === 'Medium'
                                ? 'text-[#B45309]'
                                : 'text-[#5F6368]'
                          }
                        >
                          {priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap align-top">
                        {formatInvestigationStatus(status)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#231F20] whitespace-nowrap align-top">
                        {formatMoney(cost.amountCad)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#DC2626] whitespace-nowrap align-top">
                        {formatMoney(cost.effectOnOeCad)}
                      </td>
                    </tr>
                  ))}
                  {filteredIrregularCosts.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-xs text-[#5F6368]">
                        No irregular cost records match your active filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-5">
          {/* Dataset Selector & Gateway Bar */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label="Ledger dataset views"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#ECEEF0] border border-[#E2E5E8] rounded-md"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={ledgerView === 'case_references'}
                  onClick={() => setLedgerView('case_references')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    ledgerView === 'case_references'
                      ? 'bg-white text-[#231F20] shadow-2xs'
                      : 'text-[#5F6368] hover:text-[#231F20]'
                  }`}
                >
                  Case Ledger References
                  <span className="ml-1.5 font-mono text-[11px] text-[#7E8082]">
                    {PARTIAL_LEDGER_TRANSACTIONS.length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={ledgerView === 'authorized_uploads'}
                  onClick={() => setLedgerView('authorized_uploads')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    ledgerView === 'authorized_uploads'
                      ? 'bg-white text-[#231F20] shadow-2xs'
                      : 'text-[#5F6368] hover:text-[#231F20]'
                  }`}
                >
                  Authorized Uploaded Transactions
                  <span className="ml-1.5 font-mono text-[11px] text-[#7E8082]">
                    {state.uploadedLedgerTransactions.length}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/data-gateway')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-[#F5F6F7] border border-[#E2E5E8] rounded hover:bg-[#ECEEF0] whitespace-nowrap cursor-pointer shrink-0 self-start md:self-auto"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Open Data Gateway</span>
            </button>
          </div>

          {/* VIEW A: CASE LEDGER REFERENCES (Appendix 2.3 Citations Only) */}
          {ledgerView === 'case_references' && (
            <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#231F20]">
                    Case Ledger References ({filteredCaseLedgerRefs.length} of{' '}
                    {PARTIAL_LEDGER_TRANSACTIONS.length} Appendix 2.3 citations)
                  </h3>
                  <p className="text-[11px] text-[#5F6368]">
                    Explicit journal and GL references supplied in Appendix 2.3 only · A complete general ledger is intentionally not fabricated.
                  </p>
                </div>
                <ProvenanceText provenance="official_case_data" sourceRef="Appendix 2.3 Partial GL" />
              </div>

              {/* Filter Strip */}
              <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] flex flex-wrap items-center gap-2 text-xs">
                <div className="relative flex-1 min-w-[210px]">
                  <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={caseLedgerSearch}
                    onChange={(e) => setCaseLedgerSearch(e.target.value)}
                    placeholder="Search posting ref, GL account, IR ID, or preparer..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E5E8] rounded text-xs focus:outline-none focus:border-[#231F20]"
                  />
                </div>
                <select
                  aria-label="Filter case ledger references by review state"
                  value={caseLedgerStatus}
                  onChange={(e) => setCaseLedgerStatus(e.target.value)}
                  className="border border-[#E2E5E8] rounded px-2.5 py-1.5 bg-white"
                >
                  <option value="all">All Review States</option>
                  <option value="demo_open">Open</option>
                  <option value="demo_in_review">In Review</option>
                  <option value="demo_documented">Documented</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                      <th className="py-2.5 px-3 text-left font-medium">Source Ref</th>
                      <th className="py-2.5 px-3 text-left font-medium">Account Reference</th>
                      <th className="py-2.5 px-3 text-left font-medium">Associated IR</th>
                      <th className="py-2.5 px-3 text-left font-medium">Posting Period</th>
                      <th className="py-2.5 px-3 text-left font-medium">Preparer / Details</th>
                      <th className="py-2.5 px-3 text-left font-medium">Review State</th>
                      <th className="py-2.5 px-3 text-right font-medium">Amount ({state.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E5E8]">
                    {filteredCaseLedgerRefs.map((tx) => {
                      const linkedCost = scopedIrregularCosts.find(
                        (c) => c.id === tx.linkedIrregularCostId
                      );
                      const inv = state.investigations.find(
                        (i) => i.linkedRecordId === tx.linkedIrregularCostId
                      );
                      return (
                        <tr
                          key={tx.id}
                          onClick={() =>
                            linkedCost &&
                            openDrawer({ type: 'irregular_cost', record: linkedCost })
                          }
                          className="hover:bg-[#F5F6F7] cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#231F20] whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#E53C2E]" />
                              {tx.journalOrPostingRef}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#231F20]">{tx.glAccount}</td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-[#E53C2E]">
                            {tx.linkedIrregularCostId}
                          </td>
                          <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap">
                            {tx.postingDateLabel}
                          </td>
                          <td className="py-2.5 px-3 text-[#5F6368]">
                            <div className="text-[#231F20] font-medium">{tx.preparerLabel}</div>
                            <div>{tx.description}</div>
                          </td>
                          <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap">
                            {inv ? formatInvestigationStatus(inv.status) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#231F20] whitespace-nowrap">
                            {formatMoney(tx.amountCad)}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCaseLedgerRefs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-[#5F6368]">
                          No Appendix 2.3 ledger references match your search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 bg-[#F5F6F7] border-t border-[#E2E5E8] text-[11px] text-[#5F6368]">
                Note: IR-05 (AP manual approval, no PO), IR-06 (Q2 warranty accrual carry-forward), and IR-07 (unmatched customs broker billing) do not cite specific GL account numbers in Appendix 2.3 and remain tracked in the Irregular Costs register.
              </div>
            </div>
          )}

          {/* VIEW B: AUTHORIZED UPLOADED TRANSACTIONS */}
          {ledgerView === 'authorized_uploads' && (
            <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#231F20]">
                    Authorized Uploaded Transactions ({state.uploadedLedgerTransactions.length} committed)
                  </h3>
                  <p className="text-[11px] text-[#5F6368]">
                    Only validated &amp; Controller-authorized rows enter this register. Quarantined &amp; rejected rows remain isolated in Data Gateway.
                  </p>
                </div>
                <ProvenanceText provenance="user_uploaded" sourceRef="Data Gateway Authorized" />
              </div>

              {state.uploadedLedgerTransactions.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <div className="mx-auto w-10 h-10 rounded-full bg-[#F5F6F7] border border-[#E2E5E8] flex items-center justify-center text-[#5F6368]">
                    <Database className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <div className="text-sm font-semibold text-[#231F20]">
                      No authorized ledger uploads yet
                    </div>
                    <p className="text-xs text-[#5F6368] leading-relaxed">
                      Stage, validate, and authorize a CSV or XLSX ledger dataset in Data Gateway to inspect committed transactions here.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/data-gateway')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Open Data Gateway</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Filter Strip */}
                  <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] flex flex-wrap items-center gap-2 text-xs">
                    <div className="relative flex-1 min-w-[210px]">
                      <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                      <input
                        type="text"
                        value={uploadedSearch}
                        onChange={(e) => setUploadedSearch(e.target.value)}
                        placeholder="Search Txn ID, GL, description, invoice, or approval ref..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E5E8] rounded text-xs focus:outline-none focus:border-[#231F20]"
                      />
                    </div>
                    <select
                      aria-label="Filter uploaded ledger by period"
                      value={uploadedPeriodFilter}
                      onChange={(e) => setUploadedPeriodFilter(e.target.value)}
                      className="border border-[#E2E5E8] rounded px-2.5 py-1.5 bg-white"
                    >
                      <option value="all">All Periods</option>
                      {uploadedPeriods.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter uploaded ledger by department"
                      value={uploadedDeptFilter}
                      onChange={(e) => setUploadedDeptFilter(e.target.value)}
                      className="border border-[#E2E5E8] rounded px-2.5 py-1.5 bg-white"
                    >
                      <option value="all">All Departments</option>
                      {uploadedDepts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                          <th className="py-2.5 px-3 text-left font-medium">Txn ID</th>
                          <th className="py-2.5 px-3 text-left font-medium">Period / Date</th>
                          <th className="py-2.5 px-3 text-left font-medium">Dept &amp; GL</th>
                          <th className="py-2.5 px-3 text-left font-medium">Description / Invoice</th>
                          <th className="py-2.5 px-3 text-left font-medium">Approval Ref</th>
                          <th className="py-2.5 px-3 text-right font-medium">Amount ({state.currency})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                        {filteredUploadedTransactions.map((tx) => (
                          <tr
                            key={tx.id}
                            onClick={() => openDrawer({ type: 'uploaded_ledger', record: tx })}
                            className="hover:bg-[#F5F6F7] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#16A34A] whitespace-nowrap">
                              {tx.transactionId}
                            </td>
                            <td className="py-2.5 px-3 text-[#5F6368] whitespace-nowrap">
                              {tx.accountingPeriod} · {tx.postingDate}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-[#231F20] font-medium">{tx.department}</div>
                              <div className="text-[11px] font-mono text-[#5F6368]">{tx.glAccount}</div>
                            </td>
                            <td className="py-2.5 px-3 text-[#5F6368]">
                              <div className="text-[#231F20]">
                                {tx.description || tx.expenseCategory}
                              </div>
                              <div className="text-[11px] font-mono">
                                {tx.invoiceReference || tx.supplierId}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#231F20]">
                              {tx.approvalReference}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#231F20] whitespace-nowrap">
                              {formatMoney(tx.amountCad)}
                            </td>
                          </tr>
                        ))}
                        {filteredUploadedTransactions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-xs text-[#5F6368]">
                              No authorized uploaded transactions match your active filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
