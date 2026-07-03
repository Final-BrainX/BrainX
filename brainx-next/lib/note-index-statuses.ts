"use client";

import type { BrainXNote } from "@/lib/brainx-data";
import {
  getNoteIndexStatuses,
  IntelligenceAuthRequiredError,
  type NoteIndexStatusesData
} from "@/lib/intelligence-api";

const NOTE_INDEX_STATUS_BATCH_SIZE = 200;

export function withUnknownNoteIndexStatus(note: BrainXNote): BrainXNote {
  return {
    ...note,
    searchIndexStatus: note.searchIndexStatus ?? "UNKNOWN",
    availableForAiFeatures: note.availableForAiFeatures ?? false,
    indexedAt: note.indexedAt ?? null,
    indexStatusUnavailable: note.indexStatusUnavailable ?? false
  };
}

function withUnavailableNoteIndexStatus(note: BrainXNote): BrainXNote {
  return {
    ...note,
    searchIndexStatus: note.searchIndexStatus ?? "UNKNOWN",
    availableForAiFeatures: note.availableForAiFeatures ?? true,
    indexedAt: note.indexedAt ?? null,
    indexStatusUnavailable: true
  };
}

export async function mergeNoteIndexStatuses(
  notes: BrainXNote[],
  documentGroupId?: string | null
): Promise<BrainXNote[]> {
  const baseNotes = notes.map(withUnknownNoteIndexStatus);
  const noteIds = baseNotes.map((note) => note.id);
  if (noteIds.length === 0) return baseNotes;

  try {
    const statusEntries: NoteIndexStatusesData["notes"] = [];
    for (let index = 0; index < noteIds.length; index += NOTE_INDEX_STATUS_BATCH_SIZE) {
      const batchIds = noteIds.slice(index, index + NOTE_INDEX_STATUS_BATCH_SIZE);
      const result = await getNoteIndexStatuses({
        ...(documentGroupId ? { documentGroupId } : {}),
        noteIds: batchIds
      });
      statusEntries.push(...result.notes);
    }
    const statusesById = new Map(statusEntries.map((note) => [note.noteId, note]));
    return baseNotes.map((note) => {
      const status = statusesById.get(note.id);
      if (!status) return note;
      return {
        ...note,
        searchIndexStatus: status.searchIndexStatus,
        availableForAiFeatures: status.availableForAiFeatures,
        indexedAt: status.indexedAt ?? null,
        indexStatusUnavailable: false
      };
    });
  } catch (error) {
    if (error instanceof IntelligenceAuthRequiredError) {
      throw error;
    }
    console.warn("Failed to load note index statuses. Falling back to legacy graph note availability.", error);
    return notes.map(withUnavailableNoteIndexStatus);
  }
}
