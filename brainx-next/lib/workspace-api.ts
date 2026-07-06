"use client";
import { clearAuthSession, isDevAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
import { getWorkspaceApiBaseUrl } from "@/lib/api-base";
import { getLocalStoredValue, setLocalStoredValue } from "@/lib/client-storage";
import { requestDesktopApiJson } from "@/lib/desktop-api-request";
import { getBrainxDesktopConfig, isElectronDesktop } from "@/lib/desktop-bridge";
import {
  createDesktopVaultFolder,
  createDesktopVaultNote,
  deleteDesktopVaultFolder,
  deleteDesktopVaultNote,
  getDesktopVaultSnapshot,
  getDesktopVaultWorkspaceStats,
  patchDesktopVaultFolder,
  saveDesktopVaultNoteContent,
  saveDesktopVaultNoteMetadata,
} from "@/lib/desktop-vault";
import { DEV_USER_ID as WORKSPACE_DEV_USER_ID } from "@/lib/dev-user";
import type { MockFolder, MockNote, NoteTypography } from "@/lib/notes/noteTypes";

export const USE_MOCK_NOTES = process.env.NEXT_PUBLIC_NOTES_USE_MOCK !== "false";
const GUEST_SESSION_ID_KEY = "brainx_workspace_guest_id_v1";

export type NoteDetail = {
  noteId: string;
  title: string;
  markdown: string;
  folder: { folderId: string; name: string } | null;
  documentGroupId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  typography?: NoteTypography | null;
};

export type WorkspaceNoteItem = {
  noteId: string;
  title: string;
  markdown: string;
  folderId: string | null;
  documentGroupId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  typography?: NoteTypography | null;
};

export type WorkspaceFolderItem = {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  documentGroupId: string | null;
};

export type NoteCreated = {
  noteId: string;
  title: string;
  folderId: string | null;
  version: number;
  createdAt: string;
};

export type WorkspaceNoteCreatePayload = {
  title: string;
  markdown?: string | null;
  folderId?: string | null;
  tags?: string[];
  documentGroupId?: string | null;
};

export type WorkspaceNoteLinkCreateRequest = {
  targetNoteId?: string | null;
  targetTitle: string;
  createIfMissing: boolean;
  anchorText?: string | null;
  headingAnchor?: string | null;
};

export type WorkspaceNoteLinkData = {
  linkId: string;
  sourceNoteId: string;
  targetNoteId: string;
  targetTitle: string;
  linkType: string;
  anchorText?: string | null;
  headingAnchor?: string | null;
};

export type NoteSaveResult = {
  noteId: string;
  version: number;
  savedAt: string;
  status: "SAVED";
};

export type NoteMetadataResult = {
  noteId: string;
  title: string;
  folderId: string | null;
  tags: string[];
  version: number;
  typography?: NoteTypography | null;
};

export type NoteDraftSaveResult = {
  noteId: string;
  actorType: "USER" | "GUEST";
  savedAt: string;
  expiresAt: string;
  status: "DRAFT_SAVED";
};

export type NoteDraftIdResult = {
  noteId: string;
  actorType: "USER" | "GUEST";
  issuedAt: string;
  status: "DRAFT_ID_ISSUED";
};

export type DeleteNoteResult = {
  noteId: string;
  deletedAt: string;
  purgeAt: string | null;
};

export type DeleteFolderResult = {
  deletedFolderIds: string[];
  deletedNoteIds: string[];
  deletedAt: string;
};

export type NoteDraftData = {
  noteId: string;
  actorType: "USER" | "GUEST";
  title: string | null;
  markdown: string;
  folderId: string | null;
  baseVersion: number;
  clientSavedAt: string | null;
  savedAt: string;
  expiresAt: string;
};

type NoteListData = {
  notes: WorkspaceNoteItem[];
  totalCount: number;
};

type FolderTreeData = {
  folders: WorkspaceFolderItem[];
};

type NoteDraftListData = {
  drafts: NoteDraftData[];
};

export type WorkspaceUserActivityData = {
  noteId: string;
  type: string;
  title: string;
  occurredAt: string;
};

export type WorkspaceUserStatsData = {
  noteCount: number;
  storageBytes: number;
  activities: WorkspaceUserActivityData[];
};

export type WorkspaceSummaryData = {
  documentGroupId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceListData = {
  workspaces: WorkspaceSummaryData[];
};

async function shouldUseDesktopVault() {
  if (!isElectronDesktop()) return false;
  const config = await getBrainxDesktopConfig();
  return Boolean(config?.activeVault);
}

async function getDesktopVaultListData(): Promise<NoteListData> {
  const snapshot = await getDesktopVaultSnapshot();
  return {
    notes: (snapshot?.notes ?? []).map((note) => ({
      noteId: note.noteId,
      title: note.title,
      markdown: note.markdown,
      folderId: note.folderId,
      documentGroupId: note.documentGroupId ?? null,
      tags: note.tags,
      version: note.version,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      typography: note.typography ?? null,
    })),
    totalCount: snapshot?.notes.length ?? 0,
  };
}

async function getDesktopVaultFolderData(): Promise<FolderTreeData> {
  const snapshot = await getDesktopVaultSnapshot();
  return {
    folders: (snapshot?.folders ?? []).map((folder) => ({
      folderId: folder.folderId,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      documentGroupId: folder.documentGroupId ?? null,
    })),
  };
}

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

/** 백엔드 에러 코드(예: `NOTE_VERSION_CONFLICT`)와 `details`(예: `serverVersion`)를 그대로
    들고 있어, 호출부가 특정 실패를 구분해 재시도 같은 처리를 할 수 있게 한다. 기존 `catch {}`처럼
    타입을 안 가리고 잡는 코드는 그대로 Error로 동작해 영향이 없다. */
export class WorkspaceApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "WorkspaceApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 이 브라우저 세션이 백엔드에 "실제 사용자"로 식별되는지 — 실제 로그인 세션(JWT)뿐 아니라,
    로컬 개발용 `NEXT_PUBLIC_WORKSPACE_DEV_USER_ID`(X-User-Id 헤더로 강제 로그인 흉내)가 설정된
    경우도 포함한다. 이 값이 true인 동안 authedRequest는 Workspace-Service에 항상 어떤 형태로든
    "식별된 사용자" 헤더를 실어 보내므로(Authorization 또는 X-User-Id), Workspace-Service는 그
    요청을 GUEST(Redis draft)가 아니라 USER(Postgres)로 처리한다. 프론트의 게스트/로그인 분기
    (그래프, 노트 목록 로딩 등)도 이 판정과 반드시 일치해야 한다 — 안 그러면 로컬에서만 "실제로는
    dev-test-user로 저장됐는데 프론트는 게스트 draft 경로를 읽어서 새로고침하면 사라지는" 불일치가
    생긴다(배포 환경은 이 env var 자체가 없어서 문제가 드러나지 않았다). */
export function hasWorkspaceUserIdentity(): boolean {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  return useAuthenticatedSession || Boolean(WORKSPACE_DEV_USER_ID);
}

function getWorkspaceGuestId(): string | null {
  if (typeof window === "undefined") return null;
  const existing = getLocalStoredValue(GUEST_SESSION_ID_KEY)?.trim();
  if (existing) return existing;
  const nextId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  setLocalStoredValue(GUEST_SESSION_ID_KEY, nextId);
  return nextId;
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  const useDevUserHeader = Boolean(WORKSPACE_DEV_USER_ID) && !useAuthenticatedSession;
  const isGuestRequest = !useAuthenticatedSession && !useDevUserHeader;
  const guestSessionId = isGuestRequest ? getWorkspaceGuestId() : null;
  const requestInit: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(guestSessionId ? { "X-Guest-Id": guestSessionId } : {}),
      ...(useDevUserHeader ? { "X-User-Id": WORKSPACE_DEV_USER_ID } : {}),
      ...(useAuthenticatedSession ? { Authorization: `${session?.tokenType ?? "Bearer"} ${session?.accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  };

  const sendRequest = async () => {
    const desktopResponse = await requestDesktopApiJson<ApiResponse<T>>(path, requestInit);
    if (desktopResponse) {
      return {
        ok: desktopResponse.ok,
        status: desktopResponse.status,
        payload: desktopResponse.payload,
      };
    }

    const response = await fetch(`${getWorkspaceApiBaseUrl()}${path}`, requestInit);
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  };

  // session이 없으면(비회원) Authorization 헤더 없이 호출한다 — Gateway가 guest cookie/
  // X-Guest-Id를 발급해 Workspace-Service가 GUEST actor로 처리한다.
  let response = await sendRequest();
  // guestSessionAuth 계약의 첫 요청에서 게이트웨이가 세션 쿠키를 막 발급하는 타이밍이면
  // 초기 401/403 뒤 재시도 1회에서 정상화될 수 있다. 로그인 사용자의 세션 만료 경로와 섞이지
  // 않도록 "실제 인증 세션이 없는 순수 guest 요청"에만 한 번 적용한다.
  if (isGuestRequest && (response.status === 401 || response.status === 403)) {
    response = await sendRequest();
  }

  const payload = response.payload;
  const shouldClearSession = useAuthenticatedSession && Boolean(session?.accessToken);
  if (response.status === 401 || response.status === 403) {
    if (shouldClearSession) {
      clearAuthSession();
      throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }
    throw new WorkspaceApiError(
      messageFromResponse(payload ?? { success: false, data: null }, "요청 처리에 실패했습니다."),
      response.status,
      payload?.error?.code,
      payload?.error?.details
    );
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new WorkspaceApiError(
      messageFromResponse(payload, "요청 처리에 실패했습니다."),
      response.status,
      payload.error?.code,
      payload.error?.details
    );
  }
  return payload.data as T;
}

export async function getNote(noteId: string) {
  if (await shouldUseDesktopVault()) {
    const snapshot = await getDesktopVaultSnapshot();
    const note = snapshot?.notes.find((item) => item.noteId === noteId);
    if (!note) {
      throw new Error("로컬 vault에서 노트를 찾을 수 없습니다.");
    }
    const folder = snapshot?.folders.find((item) => item.folderId === note.folderId) ?? null;
    return {
      noteId: note.noteId,
      title: note.title,
      markdown: note.markdown,
      folder: folder ? { folderId: folder.folderId, name: folder.name } : null,
      documentGroupId: note.documentGroupId ?? null,
      tags: note.tags,
      version: note.version,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      typography: note.typography ?? null,
    };
  }
  return authedRequest<NoteDetail>(`/api/v1/notes/${noteId}`);
}

export async function listNotes() {
  if (await shouldUseDesktopVault()) {
    return getDesktopVaultListData();
  }
  return authedRequest<NoteListData>("/api/v1/notes");
}

export async function listFolders() {
  if (await shouldUseDesktopVault()) {
    return getDesktopVaultFolderData();
  }
  return authedRequest<FolderTreeData>("/api/v1/folders/tree");
}

export type FavoriteTargetType = "NOTE" | "FOLDER";
export type FavoriteData = { targetType: FavoriteTargetType; targetId: string; enabled: boolean };

/** 워크스페이스 sync 응답(WorkspaceSyncData.favorites)의 항목 형태는 SSOT에서
    `additionalProperties: true`로만 열려 있고 고정 스키마가 없다 — PUT 응답(FavoriteData)과
    같은 필드(targetType/targetId/enabled)를 쓴다고 가정하되, 다른 필드명(noteId/folderId 등)을
    쓰는 백엔드 구현도 방어적으로 함께 인식한다. 모르는 모양이면 조용히 무시하고 건너뛴다(그래프/
    노트 목록처럼 필수 데이터가 아니라 있으면 좋은 부가 정보라 실패해도 UI 전체를 막지 않는다). */
function parseFavoriteSyncItem(item: unknown): { targetType: FavoriteTargetType; targetId: string; enabled: boolean } | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const enabled = typeof record.enabled === "boolean" ? record.enabled : true;
  const targetType = record.targetType === "NOTE" || record.targetType === "FOLDER" ? record.targetType : null;
  const targetId = typeof record.targetId === "string" ? record.targetId
    : typeof record.noteId === "string" ? record.noteId
    : typeof record.folderId === "string" ? record.folderId
    : null;
  const inferredType: FavoriteTargetType | null = targetType
    ?? (typeof record.noteId === "string" ? "NOTE" : typeof record.folderId === "string" ? "FOLDER" : null);
  if (!inferredType || !targetId) return null;
  return { targetType: inferredType, targetId, enabled };
}

/** 노트/폴더 즐겨찾기 초기 상태 조회 — 노트/폴더 단건 조회에는 즐겨찾기 여부가 없어(SSOT에
    isFavorite류 필드 없음) 워크스페이스 sync 응답의 favorites 배열이 유일한 조회 경로다. 데스크톱
    vault 모드는 Workspace-Service 자체를 안 쓰므로 빈 값을 돌려준다.
    실제 구현/Gateway 라우트는 아직 `/api/v1/workspace/sync`(단수, documentGroupId 없음)만 있고
    SSOT의 `/api/v1/workspaces/{documentGroupId}/sync`(복수)는 매치되는 라우트가 없어 항상 404였다
    — guest/로그인 모두 새로고침 후 즐겨찾기가 사라지던 원인. Workspace-Service의 syncWorkspace는
    guest actor(X-Guest-Id/쿠키)도 currentUser.userId() 그대로 받아 처리하므로 guest도 그대로
    사용한다. */
export async function getWorkspaceFavorites(): Promise<{ noteIds: Set<string>; folderIds: Set<string> }> {
  const empty = { noteIds: new Set<string>(), folderIds: new Set<string>() };
  if (await shouldUseDesktopVault()) return empty;
  const data = await authedRequest<{ favorites?: unknown[] }>("/api/v1/workspace/sync");
  const noteIds = new Set<string>();
  const folderIds = new Set<string>();
  for (const raw of data.favorites ?? []) {
    const parsed = parseFavoriteSyncItem(raw);
    if (!parsed || !parsed.enabled) continue;
    (parsed.targetType === "NOTE" ? noteIds : folderIds).add(parsed.targetId);
  }
  return { noteIds, folderIds };
}

/** 노트/폴더 즐겨찾기 설정/해제 — 게스트(guestSessionAuth)/로그인(bearerAuth) 둘 다 계약상
    허용된다. 데스크톱 vault 모드는 Workspace-Service를 쓰지 않으므로 호출 자체를 건너뛰고
    낙관적으로 성공한 것처럼 반환한다(로컬 vault에는 즐겨찾기 저장소가 아직 없음). */
export async function putFavorite(targetType: FavoriteTargetType, targetId: string, enabled: boolean): Promise<FavoriteData> {
  if (await shouldUseDesktopVault()) return { targetType, targetId, enabled };
  return authedRequest<FavoriteData>(`/api/v1/favorites/${targetType}/${targetId}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export async function getMyWorkspaceStats() {
  const emptyStats: WorkspaceUserStatsData = {
    noteCount: 0,
    storageBytes: 0,
    activities: [],
  };
  if (await shouldUseDesktopVault()) {
    return (await getDesktopVaultWorkspaceStats()) ?? emptyStats;
  }
  // SSOT와 백엔드 구현 모두 `/api/v1/workspace/me/stats`를 인증 사용자 전용으로 취급한다.
  // guest는 draft 기반 체험 모드만 유지하면 되므로, 여기서 조용히 기본 통계값으로 fallback해
  // /home, 설정 모달이 user-only stats endpoint를 치지 않게 한다.
  if (!hasWorkspaceUserIdentity()) return emptyStats;
  return authedRequest<WorkspaceUserStatsData>("/api/v1/workspace/me/stats");
}

/** 다중 Workspace(documentGroup) 목록 조회 — Ticket11(Workspace Context)의 기반 API다.
    데스크톱 vault 모드는 Workspace-Service 자체를 안 쓰고(README 참고), guest/비로그인은
    Workspace를 가지지 않으므로(docs/Workspace 정책) 둘 다 빈 목록으로 조용히 처리한다. */
export async function listWorkspaces(): Promise<WorkspaceListData> {
  const empty: WorkspaceListData = { workspaces: [] };
  if (await shouldUseDesktopVault()) return empty;
  if (!hasWorkspaceUserIdentity()) return empty;
  return authedRequest<WorkspaceListData>("/api/v1/workspaces");
}

/** 새 Workspace(documentGroup) 생성 — Ticket12(Workspace 생성 UI)의 기반 API다. 응답 모양이
    listWorkspaces()의 항목(WorkspaceSummaryData)과 동일해 별도 타입을 만들지 않는다. */
export async function createWorkspace(name: string): Promise<WorkspaceSummaryData> {
  return authedRequest<WorkspaceSummaryData>("/api/v1/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function createWorkspaceFolder(name: string, parentFolderId: string | null) {
  if (await shouldUseDesktopVault()) {
    const created = await createDesktopVaultFolder(name, parentFolderId);
    return {
      folderId: created.folderId,
      name: created.name,
      parentFolderId: created.parentFolderId,
      documentGroupId: created.documentGroupId ?? null,
    };
  }
  return authedRequest<WorkspaceFolderItem>("/api/v1/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentFolderId }),
  });
}

export async function patchWorkspaceFolder(
  folderId: string,
  patch: { name?: string; parentFolderId?: string | null }
) {
  if (await shouldUseDesktopVault()) {
    const updated = await patchDesktopVaultFolder({
      folderId,
      name: patch.name,
      parentFolderId: patch.parentFolderId,
    });
    return {
      folderId: updated.folderId,
      name: updated.name,
      parentFolderId: updated.parentFolderId,
    };
  }
  return authedRequest<WorkspaceFolderItem>(`/api/v1/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** 하위 폴더/노트를 전부 cascade로 삭제한다(더 이상 부모로 승격하지 않음 — orphan 방지).
    mode: "trash"(휴지통, 기본) | "permanent"(완전삭제) — 노트 삭제와 동일한 정책. */
export async function deleteWorkspaceFolder(folderId: string, mode: "trash" | "permanent" = "trash") {
  if (await shouldUseDesktopVault()) {
    return deleteDesktopVaultFolder(folderId);
  }
  return authedRequest<DeleteFolderResult>(`/api/v1/folders/${folderId}?mode=${mode}`, {
    method: "DELETE",
  });
}

export async function createWorkspaceNoteFromPayload(payload: WorkspaceNoteCreatePayload) {
  if (await shouldUseDesktopVault()) {
    const created = await createDesktopVaultNote(payload);
    return {
      noteId: created.noteId,
      title: created.title,
      folderId: created.folderId,
      version: created.version,
      createdAt: created.createdAt,
    };
  }
  return authedRequest<NoteCreated>("/api/v1/notes", {
    method: "POST",
    body: JSON.stringify({
      // documentGroupId를 생략하면(undefined -> JSON.stringify가 키를 빼먹음) saveWorkspaceNoteDraft와
      // 동일하게 서버가 호출자의 default Workspace로 채운다(Ticket6). Guest/미선택 상태는 기존과 동일.
      documentGroupId: payload.documentGroupId ?? undefined,
      title: payload.title,
      markdown: payload.markdown ?? null,
      folderId: payload.folderId ?? null,
      tags: payload.tags ?? []
    })
  });
}

export async function createWorkspaceNote(note: MockNote) {
  return createWorkspaceNoteFromPayload({
    title: note.title,
    markdown: note.content,
    folderId: note.folderId ?? null,
    tags: note.tags
  });
}

export async function createWorkspaceNoteLink(sourceNoteId: string, request: WorkspaceNoteLinkCreateRequest) {
  return authedRequest<WorkspaceNoteLinkData>(`/api/v1/notes/${encodeURIComponent(sourceNoteId)}/links`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function updateWorkspaceNoteContent(note: MockNote) {
  if (await shouldUseDesktopVault()) {
    return saveDesktopVaultNoteContent(note.id, note.content, note.version ?? 1);
  }
  return authedRequest<NoteSaveResult>(`/api/v1/notes/${note.id}/content`, {
    method: "PUT",
    body: JSON.stringify({
      baseVersion: note.version ?? 1,
      markdown: note.content,
      clientSavedAt: new Date().toISOString()
    })
  });
}

export async function updateWorkspaceNoteMetadata(note: MockNote) {
  if (await shouldUseDesktopVault()) {
    return saveDesktopVaultNoteMetadata({
      noteId: note.id,
      title: note.title,
      folderId: note.folderId ?? null,
      tags: note.tags,
      typography: note.typography ?? null,
    });
  }
  return authedRequest<NoteMetadataResult>(`/api/v1/notes/${note.id}/metadata`, {
    method: "PATCH",
    body: JSON.stringify({
      title: note.title,
      folderId: note.folderId ?? null,
      tags: note.tags,
      typography: note.typography ?? null
    })
  });
}

export async function issueWorkspaceNoteDraftId() {
  if (await shouldUseDesktopVault()) {
    return {
      noteId: `vault_note_draft_${globalThis.crypto.randomUUID()}`,
      actorType: "USER" as const,
      issuedAt: new Date().toISOString(),
      status: "DRAFT_ID_ISSUED" as const,
    };
  }
  return authedRequest<NoteDraftIdResult>("/api/v1/notes/draft-ids", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function saveWorkspaceNoteDraft(note: MockNote) {
  if (await shouldUseDesktopVault()) {
    return {
      noteId: note.id,
      actorType: "USER" as const,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "DRAFT_SAVED" as const,
    };
  }
  return authedRequest<NoteDraftSaveResult>(`/api/v1/notes/${note.id}/draft`, {
    method: "PUT",
    body: JSON.stringify({
      // SSOT NoteDraftSaveRequest.documentGroupId: 로그인 사용자가 currentWorkspaceId를 실어
      // 보내면 그 Workspace로 귀속되고, 생략하면(undefined -> JSON.stringify가 키 자체를
      // 빼먹음) 기존처럼 호출자의 default Workspace로 귀속된다 — Guest/미선택 상태에서
      // note.documentGroupId가 없는 경우는 지금까지와 동일하게 생략된다.
      documentGroupId: note.documentGroupId ?? undefined,
      title: note.title,
      markdown: note.content,
      folderId: note.folderId ?? null,
      baseVersion: note.version ?? 1,
      clientSavedAt: new Date().toISOString()
    })
  });
}

export async function getWorkspaceNoteDraft(noteId: string) {
  if (await shouldUseDesktopVault()) {
    return null;
  }
  return authedRequest<NoteDraftData | null>(`/api/v1/notes/${noteId}/draft`);
}

export async function listWorkspaceNoteDrafts() {
  if (await shouldUseDesktopVault()) {
    return { drafts: [] };
  }
  return authedRequest<NoteDraftListData>("/api/v1/notes/drafts/list");
}

/** mode: "trash"(휴지통 이동, 기본) | "permanent"(완전삭제). Guest actor는 Postgres에 노트를
    가질 수 없어 서버가 Redis draft만 지우고 성공으로 응답한다(CurrentActor 정책, 403 아님). */
export async function deleteWorkspaceNote(noteId: string, mode: "trash" | "permanent" = "trash") {
  if (await shouldUseDesktopVault()) {
    return deleteDesktopVaultNote(noteId);
  }
  return authedRequest<DeleteNoteResult>(`/api/v1/notes/${noteId}?mode=${mode}`, {
    method: "DELETE",
  });
}

export function workspaceNoteToMock(note: WorkspaceNoteItem | NoteDetail): MockNote {
  const folderId = "folder" in note ? note.folder?.folderId ?? undefined : note.folderId ?? undefined;
  return {
    id: note.noteId,
    title: note.title,
    content: note.markdown ?? "",
    tags: note.tags ?? [],
    category: "backend",
    folderId,
    documentGroupId: note.documentGroupId ?? null,
    createdAt: Date.parse(note.createdAt) || Date.now(),
    updatedAt: Date.parse(note.updatedAt) || Date.now(),
    version: note.version,
    persisted: true,
    typography: note.typography ?? undefined
  };
}

export function workspaceDraftToMock(draft: NoteDraftData): MockNote {
  const savedAt = Date.parse(draft.savedAt) || Date.now();
  return {
    id: draft.noteId,
    title: draft.title?.trim() || "제목 없음",
    content: draft.markdown ?? "",
    tags: [],
    category: "frontend",
    folderId: draft.folderId ?? undefined,
    createdAt: savedAt,
    updatedAt: savedAt,
    version: draft.baseVersion ?? 1,
    persisted: false,
  };
}

export function workspaceFolderToMock(folder: WorkspaceFolderItem): MockFolder {
  return {
    id: folder.folderId,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
    documentGroupId: folder.documentGroupId ?? null,
  };
}

// ─── 공유 링크 ───────────────────────────────────────────────────────────────

export type ShareLinkData = {
  shareId: string;
  url: string;
  permission: "READ" | "EDIT";
  expiresAt: string;
  revoked: boolean;
};

export type PublicSharedNoteData = {
  shareId: string;
  noteId: string;
  title: string;
  markdown: string;
  author: { nickname: string };
  permission: string;
  expiresAt: string;
  linkedShares: Record<string, string>; // title or noteId → share URL
};

export async function listShareLinks(noteId: string): Promise<ShareLinkData[]> {
  return authedRequest<ShareLinkData[]>(`/api/v1/notes/${encodeURIComponent(noteId)}/share-links`);
}

export async function createShareLink(
  noteId: string,
  permission: "READ" | "EDIT",
  expiresAt: string
): Promise<ShareLinkData> {
  return authedRequest<ShareLinkData>("/api/v1/share-links", {
    method: "POST",
    body: JSON.stringify({ noteId, permission, expiresAt }),
  });
}

export async function revokeShareLink(shareId: string): Promise<ShareLinkData> {
  return authedRequest<ShareLinkData>(`/api/v1/share-links/${encodeURIComponent(shareId)}`, {
    method: "PATCH",
    body: JSON.stringify({ revoked: true, expiresAt: null }),
  });
}

export async function getPublicShareLinkForNote(noteId: string): Promise<ShareLinkData | null> {
  const response = await fetch(`${getWorkspaceApiBaseUrl()}/api/v1/share-links/by-note/${encodeURIComponent(noteId)}`);
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { success: boolean; data?: ShareLinkData } | null;
  return payload?.success && payload.data ? payload.data : null;
}

export async function getLinkedNote(shareId: string, noteId: string): Promise<PublicSharedNoteData> {
  const response = await fetch(
    `${getWorkspaceApiBaseUrl()}/api/v1/share-links/${encodeURIComponent(shareId)}/linked-note/${encodeURIComponent(noteId)}`
  );
  const payload = (await response.json().catch(() => null)) as { success: boolean; data?: PublicSharedNoteData; error?: { code?: string; message?: string } } | null;
  if (response.status === 410 || payload?.error?.code === "SHARE_LINK_EXPIRED") throw new Error("GONE");
  if (response.status === 404 || !payload?.success || !payload.data) throw new Error("NOT_FOUND");
  return payload.data;
}

export async function getPublicSharedNote(shareId: string): Promise<PublicSharedNoteData> {
  const response = await fetch(`${getWorkspaceApiBaseUrl()}/api/v1/share-links/${encodeURIComponent(shareId)}`);
  const payload = (await response.json().catch(() => null)) as { success: boolean; data?: PublicSharedNoteData; error?: { code?: string; message?: string } } | null;
  if (response.status === 410 || payload?.error?.code === "SHARE_LINK_EXPIRED") {
    throw new Error("GONE");
  }
  if (response.status === 404 || payload?.error?.code === "SHARE_LINK_NOT_FOUND") {
    throw new Error("NOT_FOUND");
  }
  if (!payload?.success || !payload.data) {
    throw new Error(payload?.error?.message ?? "공유 링크를 불러올 수 없습니다.");
  }
  return payload.data;
}
