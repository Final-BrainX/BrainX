import assert from "node:assert/strict";
import test from "node:test";

import { sortNotes, type SortDirection, type SortOption } from "./noteTypes.ts";

type SortableNote = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

const favorites = new Set<string>();

function ids(
  notes: SortableNote[],
  sortBy: SortOption,
  direction: SortDirection,
  modifiedAtByNoteId?: ReadonlyMap<string, number>
) {
  return sortNotes(notes, sortBy, favorites, direction, modifiedAtByNoteId).map((note) => note.id);
}

const notes: SortableNote[] = [
  { id: "old", title: "B", createdAt: 10, updatedAt: 10 },
  { id: "active", title: "C", createdAt: 20, updatedAt: 100 },
  { id: "new", title: "A", createdAt: 30, updatedAt: 30 },
];

test("modified sort keeps an edited active note at its pre-edit position in descending order", () => {
  assert.deepEqual(ids(notes, "modified", "desc", new Map([["active", 20]])), ["new", "active", "old"]);
});

test("modified sort keeps an edited active note at its pre-edit position in ascending order", () => {
  assert.deepEqual(ids(notes, "modified", "asc", new Map([["active", 20]])), ["old", "active", "new"]);
});

test("modified sort uses the real updatedAt again after the active-note override is released", () => {
  assert.deepEqual(ids(notes, "modified", "desc"), ["active", "new", "old"]);
});

test("modified-time overrides do not affect created or title sorting", () => {
  const override = new Map([["active", 0]]);
  assert.deepEqual(ids(notes, "created", "desc", override), ["new", "active", "old"]);
  assert.deepEqual(ids(notes, "title", "asc", override), ["new", "old", "active"]);
});
