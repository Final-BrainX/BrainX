import { countWords, stripMarkdown } from "@/lib/utils";
import { deriveGraphEdges as deriveKnowledgeGraphEdges } from "@/lib/knowledge-graph";

export type ClusterId = string;

export type BrainXCluster = {
  id: ClusterId;
  label: string;
  color: string;
};

export type BrainXNote = {
  id: string;
  aiSourceNoteId?: string | null;
  title: string;
  markdown: string;
  searchIndexStatus?: "NOT_INDEXED" | "PROVISIONAL" | "STALE" | "INDEXED" | "FAILED" | "REMOVED" | "UNKNOWN";
  availableForAiFeatures?: boolean;
  indexedAt?: string | null;
  indexStatusUnavailable?: boolean;
  folderId: ClusterId;
  cluster: ClusterId;
  summary: string;
  tags: string[];
  links: string[];
  updated: string;
  words: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type ChatSession = {
  id: string;
  title: string;
  when: string;
  preview: string;
};

export type PricingPlan = {
  id: string;
  name: string;
  price: number;
  yr: number;
  tag: string;
  best?: boolean;
  feats: string[];
  cta: string;
};

export type ModelOption = {
  id: string;
  name: string;
  sub: string;
};

export type Interest = string;

export const NOW = new Date("2026-06-08T10:00:00+09:00");

export const CLUSTERS: BrainXCluster[] = [
  { id: "ml", label: "머신러닝", color: "59 130 246" },
  { id: "read", label: "독서 기록", color: "139 92 246" },
  { id: "proj", label: "프로젝트 아이디어", color: "34 211 238" },
  { id: "work", label: "업무·회의", color: "244 114 182" },
  { id: "life", label: "생각·일상", color: "52 211 153" }
];

const sampleMarkdown: Partial<Record<string, string>> = {
  n1: `## 핵심 직관
Self-attention은 문장 안의 모든 토큰이 서로를 **직접** 바라보게 한다. 거리가 멀어도 관련 있으면 강하게 연결된다.

## Query · Key · Value
- **Query**: "나는 무엇을 찾고 있나"
- **Key**: "나는 무엇을 가지고 있나"
- **Value**: 실제로 전달되는 정보
세 행렬의 학습된 사상이 어텐션의 전부다. [[RAG 파이프라인 설계 노트]]와 함께 보면 좋다.

## 멀티헤드
여러 개의 어텐션을 병렬로 두어, 서로 다른 표현 부분공간을 동시에 학습한다.

## 포지셔널 인코딩
어텐션 자체는 순서를 모른다. 그래서 위치 정보를 더해 순서를 주입한다.`
};

const noteSeeds = [
  { id: "n1", title: "Transformer 아키텍처 정리", cluster: "ml", fav: true, words: 1840, updated: "2시간 전", summary: "Self-attention의 핵심은 Query·Key·Value 사상. 멀티헤드로 표현 부분공간을 확장하고, 포지셔널 인코딩으로 순서를 주입한다.", links: ["n2", "n4", "n9"], tags: ["딥러닝", "NLP", "어텐션"] },
  { id: "n2", title: "RAG 파이프라인 설계 노트", cluster: "ml", fav: true, words: 2210, updated: "어제", summary: "문서 청킹 → 임베딩 → 벡터DB 검색 → 재순위화 → 프롬프트 주입. 검색 품질이 답변 품질을 좌우한다.", links: ["n1", "n3", "n12"], tags: ["RAG", "검색", "LLM"] },
  { id: "n3", title: "벡터 데이터베이스 비교", cluster: "ml", fav: false, words: 980, updated: "3일 전", summary: "pgvector는 운영 단순, Qdrant는 필터링 강점, Pinecone은 매니지드 편의성. 규모와 운영비로 결정.", links: ["n2"], tags: ["인프라", "임베딩"] },
  { id: "n4", title: "어텐션은 왜 작동하는가", cluster: "ml", fav: false, words: 1320, updated: "5일 전", summary: "거리에 무관한 직접 연결로 장기 의존성을 포착. 가중치는 토큰 간 관련도를 학습한 결과다.", links: ["n1"], tags: ["직관", "이론"] },
  { id: "n5", title: "《생각에 관한 생각》 메모", cluster: "read", fav: true, words: 760, updated: "1일 전", summary: "시스템1·2의 이중 처리. 직관의 편향을 인지하면 더 나은 판단의 발판이 된다.", links: ["n6", "n10"], tags: ["카너먼", "심리"] },
  { id: "n6", title: "《클린 아키텍처》 핵심", cluster: "read", fav: false, words: 1110, updated: "6일 전", summary: "의존성은 안쪽으로. 정책과 세부사항을 분리해 변화에 강한 경계를 만든다.", links: ["n5", "n8"], tags: ["설계", "SOLID"] },
  { id: "n7", title: "독서 루틴 회고", cluster: "read", fav: false, words: 420, updated: "1주 전", summary: "아침 20분 고정 독서가 가장 꾸준했다. 하이라이트는 당일 BrainX에 옮겨 적기.", links: ["n5"], tags: ["습관", "회고"] },
  { id: "n8", title: "BrainX 온보딩 개선 아이디어", cluster: "proj", fav: true, words: 640, updated: "4시간 전", summary: "첫 노트 작성 전 샘플 그래프를 먼저 보여주면 가치 인식이 빨라질 것. A/B로 검증 예정.", links: ["n6", "n11"], tags: ["제품", "온보딩"] },
  { id: "n9", title: "시맨틱 검색 UX 스케치", cluster: "proj", fav: false, words: 530, updated: "2일 전", summary: "키워드/의미 토글을 하나의 바에 통합. 의미 결과는 관련도 막대로 신뢰를 시각화.", links: ["n1", "n12"], tags: ["UX", "검색"] },
  { id: "n10", title: "지식 그래프 시각화 리서치", cluster: "proj", fav: false, words: 870, updated: "2일 전", summary: "힘-지향 레이아웃 + 클러스터 채색이 탐색에 유리. 노드 과밀 시 중요도 기반 축약.", links: ["n5", "n9"], tags: ["시각화", "그래프"] },
  { id: "n11", title: "스프린트 12 회의록", cluster: "work", fav: false, words: 350, updated: "오늘", summary: "그래프 성능 이슈 우선 처리. 인라인 AI 툴바 범위 축소 합의. 결제 화면 다음 스프린트로.", links: ["n8"], tags: ["회의", "스프린트"] },
  { id: "n12", title: "프롬프트 엔지니어링 패턴", cluster: "work", fav: false, words: 990, updated: "3일 전", summary: "역할·맥락·제약·예시 4요소. 출처를 강제하면 환각이 크게 줄어든다.", links: ["n2", "n9"], tags: ["LLM", "프롬프트"] },
  { id: "n13", title: "주말 산책 단상", cluster: "life", fav: false, words: 180, updated: "4일 전", summary: "걷는 동안 떠오른 연결들. 머릿속 흩어진 메모를 그래프가 이어줄 때의 쾌감.", links: ["n7"], tags: ["일상", "영감"] }
] as const;

export const CHAT_SESSIONS: ChatSession[] = [
  { id: "s1", title: "RAG 검색 품질 높이는 법", when: "오늘", preview: "재순위화 모델을 추가하면…" },
  { id: "s2", title: "어텐션 직관 다시 설명", when: "어제", preview: "Query와 Key의 내적이…" },
  { id: "s3", title: "클린 아키텍처 적용 사례", when: "3일 전", preview: "경계를 나누는 기준은…" }
];

export const PRICING: PricingPlan[] = [
  { id: "free", name: "Free", price: 0, yr: 0, tag: "개인의 시작", feats: ["노트 무제한 저장", "기본 키워드 검색", "마인드맵 100 노드", "AI 챗 월 50회"], cta: "현재 플랜" },
  { id: "pro", name: "Pro", price: 14900, yr: 11900, tag: "가장 인기", best: true, feats: ["시맨틱 의미 검색", "RAG 챗봇 고급 사용량", "공유 링크 30일·무제한", "AI 인사이트 리포트", "마인드맵 무제한"], cta: "Pro 시작하기" },
  { id: "team", name: "Team", price: 29900, yr: 24900, tag: "함께 쌓는 지식", feats: ["Pro 모든 기능", "팀 공유 워크스페이스", "권한·역할 관리", "관리자 토큰 대시보드", "우선 지원"], cta: "팀 도입 문의" }
];

export const INTERESTS: Interest[] = ["개발", "디자인", "학습", "독서", "업무", "연구", "블로그", "AI/ML", "경제", "언어"];

export const MODELS: ModelOption[] = [
  { id: "claude", name: "Claude Sonnet", sub: "균형·추론" },
  { id: "gpt", name: "GPT-4o", sub: "범용·빠름" },
  { id: "gemini", name: "Gemini Pro", sub: "롱컨텍스트" }
];

export const SAMPLE_MD = sampleMarkdown;

export function seedNotes(): BrainXNote[] {
  const createdAt = NOW.toISOString();
  return noteSeeds.map((note) => ({
    id: note.id,
    title: note.title,
    markdown: sampleMarkdown[note.id] ?? `## ${note.title}\n\n${note.summary}`,
    folderId: note.cluster,
    cluster: note.cluster,
    summary: note.summary,
    tags: [...note.tags],
    links: [...note.links],
    updated: note.updated,
    words: note.words,
    isFavorite: note.fav,
    createdAt,
    updatedAt: createdAt,
    version: 1
  }));
}

export function noteById(notes: BrainXNote[], id: string) {
  return notes.find((note) => note.id === id) ?? null;
}

export function clusterById(id: string) {
  return CLUSTERS.find((cluster) => cluster.id === id) ?? CLUSTERS[0];
}

export function deriveGraphEdges(notes: BrainXNote[]) {
  return deriveKnowledgeGraphEdges(notes);
}

export function summarizeMarkdown(markdown: string) {
  const text = stripMarkdown(markdown);
  if (!text) return "";
  return text.slice(0, 140);
}

export function createNoteSeed(existingNotes: BrainXNote[], folderId: ClusterId = "proj"): BrainXNote {
  const now = new Date().toISOString();
  const existingTitles = existingNotes.map((note) => note.title);
  const base = "새 노트";
  let title = base;
  let index = 1;
  while (existingTitles.includes(title)) {
    title = `${base} ${index}`;
    index += 1;
  }

  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    markdown: "",
    folderId,
    cluster: folderId,
    summary: "",
    tags: [],
    links: [],
    updated: "방금",
    words: 0,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    version: 1
  };
}

export function updateNoteDerived(note: BrainXNote, patch: Partial<BrainXNote>) {
  const markdown = patch.markdown ?? note.markdown;
  const title = patch.title ?? note.title;
  return {
    ...note,
    ...patch,
    title,
    markdown,
    words: countWords(markdown),
    summary: patch.summary ?? note.summary,
    updated: "방금",
    updatedAt: new Date().toISOString(),
    version: note.version + 1
  };
}
