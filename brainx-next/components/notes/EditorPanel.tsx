"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cx } from "@/lib/utils";
import { PaneLeaf, MockNote, Tab, DragPayload } from "@/lib/notes/noteTypes";
import { DropZone } from "@/lib/notes/paneUtils";
import TabBar from "./TabBar";
import NoteEditor, { type EditMode, type AiActionType, type NoteEditorHandle } from "./NoteEditor";
import EmptyNoteStartPage from "./EmptyNoteStartPage";
import PdfViewerPanel from "./PdfViewerPanel";
import { parsePdfOnlyNote } from "./PdfBlockNode";
import HtmlViewerPanel from "./HtmlViewerPanel";
import { parseHtmlOnlyNote } from "./HtmlBlockNode";
import QuickSwitcher from "./QuickSwitcher";
import { TypographyPopover } from "./TypographyPopover";
import { TYPOGRAPHY_SCALE_MAX, TYPOGRAPHY_SCALE_MIN, computeTypographyPx } from "@/lib/notes/typography";
import { titleDragGuard } from "@/lib/notes/titleDragGuard";

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
  onTypographyChange: (noteId: string, next: MockNote["typography"]) => void;
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
  onMoveTabToSplit: (sourcePaneId: string, sourceTabId: string, noteId: string, zone: DropZone) => void;
  onTabDragStart: (tabId: string, noteId: string) => void;
  onTabDragEnd: () => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseAllTabs: () => void;
  onTogglePinTab: (tabId: string) => void;
  onSplitTabRight: (tabId: string) => void;
  onSplitTabDown: (tabId: string) => void;
  contextOpen?: boolean;
  onContextToggle?: () => void;
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
  onTypographyChange,
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
  onMoveTabToSplit,
  onTabDragStart,
  onTabDragEnd,
  onCloseOtherTabs,
  onCloseAllTabs,
  onTogglePinTab,
  onSplitTabRight,
  onSplitTabDown,
  contextOpen,
  onContextToggle,
}: Props) {
  const [hoverZone, setHoverZone] = useState<DropZone | "replace" | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NoteEditorHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /* mousedown이 실제로 시작된 가장 안쪽 DOM 노드를 기록 — 제목 input 등에서 드래그(텍스트
     선택)를 시작해 마우스를 그 바깥(빈 패딩 영역)으로 빼고 거기서 떼면, 브라우저가 click
     이벤트의 target을 mousedown/mouseup 두 타겟의 공통 조상으로 끌어올려버려 "빈 배경을
     클릭했다"는 e.target===e.currentTarget 판정이 우연히 true가 된다(역방향 드래그 시 본문
     끝으로 포커스가 튀던 버그의 원인). mousedown은 항상 실제 시작 지점(가장 안쪽 타겟)으로
     버블링되므로, 이 ref와 클릭 타겟을 함께 검사하면 "정말로 빈 배경에서 시작하고 끝난
     클릭"만 통과시킬 수 있다. */
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  /* titleDragGuard 해제 안전망 — 제목 input 자신의 onMouseUp은 stopPropagation 되어 있어
     (아래 input 참고) 드래그가 input 경계를 벗어나 다른 곳에서 끝나도 가드를 반드시 꺼야
     한다. window의 capture 단계에서 들으면 어떤 자손이 stopPropagation을 호출하든(버블 단계
     이후 일이므로) 상관없이 항상 가장 먼저 실행되어 놓치지 않는다. */
  useEffect(() => {
    // setTimeout(0)으로 한 틱 미뤄서 끈다 — mouseup 바로 뒤에 동기적으로 발생하는 click
    // 이벤트(위 wrapper의 onClick)가 "이번 클릭이 제목 드래그의 일부였는지"를 여전히 읽을 수
    // 있어야 한다. mouseup에서 즉시 꺼버리면 그 click 핸들러 시점엔 이미 false라 가드 역할을
    // 못 한다.
    const reset = () => { setTimeout(() => { titleDragGuard.active = false; }, 0); };
    window.addEventListener("mouseup", reset, true);
    return () => window.removeEventListener("mouseup", reset, true);
  }, []);

  /* Ctrl+마우스휠로 노트 전체 글씨 크기 조절(VS Code의 Mouse Wheel Zoom과 동일한 UX) — 툴바의
     "서식" 패널이 이미 note.typography.scalePercent로 본문/H1/H2/H3 크기를 함께 조절하므로,
     같은 상태를 그대로 재사용해 휠 조작과 툴바가 항상 같은 값을 보게 만든다(별도 상태를 두면
     서로 어긋날 수 있음). 휠 이벤트는 마우스가 올라가 있는 패널의 DOM에만 발생하므로, 분할
     화면에서 패널별로 분리되는 동작은 추가 처리 없이 자연히 보장된다.
     React 19의 onWheel은 루트에 passive 리스너로 등록되어 JSX onWheel 안에서 preventDefault가
     무시된다("Unable to preventDefault inside passive event listener" 경고와 함께 브라우저
     자체 페이지 확대가 같이 동작해버림) — 그래서 ref + addEventListener("wheel", ..., { passive:
     false })로 직접 등록해야 ctrl+휠일 때 브라우저 기본 확대를 실제로 막을 수 있다. */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey || !note) return;
      event.preventDefault();
      const current = note.typography?.scalePercent ?? 100;
      const next = Math.min(
        TYPOGRAPHY_SCALE_MAX,
        Math.max(TYPOGRAPHY_SCALE_MIN, current + (event.deltaY < 0 ? 5 : -5))
      );
      if (next !== current) onTypographyChange(note.id, { ...note.typography, scalePercent: next });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [note, onTypographyChange]);

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
  /* "교체"는 이 패널이 비어있을 때만 적용된다 — 노트를 찾을 수 없는 경우(삭제된 노트 등)뿐 아니라,
     "+"로 막 생성된 본문이 비어있는 노트 탭(content==="")도 "빈 탭"으로 취급한다. 실제 내용이
     있는 노트가 열려 있으면 항상 기존처럼 좌/우/상/하 분할(zone) 동작을 유지한다. */
  const isEmptyTarget = !note || note.content.trim() === "";
  /* 문서 제목은 본문 H1보다 한 단계 더 커야 한다(위계 구분, Obsidian/Notion 스타일) — 고정 px가
     아니라 note.typography(전역 배율/h1 개별 오버라이드)로 계산된 실제 H1 px 기준으로 1.2배를
     잡아서, 사용자가 본문 글씨를 키워도(Ctrl+휠/서식 패널) 제목이 H1에 따라잡히지 않는다. */
  const titleFontSize = Math.round(computeTypographyPx(note?.typography).h1 * 1.2);
  /* 파일 가져오기로 만들어진 PDF 노트(본문이 PDF 임베드 블록 하나뿐)는 Tiptap 노트 에디터가
     아니라 화면 전체를 채우는 전용 PDF 뷰어로 보여준다. */
  const pdfOnly = note ? parsePdfOnlyNote(note.content) : null;
  /* HTML 파일 가져오기로 만들어진 노트(본문이 HTML 임베드 블록 하나뿐)도 PDF와 동일하게
     화면 전체를 채우는 전용 뷰어로 원본 화면을 그대로 보여준다. */
  const htmlOnly = note ? parseHtmlOnlyNote(note.content) : null;

  return (
    <div
      onClick={onActivate}
      className="relative flex h-full flex-col overflow-hidden"
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
        onContextToggle={onContextToggle}
        contextOpen={contextOpen}
      />

      {/* ── 콘텐츠 — 탭이 가리키는 노트를 찾을 수 없을 때(삭제된 노트 등)는 복구용으로
          Welcome 화면과 동일한 컴포넌트를 보여준다. 탭이 0개인 진짜 Welcome 상태는
          NotesWorkspace 최상위에서 처리하므로 여기서는 일어나지 않는다. */}
      {!note ? (
        // QuickSwitcher가 떠 있을 때는 그 뒤로 Welcome Screen의 버튼이 반투명 배경을 통해
        // 겹쳐 보이지 않도록 숨긴다(두 기능이 동시에 보이는 것처럼 느껴지는 문제 방지)
        !quickSwitcherOpen && (
          <EmptyNoteStartPage
            onCreateNote={onCreateNoteInTab}
            onGoToFile={onOpenQuickSwitcher}
          />
        )
      ) : pdfOnly ? (
        <PdfViewerPanel assetId={pdfOnly.assetId} fileName={pdfOnly.fileName} />
      ) : htmlOnly ? (
        <HtmlViewerPanel assetId={htmlOnly.assetId} fileName={htmlOnly.fileName} />
      ) : (
        <div
          ref={scrollContainerRef}
          className="scroll-thin flex-1 overflow-y-auto"
          style={{ background: "rgb(var(--surface))" }}
          onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
          onClick={(e) => {
            // 빈 배경(패딩 영역)을 클릭해도 본문에 포커스 — 에디터 영역 어디를 클릭해도 작성 가능해야 함.
            // titleDragGuard.active는 추가 안전망 — 제목 드래그 도중/직후라면 절대 본문에 포커스를 주지 않는다.
            if (
              isEdit &&
              e.target === e.currentTarget &&
              mouseDownTargetRef.current === e.currentTarget &&
              !titleDragGuard.active
            ) {
              editorRef.current?.focusEnd();
            }
          }}
        >
          {/* Obsidian처럼 본문을 패널 중앙의 적당한 폭으로 제한한다 — 텍스트 자체의 정렬은 그대로
              좌측 정렬(.ProseMirror 기본값)이고, 이 wrapper의 좌우 여백만 중앙 정렬된다. 분할
              패널에서도 각 패널이 독립적으로 이 wrapper를 가지므로 패널마다 동일하게 적용되고,
              패널이 max-w보다 좁아지면 mx-auto가 더 이상 여백을 만들지 않아 자연스럽게
              반응형으로 줄어든다(별도 미디어 쿼리 불필요 — 패널 자체 폭 기준으로 줄어듦).
              max-w-3xl(768px)은 분할 안 한 일반적인 패널 폭과 비교해 상대적으로 넓어서 좌우
              여백이 작게 나와 "중앙 정렬된 느낌"이 약했다 — 680px로 좁혀 같은 패널 폭에서도
              여백이 더 분명하게 느껴지도록 조정했다. 제목/태그/본문이 이 wrapper 하나를 공유하므로
              셋 다 항상 같은 컬럼 기준을 따른다. */}
          <div
            className="mx-auto max-w-[680px] px-8 py-7"
            onClick={(e) => {
              if (
                isEdit &&
                e.target === e.currentTarget &&
                mouseDownTargetRef.current === e.currentTarget &&
                !titleDragGuard.active
              ) {
                editorRef.current?.focusEnd();
              }
            }}
          >
            {/* 노트 제목: 편집 모드에서는 클릭 → 인라인 input. 우측의 "서식"은 이 노트 전체에
                적용되는 문서 기본 타이포그래피(글꼴 크기 배율/개별 설정/글꼴) 패널 — 선택한
                텍스트에만 적용되는 BubbleToolbar의 Aa(FontPopover)와는 별개다 */}
            <div className="flex items-center justify-between gap-[5px]">
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
                  // 제목 input 안에서의 드래그가 끝날 때(mouseup)는 더 바깥(본문 ProseMirror,
                  // 다른 분할 패널 등)으로 전파되지 않게 막는다 — 그렇지 않으면 각 노트
                  // 에디터가 window 레벨로 듣고 있는 선택 추적 로직(MarkdownLivePreview의
                  // dragging/settling)이 이 제목 영역의 mouseup에도 반응할 여지가 생긴다.
                  // mousedown은 stopPropagation 하지 않는다 — 바깥 wrapper의 onMouseDown이
                  // "이 클릭이 정말 빈 배경에서 시작됐는지"를 판정하는 데 이 이벤트의 버블링을
                  // 그대로 써야 한다(역방향 드래그 시 본문 포커스로 튀던 버그의 수정, 위
                  // mouseDownTargetRef 참고 — 여기서 막으면 그 판정이 깨진다). 대신
                  // titleDragGuard를 켜서, 제목 안에서 드래그가 진행되는 동안은 본문
                  // 에디터(들)의 selection/버블메뉴 로직이 전혀 반응하지 않게 한다 — "제목은
                  // 제목 컴포넌트 내부에서 독립적으로 selection/focus를 관리한다"는 원칙을
                  // 명시적으로 강제하는 안전망.
                  onMouseDown={() => { titleDragGuard.active = true; }}
                  onMouseUp={(e) => e.stopPropagation()}
                  style={{ fontSize: `${titleFontSize}px` }}
                  className="mb-2 w-full bg-transparent font-bold leading-tight tracking-tight text-txt outline-none"
                  placeholder="제목 입력..."
                />
              ) : (
                <h1
                  style={{ fontSize: `${titleFontSize}px` }}
                  className={cx(
                    "mb-2 min-w-0 flex-1 font-bold leading-tight tracking-tight text-txt",
                    isEdit && "cursor-text hover:text-primary/90 transition-colors"
                  )}
                  onMouseDown={(e) => {
                    // 읽기 모드에서는 stopPropagation을 하지 않으므로 mousedown이 그대로
                    // 버블링되어 바깥 wrapper의 onClick={onActivate}가 자연스럽게 패널을
                    // 활성화한다.
                    if (!isEdit) return;
                    // h1은 일반 텍스트라, 여기서 mousedown 후 곧바로 드래그하면 우리 input으로
                    // 전환되기 전에 브라우저의 네이티브 텍스트 드래그-선택이 먼저 시작돼버린다
                    // (제목을 한 번도 클릭한 적 없는 상태에서 바로 드래그하면, 그 드래그가
                    // h1이라는 평범한 DOM 텍스트 위에서 일어나 페이지의 다른 영역까지 네이티브
                    // selection이 확장되던 버그의 원인 — input은 구조적으로 이게 불가능하지만
                    // h1은 일반 문서 흐름의 일부라 가능하다). preventDefault로 그 네이티브
                    // 드래그-선택 자체가 시작되지 않게 막은 뒤, 곧바로 편집 모드(input)로
                    // 전환한다 — 그래서 이 첫 제스처는 항상 "클릭하여 편집 진입"으로만
                    // 처리되고(텍스트는 기존 자동 select 효과로 전체 선택됨), 그 다음
                    // 드래그부터는 안전한 input 위에서 일어난다.
                    e.preventDefault();
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
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <TypographyPopover
                  typography={note.typography}
                  onChange={(next) => onTypographyChange(note.id, next)}
                />
              </div>
            </div>

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
              if (dragPayload.kind === "tab") {
                // 탭을 다른(비어있지 않은) 패널의 본문에 드롭 → 새 분할을 만들면서 원본 패널에서는
                // 제거한다(이동, 복제 아님). 사이드바 노트 드래그는 그대로 onDrop(복제=새로 열기) 유지.
                onMoveTabToSplit(dragPayload.paneId, dragPayload.tabId, dragPayload.noteId, zone);
              } else {
                onDrop(zone, dragPayload.noteId);
              }
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
