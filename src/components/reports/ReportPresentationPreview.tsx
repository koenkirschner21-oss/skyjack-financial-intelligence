import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import {
  BuiltReportModel,
  ReportChartModel,
  ReportSlideModel,
} from '../../domain/reportEngine';
import { formatReportingCompact } from '../../domain/currencyService';
import { CurrencyCode } from '../../types/domain';
import { SkyjackLogo } from '../brand/SkyjackLogo';

interface Props {
  model: BuiltReportModel;
  activeSlideIdx: number;
  onSelectSlide: (idx: number) => void;
}

const MiniSvgChart: React.FC<{ chart: ReportChartModel; currency: CurrencyCode }> = ({ chart, currency }) => {
  const width = 460;
  const height = 220;
  const padL = 42;
  const padR = 14;
  const padT = 24;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  if (chart.kind === 'waterfall' && chart.waterfallSteps?.length) {
    const steps = chart.waterfallSteps;
    const maxVal = Math.max(1, ...steps.flatMap((s) => [s.startCad, s.endCad]));
    const colW = plotW / steps.length;
    const barW = Math.min(34, colW * 0.62);

    return (
      <div className="bg-white border border-[#E2E5E8] rounded p-3">
        <div className="text-[11px] font-semibold text-[#231F20] mb-1.5 truncate">{chart.title}</div>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#7E8082" strokeWidth={1} />
          {steps.map((st, idx) => {
            const low = Math.min(st.startCad, st.endCad);
            const high = Math.max(st.startCad, st.endCad);
            const yTop = padT + plotH - (high / maxVal) * plotH;
            const yBot = padT + plotH - (low / maxVal) * plotH;
            const barH = Math.max(4, yBot - yTop);
            const x = padL + idx * colW + (colW - barW) / 2;
            const fill = st.isEndpoint ? '#231F20' : st.deltaCad >= 0 ? '#16A34A' : '#E53C2E';
            return (
              <g key={st.label}>
                <rect x={x} y={yTop} width={barW} height={barH} fill={fill} rx={2} />
                <text
                  x={x + barW / 2}
                  y={Math.max(12, yTop - 4)}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="600"
                  fill="#231F20"
                >
                  {formatReportingCompact(st.deltaCad, currency, { showSign: !st.isEndpoint })}
                </text>
                <text
                  x={x + barW / 2}
                  y={padT + plotH + 14}
                  textAnchor="middle"
                  fontSize="7.5"
                  fill="#5F6368"
                >
                  {st.label.slice(0, 12)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const allVals = chart.series.flatMap((s) => s.values);
  const maxVal = Math.max(1, ...allVals);
  const minVal = Math.min(0, ...allVals);
  const span = Math.max(1, maxVal - minVal);
  const nCats = Math.max(1, chart.categories.length);
  const groupW = plotW / nCats;

  const yPos = (val: number) => padT + plotH - ((val - minVal) / span) * plotH;
  const zeroY = yPos(0);

  return (
    <div className="bg-white border border-[#E2E5E8] rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-[#231F20] truncate">{chart.title}</span>
        <span className="text-[10px] text-[#7E8082] shrink-0">{chart.unitLabel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <line x1={padL} y1={zeroY} x2={padL + plotW} y2={zeroY} stroke="#7E8082" strokeWidth={1} />
        <text x={padL - 4} y={padT + 8} textAnchor="end" fontSize="8" fill="#7E8082">
          {maxVal.toFixed(1)}
        </text>
        <text x={padL - 4} y={zeroY + 3} textAnchor="end" fontSize="8" fill="#7E8082">
          0
        </text>

        {chart.kind === 'line'
          ? chart.series.map((ser) => {
              const pts = ser.values
                .map((v, i) => `${padL + i * groupW + groupW / 2},${yPos(v)}`)
                .join(' ');
              return (
                <g key={ser.name}>
                  <polyline fill="none" stroke={ser.colorHex} strokeWidth={2.2} points={pts} />
                  {ser.values.map((v, i) => {
                    const cx = padL + i * groupW + groupW / 2;
                    const cy = yPos(v);
                    return (
                      <g key={`${ser.name}-${i}`}>
                        <circle cx={cx} cy={cy} r={3.5} fill={ser.colorHex} />
                        <text x={cx} y={Math.max(12, cy - 7)} textAnchor="middle" fontSize="8" fill="#231F20">
                          {v}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })
          : chart.categories.map((_, cIdx) => {
              const serCount = chart.series.length;
              const barW = Math.min(26, (groupW * 0.72) / serCount);
              return chart.series.map((ser, sIdx) => {
                const val = ser.values[cIdx] ?? 0;
                const y = val >= 0 ? yPos(val) : zeroY;
                const h = Math.max(2, Math.abs(yPos(val) - zeroY));
                const x = padL + cIdx * groupW + (groupW - barW * serCount) / 2 + sIdx * barW;
                return (
                  <g key={`${ser.name}-${cIdx}`}>
                    <rect x={x} y={y} width={barW - 1} height={h} fill={ser.colorHex} rx={1.5} />
                    {nCats <= 7 && serCount === 1 && (
                      <text x={x + barW / 2} y={Math.max(12, y - 4)} textAnchor="middle" fontSize="8" fill="#231F20">
                        {val}
                      </text>
                    )}
                  </g>
                );
              });
            })}

        {chart.categories.map((cat, idx) => (
          <text
            key={cat + idx}
            x={padL + idx * groupW + groupW / 2}
            y={padT + plotH + 14}
            textAnchor="middle"
            fontSize="8"
            fill="#5F6368"
          >
            {cat.length > 11 ? `${cat.slice(0, 10)}…` : cat}
          </text>
        ))}
      </svg>
      {chart.series.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-[#5F6368]">
          {chart.series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: s.colorHex }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const SlideCanvas: React.FC<{ model: BuiltReportModel; slide: ReportSlideModel }> = ({ model, slide }) => {
  if (slide.layoutKind === 'cover') {
    return (
      <div className="aspect-[16/9] w-full bg-white border border-[#E2E5E8] rounded-md shadow-sm overflow-hidden flex">
        <div className="w-3.5 bg-[#231F20] shrink-0" />
        <div className="w-1.5 bg-[#E53C2E] shrink-0" />
        <div className="flex-1 p-6 sm:p-8 flex flex-col justify-between min-w-0">
          <div className="space-y-4">
            <SkyjackLogo variant="light-surface" />
            <div className="pt-2">
              <h3 className="text-xl sm:text-2xl font-bold text-[#231F20] leading-tight">
                {slide.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#5F6368] mt-1.5">{slide.subtitle}</p>
            </div>
          </div>

          <div className="bg-[#F8F9FA] rounded-md p-4 space-y-1.5">
            {slide.bullets?.map((b) => (
              <div key={b} className="text-xs text-[#231F20] flex items-start gap-2">
                <span className="text-[#E53C2E] font-bold">•</span>
                <span>{b}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7E8082] border-t border-[#E2E5E8] pt-3">
            <span>{slide.provenanceTag}</span>
            <span>{slide.sourceRef}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-[16/9] w-full bg-white border border-[#E2E5E8] rounded-md shadow-sm overflow-hidden flex flex-col justify-between">
      <div className="h-1 bg-[#E53C2E] w-full shrink-0" />
      <div className="flex-1 p-4 sm:p-6 flex flex-col justify-between min-h-0 overflow-y-auto">
        <div>
          <div className="flex items-start justify-between gap-3 border-b border-[#E2E5E8] pb-2.5">
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[#231F20] truncate">{slide.title}</h3>
              <p className="text-[11px] text-[#5F6368] truncate mt-0.5">
                {slide.subtitle} · <span className="text-[#231F20] font-medium">{slide.provenanceTag}</span>
              </p>
            </div>
            <div className="shrink-0 hidden sm:block">
              <SkyjackLogo variant="light-surface" />
            </div>
          </div>

          {slide.unavailableReason ? (
            <div className="mt-4 bg-[#F8F9FA] border border-[#E2E5E8] rounded p-4 space-y-1.5">
              <div className="text-xs font-semibold text-[#E53C2E]">Data Scope &amp; Availability Notice</div>
              <p className="text-xs text-[#231F20] leading-relaxed">{slide.unavailableReason}</p>
            </div>
          ) : slide.layoutKind === 'executive_kpi' && slide.kpis ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {slide.kpis.slice(0, 6).map((kpi, idx) => (
                  <div
                    key={kpi.id}
                    className="border border-[#E2E5E8] rounded bg-white p-3 border-t-2"
                    style={{ borderTopColor: idx === 1 ? '#E53C2E' : '#231F20' }}
                  >
                    <div className="text-[11px] font-medium text-[#5F6368] truncate">
                      {kpi.label}
                    </div>
                    <div className="text-xl font-bold text-[#231F20] font-mono tabular-nums mt-1">
                      {kpi.compactValue}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#231F20] mt-0.5 truncate">
                      {kpi.exactValue}
                    </div>
                    <div className="text-[10px] text-[#7E8082] mt-1 truncate">
                      {kpi.subtext} · {kpi.provenance}
                    </div>
                  </div>
                ))}
              </div>
              {slide.calloutNote && (
                <div className="bg-[#F8F9FA] rounded px-3 py-2 text-[11px] text-[#231F20]">
                  {slide.calloutNote}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {slide.kpis && slide.kpis.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {slide.kpis.slice(0, 3).map((k) => (
                    <div key={k.id} className="bg-[#F8F9FA] border border-[#E2E5E8] rounded px-3 py-2">
                      <div className="text-[10px] text-[#5F6368]">{k.label}</div>
                      <div className="text-xs font-bold text-[#231F20] font-mono tabular-nums mt-0.5">
                        {k.exactValue}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={`grid gap-3 ${slide.chart && slide.table ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
                {slide.chart && <MiniSvgChart chart={slide.chart} currency={model.currency} />}
                {slide.table && (
                  <div className="border border-[#E2E5E8] rounded overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#231F20] text-white">
                          {slide.table.headers.map((h, i) => (
                            <th
                              key={h + i}
                              className={`py-1.5 px-2.5 font-medium ${
                                slide.table?.numericColumnIndices.includes(i) ? 'text-right' : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E5E8]">
                        {slide.table.rows.slice(0, 12).map((row, rIdx) => (
                          <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-[#F8F9FA]' : 'bg-white'}>
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`py-1.5 px-2.5 text-[#231F20] ${
                                  slide.table?.numericColumnIndices.includes(cIdx)
                                    ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                    : 'text-left'
                                }`}
                              >
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {slide.bullets && slide.bullets.length > 0 && (
                <div className="bg-[#F8F9FA] rounded p-3.5 space-y-1.5">
                  {slide.bullets.map((b, i) => (
                    <div key={i} className="text-xs text-[#231F20] flex items-start gap-2 leading-relaxed">
                      <span className="text-[#E53C2E] font-bold">•</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}

              {(slide.calloutNote || slide.chart?.chartLimitationNote) && (
                <div className="bg-[#F8F9FA] rounded px-3 py-2 text-[10.5px] text-[#5F6368]">
                  {[slide.calloutNote, slide.chart?.chartLimitationNote].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[#E2E5E8] pt-2 mt-3 flex items-center justify-between gap-2 text-[10px] text-[#7E8082]">
          <span className="truncate">
            SKYJACK Financial Intelligence · Fictional Competition Case Data · Source: {slide.sourceRef}
          </span>
          <span className="font-mono tabular-nums font-semibold text-[#231F20] shrink-0">
            Slide {slide.slideNumber} of {model.slides.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ReportPresentationPreview: React.FC<Props> = ({
  model,
  activeSlideIdx,
  onSelectSlide,
}) => {
  const safeIdx = Math.min(Math.max(0, activeSlideIdx), Math.max(0, model.slides.length - 1));
  const activeSlide = model.slides[safeIdx];
  const [showParityNote, setShowParityNote] = useState(false);
  const noteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showParityNote) return;
    const onMouseDown = (e: MouseEvent) => {
      if (noteRef.current && !noteRef.current.contains(e.target as Node)) {
        setShowParityNote(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowParityNote(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showParityNote]);

  return (
    <div className="space-y-3">
      {/* Slide Indicator & Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-semibold text-[#231F20] font-mono tabular-nums shrink-0">
            Slide {safeIdx + 1} of {model.slides.length}
          </span>
          {activeSlide && (
            <>
              <span className="text-[#C8CACD]" aria-hidden="true">·</span>
              <span className="text-xs text-[#5F6368] truncate">{activeSlide.title}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 relative shrink-0" ref={noteRef}>
          <button
            type="button"
            onClick={() => setShowParityNote((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#5F6368] bg-[#F8F9FA] border border-[#E2E5E8] rounded hover:text-[#231F20] cursor-pointer whitespace-nowrap"
            aria-expanded={showParityNote}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Preview parity</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safeIdx === 0}
              onClick={() => onSelectSlide(Math.max(0, safeIdx - 1))}
              className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5E8] bg-white rounded disabled:opacity-40 hover:bg-[#F5F6F7] cursor-pointer"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-4 h-4 text-[#231F20]" />
            </button>
            <button
              type="button"
              disabled={safeIdx >= model.slides.length - 1}
              onClick={() => onSelectSlide(Math.min(model.slides.length - 1, safeIdx + 1))}
              className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5E8] bg-white rounded disabled:opacity-40 hover:bg-[#F5F6F7] cursor-pointer"
              aria-label="Next slide"
            >
              <ChevronRight className="w-4 h-4 text-[#231F20]" />
            </button>
          </div>

          {showParityNote && (
            <div className="absolute right-0 top-10 z-30 w-80 bg-white border border-[#E2E5E8] rounded-md shadow-sm p-3.5 text-[11px] text-[#5F6368] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#231F20]">Browser Preview vs .pptx Export</span>
                <button
                  type="button"
                  onClick={() => setShowParityNote(false)}
                  className="text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                  aria-label="Close preview parity note"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="leading-relaxed">
                This 16:9 canvas uses the exact same live report model, slide sequence, and authoritative figures as the native PowerPoint (.pptx) export.
              </p>
              <p className="leading-relaxed">
                Minor layout differences: dense tables preview up to 12 rows per slide here while native .pptx and .xlsx carry complete rows; waterfall profit walks export as editable floating proportional shapes in .pptx.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main 16:9 Slide Canvas */}
      {activeSlide && <SlideCanvas model={model} slide={activeSlide} />}

      {/* Compact Slide Outline Navigation */}
      <div className="pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-2">
          {model.slides.map((s, idx) => {
            const isActive = idx === safeIdx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSlide(idx)}
                className={`text-left px-2.5 py-2 rounded border transition-colors cursor-pointer ${
                  isActive
                    ? 'border-[#E53C2E] bg-[#FDF2F1]'
                    : 'border-[#E2E5E8] bg-white hover:bg-[#F8F9FA]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono tabular-nums text-[#7E8082]">
                  <span className={isActive ? 'text-[#E53C2E] font-semibold' : ''}>
                    Slide {s.slideNumber}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-[#231F20] line-clamp-2 mt-0.5 leading-snug">
                  {s.title}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
