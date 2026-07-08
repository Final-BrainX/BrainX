import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTitleForMatch,
  normalizeWikiLinkTarget,
  resolveWikiLinkByTitle,
} from "./wiki-links.ts";

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
