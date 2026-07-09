import assert from "node:assert/strict";
import test from "node:test";

import { isAuthSessionFailureStatus } from "./auth-http-status.ts";

test("401 is an authentication session failure", () => {
  assert.equal(isAuthSessionFailureStatus(401), true);
});

test("403 is an authorization failure and must preserve the session", () => {
  assert.equal(isAuthSessionFailureStatus(403), false);
});

test("other response statuses are not authentication session failures", () => {
  assert.equal(isAuthSessionFailureStatus(400), false);
  assert.equal(isAuthSessionFailureStatus(429), false);
  assert.equal(isAuthSessionFailureStatus(500), false);
});
