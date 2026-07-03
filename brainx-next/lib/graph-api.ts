"use client";

import { clearAuthSession, isDevAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
import { CLUSTERS, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { extractWikiLinkTargets, resolveWikiLinkByTitle } from "@/lib/wiki-links";
import type { NoteDraftData } from "@/lib/workspace-api";

const WORKSPACE_API_BASE_URL = process.env.NEXT_PUBLIC_WORKSPACE_API_BASE_URL ?? "http://localhost:8082";
export const USE_MOCK_GRAPH = process.env.NEXT_PUBLIC_GRAPH_USE_MOCK !== "false";
export const USE_MOCK_GRAPH_CLUSTERS = process.env.NEXT_PUBLIC_GRAPH_CLUSTERS_USE_MOCK !== "false";
const WORKSPACE_DEV_USER_ID = process.env.NEXT_PUBLIC_WORKSPACE_DEV_USER_ID?.trim();

export type GraphNodeData = {
  id: string;
  noteId: string;
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

async function workspaceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAuthSession();
  const useAuthenticatedSession = Boolean(session?.accessToken) && !isDevAuthSession(session);
  const useDevUserHeader = Boolean(WORKSPACE_DEV_USER_ID) && !useAuthenticatedSession;
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
  if (response.status === 401 || response.status === 403) {
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

export async function getGraph() {
  return workspaceRequest<GraphData>("/api/v1/graph");
}

export function graphToBrainXNotes(graph: GraphData): BrainXNote[] {
  const linksByNoteId = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    linksByNoteId.set(node.noteId, new Set());
  }
  for (const edge of graph.edges) {
    linksByNoteId.get(edge.source)?.add(edge.target);
    linksByNoteId.get(edge.target)?.add(edge.source);
  }

  return graph.nodes.map((node) => {
    const cluster = normalizeClusterId(node.clusterId ?? node.folderId ?? node.noteId);
    const createdAt = normalizeDate(node.createdAt);
    const updatedAt = normalizeDate(node.updatedAt);
    return {
      id: node.noteId,
      title: node.title || "Untitled",
      markdown: "",
      folderId: cluster,
      cluster,
      summary: normalizeSummary(node.summary, node.title),
      tags: node.tags ?? [],
      links: Array.from(linksByNoteId.get(node.noteId) ?? []),
      searchIndexStatus: "UNKNOWN",
      availableForAiFeatures: false,
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
    return {
      id: draft.noteId,
      title: draft.title?.trim() || "제목 없음",
      markdown: draft.markdown ?? "",
      folderId: fallbackCluster,
      cluster: fallbackCluster,
      summary: normalizeSummary(null, draft.title ?? "제목 없음"),
      tags: [],
      links: [],
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

/** 게스트는 Postgres NoteLink가 없어(구조상 의도된 정책 — graph-api 자체를 안 씀) 서버 그래프를
    받을 수 없다. 대신 draft 목록에서 `[[제목]]` 위키링크만 뽑아 로컬로 엣지를 만든다.
    knowledge-graph.ts의 deriveGraphEdges(태그/키워드 유사도 기반 mock 그래프용)는 일부러 안 쓴다 —
    로그인 사용자의 NoteLink(WIKI 타입, 실제 [[ ]] 참조만)와 같은 의미를 유지해야 로그인 후
    Graph API 그래프로 전환될 때 엣지가 갑자기 늘거나 줄어 보이지 않는다. */
export function deriveDraftWikiLinkEdges(notes: BrainXNote[]) {
  const edges: Array<{ source: string; target: string; bridge: boolean }> = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const target of extractWikiLinkTargets(note.markdown)) {
      const resolved = resolveWikiLinkByTitle(notes, target);
      if (!resolved || resolved.id === note.id) continue;
      const key = [note.id, resolved.id].sort().join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target: resolved.id, bridge: true });
    }
  }
  return edges;
}

export function graphEdgesForFlow(graph: GraphData) {
  return graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
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

function normalizeSummary(summary: string | null | undefined, title: string) {
  const text = summary?.trim();
  if (text) return text;
  return `${title} note summary has not been generated yet.`;
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
