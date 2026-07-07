import { Compass, PencilLine, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import type { BrainXNote } from "@/lib/brainx-data";
import { Icon } from "@/components/brainx-ui";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";
import type {
  ChatMessageView,
  DraftNoteSaveState,
} from "@/components/chat/types";
import type { LlmFeedbackRating } from "@/lib/intelligence-api";
import { cx } from "@/lib/utils";

const SUGGESTION_CARDS = [
  {
    step: "1",
    label: "노트 작성",
    desc: "먼저 생각을 적어두면 AI가 연결을 더 잘 이해해요.",
    icon: PencilLine,
    tone: "from-[#EFEAFF] to-[#F7F5FF]",
    accent: "text-[#6C63D8]",
    promptIndex: 1,
  },
  {
    step: "2",
    label: "AI 연결",
    desc: "관련 노트와 문맥을 함께 읽으며 답을 풍부하게 만들어요.",
    icon: Sparkles,
    tone: "from-[#EAF8F2] to-[#F5FBF8]",
    accent: "text-[#4BC3AC]",
    promptIndex: 0,
  },
  {
    step: "3",
    label: "그래프 탐색",
    desc: "대화로 찾은 주제를 그래프에서 더 넓게 살펴보세요.",
    icon: Compass,
    tone: "from-[#EAF1FF] to-[#F5F8FF]",
    accent: "text-[#5BA8F0]",
    promptIndex: 2,
  },
] as const;

type ChatConversationProps = {
  scrollRef: RefObject<HTMLDivElement | null>;
  threadDetailLoading: boolean;
  messages: ChatMessageView[];
  draftSaveStates: Record<string, DraftNoteSaveState>;
  notes: BrainXNote[];
  isLight: boolean;
  streaming: boolean;
  suggestions: string[];
  onAsk: (question: string) => void;
  onOpenNote: (noteId: string) => void;
  onCopyMessage: (message: ChatMessageView) => void;
  onSaveAiMessageAsNote: (message: ChatMessageView) => void;
  onSubmitFeedback: (message: ChatMessageView, rating: LlmFeedbackRating) => void;
  feedbackLoadingByRunId: Record<string, boolean>;
};

export function ChatConversation({
  scrollRef,
  threadDetailLoading,
  messages,
  draftSaveStates,
  notes,
  isLight,
  streaming,
  suggestions,
  onAsk,
  onOpenNote,
  onCopyMessage,
  onSaveAiMessageAsNote,
  onSubmitFeedback,
  feedbackLoadingByRunId,
}: ChatConversationProps) {
  return (
    <div ref={scrollRef} className="scroll flex-1 overflow-y-auto">
      {threadDetailLoading ? (
        <div className="flex h-full items-center justify-center text-[14px] text-txt3">
          대화를 불러오는 중입니다.
        </div>
      ) : messages.length === 0 ? (
        <div className="mx-auto flex h-full max-w-[860px] flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)] backdrop-blur dark:border-white/10 dark:bg-transparent dark:shadow-none">
            <Icon name="brain" size={24} className="text-primary" />
          </div>
          <h2 className="text-[28px] font-bold tracking-tight text-txt">
            내 노트를 기반으로 질문해보세요
          </h2>
          <p className="mt-2 max-w-[560px] text-[15px] leading-7 text-txt2">
            BrainX는 노트에 적힌 맥락을 근거로 답하고, 필요한 경우 관련 출처를
            함께 보여줍니다.
          </p>
          <div className="mt-7 grid w-full gap-3 md:grid-cols-3">
            {SUGGESTION_CARDS.map((item) => (
              <button
                key={item.step}
                type="button"
                disabled={streaming}
                onClick={() => onAsk(suggestions[item.promptIndex])}
                className={cx(
                  "group relative overflow-hidden rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
                  isLight
                    ? "border-line/60 bg-white/85 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-primary/25 hover:shadow-[0_16px_34px_rgba(108,99,216,0.12)]"
                    : "border-white/10 bg-transparent shadow-none hover:border-primary/30",
                )}
              >
                <span
                  className={`absolute -right-1 top-1 text-[56px] font-extrabold leading-none ${item.accent} opacity-[0.08]`}
                >
                  {item.step}
                </span>
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} ${item.accent}`}
                >
                  <item.icon size={18} />
                </div>
                <div className="text-[13px] font-semibold text-txt">
                  {item.label}
                </div>
                <p className="mt-1.5 min-h-[44px] text-[12px] leading-6 text-txt2">
                  {item.desc}
                </p>
                <div className="mt-3 text-[12px] font-medium text-primary">
                  질문하기
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-2 px-5 py-6">
          {messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              saveState={draftSaveStates[message.id]}
              notes={notes}
              onOpenNote={onOpenNote}
              onCopyMessage={onCopyMessage}
              onSaveAiMessageAsNote={onSaveAiMessageAsNote}
              onSubmitFeedback={onSubmitFeedback}
              feedbackLoading={Boolean(
                message.llmRunId && feedbackLoadingByRunId[message.llmRunId],
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
