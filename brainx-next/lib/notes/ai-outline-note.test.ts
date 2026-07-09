import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_OUTLINE_NOTE_TARGET_LENGTH,
  buildAiOutlineNotePrompt,
  normalizeAiOutlineNoteTitle,
} from "./ai-outline-note.ts";

test("AI outline title collapses whitespace and keeps at most 80 characters", () => {
  assert.equal(normalizeAiOutlineNoteTitle("  지식   그래프  "), "지식 그래프");
  assert.equal(normalizeAiOutlineNoteTitle("가".repeat(100)).length, 80);
});

test("AI outline prompt requests only a short outline and future-writing checklist", () => {
  const prompt = buildAiOutlineNotePrompt("지식 그래프", "지식 그래프 연결", "원본 노트");

  assert.equal(AI_OUTLINE_NOTE_TARGET_LENGTH, 300);
  assert.match(prompt, /## 개요/);
  assert.match(prompt, /## 향후 작성할 내용/);
  assert.match(prompt, /- \[ \]/);
  assert.match(prompt, /H1 제목과 완성된 설명 문단은 작성하지 않는다/);
  assert.match(prompt, /확인되지 않은 사실은 만들지 않는다/);
  assert.match(prompt, /지식 그래프 연결/);
});
