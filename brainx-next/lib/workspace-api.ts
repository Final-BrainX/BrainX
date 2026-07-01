"use client";

import { clearAuthSession, isDevAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
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

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
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
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

export async function getNote(noteId: string) {
  return authedRequest<NoteDetail>(`/api/v1/notes/${noteId}`);
}

export async function listNotes() {
  return authedRequest<NoteListData>("/api/v1/notes");
}

export async function listFolders() {
  return authedRequest<FolderTreeData>("/api/v1/folders/tree");
}

export async function getMyWorkspaceStats() {
  return authedRequest<WorkspaceUserStatsData>("/api/v1/workspace/me/stats");
}

export async function createWorkspaceFolder(name: string, parentFolderId: string | null) {
  return authedRequest<WorkspaceFolderItem>("/api/v1/folders", {
    method: "POST",
    body: JSON.stringify({ name, parentFolderId }),
  });
}

export async function patchWorkspaceFolder(
  folderId: string,
  patch: { name?: string; parentFolderId?: string | null }
) {
  return authedRequest<WorkspaceFolderItem>(`/api/v1/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** 하위 폴더/노트를 전부 cascade로 삭제한다(더 이상 부모로 승격하지 않음 — orphan 방지).
    mode: "trash"(휴지통, 기본) | "permanent"(완전삭제) — 노트 삭제와 동일한 정책. */
export async function deleteWorkspaceFolder(folderId: string, mode: "trash" | "permanent" = "trash") {
  return authedRequest<DeleteFolderResult>(`/api/v1/folders/${folderId}?mode=${mode}`, {
    method: "DELETE",
  });
}

export async function createWorkspaceNoteFromPayload(payload: WorkspaceNoteCreatePayload) {
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
  return authedRequest<NoteDraftIdResult>("/api/v1/notes/draft-ids", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function saveWorkspaceNoteDraft(note: MockNote) {
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
  return authedRequest<NoteDraftData | null>(`/api/v1/notes/${noteId}/draft`);
}

export async function listWorkspaceNoteDrafts() {
  return authedRequest<NoteDraftListData>("/api/v1/notes/drafts/list");
}

/** mode: "trash"(휴지통 이동, 기본) | "permanent"(완전삭제). Guest actor는 Postgres에 노트를
    가질 수 없어 서버가 Redis draft만 지우고 성공으로 응답한다(CurrentActor 정책, 403 아님). */
export async function deleteWorkspaceNote(noteId: string, mode: "trash" | "permanent" = "trash") {
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
