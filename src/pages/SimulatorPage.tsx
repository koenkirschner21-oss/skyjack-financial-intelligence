import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { TARIFF_SCENARIOS } from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import {
  calculateMultiEntryTariffScenario,
} from '../domain/rulesEngine';
import {
  BurdenComparisonBars,
  ScenarioComparisonChart,
  TariffSensitivityChart,
} from '../components/simulator/SimulatorVisualizations';
import { PageHeader, ProvenanceText, UnavailableDataState } from '../components/common/StateViews';
import { QuarterId, SavedScenario } from '../types/domain';

const RATE_PRESETS = [
  { rate: 0, label: '0%' },
  { rate: 15, label: '15%' },
  { rate: 20, label: '20%' },
  { rate: 25, label: '25% Base' },
  { rate: 35, label: '35%' },
  { rate: 50, label: '50%' },
];

const DRAFT_STORAGE_KEY = 'skyjack_tariff_simulator_draft_v1';
const BASELINE_ENTRY_IDS = ['E-04', 'E-05', 'E-06'];

type BreakdownSortField =
  | 'entryId'
  | 'goodsValueCad'
  | 'mfnDutyCad'
  | 'currentAdditionalTariffCad'
  | 'hypotheticalAdditionalTariffCad'
  | 'quarterlyDeltaCad';

interface PersistedDraft {
  originFilter: string;
  goodsFilter: string;
  selectedEntryIds: string[];
  hypotheticalRatePct: number;
  annualizationQuarters: number;
  transitionCostCad: number;
  recurringAltSupplierDeltaCad: number;
}

function readStoredDraft(): PersistedDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
    if (
      typeof parsed.hypotheticalRatePct === 'number' &&
      Array.isArray(parsed.selectedEntryIds)
    ) {
      return {
        originFilter: typeof parsed.originFilter === 'string' ? parsed.originFilter : 'China',
        goodsFilter: typeof parsed.goodsFilter === 'string' ? parsed.goodsFilter : 'all',
        selectedEntryIds: parsed.selectedEntryIds,
        hypotheticalRatePct: Math.max(0, Math.min(500, parsed.hypotheticalRatePct)),
        annualizationQuarters:
          typeof parsed.annualizationQuarters === 'number'
            ? Math.max(1, Math.min(8, parsed.annualizationQuarters))
            : 4,
        transitionCostCad:
          typeof parsed.transitionCostCad === 'number' ? Math.max(0, parsed.transitionCostCad) : 0,
        recurringAltSupplierDeltaCad:
          typeof parsed.recurringAltSupplierDeltaCad === 'number'
            ? parsed.recurringAltSupplierDeltaCad
            : 0,
      };
    }
  } catch {
    // Ignore storage read errors in restricted iframe environments
  }
  return null;
}

export const SimulatorPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    setQuarterFilter,
    scopedCustomsEntries,
    simulatorPresetEntryIds,
    saveScenario,
    deleteScenario,
    openDrawer,
    openReportStudioWithPreset,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  const allowed = hasPermission('run_tariff_simulator');
  const canSave = hasPermission('save_tariff_scenario');
  const canReport = hasPermission('generate_reports');

  const initialDraft = useMemo(() => readStoredDraft(), []);
  const hasExplicitExternalPreset = useMemo(() => {
    const sortedA = [...simulatorPresetEntryIds].sort().join(',');
    const sortedB = [...BASELINE_ENTRY_IDS].sort().join(',');
    return sortedA !== sortedB;
  }, [simulatorPresetEntryIds]);

  const [originFilter, setOriginFilter] = useState<string>(() => {
    if (hasExplicitExternalPreset) return 'all';
    return initialDraft?.originFilter ?? 'China';
  });
  const [goodsFilter, setGoodsFilter] = useState<string>(() => {
    if (hasExplicitExternalPreset) return 'all';
    return initialDraft?.goodsFilter ?? 'all';
  });
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>(() => {
    if (hasExplicitExternalPreset) return simulatorPresetEntryIds;
    return initialDraft?.selectedEntryIds ?? simulatorPresetEntryIds;
  });
  const [scenarioQuarterId, setScenarioQuarterId] = useState<QuarterId>('Q3 2026');
  const [hypotheticalRatePct, setHypotheticalRatePct] = useState<number>(
    () => initialDraft?.hypotheticalRatePct ?? 15
  );
  const [annualizationQuarters, setAnnualizationQuarters] = useState<number>(
    () => initialDraft?.annualizationQuarters ?? 4
  );
  const [transitionCostCad, setTransitionCostCad] = useState<number>(
    () => initialDraft?.transitionCostCad ?? 0
  );
  const [recurringAltSupplierDeltaCad, setRecurringAltSupplierDeltaCad] = useState<number>(
    () => initialDraft?.recurringAltSupplierDeltaCad ?? 0
  );

  // Progressive disclosure controls
  const [extendedSliderRange, setExtendedSliderRange] = useState<boolean>(
    () => (initialDraft?.hypotheticalRatePct ?? 15) > 100
  );
  const [showAdvancedAssumptions, setShowAdvancedAssumptions] = useState<boolean>(false);
  const [showDetailedComparison, setShowDetailedComparison] = useState<boolean>(false);
  const [showAssumptionsPanel, setShowAssumptionsPanel] = useState<boolean>(false);
  const assumptionsPanelRef = useRef<HTMLDivElement | null>(null);

  // Per-shipment table sort
  const [sortField, setSortField] = useState<BreakdownSortField>('goodsValueCad');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Saved scenario management
  const [scenarioName, setScenarioName] = useState<string>('');
  const [scenarioNotes, setScenarioNotes] = useState<string>('');
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    state.savedScenarios.slice(0, 2).map((s) => s.id)
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Persist user draft preferences safely
  useEffect(() => {
    try {
      const payload: PersistedDraft = {
        originFilter,
        goodsFilter,
        selectedEntryIds,
        hypotheticalRatePct,
        annualizationQuarters,
        transitionCostCad,
        recurringAltSupplierDeltaCad,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota/iframe restrictions
    }
  }, [
    originFilter,
    goodsFilter,
    selectedEntryIds,
    hypotheticalRatePct,
    annualizationQuarters,
    transitionCostCad,
    recurringAltSupplierDeltaCad,
  ]);

  // Sync preset entries if user explicitly launches simulator from Trade page or Record Drawer
  const lastAppliedPresetRef = useRef<string>(BASELINE_ENTRY_IDS.join(','));
  useEffect(() => {
    const incomingKey = [...simulatorPresetEntryIds].sort().join(',');
    if (
      simulatorPresetEntryIds.length > 0 &&
      incomingKey !== lastAppliedPresetRef.current
    ) {
      lastAppliedPresetRef.current = incomingKey;
      setSelectedEntryIds(simulatorPresetEntryIds);
      const matched = scopedCustomsEntries.filter((e) =>
        simulatorPresetEntryIds.includes(e.id)
      );
      const origins = Array.from(new Set(matched.map((e) => e.originCountry)));
      setOriginFilter(origins.length === 1 ? origins[0] : 'all');
      setGoodsFilter('all');
    }
  }, [simulatorPresetEntryIds, scopedCustomsEntries]);

  const uniqueOrigins = useMemo(
    () => Array.from(new Set(scopedCustomsEntries.map((e) => e.originCountry))).sort(),
    [scopedCustomsEntries]
  );

  const uniqueGoods = useMemo(
    () => Array.from(new Set(scopedCustomsEntries.map((e) => e.goods))).sort(),
    [scopedCustomsEntries]
  );

  const visibleCandidateEntries = useMemo(() => {
    return scopedCustomsEntries.filter((e) => {
      if (originFilter !== 'all' && e.originCountry !== originFilter) return false;
      if (goodsFilter !== 'all' && e.goods !== goodsFilter) return false;
      return true;
    });
  }, [scopedCustomsEntries, originFilter, goodsFilter]);

  const selectedEntries = useMemo(
    () => scopedCustomsEntries.filter((e) => selectedEntryIds.includes(e.id)),
    [scopedCustomsEntries, selectedEntryIds]
  );

  const simulation = useMemo(
    () =>
      calculateMultiEntryTariffScenario({
        entries: selectedEntries,
        hypotheticalAdditionalRatePct: hypotheticalRatePct,
        annualizationQuarters,
        transitionCostCad,
        recurringAltSupplierDeltaPerQuarterCad: recurringAltSupplierDeltaCad,
      }),
    [
      selectedEntries,
      hypotheticalRatePct,
      annualizationQuarters,
      transitionCostCad,
      recurringAltSupplierDeltaCad,
    ]
  );

  // Analyze baseline additional tariff rates across selected entries
  const baselineRateSummary = useMemo(() => {
    if (selectedEntries.length === 0 || simulation.dutiableGoodsValueCad === 0) {
      return { weightedPct: 0, isUniform: true, uniqueRates: [] as number[] };
    }
    const uniqueRates = Array.from(new Set(selectedEntries.map((e) => e.additionalTariffPct)));
    const weightedPct =
      (simulation.currentAdditionalTariffCad / simulation.dutiableGoodsValueCad) * 100;
    return {
      weightedPct,
      isUniform: uniqueRates.length <= 1,
      uniqueRates: uniqueRates.sort((a, b) => a - b),
    };
  }, [selectedEntries, simulation]);

  // Sorted per-shipment breakdown rows
  const sortedBreakdown = useMemo(() => {
    const rows = [...simulation.perEntryBreakdown];
    rows.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'entryId') return a.entryId.localeCompare(b.entryId) * mul;
      return (a[sortField] - b[sortField]) * mul;
    });
    return rows;
  }, [simulation.perEntryBreakdown, sortField, sortDir]);

  const maxAbsRowDelta = useMemo(
    () =>
      Math.max(
        1,
        ...simulation.perEntryBreakdown.map((r) => Math.abs(r.quarterlyDeltaCad)),
        ...simulation.perEntryBreakdown.map((r) => r.goodsValueCad)
      ),
    [simulation.perEntryBreakdown]
  );

  const toggleSort = (field: BreakdownSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'entryId' ? 'asc' : 'desc');
    }
  };

  const toggleEntry = (id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRateChange = (nextRate: number) => {
    const clamped = Math.max(0, Math.min(500, Math.round(nextRate)));
    setHypotheticalRatePct(clamped);
    if (clamped > 100) {
      setExtendedSliderRange(true);
    }
  };

  const handleResetBaseline = () => {
    setOriginFilter('China');
    setGoodsFilter('all');
    setSelectedEntryIds(BASELINE_ENTRY_IDS);
    setScenarioQuarterId('Q3 2026');
    setHypotheticalRatePct(15);
    setAnnualizationQuarters(4);
    setTransitionCostCad(0);
    setRecurringAltSupplierDeltaCad(0);
    setExtendedSliderRange(false);
    lastAppliedPresetRef.current = BASELINE_ENTRY_IDS.join(',');
  };

  const handleSaveScenario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || selectedEntries.length === 0) return;
    const defaultName =
      scenarioName.trim() ||
      `${originFilter === 'all' ? 'Custom' : originFilter} ${hypotheticalRatePct}% (${selectedEntries.length} entries)`;
    const created = saveScenario({
      name: defaultName,
      quarterId: scenarioQuarterId,
      originFilter,
      goodsFilter,
      selectedEntryIds: [...selectedEntryIds],
      dutiableGoodsValueCad: simulation.dutiableGoodsValueCad,
      baselineAdditionalTariffCostCad: simulation.currentAdditionalTariffCad,
      mfnDutyCostCad: simulation.normalMfnDutyCad,
      chinaTariffRatePct: hypotheticalRatePct,
      annualizationQuarters,
      transitionCostCad,
      recurringAltSupplierDeltaPerQuarterCad: recurringAltSupplierDeltaCad,
      projectedQuarterlyTariffCad: simulation.hypotheticalAdditionalTariffCad,
      quarterlyDifferenceCad: simulation.quarterlyTariffDifferenceCad,
      projectedAnnualTariffCad:
        simulation.hypotheticalAdditionalTariffCad * annualizationQuarters,
      annualizedDifferenceCad: simulation.annualizedNetImpactWithSupplierCostsCad,
      notes: scenarioNotes.trim() || undefined,
    });
    if (created) {
      setScenarioName('');
      setScenarioNotes('');
      setCompareIds((prev) => [created.id, ...prev].slice(0, 4));
    }
  };

  const loadScenarioIntoForm = (scen: SavedScenario) => {
    setScenarioQuarterId(scen.quarterId);
    setOriginFilter(scen.originFilter);
    setGoodsFilter(scen.goodsFilter);
    setSelectedEntryIds(scen.selectedEntryIds);
    setHypotheticalRatePct(scen.chinaTariffRatePct);
    setExtendedSliderRange(scen.chinaTariffRatePct > 100);
    setAnnualizationQuarters(scen.annualizationQuarters);
    setTransitionCostCad(scen.transitionCostCad);
    setRecurringAltSupplierDeltaCad(scen.recurringAltSupplierDeltaPerQuarterCad);
    if (scen.transitionCostCad > 0 || scen.recurringAltSupplierDeltaPerQuarterCad !== 0 || scen.annualizationQuarters !== 4) {
      setShowAdvancedAssumptions(true);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 4)
    );
  };

  const comparedScenarios = useMemo(
    () => state.savedScenarios.filter((s) => compareIds.includes(s.id)),
    [state.savedScenarios, compareIds]
  );

  const openReportWithScenarios = () => {
    openReportStudioWithPreset({
      templateId: 'trade_tariff_review',
      reportingPeriod: scenarioQuarterId,
      datasetScope: 'combined_with_hypothetical',
      includedSections: [
        'trd_cost_composition',
        'str_tariff_scenarios',
        'trd_agreement_opportunities',
      ],
    });
  };

  const openAssumptionsPanel = () => {
    setShowAssumptionsPanel(true);
    setTimeout(() => {
      assumptionsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tariff Simulator" />
        <UnavailableDataState
          title={`Tariff Simulator restricted for ${activeUser.title}`}
          description="Tariff sensitivity modeling and saved scenario management are scoped to Customs & Trade Coordinator (Marco Silva) and Group Controller (Helen Park)."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  const diff = simulation.quarterlyTariffDifferenceCad;
  const diffLabel =
    diff < 0
      ? 'Potential Cost Reduction'
      : diff > 0
        ? 'Additional Cost Exposure'
        : 'No Cost Change';
  const diffColor =
    diff < 0 ? 'text-[#16A34A]' : diff > 0 ? 'text-[#DC2626]' : 'text-[#5F6368]';

  const annNet = simulation.annualizedNetImpactWithSupplierCostsCad;
  const annColor =
    annNet < 0 ? 'text-[#16A34A]' : annNet > 0 ? 'text-[#DC2626]' : 'text-[#5F6368]';

  const oeAnnual = simulation.estimatedOeImpactAnnualCad;
  const oeColor =
    oeAnnual > 0 ? 'text-[#16A34A]' : oeAnnual < 0 ? 'text-[#DC2626]' : 'text-[#5F6368]';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tariff Simulator"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAssumptionsPanel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#5F6368] bg-white border border-[#E2E5E8] rounded hover:text-[#231F20] hover:bg-[#F5F6F7] transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Assumptions &amp; Sources</span>
            </button>
            <button
              type="button"
              onClick={handleResetBaseline}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Baseline</span>
            </button>
            {canReport && (
              <button
                type="button"
                onClick={openReportWithScenarios}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#C93326] transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Add to Report</span>
              </button>
            )}
          </div>
        }
      />

      {/* THREE-PART INTERACTIVE WORKBENCH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 xl:grid-cols-[minmax(0,29fr)_minmax(0,45fr)_minmax(0,26fr)] gap-4 items-start">
        {/* LEFT (~29%): SCENARIO CONTROLS */}
        <section className="lg:col-span-5 xl:col-span-1 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#E53C2E]" />
              <h2 className="text-sm font-semibold text-[#231F20]">Scenario Controls</h2>
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[#5F6368]">
              {selectedEntries.length} entries · {formatCompactMoney(simulation.dutiableGoodsValueCad)}
            </span>
          </div>

          {state.selectedQuarterId !== 'Q3 2026' && (
            <div className="px-2.5 py-1.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded flex items-center justify-between gap-2 text-[11px] text-[#5F6368]">
              <span>Customs entries use Q3 2026 (App. 3.2).</span>
              <button
                type="button"
                onClick={() => setQuarterFilter('Q3 2026')}
                className="font-medium text-[#E53C2E] hover:underline shrink-0 cursor-pointer"
              >
                Switch to Q3 2026
              </button>
            </div>
          )}

          {/* Origin & Goods Category */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[#5F6368] block">Origin Country</span>
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#E2E5E8] rounded bg-white text-[#231F20] text-xs"
              >
                <option value="all">All Origins</option>
                {uniqueOrigins.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[#5F6368] block">Goods Category</span>
              <select
                value={goodsFilter}
                onChange={(e) => setGoodsFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#E2E5E8] rounded bg-white text-[#231F20] text-xs"
              >
                <option value="all">All Goods</option>
                {uniqueGoods.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Shipment Entry Selection */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
              <span className="font-medium text-[#5F6368]">Selected Shipments</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setOriginFilter('China');
                    setGoodsFilter('all');
                    setSelectedEntryIds(BASELINE_ENTRY_IDS);
                  }}
                  className="px-2 py-0.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded font-medium text-[#231F20] hover:bg-[#ECEEF0] cursor-pointer"
                >
                  China (E-04–E-06)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntryIds(visibleCandidateEntries.map((e) => e.id))}
                  className="px-2 py-0.5 bg-[#F5F6F7] border border-[#E2E5E8] rounded font-medium text-[#231F20] hover:bg-[#ECEEF0] cursor-pointer"
                >
                  All ({visibleCandidateEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntryIds([])}
                  className="px-2 py-0.5 bg-white border border-[#E2E5E8] rounded text-[#5F6368] hover:bg-[#F5F6F7] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border border-[#E2E5E8] rounded divide-y divide-[#E2E5E8] max-h-44 overflow-y-auto">
              {visibleCandidateEntries.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-[#5F6368]">
                  No customs entries match the current origin and goods filters.
                </div>
              ) : (
                visibleCandidateEntries.map((entry) => {
                  const checked = selectedEntryIds.includes(entry.id);
                  return (
                    <label
                      key={entry.id}
                      className={`px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                        checked ? 'bg-[#FDF2F1]' : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEntry(entry.id)}
                          className="accent-[#E53C2E] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-[#231F20] truncate text-[11px]">
                            <span className="font-mono font-semibold mr-1">{entry.id}</span>
                            {entry.goods}
                          </div>
                          <div className="text-[10px] text-[#5F6368]">
                            {entry.originCountry} · Addl: {entry.additionalTariffPct}% · MFN: {entry.mfnRatePct}%
                          </div>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-medium text-[#231F20] text-[11px] shrink-0">
                        {formatMoney(entry.goodsValueCad)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Current Baseline Rate Summary */}
          <div className="px-3 py-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded flex items-center justify-between gap-2 text-xs">
            <span className="text-[#5F6368]">Current Baseline Addl. Rate</span>
            <span className="font-mono tabular-nums font-semibold text-[#231F20]">
              {selectedEntries.length === 0
                ? '—'
                : baselineRateSummary.isUniform
                  ? `${baselineRateSummary.weightedPct.toFixed(0)}%`
                  : `${baselineRateSummary.weightedPct.toFixed(1)}% weighted (${baselineRateSummary.uniqueRates.join('% / ')}%)`}
            </span>
          </div>

          {/* Prominent Hypothetical Tariff Rate Controls */}
          <div className="space-y-2.5 pt-2 border-t border-[#E2E5E8]">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="tariff-rate-input" className="text-xs font-semibold text-[#231F20]">
                Hypothetical Tariff Rate
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="tariff-rate-input"
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={hypotheticalRatePct}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) handleRateChange(v);
                  }}
                  className="w-16 px-2 py-1 text-right font-mono tabular-nums font-semibold text-xs border border-[#E2E5E8] rounded text-[#231F20] focus:outline-none focus:border-[#231F20]"
                />
                <span className="text-xs font-mono text-[#5F6368]">%</span>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={extendedSliderRange ? 500 : 100}
              step={extendedSliderRange ? 5 : 1}
              value={Math.min(extendedSliderRange ? 500 : 100, hypotheticalRatePct)}
              onChange={(e) => handleRateChange(Number(e.target.value))}
              className="w-full accent-[#E53C2E] cursor-pointer"
              aria-label="Hypothetical additional tariff rate slider"
            />

            <div className="flex items-center justify-between text-[10px] text-[#5F6368] font-mono">
              <span>0%</span>
              <button
                type="button"
                onClick={() => setExtendedSliderRange((prev) => !prev)}
                className="font-sans text-[11px] font-medium text-[#5F6368] hover:text-[#231F20] underline cursor-pointer"
              >
                {extendedSliderRange ? 'Standard slider (0–100%)' : 'Extend slider (0–500%)'}
              </button>
              <span>{extendedSliderRange ? '500%' : '100%'}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {RATE_PRESETS.map((preset) => {
                const active = hypotheticalRatePct === preset.rate;
                return (
                  <button
                    key={preset.rate}
                    type="button"
                    onClick={() => handleRateChange(preset.rate)}
                    className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#231F20] text-white border-[#231F20] font-semibold'
                        : 'bg-white text-[#231F20] border-[#E2E5E8] hover:bg-[#F5F6F7]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible Advanced Assumptions */}
          <div className="pt-2 border-t border-[#E2E5E8]">
            <button
              type="button"
              onClick={() => setShowAdvancedAssumptions((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-medium text-[#231F20] hover:text-[#E53C2E] cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                {showAdvancedAssumptions ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>Advanced Assumptions</span>
              </span>
              <span className="text-[10px] font-mono text-[#5F6368]">
                {annualizationQuarters} Qtrs · {formatCompactMoney(transitionCostCad + recurringAltSupplierDeltaCad * annualizationQuarters)}
              </span>
            </button>

            {showAdvancedAssumptions && (
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5F6368]">Annualization (Qtrs 1–8)</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={annualizationQuarters}
                      onChange={(e) =>
                        setAnnualizationQuarters(
                          Math.max(1, Math.min(8, Number(e.target.value) || 4))
                        )
                      }
                      className="w-24 px-2 py-1 text-right border border-[#E2E5E8] rounded font-mono text-[#231F20]"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5F6368]">Transition Cost (CAD)</span>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      value={transitionCostCad}
                      onChange={(e) =>
                        setTransitionCostCad(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-24 px-2 py-1 text-right border border-[#E2E5E8] rounded font-mono text-[#231F20]"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5F6368]">Alt-Supplier Δ / Qtr (CAD)</span>
                    <input
                      type="number"
                      step={5000}
                      value={recurringAltSupplierDeltaCad}
                      onChange={(e) =>
                        setRecurringAltSupplierDeltaCad(Number(e.target.value) || 0)
                      }
                      className="w-24 px-2 py-1 text-right border border-[#E2E5E8] rounded font-mono text-[#231F20]"
                    />
                  </label>
                </div>
                <div className="text-[10px] text-[#5F6368] pt-1 border-t border-[#F0F1F3]">
                  Entry Base: {scenarioQuarterId} (Appendix 3.2) · Constant shipment volume assumed.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* CENTRE (~45%): LIVE SIMULATION VISUALIZATION */}
        <section className="lg:col-span-7 xl:col-span-1 bg-white border border-[#E2E5E8] rounded-md p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#231F20]">
                Tariff Cost Sensitivity Curve
              </h2>
              <p className="text-[11px] text-[#5F6368]">
                Selected Goods Base:{' '}
                <span className="font-mono font-semibold text-[#231F20]">
                  {formatMoney(simulation.dutiableGoodsValueCad)}
                </span>{' '}
                ({simulation.selectedCount} {simulation.selectedCount === 1 ? 'entry' : 'entries'})
              </p>
            </div>
            <ProvenanceText provenance="hypothetical_scenario" sourceRef="App. 3.4" />
          </div>

          <TariffSensitivityChart
            entries={selectedEntries}
            hypotheticalRatePct={hypotheticalRatePct}
            baselineEffectiveRatePct={baselineRateSummary.weightedPct}
            currentAdditionalTariffCad={simulation.currentAdditionalTariffCad}
            hypotheticalAdditionalTariffCad={simulation.hypotheticalAdditionalTariffCad}
            normalMfnDutyCad={simulation.normalMfnDutyCad}
            onSelectRate={handleRateChange}
          />

          <BurdenComparisonBars
            baselineTariffCad={simulation.currentAdditionalTariffCad}
            hypotheticalTariffCad={simulation.hypotheticalAdditionalTariffCad}
            mfnDutyCad={simulation.normalMfnDutyCad}
            baselineEffectiveRatePct={baselineRateSummary.weightedPct}
            hypotheticalRatePct={hypotheticalRatePct}
            quarterlyDifferenceCad={simulation.quarterlyTariffDifferenceCad}
          />
        </section>

        {/* RIGHT (~26%): FINANCIAL IMPACT */}
        <section className="lg:col-span-12 xl:col-span-1 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2E5E8]">
            <h2 className="text-sm font-semibold text-[#231F20]">Financial Impact</h2>
            <span className="text-[11px] font-mono text-[#5F6368]">{hypotheticalRatePct}% Rate</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            {/* 1. Current Baseline Cost */}
            <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded space-y-0.5">
              <div className="text-[11px] text-[#5F6368]">Current Additional Tariff / Qtr</div>
              <div className="text-base font-mono font-semibold tabular-nums text-[#231F20]">
                {formatMoney(simulation.currentAdditionalTariffCad)}
              </div>
              <div className="text-[10px] text-[#5F6368] font-mono">
                Baseline ({baselineRateSummary.isUniform ? `${baselineRateSummary.weightedPct.toFixed(0)}%` : `${baselineRateSummary.weightedPct.toFixed(1)}% avg`})
              </div>
            </div>

            {/* 2. Hypothetical Tariff Cost */}
            <div className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded space-y-0.5">
              <div className="text-[11px] text-[#5F6368]">Hypothetical Additional Tariff / Qtr</div>
              <div className="text-base font-mono font-semibold tabular-nums text-[#E53C2E]">
                {formatMoney(simulation.hypotheticalAdditionalTariffCad)}
              </div>
              <div className="text-[10px] text-[#5F6368] font-mono">
                Modeled at {hypotheticalRatePct}% on {formatCompactMoney(simulation.dutiableGoodsValueCad)}
              </div>
            </div>

            {/* 3. Quarterly Difference */}
            <div className="p-3 bg-white border border-[#E2E5E8] rounded space-y-0.5">
              <div className="text-[11px] font-medium text-[#5F6368]">{diffLabel} / Qtr</div>
              <div className={`text-lg font-mono font-semibold tabular-nums ${diffColor}`}>
                {diff === 0 ? formatMoney(0) : formatMoney(diff, { showSign: true })}
              </div>
              <div className="text-[10px] text-[#5F6368] leading-snug">
                {diff < 0
                  ? 'External policy scenario; not guaranteed realized savings.'
                  : diff > 0
                    ? 'Incremental quarterly tariff cost vs. baseline.'
                    : 'Matches current quarterly additional tariff.'}
              </div>
            </div>

            {/* 4. Illustrative Annualized Impact */}
            <div className="p-3 bg-white border border-[#E2E5E8] rounded space-y-1">
              <div className="text-[11px] font-medium text-[#5F6368]">
                Illustrative Annualized Net Impact ({annualizationQuarters} Qtrs)
              </div>
              <div className={`text-lg font-mono font-semibold tabular-nums ${annColor}`}>
                {annNet === 0 ? formatMoney(0) : formatMoney(annNet, { showSign: true })}
              </div>
              {(transitionCostCad > 0 || recurringAltSupplierDeltaCad !== 0) && (
                <div className="text-[10px] text-[#5F6368] font-mono">
                  Tariff Δ: {formatMoney(simulation.annualizedTariffDifferenceCad, { showSign: true })} ·
                  Switching: {formatMoney(transitionCostCad + recurringAltSupplierDeltaCad * annualizationQuarters, { showSign: true })}
                </div>
              )}
              <div className="pt-1 border-t border-[#F0F1F3] flex items-center justify-between text-[11px]">
                <span className="text-[#5F6368]">Illustrative Operating Cost Impact</span>
                <span className={`font-mono font-semibold tabular-nums ${oeColor}`}>
                  {oeAnnual === 0 ? formatMoney(0) : formatMoney(oeAnnual, { showSign: true })}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Normal MFN Duty (Unchanged & Separate) */}
          <div className="px-3 py-2.5 bg-[#F8F9FA] border border-[#E2E5E8] rounded flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium text-[#231F20]">
                Normal MFN Duty (Unchanged)
              </div>
              <div className="text-[10px] text-[#5F6368]">Isolated per Rule 05</div>
            </div>
            <span className="font-mono tabular-nums text-sm font-semibold text-[#231F20]">
              {formatMoney(simulation.normalMfnDutyCad)}
            </span>
          </div>
        </section>
      </div>

      {/* PER-SHIPMENT SENSITIVITY & DRILL-DOWN */}
      <section className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#231F20]">
              Per-Shipment Sensitivity Breakdown ({simulation.perEntryBreakdown.length} Selected)
            </h2>
            {!baselineRateSummary.isUniform && selectedEntries.length > 0 && (
              <p className="text-[11px] text-[#5F6368] mt-0.5">
                Uniform hypothetical rate ({hypotheticalRatePct}%) applied across mixed baseline entries (
                {baselineRateSummary.uniqueRates.join('%, ')}%).
              </p>
            )}
          </div>
          <span className="text-[11px] text-[#5F6368]">
            Click any shipment row to inspect full border record
          </span>
        </div>

        {sortedBreakdown.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#5F6368]">
            Select at least one customs entry in Scenario Controls to inspect shipment-level sensitivity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368]">
                  <th className="py-2.5 px-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('entryId')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Entry</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-left font-medium">Goods &amp; Origin</th>
                  <th className="py-2.5 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('goodsValueCad')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Goods Value</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('mfnDutyCad')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Normal MFN</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('currentAdditionalTariffCad')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Curr Addl.</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('hypotheticalAdditionalTariffCad')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Hypo ({hypotheticalRatePct}%)</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('quarterlyDeltaCad')}
                      className="inline-flex items-center gap-1 hover:text-[#231F20] cursor-pointer"
                    >
                      <span>Quarterly Delta</span>
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-left font-medium w-36">Base Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                {sortedBreakdown.map((row) => {
                  const entryObj = scopedCustomsEntries.find((e) => e.id === row.entryId)!;
                  const baseSharePct =
                    simulation.dutiableGoodsValueCad > 0
                      ? (row.goodsValueCad / simulation.dutiableGoodsValueCad) * 100
                      : 0;
                  const deltaBarPct =
                    maxAbsRowDelta > 0
                      ? (Math.abs(row.quarterlyDeltaCad) / maxAbsRowDelta) * 100
                      : 0;

                  return (
                    <tr
                      key={row.entryId}
                      onClick={() => openDrawer({ type: 'customs_entry', record: entryObj })}
                      className="hover:bg-[#F8F9FA] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#231F20]">
                        {row.entryId}
                      </td>
                      <td className="py-2.5 px-3 text-[#231F20]">
                        <span className="font-medium">{row.goods}</span>
                        <span className="text-[#5F6368] ml-1.5">({row.originCountry})</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatMoney(row.goodsValueCad)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#5F6368]">
                        {formatMoney(row.mfnDutyCad)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatMoney(row.currentAdditionalTariffCad)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#231F20]">
                        {formatMoney(row.hypotheticalAdditionalTariffCad)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-semibold ${
                          row.quarterlyDeltaCad < 0
                            ? 'text-[#16A34A]'
                            : row.quarterlyDeltaCad > 0
                              ? 'text-[#DC2626]'
                              : 'text-[#5F6368]'
                        }`}
                      >
                        {row.quarterlyDeltaCad === 0
                          ? formatMoney(0)
                          : formatMoney(row.quarterlyDeltaCad, { showSign: true })}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#ECEEF0] rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${Math.min(100, Math.max(4, deltaBarPct || baseSharePct))}%`,
                                backgroundColor:
                                  row.quarterlyDeltaCad < 0
                                    ? '#16A34A'
                                    : row.quarterlyDeltaCad > 0
                                      ? '#E53C2E'
                                      : '#7E8082',
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[#5F6368] w-10 text-right">
                            {baseSharePct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SCENARIO COMPARISON & SAVED SNAPSHOTS */}
      <section className="bg-white border border-[#E2E5E8] rounded-md p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#231F20]">
              Scenario Comparison &amp; Saved Snapshots
            </h2>
            <p className="text-xs text-[#5F6368]">
              Save modeled snapshots, compare side by side, and export selected scenarios to Executive Reports.
            </p>
          </div>
          <ProvenanceText provenance="hypothetical_scenario" sourceRef="App. 3.4" />
        </div>

        {/* Inline Save Form */}
        {canSave && (
          <form
            onSubmit={handleSaveScenario}
            className="p-3 bg-[#F8F9FA] border border-[#E2E5E8] rounded flex flex-col md:flex-row md:items-center gap-2.5"
          >
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Scenario name (e.g., China 15% + Switching Cost)"
              className="flex-1 px-3 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20]"
            />
            <input
              type="text"
              value={scenarioNotes}
              onChange={(e) => setScenarioNotes(e.target.value)}
              placeholder="Optional assumption notes..."
              className="flex-1 px-3 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20]"
            />
            <button
              type="submit"
              disabled={selectedEntries.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] disabled:opacity-50 cursor-pointer shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Save Snapshot ({hypotheticalRatePct}%)</span>
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Saved Scenarios List */}
          <div className="xl:col-span-5 space-y-2">
            <div className="text-xs font-semibold text-[#231F20]">
              Saved Scenarios ({state.savedScenarios.length})
            </div>
            <div className="border border-[#E2E5E8] rounded divide-y divide-[#E2E5E8] max-h-[340px] overflow-y-auto">
              {state.savedScenarios.map((scen) => {
                const isCompared = compareIds.includes(scen.id);
                return (
                  <div key={scen.id} className="p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-[#231F20] truncate">{scen.name}</div>
                        <div className="text-[11px] text-[#5F6368] mt-0.5">
                          <span className="font-mono font-semibold text-[#231F20]">
                            {scen.chinaTariffRatePct}%
                          </span>{' '}
                          · {scen.selectedEntryIds.length} entries (
                          {formatCompactMoney(scen.dutiableGoodsValueCad)}) ·{' '}
                          {scen.annualizationQuarters} qtrs
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="font-semibold text-[#231F20]">
                          {formatMoney(scen.projectedQuarterlyTariffCad)}/qtr
                        </div>
                        <div
                          className={`text-[11px] ${
                            scen.quarterlyDifferenceCad < 0
                              ? 'text-[#16A34A]'
                              : scen.quarterlyDifferenceCad > 0
                                ? 'text-[#DC2626]'
                                : 'text-[#5F6368]'
                          }`}
                        >
                          {scen.quarterlyDifferenceCad === 0
                            ? `${formatMoney(0)} Δ`
                            : formatMoney(scen.quarterlyDifferenceCad, { showSign: true })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-[#5F6368] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isCompared}
                          onChange={() => toggleCompare(scen.id)}
                          className="accent-[#E53C2E]"
                        />
                        <span>Compare</span>
                      </label>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => loadScenarioIntoForm(scen)}
                          className="px-2 py-1 text-[11px] font-medium border border-[#E2E5E8] rounded bg-white hover:bg-[#F5F6F7] text-[#231F20] cursor-pointer"
                        >
                          Load
                        </button>
                        {canReport && (
                          <button
                            type="button"
                            onClick={openReportWithScenarios}
                            className="px-2 py-1 text-[11px] font-medium border border-[#E2E5E8] rounded bg-white hover:bg-[#F5F6F7] text-[#231F20] cursor-pointer"
                          >
                            Report
                          </button>
                        )}
                        {canSave &&
                          (confirmDeleteId === scen.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  deleteScenario(scen.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-[11px] font-medium bg-[#DC2626] text-white rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-[11px] border border-[#E2E5E8] rounded text-[#5F6368] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(scen.id)}
                              className="p-1 text-[#5F6368] hover:text-[#DC2626] cursor-pointer"
                              title="Delete saved scenario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual + Concise Side-by-Side Comparison */}
          <div className="xl:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#231F20]">
                Side-by-Side Impact Comparison (Active Draft vs. {comparedScenarios.length} Checked)
              </span>
            </div>

            <ScenarioComparisonChart
              activeDraft={{
                ratePct: hypotheticalRatePct,
                projectedQuarterlyTariffCad: simulation.hypotheticalAdditionalTariffCad,
                quarterlyDifferenceCad: simulation.quarterlyTariffDifferenceCad,
                annualizedNetImpactCad: simulation.annualizedNetImpactWithSupplierCostsCad,
              }}
              comparedScenarios={comparedScenarios}
            />
          </div>
        </div>

        {/* Expandable Detailed Matrix + Appendix 3.4 Benchmark Table */}
        <div className="pt-2 border-t border-[#E2E5E8]">
          <button
            type="button"
            onClick={() => setShowDetailedComparison((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#231F20] hover:text-[#E53C2E] cursor-pointer"
          >
            {showDetailedComparison ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>
              {showDetailedComparison
                ? 'Hide Detailed Matrix & Appendix 3.4 Benchmarks'
                : 'Show Detailed Matrix & Appendix 3.4 Benchmarks'}
            </span>
          </button>

          {showDetailedComparison && (
            <div className="mt-4 grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Detailed Comparison Matrix */}
              <div className="xl:col-span-7 border border-[#E2E5E8] rounded overflow-hidden">
                <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] text-xs font-semibold text-[#231F20]">
                  Multi-Scenario Metric Matrix
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368]">
                        <th className="py-2 px-3 text-left font-medium">Metric</th>
                        <th className="py-2 px-3 text-right font-medium text-[#E53C2E]">
                          Draft ({hypotheticalRatePct}%)
                        </th>
                        {comparedScenarios.map((s) => (
                          <th key={s.id} className="py-2 px-3 text-right font-medium text-[#231F20]">
                            {s.name.length > 20 ? `${s.name.slice(0, 19)}…` : s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E5E8] tabular-nums font-mono">
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Rate</td>
                        <td className="py-2 px-3 text-right">{hypotheticalRatePct}%</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className="py-2 px-3 text-right">{s.chinaTariffRatePct}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Goods Base</td>
                        <td className="py-2 px-3 text-right">{formatMoney(simulation.dutiableGoodsValueCad)}</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className="py-2 px-3 text-right">{formatMoney(s.dutiableGoodsValueCad)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Normal MFN (Isolated)</td>
                        <td className="py-2 px-3 text-right text-[#5F6368]">{formatMoney(simulation.normalMfnDutyCad)}</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className="py-2 px-3 text-right text-[#5F6368]">{formatMoney(s.mfnDutyCostCad)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Projected Tariff / Qtr</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatMoney(simulation.hypotheticalAdditionalTariffCad)}</td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className="py-2 px-3 text-right font-semibold">{formatMoney(s.projectedQuarterlyTariffCad)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Quarterly Difference</td>
                        <td className={`py-2 px-3 text-right font-semibold ${diffColor}`}>
                          {formatMoney(simulation.quarterlyTariffDifferenceCad, { showSign: true })}
                        </td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className={`py-2 px-3 text-right font-semibold ${s.quarterlyDifferenceCad < 0 ? 'text-[#16A34A]' : s.quarterlyDifferenceCad > 0 ? 'text-[#DC2626]' : ''}`}>
                            {formatMoney(s.quarterlyDifferenceCad, { showSign: true })}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-medium text-[#231F20]">Annualized Net Impact</td>
                        <td className={`py-2 px-3 text-right font-semibold ${annColor}`}>
                          {formatMoney(simulation.annualizedNetImpactWithSupplierCostsCad, { showSign: true })}
                        </td>
                        {comparedScenarios.map((s) => (
                          <td key={s.id} className={`py-2 px-3 text-right font-semibold ${s.annualizedDifferenceCad < 0 ? 'text-[#16A34A]' : s.annualizedDifferenceCad > 0 ? 'text-[#DC2626]' : ''}`}>
                            {formatMoney(s.annualizedDifferenceCad, { showSign: true })}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Official Appendix 3.4 Benchmark Table */}
              <div className="xl:col-span-5 border border-[#E2E5E8] rounded overflow-hidden">
                <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#231F20]">
                    Appendix 3.4 Case Benchmarks
                  </span>
                  <span className="text-[10px] text-[#5F6368]">Click row to apply</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E5E8] bg-[#F8F9FA] text-[#5F6368]">
                        <th className="py-2 px-3 text-left font-medium">Scenario</th>
                        <th className="py-2 px-2.5 text-right font-medium">Rate</th>
                        <th className="py-2 px-2.5 text-right font-medium">Tariff / Qtr</th>
                        <th className="py-2 px-3 text-right font-medium">Change / Yr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                      {TARIFF_SCENARIOS.map((ts) => (
                        <tr
                          key={ts.id}
                          onClick={() => {
                            setOriginFilter('China');
                            setGoodsFilter('all');
                            setSelectedEntryIds(BASELINE_ENTRY_IDS);
                            handleRateChange(ts.tariffRatePct);
                            setAnnualizationQuarters(4);
                            setTransitionCostCad(0);
                            setRecurringAltSupplierDeltaCad(0);
                          }}
                          className="hover:bg-[#F5F6F7] cursor-pointer"
                        >
                          <td className="py-2 px-3 font-medium text-[#231F20]">{ts.name}</td>
                          <td className="py-2 px-2.5 text-right font-mono">{ts.tariffRatePct}%</td>
                          <td className="py-2 px-2.5 text-right font-mono">{formatMoney(ts.quarterlyTariffCad)}</td>
                          <td
                            className={`py-2 px-3 text-right font-mono ${
                              ts.changePerYearCad < 0
                                ? 'text-[#16A34A]'
                                : ts.changePerYearCad > 0
                                  ? 'text-[#DC2626]'
                                  : 'text-[#5F6368]'
                            }`}
                          >
                            {ts.changePerYearCad === 0
                              ? formatMoney(0)
                              : formatMoney(ts.changePerYearCad, { showSign: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* EXPANDABLE MODEL ASSUMPTIONS & SOURCES */}
      <section
        ref={assumptionsPanelRef}
        className="bg-[#F8F9FA] border border-[#E2E5E8] rounded-md overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setShowAssumptionsPanel((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left text-xs font-semibold text-[#231F20] hover:bg-[#F0F1F3] transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#E53C2E] shrink-0" />
            <span>Model Assumptions, Provenance &amp; Non-Guaranteed Savings Disclosure</span>
          </span>
          {showAssumptionsPanel ? (
            <ChevronDown className="w-4 h-4 text-[#5F6368]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#5F6368]" />
          )}
        </button>

        {showAssumptionsPanel && (
          <div className="px-4 pb-4 pt-1 border-t border-[#E2E5E8] grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-[#5F6368] leading-relaxed">
            <div className="space-y-1.5">
              <div className="font-semibold text-[#231F20]">
                Case Baseline &amp; MFN Separation (Appendix 3.2 &amp; 3.4)
              </div>
              <p>
                Official China baseline covers entries E-04, E-05, and E-06 totaling{' '}
                <strong className="text-[#231F20] font-mono">{formatMoney(2_100_000)}</strong> in dutiable goods
                at a 25% additional tariff (<strong className="text-[#231F20] font-mono">{formatMoney(525_000)}/qtr</strong>).
                Normal MFN duties (<strong className="text-[#231F20] font-mono">{formatMoney(56_000)}/qtr</strong>{' '}
                on E-04 &amp; E-06) remain strictly isolated per Rule 05 and unchanged by additional
                tariff scenarios.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="font-semibold text-[#231F20]">
                Hypothetical What-If Scope &amp; Disclosures
              </div>
              <p>
                Calculations model constant quarterly shipment volume and apply a uniform hypothetical
                additional rate across the selected goods base without forecasting demand elasticity
                or customer price pass-through. Tariff reductions reflect hypothetical external policy
                scenarios—not guaranteed or realized savings—and Operating Cost impacts are{' '}
                <strong className="text-[#231F20]">Illustrative Operating Cost Impacts</strong> only.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
