"use client";

import type { BrainXNote } from "./brainx-data.ts";
import type { LinkSuggestionsData } from "./intelligence-api.ts";
import { contentHasWikiLinkTo } from "./wiki-links.ts";

export type LinkSuggestion = LinkSuggestionsData["suggestions"][number];

export type LinkSuggestionEdge = {
  source: string;
  target: string;
};

export function linkSuggestionKey(sourceNoteId: string, suggestion: LinkSuggestion) {
  return `${sourceNoteId}::${suggestion.suggestionId || suggestion.targetNoteId}`;
}

export function linkSuggestionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("만료") || message.includes("권한") || message.includes("403") || message.includes("401")) {
    return "로그인 또는 AI 연결 추천 권한을 확인하고 다시 시도하세요.";
  }
  if (message.includes("찾을 수") || message.includes("not found") || message.includes("404")) {
    return "선택한 노트를 아직 AI 추천에 사용할 수 없습니다. 노트 동기화 후 다시 시도하세요.";
  }
  if (message.includes("conflict") || message.includes("409") || message.includes("unavailable") || message.includes("실패")) {
    return "AI 추천 생성이 잠시 불안정합니다. 잠시 후 다시 시도하세요.";
  }
  return message || "AI 연결 추천 생성에 실패했습니다. 선택한 노트를 확인하고 다시 시도하세요.";
}

export function linkAcceptErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "NOTE_VERSION_CONFLICT") {
    return "노트가 다른 곳에서 변경됐어요. 새로고침 후 다시 시도해 주세요.";
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("만료") || message.includes("권한")) {
    return "로그인 또는 링크 생성 권한을 확인하고 다시 시도하세요.";
  }
  if (message.includes("찾을 수") || message.includes("not found")) {
    return "연결할 노트를 찾을 수 없습니다. 노트를 새로고침하고 다시 시도하세요.";
  }
  return message || "링크 생성에 실패했습니다. 잠시 후 다시 시도하세요.";
}

export function hasExistingSuggestionEdge(
  edges: LinkSuggestionEdge[],
  sourceNoteId: string,
  targetNoteId: string
) {
  return edges.some((edge) =>
    (edge.source === sourceNoteId && edge.target === targetNoteId) ||
    (edge.source === targetNoteId && edge.target === sourceNoteId)
  );
}

export function filterLinkSuggestions(
  sourceNoteId: string,
  suggestions: LinkSuggestion[],
  notes: Array<Pick<BrainXNote, "id">>,
  edges: LinkSuggestionEdge[]
) {
  const noteIds = new Set(notes.map((note) => note.id));
  const seenTargets = new Set<string>();
  return suggestions.filter((suggestion) => {
    const targetNoteId = suggestion.targetNoteId?.trim();
    if (!targetNoteId || targetNoteId === sourceNoteId) return false;
    if (!noteIds.has(targetNoteId)) return false;
    if (seenTargets.has(targetNoteId)) return false;
    if (hasExistingSuggestionEdge(edges, sourceNoteId, targetNoteId)) return false;
    seenTargets.add(targetNoteId);
    return true;
  });
}

export function normalizeMarkdownText(value: string) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function wikiLinkPart(value: string) {
  return normalizeMarkdownText(value).replace(/[\[\]|]/g, "").trim();
}

export function suggestionWikiLink(targetTitle: string, anchorText?: string | null) {
  const title = wikiLinkPart(targetTitle) || "연결 노트";
  const alias = wikiLinkPart(anchorText ?? "");
  return alias && alias.toLowerCase() !== title.toLowerCase() ? `[[${title}|${alias}]]` : `[[${title}]]`;
}

function replaceRange(markdown: string, start: number, end: number, replacement: string) {
  return `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`;
}

function anchorCoversWholeMarkdown(markdown: string, start: number, end: number) {
  return markdown.slice(0, start).trim() === "" && markdown.slice(end).trim() === "";
}

type TextRange = { start: number; end: number };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiWord(value: string | undefined) {
  return !!value && /^[A-Za-z0-9_]$/.test(value);
}

function hasTokenBoundary(markdown: string, start: number, end: number, anchorText: string) {
  const trimmedAnchor = anchorText.trim();
  if (!trimmedAnchor) return false;
  const first = trimmedAnchor[0];
  const last = trimmedAnchor[trimmedAnchor.length - 1];
  const previous = start > 0 ? markdown[start - 1] : undefined;
  const next = end < markdown.length ? markdown[end] : undefined;
  if (isAsciiWord(first) && isAsciiWord(previous)) return false;
  if (isAsciiWord(last) && isAsciiWord(next)) return false;
  return true;
}

function insideExcludedRange(start: number, end: number, ranges: TextRange[]) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function addFencedCodeRanges(markdown: string, ranges: TextRange[]) {
  intForEachLine(markdown, (line, lineStart, nextLineStart) => {
    if (!line.trim().startsWith("```")) return;
    const last = ranges[ranges.length - 1];
    if (last?.end === -1) {
      last.end = Math.max(lineStart, nextLineStart - 1);
    } else {
      ranges.push({ start: lineStart, end: -1 });
    }
  });
  const open = ranges.findLast((range) => range.end === -1);
  if (open) open.end = markdown.length;
}

function intForEachLine(markdown: string, visit: (line: string, lineStart: number, nextLineStart: number) => void) {
  let lineStart = 0;
  while (lineStart <= markdown.length) {
    const lineEnd = markdown.indexOf("\n", lineStart);
    const contentEnd = lineEnd < 0 ? markdown.length : lineEnd;
    const nextLineStart = lineEnd < 0 ? markdown.length + 1 : lineEnd + 1;
    visit(markdown.slice(lineStart, contentEnd), lineStart, nextLineStart);
    if (lineEnd < 0) break;
    lineStart = nextLineStart;
  }
}

function addInlineCodeRanges(markdown: string, ranges: TextRange[]) {
  let start = markdown.indexOf("`");
  while (start >= 0) {
    if (markdown.startsWith("```", start)) {
      start = markdown.indexOf("`", start + 3);
      continue;
    }
    const end = markdown.indexOf("`", start + 1);
    if (end < 0) return;
    ranges.push({ start, end: end + 1 });
    start = markdown.indexOf("`", end + 1);
  }
}

function addMarkdownLinkRanges(markdown: string, ranges: TextRange[]) {
  let start = markdown.indexOf("[");
  while (start >= 0) {
    if (markdown.startsWith("[[", start)) {
      start = markdown.indexOf("[", start + 2);
      continue;
    }
    const closeBracket = markdown.indexOf("]", start + 1);
    if (closeBracket > start && markdown[closeBracket + 1] === "(") {
      const closeParen = markdown.indexOf(")", closeBracket + 2);
      if (closeParen > closeBracket) {
        ranges.push({ start, end: closeParen + 1 });
        start = markdown.indexOf("[", closeParen + 1);
        continue;
      }
    }
    start = markdown.indexOf("[", start + 1);
  }
}

function addWikiLinkRanges(markdown: string, ranges: TextRange[]) {
  let start = markdown.indexOf("[[");
  while (start >= 0) {
    const end = markdown.indexOf("]]", start + 2);
    if (end < 0) return;
    ranges.push({ start, end: end + 2 });
    start = markdown.indexOf("[[", end + 2);
  }
}

function addHtmlTagRanges(markdown: string, ranges: TextRange[]) {
  const tagPattern = /<[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(markdown))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
}

function addHtmlProtectedElementRanges(markdown: string, ranges: TextRange[]) {
  const protectedElementPattern = /<(a|pre|code|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = protectedElementPattern.exec(markdown))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
}

function excludedRanges(markdown: string) {
  const ranges: TextRange[] = [];
  addFencedCodeRanges(markdown, ranges);
  addInlineCodeRanges(markdown, ranges);
  addMarkdownLinkRanges(markdown, ranges);
  addWikiLinkRanges(markdown, ranges);
  addHtmlProtectedElementRanges(markdown, ranges);
  addHtmlTagRanges(markdown, ranges);
  return ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
}

function exactOccurrences(markdown: string, anchorText: string, ignoreCase: boolean) {
  const ranges: TextRange[] = [];
  const haystack = ignoreCase ? markdown.toLowerCase() : markdown;
  const needle = ignoreCase ? anchorText.toLowerCase() : anchorText;
  let start = haystack.indexOf(needle);
  while (start >= 0) {
    ranges.push({ start, end: start + anchorText.length });
    start = haystack.indexOf(needle, start + Math.max(needle.length, 1));
  }
  return ranges;
}

function whitespaceNormalizedOccurrences(markdown: string, anchorText: string) {
  const tokens = anchorText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return [];
  const inlineGap = "(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*)";
  const pattern = new RegExp(tokens.map(escapeRegExp).join(inlineGap), "g");
  const ranges: TextRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function occurrenceIsSafe(markdown: string, anchorText: string, range: TextRange, ranges: TextRange[]) {
  return !insideExcludedRange(range.start, range.end, ranges) &&
    hasTokenBoundary(markdown, range.start, range.end, anchorText);
}

function safeOccurrences(markdown: string, anchorText: string, ranges: TextRange[]) {
  const attempts = [
    exactOccurrences(markdown, anchorText, false),
    exactOccurrences(markdown, anchorText, true),
    whitespaceNormalizedOccurrences(markdown, anchorText),
  ];

  let sawExcludedOnly = false;
  let sawBoundaryOnly = false;
  for (const occurrences of attempts) {
    if (occurrences.length === 0) continue;
    const outsideExcluded = occurrences.filter((range) => !insideExcludedRange(range.start, range.end, ranges));
    const safe = outsideExcluded.filter((range) => occurrenceIsSafe(markdown, anchorText, range, ranges));
    if (safe.length > 0) return { ranges: safe, excludedOnly: false, boundaryOnly: false };
    if (outsideExcluded.length > 0) {
      sawBoundaryOnly = true;
    } else {
      sawExcludedOnly = true;
    }
  }
  return { ranges: [], excludedOnly: sawExcludedOnly, boundaryOnly: sawBoundaryOnly };
}

function replaceRanges(markdown: string, ranges: TextRange[], targetTitle: string) {
  return [...ranges]
    .sort((a, b) => b.start - a.start)
    .reduce((next, range) => replaceRange(next, range.start, range.end, suggestionWikiLink(targetTitle, next.slice(range.start, range.end))), markdown);
}

export type LinkSuggestionApplyErrorCode =
  | "ANCHOR_EMPTY"
  | "ANCHOR_NOT_FOUND"
  | "ANCHOR_UNSAFE_ONLY"
  | "ANCHOR_BOUNDARY_ONLY"
  | "ANCHOR_WHOLE_DOCUMENT";

export type LinkSuggestionApplyResult =
  | { markdown: string; changed: true; error?: undefined; errorCode?: undefined }
  | { markdown: string; changed: false; error?: string; errorCode?: LinkSuggestionApplyErrorCode };

export function applyLinkSuggestionToMarkdown(
  markdown: string,
  suggestion: LinkSuggestion,
  targetTitle: string
): LinkSuggestionApplyResult {
  if (contentHasWikiLinkTo(markdown, targetTitle)) {
    return { markdown, changed: false };
  }

  const anchorText = suggestion.anchorText ?? "";
  if (!markdown.trim() || !anchorText.trim()) {
    return {
      markdown,
      changed: false,
      error: "본문에서 연결할 위치를 찾지 못했어요. 다시 분석한 뒤 시도해 주세요.",
      errorCode: "ANCHOR_EMPTY"
    };
  }

  const matches = safeOccurrences(markdown, anchorText, excludedRanges(markdown));
  if (matches.ranges.some((range) => anchorCoversWholeMarkdown(markdown, range.start, range.end))) {
    return {
      markdown,
      changed: false,
      error: "본문 전체가 링크 하나로 바뀔 수 있어 저장하지 않았어요. anchor를 다시 분석해 주세요.",
      errorCode: "ANCHOR_WHOLE_DOCUMENT"
    };
  }
  if (matches.ranges.length > 0) {
    return {
      markdown: replaceRanges(markdown, matches.ranges, targetTitle),
      changed: true
    };
  }

  return {
    markdown,
    changed: false,
    error: matches.boundaryOnly
      ? "추천 문구가 다른 단어 안에서만 발견되어 자동으로 바꾸지 않았어요. 다른 문구로 다시 분석해 주세요."
      : matches.excludedOnly
      ? "코드나 이미 링크된 문구만 발견되어 자동으로 바꾸지 않았어요. 다른 문구로 다시 분석해 주세요."
      : "추천을 만든 뒤 본문이 바뀌었을 수 있어요. 다시 분석해 주세요.",
    errorCode: matches.boundaryOnly ? "ANCHOR_BOUNDARY_ONLY" : matches.excludedOnly ? "ANCHOR_UNSAFE_ONLY" : "ANCHOR_NOT_FOUND"
  };
}
