export function normalizeWikiLinkTarget(value: string) {
  return value.split("|")[0]?.split("#")[0]?.trim().toLowerCase() ?? "";
}

export function extractWikiLinkTargets(markdown: string) {
  const matches = markdown.match(/\[\[([^\]]+)\]\]/g) ?? [];
  return matches.map((match) => match.slice(2, -2)).filter(Boolean);
}

export function resolveWikiLinkByTitle<T extends { id: string; title: string }>(
  notes: T[],
  target: string
) {
  const needle = normalizeWikiLinkTarget(target);
  if (!needle) return null;

  const exact = notes.find((note) => note.title.trim().toLowerCase() === needle);
  if (exact) return exact;

  const partial = notes.filter((note) => normalizeTitle(note.title).includes(needle));
  return partial.length === 1 ? partial[0] : null;
}

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
