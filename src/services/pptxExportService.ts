import PptxGenJS from 'pptxgenjs';
import {
  BuiltReportModel,
  ReportChartModel,
  ReportSlideModel,
} from '../domain/reportEngine';
import { formatReportingCompact } from '../domain/currencyService';
import { CurrencyCode } from '../types/domain';

const COLORS = {
  red: 'E53C2E',
  charcoal: '231F20',
  grey: '7E8082',
  secondaryText: '5F6368',
  bgLight: 'F5F6F7',
  border: 'E2E5E8',
  white: 'FFFFFF',
  green: '16A34A',
  amber: 'B45309',
  blue: '1D4ED8',
};

function resolvePptxConstructor(): typeof PptxGenJS {
  const mod = PptxGenJS as unknown as { default?: typeof PptxGenJS };
  return mod.default ?? PptxGenJS;
}

export function buildReportFileName(
  title: string,
  period: string,
  ext: 'pptx' | 'xlsx' | 'csv'
): string {
  const safeBase = title
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const safePeriod = period.replace(/\s+/g, '_');
  const prefix = safeBase.toUpperCase().startsWith('SKYJACK') ? '' : 'SKYJACK_';
  const suffix = safeBase.toUpperCase().includes(safePeriod.toUpperCase()) ? '' : `_${safePeriod}`;
  return `${prefix}${safeBase || 'Executive_Report'}${suffix}.${ext}`;
}

function addBrandHeaderAndFooter(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  model: BuiltReportModel,
  s: ReportSlideModel
): void {
  // Subtle top accent line
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.06,
    fill: { color: COLORS.red },
    line: { color: COLORS.red, width: 0 },
  });

  // Compact replaceable SJ mark + SKYJACK wordmark at top right
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.45,
    y: 0.22,
    w: 0.34,
    h: 0.34,
    rectRadius: 0.06,
    fill: { color: COLORS.red },
    line: { color: COLORS.red, width: 0 },
  });
  slide.addText('SJ', {
    x: 11.45,
    y: 0.22,
    w: 0.34,
    h: 0.34,
    fontFace: 'Arial',
    fontSize: 10,
    bold: true,
    color: COLORS.white,
    align: 'center',
    valign: 'middle',
  });
  slide.addText('SKYJACK', {
    x: 11.83,
    y: 0.22,
    w: 1.05,
    h: 0.34,
    fontFace: 'Arial',
    fontSize: 11,
    bold: true,
    color: COLORS.charcoal,
    valign: 'middle',
  });

  // Slide Title & Subtitle
  slide.addText(s.title, {
    x: 0.5,
    y: 0.18,
    w: 10.5,
    h: 0.38,
    fontFace: 'Arial',
    fontSize: 18,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
    wrap: true,
    shrinkText: true,
  });

  slide.addText(`${s.subtitle}   |   ${s.provenanceTag}`, {
    x: 0.5,
    y: 0.56,
    w: 12.3,
    h: 0.28,
    fontFace: 'Arial',
    fontSize: 10,
    color: COLORS.secondaryText,
    margin: 0,
    wrap: true,
    shrinkText: true,
  });

  // Hairline divider
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 0.96,
    w: 12.23,
    h: 0,
    line: { color: COLORS.border, width: 1 },
  });

  // Footer
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 7.04,
    w: 12.23,
    h: 0,
    line: { color: COLORS.border, width: 0.75 },
  });

  slide.addText(
    `SKYJACK Financial Intelligence · Fictional Competition Case Data · Source: ${s.sourceRef}`,
    {
      x: 0.55,
      y: 7.1,
      w: 10.8,
      h: 0.26,
      fontFace: 'Arial',
      fontSize: 9,
      color: COLORS.grey,
      margin: 0,
      wrap: true,
      shrinkText: true,
    }
  );

  slide.addText(`${s.slideNumber} / ${model.slides.length}`, {
    x: 11.75,
    y: 7.1,
    w: 1.03,
    h: 0.26,
    fontFace: 'Arial',
    fontSize: 8.5,
    bold: true,
    color: COLORS.charcoal,
    align: 'right',
    margin: 0,
  });
}

function addNativeChart(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  chart: ReportChartModel,
  box: { x: number; y: number; w: number; h: number }
): void {
  const chartData = chart.series.map((ser) => ({
    name: ser.name,
    labels: chart.categories,
    values: ser.values,
  }));

  const chartColors = chart.series.map((ser) => ser.colorHex.replace('#', ''));
  const pptxType = chart.kind === 'line' ? pptx.ChartType.line : pptx.ChartType.bar;

  slide.addChart(pptxType, chartData, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    barDir: 'col',
    barGrouping: chart.kind === 'stacked_bar' ? 'stacked' : 'clustered',
    chartColors,
    showTitle: true,
    title: chart.title,
    titleFontFace: 'Arial',
    titleFontSize: 11,
    titleColor: COLORS.charcoal,
    showLegend: chart.series.length > 1,
    legendPos: 'b',
    legendFontSize: 8.5,
    showValue: chart.categories.length <= 8 && chart.series.length === 1,
    dataLabelFontSize: 8,
    dataLabelColor: COLORS.charcoal,
    catAxisLabelFontSize: 8.5,
    catAxisLabelColor: COLORS.secondaryText,
    valAxisLabelFontSize: 8.5,
    valAxisLabelColor: COLORS.secondaryText,
    valGridLine: { color: COLORS.border, style: 'solid', size: 0.5 },
    catGridLine: { style: 'none' },
  });
}

function addWaterfallShapes(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  chart: ReportChartModel,
  box: { x: number; y: number; w: number; h: number },
  currency: CurrencyCode
): void {
  const steps = chart.waterfallSteps ?? [];
  if (steps.length === 0) return;

  // Container card
  slide.addShape(pptx.ShapeType.rect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });

  slide.addText(`${chart.title} (Editable Proportional Shapes)`, {
    x: box.x + 0.18,
    y: box.y + 0.1,
    w: box.w - 0.36,
    h: 0.28,
    fontFace: 'Arial',
    fontSize: 10.5,
    bold: true,
    color: COLORS.charcoal,
    margin: 0,
  });

  const maxVal = Math.max(1, ...steps.flatMap((st) => [st.startCad, st.endCad]));
  const plotLeft = box.x + 0.25;
  const plotTop = box.y + 0.55;
  const plotW = box.w - 0.5;
  const plotH = box.h - 1.25;
  const colW = plotW / steps.length;
  const barW = Math.min(0.68, colW * 0.64);

  // Baseline axis
  slide.addShape(pptx.ShapeType.line, {
    x: plotLeft,
    y: plotTop + plotH,
    w: plotW,
    h: 0,
    line: { color: COLORS.grey, width: 0.75 },
  });

  steps.forEach((step, idx) => {
    const low = Math.min(step.startCad, step.endCad);
    const high = Math.max(step.startCad, step.endCad);
    const barBottomY = plotTop + plotH - (low / maxVal) * plotH;
    const barTopY = plotTop + plotH - (high / maxVal) * plotH;
    const barH = Math.max(0.14, barBottomY - barTopY);
    const xCenter = plotLeft + colW * idx + (colW - barW) / 2;

    const fillColor = step.isEndpoint
      ? COLORS.charcoal
      : step.deltaCad >= 0
        ? COLORS.green
        : COLORS.red;

    slide.addShape(pptx.ShapeType.rect, {
      x: xCenter,
      y: barTopY,
      w: barW,
      h: barH,
      fill: { color: fillColor },
      line: { color: fillColor, width: 0 },
    });

    slide.addText(formatReportingCompact(step.deltaCad, currency, { showSign: !step.isEndpoint }), {
      x: plotLeft + colW * idx,
      y: Math.min(box.y + box.h - 0.62, Math.max(box.y + 0.4, barTopY - 0.22)),
      w: colW,
      h: 0.2,
      fontFace: 'Arial',
      fontSize: 7.5,
      bold: true,
      color: COLORS.charcoal,
      align: 'center',
      margin: 0,
    });

    slide.addText(step.label, {
      x: plotLeft + colW * idx + 0.02,
      y: plotTop + plotH + 0.06,
      w: colW - 0.04,
      h: 0.5,
      fontFace: 'Arial',
      fontSize: 7,
      color: COLORS.secondaryText,
      align: 'center',
      valign: 'top',
      margin: 0,
    });
  });
}

function addStyledTable(
  slide: PptxGenJS.Slide,
  headers: string[],
  rows: (string | number)[][],
  numericCols: number[],
  box: { x: number; y: number; w: number; h: number }
): void {
  const rowH = 0.28;
  const maxRows = Math.max(1, Math.floor(box.h / rowH) - 1);
  const visibleRows = rows.slice(0, maxRows);
  const numSet = new Set(numericCols);

  const tableRows: PptxGenJS.TableRow[] = [
    headers.map((h, colIdx) => ({
      text: String(h),
      options: {
        bold: true,
        fontFace: 'Arial',
        fontSize: 8.5,
        color: COLORS.white,
        fill: { color: COLORS.charcoal },
        align: (numSet.has(colIdx) ? 'right' : 'left') as 'right' | 'left',
        valign: 'middle' as const,
      },
    })),
    ...visibleRows.map((row, rIdx) =>
      row.map((cell, colIdx) => ({
        text: String(cell ?? ''),
        options: {
          fontFace: 'Arial',
          fontSize: 8,
          color: COLORS.charcoal,
          fill: { color: rIdx % 2 === 1 ? COLORS.bgLight : COLORS.white },
          align: (numSet.has(colIdx) ? 'right' : 'left') as 'right' | 'left',
          valign: 'middle' as const,
        },
      }))
    ),
  ];

  slide.addTable(tableRows, {
    x: box.x,
    y: box.y,
    w: box.w,
    border: { type: 'solid', color: COLORS.border, pt: 0.5 },
    h: box.h,
    autoPage: false,
    rowH,
    margin: [0.04, 0.06, 0.04, 0.06],
  });
}

export interface PptxExportResult {
  ok: true;
  fileName: string;
  slideCount: number;
  byteSize: number;
  bytes: Uint8Array;
}

export async function generatePptxPresentation(model: BuiltReportModel): Promise<PptxExportResult> {
  const PptxCtor = resolvePptxConstructor();
  const pptx = new PptxCtor();
  pptx.defineLayout({ name: 'SKYJACK_WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'SKYJACK_WIDE';
  pptx.author = model.config.authorName;
  pptx.company = 'SKYJACK (Prompt to Pitch 2026 — Team Group 12)';
  pptx.title = model.config.title;
  pptx.subject = `${model.config.reportingPeriod} Executive Report (${model.datasetScopeLabel})`;

  for (const s of model.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };

    if (s.layoutKind === 'cover') {
      // Dark industrial hero strip on left + crisp white cover canvas
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 0.45,
        h: 7.5,
        fill: { color: COLORS.charcoal },
        line: { color: COLORS.charcoal, width: 0 },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.45,
        y: 0,
        w: 0.1,
        h: 7.5,
        fill: { color: COLORS.red },
        line: { color: COLORS.red, width: 0 },
      });

      // SJ Logo lockup
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 1.0,
        y: 0.9,
        w: 0.56,
        h: 0.56,
        rectRadius: 0.08,
        fill: { color: COLORS.red },
        line: { color: COLORS.red, width: 0 },
      });
      slide.addText('SJ', {
        x: 1.0,
        y: 0.9,
        w: 0.56,
        h: 0.56,
        fontFace: 'Arial',
        fontSize: 16,
        bold: true,
        color: COLORS.white,
        align: 'center',
        valign: 'middle',
      });
      slide.addText('SKYJACK FINANCIAL INTELLIGENCE', {
        x: 1.72,
        y: 0.9,
        w: 6.0,
        h: 0.56,
        fontFace: 'Arial',
        fontSize: 15,
        bold: true,
        color: COLORS.charcoal,
        valign: 'middle',
      });

      slide.addText(s.title, {
        x: 1.0,
        y: 2.05,
        w: 11.2,
        h: 1.15,
        fontFace: 'Arial',
        fontSize: 30,
        bold: true,
        color: COLORS.charcoal,
        valign: 'top',
        wrap: true,
        shrinkText: true,
      });

      slide.addText(s.subtitle, {
        x: 1.0,
        y: 3.25,
        w: 10.8,
        h: 0.6,
        fontFace: 'Arial',
        fontSize: 14,
        color: COLORS.secondaryText,
        wrap: true,
        shrinkText: true,
      });

      // Metadata card
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.0,
        y: 4.15,
        w: 11.3,
        h: 1.95,
        fill: { color: COLORS.bgLight },
        line: { color: COLORS.border, width: 1 },
      });

      if (s.bullets?.length) {
        slide.addText(
          s.bullets.slice(0, 5).map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          {
            x: 1.25,
            y: 4.32,
            w: 10.8,
            h: 1.6,
            fontFace: 'Arial',
            fontSize: 12,
            color: COLORS.charcoal,
            paraSpaceAfter: 4,
            shrinkText: true,
            wrap: true,
          }
        );
      }

      slide.addText(
        `${s.provenanceTag}   |   ${s.sourceRef}   |   Generated ${model.generatedAtIso.slice(0, 10)}`,
        {
          x: 1.0,
          y: 6.72,
          w: 11.3,
          h: 0.35,
          fontFace: 'Arial',
          fontSize: 9.5,
          color: COLORS.grey,
        }
      );
      continue;
    }

    addBrandHeaderAndFooter(pptx, slide, model, s);

    if (s.unavailableReason) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.55,
        y: 1.25,
        w: 12.23,
        h: 2.0,
        fill: { color: COLORS.bgLight },
        line: { color: COLORS.border, width: 1 },
      });
      slide.addText('Data Scope & Availability Notice', {
        x: 0.85,
        y: 1.45,
        w: 11.6,
        h: 0.35,
        fontFace: 'Arial',
        fontSize: 13,
        bold: true,
        color: COLORS.red,
      });
      slide.addText(s.unavailableReason, {
        x: 0.85,
        y: 1.9,
        w: 11.6,
        h: 0.9,
        fontFace: 'Arial',
        fontSize: 11.5,
        color: COLORS.charcoal,
      });
      continue;
    }

    if (s.layoutKind === 'executive_kpi' && s.kpis) {
      const cols = 3;
      const cardW = 3.88;
      const cardH = 1.95;
      s.kpis.slice(0, 6).forEach((kpi, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = 0.55 + col * (cardW + 0.29);
        const y = 1.2 + row * (cardH + 0.28);

        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: cardW,
          h: cardH,
          fill: { color: COLORS.white },
          line: { color: COLORS.border, width: 1 },
        });
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: cardW,
          h: 0.06,
          fill: { color: idx === 1 ? COLORS.red : COLORS.charcoal },
          line: { color: idx === 1 ? COLORS.red : COLORS.charcoal, width: 0 },
        });
        slide.addText(kpi.label.toUpperCase(), {
          x: x + 0.18,
          y: y + 0.18,
          w: cardW - 0.36,
          h: 0.3,
          fontFace: 'Arial',
          fontSize: 8.5,
          bold: true,
          color: COLORS.secondaryText,
        });
        slide.addText(kpi.compactValue, {
          x: x + 0.18,
          y: y + 0.5,
          w: cardW - 0.36,
          h: 0.5,
          fontFace: 'Arial',
          fontSize: 22,
          bold: true,
          color: COLORS.charcoal,
          shrinkText: true,
          wrap: false,
          margin: 0,
        });
        slide.addText(`Exact: ${kpi.exactValue}`, {
          x: x + 0.18,
          y: y + 1.05,
          w: cardW - 0.36,
          h: 0.26,
          fontFace: 'Arial',
          fontSize: 10,
          color: COLORS.charcoal,
          shrinkText: true,
          margin: 0,
        });
        slide.addText(`${kpi.subtext} · ${kpi.provenance}`, {
          x: x + 0.18,
          y: y + 1.34,
          w: cardW - 0.36,
          h: 0.42,
          fontFace: 'Arial',
          fontSize: 9,
          color: COLORS.grey,
          shrinkText: true,
          wrap: true,
          margin: 0,
        });
      });

      if (s.calloutNote) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.55,
          y: 5.75,
          w: 12.23,
          h: 0.95,
          fill: { color: COLORS.bgLight },
          line: { color: COLORS.border, width: 1 },
        });
        slide.addText(s.calloutNote, {
          x: 0.78,
          y: 5.88,
          w: 11.75,
          h: 0.7,
          fontFace: 'Arial',
          fontSize: 9.5,
          color: COLORS.charcoal,
        });
      }
      continue;
    }

    // Content slides with Chart + Table, Waterfall Shapes + Table, Table-only, or Bullets
    if (s.chart && s.table) {
      const chartBox = { x: 0.5, y: 1.08, w: 6.15, h: 4.95 };
      const tableBox = { x: 6.8, y: 1.08, w: 6.0, h: 4.95 };

      if (s.chart.kind === 'waterfall' && s.chart.waterfallSteps?.length) {
        addWaterfallShapes(pptx, slide, s.chart, chartBox, model.currency);
      } else {
        addNativeChart(pptx, slide, s.chart, chartBox);
      }

      addStyledTable(slide, s.table.headers, s.table.rows, s.table.numericColumnIndices, tableBox);

      const noteText = [s.calloutNote, s.chart.chartLimitationNote].filter(Boolean).join('  |  ');
      if (noteText) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.55,
          y: 6.18,
          w: 12.23,
          h: 0.68,
          fill: { color: COLORS.bgLight },
          line: { color: COLORS.border, width: 0.75 },
        });
        slide.addText(noteText, {
          x: 0.75,
          y: 6.25,
          w: 11.83,
          h: 0.54,
          fontFace: 'Arial',
          fontSize: 8.5,
          color: COLORS.secondaryText,
        });
      }
      continue;
    }

    if (s.table) {
      let tableTop = 1.18;
      if (s.kpis?.length) {
        const w = 3.85;
        s.kpis.slice(0, 3).forEach((k, i) => {
          const x = 0.55 + i * (w + 0.34);
          slide.addShape(pptx.ShapeType.rect, {
            x,
            y: 1.12,
            w,
            h: 0.92,
            fill: { color: COLORS.bgLight },
            line: { color: COLORS.border, width: 0.75 },
          });
          slide.addText(`${k.label}: ${k.exactValue}`, {
            x: x + 0.14,
            y: 1.2,
            w: w - 0.28,
            h: 0.36,
            fontFace: 'Arial',
            fontSize: 10.5,
            bold: true,
            color: COLORS.charcoal,
          });
          slide.addText(`${k.subtext} · ${k.provenance}`, {
            x: x + 0.14,
            y: 1.6,
            w: w - 0.28,
            h: 0.3,
            fontFace: 'Arial',
            fontSize: 8.5,
            color: COLORS.secondaryText,
          });
        });
        tableTop = 2.22;
      }

      const tableBottom = s.calloutNote ? 6.15 : 6.9;
      addStyledTable(slide, s.table.headers, s.table.rows, s.table.numericColumnIndices, {
        x: 0.5,
        y: tableTop,
        w: 12.33,
        h: Math.max(1.2, tableBottom - tableTop),
      });

      if (s.calloutNote) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.55,
          y: 6.25,
          w: 12.23,
          h: 0.62,
          fill: { color: COLORS.bgLight },
          line: { color: COLORS.border, width: 0.75 },
        });
        slide.addText(s.calloutNote, {
          x: 0.75,
          y: 6.32,
          w: 11.83,
          h: 0.48,
          fontFace: 'Arial',
          fontSize: 9,
          color: COLORS.charcoal,
        });
      }
      continue;
    }

    if (s.bullets?.length) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.55,
        y: 1.22,
        w: 12.23,
        h: 4.85,
        fill: { color: COLORS.bgLight },
        line: { color: COLORS.border, width: 1 },
      });
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        {
          x: 0.85,
          y: 1.42,
          w: 11.63,
          h: 4.45,
          fontFace: 'Arial',
          fontSize: 13,
          color: COLORS.charcoal,
          paraSpaceAfter: 6,
          shrinkText: true,
          wrap: true,
        }
      );

      if (s.calloutNote) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.55,
          y: 6.22,
          w: 12.23,
          h: 0.65,
          fill: { color: COLORS.white },
          line: { color: COLORS.red, width: 0.75 },
        });
        slide.addText(s.calloutNote, {
          x: 0.75,
          y: 6.3,
          w: 11.83,
          h: 0.5,
          fontFace: 'Arial',
          fontSize: 9,
          color: COLORS.secondaryText,
        });
      }
    }
  }

  const rawOutput = await pptx.write({ outputType: 'uint8array' });
  const bytes =
    rawOutput instanceof Uint8Array
      ? rawOutput
      : new Uint8Array(rawOutput as ArrayBuffer);

  return {
    ok: true,
    fileName: buildReportFileName(model.config.title, model.config.reportingPeriod, 'pptx'),
    slideCount: model.slides.length,
    byteSize: bytes.byteLength,
    bytes,
  };
}

export function triggerBrowserFileDownload(
  bytes: Uint8Array | string,
  fileName: string,
  mimeType: string
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const blobPart: BlobPart =
    typeof bytes === 'string'
      ? bytes
      : new Uint8Array(bytes).buffer;
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}
