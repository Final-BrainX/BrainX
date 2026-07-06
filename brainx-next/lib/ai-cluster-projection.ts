"use client";

import type { BrainXNote } from "@/lib/brainx-data";
import type { ClusterJobData, ClusterJobLatestData } from "@/lib/intelligence-api";

export type AiClusterStatus = "idle" | "loading" | "analyzing" | "error";

export type AiClusterMeta = {
  id: string;
  label: string;
  color: string;
  summary?: string;
  keywords: string[];
  confidence?: number;
};

type NormalizedAiCluster = AiClusterMeta & {
  noteIds: string[];
};

export const DEFAULT_DOCUMENT_GROUP_ID = "default";
export const AI_CLUSTER_MIN_NOTES = 5;
export const AI_CLUSTER_MAX_NOTES = 50;
export const AI_CLUSTER_MAX_CLUSTERS = 6;
export const UNASSIGNED_CLUSTER_ID = "ai-unassigned";

export const AI_CLUSTER_COLORS = [
  "59 130 246",
  "139 92 246",
  "34 211 238",
  "244 114 182",
  "52 211 153",
  "245 158 11",
  "14 165 233",
  "236 72 153",
  "132 204 22",
  "168 85 247",
  "20 184 166",
  "248 113 113"
];

export const UNASSIGNED_CLUSTER: AiClusterMeta = {
  id: UNASSIGNED_CLUSTER_ID,
  label: "미분류",
  color: "148 163 184",
  summary: "최근 AI 클러스터 결과에 포함되지 않은 노트입니다.",
  keywords: [],
};

export function isAiFeatureReadyNote(note: BrainXNote) {
  return note.availableForAiFeatures === true;
}

export function aiClusterJobUsable(job: ClusterJobData | null | undefined): job is ClusterJobData {
  return !!job && job.status === "COMPLETED" && Array.isArray(job.clusters) && job.clusters.length > 0;
}

export function resolveAiCluster(clusterId: string, clusterMetaById: Map<string, AiClusterMeta>): AiClusterMeta {
  const known = clusterMetaById.get(clusterId);
  if (known) return known;
  return {
    id: clusterId,
    label: "미분류",
    color: UNASSIGNED_CLUSTER.color,
    keywords: [],
  };
}

export function deriveNoteClusterMeta(notes: BrainXNote[]): AiClusterMeta[] {
  const groups = new Map<string, { tags: Map<string, number>; firstIndex: number }>();
  notes.forEach((note, index) => {
    const clusterId = note.cluster?.trim() || UNASSIGNED_CLUSTER_ID;
    const current = groups.get(clusterId) ?? { tags: new Map<string, number>(), firstIndex: index };
    for (const tag of note.tags) {
      const normalized = tag.trim();
      if (!normalized) continue;
      current.tags.set(normalized, (current.tags.get(normalized) ?? 0) + 1);
    }
    groups.set(clusterId, current);
  });

  return [...groups.entries()]
    .sort((a, b) => a[1].firstIndex - b[1].firstIndex)
    .map(([id, group], index) => {
      const label = [...group.tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0]?.[0] ?? "미분류";
      return {
        id,
        label,
        color: id === UNASSIGNED_CLUSTER_ID ? UNASSIGNED_CLUSTER.color : AI_CLUSTER_COLORS[index % AI_CLUSTER_COLORS.length],
        keywords: [...group.tags.keys()].slice(0, 6),
      };
    });
}

export function applyAiClustersToNotes(notes: BrainXNote[], latest: ClusterJobLatestData | null) {
  const job = latest?.job;
  if (!aiClusterJobUsable(job)) {
    return { notes, clusters: null as AiClusterMeta[] | null };
  }

  const aiSourceNoteIds = new Set(notes.map((note) => note.aiSourceNoteId ?? note.id));
  const normalizedClusters = (job.clusters ?? [])
    .map((cluster, index) => normalizeAiCluster(cluster, index, aiSourceNoteIds))
    .filter((cluster): cluster is NormalizedAiCluster => !!cluster);
  if (normalizedClusters.length === 0) {
    return { notes, clusters: null as AiClusterMeta[] | null };
  }

  const clusterByNoteId = new Map<string, string>();
  for (const cluster of normalizedClusters) {
    for (const noteId of cluster.noteIds) {
      if (!clusterByNoteId.has(noteId)) {
        clusterByNoteId.set(noteId, cluster.id);
      }
    }
  }

  let hasUnassigned = false;
  const clusteredNotes = notes.map((note) => {
    const clusterId = clusterByNoteId.get(note.aiSourceNoteId ?? note.id);
    if (!clusterId) {
      hasUnassigned = true;
      return { ...note, cluster: UNASSIGNED_CLUSTER_ID, folderId: UNASSIGNED_CLUSTER_ID };
    }
    return { ...note, cluster: clusterId, folderId: clusterId };
  });
  const clusters: AiClusterMeta[] = normalizedClusters.map(({ noteIds: _noteIds, ...cluster }) => cluster);
  if (hasUnassigned) {
    clusters.push(UNASSIGNED_CLUSTER);
  }
  return { notes: clusteredNotes, clusters };
}

function normalizeAiCluster(raw: unknown, index: number, existingNoteIds: Set<string>): NormalizedAiCluster | null {
  if (!isRecord(raw)) return null;
  const noteIds = stringArrayField(raw.noteIds).filter((noteId) => existingNoteIds.has(noteId));
  if (noteIds.length === 0) return null;
  const clusterId = textField(raw.clusterId) || `ai-cluster-${index + 1}`;
  const title = textField(raw.title) || `AI 클러스터 ${index + 1}`;
  return {
    id: clusterId,
    label: title,
    color: AI_CLUSTER_COLORS[index % AI_CLUSTER_COLORS.length],
    summary: textField(raw.summary) || undefined,
    keywords: stringArrayField(raw.keywords),
    confidence: numberField(raw.confidence),
    noteIds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringArrayField(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}
