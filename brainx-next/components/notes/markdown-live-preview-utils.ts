const LEADING_HEADING_MARKER_RE = /^#{1,6}[ \t]*/;

export function stripLiveHeadingMarkerFromSerializedText(text: string) {
  return text.replace(LEADING_HEADING_MARKER_RE, "");
}

export function serializeLiveHeadingAsMarkdown(level: number, inlineMarkdown: string) {
  const safeLevel = Math.min(6, Math.max(1, Math.trunc(level) || 1));
  return `${"#".repeat(safeLevel)} ${stripLiveHeadingMarkerFromSerializedText(inlineMarkdown)}`;
}

export function normalizeInlineContinueTextForInsertion(text: string, insideHeading: boolean) {
  if (!insideHeading) return text;
  return text.replace(LEADING_HEADING_MARKER_RE, "");
}
