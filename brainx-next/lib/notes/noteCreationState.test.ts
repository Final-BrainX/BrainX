import assert from "node:assert/strict";
import test from "node:test";

import {
  hasNoteTitleDuplicate,
  mergeInFlightNotes,
  nextDefaultNoteTitle,
  upsertResolvedCreatedNote,
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
test("upsertResolvedCreatedNote replaces a local note and keeps the numbered title", () => {
  const local = note("local-new", "새 노트7");
  const resolved = { ...local, id: "note_7", title: "새 노트7", updatedAt: 2 };

  assert.deepEqual(
    upsertResolvedCreatedNote([local], "local-new", resolved, "새 노트7").map((item) => ({
      id: item.id,
      title: item.title,
    })),
    [{ id: "note_7", title: "새 노트7" }]
  );
});

test("upsertResolvedCreatedNote preserves local edits made before id resolution", () => {
  const local = { ...note("local-new", "사용자 제목"), content: "빠르게 입력한 본문", updatedAt: 3 };
  const resolved = note("note_7", "새 노트7");

  const [updated] = upsertResolvedCreatedNote([local], "local-new", resolved, "새 노트7");

  assert.equal(updated.id, "note_7");
  assert.equal(updated.title, "사용자 제목");
  assert.equal(updated.content, "빠르게 입력한 본문");
});

test("upsertResolvedCreatedNote inserts the resolved note when a refresh already dropped the local note", () => {
  const existing = note("note_1", "기존 노트");
  const resolved = note("note_7", "", undefined);

  assert.deepEqual(
    upsertResolvedCreatedNote([existing], "local-new", resolved, "새 노트7").map((item) => ({
      id: item.id,
      title: item.title,
    })),
    [
      { id: "note_7", title: "새 노트7" },
      { id: "note_1", title: "기존 노트" },
    ]
  );
});

test("upsertResolvedCreatedNote does not duplicate an already resolved note", () => {
  const resolved = note("note_7", "사용자 제목");

  assert.deepEqual(
    upsertResolvedCreatedNote([resolved], "local-new", { ...resolved, title: "" }, "새 노트7").map((item) => ({
      id: item.id,
      title: item.title,
    })),
    [{ id: "note_7", title: "사용자 제목" }]
  );
});
