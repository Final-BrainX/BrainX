"use client";

import { clearAuthSession, isDemoSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
import type { MockFolder, MockNote, NoteTypography } from "@/lib/notes/noteTypes";

const WORKSPACE_API_BASE_URL = process.env.NEXT_PUBLIC_WORKSPACE_API_BASE_URL ?? "http://localhost:8082";
export const USE_MOCK_NOTES = process.env.NEXT_PUBLIC_NOTES_USE_MOCK !== "false";

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

export type NoteDraftData = {
  noteId: string;
  actorType: "USER" | "GUEST";
  title: string | null;
  markdown: string;
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

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAuthSession();

  if (USE_MOCK_NOTES && session?.accessToken && isDemoSession(session)) {
    return demoWorkspaceResponse<T>(path);
  }

  // TEMP: 로그인 없이 Notion 가져오기 기능 테스트용. 실제 로그인 연동 완료 후
  // 아래 두 줄을 제거하고 session?.accessToken이 없으면 에러를 던지도록 되돌릴 것.
  const response = await fetch(`${WORKSPACE_API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}` } : {}),
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

function demoWorkspaceResponse<T>(path: string): T {
  const noteId = path.split("/").pop() ?? "demo-note";
  return {
    noteId,
    title: "데모 노트",
    markdown: "Notion에서 가져온 데모 노트 본문입니다.",
    folder: null,
    tags: ["notion"],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } as T;
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

export async function createWorkspaceNote(note: MockNote) {
  return authedRequest<NoteCreated>("/api/v1/notes", {
    method: "POST",
    body: JSON.stringify({
      title: note.title,
      markdown: note.content,
      folderId: note.folderId ?? null,
      tags: note.tags
    })
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
