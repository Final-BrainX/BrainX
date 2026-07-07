"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AiUsageLimitExceededError,
  createChatThread,
  deleteChatThread,
  getChatThread,
  listAiModels,
  listChatThreads,
  sendChatMessageStream,
  updateChatThread,
  upsertLlmFeedback,
  type ChatThreadData,
  type ChatThreadListStatus,
  type LlmFeedbackRating,
} from "@/lib/intelligence-api";
import { createWorkspaceNoteFromPayload, matchesWorkspaceScope } from "@/lib/workspace-api";
import { useBrainX } from "@/components/brainx-provider";
import { useWorkspace } from "@/components/workspace-provider";
import {
  buildChatDraftMarkdown,
  CHAT_DRAFT_NOTE_TAGS,
  draftNoteSaveErrorMessage,
  noteTitleFromAiMessage,
  stripDuplicateDraftTitleHeading,
} from "@/components/chat/chat-draft-utils";
import {
  chatRouteFromEvent,
  messageFromError,
  messagesFromThread,
  threadBelongsToStatus,
  threadTitleFromQuestion,
  upsertThread,
} from "@/components/chat/chat-utils";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatThreadSidebar } from "@/components/chat/ChatThreadSidebar";
import { DeleteThreadDialog } from "@/components/chat/DeleteThreadDialog";
import { ReferencedNotesPanel } from "@/components/chat/ReferencedNotesPanel";
import type {
  ChatCitation,
  ChatMessageView,
  ChatModelOption,
  ChatRoute,
  ChatThreadListItem,
  DraftNoteSaveState,
  ThreadDeleteCandidate,
} from "@/components/chat/types";

const THREAD_PAGE_SIZE = 20;
const FALLBACK_MODEL_ID = "gpt-5.4-mini";

const FALLBACK_MODEL: ChatModelOption = {
  id: FALLBACK_MODEL_ID,
  name: "GPT 5.4 Mini",
  sub: "기본 모델",
};

const CHAT_SUGGESTIONS = [
  "내 노트에서 RAG 검색 품질 높이는 법을 정리해줘",
  "최근 작성한 노트들의 핵심 흐름을 요약해줘",
  "내 노트 기준으로 다음에 이어 쓸 주제를 추천해줘",
];

export function ChatScreen() {
  const router = useRouter();
  const { pushToast, notes, effectiveTheme, openAiUsageLimitModal } = useBrainX();
  const { currentWorkspaceId, workspaces } = useWorkspace();
  const isLight = effectiveTheme === "light";
  const [threads, setThreads] = useState<ChatThreadListItem[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [threadStatus, setThreadStatus] =
    useState<ChatThreadListStatus>("active");
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThreadData | null>(null);
  const [threadActionOpenId, setThreadActionOpenId] = useState<string | null>(
    null,
  );
  const [threadActionLoadingId, setThreadActionLoadingId] = useState<
    string | null
  >(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<ThreadDeleteCandidate | null>(null);
  const [models, setModels] = useState<ChatModelOption[]>([FALLBACK_MODEL]);
  const [model, setModel] = useState<ChatModelOption>(FALLBACK_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draftSaveStates, setDraftSaveStates] = useState<
    Record<string, DraftNoteSaveState>
  >({});
  const [feedbackLoadingByRunId, setFeedbackLoadingByRunId] = useState<
    Record<string, boolean>
  >({});
  const detailRequestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // NotesExplorer/TopBar 검색과 동일한 정책 — 사이드바에는 현재 Workspace 소속 스레드만 보여준다.
  // currentWorkspaceId가 null(Guest 또는 Workspace 미선택)이면 matchesWorkspaceScope가 항상
  // true라 기존처럼 전체 목록이 그대로 보인다. threads(원본 상태)는 페이지네이션/dedup 등 다른
  // 로직이 그대로 참조해야 하므로 건드리지 않고, 렌더링에만 이 필터링된 목록을 쓴다.
  const visibleThreads = useMemo(
    () => threads.filter((thread) => matchesWorkspaceScope(thread.documentGroupId, currentWorkspaceId, workspaces)),
    [threads, currentWorkspaceId, workspaces]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadThreadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadStatus]);

  // Workspace 전환 시 이전 Workspace의 스레드가 화면/전송 대상으로 계속 남지 않도록 초기화한다.
  // visibleThreads는 currentWorkspaceId 변경에 이미 반응하지만, activeThread/activeThreadId는
  // 별도 상태라 그대로 두면 (1) 메인 패널이 이전 Workspace 대화를 계속 보여주고 (2) ask()가
  // activeThread를 재사용해 새 메시지가 이전 Workspace의 스레드로 전송된다.
  useEffect(() => {
    clearActiveThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

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
          sub: item.provider || "사용 가능",
        }));
      const nextModels = available.length > 0 ? available : [FALLBACK_MODEL];
      setModels(nextModels);
      setModel(
        (current) =>
          nextModels.find((item) => item.id === current.id) ?? nextModels[0],
      );
    } catch {
      setModels([FALLBACK_MODEL]);
      setModel(FALLBACK_MODEL);
    }
  }

  async function loadThreadPage(
    reset = false,
    statusOverride?: ChatThreadListStatus,
  ) {
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
        status,
      });
      setThreads((current) =>
        reset ? data.threads : [...current, ...data.threads],
      );
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
    setFeedbackLoadingByRunId({});
    setInput("");
  }

  function startNewThread() {
    if (streaming) return;
    clearActiveThread();
  }

  async function refreshActiveThread(
    threadId: string,
    routeOverride?: {
      messageId?: string;
      route?: ChatRoute;
      requiresWebSearch?: boolean;
      webSearchQuery?: string | null;
    },
  ) {
    const detail = await getChatThread(threadId);
    setActiveThread(detail.thread);
    let nextMessages = messagesFromThread(detail);
    if (routeOverride?.route) {
      let applied = false;
      nextMessages = nextMessages.map((message) => {
        if (message.role !== "ai") return message;
        if (routeOverride.messageId && message.id !== routeOverride.messageId)
          return message;
        if (!routeOverride.messageId && applied) return message;
        applied = true;
        return {
          ...message,
          route: routeOverride.route,
          requiresWebSearch: routeOverride.requiresWebSearch,
          webSearchQuery: routeOverride.webSearchQuery ?? null,
        };
      });
    }
    setMessages(nextMessages);
  }

  async function setThreadArchived(
    thread: ChatThreadListItem,
    archived: boolean,
  ) {
    if (streaming || threadActionLoadingId) return;
    setThreadActionLoadingId(thread.threadId);
    setThreadActionOpenId(null);
    try {
      const updated = await updateChatThread(thread.threadId, { archived });
      const visibleInCurrentTab = threadBelongsToStatus(updated, threadStatus);
      setThreads((current) =>
        visibleInCurrentTab
          ? current.map((item) =>
              item.threadId === updated.threadId
                ? { ...item, ...updated }
                : item,
            )
          : current.filter((item) => item.threadId !== updated.threadId),
      );
      if (activeThreadId === updated.threadId) {
        if (visibleInCurrentTab) {
          setActiveThread(updated);
        } else {
          clearActiveThread();
        }
      }
      pushToast(
        archived ? "대화를 보관했습니다." : "대화를 보관 해제했습니다.",
        "ok",
      );
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
      setThreads((current) =>
        current.filter((item) => item.threadId !== candidate.threadId),
      );
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
      pushToast(
        "보관된 대화에는 새 메시지를 보낼 수 없습니다. 먼저 보관 해제해 주세요.",
        "info",
      );
      return;
    }

    const localUserId = `local-user-${Date.now()}`;
    const assistantId = `stream-${Date.now()}`;
    setInput("");
    setStreaming(true);
    setMessages((current) => [
      ...current,
      { id: localUserId, role: "user", text: trimmed },
      { id: assistantId, role: "ai", text: "", streaming: true },
    ]);

    let streamError: unknown = null;
    let streamRoute: ChatRoute | undefined;
    let streamRequiresWebSearch: boolean | undefined;
    let streamWebSearchQuery: string | null | undefined;
    let streamAssistantMessageId: string | undefined;
    let streamLlmRunId: string | null | undefined;

    try {
      let thread = activeThread;
      if (!thread) {
        const targetStatus: ChatThreadListStatus = "active";
        if (threadStatus !== "active") {
          setThreadStatus(targetStatus);
        }
        thread = await createChatThread({
          documentGroupId: currentWorkspaceId ?? undefined,
          title: threadTitleFromQuestion(trimmed),
          initialMessage: trimmed,
          modelId: model.id,
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
            items: [],
          },
          modelId: model.id,
        },
        {
          onRoute: (event) => {
            const route = chatRouteFromEvent(event);
            if (!route) return;
            streamRoute = route;
            streamRequiresWebSearch = Boolean(event.requiresWebSearch);
            streamWebSearchQuery =
              typeof event.webSearchQuery === "string" &&
              event.webSearchQuery.trim()
                ? event.webSearchQuery.trim()
                : null;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      route,
                      requiresWebSearch: streamRequiresWebSearch,
                      webSearchQuery: streamWebSearchQuery,
                    }
                  : message,
              ),
            );
          },
          onDelta: (text) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, text: message.text + text, streaming: true }
                  : message,
              ),
            );
          },
          onDone: (data) => {
            streamAssistantMessageId =
              typeof data?.messageId === "string" ? data.messageId : undefined;
            streamLlmRunId =
              typeof data?.llmRunId === "string" ? data.llmRunId : null;
            if (streamLlmRunId) {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, llmRunId: streamLlmRunId }
                    : message,
                ),
              );
            }
          },
          onError: (error) => {
            streamError = error;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      text: message.text || messageFromError(error),
                      streaming: false,
                      error: true,
                    }
                  : message,
              ),
            );
          },
        },
      );

      if (streamError) {
        await loadThreadPage(true, "active");
        return;
      }

      await refreshActiveThread(thread.threadId, {
        messageId: streamAssistantMessageId,
        route: streamRoute,
        requiresWebSearch: streamRequiresWebSearch,
        webSearchQuery: streamWebSearchQuery,
      });
      await loadThreadPage(true, "active");
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                text: message.text || messageFromError(error),
                streaming: false,
                error: true,
              }
            : message,
        ),
      );
      if (error instanceof AiUsageLimitExceededError) {
        openAiUsageLimitModal(error.reason);
      } else {
        pushToast(messageFromError(error), "err");
      }
    } finally {
      setStreaming(false);
    }
  }

  async function saveAiMessageAsNote(message: ChatMessageView) {
    const currentState = draftSaveStates[message.id];
    if (currentState?.status === "saving") return;
    if (currentState?.status === "saved" && currentState.noteId) {
      router.push(`/notes/${currentState.noteId}`);
      return;
    }

    const title = noteTitleFromAiMessage(message.text, activeThread?.title);
    const draftMarkdown = buildChatDraftMarkdown(message);
    if (!draftMarkdown.trim()) return;
    const markdown = stripDuplicateDraftTitleHeading(draftMarkdown, title);

    setDraftSaveStates((current) => ({
      ...current,
      [message.id]: { status: "saving" },
    }));

    try {
      const created = await createWorkspaceNoteFromPayload({
        title,
        markdown,
        folderId: null,
        tags: CHAT_DRAFT_NOTE_TAGS,
        documentGroupId: currentWorkspaceId ?? undefined,
      });
      setDraftSaveStates((current) => ({
        ...current,
        [message.id]: { status: "saved", noteId: created.noteId },
      }));
      window.dispatchEvent(
        new CustomEvent("brainx:notes-refresh", {
          detail: { noteId: created.noteId },
        }),
      );
      pushToast("AI 초안을 노트로 저장했어요.", "ok");
    } catch (error) {
      setDraftSaveStates((current) => ({
        ...current,
        [message.id]: {
          status: "error",
          error: draftNoteSaveErrorMessage(error),
        },
      }));
    }
  }

  async function copyChatMessage(message: ChatMessageView) {
    const text = message.text;
    if (!text.trim()) return;

    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      pushToast("메시지를 복사했습니다.", "ok");
    } catch {
      pushToast("복사하지 못했습니다. 직접 선택해 복사해 주세요.", "err");
    }
  }

  async function submitMessageFeedback(
    message: ChatMessageView,
    rating: LlmFeedbackRating,
  ) {
    const llmRunId = message.llmRunId;
    if (!llmRunId || message.feedbackRating === rating) return;

    const previousRating = message.feedbackRating ?? null;
    setFeedbackLoadingByRunId((current) => ({ ...current, [llmRunId]: true }));
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, feedbackRating: rating } : item,
      ),
    );

    try {
      await upsertLlmFeedback({ llmRunId, rating });
      pushToast(rating === "LIKE" ? "좋아요를 기록했습니다." : "싫어요를 기록했습니다.", "ok");
    } catch (error) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, feedbackRating: previousRating }
            : item,
        ),
      );
      pushToast(messageFromError(error), "err");
    } finally {
      setFeedbackLoadingByRunId((current) => {
        const next = { ...current };
        delete next[llmRunId];
        return next;
      });
    }
  }

  function selectThreadStatus(status: ChatThreadListStatus) {
    setThreadActionOpenId(null);
    setThreadStatus(status);
    clearActiveThread();
  }

  function toggleThreadAction(threadId: string) {
    setThreadActionOpenId((current) =>
      current === threadId ? null : threadId,
    );
  }

  function selectModel(nextModel: ChatModelOption) {
    setModel(nextModel);
    setModelOpen(false);
  }

  function openNote(noteId: string) {
    router.push(`/notes/${noteId}`);
  }

  const activeTitle = activeThread?.title ?? "새 대화";
  const activeThreadArchived = Boolean(activeThread?.archivedAt);
  const composerDisabled =
    streaming || threadDetailLoading || activeThreadArchived;

  return (
    <div data-route className="flex h-full">
      <ChatThreadSidebar
        threads={visibleThreads}
        activeThreadId={activeThreadId}
        threadStatus={threadStatus}
        threadActionOpenId={threadActionOpenId}
        threadActionLoadingId={threadActionLoadingId}
        threadsLoading={threadsLoading}
        hasMoreThreads={hasMoreThreads}
        streaming={streaming}
        onStartNewThread={startNewThread}
        onSelectStatus={selectThreadStatus}
        onOpenThread={(threadId) => void openThread(threadId)}
        onToggleThreadAction={toggleThreadAction}
        onArchiveThread={(thread, archived) =>
          void setThreadArchived(thread, archived)
        }
        onRequestDeleteThread={requestDeleteThread}
        onLoadMore={() => void loadThreadPage(false)}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <ChatHeader
          activeTitle={activeTitle}
          activeThreadArchived={activeThreadArchived}
          streaming={streaming}
          model={model}
          models={models}
          modelOpen={modelOpen}
          onToggleModelOpen={() => setModelOpen((current) => !current)}
          onCloseModelMenu={() => setModelOpen(false)}
          onSelectModel={selectModel}
        />
        <ChatConversation
          scrollRef={scrollRef}
          threadDetailLoading={threadDetailLoading}
          messages={messages}
          draftSaveStates={draftSaveStates}
          feedbackLoadingByRunId={feedbackLoadingByRunId}
          notes={notes}
          isLight={isLight}
          streaming={streaming}
          suggestions={CHAT_SUGGESTIONS}
          onAsk={(question) => void ask(question)}
          onOpenNote={openNote}
          onCopyMessage={(message) => void copyChatMessage(message)}
          onSaveAiMessageAsNote={(message) => void saveAiMessageAsNote(message)}
          onSubmitFeedback={(message, rating) =>
            void submitMessageFeedback(message, rating)
          }
        />
        <ChatComposer
          input={input}
          disabled={composerDisabled}
          activeThreadArchived={activeThreadArchived}
          modelName={model.name}
          onInputChange={setInput}
          onSubmit={(question) => void ask(question)}
        />
      </div>

      <ReferencedNotesPanel
        referencedCitations={referencedCitations}
        notes={notes}
        onOpenNote={openNote}
      />
      <DeleteThreadDialog
        candidate={deleteCandidate}
        loading={Boolean(threadActionLoadingId)}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void confirmDeleteThread()}
      />
    </div>
  );
}
