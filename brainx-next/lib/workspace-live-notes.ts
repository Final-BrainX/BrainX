"use client";

import { CLUSTERS, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { getGraph, graphEdgesForFlow } from "@/lib/graph-api";
import { mergeNoteIndexStatuses } from "@/lib/note-index-statuses";
import { listNotes, type WorkspaceNoteItem } from "@/lib/workspace-api";
import { countWords, stripMarkdown } from "@/lib/utils";

const clusterIds = CLUSTERS.map((cluster) => cluster.id);

export async function loadWorkspaceBrainXNotes(): Promise<BrainXNote[]> {
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
  const cluster = normalizeClusterId(note.folderId ?? note.noteId);
  return {
    id: note.noteId,
    title: note.title || "Untitled",
    markdown,
    folderId: cluster,
    cluster,
    summary: summarize(markdown, note.title),
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

function summarize(markdown: string, title: string) {
  const text = stripMarkdown(markdown);
  if (text) return text.slice(0, 140);
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
