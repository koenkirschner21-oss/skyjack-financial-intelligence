import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { IncomeStatement, IrregularCost } from '../../types/domain';

export type StatementRowField =
  | 'variableCostsCad'
  | 'fixedPlantCostsCad'
  | 'sgaCad'
  | 'amortizationCad'
  | 'operatingEarningsCad';

interface CostCompositionChartProps {
  statement: IncomeStatement;
  highlightedField: StatementRowField | null;
  onSelectField: (field: StatementRowField | null) => void;
}

const COMPOSITION_SEGMENTS: ReadonlyArray<{
  field: StatementRowField;
  label: string;
  shortLabel: string;
  role: 'Expense' | 'Profit Margin';
  color: string;
}> = [
  {
    field: 'variableCostsCad',
    label: 'Variable Costs',
    shortLabel: 'Variable',
    role: 'Expense',
    color: '#231F20',
  },
  {
    field: 'fixedPlantCostsCad',
    label: 'Fixed Plant Costs',
    shortLabel: 'Fixed Plant',
    role: 'Expense',
    color: '#525860',
  },
  {
    field: 'sgaCad',
    label: 'SG&A',
    shortLabel: 'SG&A',
    role: 'Expense',
    color: '#7E8082',
  },
  {
    field: 'amortizationCad',
    label: 'Amortization',
    shortLabel: 'Amort.',
    role: 'Expense',
    color: '#AEB4BA',
  },
  {
    field: 'operatingEarningsCad',
    label: 'Operating Earnings',
    shortLabel: 'OE Profit',
    role: 'Profit Margin',
    color: '#16A34A',
  },
];

export const CostCompositionChart: React.FC<CostCompositionChartProps> = ({
  statement,
  highlightedField,
  onSelectField,
}) => {
  const { formatMoney, formatCompactMoney } = useApp();
  const [hoveredField, setHoveredField] = useState<StatementRowField | null>(null);

  const items = useMemo(() => {
    const sales = statement.salesCad || 1;
    return COMPOSITION_SEGMENTS.map((seg) => {
      const value = statement[seg.field];
      const pct = (value / sales) * 100;
      return {
        ...seg,
        value,
        pct,
      };
    });
  }, [statement]);

  const totalCosts = statement.salesCad - statement.operatingEarningsCad;
  const totalCostPct = (totalCosts / (statement.salesCad || 1)) * 100;
  const activeItem =
    items.find((i) => i.field === hoveredField) ??
    items.find((i) => i.field === highlightedField) ??
    null;

  return (
    <div className="space-y-3.5">
      {/* Top Reconciliation Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-[#5F6368]">
          Total Costs:{' '}
          <span className="font-mono tabular-nums font-semibold text-[#231F20]">
            {formatCompactMoney(totalCosts)} ({totalCostPct.toFixed(1)}%)
          </span>
          <span className="mx-1.5 text-[#D1D5DB]">|</span>
          Operating Earnings:{' '}
          <span className="font-mono tabular-nums font-semibold text-[#16A34A]">
            {formatCompactMoney(statement.operatingEarningsCad)} ({statement.oeShareOfSalesPct.toFixed(1)}%)
          </span>
        </div>
        <div className="text-[11px] font-mono tabular-nums text-[#5F6368]">
          100% of Sales = {formatCompactMoney(statement.salesCad)}
        </div>
      </div>

      {/* 100% Stacked Horizontal Bar */}
      <div
        className="h-10 w-full rounded border border-[#E2E5E8] bg-[#ECEEF0] overflow-hidden flex"
        role="group"
        aria-label={`Cost and profit composition for ${statement.quarterId}`}
      >
        {items.map((item, idx) => {
          const isHighlighted = highlightedField === item.field;
          const isDimmed =
            (highlightedField !== null && highlightedField !== item.field) ||
            (hoveredField !== null && hoveredField !== item.field);

          return (
            <button
              key={item.field}
              type="button"
              onClick={() => onSelectField(isHighlighted ? null : item.field)}
              onMouseEnter={() => setHoveredField(item.field)}
              onMouseLeave={() => setHoveredField(null)}
              style={{
                width: `${item.pct}%`,
                backgroundColor: item.color,
              }}
              title={`${item.label} (${item.role}): ${formatMoney(item.value)} (${item.pct.toFixed(1)}%)`}
              aria-label={`${item.label}: ${formatMoney(item.value)}, ${item.pct.toFixed(1)}% of sales`}
              className={`relative h-full flex items-center justify-center transition-opacity cursor-pointer focus:outline-none ${
                idx < items.length - 1 ? 'border-r border-white/80' : ''
              } ${isHighlighted ? 'ring-2 ring-inset ring-[#E53C2E]' : ''} ${
                isDimmed ? 'opacity-55 hover:opacity-95' : 'opacity-100'
              }`}
            >
              {item.pct >= 11 && (
                <span className="text-[11px] font-mono font-semibold text-white px-1 truncate select-none">
                  {item.pct.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Interactive Segment Legend & Table-Row Selector */}
      <div className="divide-y divide-[#ECEEF0] border border-[#E2E5E8] rounded bg-white">
        {items.map((item) => {
          const isHighlighted = highlightedField === item.field;
          return (
            <button
              key={item.field}
              type="button"
              onClick={() => onSelectField(isHighlighted ? null : item.field)}
              onMouseEnter={() => setHoveredField(item.field)}
              onMouseLeave={() => setHoveredField(null)}
              className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-xs text-left transition-colors cursor-pointer ${
                isHighlighted
                  ? 'bg-[#E53C2E]/[0.06] text-[#231F20]'
                  : 'hover:bg-[#F5F6F7] text-[#231F20]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className={`truncate ${isHighlighted ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    item.role === 'Profit Margin'
                      ? 'bg-[#DCFCE7] text-[#15803D]'
                      : 'bg-[#F3F4F6] text-[#5F6368]'
                  }`}
                >
                  {item.role}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                <span className="text-[#231F20] font-medium">{formatMoney(item.value)}</span>
                <span className="w-12 text-right text-[#5F6368]">{item.pct.toFixed(1)}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5F6368]">
        <span>
          {activeItem
            ? `${activeItem.label}: ${formatMoney(activeItem.value)} (${activeItem.pct.toFixed(1)}% of ${statement.quarterId} sales)`
            : 'Click any segment to highlight its row in the Income Statement table.'}
        </span>
        {highlightedField && (
          <button
            type="button"
            onClick={() => onSelectField(null)}
            className="text-[#E53C2E] font-medium hover:underline cursor-pointer"
          >
            Clear highlight
          </button>
        )}
      </div>
    </div>
  );
};

interface IrregularCostsAnalyticsProps {
  records: IrregularCost[];
  selectedDepartment: string;
  selectedTiming: string;
  onSelectDepartment: (dept: string) => void;
  onSelectTiming: (timing: string) => void;
}

export const IrregularCostsAnalytics: React.FC<IrregularCostsAnalyticsProps> = ({
  records,
  selectedDepartment,
  selectedTiming,
  onSelectDepartment,
  onSelectTiming,
}) => {
  const { formatMoney } = useApp();
  const totalAmount = useMemo(
    () => records.reduce((sum, r) => sum + r.amountCad, 0),
    [records]
  );

  const byDepartment = useMemo(() => {
    const map = new Map<string, { department: string; amountCad: number; count: number }>();
    for (const r of records) {
      const prev = map.get(r.department) ?? { department: r.department, amountCad: 0, count: 0 };
      prev.amountCad += r.amountCad;
      prev.count += 1;
      map.set(r.department, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.amountCad - a.amountCad);
  }, [records]);

  const maxDeptAmount = Math.max(1, ...byDepartment.map((d) => d.amountCad));

  const timingSplit = useMemo(() => {
    let oneTimeCad = 0;
    let oneTimeCount = 0;
    let trendCad = 0;
    let trendCount = 0;
    for (const r of records) {
      if (r.timing === 'One-time') {
        oneTimeCad += r.amountCad;
        oneTimeCount += 1;
      } else {
        trendCad += r.amountCad;
        trendCount += 1;
      }
    }
    const denom = totalAmount || 1;
    return {
      oneTimeCad,
      oneTimeCount,
      oneTimePct: (oneTimeCad / denom) * 100,
      trendCad,
      trendCount,
      trendPct: (trendCad / denom) * 100,
    };
  }, [records, totalAmount]);

  if (records.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Department Horizontal Bar Chart */}
      <div className="lg:col-span-7 bg-white border border-[#E2E5E8] rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#231F20]">
              Irregular Costs by Department
            </h3>
            <p className="text-[11px] text-[#5F6368]">
              Click a department bar to filter the register · Reconciles to {formatMoney(totalAmount)}
            </p>
          </div>
          {selectedDepartment !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectDepartment('all')}
              className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
            >
              Show all departments
            </button>
          )}
        </div>

        <div className="space-y-2.5 pt-1">
          {byDepartment.map((dept) => {
            const sharePct = (dept.amountCad / (totalAmount || 1)) * 100;
            const barWidthPct = (dept.amountCad / maxDeptAmount) * 100;
            const isSelected = selectedDepartment === dept.department;
            const isDimmed = selectedDepartment !== 'all' && !isSelected;

            return (
              <button
                key={dept.department}
                type="button"
                onClick={() =>
                  onSelectDepartment(isSelected ? 'all' : dept.department)
                }
                className={`w-full text-left p-2 rounded border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#E53C2E]/[0.05] border-[#E53C2E]'
                    : 'bg-white border-transparent hover:bg-[#F5F6F7]'
                } ${isDimmed ? 'opacity-55' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="font-medium text-[#231F20]">
                    {dept.department}{' '}
                    <span className="text-[11px] font-normal text-[#5F6368]">
                      ({dept.count} {dept.count === 1 ? 'item' : 'items'})
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#231F20] font-semibold">
                    {formatMoney(dept.amountCad)}{' '}
                    <span className="text-[#5F6368] font-normal">({sharePct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="h-2.5 bg-[#ECEEF0] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-200"
                    style={{
                      width: `${barWidthPct}%`,
                      backgroundColor: isSelected ? '#E53C2E' : '#231F20',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* One-Time vs Trend Exposure Chart */}
      <div className="lg:col-span-5 bg-white border border-[#E2E5E8] rounded-md p-4 flex flex-col justify-between space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#231F20]">
              One-Time vs. Trend Exposure
            </h3>
            <p className="text-[11px] text-[#5F6368]">
              Click a segment to filter by recurrence classification
            </p>
          </div>
          {selectedTiming !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectTiming('all')}
              className="text-[11px] font-medium text-[#E53C2E] hover:underline cursor-pointer"
            >
              Show all timing
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* 100% Proportional Split Bar */}
          <div className="space-y-1.5">
            <div className="h-8 w-full rounded border border-[#E2E5E8] overflow-hidden flex bg-[#ECEEF0]">
              <button
                type="button"
                onClick={() =>
                  onSelectTiming(selectedTiming === 'One-time' ? 'all' : 'One-time')
                }
                style={{ width: `${timingSplit.oneTimePct}%` }}
                className={`h-full bg-[#231F20] border-r border-white/80 flex items-center justify-center text-[11px] font-mono font-semibold text-white cursor-pointer transition-opacity ${
                  selectedTiming === 'Trend' ? 'opacity-45 hover:opacity-80' : ''
                }`}
                title={`One-time: ${formatMoney(timingSplit.oneTimeCad)} (${timingSplit.oneTimePct.toFixed(1)}%)`}
              >
                {timingSplit.oneTimePct >= 18 && `${timingSplit.oneTimePct.toFixed(1)}%`}
              </button>
              <button
                type="button"
                onClick={() =>
                  onSelectTiming(selectedTiming === 'Trend' ? 'all' : 'Trend')
                }
                style={{ width: `${timingSplit.trendPct}%` }}
                className={`h-full bg-[#E53C2E] flex items-center justify-center text-[11px] font-mono font-semibold text-white cursor-pointer transition-opacity ${
                  selectedTiming === 'One-time' ? 'opacity-45 hover:opacity-80' : ''
                }`}
                title={`Trend: ${formatMoney(timingSplit.trendCad)} (${timingSplit.trendPct.toFixed(1)}%)`}
              >
                {timingSplit.trendPct >= 18 && `${timingSplit.trendPct.toFixed(1)}%`}
              </button>
            </div>
          </div>

          {/* Two Interactive Breakdown Rows */}
          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={() =>
                onSelectTiming(selectedTiming === 'One-time' ? 'all' : 'One-time')
              }
              className={`p-3 rounded border text-left transition-colors cursor-pointer ${
                selectedTiming === 'One-time'
                  ? 'bg-[#231F20]/[0.04] border-[#231F20]'
                  : 'bg-[#F8F9FA] border-[#E2E5E8] hover:border-[#C8CACD]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-[#231F20]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#231F20]" />
                  One-time items ({timingSplit.oneTimeCount})
                </span>
                <span className="font-mono tabular-nums font-semibold text-[#231F20]">
                  {formatMoney(timingSplit.oneTimeCad)}{' '}
                  <span className="text-[#5F6368] font-normal">
                    ({timingSplit.oneTimePct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-[#5F6368] mt-1">
                Isolated period postings (e.g., scrap write-off, duplicate invoice, unreversed accrual).
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                onSelectTiming(selectedTiming === 'Trend' ? 'all' : 'Trend')
              }
              className={`p-3 rounded border text-left transition-colors cursor-pointer ${
                selectedTiming === 'Trend'
                  ? 'bg-[#E53C2E]/[0.05] border-[#E53C2E]'
                  : 'bg-[#F8F9FA] border-[#E2E5E8] hover:border-[#C8CACD]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-[#231F20]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#E53C2E]" />
                  Trend / recurring exposure ({timingSplit.trendCount})
                </span>
                <span className="font-mono tabular-nums font-semibold text-[#E53C2E]">
                  {formatMoney(timingSplit.trendCad)}{' '}
                  <span className="text-[#5F6368] font-normal">
                    ({timingSplit.trendPct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-[#5F6368] mt-1">
                Ongoing operational or close-process patterns (rush freight premium, suspense account).
              </p>
            </button>
          </div>
        </div>

        <div className="pt-2.5 border-t border-[#E2E5E8] flex items-center justify-between text-[11px] text-[#5F6368]">
          <span>Combined visible scope</span>
          <span className="font-mono tabular-nums font-semibold text-[#231F20]">
            {formatMoney(totalAmount)} (100.0%)
          </span>
        </div>
      </div>
    </div>
  );
};
