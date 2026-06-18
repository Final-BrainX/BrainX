"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { RotateCcw, ChevronLeft } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, PaneNode, PaneTabsState, Tab, NotesWorkspaceSession, DragPayload } from "@/lib/notes/noteTypes";
import type { EditMode, AiActionType } from "./NoteEditor";
import { MOCK_NOTES, MOCK_FOLDERS } from "@/lib/notes/mockNotes";
import {
  uid,
  splitNodeAt,
  closeNode,
  countLeaves,
  findFirstLeafId,
  DropZone,
} from "@/lib/notes/paneUtils";
import { AUTO_THEME } from "./theme";
import { SplitThemeContext } from "./SplitThemeContext";
import PaneTreeRenderer, { type QuickSwitcherTarget } from "./PaneTreeRenderer";
import NotesExplorer from "./NotesExplorer";
import RightSidebar, { type PendingAiRequest } from "./RightSidebar";
import { moveNoteIntoFolder, reorderNoteRelativeTo, moveFolderUnder, reorderFolderRelativeTo } from "@/lib/notes/folderDnd";

export type InitialTab = { kind: "note"; noteId: string } | { kind: "start" };

type SaveStatus = "idle" | "saving" | "saved" | "error";

function makeBlankNote(folderId?: string): MockNote {
  return {
    id: `note-${uid()}`,
    title: "새 노트",
    content: "",
    tags: [],
    category: "frontend",
    folderId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패",
};

const SAVE_STATUS_CLASS: Record<SaveStatus, string> = {
  idle: "text-txt3",
  saving: "text-txt3",
  saved: "text-primary",
  error: "text-red-400",
};

/** Ctrl+S 저장 상태 — 위치가 바뀌지 않도록 고정 너비 슬롯에 표시 */
function SaveStatusBadge({ status }: { status: SaveStatus }) {
  return (
    <span className={cx("inline-flex w-[64px] shrink-0 items-center justify-end text-[11px] font-medium", SAVE_STATUS_CLASS[status])}>
      {SAVE_STATUS_LABEL[status]}
    </span>
  );
}

interface NotesWorkspaceProps {
  initialTab: InitialTab;
  /** 지정 시 localStorage에 세션(분할/탭/노트/폴더)을 영속화한다. 데모(split-demo)는 비워서 매번 초기화. */
  persistKey?: string;
  /** 대표 활성 노트가 바뀔 때 호출 — 페이지에서 URL을 갱신하는 데 사용 */
  onActiveNoteChange?: (noteId: string) => void;
}

/* 패널 트리 + 탭 상태를 함께 초기화 (동일한 paneId로 묶기 위해 한번에 생성) */
function createInitialPaneState(initialTab: InitialTab) {
  const rootId = uid();
  const tabId = uid();
  const tab: Tab =
    initialTab.kind === "note" ? { id: tabId, kind: "note", noteId: initialTab.noteId } : { id: tabId, kind: "start" };
  const leafNoteId = initialTab.kind === "note" ? initialTab.noteId : MOCK_NOTES[0].id;
  return {
    root: { type: "leaf", id: rootId, noteId: leafNoteId } as PaneNode,
    activeId: rootId,
    paneTabs: {
      [rootId]: { tabs: [tab], activeTabId: tabId },
    } as Record<string, PaneTabsState>,
  };
}

function readSession(persistKey: string): NotesWorkspaceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(persistKey);
    if (!raw) return null;
    return JSON.parse(raw) as NotesWorkspaceSession;
  } catch {
    return null;
  }
}

/** 호출자가 직접 실패를 처리한다 (백그라운드 자동저장은 무시, 수동 저장은 실패 상태로 노출) */
function writeSession(persistKey: string, session: NotesWorkspaceSession) {
  window.localStorage.setItem(persistKey, JSON.stringify(session));
}

export default function NotesWorkspace({ initialTab, persistKey, onActiveNoteChange }: NotesWorkspaceProps) {
  // 최초 1회만 생성되는 초기값 (pane root와 paneTabs가 같은 paneId를 공유해야 함)
  const initRef = useRef<ReturnType<typeof createInitialPaneState> | null>(null);
  if (!initRef.current) initRef.current = createInitialPaneState(initialTab);
  const init = initRef.current;

  const [state, setState] = useState<{ root: PaneNode; activeId: string }>(() => ({
    root: init.root,
    activeId: init.activeId,
  }));
  const [paneTabs, setPaneTabs] = useState<Record<string, PaneTabsState>>(() => init.paneTabs);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  // MOCK_NOTES를 가변 상태로 복사 → 제목 수정/새 노트 생성 시 사이드바/헤더/컨텍스트 패널 즉시 반영
  const [notes, setNotes] = useState<MockNote[]>(() => [...MOCK_NOTES]);
  const [folders, setFolders] = useState<MockFolder[]>(() => [...MOCK_FOLDERS]);
  // 탭(노트 인스턴스)별 읽기/편집 모드 — tabId 기준. 패널이 아니라 탭 단위라서 같은 패널 안에서
  // 탭마다 다른 모드를 가질 수 있고, 같은 노트를 여러 패널에 열어도 각 탭이 독립적으로 유지된다.
  // 기록이 없는 tabId는 항상 "edit"로 취급한다(새 노트/새로 연 노트는 기본 편집 모드).
  const [tabMode, setTabMode] = useState<Record<string, EditMode>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState<PendingAiRequest | null>(null);
  const [quickSwitcher, setQuickSwitcher] = useState<QuickSwitcherTarget | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveSignal, setSaveSignal] = useState(0);
  const aiNonceRef = useRef(0);
  const hydratedRef = useRef(false);
  const prevActiveNoteIdRef = useRef<string | null>(null);
  const prevInitialKeyRef = useRef<string>(initialTab.kind === "note" ? initialTab.noteId : "start");
  const saveStatusTimerRef = useRef<number | null>(null);
  // Ctrl+S 발생 시점의 최신 세션 스냅샷 — 디바운스/렌더 타이밍과 무관하게 항상 최신값을 읽기 위한 ref
  const latestSessionRef = useRef<NotesWorkspaceSession>({
    root: init.root,
    activeId: init.activeId,
    paneTabs: init.paneTabs,
    notes: [...MOCK_NOTES],
    folders: [...MOCK_FOLDERS],
  });

  const panelCount = countLeaves(state.root);

  /* 활성 패널의 활성 탭 → 현재 노트 (우측 컨텍스트 패널 기준). start 탭이면 null. */
  const activeTabsState = paneTabs[state.activeId];
  const activeTab = activeTabsState?.tabs.find((t) => t.id === activeTabsState.activeTabId) ?? null;
  const activeNoteId = activeTab?.kind === "note" ? activeTab.noteId : null;
  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) ?? null : null;

  /* ── 핸들러 ────────────────────────────────────────── */

  /* 활성 탭을 해당 노트로 교체 (이미 같은 패널에 열려있으면 그 탭을 활성화). paneId를 받아 "드롭한
     패널 기준" 동작도 같은 로직으로 처리한다 — 사이드바 클릭은 항상 현재 활성 패널을 대상으로 호출. */
  const handleReplaceActiveTab = useCallback((paneId: string, noteId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) {
        const newTabId = uid();
        return { ...prev, [paneId]: { tabs: [{ id: newTabId, kind: "note", noteId }], activeTabId: newTabId } };
      }
      const existing = current.tabs.find((t) => t.kind === "note" && t.noteId === noteId);
      if (existing) {
        return { ...prev, [paneId]: { ...current, activeTabId: existing.id } };
      }
      const newTabs = current.tabs.map((t) =>
        t.id === current.activeTabId ? ({ id: t.id, kind: "note", noteId } as Tab) : t
      );
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: current.activeTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, []);

  /* 사이드바 노트를 탭바 영역에 드롭 → 해당 패널에 새 탭으로 추가 (이미 열려있으면 그 탭 활성화).
     targetIndex를 주면 그 위치에 삽입(탭바 드래그 인디케이터 위치와 일치), 없으면 맨 끝에 추가. */
  const handleAddNoteTab = useCallback((paneId: string, noteId: string, targetIndex?: number) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) {
        const newTabId = uid();
        return { ...prev, [paneId]: { tabs: [{ id: newTabId, kind: "note", noteId }], activeTabId: newTabId } };
      }
      const existing = current.tabs.find((t) => t.kind === "note" && t.noteId === noteId);
      if (existing) {
        return { ...prev, [paneId]: { ...current, activeTabId: existing.id } };
      }
      const newTabId = uid();
      const newTab: Tab = { id: newTabId, kind: "note", noteId };
      const insertAt = targetIndex === undefined
        ? current.tabs.length
        : Math.max(0, Math.min(targetIndex, current.tabs.length));
      const newTabs = [...current.tabs];
      newTabs.splice(insertAt, 0, newTab);
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, []);

  /* 패널에 노트를 여는 공통 정책 — "교체"는 그 패널이 비어있을 때만 적용되고, 실제 내용이 있는
     노트가 열려 있으면 새 탭으로 추가한다(기존 노트를 무조건 교체하지 않음). "비어있다"는 빈 시작
     화면(start)뿐 아니라 "+"로 막 생성된 본문이 빈 노트 탭도 포함한다(빈 탭 = 교체 대상).
     사이드바 클릭, 탭바 드롭, 탭 이동 모두 이 정책을 공유한다. */
  const openNoteInPane = useCallback((paneId: string, noteId: string, targetIndex?: number) => {
    const current = paneTabs[paneId];
    const active = current?.tabs.find((t) => t.id === current.activeTabId);
    const activeNote = active?.kind === "note" ? notes.find((n) => n.id === active.noteId) : null;
    const isEmptyActive = !active || active.kind === "start" || !activeNote || activeNote.content.trim() === "";
    if (isEmptyActive) {
      handleReplaceActiveTab(paneId, noteId);
    } else {
      handleAddNoteTab(paneId, noteId, targetIndex);
    }
  }, [paneTabs, notes, handleReplaceActiveTab, handleAddNoteTab]);

  /* 사이드바에서 노트 클릭 → 현재 활성 패널에 openNoteInPane 정책 적용 */
  const handleNoteClick = useCallback((noteId: string) => {
    openNoteInPane(state.activeId, noteId);
  }, [state.activeId, openNoteInPane]);

  /* 같은 패널 안에서 탭 hold & drag로 순서 변경. activeTabId는 건드리지 않으므로 활성 탭 상태는 유지된다. */
  const handleReorderTab = useCallback((paneId: string, tabId: string, targetIndex: number) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const fromIdx = current.tabs.findIndex((t) => t.id === tabId);
      if (fromIdx === -1) return prev;
      const tabs = [...current.tabs];
      const [moved] = tabs.splice(fromIdx, 1);
      let insertAt = targetIndex;
      if (fromIdx < targetIndex) insertAt -= 1;
      insertAt = Math.max(0, Math.min(insertAt, tabs.length));
      tabs.splice(insertAt, 0, moved);
      return { ...prev, [paneId]: { ...current, tabs } };
    });
  }, []);

  /* 패널 닫기 — paneTabs 정리 + 그 패널에 있던 탭들의 tabMode 항목도 함께 정리 */
  const handleClose = useCallback((id: string) => {
    const closingTabIds = paneTabs[id]?.tabs.map((t) => t.id) ?? [];
    setState((prev) => {
      const newRoot = closeNode(prev.root, id);
      if (!newRoot) return prev;
      const newActiveId =
        prev.activeId === id ? (findFirstLeafId(newRoot) ?? prev.activeId) : prev.activeId;
      return { root: newRoot, activeId: newActiveId };
    });
    if (closingTabIds.length > 0) {
      setTabMode((prev) => {
        const next = { ...prev };
        closingTabIds.forEach((tid) => { delete next[tid]; });
        return next;
      });
    }
    setPaneTabs((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  }, [paneTabs]);

  /* 패널의 마지막 탭이 닫힐 때 공통 정책: 화면분할 상태면 패널 자체를 제거(분할 취소),
     분할이 아닌 단일 패널이면 그 패널을 빈 시작 화면(Welcome) 탭으로 되돌린다.
     "모두 닫기"와 "마지막 탭 X로 닫기"가 동일한 정책을 공유한다. */
  const closePaneOrRevertToStart = useCallback((paneId: string) => {
    if (panelCount > 1) {
      handleClose(paneId);
      return;
    }
    const newTabId = uid();
    setPaneTabs((prev) => ({ ...prev, [paneId]: { tabs: [{ id: newTabId, kind: "start" }], activeTabId: newTabId } }));
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, [panelCount, handleClose]);

  /* 탭을 다른 패널로 "이동"한다(복제가 아님) — Obsidian처럼 같은 패널/다른 패널/분할 구조 어디서든
     동작. 1) 목표 패널에 openNoteInPane 정책으로 노트를 연 뒤, 2) 원본 패널에서 그 탭을 제거한다.
     원본 패널의 마지막 탭이었으면 closePaneOrRevertToStart 정책(분할 취소 또는 시작 화면 복귀)을 따른다. */
  const handleMoveTabToPane = useCallback((
    sourcePaneId: string,
    sourceTabId: string,
    noteId: string,
    targetPaneId: string,
    targetIndex?: number
  ) => {
    if (sourcePaneId === targetPaneId) return;
    const sourceTabs = paneTabs[sourcePaneId];
    const isLastTabInSource = !sourceTabs || sourceTabs.tabs.length <= 1;

    openNoteInPane(targetPaneId, noteId, targetIndex);

    if (isLastTabInSource) {
      closePaneOrRevertToStart(sourcePaneId);
      return;
    }
    setPaneTabs((prev) => {
      const current = prev[sourcePaneId];
      if (!current) return prev;
      const idx = current.tabs.findIndex((t) => t.id === sourceTabId);
      const newTabs = current.tabs.filter((t) => t.id !== sourceTabId);
      let newActiveTabId = current.activeTabId;
      if (current.activeTabId === sourceTabId) {
        newActiveTabId = (newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0]).id;
      }
      return { ...prev, [sourcePaneId]: { tabs: newTabs, activeTabId: newActiveTabId } };
    });
  }, [paneTabs, openNoteInPane, closePaneOrRevertToStart]);

  const handleActivate = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeId: id }));
  }, []);

  /* 탭(노트 인스턴스) 모드 변경 — tabId 기준으로 저장. 같은 패널 안에서도 탭마다, 같은 노트를
     여러 패널에 열어도 각 탭 인스턴스마다 독립적으로 유지된다. */
  const handleModeChange = useCallback((tabId: string, mode: EditMode) => {
    setTabMode((prev) => ({ ...prev, [tabId]: mode }));
  }, []);

  /* 노트 제목 변경 → notes 상태 갱신 (사이드바/탭/헤더/컨텍스트 즉시 반영) */
  const handleTitleChange = useCallback((noteId: string, newTitle: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, title: newTitle, updatedAt: Date.now() } : n))
    );
  }, []);

  /* 노트 본문 변경(에디터 onUpdate 디바운스) → notes 상태 갱신, 탭 전환 후에도 내용 유지 */
  const handleContentChange = useCallback((noteId: string, newContentHtml: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content: newContentHtml, updatedAt: Date.now() } : n))
    );
  }, []);

  /* D&D drop → 항상 분할, 새 패널에 탭 1개로 초기화 */
  const handleDrop = useCallback((paneId: string, zone: DropZone, noteId: string) => {
    const newLeafId = uid();
    const newTabId = uid();
    const direction: "horizontal" | "vertical" =
      zone === "left" || zone === "right" ? "horizontal" : "vertical";
    const position: "before" | "after" =
      zone === "left" || zone === "top" ? "before" : "after";
    setState((prev) => ({
      root: splitNodeAt(prev.root, paneId, direction, noteId, newLeafId, position),
      activeId: newLeafId,
    }));
    setPaneTabs((prev) => ({
      ...prev,
      [newLeafId]: { tabs: [{ id: newTabId, kind: "note", noteId }], activeTabId: newTabId },
    }));
  }, []);

  /* 탭 활성화 (같은 패널 내 탭 전환) */
  const handleTabActivate = useCallback((paneId: string, tabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      return { ...prev, [paneId]: { ...current, activeTabId: tabId } };
    });
  }, []);

  /* 탭 닫기 — 활성 탭을 닫으면 인접 탭으로 이동. 마지막 탭이면 closePaneOrRevertToStart 정책을 따른다
     (화면분할이면 패널 제거, 단일 패널이면 빈 시작 화면으로 복귀) — 더 이상 닫기를 막지 않는다. */
  const handleTabClose = useCallback((paneId: string, tabId: string) => {
    const current = paneTabs[paneId];
    if (!current) return;
    if (current.tabs.length <= 1) {
      closePaneOrRevertToStart(paneId);
      return;
    }
    setPaneTabs((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      const idx = cur.tabs.findIndex((t) => t.id === tabId);
      const newTabs = cur.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = cur.activeTabId;
      if (cur.activeTabId === tabId) {
        newActiveTabId = (newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0]).id;
      }
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newActiveTabId } };
    });
  }, [paneTabs, closePaneOrRevertToStart]);

  /* 새 노트 생성 (선택된 폴더 또는 지정된 폴더 안에 생성), 지정한 패널의 새 탭으로 연다 */
  const createNote = useCallback((folderId: string | undefined, paneId: string) => {
    const newNote = makeBlankNote(folderId);
    const newTabId = uid();
    setNotes((prev) => [...prev, newNote]);
    setPaneTabs((prev) => {
      const current = prev[paneId];
      const newTab: Tab = { id: newTabId, kind: "note", noteId: newNote.id };
      const newTabs = current ? [...current.tabs, newTab] : [newTab];
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
    return newNote.id;
  }, []);

  /* 사이드바 "+ 새 노트" 버튼 → 현재 선택된 폴더 안에, 활성 패널의 새 탭으로 생성 */
  const handleNewNote = useCallback((folderId?: string) => {
    createNote(folderId, state.activeId);
  }, [createNote, state.activeId]);

  /* 특정 탭(보통 start 탭)을 새로 만든 노트로 같은 자리에서 교체 */
  const replaceTabWithNote = useCallback((paneId: string, tabId: string, noteId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const newTabs = current.tabs.map((t) =>
        t.id === tabId ? ({ id: tabId, kind: "note", noteId } as Tab) : t
      );
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: tabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, []);

  /* "새 파일 생성하기" / Ctrl+N — start 탭이면 그 자리에서 노트로 교체, 아니면 새 탭으로 추가 */
  /* "새 노트 생성하기"(Welcome Screen 버튼 / Ctrl+N)는 사이드바에서 선택된 폴더와 무관하게
     항상 루트/미분류로 만든다 — 폴더 컨텍스트를 따라가는 "노트 탐색기 상단 + 새 노트"
     버튼(handleNewNote)과는 의도적으로 다른 정책이다. */
  const requestNewNote = useCallback((paneId: string) => {
    const tabsState = paneTabs[paneId];
    const active = tabsState?.tabs.find((t) => t.id === tabsState.activeTabId);
    if (active?.kind === "start") {
      const newNote = makeBlankNote(undefined);
      setNotes((prev) => [...prev, newNote]);
      replaceTabWithNote(paneId, active.id, newNote.id);
    } else {
      createNote(undefined, paneId);
    }
  }, [paneTabs, replaceTabWithNote, createNote]);

  /* 탭 바의 "+" 버튼 → 해당 패널에 즉시 새(빈) 노트를 만든다.
     활성 탭이 빈 시작 화면(start)이면 그 자리에서 교체(빈 탭이 남아있으면 안 됨), 실제 노트가
     열려 있으면 새 탭으로 추가 — requestNewNote(Ctrl+N과 동일 정책)를 그대로 재사용한다. */
  const handleNewTab = useCallback((paneId: string) => {
    requestNewNote(paneId);
  }, [requestNewNote]);

  /* 탭 닫기 변형: 우클릭 메뉴의 "다른 탭 닫기" — 고정된 탭은 보존 */
  const handleCloseOtherTabs = useCallback((paneId: string, keepTabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const keep = current.tabs.filter((t) => t.id === keepTabId || (t.kind === "note" && t.pinned));
      return { ...prev, [paneId]: { tabs: keep, activeTabId: keepTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, []);

  /* "모두 닫기" — closePaneOrRevertToStart와 동일한 정책(화면분할이면 패널 제거, 단일 패널이면
     /notes 시작 화면 — 새 파일/새 폴더 생성하기 — 으로 복귀)을 그대로 재사용한다. */
  const handleCloseAllTabs = useCallback((paneId: string) => {
    closePaneOrRevertToStart(paneId);
  }, [closePaneOrRevertToStart]);

  /* 탭 고정/고정 해제 토글 */
  const handleTogglePinTab = useCallback((paneId: string, tabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const newTabs = current.tabs.map((t) => (t.id === tabId && t.kind === "note" ? { ...t, pinned: !t.pinned } : t));
      return { ...prev, [paneId]: { ...current, tabs: newTabs } };
    });
  }, []);

  /* 우클릭 메뉴의 "우측 분할"/"하단 분할" — 해당 탭의 노트를 새 패널에 그대로 연다 */
  const handleSplitTab = useCallback((paneId: string, tabId: string, direction: "horizontal" | "vertical") => {
    const current = paneTabs[paneId];
    const tab = current?.tabs.find((t) => t.id === tabId);
    if (!tab || tab.kind !== "note") return;
    const newLeafId = uid();
    const newTabId = uid();
    setState((prev) => ({
      root: splitNodeAt(prev.root, paneId, direction, tab.noteId, newLeafId, "after"),
      activeId: newLeafId,
    }));
    setPaneTabs((prev) => ({
      ...prev,
      [newLeafId]: { tabs: [{ id: newTabId, kind: "note", noteId: tab.noteId }], activeTabId: newTabId },
    }));
  }, [paneTabs]);

  /* 사이드바 노트 드래그 시작/종료 — 본문 드롭=교체, 탭바 드롭=탭추가로 구분된다 (EditorPanel/TabBar 참고) */
  const handleSidebarDragStart = useCallback((noteId: string) => setDragPayload({ kind: "note", noteId }), []);
  const handleDragEnd = useCallback(() => setDragPayload(null), []);

  /* 탭 Hold & Drag 시작 — 본문 드롭은 기존 분할 메커니즘(zone), 탭바 드롭은 같은 패널 내 재정렬 */
  const handleTabDragStart = useCallback((paneId: string, tabId: string, noteId: string) => {
    setDragPayload({ kind: "tab", paneId, tabId, noteId });
  }, []);

  /* 방어적 안전망: 드롭이 어떤 onDrop 핸들러에도 닿지 않거나(예: 패널 바깥/사이드바로 도로 드롭)
     onDragEnd가 누락되는 경우에도 dragPayload가 영구히 남아 본문 위 DnD 오버레이가 계속 클릭을
     가로채는 일이 없도록 전역 dragend/drop에서 한 번 더 정리한다. */
  useEffect(() => {
    const clear = () => setDragPayload(null);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  /* "파일로 이동하기" / Ctrl+O */
  const requestQuickSwitcher = useCallback((paneId: string, tabId: string) => {
    setQuickSwitcher({ paneId, tabId });
  }, []);

  const handleQuickSwitcherSelect = useCallback((noteId: string) => {
    if (!quickSwitcher) return;
    const { paneId, tabId } = quickSwitcher;
    const tabsState = paneTabs[paneId];
    const active = tabsState?.tabs.find((t) => t.id === tabId);
    if (active?.kind === "start") {
      replaceTabWithNote(paneId, tabId, noteId);
    } else {
      handleNoteClick(noteId);
    }
    setQuickSwitcher(null);
  }, [quickSwitcher, paneTabs, replaceTabWithNote, handleNoteClick]);

  /* 폴더 생성 — 루트(parentFolderId=null) 또는 특정 폴더 하위에 인라인으로 추가 */
  const handleCreateFolder = useCallback((parentFolderId: string | null, name: string) => {
    const newFolder: MockFolder = { id: `folder-${uid()}`, name, parentFolderId };
    setFolders((prev) => [...prev, newFolder]);
  }, []);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f)));
  }, []);

  const handleChangeFolderColor = useCallback((folderId: string, color: string) => {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, color } : f)));
  }, []);

  const handleToggleFolderFavorite = useCallback((folderId: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, favorite: !f.favorite } : f))
    );
  }, []);

  /* 폴더 삭제 — 하위 폴더/노트는 삭제된 폴더의 부모로 승격(데이터 손실 방지) */
  const handleDeleteFolder = useCallback((folderId: string) => {
    setFolders((prev) => {
      const target = prev.find((f) => f.id === folderId);
      if (!target) return prev;
      return prev
        .filter((f) => f.id !== folderId)
        .map((f) => (f.parentFolderId === folderId ? { ...f, parentFolderId: target.parentFolderId } : f));
    });
    setNotes((prev) => {
      const target = folders.find((f) => f.id === folderId);
      return prev.map((n) =>
        n.folderId === folderId ? { ...n, folderId: target?.parentFolderId ?? undefined } : n
      );
    });
    setSelectedFolderId((prev) => (prev === folderId ? null : prev));
  }, [folders]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  /* 노트 탐색기 드래그앤드랍 — 노트를 폴더/루트로 이동, 또는 같은 레벨에서 순서 변경. */
  const handleMoveNoteToFolder = useCallback((noteId: string, targetFolderId: string | null) => {
    setNotes((prev) => moveNoteIntoFolder(prev, noteId, targetFolderId));
  }, []);

  const handleReorderNote = useCallback((noteId: string, referenceNoteId: string, position: "before" | "after") => {
    setNotes((prev) => reorderNoteRelativeTo(prev, noteId, referenceNoteId, position));
  }, []);

  /* 폴더 이동 — 자기 자신/하위 폴더로의 이동은 folderDnd의 canFolderMoveUnder가 차단(null 반환 시 무시) */
  const handleMoveFolderToParent = useCallback((folderId: string, targetParentId: string | null) => {
    setFolders((prev) => moveFolderUnder(prev, folderId, targetParentId) ?? prev);
  }, []);

  const handleReorderFolder = useCallback((folderId: string, referenceFolderId: string, position: "before" | "after") => {
    setFolders((prev) => reorderFolderRelativeTo(prev, folderId, referenceFolderId, position) ?? prev);
  }, []);

  /* 버블 툴바의 AI 버튼(요약/다시쓰기) → 우측 인라인 AI 패널에 mock 요청 전달 */
  const handleAiAction = useCallback((type: AiActionType, text: string) => {
    aiNonceRef.current += 1;
    setAiRequest({ type, text, nonce: aiNonceRef.current });
  }, []);

  const handleReset = useCallback(() => {
    const fresh = createInitialPaneState(initialTab);
    setState({ root: fresh.root, activeId: fresh.activeId });
    setPaneTabs(fresh.paneTabs);
    setTabMode({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 세션 영속화 (persistKey 지정 시) ──────────────────────────── */

  // mount 시 1회: 저장된 세션 복원 → initialTab이 note면 그 노트를 활성 패널 탭으로 연다
  useEffect(() => {
    if (!persistKey) {
      hydratedRef.current = true;
      return;
    }
    const saved = readSession(persistKey);
    if (saved) {
      // 복원된 세션 위에서, initialTab이 note를 가리키면 그 노트를 활성 패널의 탭으로 연다.
      // (handleNoteClick은 마운트 시점의 stale state를 참조하므로 여기서 saved 값으로 직접 계산한다.)
      let nextPaneTabs = saved.paneTabs;
      const nextActiveId = saved.activeId;
      if (initialTab.kind === "note") {
        const noteId = initialTab.noteId;
        const current = nextPaneTabs[nextActiveId];
        const existing = current?.tabs.find((t) => t.kind === "note" && t.noteId === noteId);
        if (existing) {
          nextPaneTabs = { ...nextPaneTabs, [nextActiveId]: { ...current, activeTabId: existing.id } };
        } else {
          const newTabId = uid();
          const newTab: Tab = { id: newTabId, kind: "note", noteId };
          const newTabs = current ? [...current.tabs, newTab] : [newTab];
          nextPaneTabs = { ...nextPaneTabs, [nextActiveId]: { tabs: newTabs, activeTabId: newTabId } };
        }
      }
      setState({ root: saved.root, activeId: nextActiveId });
      setPaneTabs(nextPaneTabs);
      setNotes(saved.notes);
      setFolders(saved.folders);
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // 마운트 후 initialTab이 바뀌면(클라이언트 라우팅으로 다른 노트로 이동) 해당 노트를 연다
  useEffect(() => {
    const key = initialTab.kind === "note" ? initialTab.noteId : "start";
    if (prevInitialKeyRef.current === key) return;
    prevInitialKeyRef.current = key;
    if (initialTab.kind === "note") handleNoteClick(initialTab.noteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab.kind === "note" ? initialTab.noteId : "start"]);

  // 변경 사항을 디바운스 저장 (백그라운드 자동저장 — 실패해도 조용히 무시, 수동 저장이 실패 상태를 노출)
  useEffect(() => {
    if (!persistKey || !hydratedRef.current) return;
    const handle = window.setTimeout(() => {
      try {
        writeSession(persistKey, { root: state.root, activeId: state.activeId, paneTabs, notes, folders });
      } catch {
        // 백그라운드 자동저장 실패는 무시
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [persistKey, state, paneTabs, notes, folders]);

  // Ctrl+S가 항상 최신 세션을 즉시 기록할 수 있도록 매 변경마다 ref에 스냅샷 보관
  useEffect(() => {
    latestSessionRef.current = { root: state.root, activeId: state.activeId, paneTabs, notes, folders };
  }, [state, paneTabs, notes, folders]);

  // 대표 활성 노트가 바뀌면 URL 갱신 콜백 호출
  useEffect(() => {
    if (!activeNoteId) return;
    if (prevActiveNoteIdRef.current === activeNoteId) return;
    prevActiveNoteIdRef.current = activeNoteId;
    onActiveNoteChange?.(activeNoteId);
  }, [activeNoteId, onActiveNoteChange]);

  /* Ctrl+S 수동 저장 — 활성 에디터에 디바운스 중인 본문/제목을 즉시 반영하도록 신호를 보낸 뒤,
     약간의 지연 후 최신 세션 스냅샷을 즉시 localStorage에 기록한다. */
  const handleManualSave = useCallback(() => {
    setSaveStatus("saving");
    setSaveSignal((n) => n + 1);
    if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = window.setTimeout(() => {
      if (!persistKey) {
        setSaveStatus("saved");
        return;
      }
      try {
        writeSession(persistKey, latestSessionRef.current);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 250);
  }, [persistKey]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  /* ── 키보드 단축키 (Ctrl/Cmd+N 새 파일, Ctrl/Cmd+O 파일로 이동, Ctrl/Cmd+S 저장) ── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        requestNewNote(state.activeId);
      } else if (key === "o") {
        e.preventDefault();
        const tabsState = paneTabs[state.activeId];
        const tabId = tabsState?.activeTabId;
        if (tabId) requestQuickSwitcher(state.activeId, tabId);
      } else if (key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.activeId, paneTabs, requestNewNote, requestQuickSwitcher, handleManualSave]);

  return (
    <SplitThemeContext.Provider value={AUTO_THEME}>
      <div className="flex h-full overflow-hidden">

        {/* ── 좌측: 노트 탐색기 ──────────────────────── */}
        <NotesExplorer
          notes={notes}
          folders={folders}
          activeNoteId={activeNoteId ?? ""}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          onNoteClick={handleNoteClick}
          onCreateFolder={handleCreateFolder}
          onCreateNote={handleNewNote}
          onRenameFolder={handleRenameFolder}
          onChangeFolderColor={handleChangeFolderColor}
          onToggleFolderFavorite={handleToggleFolderFavorite}
          onDeleteFolder={handleDeleteFolder}
          onDragStart={handleSidebarDragStart}
          onDragEnd={handleDragEnd}
          onMoveNoteToFolder={handleMoveNoteToFolder}
          onReorderNote={handleReorderNote}
          onMoveFolderToParent={handleMoveFolderToParent}
          onReorderFolder={handleReorderFolder}
        />

        {/* ── 중앙: 에디터 영역 ───────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* 툴바 */}
          <div className="flex shrink-0 items-center gap-3 border-b border-line/50 px-5 py-2">
            <span className="text-[12px] font-medium text-txt2">
              {panelCount}개 패널
            </span>
            <span className="text-[11px] text-txt3/60">
              · 노트 클릭 = 현재 탭 교체 · 본문에 드롭 = 교체 · 탭바에 드롭 = 탭 추가
            </span>
            <div className="flex-1" />
            <SaveStatusBadge status={saveStatus} />
            <button
              onClick={handleReset}
              title="레이아웃 초기화"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                "border-transparent text-txt3 hover:border-line/60 hover:bg-surface2/50 hover:text-txt"
              )}
            >
              <RotateCcw size={12} />
              <span>초기화</span>
            </button>
          </div>

          {/* 에디터 + 우측 컨텍스트 패널 */}
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <PaneTreeRenderer
                node={state.root}
                notes={notes}
                activeId={state.activeId}
                dragPayload={dragPayload}
                tabMode={tabMode}
                paneTabs={paneTabs}
                quickSwitcher={quickSwitcher}
                saveSignal={saveSignal}
                onActivate={handleActivate}
                onDrop={handleDrop}
                onTitleChange={handleTitleChange}
                onContentChange={handleContentChange}
                onModeChange={handleModeChange}
                onTabActivate={handleTabActivate}
                onTabClose={handleTabClose}
                onNewTab={handleNewTab}
                onAiAction={handleAiAction}
                onCreateNoteInTab={(paneId) => requestNewNote(paneId)}
                onOpenQuickSwitcher={(paneId, tabId) => requestQuickSwitcher(paneId, tabId)}
                onQuickSwitcherSelect={handleQuickSwitcherSelect}
                onQuickSwitcherClose={() => setQuickSwitcher(null)}
                onReplaceActiveTab={handleReplaceActiveTab}
                onAddNoteTab={handleAddNoteTab}
                onReorderTab={handleReorderTab}
                onMoveTabToPane={handleMoveTabToPane}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={handleDragEnd}
                onCloseOtherTabs={handleCloseOtherTabs}
                onCloseAllTabs={handleCloseAllTabs}
                onTogglePinTab={handleTogglePinTab}
                onSplitTab={handleSplitTab}
              />
            </div>

            {contextOpen ? (
              <RightSidebar
                key={activeNoteId ?? "start"}
                activeNote={activeNote}
                allNotes={notes}
                onCollapse={() => setContextOpen(false)}
                pendingAiRequest={aiRequest}
                onAiRequestHandled={() => setAiRequest(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setContextOpen(true)}
                title="컨텍스트 패널 열기"
                className="flex w-6 shrink-0 flex-col items-center justify-center border-l border-line/50 bg-bg2/30 text-txt3 transition-colors hover:bg-surface2/50 hover:text-txt"
              >
                <ChevronLeft size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </SplitThemeContext.Provider>
  );
}
