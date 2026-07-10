const STORAGE_PREFIX = "brainx_graph_preferences_v1";

export type GraphPreferenceScope = {
  userId?: string | null;
  documentGroupId?: string | null;
};

export type GraphPreferences = {
  layoutMode: "force" | "tree" | "radial";
  theme: "2d" | "universe";
  clusterOn: boolean;
  timeFilter: "전체" | "최근 1일" | "최근 1주";
  timeEffectEnabled: boolean;
  timeEffectStrength: number;
  hiddenClusters: Partial<Record<string, boolean>>;
  sidebarsLocked: boolean;
};

export const GRAPH_PREFERENCE_DEFAULTS: GraphPreferences = {
  layoutMode: "force",
  theme: "2d",
  clusterOn: false,
  timeFilter: "전체",
  timeEffectEnabled: false,
  timeEffectStrength: 60,
  hiddenClusters: {},
  sidebarsLocked: false,
};

function scopePart(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return encodeURIComponent(normalized || fallback);
}

export function graphPreferencesStorageKey(scope: GraphPreferenceScope = {}) {
  return `${STORAGE_PREFIX}:${scopePart(scope.userId, "guest")}:${scopePart(scope.documentGroupId, "local")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function parseStrength(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return GRAPH_PREFERENCE_DEFAULTS.timeEffectStrength;
  return Math.round(Math.max(0, Math.min(100, value)) / 5) * 5;
}

function parseHiddenClusters(value: unknown) {
  if (!isRecord(value)) return {};
  const hiddenClusters: Partial<Record<string, boolean>> = {};
  for (const [clusterId, hidden] of Object.entries(value)) {
    if (clusterId.trim().length > 0 && typeof hidden === "boolean") {
      hiddenClusters[clusterId] = hidden;
    }
  }
  return hiddenClusters;
}

export function parseGraphPreferences(raw: string | null | undefined): GraphPreferences {
  if (!raw) return { ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: {} };
    return {
      layoutMode: parseEnum(parsed.layoutMode, ["force", "tree", "radial"], GRAPH_PREFERENCE_DEFAULTS.layoutMode),
      theme: parseEnum(parsed.theme, ["2d", "universe"], GRAPH_PREFERENCE_DEFAULTS.theme),
      clusterOn: parseBoolean(parsed.clusterOn, GRAPH_PREFERENCE_DEFAULTS.clusterOn),
      timeFilter: parseEnum(parsed.timeFilter, ["전체", "최근 1일", "최근 1주"], GRAPH_PREFERENCE_DEFAULTS.timeFilter),
      timeEffectEnabled: parseBoolean(parsed.timeEffectEnabled, GRAPH_PREFERENCE_DEFAULTS.timeEffectEnabled),
      timeEffectStrength: parseStrength(parsed.timeEffectStrength),
      hiddenClusters: parseHiddenClusters(parsed.hiddenClusters),
      sidebarsLocked: parseBoolean(parsed.sidebarsLocked, GRAPH_PREFERENCE_DEFAULTS.sidebarsLocked),
    };
  } catch {
    return { ...GRAPH_PREFERENCE_DEFAULTS, hiddenClusters: {} };
  }
}

export function serializeGraphPreferences(preferences: GraphPreferences) {
  return JSON.stringify({
    ...preferences,
    hiddenClusters: Object.fromEntries(Object.entries(preferences.hiddenClusters).filter(([, hidden]) => hidden)),
  });
}
