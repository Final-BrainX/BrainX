import { stripMarkdown } from "@/lib/utils";
import type { BrainXNote } from "@/lib/brainx-data";

export type KnowledgeGraphEdgeType =
  | "RELATED"
  | "PARENT"
  | "CHILD"
  | "CAUSE"
  | "RESULT"
  | "WORKFLOW"
  | "REFERENCE"
  | "PROJECT"
  | "TAG"
  | "SIMILAR";

export type KnowledgeGraphEdge = {
  source: string;
  target: string;
  type: KnowledgeGraphEdgeType;
  weight: number;
  reason: string;
  bridge?: boolean;
};

type NoteSignals = {
  note: BrainXNote;
  titleTokens: string[];
  bodyTokens: string[];
  allTokens: Set<string>;
  wikiLinks: string[];
  keywords: Set<string>;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "about",
  "노트",
  "정리",
  "메모",
  "기록",
  "노트들",
  "개요",
  "정리본",
  "초안",
  "요약",
  "핵심"
]);

const WORKFLOW_TERMS: Array<{ term: string; order: number }> = [
  { term: "기획", order: 1 },
  { term: "요구사항", order: 1 },
  { term: "설계", order: 2 },
  { term: "구현", order: 3 },
  { term: "개발", order: 3 },
  { term: "테스트", order: 4 },
  { term: "배포", order: 5 },
  { term: "운영", order: 6 },
];

const CAUSE_TERMS = ["원인", "문제", "병목", "지연", "비용", "오류"];
const RESULT_TERMS = ["결과", "영향", "저하", "증가", "이탈", "실패", "불안정"];
const PROJECT_TERMS = ["프로젝트", "플랫폼", "서비스", "시스템", "BrainX"];
const PARENT_HINTS = ["개요", "요약", "핵심", "전반", "전체", "정리"];

export function deriveGraphEdges(notes: BrainXNote[]): KnowledgeGraphEdge[] {
  const signals = notes.map(extractSignals);
  const byId = new Map(signals.map((signal) => [signal.note.id, signal]));
  const edges = new Map<string, KnowledgeGraphEdge>();

  const addEdge = (edge: KnowledgeGraphEdge) => {
    if (edge.source === edge.target) return;
    const key = edgeKey(edge.source, edge.target);
    const existing = edges.get(key);
    if (!existing || edge.weight > existing.weight || (edge.weight === existing.weight && preferType(edge.type, existing.type))) {
      edges.set(key, edge);
    }
  };

  for (const signal of signals) {
    for (const linkedId of signal.note.links ?? []) {
      if (!byId.has(linkedId)) continue;
      addEdge({
        source: signal.note.id,
        target: linkedId,
        type: "REFERENCE",
        weight: 1,
        reason: `${signal.note.title} 노트가 ${byId.get(linkedId)?.note.title ?? linkedId} 노트를 직접 참조합니다.`,
      });
    }
    for (const linkedTitle of signal.wikiLinks) {
      const target = findNoteByTitle(signals, linkedTitle);
      if (!target || target.note.id === signal.note.id) continue;
      addEdge({
        source: signal.note.id,
        target: target.note.id,
        type: "REFERENCE",
        weight: 0.95,
        reason: `${signal.note.title} 노트의 위키링크가 ${target.note.title}를 참조합니다.`,
      });
    }
  }

  for (let i = 0; i < signals.length; i += 1) {
    for (let j = i + 1; j < signals.length; j += 1) {
      const a = signals[i];
      const b = signals[j];
      const pair = scorePair(a, b);
      if (!pair) continue;
      addEdge(pair);
    }
  }

  return Array.from(edges.values()).sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
}

function extractSignals(note: BrainXNote): NoteSignals {
  const markdown = note.markdown ?? "";
  const plain = stripMarkdown(markdown);
  const titleTokens = tokenize(note.title);
  const bodyTokens = tokenize(plain);
  const keywords = new Set([...titleTokens, ...bodyTokens, ...normalizeTags(note.tags)]);
  return {
    note,
    titleTokens,
    bodyTokens,
    allTokens: keywords,
    wikiLinks: extractWikiLinks(markdown),
    keywords
  };
}

function scorePair(a: NoteSignals, b: NoteSignals): KnowledgeGraphEdge | null {
  const sharedTags = intersection(normalizeTags(a.note.tags), normalizeTags(b.note.tags));
  const sharedTokens = intersection(a.allTokens, b.allTokens);
  const titleOverlap = intersection(new Set(a.titleTokens), new Set(b.titleTokens));
  const combinedText = `${a.note.title} ${a.note.markdown}\n${b.note.title} ${b.note.markdown}`;

  if (sharedTags.length > 0) {
    return bestDirectionalEdge(a, b, "TAG", Math.min(0.95, 0.68 + sharedTags.length * 0.08), `공통 태그 ${sharedTags.map((tag) => `#${tag}`).join(", ")}를 공유합니다.`);
  }

  const projectCue = findProjectCue(a, b);
  if (projectCue) {
    return bestDirectionalEdge(a, b, "PROJECT", 0.8, projectCue);
  }

  const workflow = workflowScore(a, b);
  if (workflow) {
    return workflow;
  }

  const causeResult = causeResultScore(a, b, combinedText);
  if (causeResult) {
    return causeResult;
  }

  const related = sharedTokens.length > 0 || titleOverlap.length > 0;
  const similarity = jaccard(a.allTokens, b.allTokens);
  if (related && similarity >= 0.18) {
    return bestDirectionalEdge(a, b, "RELATED", Math.max(0.4, Math.min(0.78, 0.52 + similarity * 0.4)), `주요 키워드 ${sharedTokens.slice(0, 3).join(", ")}를 중심으로 의미가 가깝습니다.`);
  }

  if (similarity >= 0.28) {
    return bestDirectionalEdge(a, b, "SIMILAR", Math.max(0.4, Math.min(0.74, 0.42 + similarity * 0.45)), `본문과 제목의 핵심 단어가 많이 겹칩니다.`);
  }

  if (sharedTokens.length >= 2 && similarity >= 0.14) {
    return bestDirectionalEdge(a, b, "RELATED", 0.42, `주제 관련 키워드가 일부 겹쳐 함께 보면 맥락을 이해하기 쉽습니다.`);
  }

  const parentChild = parentChildScore(a, b);
  if (parentChild) {
    return parentChild;
  }

  return null;
}

function workflowScore(a: NoteSignals, b: NoteSignals): KnowledgeGraphEdge | null {
  const aOrder = workflowOrder(a);
  const bOrder = workflowOrder(b);
  if (aOrder === null || bOrder === null || aOrder === bOrder) return null;
  if (Math.abs(aOrder - bOrder) !== 1) return null;
  if (aOrder < bOrder) {
    return bestDirectionalEdge(a, b, "WORKFLOW", 0.84, `${a.note.title}가 ${b.note.title}보다 먼저 확인하는 순서에 가깝습니다.`);
  }
  return bestDirectionalEdge(b, a, "WORKFLOW", 0.84, `${b.note.title}가 ${a.note.title}보다 먼저 확인하는 순서에 가깝습니다.`);
}

function causeResultScore(a: NoteSignals, b: NoteSignals, combinedText: string): KnowledgeGraphEdge | null {
  const aText = combinedTextFor(a);
  const bText = combinedTextFor(b);
  const aCause = hasAny(aText, CAUSE_TERMS);
  const bCause = hasAny(bText, CAUSE_TERMS);
  const aResult = hasAny(aText, RESULT_TERMS);
  const bResult = hasAny(bText, RESULT_TERMS);
  if (aCause && bResult) {
    return bestDirectionalEdge(a, b, "CAUSE", 0.8, `${a.note.title}는 원인을 설명하고 ${b.note.title}는 그 결과를 설명합니다.`);
  }
  if (bCause && aResult) {
    return bestDirectionalEdge(b, a, "CAUSE", 0.8, `${b.note.title}는 원인을 설명하고 ${a.note.title}는 그 결과를 설명합니다.`);
  }
  if (hasAny(combinedText, ["해결책", "대안", "개선", "해결"])) {
    return null;
  }
  return null;
}

function bestDirectionalEdge(a: NoteSignals, b: NoteSignals, type: KnowledgeGraphEdgeType, weight: number, reason: string): KnowledgeGraphEdge {
  return {
    source: a.note.id,
    target: b.note.id,
    type,
    weight: clamp(weight),
    reason,
    bridge: type === "WORKFLOW" || type === "CAUSE" || type === "RESULT"
  };
}

function findProjectCue(a: NoteSignals, b: NoteSignals): string | null {
  const aTitle = a.note.title.toLowerCase();
  const bTitle = b.note.title.toLowerCase();
  const sharedProject = PROJECT_TERMS.find((term) => aTitle.includes(term.toLowerCase()) && bTitle.includes(term.toLowerCase()));
  if (sharedProject) {
    return `${a.note.title}와 ${b.note.title}는 ${sharedProject}라는 같은 프로젝트/도메인 맥락을 공유합니다.`;
  }
  const aProjectTags = normalizeTags(a.note.tags).some((tag) => PROJECT_TERMS.some((term) => tag.includes(term.toLowerCase())));
  const bProjectTags = normalizeTags(b.note.tags).some((tag) => PROJECT_TERMS.some((term) => tag.includes(term.toLowerCase())));
  if (aProjectTags && bProjectTags) {
    return `${a.note.title}와 ${b.note.title}는 같은 프로젝트 성격의 태그를 공유합니다.`;
  }
  return null;
}

function parentChildScore(a: NoteSignals, b: NoteSignals): KnowledgeGraphEdge | null {
  const aText = `${a.note.title} ${a.note.markdown}`.toLowerCase();
  const bText = `${b.note.title} ${b.note.markdown}`.toLowerCase();
  const aIsParent = PARENT_HINTS.some((hint) => aText.includes(hint)) || a.note.title.split(/\s+/).length <= 3;
  const bIsParent = PARENT_HINTS.some((hint) => bText.includes(hint)) || b.note.title.split(/\s+/).length <= 3;
  if (aIsParent && !bIsParent && jaccard(a.allTokens, b.allTokens) >= 0.22) {
    return bestDirectionalEdge(a, b, "PARENT", 0.72, `${a.note.title}가 더 넓은 상위 개념이고 ${b.note.title}가 그 하위 구체화에 가깝습니다.`);
  }
  if (bIsParent && !aIsParent && jaccard(a.allTokens, b.allTokens) >= 0.22) {
    return bestDirectionalEdge(b, a, "PARENT", 0.72, `${b.note.title}가 더 넓은 상위 개념이고 ${a.note.title}가 그 하위 구체화에 가깝습니다.`);
  }
  return null;
}

function workflowOrder(signal: NoteSignals): number | null {
  const text = combinedTextFor(signal);
  let best: number | null = null;
  for (const entry of WORKFLOW_TERMS) {
    if (text.includes(entry.term)) {
      best = best === null ? entry.order : Math.min(best, entry.order);
    }
  }
  return best;
}

function combinedTextFor(signal: NoteSignals) {
  return `${signal.note.title} ${signal.note.markdown} ${signal.note.tags.join(" ")}`.toLowerCase();
}

function findNoteByTitle(signals: NoteSignals[], title: string) {
  const normalized = title.trim().toLowerCase();
  return signals.find((signal) => signal.note.title.trim().toLowerCase() === normalized) ?? null;
}

function extractWikiLinks(markdown: string) {
  const links = markdown.match(/\[\[([^\]]+)\]\]/g) ?? [];
  return links.map((link) => link.slice(2, -2).trim()).filter(Boolean);
}

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function intersection<T>(left: Set<T> | T[], right: Set<T> | T[]) {
  const leftSet = left instanceof Set ? left : new Set(left);
  const rightSet = right instanceof Set ? right : new Set(right);
  const result: T[] = [];
  for (const value of leftSet) {
    if (rightSet.has(value)) result.push(value);
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>) {
  const shared = intersection(left, right).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : shared / union;
}

function preferType(a: KnowledgeGraphEdgeType, b: KnowledgeGraphEdgeType) {
  const rank: Record<KnowledgeGraphEdgeType, number> = {
    REFERENCE: 10,
    WORKFLOW: 9,
    CAUSE: 8,
    RESULT: 8,
    PARENT: 7,
    CHILD: 7,
    PROJECT: 6,
    TAG: 5,
    RELATED: 4,
    SIMILAR: 3
  };
  return rank[a] > rank[b];
}

function edgeKey(source: string, target: string) {
  return [source, target].sort().join("::");
}

function clamp(value: number) {
  return Math.max(0.4, Math.min(1, value));
}
