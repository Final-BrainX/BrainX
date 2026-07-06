"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { createWorkspace, WorkspaceApiError } from "@/lib/workspace-api";

interface Props {
  onClose: () => void;
}

/** Ticket12: 새 Workspace 생성 모달. ConfirmDialog.tsx의 portal + fixed overlay + Escape/backdrop
    닫기 패턴을 그대로 따른다. 생성 성공 시 목록 재조회 → 새 Workspace 자동 선택까지 이 컴포넌트가
    직접 처리한다(부모는 열림/닫힘 state만 관리). 이름 중복(409, WORKSPACE_NAME_DUPLICATE)은
    인라인 에러로, 그 외 실패는 toast로 보여준다. */
export default function CreateWorkspaceModal({ onClose }: Props) {
  const { pushToast } = useBrainX();
  const { refreshWorkspaces, switchWorkspace } = useWorkspace();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (submitting) return;
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, submitting]);

  const handleSubmit = async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setInlineError("Workspace 이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setInlineError(null);
    try {
      const created = await createWorkspace(trimmed);
      await refreshWorkspaces();
      switchWorkspace(created.documentGroupId);
      onClose();
      pushToast(`"${created.name}" Workspace를 만들었어요.`, "ok");
    } catch (error) {
      if (error instanceof WorkspaceApiError && error.code === "WORKSPACE_NAME_DUPLICATE") {
        setInlineError("이미 사용 중인 이름이에요. 다른 이름을 입력해 주세요.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      onClose();
      pushToast(error instanceof Error ? error.message : "Workspace 생성에 실패했습니다.", "err");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ background: "rgba(2, 6, 23, 0.55)" }}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] rounded-xl border border-line/60 p-4 shadow-2xl"
        style={{ background: "rgb(var(--surface))" }}
      >
        <h3 className="mb-1.5 text-[14px] font-semibold text-txt">새 Workspace 만들기</h3>
        <p className="mb-3 text-[12px] leading-relaxed text-txt3">
          Workspace마다 노트와 폴더가 완전히 분리돼요.
        </p>
        <input
          type="text"
          autoFocus
          value={name}
          disabled={submitting}
          onChange={(e) => {
            setName(e.target.value);
            if (inlineError) setInlineError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="새 Workspace"
          className="w-full rounded-lg border border-line/60 bg-surface2/40 px-3 py-2 text-[13px] text-txt outline-none transition-colors focus:border-primary/60 disabled:opacity-60"
        />
        {inlineError && <p className="mt-1.5 text-[11px] text-red-400">{inlineError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-line/50 px-3 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:bg-surface2/60 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className={cx(
              "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-primary/90",
              submitting && "opacity-70"
            )}
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
            생성
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
