import assert from "node:assert/strict";
import test from "node:test";

import { AiUsageLimitExceededError, aiUsageLimitErrorFromMessage } from "./ai-usage-limit-error.ts";

test("monthly quota denial is converted to the dedicated usage-limit error", () => {
  const error = aiUsageLimitErrorFromMessage(
    "AI capability is not available: MONTHLY_CREDIT_LIMIT_EXCEEDED"
  );

  assert.ok(error instanceof AiUsageLimitExceededError);
  assert.equal(error.reason, "MONTHLY_CREDIT_LIMIT_EXCEEDED");
});

test("guest quota denial is converted to the dedicated usage-limit error", () => {
  const error = aiUsageLimitErrorFromMessage(
    "AI capability is not available: GUEST_AI_CALL_LIMIT_EXCEEDED"
  );

  assert.ok(error instanceof AiUsageLimitExceededError);
  assert.equal(error.reason, "GUEST_AI_CALL_LIMIT_EXCEEDED");
});

test("unrelated forbidden messages remain ordinary API errors", () => {
  assert.equal(aiUsageLimitErrorFromMessage("Workspace access denied"), null);
});
