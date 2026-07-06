import { Trash2 } from "lucide-react";
import type { ThreadDeleteCandidate } from "@/components/chat/types";

type DeleteThreadDialogProps = {
  candidate: ThreadDeleteCandidate | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteThreadDialog({
  candidate,
  loading,
  onCancel,
  onConfirm,
}: DeleteThreadDialogProps) {
  if (!candidate) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/55 px-4"
      role="presentation"
      onClick={() => {
        if (!loading) onCancel();
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
        <h2
          id="chat-thread-delete-title"
          className="text-[16px] font-bold text-txt"
        >
          대화를 삭제할까요?
        </h2>
        <p
          id="chat-thread-delete-description"
          className="mt-2 break-words text-[13px] leading-6 text-txt3"
        >
          "{candidate.title}" 대화가 목록과 조회 화면에서 숨겨집니다. 이 작업은
          v1에서 복원할 수 없습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="h-9 rounded-lg border border-line/60 px-3 text-[13px] font-semibold text-txt2 transition-colors hover:bg-surface2/70 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-[13px] font-bold text-white transition-colors hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:cursor-wait disabled:opacity-60"
          >
            <Trash2 size={13} aria-hidden="true" />
            삭제
          </button>
        </div>
      </section>
    </div>
  );
}
