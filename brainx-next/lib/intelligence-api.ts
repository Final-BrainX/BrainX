
"use client";

import { clearAuthSession, isDevAuthSession, readAuthSession, refreshAuthSessionOnce, type ApiResponse } from "@/lib/auth-api";
import { requestDesktopApiJson } from "@/lib/desktop-api-request";
import { DEV_USER_ID } from "@/lib/dev-user";
import type { components } from "@/lib/generated/intelligence-openapi";

type Schemas = components["schemas"];

export type SemanticSearchRequest = Schemas["SemanticSearchRequest"];
export type SemanticSearchData = Schemas["SemanticSearchData"];
export type NoteIndexStatusesRequest = Schemas["NoteIndexStatusesRequest"];
export type NoteIndexStatusesData = Schemas["NoteIndexStatusesData"];
export type NoteSearchIndexStatus = Schemas["NoteSearchIndexStatus"];
export type InlineAssistRequest = Schemas["InlineAssistRequest"];
export type AiSuggestionDecisionRequest = Schemas["AiSuggestionDecisionRequest"];
export type AiSuggestionDecisionData = Schemas["AiSuggestionDecisionData"];
export type ChatThreadCreateRequest = Schemas["ChatThreadCreateRequest"];
export type ChatThreadUpdateRequest = Schemas["ChatThreadUpdateRequest"];
export type ChatThreadData = Schemas["ChatThreadData"];
export type ChatThreadDeleteData = Schemas["ChatThreadDeleteData"];
export type ChatThreadListData = Schemas["ChatThreadListData"];
export type ChatMessageCreateRequest = Schemas["ChatMessageCreateRequest"];
export type ChatDraftNoteRequest = Schemas["ChatDraftNoteRequest"];
export type ChatDraftNoteData = Schemas["ChatDraftNoteData"];
export type ChatThreadDetailData = Schemas["ChatThreadDetailData"];
export type ChatMessageData = Schemas["ChatMessageData"];
export type ChatWebSourceData = Schemas["ChatWebSource"];
export type LlmFeedbackRating = Schemas["LlmFeedbackRating"];
export type LlmFeedbackRequest = Schemas["LlmFeedbackRequest"];
export type LlmFeedbackData = Schemas["LlmFeedbackData"];
export type AgentThreadCreateRequest = Schemas["AgentThreadCreateRequest"];
export type AgentMessageCreateRequest = Schemas["AgentMessageCreateRequest"];
export type AgentThreadData = Schemas["AgentThreadData"];
export type AgentThreadListData = Schemas["AgentThreadListData"];
export type AgentThreadDetailData = Schemas["AgentThreadDetailData"];
export type AgentActionData = Schemas["AgentActionData"];
export type LinkSuggestionsRequest = Schemas["LinkSuggestionsRequest"];
export type LinkSuggestionsData = Schemas["LinkSuggestionsData"];
export type BridgeConceptsRequest = Schemas["BridgeConceptsRequest"];
export type BridgeConceptsData = Schemas["BridgeConceptsData"];
export type ClusterJobCreateRequest = Schemas["ClusterJobCreateRequest"];
export type ClusterJobData = Schemas["ClusterJobData"];
export type ClusterJobLatestData = Schemas["ClusterJobLatestData"];
export type InsightReportCreateRequest = Schemas["InsightReportCreateRequest"];
export type InsightReportData = Schemas["InsightReportData"];
export type InsightReportLatestData = Schemas["InsightReportLatestData"];
export type AiModelsData = Schemas["AiModelsData"];
export type AiModelSettingsPutRequest = Schemas["AiModelSettingsPutRequest"];
export type AiModelSettingsData = Schemas["AiModelSettingsData"];
export type NoteSummaryData = Schemas["NoteSummaryData"];
export type StyleProfileData = Schemas["StyleProfileData"];
export type StyleProfilePutRequest = Schemas["StyleProfilePutRequest"];

export type InlineAssistDoneEvent = {
  suggestionId: string;
  action: InlineAssistRequest["action"];
  modelId: string;
};

export type ChatMessageDoneEvent = {
  messageId: string;
  llmRunId?: string | null;
};

export type AgentMessageDoneEvent = {
  messageId: string;
};

export type ChatRouteEvent = {
  route?: string;
  reason?: string;
  routerModel?: string;
  requiresWebSearch?: boolean;
  webSearchQuery?: string | null;
};

export type ChatStreamStatusEvent = {
  phase?: string;
  message?: string;
  requiresWebSearch?: boolean;
  webSearchQuery?: string | null;
};

export type ChatWebSearchProgressEvent = {
  status?: string;
  actionType?: string;
  query?: string | null;
  message?: string;
};

export type ChatWebSourcesEvent = {
  webSearchQuery?: string | null;
  sources: ChatWebSourceData[];
};

export type ChatThreadListStatus = "active" | "archived";

export type IntelligenceRequestOptions = {
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type IntelligenceStreamHandlers<TDone> = IntelligenceRequestOptions & {
  onDelta?: (text: string) => void;
  onDone?: (data: TDone) => void;
  onStatus?: (data: ChatStreamStatusEvent) => void;
  onRoute?: (data: ChatRouteEvent) => void;
  onWebSearchProgress?: (data: ChatWebSearchProgressEvent) => void;
  onWebSources?: (data: ChatWebSourcesEvent) => void;
  onActionProposed?: (data: AgentActionData) => void;
  onActionStatus?: (data: AgentActionData) => void;
  onActionResult?: (data: AgentActionData) => void;
  onError?: (error: unknown) => void;
};

type SseFrame = {
  event: string;
  data: string;
};

export class IntelligenceAuthRequiredError extends Error {
  constructor(message = "로그인이 만료되었습니다. 다시 로그인해 주세요.") {
    super(message);
    this.name = "IntelligenceAuthRequiredError";
  }
}

export type AiUsageLimitReason = "GUEST_AI_CALL_LIMIT_EXCEEDED" | "MONTHLY_CREDIT_LIMIT_EXCEEDED";

// 일반 요청 실패("요청 처리에 실패했습니다")와 구분해서 화면에서 별도로 처리(로그인 유도,
// 업그레이드 유도 등)할 수 있도록 전용 예외 타입으로 던진다.
export class AiUsageLimitExceededError extends Error {
  readonly reason: AiUsageLimitReason;

  constructor(reason: AiUsageLimitReason) {
    super(
      reason === "GUEST_AI_CALL_LIMIT_EXCEEDED"
        ? "게스트로 이용 가능한 AI 사용 횟수를 모두 소모했습니다. 로그인하면 계속 이용할 수 있어요."
        : "이번 달 AI 크레딧을 모두 소모했습니다. 플랜을 업그레이드하면 계속 이용할 수 있어요."
    );
    this.name = "AiUsageLimitExceededError";
    this.reason = reason;
  }
}

const INTELLIGENCE_API_BASE_URL = "";

// Intelligence-Service의 entitlement 거부는 400으로 내려오고 메시지에 Commerce-Service가
// 내려준 reasonCode가 그대로 붙어 있다("AI capability is not available: GUEST_AI_CALL_LIMIT_EXCEEDED").
// 모든 AI 호출이 authedRequest/streamRequest를 거치므로 여기서 한 번만 판별하면 각 화면에서
// 따로 문자열 매칭을 하지 않아도 된다.
function usageLimitReasonFrom(message: string): AiUsageLimitReason | null {
  if (message.includes("GUEST_AI_CALL_LIMIT_EXCEEDED")) return "GUEST_AI_CALL_LIMIT_EXCEEDED";
  if (message.includes("MONTHLY_CREDIT_LIMIT_EXCEEDED")) return "MONTHLY_CREDIT_LIMIT_EXCEEDED";
  return null;
}

function throwForFailedResponse(response: ApiResponse<unknown> | null, fallback: string): never {
  const message = response?.message ?? response?.error?.message ?? fallback;
  const reason = usageLimitReasonFrom(message);
  if (reason) throw new AiUsageLimitExceededError(reason);
  throw new Error(message);
}

async function authedRequest<T>(
  path: string,
  init?: RequestInit,
  options?: IntelligenceRequestOptions,
  retried = false
): Promise<T> {
  const requestInit: RequestInit = {
    ...init,
    signal: options?.signal ?? init?.signal,
    headers: buildHeaders(init?.headers, options),
  };
  const desktopResponse = await requestDesktopApiJson<ApiResponse<T>>(path, requestInit);
  const response = desktopResponse
    ? { ok: desktopResponse.ok, status: desktopResponse.status }
    : await fetch(`${INTELLIGENCE_API_BASE_URL}${path}`, { credentials: "include", ...requestInit });

  const payload = desktopResponse
    ? desktopResponse.payload
    : ((await (response as Response).json().catch(() => null)) as ApiResponse<T> | null);
  if (response.status === 401 || response.status === 403) {
    // 액세스 토큰이 만료된 흔한 정상 케이스도 여기 걸리므로, 바로 로그아웃시키기 전에
    // refreshToken으로 한 번 갱신을 시도하고 새 토큰으로 같은 요청을 한 번만 재시도한다.
    if (!retried && readAuthSession()?.refreshToken && (await refreshAuthSessionOnce())) {
      return authedRequest<T>(path, init, options, true);
    }
    clearAuthSession();
    throw new IntelligenceAuthRequiredError();
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throwForFailedResponse(payload, "요청 처리에 실패했습니다.");
  }
  return payload.data as T;
}

async function streamRequest<TDone>(
  path: string,
  body: unknown,
  handlers: IntelligenceStreamHandlers<TDone> = {},
  retried = false
): Promise<TDone | null> {
  const response = await fetch(`${INTELLIGENCE_API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    signal: handlers.signal,
    headers: buildHeaders({ Accept: "text/event-stream" }, handlers),
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    // 스트림 바디를 아직 읽기 시작하지 않은 시점이라 안전하게 재시도할 수 있다.
    if (!retried && readAuthSession()?.refreshToken && (await refreshAuthSessionOnce())) {
      return streamRequest<TDone>(path, body, handlers, true);
    }
    clearAuthSession();
    throw new IntelligenceAuthRequiredError();
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    throwForFailedResponse(payload, "요청 처리에 실패했습니다.");
  }
  if (!response.body) {
    throw new Error("스트림 응답을 읽을 수 없습니다.");
  }

  return readSseStream(response.body, handlers);
}

async function readSseStream<TDone>(
  body: ReadableStream<Uint8Array>,
  handlers: IntelligenceStreamHandlers<TDone>
): Promise<TDone | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: TDone | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const frame = parseSseFrame(part);
      const parsed = parseJson(frame.data);

      if (frame.event === "delta") {
        const text = typeof parsed === "object" && parsed && "text" in parsed ? String(parsed.text ?? "") : frame.data;
        handlers.onDelta?.(text);
      } else if (frame.event === "status") {
        handlers.onStatus?.(statusEventFrom(parsed));
      } else if (frame.event === "route") {
        handlers.onRoute?.(routeEventFrom(parsed));
      } else if (frame.event === "web_search_progress") {
        handlers.onWebSearchProgress?.(webSearchProgressEventFrom(parsed));
      } else if (frame.event === "web_sources") {
        handlers.onWebSources?.(webSourcesEventFrom(parsed));
      } else if (frame.event === "action_proposed") {
        handlers.onActionProposed?.(parsed as AgentActionData);
      } else if (frame.event === "action_status") {
        handlers.onActionStatus?.(parsed as AgentActionData);
      } else if (frame.event === "action_result") {
        handlers.onActionResult?.(parsed as AgentActionData);
      } else if (frame.event === "done") {
        donePayload = parsed as TDone;
        handlers.onDone?.(donePayload);
      } else if (frame.event === "error") {
        handlers.onError?.(streamErrorFrom(parsed ?? frame.data));
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const frame = parseSseFrame(tail);
    if (frame.event === "status") {
      handlers.onStatus?.(statusEventFrom(parseJson(frame.data)));
    } else if (frame.event === "route") {
      handlers.onRoute?.(routeEventFrom(parseJson(frame.data)));
    } else if (frame.event === "web_search_progress") {
      handlers.onWebSearchProgress?.(webSearchProgressEventFrom(parseJson(frame.data)));
    } else if (frame.event === "web_sources") {
      handlers.onWebSources?.(webSourcesEventFrom(parseJson(frame.data)));
    } else if (frame.event === "action_proposed") {
      handlers.onActionProposed?.(parseJson(frame.data) as AgentActionData);
    } else if (frame.event === "action_status") {
      handlers.onActionStatus?.(parseJson(frame.data) as AgentActionData);
    } else if (frame.event === "action_result") {
      handlers.onActionResult?.(parseJson(frame.data) as AgentActionData);
    } else if (frame.event === "done") {
      donePayload = parseJson(frame.data) as TDone;
      handlers.onDone?.(donePayload);
    } else if (frame.event === "error") {
      handlers.onError?.(streamErrorFrom(parseJson(frame.data) ?? frame.data));
    }
  }

  return donePayload;
}

function parseSseFrame(raw: string): SseFrame {
  let event = "message";
  const data: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }

  return { event, data: data.join("\n") };
}

function routeEventFrom(value: unknown): ChatRouteEvent {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    route: typeof record.route === "string" ? record.route : undefined,
    reason: typeof record.reason === "string" ? record.reason : undefined,
    routerModel: typeof record.routerModel === "string" ? record.routerModel : undefined,
    requiresWebSearch:
      typeof record.requiresWebSearch === "boolean"
        ? record.requiresWebSearch
        : undefined,
    webSearchQuery:
      typeof record.webSearchQuery === "string"
        ? record.webSearchQuery
        : null,
  };
}

function statusEventFrom(value: unknown): ChatStreamStatusEvent {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    phase: typeof record.phase === "string" ? record.phase : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    requiresWebSearch:
      typeof record.requiresWebSearch === "boolean"
        ? record.requiresWebSearch
        : undefined,
    webSearchQuery:
      typeof record.webSearchQuery === "string"
        ? record.webSearchQuery
        : null,
  };
}

function webSearchProgressEventFrom(value: unknown): ChatWebSearchProgressEvent {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status : undefined,
    actionType: typeof record.actionType === "string" ? record.actionType : undefined,
    query: typeof record.query === "string" ? record.query : null,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

function webSourcesEventFrom(value: unknown): ChatWebSourcesEvent {
  if (!value || typeof value !== "object") {
    return { sources: [] };
  }
  const record = value as Record<string, unknown>;
  const sources = Array.isArray(record.sources)
    ? record.sources
        .map(chatWebSourceFrom)
        .filter((source): source is ChatWebSourceData => Boolean(source))
    : [];
  return {
    webSearchQuery:
      typeof record.webSearchQuery === "string"
        ? record.webSearchQuery
        : null,
    sources,
  };
}

function chatWebSourceFrom(value: unknown): ChatWebSourceData | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!url) return null;
  return {
    title: typeof record.title === "string" ? record.title : "",
    url,
    snippet: typeof record.snippet === "string" ? record.snippet : "",
    rank: typeof record.rank === "number" ? record.rank : 1,
  };
}

function streamErrorFrom(value: unknown): unknown {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "object" && value && "message" in value
        ? String((value as { message?: unknown }).message ?? "")
        : typeof value === "string"
          ? value
          : "";
  const reason = usageLimitReasonFrom(message);
  return reason ? new AiUsageLimitExceededError(reason) : value;
}

function parseJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function notifyTokenUsageChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("brainx-token-usage-changed"));
  }
}

function buildHeaders(headers?: HeadersInit, options?: IntelligenceRequestOptions) {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  const next = new Headers(headers);
  next.set("Content-Type", "application/json");
  if (session?.accessToken) {
    next.set("Authorization", `${session.tokenType ?? "Bearer"} ${session.accessToken}`);
  }
  // workspace-api.ts/graph-api.ts와 동일한 기준 — 실제 인증 세션이 있으면 dev X-User-Id를
  // 덧붙이지 않는다(진짜 로그인 사용자 위에 로컬 dev 사용자를 덮어씌우지 않기 위함).
  if (DEV_USER_ID && !useAuthenticatedSession) {
    next.set("X-User-Id", DEV_USER_ID);
  }
  if (options?.idempotencyKey) {
    next.set("Idempotency-Key", options.idempotencyKey);
  }
  return next;
}

export function semanticSearch(payload: SemanticSearchRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<SemanticSearchData>(
    "/api/v1/intelligence/semantic-search",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  ).then((data) => {
    notifyTokenUsageChanged();
    return data;
  });
}

export function getNoteIndexStatuses(payload: NoteIndexStatusesRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<NoteIndexStatusesData>(
    "/api/v1/intelligence/note-index-statuses",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function createInlineAssistStream(
  payload: InlineAssistRequest,
  handlers?: IntelligenceStreamHandlers<InlineAssistDoneEvent>
) {
  return streamRequest<InlineAssistDoneEvent>("/api/v1/ai/inline-assists", payload, {
    ...handlers,
    onDone: (data) => {
      notifyTokenUsageChanged();
      handlers?.onDone?.(data);
    },
  });
}

export function decideAiSuggestion(
  suggestionId: string,
  payload: AiSuggestionDecisionRequest,
  options?: IntelligenceRequestOptions
) {
  return authedRequest<AiSuggestionDecisionData>(
    `/api/v1/ai/suggestions/${encodeURIComponent(suggestionId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function createChatThread(payload: ChatThreadCreateRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<ChatThreadData>(
    "/api/v1/ai/chat-threads",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function listChatThreads(
  params: { limit?: number; cursor?: string | null; status?: ChatThreadListStatus } = {},
  options?: IntelligenceRequestOptions
) {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.cursor) {
    searchParams.set("cursor", params.cursor);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  const query = searchParams.toString();
  return authedRequest<ChatThreadListData>(
    `/api/v1/ai/chat-threads${query ? `?${query}` : ""}`,
    undefined,
    options
  );
}

export function sendChatMessageStream(
  threadId: string,
  payload: ChatMessageCreateRequest,
  handlers?: IntelligenceStreamHandlers<ChatMessageDoneEvent>
) {
  return streamRequest<ChatMessageDoneEvent>(
    `/api/v1/ai/chat-threads/${encodeURIComponent(threadId)}/messages`,
    payload,
    {
      ...handlers,
      onDone: (data) => {
        notifyTokenUsageChanged();
        handlers?.onDone?.(data);
      },
    }
  );
}

export function getChatThread(threadId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<ChatThreadDetailData>(
    `/api/v1/ai/chat-threads/${encodeURIComponent(threadId)}`,
    undefined,
    options
  );
}

export function recordChatMessageDraftNote(
  threadId: string,
  messageId: string,
  payload: ChatDraftNoteRequest,
  options?: IntelligenceRequestOptions
) {
  return authedRequest<ChatDraftNoteData>(
    `/api/v1/ai/chat-threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/draft-note`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function updateChatThread(
  threadId: string,
  payload: ChatThreadUpdateRequest,
  options?: IntelligenceRequestOptions
) {
  return authedRequest<ChatThreadData>(
    `/api/v1/ai/chat-threads/${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function deleteChatThread(threadId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<ChatThreadDeleteData>(
    `/api/v1/ai/chat-threads/${encodeURIComponent(threadId)}`,
    {
      method: "DELETE",
    },
    options
  );
}

export function upsertLlmFeedback(payload: LlmFeedbackRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<LlmFeedbackData>(
    "/api/v1/ai/llm-feedback",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function createAgentThread(payload: AgentThreadCreateRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<AgentThreadData>(
    "/api/v1/ai/agent-threads",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function listAgentThreads(params: { limit?: number } = {}, options?: IntelligenceRequestOptions) {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  const query = searchParams.toString();
  return authedRequest<AgentThreadListData>(
    `/api/v1/ai/agent-threads${query ? `?${query}` : ""}`,
    undefined,
    options
  );
}

export function getAgentThread(threadId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<AgentThreadDetailData>(
    `/api/v1/ai/agent-threads/${encodeURIComponent(threadId)}`,
    undefined,
    options
  );
}

export function sendAgentMessageStream(
  threadId: string,
  payload: AgentMessageCreateRequest,
  handlers?: IntelligenceStreamHandlers<AgentMessageDoneEvent>
) {
  return streamRequest<AgentMessageDoneEvent>(
    `/api/v1/ai/agent-threads/${encodeURIComponent(threadId)}/messages`,
    payload,
    {
      ...handlers,
      onDone: (data) => {
        notifyTokenUsageChanged();
        handlers?.onDone?.(data);
      },
    }
  );
}

export function approveAgentAction(actionId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<AgentActionData>(
    `/api/v1/ai/agent-actions/${encodeURIComponent(actionId)}/approve`,
    {
      method: "POST",
    },
    options
  );
}

export function rejectAgentAction(actionId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<AgentActionData>(
    `/api/v1/ai/agent-actions/${encodeURIComponent(actionId)}/reject`,
    {
      method: "POST",
    },
    options
  );
}

export function createBridgeConcepts(payload: BridgeConceptsRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<BridgeConceptsData>(
    "/api/v1/ai/bridge-concepts",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  ).then((data) => {
    notifyTokenUsageChanged();
    return data;
  });
}

export function createLinkSuggestions(payload: LinkSuggestionsRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<LinkSuggestionsData>(
    "/api/v1/ai/link-suggestions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  ).then((data) => {
    notifyTokenUsageChanged();
    return data;
  });
}

export function requestClusterJob(payload: ClusterJobCreateRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<ClusterJobData>(
    "/api/v1/ai/clusters",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  ).then((data) => {
    notifyTokenUsageChanged();
    return data;
  });
}

export function getLatestClusterJob(
  params: { documentGroupId?: string } = {},
  options?: IntelligenceRequestOptions
) {
  const searchParams = new URLSearchParams();
  if (params.documentGroupId) {
    searchParams.set("documentGroupId", params.documentGroupId);
  }
  const query = searchParams.toString();
  return authedRequest<ClusterJobLatestData>(
    `/api/v1/ai/clusters/latest${query ? `?${query}` : ""}`,
    undefined,
    options
  );
}

export function requestInsightReport(payload: InsightReportCreateRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<InsightReportData>(
    "/api/v1/ai/insight-reports",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  ).then((data) => {
    notifyTokenUsageChanged();
    return data;
  });
}

export function getInsightReport(reportId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<InsightReportData>(
    `/api/v1/ai/insight-reports/${encodeURIComponent(reportId)}`,
    undefined,
    options
  );
}

export function getLatestInsightReport(
  params: { documentGroupId?: string } = {},
  options?: IntelligenceRequestOptions
) {
  const searchParams = new URLSearchParams();
  if (params.documentGroupId) {
    searchParams.set("documentGroupId", params.documentGroupId);
  }
  const query = searchParams.toString();
  return authedRequest<InsightReportLatestData>(
    `/api/v1/ai/insight-reports/latest${query ? `?${query}` : ""}`,
    undefined,
    options
  );
}

export function listAiModels(options?: IntelligenceRequestOptions) {
  return authedRequest<AiModelsData>("/api/v1/ai/models", undefined, options);
}

export function putAiModelSettings(payload: AiModelSettingsPutRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<AiModelSettingsData>(
    "/api/v1/ai/model-settings",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    options
  );
}

export function getNoteSummary(noteId: string, options?: IntelligenceRequestOptions) {
  return authedRequest<NoteSummaryData>(
    `/api/v1/notes/${encodeURIComponent(noteId)}/summary`,
    undefined,
    options
  );
}

export function getStyleProfile(options?: IntelligenceRequestOptions) {
  return authedRequest<StyleProfileData>("/api/v1/users/me/style-profile", undefined, options);
}

export function putStyleProfile(payload: StyleProfilePutRequest, options?: IntelligenceRequestOptions) {
  return authedRequest<StyleProfileData>(
    "/api/v1/users/me/style-profile",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    options
  );
}
