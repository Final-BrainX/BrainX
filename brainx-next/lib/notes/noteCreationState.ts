import type { MockNote } from "./noteTypes.ts";

type NoteTitleCandidate = Pick<MockNote, "title" | "folderId">;

function normalizedFolderId(folderId: string | null | undefined) {
  return folderId ?? null;
}

export function hasNoteTitleDuplicate(
  notes: NoteTitleCandidate[],
  title: string,
  folderId: string | null | undefined
) {
  const targetFolderId = normalizedFolderId(folderId);
  const targetTitle = title.trim();
  return notes.some((note) =>
    normalizedFolderId(note.folderId) === targetFolderId &&
    note.title.trim() === targetTitle
  );
}

export function nextDefaultNoteTitle(notes: NoteTitleCandidate[], folderId: string | null | undefined) {
  const base = "새 노트";
  let title = base;
  let suffix = 1;
  while (hasNoteTitleDuplicate(notes, title, folderId)) {
    title = `${base}${suffix}`;
    suffix += 1;
  }
  return title;
}

export function mergeInFlightNotes(
  loadedNotes: MockNote[],
  localNotes: MockNote[],
  inFlightNoteIds: ReadonlySet<string>
) {
  const seen = new Set(loadedNotes.map((note) => note.id));
  const preserved: MockNote[] = [];
  for (const note of localNotes) {
    if (!inFlightNoteIds.has(note.id) || seen.has(note.id)) continue;
    seen.add(note.id);
    preserved.push(note);
  }
  return [...preserved, ...loadedNotes];
}
