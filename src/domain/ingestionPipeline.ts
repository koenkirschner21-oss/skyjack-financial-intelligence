import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  CUSTOMS_ENTRIES,
  PARTIAL_LEDGER_TRANSACTIONS,
} from '../data/caseSeed';
import {
  BusinessRuleConfig,
  ColumnMappingEntry,
  ImportBatch,
  ImportSchemaType,
  RecordValidationOutcome,
  RegionId,
  RuleSeverity,
  StagedRecordItem,
  StagedRuleViolation,
  UploadedCustomsRecord,
  UploadedLedgerTransaction,
} from '../types/domain';
import {
  calculateExpectedBrokerFeeCad,
  formatCad,
  fromMinorCents,
  toMinorCents,
} from './rulesEngine';

export const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_UPLOAD_ROWS = 2500;

export interface SchemaFieldSpec {
  field: string;
  label: string;
  required: boolean;
  convention: string;
  aliases: string[];
}

export const LEDGER_SCHEMA_FIELDS: SchemaFieldSpec[] = [
  { field: 'transaction_id', label: 'Transaction ID', required: true, convention: 'Unique stable ID (e.g., TX-2026-001)', aliases: ['transactionid', 'txnid', 'transid', 'id', 'recordid', 'txid'] },
  { field: 'posting_date', label: 'Posting Date', required: true, convention: 'YYYY-MM-DD', aliases: ['postingdate', 'postdate', 'txndate', 'transactiondate'] },
  { field: 'accounting_period', label: 'Accounting Period', required: true, convention: 'Q1..Q4 YYYY (e.g., Q3 2026)', aliases: ['accountingperiod', 'period', 'quarter', 'fiscalquarter'] },
  { field: 'region', label: 'Region', required: true, convention: 'North America, Europe, South America, Australia and New Zealand, Asia, Corporate', aliases: ['region', 'regionname', 'territory'] },
  { field: 'plant', label: 'Plant / Entity', required: false, convention: 'Plant 1, Plant 2, Corporate', aliases: ['plant', 'facility', 'site', 'location'] },
  { field: 'department', label: 'Department', required: true, convention: 'Operations, Logistics, Procurement, Finance, Sales, Customs and Trade', aliases: ['department', 'dept', 'costcenter'] },
  { field: 'gl_account', label: 'GL Account', required: true, convention: 'Account code (e.g., GL 5110)', aliases: ['glaccount', 'account', 'accountcode', 'glcode', 'ledgeraccount'] },
  { field: 'expense_category', label: 'Expense Category', required: false, convention: 'Direct Materials, Freight Out, Scrap Write-Off, etc.', aliases: ['expensecategory', 'category', 'costcategory', 'expensetype'] },
  { field: 'description', label: 'Description', required: false, convention: 'Plain text transaction description', aliases: ['description', 'memo', 'narrative', 'details', 'item'] },
  { field: 'amount_cad', label: 'Amount (CAD)', required: true, convention: 'Numeric CAD up to 2 decimals (no foreign currency)', aliases: ['amountcad', 'amount', 'txnamount', 'valuecad', 'totalcad'] },
  { field: 'supplier_id', label: 'Supplier ID', required: false, convention: 'Vendor identifier (e.g., SUP-101)', aliases: ['supplierid', 'vendorid', 'supplier', 'vendor'] },
  { field: 'invoice_reference', label: 'Invoice Reference', required: false, convention: 'Vendor invoice number', aliases: ['invoicereference', 'invoiceref', 'invoiceno', 'invoicenumber', 'invoice'] },
  { field: 'approval_reference', label: 'Approval Reference', required: false, convention: 'Approval ID; missing triggers Rule B review', aliases: ['approvalreference', 'approvalref', 'approvalid', 'approvedby', 'approver'] },
  { field: 'prepared_by', label: 'Prepared By', required: false, convention: 'Preparer name or user code', aliases: ['preparedby', 'preparer', 'originator', 'enteredby'] },
  { field: 'supporting_reference', label: 'Supporting Reference', required: false, convention: 'PO, BOL, JE, or batch reference', aliases: ['supportingreference', 'supportingref', 'poreference', 'journalref', 'docref'] },
];

export const CUSTOMS_SCHEMA_FIELDS: SchemaFieldSpec[] = [
  { field: 'entry_id', label: 'Entry ID', required: true, convention: 'Unique customs entry ID (e.g., E-2026-01)', aliases: ['entryid', 'customsentryid', 'entryno', 'entrynumber'] },
  { field: 'shipment_date', label: 'Shipment Date', required: true, convention: 'YYYY-MM-DD', aliases: ['shipmentdate', 'shipdate', 'entrydate', 'clearanceDate'] },
  { field: 'accounting_period', label: 'Accounting Period', required: true, convention: 'Q1..Q4 YYYY (e.g., Q3 2026)', aliases: ['accountingperiod', 'period', 'quarter'] },
  { field: 'origin_country', label: 'Origin Country', required: true, convention: 'Country name (e.g., China, Germany, Mexico)', aliases: ['origincountry', 'origin', 'countryoforigin'] },
  { field: 'destination', label: 'Destination', required: true, convention: 'Destination city/hub (e.g., Guelph)', aliases: ['destination', 'dest', 'deliverycity'] },
  { field: 'goods_description', label: 'Goods Description', required: true, convention: 'Item description (e.g., Electric motors)', aliases: ['goodsdescription', 'goods', 'commodity', 'productdescription'] },
  { field: 'hs_code', label: 'HS Code', required: false, convention: '4-10 digit tariff classification', aliases: ['hscode', 'hs', 'tariffcode'] },
  { field: 'goods_value_cad', label: 'Goods Value (CAD)', required: true, convention: 'Numeric CAD declared customs value', aliases: ['goodsvaluecad', 'goodsvalue', 'declaredvalue', 'customsvalue'] },
  { field: 'base_duty_rate', label: 'Base Duty Rate (%)', required: false, convention: 'Percentage 0-100 (e.g., 3.5 for 3.5%)', aliases: ['basedutyrate', 'mfnrate', 'dutyrate', 'normalrate'] },
  { field: 'additional_tariff_rate', label: 'Additional Tariff Rate (%)', required: false, convention: 'Percentage 0-500 (e.g., 25 for 25%)', aliases: ['additionaltariffrate', 'extratariffrate', 'tariffrate', 'surtaxrate'] },
  { field: 'actual_duty_cad', label: 'Actual Duty & Tariff (CAD)', required: true, convention: 'Numeric CAD total duty & tariff paid', aliases: ['actualdutycad', 'actualduty', 'totaldutycad', 'dutypaid'] },
  { field: 'actual_broker_fee_cad', label: 'Actual Broker Fee (CAD)', required: true, convention: 'Numeric CAD billed broker fee (checked vs 0.2%)', aliases: ['actualbrokerfeecad', 'brokerfee', 'actualbrokerfee', 'brokeragefee'] },
  { field: 'trade_agreement', label: 'Trade Agreement', required: false, convention: 'CUSMA, CPTPP, None', aliases: ['tradeagreement', 'agreement', 'fta', 'preferenceprogram'] },
  { field: 'origin_certificate_reference', label: 'Origin Certificate Ref', required: false, convention: 'Certificate ID if on file', aliases: ['origincertificatereference', 'origincertref', 'cooref', 'certificatereference'] },
  { field: 'approval_reference', label: 'Approval Reference', required: false, convention: 'Approval ID; missing triggers Rule B review', aliases: ['approvalreference', 'approvalref', 'approvalid'] },
  { field: 'shipment_reference', label: 'Shipment Reference', required: false, convention: 'BOL / Waybill / ERP shipment ref', aliases: ['shipmentreference', 'shipmentref', 'bol', 'waybill'] },
];

export interface ParsedFilePayload {
  ok: boolean;
  fileName: string;
  fileSizeBytes: number;
  fileType: 'csv' | 'xlsx' | 'unsupported';
  availableWorksheets: string[];
  selectedWorksheet?: string;
  headers: string[];
  rawRows: Record<string, string>[];
  errors: string[];
}

function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function sanitizeDisplayString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * Mitigates CSV/Excel formula injection when exporting untrusted values.
 */
export function sanitizeSpreadsheetCell(val: unknown): string {
  const s = sanitizeDisplayString(val);
  if (!s) return '';
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

export function exportSafeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const safeRows = rows.map((row) =>
    headers.map((h) => sanitizeSpreadsheetCell(row[h] ?? ''))
  );
  return Papa.unparse({
    fields: headers.map((h) => sanitizeSpreadsheetCell(h)),
    data: safeRows,
  });
}

/**
 * Step 1: Parse uploaded CSV or XLSX bytes strictly without executing formulas, scripts, or macros.
 */
export function parseUploadedFileBytes(params: {
  fileName: string;
  fileSizeBytes: number;
  bytes: ArrayBuffer | Uint8Array;
  requestedWorksheet?: string;
}): ParsedFilePayload {
  const { fileName, fileSizeBytes, bytes, requestedWorksheet } = params;
  const lower = fileName.toLowerCase().trim();
  const isCsv = lower.endsWith('.csv');
  const isXlsx = lower.endsWith('.xlsx');

  if (!isCsv && !isXlsx) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType: 'unsupported',
      availableWorksheets: [],
      headers: [],
      rawRows: [],
      errors: [
        `Unsupported file format for "${fileName}". Only .csv and .xlsx spreadsheets are permitted (macros such as .xlsm are blocked).`,
      ],
    };
  }

  if (fileSizeBytes <= 0) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType: isCsv ? 'csv' : 'xlsx',
      availableWorksheets: [],
      headers: [],
      rawRows: [],
      errors: [`File "${fileName}" is empty (0 bytes).`],
    };
  }

  if (fileSizeBytes > MAX_UPLOAD_FILE_BYTES) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType: isCsv ? 'csv' : 'xlsx',
      availableWorksheets: [],
      headers: [],
      rawRows: [],
      errors: [
        `File "${fileName}" (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the 5.0 MB demonstration limit.`,
      ],
    };
  }

  if (isCsv) {
    const decoder = new TextDecoder('utf-8');
    const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const text = decoder.decode(uint8);
    if (!text.trim()) {
      return {
        ok: false,
        fileName,
        fileSizeBytes,
        fileType: 'csv',
        availableWorksheets: [],
        headers: [],
        rawRows: [],
        errors: ['CSV file contains no readable content.'],
      };
    }

    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: 'greedy',
    });

    if (parsed.errors.length > 0) {
      const fatal = parsed.errors.filter((e) => e.type === 'Quotes' || e.type === 'Delimiter');
      if (fatal.length > 0 && parsed.data.length === 0) {
        return {
          ok: false,
          fileName,
          fileSizeBytes,
          fileType: 'csv',
          availableWorksheets: [],
          headers: [],
          rawRows: [],
          errors: fatal.map((e) => `CSV syntax error on row ${(e.row ?? 0) + 1}: ${e.message}`),
        };
      }
    }

    const matrix = parsed.data;
    if (matrix.length < 2) {
      return {
        ok: false,
        fileName,
        fileSizeBytes,
        fileType: 'csv',
        availableWorksheets: [],
        headers: matrix[0]?.map(sanitizeDisplayString) ?? [],
        rawRows: [],
        errors: ['CSV file must contain a header row and at least one data row.'],
      };
    }

    return buildRowsFromMatrix({
      fileName,
      fileSizeBytes,
      fileType: 'csv',
      availableWorksheets: [],
      matrix,
    });
  }

  // XLSX parsing with formulas/HTML/styles disabled
  try {
    const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const workbook = XLSX.read(uint8, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
    });

    const availableWorksheets = workbook.SheetNames ?? [];
    if (availableWorksheets.length === 0) {
      return {
        ok: false,
        fileName,
        fileSizeBytes,
        fileType: 'xlsx',
        availableWorksheets: [],
        headers: [],
        rawRows: [],
        errors: ['XLSX workbook contains no worksheets.'],
      };
    }

    const selectedWorksheet =
      requestedWorksheet && availableWorksheets.includes(requestedWorksheet)
        ? requestedWorksheet
        : availableWorksheets[0];

    const sheet = workbook.Sheets[selectedWorksheet];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    if (matrix.length < 2) {
      return {
        ok: false,
        fileName,
        fileSizeBytes,
        fileType: 'xlsx',
        availableWorksheets,
        selectedWorksheet,
        headers: (matrix[0] ?? []).map(sanitizeDisplayString),
        rawRows: [],
        errors: [`Worksheet "${selectedWorksheet}" has no data rows beneath the header.`],
      };
    }

    return buildRowsFromMatrix({
      fileName,
      fileSizeBytes,
      fileType: 'xlsx',
      availableWorksheets,
      selectedWorksheet,
      matrix,
    });
  } catch (err) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType: 'xlsx',
      availableWorksheets: [],
      headers: [],
      rawRows: [],
      errors: [
        `Malformed XLSX workbook: ${err instanceof Error ? err.message : 'Unable to decode Excel archive.'}`,
      ],
    };
  }
}

function buildRowsFromMatrix(params: {
  fileName: string;
  fileSizeBytes: number;
  fileType: 'csv' | 'xlsx';
  availableWorksheets: string[];
  selectedWorksheet?: string;
  matrix: unknown[][];
}): ParsedFilePayload {
  const { fileName, fileSizeBytes, fileType, availableWorksheets, selectedWorksheet, matrix } = params;

  const rawHeaders = (matrix[0] ?? []).map((cell, i) => {
    const cleaned = sanitizeDisplayString(cell);
    return cleaned || `column_${i + 1}`;
  });

  if (rawHeaders.every((h) => h.startsWith('column_'))) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType,
      availableWorksheets,
      selectedWorksheet,
      headers: [],
      rawRows: [],
      errors: ['First row contains no valid column headers.'],
    };
  }

  const dataRows = matrix.slice(1).filter((r) => r.some((cell) => sanitizeDisplayString(cell) !== ''));
  if (dataRows.length === 0) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType,
      availableWorksheets,
      selectedWorksheet,
      headers: rawHeaders,
      rawRows: [],
      errors: ['No non-empty data rows found below headers.'],
    };
  }

  if (dataRows.length > MAX_UPLOAD_ROWS) {
    return {
      ok: false,
      fileName,
      fileSizeBytes,
      fileType,
      availableWorksheets,
      selectedWorksheet,
      headers: rawHeaders,
      rawRows: [],
      errors: [
        `Uploaded file contains ${dataRows.length.toLocaleString()} rows, exceeding the ${MAX_UPLOAD_ROWS.toLocaleString()}-row safety limit.`,
      ],
    };
  }

  const rawRows: Record<string, string>[] = dataRows.map((rowArr) => {
    const obj: Record<string, string> = {};
    rawHeaders.forEach((header, idx) => {
      obj[header] = sanitizeDisplayString(rowArr[idx]);
    });
    return obj;
  });

  return {
    ok: true,
    fileName,
    fileSizeBytes,
    fileType,
    availableWorksheets,
    selectedWorksheet,
    headers: rawHeaders,
    rawRows,
    errors: [],
  };
}

/**
 * Step 2: Deterministic Document Classification & Header Mapping
 */
export function inspectSchemaAndMappings(
  headers: string[],
  mappingOverrides?: Record<string, string>
): {
  schemaType: ImportSchemaType;
  classificationReason: string;
  columnMappings: ColumnMappingEntry[];
  hasAmbiguousMappings: boolean;
  missingRequiredFields: string[];
} {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeaderKey(h) }));

  const scoreSchema = (specs: SchemaFieldSpec[]) => {
    let exactOrAliasHits = 0;
    let coreHits = 0;
    for (const h of normHeaders) {
      const override = mappingOverrides?.[h.raw];
      if (override && specs.some((s) => s.field === override)) {
        exactOrAliasHits += 1;
        if (specs.find((s) => s.field === override)?.required) coreHits += 1;
        continue;
      }
      const match = specs.find(
        (s) => normalizeHeaderKey(s.field) === h.norm || s.aliases.includes(h.norm)
      );
      if (match) {
        exactOrAliasHits += 1;
        if (match.required) coreHits += 1;
      }
    }
    return { exactOrAliasHits, coreHits };
  };

  const ledgerScore = scoreSchema(LEDGER_SCHEMA_FIELDS);
  const customsScore = scoreSchema(CUSTOMS_SCHEMA_FIELDS);

  const hasTransactionId = normHeaders.some(
    (h) =>
      mappingOverrides?.[h.raw] === 'transaction_id' ||
      h.norm === 'transactionid' ||
      h.norm === 'txnid' ||
      h.norm === 'transid'
  );
  const hasEntryId = normHeaders.some(
    (h) =>
      mappingOverrides?.[h.raw] === 'entry_id' ||
      h.norm === 'entryid' ||
      h.norm === 'customsentryid'
  );

  // Pick candidate schema deterministically from actual headers
  let targetSpecs: SchemaFieldSpec[] | null = null;
  let candidateType: 'ledger_transactions' | 'customs_shipments' | null = null;

  if (customsScore.exactOrAliasHits > ledgerScore.exactOrAliasHits || (hasEntryId && customsScore.coreHits >= 2)) {
    targetSpecs = CUSTOMS_SCHEMA_FIELDS;
    candidateType = 'customs_shipments';
  } else if (ledgerScore.exactOrAliasHits >= 2 || hasTransactionId) {
    targetSpecs = LEDGER_SCHEMA_FIELDS;
    candidateType = 'ledger_transactions';
  }

  // Build mapping table
  const ambiguousKeywords: Record<string, string[]> = {
    date: ['posting_date', 'shipment_date'],
    reference: ['invoice_reference', 'approval_reference', 'supporting_reference', 'shipment_reference'],
    ref: ['invoice_reference', 'approval_reference', 'supporting_reference', 'shipment_reference'],
    value: ['amount_cad', 'goods_value_cad'],
    rate: ['base_duty_rate', 'additional_tariff_rate'],
  };

  const columnMappings: ColumnMappingEntry[] = headers.map((header) => {
    const override = mappingOverrides?.[header];
    if (override) {
      return {
        sourceHeader: header,
        targetField: override === '__ignore__' ? null : override,
        confidence: 'exact',
      };
    }

    const norm = normalizeHeaderKey(header);
    const activeSpecs = targetSpecs ?? [...LEDGER_SCHEMA_FIELDS, ...CUSTOMS_SCHEMA_FIELDS];

    const exact = activeSpecs.find((s) => normalizeHeaderKey(s.field) === norm);
    if (exact) {
      return { sourceHeader: header, targetField: exact.field, confidence: 'exact' };
    }

    const alias = activeSpecs.find((s) => s.aliases.includes(norm));
    if (alias) {
      return { sourceHeader: header, targetField: alias.field, confidence: 'alias' };
    }

    if (ambiguousKeywords[norm]) {
      return {
        sourceHeader: header,
        targetField: null,
        confidence: 'ambiguous',
        candidateFields: ambiguousKeywords[norm],
      };
    }

    return { sourceHeader: header, targetField: null, confidence: 'unmapped' };
  });

  const hasAmbiguousMappings = columnMappings.some((m) => m.confidence === 'ambiguous');

  if (!targetSpecs || !candidateType) {
    return {
      schemaType: 'unsupported',
      classificationReason:
        'Headers do not match SKYJACK Ledger Transaction or Customs & Shipment schemas. File classified as unsupported / irrelevant and blocked from entering trusted reporting.',
      columnMappings,
      hasAmbiguousMappings: false,
      missingRequiredFields: [],
    };
  }

  const mappedFields = new Set(columnMappings.map((m) => m.targetField).filter(Boolean) as string[]);
  const missingRequiredFields = targetSpecs
    .filter((s) => s.required && !mappedFields.has(s.field))
    .map((s) => s.field);

  // If missing critical identifiers/amounts or unconfirmed ambiguous core mappings -> incomplete
  const coreLedgerOk =
    candidateType === 'ledger_transactions' &&
    mappedFields.has('transaction_id') &&
    mappedFields.has('amount_cad') &&
    missingRequiredFields.length <= 2;

  const coreCustomsOk =
    candidateType === 'customs_shipments' &&
    mappedFields.has('entry_id') &&
    mappedFields.has('goods_value_cad') &&
    missingRequiredFields.length <= 2;

  if (missingRequiredFields.length > 0 && !coreLedgerOk && !coreCustomsOk) {
    return {
      schemaType: 'incomplete',
      classificationReason: `Potentially relevant ${candidateType === 'ledger_transactions' ? 'Ledger' : 'Customs'} headers detected, but required fields are missing or unconfirmed (${missingRequiredFields.join(', ')}).`,
      columnMappings,
      hasAmbiguousMappings,
      missingRequiredFields,
    };
  }

  return {
    schemaType: candidateType,
    classificationReason:
      candidateType === 'ledger_transactions'
        ? `Classified deterministically as Ledger Transactions (${ledgerScore.exactOrAliasHits} schema columns matched).`
        : `Classified deterministically as Customs & Shipment Records (${customsScore.exactOrAliasHits} schema columns matched).`,
    columnMappings,
    hasAmbiguousMappings,
    missingRequiredFields,
  };
}

function parseCadCurrencyStrict(rawValue: string): { ok: true; value: number; cents: number } | { ok: false; error: string } {
  const s = rawValue.trim();
  if (!s) {
    return { ok: false, error: 'Missing required numeric CAD amount.' };
  }
  if (/\b(USD|EUR|GBP|JPY|MXN|CNY|AUD)\b/i.test(s)) {
    return { ok: false, error: `Unsupported foreign currency indicator in "${s}". Only CAD values are permitted.` };
  }
  const stripped = s.replace(/CAD|\$|,|\s/gi, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(stripped)) {
    return { ok: false, error: `Invalid numeric CAD amount "${s}" (expected up to 2 decimal places).` };
  }
  const num = Number(stripped);
  if (!Number.isFinite(num)) {
    return { ok: false, error: `Non-finite numeric value "${s}".` };
  }
  const cents = toMinorCents(num);
  return { ok: true, value: fromMinorCents(cents), cents };
}

function parsePercentStrict(rawValue: string, maxRate: number): { ok: true; value: number } | { ok: false; error: string } {
  const s = rawValue.trim();
  if (!s) return { ok: true, value: 0 };
  const stripped = s.replace(/%|\s/g, '');
  if (!/^\d+(\.\d{1,4})?$/.test(stripped)) {
    return { ok: false, error: `Invalid percentage rate "${s}".` };
  }
  const num = Number(stripped);
  if (!Number.isFinite(num) || num < 0 || num > maxRate) {
    return { ok: false, error: `Rate ${num}% outside supported range (0%–${maxRate}%).` };
  }
  return { ok: true, value: num };
}

function parseIsoDateStrict(rawValue: string): { ok: true; isoDate: string } | { ok: false; error: string } {
  const s = rawValue.trim();
  if (!s) return { ok: false, error: 'Missing required date.' };
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      return { ok: true, isoDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    }
  }
  const slashUs = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (slashUs) {
    const m = Number(slashUs[1]);
    const d = Number(slashUs[2]);
    const yRaw = Number(slashUs[3]);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      return { ok: true, isoDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
    }
  }
  return { ok: false, error: `Invalid calendar date "${s}" (expected YYYY-MM-DD).` };
}

function normalizeAccountingPeriod(rawValue: string): { ok: true; period: string } | { ok: false; error: string } {
  const s = rawValue.trim();
  if (!s) return { ok: false, error: 'Missing required accounting_period.' };
  const qFirst = /^Q([1-4])\s*[-/]?\s*(20\d{2})$/i.exec(s);
  if (qFirst) return { ok: true, period: `Q${qFirst[1]} ${qFirst[2]}` };
  const yFirst = /^(20\d{2})\s*[-/]?\s*Q([1-4])$/i.exec(s);
  if (yFirst) return { ok: true, period: `Q${yFirst[2]} ${yFirst[1]}` };
  return { ok: false, error: `Invalid accounting period "${s}" (expected format e.g. Q3 2026).` };
}

function normalizeRegion(rawRegion: string): { regionId: Exclude<RegionId, 'all'> | null; regionName: string } {
  const norm = rawRegion.trim().toLowerCase();
  if (norm === 'north america' || norm === 'na' || norm === 'canada' || norm === 'usa') {
    return { regionId: 'north_america', regionName: 'North America' };
  }
  if (norm === 'europe' || norm === 'eu') {
    return { regionId: 'europe', regionName: 'Europe' };
  }
  if (norm === 'south america' || norm === 'sa' || norm === 'latam') {
    return { regionId: 'south_america', regionName: 'South America' };
  }
  if (norm === 'australia and new zealand' || norm === 'anz' || norm === 'australia') {
    return { regionId: 'anz', regionName: 'Australia and New Zealand' };
  }
  if (norm === 'asia' || norm === 'apac') {
    return { regionId: 'asia', regionName: 'Asia' };
  }
  if (norm === 'corporate' || norm === 'corp' || norm === 'hq') {
    return { regionId: 'corporate', regionName: 'Corporate' };
  }
  return { regionId: null, regionName: rawRegion.trim() || 'Unspecified' };
}

function normalizeInvoiceBase(invoiceRef: string): string {
  return invoiceRef
    .trim()
    .toUpperCase()
    .replace(/[-_](A|B|C|DUP|COPY|REV\d*|\d)$/i, '');
}

function isMissingApproval(val: string): boolean {
  const s = val.trim().toLowerCase();
  return (
    !s ||
    s === 'none' ||
    s === 'n/a' ||
    s === 'na' ||
    s === 'unknown' ||
    s === 'missing' ||
    s === 'tbd' ||
    s === 'unapproved' ||
    s === '-'
  );
}

const SEVERITY_RANK: Record<RuleSeverity, number> = { high: 3, medium: 2, info: 1 };

export interface RunValidationPipelineParams {
  parsed: ParsedFilePayload;
  uploadedByUserId: string;
  businessRules: BusinessRuleConfig[];
  existingLedgerTransactions: UploadedLedgerTransaction[];
  existingCustomsRecords: UploadedCustomsRecord[];
  mappingOverrides?: Record<string, string>;
}

/**
 * Full 8-step deterministic validation pipeline operating on actual file contents.
 */
export function runIngestionValidationPipeline(params: RunValidationPipelineParams): ImportBatch {
  const {
    parsed,
    uploadedByUserId,
    businessRules,
    existingLedgerTransactions,
    existingCustomsRecords,
    mappingOverrides,
  } = params;

  const nowIso = new Date().toISOString();
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (!parsed.ok) {
    return {
      id: batchId,
      fileName: parsed.fileName,
      fileSizeBytes: parsed.fileSizeBytes,
      fileType: parsed.fileType,
      selectedWorksheet: parsed.selectedWorksheet,
      availableWorksheets: parsed.availableWorksheets,
      targetDomain: 'unsupported',
      schemaType: 'unsupported',
      classificationReason: parsed.errors[0] ?? 'File parsing failed.',
      uploadedByUserId,
      status: 'rejected',
      recordCount: 0,
      validatedCount: 0,
      quarantinedCount: 0,
      rejectedCount: 0,
      acceptedTotalCad: 0,
      affectedPeriods: [],
      affectedDepartments: [],
      affectedRegions: [],
      columnMappings: [],
      records: [],
      fileErrors: parsed.errors,
      createdAtIso: nowIso,
      provenance: 'user_uploaded',
    };
  }

  const inspection = inspectSchemaAndMappings(parsed.headers, mappingOverrides);

  if (inspection.schemaType === 'unsupported' || inspection.schemaType === 'incomplete') {
    return {
      id: batchId,
      fileName: parsed.fileName,
      fileSizeBytes: parsed.fileSizeBytes,
      fileType: parsed.fileType,
      selectedWorksheet: parsed.selectedWorksheet,
      availableWorksheets: parsed.availableWorksheets,
      targetDomain: 'unsupported',
      schemaType: inspection.schemaType,
      classificationReason: inspection.classificationReason,
      uploadedByUserId,
      status: 'rejected',
      recordCount: parsed.rawRows.length,
      validatedCount: 0,
      quarantinedCount: 0,
      rejectedCount: parsed.rawRows.length,
      acceptedTotalCad: 0,
      affectedPeriods: [],
      affectedDepartments: [],
      affectedRegions: [],
      columnMappings: inspection.columnMappings,
      records: [],
      fileErrors: [inspection.classificationReason],
      createdAtIso: nowIso,
      provenance: 'user_uploaded',
    };
  }

  const schemaType = inspection.schemaType;
  const headerToField = new Map<string, string>();
  for (const m of inspection.columnMappings) {
    if (m.targetField) headerToField.set(m.sourceHeader, m.targetField);
  }

  const ruleMap = new Map(businessRules.map((r) => [r.id, r]));
  const costThreshold = ruleMap.get('RULE_01_INDIVIDUAL_COST_SCREEN')?.thresholdValue ?? 250_000;
  const costThresholdEnabled = ruleMap.get('RULE_01_INDIVIDUAL_COST_SCREEN')?.enabled ?? true;
  const approvalRuleEnabled = ruleMap.get('RULE_02_APPROVAL_SCREEN')?.enabled ?? true;
  const brokerPct = ruleMap.get('RULE_04_BROKER_CONTRACT')?.thresholdValue ?? 0.2;
  const brokerRuleEnabled = ruleMap.get('RULE_04_BROKER_CONTRACT')?.enabled ?? true;
  const agreementRuleEnabled = ruleMap.get('RULE_06_TRADE_AGREEMENT_OPPORTUNITY')?.enabled ?? true;
  const domesticRuleEnabled = ruleMap.get('RULE_07_DOMESTIC_SEPARATION')?.enabled ?? true;

  // Map raw rows -> normalized candidate dicts
  const mappedRows = parsed.rawRows.map((raw, idx) => {
    const mapped: Record<string, string> = {};
    for (const [rawCol, val] of Object.entries(raw)) {
      const target = headerToField.get(rawCol);
      if (target) mapped[target] = val;
    }
    return { rowNumber: idx + 2, rawRow: raw, mapped };
  });

  // Cross-record indices for duplicates & potential invoice duplicates
  const seenIds = new Map<string, number>();
  const existingLedgerIds = new Set([
    ...PARTIAL_LEDGER_TRANSACTIONS.map((t) => t.journalOrPostingRef.toUpperCase()),
    ...existingLedgerTransactions.map((t) => t.transactionId.toUpperCase()),
  ]);
  const existingCustomsIds = new Set([
    ...CUSTOMS_ENTRIES.map((e) => e.id.toUpperCase()),
    ...existingCustomsRecords.map((e) => e.entryId.toUpperCase()),
  ]);

  // Build invoice collision map: key = supplier|baseInvoice|amountCents|period
  const invoiceClusterCounts = new Map<string, number[]>();
  const exactInvoiceCounts = new Map<string, number[]>();
  if (schemaType === 'ledger_transactions') {
    mappedRows.forEach(({ rowNumber, mapped }) => {
      const sup = (mapped.supplier_id ?? '').trim().toUpperCase();
      const inv = (mapped.invoice_reference ?? '').trim().toUpperCase();
      const periodRes = normalizeAccountingPeriod(mapped.accounting_period ?? '');
      const amtRes = parseCadCurrencyStrict(mapped.amount_cad ?? '');
      if (inv && sup && periodRes.ok && amtRes.ok) {
        const baseInv = normalizeInvoiceBase(inv);
        const clusterKey = `${sup}::${baseInv}::${amtRes.cents}::${periodRes.period}`;
        invoiceClusterCounts.set(clusterKey, [...(invoiceClusterCounts.get(clusterKey) ?? []), rowNumber]);
        const exactKey = `${sup}::${inv}`;
        exactInvoiceCounts.set(exactKey, [...(exactInvoiceCounts.get(exactKey) ?? []), rowNumber]);
      }
    });
  }

  const existingInvoiceSet = new Set(
    existingLedgerTransactions
      .filter((t) => t.supplierId && t.invoiceReference)
      .map((t) => `${t.supplierId.toUpperCase()}::${normalizeInvoiceBase(t.invoiceReference)}::${toMinorCents(t.amountCad)}::${t.accountingPeriod}`)
  );

  const records: StagedRecordItem[] = mappedRows.map(({ rowNumber, rawRow, mapped }) => {
    const violations: StagedRuleViolation[] = [];
    const rejectionReasons: string[] = [];
    const quarantineReasons: string[] = [];
    const nextSteps: string[] = [];

    if (schemaType === 'ledger_transactions') {
      const txId = (mapped.transaction_id ?? '').trim();
      const dateRes = parseIsoDateStrict(mapped.posting_date ?? '');
      const periodRes = normalizeAccountingPeriod(mapped.accounting_period ?? '');
      const rawRegion = (mapped.region ?? '').trim();
      const regionNorm = normalizeRegion(rawRegion);
      const dept = (mapped.department ?? '').trim();
      const glAccount = (mapped.gl_account ?? '').trim();
      const amtRes = parseCadCurrencyStrict(mapped.amount_cad ?? '');
      const supplierId = (mapped.supplier_id ?? '').trim();
      const invoiceRef = (mapped.invoice_reference ?? '').trim();
      const approvalRef = (mapped.approval_reference ?? '').trim();
      const expenseCategory = (mapped.expense_category ?? '').trim();
      const plant = (mapped.plant ?? 'Corporate').trim() || 'Corporate';
      const description = (mapped.description ?? '').trim();
      const preparedBy = (mapped.prepared_by ?? '').trim();
      const supportingRef = (mapped.supporting_reference ?? '').trim();

      // Step 4: Field-level blocking validations
      if (!txId) rejectionReasons.push('Missing required transaction_id.');
      if (!dateRes.ok) rejectionReasons.push(dateRes.error);
      if (!periodRes.ok) rejectionReasons.push(periodRes.error);
      if (!rawRegion) rejectionReasons.push('Missing required region.');
      if (!dept) rejectionReasons.push('Missing required department.');
      if (!glAccount) rejectionReasons.push('Missing required gl_account.');
      if (!amtRes.ok) rejectionReasons.push(amtRes.error);

      // Step 5: Exact duplicate identifier within batch -> REJECTED
      if (txId) {
        const key = txId.toUpperCase();
        if (seenIds.has(key)) {
          const firstRow = seenIds.get(key)!;
          const msg = `Exact duplicate transaction_id "${txId}" (first appeared on row ${firstRow}).`;
          rejectionReasons.push(msg);
          violations.push({
            ruleCode: 'RULE C',
            ruleTitle: 'Duplicate Identifier Rejection',
            severity: 'high',
            outcomeImpact: 'REJECTED',
            message: msg,
            recommendedAction: 'Assign a distinct transaction_id or remove the duplicate row before re-uploading.',
          });
        } else {
          seenIds.set(key, rowNumber);
        }
      }

      // Check existing repository conflict (idempotency / no silent overwrite)
      let isExistingConflict = false;
      let conflictDetail: string | undefined;
      if (txId && existingLedgerIds.has(txId.toUpperCase())) {
        isExistingConflict = true;
        conflictDetail = `Transaction ID "${txId}" already exists in trusted repository. Repeated imports cannot silently overwrite existing records.`;
        quarantineReasons.push(conflictDetail);
        nextSteps.push('Skip duplicate record or submit a formal amendment request in Approvals.');
      }

      // Region check if unsupported non-empty string
      if (rawRegion && !regionNorm.regionId) {
        const msg = `Unrecognized region "${rawRegion}" outside SKYJACK taxonomy.`;
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'SCHEMA',
          ruleTitle: 'Region Taxonomy Review',
          severity: 'medium',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Confirm commercial region or Corporate allocation mapping.',
        });
      }

      const amountCad = amtRes.ok ? amtRes.value : 0;

      // Rule A: Cost Threshold (>= CAD 250,000)
      if (costThresholdEnabled && amtRes.ok && amountCad >= costThreshold) {
        const msg = `Amount (${formatCad(amountCad)}) meets or exceeds ${formatCad(costThreshold)} review threshold.`;
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE A',
          ruleTitle: 'Cost Threshold Screening',
          severity: amountCad >= 500_000 ? 'high' : 'medium',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Route to Review Queue for supporting evidence and Controller sign-off.',
        });
      }

      // Rule B: Missing Approval Reference
      if (approvalRuleEnabled && isMissingApproval(approvalRef)) {
        const msg = 'Missing or unverified approval_reference.';
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE B',
          ruleTitle: 'Approval Reference Screening',
          severity: 'high',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Attach formal PO/approval documentation in Evidence & Approvals.',
        });
      }

      // Rule C: Potential Duplicate Invoice (suffix -A / matching cluster)
      if (invoiceRef && supplierId && periodRes.ok && amtRes.ok) {
        const baseInv = normalizeInvoiceBase(invoiceRef);
        const clusterKey = `${supplierId.toUpperCase()}::${baseInv}::${amtRes.cents}::${periodRes.period}`;
        const rowsInCluster = invoiceClusterCounts.get(clusterKey) ?? [];
        const hasSuffix = /[-_](A|B|C|DUP|COPY|REV\d*)$/i.test(invoiceRef.trim());
        const exactRows = exactInvoiceCounts.get(`${supplierId.toUpperCase()}::${invoiceRef.toUpperCase()}`) ?? [];

        if (rowsInCluster.length > 1 || exactRows.length > 1 || existingInvoiceSet.has(clusterKey)) {
          const msg = hasSuffix
            ? `Potential duplicate invoice suffix variation ("${invoiceRef}") matching supplier ${supplierId}, amount ${formatCad(amountCad)}, and period ${periodRes.period}.`
            : `Potential duplicate invoice cluster detected for supplier ${supplierId} (${invoiceRef}, ${formatCad(amountCad)}, ${periodRes.period}).`;
          quarantineReasons.push(msg);
          violations.push({
            ruleCode: 'RULE C',
            ruleTitle: 'Duplicate Invoice Detection',
            severity: 'high',
            outcomeImpact: 'QUARANTINED',
            message: msg,
            recommendedAction: 'Verify with Accounts Payable whether "-A" or duplicate invoice represents a distinct shipment or double billing.',
          });
        }
      }

      // Rule D: Unusual Classification (Logistics rush freight coded to SG&A, or Account 2890 suspense)
      const lowerGl = glAccount.toLowerCase();
      const lowerCat = expenseCategory.toLowerCase();
      const lowerDesc = description.toLowerCase();
      const lowerDept = dept.toLowerCase();
      if (
        (lowerDept.includes('logistics') || lowerCat.includes('freight') || lowerDesc.includes('rush freight')) &&
        (lowerGl.includes('sg&a') || lowerGl.includes('sga') || lowerGl.includes('7100'))
      ) {
        const msg = `Unusual classification: Logistics / rush freight expense coded to "${glAccount}" instead of Freight Out.`;
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE D',
          ruleTitle: 'Unusual Classification Screening',
          severity: 'medium',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Verify freight-out vs. SG&A account coding; reclassification may require multi-step approval.',
        });
      }
      if (lowerGl.includes('2890') || lowerCat.includes('suspense') || lowerDesc.includes('suspense')) {
        const msg = `Suspense / unmapped clearing account posting ("${glAccount}") requires clearance before reporting.`;
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE D',
          ruleTitle: 'Suspense Account Screening',
          severity: 'high',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Identify cost center originator and reclassify out of suspense Account 2890.',
        });
      }

      // Rule H: Domestic sales tax misclassified as customs duty
      if (
        domesticRuleEnabled &&
        (lowerCat.includes('sales tax') || lowerCat.includes('gst') || lowerCat.includes('hst') || lowerCat.includes('pst')) &&
        (lowerGl.includes('duty') || lowerGl.includes('customs') || lowerCat.includes('customs'))
      ) {
        const msg = 'Domestic provincial sales tax appears classified under customs duties.';
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE H',
          ruleTitle: 'Domestic Tax Separation',
          severity: 'medium',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Reclassify domestic sales tax out of customs duty expense.',
        });
      }

      const outcome: RecordValidationOutcome =
        rejectionReasons.length > 0
          ? 'REJECTED'
          : quarantineReasons.length > 0
            ? 'QUARANTINED'
            : 'VALIDATED';

      const highestSeverity: RuleSeverity =
        violations.length > 0
          ? violations.reduce(
              (best, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[best] ? v.severity : best),
              violations[0].severity
            )
          : 'info';

      return {
        id: `${batchId}-row-${rowNumber}`,
        batchId,
        rowNumber,
        stableRecordId: txId || `ROW-${rowNumber}`,
        schemaType: 'ledger_transactions',
        rawRow,
        normalizedData: {
          transactionId: txId,
          postingDate: dateRes.ok ? dateRes.isoDate : mapped.posting_date ?? '',
          accountingPeriod: periodRes.ok ? periodRes.period : mapped.accounting_period ?? '',
          regionId: regionNorm.regionId ?? 'corporate',
          regionName: regionNorm.regionName,
          plant,
          department: dept || 'Unspecified',
          glAccount,
          expenseCategory: expenseCategory || 'General',
          description,
          amountCad,
          supplierId,
          invoiceReference: invoiceRef,
          approvalReference: approvalRef,
          preparedBy,
          supportingReference: supportingRef,
        },
        amountCad,
        department: dept || 'Unspecified',
        regionName: regionNorm.regionName,
        accountingPeriod: periodRes.ok ? periodRes.period : 'Invalid',
        outcome,
        highestSeverity,
        ruleResults: violations,
        reasons: [...rejectionReasons, ...quarantineReasons],
        recommendedNextSteps: Array.from(
          new Set([...nextSteps, ...violations.map((v) => v.recommendedAction)])
        ),
        isExistingConflict,
        conflictDetail,
        reviewStatus: outcome === 'QUARANTINED' ? 'Submitted' : outcome === 'VALIDATED' ? 'Approved' : 'Rejected',
        assignedReviewerId:
          dept.toLowerCase().includes('customs') || dept.toLowerCase().includes('logistics')
            ? 'user-marco-silva'
            : 'user-dana-morales',
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
    }

    // CUSTOMS & SHIPMENT RECORDS VALIDATION
    const entryId = (mapped.entry_id ?? '').trim();
    const shipDateRes = parseIsoDateStrict(mapped.shipment_date ?? '');
    const periodRes = normalizeAccountingPeriod(mapped.accounting_period ?? '');
    const originCountry = (mapped.origin_country ?? '').trim();
    const destination = (mapped.destination ?? '').trim();
    const goodsDesc = (mapped.goods_description ?? '').trim();
    const hsCode = (mapped.hs_code ?? '').trim();
    const goodsValRes = parseCadCurrencyStrict(mapped.goods_value_cad ?? '');
    const actualDutyRes = parseCadCurrencyStrict(mapped.actual_duty_cad ?? '');
    const actualBrokerRes = parseCadCurrencyStrict(mapped.actual_broker_fee_cad ?? '');
    const baseRateRes = parsePercentStrict(mapped.base_duty_rate ?? '', 100);
    const addlRateRes = parsePercentStrict(mapped.additional_tariff_rate ?? '', 500);
    const tradeAgreement = (mapped.trade_agreement ?? 'None').trim() || 'None';
    const originCertRef = (mapped.origin_certificate_reference ?? '').trim();
    const approvalRef = (mapped.approval_reference ?? '').trim();
    const shipmentRef = (mapped.shipment_reference ?? '').trim();

    if (!entryId) rejectionReasons.push('Missing required entry_id.');
    if (!shipDateRes.ok) rejectionReasons.push(shipDateRes.error);
    if (!periodRes.ok) rejectionReasons.push(periodRes.error);
    if (!originCountry) rejectionReasons.push('Missing required origin_country.');
    if (!destination) rejectionReasons.push('Missing required destination.');
    if (!goodsDesc) rejectionReasons.push('Missing required goods_description.');
    if (!goodsValRes.ok) rejectionReasons.push(goodsValRes.error);
    if (!actualDutyRes.ok) rejectionReasons.push(actualDutyRes.error);
    if (!actualBrokerRes.ok) rejectionReasons.push(actualBrokerRes.error);
    if (!baseRateRes.ok) rejectionReasons.push(baseRateRes.error);
    if (!addlRateRes.ok) rejectionReasons.push(addlRateRes.error);

    if (entryId) {
      const key = entryId.toUpperCase();
      if (seenIds.has(key)) {
        const firstRow = seenIds.get(key)!;
        const msg = `Exact duplicate entry_id "${entryId}" (first appeared on row ${firstRow}).`;
        rejectionReasons.push(msg);
        violations.push({
          ruleCode: 'RULE C',
          ruleTitle: 'Duplicate Identifier Rejection',
          severity: 'high',
          outcomeImpact: 'REJECTED',
          message: msg,
          recommendedAction: 'Deduplicate entry_id before re-uploading.',
        });
      } else {
        seenIds.set(key, rowNumber);
      }
    }

    let isExistingConflict = false;
    let conflictDetail: string | undefined;
    if (entryId && existingCustomsIds.has(entryId.toUpperCase())) {
      isExistingConflict = true;
      conflictDetail = `Entry ID "${entryId}" already exists in trusted customs repository.`;
      quarantineReasons.push(conflictDetail);
      nextSteps.push('Route conflict through Approvals rather than overwriting existing border history.');
    }

    const goodsVal = goodsValRes.ok ? goodsValRes.value : 0;
    const actualDuty = actualDutyRes.ok ? actualDutyRes.value : 0;
    const actualBroker = actualBrokerRes.ok ? actualBrokerRes.value : 0;
    const baseRate = baseRateRes.ok ? baseRateRes.value : 0;
    const addlRate = addlRateRes.ok ? addlRateRes.value : 0;
    const expectedBroker = calculateExpectedBrokerFeeCad(goodsVal, brokerPct);
    const brokerVariance = fromMinorCents(toMinorCents(actualBroker) - toMinorCents(expectedBroker));

    // Rule E: Broker Contract (0.2%)
    if (brokerRuleEnabled && goodsValRes.ok && actualBrokerRes.ok && brokerVariance !== 0) {
      const msg =
        brokerVariance > 0
          ? `Broker fee overcharged by ${formatCad(brokerVariance)} vs. ${brokerPct}% contract (${formatCad(expectedBroker)}).`
          : `Broker fee undercharged by ${formatCad(Math.abs(brokerVariance))} vs. ${brokerPct}% contract (${formatCad(expectedBroker)}).`;
      quarantineReasons.push(msg);
      violations.push({
        ruleCode: 'RULE E',
        ruleTitle: 'Broker Contract Fee Verification',
        severity: Math.abs(brokerVariance) >= 1000 ? 'high' : 'medium',
        outcomeImpact: 'QUARANTINED',
        message: msg,
        recommendedAction: 'Audit carrier/broker invoice against the 0.2% contractual fee schedule.',
      });
    }

    // Rule F: Duty Consistency (Normal MFN + Additional Tariff vs. Actual Duty)
    if (goodsValRes.ok && actualDutyRes.ok && baseRateRes.ok && addlRateRes.ok) {
      const expectedMfnCents = Math.round((toMinorCents(goodsVal) * baseRate) / 100);
      const expectedAddlCents = Math.round((toMinorCents(goodsVal) * addlRate) / 100);
      const expectedTotalDuty = fromMinorCents(expectedMfnCents + expectedAddlCents);
      const dutyDiff = Math.abs(actualDuty - expectedTotalDuty);
      if (dutyDiff > 1.0) {
        const msg = `Recorded duty (${formatCad(actualDuty)}) differs from deterministic calculation (${formatCad(expectedTotalDuty)}: MFN ${baseRate}% + Addl ${addlRate}%).`;
        quarantineReasons.push(msg);
        violations.push({
          ruleCode: 'RULE F',
          ruleTitle: 'Duty Calculation Consistency',
          severity: 'medium',
          outcomeImpact: 'QUARANTINED',
          message: msg,
          recommendedAction: 'Reconcile customs B3/entry duty breakdown and separate MFN from additional tariffs.',
        });
      }
    }

    // Rule G: Unclaimed FTA Potential OR Unverified Trade Agreement Claim (missing origin certificate ref)
    const ftaOrigins = ['mexico', 'usa', 'united states', 'japan', 'australia'];
    const claimsFta = /cusma|cptpp|usmca|nafta/i.test(tradeAgreement);
    if (
      agreementRuleEnabled &&
      ((ftaOrigins.includes(originCountry.toLowerCase()) &&
        actualDuty > 0 &&
        (tradeAgreement.toLowerCase() === 'none' || !tradeAgreement || originCertRef !== '')) ||
        (claimsFta && !originCertRef))
    ) {
      const msg =
        claimsFta && !originCertRef
          ? `Trade agreement "${tradeAgreement}" claimed on ${originCountry} shipment without an origin_certificate_reference on file.`
          : `Potential trade agreement exemption on ${originCountry} goods (${formatCad(actualDuty)} duty paid; origin cert ref: ${originCertRef || 'not attached'}). Eligibility unconfirmed.`;
      quarantineReasons.push(msg);
      violations.push({
        ruleCode: 'RULE G',
        ruleTitle: 'Trade Agreement Exemption & Origin Verification',
        severity: 'medium',
        outcomeImpact: 'QUARANTINED',
        message: msg,
        recommendedAction: 'Verify formal certificate of origin before confirming CUSMA/CPTPP eligibility.',
      });
    }

    // Rule H: Domestic Tax Separation
    const canadianCities = ['calgary', 'vancouver', 'montreal', 'halifax', 'winnipeg', 'toronto', 'guelph'];
    if (
      domesticRuleEnabled &&
      originCountry.toLowerCase() === 'canada' &&
      canadianCities.some((city) => destination.toLowerCase().includes(city)) &&
      (actualDuty > 0 || /gst|hst|pst|qst|sales tax/i.test(goodsDesc))
    ) {
      const msg = `Interprovincial shipment (${originCountry} → ${destination}) has domestic tax or customs duty recorded (${formatCad(actualDuty)}).`;
      quarantineReasons.push(msg);
      violations.push({
        ruleCode: 'RULE H',
        ruleTitle: 'Domestic Tax & Freight Separation',
        severity: 'high',
        outcomeImpact: 'QUARANTINED',
        message: msg,
        recommendedAction: 'Isolate domestic sales tax/freight outside customs duty accounts (CAD 0 duty on domestic runs).',
      });
    }

    // Rule B: Missing Approval Reference on high-value customs entries or missing ref
    if (approvalRuleEnabled && isMissingApproval(approvalRef)) {
      const msg = 'Missing approval_reference on customs shipment record.';
      quarantineReasons.push(msg);
      violations.push({
        ruleCode: 'RULE B',
        ruleTitle: 'Approval Reference Screening',
        severity: 'medium',
        outcomeImpact: 'QUARANTINED',
        message: msg,
        recommendedAction: 'Provide customs authorization or PO approval reference.',
      });
    }

    const outcome: RecordValidationOutcome =
      rejectionReasons.length > 0
        ? 'REJECTED'
        : quarantineReasons.length > 0
          ? 'QUARANTINED'
          : 'VALIDATED';

    const highestSeverity: RuleSeverity =
      violations.length > 0
        ? violations.reduce(
            (best, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[best] ? v.severity : best),
            violations[0].severity
          )
        : 'info';

    return {
      id: `${batchId}-row-${rowNumber}`,
      batchId,
      rowNumber,
      stableRecordId: entryId || `ROW-${rowNumber}`,
      schemaType: 'customs_shipments',
      rawRow,
      normalizedData: {
        entryId,
        shipmentDate: shipDateRes.ok ? shipDateRes.isoDate : mapped.shipment_date ?? '',
        accountingPeriod: periodRes.ok ? periodRes.period : mapped.accounting_period ?? '',
        originCountry,
        destination,
        goodsDescription: goodsDesc,
        hsCode,
        goodsValueCad: goodsVal,
        baseDutyRatePct: baseRate,
        additionalTariffRatePct: addlRate,
        actualDutyCad: actualDuty,
        actualBrokerFeeCad: actualBroker,
        expectedBrokerFeeCad: expectedBroker,
        brokerVarianceCad: brokerVariance,
        tradeAgreement,
        originCertificateReference: originCertRef,
        approvalReference: approvalRef,
        shipmentReference: shipmentRef,
      },
      amountCad: actualDuty + actualBroker,
      department: 'Customs and Trade',
      regionName: 'North America',
      accountingPeriod: periodRes.ok ? periodRes.period : 'Invalid',
      outcome,
      highestSeverity,
      ruleResults: violations,
      reasons: [...rejectionReasons, ...quarantineReasons],
      recommendedNextSteps: Array.from(
        new Set([...nextSteps, ...violations.map((v) => v.recommendedAction)])
      ),
      isExistingConflict,
      conflictDetail,
      reviewStatus: outcome === 'QUARANTINED' ? 'Submitted' : outcome === 'VALIDATED' ? 'Approved' : 'Rejected',
      assignedReviewerId: 'user-marco-silva',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
  });

  const validatedRecords = records.filter((r) => r.outcome === 'VALIDATED');
  const quarantinedRecords = records.filter((r) => r.outcome === 'QUARANTINED');
  const rejectedRecords = records.filter((r) => r.outcome === 'REJECTED');

  const acceptedTotalCad = fromMinorCents(
    validatedRecords.reduce((sum, r) => sum + toMinorCents(r.amountCad), 0)
  );

  return {
    id: batchId,
    fileName: parsed.fileName,
    fileSizeBytes: parsed.fileSizeBytes,
    fileType: parsed.fileType,
    selectedWorksheet: parsed.selectedWorksheet,
    availableWorksheets: parsed.availableWorksheets,
    targetDomain: schemaType === 'ledger_transactions' ? 'ledger' : 'customs',
    schemaType,
    classificationReason: inspection.classificationReason,
    uploadedByUserId,
    status: 'staged_preview',
    recordCount: records.length,
    validatedCount: validatedRecords.length,
    quarantinedCount: quarantinedRecords.length,
    rejectedCount: rejectedRecords.length,
    acceptedTotalCad,
    affectedPeriods: Array.from(new Set(validatedRecords.map((r) => r.accountingPeriod))).filter(Boolean),
    affectedDepartments: Array.from(new Set(validatedRecords.map((r) => r.department))).filter(Boolean),
    affectedRegions: Array.from(new Set(validatedRecords.map((r) => r.regionName))).filter(Boolean),
    columnMappings: inspection.columnMappings,
    records,
    fileErrors: [],
    createdAtIso: nowIso,
    provenance: 'user_uploaded',
  };
}

export function toUploadedLedgerTransaction(
  item: StagedRecordItem,
  authorizedByUserId: string,
  authorizedAtIso: string
): UploadedLedgerTransaction {
  const d = item.normalizedData;
  return {
    id: `uled-${item.stableRecordId}-${item.batchId.slice(-6)}`,
    batchId: item.batchId,
    transactionId: String(d.transactionId ?? item.stableRecordId),
    postingDate: String(d.postingDate ?? ''),
    accountingPeriod: String(d.accountingPeriod ?? item.accountingPeriod),
    regionId: (String(d.regionId ?? 'corporate') as Exclude<RegionId, 'all'>),
    regionName: String(d.regionName ?? item.regionName),
    plant: String(d.plant ?? 'Corporate'),
    department: String(d.department ?? item.department),
    glAccount: String(d.glAccount ?? ''),
    expenseCategory: String(d.expenseCategory ?? 'General'),
    description: String(d.description ?? ''),
    amountCad: Number(d.amountCad ?? item.amountCad),
    supplierId: String(d.supplierId ?? ''),
    invoiceReference: String(d.invoiceReference ?? ''),
    approvalReference: String(d.approvalReference ?? ''),
    preparedBy: String(d.preparedBy ?? ''),
    supportingReference: String(d.supportingReference ?? ''),
    authorizedByUserId,
    authorizedAtIso,
    provenance: 'user_uploaded',
  };
}

export function toUploadedCustomsRecord(
  item: StagedRecordItem,
  authorizedByUserId: string,
  authorizedAtIso: string
): UploadedCustomsRecord {
  const d = item.normalizedData;
  return {
    id: `ucust-${item.stableRecordId}-${item.batchId.slice(-6)}`,
    batchId: item.batchId,
    entryId: String(d.entryId ?? item.stableRecordId),
    shipmentDate: String(d.shipmentDate ?? ''),
    accountingPeriod: String(d.accountingPeriod ?? item.accountingPeriod),
    originCountry: String(d.originCountry ?? ''),
    destination: String(d.destination ?? ''),
    goodsDescription: String(d.goodsDescription ?? ''),
    hsCode: String(d.hsCode ?? ''),
    goodsValueCad: Number(d.goodsValueCad ?? 0),
    baseDutyRatePct: Number(d.baseDutyRatePct ?? 0),
    additionalTariffRatePct: Number(d.additionalTariffRatePct ?? 0),
    actualDutyCad: Number(d.actualDutyCad ?? 0),
    actualBrokerFeeCad: Number(d.actualBrokerFeeCad ?? 0),
    expectedBrokerFeeCad: Number(d.expectedBrokerFeeCad ?? 0),
    brokerVarianceCad: Number(d.brokerVarianceCad ?? 0),
    tradeAgreement: String(d.tradeAgreement ?? 'None'),
    originCertificateReference: String(d.originCertificateReference ?? ''),
    approvalReference: String(d.approvalReference ?? ''),
    shipmentReference: String(d.shipmentReference ?? ''),
    authorizedByUserId,
    authorizedAtIso,
    provenance: 'user_uploaded',
  };
}

