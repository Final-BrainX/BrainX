import { clusterById, type BrainXNote } from "@/lib/brainx-data";

export type WorkspaceNoteTrendPoint = {
  label: string;
  value: number;
};

export type WorkspaceNoteSummary = {
  totalNotes: number;
  totalLinks: number;
  totalWords: number;
  averageWords: number;
  writingStreak: number;
  topTag: { label: string; count: number } | null;
  topCategory: { label: string; count: number } | null;
  peakHour: { label: string; count: number } | null;
  recentNotes: BrainXNote[];
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatHourRange(startHour: number) {
  const startSuffix = startHour < 12 ? "오전" : "오후";
  const endHour = (startHour + 2) % 24;
  const startDisplay = startHour % 12 || 12;
  const endDisplay = endHour % 12 || 12;
  const endSuffix = endHour < 12 ? "오전" : "오후";
  if (startSuffix === endSuffix) {
    return `${startSuffix} ${startDisplay}-${endDisplay}시`;
  }
  return `${startSuffix} ${startDisplay}시-${endSuffix} ${endDisplay}시`;
}

export function calculateWritingStreak(notes: BrainXNote[]) {
  if (notes.length === 0) return 0;

  const activeDays = new Set(
    notes
      .map((note) => new Date(note.updatedAt || note.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => dateKey(date))
  );

  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 365; index += 1) {
    const key = dateKey(cursor);
    if (!activeDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getRecentDailySeries(notes: BrainXNote[], days = 7) {
  const labels = Array.from({ length: days }, (_, index) => {
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (days - 1 - index));
    return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(cursor);
  });
  const values = Array.from({ length: days }, () => 0);

  notes.forEach((note) => {
    const timestamp = new Date(note.updatedAt || note.createdAt).getTime();
    if (Number.isNaN(timestamp)) return;

    const diffDays = Math.floor((Date.now() - timestamp) / 86_400_000);
    if (diffDays < 0 || diffDays >= days) return;
    values[days - 1 - diffDays] += 1;
  });

  return { labels, values };
}

export function summarizeWorkspaceNotes(notes: BrainXNote[]): WorkspaceNoteSummary {
  const totalNotes = notes.length;
  const totalLinks = notes.reduce((sum, note) => sum + note.links.length, 0);
  const totalWords = notes.reduce((sum, note) => sum + note.words, 0);
  const averageWords = totalNotes === 0 ? 0 : Math.round(totalWords / totalNotes);
  const recentNotes = [...notes].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  }).slice(0, 5);

  const tagCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const hourCounts = Array.from({ length: 24 }, () => 0);

  for (const note of notes) {
    const timestamp = new Date(note.updatedAt || note.createdAt);
    if (!Number.isNaN(timestamp.getTime())) {
      hourCounts[timestamp.getHours()] += 1;
    }
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const category = clusterById(note.cluster).label;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const peakHourIndex = hourCounts.reduce((bestIndex, value, index, array) => (value > array[bestIndex] ? index : bestIndex), 0);
  const peakHourCount = hourCounts[peakHourIndex] ?? 0;

  return {
    totalNotes,
    totalLinks,
    totalWords,
    averageWords,
    writingStreak: calculateWritingStreak(notes),
    topTag: topTag ? { label: topTag[0], count: topTag[1] } : null,
    topCategory: topCategory ? { label: topCategory[0], count: topCategory[1] } : null,
    peakHour: peakHourCount > 0 ? { label: formatHourRange(peakHourIndex), count: peakHourCount } : null,
    recentNotes
  };
}
