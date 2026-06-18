"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, XCircle, Copy, ExternalLink, Pin, PinOff, PanelRightOpen, PanelBottomOpen } from "lucide-react";
import { cx } from "@/lib/utils";

export interface TabContextMenuTarget {
  x: number;
  y: number;
  tabId: string;
  noteId: string;
  pinned: boolean;
}

interface Props {
  target: TabContextMenuTarget;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onTogglePin: () => void;
  onCopyLink: () => void;
  onOpenNewWindow: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors",
        danger ? "text-red-400 hover:bg-red-500/10 hover:text-red-300" : "text-txt2 hover:bg-surface2/60 hover:text-txt"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/** 탭 우클릭 컨텍스트 메뉴 — document.body에 portal로 렌더되어 패널/사이드바 overflow에 잘리지 않는다 */
export default function TabContextMenu({
  target,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  onTogglePin,
  onCopyLink,
  onOpenNewWindow,
  onSplitRight,
  onSplitDown,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y, visibility: "hidden" as "hidden" | "visible" });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(target.x, window.innerWidth - rect.width - margin);
    const top = Math.min(target.y, window.innerHeight - rect.height - margin);
    setPos({ left: Math.max(margin, left), top: Math.max(margin, top), visibility: "visible" });
  }, [target.x, target.y]);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[1000] w-52 overflow-hidden rounded-lg border border-line/60 py-1"
      style={{
        left: pos.left,
        top: pos.top,
        visibility: pos.visibility,
        background: "rgb(var(--surface))",
        boxShadow: "0 12px 28px -6px rgba(2,6,23,0.5), 0 0 0 1px rgb(var(--border) / 0.2)",
      }}
    >
      <MenuItem icon={<X size={13} />} label="탭 닫기" onClick={run(onCloseTab)} />
      <MenuItem icon={<XCircle size={13} />} label="다른 탭 닫기" onClick={run(onCloseOthers)} />
      <MenuItem icon={<XCircle size={13} />} label="모두 닫기" onClick={run(onCloseAll)} />
      <div className="my-1 border-t border-line/30" />
      <MenuItem
        icon={target.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        label={target.pinned ? "고정 해제" : "고정"}
        onClick={run(onTogglePin)}
      />
      <MenuItem icon={<Copy size={13} />} label="탭으로 링크 복사" onClick={run(onCopyLink)} />
      <MenuItem icon={<ExternalLink size={13} />} label="새 창으로 이동" onClick={run(onOpenNewWindow)} />
      <div className="my-1 border-t border-line/30" />
      <MenuItem icon={<PanelRightOpen size={13} />} label="우측 분할" onClick={run(onSplitRight)} />
      <MenuItem icon={<PanelBottomOpen size={13} />} label="하단 분할" onClick={run(onSplitDown)} />
    </div>,
    document.body
  );
}
