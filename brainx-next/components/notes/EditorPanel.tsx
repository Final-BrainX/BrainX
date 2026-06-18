"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cx } from "@/lib/utils";
import { PaneLeaf, MockNote, Tab, DragPayload } from "@/lib/notes/noteTypes";
import { DropZone } from "@/lib/notes/paneUtils";
import TabBar from "./TabBar";
import NoteEditor, { type EditMode, type AiActionType, type NoteEditorHandle } from "./NoteEditor";
import EmptyNoteStartPage from "./EmptyNoteStartPage";
import QuickSwitcher from "./QuickSwitcher";

interface Props {
  node: PaneLeaf;
  activeTab: Tab;
  note: MockNote | null;
  allNotes: MockNote[];
  tabs: Tab[];
  activeTabId: string;
  isActive: boolean;
  dragPayload: DragPayload | null;
  mode: EditMode;
  saveSignal: number;
  onModeChange: (tabId: string, mode: EditMode) => void;
  onActivate: () => void;
  onDrop: (zone: DropZone, noteId: string) => void;
  onTitleChange: (noteId: string, newTitle: string) => void;
  onContentChange: (noteId: string, newContentHtml: string) => void;
  onTabActivate: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onAiAction: (type: AiActionType, text: string) => void;
  onCreateNoteInTab: () => void;
  onOpenQuickSwitcher: () => void;
  quickSwitcherOpen: boolean;
  onQuickSwitcherSelect: (noteId: string) => void;
  onQuickSwitcherClose: () => void;
  onReplaceActiveTab: (noteId: string) => void;
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
}

export default function EditorPanel({
  node,
  activeTab,
  note,
  allNotes,
  tabs,
  activeTabId,
  isActive,
  dragPayload,
  mode,
  saveSignal,
  onModeChange,
  onActivate,
  onDrop,
  onTitleChange,
  onContentChange,
  onTabActivate,
  onTabClose,
  onNewTab,
  onAiAction,
  onCreateNoteInTab,
  onOpenQuickSwitcher,
  quickSwitcherOpen,
  onQuickSwitcherSelect,
  onQuickSwitcherClose,
  onReplaceActiveTab,
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
}: Props) {
  const [hoverZone, setHoverZone] = useState<DropZone | "replace" | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NoteEditorHandle>(null);

  /* ── 제목 편집 상태 ── */
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note?.title ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // note 교체 시 초기화 — 방금 생성된 빈 새 노트("새 노트" + 빈 본문)는 곧바로 제목 편집 상태로 연다
  useEffect(() => {
    setTitleDraft(note?.title ?? "");
    const isFreshNote = !!note && note.content.trim() === "" && note.title === "새 노트";
    setIsEditingTitle(isFreshNote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // Ctrl+S(saveSignal) — 활성 패널이면 제목 편집 중인 내용을 커밋하고 본문 디바운스를 즉시 플러시
  const prevSaveSignalRef = useRef(saveSignal);
  useEffect(() => {
    if (saveSignal === prevSaveSignalRef.current) return;
    prevSaveSignalRef.current = saveSignal;
    if (!isActive) return;
    if (isEditingTitle) commitTitle();
    editorRef.current?.flushPendingSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);

  // 제목 입력창 포커스
  useEffect(() => {
    if (isEditingTitle) {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [isEditingTitle]);

  const commitTitle = useCallback((focusBody = false) => {
    if (!note) return;
    const t = titleDraft.trim();
    if (t && t !== note.title) onTitleChange(note.id, t);
    setTitleDraft(t || note.title);
    setIsEditingTitle(false);
    if (focusBody) {
      // 제목 input이 사라지는 렌더 이후에 포커스해야 실제로 적용됨.
      requestAnimationFrame(() => {
        editorRef.current?.focusStart();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleDraft, note?.title, note?.id, onTitleChange]);

  const cancelTitle = useCallback(() => {
    setTitleDraft(note?.title ?? "");
    setIsEditingTitle(false);
  }, [note?.title]);

  function getZone(e: React.DragEvent<HTMLDivElement>): DropZone {
    const el = overlayRef.current;
    if (!el) return "right";
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const dx = Math.abs(x - 0.5);
    const dy = Math.abs(y - 0.5);
    if (dx > dy) return x < 0.5 ? "left" : "right";
    return y < 0.5 ? "top" : "bottom";
  }

  const isEdit = mode === "edit";
  /* "교체"는 이 패널이 비어있을 때만 적용된다 — 빈 시작 화면(start 탭)뿐 아니라, "+"로 막 생성된
     본문이 비어있는 노트 탭(kind는 "note"지만 content==="")도 "빈 탭"으로 취급한다. 실제 내용이
     있는 노트가 열려 있으면 항상 기존처럼 좌/우/상/하 분할(zone) 동작을 유지한다. */
  const isEmptyTarget = activeTab.kind === "start" || !note || note.content.trim() === "";

  return (
    <div
      onClick={onActivate}
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        borderTop: `2px solid ${isActive ? "rgb(var(--primary))" : "transparent"}`,
        transition: "border-color 0.15s",
      }}
    >
      {/* ── 탭 바 (탭 목록 + 현재 활성 탭의 읽기/편집 모드 토글) */}
      <TabBar
        paneId={node.id}
        tabs={tabs}
        activeTabId={activeTabId}
        notes={allNotes}
        mode={mode}
        dragPayload={dragPayload}
        showModeToggle={activeTab.kind === "note"}
        isPaneFocused={isActive}
        onTabActivate={(tabId) => { onActivate(); onTabActivate(tabId); }}
        onTabClose={onTabClose}
        onNewTab={onNewTab}
        onModeToggle={() => {
          if (isEdit && isEditingTitle) commitTitle();
          onModeChange(activeTabId, isEdit ? "read" : "edit");
        }}
        onAddNoteTab={onAddNoteTab}
        onReorderTab={onReorderTab}
        onMoveTabToPane={onMoveTabToPane}
        onTabDragStart={onTabDragStart}
        onTabDragEnd={onTabDragEnd}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseAllTabs={onCloseAllTabs}
        onTogglePinTab={onTogglePinTab}
        onSplitTabRight={onSplitTabRight}
        onSplitTabDown={onSplitTabDown}
      />

      {/* ── 콘텐츠 */}
      {activeTab.kind === "start" || !note ? (
        // QuickSwitcher가 떠 있을 때는 그 뒤로 Welcome Screen의 버튼이 반투명 배경을 통해
        // 겹쳐 보이지 않도록 숨긴다(두 기능이 동시에 보이는 것처럼 느껴지는 문제 방지)
        !quickSwitcherOpen && (
          <EmptyNoteStartPage
            onCreateNote={onCreateNoteInTab}
            onGoToFile={onOpenQuickSwitcher}
          />
        )
      ) : (
        <div
          className="scroll-thin flex-1 overflow-y-auto"
          style={{ background: "rgb(var(--surface))" }}
          onClick={(e) => {
            // 빈 배경(패딩 영역)을 클릭해도 본문에 포커스 — 에디터 영역 어디를 클릭해도 작성 가능해야 함
            if (isEdit && e.target === e.currentTarget) editorRef.current?.focusEnd();
          }}
        >
          <div
            className="px-8 py-7"
            onClick={(e) => {
              if (isEdit && e.target === e.currentTarget) editorRef.current?.focusEnd();
            }}
          >
            {/* 노트 제목: 편집 모드에서는 클릭 → 인라인 input */}
            {isEdit && isEditingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => commitTitle()}
                onKeyDown={(e) => {
                  // IME(한글 등) 조합 중 Enter는 조합 확정용이므로 제목 커밋을 건너뜀
                  if (e.nativeEvent.isComposing || e.key === "Process") return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTitle(true);
                  }
                  if (e.key === "Escape") { cancelTitle(); }
                }}
                onClick={(e) => { e.stopPropagation(); onActivate(); }}
                className="mb-1.5 w-full bg-transparent text-[22px] font-bold leading-tight tracking-tight text-txt outline-none"
                placeholder="제목 입력..."
              />
            ) : (
              <h1
                className={cx(
                  "mb-1.5 text-[22px] font-bold leading-tight tracking-tight text-txt",
                  isEdit && "cursor-text hover:text-primary/90 transition-colors"
                )}
                onClick={(e) => {
                  // 읽기 모드에서는 stopPropagation을 하지 않으므로 클릭이 그대로 버블링되어
                  // 바깥 wrapper의 onClick={onActivate}가 자연스럽게 패널을 활성화한다.
                  if (!isEdit) return;
                  e.stopPropagation();
                  onActivate();
                  setTitleDraft(note.title);
                  setIsEditingTitle(true);
                }}
                title={isEdit ? "클릭하여 제목 편집" : undefined}
              >
                {note.title}
              </h1>
            )}

            {note.tags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line/60 px-2.5 py-0.5 text-[11px] font-medium text-txt3"
                    style={{ background: "rgb(var(--surface2) / 0.6)" }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <NoteEditor
              ref={editorRef}
              note={note}
              mode={mode}
              onActivate={onActivate}
              onContentChange={onContentChange}
              onAiAction={onAiAction}
            />
          </div>
        </div>
      )}

      {quickSwitcherOpen && (
        <QuickSwitcher
          notes={allNotes}
          onSelect={onQuickSwitcherSelect}
          onClose={onQuickSwitcherClose}
        />
      )}

      {/* ── DnD 오버레이 — 사이드바 노트 드래그는 본문에 드롭하면 "교체", 탭 드래그는 기존처럼 "분할" */}
      {dragPayload && (
        <div
          ref={overlayRef}
          className="absolute inset-0 z-10"
          style={{ top: 36 }}
          onDragOver={(e) => {
            e.preventDefault();
            // dropEffect는 드래그 시작 쪽이 선언한 effectAllowed와 맞아야 한다 — 사이드바 노트는
            // "copy"(NotesExplorer/FolderTree), 탭은 "copyMove"(TabBar)로 선언되어 있다. 여기서
            // isEmptyTarget 여부와 무관하게 항상 같은 규칙으로 맞춰야 일부 브라우저에서 drop이
            // 무시되는 effectAllowed/dropEffect 불일치를 피할 수 있다.
            e.dataTransfer.dropEffect = dragPayload.kind === "note" ? "copy" : "move";
            if (isEmptyTarget) {
              if (hoverZone !== "replace") setHoverZone("replace");
            } else {
              const z = getZone(e);
              if (z !== hoverZone) setHoverZone(z);
            }
          }}
          onDragLeave={() => setHoverZone(null)}
          onDrop={(e) => {
            e.preventDefault();
            setHoverZone(null);
            if (isEmptyTarget) {
              if (dragPayload.kind === "tab") {
                // 탭을 빈 시작 화면에 드롭 → 그 자리를 교체하면서 원래 패널에서는 제거(이동, 복제 아님)
                onMoveTabToPane(dragPayload.paneId, dragPayload.tabId, dragPayload.noteId);
              } else {
                onReplaceActiveTab(dragPayload.noteId);
              }
            } else {
              const zone = getZone(e);
              onDrop(zone, dragPayload.noteId);
            }
          }}
        >
          {hoverZone === "replace" && <ReplacePreviewOverlay />}
          {hoverZone && hoverZone !== "replace" && <SplitPreviewOverlay zone={hoverZone} />}
        </div>
      )}
    </div>
  );
}

/* ── 분할 미리보기 오버레이 */
const SPLIT_LABEL: Record<DropZone, string> = {
  left: "왼쪽에 새 패널 생성",
  right: "오른쪽에 새 패널 생성",
  top: "위에 새 패널 생성",
  bottom: "아래에 새 패널 생성",
};

const SPLIT_POS: Record<DropZone, React.CSSProperties> = {
  left:   { top: 0, left: 0, width: "50%", height: "100%" },
  right:  { top: 0, right: 0, width: "50%", height: "100%" },
  top:    { top: 0, left: 0, right: 0, height: "50%" },
  bottom: { bottom: 0, left: 0, right: 0, height: "50%" },
};

const SPLIT_DIVIDER: Record<DropZone, React.CSSProperties> = {
  left:   { position: "absolute", top: 0, right: -1, width: 2, height: "100%", background: "rgb(var(--primary))" },
  right:  { position: "absolute", top: 0, left: -1,  width: 2, height: "100%", background: "rgb(var(--primary))" },
  top:    { position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "rgb(var(--primary))" },
  bottom: { position: "absolute", top: -1,    left: 0, right: 0, height: 2, background: "rgb(var(--primary))" },
};

function SplitPreviewOverlay({ zone }: { zone: DropZone }) {
  return (
    <div
      style={{
        position: "absolute",
        background: "rgb(var(--primary) / 0.14)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        transition: "all 0.08s ease",
        ...SPLIT_POS[zone],
      }}
    >
      <div style={SPLIT_DIVIDER[zone]} />
      <div
        style={{
          position: "relative",
          background: "rgb(var(--surface))",
          border: "1.5px solid rgb(var(--primary) / 0.45)",
          borderRadius: 8,
          padding: "5px 14px",
          fontSize: 11,
          fontWeight: 600,
          color: "rgb(var(--primary))",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-sans)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          letterSpacing: "0.01em",
        }}
      >
        {SPLIT_LABEL[zone]}
      </div>
    </div>
  );
}

/* ── 교체 미리보기 오버레이 — 영역 강조만, 텍스트 안내 없음(드롭 가능 영역만 알리면 충분) */
function ReplacePreviewOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgb(var(--primary) / 0.1)",
        pointerEvents: "none",
        border: "1.5px dashed rgb(var(--primary) / 0.5)",
      }}
    />
  );
}
