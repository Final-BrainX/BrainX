import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtmlEntities,
  extractResolvedWikiLinkTargets,
  normalizeTitleForMatch,
  normalizeWikiLinkTarget,
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

test("extractResolvedWikiLinkTargets de-duplicates when the same target appears in both span and raw form", () => {
  const html = `<p><span data-wiki-link="true" data-title="Spring">[[Spring]]</span> repeated as [[Spring]] again.</p>`;

  assert.deepEqual(extractResolvedWikiLinkTargets(html), ["Spring"]);
});
