"use client";

import { getLocalStoredValue, setLocalStoredValue } from "../client-storage.ts";

export const NOTE_VIEW_HISTORY_CHANGED_EVENT = "brainx:note-view-history-changed";

const STORAGE_PREFIX = "brainx_note_view_history_v1";
const MAX_HISTORY_ENTRIES = 1000;

export type NoteViewHistory = Record<string, number>;

export type NoteViewHistoryScope = {
  userId?: string | null;
  documentGroupId?: string | null;
};

function scopePart(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? encodeURIComponent(normalized) : fallback;
}

export function noteViewHistoryStorageKey(scope: NoteViewHistoryScope = {}) {
  return `${STORAGE_PREFIX}:${scopePart(scope.userId, "guest")}:${scopePart(scope.documentGroupId, "local")}`;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function parseNoteViewHistory(raw: string | null | undefined): NoteViewHistory {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: NoteViewHistory = {};
    for (const [noteId, viewedAt] of Object.entries(parsed)) {
      const normalizedNoteId = noteId.trim();
      if (!normalizedNoteId || !validTimestamp(viewedAt)) continue;
      result[normalizedNoteId] = viewedAt;
    }
    return result;
  } catch {
    return {};
  }
}

export function normalizeNoteViewHistory(history: NoteViewHistory, limit = MAX_HISTORY_ENTRIES): NoteViewHistory {
  return Object.fromEntries(
    Object.entries(history)
      .filter(([noteId, viewedAt]) => noteId.trim().length > 0 && validTimestamp(viewedAt))
      .sort((left, right) => right[1] - left[1])
      .slice(0, Math.max(0, limit))
  );
}

export function serializeNoteViewHistory(history: NoteViewHistory) {
  return JSON.stringify(normalizeNoteViewHistory(history));
}

export function readNoteViewHistory(scope: NoteViewHistoryScope = {}): NoteViewHistory {
  try {
    return parseNoteViewHistory(getLocalStoredValue(noteViewHistoryStorageKey(scope)));
  } catch {
    return {};
  }
}

export function recordNoteViewed(
  noteId: string,
  scope: NoteViewHistoryScope = {},
  viewedAt = Date.now()
) {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId || !validTimestamp(viewedAt)) return;

  const storageKey = noteViewHistoryStorageKey(scope);
  const next = {
    ...readNoteViewHistory(scope),
    [normalizedNoteId]: viewedAt,
  };

  try {
    setLocalStoredValue(storageKey, serializeNoteViewHistory(next));
  } catch {
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTE_VIEW_HISTORY_CHANGED_EVENT, {
      detail: {
        noteId: normalizedNoteId,
        viewedAt,
        storageKey,
      },
    }));
  }
}
