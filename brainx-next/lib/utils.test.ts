import assert from "node:assert/strict";
import test from "node:test";

import { stripMarkdown } from "./utils.ts";

test("stripMarkdown removes TipTap HTML tags and decodes common entities", () => {
  assert.equal(
    stripMarkdown("<p><strong>제주 여행</strong><br>렌터카&nbsp;&amp;&nbsp;우도</p>"),
    "제주 여행 렌터카 & 우도"
  );
});

test("stripMarkdown removes decoded escaped HTML tags", () => {
  assert.equal(
    stripMarkdown("&lt;p&gt;제주 여행&lt;/p&gt; &lt;strong&gt;렌터카&lt;/strong&gt;"),
    "제주 여행 렌터카"
  );
});

test("stripMarkdown keeps escaped angle-bracket text that is not an HTML tag", () => {
  assert.equal(stripMarkdown("A &lt; B &amp; C &gt; D"), "A < B & C > D");
});

test("stripMarkdown keeps raw angle-bracket text that is not an HTML tag", () => {
  assert.equal(stripMarkdown("A < B & C > D"), "A < B & C > D");
});

test("stripMarkdown keeps markdown cleanup after HTML cleanup", () => {
  assert.equal(
    stripMarkdown("<!-- internal --><ul><li>**핵심** [[노트]]</li><li>[링크](https://example.com)</li></ul>"),
    "핵심 노트 링크"
  );
});
