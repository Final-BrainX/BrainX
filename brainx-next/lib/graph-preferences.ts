import { getLocalStoredValue, setLocalStoredValue } from "@/lib/client-storage";
import {
  graphPreferencesStorageKey,
  parseGraphPreferences,
  serializeGraphPreferences,
  type GraphPreferenceScope,
  type GraphPreferences,
} from "./graph-preferences-core";

export {
  GRAPH_PREFERENCE_DEFAULTS,
  graphPreferencesStorageKey,
  parseGraphPreferences,
  serializeGraphPreferences,
  type GraphPreferenceScope,
  type GraphPreferences,
} from "./graph-preferences-core";

export function readGraphPreferences(scope: GraphPreferenceScope = {}) {
  try {
    return parseGraphPreferences(getLocalStoredValue(graphPreferencesStorageKey(scope)));
  } catch {
    return parseGraphPreferences(null);
  }
}

export function writeGraphPreferences(scope: GraphPreferenceScope, preferences: GraphPreferences) {
  try {
    setLocalStoredValue(graphPreferencesStorageKey(scope), serializeGraphPreferences(preferences));
  } catch {
    // 저장소를 사용할 수 없어도 그래프 탐색 기능은 그대로 동작한다.
  }
}
