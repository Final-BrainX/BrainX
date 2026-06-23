"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { X, Plus, Eye, SquarePen, Pin, PanelRight, PanelRightClose } from "lucide-react";
import { cx } from "@/lib/utils";
import { Tab, MockNote, DragPayload } from "@/lib/notes/noteTypes";
import type { EditMode } from "./NoteEditor";
import TabContextMenu, { type TabContextMenuTarget } from "./TabContextMenu";

interface TabBarProps {
  paneId: string;
  tabs: Tab[];
  activeTabId: string;
  notes: MockNote[];
  mode: EditMode;
  dragPayload: DragPayload | null;
  showModeToggle: boolean;
  /** 이 패널이 현재 전역으로 포커스된(활성) 패널인지 — 활성 탭 강조 강도를 다르게 준다 */
  isPaneFocused: boolean;
  onTabActivate: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onModeToggle: () => void;
  onAddNoteTab: (noteId: string, targetIndex?: number) => void;
  onReorderTab: (tabId: string, targetIndex: number) => void;
  onMoveTabToPane: (sourcePaneId: string, sourceTabId: string, noteId: string, targetIndex?: number) => void;
  onTabDragStart: (tabId: string, noteId: string) => void;
  onTabDragEnd: () => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: () => void;
  onTogglePinTab: (tabId: string) => void;
  onSplitTabRight: (tabId: string) => void;
  onSplitTabDown: (tabId: string) => void;
  onContextToggle?: () => void;
  contextOpen?: boolean;
}

function tabLabel(tab: Tab, notes: MockNote[]): string {
  if (tab.kind === "start") return "새 탭";
  return notes.find((n) => n.id === tab.noteId)?.title ?? "제목 없음";
}

export default function TabBar({
  paneId,
  tabs,
  activeTabId,
  notes,
  mode,
  dragPayload,
  showModeToggle,
  isPaneFocused,
  onTabActivate,
  onTabClose,
  onNewTab,
  onModeToggle,
  onAddNoteTab,
  onReorderTab,
  onMoveTabToPane,
  onTabDragStart,
  onTabDragEnd,
  onCloseOtherTabs,
  onCloseAllTabs,
  onTogglePinTab,
  onSplitTabRight,
  onSplitTabDown,
  onContextToggle,
  contextOpen,
}: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<TabContextMenuTarget | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  /* 활성 탭이 바뀌면 보이는 영역으로 스크롤 */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
    activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tab: Tab) => {
    if (tab.kind !== "note") return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, noteId: tab.noteId, pinned: !!tab.pinned });
  }, []);

  /* 같은 패널 안에서 탭을 드래그 중인지 (재정렬) vs 다른 패널의 탭인지 (이동) */
  const isSameTabDrag = dragPayload?.kind === "tab" && dragPayload.paneId === paneId;
  const isCrossPaneTabDrag = dragPayload?.kind === "tab" && dragPayload.paneId !== paneId;
  const isNoteDragOver = dragPayload?.kind === "note" && dropIndex !== null;

  return (
    <div
      className="flex h-9 shrink-0 items-center border-b border-line/50"
      style={{ background: "rgb(var(--bg2))" }}
    >
      {/* 탭 목록 (가로 스크롤) — 드래그 중에도 탭바 전체를 덮는 효과는 두지 않고, 삽입 위치에만
          은은한 표시(노트 드롭=빈 ghost 슬롯, 탭 재정렬/이동=얇은 삽입선)를 둔다 */}
      <div
        ref={scrollRef}
        className="scroll-x-thin flex h-full flex-1 items-stretch overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
        onDragOver={(e) => {
          if (!dragPayload) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = dragPayload.kind === "tab" ? "move" : "copy";
          const tabEl = (e.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
          if (tabEl) {
            const rect = tabEl.getBoundingClientRect();
            const isAfter = e.clientX - rect.left > rect.width / 2;
            const hoveredId = tabEl.dataset.tabId!;
            const idx = tabs.findIndex((t) => t.id === hoveredId);
            setDropIndex(idx === -1 ? tabs.length : isAfter ? idx + 1 : idx);
          } else {
            setDropIndex(tabs.length);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null);
        }}
        onDrop={(e) => {
          if (!dragPayload) return;
          e.preventDefault();
          if (dragPayload.kind === "note") {
            onAddNoteTab(dragPayload.noteId, dropIndex ?? undefined);
          } else if (isSameTabDrag && dropIndex !== null) {
            onReorderTab(dragPayload.tabId, dropIndex);
          } else if (isCrossPaneTabDrag) {
            onMoveTabToPane(dragPayload.paneId, dragPayload.tabId, dragPayload.noteId, dropIndex ?? undefined);
          }
          setDropIndex(null);
        }}
      >
        {tabs.map((tab, index) => {
          const label = tabLabel(tab, notes);
          const isActive = tab.id === activeTabId;
          const isPinned = tab.kind === "note" && tab.pinned;

          return (
            <div key={tab.id} className="relative flex h-full shrink-0">
              {dropIndex === index && (isNoteDragOver ? <GhostSlot /> : <DropInsertBar />)}
              <button
                type="button"
                data-tab-id={tab.id}
                draggable={tab.kind === "note"}
                onDragStart={(e) => {
                  if (tab.kind !== "note") return;
                  e.dataTransfer.setData("text/plain", tab.noteId);
                  e.dataTransfer.effectAllowed = "copyMove";
                  onTabDragStart(tab.id, tab.noteId);
                }}
                onDragEnd={() => { setDropIndex(null); onTabDragEnd(); }}
                onClick={(e) => { e.stopPropagation(); onTabActivate(tab.id); }}
                onContextMenu={(e) => handleContextMenu(e, tab)}
                title={label}
                className={cx(
                  "group relative flex h-full min-w-[110px] max-w-[170px] shrink-0 items-center gap-1.5 border-r px-3 text-[12px] transition-colors",
                  isActive
                    ? "font-semibold text-txt"
                    : tab.kind === "start"
                    ? "text-txt3/50 hover:text-txt2"
                    : "text-txt3/80 hover:text-txt2"
                )}
                style={{
                  background: isActive
                    ? isPaneFocused
                      ? "rgb(var(--primary) / 0.08)"
                      : "rgb(var(--surface))"
                    : "transparent",
                  borderColor: "rgb(var(--border) / 0.3)",
                }}
              >
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height: isPaneFocused ? 2.5 : 2,
                      background: isPaneFocused ? "rgb(var(--primary))" : "rgb(var(--primary) / 0.45)",
                    }}
                  />
                )}

                {isPinned && <Pin size={10} className="shrink-0 text-txt3" />}

                <span className={cx("min-w-0 flex-1 truncate text-left", tab.kind === "start" && "italic")}>
                  {label}
                </span>

                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  title="탭 닫기"
                  className={cx(
                    "grid h-4 w-4 shrink-0 place-items-center rounded transition-all hover:bg-red-500/15 hover:text-red-400",
                    isActive ? "opacity-50 hover:opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                  )}
                >
                  <X size={10} />
                </span>
              </button>
            </div>
          );
        })}

        {dropIndex === tabs.length && (isNoteDragOver ? <GhostSlot inline /> : <DropInsertBar inline />)}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNewTab(); }}
          title="새 노트"
          className="grid h-full w-8 shrink-0 place-items-center text-txt3 transition-colors hover:bg-surface2/50 hover:text-txt"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* 우측 컨트롤: 읽기/편집 모드 전환 + 컨텍스트 패널 토글 */}
      {(showModeToggle || onContextToggle) && (
        <div className="flex shrink-0 items-center border-l border-line/40 px-1.5 gap-0.5">
          {showModeToggle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onModeToggle(); }}
              title={mode === "edit" ? "읽기 모드로 전환" : "편집 모드로 전환"}
              className={cx(
                "inline-flex h-[22px] w-[22px] items-center justify-center rounded transition-all",
                mode === "edit"
                  ? "text-primary hover:bg-primary/10"
                  : "text-txt3/60 hover:bg-surface2/70 hover:text-txt"
              )}
            >
              {mode === "edit" ? <SquarePen size={13} /> : <Eye size={13} />}
            </button>
          )}
          {onContextToggle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onContextToggle(); }}
              title={contextOpen ? "컨텍스트 패널 닫기" : "컨텍스트 패널 열기"}
              className={cx(
                "inline-flex h-[22px] w-[22px] items-center justify-center rounded transition-all",
                contextOpen
                  ? "text-primary hover:bg-primary/10"
                  : "text-txt3/60 hover:bg-surface2/70 hover:text-txt"
              )}
            >
              {contextOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
            </button>
          )}
        </div>
      )}

      {contextMenu && (
        <TabContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onCloseTab={() => onTabClose(contextMenu.tabId)}
          onCloseOthers={() => onCloseOtherTabs(contextMenu.tabId)}
          onCloseAll={onCloseAllTabs}
          onTogglePin={() => onTogglePinTab(contextMenu.tabId)}
          onCopyLink={() => {
            const url = `${window.location.origin}/notes/${contextMenu.noteId}`;
            navigator.clipboard?.writeText(url).catch(() => {});
          }}
          onOpenNewWindow={() => window.open(`/notes/${contextMenu.noteId}`, "_blank")}
          onSplitRight={() => onSplitTabRight(contextMenu.tabId)}
          onSplitDown={() => onSplitTabDown(contextMenu.tabId)}
        />
      )}
    </div>
  );
}

/** 탭 재정렬/이동 삽입 위치를 표시하는 얇은 파란 삽입선 — 텍스트 안내 없이 위치만 알려준다 */
function DropInsertBar({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <span
        className="my-1.5 w-[2px] shrink-0 rounded-full"
        style={{ background: "rgb(var(--primary))" }}
      />
    );
  }
  return (
    <span
      className="absolute -left-[1px] top-1 bottom-1 z-10 w-[2px] rounded-full"
      style={{ background: "rgb(var(--primary))" }}
    />
  );
}

/** 사이드바 노트를 탭바에 드롭할 때 새 탭이 들어갈 자리만 은은하게 보여주는 빈 슬롯 —
    텍스트/아이콘/배지 없이 영역만 표시한다(탭바 전체를 덮는 효과 금지) */
function GhostSlot({ inline = false }: { inline?: boolean }) {
  const slot = (
    <span
      className="h-7 w-14 shrink-0 rounded-md border border-dashed"
      style={{ borderColor: "rgb(var(--primary) / 0.55)", background: "rgb(var(--primary) / 0.1)" }}
    />
  );
  if (inline) {
    return <span className="flex h-full shrink-0 items-center px-1">{slot}</span>;
  }
  return (
    <span className="absolute -left-16 top-0 z-10 flex h-full items-center px-1">
      {slot}
    </span>
  );
}
