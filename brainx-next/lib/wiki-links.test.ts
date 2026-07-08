import test from "node:test";
import assert from "node:assert/strict";
import {
  contentHasWikiLinkTo,
  decodeHtmlEntities,
  ensureWikiLinkPresent,
  extractWikiLinkTargets,
  extractResolvedWikiLinkTargets,
  normalizeTitleForMatch,
  normalizeWikiLinkTarget,
  renameWikiLinkReferencesInMarkdown,
  resolveWikiLinkByTitle,
} from "./wiki-links.ts";

test("decodeHtmlEntities unwraps a double-escaped ampersand down to the real character", () => {
  assert.equal(decodeHtmlEntities("리뷰 &amp;amp; 평가"), "리뷰 & 평가");
});

test("decodeHtmlEntities leaves an already-plain ampersand untouched", () => {
  assert.equal(decodeHtmlEntities("리뷰 & 평가"), "리뷰 & 평가");
});

test("normalizeTitleForMatch strips a leading emoji icon before comparing", () => {
  assert.equal(normalizeTitleForMatch("📄 프로젝트 기획"), "프로젝트 기획");
  assert.equal(normalizeTitleForMatch("🔲 할 일 목록"), "할 일 목록");
});

test("normalizeTitleForMatch keeps emoji that isn't at the very front", () => {
  assert.equal(normalizeTitleForMatch("회의록 📌 2026"), "회의록 📌 2026");
});

test("normalizeTitleForMatch collapses whitespace and lowercases like the emoji-free path", () => {
  assert.equal(normalizeTitleForMatch("  Project   Plan  "), "project plan");
});

test("resolveWikiLinkByTitle matches a note whose title has a leading emoji icon", () => {
  const notes = [
    { id: "1", title: "📄 프로젝트 기획" },
    { id: "2", title: "회의록" },
  ];

  const resolved = resolveWikiLinkByTitle(notes, "프로젝트 기획");

  assert.equal(resolved?.id, "1");
});

test("resolveWikiLinkByTitle matches a note whose title contains square brackets", () => {
  const notes = [
    { id: "1", title: "[Cluster Test] 비 오는 날 제주 대체 코스" },
    { id: "2", title: "제주 3박 4일 여행 동선" },
  ];

  const resolved = resolveWikiLinkByTitle(notes, "[Cluster Test] 비 오는 날 제주 대체 코스");

  assert.equal(resolved?.id, "1");
});

test("resolveWikiLinkByTitle still matches when both sides carry the same emoji", () => {
  const notes = [{ id: "1", title: "🔲 할 일 목록" }];

  const resolved = resolveWikiLinkByTitle(notes, "🔲 할 일 목록");

  assert.equal(resolved?.id, "1");
});

test("resolveWikiLinkByTitle returns null when an emoji-prefixed title has no match", () => {
  const notes = [{ id: "1", title: "📄 다른 노트" }];

  const resolved = resolveWikiLinkByTitle(notes, "존재하지 않는 노트");

  assert.equal(resolved, null);
});

test("normalizeWikiLinkTarget strips a leading emoji from the typed link text itself", () => {
  assert.equal(normalizeWikiLinkTarget("📄 프로젝트 기획|별칭"), "프로젝트 기획");
});

test("normalizeTitleForMatch decodes a double-escaped ampersand back to the real title", () => {
  const realTitle = "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 & 평가 플랫폼";
  const doubleEscapedLinkTitle = "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 &amp;amp; 평가 플랫폼";

  assert.equal(normalizeTitleForMatch(doubleEscapedLinkTitle), normalizeTitleForMatch(realTitle));
});

test("resolveWikiLinkByTitle matches a note despite a double-escaped ampersand in the link text", () => {
  const notes = [{ id: "1", title: "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 & 평가 플랫폼" }];

  const resolved = resolveWikiLinkByTitle(notes, "🍽️ 푸디스트 (Foodiest) — 음식점 리뷰 &amp;amp; 평가 플랫폼");

  assert.equal(resolved?.id, "1");
});

test("extractResolvedWikiLinkTargets parses a double-quoted data-title containing an apostrophe", () => {
  const html = `<p><span data-wiki-link="true" data-title="John's Plan">[[John's Plan]]</span></p>`;

  assert.deepEqual(extractResolvedWikiLinkTargets(html), ["John's Plan"]);
});

test("extractResolvedWikiLinkTargets parses a single-quoted data-title containing a double quote", () => {
  const html = `<p><span data-wiki-link='true' data-title='John "Draft" Plan'>[[John "Draft" Plan]]</span></p>`;

  assert.deepEqual(extractResolvedWikiLinkTargets(html), ['John "Draft" Plan']);
});

test("extractResolvedWikiLinkTargets keeps both span-based and raw [[...]] targets in mixed content", () => {
  const html = `<p><span data-wiki-link="true" data-title="Spring">[[Spring]]</span> and also [[Spring Security]] typed raw.</p>`;

  assert.deepEqual(extractResolvedWikiLinkTargets(html), ["Spring", "Spring Security"]);
});

test("extractWikiLinkTargets keeps square brackets in target titles and strips aliases", () => {
  assert.deepEqual(
    extractWikiLinkTargets("[[[Cluster Test] 비 오는 날 제주 대체 코스|제주 여행]]"),
    ["[Cluster Test] 비 오는 날 제주 대체 코스"]
  );
});

test("contentHasWikiLinkTo accepts square-bracket target titles", () => {
  assert.equal(
    contentHasWikiLinkTo("[[[Cluster Test] 비 오는 날 제주 대체 코스|제주 여행]]", "[Cluster Test] 비 오는 날 제주 대체 코스"),
    true
  );
});

test("ensureWikiLinkPresent does not close a different title with the same prefix", () => {
  assert.equal(
    ensureWikiLinkPresent("Read [[JavaScript", "Java"),
    "Read [[JavaScript\n\n[[Java]]"
  );
});

test("ensureWikiLinkPresent closes unfinished square-bracket target titles", () => {
  assert.equal(
    ensureWikiLinkPresent("See [[[Cluster Test] 비 오는 날 제주 대체 코스", "[Cluster Test] 비 오는 날 제주 대체 코스"),
    "See [[[Cluster Test] 비 오는 날 제주 대체 코스]]"
  );
});

test("renameWikiLinkReferencesInMarkdown preserves aliases for square-bracket target titles", () => {
  const result = renameWikiLinkReferencesInMarkdown(
    "[[[Cluster Test] 비 오는 날 제주 대체 코스|제주 여행]]",
    "[Cluster Test] 비 오는 날 제주 대체 코스",
    "[Cluster Test] 제주 우천 대체 코스"
  );

  assert.equal(result.changed, true);
  assert.equal(result.markdown, "[[[Cluster Test] 제주 우천 대체 코스|제주 여행]]");
});

test("renameWikiLinkReferencesInMarkdown preserves links to plain duplicate titles", () => {
  const result = renameWikiLinkReferencesInMarkdown(
    "See [[Project]] and [[📄 Project]]",
    "📄 Project",
    "📄 Project Archive"
  );

  assert.equal(result.changed, true);
  assert.equal(result.markdown, "See [[Project]] and [[📄 Project Archive]]");
});

test("extractResolvedWikiLinkTargets de-duplicates when the same target appears in both span and raw form", () => {
  const html = `<p><span data-wiki-link="true" data-title="Spring">[[Spring]]</span> repeated as [[Spring]] again.</p>`;

  assert.deepEqual(extractResolvedWikiLinkTargets(html), ["Spring"]);
});
