export const AI_OUTLINE_NOTE_TARGET_LENGTH = 300;

export type AiOutlineNoteCreateRequest = {
  sourceNoteId: string;
  title: string;
  markdown: string;
  selection: {
    text: string;
    selectedMarkdown?: string;
    range?: { from: number; to: number };
  };
};

export type AiOutlineNoteCreateResult = {
  noteId: string;
  title: string;
  linked: boolean;
  linkSkippedReason?: string;
};

export function normalizeAiOutlineNoteTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) return normalized;
  return normalized.slice(0, 80).trimEnd();
}

export function buildAiOutlineNotePrompt(
  title: string,
  selectedMarkdown: string,
  sourceTitle: string,
) {
  return [
    `선택 텍스트 "${title}"를 새 노트 제목으로 삼아, 나중에 사용자가 확장할 수 있는 짧은 초안을 작성해줘.`,
    `원본 노트 제목: ${sourceTitle || "(제목 없음)"}`,
    "반드시 아래 Markdown 구조만 사용해:",
    "## 개요",
    "- 주제의 핵심 방향만 2~4개의 짧은 bullet로 정리",
    "## 향후 작성할 내용",
    "- [ ] 추가 조사하거나 보강할 내용을 2~4개의 체크리스트로 정리",
    "작성 규칙:",
    "- H1 제목과 완성된 설명 문단은 작성하지 않는다.",
    "- 선택 텍스트와 주변 문맥에서 확인되는 내용만 사용하고, 확인되지 않은 사실은 만들지 않는다.",
    "- 상세 문서가 아니라 AI Chat의 노트 초안처럼 간결한 작성 뼈대만 반환한다.",
    "- 안내 문구나 머리말 없이 저장할 Markdown 본문만 반환한다.",
    "",
    "선택 원문:",
    selectedMarkdown || title,
  ].join("\n");
}
