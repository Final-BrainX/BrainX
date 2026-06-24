"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true면 확인 버튼을 위험(빨강) 스타일로 표시한다 — 삭제류 동작에 사용 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 삭제 등 되돌리기 어려운 동작 전에 띄우는 범용 확인 모달. document.body에 portal로 렌더되어
    노트 탐색기/탭바 등 어디서 띄워도 패널 overflow에 잘리지 않는다. */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ background: "rgba(2, 6, 23, 0.55)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[320px] rounded-xl border border-line/60 p-4 shadow-2xl"
        style={{ background: "rgb(var(--surface))" }}
      >
        <h3 className="mb-1.5 text-[14px] font-semibold text-txt">{title}</h3>
        {description && <p className="mb-4 text-[12px] leading-relaxed text-txt3">{description}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line/50 px-3 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:bg-surface2/60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              danger
                ? "bg-red-500/90 text-white hover:bg-red-500"
                : "bg-primary text-white hover:bg-primary/90"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
