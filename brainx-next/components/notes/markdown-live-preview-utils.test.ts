import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeInlineContinueTextForInsertion,
  serializeLiveHeadingAsMarkdown,
  stripLiveHeadingMarkerFromSerializedText,
} from "./markdown-live-preview-utils.ts";

test("serializeLiveHeadingAsMarkdown does not duplicate an existing live heading marker", () => {
  assert.equal(serializeLiveHeadingAsMarkdown(2, "## 부제목"), "## 부제목");
});

test("serializeLiveHeadingAsMarkdown adds the heading marker when text has no live marker", () => {
  assert.equal(serializeLiveHeadingAsMarkdown(2, "부제목"), "## 부제목");
});

test("normalizeInlineContinueTextForInsertion strips a heading marker inside an existing heading", () => {
  assert.equal(normalizeInlineContinueTextForInsertion("## 부제목", true), "부제목");
});

test("normalizeInlineContinueTextForInsertion keeps a heading marker outside a heading", () => {
  assert.equal(normalizeInlineContinueTextForInsertion("## 새 섹션", false), "## 새 섹션");
});

test("stripLiveHeadingMarkerFromSerializedText strips compact live heading markers", () => {
  assert.equal(stripLiveHeadingMarkerFromSerializedText("###부제목"), "부제목");
});
