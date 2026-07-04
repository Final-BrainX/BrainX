"use client";
import { clearAuthSession, isDevAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
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
import type { MockFolder, MockNote, NoteTypography } from "@/lib/notes/noteTypes";

const WORKSPACE_API_BASE_URL = process.env.NEXT_PUBLIC_WORKSPACE_API_BASE_URL ?? "http://localhost:8082";
export const USE_MOCK_NOTES = process.env.NEXT_PUBLIC_NOTES_USE_MOCK !== "false";
const WORKSPACE_DEV_USER_ID = process.env.NEXT_PUBLIC_WORKSPACE_DEV_USER_ID?.trim();

export type NoteDetail = {
  noteId: string;
  title: string;
  markdown: string;
  folder: { folderId: string; name: string } | null;
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

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  const useDevUserHeader = Boolean(WORKSPACE_DEV_USER_ID) && !useAuthenticatedSession;

  // session이 없으면(비회원) Authorization 헤더 없이 호출한다 — Gateway가 guest cookie/
  // X-Guest-Id를 발급해 Workspace-Service가 GUEST actor로 처리한다.
  const response = await fetch(`${WORKSPACE_API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(useDevUserHeader ? { "X-User-Id": WORKSPACE_DEV_USER_ID } : {}),
      ...(useAuthenticatedSession ? { Authorization: `${session?.tokenType ?? "Bearer"} ${session?.accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (response.status === 401) {
    clearAuthSession();
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
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

export async function getMyWorkspaceStats() {
  if (await shouldUseDesktopVault()) {
    return (
      (await getDesktopVaultWorkspaceStats()) ?? {
        noteCount: 0,
        storageBytes: 0,
        activities: [],
      }
    );
  }
  return authedRequest<WorkspaceUserStatsData>("/api/v1/workspace/me/stats");
}

export async function createWorkspaceFolder(name: string, parentFolderId: string | null) {
  if (await shouldUseDesktopVault()) {
    const created = await createDesktopVaultFolder(name, parentFolderId);
    return {
      folderId: created.folderId,
      name: created.name,
      parentFolderId: created.parentFolderId,
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
    parentFolderId: folder.parentFolderId
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
  const response = await fetch(`${WORKSPACE_API_BASE_URL}/api/v1/share-links/by-note/${encodeURIComponent(noteId)}`);
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { success: boolean; data?: ShareLinkData } | null;
  return payload?.success && payload.data ? payload.data : null;
}

export async function getLinkedNote(shareId: string, noteId: string): Promise<PublicSharedNoteData> {
  const response = await fetch(
    `${WORKSPACE_API_BASE_URL}/api/v1/share-links/${encodeURIComponent(shareId)}/linked-note/${encodeURIComponent(noteId)}`
  );
  const payload = (await response.json().catch(() => null)) as { success: boolean; data?: PublicSharedNoteData; error?: { code?: string; message?: string } } | null;
  if (response.status === 410 || payload?.error?.code === "SHARE_LINK_EXPIRED") throw new Error("GONE");
  if (response.status === 404 || !payload?.success || !payload.data) throw new Error("NOT_FOUND");
  return payload.data;
}

export async function getPublicSharedNote(shareId: string): Promise<PublicSharedNoteData> {
  const response = await fetch(`${WORKSPACE_API_BASE_URL}/api/v1/share-links/${encodeURIComponent(shareId)}`);
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
