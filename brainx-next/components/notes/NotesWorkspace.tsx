"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { WikiLinkContext, resolveWikiLinkTitle, type WikiLinkContextValue } from "./WikiLinkContext";
import { renameWikiLinkReferencesInContent, contentHasWikiLinkTo, ensureWikiLinkPresent } from "@/lib/wiki-links";
import {
  addPendingCreatedNote,
  clearPendingCreatedNotes,
  removePendingCreatedNoteByNoteId,
  updatePendingCreatedNoteId,
  updatePendingCreatedNoteTitle,
} from "@/lib/notes/pending-created-note-cache";
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
    title: "???명듃",
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

/** 30珥?二쇨린 draft flush(NoteDraftFlushScheduler)媛 諛깃렇?쇱슫?쒖뿉??note.version???щ┫ ???덉뼱,
    Ctrl+S媛 ?ㅺ퀬 ?덈뜕 baseVersion??洹??ъ씠 ?≪븘 409 NOTE_VERSION_CONFLICT媛 ?????덈떎. ?쒕쾭媛
    ?뚮젮二쇰뒗 ?ㅼ젣 serverVersion?쇰줈 ????踰덈쭔 ?ъ떆?꾪븳????洹몃옒???ㅽ뙣?섎㈃(吏꾩쭨 ?숈떆 ?몄쭛 異⑸룎)
    洹몃?濡??섏졇 湲곗〈 ?먮윭 泥섎━(????ㅽ뙣 ?곹깭 ?쒖떆)瑜?洹몃?濡??꾨떎. */
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

/** ?꾪궎留곹겕 ???명듃 ?앹꽦 ?먮쫫?????留곹겕 ?앹꽦? ?遺遺?`.catch(() => {})`濡?議곗슜???ㅽ뙣瑜?
    ?쇳궓???ъ슜???먮쫫??留됱? ?딄린 ?꾪븳 best-effort) ??洹몃윭??洹몃윭硫?媛쒕컻 以묒뿉????留곹겕??
    洹몃옒??edge媛 ??蹂댁씠?붿? ?먯씤???????녿떎. ?꾨줈?뺤뀡 ?ъ슜??寃쏀뿕? 洹몃?濡??먭퀬, 媛쒕컻
    ?섍꼍 肄섏넄?먯꽌留??ㅽ뙣瑜??뺤씤?????덇쾶 ?쒕떎. */
function warnWikiLinkFailure(context: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[wiki-link] ${context}`, error);
}

/** ?명듃媛 "吏湲??쒖꽦 ??씤 ?숈븞留? ??λ릺??effect(draft autosave/?섎룞 ?????湲곕?吏 ?딄퀬,
    二쇱뼱吏??명듃 ?ㅻ깄?룹쓣 吏湲????쒓컙 best-effort濡??쒕쾭??諛섏쁺?쒕떎. ?꾪궎留곹겕濡????명듃瑜?
    留뚮뱾硫댁꽌 ??쓣 利됱떆 ?꾪솚?섎뒗 寃쎌슦泥섎읆, activeNote媛 諛붾뚮뒗 ?쒓컙 洹?note瑜???곸쑝濡??섎뜕
    ?붾컮?댁뒪 ??대㉧(draftAutosaveTimerRef)媛 cleanup?쇰줈 痍⑥냼?쇰쾭??諛⑷툑 ?ｌ? ?댁슜???쒕쾭??
    ??踰덈룄 ??λ릺吏 紐삵븯??寃쎈줈瑜??고쉶?섍린 ?꾪븳 ?⑥닔?? 諛섑솚媛?true??"??μ쓣 ?쒕룄?덈떎"??
    ?살씠怨? false??note媛 ?꾩쭅 濡쒖뺄(local) id???쒕쾭????ν븷 諛⑸쾿???놁뼱 ?ㅽ궢?덈떎???살씠??
    (draft id 諛쒓툒 ?????몄텧遺媛 id ?뺤젙 ?쒖젏???ㅼ떆 ?쒕룄?섎룄濡?梨낆엫吏꾨떎). */
async function persistNoteBestEffort(note: MockNote): Promise<boolean> {
  if (note.persisted) {
    await saveNoteContentWithVersionRetry(note);
    return true;
  }
  if (note.id.startsWith("note_")) {
    await saveWorkspaceNoteDraft(note);
    return true;
  }
  return false;
}

const SAVE_BUTTON_TITLE: Record<SaveStatus, string> = {
  idle: "저장 (Ctrl+S)",
  saving: "저장 중...",
  saved: "저장됨",
  error: "저장에 실패했습니다. 다시 시도해 주세요.",
};

/** draft ?먮룞??κ낵 ?섎룞???Ctrl+S/?대┃)???섎굹???꾩씠肄?踰꾪듉 ?곹깭濡??듯빀 ?쒖떆 */
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

/** /notes ?섏씠吏 ?꾩껜(?먯깋湲걔룻댋諛붋룹뿉?뷀꽣쨌而⑦뀓?ㅽ듃 ?⑤꼸)瑜???踰덉뿉 濡쒕뵫 ?곹깭濡?蹂댁뿬以??
    珥덇린 ?쒕쾭 ?곗씠??濡쒕뱶媛 ?앸굹湲??꾩뿉 Welcome 蹂대뱶 ???쇰? ?곸뿭留??곕줈 源쒕묀?대ŉ 諛붾뚯?
    ?딅룄濡? ?ㅼ젣 ?덉씠?꾩썐 援ъ“(?먯깋湲????대컮 ?믪씠/而⑦뀓?ㅽ듃 ?⑤꼸 ??瑜?洹몃?濡??됰궡?대ŉ
    ?붾㈃ ?꾩껜瑜??泥댄븳?? 異뷀썑 ???뺢탳??紐⑥뼇?쇰줈 諛붽? ?뚮뒗 ???⑥닔? ??*Skeleton
    而댄룷?뚰듃?ㅻ쭔 援먯껜?섎㈃ ?쒕떎 ???몄텧 履??꾨옒 isInitialWorkspaceLoading 遺꾧린)? 洹몃?濡??붾떎. */
function WorkspaceLoadingShell({
  explorerOpen,
  contextOpen,
  contextPanelSize,
  message = "불러오는 중...",
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
  /** 吏????localStorage???몄뀡(遺꾪븷/???명듃/?대뜑)???곸냽?뷀븳?? ?곕え(split-demo)??鍮꾩썙??留ㅻ쾲 珥덇린?? */
  persistKey?: string;
  /** ????쒖꽦 ?명듃媛 諛붾????몄텧 ???섏씠吏?먯꽌 URL??媛깆떊?섎뒗 ???ъ슜 */
  onActiveNoteChange?: (noteId: string | null) => void;
}

/* ?⑤꼸 ?몃━ + ???곹깭瑜??④퍡 珥덇린??(?숈씪??paneId濡?臾띔린 ?꾪빐 ?쒕쾲???앹꽦). initialTab??"start"硫?
   ??쓣 留뚮뱾吏 ?딅뒗????諛곗뿴??鍮??곹깭) ???뚰겕?ㅽ럹?댁뒪媛 ?대? 蹂닿퀬 Welcome 蹂대뱶瑜?蹂댁뿬以?? */
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

/* ?몃━???ㅼ젣濡?議댁옱?섎뒗 leaf paneId留?紐⑥?????paneTabs 媛앹껜?먮뒗 怨쇨굅 踰꾧렇/?덉씠?ㅻ줈 ?앷릿 怨좎븘
   ??ぉ(?몃━?먯꽌???대? ?щ씪議뚯?留??ㅻ쭔 ?⑥? ?⑤꼸)???욎뿬 ?덉쓣 ???덉뼱, "??씠 0媛쒖씤吏" ?먯젙?
   ??긽 ???⑥닔濡??살? ?ㅼ젣 leaf 湲곗??쇰줈留??댁빞 ?쒕떎(怨좎븘 ??ぉ???덈떎???댁쑀濡?Welcome ?먯젙??
   源⑥?硫?????. */
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
    // ?몃━ ?먯껜媛 ?덈줈 留뚮뱾?댁?誘濡???pane id) ?댁쟾 pane??留ㅼ씤 以?媛믪? ???댁긽 ?섎?媛 ?녿떎.
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

/** ?몄텧?먭? 吏곸젒 ?ㅽ뙣瑜?泥섎━?쒕떎 (諛깃렇?쇱슫???먮룞??μ? 臾댁떆, ?섎룞 ??μ? ?ㅽ뙣 ?곹깭濡??몄텧) */
function writeSession(persistKey: string, session: NotesWorkspaceSession) {
  window.localStorage.setItem(persistKey, JSON.stringify(session));
}

/* localStorage ?뚰겕?ㅽ럹?댁뒪 ?몄뀡 key瑜?actor(guest/user)蹂꾨줈 遺꾨━?댁꽌 怨꾩궛?쒕떎 ??寃뚯뒪?몄쓽 ??
   split/active note媛 濡쒓렇??吏곹썑 ?ㅻⅨ ?ъ슜?먯쓽 ?붾㈃???좉퉸 蹂댁씠嫄곕굹, 諛섎?濡?濡쒓렇?꾩썐 ??吏곸쟾
   user????씠 寃뚯뒪???붾㈃???⑤뒗 嫄?留됯린 ?꾪븿(湲곗〈 brainx:notes-refresh + resetWorkspace??
   "?꾩옱 硫붾え由??곹깭瑜??뺣━"??肉? ?섏씠吏瑜??덈줈 ?닿굅???ㅻⅨ ?쇱슦??/login ??瑜?嫄곗퀜 ?뚯븘?ㅻ뒗
   寃쎌슦泥섎읆 而댄룷?뚰듃媛 ?덈줈 留덉슫?몃릺??寃쎈줈??紐?留됰뒗????localStorage key ?먯껜媛 actor蹂꾨줈
   媛덈씪???덉뼱??洹?寃쎈줈???덉쟾?섎떎).

   guestId??Gateway媛 httpOnly 荑좏궎(brainx_guest_id)濡쒕쭔 ?ㅺ퀬 ?덉뼱 ?꾨줎??JS媛 媛믪쓣 ?쎌쓣 ??
   ?녿떎 ??洹몃옒??"??釉뚮씪?곗????꾩옱 寃뚯뒪??瑜?媛由ы궎??怨좎젙 ?щ’ ?섎굹(:guest, id ?놁씠)留?
   ?대떎. ?댁감??釉뚮씪?곗? ?섎굹?먮뒗 洹?荑좏궎????踰덉뿉 ?섎굹肉먯씠??蹂꾨룄 id媛 ?놁뼱??異⑸룎?섏?
   ?딅뒗?? userId??濡쒓렇???몄뀡???됰Ц?쇰줈 ?덉쑝誘濡?洹몃?濡??ㅼ뿉 ?대떎.

   "寃뚯뒪?????좎?"??留?濡쒓렇???뚯썝媛?낅쭏??理쒖큹 媛?낅퓧 ?꾨땲??湲곗〈 ?뚯썝 濡쒓렇?몃룄 ?숈씪) 洹?
   ?쒓컙??寃뚯뒪???묒뾽??user ?몄뀡?쇰줈 ?섍꺼以??"?댁뼱諛쏄린") ??洹몃옒??寃뚯뒪???ㅼ뿉 ?ㅼ젣 ??씠
   ?덉쑝硫?洹??댁슜???듭㎏濡?user ?ㅼ뿉 ??뼱?곌퀬, 寃뚯뒪???ㅻ뒗 吏?대떎(?ㅼ쓬遺?곕뒗 user ?ㅻ쭔 ?쎌쓬).
   寃뚯뒪?멸? 鍮꾩뼱 ?덉뿀?쇰㈃(?섎윭蹂닿린留???寃쎌슦) 援녹씠 鍮꾩뼱?덈뒗 媛믪쑝濡?洹?user??湲곗〈 ?몄뀡??
   ??뼱?곗? ?딅뒗??

   ?덉쟾??怨듭쑀 ?⑥씪 key(`persistKeyBase` 洹몃?濡? suffix ?놁쓬)??guest/user ?대뒓 履??곗씠?곗씤吏
   ?????놁뼱 ?덉쟾?섍쾶 ?먭린?쒕떎(?욎뼱 ?곕뒗 寃껊낫??踰꾨━??履쎌씠 ?덉쟾) ???몄텧留덈떎(硫깅벑) 吏?대떎. */
function resolveActorPersistKey(persistKeyBase: string): string {
  if (typeof window === "undefined") return persistKeyBase;
  try {
    window.localStorage.removeItem(persistKeyBase);
  } catch {
    // localStorage ?묎렐 遺덇? ??臾댁떆
  }

  const guestKey = `${persistKeyBase}:guest`;
  const session = readAuthSession();
  if (!session?.accessToken || !session.userId) {
    return guestKey;
  }

  const userKey = `${persistKeyBase}:user:${session.userId}`;
  // 諛⑷툑 claimGuestDraftsAfterAuth媛 ?앸궗?ㅻ㈃(濡쒓렇???뚯썝媛??吏곹썑 泥?留덉슫?? draft id ???밴퀎??
  // ?ㅼ젣 noteId 留ㅽ븨???ш린 ?덈떎 ??寃뚯뒪???몄뀡??洹몃?濡??섍린硫?pane tree/tabs媛 ???댁긽 議댁옱?섏?
  // ?딅뒗 draft id瑜?媛由ы궎寃??섎?濡? user ?ㅼ뿉 ?곌린 ?꾩뿉 癒쇱? 媛덉븘?쇱슫?? ??踰??뚮퉬?섎㈃ 吏?뚯?誘濡?
  // ???⑥닔媛 媛숈? 濡쒓렇?몄뿉 ????щ윭 踰??몄텧?쇰룄(?대깽???몃뱾??履??ы샇異??? ??踰??곸슜?섏? ?딅뒗??
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
    // ?먯긽??寃뚯뒪???몄뀡 ?깆? 臾댁떆?섍퀬 user ?ㅻ줈 洹몃?濡?吏꾪뻾
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
  // 理쒖큹 1?뚮쭔 ?앹꽦?섎뒗 珥덇린媛?(pane root? paneTabs媛 媛숈? paneId瑜?怨듭쑀?댁빞 ??
  const initRef = useRef<ReturnType<typeof createInitialPaneState> | null>(null);
  if (!initRef.current) initRef.current = createInitialPaneState(initialTab);
  const init = initRef.current;

  const { pushToast } = useBrainX();

  // ?대컮 "쨌쨌쨌" 硫붾돱
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
  /* pane(遺꾪븷 ?⑤꼸)蹂?Ctrl+Wheel ?먮뵒??酉?以?%, 湲곕낯 100) ???명듃 臾몄꽌??typography(?쒖떇 ?⑤꼸)?
     ?꾩쟾??遺꾨━??UI ?꾩슜 ?곹깭?? key??PaneLeaf.id??split ?앹꽦/??젣/?대룞?먮룄 媛??⑤꼸 怨좎쑀??
     媛믪쑝濡??먯뿰???좎??섍퀬, ?덈줈 ?앷릿 pane? 洹몃깷 ??留듭뿉 ?녿뒗 ?곹깭(= 湲곕낯 100%)濡??쒖옉?쒕떎. */
  const [paneFontScale, setPaneFontScale] = useState<Record<string, number>>({});
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => {
    const handleToggle = () => setExplorerOpen((prev) => !prev);
    window.addEventListener("brainx-toggle-notes-explorer", handleToggle);
    return () => window.removeEventListener("brainx-toggle-notes-explorer", handleToggle);
  }, []);
  // 而⑦뀓?ㅽ듃 ?⑤꼸 ????Split View(PaneTreeRenderer.tsx)? ?숈씪??react-resizable-panels
  // Group/Panel/Separator瑜??ъ궗?⑺빐 ?쒕옒洹몃줈 議곗젅 媛?ν븯寃??쒕떎. 留덉?留???? localStorage??
  // ??ν빐 ?덈줈怨좎묠 ?꾩뿉???좎?(?붽뎄?ы빆).
  //
  // 泥??쒕옒洹몃쭔 留덉슦???대룞?됱쓽 ?쇰?留?諛섏쁺?섍퀬(?ㅼ륫: 100px ?쒕옒洹???10px留??곸슜) ??踰덉㎏
  // ?쒕옒洹몃????뺤긽?붾릺??踰꾧렇媛 ?덉뿀??Playwright濡??ы쁽). Split View 履?Group(媛숈?
  // ?쇱씠釉뚮윭由? PaneTreeRenderer.tsx)? ?숈씪 臾몄젣媛 ?놁뿀?붾뜲 ??洹몄そ? ?ъ슜?먭? 吏곸젒 遺꾪븷??
  // ???대? ?섏씠吏媛 ?덉젙???? 留덉슫?몃릺怨? ??而⑦뀓?ㅽ듃 ?⑤꼸 Group? ?섏씠吏 濡쒕뱶 利됱떆
  // 留덉슫?몃맂?ㅻ뒗 李⑥씠肉먯씠?덈떎.
  //
  // ?먯씤??醫곹?蹂대젮怨??쒕룄??寃껊뱾(?꾨? ?④낵 ?놁뿀?? Playwright濡?吏곸젒 寃利?:
  //   - groupRef.setLayout()?쇰줈 留덉슫??吏곹썑 ?덉씠?꾩썐 ?ъ쟻??
  //   - window.dispatchEvent(new Event("resize"))(吏꾩쭨/?⑹꽦 ????
  //   - ?⑤꼸 DOM??1px 媛뺤젣 由ъ궗?댁쫰 ???먮났
  //   - separator???⑹꽦(untrusted) PointerEvent濡?"?뚮컢???쒖뒪泥? ?섎젮蹂대궡湲?
  // ?좎씪?섍쾶 ?④낵媛 ?덉뿀??嫄?Playwright??page.mouse.down/move/up(釉뚮씪?곗?媛 isTrusted:true濡?
  // ?몄떇?섎뒗 吏꾩쭨 ?쒖뒪泥??쇰줈 ??踰??쒕옒洹명빐 蹂대뒗 寃껊퓧?댁뿀????利??쇱씠釉뚮윭由ъ쓽 ?대? ?쒕옒洹?
  // ?명? 怨꾩궛??"?좊ː??isTrusted) ?ъ씤???쒖뒪泥?媛 ??踰??덉뼱??湲곗??먯쓣 ?〓뒗 寃껋쑝濡?蹂댁씠怨?
  // ?ㅽ겕由쏀듃濡?dispatch???⑹꽦 ?대깽?몃뒗 isTrusted:false??洹?湲곗???蹂댁젙???쇱뼱?섏? ?딅뒗??
  // ?섏씠吏 肄붾뱶?먯꽌 ?좊ː???대깽?몃? 留뚮뱾?대궪 諛⑸쾿? ?놁쑝誘濡?蹂댁븞???뱀뿰??留됲? ?덉쓬), ??
  // Separator留??쇱씠釉뚮윭由ъ쓽 ?댁옣 ?쒕옒洹????吏곸젒 留뚮뱺 mousedown/mousemove ?몃뱾?щ줈 ??쓣
  // 怨꾩궛??`groupRef.setLayout()`???몄텧?섎뒗 諛⑹떇?쇰줈 諛붽퓭 ?쇱씠釉뚮윭由ъ쓽 洹??대? 怨꾩궛 寃쎈줈瑜?
  // ?꾩삁 ?吏 ?딄쾶 ?덈떎 ???좊ː???대깽???щ?? 臾닿??섍쾶 ??긽 ?ㅼ젣 留덉슦???대룞?됰쭔??諛섏쁺?쒕떎.
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
        // localStorage ?묎렐 遺덇?
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [contextPanelSize]);
  // MOCK_NOTES瑜?媛蹂 ?곹깭濡?蹂듭궗 ???쒕ぉ ?섏젙/???명듃 ?앹꽦 ???ъ씠?쒕컮/?ㅻ뜑/而⑦뀓?ㅽ듃 ?⑤꼸 利됱떆 諛섏쁺
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
  // ???명듃 ?몄뒪?댁뒪)蹂??쎄린/?몄쭛 紐⑤뱶 ??tabId 湲곗?. ?⑤꼸???꾨땲?????⑥쐞?쇱꽌 媛숈? ?⑤꼸 ?덉뿉??
  // ??쭏???ㅻⅨ 紐⑤뱶瑜?媛吏????덇퀬, 媛숈? ?명듃瑜??щ윭 ?⑤꼸???댁뼱??媛???씠 ?낅┰?곸쑝濡??좎??쒕떎.
  // 湲곕줉???녿뒗 tabId????긽 "edit"濡?痍④툒?쒕떎(???명듃/?덈줈 ???명듃??湲곕낯 ?몄쭛 紐⑤뱶).
  const [tabMode, setTabMode] = useState<Record<string, EditMode>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [aiRequest, setAiRequest] = useState<PendingAiRequest | null>(null);
  const [quickSwitcher, setQuickSwitcher] = useState<QuickSwitcherTarget | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<SaveStatus>("idle");
  const [manualSaveStatus, setManualSaveStatus] = useState<SaveStatus>("idle");
  // ?먮룞 draft ??κ낵 ?섎룞 ???Ctrl+S/?대┃) ?곹깭瑜????踰꾪듉 ?섎굹?먯꽌 ?듯빀 ?쒖떆?섍린 ?꾪븳 ?뚯깮媛?
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
  /* ?꾪궎留곹겕濡????명듃瑜?留뚮뱾 ?? ?뚯뒪 ?명듃媛 ?꾩쭅 draft id 諛쒓툒 ??local id)?대씪 洹??먮━?먯꽌
     諛붾줈 ??ν븯吏 紐삵븳 寃쎌슦 ?ш린(local id 湲곗?)???쒖떆?대몦????createNote??draft id ?뺤젙
     ?쒖젏(.then)?먯꽌 ??紐⑸줉???뺤씤??洹몃븣 ?ㅼ떆 ?쒕쾲 ??μ쓣 ?쒕룄?쒕떎. */
  const pendingWikiLinkFlushRef = useRef<Set<string>>(new Set());
  /* ?꾪궎留곹겕濡????명듃(target)瑜?留뚮뱾?덈뒗??洹??쒖젏???뚯뒪 ?명듃媛 ?꾩쭅 local id???쒕쾭
     NoteLink(洹몃옒??edge)瑜?紐?留뚮뱺 寃쎌슦, ?뚯뒪??local id瑜?key濡??ш린 ?깅줉?대몦?? createNote媛
     洹??뚯뒪 ?명듃 ?먯떊??draft id瑜??뺤젙 吏볥뒗 ?쒓컙(?ㅻⅨ createNote ?몄텧??.then???섎룄 ?덈떎) ??
     留듭쓣 ?뺤씤???ㅼ젣 sourceNoteId濡?留곹겕 ?앹꽦???ъ떆?꾪븳?? ???꾪솚/?섏씠吏 ?대룞?먮룄 ??ref??
     而댄룷?뚰듃媛 留덉슫?몃맂 梨꾨줈 ?⑥븘?덈뒗 ??媛숈? (app)/notes ?덉씠?꾩썐 ?덉뿉?쒕뒗 由щ쭏?댄듃?섏? ?딆쓬)
     ?몄뀡 ?숈븞 ?좎??쒕떎. */
  const pendingWikiLinkEdgeRef = useRef<Map<string, { targetNoteId: string; targetTitle: string }>>(new Map());
  // persistKey(prop)??"brainx_notes_workspace_v1" 媛숈? 怨좎젙 踰좎씠?ㅺ퀬, ?ㅼ젣濡??쎄퀬 ?곕뒗 ?ㅻ뒗
  // ?ш린??actor(guest/user)蹂꾨줈 ??踰???媛덈씪吏꾨떎 ??resolveActorPersistKey 李멸퀬. 留덉슫??
  // ?쒖젏??1??怨꾩궛(???쒖젏???대? guest->user 1???밴퀎??泥섎━??, ?댄썑 濡쒓렇??濡쒓렇?꾩썐 ?깆쑝濡?
  // actor媛 諛붾뚮㈃ handleExternalRefresh(resetWorkspace)媛 ?ㅼ떆 怨꾩궛??媛덉븘?쇱슫??
  const [actorPersistKey, setActorPersistKey] = useState<string | undefined>(() =>
    persistKey ? resolveActorPersistKey(persistKey) : undefined
  );
  const effectivePersistKey = actorPersistKey;
  // Ctrl+S 諛쒖깮 ?쒖젏??理쒖떊 ?몄뀡 ?ㅻ깄?????붾컮?댁뒪/?뚮뜑 ??대컢怨?臾닿??섍쾶 ??긽 理쒖떊媛믪쓣 ?쎄린 ?꾪븳 ref
  const latestSessionRef = useRef<NotesWorkspaceSession>({
    root: init.root,
    activeId: init.activeId,
    paneTabs: init.paneTabs,
    notes: USE_MOCK_NOTES ? [...MOCK_NOTES] : [],
    folders: USE_MOCK_NOTES ? [...MOCK_FOLDERS] : [],
  });

  /* 寃뚯뒪???щ? ???몄쬆 ?몄뀡???놁쑝硫?寃뚯뒪??*/
  const isGuest = useMemo(() => {
    const session = readAuthSession();
    return !session?.accessToken;
  }, []);

  /* 媛숈? depth?먯꽌 ?숈씪 ?대쫫???명듃 以묐났 ?щ? ?뺤씤 (?명듃?붾끂?몃쭔, ?대뜑????덉슜) */
  const checkNoteDuplicate = useCallback((title: string, folderId: string | null | undefined): boolean => {
    const normalizedFolderId = folderId ?? null;
    return notes.some(
      (n) => (n.folderId ?? null) === normalizedFolderId && n.title.trim() === title.trim()
    );
  }, [notes]);

  /* 媛숈? depth?먯꽌 ?숈씪 ?대쫫???대뜑 以묐났 ?щ? ?뺤씤 (?대뜑?뷀뤃?붾쭔, ?뺤젣 ?대뜑 湲곗?) */
  const checkFolderDuplicate = useCallback((name: string, parentFolderId: string | null, excludeId?: string): boolean => {
    return folders.some(
      (f) => f.id !== excludeId && (f.parentFolderId ?? null) === (parentFolderId ?? null) && f.name.trim() === name.trim()
    );
  }, [folders]);

  const panelCount = countLeaves(state.root);
  const hasSplitPanels = panelCount > 1;
  const primaryPaneId = useMemo(() => resolveVisiblePaneId(state.root, state.activeId), [state.root, state.activeId]);
  // ?대젮 ?덈뒗 ?명듃媛 ?섎굹(??1媛?肉먯씠?대룄 遺꾪븷? ?덉슜?쒕떎 ??handleSplitTab? 洹???쓽 ?명듃瑜?
  // "蹂듭젣"?????⑤꼸????肉??먮옒 ?⑤꼸????? 洹몃?濡??먮?濡?媛숈? ?명듃瑜??щ윭 ?⑤꼸???щ뒗 湲곗〈
  // ?숈옉怨??숈씪??諛⑹떇), ??씠 1媛쒕퓧?대씪怨?留됱쓣 湲곗닠???댁쑀媛 ?녿떎. ?덉쟾??`> 1`濡?留됱븘???볦뿉
  // ?명듃瑜??섎굹留???媛???뷀븳 ?곹깭?먯꽌 "?곗륫 遺꾪븷"/"?섎떒 遺꾪븷" 硫붾돱媛 怨꾩냽 鍮꾪솢?깆쑝濡?蹂댁뿬
  // 遺꾪븷 湲곕뒫 ?먯껜媛 怨좎옣??寃껋쿂??蹂댁???
  const canSplitPane = useCallback(
    (paneId: string) => hasSplitPanels || (paneTabs[paneId]?.tabs.length ?? 0) >= 1,
    [hasSplitPanels, paneTabs]
  );
  /* ?뚰겕?ㅽ럹?댁뒪 ?꾩껜 湲곗??쇰줈 ?대┛ ?명듃媛 0媛쒖씤吏 ???ㅼ젣 ?몃━???덈뒗 leaf留?湲곗??쇰줈 ?먯젙?쒕떎.
     paneTabs 媛앹껜 ?먯껜瑜?湲곗??쇰줈 ?섎㈃(?덉쟾 援ы쁽) ?몃━?먯꽌???대? ?쒓굅?먯?留?paneTabs?먮뒗 ?ㅻ쭔
     ?⑥? 怨좎븘 ??ぉ ?뚮Ц??"??씠 ?덈떎"怨??섎せ ?먯젙??Welcome 蹂대뱶 ???鍮??⑤꼸??蹂댁씠??臾몄젣媛
     ?덉뿀????Welcome 蹂대뱶????씠 ?꾨땲????empty state瑜?吏곸젒 洹몃┛????諛곗뿴???ㅼ뼱媛吏 ?딆쓬). */
  const isWorkspaceEmpty = useMemo(
    () => collectLeafIds(state.root).every((leafId) => (paneTabs[leafId]?.tabs.length ?? 0) === 0),
    [state.root, paneTabs]
  );

  /* ?쒖꽦 ?⑤꼸???쒖꽦 ?????꾩옱 ?명듃 (?곗륫 而⑦뀓?ㅽ듃 ?⑤꼸 湲곗?). start ??씠硫?null. */
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

  /* ?? ?몃뱾???????????????????????????????????????????? */

  /* ?쒖꽦 ??쓣 ?대떦 ?명듃濡?援먯껜 (?대? 媛숈? ?⑤꼸???대젮?덉쑝硫?洹???쓣 ?쒖꽦??. paneId瑜?諛쏆븘 "?쒕∼??
     ?⑤꼸 湲곗?" ?숈옉??媛숈? 濡쒖쭅?쇰줈 泥섎━?쒕떎 ???ъ씠?쒕컮 ?대┃? ??긽 ?꾩옱 ?쒖꽦 ?⑤꼸????곸쑝濡??몄텧. */
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

  /* ?ъ씠?쒕컮 ?명듃瑜???컮 ?곸뿭???쒕∼ ???대떦 ?⑤꼸??????쑝濡?異붽? (?대? ?대젮?덉쑝硫?洹????쒖꽦??.
     targetIndex瑜?二쇰㈃ 洹??꾩튂???쎌엯(??컮 ?쒕옒洹??몃뵒耳?댄꽣 ?꾩튂? ?쇱튂), ?놁쑝硫?留??앹뿉 異붽?. */
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

  /* ?⑤꼸???명듃瑜??щ뒗 怨듯넻 ?뺤콉 ??"援먯껜"??洹??⑤꼸??鍮꾩뼱?덉쓣 ?뚮쭔 ?곸슜?섍퀬, ?ㅼ젣 ?댁슜???덈뒗
     ?명듃媛 ?대젮 ?덉쑝硫?????쑝濡?異붽??쒕떎(湲곗〈 ?명듃瑜?臾댁“嫄?援먯껜?섏? ?딆쓬). "鍮꾩뼱?덈떎"??鍮??쒖옉
     ?붾㈃(start)肉??꾨땲??"+"濡?留??앹꽦??蹂몃Ц??鍮??명듃 ??룄 ?ы븿?쒕떎(鍮???= 援먯껜 ???.
     ?ъ씠?쒕컮 ?대┃, ??컮 ?쒕∼, ???대룞 紐⑤몢 ???뺤콉??怨듭쑀?쒕떎. */
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

  /* ?ъ씠?쒕컮?먯꽌 ?명듃 ?대┃ ???꾩옱 ?쒖꽦 ?⑤꼸??openNoteInPane ?뺤콉 ?곸슜 */
  const handleNoteClick = useCallback((noteId: string) => {
    openNoteInPane(primaryPaneId, noteId);
  }, [primaryPaneId, openNoteInPane]);

  /* ?명듃 ?먯깋湲??꾨줈 OS ?뚯씪???쒕옒洹??쒕∼?섎㈃ /import ?붾㈃怨??숈씪??
     uploadAndImportFile() 寃쎈줈濡?媛?몄삤湲곕? ?섑뻾?쒕떎(?꾩옱 ?좏깮???대뜑濡??ㅼ뼱媛?. */
  const handleDropFiles = useCallback((files: FileList) => {
    if (USE_MOCK_NOTES) {
      pushToast("紐??곗씠??紐⑤뱶?먯꽌???쒕옒洹??쒕∼ 媛?몄삤湲곕? 吏?먰븯吏 ?딆뒿?덈떎.", "err");
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
            pushToast(`${file.name} 媛?몄삤湲곗뿉 ?ㅽ뙣?덉뒿?덈떎.`, "err");
            continue;
          }
          const noteIds = job.createdNotes.map((item) => item.noteId).filter((id): id is string => !!id);
          if (noteIds.length > 0) {
            firstNoteId ??= noteIds[0];
            successCount += noteIds.length;
          }
        } catch (error) {
          pushToast(error instanceof Error ? error.message : `${file.name} 媛?몄삤湲곗뿉 ?ㅽ뙣?덉뒿?덈떎.`, "err");
        }
      }
      if (successCount > 0) {
        pushToast(`${successCount}媛??명듃瑜?媛?몄솕?댁슂`, "ok");
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: firstNoteId ?? undefined } }));
      }
    })();
  }, [selectedFolderId, pushToast]);

  /* 媛숈? ?⑤꼸 ?덉뿉????hold & drag濡??쒖꽌 蹂寃? activeTabId??嫄대뱶由ъ? ?딆쑝誘濡??쒖꽦 ???곹깭???좎??쒕떎. */
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

  /* ?⑤꼸 ?リ린 ??paneTabs ?뺣━ + 洹??⑤꼸???덈뜕 ??뱾??tabMode ??ぉ???④퍡 ?뺣━ */
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

  /* ?⑤꼸??留덉?留???씠 ?ロ옄 ??怨듯넻 ?뺤콉: ?붾㈃遺꾪븷 ?곹깭硫??⑤꼸 ?먯껜瑜??쒓굅(遺꾪븷 痍⑥냼),
     遺꾪븷???꾨땶 ?⑥씪 ?⑤꼸?대㈃ 洹??⑤꼸????쓣 鍮?諛곗뿴濡??섎룎由곕떎(??씠 ?꾨땲??Welcome
     蹂대뱶 ??empty state ??媛 蹂댁씠寃??? NotesWorkspace 理쒖긽???뚮뜑留?李멸퀬).
     "紐⑤몢 ?リ린"? "留덉?留???X濡??リ린"媛 ?숈씪???뺤콉??怨듭쑀?쒕떎. */
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

  /* ??쓣 ?ㅻⅨ ?⑤꼸濡?"?대룞"?쒕떎(蹂듭젣媛 ?꾨떂) ??Obsidian泥섎읆 媛숈? ?⑤꼸/?ㅻⅨ ?⑤꼸/遺꾪븷 援ъ“ ?대뵒?쒕뱺
     ?숈옉. 1) 紐⑺몴 ?⑤꼸??openNoteInPane ?뺤콉?쇰줈 ?명듃瑜????? 2) ?먮낯 ?⑤꼸?먯꽌 洹???쓣 ?쒓굅?쒕떎.
     ?먮낯 ?⑤꼸??留덉?留???씠?덉쑝硫?closePaneOrClearTabs ?뺤콉(遺꾪븷 痍⑥냼 ?먮뒗 鍮????곹깭 蹂듦?)???곕Ⅸ?? */
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

  /* ???명듃 ?몄뒪?댁뒪) 紐⑤뱶 蹂寃???tabId 湲곗??쇰줈 ??? 媛숈? ?⑤꼸 ?덉뿉?쒕룄 ??쭏?? 媛숈? ?명듃瑜?
     ?щ윭 ?⑤꼸???댁뼱??媛????몄뒪?댁뒪留덈떎 ?낅┰?곸쑝濡??좎??쒕떎. */
  const handleModeChange = useCallback((tabId: string, mode: EditMode) => {
    setTabMode((prev) => ({ ...prev, [tabId]: mode }));
  }, []);

  /* ?명듃 ?쒕ぉ 蹂寃??먮뵒???곷떒 ?쒕ぉ ?낅젰) ??notes ?곹깭 媛깆떊 (?ъ씠?쒕컮/???ㅻ뜑/而⑦뀓?ㅽ듃 利됱떆 諛섏쁺).
     媛숈? ?꾩튂???숈씪 ?쒕ぉ???대? ?덉쑝硫?而ㅻ컠?섏? ?딅뒗?????ъ씠?쒕컮 rename(handleRenameNoteFromExplorer)怨?
     ?숈씪??以묐났 寃?щ? 怨듭쑀?쒕떎. 嫄곕??섎㈃ notes ?곹깭媛 諛붾뚯? ?딆쑝誘濡?EditorPanel? note.title??
     洹몃?濡??ㅼ떆 蹂댁뿬以??먮룞?쇰줈 ?댁쟾 ?쒕ぉ?쇰줈 ?섎룎?꾧컙?? */
  const handleTitleChange = useCallback((noteId: string, newTitle: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (newTitle !== note.title && checkNoteDuplicate(newTitle, note.folderId)) {
      pushToast("?대? 媛숈? ?대쫫???명듃媛 ?덉뒿?덈떎.", "err");
      return;
    }
    const oldTitle = note.title;
    draftDirtyNoteIdsRef.current.add(noteId);

    // ???명듃媛 "???명듃"/"???명듃1" 媛숈? 湲곕낯 ?쒕ぉ?쇰줈 留뚮뱾?댁????쒓컙 graph optimistic
    // 罹먯떆(pending-created-note-cache.ts)?먮룄 洹??쒕ぉ??洹몃?濡?湲곕줉?쒕떎 ???ъ슜?먭? 怨㏓컮濡?
    // ?쒕ぉ??諛붽씀怨??쒕쾭 ???洹몃옒???덈줈怨좎묠??湲곕떎由ъ? ?딆? 梨?/graph濡??대룞?섎㈃, optimistic
    // ?몃뱶媛 ???쒕ぉ?쇰줈 蹂댁씠???먯씤?댁뿀?? ?쒕ぉ???ㅼ젣濡?諛붾??뚮쭏??罹먯떆???④퍡 媛깆떊??
    // notes[] state? ?닿툔?섏? ?딄쾶 ?쒕떎. ?꾪궎留곹겕濡?留뚮뱺 ?명듃(A?묪)???쇰컲 ???명듃??援щ텇 ?놁씠
    // ?곸슜?섍퀬, ???명듃媛 ?ㅻⅨ pending ??ぉ???꾪궎留곹겕 ?뚯뒪??ㅻ㈃ 洹?sourceTitle???④퍡
    // 留욎떠以???꾩옱 edge ?⑹꽦 ?먯껜??id 湲곗??대씪 ?숈옉???곹뼢? ?놁?留?罹먯떆 ?댁슜???쇨??섍쾶
    // ?좎??쒕떎).
    if (!USE_MOCK_NOTES && newTitle !== oldTitle) {
      updatePendingCreatedNoteTitle(noteId, newTitle);
    }

    // ?쒕ぉ???ㅼ젣濡?諛붾?寃쎌슦?먮쭔, 洹??대쫫??媛由ы궎???ㅻⅨ ?명듃???꾪궎留곹겕瑜????쒕ぉ?쇰줈
    // 媛깆떊?쒕떎 ??洹몃옒???명듃1???⑥? `[[?댁쟾?쒕ぉ]]`???대쫫 蹂寃??ㅼ뿉??洹몃?濡?A瑜?
    // 媛由ы궎怨??먮뵒??留곹겕/洹몃옒??紐⑤몢 title 臾몄옄??留ㅼ묶?쇰줈 議댁옱 ?щ?瑜??먮떒?섎?濡?, ?대쫫??
    // 諛붾??쒓컙 "議댁옱?섏? ?딅뒗 ?명듃" ?곹깭濡??딆뼱??蹂댁씠??臾몄젣媛 ?앷린吏 ?딅뒗?? ?곹뼢諛쏅뒗
    // ?명듃 紐⑸줉??癒쇱?(state 媛깆떊 ?꾩뿉) 怨꾩궛?대뫊??諛깃렇?쇱슫???????곸쓣 ?????덈떎.
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

    if (relinked.length > 0 && !USE_MOCK_NOTES) {
      // ?꾪궎留곹겕媛 媛깆떊???ㅻⅨ ?명듃?ㅻ룄 理쒖냼????踰덉? 諛깃렇?쇱슫?쒕줈 ??ν빐?? 洹몃옒??留덉씤?쒕㏊泥섎읆
      // ?쒕쾭?먯꽌 ?덈줈 ?명듃瑜??쎌뼱?ㅻ뒗 ?붾㈃?먯꽌???대쫫 蹂寃쎌씠 諛섏쁺?쒕떎(濡쒖뺄 state留?諛붽씀硫??대쾲
      // ?몄뀡???먮뵒???붾㈃?먮뒗 諛붾줈 蹂댁씠吏留? ?쒕쾭?먮뒗 ?덉쟾 ?띿뒪?멸? 洹몃?濡??⑤뒗??. ?ㅽ뙣?대룄
      // ?ъ슜?먭? 洹??명듃瑜??댁뼱 吏곸젒 ??ν븯硫??섎뒗 best-effort 蹂닿컯?대씪 議곗슜??臾댁떆?쒕떎.
      void Promise.allSettled(
        relinked.map(({ note: target, result }) => {
          const updated = { ...target, content: result.content };
          if (!target.persisted && target.id.startsWith("note_")) {
            return saveWorkspaceNoteDraft(updated).then(() => {
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
  }, [notes, checkNoteDuplicate, pushToast]);

  /* ?명듃 蹂몃Ц 蹂寃??먮뵒??onUpdate ?붾컮?댁뒪) ??notes ?곹깭 媛깆떊, ???꾪솚 ?꾩뿉???댁슜 ?좎? */
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

  /* ?명듃 ?꾩껜 ??댄룷洹몃옒??湲곕낯 湲瑗??ш린 諛곗쑉/?덈꺼蹂?媛쒕퀎 ?ш린/臾몄꽌 湲곕낯 湲瑗? 蹂寃????좏깮
     ?띿뒪???꾩슜 BubbleToolbar ?ㅼ젙怨?蹂꾧컻濡??명듃 ?⑥쐞濡???ν븳?? undefined硫?而ㅼ뒪?곕쭏?댁쭠
     ?댁젣(湲곕낯媛믪쑝濡??섎룎由ш린) */
  const handleTypographyChange = useCallback((noteId: string, next: MockNote["typography"]) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, typography: next, updatedAt: Date.now() } : n))
    );
  }, []);

  /* pane(遺꾪븷 ?⑤꼸) ?⑥쐞 Ctrl+Wheel ?먮뵒??酉?以???handleTypographyChange(?명듃 臾몄꽌 ?먯껜??
     ?쒖떇, notes[]?????? 蹂꾧컻濡?paneFontScale(?몄뀡 UI ?곹깭)留?媛깆떊?쒕떎. */
  const handlePaneFontScaleChange = useCallback((paneId: string, next: number) => {
    setPaneFontScale((prev) => (prev[paneId] === next ? prev : { ...prev, [paneId]: next }));
  }, []);

  /* D&D drop ??遺꾪븷???덉슜???곹깭?먯꽌留????⑤꼸????1媛쒕줈 珥덇린?뷀븳??
     ?⑥씪 ???⑥씪 ?⑤꼸 ?곹깭?먯꽌??EditorPanel 履쎌뿉??replace濡??섎젮蹂대궡怨??ш린濡??ㅼ? ?딅뒗?? */
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

  /* ??쓣 ?쒕옒洹명빐???ㅻⅨ ?⑤꼸??"蹂몃Ц"(zone)???⑥뼱?⑤젮 遺꾪븷??留뚮뱾 ?뚯쓽 ?대룞 踰꾩쟾 ??handleDrop怨?
     ?щ━ ??遺꾪븷??留뚮뱺 ???먮낯 ?⑤꼸?먯꽌 洹???쓣 ?쒓굅?쒕떎(蹂듭젣 諛⑹?). 遺꾪븷??湲덉???
     ?⑥씪 ???⑥씪 ?⑤꼸 ?곹깭?먯꽌???몄텧?섏? ?딅뒗?? ?먮낯??留덉?留???씠?덉쑝硫?
     closePaneOrClearTabs濡??먮낯 ?⑤꼸???뺣━?쒕떎(遺꾪븷 痍⑥냼 ?먮뒗 鍮????곹깭 蹂듦?).
     sourcePaneId === targetPaneId(?⑤꼸??1媛쒕퓧?????먭린 ?먯떊??蹂몃Ц???쒕∼??泥섏쓬?쇰줈 遺꾪븷?섎뒗
     媛???뷀븳 寃쎌슦)瑜?留됱? ?딅뒗????splitNodeAt? ?먮낯 leaf瑜?洹몃?濡??쒖そ children?쇰줈 蹂댁〈?섍퀬
     ??leaf留?異붽??섎?濡?lib/notes/paneUtils.ts), source===target?댁뼱???몃━/paneTabs 媛깆떊
     濡쒖쭅???숈씪?섍쾶 ?덉쟾?섍쾶 ?숈옉?쒕떎. ?덉쟾???ш린??臾댁“嫄?no-op 泥섎━?? ?⑤꼸??1媛쒕퓧???곹깭?먯꽌
     ??쓣 ?쒕옒洹명빐 遺꾪븷 誘몃━蹂닿린???⑥?留??ㅼ젣濡??쒕∼?섎㈃ ?꾨Т 蹂?붽? ?녿뒗 踰꾧렇媛 ?덉뿀?? */
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

  /* ???쒖꽦??(媛숈? ?⑤꼸 ?????꾪솚) */
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

  /* ???リ린 ???쒖꽦 ??쓣 ?レ쑝硫??몄젒 ??쑝濡??대룞. 留덉?留???씠硫?closePaneOrClearTabs ?뺤콉???곕Ⅸ??
     (?붾㈃遺꾪븷?대㈃ ?⑤꼸 ?쒓굅, ?⑥씪 ?⑤꼸?대㈃ 鍮??쒖옉 ?붾㈃?쇰줈 蹂듦?) ?????댁긽 ?リ린瑜?留됱? ?딅뒗?? */
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

  /* ???명듃 ?앹꽦 (?좏깮???대뜑 ?먮뒗 吏?뺣맂 ?대뜑 ?덉뿉 ?앹꽦), 吏?뺥븳 ?⑤꼸??????쑝濡??곕떎.
     title??二쇰㈃(?꾪궎留곹겕?먯꽌 ?앹꽦?섎뒗 寃쎌슦) 洹??쒕ぉ?쇰줈 諛붾줈 ?앹꽦?쒕떎. linkFromNoteId瑜?二쇰㈃
     (?꾪궎留곹겕濡??앹꽦??寃쎌슦) 濡쒓렇???ъ슜?먯뿉 ?쒗빐 諛깆뿏???명듃 id媛 ?뺤젙?섎뒗 利됱떆 洹??명듃?먯꽌
     ?덈줈 留뚮뱺 ?명듃濡쒖쓽 NoteLink瑜?留뚮뱾??留덉씤?쒕㏊ edge??諛섏쁺?쒕떎(寃뚯뒪?몃뒗 洹몃옒?꾧? 留??뚮뜑留덈떎
     draft markdown??[[..]]???ㅼ떆 ?뚯떛??edge瑜?留뚮뱾誘濡?蹂꾨룄 泥섎━媛 ?꾩슂 ?녿떎). */
  const createNote = useCallback((folderId: string | undefined, paneId: string, title?: string, linkFromNoteId?: string, favorite?: boolean) => {
    /* 寃뚯뒪???명듃 ?앹꽦 ?쒗븳 */
    if (isGuest && notes.length >= 10) {
      pushToast("泥댄뿕 紐⑤뱶?먯꽌???명듃瑜?理쒕? 10媛쒓퉴吏 ?앹꽦?????덉뒿?덈떎.", "err");
      return "";
    }
    /* 紐낆떆??title??二쇱뼱吏?寃쎌슦(?꾪궎留곹겕 ?앹꽦 ?????ъ슜?먯쓽 ?섎룄???대쫫?대?濡?湲곗〈泥섎읆 以묐났?대㈃
       留됰뒗?? 諛섎㈃ 湲곕낯媛?"???명듃")? ?먮룞 ?앹꽦媛믪씠??留됰뒗 ????먮룞 ?섎쾭留곹븳??
       ???명듃 ?????명듃1 ?????명듃2 ??泥섎읆 媛숈? ?꾩튂?먯꽌 鍮꾩뼱?덈뒗 ?대쫫??李얠븘 ?ъ슜?쒕떎. */
    let noteTitle: string;
    if (title) {
      if (checkNoteDuplicate(title, folderId ?? null)) {
        pushToast("媛숈? ?꾩튂???숈씪???대쫫???명듃媛 ?대? ?덉뒿?덈떎.", "err");
        return "";
      }
      noteTitle = title;
    } else {
      noteTitle = "???명듃";
      let suffix = 1;
      while (checkNoteDuplicate(noteTitle, folderId ?? null)) {
        noteTitle = `???명듃${suffix}`;
        suffix += 1;
      }
    }
    const newNote = makeBlankNote(folderId);
    newNote.title = noteTitle;
    if (favorite) newNote.favorite = true;
    const localNoteId = newNote.id;
    const newTabId = uid();

    // ?꾪궎留곹겕濡?留뚮뱾?덈뱺(linkFromNoteId ?덉쓬) ?쇰컲 "+ ???명듃"/?고겢由????명듃??linkFromNoteId
    // ?놁쓬) 愿怨꾩뾾?? ?꾩쭅 draft id???녿뒗 ???쒓컙(local id) sessionStorage??optimistic 湲곕줉??
    // ?④릿????/notes?먯꽌 留뚮뱺 ?명듃媛 ?쒕쾭 ??μ쓣 湲곕떎由ъ? ?딄퀬??蹂꾨룄濡??덈줈 留덉슫?몃릺??
    // /graph??利됱떆 諛섏쁺?섍쾶 ?섍린 ?꾪븿?대떎(lib/notes/pending-created-note-cache.ts 李멸퀬).
    // linkFromNoteId媛 ?덉쑝硫?sourceNoteId/sourceTitle???④퍡 湲곕줉??graph-screen??optimistic
    // edge(?명듃1?묨 ?곌껐??源뚯? ?⑹꽦?????덇쾶 ?쒕떎 ???놁쑝硫??쇰컲 ???명듃) node留?optimistic
    // 泥섎━?쒕떎.
    if (!USE_MOCK_NOTES) {
      addPendingCreatedNote({
        localKey: localNoteId,
        noteId: localNoteId,
        title: noteTitle,
        sourceNoteId: linkFromNoteId,
        sourceTitle: linkFromNoteId ? notes.find((n) => n.id === linkFromNoteId)?.title : undefined,
        createdAt: Date.now(),
      });
    }

    setNotes((prev) => [newNote, ...prev]);
    setPaneTabs((prev) => {
      const current = prev[paneId];
      const newTab: Tab = { id: newTabId, kind: "note", noteId: newNote.id };
      // ?꾩옱 ?쒖꽦 ??씠 ?녾굅??吏꾩쭨 Welcome), ?덉뼱??洹??명듃瑜?李얠쓣 ???녿뒗 "?쒕ぉ ?놁쓬" ?곹깭
      // (??젣???명듃瑜?媛由ы궎?????쇰㈃ ????쓣 ?놁뿉 異붽??섏? ?딄퀬 洹??먮━瑜??ㅼ젣 ?명듃濡?
      // 援먯껜?쒕떎 ??Welcome Board/源⑥쭊 ??뿉?????명듃瑜?留뚮뱾硫?????씠 ?곕줈 ?앷린怨?源⑥쭊 ???
      // 洹몃?濡??⑤뜕 臾몄젣媛 ?덉뿀??
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
          // ???명듃媛 ?꾪궎留곹겕 optimistic 罹먯떆(sessionStorage)??local id濡?湲곕줉???덉뿀?ㅻ㈃
          // ?ㅼ젣 noteId濡?媛깆떊?쒕떎 ???꾪궎留곹겕? 臾닿????쇰컲 ???명듃 ?앹꽦?먯꽌???꾨Т ??ぉ??
          // 李얠? 紐삵빐 議곗슜??no-op?대떎.
          updatePendingCreatedNoteId(localNoteId, draft.noteId);

          // ???명듃(諛⑷툑 draft id媛 ?뺤젙???명듃) ?먯껜媛, 議곌툑 ???꾪궎留곹겕濡??ㅻⅨ ?명듃瑜?留뚮뱾 ??
          // "?꾩쭅 local id??諛붾줈 ??ν븯吏 紐삵븳 ?뚯뒪 ?명듃"??????덈떎 ??洹몃옱?ㅻ㈃ pending ?쒖떆媛
          // ?⑥븘?덉쓣 ?뚮땲, ?댁젣 ?ㅼ젣 noteId媛 ?앷꼈?쇰땲 理쒖떊 蹂몃Ц?쇰줈 ??踰?????μ쓣 ?쒕룄?쒕떎.
          if (pendingWikiLinkFlushRef.current.has(localNoteId)) {
            pendingWikiLinkFlushRef.current.delete(localNoteId);
            const latestNote = latestSessionRef.current.notes.find((n) => n.id === draft.noteId);
            if (latestNote) {
              void persistNoteBestEffort(latestNote)
                .then((persisted) => {
                  if (persisted) draftDirtyNoteIdsRef.current.delete(draft.noteId);
                })
                .catch((error) => warnWikiLinkFailure("pending source note ????ъ떆???ㅽ뙣", error));
            }
          }

          // ???명듃 ?먯떊???꾪궎留곹겕濡?諛⑷툑 留뚮뱾?댁쭊 ???명듃(target)?쇰㈃, "吏湲??쒖꽦 ??씤 ?숈븞留?
          // ??ν븯??draft autosave effect??湲곕?吏 ?딄퀬 title/content瑜?利됱떆 ?낅┰?곸쑝濡?
          // ??ν븳??????洹몃윭硫??ъ슜?먭? ????씠 ?대━?먮쭏??諛붾줈 ?ㅻⅨ 怨녹쑝濡??대룞?덉쓣 ????
          // ?명듃媛 draft id留?諛쒓툒諛쏄퀬 ?ㅼ젣 ?댁슜? ?쒕쾭????踰덈룄 ??λ릺吏 紐삵븳 梨??쒕ぉ??鍮?
          // ?곹깭濡? ?⑥븘 "?щ씪吏?寃껋쿂?? 蹂댁씠嫄곕굹 洹몃옒?꾩뿉???섑??섏? ?딅뒗?? ?쒕쾭 NoteLink(洹몃옒??
          // edge) ?앹꽦? ????μ씠 ?앸궃(?먮뒗 ?ㅽ뙣?? ?ㅼ뿉 ?쒕룄?? 理쒖냼?????명듃媛 ?ㅼ젣濡?議댁옱?섎뒗
          // ?곹깭?먯꽌 留곹겕瑜?嫄몃룄濡??쒖꽌瑜?留욎텣??
          const createdNoteSnapshot = { ...newNote, id: draft.noteId };
          const persistCreatedNote = USE_MOCK_NOTES
            ? Promise.resolve(true)
            : persistNoteBestEffort(createdNoteSnapshot)
                .then((persisted) => {
                  if (persisted) draftDirtyNoteIdsRef.current.delete(draft.noteId);
                  return persisted;
                })
                .catch((error) => {
                  warnWikiLinkFailure("?덈줈 留뚮뱺 ?명듃 ????ㅽ뙣", error);
                  return false;
                });

          void persistCreatedNote.then(() => {
            // ?뚯뒪 ?명듃媛 ?꾩쭅 濡쒖뺄(誘명솗?? id硫?洹??명듃 ?먯껜媛 ?앹꽦 以묒씠?쇰뒗 ?살씠????洹??명듃??
            // local id瑜?key濡?pending ?깅줉?대몢硫? 洹??명듃媛 ?먭린 draft id瑜??뺤젙 吏볥뒗 ?쒓컙(諛붾줈
            // ?꾨옒 pendingWikiLinkEdgeRef ?뺤씤 釉붾줉)???ㅼ젣 sourceNoteId濡?留곹겕 ?앹꽦???ъ떆?꾪븳??
            if (linkFromNoteId && linkFromNoteId.startsWith("note_")) {
              void createWorkspaceNoteLink(linkFromNoteId, {
                targetNoteId: draft.noteId,
                targetTitle: noteTitle,
                createIfMissing: false,
              })
                .then(() => removePendingCreatedNoteByNoteId(draft.noteId))
                .catch((error) => warnWikiLinkFailure("NoteLink ?앹꽦 ?ㅽ뙣(source/target 紐⑤몢 ?뺤젙??寃쎈줈)", error));
            } else if (linkFromNoteId) {
              pendingWikiLinkEdgeRef.current.set(linkFromNoteId, {
                targetNoteId: draft.noteId,
                targetTitle: noteTitle,
              });
            }
          });

          // ???명듃(諛⑷툑 draft id媛 ?뺤젙???명듃) ?먯떊??"?꾩쭅 local id??留곹겕瑜?紐?嫄몄뿀??
          // ?뚯뒪 ?명듃"濡?pending ?깅줉???덉뿀?ㅻ㈃, ?댁젣 ?ㅼ젣 sourceNoteId媛 ?앷꼈?쇰땲 留곹겕 ?앹꽦??
          // ?ъ떆?꾪븳?? source/target ?대뒓 履쎌씠 ??쾶 ?뺤젙?섎뱺 ??긽 ????吏?????꾨옒) 以?
          // ?섎굹?먯꽌 ?≫엺??
          if (pendingWikiLinkEdgeRef.current.has(localNoteId)) {
            const edge = pendingWikiLinkEdgeRef.current.get(localNoteId)!;
            pendingWikiLinkEdgeRef.current.delete(localNoteId);
            void createWorkspaceNoteLink(draft.noteId, {
              targetNoteId: edge.targetNoteId,
              targetTitle: edge.targetTitle,
              createIfMissing: false,
            })
              .then(() => removePendingCreatedNoteByNoteId(edge.targetNoteId))
              .catch((error) => warnWikiLinkFailure("NoteLink ?앹꽦 ?ㅽ뙣(pending edge ?ъ떆??寃쎈줈)", error));
          }

          // 利먭꺼李얘린 ?곸뿭?먯꽌 吏곸젒 留뚮뱺 猷⑦듃 ?명듃???먮룞 利먭꺼李얘린 ??draft id媛 ?뺤젙???ㅼ뿉??
          // ?ㅼ젣 noteId瑜??????덉쑝誘濡??ш린???몄텧?쒕떎(濡쒖뺄 favorite:true???대? makeBlankNote
          // 吏곹썑 諛섏쁺???붾㈃??泥섏쓬遺??蹂꾩씠 蹂댁씤??.
          if (favorite) {
            void putFavorite("NOTE", draft.noteId, true).catch(() => {});
          }
        })
        .catch((error) => {
          setLoadError(error instanceof Error ? error.message : "???명듃 ?꾩떆???ID瑜?諛쒓툒諛쏆? 紐삵뻽?듬땲??");
        });
    }

    return newNote.id;
  }, [isGuest, notes, checkNoteDuplicate, pushToast, onActiveNoteChange]);

  /* ?ъ씠?쒕컮 "+ ???명듃" 踰꾪듉 ???꾩옱 ?좏깮???대뜑 ?덉뿉, ?쒖꽦 ?⑤꼸??????쑝濡??앹꽦.
     favorite=true??利먭꺼李얘린 ?곸뿭??猷⑦듃 ?앹꽦 踰꾪듉?먯꽌留??대떎(?뺤콉: 利먭꺼李얘린 ?곸뿭?먯꽌 吏곸젒
     留뚮뱺 猷⑦듃 ?명듃/?대뜑???먮룞 利먭꺼李얘린, 利먭꺼李얘린 ?대뜑 ?덉쓽 ?섏쐞 ??ぉ? ?먮룞 利먭꺼李얘린?섏? ?딆쓬). */
  const handleNewNote = useCallback((folderId?: string, favorite?: boolean) => {
    createNote(folderId, primaryPaneId, undefined, undefined, favorite);
  }, [createNote, primaryPaneId]);

  /* "???뚯씪 ?앹꽦?섍린" / Ctrl+N ????긽 ????쑝濡?異붽??쒕떎. ??씠 0媛?Welcome ?곹깭)???⑤꼸?대㈃
     createNote媛 鍮???諛곗뿴??泥???쓣 ?ｋ뒗 寃껉낵 ?숈씪?섍쾶 ?숈옉???먯뿰?ㅻ읇寃?Welcome???댁젣?쒕떎. */
  /* "???명듃 ?앹꽦?섍린"(Welcome Screen 踰꾪듉 / Ctrl+N)???ъ씠?쒕컮?먯꽌 ?좏깮???대뜑? 臾닿??섍쾶
     ??긽 猷⑦듃/誘몃텇瑜섎줈 留뚮뱺?????대뜑 而⑦뀓?ㅽ듃瑜??곕씪媛??"?명듃 ?먯깋湲??곷떒 + ???명듃"
     踰꾪듉(handleNewNote)怨쇰뒗 ?섎룄?곸쑝濡??ㅻⅨ ?뺤콉?대떎. */
  const requestNewNote = useCallback((paneId: string) => {
    createNote(undefined, paneId);
  }, [createNote]);

  /* ??諛붿쓽 "+" 踰꾪듉 ???대떦 ?⑤꼸??利됱떆 ??鍮? ?명듃瑜?留뚮뱺??
     requestNewNote(Ctrl+N怨??숈씪 ?뺤콉)瑜?洹몃?濡??ъ궗?⑺븳?? */
  const handleNewTab = useCallback((paneId: string) => {
    requestNewNote(paneId);
  }, [requestNewNote]);

  /* ???リ린 蹂?? ?고겢由?硫붾돱??"?ㅻⅨ ???リ린" ??怨좎젙????? 蹂댁〈 */
  const handleCloseOtherTabs = useCallback((paneId: string, keepTabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const keep = current.tabs.filter((t) => t.id === keepTabId || (t.kind === "note" && t.pinned));
      return { ...prev, [paneId]: { tabs: keep, activeTabId: keepTabId } };
    });
    setState((prev) => ({ ...prev, activeId: paneId }));
  }, []);

  /* "紐⑤몢 ?リ린" ??closePaneOrClearTabs? ?숈씪???뺤콉(?붾㈃遺꾪븷?대㈃ ?⑤꼸 ?쒓굅, ?⑥씪 ?⑤꼸?대㈃
     /notes ?쒖옉 ?붾㈃ ?????뚯씪/???대뜑 ?앹꽦?섍린 ???쇰줈 蹂듦?)??洹몃?濡??ъ궗?⑺븳?? */
  const handleCloseAllTabs = useCallback((paneId: string) => {
    closePaneOrClearTabs(paneId);
  }, [closePaneOrClearTabs]);

  /* ??怨좎젙/怨좎젙 ?댁젣 ?좉? */
  const handleTogglePinTab = useCallback((paneId: string, tabId: string) => {
    setPaneTabs((prev) => {
      const current = prev[paneId];
      if (!current) return prev;
      const newTabs = current.tabs.map((t) => (t.id === tabId && t.kind === "note" ? { ...t, pinned: !t.pinned } : t));
      return { ...prev, [paneId]: { ...current, tabs: newTabs } };
    });
  }, []);

  /* ?고겢由?硫붾돱??"?곗륫 遺꾪븷"/"?섎떒 遺꾪븷" ??遺꾪븷???덉슜???곹깭?먯꽌留??대떦 ??쓽 ?명듃瑜?
     ???⑤꼸??洹몃?濡??곕떎 */
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

  /* ?ъ씠?쒕컮 ?명듃 ?쒕옒洹??쒖옉/醫낅즺 ??蹂몃Ц ?쒕∼=援먯껜, ??컮 ?쒕∼=??텛媛濡?援щ텇?쒕떎 (EditorPanel/TabBar 李멸퀬) */
  const handleSidebarDragStart = useCallback((noteId: string) => setDragPayload({ kind: "note", noteId }), []);
  const handleDragEnd = useCallback(() => setDragPayload(null), []);

  /* ??Hold & Drag ?쒖옉 ??蹂몃Ц ?쒕∼? 湲곗〈 遺꾪븷 硫붿빱?덉쬁(zone), ??컮 ?쒕∼? 媛숈? ?⑤꼸 ???ъ젙??*/
  const handleTabDragStart = useCallback((paneId: string, tabId: string, noteId: string) => {
    setDragPayload({ kind: "tab", paneId, tabId, noteId });
  }, []);

  /* 諛⑹뼱???덉쟾留? ?쒕∼???대뼡 onDrop ?몃뱾?ъ뿉???우? ?딄굅???? ?⑤꼸 諛붽묑/?ъ씠?쒕컮濡??꾨줈 ?쒕∼,
     媛숈? ?먮━濡쒖쓽 no-op ?대룞泥섎읆 釉뚮씪?곗?媛 dragend瑜??덉젙?곸쑝濡??섏? ?딅뒗 寃쎈줈) dragPayload媛
     ?곴뎄???⑥쑝硫?蹂몃Ц ??DnD ?ㅻ쾭?덉씠媛 ?щ씪吏吏 ?딆? 梨?怨꾩냽 ?대┃??媛濡쒖콌?????먮뵒?곕? ??
     踰??대┃?대룄 洹?泥??대┃???ㅻ쾭?덉씠??留됲? ?꾨Т 諛섏쓳???녾퀬, ??踰덉㎏ ?대┃(?붾툝?대┃)?먯빞
     ?ㅼ젣 ?먮뵒?곗뿉 ?우븘 ?ъ빱?ㅺ? ?≫엳??寃껋쿂??蹂댁씠???먯씤?대떎. dragend/drop ?몄뿉 blur/tab
     ?꾪솚?먯꽌????踰????뺣━?쒕떎.
     二쇱쓽: pointerup/pointercancel? ?ш린 ?ｌ쑝硫????쒕떎 ?????ъ씠?쒕컮 ?명듃???ㅼ씠?곕툕 HTML5
     ?쒕옒洹멸? ?쒖옉?섎뒗 ?쒓컙(dragstart) 釉뚮씪?곗?媛 洹??ъ씤?곗쓽 罹≪쿂瑜?OS ?덈꺼 ?쒕옒洹몃줈 ?섍린硫?
     pointercancel???섎뒗 寃??쒖? ?숈옉?대떎(?쒕옒洹?"?ㅽ뙣"媛 ?꾨땲??"?쒖옉" ?좏샇). ??由ъ뒪?덇?
     ?덉쑝硫?dragPayload媛 set?섏옄留덉옄(?ㅼ쓬 tick ?꾩뿉) 怨㏓컮濡?null濡?由ъ뀑?? 蹂몃Ц ??遺꾪븷/援먯껜
     ?ㅻ쾭?덉씠媛 ?④린???꾩뿉 ?щ씪?몄꽌 ?쒕∼???ㅻ쾭?덉씠??onDrop???꾨땲???먮뵒??
     contentEditable??釉뚮씪?곗? 湲곕낯 ?띿뒪???쒕∼?쇰줈 ?덉뼱 ?ㅼ뼱媛붾떎 ????쓣 ?먮뵒?곕줈 ?쒕옒洹명븯硫?
     ?붾㈃遺꾪븷 ???noteId ?띿뒪?멸? 洹몃?濡??쎌엯?섎뜕 ?뚭????먯씤?댁뿀?? */
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

  /* "?뚯씪濡??대룞?섍린" / Ctrl+O */
  const requestQuickSwitcher = useCallback((paneId: string, tabId: string) => {
    setQuickSwitcher({ paneId, tabId });
  }, []);

  const handleQuickSwitcherSelect = useCallback((noteId: string) => {
    if (!quickSwitcher) return;
    const { paneId, tabId } = quickSwitcher;
    const tabsState = paneTabs[paneId];
    const active = tabsState?.tabs.find((t) => t.id === tabId);
    if (!active) {
      // Welcome ?곹깭(??0媛??먯꽌 ??Quick Switcher ??洹??⑤꼸??泥???쑝濡??곕떎.
      handleReplaceActiveTab(paneId, noteId);
    } else {
      openNoteInPane(paneId, noteId);
    }
    setQuickSwitcher(null);
  }, [quickSwitcher, paneTabs, handleReplaceActiveTab, openNoteInPane]);

  /* ?대뜑 ?앹꽦 ??猷⑦듃(parentFolderId=null) ?먮뒗 ?뱀젙 ?대뜑 ?섏쐞???몃씪?몄쑝濡?異붽? */
  /* ?대뜑 ?앹꽦/?대쫫蹂寃??대룞/??젣??紐⑤몢 諛깆뿏??/api/v1/folders???ㅼ젣濡?諛섏쁺?댁빞 ?쒕떎 ???명듃?
     ?щ━ ?대뜑??actor ?쒖빟???놁뼱 guest??留뚮뱾 ???덇퀬, 洹몃옒??寃뚯뒪???대뜑媛 ?뚯썝媛???꾩뿉??
     ?밴퀎?섎젮硫?claim ??workspaceService.reassignGuestFolders) 泥섏쓬遺??Postgres???덉뼱??
     ?쒕떎. ?ㅽ뙣?섎㈃ ?좎뒪?몃쭔 ?꾩슦怨?濡쒖뺄 ?곹깭??洹몃?濡??붾떎(?붾㈃?먯꽌留??щ씪吏????諛⑹?). */
  const handleCreateFolder = useCallback((parentFolderId: string | null, name: string, favorite?: boolean) => {
    /* 寃뚯뒪???대뜑 ?앹꽦 ?쒗븳 */
    if (isGuest && folders.length >= 10) {
      pushToast("泥댄뿕 紐⑤뱶?먯꽌???대뜑瑜?理쒕? 10媛쒓퉴吏 ?앹꽦?????덉뒿?덈떎.", "err");
      return;
    }
    /* 媛숈? depth ?숈씪 ?대쫫 ?대뜑 以묐났 諛⑹? */
    if (checkFolderDuplicate(name, parentFolderId)) {
      pushToast("媛숈? ?꾩튂???숈씪???대쫫???대뜑媛 ?대? ?덉뒿?덈떎.", "err");
      return;
    }
    if (USE_MOCK_NOTES) {
      setFolders((prev) => [...prev, { id: `folder-${uid()}`, name, parentFolderId, favorite: favorite || undefined }]);
      return;
    }
    void createWorkspaceFolder(name, parentFolderId)
      .then((created) => {
        setFolders((prev) => [...prev, { ...workspaceFolderToMock(created), favorite: favorite || undefined }]);
        // 利먭꺼李얘린 ?곸뿭?먯꽌 吏곸젒 留뚮뱺 猷⑦듃 ?대뜑???먮룞 利먭꺼李얘린.
        if (favorite) void putFavorite("FOLDER", created.folderId, true).catch(() => {});
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "?대뜑瑜?留뚮뱾吏 紐삵뻽?듬땲??", "err");
      });
  }, [isGuest, folders, checkFolderDuplicate, pushToast]);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder && checkFolderDuplicate(newName, folder.parentFolderId, folderId)) {
      pushToast("媛숈? ?꾩튂???숈씪???대쫫???대뜑媛 ?대? ?덉뒿?덈떎.", "err");
      return;
    }
    if (USE_MOCK_NOTES) {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f)));
      return;
    }
    void patchWorkspaceFolder(folderId, { name: newName })
      .then((updated) => {
        // 媛숈? depth???대? 媛숈? ?대쫫???덉쑝硫??쒕쾭媛 "?대쫫 2"泥섎읆 ?먮룞?쇰줈 諛붽퓭???묐떟?쒕떎 ??
        // ?낅젰媛?newName)???꾨땲???ㅼ젣濡???λ맂 ?대쫫(updated.name)???붾㈃??諛섏쁺?댁빞 ?쒕떎.
        setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: updated.name } : f)));
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "?대뜑 ?대쫫??諛붽씀吏 紐삵뻽?듬땲??", "err");
      });
  }, [folders, checkFolderDuplicate, pushToast]);

  const handleChangeFolderColor = useCallback((folderId: string, color: string) => {
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, color } : f)));
  }, []);

  /* 利먭꺼李얘린 ?ㅼ젙/?댁젣 ???숆??곸쑝濡?癒쇱? 諛섏쁺?섍퀬, 諛깆뿏??PUT???ㅽ뙣?섎㈃ ?먮옒 媛믪쑝濡??섎룎由щŉ
     ?좎뒪?몃줈 ?뚮┛?? USE_MOCK_NOTES(?쒖닔 濡쒖뺄 ?곕え, 諛깆뿏???놁쓬) 紐⑤뱶???ㅻⅨ ?대뜑/?명듃 CRUD?
     ?숈씪?섍쾶 濡쒖뺄 ?곹깭留?諛붽씀怨??ㅽ듃?뚰겕 ?몄텧 ?먯껜瑜?嫄대꼫?대떎. */
  const handleToggleFolderFavorite = useCallback((folderId: string) => {
    const current = folders.find((f) => f.id === folderId)?.favorite ?? false;
    const next = !current;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, favorite: next } : f))
    );
    if (USE_MOCK_NOTES) return;
    void putFavorite("FOLDER", folderId, next).catch((error) => {
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, favorite: current } : f)));
      pushToast(error instanceof Error ? error.message : "利먭꺼李얘린瑜???ν븯吏 紐삵뻽?듬땲??", "err");
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
      pushToast(error instanceof Error ? error.message : "利먭꺼李얘린瑜???ν븯吏 紐삵뻽?듬땲??", "err");
    });
  }, [notes, pushToast]);

  /* ?명듃 ??젣(?? ??媛숈? ?명듃媛 ?щ윭 ?⑤꼸??以묐났?쇰줈 ?대젮 ?덉쓣 ???덉쑝誘濡??섎룄??湲곕뒫) 紐⑤뱺
     ?⑤꼸???묒뼱 ?대떦 ?명듃瑜?媛由ы궎????쓣 ?꾨? ?쒓굅?쒕떎. ???쒓굅濡?0媛쒓? ???⑤꼸?: 遺꾪븷??
     ?쇰?硫?closeNode濡??몃━?먯꽌 ?쒓굅(遺꾪븷 痍⑥냼), ?좎씪?섍쾶 ?⑥? leaf硫?tabs:[]濡?鍮꾩썙 Welcome
     蹂대뱶媛 蹂댁씠寃??쒕떎(closePaneOrClearTabs? ?숈씪???뺤콉). ?대뜑 cascade ??젣泥섎읆 ?щ윭 ?명듃瑜?
     ??踰덉뿉 吏???????⑥닔瑜??명듃留덈떎 ?곕줈 ?몄텧?섎㈃ 留??몄텧??媛숈?(stale) paneTabs/state
     ?대줈?瑜?遊먯꽌 ??踰덉㎏ ?몄텧遺??泥?踰덉㎏ ?몄텧??蹂寃쎌쓣 紐?蹂대뒗 臾몄젣媛 ?덉뼱, ??긽 noteId
     吏묓빀 ?꾩껜瑜???踰덉뿉 諛쏆븘 ??踰덉쓽 ?쇨???怨꾩궛?쇰줈 泥섎━?쒕떎. */
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
        // ?좎씪?섍쾶 ?⑥? leaf???レ쓣 ???녿뒗 寃쎌슦 ????젣???명듃瑜?怨꾩냽 媛由ы궎吏 ?딅룄濡?鍮꾩썙?붾떎
        // (Welcome 蹂대뱶 ?꾪솚? paneTabs 湲곗??대씪 ?ш린??鍮꾩슦吏 ?딆븘???붾㈃??臾몄젣?놁?留? ?ㅼ쓬
        // ?덈줈怨좎묠源뚯? root??二쎌? noteId媛 ?⑥븘?덈뒗 ?곹깭瑜?留됰뒗??.
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

  /* ?명듃 ??젣 ??諛깆뿏??DELETE /api/v1/notes/{noteId}?mode=trash瑜?癒쇱? ?몄텧?섍퀬, ?깃났?댁빞留?
     ???⑤꼸/notes瑜??뺣━?쒕떎. ?쒕쾭????踰덈룄 ?우? ?딆? ?쒖닔 濡쒖뺄 ?명듃(?꾩쭅 draft id??諛쒓툒諛쏆?
     紐삵븳 "note-"濡??쒖옉?섎뒗 ?꾩떆 id)???몄텧??寃??놁쑝??諛붾줈 ?뺣━?쒕떎. ?ㅽ뙣?섎㈃ ?좎뒪?몃쭔
     ?꾩슦怨??붾㈃? 洹몃?濡??붾떎(?ㅽ뙣?대룄 ?붾㈃?먯꽌留??щ씪吏????諛⑹?). */
  const handleDeleteNote = useCallback((noteId: string) => {
  void (async () => {
    const desktopVault = await shouldUseDesktopVault();
    if (USE_MOCK_NOTES || (!desktopVault && !noteId.startsWith("note_"))) {
      applyLocalNoteDeletion(noteId);
      return;
    }
    await deleteWorkspaceNote(noteId, "trash");
    applyLocalNoteDeletion(noteId);
  })().catch((error) => {
    pushToast(error instanceof Error ? error.message : "노트를 삭제하지 못했습니다.", "err");
  });
}, [applyLocalNoteDeletion, pushToast]);

  /* ?대뜑 ??젣 ???섏쐞 ?대뜑/?명듃瑜?遺紐⑤줈 ?밴꺽?섏? ?딄퀬 ?꾨? cascade濡???젣?쒕떎(orphan folder/
     note瑜?留뚮뱾吏 ?딄린 ?꾪븳 ?뺤콉). 諛깆뿏?쒓? Postgres 履??대뜑 ?먯껜 + ?대? flush???명듃)??
     cascade ??젣??沅뚯쐞 ?덈뒗 泥섎━瑜??섍퀬, 洹??묐떟?쇰줈 諛쏆? ?대뜑 id 吏묓빀??湲곗??쇰줈 ?꾨줎?멸?
     濡쒖뺄 notes/folders/??뿉?쒕룄(?꾩쭅 draft ?④퀎??諛깆뿏?쒓? 紐⑤Ⅴ???명듃源뚯? ?ы븿) ?뺣━?쒕떎. */
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
        pushToast(error instanceof Error ? error.message : "?대뜑瑜???젣?섏? 紐삵뻽?듬땲??", "err");
      });
  }, [folders, notes, applyLocalNotesDeletion, pushToast]);

  /* ?ㅼ쨷 ??젣 ???먯깋湲곗뿉??Ctrl/Shift ?ㅼ쨷 ?좏깮 ??Delete ???먮뒗 而⑦뀓?ㅽ듃 硫붾돱濡??몄텧?쒕떎.
     ?대뜑 ??젣??cascade(?섏쐞 ?ы븿)?대?濡?癒쇱? ?대뜑瑜?泥섎━??以묐났 泥섎━瑜?諛⑹??쒕떎.
     ?명듃??handleDeleteNote(?④굔)? ?숈씪???뺤콉?쇰줈 泥섎━?쒕떎 ???쒕쾭???대? 議댁옱?섎뒗 ?명듃("note_"
     ?묐몢????DELETE API媛 ?깃났??寃껊쭔 濡쒖뺄?먯꽌 吏?대떎(?댁쟾?먮뒗 API ?몄텧??fire-and-forget?쇰줈
     ?섍퀬 ?ㅽ뙣 ?щ?? 臾닿??섍쾶 濡쒖뺄?먯꽌 癒쇱? 吏?뚮쾭?ㅼ꽌, ??젣媛 ?ㅽ뙣?대룄 ?붾㈃?먯꽌???щ씪議뚮떎媛
     ?덈줈怨좎묠?섎㈃ ?섏궡?꾨굹??寃껋쿂??蹂댁씠??遺덉씪移섍? ?덉뿀??. ?꾩쭅 ?쒕쾭???녿뒗 濡쒖뺄 ?꾩슜 珥덉븞
     ?명듃??諛붾줈 吏?대떎. */
  const handleDeleteMultiple = useCallback((noteIds: string[], folderIds: string[]) => {
    /* ?대뜑瑜?癒쇱? ??젣(cascade濡??섏쐞 ?명듃/?대뜑媛 ?④퍡 ?щ씪吏誘濡??쒖꽌媛 以묒슂) */
    for (const fid of folderIds) {
      handleDeleteFolder(fid);
    }
    if (noteIds.length === 0) return;

    void (async () => {
  const desktopVault = await shouldUseDesktopVault();
  if (USE_MOCK_NOTES) {
    applyLocalNotesDeletion(new Set(noteIds));
    return;
  }

  const localOnlyIds = desktopVault ? [] : noteIds.filter((id) => !id.startsWith("note_"));
  const serverIds = desktopVault ? noteIds : noteIds.filter((id) => id.startsWith("note_"));
  if (localOnlyIds.length > 0) applyLocalNotesDeletion(new Set(localOnlyIds));
  if (serverIds.length === 0) return;

  const results = await Promise.allSettled(serverIds.map((nid) => deleteWorkspaceNote(nid, "trash")));
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
})().catch((error) => {
  pushToast(error instanceof Error ? error.message : "노트를 삭제하지 못했습니다.", "err");
});
  }, [handleDeleteFolder, applyLocalNotesDeletion, pushToast]);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
  }, []);

  /* ?먯깋湲곗뿉???명듃 ?대쫫 蹂寃?(以묐났 泥댄겕 ?ы븿) */
  const handleRenameNoteFromExplorer = useCallback((noteId: string, newTitle: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    if (checkNoteDuplicate(newTitle, note.folderId)) {
      pushToast("媛숈? ?꾩튂???숈씪???대쫫???명듃媛 ?대? ?덉뒿?덈떎.", "err");
      return;
    }
    handleTitleChange(noteId, newTitle);
  }, [notes, checkNoteDuplicate, handleTitleChange, pushToast]);

  /* ?명듃 ?먯깋湲??쒕옒洹몄븻?쒕엻 ???명듃瑜??대뜑/猷⑦듃濡??대룞, ?먮뒗 媛숈? ?덈꺼?먯꽌 ?쒖꽌 蹂寃?
     ?대뜑 ?대룞(handleMoveFolderToParent)怨??щ━ ???몃뱾?щ뒗 濡쒖뺄 notes state留?媛깆떊?섍퀬 ?쒕쾭?먮뒗
     諛섏쁺?섏? ?딆븘?? 寃뚯뒪???곹깭?먯꽌 ?명듃瑜??대뜑 ?덉쑝濡???릿 ???댁슜? ????嫄대뱶由ш퀬) ?덈줈怨좎묠
     ?섍굅??濡쒓렇??claim?섎㈃ ?쒕쾭(Redis draft/Postgres)?먮뒗 ?대룞 ??folderId媛 洹몃?濡??⑥븘?덉뼱
     猷⑦듃濡??먮뒗 ?먮옒 ?대뜑濡? ?섎룎?꾧? 蹂댁씠??踰꾧렇媛 ?덉뿀????draft autosave effect??activeNote??
     title/content 蹂?붿뿉留?諛섏쓳??2073踰덉㎏ 以?洹쇱쿂 deps) folderId留?諛붾?諛깃렇?쇱슫???명듃???덈?
     ????좏샇瑜?紐?諛쏅뒗?? ?대뜑 ?대룞怨??숈씪?섍쾶 ?대룞 利됱떆 best-effort濡??쒕쾭?먮룄 諛섏쁺?쒕떎. */
  const handleMoveNoteToFolder = useCallback((noteId: string, targetFolderId: string | null) => {
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      const titleConflict = notes.some(
        (n) => n.id !== noteId && (n.folderId ?? null) === (targetFolderId ?? null) && n.title.trim() === note.title.trim()
      );
      if (titleConflict) {
        pushToast("?대룞???꾩튂???숈씪???대쫫???명듃媛 ?대? ?덉뒿?덈떎.", "err");
        return;
      }
    }
    setNotes((prev) => moveNoteIntoFolder(prev, noteId, targetFolderId));
    if (USE_MOCK_NOTES || !note) return;
    const movedNote = { ...note, folderId: targetFolderId ?? undefined };
    const persistMove = movedNote.persisted
      ? updateWorkspaceNoteMetadata(movedNote)
      : movedNote.id.startsWith("note_")
        ? saveWorkspaceNoteDraft(movedNote)
        : null;
    if (persistMove) {
      void persistMove.catch((error) => {
        pushToast(error instanceof Error ? error.message : "?명듃 ?대룞????ν븯吏 紐삵뻽?듬땲??", "err");
      });
    }
  }, [notes, pushToast]);

  const handleReorderNote = useCallback((noteId: string, referenceNoteId: string, position: "before" | "after") => {
    setNotes((prev) => reorderNoteRelativeTo(prev, noteId, referenceNoteId, position));
  }, []);

  /* ?대뜑 ?대룞 ???먭린 ?먯떊/?섏쐞 ?대뜑濡쒖쓽 ?대룞? folderDnd??canFolderMoveUnder媛 李⑤떒(null 諛섑솚 ??臾댁떆) */
  const handleMoveFolderToParent = useCallback((folderId: string, targetParentId: string | null) => {
    /* ?대룞 紐⑹쟻吏??媛숈? ?대쫫???뺤젣 ?대뜑媛 ?덉쑝硫?留됰뒗??*/
    if (checkFolderDuplicate(folders.find((f) => f.id === folderId)?.name ?? "", targetParentId, folderId)) {
      pushToast("?대룞???꾩튂???숈씪???대쫫???대뜑媛 ?대? ?덉뒿?덈떎.", "err");
      return;
    }
    const next = moveFolderUnder(folders, folderId, targetParentId);
    if (!next) return;
    if (USE_MOCK_NOTES) {
      setFolders(next);
      return;
    }
    // 諛깆뿏??FolderPatchRequest??parentFolderId媛 null?대㈃ "蹂寃??놁쓬"?쇰줈 蹂닿퀬, 鍮?臾몄옄?댁씠硫?
    // "猷⑦듃濡??대룞(null)"?쇰줈 ?뺢퇋?뷀븳????洹몃옒??猷⑦듃濡???만 ?뚮뒗 null???꾨땲??""瑜?蹂대궡???쒕떎.
    void patchWorkspaceFolder(folderId, { parentFolderId: targetParentId ?? "" })
      .then((updated) => {
        // ??릿 ?꾩튂(紐⑹쟻吏)??媛숈? ?대쫫???대? ?덉쑝硫??쒕쾭媛 ?대쫫???먮룞?쇰줈 諛붽퓭???묐떟?쒕떎 ??
        // 洹?寃쎌슦瑜?諛섏쁺???쒖떆 ?대쫫???④퍡 媛덉븘?쇱슫??
        setFolders(next.map((f) => (f.id === folderId ? { ...f, name: updated.name } : f)));
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "?대뜑瑜??대룞?섏? 紐삵뻽?듬땲??", "err");
      });
  }, [folders, checkFolderDuplicate, pushToast]);

  const handleReorderFolder = useCallback((folderId: string, referenceFolderId: string, position: "before" | "after") => {
    setFolders((prev) => reorderFolderRelativeTo(prev, folderId, referenceFolderId, position) ?? prev);
  }, []);

  /* 踰꾨툝 ?대컮??AI 踰꾪듉(?붿빟/?ㅼ떆?곌린) ???곗륫 ?몃씪??AI ?⑤꼸??mock ?붿껌 ?꾨떖 */
  const handleAiAction = useCallback((type: AiActionType, text: string) => {
    aiNonceRef.current += 1;
    setAiRequest({ type, text, nonce: aiNonceRef.current });
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
    editorHandlesRef.current = {};
    setEditorHandleRevision((current) => current + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ?? ?몄뀡 ?곸냽??(persistKey 吏???? ???????????????????????????? */

  // initialTab(?꾨줈?쇳떚)??ref濡쒕룄 ?ㅺ퀬 ?덈뒗????applyHydration? actor ?꾪솚(?대깽?? ?꾨옒
  // handleExternalRefresh) ?쒖젏?먮룄 ?덉쟾?섍쾶 ?몄텧?쇱빞 ?댁꽌 deps ?녿뒗 ?덉젙??identity濡?留뚮뱾怨?
  // ?띠??? 洹몃윭?ㅻ㈃ ?대줈?濡?吏곸젒 initialTab??李몄“?????녿떎(洹??쒖젏??stale?????덉쓬).
  const initialTabRef = useRef(initialTab);
  useEffect(() => {
    initialTabRef.current = initialTab;
  }, [initialTab]);

  /* 二쇱뼱吏?key????λ맂 ?몄뀡???쎌뼱 state/paneTabs(+ mock 紐⑤뱶硫?notes/folders)??諛섏쁺?쒕떎.
     mount ??泥?effect)? actor ?꾪솚(handleExternalRefresh, ?꾨옒)?먯꽌 怨듭쑀?쒕떎 ???덉쟾?먮뒗 mount
     effect ?덉뿉留???濡쒖쭅???덉뼱?? actor媛 諛붾???"resolveActorPersistKey媛 ?뚮젮以 key媛
     ?댁쟾怨?媛숈? 媛???寃쎌슦(?? ?좏겙 留뚮즺濡??щ윭 401??嫄곗쓽 ?숈떆???꾩갑??濡쒓렇?꾩썐 泥섎━媛
     以묐났 ?몄텧?섎뒗 寃쎌슦) effectivePersistKey媛 ?ㅼ젣濡쒕뒗 ??諛붾뚯뼱 ??effect媛 ?ъ떎?됰릺吏
     ?딄퀬, 洹??ъ씠 notes/folders留?鍮꾩썙??吏곸쟾 actor????씠 鍮??⑤꼸濡??⑷렇?щ땲 ?⑤뒗 臾몄젣媛
     ?덉뿀?????댁젣??actor ?꾪솚 履쎌뿉??key媛 諛붾뚯뿀?붿?? 臾닿??섍쾶 ??긽 紐낆떆?곸쑝濡??몄텧?쒕떎.
     attachInitialTab=false硫?"吏湲?URL??媛由ы궎???명듃瑜???뿉 ?쇱썙?ｊ린"瑜?嫄대꼫?대떎(actor
     ?꾪솚 ?쒖젏??URL? ??actor? 臾닿??????덉뼱??mount ?뚮쭔 ?곸슜). */
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
    // ?댁쟾 踰꾩쟾(Welcome??kind:"start" ??쑝濡???λ릺???쒖젅)???몄뀡???⑥븘?덉쓣 ???덉쑝誘濡?
    // "note"媛 ?꾨땶 ??? 嫄몃윭?닿퀬 activeTabId媛 ?щ씪吏???쓣 媛由ы궎硫?泥???쑝濡??ъ“?뺥븳??
    let nextPaneTabs: Record<string, PaneTabsState> = Object.fromEntries(
      Object.entries(saved.paneTabs).map(([paneId, tabsState]) => {
        const tabs = tabsState.tabs.filter((t) => t.kind === "note" && t.noteId.trim().length > 0);
        const activeTabId = tabs.some((t) => t.id === tabsState.activeTabId)
          ? tabsState.activeTabId
          : tabs[0]?.id ?? "";
        return [paneId, { tabs, activeTabId }];
      })
    );
    // saved.paneTabs?먮뒗 ?몃━???녿뒗 怨좎븘 ??ぉ???욎뿬 ?덉쓣 ???덉쑝誘濡?怨쇨굅 ?덉씠?ㅻ줈 ?앷릿 寃?
    // ?ы븿), "?뺣쭚 鍮꾩뼱?덈뒗 ?몄뀡?몄?"??saved.root???ㅼ젣濡??덈뒗 leaf留?湲곗??쇰줈 ?먯젙?쒕떎 ??
    // isWorkspaceEmpty? ?숈씪??湲곗?(collectLeafIds)???⑥빞 ???먯젙???닿툔?섏? ?딅뒗??
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
    // 蹂듭썝???몄뀡 ?꾩뿉?? initialTab??note瑜?媛由ы궎硫?洹??명듃瑜??쒖꽦 ?⑤꼸????쑝濡??곕떎.
    // ?꾨낫????긽 saved.root???ㅼ젣濡??덈뒗 leaf 以묒뿉?쒕쭔 怨좊Ⅸ????怨좎븘 paneTabs ?ㅻ? ?쒖꽦
    // ?⑤꼸濡?怨좊Ⅴ硫??몃━???녿뒗 paneId媛 activeId媛 ?섏뼱踰꾨┛??
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
    // ???몄뀡?먮뒗 ???꾨뱶媛 ?놁쓣 ???덉쑝誘濡?湲곕낯媛?鍮?留?= 紐⑤뱺 pane 100%)?쇰줈 fallback?쒕떎.
    setPaneFontScale(saved.paneFontScale ?? {});
    hydratedRef.current = true;
  }, []);

  // mount ??1?? ??λ맂 ?몄뀡 蹂듭썝 ??initialTab??note硫?洹??명듃瑜??쒖꽦 ?⑤꼸 ??쑝濡??곕떎
  useEffect(() => {
    applyHydration(effectivePersistKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersistKey]);

  useEffect(() => {
    if (USE_MOCK_NOTES) return;
    let active = true;

    // attachInitialTab=false??applyHydration??媛숈? ?대쫫 ?뚮씪誘명꽣? ?숈씪???섎룄????actor(guest/
    // user) ?꾪솚 吏곹썑?먮뒗 resolveActorPersistKey媛 claim mapping?쇰줈 ?대? pane tree/tabs瑜?
    // ?щ컮瑜닿쾶 蹂듭썝?대??쇰?濡? "URL??initialTab???ㅼ떆 ?닿굅?? 洹??명듃瑜?紐?李얠쑝硫?泥?踰덉㎏
    // ?명듃濡??泥??섎뒗 ???⑥닔 ?먯떊???대갚?????硫????쒕떎. ?덉쟾?먮뒗 ???대갚??isInitialLoad?
    // 臾닿??섍쾶 `initialTab.kind === "note"`(濡쒓렇?????뱀젙 ?명듃 URL??蹂닿퀬 ?덉뿀??寃쎌슦)留뚯쑝濡쒕룄
    // 諛쒕룞?? claim 吏곹썑 activeId媛 媛由ы궎??pane(3遺꾪븷 以??섎굹)??諛⑷툑 蹂듭썝???뺤긽 ?명듃 ???
    // "洹??쒖젏???쒕쾭媛 ?꾩쭅 紐?李얠? 珥덇린 ?명듃 ??nextNotes[0](?됰슧??泥?踰덉㎏ ?명듃)"濡?媛덉븘?쇱썙吏??
    // ?뚭?媛 ?덉뿀??
    function loadFromServer(openNoteId?: string, isInitialLoad = false, attachInitialTab = true) {
      setLoadError(null);
      const targetNoteId = openNoteId ?? (attachInitialTab && initialTab.kind === "note" ? initialTab.noteId : null);
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
              // draft媛 ??理쒖떊 ?대뜑 諛곗튂瑜??ㅺ퀬 ?덉쓣 ???덈떎(?꾩쭅 flush ?????? 諛⑷툑 ?대뜑瑜?
              // ??릿 吏곹썑). draft.folderId????긽 "?꾩옱 諛곗튂 ?꾩껜"瑜??댁븘 蹂대궡誘濡?遺遺?patch
              // ?꾨떂) undefined媛 ?꾨땲??null???좏슚??媛?猷⑦듃)?쇰줈 洹몃?濡?諛섏쁺?쒕떎.
              folderId: draft.folderId ?? undefined,
              updatedAt: draftSavedAt,
              // version? draft.baseVersion???덈? ?곗? ?딅뒗????Redis draft autosave(1.5珥?
              // ?붾컮?댁뒪, note.id.startsWith("note_")硫?persisted ?щ?? 臾닿??섍쾶 怨꾩냽 ?덈떎)??
              // Ctrl+S ?ㅼ젣 ????꾩뿉??吏?뚯?嫄곕굹 媛깆떊?섏? ?딆븘, ?ш린??draft.baseVersion??
              // 諛섏쁺?섎㈃ 諛⑷툑 ?щ씪媛?persisted.version(Postgres 吏꾩쭨 踰꾩쟾)??洹????ㅻ깄??媛믪쑝濡?
              // ?섎룎?ㅻ쾭由곕떎. 洹??곹깭濡??ㅼ쓬 Ctrl+S媛 ?섍?硫???긽 409(NOTE_VERSION_CONFLICT)媛
              // ?섍퀬, ????깃났 ??notes-refresh ????merge ??version 濡ㅻ갚 ???ㅼ쓬 ???409 媛
              // 臾댄븳 諛섎났?쒕떎(claim 吏곹썑泥섎읆 notes-refresh媛 ??쑝硫??뱁엳 ???쒕윭??. content/
              // title/folderId? ?щ━ version? "?ㅼ쓬 ??μ쓽 ?숆????숈떆???좏겙"?대?濡???긽
              // persisted.version(?쒕쾭???ㅼ젣 理쒖떊 媛???洹몃?濡??⑥빞 ?쒕떎.
              version: persisted.version,
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

          // 利먭꺼李얘린 珥덇린 ?곹깭 ???명듃/?대뜑 紐⑸줉 ?먯껜??濡쒕뵫??留됱? ?딅룄濡?蹂꾨룄濡? 鍮꾩감?⑥쑝濡?
          // 媛?몄삩?? ?ㅽ뙣?대룄 ?명듃/?대뜑 紐⑸줉? ?대? ?뺤긽 濡쒕뱶?먯쑝誘濡?議곗슜??臾댁떆?쒕떎.
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

          // state.activeId????effect媛 留덉슫???쒖젏??罹≪쿂??媛믪씠???꾨옒 deps: []), 洹??ъ씠
          // ?몄뀡 蹂듭썝(useEffect, ?꾩そ) ?깆쑝濡??ㅼ젣 ?몃━??paneId媛 諛붾뚯뼱??媛깆떊?섏? ?딅뒗?? ??
          // ?ㅽ듃?뚰겕 ?묐떟? 留덉슫???댄썑 ?쒖갭 ???쇱슫?쒗듃由????꾩갑?섎?濡? ??긽 理쒖떊 ?곹깭瑜??ㅺ퀬
          // ?덈뒗 latestSessionRef?먯꽌 "吏湲??ㅼ젣濡?蹂댁씠???⑤꼸"???ㅼ떆 怨꾩궛?댁빞 ?쒕떎 ??洹몃젃吏
          // ?딆쑝硫??몃━???녿뒗 ??paneId濡??명듃瑜??댁뼱, ?붾㈃??諛섏쁺?섏? ?딄퀬 怨좎븘 paneTabs
          // ??ぉ留??⑤뒗 踰꾧렇媛 ?앷릿???쇱슦?낆쑝濡????명듃媛 ??蹂댁씠怨?Welcome泥섎읆 蹂댁씠???먯씤).
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
          if (active) setLoadError(error instanceof Error ? error.message : "Workspace-Service?먯꽌 ?명듃瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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

    // Import ??NotesWorkspace ?몃?(蹂꾨룄 留덉슫?몃맂 ?붾㈃)?먯꽌 ?명듃媛 ?덈줈 ?앹꽦??寃쎌슦, ??而댄룷?뚰듃??
    // ?쇱슦???꾪솚?먮룄 由щ쭏?댄듃?섏? ?딆븘(?덉씠?꾩썐?먯꽌 ??踰덈쭔 留덉슫?? mount ?쒖젏 fetch留뚯쑝濡쒕뒗 ??
    // ?명듃瑜?紐?蹂몃떎. ?몃??먯꽌 ???대깽?몃? ?섎㈃ 紐⑸줉???ㅼ떆 遺덈윭?ㅺ퀬, 吏?뺥븳 ?명듃瑜?諛붾줈 ?곕떎.
    function handleExternalRefresh(event: Event) {
      const detail = (event as CustomEvent<{ noteId?: string; resetWorkspace?: boolean; syncRefresh?: boolean }>).detail;
      // 濡쒓렇???뚯썝媛??濡쒓렇?꾩썐?쇰줈 actor(guest/user)媛 諛붾?寃쎌슦(auth-api.ts??
      // claimGuestDraftsAfterAuth/clearAuthSession)?먮뒗 resetWorkspace:true濡??몄텧?쒕떎.
      // localStorage ???먯껜瑜??ㅼ떆 怨꾩궛??媛덉븘?쇱슫??resolveActorPersistKey媛 guest->user
      // 1???밴퀎??泥섎━). applyHydration??"?ㅺ? ?ㅼ젣濡?諛붾뚯뿀?붿?"? 臾닿??섍쾶 ??긽 吏곸젒
      // ?몄텧?쒕떎 ??effectivePersistKey state??蹂??媛먯?(?꾨옒 effect)?먮쭔 ?섏〈?섎㈃, ?좏겙
      // 留뚮즺濡?401??嫄곗쓽 ?숈떆???щ윭 踰????resetWorkspace媛 以묐났 ?몄텧?섎뒗 寃쎌슦泥섎읆
      // resolveActorPersistKey媛 "?댁쟾怨?媛숈? ??瑜??뚮젮以???effect媛 ?ъ떎?됰릺吏 ?딆븘 吏곸쟾
      // actor????씠 鍮??⑤꼸濡??⑤뒗 臾몄젣媛 ?덉뿀?? attachInitialTab=false濡??몄텧??"吏湲?URL??
      // ?명듃瑜???뿉 ?쇱썙?ｊ린"??嫄대꼫?대떎(actor媛 留?諛붾??쒖젏??URL? ??actor? 臾닿?????
      // ?덉쓬). ?밴퀎?먮떎硫?諛⑷툑 寃뚯뒪?멸? ?곕뜕 ??洹몃?濡? 濡쒓렇?꾩썐?대씪 寃뚯뒪???ㅼ뿉 ?덉쟾 ?몄뀡??
      // ?덉뿀?ㅻ㈃ 洹멸구濡? ?????놁쑝硫?鍮?Welcome?쇰줈 洹몃젮吏꾨떎 ??洹몃옒???ш린??吏곸젒 ???⑤꼸??
      // 鍮꾩슦吏 ?딅뒗???밴퀎????쓣 鍮꾩썙踰꾨━硫?"?댁뼱諛쏄린"媛 源⑥쭚). notes/folders??癒쇱? 鍮꾩슦吏
      // ?딄퀬, 諛⑷툑 applyHydration??蹂듭썝???ㅻ깄?룹쓣 ?좎???梨?loadFromServer媛 ??actor 湲곗?
      // 理쒖떊媛믪쑝濡?議곗슜??援먯껜?쒕떎 ??洹몃젃吏 ?딆쑝硫??먯깋湲곌? "鍮??곹깭 ??Redis/DB 寃곌낵"濡?
      // ??踰???源쒕묀?몃떎.
      if (detail?.resetWorkspace && persistKey) {
        const nextKey = resolveActorPersistKey(persistKey);
        setActorPersistKey(nextKey);
        applyHydration(nextKey, false);
        setTabMode({});
        draftDirtyNoteIdsRef.current.clear();
        // actor(guest/user)媛 諛붾뚮㈃ ?댁쟾 actor??local id?????댁긽 ?대뼡 ?명듃濡쒕룄 ?뺤젙?섏?
        // ?딆쑝誘濡? 洹?id瑜?key濡?嫄?pending ?쒖떆???④퍡 鍮꾩슫??洹몃?濡??щ룄 ?ㅼ떆 留ㅼ튂???쇱?
        // ?놁?留? ?ㅼ쓬 actor ?몄뀡?먯꽌 ?곗뿰??媛숈? 媛믪씠 ?ъ궗?⑸맆 ?ъ?瑜?留뚮뱾吏 ?딄린 ?꾪븿).
        pendingWikiLinkFlushRef.current.clear();
        pendingWikiLinkEdgeRef.current.clear();
        clearPendingCreatedNotes();
      }
      // resetWorkspace(actor ?꾪솚)硫?applyHydration???대? claim mapping源뚯? 諛섏쁺??pane
      // tree/tabs瑜?蹂듭썝?대??쇰?濡? ???덈줈怨좎묠 ?먯껜??attachInitialTab=false濡??몄텧??洹?
      // 蹂듭썝 寃곌낵瑜?initialTab ?대갚?쇰줈 ??뼱?곗? ?딅뒗??
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

  // 留덉슫????initialTab??諛붾뚮㈃(?대씪?댁뼵???쇱슦?낆쑝濡??ㅻⅨ ?명듃濡??대룞) ?대떦 ?명듃瑜??곕떎
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
        // 媛숈? ?댁쑀濡?state.activeId ?????긽 理쒖떊媛믪쓣 ?ㅺ퀬 ?덈뒗 latestSessionRef 湲곗??쇰줈 ?쇰떎.
        const livePaneId = resolveVisiblePaneId(latestSessionRef.current.root, latestSessionRef.current.activeId);
        handleReplaceActiveTab(livePaneId, draft.noteId);
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : "?꾩떆????명듃瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab.kind === "note" ? initialTab.noteId : "start"]);

  /* noteId媛 ?덉?留??ㅼ젣濡?notes 諛곗뿴???녿뒗(??젣?먭굅???좎큹??議댁옱?????녿뒗 ???? ?좏슚?섏?
     ?딆? URL濡?吏곸젒 吏꾩엯, 珥덇린??吏곹썑 ?몄뀡 蹂듭썝 ?? "?쒕ぉ ?놁쓬" ??쓣 ?뺣━?쒕떎. 洹몃윴 ???
     EditorPanel??Welcome Board? ?숈씪???붾㈃??蹂댁뿬二쇨쾶 留뚮뱶?붾뜲(EditorPanel.tsx??`!note`
     遺꾧린), ?좎큹????紐⑸줉???⑥븘?덉쑝硫????쒕떎 ??Welcome Board????씠 ?꾨땲??吏꾩쭨 empty
     state?ъ빞 ?쒕떎. 珥덇린 濡쒕뱶/?몄뀡 蹂듭썝???앸굹湲??꾩뿉??嫄대뱶由ъ? ?딅뒗??洹??ъ씠 ?꾩쭅 notes媛
     ??梨꾩썙議뚯쓣 肉먯씤 ?뺤긽 ??퉴吏 吏?뚮쾭由щ뒗 嫄?留됯린 ?꾪빐). */
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

  // 蹂寃??ы빆???붾컮?댁뒪 ???(諛깃렇?쇱슫???먮룞??????ㅽ뙣?대룄 議곗슜??臾댁떆, ?섎룞 ??μ씠 ?ㅽ뙣 ?곹깭瑜??몄텧).
  // ?ㅻ쭔 "紐⑤뱺 ??쓣 ?レ븘 Welcome?쇰줈 ?뚯븘媛? ?꾪솚留뚯? ?붾컮?댁뒪 ?놁씠 利됱떆 湲곕줉?쒕떎 ??350ms ?덉뿉
  // ?덈줈怨좎묠?섎㈃ 洹?吏곸쟾(??씠 ?⑥븘?덈뜕) ?몄뀡??洹몃?濡?蹂듭썝?섏뼱 ?レ? ??遺꾪븷???섏궡?꾨굹??
  // 踰꾧렇媛 ?덉뿀????댄븨 以??먮룞??κ낵 ?щ━ 援ъ“ 蹂寃쎌? 吏?곗떆???댁쑀媛 ?녿떎).
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
        // 諛깃렇?쇱슫???먮룞????ㅽ뙣??臾댁떆
      }
    }, delay);
    return () => window.clearTimeout(handle);
  }, [effectivePersistKey, state, paneTabs, notes, folders, paneFontScale]);

  // Ctrl+S媛 ??긽 理쒖떊 ?몄뀡??利됱떆 湲곕줉?????덈룄濡?留?蹂寃쎈쭏??ref???ㅻ깄??蹂닿?
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

  // ????쒖꽦 ?명듃媛 諛붾뚮㈃ URL 媛깆떊 肄쒕갚 ?몄텧
  useEffect(() => {
    if (prevActiveNoteIdRef.current === activeNoteId) return;
    prevActiveNoteIdRef.current = activeNoteId;
    onActiveNoteChange?.(activeNoteId ?? null);
  }, [activeNoteId, onActiveNoteChange]);

  /* Ctrl+S ?섎룞 ??????쒖꽦 ?먮뵒?곗뿉 ?붾컮?댁뒪 以묒씤 蹂몃Ц/?쒕ぉ??利됱떆 諛섏쁺?섎룄濡??좏샇瑜?蹂대궦 ??
     ?쎄컙??吏????理쒖떊 ?몄뀡 ?ㅻ깄?룹쓣 利됱떆 localStorage??湲곕줉?쒕떎. */
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
      // 媛숈? ?대뜑??媛숈? ?쒕ぉ???대? ?덉쑝硫??쒕쾭媛 "?쒕ぉ 2"泥섎읆 ?먮룞?쇰줈 諛붽퓭???묐떟?쒕떎 ??
      // 濡쒖뺄????댄븨???쒕ぉ???꾨땲???ㅼ젣濡???λ맂 ?쒕ぉ??諛섏쁺?댁빞 ?쒕떎.
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

  /** POST /api/v1/exports??SSOT 怨꾩빟?濡?怨꾩냽 ?몄텧?섏?留??묒뾽 湲곕줉), ?꾩옱 諛깆뿏??援ы쁽?
      MVP ?ㅽ뀅?대씪 議댁옱?섏? ?딅뒗 cdn.brainx.com URL留??뚮젮以??ㅼ젣 ?ㅼ슫濡쒕뱶媛 ?섏? ?딅뒗??
      (釉뚮씪?곗?媛 洹??꾨찓?몄쓣 李얠? 紐삵빐 洹몃깷 ?꾨Т ?쇰룄 ???쇱뼱??寃껋쿂??蹂댁엫). 諛깆뿏?쒓? ?ㅼ젣
      ?뚯씪???뚮뜑留곹븯湲??꾧퉴吏?? ?대? 硫붾え由ъ뿉 ?덈뒗 ?명듃 HTML???ш린??吏곸젒 蹂?섑빐
      ?대젮以??exportNoteContent.ts) ??洹몃옒??諛깆뿏???몄텧? ?ㅽ뙣?대룄 臾댁떆?쒕떎(best-effort). */
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!activeNote) return;
    setExportingFormat(format);
    try {
      exportNote(activeNote.id, format).catch(() => {});
      const { downloadPdfFile, downloadTextFile, htmlToMarkdown, htmlToPlainText, safeFileName } =
        await import("@/lib/notes/exportNoteContent");
      const fileName = safeFileName(activeNote.title);
      // ?먮뵒??HTML ?곗꽑, ?놁쑝硫?content媛 留덊겕?ㅼ슫?몄? ?먮퀎 ??吏곸젒 蹂?섑븳??
      // ?몄뀡 媛?몄삤湲???留덊겕?ㅼ슫?쇰줈 ??λ맂 ?명듃??"<"濡??쒖옉?섏? ?딅뒗??
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
      pushToast(`${format} 내보내기를 시작했어요.`, "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "내보내기에 실패했습니다.", "err");
    } finally {
      setExportingFormat(null);
      setMoreMenuOpen(false);
      setExportSubmenuOpen(false);
    }
  }, [activeNote, activeEditorHandle, pushToast]);

  /* ?? ?ㅻ낫???⑥텞??(Ctrl/Cmd+N ???뚯씪, Ctrl/Cmd+O ?뚯씪濡??대룞, Ctrl/Cmd+S ??? ?? */
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

  // ?꾪궎留곹겕([[?명듃]]) 湲곕뒫???꾩슂??而⑦뀓?ㅽ듃 ???명듃 紐⑸줉 議고쉶/議댁옱 ?뺤씤/?대룞/?앹꽦???먮뵒??
  // 源딆닕??NoteEditor ??CodeBlockView 媛숈? 以묒꺽 ?④퀎 ?놁씠?? ?대뵒?쒕뱺 ?????덇쾶 ?쒕떎.
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
      onCreate: (title, sourceHtml) => {
        const sourceNoteId = activeNoteId;
        const sourceNote = sourceNoteId ? notes.find((n) => n.id === sourceNoteId) : undefined;

        // Flush any pending editor save before creating and navigating to a new note.
        activeEditorHandle?.flushPendingSave();

        if (sourceNote) {
          // Use the freshest content source available before local state catches up.
          let latestContent = sourceHtml ?? activeEditorHandle?.getHTML() ?? sourceNote.content;

          // Ensure the requested wiki link exists even if autocomplete timing lagged.
          if (!contentHasWikiLinkTo(latestContent, title)) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                '[wiki-link] "' + title + '" was missing from the source note and has been repaired.',
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

          // 3) activeNote媛 諛붾뚮뒗 ?쒓컙 痍⑥냼?섎뒗 draft autosave effect(1500ms ?붾컮?댁뒪, activeNote
          // 湲곗?)??湲곕?吏 ?딄퀬, 吏湲????쒓컙 ?낅┰?곸씤 ?ㅽ듃?뚰겕 ?붿껌?쇰줈 ?뚯뒪 ?명듃瑜???ν븳????
          // 諛붾줈 ?ㅼ쓬 以꾩뿉????쓣 A濡??꾪솚?대룄 ?대? ?쒖옉?????붿껌? 痍⑥냼?섏? ?딄퀬 ?앷퉴吏
          // 吏꾪뻾?쒕떎. ?닿쾶 ?대쾲??怨좎튂??race condition???듭떖?대떎.
          if (!USE_MOCK_NOTES) {
            const noteToPersist = { ...sourceNote, content: latestContent };
            void persistNoteBestEffort(noteToPersist)
              .then((persisted) => {
                if (persisted) {
                  draftDirtyNoteIdsRef.current.delete(sourceNote.id);
                } else {
                  // ?뚯뒪 ?명듃 ?먯떊???꾩쭅 draft id 諛쒓툒 ??local id)?대씪 吏湲덉? ??ν븷 諛⑸쾿??
                  // ?녿떎 ??洹??명듃??draft id媛 ?뺤젙?섎뒗 ?쒖젏(createNote??issueWorkspaceNoteDraftId
                  // .then)????踰?????μ쓣 ?쒕룄?섎룄濡??쒖떆?대몦?? 洹몃룞?덉뿉??notes[] state?
                  // ?붾㈃(?먮뵒???щ갑臾??먮뒗 [[title]]???대? 諛섏쁺???덉뼱 ?대쾲 ?몄뀡 ?덉뿉???좎떎?섏?
                  // ?딅뒗??
                  pendingWikiLinkFlushRef.current.add(sourceNote.id);
                }
              })
              .catch((error) => {
                // best-effort ???ㅽ뙣?대룄 draftDirtyNoteIdsRef???ъ쟾???⑥븘 ?덉뼱 ?ㅼ쓬 ???湲고쉶
                // (?섎룞 ???洹??명듃 ?щ갑臾???draft autosave)???ㅼ떆 ?쒕룄?쒕떎.
                warnWikiLinkFailure("source note 利됱떆 ????ㅽ뙣", error);
              });
          }
        }

        // 4) 洹??ㅼ쓬?????명듃瑜?留뚮뱾怨?A ??쑝濡??대룞?쒕떎. createNote ?먯껜媛(?꾪궎留곹겕 ?щ??
        // 臾닿??섍쾶 紐⑤뱺 ???명듃 ?앹꽦?먯꽌) sessionStorage optimistic 湲곕줉???④릿????linkFromNoteId瑜?
        // ?섍린硫?洹몃옒?꾧? optimistic edge源뚯? ?⑹꽦?쒕떎.
        createNote(undefined, primaryPaneId, title, sourceNoteId ?? undefined);
      },
    }),
    [wikiLinkNoteRefs, wikiLinkFolderRefs, handleNoteClick, createNote, primaryPaneId, activeEditorHandle, activeNoteId, notes]
  );

  // ?명듃/???⑤꼸 ?곗씠??珥덇린?붽? ?앸굹湲??꾩뿉???뚰겕?ㅽ럹?댁뒪 ?꾩껜瑜?濡쒕뵫 ?곹깭濡??泥댄븳????
  // Welcome 蹂대뱶???먯깋湲곗쿂???쇰? ?곸뿭留?癒쇱? 源쒕묀?대ŉ 鍮??곹깭濡?洹몃젮吏??寃껋쓣 留됰뒗??
  if (isInitialWorkspaceLoading || isSyncRefreshLoading) {
    return (
      <WorkspaceLoadingShell
        explorerOpen={explorerOpen}
        contextOpen={contextOpen}
        contextPanelSize={contextPanelSize}
        message={isSyncRefreshLoading ? "동기화 중..." : "불러오는 중..."}
      />
    );
  }

  const paneTree = (
    <PaneTreeRenderer
      node={state.root}
      notes={notes}
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

        {/* ?? 醫뚯륫: ?명듃 ?먯깋湲????????????????????????? */}
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

        {/* ?? 以묒븰: ?먮뵒???곸뿭 ????????????????????????? */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

          {/* ?대컮 */}
          <div className="flex shrink-0 items-center gap-3 border-b border-line/50 px-2 py-2">
            <span className="text-[12px] font-medium text-txt2">
              {panelCount}媛??⑤꼸
            </span>
            <span className="text-[11px] text-txt3/60">
              쨌 ?명듃 ?대┃ = ?꾩옱 ??援먯껜 쨌 蹂몃Ц???쒕∼ = 援먯껜 쨌 ??컮???쒕∼ = ??異붽?
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
                title="??蹂닿린"
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
                aria-label="??蹂닿린 硫붾돱"
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
                          {exportingFormat === format && <span className="text-[10px] text-txt3">내보내는 중...</span>}
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

          {/* ?먮뵒??+ ?곗륫 而⑦뀓?ㅽ듃 ?⑤꼸 ??而⑦뀓?ㅽ듃 ?⑤꼸? 怨좎젙 ??씠?덈뒗?? Split View
              (PaneTreeRenderer.tsx)媛 ?⑤꼸 ?ъ씠 由ъ궗?댁쫰???곕뒗 寃껉낵 媛숈?
              Group/Panel/Separator(react-resizable-panels)瑜?洹몃?濡??ъ궗?⑺빐 ?쒕옒洹몃줈 ??쓣
              議곗젅?????덇쾶 ?덈떎 ????由ъ궗?댁쫰 濡쒖쭅???곕줈 留뚮뱾吏 ?딆븘 ?숈옉???대? 寃利앸맂
              而댄룷?뚰듃瑜?洹몃?濡??대떎. */}
          <div className="flex flex-1 overflow-hidden">
            {contextOpen ? (
              <>
                <div className="flex-1 min-w-0 overflow-hidden" ref={contextGroupElRef}>
                  {mainContent}
                </div>

                {/* ?곗륫 ?⑤꼸 由ъ궗?댁쫰 ?몃뱾 */}
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
