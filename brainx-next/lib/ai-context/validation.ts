import {
  AI_CONTEXT_MIN_CONTINUE_BEFORE_CHARS,
  AI_CONTEXT_MIN_NOTE_CONTEXT_CHARS,
  AI_CONTEXT_MIN_REWRITE_SELECTED_CHARS,
} from "./budgets";
import type { AiContextBundle, AiTaskType, InlineAssistContextPayload } from "./types";

export type AiContextSufficiencyResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateAiContextSufficiency(
  task: AiTaskType,
  context: AiContextBundle | InlineAssistContextPayload
): AiContextSufficiencyResult {
  switch (task) {
    case "note.ask":
    case "note.summarize.selection":
    case "note.summarize.full":
      return requireMinChars(
        noteContextLength(context as AiContextBundle),
        AI_CONTEXT_MIN_NOTE_CONTEXT_CHARS,
        "현재 제공된 노트 내용이 너무 짧아 이 요청을 처리할 수 없습니다. 답변에 필요한 본문이나 선택 영역을 더 제공해 주세요."
      );
    case "editor.continue":
      return requireMinChars(
        charCount((context as InlineAssistContextPayload).contextBefore),
        AI_CONTEXT_MIN_CONTINUE_BEFORE_CHARS,
        "이어쓰기에 필요한 앞 문맥이 부족합니다. 최소 한두 문단 이상 작성한 뒤 다시 시도해 주세요."
      );
    case "editor.rewrite":
      return requireMinChars(
        charCount((context as InlineAssistContextPayload).selectedText),
        AI_CONTEXT_MIN_REWRITE_SELECTED_CHARS,
        "선택 영역이 너무 짧습니다. 최소 한 문장 이상 선택한 뒤 다시 시도해 주세요."
      );
    case "note.explain.selection":
      return requireMinChars(
        noteContextLength(context as AiContextBundle),
        AI_CONTEXT_MIN_REWRITE_SELECTED_CHARS,
        "설명할 선택 영역이 너무 짧습니다. 최소 한 문장 이상 선택한 뒤 다시 시도해 주세요."
      );
    case "workspace.compose":
    case "editor.draft":
      return { ok: true };
  }
}

function requireMinChars(length: number, minChars: number, message: string): AiContextSufficiencyResult {
  return length >= minChars ? { ok: true } : { ok: false, message };
}

function noteContextLength(context: AiContextBundle) {
  return (context.items ?? [])
    .filter((item) => item.type !== "NOTE_TITLE")
    .reduce((total, item) => total + charCount(item.text), 0);
}

function charCount(value?: string) {
  return value?.trim().length ?? 0;
}
