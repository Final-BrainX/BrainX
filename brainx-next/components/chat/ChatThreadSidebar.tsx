import {
  Archive,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { ChatThreadListStatus } from "@/lib/intelligence-api";
import { Btn } from "@/components/brainx-ui";
import { formatChatTime } from "@/components/chat/chat-utils";
import type { ChatThreadListItem } from "@/components/chat/types";
import { cx } from "@/lib/utils";

type ChatThreadSidebarProps = {
  threads: ChatThreadListItem[];
  activeThreadId: string | null;
  threadStatus: ChatThreadListStatus;
  threadActionOpenId: string | null;
  threadActionLoadingId: string | null;
  threadsLoading: boolean;
  hasMoreThreads: boolean;
  streaming: boolean;
  onStartNewThread: () => void;
  onSelectStatus: (status: ChatThreadListStatus) => void;
  onOpenThread: (threadId: string) => void;
  onToggleThreadAction: (threadId: string) => void;
  onArchiveThread: (thread: ChatThreadListItem, archived: boolean) => void;
  onRequestDeleteThread: (thread: ChatThreadListItem) => void;
  onLoadMore: () => void;
};

export function ChatThreadSidebar({
  threads,
  activeThreadId,
  threadStatus,
  threadActionOpenId,
  threadActionLoadingId,
  threadsLoading,
  hasMoreThreads,
  streaming,
  onStartNewThread,
  onSelectStatus,
  onOpenThread,
  onToggleThreadAction,
  onArchiveThread,
  onRequestDeleteThread,
  onLoadMore,
}: ChatThreadSidebarProps) {
  const threadSectionLabel =
    threadStatus === "archived" ? "보관한 대화" : "최근 대화";

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-line/50 bg-bg2/30">
      <div className="p-3">
        <Btn
          variant="primary"
          size="md"
          icon="plus"
          className="w-full"
          disabled={streaming}
          onClick={onStartNewThread}
        >
          새 대화
        </Btn>
      </div>
      <div className="px-3 pb-2">
        <div
          className="grid grid-cols-2 rounded-xl border border-line/60 bg-surface/50 p-1"
          role="tablist"
          aria-label="대화 목록 필터"
        >
          {(
            [
              ["active", "최근"],
              ["archived", "보관"],
            ] as const
          ).map(([status, label]) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={threadStatus === status}
              disabled={streaming || threadsLoading}
              onClick={() => onSelectStatus(status)}
              className={cx(
                "h-8 rounded-lg text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60",
                threadStatus === status
                  ? "bg-primary text-white"
                  : "text-txt3 hover:bg-surface2/70 hover:text-txt",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll flex-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 py-1.5 text-[12px] font-semibold text-txt3">
          {threadSectionLabel}
        </div>
        {threads.length === 0 && !threadsLoading ? (
          <div className="mx-2 rounded-xl border border-dashed border-line/60 px-3 py-4 text-[13px] leading-5 text-txt3">
            {threadStatus === "archived"
              ? "보관한 대화가 없습니다."
              : "저장된 대화가 없습니다."}
          </div>
        ) : null}
        {threads.map((thread) => (
          <div
            key={thread.threadId}
            className={cx(
              "relative mb-1 flex w-full items-start gap-1 rounded-xl p-1 transition-colors",
              activeThreadId === thread.threadId
                ? "bg-surface2/80"
                : "hover:bg-surface2/50",
            )}
          >
            <button
              type="button"
              disabled={streaming || threadActionLoadingId === thread.threadId}
              onClick={() => onOpenThread(thread.threadId)}
              className="min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="truncate text-[15px] font-medium text-txt">
                {thread.title}
              </div>
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
                onToggleThreadAction(thread.threadId);
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
                  if (event.key === "Escape") onToggleThreadAction(thread.threadId);
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(threadActionLoadingId)}
                  onClick={() =>
                    onArchiveThread(thread, threadStatus !== "archived")
                  }
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-medium text-txt2 transition-colors hover:bg-surface2 hover:text-txt focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50"
                >
                  {threadStatus === "archived" ? (
                    <RotateCcw size={13} aria-hidden="true" />
                  ) : (
                    <Archive size={13} aria-hidden="true" />
                  )}
                  {threadStatus === "archived" ? "보관 해제" : "보관"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(threadActionLoadingId)}
                  onClick={() => onRequestDeleteThread(thread)}
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
            onClick={onLoadMore}
            className="mt-2 h-9 w-full rounded-xl border border-line/60 text-[13px] font-medium text-txt2 transition-colors hover:border-primary/40 hover:text-txt disabled:cursor-wait disabled:opacity-50"
          >
            {threadsLoading ? "불러오는 중" : "더 불러오기"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
