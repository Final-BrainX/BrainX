"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveAgentAction,
  createAgentThread,
  getAgentThread,
  listAgentThreads,
  listAiModels,
  rejectAgentAction,
  sendAgentMessageStream,
  type AgentActionData,
  type AgentThreadData,
  type AgentThreadDetailData,
  type AgentThreadListData,
} from "@/lib/intelligence-api";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

const THREAD_PAGE_SIZE = 20;
const FALLBACK_MODEL_ID = "gpt-5.4-mini";

type AgentThreadListItem = AgentThreadListData["threads"][number];
type AgentMessageData = AgentThreadDetailData["messages"][number];

type AgentModelOption = {
  id: string;
  name: string;
  sub: string;
};

type AgentMessageView = {
  id: string;
  role: "agent" | "user";
  text: string;
  modelId?: string | null;
  createdAt?: string;
  streaming?: boolean;
  error?: boolean;
  actions: AgentActionData[];
};

const FALLBACK_MODEL: AgentModelOption = {
  id: FALLBACK_MODEL_ID,
  name: "GPT 5.4 Mini",
  sub: "기본 모델",
};

function modelOptionFromId(modelId: string, options: AgentModelOption[]) {
  return options.find((item) => item.id === modelId) ?? {
    id: modelId,
    name: modelId,
    sub: "Thread model",
  };
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "요청 처리에 실패했습니다.";
}

function titleFromPrompt(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (!normalized) return "Agent thread";
  return normalized.length <= 50 ? normalized : `${normalized.slice(0, 50).trim()}...`;
}

function toMessageView(message: AgentMessageData): AgentMessageView {
  return {
    id: message.messageId,
    role: message.role === "USER" ? "user" : "agent",
    text: message.content,
    modelId: message.modelId,
    createdAt: message.createdAt,
    actions: message.actions ?? [],
  };
}

function noteIdFromAction(action: AgentActionData) {
  const result = action.result;
  if (!result || typeof result !== "object") return null;
  const noteId = (result as Record<string, unknown>).noteId;
  return typeof noteId === "string" && noteId ? noteId : null;
}

function actionStatusLabel(status: AgentActionData["status"]) {
  switch (status) {
    case "PENDING_APPROVAL":
      return "승인 대기";
    case "APPROVED":
      return "승인됨";
    case "EXECUTING":
      return "실행 중";
    case "SUCCEEDED":
      return "완료";
    case "FAILED":
      return "실패";
    case "REJECTED":
      return "취소됨";
    default:
      return "상태 확인";
  }
}

function actionTypeLabel(type: AgentActionData["actionType"]) {
  return type === "CREATE_NOTE" ? "새 노트 생성" : "기존 노트에 추가";
}

function ActionCard({
  action,
  loadingActionId,
  onApprove,
  onReject,
}: {
  action: AgentActionData;
  loadingActionId: string | null;
  onApprove: (action: AgentActionData) => void;
  onReject: (action: AgentActionData) => void;
}) {
  const noteId = noteIdFromAction(action);
  const busy = loadingActionId === action.actionId || action.status === "EXECUTING";
  const pending = action.status === "PENDING_APPROVAL";

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-surface/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:bg-surface2/30">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon name={action.actionType === "CREATE_NOTE" ? "doc" : "plus"} size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words text-[14px] font-bold text-txt">{action.title}</h3>
            <span className="rounded-full border border-line/60 bg-surface2/70 px-2 py-0.5 text-[11px] font-semibold text-txt3">
              {actionTypeLabel(action.actionType)}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {actionStatusLabel(action.status)}
            </span>
          </div>
          {action.summary ? <p className="mt-1.5 break-words text-[12px] leading-5 text-txt3">{action.summary}</p> : null}
        </div>
      </div>

      {action.previewMarkdown ? (
        <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line/50 bg-bg2/80 p-3 text-[12px] leading-5 text-txt2">
          {action.previewMarkdown}
        </pre>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {noteId ? (
          <button
            type="button"
            onClick={() => window.location.assign(`/notes/${encodeURIComponent(noteId)}`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line/60 px-3 text-[12px] font-semibold text-txt2 transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Icon name="doc" size={13} />
            노트 열기
          </button>
        ) : null}
        {pending ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject(action)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line/60 px-3 text-[12px] font-semibold text-txt2 transition-colors hover:border-red-300 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon name="x" size={13} />
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(action)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon name={busy ? "refresh" : "check"} size={13} className={busy ? "animate-spin" : ""} />
              {busy ? "실행 중" : "실행"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AgentScreen() {
  const router = useRouter();
  const { pushToast, effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [threads, setThreads] = useState<AgentThreadListItem[]>([]);
  const [activeThread, setActiveThread] = useState<AgentThreadData | null>(null);
  const [messages, setMessages] = useState<AgentMessageView[]>([]);
  const [models, setModels] = useState<AgentModelOption[]>([FALLBACK_MODEL]);
  const [model, setModel] = useState<AgentModelOption>(FALLBACK_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [input, setInput] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const activeTitle = activeThread?.title ?? "새 Agent 대화";
  const composerDisabled = streaming;
  const modelPickerLocked = Boolean(activeThread);

  useEffect(() => {
    let cancelled = false;
    listAiModels()
      .then((data) => {
        if (cancelled) return;
        const enabled = data.models
          .filter((item) => item.enabled !== false)
          .map((item) => ({
            id: item.modelId,
            name: item.name,
            sub: item.provider,
          }));
        if (enabled.length > 0) {
          setModels(enabled);
          setModel(enabled[0]);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    setModel(modelOptionFromId(activeThread.modelId, models));
    setModelOpen(false);
  }, [activeThread, models]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const starterPrompts = useMemo(
    () => [
      "방금 대화 내용을 문서로 저장해줘",
      "이 내용을 기존 노트에 추가할 수 있게 작업으로 만들어줘",
      "내가 실행할 수 있는 노트 작업을 제안해줘",
    ],
    []
  );

  async function loadThreads(selectFirst = true) {
    setThreadsLoading(true);
    try {
      const data = await listAgentThreads({ limit: THREAD_PAGE_SIZE });
      setThreads(data.threads);
      if (selectFirst && !activeThread && data.threads.length > 0) {
        await openThread(data.threads[0].threadId);
      }
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThread(threadId: string) {
    setThreadDetailLoading(true);
    try {
      const detail = await getAgentThread(threadId);
      setActiveThread(detail.thread);
      setModel(modelOptionFromId(detail.thread.modelId, models));
      setModelOpen(false);
      setMessages(detail.messages.map(toMessageView));
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setThreadDetailLoading(false);
    }
  }

  function updateAction(nextAction: AgentActionData) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        actions: message.actions.map((action) => (action.actionId === nextAction.actionId ? nextAction : action)),
      }))
    );
  }

  async function approve(action: AgentActionData) {
    setLoadingActionId(action.actionId);
    try {
      const next = await approveAgentAction(action.actionId);
      updateAction(next);
      if (next.status === "SUCCEEDED") {
        pushToast("Agent 작업을 실행했습니다.", "ok");
      } else if (next.status === "FAILED") {
        const message = next.error && typeof next.error === "object" ? String((next.error as Record<string, unknown>).message ?? "") : "";
        pushToast(message || "Agent 작업 실행에 실패했습니다.", "err");
      }
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setLoadingActionId(null);
    }
  }

  async function reject(action: AgentActionData) {
    setLoadingActionId(action.actionId);
    try {
      const next = await rejectAgentAction(action.actionId);
      updateAction(next);
      pushToast("Agent 작업을 취소했습니다.", "info");
    } catch (error) {
      pushToast(messageFromError(error), "err");
    } finally {
      setLoadingActionId(null);
    }
  }

  async function ensureThread(prompt: string) {
    if (activeThread) return activeThread;
    const created = await createAgentThread({
      title: titleFromPrompt(prompt),
      initialMessage: prompt,
      modelId: model.id,
    });
    setActiveThread(created);
    setThreads((current) => [
      {
        threadId: created.threadId,
        documentGroupId: created.documentGroupId,
        title: created.title,
        modelId: created.modelId,
        createdAt: created.createdAt,
        lastMessageAt: created.createdAt,
        lastMessagePreview: null,
        messageCount: 0,
      },
      ...current,
    ]);
    return created;
  }

  async function ask(raw: string) {
    const prompt = raw.trim();
    if (!prompt || streaming) return;
    setInput("");
    setStreaming(true);
    const optimisticModelId = activeThread?.modelId ?? model.id;
    const tempUserId = `local-user-${Date.now()}`;
    const tempAgentId = `local-agent-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: tempUserId, role: "user", text: prompt, modelId: optimisticModelId, actions: [] },
      { id: tempAgentId, role: "agent", text: "", modelId: optimisticModelId, streaming: true, actions: [] },
    ]);

    try {
      const thread = await ensureThread(prompt);
      await sendAgentMessageStream(
        thread.threadId,
        { message: prompt, modelId: thread.modelId },
        {
          onDelta: (text) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAgentId || message.streaming
                  ? { ...message, text: `${message.text}${text}`, streaming: true }
                  : message
              )
            );
          },
          onActionProposed: (action) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAgentId || message.streaming
                  ? { ...message, id: action.messageId, actions: [...message.actions, action] }
                  : message
              )
            );
          },
          onDone: (done) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === tempAgentId || message.streaming
                  ? { ...message, id: done.messageId, streaming: false }
                  : message
              )
            );
          },
          onError: (error) => {
            const message = typeof error === "object" && error && "message" in error ? String(error.message ?? "") : "Agent 응답 생성에 실패했습니다.";
            setMessages((current) =>
              current.map((item) =>
                item.id === tempAgentId || item.streaming
                  ? { ...item, text: message, streaming: false, error: true }
                  : item
              )
            );
          },
        }
      );
      await loadThreads(false);
    } catch (error) {
      const message = messageFromError(error);
      setMessages((current) =>
        current.map((item) => (item.id === tempAgentId || item.streaming ? { ...item, text: message, streaming: false, error: true } : item))
      );
      pushToast(message, "err");
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function newThread() {
    setActiveThread(null);
    setMessages([]);
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 bg-bg2">
      <aside className="hidden w-[276px] shrink-0 border-r border-line/50 bg-surface/35 md:flex md:flex-col">
        <div className="border-b border-line/50 p-4">
          <button
            type="button"
            disabled={streaming}
            onClick={newThread}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14px] font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="plus" size={15} />
            새 Agent 대화
          </button>
        </div>
        <div className="scroll flex-1 space-y-1 overflow-y-auto p-3">
          {threadsLoading && threads.length === 0 ? (
            <div className="p-3 text-[13px] text-txt3">Agent 대화를 불러오는 중입니다.</div>
          ) : null}
          {threads.map((thread) => {
            const active = activeThread?.threadId === thread.threadId;
            return (
              <button
                key={thread.threadId}
                type="button"
                disabled={streaming}
                onClick={() => openThread(thread.threadId)}
                className={cx(
                  "w-full rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
                  active ? "bg-surface2/85 text-txt" : "text-txt2 hover:bg-surface2/55 hover:text-txt"
                )}
              >
                <div className="truncate text-[13px] font-semibold">{thread.title}</div>
                <div className="mt-1 truncate text-[12px] text-txt3">{thread.lastMessagePreview ?? "작업을 시작해보세요"}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/50 px-5">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-txt">
            <Icon name="brain" size={18} className="text-primary" />
            Agent 실험
          </div>
          <div className="min-w-0 truncate text-[14px] text-txt3">{activeTitle}</div>
          <div className="flex-1" />
          <div className="relative">
            <button
              type="button"
              disabled={streaming || modelPickerLocked}
              onClick={() => setModelOpen((current) => !current)}
              className="flex h-[34px] items-center gap-2 rounded-xl border border-line/60 bg-surface/60 px-3 text-[14px] text-txt transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="h-2 w-2 rounded-full bg-cyan" />
              <span className="max-w-[120px] truncate">{model.name}</span>
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
                    className={cx(
                      "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left transition-colors",
                      model.id === item.id ? "bg-surface2/70" : "hover:bg-surface2/50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-txt">{item.name}</span>
                      <span className="block truncate text-[12px] text-txt3">{item.sub}</span>
                    </span>
                    {model.id === item.id ? <Icon name="check" size={15} className="text-primary" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div ref={scrollRef} className="scroll flex-1 overflow-y-auto">
          {threadDetailLoading ? (
            <div className="grid h-full place-items-center text-[14px] text-txt3">Agent 대화를 불러오는 중입니다.</div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-[860px] flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)] backdrop-blur dark:border-white/10 dark:bg-transparent dark:shadow-none">
                <Icon name="brain" size={25} className="text-primary" />
              </div>
              <h2 className="text-[28px] font-bold tracking-tight text-txt">작업을 제안하는 Agent를 시험해보세요</h2>
              <p className="mt-2 max-w-[560px] text-[15px] leading-7 text-txt2">
                Agent는 저장이나 수정 작업을 바로 실행하지 않고, 승인 가능한 작업 카드로 먼저 제안합니다.
              </p>
              <div className="mt-7 grid w-full gap-3 md:grid-cols-3">
                {starterPrompts.map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={streaming}
                    onClick={() => ask(prompt)}
                    className={cx(
                      "rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
                      isLight
                        ? "border-line/60 bg-white/85 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-primary/25"
                        : "border-white/10 bg-transparent hover:border-primary/30"
                    )}
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon name={index === 0 ? "doc" : index === 1 ? "plus" : "sparkle"} size={18} />
                    </div>
                    <div className="break-words text-[13px] font-semibold text-txt">{prompt}</div>
                    <div className="mt-3 text-[12px] font-medium text-primary">시작하기</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
              {messages.map((message) => (
                <div key={message.id} className={cx("flex gap-3", message.role === "user" ? "flex-row-reverse" : "")}>
                  {message.role === "agent" ? (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
                      <Icon name="brain" size={17} className="text-white" />
                    </div>
                  ) : (
                    <Avatar name="사용자" size={32} />
                  )}
                  <div className={cx("min-w-0 flex max-w-full flex-1 flex-col", message.role === "user" ? "items-end" : "")}>
                    <div
                      className={cx(
                        "max-w-full rounded-2xl px-4 py-3",
                        message.role === "user"
                          ? "bg-primary text-white"
                          : message.error
                            ? "border border-red-300/70 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/20 dark:text-red-200"
                            : "card"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-[16px] leading-[1.75]">{message.text || (message.streaming ? "생각하는 중..." : "")}</p>
                    </div>
                    {message.actions.map((action) => (
                      <ActionCard
                        key={action.actionId}
                        action={action}
                        loadingActionId={loadingActionId}
                        onApprove={approve}
                        onReject={reject}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line/50 p-4">
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
                    void ask(input);
                  }
                }}
                placeholder="Agent에게 작업을 요청해보세요"
                aria-label="Agent 메시지 입력"
                className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-3 py-2 text-[16px] leading-6 outline-none placeholder:text-txt3 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled={!input.trim() || composerDisabled}
                onClick={() => ask(input)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Agent 메시지 전송"
              >
                <Icon name={streaming ? "refresh" : "send"} size={17} className={streaming ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-2 break-words px-1 text-[12px] text-txt3">
              Agent 작업은 승인 전 실행되지 않습니다. v1은 새 노트 생성과 기존 노트에 추가만 지원합니다.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
