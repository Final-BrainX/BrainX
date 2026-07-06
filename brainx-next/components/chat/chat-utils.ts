import type {
  ChatRouteEvent,
  ChatThreadData,
  ChatThreadDetailData,
  ChatThreadListStatus,
} from "@/lib/intelligence-api";
import type {
  ChatCitation,
  ChatMessageView,
  ChatRoute,
  ChatThreadListItem,
  ChatWebSource,
} from "@/components/chat/types";

export function messageFromError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(
      (error as { message?: unknown }).message ?? "요청 처리에 실패했습니다.",
    );
  }
  return "요청 처리에 실패했습니다.";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function chatRouteFrom(value: unknown): ChatRoute | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return normalized === "NOTE_QA" ||
    normalized === "WORKSPACE_SEARCH" ||
    normalized === "COMPOSE" ||
    normalized === "NOTE_ACTION" ||
    normalized === "OUT_OF_SCOPE"
    ? normalized
    : undefined;
}

export function chatRouteFromEvent(event: ChatRouteEvent): ChatRoute | undefined {
  return chatRouteFrom(event.route);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function citationsFrom(value: unknown): ChatCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const noteId = stringValue(record.noteId);
    const title = stringValue(record.title) || noteId || "근거 노트";
    if (!noteId && !title) return [];
    return [
      {
        noteId,
        title,
        score: numberValue(record.score),
        sourcePath: stringValue(record.sourcePath),
        sourceFilename: stringValue(record.sourceFilename),
      },
    ];
  });
}

function webSourcesFrom(value: unknown): ChatWebSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const url = stringValue(record.url);
    if (!url) return [];
    return [
      {
        title: stringValue(record.title) || url,
        url,
        snippet: stringValue(record.snippet),
        rank: numberValue(record.rank) ?? 1,
      },
    ];
  });
}

export function messagesFromThread(
  detail: ChatThreadDetailData,
): ChatMessageView[] {
  return detail.messages.map((message, index) => {
    const record = message as Record<string, unknown>;
    const role =
      stringValue(message.role).toUpperCase() === "ASSISTANT" ? "ai" : "user";
    return {
      id: stringValue(message.messageId) || `${role}-${index}`,
      role,
      text: stringValue(message.content),
      modelId: stringValue(message.modelId),
      createdAt: stringValue(message.createdAt),
      route: chatRouteFrom(record.route ?? record.chatRoute),
      llmRunId: stringValue(record.llmRunId) || null,
      feedbackRating:
        record.feedbackRating === "LIKE" || record.feedbackRating === "DISLIKE"
          ? record.feedbackRating
          : null,
      citations: citationsFrom(message.citations),
      webSources: webSourcesFrom(record.webSources),
    };
  });
}

export function threadTitleFromQuestion(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) return normalized || "새 대화";
  return `${normalized.slice(0, 42).trim()}...`;
}

export function formatChatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export function upsertThread(
  threads: ChatThreadListItem[],
  thread: ChatThreadData,
): ChatThreadListItem[] {
  const item: ChatThreadListItem = {
    ...thread,
    lastMessageAt: thread.createdAt,
    lastMessagePreview: null,
    messageCount: 0,
  };
  const next = threads.filter((entry) => entry.threadId !== thread.threadId);
  return [item, ...next];
}

export function threadBelongsToStatus(
  thread: ChatThreadData | ChatThreadListItem,
  status: ChatThreadListStatus,
) {
  if (thread.deletedAt) return false;
  return status === "archived"
    ? Boolean(thread.archivedAt)
    : !thread.archivedAt;
}
