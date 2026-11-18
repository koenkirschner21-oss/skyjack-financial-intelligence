import { PersistedWorkspaceState } from '../repositories/costIntelligenceRepo';
import {
  buildGroundedContextPacket,
  GroundedContextPacket,
  runDeterministicFallbackQuery,
} from '../domain/groundedQueryService';
import {
  AiExtractedEvidenceClaims,
  AiGatewayAssistResult,
  AiInvestigationBrief,
  AiQuarterEndBriefing,
  AiReportSummaryBlock,
  AskSkyjackCitation,
  AskSkyjackResponse,
  Investigation,
  QuarterEndReadinessSnapshot,
  User,
} from '../types/domain';

export interface AiServiceStatus {
  configured: boolean;
  model: string;
  mode: string;
}

export interface AiFailureResult {
  ok: false;
  errorCode: string;
  userMessage: string;
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function postAiJson<T extends { ok?: boolean; errorCode?: string; userMessage?: string }>(
  url: string,
  body: unknown,
  fallbackUnavailableMsg: string,
  signal?: AbortSignal
): Promise<{ ok: true; data: T } | AiFailureResult> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        signal,
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      let parsed: T | null = null;
      try {
        parsed = rawText ? (JSON.parse(rawText) as T) : null;
      } catch {
        parsed = null;
      }

      if (!parsed) {
        const isProxyWarmupOrGateway =
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504 ||
          rawText.trimStart().startsWith('<');
        if (isProxyWarmupOrGateway && attempt < maxAttempts) {
          await sleepWithAbort(900, signal);
          continue;
        }
        return {
          ok: false,
          errorCode: isProxyWarmupOrGateway ? 'GATEWAY_TIMEOUT' : 'INVALID_SERVER_RESPONSE',
          userMessage: isProxyWarmupOrGateway
            ? 'The preview server returned a temporary gateway or warmup page instead of JSON. Retry in a moment or use Deterministic Non-AI Lookup below.'
            : `Unexpected non-JSON response (HTTP ${res.status}) from ${url}. Use Deterministic Non-AI Lookup below.`,
        };
      }

      if (!res.ok || !parsed.ok) {
        return {
          ok: false,
          errorCode: parsed.errorCode ?? 'MODEL_UNAVAILABLE',
          userMessage: parsed.userMessage ?? fallbackUnavailableMsg,
        };
      }

      return { ok: true, data: parsed };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          ok: false,
          errorCode: 'REQUEST_CANCELLED',
          userMessage: 'Query cancelled before completion.',
        };
      }
      if (attempt < maxAttempts) {
        try {
          await sleepWithAbort(700, signal);
          continue;
        } catch {
          return {
            ok: false,
            errorCode: 'REQUEST_CANCELLED',
            userMessage: 'Query cancelled before completion.',
          };
        }
      }
      return {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        userMessage: 'Unable to reach server AI endpoint. Use Deterministic Non-AI Lookup below.',
      };
    }
  }
  return {
    ok: false,
    errorCode: 'NETWORK_ERROR',
    userMessage: 'Unable to reach server AI endpoint. Use Deterministic Non-AI Lookup below.',
  };
}

export async function fetchAiStatus(): Promise<AiServiceStatus> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/ai/status', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const text = await res.text();
      const parsed = JSON.parse(text) as AiServiceStatus;
      if (res.ok && typeof parsed.configured === 'boolean') {
        return parsed;
      }
      if (attempt === 1) {
        await sleepWithAbort(600);
        continue;
      }
      return { configured: false, model: 'gemini-4-hydrogen', mode: 'server_error' };
    } catch {
      if (attempt === 1) {
        await sleepWithAbort(600);
        continue;
      }
      return { configured: false, model: 'gemini-4-hydrogen', mode: 'unreachable' };
    }
  }
  return { configured: false, model: 'gemini-4-hydrogen', mode: 'unreachable' };
}

/**
 * Validates and enriches raw model output against allowedCitations so post-retrieval
 * permissions and grounding constraints are strictly enforced on the client too.
 */
export function validateAndGroundAskResponse(
  rawModelData: {
    narrative?: string;
    kpiHighlights?: Array<{ label: string; valueFormatted: string; contextNote: string; provenance: string }>;
    tableColumns?: string[];
    tableRows?: string[][];
    investigationSummaries?: Array<{ id: string; title: string; status: string; exposureFormatted: string; note: string }>;
    citedRecordIds?: string[];
    suggestedNextActionLabels?: string[];
    followUpQuestions?: string[];
    dataAvailabilityNote?: string;
  },
  packet: GroundedContextPacket,
  modelName: string
): AskSkyjackResponse | null {
  if (!rawModelData || typeof rawModelData.narrative !== 'string' || !rawModelData.narrative.trim()) {
    return null;
  }

  const allowedById = new Map<string, AskSkyjackCitation>();
  packet.allowedCitations.forEach((c) => allowedById.set(c.recordId.toUpperCase(), c));

  const verifiedCitations: AskSkyjackCitation[] = [];
  for (const id of rawModelData.citedRecordIds ?? []) {
    const match = allowedById.get(String(id).toUpperCase());
    if (match && !verifiedCitations.some((v) => v.recordId === match.recordId)) {
      verifiedCitations.push(match);
    }
  }
  if (verifiedCitations.length === 0) {
    verifiedCitations.push(...packet.allowedCitations.slice(0, 6));
  }

  const nextActions: AskSkyjackResponse['suggestedNextActions'] = [];
  if (packet.invokedTools.includes('searchCustomsEntries')) {
    nextActions.push({ label: 'Open Shipments & Trade', route: '/trade' });
  }
  if (packet.invokedTools.includes('retrieveTariffScenarios')) {
    nextActions.push({ label: 'Open Tariff Simulator', route: '/simulator' });
  }
  if (packet.invokedTools.includes('retrieveInvestigations') || packet.invokedTools.includes('findFinancialRecords')) {
    nextActions.push({ label: 'Open Investigations', route: '/investigations' });
  }
  if (packet.invokedTools.includes('retrieveImportBatchResults')) {
    nextActions.push({ label: 'Open Data Gateway', route: '/data-gateway' });
  }
  if (packet.invokedTools.includes('retrieveApprovalRequests')) {
    nextActions.push({ label: 'Open Approvals', route: '/approvals' });
  }

  const cleanStr = (v: unknown) =>
    String(v ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();

  return {
    ok: true,
    modelName,
    mode: 'gemini_grounded',
    narrative: cleanStr(rawModelData.narrative),
    kpiHighlights: Array.isArray(rawModelData.kpiHighlights)
      ? rawModelData.kpiHighlights.slice(0, 4).map((k) => ({
          label: cleanStr(k.label),
          valueFormatted: cleanStr(k.valueFormatted),
          contextNote: cleanStr(k.contextNote),
          provenance: cleanStr(k.provenance),
        }))
      : [],
    tableColumns: Array.isArray(rawModelData.tableColumns)
      ? rawModelData.tableColumns.slice(0, 6).map(cleanStr)
      : [],
    tableRows: Array.isArray(rawModelData.tableRows)
      ? rawModelData.tableRows.slice(0, 12).map((row) => (Array.isArray(row) ? row.map(cleanStr) : []))
      : [],
    suggestedChart: packet.deterministicChartCandidate,
    investigationSummaries: Array.isArray(rawModelData.investigationSummaries)
      ? rawModelData.investigationSummaries.slice(0, 6)
      : [],
    suggestedNextActions: nextActions.slice(0, 3),
    sourceCitations: verifiedCitations,
    followUpQuestions: Array.isArray(rawModelData.followUpQuestions)
      ? rawModelData.followUpQuestions.slice(0, 2).map(cleanStr)
      : [],
    dataAvailabilityNote: rawModelData.dataAvailabilityNote ? cleanStr(rawModelData.dataAvailabilityNote) : undefined,
    groundingBoundaryNote: '',
  };
}

export async function executeAskSkyjackQuery(params: {
  question: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; text: string }>;
  state: PersistedWorkspaceState;
  user: User;
  signal?: AbortSignal;
}): Promise<AskSkyjackResponse | AiFailureResult> {
  const { question, conversationHistory, state, user, signal } = params;
  const packet = buildGroundedContextPacket(question, state, user);

  const apiRes = await postAiJson<{
    ok?: boolean;
    modelName?: string;
    errorCode?: string;
    userMessage?: string;
    data?: Parameters<typeof validateAndGroundAskResponse>[0];
  }>(
    '/api/ai/ask',
    {
      question,
      conversationHistory,
      groundedContext: {
        userRole: packet.userRole,
        userTitle: packet.userTitle,
        activeQuarter: packet.activeQuarter,
        activeRegion: packet.activeRegion,
        reportingCurrency: packet.reportingCurrency,
        fxNote: packet.fxNote,
        invokedTools: packet.invokedTools,
        permissionRestrictions: packet.permissionRestrictions,
        unavailableDataRequested: packet.unavailableDataRequested,
        officialCaseFacts: packet.officialCaseFacts,
        authorizedUploadsFacts: packet.authorizedUploadsFacts,
        quarantinedReviewContext: packet.quarantinedReviewContext,
        hypotheticalScenarioFacts: packet.hypotheticalScenarioFacts,
      },
    },
    'AI service unavailable. Deterministic fallback remains accessible.',
    signal
  );

  if (!apiRes.ok) {
    return apiRes as AiFailureResult;
  }

  const validated = validateAndGroundAskResponse(
    apiRes.data.data ?? {},
    packet,
    apiRes.data.modelName ?? 'gemini-4-hydrogen'
  );
  if (!validated) {
    return {
      ok: false,
      errorCode: 'INVALID_MODEL_RESPONSE',
      userMessage: 'AI response failed schema grounding check. Use Deterministic Fallback below.',
    };
  }
  return validated;
}

export function executeDeterministicAskFallback(
  question: string,
  state: PersistedWorkspaceState,
  user: User
): AskSkyjackResponse {
  return runDeterministicFallbackQuery(question, state, user);
}

export async function requestAiInvestigationBrief(params: {
  investigation: Investigation;
  sourceRecord: unknown;
  ruleSummaries: string[];
  evidenceItems: Array<{ title: string; status: string; summary: string }>;
  missingLinks: string[];
  approvalSummaries: Array<{ title: string; workflowStatus: string; amountCad: number }>;
}): Promise<{ ok: true; brief: AiInvestigationBrief } | AiFailureResult> {
  const apiRes = await postAiJson<{
    ok?: boolean;
    errorCode?: string;
    userMessage?: string;
    brief?: AiInvestigationBrief;
  }>('/api/ai/investigate', { investigationBundle: params }, 'AI analysis is currently unavailable.');
  if (!apiRes.ok) return apiRes as AiFailureResult;
  if (!apiRes.data.brief) {
    return { ok: false, errorCode: 'INVALID_MODEL_RESPONSE', userMessage: 'AI analysis payload missing.' };
  }
  return { ok: true, brief: apiRes.data.brief };
}

export async function requestAiQuarterEndBriefing(
  readinessSnapshot: QuarterEndReadinessSnapshot
): Promise<{ ok: true; briefing: AiQuarterEndBriefing } | AiFailureResult> {
  const apiRes = await postAiJson<{
    ok?: boolean;
    errorCode?: string;
    userMessage?: string;
    briefing?: AiQuarterEndBriefing;
  }>('/api/ai/quarter-end-briefing', { readinessSnapshot }, 'Quarter-end AI briefing is currently unavailable.');
  if (!apiRes.ok) return apiRes as AiFailureResult;
  if (!apiRes.data.briefing) {
    return { ok: false, errorCode: 'INVALID_MODEL_RESPONSE', userMessage: 'Quarter-end AI briefing payload missing.' };
  }
  return { ok: true, briefing: apiRes.data.briefing };
}

export async function requestAiGatewayAssist(params: {
  headers: string[];
  sampleRows: Record<string, string>[];
  targetFields: string[];
  anomalySummary: Record<string, unknown>;
}): Promise<{ ok: true; assist: AiGatewayAssistResult } | AiFailureResult> {
  const apiRes = await postAiJson<{
    ok?: boolean;
    errorCode?: string;
    userMessage?: string;
    assist?: AiGatewayAssistResult;
  }>('/api/ai/gateway-assist', params, 'Gateway AI assist is currently unavailable.');
  if (!apiRes.ok) return apiRes as AiFailureResult;
  if (!apiRes.data.assist) {
    return { ok: false, errorCode: 'INVALID_MODEL_RESPONSE', userMessage: 'Gateway AI assist payload missing.' };
  }
  return { ok: true, assist: apiRes.data.assist };
}

export async function requestAiEvidenceExtraction(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  linkedRecordId?: string;
}): Promise<{ ok: true; claims: AiExtractedEvidenceClaims } | AiFailureResult> {
  const apiRes = await postAiJson<{
    ok?: boolean;
    errorCode?: string;
    userMessage?: string;
    claims?: AiExtractedEvidenceClaims;
  }>('/api/ai/extract-evidence', params, 'Evidence AI extraction is currently unavailable.');
  if (!apiRes.ok) return apiRes as AiFailureResult;
  if (!apiRes.data.claims) {
    return { ok: false, errorCode: 'INVALID_MODEL_RESPONSE', userMessage: 'Evidence AI extraction payload missing.' };
  }
  return { ok: true, claims: apiRes.data.claims };
}

export async function requestAiReportExecutiveSummary(
  reportContext: Record<string, unknown>
): Promise<{ ok: true; summary: AiReportSummaryBlock } | AiFailureResult> {
  const apiRes = await postAiJson<{
    ok?: boolean;
    errorCode?: string;
    userMessage?: string;
    summary?: AiReportSummaryBlock;
  }>(
    '/api/ai/report-summary',
    { reportContext },
    'AI report summary is unavailable. Deterministic Report Studio exports remain fully functional.'
  );
  if (!apiRes.ok) return apiRes as AiFailureResult;
  if (!apiRes.data.summary) {
    return { ok: false, errorCode: 'INVALID_MODEL_RESPONSE', userMessage: 'AI report summary payload missing.' };
  }
  return {
    ok: true,
    summary: {
      ...apiRes.data.summary,
      reviewedAndApprovedForExport: false,
    },
  };
}

