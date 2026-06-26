"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { WikiLinkContext, resolveWikiLinkTitle, type WikiLinkContextValue } from "./WikiLinkContext";
import { ChevronLeft, Download, MoreHorizontal, RotateCcw, Save } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, PaneNode, PaneTabsState, Tab, NotesWorkspaceSession, DragPayload } from "@/lib/notes/noteTypes";
import type { EditMode, AiActionType } from "./NoteEditor";
import { MOCK_NOTES, MOCK_FOLDERS } from "@/lib/notes/mockNotes";
import {
  USE_MOCK_NOTES,
  createWorkspaceNote,
  listFolders,
  listNotes,
  updateWorkspaceNoteContent,
  updateWorkspaceNoteMetadata,
  workspaceFolderToMock,
  workspaceNoteToMock,
} from "@/lib/workspace-api";
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
import EmptyNoteStartPage from "./EmptyNoteStartPage";
import QuickSwitcher from "./QuickSwitcher";
import NotesExplorer from "./NotesExplorer";
import RightSidebar, { type PendingAiRequest } from "./RightSidebar";
import { moveNoteIntoFolder, reorderNoteRelativeTo, moveFolderUnder, reorderFolderRelativeTo } from "@/lib/notes/folderDnd";
import { exportNote, isNotionDemoSession, uploadAndImportFile, type ExportFormat } from "@/lib/ingestion-api";
import { downloadPdfFile, downloadTextFile, htmlToMarkdown, htmlToPlainText, safeFileName } from "@/lib/notes/exportNoteContent";
import { useBrainX } from "@/components/brainx-provider";

export type InitialTab = { kind: "note"; noteId: string } | { kind: "start" };

type SaveStatus = "idle" | "saving" | "saved" | "error";

const CONTEXT_PANEL_SIZE_KEY = "brainx_notes_context_panel_size_v1";

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
    version: 1,
    persisted: false,
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

/* 패널 트리 + 탭 상태를 함께 초기화 (동일한 paneId로 묶기 위해 한번에 생성). initialTab이 "start"면
   탭을 만들지 않는다(탭 배열이 빈 상태) — 워크스페이스가 이를 보고 Welcome 보드를 보여준다. */
function createInitialPaneState(initialTab: InitialTab) {
  const rootId = uid();
  const leafNoteId = initialTab.kind === "note" ? initialTab.noteId : MOCK_NOTES[0].id;
  const tabs: Tab[] = initialTab.kind === "note" ? [{ id: uid(), kind: "note", noteId: initialTab.noteId }] : [];
  return {
    root: { type: "leaf", id: rootId, noteId: leafNoteId } as PaneNode,
    activeId: rootId,
    paneTabs: {
      [rootId]: { tabs, activeTabId: tabs[0]?.id ?? "" },
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

function replaceNoteIdInNode(node: PaneNode, oldId: string, newId: string): PaneNode {
  if (node.type === "leaf") {
    return node.noteId === oldId ? { ...node, noteId: newId } : node;
  }
  return {
    ...node,
    children: node.children.map((child) => replaceNoteIdInNode(child, oldId, newId)),
  };
}

function replaceNoteIdInTabs(tabsByPane: Record<string, PaneTabsState>, oldId: string, newId: string) {
  return Object.fromEntries(
    Object.entries(tabsByPane).map(([paneId, tabsState]) => [
      paneId,
      {
        ...tabsState,
        tabs: tabsState.tabs.map((tab) => (tab.kind === "note" && tab.noteId === oldId ? { ...tab, noteId: newId } : tab)),
      },
    ])
  ) as Record<string, PaneTabsState>;
}

export default function NotesWorkspace({ initialTab, persistKey, onActiveNoteChange }: NotesWorkspaceProps) {
  // 최초 1회만 생성되는 초기값 (pane root와 paneTabs가 같은 paneId를 공유해야 함)
  const initRef = useRef<ReturnType<typeof createInitialPaneState> | null>(null);
  if (!initRef.current) initRef.current = createInitialPaneState(initialTab);
  const init = initRef.current;

  const { pushToast } = useBrainX();

  // 툴바 "···" 메뉴 — 지금은 "내보내기" 항목 하나뿐이지만, 새 메뉴 항목이 늘어날 자리.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
        setExportSubmenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [moreMenuOpen]);

  const [state, setState] = useState<{ root: PaneNode; activeId: string }>(() => ({
    root: init.root,
    activeId: init.activeId,
  }));
  const [paneTabs, setPaneTabs] = useState<Record<string, PaneTabsState>>(() => init.paneTabs);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => {
    const handleToggle = () => setExplorerOpen((prev) => !prev);
    window.addEventListener("brainx-toggle-notes-explorer", handleToggle);
    return () => window.removeEventListener("brainx-toggle-notes-explorer", handleToggle);
  }, []);
  // 컨텍스트 패널 폭 — Split View(PaneTreeRenderer.tsx)와 동일한 react-resizable-panels
  // Group/Panel/Separator를 재사용해 드래그로 조절 가능하게 한다. 마지막 폭은 localStorage에
  // 저장해 새로고침 후에도 유지(요구사항).
  //
  // 첫 드래그만 마우스 이동량의 일부만 반영되고(실측: 100px 드래그 → 10px만 적용) 두 번째
  // 드래그부터 정상화되는 버그가 있었다(Playwright로 재현). Split View 쪽 Group(같은
  // 라이브러리, PaneTreeRenderer.tsx)은 동일 문제가 없었는데 — 그쪽은 사용자가 직접 분할할
  // 때(이미 페이지가 안정된 뒤) 마운트되고, 이 컨텍스트 패널 Group은 페이지 로드 즉시
  // 마운트된다는 차이뿐이었다.
  //
  // 원인을 좁혀보려고 시도한 것들(전부 효과 없었음, Playwright로 직접 검증):
  //   - groupRef.setLayout()으로 마운트 직후 레이아웃 재적용
  //   - window.dispatchEvent(new Event("resize"))(진짜/합성 둘 다)
  //   - 패널 DOM에 1px 강제 리사이즈 후 원복
  //   - separator에 합성(untrusted) PointerEvent로 "워밍업 제스처" 흘려보내기
  // 유일하게 효과가 있었던 건 Playwright의 page.mouse.down/move/up(브라우저가 isTrusted:true로
  // 인식하는 진짜 제스처)으로 한 번 드래그해 보는 것뿐이었다 — 즉 라이브러리의 내부 드래그
  // 델타 계산이 "신뢰된(isTrusted) 포인터 제스처"가 한 번 있어야 기준점을 잡는 것으로 보이고,
  // 스크립트로 dispatch한 합성 이벤트는 isTrusted:false라 그 기준점 보정이 일어나지 않는다.
  // 페이지 코드에서 신뢰된 이벤트를 만들어낼 방법은 없으므로(보안상 당연히 막혀 있음), 이
  // Separator만 라이브러리의 내장 드래그 대신 직접 만든 mousedown/mousemove 핸들러로 폭을
  // 계산해 `groupRef.setLayout()`을 호출하는 방식으로 바꿔 라이브러리의 그 내부 계산 경로를
  // 아예 타지 않게 했다 — 신뢰된 이벤트 여부와 무관하게 항상 실제 마우스 이동량만큼 반영된다.
  const [contextPanelSize, setContextPanelSize] = useState<number>(() => {
    if (typeof window === "undefined") return 300;
    const saved = Number(window.localStorage.getItem(CONTEXT_PANEL_SIZE_KEY));
    return Number.isFinite(saved) && saved >= 270 && saved <= 800 ? saved : 300;
  });
  const contextGroupElRef = useRef<HTMLDivElement>(null);

  const handleContextSeparatorMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startContext = contextPanelSize;
    let latest = startContext;

    const onMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startX;
      latest = Math.max(270, Math.min(800, startContext - deltaX));
      setContextPanelSize(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        window.localStorage.setItem(CONTEXT_PANEL_SIZE_KEY, String(latest));
      } catch {
        // localStorage 접근 불가
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [contextPanelSize]);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const aiNonceRef = useRef(0);
  const hydratedRef = useRef(false);
  const prevActiveNoteIdRef = useRef<string | null>(null);
  const prevInitialKeyRef = useRef<string>(initialTab.kind === "note" ? initialTab.noteId : "start");
  const saveStatusTimerRef = useRef<number | null>(null);
  const effectivePersistKey = USE_MOCK_NOTES ? persistKey : undefined;
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
      if (!current || current.tabs.length === 0) {
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
    const isEmptyActive = !active || !activeNote || activeNote.content.trim() === "";
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

  /* 노트 탐색기 위로 OS 파일을 드래그&드롭하면 /import 화면과 동일한
     uploadAndImportFile() 경로로 가져오기를 수행한다(현재 선택된 폴더로 들어감).
     데모(Notion demo) 세션은 실제 자산 업로드 백엔드가 없어 지원하지 않는다. */
  const handleDropFiles = useCallback((files: FileList) => {
    if (USE_MOCK_NOTES || isNotionDemoSession()) {
      pushToast("데모 모드에서는 드래그&드롭 가져오기를 지원하지 않습니다.", "err");
      return;
    }
    void (async () => {
      const fileList = Array.from(files);
      let firstNoteId: string | null = null;
      let successCount = 0;
      for (const file of fileList) {
        try {
          const job = await uploadAndImportFile(file, selectedFolderId ?? undefined);
          if (!job || job.status === "FAILED") {
            pushToast(`${file.name} 가져오기에 실패했습니다.`, "err");
            continue;
          }
          const noteIds = job.createdNotes.map((item) => item.noteId).filter((id): id is string => !!id);
          if (noteIds.length > 0) {
            firstNoteId ??= noteIds[0];
            successCount += noteIds.length;
          }
        } catch (error) {
          pushToast(error instanceof Error ? error.message : `${file.name} 가져오기에 실패했습니다.`, "err");
        }
      }
      if (successCount > 0) {
        pushToast(`${successCount}개 노트를 가져왔어요`, "ok");
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: firstNoteId ?? undefined } }));
      }
    })();
  }, [selectedFolderId, pushToast]);

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
     분할이 아닌 단일 패널이면 그 패널의 탭을 빈 배열로 되돌린다(탭이 아니라 Welcome
     보드 — empty state — 가 보이게 됨, NotesWorkspace 최상위 렌더링 참고).
     "모두 닫기"와 "마지막 탭 X로 닫기"가 동일한 정책을 공유한다. */
  const closePaneOrClearTabs = useCallback((paneId: string) => {
    if (panelCount > 1) {
      handleClose(paneId);
      return;
    }
    setPaneTabs((prev) => ({ ...prev, [paneId]: { tabs: [], activeTabId: "" } }));
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, [panelCount, handleClose]);

  /* 탭을 다른 패널로 "이동"한다(복제가 아님) — Obsidian처럼 같은 패널/다른 패널/분할 구조 어디서든
     동작. 1) 목표 패널에 openNoteInPane 정책으로 노트를 연 뒤, 2) 원본 패널에서 그 탭을 제거한다.
     원본 패널의 마지막 탭이었으면 closePaneOrClearTabs 정책(분할 취소 또는 빈 탭 상태 복귀)을 따른다. */
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
      closePaneOrClearTabs(sourcePaneId);
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
  }, [paneTabs, openNoteInPane, closePaneOrClearTabs]);

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

  /* 노트 전체 타이포그래피(기본 글꼴 크기 배율/레벨별 개별 크기/문서 기본 글꼴) 변경 — 선택
     텍스트 전용 BubbleToolbar 설정과 별개로 노트 단위로 저장한다. undefined면 커스터마이징
     해제(기본값으로 되돌리기) */
  const handleTypographyChange = useCallback((noteId: string, next: MockNote["typography"]) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, typography: next, updatedAt: Date.now() } : n))
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

  /* 탭을 드래그해서 다른 패널의 "본문"(zone)에 떨어뜨려 분할을 만들 때의 이동 버전 — handleDrop과
     달리 새 분할을 만든 뒤 원본 패널에서 그 탭을 제거한다(복제 방지). 원본이 마지막 탭이었으면
     closePaneOrClearTabs로 원본 패널을 정리한다(분할 취소 또는 빈 탭 상태 복귀).
     sourcePaneId === targetPaneId(패널이 1개뿐일 때 자기 자신의 본문에 드롭해 처음으로 분할하는
     가장 흔한 경우)를 막지 않는다 — splitNodeAt은 원본 leaf를 그대로 한쪽 children으로 보존하고
     새 leaf만 추가하므로(lib/notes/paneUtils.ts), source===target이어도 트리/paneTabs 갱신
     로직이 동일하게 안전하게 동작한다. 예전엔 여기서 무조건 no-op 처리해, 패널이 1개뿐인 상태에서
     탭을 드래그해 분할 미리보기는 뜨지만 실제로 드롭하면 아무 변화가 없는 버그가 있었다. */
  const handleMoveTabToSplit = useCallback((
    sourcePaneId: string,
    sourceTabId: string,
    noteId: string,
    targetPaneId: string,
    zone: DropZone
  ) => {
    const newLeafId = uid();
    const newTabId = uid();
    const direction: "horizontal" | "vertical" =
      zone === "left" || zone === "right" ? "horizontal" : "vertical";
    const position: "before" | "after" =
      zone === "left" || zone === "top" ? "before" : "after";
    const sourceTabs = paneTabs[sourcePaneId];
    const isLastTabInSource = !sourceTabs || sourceTabs.tabs.length <= 1;

    setState((prev) => ({
      root: splitNodeAt(prev.root, targetPaneId, direction, noteId, newLeafId, position),
      activeId: newLeafId,
    }));
    setPaneTabs((prev) => ({
      ...prev,
      [newLeafId]: { tabs: [{ id: newTabId, kind: "note", noteId }], activeTabId: newTabId },
    }));

    if (isLastTabInSource) {
      closePaneOrClearTabs(sourcePaneId);
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
  }, [paneTabs, closePaneOrClearTabs]);

  /* 탭 활성화 (같은 패널 내 탭 전환) */
  const handleTabActivate = useCallback((paneId: string, tabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      return { ...prev, [paneId]: { ...current, activeTabId: tabId } };
    });
  }, []);

  /* 탭 닫기 — 활성 탭을 닫으면 인접 탭으로 이동. 마지막 탭이면 closePaneOrClearTabs 정책을 따른다
     (화면분할이면 패널 제거, 단일 패널이면 빈 시작 화면으로 복귀) — 더 이상 닫기를 막지 않는다. */
  const handleTabClose = useCallback((paneId: string, tabId: string) => {
    const current = paneTabs[paneId];
    if (!current) return;
    if (current.tabs.length <= 1) {
      closePaneOrClearTabs(paneId);
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
  }, [paneTabs, closePaneOrClearTabs]);

  /* 새 노트 생성 (선택된 폴더 또는 지정된 폴더 안에 생성), 지정한 패널의 새 탭으로 연다.
     title을 주면(위키링크에서 생성하는 경우) 그 제목으로 바로 생성한다. */
  const createNote = useCallback((folderId: string | undefined, paneId: string, title?: string) => {
    const newNote = makeBlankNote(folderId);
    if (title) newNote.title = title;
    const newTabId = uid();
    setNotes((prev) => [newNote, ...prev]);
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

  /* "새 파일 생성하기" / Ctrl+N — 항상 새 탭으로 추가한다. 탭이 0개(Welcome 상태)인 패널이면
     createNote가 빈 탭 배열에 첫 탭을 넣는 것과 동일하게 동작해 자연스럽게 Welcome을 해제한다. */
  /* "새 노트 생성하기"(Welcome Screen 버튼 / Ctrl+N)는 사이드바에서 선택된 폴더와 무관하게
     항상 루트/미분류로 만든다 — 폴더 컨텍스트를 따라가는 "노트 탐색기 상단 + 새 노트"
     버튼(handleNewNote)과는 의도적으로 다른 정책이다. */
  const requestNewNote = useCallback((paneId: string) => {
    createNote(undefined, paneId);
  }, [createNote]);

  /* 탭 바의 "+" 버튼 → 해당 패널에 즉시 새(빈) 노트를 만든다.
     requestNewNote(Ctrl+N과 동일 정책)를 그대로 재사용한다. */
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

  /* "모두 닫기" — closePaneOrClearTabs와 동일한 정책(화면분할이면 패널 제거, 단일 패널이면
     /notes 시작 화면 — 새 파일/새 폴더 생성하기 — 으로 복귀)을 그대로 재사용한다. */
  const handleCloseAllTabs = useCallback((paneId: string) => {
    closePaneOrClearTabs(paneId);
  }, [closePaneOrClearTabs]);

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
    if (!active) {
      // Welcome 상태(탭 0개)에서 연 Quick Switcher — 그 패널에 첫 탭으로 연다.
      handleReplaceActiveTab(paneId, noteId);
    } else {
      handleNoteClick(noteId);
    }
    setQuickSwitcher(null);
  }, [quickSwitcher, paneTabs, handleReplaceActiveTab, handleNoteClick]);

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

  /* 노트 삭제 — 같은 노트가 여러 패널에 중복으로 열려 있을 수 있으므로(의도된 기능) 모든 패널을
     훑어 해당 노트를 가리키는 탭을 전부 제거한다. 탭 제거로 0개가 된 패널은: 분할의 일부면
     closeNode로 트리에서 제거(분할 취소), 유일하게 남은 leaf면 tabs:[]로 비워 Welcome 보드가
     보이게 한다(closePaneOrClearTabs와 동일한 정책, 다만 한 번에 여러 패널을 처리해야 해서
     별도로 구현). */
  const handleDeleteNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));

    const affectedPaneIds = Object.keys(paneTabs).filter((paneId) =>
      paneTabs[paneId].tabs.some((t) => t.noteId === noteId)
    );
    if (affectedPaneIds.length === 0) return;

    const removingTabIds = affectedPaneIds.flatMap((paneId) =>
      paneTabs[paneId].tabs.filter((t) => t.noteId === noteId).map((t) => t.id)
    );

    let nextRoot = state.root;
    const removedPaneIds = new Set<string>();
    for (const paneId of affectedPaneIds) {
      const remainingTabs = paneTabs[paneId].tabs.filter((t) => t.noteId !== noteId);
      if (remainingTabs.length > 0) continue;
      if (countLeaves(nextRoot) > 1) {
        const removed = closeNode(nextRoot, paneId);
        if (removed) {
          nextRoot = removed;
          removedPaneIds.add(paneId);
        }
      }
    }
    if (nextRoot !== state.root) {
      const nextActiveId = removedPaneIds.has(state.activeId)
        ? findFirstLeafId(nextRoot) ?? state.activeId
        : state.activeId;
      setState({ root: nextRoot, activeId: nextActiveId });
    }

    setPaneTabs((prev) => {
      const next = { ...prev };
      for (const paneId of affectedPaneIds) {
        if (removedPaneIds.has(paneId)) {
          delete next[paneId];
          continue;
        }
        const current = next[paneId];
        const newTabs = current.tabs.filter((t) => t.noteId !== noteId);
        const newActiveTabId = newTabs.some((t) => t.id === current.activeTabId)
          ? current.activeTabId
          : newTabs[0]?.id ?? "";
        next[paneId] = { tabs: newTabs, activeTabId: newActiveTabId };
      }
      return next;
    });

    setTabMode((prev) => {
      const next = { ...prev };
      removingTabIds.forEach((tid) => { delete next[tid]; });
      return next;
    });
  }, [paneTabs, state]);

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
    if (!effectivePersistKey) {
      hydratedRef.current = true;
      return;
    }
    const saved = readSession(effectivePersistKey);
    if (saved) {
      // 이전 버전(Welcome이 kind:"start" 탭으로 저장되던 시절)의 세션이 남아있을 수 있으므로,
      // "note"가 아닌 탭은 걸러내고 activeTabId가 사라진 탭을 가리키면 첫 탭으로 재조정한다.
      let nextPaneTabs: Record<string, PaneTabsState> = Object.fromEntries(
        Object.entries(saved.paneTabs).map(([paneId, tabsState]) => {
          const tabs = tabsState.tabs.filter((t) => t.kind === "note");
          const activeTabId = tabs.some((t) => t.id === tabsState.activeTabId)
            ? tabsState.activeTabId
            : tabs[0]?.id ?? "";
          return [paneId, { tabs, activeTabId }];
        })
      );
      // 복원된 세션 위에서, initialTab이 note를 가리키면 그 노트를 활성 패널의 탭으로 연다.
      // (handleNoteClick은 마운트 시점의 stale state를 참조하므로 여기서 saved 값으로 직접 계산한다.)
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
  }, [effectivePersistKey]);

  useEffect(() => {
    if (USE_MOCK_NOTES) return;
    let active = true;

    function loadFromServer(openNoteId?: string) {
      setLoadError(null);
      return Promise.all([listNotes(), listFolders()])
        .then(([noteData, folderData]) => {
          if (!active) return;
          const nextNotes = noteData.notes.map(workspaceNoteToMock);
          const nextFolders = folderData.folders.map(workspaceFolderToMock);
          setNotes(nextNotes);
          setFolders(nextFolders);

          const targetNoteId = openNoteId ?? (initialTab.kind === "note" ? initialTab.noteId : null);
          if (targetNoteId && nextNotes.some((note) => note.id === targetNoteId)) {
            handleReplaceActiveTab(state.activeId, targetNoteId);
            return;
          }
          if (!openNoteId && initialTab.kind === "note" && nextNotes.length > 0) {
            handleReplaceActiveTab(state.activeId, nextNotes[0].id);
          }
        })
        .catch((error) => {
          if (active) setLoadError(error instanceof Error ? error.message : "Workspace-Service에서 노트를 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) hydratedRef.current = true;
        });
    }

    loadFromServer();

    // Import 등 NotesWorkspace 외부(별도 마운트된 화면)에서 노트가 새로 생성된 경우, 이 컴포넌트는
    // 라우트 전환에도 리마운트되지 않아(레이아웃에서 한 번만 마운트) mount 시점 fetch만으로는 새
    // 노트를 못 본다. 외부에서 이 이벤트를 쏘면 목록을 다시 불러오고, 지정한 노트를 바로 연다.
    function handleExternalRefresh(event: Event) {
      const noteId = (event as CustomEvent<{ noteId?: string }>).detail?.noteId;
      void loadFromServer(noteId);
    }
    window.addEventListener("brainx:notes-refresh", handleExternalRefresh);

    return () => {
      active = false;
      window.removeEventListener("brainx:notes-refresh", handleExternalRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!effectivePersistKey || !hydratedRef.current) return;
    const handle = window.setTimeout(() => {
      try {
        writeSession(effectivePersistKey, { root: state.root, activeId: state.activeId, paneTabs, notes, folders });
      } catch {
        // 백그라운드 자동저장 실패는 무시
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [effectivePersistKey, state, paneTabs, notes, folders]);

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
  const saveActiveNoteToBackend = useCallback(async () => {
    const noteId = latestSessionRef.current.paneTabs[latestSessionRef.current.activeId]?.tabs.find(
      (tab) => tab.id === latestSessionRef.current.paneTabs[latestSessionRef.current.activeId]?.activeTabId
    );
    if (!noteId || noteId.kind !== "note") {
      return;
    }

    const note = latestSessionRef.current.notes.find((item) => item.id === noteId.noteId);
    if (!note) {
      return;
    }

    if (!note.persisted && !note.id.startsWith("note_")) {
      const created = await createWorkspaceNote(note);
      let nextVersion = created.version;
      const savedId = created.noteId;
      if (note.typography) {
        const metadata = await updateWorkspaceNoteMetadata({ ...note, id: savedId, version: nextVersion, persisted: true });
        nextVersion = metadata.version;
      }
      setNotes((prev) =>
        prev.map((item) =>
          item.id === note.id
            ? { ...item, id: savedId, version: nextVersion, persisted: true, updatedAt: Date.now() }
            : item
        )
      );
      setState((prev) => ({ ...prev, root: replaceNoteIdInNode(prev.root, note.id, savedId) }));
      setPaneTabs((prev) => replaceNoteIdInTabs(prev, note.id, savedId));
      prevActiveNoteIdRef.current = savedId;
      onActiveNoteChange?.(savedId);
      return;
    }

    const content = await updateWorkspaceNoteContent(note);
    const metadata = await updateWorkspaceNoteMetadata({ ...note, version: content.version, persisted: true });
    setNotes((prev) =>
      prev.map((item) =>
        item.id === note.id
          ? { ...item, version: metadata.version, persisted: true, updatedAt: Date.parse(content.savedAt) || Date.now() }
          : item
      )
    );
  }, [onActiveNoteChange]);

  const handleManualSave = useCallback(() => {
    setSaveStatus("saving");
    setSaveSignal((n) => n + 1);
    if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = window.setTimeout(async () => {
      if (!USE_MOCK_NOTES) {
        try {
          await saveActiveNoteToBackend();
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
        return;
      }
      if (!effectivePersistKey) {
        setSaveStatus("saved");
        return;
      }
      try {
        writeSession(effectivePersistKey, latestSessionRef.current);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 250);
  }, [effectivePersistKey, saveActiveNoteToBackend]);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  /** POST /api/v1/exports는 SSOT 계약대로 계속 호출하지만(작업 기록), 현재 백엔드 구현은
      MVP 스텁이라 존재하지 않는 cdn.brainx.com URL만 돌려줘 실제 다운로드가 되지 않는다
      (브라우저가 그 도메인을 찾지 못해 그냥 아무 일도 안 일어난 것처럼 보임). 백엔드가 실제
      파일을 렌더링하기 전까지는, 이미 메모리에 있는 노트 HTML을 여기서 직접 변환해
      내려준다(exportNoteContent.ts) — 그래서 백엔드 호출은 실패해도 무시한다(best-effort). */
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!activeNote) return;
    setExportingFormat(format);
    try {
      if (!isNotionDemoSession()) {
        exportNote(activeNote.id, format).catch(() => {});
      }
      const fileName = safeFileName(activeNote.title);
      if (format === "TXT") {
        downloadTextFile(`${fileName}.txt`, htmlToPlainText(activeNote.content), "text/plain;charset=utf-8");
      } else if (format === "MD") {
        downloadTextFile(`${fileName}.md`, htmlToMarkdown(activeNote.content), "text/markdown;charset=utf-8");
      } else {
        await downloadPdfFile(activeNote.title, activeNote.content, `${fileName}.pdf`);
      }
      pushToast(`${format} 내보내기를 시작했어요`, "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "내보내기에 실패했습니다.", "err");
    } finally {
      setExportingFormat(null);
      setMoreMenuOpen(false);
      setExportSubmenuOpen(false);
    }
  }, [activeNote, pushToast]);

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

  // 위키링크([[노트]]) 기능에 필요한 컨텍스트 — 노트 목록 조회/존재 확인/이동/생성을 에디터
  // 깊숙이(NoteEditor → CodeBlockView 같은 중첩 단계 없이도) 어디서든 쓸 수 있게 한다.
  const wikiLinkNoteRefs = useMemo(() => notes.map((n) => ({ id: n.id, title: n.title })), [notes]);
  const wikiLinkValue = useMemo<WikiLinkContextValue>(
    () => ({
      notes: wikiLinkNoteRefs,
      resolveTitle: (title) => resolveWikiLinkTitle(wikiLinkNoteRefs, title),
      onNavigate: (title) => {
        const found = resolveWikiLinkTitle(wikiLinkNoteRefs, title);
        if (found) handleNoteClick(found.id);
      },
      onCreate: (title) => {
        createNote(undefined, state.activeId, title);
      },
    }),
    [wikiLinkNoteRefs, handleNoteClick, createNote, state.activeId]
  );

  const paneTree = (
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
      onTypographyChange={handleTypographyChange}
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
      onMoveTabToSplit={handleMoveTabToSplit}
      onTabDragStart={handleTabDragStart}
      onTabDragEnd={handleDragEnd}
      onCloseOtherTabs={handleCloseOtherTabs}
      onCloseAllTabs={handleCloseAllTabs}
      onTogglePinTab={handleTogglePinTab}
      onSplitTab={handleSplitTab}
      contextOpen={contextOpen}
      onContextToggle={() => setContextOpen((prev) => !prev)}
    />
  );

  /* 워크스페이스 전체 기준으로 열린 노트가 0개인지 — root가 분할 없는 단일 leaf이고 그 leaf의
     탭이 비어있을 때만 true. Welcome 보드는 탭이 아니라 이 empty state를 직접 그린다(탭 배열에
     들어가지 않음) — 분할 중에는 closePaneOrClearTabs가 마지막까지 패널을 1개로 줄여놓고 나서야
     이 상태에 도달하므로, "전체 기준 노트 0개"일 때만 자연히 발동한다. */
  const isWorkspaceEmpty = state.root.type === "leaf" && (paneTabs[state.root.id]?.tabs.length ?? 0) === 0;
  const welcomeQuickSwitcherOpen = quickSwitcher?.paneId === state.activeId;
  const mainContent = isWorkspaceEmpty ? (
    <div
      className="relative h-full"
      onDragOver={(e) => {
        if (dragPayload?.kind !== "note") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (dragPayload?.kind !== "note") return;
        e.preventDefault();
        handleReplaceActiveTab(state.activeId, dragPayload.noteId);
      }}
    >
      {welcomeQuickSwitcherOpen ? (
        <QuickSwitcher
          notes={notes}
          onSelect={handleQuickSwitcherSelect}
          onClose={() => setQuickSwitcher(null)}
        />
      ) : (
        <EmptyNoteStartPage
          onCreateNote={() => requestNewNote(state.activeId)}
          onGoToFile={() => requestQuickSwitcher(state.activeId, "")}
        />
      )}
    </div>
  ) : (
    paneTree
  );

  return (
    <WikiLinkContext.Provider value={wikiLinkValue}>
    <SplitThemeContext.Provider value={AUTO_THEME}>
        <div className="flex h-full overflow-hidden">

        {/* ── 좌측: 노트 탐색기 ──────────────────────── */}
        {explorerOpen && (
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
            onDeleteNote={handleDeleteNote}
            onRenameNote={handleTitleChange}
            onDragStart={handleSidebarDragStart}
            onDragEnd={handleDragEnd}
            onMoveNoteToFolder={handleMoveNoteToFolder}
            onReorderNote={handleReorderNote}
            onMoveFolderToParent={handleMoveFolderToParent}
            onReorderFolder={handleReorderFolder}
            onDropFiles={handleDropFiles}
          />
        )}

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
            {loadError ? <span className="text-[11px] font-medium text-red-400">{loadError}</span> : null}
            <SaveStatusBadge status={saveStatus} />
            <button
              type="button"
              onClick={handleManualSave}
              disabled={saveStatus === "saving" || !activeNote}
              title="선택된 노트 저장"
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                saveStatus === "saving" || !activeNote
                  ? "cursor-not-allowed border-transparent text-txt3/50"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              )}
            >
              <Save size={12} />
              <span>저장</span>
            </button>
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
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((current) => !current)}
                title="더 보기"
                className={cx(
                  "inline-flex h-[26px] w-[26px] items-center justify-center rounded-lg border transition-colors",
                  moreMenuOpen
                    ? "border-line/60 bg-surface2/60 text-txt"
                    : "border-transparent text-txt3 hover:border-line/60 hover:bg-surface2/50 hover:text-txt"
                )}
              >
                <MoreHorizontal size={14} />
              </button>
              {moreMenuOpen && (
                <div
                  role="menu"
                  aria-label="더 보기 메뉴"
                  className="absolute right-0 top-[calc(100%+4px)] z-[1200] w-44 overflow-hidden rounded-lg border border-line/60 py-1"
                  style={{
                    background: "rgb(var(--surface))",
                    boxShadow: "0 12px 28px -6px rgba(2,6,23,0.5), 0 0 0 1px rgb(var(--border) / 0.2)"
                  }}
                >
                  {!exportSubmenuOpen ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setExportSubmenuOpen(true)}
                      disabled={!activeNote}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt disabled:cursor-not-allowed disabled:text-txt3/50"
                    >
                      <Download size={13} />
                      <span>내보내기</span>
                    </button>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExportSubmenuOpen(false)}
                        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-medium text-txt3 transition-colors hover:text-txt"
                      >
                        <ChevronLeft size={12} />
                        <span>내보내기 형식</span>
                      </button>
                      {(["PDF", "MD", "TXT"] as ExportFormat[]).map((format) => (
                        <button
                          key={format}
                          type="button"
                          role="menuitem"
                          onClick={() => handleExport(format)}
                          disabled={exportingFormat !== null}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt disabled:cursor-not-allowed disabled:text-txt3/50"
                        >
                          <span>{format}</span>
                          {exportingFormat === format && <span className="text-[10px] text-txt3">내보내는 중…</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 에디터 + 우측 컨텍스트 패널 — 컨텍스트 패널은 고정 폭이었는데, Split View
              (PaneTreeRenderer.tsx)가 패널 사이 리사이즈에 쓰는 것과 같은
              Group/Panel/Separator(react-resizable-panels)를 그대로 재사용해 드래그로 폭을
              조절할 수 있게 했다 — 새 리사이즈 로직을 따로 만들지 않아 동작이 이미 검증된
              컴포넌트를 그대로 쓴다. */}
          <div className="flex flex-1 overflow-hidden">
            {contextOpen ? (
              <>
                <div className="flex-1 min-w-0 overflow-hidden" ref={contextGroupElRef}>
                  {mainContent}
                </div>

                {/* 우측 패널 리사이즈 핸들 */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-valuenow={contextPanelSize}
                  aria-valuemin={270}
                  aria-valuemax={800}
                  tabIndex={0}
                  onMouseDown={handleContextSeparatorMouseDown}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const next = Math.max(270, Math.min(800, contextPanelSize + (e.key === "ArrowLeft" ? 20 : -20)));
                    setContextPanelSize(next);
                    try {
                      window.localStorage.setItem(CONTEXT_PANEL_SIZE_KEY, String(next));
                    } catch {}
                  }}
                  style={{
                    width: 4,
                    background: "rgb(var(--line) / 0.35)",
                    cursor: "col-resize",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--primary) / 0.45)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgb(var(--line) / 0.35)"; }}
                />

                <div
                  style={{
                    width: contextPanelSize,
                    minWidth: "min(270px, 100vw)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <RightSidebar
                    key={activeNoteId ?? "start"}
                    activeNote={activeNote}
                    allNotes={notes}
                    onCollapse={() => setContextOpen(false)}
                    pendingAiRequest={aiRequest}
                    onAiRequestHandled={() => setAiRequest(null)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-hidden">{mainContent}</div>
                <button
                  type="button"
                  onClick={() => setContextOpen(true)}
                  title="컨텍스트 패널 열기"
                  className="flex w-6 shrink-0 flex-col items-center justify-center border-l border-line/50 bg-bg2/30 text-txt3 transition-colors hover:bg-surface2/50 hover:text-txt"
                >
                  <ChevronLeft size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </SplitThemeContext.Provider>
    </WikiLinkContext.Provider>
  );
}
