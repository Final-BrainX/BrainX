"use client";

import { CLUSTERS, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { draftsToBrainXNotes, deriveDraftWikiLinkEdges, getGraph, graphEdgesForFlow } from "@/lib/graph-api";
import { mergeNoteIndexStatuses } from "@/lib/note-index-statuses";
import { hasWorkspaceUserIdentity, listNotes, listWorkspaceNoteDrafts, type WorkspaceNoteItem } from "@/lib/workspace-api";
import { countWords, stripMarkdown } from "@/lib/utils";

const clusterIds = CLUSTERS.map((cluster) => cluster.id);

/** 게스트(Workspace-Service가 GUEST actor로 취급하는 세션)는 노트가 Postgres가 아니라 Redis
    draft로만 존재한다(graph-api.ts의 draftsToBrainXNotes/deriveDraftWikiLinkEdges와 같은 이유 —
    CurrentActor GUEST 정책). 여기서 listNotes()(`/api/v1/notes`, Postgres 전용)를 그대로 쓰면
    게스트는 항상 빈 목록을 받아 새로고침할 때마다 방금 만든 노트가 에디터/탐색기에서도 사라지고,
    그래서 그래프에도 반영될 수 없었다 — draft 목록 경로로 갈아탄다.
    "게스트 여부"는 JWT 세션 유무만으로 판단하면 안 된다 — 로컬 개발에서 `NEXT_PUBLIC_
    WORKSPACE_DEV_USER_ID`가 설정돼 있으면 JWT가 없어도 모든 workspace 요청에 X-User-Id가 실려
    Workspace-Service가 실제로는 USER(Postgres)로 처리한다(hasWorkspaceUserIdentity 참고). 이
    판정과 어긋나면 로컬에서만 "저장은 USER로 됐는데 조회는 GUEST draft 경로로 해서 새로고침 후
    사라지는" 불일치가 난다. */
export async function loadWorkspaceBrainXNotes(): Promise<BrainXNote[]> {
  if (!hasWorkspaceUserIdentity()) {
    const { drafts } = await listWorkspaceNoteDrafts();
    const draftNotes = draftsToBrainXNotes(drafts);
    const edges = deriveDraftWikiLinkEdges(draftNotes);
    const linksByNoteId = new Map<string, Set<string>>();
    for (const note of draftNotes) linksByNoteId.set(note.id, new Set());
    for (const edge of edges) {
      linksByNoteId.get(edge.source)?.add(edge.target);
      linksByNoteId.get(edge.target)?.add(edge.source);
    }
    return draftNotes.map((note) => ({ ...note, links: Array.from(linksByNoteId.get(note.id) ?? []) }));
  }

  const [noteData, graphData] = await Promise.all([
    listNotes(),
    getGraph().catch(() => null),
  ]);

  const linksByNoteId = new Map<string, Set<string>>();
  if (graphData) {
    for (const edge of graphEdgesForFlow(graphData)) {
      if (!linksByNoteId.has(edge.source)) linksByNoteId.set(edge.source, new Set());
      if (!linksByNoteId.has(edge.target)) linksByNoteId.set(edge.target, new Set());
      linksByNoteId.get(edge.source)?.add(edge.target);
      linksByNoteId.get(edge.target)?.add(edge.source);
    }
  }

  const notes = noteData.notes.map((note) => workspaceItemToBrainXNote(note, linksByNoteId.get(note.noteId)));
  return mergeNoteIndexStatuses(notes);
}

function workspaceItemToBrainXNote(note: WorkspaceNoteItem, links: Set<string> | undefined): BrainXNote {
  const markdown = note.markdown ?? "";
  const title = note.title?.trim() || "Untitled";
  const cluster = normalizeClusterId(note.folderId ?? note.noteId);
  return {
    id: note.noteId,
    title,
    markdown,
    folderId: cluster,
    cluster,
    summary: summarize(markdown),
    tags: note.tags ?? [],
    links: Array.from(links ?? []),
    searchIndexStatus: "UNKNOWN",
    availableForAiFeatures: false,
    indexedAt: null,
    updated: relativeUpdatedLabel(note.updatedAt),
    words: countWords(stripMarkdown(markdown)),
    isFavorite: false,
    createdAt: normalizeDate(note.createdAt),
    updatedAt: normalizeDate(note.updatedAt),
    version: note.version,
  };
}

function normalizeClusterId(value: string): ClusterId {
  if (clusterIds.includes(value as ClusterId)) return value as ClusterId;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return clusterIds[Math.abs(hash) % clusterIds.length];
}

function summarize(markdown: string) {
  const text = stripMarkdown(markdown).trim();
  if (text) return text.slice(0, 140);
  return "";
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return new Date().toISOString();
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function relativeUpdatedLabel(value: string | null | undefined) {
  if (!value) return "just now";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "just now";
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}
