import React from 'react';
import { Printer, X } from 'lucide-react';
import { BuiltReportModel } from '../../domain/reportEngine';
import { SkyjackLogo } from '../brand/SkyjackLogo';

interface Props {
  model: BuiltReportModel;
  onClose: () => void;
  onTriggeredPrint: () => void;
}

export const PrintManagementBriefModal: React.FC<Props> = ({
  model,
  onClose,
  onTriggeredPrint,
}) => {
  const handlePrint = () => {
    onTriggeredPrint();
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#231F20]/60 overflow-y-auto p-4 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="max-w-4xl mx-auto bg-white rounded-md border border-[#E2E5E8] shadow-xl print:shadow-none print:border-0">
        <div className="px-5 py-3.5 border-b border-[#E2E5E8] flex flex-wrap items-center justify-between gap-3 bg-[#F5F6F7] print:hidden">
          <div>
            <h2 className="text-sm font-semibold text-[#231F20]">
              Print-Ready Management Report (Save as PDF via Browser)
            </h2>
            <p className="text-[11px] text-[#5F6368]">
              Formatted browser print layout — use your browser&apos;s Print destination &ldquo;Save as PDF&rdquo; rather than a server-side PDF renderer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#231F20] rounded hover:bg-[#3A3536] cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#E53C2E]" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#5F6368] hover:text-[#231F20] border border-[#E2E5E8] bg-white rounded cursor-pointer"
              aria-label="Close print preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 text-[#231F20]">
          <header className="border-b-2 border-[#E53C2E] pb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <SkyjackLogo variant="light-surface" />
              <h1 className="text-xl font-bold pt-2">{model.config.title}</h1>
              <p className="text-xs text-[#5F6368]">
                Period: {model.config.reportingPeriod} · Scope: {model.datasetScopeLabel} · Prepared by {model.config.authorName}
              </p>
            </div>
            <div className="text-right text-[11px] text-[#5F6368] font-mono">
              <div>Fictional Competition Data</div>
              <div>Reporting Currency: {model.currency}</div>
              <div>Generated: {model.generatedAtIso.slice(0, 10)}</div>
            </div>
          </header>

          {model.slides
            .filter((s) => s.layoutKind !== 'cover')
            .map((slide) => (
              <section key={slide.id} className="border border-[#E2E5E8] rounded p-4 space-y-2.5 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-2 border-b border-[#E2E5E8] pb-1.5">
                  <h2 className="text-sm font-bold text-[#231F20]">{slide.title}</h2>
                  <span className="text-[10px] font-mono text-[#7E8082]">
                    {slide.provenanceTag} · {slide.sourceRef}
                  </span>
                </div>

                {slide.unavailableReason && (
                  <p className="text-xs text-[#E53C2E]">{slide.unavailableReason}</p>
                )}

                {slide.kpis && slide.kpis.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {slide.kpis.map((k) => (
                      <div key={k.id} className="bg-[#F5F6F7] border border-[#E2E5E8] rounded p-2">
                        <div className="text-[10px] text-[#5F6368] uppercase">{k.label}</div>
                        <div className="text-sm font-bold text-[#231F20]">{k.exactValue}</div>
                        <div className="text-[10px] text-[#7E8082]">{k.subtext}</div>
                      </div>
                    ))}
                  </div>
                )}

                {slide.table && (
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-[#231F20] text-white">
                        {slide.table.headers.map((h, i) => (
                          <th
                            key={h + i}
                            className={`py-1.5 px-2 font-medium ${
                              slide.table?.numericColumnIndices.includes(i) ? 'text-right' : 'text-left'
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E5E8]">
                      {slide.table.rows.map((r, rIdx) => (
                        <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-[#F5F6F7]' : 'bg-white'}>
                          {r.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className={`py-1 px-2 ${
                                slide.table?.numericColumnIndices.includes(cIdx) ? 'text-right font-mono' : 'text-left'
                              }`}
                            >
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {slide.bullets && slide.bullets.length > 0 && (
                  <ul className="space-y-1 text-xs text-[#231F20] list-disc pl-5">
                    {slide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}

                {slide.calloutNote && (
                  <p className="text-[11px] text-[#5F6368] bg-[#F5F6F7] rounded px-2.5 py-1.5">
                    {slide.calloutNote}
                  </p>
                )}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
};
