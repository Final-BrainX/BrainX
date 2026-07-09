import type { BrainXNote } from "@/lib/brainx-data";

const DAY_MS = 86_400_000;
const MIN_OPACITY_AT_ZERO_STRENGTH = 0.75;
const MIN_OPACITY_AT_FULL_STRENGTH = 0.25;

type TimeNote = Pick<BrainXNote, "id" | "updated" | "updatedAt">;
type ViewedAtSource = ReadonlyMap<string, number> | Record<string, number>;
type GraphTimeEffectOptions = {
  now?: number;
  viewedAtByNoteId?: ViewedAtSource | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseDateTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function parseGraphRelativeAgeDays(value: string | null | undefined) {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (["방금", "오늘", "today", "just now", "now"].includes(text)) return 0;
  if (["어제", "yesterday"].includes(text)) return 1;

  if (/^\d+\s*(초|분|시간|second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\s*(전|ago)?$/.test(text)) {
    return 0;
  }

  const dayMatch = text.match(/^(\d+)\s*(일|day|days)\s*(전|ago)?$/);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = text.match(/^(\d+)\s*(주|week|weeks)\s*(전|ago)?$/);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  return null;
}

export function graphNoteAgeDays(note: Pick<BrainXNote, "updated" | "updatedAt">, now = Date.now()) {
  const relativeAgeDays = parseGraphRelativeAgeDays(note.updated);
  if (relativeAgeDays !== null) return relativeAgeDays;

  const timestamp = parseDateTimestamp(note.updatedAt);
  if (timestamp === null) return 0;
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

export function isGraphNoteOutsideTimeFilter(
  note: Pick<BrainXNote, "updated" | "updatedAt">,
  timeFilter: string,
  now = Date.now()
) {
  if (timeFilter === "전체") return false;
  const limit = timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99;
  return graphNoteAgeDays(note, now) > limit;
}

export function graphTimeEffectMinimumOpacity(strength: number) {
  const normalizedStrength = clamp(Number.isFinite(strength) ? strength : 60, 0, 100) / 100;
  return MIN_OPACITY_AT_ZERO_STRENGTH - normalizedStrength * (MIN_OPACITY_AT_ZERO_STRENGTH - MIN_OPACITY_AT_FULL_STRENGTH);
}

function resolveTimestamp(note: TimeNote, useRelativeFallback: boolean, now: number) {
  const absoluteTimestamp = parseDateTimestamp(note.updatedAt);
  const relativeAgeDays = parseGraphRelativeAgeDays(note.updated);
  const relativeTimestamp = relativeAgeDays === null ? null : now - relativeAgeDays * DAY_MS;
  if (useRelativeFallback && relativeTimestamp !== null) return relativeTimestamp;
  return absoluteTimestamp ?? relativeTimestamp;
}

function normalizeGraphTimeEffectOptions(optionsOrNow: number | GraphTimeEffectOptions | undefined): Required<Pick<GraphTimeEffectOptions, "now">> & Pick<GraphTimeEffectOptions, "viewedAtByNoteId"> {
  if (typeof optionsOrNow === "number") {
    return { now: optionsOrNow, viewedAtByNoteId: null };
  }
  return {
    now: optionsOrNow?.now ?? Date.now(),
    viewedAtByNoteId: optionsOrNow?.viewedAtByNoteId ?? null,
  };
}

function isViewedAtMap(source: ViewedAtSource): source is ReadonlyMap<string, number> {
  return typeof (source as ReadonlyMap<string, number>).get === "function";
}

function viewedAtTimestamp(viewedAtByNoteId: ViewedAtSource | null | undefined, noteId: string) {
  if (!viewedAtByNoteId) return null;
  const value = isViewedAtMap(viewedAtByNoteId) ? viewedAtByNoteId.get(noteId) : viewedAtByNoteId[noteId];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function viewedAtOpacityByNoteId(notes: TimeNote[], strength: number, viewedAtByNoteId: ViewedAtSource) {
  const minimumOpacity = graphTimeEffectMinimumOpacity(strength);
  const timestampsById = new Map<string, number>();
  for (const note of notes) {
    const timestamp = viewedAtTimestamp(viewedAtByNoteId, note.id);
    if (timestamp !== null) timestampsById.set(note.id, timestamp);
  }

  if (timestampsById.size === 0) return null;
  const timestamps = Array.from(timestampsById.values());
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const result = new Map<string, number>();

  for (const note of notes) {
    const timestamp = timestampsById.get(note.id);
    if (timestamp === undefined) {
      result.set(note.id, minimumOpacity);
      continue;
    }
    if (minTimestamp === maxTimestamp) {
      result.set(note.id, 1);
      continue;
    }
    const recencyRatio = (timestamp - minTimestamp) / (maxTimestamp - minTimestamp);
    result.set(note.id, minimumOpacity + recencyRatio * (1 - minimumOpacity));
  }
  return result;
}

export function graphTimeEffectOpacityByNoteId(
  notes: TimeNote[],
  strength: number,
  optionsOrNow?: number | GraphTimeEffectOptions
) {
  const { now, viewedAtByNoteId } = normalizeGraphTimeEffectOptions(optionsOrNow);
  if (viewedAtByNoteId) {
    const viewedOpacity = viewedAtOpacityByNoteId(notes, strength, viewedAtByNoteId);
    if (viewedOpacity) return viewedOpacity;
  }

  const absoluteTimestamps = notes
    .map((note) => parseDateTimestamp(note.updatedAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  const absoluteMin = absoluteTimestamps.length > 0 ? Math.min(...absoluteTimestamps) : null;
  const absoluteMax = absoluteTimestamps.length > 0 ? Math.max(...absoluteTimestamps) : null;
  const useRelativeFallback = absoluteMin === null || absoluteMax === null || absoluteMin === absoluteMax;

  const timestampsById = new Map<string, number>();
  for (const note of notes) {
    const timestamp = resolveTimestamp(note, useRelativeFallback, now);
    if (timestamp !== null) {
      timestampsById.set(note.id, timestamp);
    }
  }

  const timestamps = Array.from(timestampsById.values());
  const result = new Map<string, number>();
  if (timestamps.length <= 1) {
    for (const note of notes) result.set(note.id, 1);
    return result;
  }

  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  if (minTimestamp === maxTimestamp) {
    for (const note of notes) result.set(note.id, 1);
    return result;
  }

  const minimumOpacity = graphTimeEffectMinimumOpacity(strength);
  for (const note of notes) {
    const timestamp = timestampsById.get(note.id);
    if (timestamp === undefined) {
      result.set(note.id, 1);
      continue;
    }
    const recencyRatio = (timestamp - minTimestamp) / (maxTimestamp - minTimestamp);
    result.set(note.id, minimumOpacity + recencyRatio * (1 - minimumOpacity));
  }
  return result;
}
