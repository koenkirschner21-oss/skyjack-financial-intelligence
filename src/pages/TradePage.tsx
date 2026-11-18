import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Info,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  DOMESTIC_SHIPMENT_RECORDS,
  HISTORICAL_TRADE_COSTS,
  IRREGULAR_COSTS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import {
  calculateExpectedBrokerFeeCad,
} from '../domain/rulesEngine';
import { TradeCostTrendChart } from '../components/charts/FinancialCharts';
import {
  BrokerAuditCharts,
  DomesticProvincialChart,
  TradeCompositionKey,
  TradeCostCompositionChart,
} from '../components/trade/TradeVisualizations';
import { PageHeader, ProvenanceText, UnavailableDataState } from '../components/common/StateViews';
import { CustomsEntry } from '../types/domain';

type TradeTab = 'entries' | 'broker' | 'agreements' | 'domestic';
type SortField =
  | 'id'
  | 'goodsValueCad'
  | 'mfnDutyCad'
  | 'additionalTariffCad'
  | 'brokerVarianceReportedCad'
  | 'totalCost';
type BrokerFilter = 'all' | 'overcharge' | 'undercharge' | 'compliant';
type EntryFlagFilter =
  | 'all'
  | 'china_tariff'
  | 'mfn_duty'
  | 'broker_variance'
  | 'cusma_unclaimed'
  | 'export_ddp';

export const TradePage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    setQuarterFilter,
    scopedCustomsEntries,
    openDrawer,
    sendEntriesToSimulator,
    openReportStudioWithPreset,
    formatMoney,
    formatCompactMoney,
    formatShortMoney,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TradeTab>('entries');
  const [showSourcePopover, setShowSourcePopover] = useState(false);
  const sourcePopoverRef = useRef<HTMLDivElement | null>(null);

  // Customs Entries state
  const [searchTerm, setSearchTerm] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'import' | 'export'>('all');
  const [originFilter, setOriginFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState<EntryFlagFilter>('all');
  const [compositionKey, setCompositionKey] = useState<TradeCompositionKey | null>(null);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Broker Audit state
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>('all');
  const [selectedBrokerEntryId, setSelectedBrokerEntryId] = useState<string | null>(null);

  // Trade Agreements standard table state
  const [stdAgreementSearch, setStdAgreementSearch] = useState('');
  const [stdAgreementType, setStdAgreementType] = useState<
    'all' | 'mfn' | 'china' | 'ddp'
  >('all');

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

  const allowed = hasPermission('view_trade');
  const canRunSimulator = hasPermission('run_tariff_simulator');

  const selectedPeriod = useMemo(
    () => REPORTING_PERIODS.find((p) => p.id === state.selectedQuarterId) ?? REPORTING_PERIODS[7],
    [state.selectedQuarterId]
  );

  // Shared KPI summary derived deterministically from scopedCustomsEntries
  const sharedKpis = useMemo(() => {
    let goodsValueCad = 0;
    let dutyAndTariffCad = 0;
    let brokerChargedCad = 0;
    let brokerExpectedCad = 0;
    let grossOverchargeCad = 0;
    let overchargeCount = 0;
    let underchargeCad = 0;
    let underchargeCount = 0;
    let importCount = 0;
    let exportCount = 0;

    for (const e of scopedCustomsEntries) {
      goodsValueCad += e.goodsValueCad;
      dutyAndTariffCad += e.totalDutyAndTariffCad;
      brokerChargedCad += e.brokerFeeChargedCad;
      const expected = calculateExpectedBrokerFeeCad(e.goodsValueCad, 0.2);
      brokerExpectedCad += expected;
      const diff = e.brokerFeeChargedCad - expected;
      if (diff > 0) {
        grossOverchargeCad += diff;
        overchargeCount += 1;
      } else if (diff < 0) {
        underchargeCad += diff;
        underchargeCount += 1;
      }
      if (e.direction === 'import') importCount += 1;
      else exportCount += 1;
    }

    const q3RoundedRef =
      HISTORICAL_TRADE_COSTS.find((h) => h.quarterId === 'Q3 2026')?.totalRoundedCad ?? 737_000;

    return {
      entryCount: scopedCustomsEntries.length,
      importCount,
      exportCount,
      goodsValueCad,
      exactTradeCostCad: dutyAndTariffCad + brokerChargedCad,
      q3RoundedRef,
      brokerExpectedCad,
      brokerChargedCad,
      netBrokerVarianceCad: brokerChargedCad - brokerExpectedCad,
      grossOverchargeCad,
      overchargeCount,
      underchargeCad,
      underchargeCount,
    };
  }, [scopedCustomsEntries]);

  const uniqueOrigins = useMemo(
    () => Array.from(new Set(scopedCustomsEntries.map((e) => e.originCountry))).sort(),
    [scopedCustomsEntries]
  );

  const handleCompositionSelect = (key: TradeCompositionKey | null) => {
    setCompositionKey(key);
    if (key === 'china') setFlagFilter('china_tariff');
    else if (key === 'mfn') setFlagFilter('mfn_duty');
    else if (key === 'ddp') setFlagFilter('export_ddp');
    else if (key === 'broker') setFlagFilter('all');
    else setFlagFilter('all');
  };

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = scopedCustomsEntries.filter((entry) => {
      if (q) {
        const hit =
          entry.id.toLowerCase().includes(q) ||
          entry.route.toLowerCase().includes(q) ||
          entry.goods.toLowerCase().includes(q) ||
          entry.originCountry.toLowerCase().includes(q) ||
          entry.hsCode.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (directionFilter !== 'all' && entry.direction !== directionFilter) return false;
      if (originFilter !== 'all' && entry.originCountry !== originFilter) return false;
      if (flagFilter === 'china_tariff' && entry.additionalTariffCad === 0) return false;
      if (flagFilter === 'mfn_duty' && entry.mfnDutyCad === 0) return false;
      if (flagFilter === 'broker_variance' && entry.brokerVarianceReportedCad === 0) return false;
      if (flagFilter === 'cusma_unclaimed' && entry.tradeAgreementStatus !== 'CUSMA_not_claimed')
        return false;
      if (flagFilter === 'export_ddp' && entry.incoterm !== 'DDP') return false;
      return true;
    });

    const getSortVal = (e: CustomsEntry): string | number => {
      if (sortField === 'totalCost') return e.totalDutyAndTariffCad + e.brokerFeeChargedCad;
      return e[sortField];
    };

    return [...list].sort((a, b) => {
      const av = getSortVal(a);
      const bv = getSortVal(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    scopedCustomsEntries,
    searchTerm,
    directionFilter,
    originFilter,
    flagFilter,
    sortField,
    sortDir,
  ]);

  const hasEntryFilters =
    searchTerm.trim() !== '' ||
    directionFilter !== 'all' ||
    originFilter !== 'all' ||
    flagFilter !== 'all' ||
    compositionKey !== null;

  const resetEntryFilters = () => {
    setSearchTerm('');
    setDirectionFilter('all');
    setOriginFilter('all');
    setFlagFilter('all');
    setCompositionKey(null);
  };

  const filteredSummary = useMemo(() => {
    return filteredEntries.reduce(
      (acc, e) => ({
        goodsValue: acc.goodsValue + e.goodsValueCad,
        tradeCost: acc.tradeCost + e.totalDutyAndTariffCad + e.brokerFeeChargedCad,
      }),
      { goodsValue: 0, tradeCost: 0 }
    );
  }, [filteredEntries]);

  const brokerAllRows = useMemo(() => {
    return scopedCustomsEntries.map((entry) => {
      const expected = calculateExpectedBrokerFeeCad(entry.goodsValueCad, 0.2);
      const variance = entry.brokerFeeChargedCad - expected;
      const status: 'overcharge' | 'undercharge' | 'compliant' =
        variance > 0 ? 'overcharge' : variance < 0 ? 'undercharge' : 'compliant';
      return { entry, expected, variance, status };
    });
  }, [scopedCustomsEntries]);

  const brokerCounts = useMemo(() => {
    let overcharge = 0;
    let undercharge = 0;
    let compliant = 0;
    for (const r of brokerAllRows) {
      if (r.status === 'overcharge') overcharge += 1;
      else if (r.status === 'undercharge') undercharge += 1;
      else compliant += 1;
    }
    return { all: brokerAllRows.length, overcharge, undercharge, compliant };
  }, [brokerAllRows]);

  const brokerRows = useMemo(
    () => brokerAllRows.filter((row) => brokerFilter === 'all' || row.status === brokerFilter),
    [brokerAllRows, brokerFilter]
  );

  const unmatchedIr07 = useMemo(() => IRREGULAR_COSTS.find((c) => c.id === 'IR-07'), []);

  const agreementGroups = useMemo(() => {
    const claimedCusma = scopedCustomsEntries.filter(
      (e) => e.tradeAgreementStatus === 'CUSMA_claimed' || e.tradeAgreementStatus === 'export_cusma_dap'
    );
    const unclaimedCusma = scopedCustomsEntries.filter(
      (e) => e.tradeAgreementStatus === 'CUSMA_not_claimed'
    );
    const claimedCptpp = scopedCustomsEntries.filter(
      (e) => e.tradeAgreementStatus === 'CPTPP_claimed'
    );
    const mfnAndExportDdp = scopedCustomsEntries.filter(
      (e) => e.tradeAgreementStatus === 'none' || e.tradeAgreementStatus === 'export_ddp'
    );
    return { claimedCusma, unclaimedCusma, claimedCptpp, mfnAndExportDdp };
  }, [scopedCustomsEntries]);

  const filteredStandardAgreements = useMemo(() => {
    const q = stdAgreementSearch.trim().toLowerCase();
    return agreementGroups.mfnAndExportDdp.filter((e) => {
      if (stdAgreementType === 'mfn' && (e.additionalTariffCad > 0 || e.exportDutyCad > 0))
        return false;
      if (stdAgreementType === 'china' && e.additionalTariffCad === 0) return false;
      if (stdAgreementType === 'ddp' && e.exportDutyCad === 0) return false;
      if (!q) return true;
      return (
        e.id.toLowerCase().includes(q) ||
        e.route.toLowerCase().includes(q) ||
        e.goods.toLowerCase().includes(q) ||
        e.rateDescription.toLowerCase().includes(q)
      );
    });
  }, [agreementGroups.mfnAndExportDdp, stdAgreementSearch, stdAgreementType]);

  const e08Investigation = useMemo(
    () => state.investigations.find((inv) => inv.linkedRecordId === 'E-08'),
    [state.investigations]
  );

  const e08EvidenceCount = useMemo(
    () => state.evidence.filter((ev) => ev.linkedRecordId === 'E-08').length,
    [state.evidence]
  );

  const domesticTotals = useMemo(() => {
    return DOMESTIC_SHIPMENT_RECORDS.reduce(
      (acc, r) => ({
        sales: acc.sales + r.salesCad,
        salesTax: acc.salesTax + r.salesTaxCad,
        freight: acc.freight + r.freightCad,
        customsDuty: acc.customsDuty + r.customsDutyCad,
      }),
      { sales: 0, salesTax: 0, freight: 0, customsDuty: 0 }
    );
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'id' ? 'asc' : 'desc');
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shipments & Trade" />
        <UnavailableDataState
          title={`Shipments & Trade restricted for ${activeUser.title}`}
          description="Detailed customs entries, broker fee reconciliations, and tariff exposures are restricted to Customs & Trade Coordinator, Cost Accountant (read-only), and Group Controller roles."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shipments & Trade"
        actions={
          <div className="flex flex-wrap items-center gap-2 relative" ref={sourcePopoverRef}>
            <button
              type="button"
              onClick={() => setShowSourcePopover((v) => !v)}
              aria-expanded={showSourcePopover}
              aria-label="Trade data basis and provenance"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#5F6368] bg-white border border-[#E2E5E8] rounded hover:text-[#231F20] hover:bg-[#F5F6F7] transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Data Basis</span>
            </button>

            {hasPermission('generate_reports') && (
              <button
                type="button"
                onClick={() =>
                  openReportStudioWithPreset({
                    templateId: 'trade_tariff_review',
                    reportingPeriod: state.selectedQuarterId,
                    includedSections: [
                      'trd_customs_summary',
                      'trd_historical_trends',
                      'trd_cost_composition',
                      'trd_broker_reconciliation',
                      'trd_agreement_opportunities',
                      'trd_domestic_separation',
                    ],
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#5F6368]" />
                <span>Add to Trade Report</span>
              </button>
            )}

            {canRunSimulator && (
              <button
                type="button"
                onClick={() => sendEntriesToSimulator(['E-04', 'E-05', 'E-06'])}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#E53C2E] rounded hover:bg-[#CC3124] transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Tariff Simulator</span>
              </button>
            )}

            {showSourcePopover && (
              <div
                role="dialog"
                aria-label="Trade data provenance and methodology"
                className="absolute right-0 top-10 z-30 w-80 sm:w-96 bg-white border border-[#E2E5E8] rounded-md p-4 shadow-lg text-xs text-[#5F6368] space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2E5E8]">
                  <span className="font-semibold text-[#231F20]">
                    Trade Provenance &amp; Scope ({activeUser.roleId === 'cost_accountant' ? 'Read-Only Tie-Out' : 'Trade Scope'})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSourcePopover(false)}
                    aria-label="Close trade data basis"
                    className="p-1 rounded hover:bg-[#F5F6F7] text-[#5F6368] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 leading-relaxed">
                  <p>
                    <strong className="text-[#231F20]">Border Ledger &amp; Audit:</strong> Appendix 3.1–3.6
                    (base CAD). Exact Q3 2026 trade costs total {formatMoney(736_770)} across 12 entries (App. 3.6
                    historical series rounds Q3 2026 to {formatMoney(737_000)}).
                  </p>
                  <p>
                    <strong className="text-[#231F20]">Governance Safeguards:</strong> Unmatched broker
                    billing IR-07 ({formatMoney(118_000)} in SG&amp;A) is strictly excluded from E-01–E-12 broker
                    totals. Contract variances and unclaimed agreements (E-08) are unconfirmed review
                    items, not recovered cash or guaranteed savings.
                  </p>
                  <p className="text-[11px] text-[#7E8082]">
                    HS codes shown in entry records are illustrative 4-digit references subject to broker confirmation.
                  </p>
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Quarter Granularity Notice when historical period selected */}
      {!selectedPeriod.hasDetailedCustomsEntries && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <span>
            Detailed entry-level customs records are supplied exclusively for <strong>Q3 2026</strong>.{' '}
            <strong>{state.selectedQuarterId}</strong> displays aggregate historical trade cost totals only.
          </span>
          <button
            type="button"
            onClick={() => setQuarterFilter('Q3 2026')}
            className="px-2.5 py-1 bg-white border border-amber-300 rounded font-medium text-amber-950 hover:bg-amber-100 cursor-pointer"
          >
            Switch to Q3 2026
          </button>
        </div>
      )}

      {/* Shared 4-KPI Summary Strip (Q3 2026 Baseline) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
          <div className="text-xs font-medium text-[#5F6368]">Customs Entries (Q3 2026)</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
            {sharedKpis.entryCount}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1">
            {sharedKpis.importCount} imports · {sharedKpis.exportCount} exports
          </div>
        </div>

        <div
          className="bg-white border border-[#E2E5E8] rounded-md p-4"
          title={`Exact goods value: ${formatMoney(sharedKpis.goodsValueCad)}`}
        >
          <div className="text-xs font-medium text-[#5F6368]">Declared Goods Value</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
            {formatMoney(sharedKpis.goodsValueCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1 font-mono">
            {formatCompactMoney(sharedKpis.goodsValueCad)} across {sharedKpis.entryCount} shipments
          </div>
        </div>

        <div
          className="bg-white border border-[#E2E5E8] rounded-md p-4"
          title={`Exact Q3 trade costs: ${formatMoney(sharedKpis.exactTradeCostCad)}`}
        >
          <div className="text-xs font-medium text-[#5F6368]">Exact Q3 Trade Costs</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
            {formatMoney(sharedKpis.exactTradeCostCad)}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1 font-mono">
            8-qtr rounded series: {formatCompactMoney(sharedKpis.q3RoundedRef)}
          </div>
        </div>

        <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
          <div className="text-xs font-medium text-[#5F6368]">Broker Net Variance</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#DC2626] mt-1">
            {formatMoney(sharedKpis.netBrokerVarianceCad, { showSign: true })}
          </div>
          <div className="text-[11px] text-[#5F6368] mt-1 font-mono">
            vs. 0.2% contract · Gross {formatMoney(sharedKpis.grossOverchargeCad, { showSign: true })}
          </div>
        </div>
      </div>

      {/* Four-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Shipments and Trade sections"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#ECEEF0] border border-[#E2E5E8] rounded-md"
        >
          {(
            [
              ['entries', 'Customs Entries'],
              ['broker', 'Broker Audit'],
              ['agreements', 'Trade Agreements'],
              ['domestic', 'Domestic Shipments'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === id
                  ? 'bg-white text-[#231F20] shadow-2xs'
                  : 'text-[#5F6368] hover:text-[#231F20]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-[#5F6368] font-mono">
          Active Period: <span className="font-semibold text-[#231F20]">{state.selectedQuarterId}</span> · {state.currency}
        </div>
      </div>

      {/* TAB 1: CUSTOMS ENTRIES */}
      {activeTab === 'entries' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#231F20]">
                    Eight-Quarter Trade Cost History
                  </h2>
                  <p className="text-[11px] text-[#5F6368]">
                    Rounded 000s series highlighting Q1 2026 additional China tariff onset ({state.currency})
                  </p>
                </div>
                <ProvenanceText provenance="official_case_data" sourceRef="Appendix 3.6 (000s)" />
              </div>
              <TradeCostTrendChart
                history={HISTORICAL_TRADE_COSTS}
                selectedQuarterId={state.selectedQuarterId}
                onSelectQuarter={setQuarterFilter}
              />
            </div>

            <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-[#231F20]">
                      Q3 2026 Trade Cost Composition
                    </h2>
                    <p className="text-[11px] text-[#5F6368]">
                      100% stacked breakdown of duties, additional tariffs, and broker fees
                    </p>
                  </div>
                  <ProvenanceText provenance="official_case_data" sourceRef="Appendix 3.1" />
                </div>

                <TradeCostCompositionChart
                  entries={scopedCustomsEntries}
                  selectedQuarterId={state.selectedQuarterId}
                  activeFilterKey={compositionKey}
                  onSelectCategory={handleCompositionSelect}
                />
              </div>

              <div className="pt-2.5 border-t border-[#ECEEF0] text-[11px] text-[#5F6368] leading-relaxed">
                Separate from unmatched SG&amp;A broker charge <strong className="font-mono text-[#231F20]">IR-07 ({formatMoney(118_000)})</strong>.
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-[#E2E5E8] rounded-md p-3.5 space-y-2.5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search entry ID, route, goods, origin, or HS code..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20] focus:outline-none focus:border-[#231F20]"
                />
              </div>

              <select
                aria-label="Filter customs entries by direction"
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value as 'all' | 'import' | 'export')}
                className="px-2.5 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20]"
              >
                <option value="all">All Directions ({sharedKpis.entryCount})</option>
                <option value="import">Imports Only ({sharedKpis.importCount})</option>
                <option value="export">Exports Only ({sharedKpis.exportCount})</option>
              </select>

              <select
                aria-label="Filter customs entries by origin country"
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20]"
              >
                <option value="all">All Origin Countries</option>
                {uniqueOrigins.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter customs entries by trade classification"
                value={flagFilter}
                onChange={(e) => {
                  const val = e.target.value as EntryFlagFilter;
                  setFlagFilter(val);
                  if (val === 'china_tariff') setCompositionKey('china');
                  else if (val === 'mfn_duty') setCompositionKey('mfn');
                  else if (val === 'export_ddp') setCompositionKey('ddp');
                  else setCompositionKey(null);
                }}
                className="px-2.5 py-1.5 text-xs border border-[#E2E5E8] rounded bg-white text-[#231F20]"
              >
                <option value="all">All Classifications</option>
                <option value="china_tariff">China 25% Additional Tariff (3)</option>
                <option value="mfn_duty">Normal MFN Duty &gt; 0 (6)</option>
                <option value="broker_variance">Broker Fee Variance ≠ 0 (9)</option>
                <option value="cusma_unclaimed">Unclaimed CUSMA Potential (E-08)</option>
                <option value="export_ddp">DDP Export Duty (E-10)</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0F1F3] text-[11px] text-[#5F6368]">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Showing <strong className="text-[#231F20]">{filteredEntries.length}</strong> of{' '}
                  {scopedCustomsEntries.length} entries · Filtered Goods:{' '}
                  <strong className="font-mono text-[#231F20]">
                    {formatMoney(filteredSummary.goodsValue)}
                  </strong>{' '}
                  · Trade Cost:{' '}
                  <strong className="font-mono text-[#231F20]">
                    {formatMoney(filteredSummary.tradeCost)}
                  </strong>
                </span>
                {hasEntryFilters && (
                  <button
                    type="button"
                    onClick={resetEntryFilters}
                    className="inline-flex items-center gap-1 text-[#E53C2E] font-medium hover:underline cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset filters
                  </button>
                )}
              </div>

              {canRunSimulator && filteredEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => sendEntriesToSimulator(filteredEntries.map((e) => e.id))}
                  className="text-xs font-medium text-[#E53C2E] hover:underline cursor-pointer"
                >
                  Model {filteredEntries.length} filtered entr{filteredEntries.length === 1 ? 'y' : 'ies'} in Simulator →
                </button>
              )}
            </div>
          </div>

          {/* 12-Entry Customs Ledger */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="py-2.5 px-3 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('id')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        ID <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-left font-medium">Route &amp; Goods</th>
                    <th className="py-2.5 px-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('goodsValueCad')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        Goods Value <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-left font-medium">Rate / Agreement</th>
                    <th className="py-2.5 px-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('mfnDutyCad')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        MFN / DDP <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('additionalTariffCad')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        Extra Tariff <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('brokerVarianceReportedCad')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        Broker (Var.) <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort('totalCost')}
                        className="inline-flex items-center gap-1 cursor-pointer hover:text-[#231F20]"
                      >
                        Total Trade Cost <ArrowDownUp className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                  {filteredEntries.map((entry) => {
                    const normalOrExport = entry.mfnDutyCad + entry.exportDutyCad;
                    const totalEntryTrade = entry.totalDutyAndTariffCad + entry.brokerFeeChargedCad;
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => openDrawer({ type: 'customs_entry', record: entry })}
                        className="hover:bg-[#F5F6F7] cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#231F20] whitespace-nowrap">
                          {entry.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-[#231F20]">{entry.route}</div>
                          <div className="text-[11px] text-[#5F6368]">
                            {entry.goods} · HS {entry.hsCode} (illustrative)
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#231F20] whitespace-nowrap">
                          {formatMoney(entry.goodsValueCad)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-[#231F20]">{entry.rateDescription}</div>
                          {entry.tradeAgreementStatus === 'CUSMA_not_claimed' && (
                            <div className="text-[11px] font-medium text-[#B45309]">
                              Unclaimed CUSMA · Unconfirmed
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#231F20] whitespace-nowrap">
                          {formatMoney(normalOrExport)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${
                            entry.additionalTariffCad > 0
                              ? 'font-semibold text-[#E53C2E]'
                              : 'text-[#5F6368]'
                          }`}
                        >
                          {formatMoney(entry.additionalTariffCad)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                          <div className="text-[#231F20]">{formatMoney(entry.brokerFeeChargedCad)}</div>
                          <div
                            className={`text-[11px] ${
                              entry.brokerVarianceReportedCad > 0
                                ? 'text-[#DC2626]'
                                : entry.brokerVarianceReportedCad < 0
                                  ? 'text-[#16A34A]'
                                  : 'text-[#5F6368]'
                            }`}
                          >
                            {entry.brokerVarianceReportedCad === 0
                              ? '0 var'
                              : formatMoney(entry.brokerVarianceReportedCad, { showSign: true })}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#231F20] whitespace-nowrap">
                          {formatMoney(totalEntryTrade)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-[#5F6368]">
                        No customs entries match your active filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {state.uploadedCustomsRecords.length > 0 && (
            <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#231F20]">
                    Authorized Uploaded Customs Shipments ({state.uploadedCustomsRecords.length})
                  </h3>
                  <p className="text-[11px] text-[#5F6368]">
                    Committed via Data Gateway; separated from official Appendix 3.1–3.3 baseline totals.
                  </p>
                </div>
                <ProvenanceText provenance="user_uploaded" sourceRef="Data Gateway Authorized" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                      <th className="py-2 px-3 text-left font-medium">Entry ID</th>
                      <th className="py-2 px-3 text-left font-medium">Route &amp; Goods</th>
                      <th className="py-2 px-3 text-right font-medium">Value</th>
                      <th className="py-2 px-3 text-right font-medium">Duty Paid</th>
                      <th className="py-2 px-3 text-right font-medium">Broker (0.2% Var.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                    {state.uploadedCustomsRecords.map((rec) => (
                      <tr
                        key={rec.id}
                        onClick={() => openDrawer({ type: 'uploaded_customs', record: rec })}
                        className="hover:bg-[#F5F6F7] cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono font-semibold text-[#16A34A]">
                          {rec.entryId}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-medium text-[#231F20]">
                            {rec.originCountry} → {rec.destination}
                          </div>
                          <div className="text-[11px] text-[#5F6368]">{rec.goodsDescription}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{formatMoney(rec.goodsValueCad)}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatMoney(rec.actualDutyCad)}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatMoney(rec.actualBrokerFeeCad)} (
                          {formatMoney(rec.brokerVarianceCad, { showSign: true })}
                          )
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BROKER AUDIT */}
      {activeTab === 'broker' && (
        <div className="space-y-5">
          {/* Two Functional Broker Audit Visualizations */}
          <BrokerAuditCharts
            entries={scopedCustomsEntries}
            selectedEntryId={selectedBrokerEntryId}
            onSelectEntry={(entry) => {
              setSelectedBrokerEntryId(entry.id);
              openDrawer({ type: 'customs_entry', record: entry });
            }}
          />

          {/* Strictly Separated IR-07 Exception Card */}
          {unmatchedIr07 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-[#231F20]">
                    Separate Exception Excluded from Broker Totals: {unmatchedIr07.id} (
                    {formatMoney(unmatchedIr07.amountCad)})
                  </div>
                  <p className="text-[#5F6368] mt-0.5 leading-relaxed">
                    Unmatched customs broker billing recorded in SG&amp;A (shipment number not in ERP). Kept strictly separate from the {formatMoney(sharedKpis.brokerChargedCad)} matched E-01–E-12 contract reconciliation above.
                  </p>
                </div>
              </div>
              {activeUser.roleId !== 'operational_contributor' && (
                <button
                  type="button"
                  onClick={() => openDrawer({ type: 'irregular_cost', record: unmatchedIr07 })}
                  className="px-3 py-1.5 border border-amber-300 rounded bg-white hover:bg-amber-100 font-medium text-[#231F20] shrink-0 cursor-pointer"
                >
                  Inspect IR-07
                </button>
              )}
            </div>
          )}

          {/* Full Reconciliation Table */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All ${brokerCounts.all} Entries` },
                    { id: 'overcharge', label: `Overcharges (${brokerCounts.overcharge})` },
                    { id: 'undercharge', label: `Undercharges (${brokerCounts.undercharge})` },
                    { id: 'compliant', label: `Exact 0.2% Match (${brokerCounts.compliant})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBrokerFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer transition-colors ${
                      brokerFilter === f.id
                        ? 'bg-[#231F20] text-white border-[#231F20]'
                        : 'bg-white text-[#231F20] border-[#E2E5E8] hover:bg-[#F5F6F7]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <ProvenanceText provenance="official_case_data" sourceRef="Appendix 3.3 (0.2% Contract)" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="py-2.5 px-4 text-left font-medium">Entry</th>
                    <th className="py-2.5 px-4 text-left font-medium">Route &amp; Goods</th>
                    <th className="py-2.5 px-4 text-right font-medium">Goods Value</th>
                    <th className="py-2.5 px-4 text-right font-medium">Expected (0.2%)</th>
                    <th className="py-2.5 px-4 text-right font-medium">Charged Fee</th>
                    <th className="py-2.5 px-4 text-right font-medium">Variance</th>
                    <th className="py-2.5 px-4 text-left font-medium">Audit Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                  {brokerRows.map(({ entry, expected, variance, status }) => (
                    <tr
                      key={entry.id}
                      onClick={() => {
                        setSelectedBrokerEntryId(entry.id);
                        openDrawer({ type: 'customs_entry', record: entry });
                      }}
                      className={`hover:bg-[#F5F6F7] cursor-pointer transition-colors ${
                        selectedBrokerEntryId === entry.id ? 'bg-[#E53C2E]/[0.05]' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#231F20] whitespace-nowrap">
                        {entry.id}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#231F20]">{entry.route}</div>
                        <div className="text-[11px] text-[#5F6368]">{entry.goods}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#5F6368] whitespace-nowrap">
                        {formatMoney(entry.goodsValueCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#231F20] whitespace-nowrap">
                        {formatMoney(expected)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#231F20] whitespace-nowrap">
                        {formatMoney(entry.brokerFeeChargedCad)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-semibold whitespace-nowrap ${
                          variance > 0
                            ? 'text-[#DC2626]'
                            : variance < 0
                              ? 'text-[#16A34A]'
                              : 'text-[#5F6368]'
                        }`}
                      >
                        {variance === 0
                          ? formatMoney(0)
                          : formatMoney(variance, { showSign: true })}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {status === 'overcharge' && (
                          <span className="text-[#DC2626] font-medium">Overcharged (Review)</span>
                        )}
                        {status === 'undercharge' && (
                          <span className="text-[#16A34A] font-medium">
                            Undercharged ({formatMoney(variance)})
                          </span>
                        )}
                        {status === 'compliant' && (
                          <span className="inline-flex items-center gap-1 text-[#5F6368]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" /> Contract Match
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {brokerFilter === 'all' && (
                  <tfoot>
                    <tr className="border-t-2 border-[#231F20] bg-[#F5F6F7] font-semibold text-[#231F20] tabular-nums">
                      <td className="py-2.5 px-4" colSpan={2}>
                        Total Across {sharedKpis.entryCount} Matched Entries
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatMoney(sharedKpis.goodsValueCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatMoney(sharedKpis.brokerExpectedCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatMoney(sharedKpis.brokerChargedCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#DC2626]">
                        {formatMoney(sharedKpis.netBrokerVarianceCad, { showSign: true })} net
                      </td>
                      <td className="py-2.5 px-4 text-[11px] font-normal text-[#5F6368]">
                        {formatShortMoney(sharedKpis.grossOverchargeCad, { showSign: true })} gross /{' '}
                        {formatShortMoney(sharedKpis.underchargeCad)} under
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRADE AGREEMENTS */}
      {activeTab === 'agreements' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Claimed Preferential Treatment */}
            <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#231F20]">
                    Claimed Preferential Treatment (0% Duty)
                  </h2>
                  <p className="text-[11px] text-[#5F6368]">
                    Verified CUSMA and CPTPP entries with claimed origin documentation
                  </p>
                </div>
                <FileCheck2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              </div>

              <div className="divide-y divide-[#E2E5E8] border border-[#E2E5E8] rounded">
                {[...agreementGroups.claimedCusma, ...agreementGroups.claimedCptpp].map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => openDrawer({ type: 'customs_entry', record: e })}
                    className="w-full text-left p-3.5 hover:bg-[#F5F6F7] flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#231F20] truncate">
                        <span className="font-mono mr-2">{e.id}</span>
                        {e.route} · {e.goods}
                      </div>
                      <div className="text-[11px] text-[#5F6368] mt-0.5">
                        {e.rateDescription} · Documentation: {e.originDocumentationStatus}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-[#231F20] font-semibold">{formatMoney(e.goodsValueCad)}</div>
                      <div className="text-[11px] text-[#16A34A]">{formatMoney(0)} duty</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Unclaimed CUSMA Opportunity — Verification Pending (E-08) */}
            <section className="bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[#231F20]">
                    Potential Unclaimed Treatment — Verification Required
                  </h2>
                  <p className="text-[11px] text-[#5F6368]">
                    Potential exemptions require formal customs origin verification before approval
                  </p>
                </div>
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" />
              </div>

              {agreementGroups.unclaimedCusma.map((e) => (
                <div
                  key={e.id}
                  className="p-4 border border-amber-200 bg-amber-50/50 rounded space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#231F20]">
                        <span className="font-mono text-[#E53C2E] mr-2">{e.id}</span>
                        {e.route} · {e.goods}
                      </div>
                      <div className="text-[11px] text-[#5F6368] mt-0.5">
                        Illustrative HS {e.hsCode} · Potential CUSMA eligibility
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[#B45309] bg-white border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                      UNCONFIRMED
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-200/80 font-mono tabular-nums">
                    <div>
                      <div className="font-sans text-[11px] text-[#5F6368]">Goods Value</div>
                      <div className="font-semibold text-[#231F20]">{formatMoney(e.goodsValueCad)}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[11px] text-[#5F6368]">Duty Paid ({e.mfnRatePct}%)</div>
                      <div className="font-semibold text-[#B45309]">{formatMoney(e.mfnDutyCad)}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[11px] text-[#5F6368]">Origin Evidence</div>
                      <div className="font-semibold text-[#231F20]">{e08EvidenceCount} on file</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#5F6368] leading-relaxed">
                    Origin certificate located in email (Case p. 3), but formal customs verification is required before claiming CUSMA 0% eligibility. Never auto-approved or counted as guaranteed savings.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openDrawer({ type: 'customs_entry', record: e })}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] transition-colors cursor-pointer"
                    >
                      Inspect E-08 &amp; Evidence
                    </button>
                    {e08Investigation && (
                      <button
                        type="button"
                        onClick={() => navigate('/investigations')}
                        className="px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                      >
                        Open Investigation ({e08Investigation.workflowStatus.replace(/_/g, ' ')})
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Standard MFN, 25% China Tariff & DDP Exports */}
          <section className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#231F20]">
                  Standard MFN, Additional China Tariffs &amp; DDP Export Entries ({filteredStandardAgreements.length})
                </h2>
                <p className="text-[11px] text-[#5F6368]">
                  Entries without preferential zero-duty agreement claims
                </p>
              </div>
              <ProvenanceText provenance="official_case_data" sourceRef="Appendix 3.2" />
            </div>

            <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E2E5E8] flex flex-wrap items-center gap-2 text-xs">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#5F6368] absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={stdAgreementSearch}
                  onChange={(e) => setStdAgreementSearch(e.target.value)}
                  placeholder="Search entry ID, route, goods, or rate..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E5E8] rounded text-xs focus:outline-none focus:border-[#231F20]"
                />
              </div>
              <div className="inline-flex p-0.5 bg-[#ECEEF0] rounded border border-[#E2E5E8]">
                {(
                  [
                    ['all', 'All (8)'],
                    ['mfn', 'Standard MFN (4)'],
                    ['china', 'China 25% (3)'],
                    ['ddp', 'DDP Export (1)'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStdAgreementType(key)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                      stdAgreementType === key ? 'bg-white text-[#231F20]' : 'text-[#5F6368]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="py-2.5 px-4 text-left font-medium">Entry</th>
                    <th className="py-2.5 px-4 text-left font-medium">Route &amp; Goods</th>
                    <th className="py-2.5 px-4 text-right font-medium">Goods Value</th>
                    <th className="py-2.5 px-4 text-left font-medium">Treatment &amp; Rate</th>
                    <th className="py-2.5 px-4 text-right font-medium">Total Duty &amp; Tariff</th>
                    <th className="py-2.5 px-4 text-left font-medium">Origin Doc Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                  {filteredStandardAgreements.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => openDrawer({ type: 'customs_entry', record: e })}
                      className="hover:bg-[#F5F6F7] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#231F20] whitespace-nowrap">
                        {e.id}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-medium text-[#231F20]">{e.route}</span>{' '}
                        <span className="text-[#5F6368]">· {e.goods}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono whitespace-nowrap">
                        {formatMoney(e.goodsValueCad)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">{e.rateDescription}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#231F20] whitespace-nowrap">
                        {formatMoney(e.totalDutyAndTariffCad)}
                      </td>
                      <td className="py-2.5 px-4 text-[#5F6368] whitespace-nowrap">
                        {e.originDocumentationStatus === 'unconfirmed'
                          ? 'Unconfirmed (DDP export)'
                          : 'Not applicable'}
                      </td>
                    </tr>
                  ))}
                  {filteredStandardAgreements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-[#5F6368]">
                        No standard entries match your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: DOMESTIC SHIPMENTS */}
      {activeTab === 'domestic' && (
        <div className="space-y-5">
          {/* Domestic Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
              <div className="text-xs font-medium text-[#5F6368]">Domestic Sales</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
                {formatMoney(domesticTotals.sales)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1">
                5 interprovincial Canadian destinations
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
              <div className="text-xs font-medium text-[#5F6368]">Provincial Sales Tax</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
                {formatMoney(domesticTotals.salesTax)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1">
                GST, PST, QST &amp; HST (isolated from customs)
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
              <div className="text-xs font-medium text-[#5F6368]">Domestic Freight</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#231F20] mt-1">
                {formatMoney(domesticTotals.freight)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1">
                Interprovincial carrier charges
              </div>
            </div>

            <div className="bg-white border border-[#E2E5E8] rounded-md p-4">
              <div className="text-xs font-medium text-[#5F6368]">Customs Duty</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-[#16A34A] mt-1">
                {formatMoney(domesticTotals.customsDuty)}
              </div>
              <div className="text-[11px] text-[#5F6368] mt-1">
                Never mixed into international trade totals
              </div>
            </div>
          </div>

          <DomesticProvincialChart records={DOMESTIC_SHIPMENT_RECORDS} />

          {/* Domestic Shipment Register */}
          <div className="bg-white border border-[#E2E5E8] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#231F20]">
                  Interprovincial Domestic Shipment Register (Q3 2026)
                </h2>
                <p className="text-[11px] text-[#5F6368]">
                  Simplified provincial tax rules · Strictly separated from international customs duties
                </p>
              </div>
              <ProvenanceText provenance="official_case_data" sourceRef="Appendix 3.5" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5E8] bg-[#F5F6F7] text-[#5F6368]">
                    <th className="py-2.5 px-4 text-left font-medium">Destination</th>
                    <th className="py-2.5 px-4 text-left font-medium">Tax Rule (Simplified)</th>
                    <th className="py-2.5 px-4 text-right font-medium">Domestic Sales</th>
                    <th className="py-2.5 px-4 text-right font-medium">Sales Tax</th>
                    <th className="py-2.5 px-4 text-right font-medium">Domestic Freight</th>
                    <th className="py-2.5 px-4 text-right font-medium">Customs Duty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E5E8] tabular-nums">
                  {DOMESTIC_SHIPMENT_RECORDS.map((dom) => (
                    <tr key={dom.id} className="hover:bg-[#F5F6F7] transition-colors">
                      <td className="py-2.5 px-4 font-medium text-[#231F20] whitespace-nowrap">
                        {dom.destination}
                      </td>
                      <td className="py-2.5 px-4 text-[#5F6368] whitespace-nowrap">
                        {dom.taxRuleSimplified}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#231F20] whitespace-nowrap">
                        {formatMoney(dom.salesCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#231F20] whitespace-nowrap">
                        {formatMoney(dom.salesTaxCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#231F20] whitespace-nowrap">
                        {formatMoney(dom.freightCad)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#16A34A] whitespace-nowrap">
                        {formatMoney(dom.customsDutyCad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#231F20] bg-[#F5F6F7] font-semibold text-[#231F20] tabular-nums">
                    <td className="py-2.5 px-4" colSpan={2}>
                      Total Domestic Interprovincial (5 Destinations)
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {formatMoney(domesticTotals.sales)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {formatMoney(domesticTotals.salesTax)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {formatMoney(domesticTotals.freight)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#16A34A]">
                      {formatMoney(domesticTotals.customsDuty)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
