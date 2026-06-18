"use client";

import React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { PaneNode, MockNote, PaneTabsState, Tab, DragPayload } from "@/lib/notes/noteTypes";
import { DropZone } from "@/lib/notes/paneUtils";
import EditorPanel from "./EditorPanel";
import type { EditMode, AiActionType } from "./NoteEditor";

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
  quickSwitcher: QuickSwitcherTarget | null;
  saveSignal: number;
  onActivate: (id: string) => void;
  onDrop: (paneId: string, zone: DropZone, noteId: string) => void;
  onTitleChange: (noteId: string, newTitle: string) => void;
  onContentChange: (noteId: string, newContentHtml: string) => void;
  onModeChange: (tabId: string, mode: EditMode) => void;
  onTabActivate: (paneId: string, tabId: string) => void;
  onTabClose: (paneId: string, tabId: string) => void;
  onNewTab: (paneId: string) => void;
  onAiAction: (type: AiActionType, text: string) => void;
  onCreateNoteInTab: (paneId: string, tabId: string) => void;
  onOpenQuickSwitcher: (paneId: string, tabId: string) => void;
  onQuickSwitcherSelect: (noteId: string) => void;
  onQuickSwitcherClose: () => void;
  onReplaceActiveTab: (paneId: string, noteId: string) => void;
  onAddNoteTab: (paneId: string, noteId: string, targetIndex?: number) => void;
  onReorderTab: (paneId: string, tabId: string, targetIndex: number) => void;
  onMoveTabToPane: (sourcePaneId: string, sourceTabId: string, noteId: string, targetPaneId: string, targetIndex?: number) => void;
  onTabDragStart: (paneId: string, tabId: string, noteId: string) => void;
  onTabDragEnd: () => void;
  onCloseOtherTabs: (paneId: string, tabId: string) => void;
  onCloseAllTabs: (paneId: string) => void;
  onTogglePinTab: (paneId: string, tabId: string) => void;
  onSplitTab: (paneId: string, tabId: string, direction: "horizontal" | "vertical") => void;
}

export default function PaneTreeRenderer({
  node,
  notes,
  activeId,
  dragPayload,
  tabMode,
  paneTabs,
  quickSwitcher,
  saveSignal,
  onActivate,
  onDrop,
  onTitleChange,
  onContentChange,
  onModeChange,
  onTabActivate,
  onTabClose,
  onNewTab,
  onAiAction,
  onCreateNoteInTab,
  onOpenQuickSwitcher,
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
  onSplitTab,
}: Props) {
  if (node.type === "leaf") {
    const tabsState = paneTabs[node.id];
    const activeTabId = tabsState?.activeTabId ?? "";
    const fallbackTab: Tab = { id: activeTabId, kind: "note", noteId: node.noteId };
    const activeTab: Tab = tabsState?.tabs.find((t) => t.id === activeTabId) ?? fallbackTab;
    const note = activeTab.kind === "note" ? notes.find((n) => n.id === activeTab.noteId) ?? notes[0] : null;
    const tabs = tabsState?.tabs ?? [fallbackTab];

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
        saveSignal={saveSignal}
        onModeChange={onModeChange}
        onActivate={() => onActivate(node.id)}
        onDrop={(zone, noteId) => onDrop(node.id, zone, noteId)}
        onTitleChange={onTitleChange}
        onContentChange={onContentChange}
        onTabActivate={(tabId) => onTabActivate(node.id, tabId)}
        onTabClose={(tabId) => onTabClose(node.id, tabId)}
        onNewTab={() => onNewTab(node.id)}
        onAiAction={onAiAction}
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
        onTabDragStart={(tabId, noteId) => onTabDragStart(node.id, tabId, noteId)}
        onTabDragEnd={onTabDragEnd}
        onCloseOtherTabs={(tabId) => onCloseOtherTabs(node.id, tabId)}
        onCloseAllTabs={() => onCloseAllTabs(node.id)}
        onTogglePinTab={(tabId) => onTogglePinTab(node.id, tabId)}
        onSplitTabRight={(tabId) => onSplitTab(node.id, tabId, "horizontal")}
        onSplitTabDown={(tabId) => onSplitTab(node.id, tabId, "vertical")}
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
              quickSwitcher={quickSwitcher}
              saveSignal={saveSignal}
              onActivate={onActivate}
              onDrop={onDrop}
              onTitleChange={onTitleChange}
              onContentChange={onContentChange}
              onModeChange={onModeChange}
              onTabActivate={onTabActivate}
              onTabClose={onTabClose}
              onNewTab={onNewTab}
              onAiAction={onAiAction}
              onCreateNoteInTab={onCreateNoteInTab}
              onOpenQuickSwitcher={onOpenQuickSwitcher}
              onQuickSwitcherSelect={onQuickSwitcherSelect}
              onQuickSwitcherClose={onQuickSwitcherClose}
              onReplaceActiveTab={onReplaceActiveTab}
              onAddNoteTab={onAddNoteTab}
              onReorderTab={onReorderTab}
              onMoveTabToPane={onMoveTabToPane}
              onTabDragStart={onTabDragStart}
              onTabDragEnd={onTabDragEnd}
              onCloseOtherTabs={onCloseOtherTabs}
              onCloseAllTabs={onCloseAllTabs}
              onTogglePinTab={onTogglePinTab}
              onSplitTab={onSplitTab}
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
