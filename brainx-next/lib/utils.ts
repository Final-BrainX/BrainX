export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function countWords(markdown: string) {
  const trimmed = markdown.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  const fromCodePoint = (codePoint: number, fallback: string) =>
    Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : fallback;

  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g, (match, entity: string) => {
    const named = namedEntities[entity.toLowerCase()];
    if (named !== undefined) return named;
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return fromCodePoint(codePoint, match);
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return fromCodePoint(codePoint, match);
    }
    return match;
  });
}

function stripHtml(value: string) {
  const htmlTagPattern = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?>/g;
  const withoutTags = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\s*>/gi, " ")
    .replace(htmlTagPattern, " ");
  return decodeHtmlEntities(withoutTags).replace(htmlTagPattern, " ");
}

export function stripMarkdown(markdown: string) {
  return stripHtml(markdown)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/`/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
