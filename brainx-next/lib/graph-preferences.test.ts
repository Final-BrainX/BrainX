import assert from "node:assert/strict";
import test from "node:test";

import {
  GRAPH_PREFERENCE_DEFAULTS,
  graphPreferencesStorageKey,
  parseGraphPreferences,
  serializeGraphPreferences,
} from "./graph-preferences-core.ts";

test("graph preference keys are isolated by user and workspace", () => {
  assert.equal(
    graphPreferencesStorageKey({ userId: "user-1", documentGroupId: "team space" }),
    "brainx_graph_preferences_v1:user-1:team%20space"
  );
  assert.notEqual(
    graphPreferencesStorageKey({ userId: "user-1", documentGroupId: "workspace-a" }),
    graphPreferencesStorageKey({ userId: "user-2", documentGroupId: "workspace-a" })
  );
});

test("graph preferences restore only valid values and normalize strength", () => {
  const preferences = parseGraphPreferences(JSON.stringify({
    layoutMode: "radial",
    theme: "universe",
    clusterOn: true,
    timeFilter: "최근 1주",
    timeEffectEnabled: true,
    timeEffectStrength: 63,
    hiddenClusters: { alpha: true, beta: false, "": true, invalid: "true" },
    sidebarsLocked: true,
  }));

  assert.deepEqual(preferences, {
    layoutMode: "radial",
    theme: "universe",
    clusterOn: true,
    timeFilter: "최근 1주",
    timeEffectEnabled: true,
    timeEffectStrength: 65,
    hiddenClusters: { alpha: true, beta: false },
    sidebarsLocked: true,
  });
});

test("malformed or incompatible graph preferences fall back safely", () => {
  assert.deepEqual(parseGraphPreferences("not-json"), { ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: {} });
  assert.deepEqual(parseGraphPreferences(JSON.stringify({ layoutMode: "grid", timeEffectStrength: -10 })), {
    ...GRAPH_PREFERENCE_DEFAULTS,
    timeEffectStrength: 0,
    hiddenClusters: {},
  });
});

test("serialization keeps only hidden cluster entries", () => {
  assert.equal(
    serializeGraphPreferences({ ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: { visible: false, hidden: true } }),
    JSON.stringify({ ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: { hidden: true } })
  );
});
