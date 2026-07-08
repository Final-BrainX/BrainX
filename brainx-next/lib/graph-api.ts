"use client";

import { clearAuthSession, isDevAuthSession, readAuthSession, refreshAuthSessionOnce, type ApiResponse } from "@/lib/auth-api";
import { getWorkspaceApiBaseUrl } from "@/lib/api-base";
import { CLUSTERS, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { requestDesktopApiJson } from "@/lib/desktop-api-request";
import { getBrainxDesktopConfig, isElectronDesktop } from "@/lib/desktop-bridge";
import { getDesktopVaultSnapshot } from "@/lib/desktop-vault";
import { DEV_USER_ID as WORKSPACE_DEV_USER_ID } from "@/lib/dev-user";
import { extractWikiLinkTargets, resolveWikiLinkByTitle } from "@/lib/wiki-links";
import type { NoteDraftData } from "@/lib/workspace-api";

export const USE_MOCK_GRAPH = process.env.NEXT_PUBLIC_GRAPH_USE_MOCK !== "false";
export const USE_MOCK_GRAPH_CLUSTERS = process.env.NEXT_PUBLIC_GRAPH_CLUSTERS_USE_MOCK !== "false";

export type GraphNodeData = {
  id: string;
  noteId: string;
  aiSourceNoteId?: string | null;
  title: string;
  summary?: string | null;
  folderId?: string | null;
  clusterId?: string | null;
  tags?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  lastViewedAt?: string | null;
};

export type GraphEdgeData = {
  id: string;
  linkId?: string | null;
  source: string;
  target: string;
  type?: "RELATED" | "PARENT" | "CHILD" | "CAUSE" | "RESULT" | "WORKFLOW" | "REFERENCE" | "PROJECT" | "TAG" | "SIMILAR" | string;
  weight?: number | null;
  reason?: string | null;
  metadata?: {
    anchorText?: string | null;
    headingAnchor?: string | null;
    [key: string]: unknown;
  } | null;
};

export type GraphData = {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  summaries?: Record<string, unknown>;
  lastViewedAt?: string | null;
};

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function workspaceRequest<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  const useDevUserHeader = Boolean(WORKSPACE_DEV_USER_ID) && !useAuthenticatedSession;
  const requestInit: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(useDevUserHeader ? { "X-User-Id": WORKSPACE_DEV_USER_ID } : {}),
      ...(useAuthenticatedSession ? { Authorization: `${session?.tokenType ?? "Bearer"} ${session?.accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  };
  const desktopResponse = await requestDesktopApiJson<ApiResponse<T>>(path, requestInit);
  const response = desktopResponse
    ? { ok: desktopResponse.ok, status: desktopResponse.status }
    : await fetch(`${getWorkspaceApiBaseUrl()}${path}`, requestInit);
  const payload = desktopResponse
    ? desktopResponse.payload
    : ((await (response as Response).json().catch(() => null)) as ApiResponse<T> | null);
  if (response.status === 401 || response.status === 403) {
    if (!retried && session?.refreshToken && (await refreshAuthSessionOnce())) {
      return workspaceRequest<T>(path, init, true);
    }
    clearAuthSession();
    throw new Error("Login expired. Please sign in again.");
  }
  if (!payload) {
    throw new Error("Could not read the server response.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "Could not load graph data."));
  }
  return payload.data as T;
}

async function shouldUseDesktopVaultGraph() {
  if (!isElectronDesktop()) return false;
  const config = await getBrainxDesktopConfig();
  return Boolean(config?.activeVault);
}

async function getDesktopVaultGraph(): Promise<GraphData> {
  const snapshot = await getDesktopVaultSnapshot();
  const notes = snapshot?.notes ?? [];
  const noteRefs = notes.map((note) => ({
    id: note.noteId,
    title: note.title,
    markdown: note.markdown,
  }));

  const edges: GraphEdgeData[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    for (const target of extractWikiLinkTargets(note.markdown)) {
      const resolved = resolveWikiLinkByTitle(noteRefs, target);
      if (!resolved || resolved.id === note.noteId) continue;
      const pairKey = [note.noteId, resolved.id].sort().join("::");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      edges.push({
        id: `vault_edge_${pairKey}`,
        source: note.noteId,
        target: resolved.id,
        type: "REFERENCE",
        weight: 1,
      });
    }
  }

  return {
    nodes: notes.map((note) => ({
      id: note.noteId,
      noteId: note.noteId,
      aiSourceNoteId: note.remoteNoteId ?? null,
      title: note.title,
      summary: note.markdown.slice(0, 160),
      folderId: note.folderId,
      tags: note.tags,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      lastViewedAt: note.updatedAt,
    })),
    edges,
    summaries: {
      mode: "desktop-vault",
      assetCount: snapshot?.assets.length ?? 0,
      folderCount: snapshot?.folders.length ?? 0,
    },
    lastViewedAt: notes[0]?.updatedAt ?? null,
  };
}

export async function getGraph() {
  if (await shouldUseDesktopVaultGraph()) {
    return getDesktopVaultGraph();
  }
  return workspaceRequest<GraphData>("/api/v1/graph");
}

export function graphToBrainXNotes(graph: GraphData): BrainXNote[] {
  const isDesktopVaultGraph = (graph.summaries as Record<string, unknown> | undefined)?.mode === "desktop-vault";
  const linksByNoteId = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    linksByNoteId.set(node.noteId, new Set());
  }
  for (const edge of graph.edges) {
    linksByNoteId.get(edge.source)?.add(edge.target);
    linksByNoteId.get(edge.target)?.add(edge.source);
  }

  return graph.nodes.map((node) => {
    const title = node.title?.trim() || "Untitled";
    const cluster = normalizeClusterId(node.clusterId ?? node.folderId ?? node.noteId);
    const createdAt = normalizeDate(node.createdAt);
    const updatedAt = normalizeDate(node.updatedAt);
    const aiSourceNoteId = node.aiSourceNoteId ?? (isDesktopVaultGraph ? null : node.noteId);
    return {
      id: node.noteId,
      aiSourceNoteId,
      title,
      markdown: "",
      folderId: cluster,
      cluster,
      summary: normalizeSummary(node.summary),
      tags: node.tags ?? [],
      links: Array.from(linksByNoteId.get(node.noteId) ?? []),
      searchIndexStatus: "UNKNOWN",
      availableForAiFeatures: Boolean(aiSourceNoteId),
      indexedAt: null,
      updated: relativeUpdatedLabel(node.updatedAt ?? node.lastViewedAt),
      words: 0,
      isFavorite: false,
      createdAt,
      updatedAt,
      version: 1
    };
  });
}

/** Guest actor의 노트는 Postgres에 없고 Redis draft로만 존재해(CurrentActor GUEST 정책)
    User 전용 `/api/v1/graph`(Postgres 기반, AI 클러스터링/링크 포함)로는 보이지 않는다. draft
    목록을 연결선 없는 단일 노드 그래프로 보여줘 "노트 생성 시 마인드맵에도 반영"되게 한다 —
    AI 링크/클러스터링은 로그인 후 claim되어 실제로 처리된 뒤에야 의미가 있다. */
export function draftsToBrainXNotes(drafts: NoteDraftData[]): BrainXNote[] {
  return drafts.map((draft) => {
    const fallbackCluster = CLUSTERS[0].id;
    const title = draft.title?.trim() || "제목 없음";
    return {
      id: draft.noteId,
      aiSourceNoteId: null,
      title,
      markdown: draft.markdown ?? "",
      folderId: fallbackCluster,
      cluster: fallbackCluster,
      summary: normalizeSummary(null),
      tags: [],
      links: [],
      documentGroupId: draft.documentGroupId ?? null,
      searchIndexStatus: "UNKNOWN",
      availableForAiFeatures: false,
      indexedAt: null,
      updated: relativeUpdatedLabel(draft.savedAt),
      words: 0,
      isFavorite: false,
      createdAt: normalizeDate(draft.savedAt),
      updatedAt: normalizeDate(draft.savedAt),
      version: draft.baseVersion ?? 1
    };
  });
}

/** 방금 만든 노트(lib/notes/pending-created-note-cache.ts — 위키링크로 만든 노트뿐 아니라
    일반 "+ 새 노트"/우클릭 새 노트도 전부 포함)를 서버 응답이 아직 없어도 그래프에
    optimistic하게 보여주기 위한 최소 placeholder. markdown은 비워둔다 — 위키링크로 만든
    경우라면 이 노드 자체의 본문이 아니라, 소스 노트 쪽에 이미 저장된 `[[title]]` 텍스트가
    deriveGraphEdges의 제목 매칭으로 이 노드를 찾아 연결선을 만들어줄 수 있고(그래도 안 잡히는
    타이밍은 아래 pendingWikiLinkEntryToEdge가 보강한다), 일반 새 노트라면 애초에 edge가
    필요 없으므로 markdown 내용 자체는 중요하지 않다. */
export function pendingCreatedNoteToBrainXNote(entry: {
  noteId: string;
  title: string;
  createdAt: number;
}): BrainXNote {
  const fallbackCluster = CLUSTERS[0].id;
  const createdAt = new Date(entry.createdAt).toISOString();
  return {
    id: entry.noteId,
    aiSourceNoteId: null,
    title: entry.title,
    markdown: "",
    folderId: fallbackCluster,
    cluster: fallbackCluster,
    summary: "",
    tags: [],
    links: [],
    searchIndexStatus: "UNKNOWN",
    availableForAiFeatures: false,
    indexedAt: null,
    updated: "just now",
    words: 0,
    isFavorite: false,
    createdAt,
    updatedAt: createdAt,
    version: 1
  };
}

/** pending wikilink 항목(sourceNoteId → noteId)을 optimistic edge로 직접 만든다. 소스 노트의
    저장된 markdown에서 `[[title]]`을 찾아 제목 매칭으로 연결선을 만드는 deriveGraphEdges/
    deriveDraftWikiLinkEdges에 기대지 않는 이유: 그 방식은 소스 노트 자신의 서버 저장(콘텐츠
    PUT/draft 저장)까지 끝나야 하는데, 그 저장도 비동기라 그래프 새 마운트 시점에는 아직 안
    끝났을 수 있다 — 노드(A)는 optimistic하게 보이는데 edge만 안 보이는 정확히 그 증상의
    원인이었다. edge는 어느 쪽 저장 상태와도 무관하게, pending 항목 자체(생성 시점에 이미
    알고 있는 source/target)만으로 즉시 만든다. */
export function pendingWikiLinkEntryToEdge(entry: {
  sourceNoteId: string;
  noteId: string;
  title: string;
}) {
  return {
    source: entry.sourceNoteId,
    target: entry.noteId,
    type: "REFERENCE" as const,
    weight: 0.95,
    reason: `${entry.sourceNoteId} 노트의 위키링크가 "${entry.title}"를 참조합니다(optimistic).`,
    bridge: true
  };
}

/** 게스트는 Postgres NoteLink가 없어(구조상 의도된 정책 — graph-api 자체를 안 씀) 서버 그래프를
    받을 수 없다. 대신 draft 목록에서 `[[제목]]` 위키링크만 뽑아 로컬로 엣지를 만든다.
    knowledge-graph.ts의 deriveGraphEdges(태그/키워드 유사도 기반 mock 그래프용)는 일부러 안 쓴다 —
    로그인 사용자의 NoteLink(WIKI 타입, 실제 [[ ]] 참조만)와 같은 의미를 유지해야 로그인 후
    Graph API 그래프로 전환될 때 엣지가 갑자기 늘거나 줄어 보이지 않는다. */
export function deriveDraftWikiLinkEdges(notes: BrainXNote[]) {
  const edges: Array<{ source: string; target: string; bridge: boolean; type: "REFERENCE" }> = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const target of extractWikiLinkTargets(note.markdown)) {
      const resolved = resolveWikiLinkByTitle(notes, target);
      if (!resolved || resolved.id === note.id) continue;
      const key = [note.id, resolved.id].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target: resolved.id, bridge: true, type: "REFERENCE" });
    }
  }
  return edges;
}

export function graphEdgesForFlow(graph: GraphData) {
  return graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    bridge: edge.type !== "TAG" && edge.type !== "RELATED"
  }));
}

function normalizeClusterId(value: string): ClusterId {
  if (CLUSTERS.some((cluster) => cluster.id === value)) {
    return value as ClusterId;
  }
  const ids = CLUSTERS.map((cluster) => cluster.id);
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return ids[Math.abs(hash) % ids.length];
}

function normalizeSummary(summary: string | null | undefined) {
  const text = summary?.trim();
  if (text) return text;
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
