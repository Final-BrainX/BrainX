"use client";

import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { WikiLinkContext, resolveWikiLinkTitle, type WikiLinkContextValue } from "./WikiLinkContext";
import { renameWikiLinkReferencesInContent, contentHasWikiLinkTo, ensureWikiLinkPresent, wikiLinkTargetSetChanged } from "@/lib/wiki-links";
import {
  addPendingCreatedNote,
  clearPendingCreatedNotes,
  removePendingCreatedNoteByNoteId,
  readPendingCreatedNotes,
  updatePendingCreatedNoteId,
  updatePendingCreatedNoteTitle,
  findPendingCreatedNoteByNoteId,
} from "@/lib/notes/pending-created-note-cache";
import { AlertCircle, Check, ChevronLeft, Download, Link2, LoaderCircle, MoreHorizontal, PanelRightClose, PanelRight, RotateCcw, Save, Upload } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockFolder, MockNote, PaneNode, PaneTabsState, Tab, NotesWorkspaceSession, DragPayload } from "@/lib/notes/noteTypes";
import type { EditMode, AiActionPayload, NoteEditorHandle } from "./NoteEditor";
import { MOCK_NOTES, MOCK_FOLDERS } from "@/lib/notes/mockNotes";
import {
  USE_MOCK_NOTES,
  WorkspaceApiError,
  createWorkspaceNoteFromPayload,
  createWorkspaceFolder,
  createWorkspaceNote,
  createWorkspaceNoteLink,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  getNote,
  getWorkspaceFavorites,
  getWorkspaceNoteDraft,
  issueWorkspaceNoteDraftId,
  listFolders,
  listNotes,
  listWorkspaceNoteDrafts,
  patchWorkspaceFolder,
  putFavorite,
  saveWorkspaceNoteDraft,
  shouldUseDesktopVault,
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
import { hasNoteTitleDuplicate, mergeInFlightNotes, nextDefaultNoteTitle, upsertResolvedCreatedNote } from "@/lib/notes/noteCreationState";
import { recordNoteViewed } from "@/lib/notes/note-view-history";
import { AUTO_THEME } from "./theme";
import { SplitThemeContext } from "./SplitThemeContext";
import PaneTreeRenderer, { type QuickSwitcherTarget } from "./PaneTreeRenderer";
import EmptyNoteStartPage from "./EmptyNoteStartPage";
import QuickSwitcher from "./QuickSwitcher";
import NotesExplorer from "./NotesExplorer";
import RightSidebar, {
  type AiOutlineNoteCreateRequest,
  type AiOutlineNoteCreateResult,
  type PendingAiRequest,
} from "./RightSidebar";
import { moveNoteIntoFolder, reorderNoteRelativeTo, moveFolderUnder, reorderFolderRelativeTo } from "@/lib/notes/folderDnd";
import { exportNote, uploadAndImportFile, type ExportFormat } from "@/lib/ingestion-api";
import { ShareLinkModal } from "./ShareLinkModal";
import { markdownToHtml } from "./NoteEditor";
import { useBrainX } from "@/components/brainx-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { consumePendingNoteClaim, readAuthSession } from "@/lib/auth-api";
import { isElectronDesktop, type BrainxDesktopVaultSyncPolicy } from "@/lib/desktop-bridge";
import { getDesktopVaultSyncPolicy, requestDesktopVaultManualSync } from "@/lib/desktop-vault";

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

function normalizeAiOutlineNoteTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) return normalized;
  return normalized.slice(0, 80).trimEnd();
}

function nextAvailableExplicitNoteTitle(notes: MockNote[], title: string, folderId: string | null | undefined) {
  const base = title.trim() || "개요 노트";
  let candidate = base;
  let suffix = 2;
  while (hasNoteTitleDuplicate(notes, candidate, folderId ?? null)) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  return candidate;
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

/** 위키링크 새 노트 생성 흐름의 저장/링크 생성은 대부분 `.catch(() => {})`로 조용히 실패를
    삼킨다(사용자 흐름을 막지 않기 위한 best-effort) — 그러나 그러면 개발 중에는 왜 링크나
    그래프 edge가 안 보이는지 원인을 알 수 없다. 프로덕션 사용자 경험은 그대로 두고, 개발
    환경 콘솔에서만 실패를 확인할 수 있게 한다. */
function warnWikiLinkFailure(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[wiki-link] ${context}`, error);
}

/** 노트가 "지금 활성 탭인 동안만" 저장되는 effect(draft autosave/수동 저장)에 기대지 않고,
    주어진 노트 스냅샷을 지금 이 순간 best-effort로 서버에 반영한다. 위키링크로 새 노트를
    만들면서 탭을 즉시 전환하는 경우처럼, activeNote가 바뀌는 순간 그 note를 대상으로 하던
    디바운스 타이머(draftAutosaveTimerRef)가 cleanup으로 취소돼버려 방금 넣은 내용이 서버에
    한 번도 저장되지 못하는 경로를 우회하기 위한 함수다. 반환값 true는 "저장을 시도했다"는
    뜻이고, false는 note가 아직 로컬(local) id라 서버에 저장할 방법이 없어 스킵했다는 뜻이다
    (draft id 발급 전 — 호출부가 id 확정 시점에 다시 시도하도록 책임진다). */
async function persistNoteBestEffort(note: MockNote): Promise<boolean> {
  if (note.persisted) {
    await saveNoteContentWithVersionRetry(note);
    return true;
  }
  if (note.id.startsWith("note_")) {
    await saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(note));
    return true;
  }
  return false;
}

function resolveDraftWorkspaceNote(note: MockNote): MockNote {
  if (note.documentGroupId !== undefined) return note;
  const pendingCreated = findPendingCreatedNoteByNoteId(note.id);
  if (!pendingCreated) return note;
  return {
    ...note,
    documentGroupId: pendingCreated.documentGroupId ?? null,
  };
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
  message = "불러오는 중…",
}: {
  explorerOpen: boolean;
  contextOpen: boolean;
  contextPanelSize: number;
  message?: string;
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
              <span>{message}</span>
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
    // 트리 자체가 새로 만들어지므로(새 pane id) 이전 pane에 매인 줌 값은 더 이상 의미가 없다.
    paneFontScale: {},
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
  const { currentWorkspaceId, workspaces } = useWorkspace();
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
  /* pane(분할 패널)별 Ctrl+Wheel 에디터 뷰 줌(%, 기본 100) — 노트 문서의 typography(서식 패널)와
     완전히 분리된 UI 전용 상태다. key는 PaneLeaf.id라 split 생성/삭제/이동에도 각 패널 고유의
     값으로 자연히 유지되고, 새로 생긴 pane은 그냥 이 맵에 없는 상태(= 기본 100%)로 시작한다. */
  const [paneFontScale, setPaneFontScale] = useState<Record<string, number>>({});
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
  const [isSyncRefreshLoading, setIsSyncRefreshLoading] = useState(false);
  const [usesDesktopVault, setUsesDesktopVault] = useState(false);
  const [desktopSyncPolicy, setDesktopSyncPolicy] = useState<BrainxDesktopVaultSyncPolicy | null>(null);
  const [desktopManualSyncing, setDesktopManualSyncing] = useState(false);
  const aiNonceRef = useRef(0);
  const editorHandlesRef = useRef<Record<string, NoteEditorHandle>>({});
  const [editorHandleRevision, setEditorHandleRevision] = useState(0);
  const hydratedRef = useRef(false);
  const initialServerLoadDoneRef = useRef(USE_MOCK_NOTES);
  const prevActiveNoteIdRef = useRef<string | null>(null);
  const viewedNoteSignatureRef = useRef("");
  const prevInitialKeyRef = useRef<string>(initialTab.kind === "note" ? initialTab.noteId : "start");
  const manualSaveStatusTimerRef = useRef<number | null>(null);
  const draftSaveStatusTimerRef = useRef<number | null>(null);
  const draftAutosaveTimerRef = useRef<number | null>(null);
  const draftDirtyNoteIdsRef = useRef<Set<string>>(new Set());
  const inFlightCreatedNotesRef = useRef<Map<string, MockNote>>(new Map());
  /* 위키링크로 새 노트를 만들 때, 소스 노트가 아직 draft id 발급 전(local id)이라 그 자리에서
     바로 저장하지 못한 경우 여기(local id 기준)에 표시해둔다 — createNote의 draft id 확정
     시점(.then)에서 이 목록을 확인해 그때 다시 한번 저장을 시도한다. */
  const pendingWikiLinkFlushRef = useRef<Set<string>>(new Set());
  /* 위키링크로 새 노트(target)를 만들었는데 그 시점에 소스 노트가 아직 local id라 서버
     NoteLink(그래프 edge)를 못 만든 경우, 소스의 local id를 key로 여기 등록해둔다. createNote가
     그 소스 노트 자신의 draft id를 확정 짓는 순간(다른 createNote 호출의 .then일 수도 있다) 이
     맵을 확인해 실제 sourceNoteId로 링크 생성을 재시도한다. 탭 전환/페이지 이동에도 이 ref는
     컴포넌트가 마운트된 채로 남아있는 한(같은 (app)/notes 레이아웃 안에서는 리마운트되지 않음)
     세션 동안 유지된다. */
  const pendingWikiLinkEdgeRef = useRef<Map<string, { targetNoteId: string; targetTitle: string }>>(new Map());
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

  /* 게스트 여부 — 인증 세션 변경 이벤트를 구독해 stale 값이 남지 않게 한다. */
  const [isGuest, setIsGuest] = useState(() => !readAuthSession()?.accessToken);
  useEffect(() => {
    const syncGuestState = () => {
      setIsGuest(!readAuthSession()?.accessToken);
    };
    window.addEventListener("brainx-auth-session-changed", syncGuestState);
    return () => {
      window.removeEventListener("brainx-auth-session-changed", syncGuestState);
    };
  }, []);
  const refreshDesktopSyncPolicy = useCallback(async () => {
    if (!isElectronDesktop()) {
      setDesktopSyncPolicy(null);
      return;
    }
    try {
      setDesktopSyncPolicy(await getDesktopVaultSyncPolicy());
    } catch {
      setDesktopSyncPolicy(null);
    }
  }, []);
  useEffect(() => {
    if (!usesDesktopVault) return;
    void refreshDesktopSyncPolicy();
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      void refreshDesktopSyncPolicy();
    };
    window.addEventListener("brainx-desktop-sync-updated", handleRefresh);
    return () => window.removeEventListener("brainx-desktop-sync-updated", handleRefresh);
  }, [refreshDesktopSyncPolicy, usesDesktopVault]);
  const handleManualCloudSync = useCallback(async () => {
    if (!usesDesktopVault || desktopManualSyncing) return;
    setDesktopManualSyncing(true);
    try {
      const job = await requestDesktopVaultManualSync();
      if (typeof window !== "undefined" && (job.status === "COMPLETED" || job.status === "CONFLICT" || job.status === "SKIPPED")) {
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { syncRefresh: true } }));
      }
      pushToast(job.message, job.status === "FAILED" ? "err" : job.status === "COMPLETED" ? "ok" : "info");
      await refreshDesktopSyncPolicy();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "수동 동기화를 시작하지 못했습니다.", "err");
    } finally {
      setDesktopManualSyncing(false);
    }
  }, [desktopManualSyncing, pushToast, refreshDesktopSyncPolicy, usesDesktopVault]);
  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.documentGroupId === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId]
  );
  const includeLegacyNullDocumentGroup = currentWorkspaceId === null || currentWorkspace?.isDefault === true;
  const matchesCurrentWorkspace = useCallback(
    (documentGroupId: string | null | undefined) => {
      if (currentWorkspaceId === null) return true;
      if ((documentGroupId ?? null) === currentWorkspaceId) return true;
      return includeLegacyNullDocumentGroup && (documentGroupId ?? null) === null;
    },
    [currentWorkspaceId, includeLegacyNullDocumentGroup]
  );
  const visibleNotes = useMemo(
    () => notes.filter((note) => matchesCurrentWorkspace(note.documentGroupId)),
    [notes, matchesCurrentWorkspace]
  );
  const visibleFolders = useMemo(
    () => folders.filter((folder) => matchesCurrentWorkspace(folder.documentGroupId)),
    [folders, matchesCurrentWorkspace]
  );

  /* 같은 depth에서 동일 이름의 노트 중복 여부 확인 (노트↔노트만, 폴더와는 허용). 정책(§8)상
     중복 검사는 Workspace 단위라 visibleNotes(현재 Workspace 기준)로 검사한다 — 전체 notes로
     검사하면 다른 Workspace에 같은 위치(folderId)·같은 제목의 노트가 있다는 이유만으로 지금
     Workspace에서는 실제로 충돌이 없는데도 "이미 있습니다"로 막히거나 불필요하게 번호가
     붙는다. */
  const checkNoteDuplicate = useCallback((title: string, folderId: string | null | undefined): boolean => {
    const normalizedFolderId = folderId ?? null;
    return visibleNotes.some(
      (n) => (n.folderId ?? null) === normalizedFolderId && n.title.trim() === title.trim()
    );
  }, [visibleNotes]);

  /* 같은 depth에서 동일 이름의 폴더 중복 여부 확인 (폴더↔폴더만, 형제 폴더 기준) — 위와 동일한
     이유로 visibleFolders 기준으로 검사한다. */
  const checkFolderDuplicate = useCallback((name: string, parentFolderId: string | null, excludeId?: string): boolean => {
    return visibleFolders.some(
      (f) => f.id !== excludeId && (f.parentFolderId ?? null) === (parentFolderId ?? null) && f.name.trim() === name.trim()
    );
  }, [visibleFolders]);

  const inFlightNoteIdSet = useCallback(() => {
    const ids = new Set(draftDirtyNoteIdsRef.current);
    for (const id of inFlightCreatedNotesRef.current.keys()) ids.add(id);
    for (const entry of readPendingCreatedNotes()) {
      ids.add(entry.localKey);
      ids.add(entry.noteId);
    }
    return ids;
  }, []);

  const inFlightMergeCandidates = useCallback(() => {
    return [
      ...latestSessionRef.current.notes,
      ...inFlightCreatedNotesRef.current.values(),
    ];
  }, []);

  const currentNoteTitleCandidates = useCallback(() => {
    const byId = new Map<string, MockNote>();
    for (const note of latestSessionRef.current.notes) byId.set(note.id, note);
    for (const note of notes) if (!byId.has(note.id)) byId.set(note.id, note);
    for (const note of inFlightCreatedNotesRef.current.values()) if (!byId.has(note.id)) byId.set(note.id, note);
    return Array.from(byId.values()).filter((note) => matchesCurrentWorkspace(note.documentGroupId));
  }, [notes, matchesCurrentWorkspace]);

  const rememberInFlightCreatedNote = useCallback((note: MockNote) => {
    inFlightCreatedNotesRef.current.set(note.id, note);
  }, []);

  const replaceInFlightCreatedNoteId = useCallback((oldId: string, newId: string) => {
    const note = inFlightCreatedNotesRef.current.get(oldId);
    if (!note) return;
    inFlightCreatedNotesRef.current.delete(oldId);
    inFlightCreatedNotesRef.current.set(newId, { ...note, id: newId, updatedAt: Date.now() });
  }, []);

  const updateInFlightCreatedNote = useCallback((noteId: string, patch: Partial<MockNote>) => {
    const note = inFlightCreatedNotesRef.current.get(noteId);
    if (!note) return;
    inFlightCreatedNotesRef.current.set(noteId, { ...note, ...patch });
  }, []);

  const mergeLoadedNotesWithInFlight = useCallback((loadedNotes: MockNote[]) => {
    const loadedIds = new Set(loadedNotes.map((note) => note.id));
    const resolvedLocalIds = new Set<string>();
    for (const entry of readPendingCreatedNotes()) {
      if (entry.localKey !== entry.noteId && loadedIds.has(entry.noteId)) {
        resolvedLocalIds.add(entry.localKey);
      }
    }
    for (const id of inFlightCreatedNotesRef.current.keys()) {
      if (loadedIds.has(id)) inFlightCreatedNotesRef.current.delete(id);
    }
    const inFlightIds = inFlightNoteIdSet();
    for (const id of resolvedLocalIds) inFlightIds.delete(id);
    return mergeInFlightNotes(
      loadedNotes,
      inFlightMergeCandidates().filter((note) => !resolvedLocalIds.has(note.id)),
      inFlightIds
    );
  }, [inFlightMergeCandidates, inFlightNoteIdSet]);

  const panelCount = countLeaves(state.root);
  const hasSplitPanels = panelCount > 1;
  const primaryPaneId = useMemo(() => resolveVisiblePaneId(state.root, state.activeId), [state.root, state.activeId]);
  // 열려 있는 노트가 하나(탭 1개)뿐이어도 분할은 허용된다 — handleSplitTab은 그 탭의 노트를
  // "복제"해 새 패널에 열 뿐 원래 패널의 탭은 그대로 두므로(같은 노트를 여러 패널에 여는 기존
  // 동작과 동일한 방식), 탭이 1개뿐이라고 막을 기술적 이유가 없다. 예전에 `> 1`로 막아둔 탓에
  // 노트를 하나만 연 가장 흔한 상태에서 "우측 분할"/"하단 분할" 메뉴가 계속 비활성으로 보여
  // 분할 기능 자체가 고장난 것처럼 보였다.
  const canSplitPane = useCallback(
    (paneId: string) => hasSplitPanels || (paneTabs[paneId]?.tabs.length ?? 0) >= 1,
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

  /* 활성 패널의 활성 탭 → 현재 노트 (우측 컨텍스트 패널/Inline AI 기준). start 탭이면 null.
     notes(전체) 대신 visibleNotes(현재 Workspace 기준으로 이미 걸러진 목록)에서 찾는다 —
     Workspace 전환 직후 탭 정리 effect(아래 Ticket14)가 아직 반영되기 전의 activeTab이
     다른 Workspace 노트를 계속 가리키고 있어도, 이 시점에 즉시 null로 떨어져 RightSidebar/
     Inline AI/제목 표시줄이 이전 Workspace 노트 내용을 보여주지 않는다(activeTabId가
     가리키는 탭 자체를 지우는 건 아래 Ticket14 effect의 몫 — 여기서는 "그 탭을 아직 못
     지웠어도 내용만은 절대 새지 않게" 하는 마지막 방어선). */
  const activeTabsState = paneTabs[state.activeId];
  const activeTab = activeTabsState?.tabs.find((t) => t.id === activeTabsState.activeTabId) ?? null;
  const activeNoteId = activeTab?.kind === "note" ? activeTab.noteId : null;
  const activeNote = activeNoteId ? visibleNotes.find((n) => n.id === activeNoteId) ?? null : null;
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
  const handleTitleChange = useCallback(async (noteId: string, newTitle: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (newTitle !== note.title && checkNoteDuplicate(newTitle, note.folderId)) {
      pushToast("이미 같은 이름의 노트가 있습니다.", "err");
      return;
    }
    const oldTitle = note.title;
    draftDirtyNoteIdsRef.current.add(noteId);

    // 새 노트가 "새 노트"/"새 노트1" 같은 기본 제목으로 만들어지는 순간 graph optimistic
    // 캐시(pending-created-note-cache.ts)에도 그 제목이 그대로 기록된다 — 사용자가 곧바로
    // 제목을 바꾸고 서버 저장/그래프 새로고침을 기다리지 않은 채 /graph로 이동하면, optimistic
    // 노드가 옛 제목으로 보이는 원인이었다. 제목이 실제로 바뀔 때마다 캐시도 함께 갱신해
    // notes[] state와 어긋나지 않게 한다. 위키링크로 만든 노트(A→B)든 일반 새 노트든 구분 없이
    // 적용되고, 이 노트가 다른 pending 항목의 위키링크 소스였다면 그 sourceTitle도 함께
    // 맞춰준다(현재 edge 합성 자체는 id 기준이라 동작에 영향은 없지만 캐시 내용을 일관되게
    // 유지한다).
    if (!USE_MOCK_NOTES && newTitle !== oldTitle) {
      updatePendingCreatedNoteTitle(noteId, newTitle);
    }
    updateInFlightCreatedNote(noteId, { title: newTitle, updatedAt: Date.now() });

    // 제목이 실제로 바뀐 경우에만, 그 이름을 가리키던 다른 노트의 위키링크를 새 제목으로
    // 갱신한다 — 그래야 노트1에 남은 `[[이전제목]]`이 이름 변경 뒤에도 그대로 A를
    // 가리키고(에디터 링크/그래프 모두 title 문자열 매칭으로 존재 여부를 판단하므로), 이름이
    // 바뀐 순간 "존재하지 않는 노트" 상태로 끊어져 보이는 문제가 생기지 않는다. 영향받는
    // 노트 목록을 먼저(state 갱신 전에) 계산해둬야 백그라운드 저장 대상을 알 수 있다.
    const relinked = oldTitle === newTitle
      ? []
      : notes
          .filter((n) => n.id !== noteId && n.content)
          .map((n) => ({ note: n, result: renameWikiLinkReferencesInContent(n.content, oldTitle, newTitle) }))
          .filter((entry) => entry.result.changed);

    if (relinked.length > 0) {
      for (const entry of relinked) draftDirtyNoteIdsRef.current.add(entry.note.id);
    }

    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) return { ...n, title: newTitle, updatedAt: Date.now() };
        const entry = relinked.find((e) => e.note.id === n.id);
        if (!entry) return n;
        return { ...n, content: entry.result.content, updatedAt: Date.now() };
      })
    );

    // 제목 자체는 이 노트가 activeNote로 Ctrl+S/autosave 대상이 될 때까지 서버에 반영되지 않았다
    // (content autosave는 activeNote만, metadata PATCH는 이동/타이포그래피 등 다른 액션에서만
    // 호출됨) — 그 사이 다른 화면(위키링크 relink, notes-refresh 등)이 loadFromServer()를
    // 트리거하면 Postgres에 남은 옛 제목으로 되돌아가 보이는 롤백 버그의 원인이었다.
    // handleMoveNoteToFolder와 동일한 best-effort 패턴으로 제목 변경 즉시 반영한다.
    if (!USE_MOCK_NOTES && newTitle !== oldTitle) {
      const renamedNote = { ...note, title: newTitle };
      const persistTitle = renamedNote.persisted
        ? updateWorkspaceNoteMetadata(renamedNote)
        : renamedNote.id.startsWith("note_")
          ? saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(renamedNote))
          : null;
      if (persistTitle) {
        try {
          await persistTitle;
        } catch (error) {
          pushToast(error instanceof Error ? error.message : "제목을 저장하지 못했습니다.", "err");
        }
      }
    }

    if (relinked.length > 0 && !USE_MOCK_NOTES) {
      // 위키링크가 갱신된 다른 노트들도 최소한 한 번은 백그라운드로 저장해야, 그래프/마인드맵처럼
      // 서버에서 새로 노트를 읽어오는 화면에서도 이름 변경이 반영된다(로컬 state만 바꾸면 이번
      // 세션의 에디터 화면에는 바로 보이지만, 서버에는 예전 텍스트가 그대로 남는다). 실패해도
      // 사용자가 그 노트를 열어 직접 저장하면 되는 best-effort 보강이라 조용히 무시한다.
      void Promise.allSettled(
        relinked.map(({ note: target, result }) => {
          const updated = { ...target, content: result.content };
          if (!target.persisted && target.id.startsWith("note_")) {
            return saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(updated)).then(() => {
              draftDirtyNoteIdsRef.current.delete(target.id);
            });
          }
          if (target.persisted) {
            return saveNoteContentWithVersionRetry(updated).then(() => {
              draftDirtyNoteIdsRef.current.delete(target.id);
            });
          }
          return Promise.resolve();
        })
      ).then(() => {
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId } }));
      });
    }
  }, [notes, checkNoteDuplicate, pushToast, updateInFlightCreatedNote]);

  /* 노트 본문 변경(에디터 onUpdate 디바운스) → notes 상태 갱신, 탭 전환 후에도 내용 유지 */
  const handleContentChange = useCallback((noteId: string, newContentHtml: string) => {
    let didChange = false;
    const wikiLinkSyncTarget: { note: MockNote | null } = { note: null };
    setNotes((prev) => {
      const existing = prev.find((note) => note.id === noteId);
      if (!existing || existing.content === newContentHtml) return prev;

      didChange = true;
      // 페이지 이동/탭 전환이 아니라 "위키링크 target 집합이 실제로 바뀐 순간"만 골라
      // Graph를 즉시 동기화한다 — 모든 타이핑마다 저장하면 안 되므로 이 비교가 유일한 트리거다.
      if (wikiLinkTargetSetChanged(existing.content, newContentHtml)) {
        wikiLinkSyncTarget.note = { ...existing, content: newContentHtml, updatedAt: Date.now() };
      }
      return prev.map((n) => (n.id === noteId ? { ...n, content: newContentHtml, updatedAt: Date.now() } : n));
    });
    if (didChange) {
      draftDirtyNoteIdsRef.current.add(noteId);
      updateInFlightCreatedNote(noteId, { content: newContentHtml, updatedAt: Date.now() });
    }
    if (wikiLinkSyncTarget.note && !USE_MOCK_NOTES) {
      const noteToSync = wikiLinkSyncTarget.note;
      // Ctrl+S(수동 저장)를 기다리지 않고 지금 이 순간 best-effort로 반영해, [[bb]]가
      // [[bb]로 깨지는 즉시(수동 저장 없이도) /graph가 이 변경을 반영할 수 있게 한다.
      void persistNoteBestEffort(noteToSync)
        .then((persisted) => {
          if (persisted) {
            draftDirtyNoteIdsRef.current.delete(noteToSync.id);
            // brainx:notes-refresh가 아니라 전용 brainx:graph-refresh를 쏜다 — notes-refresh는
            // 이 컴포넌트 자신의 handleExternalRefresh(loadFromServer)도 듣고 있어서, noteId를
            // 실어 보내면 "그 노트를 활성 탭으로 열라"로 해석돼 방금 위키링크로 새로 만든 노트
            // 탭으로 옮겨간 직후 활성 탭이 source 노트로 튕겨 돌아가는 롤백 버그가 있었다(noteId를
            // 빼도 이 컴포넌트가 notes-refresh 자체를 계속 듣는 한 다른 dispatch와 겹치면 같은
            // 위험이 남는다). notes[] state는 이미 위 setNotes로 최신이라 이 컴포넌트가 서버에서
            // 다시 불러올 필요도 없다 — /graph만 이 신호를 듣고 자기 데이터를 재조회한다.
            window.dispatchEvent(new CustomEvent("brainx:graph-refresh"));
          }
        })
        .catch((error) => warnWikiLinkFailure("wikilink target 변경 즉시 저장 실패", error));
    }
  }, [updateInFlightCreatedNote]);

  /* 노트 전체 타이포그래피(기본 글꼴 크기 배율/레벨별 개별 크기/문서 기본 글꼴) 변경 — 선택
     텍스트 전용 BubbleToolbar 설정과 별개로 노트 단위로 저장한다. undefined면 커스터마이징
     해제(기본값으로 되돌리기) */
  const handleTypographyChange = useCallback((noteId: string, next: MockNote["typography"]) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, typography: next, updatedAt: Date.now() } : n))
    );
  }, []);

  /* pane(분할 패널) 단위 Ctrl+Wheel 에디터 뷰 줌 — handleTypographyChange(노트 문서 자체의
     서식, notes[]에 저장)와 별개로 paneFontScale(세션 UI 상태)만 갱신한다. */
  const handlePaneFontScaleChange = useCallback((paneId: string, next: number) => {
    setPaneFontScale((prev) => (prev[paneId] === next ? prev : { ...prev, [paneId]: next }));
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
     title을 주면(위키링크에서 생성하는 경우) 그 제목으로 바로 생성한다. linkFromNoteId를 주면
     (위키링크로 생성한 경우) 로그인 사용자에 한해 백엔드 노트 id가 확정되는 즉시 그 노트에서
     새로 만든 노트로의 NoteLink를 만들어 마인드맵 edge에 반영한다(게스트는 그래프가 매 렌더마다
     draft markdown의 [[..]]을 다시 파싱해 edge를 만들므로 별도 처리가 필요 없다). */
  const createNote = useCallback((folderId: string | undefined, paneId: string, title?: string, linkFromNoteId?: string, favorite?: boolean) => {
    /* 게스트 노트 생성 제한 */
    if (isGuest && notes.length >= 10) {
      pushToast("체험 모드에서는 노트를 최대 10개까지 생성할 수 있습니다.", "err");
      return "";
    }
    /* 명시적 title이 주어진 경우(위키링크 생성 등)는 사용자의 의도된 이름이므로 기존처럼 중복이면
       막는다. 반면 기본값("새 노트")은 자동 생성값이라 막는 대신 자동 넘버링한다:
       새 노트 → 새 노트1 → 새 노트2 … 처럼 같은 위치에서 비어있는 이름을 찾아 사용한다. */
    let noteTitle: string;
    const titleCandidates = currentNoteTitleCandidates();
    if (title) {
      if (hasNoteTitleDuplicate(titleCandidates, title, folderId ?? null)) {
        pushToast("같은 위치에 동일한 이름의 노트가 이미 있습니다.", "err");
        return "";
      }
      noteTitle = title;
    } else {
      noteTitle = nextDefaultNoteTitle(titleCandidates, folderId ?? null);
    }
    const newNote = makeBlankNote(folderId);
    newNote.title = noteTitle;
    if (favorite) newNote.favorite = true;
    /* handleCreateFolder와 동일한 정책: currentWorkspaceId가 있으면(non-default Workspace)
       새 노트를 그 Workspace 소속으로 표시해 visibleNotes/QuickSwitcher 필터에서 즉시 사라지지
       않게 한다. currentWorkspaceId가 null(default Workspace 또는 Guest)이면 기존 동작 유지. */
    if (currentWorkspaceId) newNote.documentGroupId = currentWorkspaceId;
    const localNoteId = newNote.id;
    const newTabId = uid();

    // 위키링크로 만들었든(linkFromNoteId 있음) 일반 "+ 새 노트"/우클릭 새 노트든(linkFromNoteId
    // 없음) 관계없이, 아직 draft id도 없는 이 순간(local id) sessionStorage에 optimistic 기록을
    // 남긴다 — /notes에서 만든 노트가 서버 저장을 기다리지 않고도 별도로 새로 마운트되는
    // /graph에 즉시 반영되게 하기 위함이다(lib/notes/pending-created-note-cache.ts 참고).
    // linkFromNoteId가 있으면 sourceNoteId/sourceTitle도 함께 기록해 graph-screen이 optimistic
    // edge(노트1→A 연결선)까지 합성할 수 있게 한다 — 없으면(일반 새 노트) node만 optimistic
    // 처리된다.
    if (!USE_MOCK_NOTES) {
      addPendingCreatedNote({
        localKey: localNoteId,
        noteId: localNoteId,
        title: noteTitle,
        documentGroupId: newNote.documentGroupId ?? null,
        sourceNoteId: linkFromNoteId,
        sourceTitle: linkFromNoteId ? titleCandidates.find((n) => n.id === linkFromNoteId)?.title : undefined,
        createdAt: Date.now(),
      });
    }
    rememberInFlightCreatedNote(newNote);

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
        !activeTab || (activeTab.kind === "note" && !titleCandidates.some((n) => n.id === activeTab.noteId));
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

    if (!USE_MOCK_NOTES && usesDesktopVault) {
      void createWorkspaceNote(newNote)
        .then(async (created) => {
          let nextVersion = created.version;
          let finalTitle = created.title;
          const savedId = created.noteId;

          if (newNote.typography) {
            const metadata = await updateWorkspaceNoteMetadata({ ...newNote, id: savedId, version: nextVersion, persisted: true });
            nextVersion = metadata.version;
            finalTitle = metadata.title;
          }

          setNotes((prev) =>
            upsertResolvedCreatedNote(
              prev,
              localNoteId,
              {
                ...newNote,
                id: savedId,
                title: finalTitle,
                version: nextVersion,
                persisted: true,
                updatedAt: Date.parse(created.createdAt) || Date.now(),
              },
              noteTitle
            )
          );
          replaceInFlightCreatedNoteId(localNoteId, savedId);
          updateInFlightCreatedNote(savedId, {
            title: finalTitle,
            version: nextVersion,
            persisted: true,
            updatedAt: Date.parse(created.createdAt) || Date.now(),
          });
          setState((prev) => ({ ...prev, root: replaceNoteIdInNode(prev.root, localNoteId, savedId) }));
          setPaneTabs((prev) => replaceNoteIdInTabs(prev, localNoteId, savedId));
          draftDirtyNoteIdsRef.current.delete(localNoteId);
          prevActiveNoteIdRef.current = savedId;
          updatePendingCreatedNoteId(localNoteId, savedId);
          onActiveNoteChange?.(savedId);

          if (pendingWikiLinkFlushRef.current.has(localNoteId)) {
            pendingWikiLinkFlushRef.current.delete(localNoteId);
            const latestNote = latestSessionRef.current.notes.find((n) => n.id === savedId);
            if (latestNote) {
              void persistNoteBestEffort(latestNote).catch((error) =>
                warnWikiLinkFailure("desktop local note persist retry failed", error)
              );
            }
          }

          if (favorite) {
            void putFavorite("NOTE", savedId, true).catch(() => {});
          }
        })
        .catch((error) => {
          setLoadError(error instanceof Error ? error.message : "로컬 vault에 노트를 만들지 못했습니다.");
        });
    } else if (!USE_MOCK_NOTES) {
      void issueWorkspaceNoteDraftId()
        .then((draft) => {
          replaceInFlightCreatedNoteId(localNoteId, draft.noteId);
          setNotes((prev) =>
            upsertResolvedCreatedNote(
              prev,
              localNoteId,
              {
                ...newNote,
                id: draft.noteId,
                title: noteTitle,
                updatedAt: Date.now(),
              },
              noteTitle
            )
          );
          setState((prev) => ({ ...prev, root: replaceNoteIdInNode(prev.root, localNoteId, draft.noteId) }));
          setPaneTabs((prev) => replaceNoteIdInTabs(prev, localNoteId, draft.noteId));
          draftDirtyNoteIdsRef.current.delete(localNoteId);
          draftDirtyNoteIdsRef.current.add(draft.noteId);
          prevActiveNoteIdRef.current = draft.noteId;
          onActiveNoteChange?.(draft.noteId);
          // 이 노트가 위키링크 optimistic 캐시(sessionStorage)에 local id로 기록돼 있었다면
          // 실제 noteId로 갱신한다 — 위키링크와 무관한 일반 새 노트 생성에서는 아무 항목도
          // 찾지 못해 조용히 no-op이다.
          updatePendingCreatedNoteId(localNoteId, draft.noteId);

          // 이 노트(방금 draft id가 확정된 노트) 자체가, 조금 전 위키링크로 다른 노트를 만들 때
          // "아직 local id라 바로 저장하지 못한 소스 노트"였을 수 있다 — 그랬다면 pending 표시가
          // 남아있을 테니, 이제 실제 noteId가 생겼으니 최신 본문으로 한 번 더 저장을 시도한다.
          if (pendingWikiLinkFlushRef.current.has(localNoteId)) {
            pendingWikiLinkFlushRef.current.delete(localNoteId);
            const latestNote = latestSessionRef.current.notes.find((n) => n.id === draft.noteId);
            if (latestNote) {
              void persistNoteBestEffort(latestNote)
                .then((persisted) => {
                  if (persisted) draftDirtyNoteIdsRef.current.delete(draft.noteId);
                })
                .catch((error) => warnWikiLinkFailure("pending source note 저장 재시도 실패", error));
            }
          }

          // 이 노트 자신이 위키링크로 방금 만들어진 새 노트(target)라면, "지금 활성 탭인 동안만"
          // 저장하는 draft autosave effect에 기대지 않고 title/content를 즉시 독립적으로
          // 저장한다 — 안 그러면 사용자가 이 탭이 열리자마자 바로 다른 곳으로 이동했을 때 이
          // 노트가 draft id만 발급받고 실제 내용은 서버에 한 번도 저장되지 못한 채(제목도 빈
          // 상태로) 남아 "사라진 것처럼" 보이거나 그래프에도 나타나지 않는다. 서버 NoteLink(그래프
          // edge) 생성은 이 저장이 끝난(또는 실패한) 뒤에 시도해, 최소한 이 노트가 실제로 존재하는
          // 상태에서 링크를 걸도록 순서를 맞춘다.
          const createdNoteSnapshot = { ...newNote, id: draft.noteId };
          const persistCreatedNote = USE_MOCK_NOTES
            ? Promise.resolve(true)
            : persistNoteBestEffort(createdNoteSnapshot)
                .then((persisted) => {
                  if (persisted) draftDirtyNoteIdsRef.current.delete(draft.noteId);
                  return persisted;
                })
                .catch((error) => {
                  warnWikiLinkFailure("새로 만든 노트 저장 실패", error);
                  return false;
                });

          void persistCreatedNote.then(() => {
            // 소스 노트가 아직 로컬(미확정) id면 그 노트 자체가 생성 중이라는 뜻이다 — 그 노트의
            // local id를 key로 pending 등록해두면, 그 노트가 자기 draft id를 확정 짓는 순간(바로
            // 아래 pendingWikiLinkEdgeRef 확인 블록)에 실제 sourceNoteId로 링크 생성을 재시도한다.
            if (linkFromNoteId && linkFromNoteId.startsWith("note_")) {
              void createWorkspaceNoteLink(linkFromNoteId, {
                targetNoteId: draft.noteId,
                targetTitle: noteTitle,
                createIfMissing: false,
              })
                .then(() => removePendingCreatedNoteByNoteId(draft.noteId))
                .catch((error) => warnWikiLinkFailure("NoteLink 생성 실패(source/target 모두 확정된 경로)", error));
            } else if (linkFromNoteId) {
              pendingWikiLinkEdgeRef.current.set(linkFromNoteId, {
                targetNoteId: draft.noteId,
                targetTitle: noteTitle,
              });
            }
          });

          // 이 노트(방금 draft id가 확정된 노트) 자신이 "아직 local id라 링크를 못 걸었던
          // 소스 노트"로 pending 등록돼 있었다면, 이제 실제 sourceNoteId가 생겼으니 링크 생성을
          // 재시도한다. source/target 어느 쪽이 늦게 확정되든 항상 이 두 지점(위/아래) 중
          // 하나에서 잡힌다.
          if (pendingWikiLinkEdgeRef.current.has(localNoteId)) {
            const edge = pendingWikiLinkEdgeRef.current.get(localNoteId)!;
            pendingWikiLinkEdgeRef.current.delete(localNoteId);
            void createWorkspaceNoteLink(draft.noteId, {
              targetNoteId: edge.targetNoteId,
              targetTitle: edge.targetTitle,
              createIfMissing: false,
            })
              .then(() => removePendingCreatedNoteByNoteId(edge.targetNoteId))
              .catch((error) => warnWikiLinkFailure("NoteLink 생성 실패(pending edge 재시도 경로)", error));
          }

          // 즐겨찾기 영역에서 직접 만든 루트 노트는 자동 즐겨찾기 — draft id가 확정된 뒤에야
          // 실제 noteId를 알 수 있으므로 여기서 호출한다(로컬 favorite:true는 이미 makeBlankNote
          // 직후 반영해 화면엔 처음부터 별이 보인다).
          if (favorite) {
            void putFavorite("NOTE", draft.noteId, true).catch(() => {});
          }
        })
        .catch((error) => {
          setLoadError(error instanceof Error ? error.message : "새 노트 임시저장 ID를 발급받지 못했습니다.");
        });
    }

    return newNote.id;
  }, [
    isGuest,
    notes.length,
    currentNoteTitleCandidates,
    pushToast,
    rememberInFlightCreatedNote,
    replaceInFlightCreatedNoteId,
    updateInFlightCreatedNote,
    onActiveNoteChange,
    currentWorkspaceId,
    usesDesktopVault,
  ]);

  /* 사이드바 "+ 새 노트" 버튼 → 현재 선택된 폴더 안에, 활성 패널의 새 탭으로 생성.
     favorite=true는 즐겨찾기 영역의 루트 생성 버튼에서만 쓴다(정책: 즐겨찾기 영역에서 직접
     만든 루트 노트/폴더는 자동 즐겨찾기, 즐겨찾기 폴더 안의 하위 항목은 자동 즐겨찾기하지 않음). */
  const handleNewNote = useCallback((folderId?: string, favorite?: boolean) => {
    createNote(folderId, primaryPaneId, undefined, undefined, favorite);
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

  /* 방어적 안전망: 드롭이 어떤 onDrop 핸들러에도 닿지 않거나(예: 패널 바깥/사이드바로 도로 드롭,
     같은 자리로의 no-op 이동처럼 브라우저가 dragend를 안정적으로 쏘지 않는 경로) dragPayload가
     영구히 남으면 본문 위 DnD 오버레이가 사라지지 않은 채 계속 클릭을 가로챈다 — 에디터를 한
     번 클릭해도 그 첫 클릭이 오버레이에 막혀 아무 반응이 없고, 두 번째 클릭(더블클릭)에야
     실제 에디터에 닿아 포커스가 잡히는 것처럼 보이는 원인이다. dragend/drop 외에 blur/tab
     전환에서도 한 번 더 정리한다.
     주의: pointerup/pointercancel은 여기 넣으면 안 된다 — 탭/사이드바 노트의 네이티브 HTML5
     드래그가 시작되는 순간(dragstart) 브라우저가 그 포인터의 캡처를 OS 레벨 드래그로 넘기며
     pointercancel을 쏘는 게 표준 동작이다(드래그 "실패"가 아니라 "시작" 신호). 이 리스너가
     있으면 dragPayload가 set되자마자(다음 tick 전에) 곧바로 null로 리셋돼, 본문 위 분할/교체
     오버레이가 뜨기도 전에 사라져서 드롭이 오버레이의 onDrop이 아니라 에디터
     contentEditable의 브라우저 기본 텍스트 드롭으로 새어 들어갔다 — 탭을 에디터로 드래그하면
     화면분할 대신 noteId 텍스트가 그대로 삽입되던 회귀의 원인이었다. */
  useEffect(() => {
    if (!dragPayload) return;
    const clear = () => setDragPayload(null);
    const onVisibility = () => { if (document.hidden) clear(); };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dragPayload]);

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
  const handleCreateFolder = useCallback((parentFolderId: string | null, name: string, favorite?: boolean) => {
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
      setFolders((prev) => [
        ...prev,
        {
          id: `folder-${uid()}`,
          name,
          parentFolderId,
          documentGroupId: currentWorkspaceId,
          favorite: favorite || undefined,
        },
      ]);
      return;
    }
    void createWorkspaceFolder(name, parentFolderId, currentWorkspaceId)
      .then((created) => {
        setFolders((prev) => [...prev, { ...workspaceFolderToMock(created), favorite: favorite || undefined }]);
        // 즐겨찾기 영역에서 직접 만든 루트 폴더는 자동 즐겨찾기.
        if (favorite) void putFavorite("FOLDER", created.folderId, true).catch(() => {});
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "폴더를 만들지 못했습니다.", "err");
      });
  }, [isGuest, folders, checkFolderDuplicate, pushToast, currentWorkspaceId]);

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

  /* 즐겨찾기 설정/해제 — 낙관적으로 먼저 반영하고, 백엔드 PUT이 실패하면 원래 값으로 되돌리며
     토스트로 알린다. USE_MOCK_NOTES(순수 로컬 데모, 백엔드 없음) 모드는 다른 폴더/노트 CRUD와
     동일하게 로컬 상태만 바꾸고 네트워크 호출 자체를 건너뛴다. */
  const handleToggleFolderFavorite = useCallback((folderId: string) => {
    const current = folders.find((f) => f.id === folderId)?.favorite ?? false;
    const next = !current;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, favorite: next } : f))
    );
    if (USE_MOCK_NOTES) return;
    void putFavorite("FOLDER", folderId, next).catch((error) => {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, favorite: current } : f)));
      pushToast(error instanceof Error ? error.message : "즐겨찾기를 저장하지 못했습니다.", "err");
    });
  }, [folders, pushToast]);

  const handleToggleNoteFavorite = useCallback((noteId: string) => {
    const current = notes.find((n) => n.id === noteId)?.favorite ?? false;
    const next = !current;
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, favorite: next } : n))
    );
    if (USE_MOCK_NOTES) return;
    void putFavorite("NOTE", noteId, next).catch((error) => {
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, favorite: current } : n)));
      pushToast(error instanceof Error ? error.message : "즐겨찾기를 저장하지 못했습니다.", "err");
    });
  }, [notes, pushToast]);

  /* 노트 삭제(들) — 같은 노트가 여러 패널에 중복으로 열려 있을 수 있으므로(의도된 기능) 모든
     패널을 훑어 해당 노트를 가리키는 탭을 전부 제거한다. 탭 제거로 0개가 된 패널은: 분할의
     일부면 closeNode로 트리에서 제거(분할 취소), 유일하게 남은 leaf면 tabs:[]로 비워 Welcome
     보드가 보이게 한다(closePaneOrClearTabs와 동일한 정책). 폴더 cascade 삭제처럼 여러 노트를
     한 번에 지울 때 이 함수를 노트마다 따로 호출하면 매 호출이 같은(stale) paneTabs/state
     클로저를 봐서 두 번째 호출부터 첫 번째 호출의 변경을 못 보는 문제가 있어, 항상 noteId
     집합 전체를 한 번에 받아 한 번의 일관된 계산으로 처리한다. */
  const applyLocalNotesDeletion = useCallback((noteIds: Set<string>) => {
    if (noteIds.size === 0) return;
    for (const noteId of noteIds) inFlightCreatedNotesRef.current.delete(noteId);
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

  /* 노트 탐색기 드래그앤드랍 — 노트를 폴더/루트로 이동, 또는 같은 레벨에서 순서 변경.
     폴더 이동(handleMoveFolderToParent)과 달리 이 핸들러는 로컬 notes state만 갱신하고 서버에는
     반영하지 않아서, 게스트 상태에서 노트를 폴더 안으로 옮긴 뒤(내용은 더 안 건드리고) 새로고침
     하거나 로그인/claim하면 서버(Redis draft/Postgres)에는 이동 전 folderId가 그대로 남아있어
     루트로(또는 원래 폴더로) 되돌아가 보이는 버그가 있었다 — draft autosave effect는 activeNote의
     title/content 변화에만 반응해(2073번째 줄 근처 deps) folderId만 바뀐 백그라운드 노트는 절대
     저장 신호를 못 받는다. 폴더 이동과 동일하게 이동 즉시 best-effort로 서버에도 반영한다. */
  const handleMoveNoteToFolder = useCallback((noteId: string, targetFolderId: string | null) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      // 현재 Workspace(visibleNotes) 기준으로만 충돌 검사한다 — checkNoteDuplicate와 동일한 이유.
      const titleConflict = visibleNotes.some(
        (n) => n.id !== noteId && (n.folderId ?? null) === (targetFolderId ?? null) && n.title.trim() === note.title.trim()
      );
      if (titleConflict) {
        pushToast("이동할 위치에 동일한 이름의 노트가 이미 있습니다.", "err");
        return;
      }
    }
    setNotes((prev) => moveNoteIntoFolder(prev, noteId, targetFolderId));
    if (USE_MOCK_NOTES || !note) return;
    const movedNote = { ...note, folderId: targetFolderId ?? undefined };
    const persistMove = movedNote.persisted
      ? updateWorkspaceNoteMetadata(movedNote)
      : movedNote.id.startsWith("note_")
        ? saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(movedNote))
        : null;
    if (persistMove) {
      void persistMove.catch((error) => {
        pushToast(error instanceof Error ? error.message : "노트 이동을 저장하지 못했습니다.", "err");
      });
    }
  }, [notes, visibleNotes, pushToast]);

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

  /* 버블 툴바의 AI 버튼(요약/개요 생성 등) → 우측 인라인 AI 패널에 요청 전달 */
  const handleAiAction = useCallback((payload: AiActionPayload) => {
    aiNonceRef.current += 1;
    setAiRequest({ ...payload, nonce: aiNonceRef.current });
  }, []);

  const handleEditorHandleChange = useCallback((paneId: string, tabId: string, handle: NoteEditorHandle | null) => {
    const key = `${paneId}:${tabId}`;
    if (handle) {
      if (editorHandlesRef.current[key] === handle) return;
      editorHandlesRef.current[key] = handle;
    } else {
      if (!(key in editorHandlesRef.current)) return;
      delete editorHandlesRef.current[key];
    }
    setEditorHandleRevision((current) => current + 1);
  }, []);

  const handleReset = useCallback(() => {
    const fresh = createInitialPaneState(initialTab);
    setState({ root: fresh.root, activeId: fresh.activeId });
    setPaneTabs(fresh.paneTabs);
    setTabMode({});
    setPaneFontScale({});
    inFlightCreatedNotesRef.current.clear();
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
      setPaneFontScale({});
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
    // 옛 세션에는 이 필드가 없을 수 있으므로 기본값(빈 맵 = 모든 pane 100%)으로 fallback한다.
    setPaneFontScale(saved.paneFontScale ?? {});
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

    // attachInitialTab=false는 applyHydration의 같은 이름 파라미터와 동일한 의도다 — actor(guest/
    // user) 전환 직후에는 resolveActorPersistKey가 claim mapping으로 이미 pane tree/tabs를
    // 올바르게 복원해뒀으므로, "URL의 initialTab을 다시 열거나, 그 노트를 못 찾으면 첫 번째
    // 노트로 대체"하는 이 함수 자신의 폴백을 또 타면 안 된다. 예전에는 이 폴백이 isInitialLoad와
    // 무관하게 `initialTab.kind === "note"`(로그인 전 특정 노트 URL을 보고 있었던 경우)만으로도
    // 발동해, claim 직후 activeId가 가리키는 pane(3분할 중 하나)이 방금 복원된 정상 노트 대신
    // "그 시점에 서버가 아직 못 찾은 초기 노트 → nextNotes[0](엉뚱한 첫 번째 노트)"로 갈아끼워지는
    // 회귀가 있었다.
    function loadFromServer(openNoteId?: string, isInitialLoad = false, attachInitialTab = true) {
      setLoadError(null);
      // initialTab(URL의 노트)로 강제 이동하는 폴백은 최초 마운트 복원에서만 쓴다 — 이후
      // brainx:notes-refresh(예: 데스크톱 수동 동기화의 syncRefresh)가 openNoteId 없이 다시
      // 불러올 때도 이 폴백을 계속 적용하면, 그 사이 사용자가 새 탭(+ 버튼/위키링크로 만든
      // 노트)으로 이미 옮겨간 활성 탭을 initialTab이 가리키던 예전 노트로 도로 튕겨내는
      // 롤백 버그가 있었다.
      const targetNoteId =
        openNoteId ?? (isInitialLoad && attachInitialTab && initialTab.kind === "note" ? initialTab.noteId : null);
      // listNotes/listFolders는 데스크톱 vault 모드에서 로컬 vault 파일을 읽는다 — vault
      // 안의 파일 하나가 손상/잠금 등으로 안 읽히면 이 호출이 reject될 수 있는데, 그걸
      // 아래 shouldUseDesktopVault()와 같은 Promise.all에 그대로 묶어두면 vault 읽기
      // 실패 하나가 "웹 동기화" 버튼(usesDesktopVault)까지 함께 사라지게 만든다(버튼은
      // 이 Promise.all의 성공 콜백에서만 세팅됨). listWorkspaceNoteDrafts()와 동일하게
      // 실패 시 빈 목록으로 폴백해, vault 일부가 안 읽혀도 나머지 기능(특히 동기화 버튼)은
      // 계속 정상 동작하게 한다.
      return Promise.all([
        shouldUseDesktopVault(),
        listNotes().catch(() => ({ notes: [], totalCount: 0 })),
        listFolders().catch(() => ({ folders: [] })),
        listWorkspaceNoteDrafts().catch(() => ({ drafts: [] })),
        targetNoteId ? getWorkspaceNoteDraft(targetNoteId).catch(() => null) : Promise.resolve(null),
      ])
        .then(([desktopVaultEnabled, noteData, folderData, draftData, targetDraft]) => {
          if (!active) return;
          setUsesDesktopVault(desktopVaultEnabled);
          if (desktopVaultEnabled) {
            void refreshDesktopSyncPolicy();
          }
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
              // version은 draft.baseVersion을 절대 쓰지 않는다 — Redis draft autosave(1.5초
              // 디바운스, note.id.startsWith("note_")면 persisted 여부와 무관하게 계속 돈다)는
              // Ctrl+S 실제 저장 후에도 지워지거나 갱신되지 않아, 여기서 draft.baseVersion을
              // 반영하면 방금 올라간 persisted.version(Postgres 진짜 버전)을 그 전 스냅샷 값으로
              // 되돌려버린다. 그 상태로 다음 Ctrl+S가 나가면 항상 409(NOTE_VERSION_CONFLICT)가
              // 나고, 저장 성공 → notes-refresh → 이 merge → version 롤백 → 다음 저장 409 가
              // 무한 반복된다(claim 직후처럼 notes-refresh가 잦으면 특히 잘 드러남). content/
              // title/folderId와 달리 version은 "다음 저장의 낙관적 동시성 토큰"이므로 항상
              // persisted.version(서버의 실제 최신 값)을 그대로 써야 한다.
              version: persisted.version,
              persisted: true,
            };
          });
          const persistedNoteIds = new Set(persistedNotes.map((note) => note.id));
          const draftOnlyNotes = Array.from(draftsById.values())
            .filter((draft) => !persistedNoteIds.has(draft.noteId))
            .map(workspaceDraftToMock);
          const nextNotes = mergeLoadedNotesWithInFlight([...draftOnlyNotes, ...persistedNotes]);
          const nextFolders = folderData.folders.map(workspaceFolderToMock);
          setNotes(nextNotes);
          setFolders(nextFolders);

          // 즐겨찾기 초기 상태 — 노트/폴더 목록 자체의 로딩을 막지 않도록 별도로, 비차단으로
          // 가져온다. 실패해도 노트/폴더 목록은 이미 정상 로드됐으므로 조용히 무시한다.
          void getWorkspaceFavorites()
            .then(({ noteIds, folderIds }) => {
              if (!active) return;
              if (noteIds.size > 0) {
                setNotes((prev) => prev.map((n) => (noteIds.has(n.id) ? { ...n, favorite: true } : n)));
              }
              if (folderIds.size > 0) {
                setFolders((prev) => prev.map((f) => (folderIds.has(f.id) ? { ...f, favorite: true } : f)));
              }
            })
            .catch(() => {});

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
          if (attachInitialTab && !openNoteId && nextNotes.length > 0 && (initialTab.kind === "note" || isInitialLoad)) {
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
      const detail = (event as CustomEvent<{ noteId?: string; resetWorkspace?: boolean; syncRefresh?: boolean }>).detail;
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
        inFlightCreatedNotesRef.current.clear();
        // actor(guest/user)가 바뀌면 이전 actor의 local id는 더 이상 어떤 노트로도 확정되지
        // 않으므로, 그 id를 key로 건 pending 표시도 함께 비운다(그대로 둬도 다시 매치될 일은
        // 없지만, 다음 actor 세션에서 우연히 같은 값이 재사용될 여지를 만들지 않기 위함).
        pendingWikiLinkFlushRef.current.clear();
        pendingWikiLinkEdgeRef.current.clear();
        clearPendingCreatedNotes();
      }
      // resetWorkspace(actor 전환)면 applyHydration이 이미 claim mapping까지 반영해 pane
      // tree/tabs를 복원해뒀으므로, 이 새로고침 자체는 attachInitialTab=false로 호출해 그
      // 복원 결과를 initialTab 폴백으로 덮어쓰지 않는다.
      if (detail?.syncRefresh) {
        setIsSyncRefreshLoading(true);
      }
      void loadFromServer(detail?.noteId, false, !detail?.resetWorkspace).finally(() => {
        if (detail?.syncRefresh) {
          setIsSyncRefreshLoading(false);
        }
      });
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
    for (const id of inFlightNoteIdSet()) noteIds.add(id);
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
  }, [notes, isInitialWorkspaceLoading, inFlightNoteIdSet]);

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
          normalizeEmptyWorkspaceSession({ root: state.root, activeId: state.activeId, paneTabs, notes, folders, paneFontScale })
        );
      } catch {
        // 백그라운드 자동저장 실패는 무시
      }
    }, delay);
    return () => window.clearTimeout(handle);
  }, [effectivePersistKey, state, paneTabs, notes, folders, paneFontScale]);

  // Ctrl+S가 항상 최신 세션을 즉시 기록할 수 있도록 매 변경마다 ref에 스냅샷 보관
  useEffect(() => {
    latestSessionRef.current = normalizeEmptyWorkspaceSession({
      root: state.root,
      activeId: state.activeId,
      paneTabs,
      notes,
      folders,
      paneFontScale,
    });
  }, [state, paneTabs, notes, folders, paneFontScale]);

  /* Ticket14 2단계: Workspace 전환 시 탐색기/Quick Switcher에서는 이미 사라진(다른 Workspace
     소속) 노트를 가리키는 탭이 화면에는 계속 열려 편집 가능한 상태로 남는 불일치를 없앤다.
     정책(A): currentWorkspaceId가 실제로 바뀌면 새 Workspace 기준으로 보이지 않는 노트의 탭을
     모두 닫는다 — 남는 탭이 없는 패널은 applyLocalNotesDeletion과 동일한 정책(분할의 일부면
     closeNode로 제거, 유일한 leaf면 비워서 Welcome Board 노출)을 따른다. 노트/폴더 데이터
     자체는 지우지 않으므로 다시 그 Workspace로 돌아오면 그대로 탐색기에 남아있다.
     currentWorkspaceId 변경에만 반응해야 하므로(매 노트 편집마다 재실행되면 안 됨) notes/
     paneTabs/state는 항상 최신값을 들고 있는 latestSessionRef를 통해 읽는다.

     "전환"의 판정은 boolean 1회성 플래그가 아니라 직전 currentWorkspaceId 값을 직접 기억해서
     비교해야 한다 — WorkspaceProvider는 마운트마다 null로 시작했다가 비동기로 default
     Workspace를 resolve하므로(새로고침 시 마지막으로 보던 Workspace를 기억하지 않는다), null이
     한쪽이라도 관여하는 전환(null→default 최초 해석, 조회 실패로 인한 non-null→null 리셋 등)은
     전부 로딩/초기화 상태이지 사용자가 실제로 고른 전환이 아니다. 이 값을 boolean으로만
     추적하면 "첫 effect 실행이 null인 채로 소비돼버려서" 정작 막아야 할 null→default 전환을
     통과시켜, non-default Workspace에서 탭을 열어둔 채 새로고침한 사용자의 탭이 로딩 도중
     stale로 오판되어 닫히는 회귀가 있었다 — previousWorkspaceId 자체가 null이거나
     currentWorkspaceId가 null이면 항상 정리를 건너뛰고, 두 값이 모두 non-null이면서 서로 다를
     때만 실제 전환으로 취급한다.

     useEffect가 아니라 useLayoutEffect를 쓴다 — useEffect는 브라우저가 이미 화면을 그린
     "뒤"에 비동기로 실행되므로, Workspace를 전환한 프레임에는 이전 Workspace 노트가 탭/본문/
     RightSidebar에 잠깐이라도 그대로 보였다가 그다음 틱에야 지워진다(빠르게 여러 번 전환할수록
     이 "잠깐"이 자꾸 겹쳐서 쌓여, 완전히 정리되지 않은 것처럼 보이는 원인이었다). useLayoutEffect는
     커밋 직후·페인트 전에 동기적으로 실행되고 그 안에서 호출한 setState도 같은 페인트 전에
     한 번 더 처리되므로, 사용자는 이전 Workspace 노트가 섞인 프레임을 전혀 보지 못한다. */
  const previousWorkspaceIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    previousWorkspaceIdRef.current = currentWorkspaceId;
    if (!previousWorkspaceId || !currentWorkspaceId) return;
    if (previousWorkspaceId === currentWorkspaceId) return;
    const staleNoteIds = new Set(
      latestSessionRef.current.notes
        .filter((note) => !matchesCurrentWorkspace(note.documentGroupId))
        .map((note) => note.id)
    );
    if (staleNoteIds.size === 0) return;

    const { paneTabs: currentPaneTabs, root: currentRoot, activeId: currentActiveId } = latestSessionRef.current;
    const affectedPaneIds = Object.keys(currentPaneTabs).filter((paneId) =>
      currentPaneTabs[paneId].tabs.some((t) => staleNoteIds.has(t.noteId))
    );
    if (affectedPaneIds.length === 0) return;

    let nextRoot = currentRoot;
    const removedPaneIds = new Set<string>();
    for (const paneId of affectedPaneIds) {
      const remainingTabs = currentPaneTabs[paneId].tabs.filter((t) => !staleNoteIds.has(t.noteId));
      if (remainingTabs.length > 0) continue;
      if (countLeaves(nextRoot) > 1) {
        const removed = closeNode(nextRoot, paneId);
        if (removed) {
          nextRoot = removed;
          removedPaneIds.add(paneId);
        }
      } else {
        nextRoot = setNoteOnLeaf(nextRoot, paneId, "");
      }
    }
    if (nextRoot !== currentRoot) {
      const nextActiveId = removedPaneIds.has(currentActiveId)
        ? findFirstLeafId(nextRoot) ?? currentActiveId
        : currentActiveId;
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
        if (!current) continue;
        const newTabs = current.tabs.filter((t) => !staleNoteIds.has(t.noteId));
        const newActiveTabId = newTabs.some((t) => t.id === current.activeTabId)
          ? current.activeTabId
          : newTabs[0]?.id ?? "";
        next[paneId] = { tabs: newTabs, activeTabId: newActiveTabId };
      }
      return next;
    });

    setTabMode((prev) => {
      const next = { ...prev };
      for (const paneId of affectedPaneIds) {
        currentPaneTabs[paneId].tabs.forEach((t) => {
          if (staleNoteIds.has(t.noteId)) delete next[t.id];
        });
      }
      return next;
    });
  }, [currentWorkspaceId, matchesCurrentWorkspace]);

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
      void saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(noteSnapshot))
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

  useEffect(() => {
    if (!activeNote) return;
    const session = readAuthSession();
    const documentGroupId = activeNote.documentGroupId ?? currentWorkspaceId ?? "local";
    const userId = session?.userId ?? null;
    const signature = `${userId ?? "guest"}:${documentGroupId}:${activeNote.id}`;
    if (viewedNoteSignatureRef.current === signature) return;
    viewedNoteSignatureRef.current = signature;
    recordNoteViewed(activeNote.id, { userId, documentGroupId });
  }, [activeNote?.id, activeNote?.documentGroupId, currentWorkspaceId]);

  /* Ctrl+S 수동 저장 — 활성 에디터에 디바운스 중인 본문/제목을 즉시 반영하도록 신호를 보낸 뒤,
     약간의 지연 후 최신 세션 스냅샷을 즉시 localStorage에 기록한다. */
  const saveActiveNoteToBackend = useCallback(async (contentOverride?: string) => {
    const noteId = latestSessionRef.current.paneTabs[latestSessionRef.current.activeId]?.tabs.find(
      (tab) => tab.id === latestSessionRef.current.paneTabs[latestSessionRef.current.activeId]?.activeTabId
    );
    if (!noteId || noteId.kind !== "note") {
      return;
    }

    const currentNote = latestSessionRef.current.notes.find((item) => item.id === noteId.noteId);
    const note = contentOverride === undefined
      ? currentNote
      : currentNote
        ? { ...currentNote, content: contentOverride, updatedAt: Date.now() }
        : undefined;
    if (!note) {
      return;
    }

    if (!note.persisted && note.id.startsWith("note_")) {
      await saveWorkspaceNoteDraft(resolveDraftWorkspaceNote(note));
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
            ? { ...item, id: savedId, content: note.content, title: finalTitle, version: nextVersion, persisted: true, updatedAt: Date.now() }
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
          ? { ...item, content: note.content, title: metadata.title, version: metadata.version, persisted: true, updatedAt: Date.parse(content.savedAt) || Date.now() }
          : item
      )
    );
    window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: note.id } }));
  }, [onActiveNoteChange]);

  const createGeneratedNoteFromAi = useCallback(async (
    request: AiOutlineNoteCreateRequest
  ): Promise<AiOutlineNoteCreateResult> => {
    const sourceNote = latestSessionRef.current.notes.find((item) => item.id === request.sourceNoteId);
    if (!sourceNote) {
      throw new Error("원본 노트를 찾을 수 없습니다.");
    }
    const requestedTitle = normalizeAiOutlineNoteTitle(request.title);
    if (!requestedTitle) {
      throw new Error("새 노트 제목으로 쓸 선택 텍스트가 없습니다.");
    }
    const markdown = request.markdown.trim();
    if (!markdown) {
      throw new Error("개요 작성 결과가 비어 있습니다.");
    }

    const documentGroupId = sourceNote.documentGroupId ?? currentWorkspaceId ?? null;
    let createdNote: MockNote;
    if (USE_MOCK_NOTES) {
      const title = nextAvailableExplicitNoteTitle(latestSessionRef.current.notes, requestedTitle, sourceNote.folderId);
      const now = Date.now();
      createdNote = {
        id: `note-${uid()}`,
        title,
        content: markdown,
        tags: [],
        category: sourceNote.category,
        folderId: sourceNote.folderId,
        documentGroupId,
        createdAt: now,
        updatedAt: now,
        version: 1,
        persisted: false,
      };
    } else {
      const created = await createWorkspaceNoteFromPayload({
        title: requestedTitle,
        markdown,
        folderId: sourceNote.folderId ?? null,
        tags: [],
        documentGroupId: documentGroupId ?? undefined,
      });
      const createdAt = Date.parse(created.createdAt) || Date.now();
      createdNote = {
        id: created.noteId,
        title: created.title || requestedTitle,
        content: markdown,
        tags: [],
        category: sourceNote.category,
        folderId: created.folderId ?? sourceNote.folderId,
        documentGroupId,
        createdAt,
        updatedAt: createdAt,
        version: created.version,
        persisted: true,
      };
    }

    let linked = false;
    let linkSkippedReason: string | undefined;
    if (activeNoteId === sourceNote.id && activeEditorHandle && request.selection.range) {
      const result = activeEditorHandle.replaceRangeWithWikiLink(
        request.selection.range,
        request.selection.text,
        createdNote.title
      );
      if (result.replaced) {
        if (USE_MOCK_NOTES) {
          linked = true;
        } else {
          try {
            await saveActiveNoteToBackend(activeEditorHandle.getHTML());
            linked = true;
          } catch (error) {
            linkSkippedReason = "원본 노트의 자동 링크 저장에 실패했습니다. 수동 저장을 다시 시도해 주세요.";
            pushToast(error instanceof Error ? error.message : linkSkippedReason, "err");
          }
        }
      } else {
        linkSkippedReason = result.reason;
      }
    } else {
      linkSkippedReason = "원본 선택 영역이 더 이상 활성 상태가 아니어서 자동 링크를 건너뛰었습니다.";
    }

    setNotes((prev) => [createdNote, ...prev.filter((item) => item.id !== createdNote.id)]);
    handleAddNoteTab(primaryPaneId, createdNote.id);
    prevActiveNoteIdRef.current = createdNote.id;
    window.dispatchEvent(new CustomEvent("brainx:notes-refresh", {
      detail: { noteId: createdNote.id, sourceNoteId: sourceNote.id },
    }));
    onActiveNoteChange?.(createdNote.id);

    return {
      noteId: createdNote.id,
      title: createdNote.title,
      linked,
      linkSkippedReason,
    };
  }, [
    activeEditorHandle,
    activeNoteId,
    currentWorkspaceId,
    handleAddNoteTab,
    onActiveNoteChange,
    primaryPaneId,
    pushToast,
    saveActiveNoteToBackend,
  ]);

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
  // 깊숙이(NoteEditor → CodeBlockView 같은 중첩 단계 없이도) 어디서든 쓸 수 있게 한다. 정책(§8)상
  // WikiLink도 NotesExplorer/QuickSwitcher와 동일하게 현재 Workspace 안에서만 연결돼야 하므로
  // visibleNotes/visibleFolders(현재 Workspace 기준)를 쓴다 — currentWorkspaceId가 null(Guest 또는
  // Workspace 미선택)이면 matchesCurrentWorkspace가 항상 true라 기존처럼 전체 후보가 그대로 유지된다.
  const wikiLinkNoteRefs = useMemo(
    () => visibleNotes.map((n) => ({ id: n.id, title: n.title, folderId: n.folderId ?? null })),
    [visibleNotes]
  );
  const wikiLinkFolderRefs = useMemo(
    () => visibleFolders.map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId })),
    [visibleFolders]
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
      onCreate: (title, sourceHtml) => {
        const sourceNoteId = activeNoteId;
        const sourceNote = sourceNoteId ? notes.find((n) => n.id === sourceNoteId) : undefined;

        // 1) 위키링크 자동완성이 방금 삽입한 [[title]]은 400ms 디바운스 타이머로만 동기화가
        // 예약된 상태다 — createNote가 탭을 새 노트로 즉시 전환하면 그 타이머가 flush 없이
        // clear되어 원본 노트에 방금 넣은 링크가 유실된다(되돌아오면 예전 텍스트가 보이는 원인).
        // 탭을 전환하기 전에 현재 활성 에디터의 대기 중인 저장을 먼저 notes[] state로 흘려보낸다.
        activeEditorHandle?.flushPendingSave();

        if (sourceNote) {
          // 2) notes[] state로의 반영은 setState 배치 때문에 이 시점에 아직 이 클로저의 `notes`에
          // 보이지 않을 수 있다 — 그래서 state 갱신을 기다리지 않고 지금 이 순간의 실제 에디터
          // 내용을 직접 읽는다. sourceHtml(WikiLinkAutocomplete가 .run() 직후 같은 동기 실행
          // 안에서 읽어 넘긴 값)이 있으면 그 값을 최우선으로 신뢰한다 — activeEditorHandle을
          // 통해 다시 읽으면 그 사이 리렌더/탭 전환이 끼어들 여지가 있다.
          let latestContent = sourceHtml ?? activeEditorHandle?.getHTML() ?? sourceNote.content;

          // 방어적 검증/보정 — 라이브에딧(atom↔텍스트) 전환 타이밍 등으로 방금 넣은 [[title]]에
          // 닫는 ]]가 아직 안 붙었거나([[title 상태), title이 빈 채로 남았다면([[]]) 그 자리에서
          // 바로 고친다(본문 끝에 새로 덧붙이면 깨진 조각과 새 링크가 중복으로 남는다).
          if (!contentHasWikiLinkTo(latestContent, title)) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[wiki-link] "${title}" 링크가 문서에서 닫힌 상태로 확인되지 않아 보정합니다.`,
                { sourceNoteId: sourceNote.id }
              );
            }
            latestContent = ensureWikiLinkPresent(latestContent, title);
          }

          if (latestContent !== sourceNote.content) {
            const correctedContent = latestContent;
            setNotes((prev) =>
              prev.map((n) => (n.id === sourceNote.id ? { ...n, content: correctedContent, updatedAt: Date.now() } : n))
            );
            draftDirtyNoteIdsRef.current.add(sourceNote.id);
          }

          // 3) activeNote가 바뀌는 순간 취소되는 draft autosave effect(1500ms 디바운스, activeNote
          // 기준)에 기대지 않고, 지금 이 순간 독립적인 네트워크 요청으로 소스 노트를 저장한다 —
          // 바로 다음 줄에서 탭을 A로 전환해도 이미 시작된 이 요청은 취소되지 않고 끝까지
          // 진행된다. 이게 이번에 고치는 race condition의 핵심이다.
          if (!USE_MOCK_NOTES) {
            const noteToPersist = { ...sourceNote, content: latestContent };
            void persistNoteBestEffort(noteToPersist)
              .then((persisted) => {
                if (persisted) {
                  draftDirtyNoteIdsRef.current.delete(sourceNote.id);
                } else {
                  // 소스 노트 자신이 아직 draft id 발급 전(local id)이라 지금은 저장할 방법이
                  // 없다 — 그 노트의 draft id가 확정되는 시점(createNote의 issueWorkspaceNoteDraftId
                  // .then)에 한 번 더 저장을 시도하도록 표시해둔다. 그동안에도 notes[] state와
                  // 화면(에디터 재방문)에는 [[title]]이 이미 반영돼 있어 이번 세션 안에서 유실되지
                  // 않는다.
                  pendingWikiLinkFlushRef.current.add(sourceNote.id);
                }
              })
              .catch((error) => {
                // best-effort — 실패해도 draftDirtyNoteIdsRef에 여전히 남아 있어 다음 저장 기회
                // (수동 저장/그 노트 재방문 시 draft autosave)에 다시 시도된다.
                warnWikiLinkFailure("source note 즉시 저장 실패", error);
              });
          }
        }

        // 4) 그 다음에 새 노트를 만들고 A 탭으로 이동한다. createNote 자체가(위키링크 여부와
        // 무관하게 모든 새 노트 생성에서) sessionStorage optimistic 기록을 남긴다 — linkFromNoteId를
        // 넘기면 그래프가 optimistic edge까지 합성한다.
        createNote(undefined, primaryPaneId, title, sourceNoteId ?? undefined);
      },
    }),
    [wikiLinkNoteRefs, wikiLinkFolderRefs, handleNoteClick, createNote, primaryPaneId, activeEditorHandle, activeNoteId, notes]
  );

  // 노트/탭/패널 데이터 초기화가 끝나기 전에는 워크스페이스 전체를 로딩 상태로 대체한다 —
  // Welcome 보드나 탐색기처럼 일부 영역만 먼저 깜빡이며 빈 상태로 그려지는 것을 막는다.
  if (isInitialWorkspaceLoading || isSyncRefreshLoading) {
    return (
      <WorkspaceLoadingShell
        explorerOpen={explorerOpen}
        contextOpen={contextOpen}
        contextPanelSize={contextPanelSize}
        message={isSyncRefreshLoading ? "동기화 중.." : "불러오는 중…"}
      />
    );
  }

  const paneTree = (
    <PaneTreeRenderer
      node={state.root}
      notes={notes}
      visibleNotes={visibleNotes}
      activeId={state.activeId}
      dragPayload={dragPayload}
      tabMode={tabMode}
      paneTabs={paneTabs}
      paneFontScale={paneFontScale}
      onPaneFontScaleChange={handlePaneFontScaleChange}
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
          notes={visibleNotes}
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
            notes={visibleNotes}
            folders={visibleFolders}
            activeNoteId={activeNoteId ?? ""}
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            onNoteClick={handleNoteClick}
            onCreateFolder={handleCreateFolder}
            onCreateNote={handleNewNote}
            onRenameFolder={handleRenameFolder}
            onChangeFolderColor={handleChangeFolderColor}
            onToggleFolderFavorite={handleToggleFolderFavorite}
            onToggleNoteFavorite={handleToggleNoteFavorite}
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
            {usesDesktopVault ? (
              <button
                type="button"
                onClick={() => void handleManualCloudSync()}
                disabled={desktopManualSyncing || desktopSyncPolicy?.mode !== "manual-cloud"}
                title={desktopSyncPolicy?.mode === "manual-cloud" ? "로컬 변경사항을 웹에 수동 동기화" : "manual-cloud 모드에서만 웹 동기화를 실행할 수 있습니다."}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  desktopManualSyncing || desktopSyncPolicy?.mode !== "manual-cloud"
                    ? "cursor-not-allowed border-line/40 text-txt3/50"
                    : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                )}
              >
                {desktopManualSyncing ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}
                <span>{desktopManualSyncing ? "동기화 중" : "웹 동기화"}</span>
              </button>
            ) : null}
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
                    allFolders={folders}
                    onCollapse={() => setContextOpen(false)}
                    onNoteSelect={handleNoteClick}
                    pendingAiRequest={aiRequest}
                    onAiRequestHandled={() => setAiRequest(null)}
                    onCreateAiOutlineNote={createGeneratedNoteFromAi}
                    activeEditor={activeEditorHandle}
                    activeEditorMode={activeEditorMode}
                    saveStatus={combinedSaveStatus}
                    onSaveActiveNote={saveActiveNoteToBackend}
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
