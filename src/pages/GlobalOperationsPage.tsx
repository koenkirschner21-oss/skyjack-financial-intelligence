import React, { useEffect, useMemo, useState } from 'react';
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import {
  AlertCircle,
  Building2,
  Compass,
  Factory,
  Globe,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Ship,
} from 'lucide-react';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countriesAtlas from 'world-atlas/countries-110m.json';
import {
  CUSTOMS_ENTRIES,
  IRREGULAR_COSTS,
  PLANTS,
  REGIONAL_SALES,
  REGION_COST_TOTALS,
  REPORTING_PERIODS,
} from '../data/caseSeed';
import { useApp } from '../context/AppContext';
import { PageHeader, ProvenanceText, UnavailableDataState } from '../components/common/StateViews';
import { CustomsEntry, IrregularCost, RegionId } from '../types/domain';

type MapViewMode = 'regional_sales' | 'regional_irregular' | 'customs_routes' | 'trade_exposure';
type SalesRegionId = Exclude<RegionId, 'all' | 'corporate'>;

interface CountryMeta {
  isoNumeric: string;
  name: string;
  shortLabel?: string;
  regionId: SalesRegionId;
  lonLat: [number, number];
  labelOffset: [number, number];
  labelAnchor: 'start' | 'middle' | 'end';
  routeBendFactor: number;
  isCaseTradePartner?: boolean;
}

const COUNTRY_BY_ISO: Record<string, SalesRegionId> = {
  // North America
  '124': 'north_america',
  '840': 'north_america',
  '484': 'north_america',
  '304': 'north_america',
  '188': 'north_america',
  '192': 'north_america',
  '214': 'north_america',
  '222': 'north_america',
  '320': 'north_america',
  '332': 'north_america',
  '340': 'north_america',
  '388': 'north_america',
  '558': 'north_america',
  '591': 'north_america',
  // South America
  '032': 'south_america',
  '068': 'south_america',
  '076': 'south_america',
  '152': 'south_america',
  '170': 'south_america',
  '218': 'south_america',
  '328': 'south_america',
  '600': 'south_america',
  '604': 'south_america',
  '740': 'south_america',
  '858': 'south_america',
  '862': 'south_america',
  // Europe
  '040': 'europe',
  '056': 'europe',
  '100': 'europe',
  '112': 'europe',
  '191': 'europe',
  '203': 'europe',
  '208': 'europe',
  '233': 'europe',
  '246': 'europe',
  '250': 'europe',
  '276': 'europe',
  '300': 'europe',
  '348': 'europe',
  '352': 'europe',
  '372': 'europe',
  '380': 'europe',
  '428': 'europe',
  '440': 'europe',
  '442': 'europe',
  '498': 'europe',
  '528': 'europe',
  '578': 'europe',
  '616': 'europe',
  '620': 'europe',
  '642': 'europe',
  '688': 'europe',
  '703': 'europe',
  '705': 'europe',
  '724': 'europe',
  '752': 'europe',
  '756': 'europe',
  '804': 'europe',
  '826': 'europe',
  // Australia and New Zealand
  '036': 'anz',
  '554': 'anz',
  // Asia
  '050': 'asia',
  '096': 'asia',
  '104': 'asia',
  '116': 'asia',
  '144': 'asia',
  '156': 'asia',
  '158': 'asia',
  '356': 'asia',
  '360': 'asia',
  '392': 'asia',
  '398': 'asia',
  '410': 'asia',
  '418': 'asia',
  '458': 'asia',
  '496': 'asia',
  '524': 'asia',
  '586': 'asia',
  '608': 'asia',
  '702': 'asia',
  '704': 'asia',
  '764': 'asia',
};

const CASE_COUNTRY_MARKERS: CountryMeta[] = [
  {
    isoNumeric: '124',
    name: 'Canada',
    regionId: 'north_america',
    lonLat: [-80.25, 43.54],
    labelOffset: [10, -11],
    labelAnchor: 'start',
    routeBendFactor: 0,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '840',
    name: 'USA',
    regionId: 'north_america',
    lonLat: [-97.0, 38.5],
    labelOffset: [-10, 3],
    labelAnchor: 'end',
    routeBendFactor: -0.34,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '484',
    name: 'Mexico',
    regionId: 'north_america',
    lonLat: [-101.0, 21.0],
    labelOffset: [-9, 10],
    labelAnchor: 'end',
    routeBendFactor: -0.22,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '276',
    name: 'Germany',
    regionId: 'europe',
    lonLat: [10.45, 51.16],
    labelOffset: [-2, -10],
    labelAnchor: 'middle',
    routeBendFactor: 0.2,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '380',
    name: 'Italy',
    regionId: 'europe',
    lonLat: [12.57, 41.87],
    labelOffset: [9, 12],
    labelAnchor: 'start',
    routeBendFactor: 0.04,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '156',
    name: 'China',
    regionId: 'asia',
    lonLat: [113.5, 35.0],
    labelOffset: [-10, -2],
    labelAnchor: 'end',
    routeBendFactor: 0.21,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '410',
    name: 'South Korea',
    shortLabel: 'S. Korea',
    regionId: 'asia',
    lonLat: [127.77, 35.91],
    labelOffset: [0, 15],
    labelAnchor: 'middle',
    routeBendFactor: 0.08,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '392',
    name: 'Japan',
    regionId: 'asia',
    lonLat: [138.25, 36.2],
    labelOffset: [10, 3],
    labelAnchor: 'start',
    routeBendFactor: -0.05,
    isCaseTradePartner: true,
  },
  {
    isoNumeric: '036',
    name: 'Australia',
    regionId: 'anz',
    lonLat: [151.2, -28.0],
    labelOffset: [-10, 4],
    labelAnchor: 'end',
    routeBendFactor: -0.14,
    isCaseTradePartner: true,
  },
];

const REGION_CALLOUT_ANCHORS: {
  regionId: SalesRegionId;
  shortName: string;
  lonLat: [number, number];
}[] = [
  { regionId: 'north_america', shortName: 'North America', lonLat: [-104, 51] },
  { regionId: 'south_america', shortName: 'South America', lonLat: [-59, -14] },
  { regionId: 'europe', shortName: 'Europe', lonLat: [14, 52] },
  { regionId: 'asia', shortName: 'Asia', lonLat: [103, 35] },
  { regionId: 'anz', shortName: 'ANZ', lonLat: [134, -25] },
];

const GUELPH_LON_LAT: [number, number] = [-80.25, 43.54];

const COUNTRY_NAME_BY_ISO: Record<string, string> = Object.fromEntries(
  CASE_COUNTRY_MARKERS.map((c) => [c.isoNumeric, c.name])
);

const REGION_DISPLAY_ORDER: SalesRegionId[] = [
  'north_america',
  'europe',
  'south_america',
  'anz',
  'asia',
];

function matchCountryToEntry(countryName: string, entry: CustomsEntry): boolean {
  if (countryName === 'Canada') return entry.originCountry === 'Canada';
  if (countryName === 'Australia') {
    return entry.destination.includes('Australia') || entry.originCountry === 'Australia';
  }
  if (countryName === 'USA') {
    return entry.originCountry === 'USA' || entry.destination.includes('USA');
  }
  return entry.originCountry === countryName;
}

function buildCurvedRoutePath(
  from: [number, number],
  to: [number, number],
  bendFactor: number
): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const cx = mx - dy * bendFactor;
  const cy = my + dx * bendFactor;
  return `M ${from[0].toFixed(1)} ${from[1].toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
}

export const GlobalOperationsPage: React.FC = () => {
  const {
    state,
    activeUser,
    hasPermission,
    navigate,
    openDrawer,
    setQuarterFilter,
    setRegionFilter,
    setPlantFilter,
    scopedIrregularCosts,
    scopedCustomsEntries,
    formatMoney,
    formatCompactMoney,
  } = useApp();

  const [mapMode, setMapMode] = useState<MapViewMode>('regional_sales');
  const [selectedRegion, setSelectedRegion] = useState<SalesRegionId>('north_america');
  const [selectedCountryName, setSelectedCountryName] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<{
    title: string;
    primary: string;
    secondary?: string;
  } | null>(null);

  // Interactive Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);

  const allowed = hasPermission('view_global_operations');

  // Keep local map/inspector selection synced with global Region & Plant header filters
  useEffect(() => {
    if (
      state.selectedRegionId !== 'all' &&
      state.selectedRegionId !== 'corporate'
    ) {
      setSelectedRegion(state.selectedRegionId);
      setSelectedCountryName(null);
    }
  }, [state.selectedRegionId]);

  useEffect(() => {
    if (state.selectedPlantId !== 'all') {
      setSelectedRegion('north_america');
    }
  }, [state.selectedPlantId]);

  const selectedPeriod = useMemo(
    () => REPORTING_PERIODS.find((p) => p.id === state.selectedQuarterId) ?? REPORTING_PERIODS[7],
    [state.selectedQuarterId]
  );

  // Build GeoJSON features once from world-atlas TopoJSON (excluding Antarctica for commercial scale clarity)
  const mapGeometry = useMemo(() => {
    const topo = countriesAtlas as unknown as Topology;
    const countriesObj = (topo.objects as Record<string, unknown>).countries as Parameters<
      typeof feature
    >[1];
    const geo = feature(topo, countriesObj);

    const commercialGeo =
      geo.type === 'FeatureCollection'
        ? {
            ...geo,
            features: geo.features.filter((f) => String(f.id ?? '').padStart(3, '0') !== '010'),
          }
        : geo;

    const width = 960;
    const height = 460;
    const projection = geoNaturalEarth1().fitExtent(
      [
        [18, 18],
        [width - 18, height - 18],
      ],
      commercialGeo
    );
    const pathGen = geoPath(projection);
    const graticuleD = pathGen(geoGraticule10()) ?? '';

    const features =
      commercialGeo.type === 'FeatureCollection'
        ? commercialGeo.features.map((f, idx) => {
            const idStr = String(f.id ?? idx).padStart(3, '0');
            const regionId = COUNTRY_BY_ISO[idStr];
            const caseName =
              COUNTRY_NAME_BY_ISO[idStr] ??
              (f.properties as { name?: string })?.name ??
              'Territory';
            return {
              key: `${idStr}-${idx}`,
              isoId: idStr,
              name: caseName,
              regionId,
              d: pathGen(f) ?? '',
            };
          })
        : [];

    const guelphProjected = projection(GUELPH_LON_LAT) as [number, number] | null;

    // Lane-separated curved route arcs in projected space
    const tradeArcs = CASE_COUNTRY_MARKERS.filter((m) => m.name !== 'Canada').map((partner) => {
      const matchingEntries = scopedCustomsEntries.filter((e) =>
        matchCountryToEntry(partner.name, e)
      );
      const partnerProjected = projection(partner.lonLat) as [number, number] | null;
      const arcD =
        partnerProjected && guelphProjected
          ? buildCurvedRoutePath(partnerProjected, guelphProjected, partner.routeBendFactor)
          : '';
      const hasChinaTariff = matchingEntries.some((e) => e.additionalTariffCad > 0);
      const hasExport = matchingEntries.some((e) => e.direction === 'export');
      const totalExposure = matchingEntries.reduce(
        (s, e) => s + e.totalDutyAndTariffCad + e.brokerFeeChargedCad,
        0
      );
      const totalValue = matchingEntries.reduce((s, e) => s + e.goodsValueCad, 0);

      return {
        partner,
        arcD,
        projected: partnerProjected,
        matchingEntries,
        hasChinaTariff,
        hasExport,
        totalExposure,
        totalValue,
      };
    });

    const regionCallouts = REGION_CALLOUT_ANCHORS.map((anchor) => ({
      ...anchor,
      projected: projection(anchor.lonLat) as [number, number] | null,
    }));

    return { width, height, graticuleD, features, tradeArcs, guelphProjected, regionCallouts };
  }, [scopedCustomsEntries]);

  // Regional stats lookup
  const regionStatsMap = useMemo(() => {
    const map = new Map<
      SalesRegionId,
      {
        salesPrior: number;
        salesCurrent: number;
        salesChange: number;
        salesGrowthPct: number;
        irregularCad: number;
        irregularItems: IrregularCost[];
        regionName: string;
      }
    >();

    for (const regSale of REGIONAL_SALES) {
      const regCostTotal = REGION_COST_TOTALS.find((rc) => rc.regionId === regSale.regionId);
      const regCosts = scopedIrregularCosts.filter((c) => c.regionId === regSale.regionId);
      map.set(regSale.regionId, {
        regionName: regSale.regionName,
        salesPrior: regSale.salesPriorYearCad,
        salesCurrent: regSale.salesCurrentCad,
        salesChange: regSale.changeCad,
        salesGrowthPct: regSale.changePctReported,
        irregularCad: regCostTotal?.amountCad ?? 0,
        irregularItems: regCosts,
      });
    }
    return map;
  }, [scopedIrregularCosts]);

  const corporateCostTotal = useMemo(
    () => REGION_COST_TOTALS.find((r) => r.regionId === 'corporate')?.amountCad ?? 340_000,
    []
  );
  const corporateCosts = useMemo(
    () => scopedIrregularCosts.filter((c) => c.regionId === 'corporate'),
    [scopedIrregularCosts]
  );

  const selectedRegionData = regionStatsMap.get(selectedRegion)!;

  const modeHasDataForPeriod = useMemo(() => {
    if (mapMode === 'regional_sales') return selectedPeriod.hasRegionalSalesBreakdown;
    if (mapMode === 'regional_irregular') return selectedPeriod.hasIrregularCostBreakdown;
    return selectedPeriod.hasDetailedCustomsEntries;
  }, [mapMode, selectedPeriod]);

  const isPriorYearSalesPeriod = state.selectedQuarterId === 'Q3 2025';

  // Color ramp helpers per mode
  const getCountryFill = (
    regionId: SalesRegionId | undefined,
    isoId: string,
    name: string
  ): string => {
    if (!regionId) return '#E7ECEF';
    if (!modeHasDataForPeriod) return '#E9EDF0';

    const isSelectedRegion = regionId === selectedRegion;
    const isSelectedCountry = selectedCountryName === name;

    if (mapMode === 'regional_sales') {
      const reg = regionStatsMap.get(regionId);
      const sales = isPriorYearSalesPeriod ? (reg?.salesPrior ?? 0) : (reg?.salesCurrent ?? 0);
      if (isSelectedCountry) return '#E53C2E';
      if (sales >= 145_000_000) return isSelectedRegion ? '#231F20' : '#353233';
      if (sales >= 85_000_000) return isSelectedRegion ? '#45474B' : '#575B60';
      if (sales >= 28_000_000) return isSelectedRegion ? '#676C72' : '#7C8289';
      if (sales >= 20_000_000) return isSelectedRegion ? '#888E94' : '#9DA3AA';
      return isSelectedRegion ? '#A3A9B0' : '#B9BFC5';
    }

    if (mapMode === 'regional_irregular') {
      const irr = regionStatsMap.get(regionId)?.irregularCad ?? 0;
      if (irr >= 1_500_000) return isSelectedRegion ? '#B91C1C' : '#DC2626';
      if (irr >= 200_000) return isSelectedRegion ? '#C2410C' : '#EA580C';
      if (irr > 0) return isSelectedRegion ? '#D97706' : '#F59E0B';
      return isSelectedRegion ? '#CFD5DC' : '#E0E4E9';
    }

    if (mapMode === 'customs_routes') {
      const isPartner = Boolean(COUNTRY_NAME_BY_ISO[isoId]);
      if (isSelectedCountry) return '#D4DCE4';
      if (isoId === '156') return '#FDECE9';
      if (isPartner) return '#DCE2E8';
      return '#EEF1F4';
    }

    // trade_exposure
    const matchName = COUNTRY_NAME_BY_ISO[isoId];
    if (!matchName) return '#EEF1F4';
    const entries = scopedCustomsEntries.filter((e) => matchCountryToEntry(matchName, e));
    const exposure = entries.reduce((s, e) => s + e.totalDutyAndTariffCad + e.brokerFeeChargedCad, 0);
    if (isSelectedCountry) return '#231F20';
    if (exposure >= 500_000) return '#DC2626';
    if (exposure >= 50_000) return '#EA580C';
    if (exposure >= 10_000) return '#F59E0B';
    if (exposure > 0) return '#94A3B8';
    return '#DCE2E8';
  };

  const countryEntries = useMemo(() => {
    if (!selectedCountryName) return [];
    return scopedCustomsEntries.filter((e) => matchCountryToEntry(selectedCountryName, e));
  }, [scopedCustomsEntries, selectedCountryName]);

  const regionRelatedEntries = useMemo(() => {
    const countriesInRegion = CASE_COUNTRY_MARKERS.filter(
      (c) => c.regionId === selectedRegion
    ).map((c) => c.name);
    return scopedCustomsEntries.filter((e) =>
      countriesInRegion.some((cname) => matchCountryToEntry(cname, e))
    );
  }, [scopedCustomsEntries, selectedRegion]);

  const handleSelectRegion = (rid: SalesRegionId, countryName: string | null = null) => {
    setSelectedRegion(rid);
    setSelectedCountryName(countryName);
    setRegionFilter(rid);
  };

  const handleResetAll = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedCountryName(null);
    setSelectedRegion('north_america');
    setQuarterFilter('Q3 2026');
    setRegionFilter('all');
    setPlantFilter('all');
  };

  const hasNonDefaultState =
    zoom !== 1 ||
    pan.x !== 0 ||
    pan.y !== 0 ||
    selectedCountryName !== null ||
    state.selectedQuarterId !== 'Q3 2026' ||
    state.selectedRegionId !== 'all' ||
    state.selectedPlantId !== 'all';

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Global Operations & Commercial Footprint" />
        <UnavailableDataState
          title={`Global Operations restricted for ${activeUser.title}`}
          description="Role-based access controls restrict multi-region executive mapping to Group Controller, Cost Accountant, and Customs & Trade Coordinator roles."
          actionLabel="Open Settings"
          onAction={() => navigate('/settings')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Global Operations & Commercial Footprint"
        actions={
          hasNonDefaultState ? (
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-white border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#5F6368]" />
              <span>Reset View</span>
            </button>
          ) : undefined
        }
      />

      {/* ================================================================== */}
      {/* HERO MAP + RIGHT SUPPORT RAIL                                      */}
      {/* ================================================================== */}
      <section aria-label="Global Operations Map" className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Left Hero Column (Map Workspace) */}
        <div className="xl:col-span-9 bg-white border border-[#E2E5E8] rounded-md flex flex-col overflow-hidden">
          {/* Map Mode Segmented Control & Zoom Controls */}
          <div className="px-4 py-3 border-b border-[#E2E5E8] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Map visualization mode"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F5F6F7] border border-[#E2E5E8] rounded-md"
            >
              {(
                [
                  { id: 'regional_sales', label: 'Regional Sales', icon: Globe },
                  { id: 'regional_irregular', label: 'Regional Irregular Costs', icon: AlertCircle },
                  { id: 'customs_routes', label: 'Customs Shipment Routes', icon: Ship },
                  { id: 'trade_exposure', label: 'Trade Cost Exposure', icon: Layers },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const isActive = mapMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setMapMode(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#231F20] text-white font-medium shadow-xs'
                        : 'text-[#5F6368] hover:text-[#231F20] hover:bg-white/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#E53C2E]' : 'text-[#7E8082]'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 text-xs shrink-0">
              <div className="inline-flex items-center border border-[#E2E5E8] rounded-md bg-[#F8F9FA] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, Number((z - 0.35).toFixed(2))))}
                  className="px-2 py-1.5 hover:bg-white text-[#231F20] cursor-pointer transition-colors"
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-11 text-center tabular-nums text-[#231F20] border-x border-[#E2E5E8] py-1">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.35).toFixed(2))))}
                  className="px-2 py-1.5 hover:bg-white text-[#231F20] cursor-pointer transition-colors"
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#E2E5E8] rounded-md hover:bg-[#F5F6F7] text-[#5F6368] text-xs cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset zoom</span>
                </button>
              )}
            </div>
          </div>

          {/* Period Availability Notice (if current quarter lacks selected mode granularity) */}
          {!modeHasDataForPeriod && (
            <div className="p-4 border-b border-[#E2E5E8] bg-[#F8F9FA]">
              <UnavailableDataState
                title={`${
                  mapMode === 'regional_sales'
                    ? 'Regional Sales'
                    : mapMode === 'regional_irregular'
                      ? 'Regional Irregular Costs'
                      : 'Customs Routes & Exposure'
                } unavailable for ${state.selectedQuarterId}`}
                description={
                  mapMode === 'regional_sales'
                    ? 'Appendix 1.4 reports regional sales comparisons only for Q3 2025 and Q3 2026.'
                    : 'Detailed regional irregular costs (Appendix 2.2) and entry-level customs routes (Appendix 3.2) are supplied exclusively for Q3 2026.'
                }
                actionLabel="Switch to Q3 2026"
                onAction={() => setQuarterFilter('Q3 2026')}
              />
            </div>
          )}

          {/* Hero SVG Cartographic Canvas */}
          <div className="relative flex-1 bg-[#F6F8FA] select-none overflow-hidden min-h-[380px] flex items-center">
            <svg
              viewBox={`0 0 ${mapGeometry.width} ${mapGeometry.height}`}
              className={`w-full h-auto block ${dragOrigin ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={(e) => {
                setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              }}
              onPointerMove={(e) => {
                if (!dragOrigin) return;
                setPan({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y });
              }}
              onPointerUp={() => setDragOrigin(null)}
              onPointerLeave={() => {
                setDragOrigin(null);
                setHoveredLabel(null);
              }}
              role="img"
              aria-label="SKYJACK global commercial and trade operations map"
            >
              <g
                transform={`translate(${mapGeometry.width / 2 + pan.x}, ${mapGeometry.height / 2 + pan.y}) scale(${zoom}) translate(${-mapGeometry.width / 2}, ${-mapGeometry.height / 2})`}
              >
                {/* Graticule */}
                <path
                  d={mapGeometry.graticuleD}
                  fill="none"
                  stroke="#E5EAF0"
                  strokeWidth={0.55 / zoom}
                />

                {/* Countries */}
                {mapGeometry.features.map((feat) => {
                  const fill = getCountryFill(feat.regionId, feat.isoId, feat.name);
                  const regData = feat.regionId ? regionStatsMap.get(feat.regionId) : undefined;
                  return (
                    <path
                      key={feat.key}
                      d={feat.d}
                      fill={fill}
                      stroke="#FFFFFF"
                      strokeWidth={0.65 / zoom}
                      className={
                        feat.regionId ? 'cursor-pointer transition-opacity hover:opacity-85' : ''
                      }
                      onMouseEnter={() => {
                        if (!feat.regionId || !regData) return;
                        const isPartner = Boolean(COUNTRY_NAME_BY_ISO[feat.isoId]);
                        const entries = isPartner
                          ? scopedCustomsEntries.filter((e) => matchCountryToEntry(feat.name, e))
                          : [];
                        if (mapMode === 'regional_sales') {
                          const salesVal = isPriorYearSalesPeriod
                            ? regData.salesPrior
                            : regData.salesCurrent;
                          setHoveredLabel({
                            title: isPartner ? `${feat.name} · ${regData.regionName}` : regData.regionName,
                            primary: `${isPriorYearSalesPeriod ? 'Q3 2025' : 'Q3 2026'} Sales: ${formatMoney(salesVal)}`,
                            secondary: `YoY Growth: +${regData.salesGrowthPct.toFixed(1)}% (+${formatCompactMoney(regData.salesChange)})`,
                          });
                        } else if (mapMode === 'regional_irregular') {
                          setHoveredLabel({
                            title: isPartner ? `${feat.name} · ${regData.regionName}` : regData.regionName,
                            primary: `Irregular Costs: ${formatMoney(regData.irregularCad)}`,
                            secondary: `${regData.irregularItems.length} visible Q3 2026 item${regData.irregularItems.length === 1 ? '' : 's'}`,
                          });
                        } else {
                          const exposure = entries.reduce(
                            (s, e) => s + e.totalDutyAndTariffCad + e.brokerFeeChargedCad,
                            0
                          );
                          setHoveredLabel({
                            title: isPartner ? `${feat.name} · ${regData.regionName}` : regData.regionName,
                            primary:
                              entries.length > 0
                                ? `Trade Exposure: ${formatMoney(exposure)}`
                                : `${regData.regionName} commercial territory`,
                            secondary:
                              entries.length > 0
                                ? `${entries.length} Q3 customs entr${entries.length === 1 ? 'y' : 'ies'}`
                                : 'No direct Q3 customs entry',
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredLabel(null)}
                      onClick={() => {
                        if (!feat.regionId) return;
                        handleSelectRegion(
                          feat.regionId,
                          COUNTRY_NAME_BY_ISO[feat.isoId] ? feat.name : null
                        );
                      }}
                    />
                  );
                })}

                {/* Regional Modes: 5 Clean Commercial Region Labels (zero 9-country label scatter) */}
                {modeHasDataForPeriod &&
                  (mapMode === 'regional_sales' || mapMode === 'regional_irregular') &&
                  mapGeometry.regionCallouts.map((rc) => {
                    if (!rc.projected) return null;
                    const regData = regionStatsMap.get(rc.regionId);
                    if (!regData) return null;
                    const isSel = selectedRegion === rc.regionId;
                    const metricText =
                      mapMode === 'regional_sales'
                        ? formatCompactMoney(
                            isPriorYearSalesPeriod ? regData.salesPrior : regData.salesCurrent
                          )
                        : regData.irregularCad > 0
                          ? formatCompactMoney(regData.irregularCad)
                          : formatCompactMoney(0);
                    return (
                      <g
                        key={rc.regionId}
                        transform={`translate(${rc.projected[0]}, ${rc.projected[1]})`}
                        className="cursor-pointer"
                        onClick={() => handleSelectRegion(rc.regionId, null)}
                      >
                        <text
                          y={-2 / zoom}
                          textAnchor="middle"
                          stroke="#F6F8FA"
                          strokeWidth={3.2 / zoom}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                          style={{ fontSize: `${10 / zoom}px` }}
                          className={`font-semibold ${isSel ? 'fill-[#E53C2E]' : 'fill-[#231F20]'}`}
                        >
                          {rc.shortName}
                        </text>
                        <text
                          y={10 / zoom}
                          textAnchor="middle"
                          stroke="#F6F8FA"
                          strokeWidth={3 / zoom}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                          style={{ fontSize: `${9.5 / zoom}px` }}
                          className="font-mono font-semibold fill-[#3E4145]"
                        >
                          {metricText}
                        </text>
                      </g>
                    );
                  })}

                {/* Trade Corridor Arcs (Customs Routes: primary focus | Trade Exposure: muted context) */}
                {modeHasDataForPeriod &&
                  (mapMode === 'customs_routes' || mapMode === 'trade_exposure') &&
                  mapGeometry.tradeArcs.map((arc) => {
                    if (arc.matchingEntries.length === 0 || !arc.arcD) return null;
                    const strokeColor = arc.hasChinaTariff
                      ? '#E53C2E'
                      : arc.hasExport
                        ? '#2563EB'
                        : '#231F20';
                    const isFocused = selectedCountryName === arc.partner.name;
                    const hasCountryFocus = Boolean(selectedCountryName);
                    const isRouteHero = mapMode === 'customs_routes';
                    const baseWidth = isRouteHero ? (isFocused ? 2.8 : 1.75) : isFocused ? 2.2 : 1.05;
                    const routeOpacity = isRouteHero
                      ? hasCountryFocus && !isFocused
                        ? 0.22
                        : 0.92
                      : isFocused
                        ? 0.85
                        : 0.28;

                    return (
                      <g
                        key={`arc-${arc.partner.isoNumeric}`}
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHoveredLabel({
                            title: `${arc.partner.name} ↔ Guelph Hub`,
                            primary: `Trade Cost Exposure: ${formatMoney(arc.totalExposure)}`,
                            secondary: `${arc.matchingEntries.length} entr${arc.matchingEntries.length === 1 ? 'y' : 'ies'} · Goods ${formatCompactMoney(arc.totalValue)}`,
                          })
                        }
                        onMouseLeave={() => setHoveredLabel(null)}
                        onClick={() => handleSelectRegion(arc.partner.regionId, arc.partner.name)}
                      >
                        {/* White halo casing prevents crossing corridors from muddying */}
                        <path
                          d={arc.arcD}
                          fill="none"
                          stroke="#F6F8FA"
                          strokeWidth={(baseWidth + 2.2) / zoom}
                          strokeLinecap="round"
                          opacity={routeOpacity * 0.85}
                        />
                        <path
                          d={arc.arcD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={baseWidth / zoom}
                          strokeLinecap="round"
                          strokeDasharray={arc.hasExport ? `${5 / zoom} ${3 / zoom}` : undefined}
                          opacity={routeOpacity}
                        />
                      </g>
                    );
                  })}

                {/* Trade Partner Nodes & Non-Overlapping Labels (Customs Routes & Trade Exposure only) */}
                {modeHasDataForPeriod &&
                  (mapMode === 'customs_routes' || mapMode === 'trade_exposure') &&
                  mapGeometry.tradeArcs.map((arc) => {
                    if (arc.matchingEntries.length === 0 || !arc.projected) return null;
                    const strokeColor = arc.hasChinaTariff
                      ? '#E53C2E'
                      : arc.hasExport
                        ? '#2563EB'
                        : '#231F20';
                    const isFocused = selectedCountryName === arc.partner.name;
                    const hasCountryFocus = Boolean(selectedCountryName);
                    const nodeDimmed = hasCountryFocus && !isFocused;

                    // Proportional radius in Trade Cost Exposure mode
                    const exposureRadius =
                      mapMode === 'trade_exposure'
                        ? arc.totalExposure >= 500_000
                          ? 9.5
                          : arc.totalExposure >= 50_000
                            ? 6.8
                            : arc.totalExposure >= 10_000
                              ? 5.2
                              : 4.2
                        : isFocused
                          ? 5.5
                          : 4;

                    const [lx, ly] = arc.partner.labelOffset;
                    const labelText = arc.partner.shortLabel ?? arc.partner.name;

                    return (
                      <g
                        key={`node-${arc.partner.isoNumeric}`}
                        transform={`translate(${arc.projected[0]}, ${arc.projected[1]})`}
                        className="cursor-pointer"
                        opacity={nodeDimmed ? 0.45 : 1}
                        onMouseEnter={() =>
                          setHoveredLabel({
                            title: `${arc.partner.name} · ${regionStatsMap.get(arc.partner.regionId)?.regionName ?? ''}`,
                            primary: `Trade Exposure: ${formatMoney(arc.totalExposure)}`,
                            secondary: `${arc.matchingEntries.length} Q3 entr${arc.matchingEntries.length === 1 ? 'y' : 'ies'} · Goods ${formatCompactMoney(arc.totalValue)}`,
                          })
                        }
                        onMouseLeave={() => setHoveredLabel(null)}
                        onClick={() => handleSelectRegion(arc.partner.regionId, arc.partner.name)}
                      >
                        {mapMode === 'trade_exposure' && arc.totalExposure >= 50_000 && (
                          <circle
                            r={(exposureRadius + 3.5) / zoom}
                            fill={strokeColor}
                            opacity={0.18}
                          />
                        )}
                        <circle
                          r={exposureRadius / zoom}
                          fill={strokeColor}
                          stroke="#FFFFFF"
                          strokeWidth={1.4 / zoom}
                        />
                        <text
                          x={lx / zoom}
                          y={ly / zoom}
                          textAnchor={arc.partner.labelAnchor}
                          stroke="#F6F8FA"
                          strokeWidth={3 / zoom}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                          style={{ fontSize: `${9.5 / zoom}px` }}
                          className={`pointer-events-none ${
                            isFocused ? 'fill-[#E53C2E] font-bold' : 'fill-[#231F20] font-semibold'
                          }`}
                        >
                          {labelText}
                        </text>
                      </g>
                    );
                  })}

                {/* Guelph Logical Operations Hub Anchor */}
                {mapGeometry.guelphProjected && (
                  <g
                    transform={`translate(${mapGeometry.guelphProjected[0]}, ${mapGeometry.guelphProjected[1]})`}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHoveredLabel({
                        title: 'Guelph Hub · North America',
                        primary: 'HQ-GUE, Plant 1 & Plant 2 Manufacturing',
                        secondary: 'Central origin/destination node for Q3 customs corridors',
                      })
                    }
                    onMouseLeave={() => setHoveredLabel(null)}
                    onClick={() => handleSelectRegion('north_america', 'Canada')}
                  >
                    <circle
                      r={4.8 / zoom}
                      fill="#E53C2E"
                      stroke="#FFFFFF"
                      strokeWidth={1.6 / zoom}
                    />
                    {(mapMode === 'customs_routes' || mapMode === 'trade_exposure') && (
                      <>
                        <line
                          x1={0}
                          y1={0}
                          x2={-3 / zoom}
                          y2={-9 / zoom}
                          stroke="#231F20"
                          strokeWidth={0.9 / zoom}
                          opacity={0.65}
                        />
                        <text
                          x={-4 / zoom}
                          y={-12 / zoom}
                          textAnchor="middle"
                          stroke="#F6F8FA"
                          strokeWidth={3.2 / zoom}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                          style={{ fontSize: `${9.5 / zoom}px` }}
                          className="fill-[#231F20] font-bold pointer-events-none"
                        >
                          Guelph Hub
                        </text>
                      </>
                    )}
                  </g>
                )}
              </g>
            </svg>

            {/* Floating Hover Detail Readout (no static map label crowding) */}
            {hoveredLabel && (
              <div className="absolute top-3 left-3 pointer-events-none bg-white/95 backdrop-blur-xs border border-[#E2E5E8] rounded-md px-3 py-2 shadow-sm max-w-xs z-10">
                <div className="text-xs font-semibold text-[#231F20]">{hoveredLabel.title}</div>
                <div className="text-xs font-mono tabular-nums text-[#231F20] mt-0.5">
                  {hoveredLabel.primary}
                </div>
                {hoveredLabel.secondary && (
                  <div className="text-[11px] text-[#5F6368] mt-0.5">{hoveredLabel.secondary}</div>
                )}
              </div>
            )}
          </div>

          {/* Left-Anchored Structured Map Footer & Legend */}
          <div className="px-4 py-3 bg-white border-t border-[#E2E5E8] flex flex-col items-start gap-1.5 text-left">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#231F20]">
              {mapMode === 'regional_sales' && (
                <>
                  <span className="font-medium text-[#5F6368]">Sales Tier:</span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#231F20] inline-block" /> ≥ {formatCompactMoney(145_000_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#575B60] inline-block" /> {formatCompactMoney(85_000_000)}–{formatCompactMoney(144_000_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#7C8289] inline-block" /> {formatCompactMoney(28_000_000)}–{formatCompactMoney(84_000_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#B9BFC5] inline-block" /> &lt; {formatCompactMoney(28_000_000)}
                  </span>
                </>
              )}
              {mapMode === 'regional_irregular' && (
                <>
                  <span className="font-medium text-[#5F6368]">Irregular Cost Tier:</span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626] inline-block" /> ≥ {formatCompactMoney(1_500_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#EA580C] inline-block" /> {formatCompactMoney(200_000)}–{formatCompactMoney(1_400_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#F59E0B] inline-block" /> &lt; {formatCompactMoney(200_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#E0E4E9] inline-block" /> {formatCompactMoney(0)} recorded
                  </span>
                </>
              )}
              {mapMode === 'customs_routes' && (
                <>
                  <span className="font-medium text-[#5F6368]">Corridor Type:</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#E53C2E] inline-block" /> China 25% tariff import
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#231F20] inline-block" /> MFN / FTA import
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 border-t-2 border-dashed border-[#2563EB] inline-block" /> Export corridor (DDP/DAP)
                  </span>
                </>
              )}
              {mapMode === 'trade_exposure' && (
                <>
                  <span className="font-medium text-[#5F6368]">Country Trade Exposure:</span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block" /> ≥ {formatCompactMoney(500_000)} (China)
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] inline-block" /> {formatCompactMoney(50_000)}–{formatCompactMoney(499_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" /> {formatCompactMoney(10_000)}–{formatCompactMoney(49_000)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#94A3B8] inline-block" /> &lt; {formatCompactMoney(10_000)}
                  </span>
                </>
              )}
            </div>

            <p className="text-[11px] text-[#5F6368]">
              {mapMode === 'customs_routes' || mapMode === 'trade_exposure'
                ? 'Hover any route or trade node for duty and shipment totals; click to filter the lower inspector. Drag map to pan.'
                : 'Select any commercial region on the map to update the regional inspector and comparison table below. Drag map to pan.'}
            </p>
          </div>
        </div>

        {/* Simplified Right Support Column */}
        <div className="xl:col-span-3 flex flex-col gap-4">
          {/* Card 1: Corporate (Non-Geographic) */}
          <div
            className={`border rounded-md bg-white p-4 transition-colors ${
              state.selectedRegionId === 'corporate'
                ? 'border-[#231F20]'
                : 'border-[#E2E5E8]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#E53C2E] shrink-0" />
                <h2 className="text-xs font-semibold text-[#231F20]">
                  Corporate (Non-Geographic)
                </h2>
              </div>
              <span className="text-[11px] text-[#5F6368] shrink-0">App. 2.2</span>
            </div>

            <div className="mt-2.5 text-xl font-mono font-semibold tabular-nums text-[#231F20]">
              {formatMoney(corporateCostTotal)}
            </div>
            <p className="text-[11px] text-[#5F6368] mt-0.5">
              Non-regional bucket · Excluded from map totals
            </p>

            <div className="mt-3 pt-2.5 border-t border-[#F0F1F3]">
              {corporateCosts.length > 0 ? (
                <div className="divide-y divide-[#F0F1F3]">
                  {corporateCosts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openDrawer({ type: 'irregular_cost', record: c })}
                      className="w-full text-left py-2 -mx-1.5 px-1.5 rounded hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#E53C2E]">{c.id}</span>
                        <span className="font-mono font-semibold tabular-nums text-[#231F20]">
                          {formatMoney(c.amountCad)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5F6368] mt-0.5 truncate">
                        {c.item} · Account 2890
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[#5F6368] py-1">
                  Corporate record IR-04 is outside your current role scope.
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Logical Guelph Facility Nodes */}
          <div className="border border-[#E2E5E8] rounded-md bg-white p-4 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-[#231F20] shrink-0" />
                  <h2 className="text-xs font-semibold text-[#231F20]">
                    Logical Guelph Facility Nodes
                  </h2>
                </div>
              </div>
              <p className="text-[11px] text-[#5F6368] mt-0.5">
                Schematic Ontario reference nodes
              </p>

              <div className="mt-3 divide-y divide-[#F0F1F3] border-t border-[#F0F1F3]">
                {PLANTS.map((p) => {
                  const isPlantActive = state.selectedPlantId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlantFilter(isPlantActive ? 'all' : p.id)}
                      className={`w-full text-left py-2.5 -mx-1.5 px-1.5 rounded transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        isPlantActive ? 'bg-[#F5F6F7]' : 'hover:bg-[#F5F6F7]/70'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#231F20] truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-[#5F6368] truncate mt-0.5">
                          {p.location}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[11px] shrink-0 ${
                          isPlantActive ? 'text-[#E53C2E] font-semibold' : 'text-[#5F6368]'
                        }`}
                      >
                        {p.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {state.selectedPlantId !== 'all' && (
              <div className="mt-3 pt-2.5 border-t border-[#F0F1F3] flex items-center justify-between text-[11px]">
                <span className="text-[#5F6368]">Plant filter active</span>
                <button
                  type="button"
                  onClick={() => setPlantFilter('all')}
                  className="font-medium text-[#E53C2E] hover:underline cursor-pointer"
                >
                  Clear plant
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* LOWER ANALYTICAL SECTION: INSPECTOR + COMPARISON                   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Selected Region / Country Inspector */}
        <section
          aria-label="Selected Region Inspector"
          className="xl:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-5 flex flex-col justify-between gap-5"
        >
          <div className="space-y-4">
            {/* Inspector Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#5F6368]">
                  <Compass className="w-3.5 h-3.5 text-[#E53C2E]" />
                  <span>Selected Region</span>
                  {selectedCountryName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCountryName(null)}
                        className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
                      >
                        Clear {selectedCountryName}
                      </button>
                    </>
                  )}
                </div>
                <h2 className="text-base font-semibold text-[#231F20] mt-0.5">
                  {selectedRegionData.regionName}
                  {selectedCountryName ? ` · ${selectedCountryName}` : ''}
                </h2>
              </div>
              <ProvenanceText provenance="official_case_data" sourceRef="App. 1.4, 2.2" />
            </div>

            {/* Clean Hairline 2x2 Summary Strip (single-level surface, no nested cards) */}
            <div className="border border-[#E2E5E8] rounded-md grid grid-cols-2 divide-x divide-y divide-[#E2E5E8]">
              <div className="p-3.5">
                <div className="text-[11px] text-[#5F6368]">Q3 2026 Sales</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#231F20] mt-1">
                  {formatCompactMoney(selectedRegionData.salesCurrent)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  {formatMoney(selectedRegionData.salesCurrent)}
                </div>
              </div>

              <div className="p-3.5">
                <div className="text-[11px] text-[#5F6368]">YoY Sales Growth</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#16A34A] mt-1">
                  +{selectedRegionData.salesGrowthPct.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-[#5F6368] tabular-nums mt-0.5">
                  +{formatCompactMoney(selectedRegionData.salesChange)} vs Q3 2025
                </div>
              </div>

              <div className="p-3.5">
                <div className="text-[11px] text-[#5F6368]">Q3 2025 Prior</div>
                <div className="text-sm font-mono font-semibold tabular-nums text-[#231F20] mt-1">
                  {formatMoney(selectedRegionData.salesPrior)}
                </div>
              </div>

              <div className="p-3.5">
                <div className="text-[11px] text-[#5F6368]">Q3 2026 Irregular Costs</div>
                <div
                  className={`text-sm font-mono font-semibold tabular-nums mt-1 ${
                    selectedRegionData.irregularCad > 0 ? 'text-[#DC2626]' : 'text-[#5F6368]'
                  }`}
                >
                  {formatMoney(selectedRegionData.irregularCad)}
                </div>
              </div>
            </div>

            {/* Detail Section 1: Regional Irregular Costs */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-semibold text-[#231F20]">
                  Irregular Costs · {selectedRegionData.regionName}
                </h3>
                <span className="text-[11px] text-[#5F6368] tabular-nums">
                  {selectedRegionData.irregularItems.length} visible
                </span>
              </div>

              {selectedRegionData.irregularItems.length === 0 ? (
                <div className="py-3 px-3.5 border border-[#E2E5E8] rounded-md text-xs text-[#5F6368]">
                  {selectedRegionData.irregularCad === 0
                    ? 'No irregular costs recorded for this region in Appendix 2.2.'
                    : 'Regional irregular costs exist in Appendix 2.2 but are outside your current role scope.'}
                </div>
              ) : (
                <div className="divide-y divide-[#F0F1F3] border border-[#E2E5E8] rounded-md">
                  {selectedRegionData.irregularItems.map((cost) => (
                    <button
                      key={cost.id}
                      type="button"
                      onClick={() => openDrawer({ type: 'irregular_cost', record: cost })}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#F5F6F7] transition-colors flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#E53C2E] shrink-0">
                            {cost.id}
                          </span>
                          <span className="font-medium text-[#231F20] truncate">{cost.item}</span>
                        </div>
                        <div className="text-[11px] text-[#5F6368] mt-0.5">
                          {cost.department} · {cost.timing} · {cost.walkBucket}
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-[#231F20] shrink-0">
                        {formatMoney(cost.amountCad)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Detail Section 2: Linked Customs Entries */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-semibold text-[#231F20]">
                  {selectedCountryName
                    ? `Customs Entries · ${selectedCountryName}`
                    : `Trade Corridors · ${selectedRegionData.regionName}`}
                </h3>
                <span className="text-[11px] text-[#5F6368] tabular-nums">
                  {(selectedCountryName ? countryEntries : regionRelatedEntries).length} entries
                </span>
              </div>

              {(selectedCountryName ? countryEntries : regionRelatedEntries).length === 0 ? (
                <div className="py-3 px-3.5 border border-[#E2E5E8] rounded-md text-xs text-[#5F6368]">
                  No Appendix 3.2 customs entries recorded for this selection.
                </div>
              ) : (
                <div className="divide-y divide-[#F0F1F3] border border-[#E2E5E8] rounded-md max-h-60 overflow-y-auto">
                  {(selectedCountryName ? countryEntries : regionRelatedEntries).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => openDrawer({ type: 'customs_entry', record: entry })}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-[#F5F6F7] transition-colors flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[#231F20] shrink-0">
                            {entry.id}
                          </span>
                          <span className="font-medium text-[#231F20] truncate">{entry.route}</span>
                        </div>
                        <div className="text-[11px] text-[#5F6368] mt-0.5 truncate">
                          {entry.goods} · {entry.rateDescription}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-[#231F20] font-semibold">
                          {formatMoney(entry.totalDutyAndTariffCad + entry.brokerFeeChargedCad)}
                        </div>
                        <div className="text-[10px] text-[#5F6368]">duty &amp; broker</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Regional Comparison Table */}
        <section
          aria-label="Regional Comparison Table"
          className="xl:col-span-7 bg-white border border-[#E2E5E8] rounded-md overflow-hidden flex flex-col"
        >
          <div className="px-5 py-4 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#231F20]">
                Regional Sales &amp; Irregular Cost Comparison
              </h2>
              <p className="text-xs text-[#5F6368] mt-0.5">
                Q3 2025 vs. Q3 2026 commercial sales ({formatCompactMoney(329_700_000)}) reconciled with Q3 irregular costs ({formatCompactMoney(2_818_000)}).
              </p>
            </div>
            <ProvenanceText provenance="official_case_data" sourceRef="App. 1.4, 2.2" />
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E2E5E8] bg-[#F8F9FA] text-[11px] text-[#5F6368]">
                  <th className="py-2.5 px-4 text-left font-medium">Region</th>
                  <th className="py-2.5 px-4 text-right font-medium">Q3 2025</th>
                  <th className="py-2.5 px-4 text-right font-medium">Q3 2026</th>
                  <th className="py-2.5 px-4 text-right font-medium">YoY Change</th>
                  <th className="py-2.5 px-4 text-right font-medium">Growth</th>
                  <th className="py-2.5 px-4 text-right font-medium">Irregular Costs</th>
                  <th className="py-2.5 px-4 text-right font-medium">Entries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F1F3] tabular-nums">
                {REGION_DISPLAY_ORDER.map((rid) => {
                  const row = regionStatsMap.get(rid)!;
                  const isSel = selectedRegion === rid;
                  const regCountries = CASE_COUNTRY_MARKERS.filter(
                    (c) => c.regionId === rid
                  ).map((c) => c.name);
                  const regEntryCount = CUSTOMS_ENTRIES.filter((e) =>
                    regCountries.some((cn) => matchCountryToEntry(cn, e))
                  ).length;

                  return (
                    <tr
                      key={rid}
                      onClick={() => handleSelectRegion(rid, null)}
                      className={`cursor-pointer transition-colors ${
                        isSel ? 'bg-[#F5F6F7]' : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      <td
                        className={`py-3 px-4 whitespace-nowrap ${
                          isSel ? 'font-semibold text-[#E53C2E]' : 'font-medium text-[#231F20]'
                        }`}
                      >
                        {row.regionName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#5F6368]">
                        {formatMoney(row.salesPrior)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#231F20]">
                        {formatMoney(row.salesCurrent)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#16A34A]">
                        +{formatMoney(row.salesChange)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-[#16A34A]">
                        +{row.salesGrowthPct.toFixed(1)}%
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          row.irregularCad > 0 ? 'font-medium text-[#DC2626]' : 'text-[#5F6368]'
                        }`}
                      >
                        {formatMoney(row.irregularCad)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#5F6368]">
                        {regEntryCount}
                      </td>
                    </tr>
                  );
                })}

                {/* Corporate Non-Sales Row */}
                <tr className="bg-[#FAFBFC] text-[#5F6368]">
                  <td className="py-3 px-4 font-medium text-[#231F20]">
                    Corporate (Non-Sales)
                  </td>
                  <td className="py-3 px-4 text-right font-mono">—</td>
                  <td className="py-3 px-4 text-right font-mono">—</td>
                  <td className="py-3 px-4 text-right font-mono">—</td>
                  <td className="py-3 px-4 text-right font-mono">—</td>
                  <td className="py-3 px-4 text-right font-mono font-medium text-[#DC2626]">
                    {formatMoney(corporateCostTotal)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">0</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-[#231F20]/25 bg-[#F8F9FA] font-semibold text-[#231F20] tabular-nums">
                  <td className="py-3 px-4">Consolidated Total (Q3 2026)</td>
                  <td className="py-3 px-4 text-right font-mono text-[#5F6368]">{formatMoney(312_600_000)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatMoney(329_700_000)}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#16A34A]">{formatMoney(17_100_000, { showSign: true })}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#16A34A]">+5.5%</td>
                  <td className="py-3 px-4 text-right font-mono text-[#DC2626]">
                    {formatMoney(IRREGULAR_COSTS.reduce((s, c) => s + c.amountCad, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">12</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
