import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import type { BrainXNote } from "@/lib/brainx-data";
import { clusterById } from "@/lib/brainx-data";
import { Avatar, Icon } from "@/components/brainx-ui";
import { canSaveAiMessageDraft } from "@/components/chat/chat-draft-utils";
import { AiMarkdownMessage } from "@/components/chat/chat-markdown";
import type {
  ChatMessageView,
  DraftNoteSaveState,
} from "@/components/chat/types";
import type { LlmFeedbackRating } from "@/lib/intelligence-api";
import { cx } from "@/lib/utils";

const CHAT_MESSAGE_ACTION_CLASS =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-txt transition-colors hover:bg-txt/10 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50";

type ChatMessageItemProps = {
  message: ChatMessageView;
  saveState?: DraftNoteSaveState;
  notes: BrainXNote[];
  onOpenNote: (noteId: string) => void;
  onCopyMessage: (message: ChatMessageView) => void;
  onSaveAiMessageAsNote: (message: ChatMessageView) => void;
  onSubmitFeedback: (message: ChatMessageView, rating: LlmFeedbackRating) => void;
  feedbackLoading: boolean;
};

export function ChatMessageItem({
  message,
  saveState,
  notes,
  onOpenNote,
  onCopyMessage,
  onSaveAiMessageAsNote,
  onSubmitFeedback,
  feedbackLoading,
}: ChatMessageItemProps) {
  const saveStatus = saveState?.status ?? "idle";
  const isSavingDraft = saveStatus === "saving";
  const isSavedDraft = saveStatus === "saved" && !!saveState?.noteId;
  const canSaveDraft = canSaveAiMessageDraft(message);
  const canSubmitFeedback =
    message.role === "ai" &&
    !message.streaming &&
    !message.error &&
    Boolean(message.llmRunId);
  const webSearchProgressText =
    message.webSearchProgress?.message ||
    (message.webSearchProgress?.status
      ? `웹 검색 ${message.webSearchProgress.status}`
      : "웹 검색 중");

  return (
    <div
      className={cx(
        "group/message flex gap-3",
        message.role === "user" ? "flex-row-reverse" : "",
      )}
    >
      {message.role === "ai" ? (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
          <Icon name="brain" size={17} className="text-white" />
        </div>
      ) : (
        <Avatar name="연우" size={32} />
      )}
      <div
        className={cx(
          "min-w-0 flex flex-col",
          message.role === "user" ? "items-end" : "",
        )}
      >
        <div
          className={cx(
            "rounded-2xl px-4 py-3",
            message.role === "user"
              ? "bg-primary text-white"
              : message.error
                ? "border border-red-300/70 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/20 dark:text-red-200"
                : "card",
          )}
        >
          {message.role === "user" ? (
            <p className="whitespace-pre-wrap text-[16.5px] leading-relaxed">
              {message.text}
            </p>
          ) : (
            <AiMarkdownMessage
              text={message.text}
              streaming={message.streaming}
            />
          )}
        </div>
        {message.role === "ai" &&
        message.streaming &&
        message.streamPhase === "WEB_SEARCHING" ? (
          <div className="mt-2 flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-[12.5px] text-txt2">
            <Icon
              name="refresh"
              size={13}
              className="shrink-0 animate-spin text-primary"
            />
            <span className="min-w-0 truncate">
              웹 검색 중…
              {message.webSearchQuery ? `: ${message.webSearchQuery}` : ""}
            </span>
            {message.webSearchProgress?.message ||
            message.webSearchProgress?.status ? (
              <span className="min-w-0 truncate text-[11.5px] text-txt3">
                {webSearchProgressText}
              </span>
            ) : null}
          </div>
        ) : null}
        {message.role === "ai" &&
        message.citations &&
        message.citations.length > 0 &&
        !message.streaming ? (
          <div className="mt-2.5 w-full">
            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-txt3">
              <Icon name="link" size={12} />
              근거 노트 {message.citations.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {message.citations.map((citation, sourceIndex) => {
                const note = notes.find((item) => item.id === citation.noteId);
                const color = note
                  ? clusterById(note.cluster).color
                  : "108,99,216";
                return (
                  <button
                    key={`${message.id}-${citation.noteId || sourceIndex}`}
                    type="button"
                    disabled={!citation.noteId}
                    onClick={() =>
                      citation.noteId && onOpenNote(citation.noteId)
                    }
                    className="card flex h-9 items-center gap-2 rounded-xl px-3 transition-colors hover:border-primary/45 disabled:cursor-default"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: `rgb(${color})` }}
                    />
                    <span className="max-w-[160px] truncate text-[14.5px] text-txt2">
                      {citation.title}
                    </span>
                    <span className="text-[12px] font-mono text-txt3">
                      [{sourceIndex + 1}]
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {message.role === "ai" &&
        message.webSources &&
        message.webSources.length > 0 ? (
          <div className="mt-2.5 w-full">
            <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-txt3">
              <Icon name="search" size={12} />
              웹 출처 {message.webSources.length}
            </div>
            <div className="space-y-2">
              {message.webSources.map((source) => (
                <a
                  key={`${message.id}-${source.rank}-${source.url}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-start gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-left transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Icon
                    name="link"
                    size={13}
                    className="mt-0.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-txt">
                      {source.title || source.url}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-txt3">
                      {webSourceHost(source.url)}
                    </span>
                    {source.snippet ? (
                      <span className="mt-1 block truncate text-[12.5px] leading-5 text-txt2">
                        {source.snippet}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-txt3">
                    [W{source.rank}]
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {message.role === "user" ? (
          <div className="pointer-events-none mt-1 flex h-7 justify-end opacity-0 transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100">
            <CopyMessageButton message={message} onCopy={onCopyMessage} />
          </div>
        ) : message.streaming ? null : (
          <div
            className={cx(
              "flex w-full flex-wrap items-center gap-2 mt-1",
              canSaveDraft
                ? "justify-between border-t border-line/50"
                : "justify-start",
            )}
          >
            {canSaveDraft ? (
              <span
                className={cx(
                  "min-w-0 flex-1 truncate text-[12px]",
                  saveStatus === "error"
                    ? "text-red-600 dark:text-red-300"
                    : "text-txt3",
                )}
              >
                {isSavedDraft
                  ? "Workspace 노트로 저장됨"
                  : saveStatus === "error"
                    ? saveState?.error
                    : "AI 답변을 새 노트로 저장할 수 있어요"}
              </span>
            ) : null}
            <div className="flex shrink-0 items-center">
              {canSubmitFeedback ? (
                <FeedbackButtons
                  message={message}
                  loading={feedbackLoading}
                  onSubmit={onSubmitFeedback}
                />
              ) : null}
              <CopyMessageButton message={message} onCopy={onCopyMessage} />
              {canSaveDraft ? (
                <button
                  type="button"
                  disabled={isSavingDraft}
                  onClick={() => onSaveAiMessageAsNote(message)}
                  className={cx(
                    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60",
                    isSavedDraft
                      ? "bg-txt/10 text-txt hover:bg-txt/15"
                      : "bg-primary text-white hover:bg-primary/90",
                  )}
                >
                  <Icon
                    name={
                      isSavingDraft ? "refresh" : isSavedDraft ? "doc" : "plus"
                    }
                    size={13}
                  />
                  {isSavingDraft
                    ? "저장 중"
                    : isSavedDraft
                      ? "노트 열기"
                      : "초안을 노트로 저장"}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function webSourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function FeedbackButtons({
  message,
  loading,
  onSubmit,
}: {
  message: ChatMessageView;
  loading: boolean;
  onSubmit: (message: ChatMessageView, rating: LlmFeedbackRating) => void;
}) {
  return (
    <div className="mr-1 flex items-center gap-0.5">
      <FeedbackButton
        label="AI 응답 좋아요"
        selected={message.feedbackRating === "LIKE"}
        disabled={loading}
        onClick={() => onSubmit(message, "LIKE")}
      >
        <ThumbsUp size={13} />
      </FeedbackButton>
      <FeedbackButton
        label="AI 응답 싫어요"
        selected={message.feedbackRating === "DISLIKE"}
        disabled={loading}
        onClick={() => onSubmit(message, "DISLIKE")}
      >
        <ThumbsDown size={13} />
      </FeedbackButton>
    </div>
  );
}

function FeedbackButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        CHAT_MESSAGE_ACTION_CLASS,
        "px-2",
        selected
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "text-txt3",
      )}
    >
      {children}
    </button>
  );
}

function CopyMessageButton({
  message,
  onCopy,
}: {
  message: ChatMessageView;
  onCopy: (message: ChatMessageView) => void;
}) {
  const canCopy = Boolean(message.text.trim());
  return (
    <button
      type="button"
      disabled={!canCopy}
      onClick={() => onCopy(message)}
      aria-label={message.role === "user" ? "내 메시지 복사" : "AI 응답 복사"}
      className={CHAT_MESSAGE_ACTION_CLASS}
    >
      <Icon name="copy" size={13} />
    </button>
  );
}
