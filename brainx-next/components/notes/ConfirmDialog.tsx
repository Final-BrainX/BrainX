"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  submittingLabel?: string;
  submitting?: boolean;
  error?: string | null;
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
  submittingLabel = "처리 중…",
  submitting = false,
  error,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const submittingRef = useRef(submitting);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    onCancelRef.current = onCancel;
    submittingRef.current = submitting;
  }, [onCancel, submitting]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submittingRef.current) {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocusRef.current?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center"
      style={{ background: "rgba(2, 6, 23, 0.55)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={[description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        aria-busy={submitting}
        tabIndex={-1}
        className="w-[min(360px,calc(100vw-32px))] overscroll-contain rounded-xl border border-line/60 p-4 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        style={{ background: "rgb(var(--surface))" }}
      >
        <h3 id={titleId} className="mb-1.5 text-pretty text-[14px] font-semibold text-txt">{title}</h3>
        {description && <p id={descriptionId} className="mb-4 break-words text-[12px] leading-relaxed text-txt3">{description}</p>}
        {error && (
          <p id={errorId} role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-600 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="touch-manipulation rounded-lg border border-line/50 px-3 py-1.5 text-[12px] font-medium text-txt2 transition-colors hover:bg-surface2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={cx(
              "touch-manipulation rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-wait disabled:opacity-65",
              danger
                ? "bg-red-500/90 text-white hover:bg-red-500"
                : "bg-primary text-white hover:bg-primary/90"
            )}
          >
            {submitting ? submittingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
