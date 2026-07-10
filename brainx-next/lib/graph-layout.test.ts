import assert from "node:assert/strict";
import test from "node:test";

import { initialGraphNodePosition } from "./graph-layout.ts";

test("bridge nodes start near the midpoint of their source notes", () => {
  const sources = { "source-a": { x: 0, y: 0 }, "source-b": { x: 200, y: 0 } };
  const position = initialGraphNodePosition(
    "bridge-1",
    ["source-a", "source-b"],
    sources,
    { x: 999, y: 999 },
  );

  assert.equal(position.x, 100);
  assert.ok(Math.abs(position.y) >= 45 && Math.abs(position.y) <= 110);
  assert.deepEqual(sources, { "source-a": { x: 0, y: 0 }, "source-b": { x: 200, y: 0 } });
});

test("unlinked nodes keep their fallback position", () => {
  assert.deepEqual(
    initialGraphNodePosition("new-note", [], {}, { x: 10, y: 20 }),
    { x: 10, y: 20 },
  );
});
