import type { ChatMessageCreateRequest } from "@/lib/intelligence-api";

export type AiTaskType =
  | "note.ask"
  | "note.summarize.selection"
  | "note.summarize.full"
  | "note.explain.selection"
  | "editor.rewrite"
  | "editor.continue"
  | "editor.draft"
  | "workspace.compose";

export type AiSurface = "RIGHT_SIDEBAR" | "EDITOR_INLINE" | "WORKSPACE_CHAT";

export type AiContextBundle = NonNullable<ChatMessageCreateRequest["clientContext"]>;
export type AiContextItem = AiContextBundle["items"][number];
export type AiContextMode = AiContextBundle["mode"];

export type AiContextSourceRange = {
  from: number;
  to: number;
};

export type AiTextSlice = {
  text: string;
  truncated?: boolean;
  metadata?: Record<string, unknown>;
};

export type InlineAssistContextPayload = {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
};
