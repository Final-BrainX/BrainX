export type InlineAiMode = "ask" | "draft";

export type InlineAiRoute =
  | {
      kind: "ask";
      prompt: string;
    }
  | {
      kind: "draft";
      prompt: string;
      targetLength: number;
      reason: "explicit" | "auto";
    };

export const DEFAULT_DRAFT_TARGET_LENGTH = 600;
export const MIN_DRAFT_TARGET_LENGTH = 100;
export const MAX_DRAFT_TARGET_LENGTH = 3000;

const LENGTH_PATTERN = /(\d{2,4})\s*(?:자|글자|characters?|chars?)/i;
const DRAFT_PATTERN = /(작성|초안|써줘|써\s*주세요|써주세요|작성해|글\s*써|draft|compose)/i;

export function routeInlineAiInput(
  input: string,
  options: { mode: InlineAiMode; targetLength?: number }
): InlineAiRoute {
  const prompt = input.trim();
  const parsedLength = parseTargetLength(prompt);
  const targetLength = clampDraftTargetLength(parsedLength ?? options.targetLength ?? DEFAULT_DRAFT_TARGET_LENGTH);
  if (options.mode === "draft") {
    return { kind: "draft", prompt, targetLength, reason: "explicit" };
  }
  if (DRAFT_PATTERN.test(prompt)) {
    return { kind: "draft", prompt, targetLength, reason: "auto" };
  }
  return { kind: "ask", prompt };
}

export function clampDraftTargetLength(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DRAFT_TARGET_LENGTH;
  return Math.max(MIN_DRAFT_TARGET_LENGTH, Math.min(MAX_DRAFT_TARGET_LENGTH, Math.round(value)));
}

function parseTargetLength(prompt: string) {
  const match = LENGTH_PATTERN.exec(prompt);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
