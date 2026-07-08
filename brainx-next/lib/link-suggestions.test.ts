import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLinkSuggestionToMarkdown,
  filterLinkSuggestions,
  type LinkSuggestion,
} from "./link-suggestions.ts";

function suggestion(overrides: Partial<LinkSuggestion> = {}): LinkSuggestion {
  return {
    suggestionId: "suggestion-1",
    targetNoteId: "target-1",
    targetTitle: "Target Note",
    score: 0.9,
    reason: "related context",
    anchorText: "target concept",
    anchorStartOffset: 0,
    anchorEndOffset: "target concept".length,
    ...overrides,
  };
}

test("filterLinkSuggestions excludes already linked targets", () => {
  const result = filterLinkSuggestions(
    "source-1",
    [
      suggestion({ suggestionId: "existing", targetNoteId: "target-1" }),
      suggestion({ suggestionId: "fresh", targetNoteId: "target-2" }),
    ],
    [{ id: "source-1" }, { id: "target-1" }, { id: "target-2" }],
    [{ source: "source-1", target: "target-1" }]
  );

  assert.deepEqual(result.map((item) => item.targetNoteId), ["target-2"]);
});

test("filterLinkSuggestions keeps one suggestion per target", () => {
  const result = filterLinkSuggestions(
    "source-1",
    [
      suggestion({ suggestionId: "first", targetNoteId: "target-1" }),
      suggestion({ suggestionId: "second", targetNoteId: "target-1" }),
    ],
    [{ id: "source-1" }, { id: "target-1" }],
    []
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].suggestionId, "first");
});

test("applyLinkSuggestionToMarkdown uses a matching offset anchor", () => {
  const markdown = "RAG pipeline notes";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "RAG 파이프라인",
      anchorText: "RAG",
      anchorStartOffset: 0,
      anchorEndOffset: 3,
    }),
    "RAG 파이프라인"
  );

  assert.equal(result.changed, true);
  assert.equal(result.markdown, "[[RAG 파이프라인|RAG]] pipeline notes");
});

test("applyLinkSuggestionToMarkdown falls back to a unique anchor when offsets are stale", () => {
  const markdown = "The source mentions semantic search once.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Semantic Search",
      anchorText: "semantic search",
      anchorStartOffset: 999,
      anchorEndOffset: 1014,
    }),
    "Semantic Search"
  );

  assert.equal(result.changed, true);
  assert.equal(result.markdown, "The source mentions [[Semantic Search]] once.");
});

test("applyLinkSuggestionToMarkdown reports an error when anchor cannot be found", () => {
  const result = applyLinkSuggestionToMarkdown(
    "No matching text here.",
    suggestion({
      targetTitle: "Missing Anchor",
      anchorText: "absent phrase",
      anchorStartOffset: 0,
      anchorEndOffset: 13,
    }),
    "Missing Anchor"
  );

  assert.equal(result.changed, false);
  assert.match(result.error ?? "", /위치를 정확히 찾지 못했어요/);
});
