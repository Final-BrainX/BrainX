export type AiUsageLimitReason = "GUEST_AI_CALL_LIMIT_EXCEEDED" | "MONTHLY_CREDIT_LIMIT_EXCEEDED";

export class AiUsageLimitExceededError extends Error {
  readonly reason: AiUsageLimitReason;

  constructor(reason: AiUsageLimitReason) {
    super(
      reason === "GUEST_AI_CALL_LIMIT_EXCEEDED"
        ? "게스트로 이용 가능한 AI 사용 횟수를 모두 소모했습니다. 로그인하면 계속 이용할 수 있어요."
        : "이번 달 AI 크레딧을 모두 소모했습니다. 플랜을 업그레이드하면 계속 이용할 수 있어요."
    );
    this.name = "AiUsageLimitExceededError";
    this.reason = reason;
  }
}

export function aiUsageLimitErrorFromMessage(message: string) {
  if (message.includes("GUEST_AI_CALL_LIMIT_EXCEEDED")) {
    return new AiUsageLimitExceededError("GUEST_AI_CALL_LIMIT_EXCEEDED");
  }
  if (message.includes("MONTHLY_CREDIT_LIMIT_EXCEEDED")) {
    return new AiUsageLimitExceededError("MONTHLY_CREDIT_LIMIT_EXCEEDED");
  }
  return null;
}
