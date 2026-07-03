import type { IconName } from "@/components/brainx-ui";

const FEATURE_ICONS: Record<string, IconName> = {
  "AI 글쓰기 도우미": "rewrite",
  "자동 요약": "doc",
  "시맨틱 검색": "search",
  "자동 태그 정리": "sparkle",
  "AI 챗봇": "chat"
};
const FALLBACK_FEATURE_ICON: IconName = "bolt";

export function iconForFeature(label: string): IconName {
  return FEATURE_ICONS[label] ?? FALLBACK_FEATURE_ICON;
}

export function formatCreditCount(value: number) {
  return value.toLocaleString("ko-KR");
}

export function formatTokenPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatResetDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 초기화`;
}
