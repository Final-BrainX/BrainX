import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNoteTitleDuplicate,
  mergeInFlightNotes,
  nextDefaultNoteTitle,
} from "./noteCreationState.ts";
import type { MockNote } from "./noteTypes.ts";

function note(id: string, title: string, folderId?: string): MockNote {
  return {
    id,
    title,
    content: "",
    tags: [],
    category: "frontend",
    folderId,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    persisted: false,
  };
}

test("nextDefaultNoteTitle includes local in-flight notes when numbering new notes", () => {
  assert.equal(
    nextDefaultNoteTitle([
      note("note_1", "새 노트"),
      note("local-2", "새 노트1"),
    ], null),
    "새 노트2"
  );
});

test("nextDefaultNoteTitle scopes numbering to the same folder", () => {
  assert.equal(
    nextDefaultNoteTitle([
      note("note_1", "새 노트", "folder-a"),
      note("note_2", "새 노트1", "folder-b"),
    ], "folder-a"),
    "새 노트1"
  );
});

test("hasNoteTitleDuplicate ignores the same title in a different folder", () => {
  assert.equal(hasNoteTitleDuplicate([note("note_1", "회의록", "folder-a")], "회의록", "folder-b"), false);
});

test("mergeInFlightNotes preserves a local note missing from the server reload", () => {
  const local = note("local-new", "새 노트");
  const loaded = [note("note_1", "기존 노트")];

  assert.deepEqual(
    mergeInFlightNotes(loaded, [local], new Set(["local-new"])).map((item) => item.id),
    ["local-new", "note_1"]
  );
});

test("mergeInFlightNotes does not duplicate a note already returned by the server", () => {
  const loaded = [note("note_1", "새 노트")];
  const local = note("note_1", "새 노트");

  assert.deepEqual(
    mergeInFlightNotes(loaded, [local], new Set(["note_1"])).map((item) => item.id),
    ["note_1"]
  );
});
