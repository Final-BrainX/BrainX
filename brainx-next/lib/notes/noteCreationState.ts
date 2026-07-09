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
export function upsertResolvedCreatedNote(
  notes: MockNote[],
  localNoteId: string,
  resolvedNote: MockNote,
  fallbackTitle: string
) {
  let foundLocal = false;
  let foundResolved = false;
  const resolvedTitle = resolvedNote.title.trim() || fallbackTitle;
  const mergeResolved = (note: MockNote) => ({
    ...resolvedNote,
    ...note,
    id: resolvedNote.id,
    title: note.title.trim() || resolvedTitle,
    version: resolvedNote.version,
    persisted: resolvedNote.persisted,
    updatedAt: Math.max(note.updatedAt, resolvedNote.updatedAt),
  });
  const localNote = notes.find((note) => note.id === localNoteId);
  const noteToMerge = localNote ?? notes.find((note) => note.id === resolvedNote.id);
  let insertedResolved = false;
  const next: MockNote[] = [];
  for (const note of notes) {
    if (note.id === resolvedNote.id) {
      foundResolved = true;
      if (!insertedResolved) {
        next.push(mergeResolved(noteToMerge ?? note));
        insertedResolved = true;
      }
      continue;
    }
    if (note.id === localNoteId) {
      foundLocal = true;
      if (!insertedResolved) {
        next.push(mergeResolved(noteToMerge ?? note));
        insertedResolved = true;
      }
      continue;
    }
    next.push(note);
  }

  if (foundLocal || foundResolved) return next;
  return [{ ...resolvedNote, title: resolvedTitle }, ...next];
}
