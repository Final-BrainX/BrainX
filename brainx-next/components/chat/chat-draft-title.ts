const DEFAULT_DRAFT_NOTE_TITLE = "AI 초안";
const QUESTION_WORD_PATTERN = /(왜|어떻게|무엇|뭐|어디|언제|누구|어느|얼마|몇)/i;
const QUESTION_ENDING_PATTERN = /(인가요?|일까요?|할까요?|하나요|했나요|되나요|있나요|없는가|있는가|되는가|하는가|일까|할까|는지)$/i;
const ASSISTANT_PREAMBLE_PATTERN = /^(다음은|아래는|요청하신|요청한|정리해\s*드리|작성해\s*드리)/;

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
  const title = markdownTitleText(value) || DEFAULT_DRAFT_NOTE_TITLE;
  if (title.length <= 80) return title;
  return `${title.slice(0, 77).trimEnd()}...`;
}

function isQuestionLikeTitle(value: string) {
  const title = markdownTitleText(value).replace(/[.!]+$/, "").trim();
  return (
    !title ||
    /[?？]/.test(title) ||
    QUESTION_WORD_PATTERN.test(title) ||
    QUESTION_ENDING_PATTERN.test(title)
  );
}

function meaningfulBodyLines(text: string) {
  return text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^#{1,6}\s+/.test(trimmed) ||
      /^```/.test(trimmed) ||
      /^([-*_])\1{2,}$/.test(trimmed)
    ) {
      return [];
    }
    const candidate = markdownTitleText(
      trimmed.replace(/^(?:[-+*]|\d+[.)])\s+/, ""),
    );
    if (
      candidate.length < 2 ||
      isQuestionLikeTitle(candidate) ||
      ASSISTANT_PREAMBLE_PATTERN.test(candidate)
    ) {
      return [];
    }
    return [candidate];
  });
}

export function noteTitleFromAiMessage(text: string) {
  const headings = Array.from(
    text.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm),
    (match) => match[1],
  );
  const candidate = [...headings, ...meaningfulBodyLines(text)].find(
    (value) => !isQuestionLikeTitle(value),
  );
  return truncateNoteTitle(candidate ?? DEFAULT_DRAFT_NOTE_TITLE);
}

export function stripDuplicateDraftTitleHeading(
  markdown: string,
  title: string,
) {
  const heading = /^(\s{0,3}#{1,6}\s+(.+?)[ \t]*)(?:\r?\n|$)/.exec(markdown);
  if (!heading) return markdown;
  if (truncateNoteTitle(heading[2]) !== truncateNoteTitle(title)) {
    return markdown;
  }
  return markdown.slice(heading[0].length).replace(/^(?:[ \t]*(?:\r?\n))+/, "");
}
