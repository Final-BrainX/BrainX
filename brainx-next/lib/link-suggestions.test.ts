import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLinkSuggestionToMarkdown,
  filterLinkSuggestions,
  linkSuggestionApplyContent,
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

test("applyLinkSuggestionToMarkdown replaces every exact occurrence", () => {
  const markdown = "semantic search connects notes. semantic search also powers graph suggestions.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Semantic Search",
      anchorText: "semantic search",
      anchorStartOffset: 0,
      anchorEndOffset: 15,
    }),
    "Semantic Search"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    "[[Semantic Search]] connects notes. [[Semantic Search]] also powers graph suggestions."
  );
});

test("applyLinkSuggestionToMarkdown ignores stale offsets and replaces all exact occurrences", () => {
  const markdown = "The source mentions semantic search once, then semantic search again.";
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
  assert.equal(
    result.markdown,
    "The source mentions [[Semantic Search]] once, then [[Semantic Search]] again."
  );
});

test("applyLinkSuggestionToMarkdown skips code, markdown links, and wiki-links", () => {
  const markdown = [
    "semantic search outside",
    "`semantic search`",
    "```",
    "semantic search inside fence",
    "```",
    "[semantic search](https://example.com)",
    "[[Other Note|semantic search]]",
    "semantic search outside again",
  ].join("\n");

  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 0,
      anchorEndOffset: 15,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      "[[Search Notes|semantic search]] outside",
      "`semantic search`",
      "```",
      "semantic search inside fence",
      "```",
      "[semantic search](https://example.com)",
      "[[Other Note|semantic search]]",
      "[[Search Notes|semantic search]] outside again",
    ].join("\n")
  );
});

test("applyLinkSuggestionToMarkdown falls back to case-insensitive matching for all occurrences", () => {
  const markdown = "Semantic Search and SEMANTIC SEARCH help discovery.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 999,
      anchorEndOffset: 1014,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    "[[Search Notes|Semantic Search]] and [[Search Notes|SEMANTIC SEARCH]] help discovery."
  );
});

test("applyLinkSuggestionToMarkdown falls back to whitespace-normalized matching", () => {
  const markdown = "semantic\nsearch and semantic   search both appear.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 999,
      anchorEndOffset: 1014,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    "[[Search Notes|semantic search]] and [[Search Notes|semantic search]] both appear."
  );
});

test("applyLinkSuggestionToMarkdown does not merge paragraph boundaries in whitespace fallback", () => {
  const markdown = "semantic\n\nsearch stays separate, but semantic\nsearch is one soft break.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 999,
      anchorEndOffset: 1014,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    "semantic\n\nsearch stays separate, but [[Search Notes|semantic search]] is one soft break."
  );
});

test("applyLinkSuggestionToMarkdown does not link anchors inside larger latin words", () => {
  const markdown = "JavaScript mentions Java, and Java powers another note.";
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Java",
      anchorText: "Java",
      anchorStartOffset: 0,
      anchorEndOffset: 4,
    }),
    "Java"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    "JavaScript mentions [[Java]], and [[Java]] powers another note."
  );
});

test("applyLinkSuggestionToMarkdown reports boundary-only occurrences", () => {
  const result = applyLinkSuggestionToMarkdown(
    "JavaScript only mentions the substring.",
    suggestion({
      targetTitle: "Java",
      anchorText: "Java",
      anchorStartOffset: 0,
      anchorEndOffset: 4,
    }),
    "Java"
  );

  assert.equal(result.changed, false);
  assert.equal(result.errorCode, "ANCHOR_BOUNDARY_ONLY");
});

test("applyLinkSuggestionToMarkdown skips HTML code and link element bodies", () => {
  const markdown = [
    "<p>semantic search outside</p>",
    "<pre><code>semantic search inside code</code></pre>",
    '<a href="https://example.com">semantic search inside link</a>',
  ].join("");
  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 3,
      anchorEndOffset: 18,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      "<p>[[Search Notes|semantic search]] outside</p>",
      "<pre><code>semantic search inside code</code></pre>",
      '<a href="https://example.com">semantic search inside link</a>',
    ].join("")
  );
});

test("applyLinkSuggestionToMarkdown refuses to replace the whole document", () => {
  const result = applyLinkSuggestionToMarkdown(
    "semantic search",
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 0,
      anchorEndOffset: 15,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, false);
  assert.equal(result.errorCode, "ANCHOR_WHOLE_DOCUMENT");
});

test("applyLinkSuggestionToMarkdown reports unsafe-only occurrences", () => {
  const result = applyLinkSuggestionToMarkdown(
    "`semantic search` and [semantic search](https://example.com)",
    suggestion({
      targetTitle: "Search Notes",
      anchorText: "semantic search",
      anchorStartOffset: 0,
      anchorEndOffset: 15,
    }),
    "Search Notes"
  );

  assert.equal(result.changed, false);
  assert.equal(result.errorCode, "ANCHOR_UNSAFE_ONLY");
});

test("applyLinkSuggestionToMarkdown reports when anchor cannot be found", () => {
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
  assert.equal(result.errorCode, "ANCHOR_NOT_FOUND");
});

test("linkSuggestionApplyContent falls back from empty editor HTML to saved markdown", () => {
  for (const emptyEditorContent of ["", "   ", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>", "<div><span> </span></div>"]) {
    assert.equal(
      linkSuggestionApplyContent(emptyEditorContent, "saved markdown with 제주 여행", "fallback content"),
      "saved markdown with 제주 여행"
    );
  }
});

test("linkSuggestionApplyContent keeps meaningful editor content before saved markdown", () => {
  assert.equal(
    linkSuggestionApplyContent("<p>unsaved 제주 여행 draft</p>", "saved 제주 여행", "fallback 제주 여행"),
    "<p>unsaved 제주 여행 draft</p>"
  );
});

test("applyLinkSuggestionToMarkdown links 제주 여행 anchor from saved markdown", () => {
  const markdown = [
    "[Cluster Test] 제주 3박 4일 여행 동선",
    "",
    "## 핵심 메모",
    "제주 3박 4일 여행 동선은 공항 도착 시간, 숙소 위치, 렌터카 이동 거리, 동쪽과 서쪽 코스 분리를 기준으로 잡는다.",
    "",
    "## 관련 키워드",
    "제주 여행, 3박 4일, 여행 동선, 렌터카, 애월, 서귀포",
  ].join("\n");

  const result = applyLinkSuggestionToMarkdown(
    markdown,
    suggestion({
      targetTitle: "비 오는 날 제주 대체 코스",
      anchorText: "제주 여행",
      anchorStartOffset: 0,
      anchorEndOffset: 5,
    }),
    "비 오는 날 제주 대체 코스"
  );

  assert.equal(result.changed, true);
  assert.match(result.markdown, /\[\[비 오는 날 제주 대체 코스\|제주 여행\]\]/);
});
