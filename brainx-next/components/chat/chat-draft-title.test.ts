import assert from "node:assert/strict";
import test from "node:test";

import {
  noteTitleFromAiMessage,
  stripDuplicateDraftTitleHeading,
} from "./chat-draft-title.ts";

test("uses a topic-style H1 heading as the draft note title", () => {
  assert.equal(
    noteTitleFromAiMessage("# RAG 검색 품질 개선\n\n본문"),
    "RAG 검색 품질 개선",
  );
});

test("skips a question heading and uses the next topic heading", () => {
  assert.equal(
    noteTitleFromAiMessage("# RAG 검색 품질을 어떻게 높일까?\n\n## 검색 품질 개선 전략\n\n본문"),
    "검색 품질 개선 전략",
  );
});

test("derives a title from a meaningful body line instead of a question thread fallback", () => {
  assert.equal(
    noteTitleFromAiMessage("RAG 검색 품질 개선 전략\n\n재순위화와 메타데이터 필터를 함께 적용한다."),
    "RAG 검색 품질 개선 전략",
  );
});

test("uses the neutral fallback when every candidate is question-like or empty", () => {
  assert.equal(noteTitleFromAiMessage("# RAG란 무엇인가?\n\n어떻게 적용할까?"), "AI 초안");
  assert.equal(noteTitleFromAiMessage("   \n"), "AI 초안");
});

test("strips markdown and truncates long titles to 80 characters", () => {
  const title = noteTitleFromAiMessage(`# **${"가".repeat(90)}**\n\n본문`);
  assert.equal(title.length, 80);
  assert.match(title, /\.\.\.$/);
  assert.doesNotMatch(title, /[*#]/);
});

test("removes only a first heading that matches the selected title", () => {
  assert.equal(
    stripDuplicateDraftTitleHeading("# RAG 검색 품질 개선\n\n본문", "RAG 검색 품질 개선"),
    "본문",
  );
  assert.equal(
    stripDuplicateDraftTitleHeading("# 질문형 제목?\n\n## RAG 검색 품질 개선\n\n본문", "RAG 검색 품질 개선"),
    "# 질문형 제목?\n\n## RAG 검색 품질 개선\n\n본문",
  );
});
