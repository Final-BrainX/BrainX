import {
  AI_CONTEXT_AROUND_CURSOR_CHARS,
  AI_CONTEXT_EXPLAIN_AROUND_CHARS,
  AI_CONTEXT_FULL_NOTE_MAX_CHARS,
  AI_CONTEXT_NOTE_EXCERPT_MAX_CHARS,
  AI_CONTEXT_SELECTION_MAX_CHARS,
} from "./budgets";
import { limitAiText, normalizeNoteContentForAi, sampleLongAiText } from "./note-context";
import type {
  AiContextBundle,
  AiContextItem,
  AiContextMode,
  AiSurface,
  AiTaskType,
  AiTextSlice,
  InlineAssistContextPayload,
} from "./types";

type BuildNoteAiContextInput = {
  task: Extract<
    AiTaskType,
    "note.ask" | "note.summarize.selection" | "note.summarize.full" | "note.explain.selection" | "workspace.compose"
  >;
  surface?: AiSurface;
  documentGroupId?: string;
  noteId?: string;
  title?: string;
  content?: string;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
};

type BuildInlineAssistContextInput = {
  task: Extract<AiTaskType, "editor.rewrite" | "editor.continue" | "editor.draft">;
  selectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
};

export function buildNoteAiContext(input: BuildNoteAiContextInput): AiContextBundle {
  const source = input.surface ?? "RIGHT_SIDEBAR";
  const items: AiContextItem[] = [];
  const noteText = normalizeNoteContentForAi(input.content ?? "");
  const selectedText = normalizeNoteContentForAi(input.selectedText ?? "");

  if (input.title?.trim()) {
    items.push(contextItem(input, "NOTE_TITLE", { text: input.title.trim() }));
  }

  if (input.task === "note.summarize.selection" || input.task === "note.explain.selection") {
    addTextItem(items, input, "SELECTION", selectedText, AI_CONTEXT_SELECTION_MAX_CHARS);
    if (input.task === "note.explain.selection") {
      addTextItem(items, input, "CONTEXT_BEFORE", input.contextBefore ?? "", AI_CONTEXT_EXPLAIN_AROUND_CHARS);
      addTextItem(items, input, "CONTEXT_AFTER", input.contextAfter ?? "", AI_CONTEXT_EXPLAIN_AROUND_CHARS);
    }
    return bundle(source, "SELECTION", items);
  }

  if (input.task === "note.summarize.full") {
    const slice = sampleLongAiText(noteText, AI_CONTEXT_FULL_NOTE_MAX_CHARS);
    if (slice.text) items.push(contextItem(input, "NOTE_TEXT", slice));
    return bundle(source, "FULL_NOTE", items);
  }

  if (input.task === "workspace.compose") {
    if (selectedText) {
      addTextItem(items, input, "SELECTION", selectedText, AI_CONTEXT_SELECTION_MAX_CHARS);
      return bundle(source, "SELECTION", items);
    }
    if (noteText) {
      addTextItem(items, input, "NOTE_TEXT", noteText, AI_CONTEXT_NOTE_EXCERPT_MAX_CHARS);
      return bundle(source, "NOTE_EXCERPT", items);
    }
    return bundle(source, "NONE", []);
  }

  addTextItem(items, input, "NOTE_TEXT", noteText, AI_CONTEXT_NOTE_EXCERPT_MAX_CHARS);
  return bundle(source, items.length > 0 ? "NOTE_EXCERPT" : "NONE", items);
}

export function buildInlineAssistContext(
  input: BuildInlineAssistContextInput
): InlineAssistContextPayload {
  const selectedBudget = input.task === "editor.rewrite" ? AI_CONTEXT_SELECTION_MAX_CHARS : 0;
  const selectedText = selectedBudget > 0
    ? limitAiText(input.selectedText ?? "", selectedBudget).text
    : "";

  return {
    selectedText,
    contextBefore: limitAiText(input.contextBefore ?? "", AI_CONTEXT_AROUND_CURSOR_CHARS).text,
    contextAfter: limitAiText(input.contextAfter ?? "", AI_CONTEXT_AROUND_CURSOR_CHARS).text,
  };
}

function bundle(source: AiSurface, mode: AiContextMode, items: AiContextItem[]): AiContextBundle {
  return { source, mode, items: items.filter((item) => item.text.trim()) };
}

function addTextItem(
  items: AiContextItem[],
  input: BuildNoteAiContextInput,
  type: AiContextItem["type"],
  text: string,
  maxChars: number
) {
  const slice = limitAiText(normalizeNoteContentForAi(text), maxChars);
  if (slice.text) items.push(contextItem(input, type, slice));
}

function contextItem(input: BuildNoteAiContextInput, type: AiContextItem["type"], slice: AiTextSlice): AiContextItem {
  return {
    type,
    noteId: input.noteId,
    documentGroupId: input.documentGroupId,
    text: slice.text,
    truncated: slice.truncated,
    metadata: slice.metadata,
  };
}
