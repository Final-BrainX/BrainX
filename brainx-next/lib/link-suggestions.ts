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

function findOffsetAnchorRange(markdown: string, suggestion: LinkSuggestion, anchorText: string) {
  const start = suggestion.anchorStartOffset;
  const end = suggestion.anchorEndOffset;
  const matches = typeof start === "number" &&
    typeof end === "number" &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= markdown.length &&
    markdown.slice(start, end) === anchorText;
  return matches ? { start, end } : null;
}

function findSingleAnchorRange(markdown: string, anchorText: string) {
  if (!anchorText) return null;
  const first = markdown.indexOf(anchorText);
  if (first < 0) return null;
  const second = markdown.indexOf(anchorText, first + anchorText.length);
  if (second >= 0) return null;
  return { start: first, end: first + anchorText.length };
}

export type LinkSuggestionApplyResult =
  | { markdown: string; changed: true; error?: undefined }
  | { markdown: string; changed: false; error?: string };

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
      error: "본문에서 연결할 위치를 찾지 못했어요. 다시 분석한 뒤 시도해 주세요."
    };
  }

  const link = suggestionWikiLink(targetTitle, anchorText);
  const offsetAnchor = findOffsetAnchorRange(markdown, suggestion, anchorText);
  if (offsetAnchor) {
    if (anchorCoversWholeMarkdown(markdown, offsetAnchor.start, offsetAnchor.end)) {
      return {
        markdown,
        changed: false,
        error: "본문 전체가 링크 하나로 바뀔 수 있어 저장하지 않았어요. anchor를 다시 분석해 주세요."
      };
    }
    return {
      markdown: replaceRange(markdown, offsetAnchor.start, offsetAnchor.end, link),
      changed: true
    };
  }

  const singleAnchor = findSingleAnchorRange(markdown, anchorText);
  if (singleAnchor) {
    if (anchorCoversWholeMarkdown(markdown, singleAnchor.start, singleAnchor.end)) {
      return {
        markdown,
        changed: false,
        error: "본문 전체가 링크 하나로 바뀔 수 있어 저장하지 않았어요. anchor를 다시 분석해 주세요."
      };
    }
    return {
      markdown: replaceRange(markdown, singleAnchor.start, singleAnchor.end, link),
      changed: true
    };
  }

  return {
    markdown,
    changed: false,
    error: "본문에서 연결할 위치를 정확히 찾지 못했어요. 다시 분석한 뒤 시도해 주세요."
  };
}
