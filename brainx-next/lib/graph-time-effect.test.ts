import assert from "node:assert/strict";
import test from "node:test";

import {
  graphTimeEffectMinimumOpacity,
  graphTimeEffectOpacityByNoteId,
  isGraphNoteOutsideTimeFilter,
  parseGraphRelativeAgeDays,
} from "./graph-time-effect.ts";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 6, 9, 12, 0, 0);

function note(id: string, ageDays: number) {
  return {
    id,
    updated: `${ageDays} days ago`,
    updatedAt: new Date(NOW - ageDays * DAY_MS).toISOString(),
  };
}

test("graphTimeEffectOpacityByNoteId keeps the latest note fully visible", () => {
  const opacityById = graphTimeEffectOpacityByNoteId([note("latest", 0), note("oldest", 10)], 100, NOW);

  assert.equal(opacityById.get("latest"), 1);
});

test("graphTimeEffectOpacityByNoteId maps the oldest note to the strength minimum", () => {
  const opacityById = graphTimeEffectOpacityByNoteId([note("latest", 0), note("oldest", 10)], 100, NOW);

  assert.equal(opacityById.get("oldest"), graphTimeEffectMinimumOpacity(100));
});

test("graphTimeEffectOpacityByNoteId linearly interpolates middle notes", () => {
  const opacityById = graphTimeEffectOpacityByNoteId([note("latest", 0), note("middle", 5), note("oldest", 10)], 100, NOW);

  assert.equal(opacityById.get("middle"), 0.625);
});

test("graphTimeEffectOpacityByNoteId returns full opacity when all timestamps are equal", () => {
  const sameTime = new Date(NOW).toISOString();
  const opacityById = graphTimeEffectOpacityByNoteId(
    [
      { id: "a", updated: "today", updatedAt: sameTime },
      { id: "b", updated: "today", updatedAt: sameTime },
    ],
    100,
    NOW
  );

  assert.deepEqual(Array.from(opacityById.values()), [1, 1]);
});

test("graphTimeEffectOpacityByNoteId falls back to relative labels when updatedAt has no range", () => {
  const sameTime = new Date(NOW).toISOString();
  const opacityById = graphTimeEffectOpacityByNoteId(
    [
      { id: "latest", updated: "오늘", updatedAt: sameTime },
      { id: "middle", updated: "7일 전", updatedAt: sameTime },
      { id: "oldest", updated: "14일 전", updatedAt: sameTime },
    ],
    60,
    NOW
  );

  assert.equal(opacityById.get("latest"), 1);
  assert.equal(opacityById.get("oldest"), graphTimeEffectMinimumOpacity(60));
  assert.ok(Math.abs((opacityById.get("middle") ?? 0) - 0.725) < 0.000001);
});

test("parseGraphRelativeAgeDays supports Korean and English relative labels", () => {
  assert.equal(parseGraphRelativeAgeDays("방금"), 0);
  assert.equal(parseGraphRelativeAgeDays("어제"), 1);
  assert.equal(parseGraphRelativeAgeDays("3일 전"), 3);
  assert.equal(parseGraphRelativeAgeDays("2 weeks ago"), 14);
});

test("isGraphNoteOutsideTimeFilter uses parsed note age", () => {
  assert.equal(isGraphNoteOutsideTimeFilter(note("a", 2), "최근 1일", NOW), true);
  assert.equal(isGraphNoteOutsideTimeFilter(note("b", 7), "최근 1주", NOW), false);
  assert.equal(isGraphNoteOutsideTimeFilter(note("c", 8), "최근 1주", NOW), true);
  assert.equal(isGraphNoteOutsideTimeFilter(note("d", 30), "전체", NOW), false);
});
