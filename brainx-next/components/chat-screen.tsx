"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, Compass, MoreHorizontal, PencilLine, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import {
  createChatThread,
  deleteChatThread,
  getChatThread,
  listAiModels,
  listChatThreads,
  sendChatMessageStream,
  updateChatThread,
  type ChatThreadData,
  type ChatThreadDetailData,
  type ChatThreadListData,
  type ChatThreadListStatus
} from "@/lib/intelligence-api";
import { createWorkspaceNoteFromPayload } from "@/lib/workspace-api";
import { clusterById } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Btn, Icon, RelevanceBar } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

const THREAD_PAGE_SIZE = 20;
const FALLBACK_MODEL_ID = "gpt-5.4-mini";
const CHAT_DRAFT_NOTE_TAGS = ["ai-draft", "chat"];

type ChatThreadListItem = ChatThreadListData["threads"][number];

type ChatModelOption = {
  id: string;
  name: string;
  sub: string;
};

type ChatCitation = {
  noteId: string;
  title: string;
  score?: number;
  sourcePath?: string;
  sourceFilename?: string;
};

type ChatMessageView = {
  id: string;
  role: "ai" | "user";
  text: string;
  modelId?: string;
  createdAt?: string;
  streaming?: boolean;
  error?: boolean;
  citations?: ChatCitation[];
};

type DraftNoteSaveStatus = "saving" | "saved" | "error";

type DraftNoteSaveState = {
  status: DraftNoteSaveStatus;
  noteId?: string;
  error?: string;
};

type ThreadDeleteCandidate = {
  threadId: string;
  title: string;
};

const FALLBACK_MODEL: ChatModelOption = {
  id: FALLBACK_MODEL_ID,
  name: "GPT 5.4 Mini",
  sub: "기본 모델"
};

function safeMarkdownHref(href: string) {
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|`[^`\n]+?`|\[([^\]\n]+)\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const token = match[0];
    const key = `${keyPrefix}-inline-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<s key={key}>{renderInlineMarkdown(token.slice(2, -2), key)}</s>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-surface2/70 px-1 py-0.5 text-[12px] text-accent">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      const href = safeMarkdownHref(match[3] ?? "");
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {renderInlineMarkdown(match[2] ?? "", key)}
          </a>
        ) : (
          token
        )
      );
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function MarkdownLine({ text, id }: { text: string; id: string }) {
  return <>{renderInlineMarkdown(text, id)}</>;
}

function AiMarkdownMessage({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks: ReactNode[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="whitespace-normal text-[16.5px] leading-[1.75] text-txt2">
        {paragraph.map((line, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 && <br />}
            <MarkdownLine text={line} id={`${key}-${index}`} />
          </span>
        ))}
      </p>
    );
    paragraph.length = 0;
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    const key = `list-${blocks.length}`;
    const Tag = listType === "ul" ? "ul" : "ol";
    blocks.push(
      <Tag key={key} className="ml-4 space-y-1 pl-1 text-[16px] leading-7 text-txt2 marker:text-txt3">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`} className={listType === "ul" ? "list-disc" : "list-decimal"}>
            <MarkdownLine text={item} id={`${key}-${index}`} />
          </li>
        ))}
      </Tag>
    );
    listItems.length = 0;
    listType = null;
  };

  text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-txt">
          <MarkdownLine text={heading[2]} id={`h-${blocks.length}`} />
        </p>
      );
      return;
    }

    const quote = /^>\s+(.+)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`q-${blocks.length}`} className="border-l-2 border-line/70 pl-2 text-txt3">
          <MarkdownLine text={quote[1]} id={`q-${blocks.length}`} />
        </blockquote>
      );
      return;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(unordered[1]);
      return;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      return;
    }

    flushList();
    paragraph.push(line.trimEnd());
  });

  flushParagraph();
  flushList();

  return (
    <div className={cx("space-y-2 break-words", streaming ? "stream-caret" : "")}>
      {blocks.length > 0 ? blocks : <span>&nbsp;</span>}
    </div>
  );
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "요청 처리에 실패했습니다.");
  }
  return "요청 처리에 실패했습니다.";
}

function draftNoteSaveErrorMessage(error: unknown) {
  const message = messageFromError(error);
  if (message.includes("만료") || message.includes("권한") || message.includes("401") || message.includes("403")) {
    return "로그인 또는 노트 저장 권한을 확인하고 다시 시도하세요.";
  }
  return message || "AI 초안을 노트로 저장하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function citationsFrom(value: unknown): ChatCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const noteId = stringValue(record.noteId);
    const title = stringValue(record.title) || noteId || "근거 노트";
    if (!noteId && !title) return [];
    return [{
      noteId,
      title,
      score: numberValue(record.score),
      sourcePath: stringValue(record.sourcePath),
      sourceFilename: stringValue(record.sourceFilename)
    }];
  });
}

function messagesFromThread(detail: ChatThreadDetailData): ChatMessageView[] {
  return detail.messages.map((message, index) => {
    const role = stringValue(message.role).toUpperCase() === "ASSISTANT" ? "ai" : "user";
    return {
      id: stringValue(message.messageId) || `${role}-${index}`,
      role,
      text: stringValue(message.content),
      modelId: stringValue(message.modelId),
      createdAt: stringValue(message.createdAt),
      citations: citationsFrom(message.citations)
    };
  });
}

function threadTitleFromQuestion(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) return normalized || "새 대화";
  return `${normalized.slice(0, 42).trim()}...`;
}

function formatChatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function upsertThread(threads: ChatThreadListItem[], thread: ChatThreadData): ChatThreadListItem[] {
  const item: ChatThreadListItem = {
    ...thread,
    lastMessageAt: thread.createdAt,
    lastMessagePreview: null,
    messageCount: 0
  };
  const next = threads.filter((entry) => entry.threadId !== thread.threadId);
  return [item, ...next];
}

function normalizeMarkdownText(value: string) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function markdownTitleText(value: string) {
  return normalizeMarkdownText(value)
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .trim();
}

function truncateNoteTitle(value: string) {
  const title = markdownTitleText(value) || "AI 초안";
  if (title.length <= 80) return title;
  return `${title.slice(0, 77).trimEnd()}...`;
}

function noteTitleFromAiMessage(text: string, fallbackTitle?: string | null) {
  const heading = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(text);
  return truncateNoteTitle(heading?.[1] ?? fallbackTitle ?? "AI 초안");
}

function markdownLinkLabel(value: string) {
  return markdownTitleText(value).replace(/[[\]\\]/g, "\\$&") || "참고 노트";
}

function citationMarkdownLine(citation: ChatCitation, index: number) {
  const label = markdownLinkLabel(citation.title || citation.noteId || `참고 노트 ${index + 1}`);
  const score = citation.score == null
    ? ""
    : ` (${Math.round(Math.max(0, Math.min(1, citation.score)) * 100)}%)`;
  if (!citation.noteId) {
    return `- ${label}${score}`;
  }
  return `- [${label}](/notes/${encodeURIComponent(citation.noteId)})${score}`;
}

function buildChatDraftMarkdown(message: ChatMessageView) {
  const body = message.text.trim();
  const citations = (message.citations ?? []).filter((citation) => citation.noteId || citation.title);
  if (citations.length === 0) return body;
  return `${body}\n\n## 참고 노트\n\n${citations.map(citationMarkdownLine).join("\n")}`;
}

function threadBelongsToStatus(thread: ChatThreadData | ChatThreadListItem, status: ChatThreadListStatus) {
  if (thread.deletedAt) return false;
  return status === "archived" ? Boolean(thread.archivedAt) : !thread.archivedAt;
}

export function ChatScreen() {
  const router = useRouter();
  const { pushToast, notes, effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";
  const [threads, setThreads] = useState<ChatThreadListItem[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [threadStatus, setThreadStatus] = useState<ChatThreadListStatus>("active");
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThreadData | null>(null);
  const [threadActionOpenId, setThreadActionOpenId] = useState<string | null>(null);
  const [threadActionLoadingId, setThreadActionLoadingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ThreadDeleteCandidate | null>(null);
  const [models, setModels] = useState<ChatModelOption[]>([FALLBACK_MODEL]);
  const [model, setModel] = useState<ChatModelOption>(FALLBACK_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draftSaveStates, setDraftSaveStates] = useState<Record<string, DraftNoteSaveState>>({});
  const detailRequestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadThreadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadStatus]);

  useEffect(() => {
    if (!deleteCandidate) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeleteCandidate(null);
      }
      if (event.key === "Enter") {
        void confirmDeleteThread();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteCandidate, threadActionLoadingId]);

  const suggestions = [
    "내 노트에서 RAG 검색 품질 높이는 법을 정리해줘",
    "최근 작성한 노트들의 핵심 흐름을 요약해줘",
    "내 노트 기준으로 다음에 이어 쓸 주제를 추천해줘"
  ];

  const referencedCitations = useMemo(() => {
    const byNoteId = new Map<string, ChatCitation>();
    for (const message of messages) {
      if (message.role !== "ai") continue;
      for (const citation of message.citations ?? []) {
        if (!citation.noteId || byNoteId.has(citation.noteId)) continue;
        byNoteId.set(citation.noteId, citation);
      }
    }
    return [...byNoteId.values()].slice(0, 8);
  }, [messages]);

  async function loadModels() {
    try {
      const data = await listAiModels();
      const enabled = new Set(data.enabledModels);
      const available = data.models
        .filter((item) => item.enabled || enabled.has(item.modelId))
        .map((item) => ({
          id: item.modelId,
          name: item.name || item.modelId,
          sub: item.provider || "사용 가능"
        }));
      const nextModels = available.length > 0 ? available : [FALLBACK_MODEL];
      setModels(nextModels);
      setModel((current) => nextModels.find((item) => item.id === current.id) ?? nextModels[0]);
    } catch {
      setModels([FALLBACK_MODEL]);
      setModel(FALLBACK_MODEL);
    }
  }

  async function loadThreadPage(reset = false, statusOverride?: ChatThreadListStatus) {
    if (threadsLoading) return;
    const status = statusOverride ?? threadStatus;
    setThreadsLoading(true);
    if (reset) {
      setThreads([]);
      setThreadCursor(null);
      setHasMoreThreads(false);
    }
    try {
      const data = await listChatThreads({
        limit: THREAD_PAGE_SIZE,
        cursor: reset ? null : threadCursor,
        status
      });
      setThreads((current) => (reset ? data.threads : [...current, ...data.threads]));
      setThreadCursor(data.pagination.nextCursor ?? null);
      setHasMoreThreads(data.pagination.hasMore);
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThread(threadId: string) {
    if (streaming || threadDetailLoading) return;
    if (activeThreadId === threadId) return;
    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setActiveThreadId(threadId);
    setThreadDetailLoading(true);
    try {
      const detail = await getChatThread(threadId);
      if (detailRequestIdRef.current !== requestId) return;
      setActiveThread(detail.thread);
      setMessages(messagesFromThread(detail));
      setDraftSaveStates({});
    } catch (error) {
      if (detailRequestIdRef.current !== requestId) return;
      setActiveThreadId(null);
      setActiveThread(null);
      setMessages([]);
      pushToast(messageFromError(error), "err");
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setThreadDetailLoading(false);
      }
    }
  }

  function clearActiveThread() {
    detailRequestIdRef.current += 1;
    setActiveThreadId(null);
    setActiveThread(null);
    setMessages([]);
    setDraftSaveStates({});
    setInput("");
  }

  function startNewThread() {
    if (streaming) return;
    clearActiveThread();
  }

  async function refreshActiveThread(threadId: string) {
    const detail = await getChatThread(threadId);
    setActiveThread(detail.thread);
    setMessages(messagesFromThread(detail));
  }

  async function setThreadArchived(thread: ChatThreadListItem, archived: boolean) {
    if (streaming || threadActionLoadingId) return;
    setThreadActionLoadingId(thread.threadId);
    setThreadActionOpenId(null);
    try {
      const updated = await updateChatThread(thread.threadId, { archived });
      const visibleInCurrentTab = threadBelongsToStatus(updated, threadStatus);
      setThreads((current) => visibleInCurrentTab
        ? current.map((item) => (item.threadId === updated.threadId ? { ...item, ...updated } : item))
        : current.filter((item) => item.threadId !== updated.threadId));
      if (activeThreadId === updated.threadId) {
        if (visibleInCurrentTab) {
          setActiveThread(updated);
        } else {
          clearActiveThread();
        }
      }
      pushToast(archived ? "대화를 보관했습니다." : "대화를 보관 해제했습니다.", "ok");
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setThreadActionLoadingId(null);
    }
  }

  function requestDeleteThread(thread: ChatThreadListItem) {
    if (streaming || threadActionLoadingId) return;
    setThreadActionOpenId(null);
    setDeleteCandidate({ threadId: thread.threadId, title: thread.title });
  }

  async function confirmDeleteThread() {
    if (!deleteCandidate || threadActionLoadingId) return;
    const candidate = deleteCandidate;
    setThreadActionLoadingId(candidate.threadId);
    try {
      await deleteChatThread(candidate.threadId);
      setThreads((current) => current.filter((item) => item.threadId !== candidate.threadId));
      if (activeThreadId === candidate.threadId) {
        clearActiveThread();
      }
      setDeleteCandidate(null);
      pushToast("대화를 삭제했습니다.", "ok");
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setThreadActionLoadingId(null);
    }
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || streaming) return;
    if (activeThread?.archivedAt) {
      pushToast("보관된 대화에는 새 메시지를 보낼 수 없습니다. 먼저 보관 해제해 주세요.", "info");
      return;
    }

    const localUserId = `local-user-${Date.now()}`;
    const assistantId = `stream-${Date.now()}`;
    setInput("");
    setStreaming(true);
    setMessages((current) => [
      ...current,
      { id: localUserId, role: "user", text: trimmed },
      { id: assistantId, role: "ai", text: "", streaming: true }
    ]);

    let streamError: unknown = null;

    try {
      let thread = activeThread;
      if (!thread) {
        const targetStatus: ChatThreadListStatus = "active";
        if (threadStatus !== "active") {
          setThreadStatus(targetStatus);
        }
        thread = await createChatThread({
          title: threadTitleFromQuestion(trimmed),
          initialMessage: trimmed,
          modelId: model.id
        });
        setActiveThread(thread);
        setActiveThreadId(thread.threadId);
        setThreads((current) => upsertThread(current, thread!));
      }

      await sendChatMessageStream(
        thread.threadId,
        {
          message: trimmed,
          noteScope: { documentGroupId: thread.documentGroupId },
          clientContext: {
            mode: "NONE",
            source: "WORKSPACE_CHAT",
            items: []
          },
          modelId: model.id
        },
        {
          onDelta: (text) => {
            setMessages((current) => current.map((message) => (
              message.id === assistantId
                ? { ...message, text: message.text + text, streaming: true }
                : message
            )));
          },
          onError: (error) => {
            streamError = error;
            setMessages((current) => current.map((message) => (
              message.id === assistantId
                ? {
                    ...message,
                    text: message.text || messageFromError(error),
                    streaming: false,
                    error: true
                  }
                : message
            )));
          }
        }
      );

      if (streamError) {
        await loadThreadPage(true, "active");
        return;
      }

      await refreshActiveThread(thread.threadId);
      await loadThreadPage(true, "active");
    } catch (error) {
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              text: message.text || messageFromError(error),
              streaming: false,
              error: true
            }
          : message
      )));
      pushToast(messageFromError(error), "err");
    } finally {
      setStreaming(false);
    }
  }

  const activeTitle = activeThread?.title ?? "새 대화";
  const activeThreadArchived = Boolean(activeThread?.archivedAt);
  const composerDisabled = streaming || threadDetailLoading || activeThreadArchived;
  const threadSectionLabel = threadStatus === "archived" ? "보관한 대화" : "최근 대화";

  async function saveAiMessageAsNote(message: ChatMessageView) {
    const currentState = draftSaveStates[message.id];
    if (currentState?.status === "saving") return;
    if (currentState?.status === "saved" && currentState.noteId) {
      router.push(`/notes/${currentState.noteId}`);
      return;
    }

    const markdown = buildChatDraftMarkdown(message);
    if (!markdown.trim()) return;

    setDraftSaveStates((current) => ({
      ...current,
      [message.id]: { status: "saving" }
    }));

    try {
      const created = await createWorkspaceNoteFromPayload({
        title: noteTitleFromAiMessage(message.text, activeThread?.title),
        markdown,
        folderId: null,
        tags: CHAT_DRAFT_NOTE_TAGS
      });
      setDraftSaveStates((current) => ({
        ...current,
        [message.id]: { status: "saved", noteId: created.noteId }
      }));
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: created.noteId } }));
      pushToast("AI 초안을 노트로 저장했어요.", "ok");
    } catch (error) {
      setDraftSaveStates((current) => ({
        ...current,
        [message.id]: { status: "error", error: draftNoteSaveErrorMessage(error) }
      }));
    }
  }

  return (
    <div data-route className="flex h-full">
      <div className="flex w-60 shrink-0 flex-col border-r border-line/50 bg-bg2/30">
        <div className="p-3">
          <Btn
            variant="primary"
            size="md"
            icon="plus"
            className="w-full"
            disabled={streaming}
            onClick={startNewThread}
          >
            새 대화
          </Btn>
        </div>
        <div className="px-3 pb-2">
          <div className="grid grid-cols-2 rounded-xl border border-line/60 bg-surface/50 p-1" role="tablist" aria-label="대화 목록 필터">
            {([
              ["active", "최근"],
              ["archived", "보관"]
            ] as const).map(([status, label]) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={threadStatus === status}
                disabled={streaming || threadsLoading}
                onClick={() => {
                  setThreadActionOpenId(null);
                  setThreadStatus(status);
                  clearActiveThread();
                }}
                className={cx(
                  "h-8 rounded-lg text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60",
                  threadStatus === status ? "bg-primary text-white" : "text-txt3 hover:bg-surface2/70 hover:text-txt"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll flex-1 overflow-y-auto px-2 pb-3">
          <div className="px-2 py-1.5 text-[12px] font-semibold text-txt3">{threadSectionLabel}</div>
          {threads.length === 0 && !threadsLoading ? (
            <div className="mx-2 rounded-xl border border-dashed border-line/60 px-3 py-4 text-[13px] leading-5 text-txt3">
              {threadStatus === "archived" ? "보관한 대화가 없습니다." : "저장된 대화가 없습니다."}
            </div>
          ) : null}
          {threads.map((thread) => (
            <div
              key={thread.threadId}
              className={cx(
                "relative mb-1 flex w-full items-start gap-1 rounded-xl p-1 transition-colors",
                activeThreadId === thread.threadId ? "bg-surface2/80" : "hover:bg-surface2/50"
              )}
            >
              <button
                type="button"
                disabled={streaming || threadActionLoadingId === thread.threadId}
                onClick={() => openThread(thread.threadId)}
                className="min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="truncate text-[15px] font-medium text-txt">{thread.title}</div>
                <div className="mt-0.5 truncate text-[13px] text-txt3">
                  {thread.lastMessagePreview || "아직 메시지가 없습니다."}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[12.5px] text-txt3">
                  <span>{formatChatTime(thread.lastMessageAt)}</span>
                  <span>{thread.messageCount}개</span>
                </div>
              </button>
              <button
                type="button"
                aria-label={`${thread.title} 대화 작업`}
                aria-expanded={threadActionOpenId === thread.threadId}
                disabled={streaming || threadActionLoadingId === thread.threadId}
                onClick={(event) => {
                  event.stopPropagation();
                  setThreadActionOpenId((current) => current === thread.threadId ? null : thread.threadId);
                }}
                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-txt3 transition-colors hover:bg-surface2 hover:text-txt focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MoreHorizontal size={15} aria-hidden="true" />
              </button>
              {threadActionOpenId === thread.threadId ? (
                <div
                  className="absolute right-1 top-10 z-30 w-36 rounded-xl border border-line/70 bg-surface p-1.5 shadow-soft"
                  role="menu"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setThreadActionOpenId(null);
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={Boolean(threadActionLoadingId)}
                    onClick={() => setThreadArchived(thread, threadStatus !== "archived")}
                    className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium text-txt2 transition-colors hover:bg-surface2 hover:text-txt focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50"
                  >
                    {threadStatus === "archived" ? <RotateCcw size={13} aria-hidden="true" /> : <Archive size={13} aria-hidden="true" />}
                    {threadStatus === "archived" ? "보관 해제" : "보관"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={Boolean(threadActionLoadingId)}
                    onClick={() => requestDeleteThread(thread)}
                    className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:cursor-wait disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {hasMoreThreads ? (
            <button
              type="button"
              disabled={threadsLoading || streaming}
              onClick={() => loadThreadPage(false)}
              className="mt-2 h-9 w-full rounded-xl border border-line/60 text-[13px] font-medium text-txt2 transition-colors hover:border-primary/40 hover:text-txt disabled:cursor-wait disabled:opacity-50"
            >
              {threadsLoading ? "불러오는 중" : "더 불러오기"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-line/50 px-5">
          <div className="flex items-center gap-2 text-[16px] font-semibold">
            <Icon name="chat" size={17} className="text-primary" />
            내 노트 기반 AI 챗
          </div>
          <div className="min-w-0 truncate text-[14px] text-txt3">{activeTitle}</div>
          {activeThreadArchived ? (
            <span className="rounded-full border border-line/60 bg-surface2/70 px-2 py-1 text-[12px] font-semibold text-txt3">
              보관됨
            </span>
          ) : null}
          <div className="flex-1" />
          <div className="relative">
            <button
              type="button"
              disabled={streaming}
              onClick={() => setModelOpen((current) => !current)}
              className="flex h-[34px] items-center gap-2 rounded-xl border border-line/60 bg-surface/60 px-3 text-[14px] hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="h-2 w-2 rounded-full bg-cyan" />
              {model.name}
              <Icon name="chevD" size={14} className="text-txt3" />
            </button>
            {modelOpen ? (
              <div className="fade-up glass absolute right-0 top-11 z-50 w-56 rounded-xl p-1.5 shadow-soft" onMouseLeave={() => setModelOpen(false)}>
                {models.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setModel(item);
                      setModelOpen(false);
                    }}
                    className={cx("flex h-10 w-full items-center justify-between rounded-lg px-3 text-left", model.id === item.id ? "bg-surface2/70" : "hover:bg-surface2/50")}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-medium text-txt">{item.name}</div>
                      <div className="truncate text-[13px] text-txt3">{item.sub}</div>
                    </div>
                    {model.id === item.id ? <Icon name="check" size={15} className="text-primary" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div ref={scrollRef} className="scroll flex-1 overflow-y-auto">
          {threadDetailLoading ? (
            <div className="flex h-full items-center justify-center text-[14px] text-txt3">대화를 불러오는 중입니다.</div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-[860px] flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)] backdrop-blur dark:border-white/10 dark:bg-transparent dark:shadow-none">
                <Icon name="brain" size={24} className="text-primary" />
              </div>
              <h2 className="text-[28px] font-bold tracking-tight text-txt">내 노트를 기반으로 질문해보세요</h2>
              <p className="mt-2 max-w-[560px] text-[15px] leading-7 text-txt2">
                BrainX는 노트에 적힌 맥락을 근거로 답하고, 필요한 경우 관련 출처를 함께 보여줍니다.
              </p>
              <div className="mt-7 grid w-full gap-3 md:grid-cols-3">
                {[
                  { step: "1", label: "노트 작성", desc: "먼저 생각을 적어두면 AI가 연결을 더 잘 이해해요.", icon: PencilLine, tone: "from-[#EFEAFF] to-[#F7F5FF]", accent: "text-[#6C63D8]", prompt: suggestions[1] },
                  { step: "2", label: "AI 연결", desc: "관련 노트와 문맥을 함께 읽으며 답을 풍부하게 만들어요.", icon: Sparkles, tone: "from-[#EAF8F2] to-[#F5FBF8]", accent: "text-[#4BC3AC]", prompt: suggestions[0] },
                  { step: "3", label: "그래프 탐색", desc: "대화로 찾은 주제를 그래프에서 더 넓게 살펴보세요.", icon: Compass, tone: "from-[#EAF1FF] to-[#F5F8FF]", accent: "text-[#5BA8F0]", prompt: suggestions[2] }
                ].map((item) => (
                  <button
                    key={item.step}
                    type="button"
                    disabled={streaming}
                    onClick={() => ask(item.prompt)}
                    className={cx(
                      "group relative overflow-hidden rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
                      isLight
                        ? "border-line/60 bg-white/85 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-primary/25 hover:shadow-[0_16px_34px_rgba(108,99,216,0.12)]"
                        : "border-white/10 bg-transparent shadow-none hover:border-primary/30"
                    )}
                  >
                    <span className={`absolute -right-1 top-1 text-[56px] font-extrabold leading-none ${item.accent} opacity-[0.08]`}>
                      {item.step}
                    </span>
                    <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} ${item.accent}`}>
                      <item.icon size={18} />
                    </div>
                    <div className="text-[13px] font-semibold text-txt">{item.label}</div>
                    <p className="mt-1.5 min-h-[44px] text-[12px] leading-6 text-txt2">{item.desc}</p>
                    <div className="mt-3 text-[12px] font-medium text-primary">질문하기</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
              {messages.map((message) => {
                const saveState = draftSaveStates[message.id];
                const saveStatus = saveState?.status ?? "idle";
                const isSavingDraft = saveStatus === "saving";
                const isSavedDraft = saveStatus === "saved" && !!saveState?.noteId;
                const canSaveDraft = message.role === "ai" && !message.streaming && !message.error && !!message.text.trim();

                return (
                <div key={message.id} className={cx("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}>
                  {message.role === "ai" ? (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
                      <Icon name="brain" size={17} className="text-white" />
                    </div>
                  ) : (
                    <Avatar name="연우" size={32} />
                  )}
                  <div className={cx("min-w-0 flex flex-col", message.role === "user" ? "items-end" : "")}>
                    <div className={cx("rounded-2xl px-4 py-3", message.role === "user" ? "bg-primary text-white" : message.error ? "border border-red-300/70 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/20 dark:text-red-200" : "card")}>
                      {message.role === "user" ? (
                        <p className="whitespace-pre-wrap text-[16.5px] leading-relaxed">{message.text}</p>
                      ) : (
                        <AiMarkdownMessage text={message.text} streaming={message.streaming} />
                      )}
                    </div>
                    {message.role === "ai" && message.citations && message.citations.length > 0 && !message.streaming ? (
                      <div className="mt-2.5 w-full">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-txt3">
                          <Icon name="link" size={12} />
                          근거 노트 {message.citations.length}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.citations.map((citation, sourceIndex) => {
                            const note = notes.find((item) => item.id === citation.noteId);
                            const color = note ? clusterById(note.cluster).color : "108,99,216";
                            return (
                              <button
                                key={`${message.id}-${citation.noteId || sourceIndex}`}
                                type="button"
                                disabled={!citation.noteId}
                                onClick={() => citation.noteId && router.push(`/notes/${citation.noteId}`)}
                                className="card flex h-9 items-center gap-2 rounded-xl px-3 transition-colors hover:border-primary/45 disabled:cursor-default"
                              >
                                <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${color})` }} />
                                <span className="max-w-[160px] truncate text-[14.5px] text-txt2">{citation.title}</span>
                                <span className="text-[12px] font-mono text-txt3">[{sourceIndex + 1}]</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {canSaveDraft ? (
                      <div className="mt-2.5 flex w-full items-center justify-between gap-2 border-t border-line/50 pt-2.5">
                        <span className={cx(
                          "min-w-0 truncate text-[12px]",
                          saveStatus === "error" ? "text-red-600 dark:text-red-300" : "text-txt3"
                        )}>
                          {isSavedDraft ? "Workspace 노트로 저장됨" : saveStatus === "error" ? saveState?.error : "AI 답변을 새 노트로 저장할 수 있어요"}
                        </span>
                        <button
                          type="button"
                          disabled={isSavingDraft}
                          onClick={() => saveAiMessageAsNote(message)}
                          className={cx(
                            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60",
                            isSavedDraft
                              ? "bg-txt/10 text-txt hover:bg-txt/15"
                              : "bg-primary text-white hover:bg-primary/90"
                          )}
                        >
                          <Icon name={isSavingDraft ? "refresh" : isSavedDraft ? "doc" : "plus"} size={13} />
                          {isSavingDraft ? "저장 중" : isSavedDraft ? "노트 열기" : "초안을 노트로 저장"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-line/50 p-4">
          <div className="mx-auto max-w-2xl">
            <div className="card flex items-end gap-2 rounded-2xl p-2 transition-colors focus-within:border-primary/50">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                disabled={composerDisabled}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={activeThreadArchived ? "보관된 대화는 보관 해제 후 이어서 쓸 수 있습니다." : "내 노트에게 질문하기…  (Shift+Enter 줄바꿈)"}
                className="scroll max-h-[min(240px,32svh)] min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 text-[15.5px] leading-6 text-txt outline-none placeholder:text-[15px] placeholder:text-txt3 disabled:cursor-wait"
              />
              <button
                type="button"
                onClick={() => ask(input)}
                disabled={!input.trim() || composerDisabled}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white hover:brightness-110 disabled:opacity-40"
                aria-label="메시지 보내기"
              >
                <Icon name="send" size={17} />
              </button>
            </div>
            <p className="mt-2 text-center text-[13px] text-txt3">
              {activeThreadArchived ? "보관된 대화입니다. 보관 해제 후 새 메시지를 보낼 수 있습니다." : `BrainX는 당신의 노트를 근거로 답합니다 · ${model.name}`}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden w-72 shrink-0 flex-col border-l border-line/50 bg-bg2/30 lg:flex">
        <div className="flex items-center gap-2 border-b border-line/50 p-4 text-[15px] font-semibold text-txt2">
          <Icon name="doc" size={15} />
          참조·근거 노트
        </div>
        <div className="scroll flex-1 space-y-2.5 overflow-y-auto p-3">
          <div className="px-1 text-[13px] text-txt3">현재 대화에서 인용된 노트</div>
          {referencedCitations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line/60 px-3 py-4 text-[13px] leading-5 text-txt3">
              답변이 노트를 인용하면 여기에 표시됩니다.
            </div>
          ) : null}
          {referencedCitations.map((citation, index) => {
            const note = notes.find((item) => item.id === citation.noteId);
            const color = note ? clusterById(note.cluster).color : "108,99,216";
            const relevance = citation.score == null ? null : Math.round(Math.max(0, Math.min(1, citation.score)) * 100);
            return (
              <button
                key={citation.noteId || `${citation.title}-${index}`}
                type="button"
                disabled={!citation.noteId}
                onClick={() => citation.noteId && router.push(`/notes/${citation.noteId}`)}
                className="card w-full rounded-xl p-3 text-left transition-colors hover:border-primary/45 disabled:cursor-default"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${color})` }} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt">{citation.title}</span>
                </div>
                <p className="mb-2 line-clamp-2 text-[13.5px] text-txt3">
                  {citation.sourcePath || citation.sourceFilename || note?.summary || "RAG 검색 근거로 사용된 노트입니다."}
                </p>
                {relevance == null ? null : <RelevanceBar value={relevance} />}
              </button>
            );
          })}
        </div>
      </div>
      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/55 px-4"
          role="presentation"
          onClick={() => {
            if (!threadActionLoadingId) setDeleteCandidate(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-thread-delete-title"
            aria-describedby="chat-thread-delete-description"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-line/70 bg-surface p-5 shadow-2xl"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <Trash2 size={18} aria-hidden="true" />
            </div>
            <h2 id="chat-thread-delete-title" className="text-[16px] font-bold text-txt">대화를 삭제할까요?</h2>
            <p id="chat-thread-delete-description" className="mt-2 break-words text-[13px] leading-6 text-txt3">
              "{deleteCandidate.title}" 대화가 목록과 조회 화면에서 숨겨집니다. 이 작업은 v1에서 복원할 수 없습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(threadActionLoadingId)}
                onClick={() => setDeleteCandidate(null)}
                className="h-9 rounded-lg border border-line/60 px-3 text-[13px] font-semibold text-txt2 transition-colors hover:bg-surface2/70 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={Boolean(threadActionLoadingId)}
                onClick={() => confirmDeleteThread()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-[13px] font-bold text-white transition-colors hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:cursor-wait disabled:opacity-60"
              >
                <Trash2 size={13} aria-hidden="true" />
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
