"use client";

import React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PaneNode, MockNote, PaneTabsState, Tab, DragPayload } from "@/lib/notes/noteTypes";
import { DropZone } from "@/lib/notes/paneUtils";
import EditorPanel from "./EditorPanel";
import type { EditMode, AiActionType, NoteEditorHandle } from "./NoteEditor";

export interface QuickSwitcherTarget {
  paneId: string;
  tabId: string;
}

interface Props {
  node: PaneNode;
  notes: MockNote[];
  activeId: string;
  dragPayload: DragPayload | null;
  /** 탭(노트 인스턴스) id 기준 읽기/편집 모드 — 패널이 아니라 탭 단위로 독립적으로 유지된다 */
  tabMode: Record<string, EditMode>;
  paneTabs: Record<string, PaneTabsState>;
  /** pane id별 Ctrl+Wheel 에디터 뷰 줌(%) — 없는 pane은 기본 100%. */
  paneFontScale: Record<string, number>;
  onPaneFontScaleChange: (paneId: string, next: number) => void;
  quickSwitcher: QuickSwitcherTarget | null;
  saveSignal: number;
  scrollToHeadingSignal: { nonce: number; index: number } | null;
  onActivate: (id: string) => void;
  onDrop: (paneId: string, zone: DropZone, noteId: string) => void;
  onTitleChange: (noteId: string, newTitle: string) => void;
  onContentChange: (noteId: string, newContentHtml: string) => void;
  onTypographyChange: (noteId: string, next: MockNote["typography"]) => void;
  onModeChange: (tabId: string, mode: EditMode) => void;
  onTabActivate: (paneId: string, tabId: string) => void;
  onTabClose: (paneId: string, tabId: string) => void;
  onNewTab: (paneId: string) => void;
  onAiAction: (type: AiActionType, text: string) => void;
  onEditorHandleChange?: (paneId: string, tabId: string, handle: NoteEditorHandle | null) => void;
  onCreateNoteInTab: (paneId: string, tabId: string) => void;
  onOpenQuickSwitcher: (paneId: string, tabId: string) => void;
  onQuickSwitcherSelect: (noteId: string) => void;
  onQuickSwitcherClose: () => void;
  onReplaceActiveTab: (paneId: string, noteId: string) => void;
  onAddNoteTab: (paneId: string, noteId: string, targetIndex?: number) => void;
  onReorderTab: (paneId: string, tabId: string, targetIndex: number) => void;
  onMoveTabToPane: (sourcePaneId: string, sourceTabId: string, noteId: string, targetPaneId: string, targetIndex?: number) => void;
  onMoveTabToSplit: (sourcePaneId: string, sourceTabId: string, noteId: string, targetPaneId: string, zone: DropZone) => void;
  onTabDragStart: (paneId: string, tabId: string, noteId: string) => void;
  onTabDragEnd: () => void;
  onCloseOtherTabs: (paneId: string, tabId: string) => void;
  onCloseAllTabs: (paneId: string) => void;
  onTogglePinTab: (paneId: string, tabId: string) => void;
  onSplitTab: (paneId: string, tabId: string, direction: "horizontal" | "vertical") => void;
  hasSplitPanels: boolean;
  contextOpen?: boolean;
  onContextToggle?: () => void;
  onScrollToHeadingRegister?: (noteId: string | null, fn: ((text: string) => void) | null) => void;
}

export default function PaneTreeRenderer({
  node,
  notes,
  activeId,
  dragPayload,
  tabMode,
  paneTabs,
  paneFontScale,
  onPaneFontScaleChange,
  quickSwitcher,
  saveSignal,
  scrollToHeadingSignal,
  onActivate,
  onDrop,
  onTitleChange,
  onContentChange,
  onTypographyChange,
  onModeChange,
  onTabActivate,
  onTabClose,
  onNewTab,
  onAiAction,
  onEditorHandleChange,
  onCreateNoteInTab,
  onOpenQuickSwitcher,
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
  onSplitTab,
  hasSplitPanels,
  contextOpen,
  onContextToggle,
  onScrollToHeadingRegister,
}: Props) {
  if (node.type === "leaf") {
    const tabsState = paneTabs[node.id];
    const tabs = tabsState?.tabs ?? [];
    const activeTabId = tabsState?.activeTabId ?? "";
    // 탭이 0개(또는 activeTabId가 가리키는 탭이 없음)이면 진짜로 "이 패널에 열린 노트가 없다"는
    // 뜻이다 — node.noteId(leaf가 들고 있던 마지막 노트 id, 닫힌 뒤에도 정리가 안 됐을 수 있음)로
    // 되돌아가면 안 된다. 그러면 탭을 다 닫았는데도 직전에 보던 노트 내용이 그대로 남아있는
    // 것처럼 보인다. fallbackTab의 noteId는 항상 빈 문자열로 둬서, 아래 note 조회가 반드시
    // null이 되게 한다(EditorPanel이 빈 패널 화면을 그린다).
    const fallbackTab: Tab = { id: activeTabId, kind: "note", noteId: "" };
    const activeTab: Tab = tabs.find((t) => t.id === activeTabId) ?? fallbackTab;
    // 노트를 찾지 못하면 notes[0](임의의 다른 노트)로 빠지지 않고 null로 둔다 — EditorPanel은
    // note===null일 때 이미 "노트 없음" 복구 화면을 그리도록 되어 있다.
    const note = activeTab.kind === "note" ? notes.find((n) => n.id === activeTab.noteId) ?? null : null;
    // NotesWorkspace.canSplitPane과 동일한 기준 — 탭이 1개뿐이어도 분할(복제) 가능.
    const canSplitPane = hasSplitPanels || tabs.length >= 1;

    return (
      <EditorPanel
        node={node}
        activeTab={activeTab}
        note={note}
        allNotes={notes}
        tabs={tabs}
        activeTabId={activeTabId}
        isActive={activeId === node.id}
        dragPayload={dragPayload}
        mode={tabMode[activeTabId] ?? "edit"}
        fontScale={paneFontScale[node.id] ?? 100}
        onFontScaleChange={(next) => onPaneFontScaleChange(node.id, next)}
        saveSignal={saveSignal}
        scrollToHeadingSignal={scrollToHeadingSignal}
        onModeChange={onModeChange}
        onActivate={() => onActivate(node.id)}
        onDrop={(zone, noteId) => onDrop(node.id, zone, noteId)}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
        onTypographyChange={onTypographyChange}
        onTabActivate={(tabId) => onTabActivate(node.id, tabId)}
        onTabClose={(tabId) => onTabClose(node.id, tabId)}
        onNewTab={() => onNewTab(node.id)}
        onAiAction={onAiAction}
        onEditorHandleChange={onEditorHandleChange}
        onCreateNoteInTab={() => onCreateNoteInTab(node.id, activeTab.id)}
        onOpenQuickSwitcher={() => onOpenQuickSwitcher(node.id, activeTab.id)}
        quickSwitcherOpen={quickSwitcher?.paneId === node.id && quickSwitcher?.tabId === activeTabId}
        onQuickSwitcherSelect={onQuickSwitcherSelect}
        onQuickSwitcherClose={onQuickSwitcherClose}
        onReplaceActiveTab={(noteId) => onReplaceActiveTab(node.id, noteId)}
        onAddNoteTab={(noteId, targetIndex) => onAddNoteTab(node.id, noteId, targetIndex)}
        onReorderTab={(tabId, targetIndex) => onReorderTab(node.id, tabId, targetIndex)}
        onMoveTabToPane={(sourcePaneId, sourceTabId, noteId, targetIndex) =>
          onMoveTabToPane(sourcePaneId, sourceTabId, noteId, node.id, targetIndex)
        }
        onMoveTabToSplit={(sourcePaneId, sourceTabId, noteId, zone) =>
          onMoveTabToSplit(sourcePaneId, sourceTabId, noteId, node.id, zone)
        }
        onTabDragStart={(tabId, noteId) => onTabDragStart(node.id, tabId, noteId)}
        onTabDragEnd={onTabDragEnd}
        onCloseOtherTabs={(tabId) => onCloseOtherTabs(node.id, tabId)}
        onCloseAllTabs={() => onCloseAllTabs(node.id)}
        onTogglePinTab={(tabId) => onTogglePinTab(node.id, tabId)}
        onSplitTabRight={(tabId) => onSplitTab(node.id, tabId, "horizontal")}
        onSplitTabDown={(tabId) => onSplitTab(node.id, tabId, "vertical")}
        canSplitWorkspace={canSplitPane}
        contextOpen={contextOpen}
        onContextToggle={onContextToggle}
        onScrollToHeadingRegister={onScrollToHeadingRegister}
      />
    );
  }

  const defaultSize = 100 / node.children.length;

  return (
    <Group orientation={node.direction} style={{ height: "100%", width: "100%" }}>
      {node.children.map((child, index) => (
        <React.Fragment key={child.id}>
          <Panel defaultSize={defaultSize} minSize="8%" style={{ overflow: "hidden" }}>
            <PaneTreeRenderer
              node={child}
              notes={notes}
              activeId={activeId}
              dragPayload={dragPayload}
              tabMode={tabMode}
              paneTabs={paneTabs}
              paneFontScale={paneFontScale}
              onPaneFontScaleChange={onPaneFontScaleChange}
              quickSwitcher={quickSwitcher}
              saveSignal={saveSignal}
              scrollToHeadingSignal={scrollToHeadingSignal}
              onActivate={onActivate}
              onDrop={onDrop}
              onTitleChange={onTitleChange}
              onContentChange={onContentChange}
              onTypographyChange={onTypographyChange}
              onModeChange={onModeChange}
              onTabActivate={onTabActivate}
              onTabClose={onTabClose}
              onNewTab={onNewTab}
              onAiAction={onAiAction}
              onEditorHandleChange={onEditorHandleChange}
              onCreateNoteInTab={onCreateNoteInTab}
              onOpenQuickSwitcher={onOpenQuickSwitcher}
              onQuickSwitcherSelect={onQuickSwitcherSelect}
              onQuickSwitcherClose={onQuickSwitcherClose}
              onReplaceActiveTab={onReplaceActiveTab}
              onAddNoteTab={onAddNoteTab}
              onReorderTab={onReorderTab}
              onMoveTabToPane={onMoveTabToPane}
              onMoveTabToSplit={onMoveTabToSplit}
              onTabDragStart={onTabDragStart}
              onTabDragEnd={onTabDragEnd}
              onCloseOtherTabs={onCloseOtherTabs}
              onCloseAllTabs={onCloseAllTabs}
              onTogglePinTab={onTogglePinTab}
              onSplitTab={onSplitTab}
              hasSplitPanels={hasSplitPanels}
              contextOpen={contextOpen}
              onContextToggle={onContextToggle}
              onScrollToHeadingRegister={onScrollToHeadingRegister}
            />
          </Panel>

          {index < node.children.length - 1 && (
            <Separator
              style={{
                width:  node.direction === "horizontal" ? 4 : "100%",
                height: node.direction === "vertical"   ? 4 : "100%",
                background: "rgb(var(--line) / 0.35)",
                cursor: node.direction === "horizontal" ? "col-resize" : "row-resize",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgb(var(--primary) / 0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgb(var(--line) / 0.35)";
              }}
            />
          )}
        </React.Fragment>
      ))}
    </Group>
  );
}
