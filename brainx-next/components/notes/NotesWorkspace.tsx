"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { WikiLinkContext, resolveWikiLinkTitle, type WikiLinkContextValue } from "./WikiLinkContext";
import { AlertCircle, Check, ChevronLeft, Download, Link2, LoaderCircle, MoreHorizontal, PanelRightClose, PanelRight, RotateCcw, Save, Upload } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, PaneNode, PaneTabsState, Tab, NotesWorkspaceSession, DragPayload } from "@/lib/notes/noteTypes";
import type { EditMode, AiActionType, NoteEditorHandle } from "./NoteEditor";
import { MOCK_NOTES, MOCK_FOLDERS } from "@/lib/notes/mockNotes";
import {
  USE_MOCK_NOTES,
  WorkspaceApiError,
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  getNote,
  getWorkspaceNoteDraft,
  issueWorkspaceNoteDraftId,
  listFolders,
  listNotes,
  listWorkspaceNoteDrafts,
  patchWorkspaceFolder,
  saveWorkspaceNoteDraft,
  updateWorkspaceNoteContent,
  updateWorkspaceNoteMetadata,
  workspaceDraftToMock,
  workspaceFolderToMock,
  workspaceNoteToMock,
} from "@/lib/workspace-api";
import {
  uid,
  splitNodeAt,
  closeNode,
  countLeaves,
  findFirstLeafId,
  setNoteOnLeaf,
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
import { exportNote, uploadAndImportFile, type ExportFormat } from "@/lib/ingestion-api";
import { ShareLinkModal } from "./ShareLinkModal";
import { markdownToHtml } from "./NoteEditor";
import { useBrainX } from "@/components/brainx-provider";
import { consumePendingNoteClaim, readAuthSession } from "@/lib/auth-api";

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

/** 30초 주기 draft flush(NoteDraftFlushScheduler)가 백그라운드에서 note.version을 올릴 수 있어,
    Ctrl+S가 들고 있던 baseVersion이 그 사이 낡아 409 NOTE_VERSION_CONFLICT가 날 수 있다. 서버가
    돌려주는 실제 serverVersion으로 딱 한 번만 재시도한다 — 그래도 실패하면(진짜 동시 편집 충돌)
    그대로 던져 기존 에러 처리(저장 실패 상태 표시)를 그대로 탄다. */
async function saveNoteContentWithVersionRetry(note: MockNote) {
  try {
    return await updateWorkspaceNoteContent(note);
  } catch (error) {
    if (!(error instanceof WorkspaceApiError) || error.code !== "NOTE_VERSION_CONFLICT") {
      throw error;
    }
    const serverVersion =
      typeof error.details?.serverVersion === "number" ? error.details.serverVersion : (await getNote(note.id)).version;
    return await updateWorkspaceNoteContent({ ...note, version: serverVersion });
  }
}

const SAVE_BUTTON_TITLE: Record<SaveStatus, string> = {
  idle: "저장 (Ctrl+S)",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장 실패 — 다시 시도해 주세요",
};

/** draft 자동저장과 수동저장(Ctrl+S/클릭)을 하나의 아이콘 버튼 상태로 통합 표시 */
function SaveIconButton({ status, disabled, onClick }: { status: SaveStatus; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={SAVE_BUTTON_TITLE[status]}
      aria-label={SAVE_BUTTON_TITLE[status]}
      className={cx(
        "inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border transition-colors",
        disabled
          ? "cursor-not-allowed border-transparent text-txt3/50"
          : status === "error"
            ? "border-red-400/40 bg-red-400/10 text-red-400 hover:bg-red-400/15"
            : status === "saved"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-transparent text-txt3 hover:border-line/60 hover:bg-surface2/50 hover:text-txt"
      )}
    >
      {status === "saving" ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : status === "error" ? (
        <AlertCircle size={13} />
      ) : status === "saved" ? (
        <Check size={13} />
      ) : (
        <Save size={13} />
      )}
    </button>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="hidden w-60 shrink-0 flex-col gap-1.5 border-r border-line/50 px-3 py-3 md:flex">
      <div className="mb-2 h-7 w-full animate-pulse rounded-md bg-surface2/60" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-6 w-full animate-pulse rounded-md bg-surface2/40" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line/50 px-5 py-2">
      <div className="h-4 w-20 animate-pulse rounded-md bg-surface2/50" />
      <div className="flex-1" />
      <div className="h-[26px] w-[26px] animate-pulse rounded-lg bg-surface2/50" />
      <div className="h-[26px] w-[60px] animate-pulse rounded-lg bg-surface2/50" />
    </div>
  );
}

function ContextPanelSkeleton({ width }: { width: number }) {
  return (
    <div
      className="hidden shrink-0 flex-col gap-2 border-l border-line/50 px-3 py-3 lg:flex"
      style={{ width, minWidth: "min(270px, 100vw)" }}
    >
      <div className="h-5 w-24 animate-pulse rounded-md bg-surface2/60" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded-md bg-surface2/40" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

/** /notes 페이지 전체(탐색기·툴바·에디터·컨텍스트 패널)를 한 번에 로딩 상태로 보여준다.
    초기 서버 데이터 로드가 끝나기 전에 Welcome 보드 등 일부 영역만 따로 깜빡이며 바뀌지
    않도록, 실제 레이아웃 구조(탐색기 폭/툴바 높이/컨텍스트 패널 폭)를 그대로 흉내내며
    화면 전체를 대체한다. 추후 더 정교한 모양으로 바꿀 때는 이 함수와 위 *Skeleton
    컴포넌트들만 교체하면 된다 — 호출 쪽(아래 isInitialWorkspaceLoading 분기)은 그대로 둔다. */
function WorkspaceLoadingShell({
  explorerOpen,
  contextOpen,
  contextPanelSize,
}: {
  explorerOpen: boolean;
  contextOpen: boolean;
  contextPanelSize: number;
}) {
  return (
    <div className="flex h-full overflow-hidden">
      {explorerOpen ? <ExplorerSkeleton /> : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ToolbarSkeleton />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-lg border border-line/50 bg-surface/80 px-3 py-2 text-[12px] font-medium text-txt2">
              <LoaderCircle size={14} className="animate-spin" />
              <span>불러오는 중…</span>
            </div>
          </div>
          {contextOpen ? <ContextPanelSkeleton width={contextPanelSize} /> : null}
        </div>
      </div>
    </div>
  );
}

interface NotesWorkspaceProps {
  initialTab: InitialTab;
  /** 지정 시 localStorage에 세션(분할/탭/노트/폴더)을 영속화한다. 데모(split-demo)는 비워서 매번 초기화. */
  persistKey?: string;
  /** 대표 활성 노트가 바뀔 때 호출 — 페이지에서 URL을 갱신하는 데 사용 */
  onActiveNoteChange?: (noteId: string | null) => void;
}

/* 패널 트리 + 탭 상태를 함께 초기화 (동일한 paneId로 묶기 위해 한번에 생성). initialTab이 "start"면
   탭을 만들지 않는다(탭 배열이 빈 상태) — 워크스페이스가 이를 보고 Welcome 보드를 보여준다. */
function createInitialPaneState(initialTab: InitialTab) {
  const rootId = uid();
  const leafNoteId = initialTab.kind === "note" ? initialTab.noteId : "";
  const tabs: Tab[] = initialTab.kind === "note" ? [{ id: uid(), kind: "note", noteId: initialTab.noteId }] : [];
  return {
    root: { type: "leaf", id: rootId, noteId: leafNoteId } as PaneNode,
    activeId: rootId,
    paneTabs: {
      [rootId]: { tabs, activeTabId: tabs[0]?.id ?? "" },
    } as Record<string, PaneTabsState>,
  };
}

/* 트리에 실제로 존재하는 leaf paneId만 모은다 — paneTabs 객체에는 과거 버그/레이스로 생긴 고아
   항목(트리에서는 이미 사라졌지만 키만 남은 패널)이 섞여 있을 수 있어, "탭이 0개인지" 판정은
   항상 이 함수로 얻은 실제 leaf 기준으로만 해야 한다(고아 항목이 있다는 이유로 Welcome 판정이
   깨지면 안 됨). */
function collectLeafIds(node: PaneNode, acc: string[] = []): string[] {
  if (node.type === "leaf") {
    acc.push(node.id);
    return acc;
  }
  node.children.forEach((child) => collectLeafIds(child, acc));
  return acc;
}

function normalizeEmptyWorkspaceSession(session: NotesWorkspaceSession): NotesWorkspaceSession {
  const hasAnyTabs = collectLeafIds(session.root).some(
    (leafId) => (session.paneTabs[leafId]?.tabs.length ?? 0) > 0
  );
  if (hasAnyTabs) {
    return session;
  }

  const fresh = createInitialPaneState({ kind: "start" });
  return {
    root: fresh.root,
    activeId: fresh.activeId,
    paneTabs: fresh.paneTabs,
    notes: session.notes,
    folders: session.folders,
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

/* localStorage 워크스페이스 세션 key를 actor(guest/user)별로 분리해서 계산한다 — 게스트의 탭/
   split/active note가 로그인 직후 다른 사용자의 화면에 잠깐 보이거나, 반대로 로그아웃 후 직전
   user의 탭이 게스트 화면에 남는 걸 막기 위함(기존 brainx:notes-refresh + resetWorkspace는
   "현재 메모리 상태를 정리"할 뿐, 페이지를 새로 열거나 다른 라우트(/login 등)를 거쳐 돌아오는
   경우처럼 컴포넌트가 새로 마운트되는 경로는 못 막는다 — localStorage key 자체가 actor별로
   갈라져 있어야 그 경로도 안전하다).

   guestId는 Gateway가 httpOnly 쿠키(brainx_guest_id)로만 들고 있어 프론트 JS가 값을 읽을 수
   없다 — 그래서 "이 브라우저의 현재 게스트"를 가리키는 고정 슬롯 하나(:guest, id 없이)만
   쓴다. 어차피 브라우저 하나에는 그 쿠키도 한 번에 하나뿐이라 별도 id가 없어도 충돌하지
   않는다. userId는 로그인 세션에 평문으로 있으므로 그대로 키에 쓴다.

   "게스트 → 유저"는 매 로그인/회원가입마다(최초 가입뿐 아니라 기존 회원 로그인도 동일) 그
   순간의 게스트 작업을 user 세션으로 넘겨준다("이어받기") — 그래서 게스트 키에 실제 탭이
   있으면 그 내용을 통째로 user 키에 덮어쓰고, 게스트 키는 지운다(다음부터는 user 키만 읽음).
   게스트가 비어 있었으면(둘러보기만 한 경우) 굳이 비어있는 값으로 그 user의 기존 세션을
   덮어쓰지 않는다.

   예전의 공유 단일 key(`persistKeyBase` 그대로, suffix 없음)는 guest/user 어느 쪽 데이터인지
   알 수 없어 안전하게 폐기한다(섞어 쓰는 것보다 버리는 쪽이 안전) — 호출마다(멱등) 지운다. */
function resolveActorPersistKey(persistKeyBase: string): string {
  if (typeof window === "undefined") return persistKeyBase;
  try {
    window.localStorage.removeItem(persistKeyBase);
  } catch {
    // localStorage 접근 불가 — 무시
  }

  const guestKey = `${persistKeyBase}:guest`;
  const session = readAuthSession();
  if (!session?.accessToken || !session.userId) {
    return guestKey;
  }

  const userKey = `${persistKeyBase}:user:${session.userId}`;
  // 방금 claimGuestDraftsAfterAuth가 끝났다면(로그인/회원가입 직후 첫 마운트) draft id → 승계된
  // 실제 noteId 매핑이 여기 있다 — 게스트 세션을 그대로 넘기면 pane tree/tabs가 더 이상 존재하지
  // 않는 draft id를 가리키게 되므로, user 키에 쓰기 전에 먼저 갈아끼운다. 한 번 소비하면 지워지므로
  // 이 함수가 같은 로그인에 대해 여러 번 호출돼도(이벤트 핸들러 쪽 재호출 등) 두 번 적용되지 않는다.
  const claimMapping = consumePendingNoteClaim();
  try {
    const guestRaw = window.localStorage.getItem(guestKey);
    if (guestRaw) {
      let guestSession = JSON.parse(guestRaw) as NotesWorkspaceSession;
      const guestHasTabs = collectLeafIds(guestSession.root).some(
        (leafId) => (guestSession.paneTabs[leafId]?.tabs.length ?? 0) > 0
      );
      if (guestHasTabs) {
        for (const { from, to } of claimMapping) {
          guestSession = {
            ...guestSession,
            root: replaceNoteIdInNode(guestSession.root, from, to),
            paneTabs: replaceNoteIdInTabs(guestSession.paneTabs, from, to),
          };
        }
        window.localStorage.setItem(userKey, JSON.stringify(guestSession));
      }
      window.localStorage.removeItem(guestKey);
    }
  } catch {
    // 손상된 게스트 세션 등은 무시하고 user 키로 그대로 진행
  }
  return userKey;
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

function isLeafInTree(node: PaneNode, leafId: string): boolean {
  if (node.type === "leaf") {
    return node.id === leafId;
  }
  return node.children.some((child) => isLeafInTree(child, leafId));
}

function resolveVisiblePaneId(root: PaneNode, activeId: string): string {
  if (root.type === "leaf") {
    return root.id;
  }
  if (isLeafInTree(root, activeId)) {
    return activeId;
  }
  return findFirstLeafId(root) ?? activeId;
}

export default function NotesWorkspace({ initialTab, persistKey, onActiveNoteChange }: NotesWorkspaceProps) {
  // 최초 1회만 생성되는 초기값 (pane root와 paneTabs가 같은 paneId를 공유해야 함)
  const initRef = useRef<ReturnType<typeof createInitialPaneState> | null>(null);
  if (!initRef.current) initRef.current = createInitialPaneState(initialTab);
  const init = initRef.current;

  const { pushToast } = useBrainX();

  // 툴바 "···" 메뉴
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
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
  const [notes, setNotes] = useState<MockNote[]>(() => {
    if (USE_MOCK_NOTES) return [...MOCK_NOTES];
    if (!persistKey) return [];
    const key = resolveActorPersistKey(persistKey);
    return readSession(key)?.notes ?? [];
  });
  const [folders, setFolders] = useState<MockFolder[]>(() => {
    if (USE_MOCK_NOTES) return [...MOCK_FOLDERS];
    if (!persistKey) return [];
    const key = resolveActorPersistKey(persistKey);
    return readSession(key)?.folders ?? [];
  });
  // 탭(노트 인스턴스)별 읽기/편집 모드 — tabId 기준. 패널이 아니라 탭 단위라서 같은 패널 안에서
  // 탭마다 다른 모드를 가질 수 있고, 같은 노트를 여러 패널에 열어도 각 탭이 독립적으로 유지된다.
  // 기록이 없는 tabId는 항상 "edit"로 취급한다(새 노트/새로 연 노트는 기본 편집 모드).
  const [tabMode, setTabMode] = useState<Record<string, EditMode>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState<PendingAiRequest | null>(null);
  const [quickSwitcher, setQuickSwitcher] = useState<QuickSwitcherTarget | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<SaveStatus>("idle");
  const [manualSaveStatus, setManualSaveStatus] = useState<SaveStatus>("idle");
  // 자동 draft 저장과 수동 저장(Ctrl+S/클릭) 상태를 저장 버튼 하나에서 통합 표시하기 위한 파생값
  const combinedSaveStatus: SaveStatus =
    manualSaveStatus === "saving" || draftSaveStatus === "saving"
      ? "saving"
      : manualSaveStatus === "error" || draftSaveStatus === "error"
        ? "error"
        : manualSaveStatus === "saved" || draftSaveStatus === "saved"
          ? "saved"
          : "idle";
  const [saveSignal, setSaveSignal] = useState(0);
  const [scrollToHeadingSignal, setScrollToHeadingSignal] = useState<{ nonce: number; index: number } | null>(null);
  const handleHeadingSelect = useCallback((index: number) => {
    setScrollToHeadingSignal((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, index }));
  }, []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isInitialWorkspaceLoading, setIsInitialWorkspaceLoading] = useState(!USE_MOCK_NOTES);
  const aiNonceRef = useRef(0);
  const editorHandlesRef = useRef<Record<string, NoteEditorHandle>>({});
  const [editorHandleRevision, setEditorHandleRevision] = useState(0);
  const hydratedRef = useRef(false);
  const initialServerLoadDoneRef = useRef(USE_MOCK_NOTES);
  const prevActiveNoteIdRef = useRef<string | null>(null);
  const prevInitialKeyRef = useRef<string>(initialTab.kind === "note" ? initialTab.noteId : "start");
  const manualSaveStatusTimerRef = useRef<number | null>(null);
  const draftSaveStatusTimerRef = useRef<number | null>(null);
  const draftAutosaveTimerRef = useRef<number | null>(null);
  const draftDirtyNoteIdsRef = useRef<Set<string>>(new Set());
  // persistKey(prop)는 "brainx_notes_workspace_v1" 같은 고정 베이스고, 실제로 읽고 쓰는 키는
  // 여기서 actor(guest/user)별로 한 번 더 갈라진다 — resolveActorPersistKey 참고. 마운트
  // 시점에 1회 계산(이 시점에 이미 guest->user 1회 승계도 처리됨), 이후 로그인/로그아웃 등으로
  // actor가 바뀌면 handleExternalRefresh(resetWorkspace)가 다시 계산해 갈아끼운다.
  const [actorPersistKey, setActorPersistKey] = useState<string | undefined>(() =>
    persistKey ? resolveActorPersistKey(persistKey) : undefined
  );
  const effectivePersistKey = actorPersistKey;
  // Ctrl+S 발생 시점의 최신 세션 스냅샷 — 디바운스/렌더 타이밍과 무관하게 항상 최신값을 읽기 위한 ref
  const latestSessionRef = useRef<NotesWorkspaceSession>({
    root: init.root,
    activeId: init.activeId,
    paneTabs: init.paneTabs,
    notes: USE_MOCK_NOTES ? [...MOCK_NOTES] : [],
    folders: USE_MOCK_NOTES ? [...MOCK_FOLDERS] : [],
  });

  /* 게스트 여부 — 인증 세션이 없으면 게스트 */
  const isGuest = useMemo(() => {
    const session = readAuthSession();
    return !session?.accessToken;
  }, []);

  /* 같은 depth에서 동일 이름의 노트 중복 여부 확인 (노트↔노트만, 폴더와는 허용) */
  const checkNoteDuplicate = useCallback((title: string, folderId: string | null | undefined): boolean => {
    const normalizedFolderId = folderId ?? null;
    return notes.some(
      (n) => (n.folderId ?? null) === normalizedFolderId && n.title.trim() === title.trim()
    );
  }, [notes]);

  /* 같은 depth에서 동일 이름의 폴더 중복 여부 확인 (폴더↔폴더만, 형제 폴더 기준) */
  const checkFolderDuplicate = useCallback((name: string, parentFolderId: string | null, excludeId?: string): boolean => {
    return folders.some(
      (f) => f.id !== excludeId && (f.parentFolderId ?? null) === (parentFolderId ?? null) && f.name.trim() === name.trim()
    );
  }, [folders]);

  const panelCount = countLeaves(state.root);
  const hasSplitPanels = panelCount > 1;
  const primaryPaneId = useMemo(() => resolveVisiblePaneId(state.root, state.activeId), [state.root, state.activeId]);
  const canSplitPane = useCallback(
    (paneId: string) => hasSplitPanels || (paneTabs[paneId]?.tabs.length ?? 0) > 1,
    [hasSplitPanels, paneTabs]
  );
  /* 워크스페이스 전체 기준으로 열린 노트가 0개인지 — 실제 트리에 있는 leaf만 기준으로 판정한다.
     paneTabs 객체 자체를 기준으로 하면(예전 구현) 트리에서는 이미 제거됐지만 paneTabs에는 키만
     남은 고아 항목 때문에 "탭이 있다"고 잘못 판정해 Welcome 보드 대신 빈 패널이 보이는 문제가
     있었다 — Welcome 보드는 탭이 아니라 이 empty state를 직접 그린다(탭 배열에 들어가지 않음). */
  const isWorkspaceEmpty = useMemo(
    () => collectLeafIds(state.root).every((leafId) => (paneTabs[leafId]?.tabs.length ?? 0) === 0),
    [state.root, paneTabs]
  );

  /* 활성 패널의 활성 탭 → 현재 노트 (우측 컨텍스트 패널 기준). start 탭이면 null. */
  const activeTabsState = paneTabs[state.activeId];
  const activeTab = activeTabsState?.tabs.find((t) => t.id === activeTabsState.activeTabId) ?? null;
  const activeNoteId = activeTab?.kind === "note" ? activeTab.noteId : null;
  const activeNote = activeNoteId ? notes.find((n) => n.id === activeNoteId) ?? null : null;
  const activeEditorKey = activeTabsState?.activeTabId ? `${state.activeId}:${activeTabsState.activeTabId}` : "";
  const activeEditorHandle = useMemo(
    () => (activeEditorKey ? editorHandlesRef.current[activeEditorKey] ?? null : null),
    [activeEditorKey, editorHandleRevision]
  );
  const activeEditorMode = activeTabsState?.activeTabId ? tabMode[activeTabsState.activeTabId] ?? "edit" : "edit";

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
    setState((prev) => ({
      ...prev,
      activeId: paneId,
      root: setNoteOnLeaf(prev.root, paneId, noteId),
    }));
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
    setState((prev) => ({
      ...prev,
      activeId: paneId,
      root: setNoteOnLeaf(prev.root, paneId, noteId),
    }));
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
    openNoteInPane(primaryPaneId, noteId);
  }, [primaryPaneId, openNoteInPane]);

  /* 노트 탐색기 위로 OS 파일을 드래그&드롭하면 /import 화면과 동일한
     uploadAndImportFile() 경로로 가져오기를 수행한다(현재 선택된 폴더로 들어감). */
  const handleDropFiles = useCallback((files: FileList) => {
    if (USE_MOCK_NOTES) {
      pushToast("목 데이터 모드에서는 드래그&드롭 가져오기를 지원하지 않습니다.", "err");
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
    setState((prev) => ({
      ...prev,
      activeId: paneId,
      root: prev.root.type === "leaf" && prev.root.id === paneId ? { ...prev.root, noteId: "" } : prev.root,
    }));
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

  /* 노트 제목 변경(에디터 상단 제목 입력) → notes 상태 갱신 (사이드바/탭/헤더/컨텍스트 즉시 반영).
     같은 위치에 동일 제목이 이미 있으면 커밋하지 않는다 — 사이드바 rename(handleRenameNoteFromExplorer)과
     동일한 중복 검사를 공유한다. 거부되면 notes 상태가 바뀌지 않으므로 EditorPanel은 note.title을
     그대로 다시 보여줘 자동으로 이전 제목으로 되돌아간다. */
  const handleTitleChange = useCallback((noteId: string, newTitle: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (newTitle !== note.title && checkNoteDuplicate(newTitle, note.folderId)) {
      pushToast("이미 같은 이름의 노트가 있습니다.", "err");
      return;
    }
    draftDirtyNoteIdsRef.current.add(noteId);
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, title: newTitle, updatedAt: Date.now() } : n))
    );
  }, [notes, checkNoteDuplicate, pushToast]);

  /* 노트 본문 변경(에디터 onUpdate 디바운스) → notes 상태 갱신, 탭 전환 후에도 내용 유지 */
  const handleContentChange = useCallback((noteId: string, newContentHtml: string) => {
    let didChange = false;
    setNotes((prev) => {
      const existing = prev.find((note) => note.id === noteId);
      if (!existing || existing.content === newContentHtml) return prev;

      didChange = true;
      return prev.map((n) => (n.id === noteId ? { ...n, content: newContentHtml, updatedAt: Date.now() } : n));
    });
    if (didChange) {
      draftDirtyNoteIdsRef.current.add(noteId);
    }
  }, []);

  /* 노트 전체 타이포그래피(기본 글꼴 크기 배율/레벨별 개별 크기/문서 기본 글꼴) 변경 — 선택
     텍스트 전용 BubbleToolbar 설정과 별개로 노트 단위로 저장한다. undefined면 커스터마이징
     해제(기본값으로 되돌리기) */
  const handleTypographyChange = useCallback((noteId: string, next: MockNote["typography"]) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, typography: next, updatedAt: Date.now() } : n))
    );
  }, []);

  /* D&D drop → 분할이 허용된 상태에서만 새 패널에 탭 1개로 초기화한다.
     단일 탭/단일 패널 상태에서는 EditorPanel 쪽에서 replace로 흘려보내고 여기로 오지 않는다. */
  const handleDrop = useCallback((paneId: string, zone: DropZone, noteId: string) => {
    if (!canSplitPane(paneId)) return;
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
  }, [canSplitPane]);

  /* 탭을 드래그해서 다른 패널의 "본문"(zone)에 떨어뜨려 분할을 만들 때의 이동 버전 — handleDrop과
     달리 새 분할을 만든 뒤 원본 패널에서 그 탭을 제거한다(복제 방지). 분할이 금지된
     단일 탭/단일 패널 상태에서는 호출되지 않는다. 원본이 마지막 탭이었으면
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
    if (!canSplitPane(targetPaneId)) return;
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
  }, [paneTabs, closePaneOrClearTabs, canSplitPane]);

  /* 탭 활성화 (같은 패널 내 탭 전환) */
  const handleTabActivate = useCallback((paneId: string, tabId: string) => {
    const nextTab = paneTabs[paneId]?.tabs.find((tab) => tab.id === tabId);
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      return { ...prev, [paneId]: { ...current, activeTabId: tabId } };
    });
    setState((prev) => ({
      ...prev,
      activeId: paneId,
      root: nextTab?.kind === "note" ? setNoteOnLeaf(prev.root, paneId, nextTab.noteId) : prev.root,
    }));
  }, [paneTabs]);

  /* 탭 닫기 — 활성 탭을 닫으면 인접 탭으로 이동. 마지막 탭이면 closePaneOrClearTabs 정책을 따른다
     (화면분할이면 패널 제거, 단일 패널이면 빈 시작 화면으로 복귀) — 더 이상 닫기를 막지 않는다. */
  const handleTabClose = useCallback((paneId: string, tabId: string) => {
    const current = paneTabs[paneId];
    if (!current) return;
    if (current.tabs.length <= 1) {
      closePaneOrClearTabs(paneId);
      return;
    }
    let nextActiveTabNoteId: string | null = null;
    setPaneTabs((prev) => {
      const cur = prev[paneId];
      if (!cur) return prev;
      const idx = cur.tabs.findIndex((t) => t.id === tabId);
      const newTabs = cur.tabs.filter((t) => t.id !== tabId);
      let newActiveTabId = cur.activeTabId;
      if (cur.activeTabId === tabId) {
        newActiveTabId = (newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0]).id;
      }
      const nextActiveTab = newTabs.find((tab) => tab.id === newActiveTabId);
      nextActiveTabNoteId = nextActiveTab?.kind === "note" ? nextActiveTab.noteId : null;
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newActiveTabId } };
    });
    if (nextActiveTabNoteId) {
      setState((prev) => ({
        ...prev,
        activeId: paneId,
        root: setNoteOnLeaf(prev.root, paneId, nextActiveTabNoteId as string),
      }));
    }
  }, [paneTabs, closePaneOrClearTabs]);

  /* 새 노트 생성 (선택된 폴더 또는 지정된 폴더 안에 생성), 지정한 패널의 새 탭으로 연다.
     title을 주면(위키링크에서 생성하는 경우) 그 제목으로 바로 생성한다. */
  const createNote = useCallback((folderId: string | undefined, paneId: string, title?: string) => {
    /* 게스트 노트 생성 제한 */
    if (isGuest && notes.length >= 10) {
      pushToast("체험 모드에서는 노트를 최대 10개까지 생성할 수 있습니다.", "err");
      return "";
    }
    /* 명시적 title이 주어진 경우(위키링크 생성 등)는 사용자의 의도된 이름이므로 기존처럼 중복이면
       막는다. 반면 기본값("새 노트")은 자동 생성값이라 막는 대신 자동 넘버링한다:
       새 노트 → 새 노트1 → 새 노트2 … 처럼 같은 위치에서 비어있는 이름을 찾아 사용한다. */
    let noteTitle: string;
    if (title) {
      if (checkNoteDuplicate(title, folderId ?? null)) {
        pushToast("같은 위치에 동일한 이름의 노트가 이미 있습니다.", "err");
        return "";
      }
      noteTitle = title;
    } else {
      noteTitle = "새 노트";
      let suffix = 1;
      while (checkNoteDuplicate(noteTitle, folderId ?? null)) {
        noteTitle = `새 노트${suffix}`;
        suffix += 1;
      }
    }
    const newNote = makeBlankNote(folderId);
    newNote.title = noteTitle;
    const localNoteId = newNote.id;
    const newTabId = uid();
    setNotes((prev) => [newNote, ...prev]);
    setPaneTabs((prev) => {
      const current = prev[paneId];
      const newTab: Tab = { id: newTabId, kind: "note", noteId: newNote.id };
      // 현재 활성 탭이 없거나(진짜 Welcome), 있어도 그 노트를 찾을 수 없는 "제목 없음" 상태
      // (삭제된 노트를 가리키는 등)라면 새 탭을 옆에 추가하지 않고 그 자리를 실제 노트로
      // 교체한다 — Welcome Board/깨진 탭에서 새 노트를 만들면 새 탭이 따로 생기고 깨진 탭은
      // 그대로 남던 문제가 있었다.
      const activeTab = current?.tabs.find((t) => t.id === current.activeTabId);
      const activeIsEmptyOrBroken =
        !activeTab || (activeTab.kind === "note" && !notes.some((n) => n.id === activeTab.noteId));
      if (current && activeIsEmptyOrBroken) {
        const replacedTabs = current.tabs.map((t) => (t.id === current.activeTabId ? newTab : t));
        const newTabs = activeTab ? replacedTabs : [...current.tabs, newTab];
        return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newTab.id } };
      }
      const newTabs = current ? [...current.tabs, newTab] : [newTab];
      return { ...prev, [paneId]: { tabs: newTabs, activeTabId: newTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
    draftDirtyNoteIdsRef.current.add(localNoteId);

    if (!USE_MOCK_NOTES) {
      void issueWorkspaceNoteDraftId()
        .then((draft) => {
          setNotes((prev) =>
            prev.map((item) =>
              item.id === localNoteId
                ? { ...item, id: draft.noteId, updatedAt: Date.now() }
                : item
            )
          );
          setState((prev) => ({ ...prev, root: replaceNoteIdInNode(prev.root, localNoteId, draft.noteId) }));
          setPaneTabs((prev) => replaceNoteIdInTabs(prev, localNoteId, draft.noteId));
          draftDirtyNoteIdsRef.current.delete(localNoteId);
          draftDirtyNoteIdsRef.current.add(draft.noteId);
          prevActiveNoteIdRef.current = draft.noteId;
          onActiveNoteChange?.(draft.noteId);
        })
        .catch((error) => {
          setLoadError(error instanceof Error ? error.message : "새 노트 임시저장 ID를 발급받지 못했습니다.");
        });
    }

    return newNote.id;
  }, [isGuest, notes, checkNoteDuplicate, pushToast, onActiveNoteChange]);

  /* 사이드바 "+ 새 노트" 버튼 → 현재 선택된 폴더 안에, 활성 패널의 새 탭으로 생성 */
  const handleNewNote = useCallback((folderId?: string) => {
    createNote(folderId, primaryPaneId);
  }, [createNote, primaryPaneId]);

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

  /* 우클릭 메뉴의 "우측 분할"/"하단 분할" — 분할이 허용된 상태에서만 해당 탭의 노트를
     새 패널에 그대로 연다 */
  const handleSplitTab = useCallback((paneId: string, tabId: string, direction: "horizontal" | "vertical") => {
    if (!canSplitPane(paneId)) return;
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
  }, [paneTabs, canSplitPane]);

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
      openNoteInPane(paneId, noteId);
    }
    setQuickSwitcher(null);
  }, [quickSwitcher, paneTabs, handleReplaceActiveTab, openNoteInPane]);

  /* 폴더 생성 — 루트(parentFolderId=null) 또는 특정 폴더 하위에 인라인으로 추가 */
  /* 폴더 생성/이름변경/이동/삭제는 모두 백엔드 /api/v1/folders에 실제로 반영해야 한다 — 노트와
     달리 폴더는 actor 제약이 없어 guest도 만들 수 있고, 그래서 게스트 폴더가 회원가입 후에도
     승계되려면(claim 시 workspaceService.reassignGuestFolders) 처음부터 Postgres에 있어야
     한다. 실패하면 토스트만 띄우고 로컬 상태는 그대로 둔다(화면에서만 사라지는 일 방지). */
  const handleCreateFolder = useCallback((parentFolderId: string | null, name: string) => {
    /* 게스트 폴더 생성 제한 */
    if (isGuest && folders.length >= 10) {
      pushToast("체험 모드에서는 폴더를 최대 10개까지 생성할 수 있습니다.", "err");
      return;
    }
    /* 같은 depth 동일 이름 폴더 중복 방지 */
    if (checkFolderDuplicate(name, parentFolderId)) {
      pushToast("같은 위치에 동일한 이름의 폴더가 이미 있습니다.", "err");
      return;
    }
    if (USE_MOCK_NOTES) {
      setFolders((prev) => [...prev, { id: `folder-${uid()}`, name, parentFolderId }]);
      return;
    }
    void createWorkspaceFolder(name, parentFolderId)
      .then((created) => {
        setFolders((prev) => [...prev, workspaceFolderToMock(created)]);
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "폴더를 만들지 못했습니다.", "err");
      });
  }, [isGuest, folders, checkFolderDuplicate, pushToast]);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder && checkFolderDuplicate(newName, folder.parentFolderId, folderId)) {
      pushToast("같은 위치에 동일한 이름의 폴더가 이미 있습니다.", "err");
      return;
    }
    if (USE_MOCK_NOTES) {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f)));
      return;
    }
    void patchWorkspaceFolder(folderId, { name: newName })
      .then((updated) => {
        // 같은 depth에 이미 같은 이름이 있으면 서버가 "이름 2"처럼 자동으로 바꿔서 응답한다 —
        // 입력값(newName)이 아니라 실제로 저장된 이름(updated.name)을 화면에 반영해야 한다.
        setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: updated.name } : f)));
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "폴더 이름을 바꾸지 못했습니다.", "err");
      });
  }, [folders, checkFolderDuplicate, pushToast]);

  const handleChangeFolderColor = useCallback((folderId: string, color: string) => {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, color } : f)));
  }, []);

  const handleToggleFolderFavorite = useCallback((folderId: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, favorite: !f.favorite } : f))
    );
  }, []);

  /* 노트 삭제(들) — 같은 노트가 여러 패널에 중복으로 열려 있을 수 있으므로(의도된 기능) 모든
     패널을 훑어 해당 노트를 가리키는 탭을 전부 제거한다. 탭 제거로 0개가 된 패널은: 분할의
     일부면 closeNode로 트리에서 제거(분할 취소), 유일하게 남은 leaf면 tabs:[]로 비워 Welcome
     보드가 보이게 한다(closePaneOrClearTabs와 동일한 정책). 폴더 cascade 삭제처럼 여러 노트를
     한 번에 지울 때 이 함수를 노트마다 따로 호출하면 매 호출이 같은(stale) paneTabs/state
     클로저를 봐서 두 번째 호출부터 첫 번째 호출의 변경을 못 보는 문제가 있어, 항상 noteId
     집합 전체를 한 번에 받아 한 번의 일관된 계산으로 처리한다. */
  const applyLocalNotesDeletion = useCallback((noteIds: Set<string>) => {
    if (noteIds.size === 0) return;
    setNotes((prev) => prev.filter((n) => !noteIds.has(n.id)));

    const affectedPaneIds = Object.keys(paneTabs).filter((paneId) =>
      paneTabs[paneId].tabs.some((t) => noteIds.has(t.noteId))
    );
    if (affectedPaneIds.length === 0) return;

    const removingTabIds = affectedPaneIds.flatMap((paneId) =>
      paneTabs[paneId].tabs.filter((t) => noteIds.has(t.noteId)).map((t) => t.id)
    );

    let nextRoot = state.root;
    const removedPaneIds = new Set<string>();
    for (const paneId of affectedPaneIds) {
      const remainingTabs = paneTabs[paneId].tabs.filter((t) => !noteIds.has(t.noteId));
      if (remainingTabs.length > 0) continue;
      if (countLeaves(nextRoot) > 1) {
        const removed = closeNode(nextRoot, paneId);
        if (removed) {
          nextRoot = removed;
          removedPaneIds.add(paneId);
        }
      } else {
        // 유일하게 남은 leaf라 닫을 수 없는 경우 — 삭제된 노트를 계속 가리키지 않도록 비워둔다
        // (Welcome 보드 전환은 paneTabs 기준이라 여기서 비우지 않아도 화면엔 문제없지만, 다음
        // 새로고침까지 root에 죽은 noteId가 남아있는 상태를 막는다).
        nextRoot = setNoteOnLeaf(nextRoot, paneId, "");
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
        const newTabs = current.tabs.filter((t) => !noteIds.has(t.noteId));
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

  const applyLocalNoteDeletion = useCallback((noteId: string) => {
    applyLocalNotesDeletion(new Set([noteId]));
  }, [applyLocalNotesDeletion]);

  /* 노트 삭제 — 백엔드 DELETE /api/v1/notes/{noteId}?mode=trash를 먼저 호출하고, 성공해야만
     탭/패널/notes를 정리한다. 서버에 한 번도 닿지 않은 순수 로컬 노트(아직 draft id도 발급받지
     못한 "note-"로 시작하는 임시 id)는 호출할 게 없으니 바로 정리한다. 실패하면 토스트만
     띄우고 화면은 그대로 둔다(실패해도 화면에서만 사라지는 일 방지). */
  const handleDeleteNote = useCallback((noteId: string) => {
    if (USE_MOCK_NOTES || !noteId.startsWith("note_")) {
      applyLocalNoteDeletion(noteId);
      return;
    }
    void deleteWorkspaceNote(noteId, "trash")
      .then(() => applyLocalNoteDeletion(noteId))
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "노트를 삭제하지 못했습니다.", "err");
      });
  }, [applyLocalNoteDeletion, pushToast]);

  /* 폴더 삭제 — 하위 폴더/노트를 부모로 승격하지 않고 전부 cascade로 삭제한다(orphan folder/
     note를 만들지 않기 위한 정책). 백엔드가 Postgres 쪽(폴더 자체 + 이미 flush된 노트)을
     cascade 삭제해 권위 있는 처리를 하고, 그 응답으로 받은 폴더 id 집합을 기준으로 프론트가
     로컬 notes/folders/탭에서도(아직 draft 단계라 백엔드가 모르는 노트까지 포함) 정리한다. */
  const handleDeleteFolder = useCallback((folderId: string) => {
    const target = folders.find((f) => f.id === folderId);
    if (!target) return;

    const descendantFolderIds = new Set<string>([folderId]);
    let frontier = [folderId];
    while (frontier.length > 0) {
      const next = folders
        .filter((f) => f.parentFolderId && frontier.includes(f.parentFolderId) && !descendantFolderIds.has(f.id))
        .map((f) => f.id);
      next.forEach((id) => descendantFolderIds.add(id));
      frontier = next;
    }
    const noteIdsToDelete = new Set(
      notes.filter((n) => n.folderId && descendantFolderIds.has(n.folderId)).map((n) => n.id)
    );

    const applyLocally = () => {
      applyLocalNotesDeletion(noteIdsToDelete);
      setFolders((prev) => prev.filter((f) => !descendantFolderIds.has(f.id)));
      setSelectedFolderId((prev) => (prev && descendantFolderIds.has(prev) ? null : prev));
    };

    if (USE_MOCK_NOTES) {
      applyLocally();
      return;
    }
    void deleteWorkspaceFolder(folderId, "trash")
      .then(() => applyLocally())
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "폴더를 삭제하지 못했습니다.", "err");
      });
  }, [folders, notes, applyLocalNotesDeletion, pushToast]);

  /* 다중 삭제 — 탐색기에서 Ctrl/Shift 다중 선택 후 Delete 키 또는 컨텍스트 메뉴로 호출된다.
     폴더 삭제는 cascade(하위 포함)이므로 먼저 폴더를 처리해 중복 처리를 방지한다.
     노트는 handleDeleteNote(단건)와 동일한 정책으로 처리한다 — 서버에 이미 존재하는 노트("note_"
     접두사)는 DELETE API가 성공한 것만 로컬에서 지운다(이전에는 API 호출을 fire-and-forget으로
     쏘고 실패 여부와 무관하게 로컬에서 먼저 지워버려서, 삭제가 실패해도 화면에서는 사라졌다가
     새로고침하면 되살아나는 것처럼 보이는 불일치가 있었다). 아직 서버에 없는 로컬 전용 초안
     노트는 바로 지운다. */
  const handleDeleteMultiple = useCallback((noteIds: string[], folderIds: string[]) => {
    /* 폴더를 먼저 삭제(cascade로 하위 노트/폴더가 함께 사라지므로 순서가 중요) */
    for (const fid of folderIds) {
      handleDeleteFolder(fid);
    }
    if (noteIds.length === 0) return;

    if (USE_MOCK_NOTES) {
      applyLocalNotesDeletion(new Set(noteIds));
      return;
    }

    const localOnlyIds = noteIds.filter((id) => !id.startsWith("note_"));
    const serverIds = noteIds.filter((id) => id.startsWith("note_"));
    if (localOnlyIds.length > 0) applyLocalNotesDeletion(new Set(localOnlyIds));
    if (serverIds.length === 0) return;

    void Promise.allSettled(serverIds.map((nid) => deleteWorkspaceNote(nid, "trash"))).then((results) => {
      const succeeded = new Set<string>();
      let failedCount = 0;
      results.forEach((result, index) => {
        if (result.status === "fulfilled") succeeded.add(serverIds[index]);
        else failedCount += 1;
      });
      if (succeeded.size > 0) applyLocalNotesDeletion(succeeded);
      if (failedCount > 0) {
        pushToast(`${failedCount}개의 노트를 삭제하지 못했습니다.`, "err");
      }
    });
  }, [handleDeleteFolder, applyLocalNotesDeletion, pushToast]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  /* 탐색기에서 노트 이름 변경 (중복 체크 포함) */
  const handleRenameNoteFromExplorer = useCallback((noteId: string, newTitle: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (checkNoteDuplicate(newTitle, note.folderId)) {
      pushToast("같은 위치에 동일한 이름의 노트가 이미 있습니다.", "err");
      return;
    }
    handleTitleChange(noteId, newTitle);
  }, [notes, checkNoteDuplicate, handleTitleChange, pushToast]);

  /* 노트 탐색기 드래그앤드랍 — 노트를 폴더/루트로 이동, 또는 같은 레벨에서 순서 변경. */
  const handleMoveNoteToFolder = useCallback((noteId: string, targetFolderId: string | null) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const titleConflict = notes.some(
        (n) => n.id !== noteId && (n.folderId ?? null) === (targetFolderId ?? null) && n.title.trim() === note.title.trim()
      );
      if (titleConflict) {
        pushToast("이동할 위치에 동일한 이름의 노트가 이미 있습니다.", "err");
        return;
      }
    }
    setNotes((prev) => moveNoteIntoFolder(prev, noteId, targetFolderId));
  }, [notes, pushToast]);

  const handleReorderNote = useCallback((noteId: string, referenceNoteId: string, position: "before" | "after") => {
    setNotes((prev) => reorderNoteRelativeTo(prev, noteId, referenceNoteId, position));
  }, []);

  /* 폴더 이동 — 자기 자신/하위 폴더로의 이동은 folderDnd의 canFolderMoveUnder가 차단(null 반환 시 무시) */
  const handleMoveFolderToParent = useCallback((folderId: string, targetParentId: string | null) => {
    /* 이동 목적지에 같은 이름의 형제 폴더가 있으면 막는다 */
    if (checkFolderDuplicate(folders.find((f) => f.id === folderId)?.name ?? "", targetParentId, folderId)) {
      pushToast("이동할 위치에 동일한 이름의 폴더가 이미 있습니다.", "err");
      return;
    }
    const next = moveFolderUnder(folders, folderId, targetParentId);
    if (!next) return;
    if (USE_MOCK_NOTES) {
      setFolders(next);
      return;
    }
    // 백엔드 FolderPatchRequest는 parentFolderId가 null이면 "변경 없음"으로 보고, 빈 문자열이면
    // "루트로 이동(null)"으로 정규화한다 — 그래서 루트로 옮길 때는 null이 아니라 ""를 보내야 한다.
    void patchWorkspaceFolder(folderId, { parentFolderId: targetParentId ?? "" })
      .then((updated) => {
        // 옮긴 위치(목적지)에 같은 이름이 이미 있으면 서버가 이름을 자동으로 바꿔서 응답한다 —
        // 그 경우를 반영해 표시 이름도 함께 갈아끼운다.
        setFolders(next.map((f) => (f.id === folderId ? { ...f, name: updated.name } : f)));
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "폴더를 이동하지 못했습니다.", "err");
      });
  }, [folders, checkFolderDuplicate, pushToast]);

  const handleReorderFolder = useCallback((folderId: string, referenceFolderId: string, position: "before" | "after") => {
    setFolders((prev) => reorderFolderRelativeTo(prev, folderId, referenceFolderId, position) ?? prev);
  }, []);

  /* 버블 툴바의 AI 버튼(요약/다시쓰기) → 우측 인라인 AI 패널에 mock 요청 전달 */
  const handleAiAction = useCallback((type: AiActionType, text: string) => {
    aiNonceRef.current += 1;
    setAiRequest({ type, text, nonce: aiNonceRef.current });
  }, []);

  const handleEditorHandleChange = useCallback((paneId: string, tabId: string, handle: NoteEditorHandle | null) => {
    const key = `${paneId}:${tabId}`;
    if (handle) {
      editorHandlesRef.current[key] = handle;
    } else {
      delete editorHandlesRef.current[key];
    }
    setEditorHandleRevision((current) => current + 1);
  }, []);

  const handleReset = useCallback(() => {
    const fresh = createInitialPaneState(initialTab);
    setState({ root: fresh.root, activeId: fresh.activeId });
    setPaneTabs(fresh.paneTabs);
    setTabMode({});
    editorHandlesRef.current = {};
    setEditorHandleRevision((current) => current + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 세션 영속화 (persistKey 지정 시) ──────────────────────────── */

  // initialTab(프로퍼티)을 ref로도 들고 있는다 — applyHydration은 actor 전환(이벤트, 아래
  // handleExternalRefresh) 시점에도 안전하게 호출돼야 해서 deps 없는 안정된 identity로 만들고
  // 싶은데, 그러려면 클로저로 직접 initialTab을 참조할 수 없다(그 시점엔 stale할 수 있음).
  const initialTabRef = useRef(initialTab);
  useEffect(() => {
    initialTabRef.current = initialTab;
  }, [initialTab]);

  /* 주어진 key의 저장된 세션을 읽어 state/paneTabs(+ mock 모드면 notes/folders)에 반영한다.
     mount 시(첫 effect)와 actor 전환(handleExternalRefresh, 아래)에서 공유한다 — 예전에는 mount
     effect 안에만 이 로직이 있어서, actor가 바뀔 때 "resolveActorPersistKey가 돌려준 key가
     이전과 같은 값"인 경우(예: 토큰 만료로 여러 401이 거의 동시에 도착해 로그아웃 처리가
     중복 호출되는 경우) effectivePersistKey가 실제로는 안 바뀌어 이 effect가 재실행되지
     않고, 그 사이 notes/folders만 비워져 직전 actor의 탭이 빈 패널로 덩그러니 남는 문제가
     있었다 — 이제는 actor 전환 쪽에서 key가 바뀌었는지와 무관하게 항상 명시적으로 호출한다.
     attachInitialTab=false면 "지금 URL이 가리키는 노트를 탭에 끼워넣기"를 건너뛴다(actor
     전환 시점의 URL은 새 actor와 무관할 수 있어서 mount 때만 적용). */
  const applyHydration = useCallback((key: string | undefined, attachInitialTab: boolean) => {
    if (!key) {
      hydratedRef.current = true;
      return;
    }
    const resetToBlank = () => {
      const fresh = createInitialPaneState({ kind: "start" });
      setState({ root: fresh.root, activeId: fresh.activeId });
      setPaneTabs(fresh.paneTabs);
      setTabMode({});
    };
    const saved = readSession(key);
    if (!saved) {
      resetToBlank();
      hydratedRef.current = true;
      return;
    }
    // 이전 버전(Welcome이 kind:"start" 탭으로 저장되던 시절)의 세션이 남아있을 수 있으므로,
    // "note"가 아닌 탭은 걸러내고 activeTabId가 사라진 탭을 가리키면 첫 탭으로 재조정한다.
    let nextPaneTabs: Record<string, PaneTabsState> = Object.fromEntries(
      Object.entries(saved.paneTabs).map(([paneId, tabsState]) => {
        const tabs = tabsState.tabs.filter((t) => t.kind === "note" && t.noteId.trim().length > 0);
        const activeTabId = tabs.some((t) => t.id === tabsState.activeTabId)
          ? tabsState.activeTabId
          : tabs[0]?.id ?? "";
        return [paneId, { tabs, activeTabId }];
      })
    );
    // saved.paneTabs에는 트리에 없는 고아 항목이 섞여 있을 수 있으므로(과거 레이스로 생긴 것
    // 포함), "정말 비어있는 세션인지"는 saved.root에 실제로 있는 leaf만 기준으로 판정한다 —
    // isWorkspaceEmpty와 동일한 기준(collectLeafIds)을 써야 두 판정이 어긋나지 않는다.
    const hasAnyRealTabs = collectLeafIds(saved.root).some(
      (leafId) => (nextPaneTabs[leafId]?.tabs.length ?? 0) > 0
    );
    if (!hasAnyRealTabs) {
      resetToBlank();
      setNotes(saved.notes);
      setFolders(saved.folders);
      hydratedRef.current = true;
      return;
    }
    // 복원된 세션 위에서, initialTab이 note를 가리키면 그 노트를 활성 패널의 탭으로 연다.
    // 후보는 항상 saved.root에 실제로 있는 leaf 중에서만 고른다 — 고아 paneTabs 키를 활성
    // 패널로 고르면 트리에 없는 paneId가 activeId가 되어버린다.
    const realLeafIds = collectLeafIds(saved.root);
    const nextActiveId =
      realLeafIds.includes(saved.activeId) && (nextPaneTabs[saved.activeId]?.tabs.length ?? 0) > 0
        ? saved.activeId
        : realLeafIds.find((leafId) => (nextPaneTabs[leafId]?.tabs.length ?? 0) > 0) ?? saved.activeId;
    const initial = initialTabRef.current;
    if (attachInitialTab && initial.kind === "note") {
      const noteId = initial.noteId;
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
    hydratedRef.current = true;
  }, []);

  // mount 시 1회: 저장된 세션 복원 → initialTab이 note면 그 노트를 활성 패널 탭으로 연다
  useEffect(() => {
    applyHydration(effectivePersistKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersistKey]);

  useEffect(() => {
    if (USE_MOCK_NOTES) return;
    let active = true;

    function loadFromServer(openNoteId?: string, isInitialLoad = false) {
      setLoadError(null);
      const targetNoteId = openNoteId ?? (initialTab.kind === "note" ? initialTab.noteId : null);
      return Promise.all([
        listNotes(),
        listFolders(),
        listWorkspaceNoteDrafts().catch(() => ({ drafts: [] })),
        targetNoteId ? getWorkspaceNoteDraft(targetNoteId).catch(() => null) : Promise.resolve(null),
      ])
        .then(([noteData, folderData, draftData, targetDraft]) => {
          if (!active) return;
          const draftsById = new Map(draftData.drafts.map((draft) => [draft.noteId, draft]));
          if (targetDraft) draftsById.set(targetDraft.noteId, targetDraft);
          const persistedNotes = noteData.notes.map((note) => {
            const persisted = workspaceNoteToMock(note);
            const draft = draftsById.get(persisted.id);
            if (!draft) return persisted;
            const draftSavedAt = Date.parse(draft.savedAt) || persisted.updatedAt;
            return {
              ...persisted,
              title: draft.title?.trim() || persisted.title,
              content: draft.markdown ?? "",
              // draft가 더 최신 폴더 배치를 들고 있을 수 있다(아직 flush 전 — 예: 방금 폴더를
              // 옮긴 직후). draft.folderId는 항상 "현재 배치 전체"를 담아 보내므로(부분 patch
              // 아님) undefined가 아니라 null도 유효한 값(루트)으로 그대로 반영한다.
              folderId: draft.folderId ?? undefined,
              updatedAt: draftSavedAt,
              version: draft.baseVersion ?? persisted.version,
              persisted: true,
            };
          });
          const persistedNoteIds = new Set(persistedNotes.map((note) => note.id));
          const draftOnlyNotes = Array.from(draftsById.values())
            .filter((draft) => !persistedNoteIds.has(draft.noteId))
            .map(workspaceDraftToMock);
          const nextNotes = [...draftOnlyNotes, ...persistedNotes];
          const nextFolders = folderData.folders.map(workspaceFolderToMock);
          setNotes(nextNotes);
          setFolders(nextFolders);

          // state.activeId는 이 effect가 마운트 시점에 캡처한 값이라(아래 deps: []), 그 사이
          // 세션 복원(useEffect, 위쪽) 등으로 실제 트리의 paneId가 바뀌어도 갱신되지 않는다. 이
          // 네트워크 응답은 마운트 이후 한참 뒤(라운드트립)에 도착하므로, 항상 최신 상태를 들고
          // 있는 latestSessionRef에서 "지금 실제로 보이는 패널"을 다시 계산해야 한다 — 그렇지
          // 않으면 트리에 없는 옛 paneId로 노트를 열어, 화면엔 반영되지 않고 고아 paneTabs
          // 항목만 남는 버그가 생긴다(라우팅으로 연 노트가 안 보이고 Welcome처럼 보이던 원인).
          const livePaneId = resolveVisiblePaneId(latestSessionRef.current.root, latestSessionRef.current.activeId);
          if (targetNoteId && nextNotes.some((note) => note.id === targetNoteId)) {
            handleReplaceActiveTab(livePaneId, targetNoteId);
            return;
          }
          if (!openNoteId && nextNotes.length > 0 && (initialTab.kind === "note" || isInitialLoad)) {
            const firstNoteId =
              initialTab.kind === "note" && nextNotes.some((note) => note.id === initialTab.noteId)
                ? initialTab.noteId
                : nextNotes[0].id;
            handleReplaceActiveTab(livePaneId, firstNoteId);
          }
        })
        .catch((error) => {
          if (active) setLoadError(error instanceof Error ? error.message : "Workspace-Service에서 노트를 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!active) return;
          hydratedRef.current = true;
          if (isInitialLoad && !initialServerLoadDoneRef.current) {
            initialServerLoadDoneRef.current = true;
            setIsInitialWorkspaceLoading(false);
          }
        });
    }

    loadFromServer(undefined, true);

    // Import 등 NotesWorkspace 외부(별도 마운트된 화면)에서 노트가 새로 생성된 경우, 이 컴포넌트는
    // 라우트 전환에도 리마운트되지 않아(레이아웃에서 한 번만 마운트) mount 시점 fetch만으로는 새
    // 노트를 못 본다. 외부에서 이 이벤트를 쏘면 목록을 다시 불러오고, 지정한 노트를 바로 연다.
    function handleExternalRefresh(event: Event) {
      const detail = (event as CustomEvent<{ noteId?: string; resetWorkspace?: boolean }>).detail;
      // 로그인/회원가입/로그아웃으로 actor(guest/user)가 바뀐 경우(auth-api.ts의
      // claimGuestDraftsAfterAuth/clearAuthSession)에는 resetWorkspace:true로 호출된다.
      // localStorage 키 자체를 다시 계산해 갈아끼운다(resolveActorPersistKey가 guest->user
      // 1회 승계도 처리). applyHydration을 "키가 실제로 바뀌었는지"와 무관하게 항상 직접
      // 호출한다 — effectivePersistKey state의 변화 감지(아래 effect)에만 의존하면, 토큰
      // 만료로 401이 거의 동시에 여러 번 와서 resetWorkspace가 중복 호출되는 경우처럼
      // resolveActorPersistKey가 "이전과 같은 키"를 돌려줄 때 effect가 재실행되지 않아 직전
      // actor의 탭이 빈 패널로 남는 문제가 있었다. attachInitialTab=false로 호출해 "지금 URL의
      // 노트를 탭에 끼워넣기"는 건너뛴다(actor가 막 바뀐 시점의 URL은 새 actor와 무관할 수
      // 있음). 승계됐다면 방금 게스트가 쓰던 탭 그대로, 로그아웃이라 게스트 키에 예전 세션이
      // 있었다면 그걸로, 둘 다 없으면 빈 Welcome으로 그려진다 — 그래서 여기서 직접 탭/패널을
      // 비우지 않는다(승계된 탭을 비워버리면 "이어받기"가 깨짐). notes/folders도 먼저 비우지
      // 않고, 방금 applyHydration이 복원한 스냅샷을 유지한 채 loadFromServer가 새 actor 기준
      // 최신값으로 조용히 교체한다 — 그렇지 않으면 탐색기가 "빈 상태 → Redis/DB 결과"로
      // 한 번 더 깜빡인다.
      if (detail?.resetWorkspace && persistKey) {
        const nextKey = resolveActorPersistKey(persistKey);
        setActorPersistKey(nextKey);
        applyHydration(nextKey, false);
        setTabMode({});
        draftDirtyNoteIdsRef.current.clear();
      }
      void loadFromServer(detail?.noteId);
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
    if (initialTab.kind !== "note") return;
    if (notes.some((note) => note.id === initialTab.noteId)) {
      handleNoteClick(initialTab.noteId);
      return;
    }
    if (USE_MOCK_NOTES) return;
    void getWorkspaceNoteDraft(initialTab.noteId)
      .then((draft) => {
        if (!draft) return;
        setNotes((prev) => prev.some((note) => note.id === draft.noteId) ? prev : [workspaceDraftToMock(draft), ...prev]);
        // 같은 이유로 state.activeId 대신 항상 최신값을 들고 있는 latestSessionRef 기준으로 푼다.
        const livePaneId = resolveVisiblePaneId(latestSessionRef.current.root, latestSessionRef.current.activeId);
        handleReplaceActiveTab(livePaneId, draft.noteId);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "임시저장 노트를 불러오지 못했습니다.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab.kind === "note" ? initialTab.noteId : "start"]);

  /* noteId가 있지만 실제로 notes 배열에 없는(삭제됐거나 애초에 존재한 적 없는 — 예: 유효하지
     않은 URL로 직접 진입, 초기화 직후 세션 복원 등) "제목 없음" 탭을 정리한다. 그런 탭은
     EditorPanel이 Welcome Board와 동일한 화면을 보여주게 만드는데(EditorPanel.tsx의 `!note`
     분기), 애초에 탭 목록에 남아있으면 안 된다 — Welcome Board는 탭이 아니라 진짜 empty
     state여야 한다. 초기 로드/세션 복원이 끝나기 전에는 건드리지 않는다(그 사이 아직 notes가
     덜 채워졌을 뿐인 정상 탭까지 지워버리는 걸 막기 위해). */
  useEffect(() => {
    if (isInitialWorkspaceLoading || !hydratedRef.current) return;
    const noteIds = new Set(notes.map((n) => n.id));
    setPaneTabs((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const [paneId, tabState] of Object.entries(prev)) {
        const validTabs = tabState.tabs.filter((t) => t.kind !== "note" || noteIds.has(t.noteId));
        if (validTabs.length === tabState.tabs.length) {
          next[paneId] = tabState;
          continue;
        }
        changed = true;
        const activeStillValid = validTabs.some((t) => t.id === tabState.activeTabId);
        next[paneId] = {
          tabs: validTabs,
          activeTabId: activeStillValid ? tabState.activeTabId : (validTabs[validTabs.length - 1]?.id ?? ""),
        };
      }
      return changed ? next : prev;
    });
  }, [notes, isInitialWorkspaceLoading]);

  // 변경 사항을 디바운스 저장 (백그라운드 자동저장 — 실패해도 조용히 무시, 수동 저장이 실패 상태를 노출).
  // 다만 "모든 탭을 닫아 Welcome으로 돌아간" 전환만은 디바운스 없이 즉시 기록한다 — 350ms 안에
  // 새로고침하면 그 직전(탭이 남아있던) 세션이 그대로 복원되어 닫은 탭/분할이 되살아나는
  // 버그가 있었다(타이핑 중 자동저장과 달리 구조 변경은 지연시킬 이유가 없다).
  useEffect(() => {
    if (!effectivePersistKey || !hydratedRef.current) return;
    const delay = isWorkspaceEmpty ? 0 : 350;
    const handle = window.setTimeout(() => {
      try {
        writeSession(
          effectivePersistKey,
          normalizeEmptyWorkspaceSession({ root: state.root, activeId: state.activeId, paneTabs, notes, folders })
        );
      } catch {
        // 백그라운드 자동저장 실패는 무시
      }
    }, delay);
    return () => window.clearTimeout(handle);
  }, [effectivePersistKey, state, paneTabs, notes, folders]);

  // Ctrl+S가 항상 최신 세션을 즉시 기록할 수 있도록 매 변경마다 ref에 스냅샷 보관
  useEffect(() => {
    latestSessionRef.current = normalizeEmptyWorkspaceSession({
      root: state.root,
      activeId: state.activeId,
      paneTabs,
      notes,
      folders,
    });
  }, [state, paneTabs, notes, folders]);

  useEffect(() => {
    if (USE_MOCK_NOTES || !hydratedRef.current || !activeNote) return;
    if (!activeNote.id.startsWith("note_")) return;
    if (!draftDirtyNoteIdsRef.current.has(activeNote.id)) return;

    if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    if (draftSaveStatusTimerRef.current) window.clearTimeout(draftSaveStatusTimerRef.current);
    setDraftSaveStatus("saving");
    draftAutosaveTimerRef.current = window.setTimeout(() => {
      const noteSnapshot = latestSessionRef.current.notes.find((item) => item.id === activeNote.id);
      if (!noteSnapshot) return;
      void saveWorkspaceNoteDraft(noteSnapshot)
        .then(() => {
          draftDirtyNoteIdsRef.current.delete(noteSnapshot.id);
          setDraftSaveStatus("saved");
          draftSaveStatusTimerRef.current = window.setTimeout(() => setDraftSaveStatus("idle"), 2000);
        })
        .catch(() => {
          setDraftSaveStatus("error");
        });
    }, 1500);

    return () => {
      if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
    };
  }, [activeNote?.id, activeNote?.title, activeNote?.content]);

  // 대표 활성 노트가 바뀌면 URL 갱신 콜백 호출
  useEffect(() => {
    if (prevActiveNoteIdRef.current === activeNoteId) return;
    prevActiveNoteIdRef.current = activeNoteId;
    onActiveNoteChange?.(activeNoteId ?? null);
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

    if (!note.persisted && note.id.startsWith("note_")) {
      await saveWorkspaceNoteDraft(note);
      draftDirtyNoteIdsRef.current.delete(note.id);
      return;
    }

    if (!note.persisted && !note.id.startsWith("note_")) {
      const created = await createWorkspaceNote(note);
      let nextVersion = created.version;
      // 같은 폴더에 같은 제목이 이미 있으면 서버가 "제목 2"처럼 자동으로 바꿔서 응답한다 —
      // 로컬에 타이핑된 제목이 아니라 실제로 저장된 제목을 반영해야 한다.
      let finalTitle = created.title;
      const savedId = created.noteId;
      if (note.typography) {
        const metadata = await updateWorkspaceNoteMetadata({ ...note, id: savedId, version: nextVersion, persisted: true });
        nextVersion = metadata.version;
        finalTitle = metadata.title;
      }
      setNotes((prev) =>
        prev.map((item) =>
          item.id === note.id
            ? { ...item, id: savedId, title: finalTitle, version: nextVersion, persisted: true, updatedAt: Date.now() }
            : item
        )
      );
      setState((prev) => ({ ...prev, root: replaceNoteIdInNode(prev.root, note.id, savedId) }));
      setPaneTabs((prev) => replaceNoteIdInTabs(prev, note.id, savedId));
      prevActiveNoteIdRef.current = savedId;
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: savedId } }));
      onActiveNoteChange?.(savedId);
      return;
    }

    const content = await saveNoteContentWithVersionRetry(note);
    const metadata = await updateWorkspaceNoteMetadata({ ...note, version: content.version, persisted: true });
    setNotes((prev) =>
      prev.map((item) =>
        item.id === note.id
          ? { ...item, title: metadata.title, version: metadata.version, persisted: true, updatedAt: Date.parse(content.savedAt) || Date.now() }
          : item
      )
    );
    window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: note.id } }));
  }, [onActiveNoteChange]);

  const handleManualSave = useCallback(() => {
    setManualSaveStatus("saving");
    setSaveSignal((n) => n + 1);
    if (manualSaveStatusTimerRef.current) window.clearTimeout(manualSaveStatusTimerRef.current);
    manualSaveStatusTimerRef.current = window.setTimeout(async () => {
      if (!USE_MOCK_NOTES) {
        try {
          await saveActiveNoteToBackend();
          setManualSaveStatus("saved");
          manualSaveStatusTimerRef.current = window.setTimeout(() => setManualSaveStatus("idle"), 2000);
        } catch {
          setManualSaveStatus("error");
        }
        return;
      }
      if (!effectivePersistKey) {
        setManualSaveStatus("saved");
        manualSaveStatusTimerRef.current = window.setTimeout(() => setManualSaveStatus("idle"), 2000);
        return;
      }
      try {
        writeSession(effectivePersistKey, latestSessionRef.current);
        setManualSaveStatus("saved");
        manualSaveStatusTimerRef.current = window.setTimeout(() => setManualSaveStatus("idle"), 2000);
      } catch {
        setManualSaveStatus("error");
      }
    }, 250);
  }, [effectivePersistKey, saveActiveNoteToBackend]);

  useEffect(() => {
    return () => {
      if (manualSaveStatusTimerRef.current) window.clearTimeout(manualSaveStatusTimerRef.current);
      if (draftSaveStatusTimerRef.current) window.clearTimeout(draftSaveStatusTimerRef.current);
      if (draftAutosaveTimerRef.current) window.clearTimeout(draftAutosaveTimerRef.current);
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
      exportNote(activeNote.id, format).catch(() => {});
      const { downloadPdfFile, downloadTextFile, htmlToMarkdown, htmlToPlainText, safeFileName } =
        await import("@/lib/notes/exportNoteContent");
      const fileName = safeFileName(activeNote.title);
      // 에디터 HTML 우선, 없으면 content가 마크다운인지 판별 후 직접 변환한다.
      // 노션 가져오기 등 마크다운으로 저장된 노트는 "<"로 시작하지 않는다.
      const rawContent = activeNote.content;
      const html =
        activeEditorHandle?.getHTML() ||
        (rawContent.trim().startsWith("<") ? rawContent : markdownToHtml(rawContent));
      if (format === "TXT") {
        await downloadTextFile(`${fileName}.txt`, htmlToPlainText(html), "text/plain;charset=utf-8");
      } else if (format === "MD") {
        await downloadTextFile(`${fileName}.md`, htmlToMarkdown(html), "text/markdown;charset=utf-8");
      } else {
        await downloadPdfFile(activeNote.title, html, `${fileName}.pdf`);
      }
      pushToast(`${format} 내보내기를 시작했어요`, "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "내보내기에 실패했습니다.", "err");
    } finally {
      setExportingFormat(null);
      setMoreMenuOpen(false);
      setExportSubmenuOpen(false);
    }
  }, [activeNote, activeEditorHandle, pushToast]);

  /* ── 키보드 단축키 (Ctrl/Cmd+N 새 파일, Ctrl/Cmd+O 파일로 이동, Ctrl/Cmd+S 저장) ── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        requestNewNote(primaryPaneId);
      } else if (key === "o") {
        e.preventDefault();
        const tabsState = paneTabs[primaryPaneId];
        const tabId = tabsState?.activeTabId;
        if (tabId) requestQuickSwitcher(primaryPaneId, tabId);
      } else if (key === "s") {
        e.preventDefault();
        handleManualSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [primaryPaneId, paneTabs, requestNewNote, requestQuickSwitcher, handleManualSave]);

  // 위키링크([[노트]]) 기능에 필요한 컨텍스트 — 노트 목록 조회/존재 확인/이동/생성을 에디터
  // 깊숙이(NoteEditor → CodeBlockView 같은 중첩 단계 없이도) 어디서든 쓸 수 있게 한다.
  const wikiLinkNoteRefs = useMemo(
    () => notes.map((n) => ({ id: n.id, title: n.title, folderId: n.folderId ?? null })),
    [notes]
  );
  const wikiLinkFolderRefs = useMemo(
    () => folders.map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId })),
    [folders]
  );
  const wikiLinkValue = useMemo<WikiLinkContextValue>(
    () => ({
      notes: wikiLinkNoteRefs,
      folders: wikiLinkFolderRefs,
      resolveTitle: (title) => resolveWikiLinkTitle(wikiLinkNoteRefs, title),
      onNavigate: (title) => {
        const found = resolveWikiLinkTitle(wikiLinkNoteRefs, title);
        if (found) handleNoteClick(found.id);
      },
      onCreate: (title) => {
        createNote(undefined, primaryPaneId, title);
      },
    }),
    [wikiLinkNoteRefs, wikiLinkFolderRefs, handleNoteClick, createNote, primaryPaneId]
  );

  // 노트/탭/패널 데이터 초기화가 끝나기 전에는 워크스페이스 전체를 로딩 상태로 대체한다 —
  // Welcome 보드나 탐색기처럼 일부 영역만 먼저 깜빡이며 빈 상태로 그려지는 것을 막는다.
  if (isInitialWorkspaceLoading) {
    return <WorkspaceLoadingShell explorerOpen={explorerOpen} contextOpen={contextOpen} contextPanelSize={contextPanelSize} />;
  }

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
      scrollToHeadingSignal={scrollToHeadingSignal}
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
      onEditorHandleChange={handleEditorHandleChange}
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
      hasSplitPanels={hasSplitPanels}
      contextOpen={contextOpen}
      onContextToggle={() => setContextOpen((prev) => !prev)}
    />
  );

  const welcomeQuickSwitcherOpen = quickSwitcher?.paneId === primaryPaneId;
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
        handleReplaceActiveTab(primaryPaneId, dragPayload.noteId);
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
          onCreateNote={() => requestNewNote(primaryPaneId)}
          onGoToFile={() => requestQuickSwitcher(primaryPaneId, "")}
        />
      )}
    </div>
  ) : (
    paneTree
  );

  return (
    <>
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
            onRenameNote={handleRenameNoteFromExplorer}
            onDragStart={handleSidebarDragStart}
            onDragEnd={handleDragEnd}
            onMoveNoteToFolder={handleMoveNoteToFolder}
            onReorderNote={handleReorderNote}
            onMoveFolderToParent={handleMoveFolderToParent}
            onReorderFolder={handleReorderFolder}
            onDropFiles={handleDropFiles}
            isGuest={isGuest}
            onDeleteMultiple={handleDeleteMultiple}
          />
        )}

        {/* ── 중앙: 에디터 영역 ───────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* 툴바 */}
          <div className="flex shrink-0 items-center gap-3 border-b border-line/50 px-2 py-2">
            <span className="text-[12px] font-medium text-txt2">
              {panelCount}개 패널
            </span>
            <span className="text-[11px] text-txt3/60">
              · 노트 클릭 = 현재 탭 교체 · 본문에 드롭 = 교체 · 탭바에 드롭 = 탭 추가
            </span>
            <div className="flex-1" />
            {loadError ? <span className="text-[11px] font-medium text-red-400">{loadError}</span> : null}
            <SaveIconButton
              status={combinedSaveStatus}
              disabled={combinedSaveStatus === "saving" || !activeNote}
              onClick={handleManualSave}
            />
            <button
              onClick={handleReset}
              title="레이아웃 초기화"
              className={cx(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
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
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setMoreMenuOpen(false); setShareModalOpen(true); }}
                        disabled={!activeNote}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt disabled:cursor-not-allowed disabled:text-txt3/50"
                      >
                        <Link2 size={13} />
                        <span>공유하기</span>
                      </button>
                      <div className="my-1 border-t border-line/30" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setExportSubmenuOpen(true)}
                        disabled={!activeNote}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt disabled:cursor-not-allowed disabled:text-txt3/50"
                      >
                        <Upload size={13} />
                        <span>내보내기</span>
                      </button>
                    </>
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
            <button
              type="button"
              onClick={() => setContextOpen((prev) => !prev)}
              title={contextOpen ? "컨텍스트 패널 닫기" : "컨텍스트 패널 열기"}
              className={cx(
                "inline-flex h-[22px] w-[22px] items-center justify-center rounded transition-all",
                contextOpen
                  ? "border-line/60 bg-surface2/60 text-primary"
                  : "border-transparent text-txt3/60 hover:bg-surface2/70 hover:text-txt"
              )}
            >
              {contextOpen ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
            </button>
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
                    activeEditor={activeEditorHandle}
                    activeEditorMode={activeEditorMode}
                    onHeadingSelect={handleHeadingSelect}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 overflow-hidden">{mainContent}</div>
                
              </>
            )}
          </div>
        </div>
      </div>
    </SplitThemeContext.Provider>
    </WikiLinkContext.Provider>
    {shareModalOpen && activeNote && (
      <ShareLinkModal note={activeNote} onClose={() => setShareModalOpen(false)} />
    )}
    </>
  );
}
