import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAiClustersToNotes,
  applyDerivedClustersToNotes,
  deriveNoteClusterMeta,
  UNASSIGNED_CLUSTER_ID,
} from "./ai-cluster-projection.ts";
import type { BrainXNote } from "./brainx-data.ts";
import type { ClusterJobLatestData } from "./intelligence-api.ts";

function note(overrides: Partial<BrainXNote>): BrainXNote {
  return {
    id: "note-1",
    aiSourceNoteId: null,
    title: "Note",
    markdown: "",
    folderId: "cluster-1",
    cluster: "cluster-1",
    summary: "",
    tags: [],
    links: [],
    updated: "just now",
    words: 0,
    isFavorite: false,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("applyDerivedClustersToNotes merges unlabeled fallback clusters into one unassigned cluster", () => {
  const result = applyDerivedClustersToNotes([
    note({ id: "note-1", cluster: "folder-a", folderId: "folder-a", clusterSource: "fallback" }),
    note({ id: "note-2", cluster: "folder-b", folderId: "folder-b", clusterSource: "fallback" }),
  ]);

  assert.deepEqual(result.clusters.map((cluster) => [cluster.id, cluster.label]), [
    [UNASSIGNED_CLUSTER_ID, "미분류"],
  ]);
  assert.deepEqual(result.notes.map((item) => item.cluster), [
    UNASSIGNED_CLUSTER_ID,
    UNASSIGNED_CLUSTER_ID,
  ]);
});

test("applyDerivedClustersToNotes preserves explicit backend cluster ids without tags", () => {
  const result = applyDerivedClustersToNotes([
    note({ id: "note-1", cluster: "server-cluster-a", folderId: "server-cluster-a", clusterSource: "explicit" }),
    note({ id: "note-2", cluster: "server-cluster-b", folderId: "server-cluster-b", clusterSource: "explicit" }),
  ]);

  assert.deepEqual(result.clusters.map((cluster) => [cluster.id, cluster.label]), [
    ["server-cluster-a", "server-cluster-a"],
    ["server-cluster-b", "server-cluster-b"],
  ]);
  assert.deepEqual(result.notes.map((item) => item.cluster), [
    "server-cluster-a",
    "server-cluster-b",
  ]);
});

test("deriveNoteClusterMeta keeps tag-derived labels for labeled clusters", () => {
  const clusters = deriveNoteClusterMeta([
    note({ id: "note-1", cluster: "topic-a", tags: ["graph-ai", "generated"] }),
    note({ id: "note-2", cluster: "topic-a", tags: ["graph-ai"] }),
  ]);

  assert.deepEqual(clusters.map((cluster) => [cluster.id, cluster.label]), [
    ["topic-a", "graph-ai"],
  ]);
});

test("applyAiClustersToNotes keeps AI unassigned as a single cluster", () => {
  const latest: ClusterJobLatestData = {
    documentGroupId: "default",
    searchableNoteCount: 2,
    latestNoteUpdatedAt: "2026-07-08T00:00:00.000Z",
    state: "FRESH",
    job: {
      clusterJobId: "job-1",
      documentGroupId: "default",
      status: "COMPLETED",
      clusters: [
        {
          clusterId: "ai-cluster-1",
          title: "Graph AI",
          summary: "Graph notes",
          noteIds: ["source-1"],
          keywords: ["graph"],
          confidence: 0.9,
        },
      ],
      createdAt: "2026-07-08T00:00:00.000Z",
      completedAt: "2026-07-08T00:00:01.000Z",
      failureMessage: null,
    },
  };

  const result = applyAiClustersToNotes([
    note({ id: "note-1", aiSourceNoteId: "source-1" }),
    note({ id: "note-2", aiSourceNoteId: "source-2" }),
  ], latest);

  assert.deepEqual(result.clusters?.map((cluster) => [cluster.id, cluster.label]), [
    ["ai-cluster-1", "Graph AI"],
    [UNASSIGNED_CLUSTER_ID, "미분류"],
  ]);
  assert.deepEqual(result.notes.map((item) => item.cluster), [
    "ai-cluster-1",
    UNASSIGNED_CLUSTER_ID,
  ]);
});
