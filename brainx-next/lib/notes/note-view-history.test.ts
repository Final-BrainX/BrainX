import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeNoteViewHistory,
  noteViewHistoryStorageKey,
  parseNoteViewHistory,
  serializeNoteViewHistory,
} from "./note-view-history.ts";

test("parseNoteViewHistory keeps only valid positive numeric timestamps", () => {
  const parsed = parseNoteViewHistory(JSON.stringify({
    "note-1": 100,
    "note-2": "200",
    "note-3": -1,
    "": 300,
    " note-4 ": 400,
  }));

  assert.deepEqual(parsed, {
    "note-1": 100,
    "note-4": 400,
  });
});

test("normalizeNoteViewHistory keeps the latest entries up to the limit", () => {
  const normalized = normalizeNoteViewHistory({
    "old": 1,
    "middle": 2,
    "latest": 3,
  }, 2);

  assert.deepEqual(Object.keys(normalized), ["latest", "middle"]);
});

test("serializeNoteViewHistory writes normalized payload", () => {
  assert.equal(serializeNoteViewHistory({ invalid: Number.NaN, valid: 1 }), "{\"valid\":1}");
});

test("noteViewHistoryStorageKey scopes by user and workspace", () => {
  assert.equal(
    noteViewHistoryStorageKey({ userId: "user-1", documentGroupId: "default" }),
    "brainx_note_view_history_v1:user-1:default"
  );
  assert.equal(
    noteViewHistoryStorageKey({ userId: "user-1", documentGroupId: "team space" }),
    "brainx_note_view_history_v1:user-1:team%20space"
  );
  assert.equal(noteViewHistoryStorageKey({}), "brainx_note_view_history_v1:guest:local");
});
