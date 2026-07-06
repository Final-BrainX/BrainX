import { messageFromError } from "@/components/chat/chat-utils";
import type { ChatCitation, ChatMessageView } from "@/components/chat/types";

export const CHAT_DRAFT_NOTE_TAGS = ["ai-draft", "chat"];

export function draftNoteSaveErrorMessage(error: unknown) {
  const message = messageFromError(error);
  if (
    message.includes("만료") ||
    message.includes("권한") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return "로그인 또는 노트 저장 권한을 확인하고 다시 시도하세요.";
  }
  return (
    message || "AI 초안을 노트로 저장하지 못했습니다. 잠시 후 다시 시도하세요."
  );
}

function isOutOfScopeFixedAnswer(text: string) {
  return text
    .trim()
    .startsWith(
      "BrainX 본 채팅은 내 노트 검색, 노트 기반 질문, 글 작성, 노트 적용 초안만 처리합니다.",
    );
}

export function canSaveAiMessageDraft(message: ChatMessageView) {
  if (
    message.role !== "ai" ||
    message.streaming ||
    message.error ||
    !message.text.trim()
  )
    return false;
  if (isOutOfScopeFixedAnswer(message.text)) return false;
  return message.route === "COMPOSE" || message.route === "NOTE_ACTION";
}

function normalizeMarkdownText(value: string) {
  return value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function markdownTitleText(value: string) {
  return normalizeMarkdownText(value)
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .trim();
}

function truncateNoteTitle(value: string) {
  const title = markdownTitleText(value) || "AI 초안";
  if (title.length <= 80) return title;
  return `${title.slice(0, 77).trimEnd()}...`;
}

export function noteTitleFromAiMessage(
  text: string,
  fallbackTitle?: string | null,
) {
  const heading = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(text);
  return truncateNoteTitle(heading?.[1] ?? fallbackTitle ?? "AI 초안");
}

export function stripDuplicateDraftTitleHeading(
  markdown: string,
  title: string,
) {
  const heading = /^(\s{0,3}#{1,6}\s+(.+?)[ \t]*)(?:\r?\n|$)/.exec(markdown);
  if (!heading) return markdown;
  if (truncateNoteTitle(heading[2]) !== truncateNoteTitle(title))
    return markdown;
  return markdown.slice(heading[0].length).replace(/^(?:[ \t]*(?:\r?\n))+/, "");
}

function markdownLinkLabel(value: string) {
  return markdownTitleText(value).replace(/[[\]\\]/g, "\\$&") || "참고 노트";
}

function citationMarkdownLine(citation: ChatCitation, index: number) {
  const label = markdownLinkLabel(
    citation.title || citation.noteId || `참고 노트 ${index + 1}`,
  );
  const score =
    citation.score == null
      ? ""
      : ` (${Math.round(Math.max(0, Math.min(1, citation.score)) * 100)}%)`;
  if (!citation.noteId) {
    return `- ${label}${score}`;
  }
  return `- [${label}](/notes/${encodeURIComponent(citation.noteId)})${score}`;
}

export function buildChatDraftMarkdown(message: ChatMessageView) {
  const body = message.text.trim();
  const citations = (message.citations ?? []).filter(
    (citation) => citation.noteId || citation.title,
  );
  if (citations.length === 0) return body;
  return `${body}\n\n## 참고 노트\n\n${citations.map(citationMarkdownLine).join("\n")}`;
}
