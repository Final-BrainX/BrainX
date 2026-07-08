const LEADING_EMOJI_RE = /^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u;
const HTML_ENTITY_RE = /&(amp|lt|gt|quot|#39|apos);/g;
const HTML_ENTITY_DECODE: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
};

/** 제목에 `&` 같은 문자가 있으면 저장/직렬화 경로(예: 위키링크 span의 data-title 속성)를
    거치며 실수로 두 번 이스케이프되어 `&amp;amp;`처럼 남는 경우가 있다 — 노트의 실제 제목은
    `&`(1글자)인데 링크에 박제된 값은 `&amp;`(문자 그대로 5글자)라 이모지를 떼어내도 절대
    같아지지 않는다. 더 이상 안 바뀔 때까지 반복 디코딩해서 이런 이중/삼중 이스케이프도
    흡수한다(정상적으로 한 번만 이스케이프된 값은 한 번 돌고 더 이상 안 바뀌어 끝난다). */
export function decodeHtmlEntities(value: string): string {
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    const next = current.replace(HTML_ENTITY_RE, (_match, name: string) => HTML_ENTITY_DECODE[name] ?? _match);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** 노트 제목 매칭(백링크 존재 여부 판별)에 쓰는 모든 문자열 비교는 이 함수를 거쳐야 한다.
    노트 제목 앞에는 사용자가 붙인 이모지 아이콘(📄, 🔲 등)이 있을 수 있는 반면, `[[title]]`
    링크는 보통 이모지 없이 순수 텍스트만 담고 있다 — 이모지를 무시하지 않으면 exact match가
    항상 실패하고, partial match(부분 문자열 포함)도 같은 부분 문자열을 포함하는 다른 노트가
    하나라도 더 있으면 후보가 여럿이 되어 매칭에 실패한다(그 결과 실제로 존재하는 노트인데도
    "새 노트 생성" 상태 — 주황색 — 로 표시됨). 앞쪽 이모지만 제거하고(제목 중간의 이모지는
    사용자가 의도한 제목의 일부이므로 보존), HTML 엔티티를 디코딩하고(저장 경로에서 실수로
    이스케이프된 & 등을 흡수), 공백을 한 칸으로 접고 소문자로 비교한다. */
export function normalizeTitleForMatch(value: string): string {
  return decodeHtmlEntities(value)
    .trim()
    .replace(LEADING_EMOJI_RE, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeWikiLinkTarget(value: string) {
  const base = value.split("|")[0]?.split("#")[0] ?? "";
  return normalizeTitleForMatch(base);
}

/** 노트 제목이 바뀔 때(A → B) 그 제목을 가리키던 다른 노트의 저장된 위키링크를 갱신한다.
    WikiLinkNode(components/notes/WikiLinkNode.tsx)의 renderHTML이 만드는
    `<span data-wiki-link="true" data-title="...">[[...]]</span>` 형태만 대상으로 하며, 노트
    본문 나머지 부분은 건드리지 않는다(DOM 전체를 다시 직렬화하면 표/코드블록 같은 복잡한
    구조가 미묘하게 바뀔 위험이 있어, 일치하는 span의 outerHTML만 문자열 치환한다). alias가
    있는 링크는 사용자가 직접 지정한 표시 텍스트이므로 alias는 그대로 두고 data-title만
    갱신한다(클릭 시 이동 대상은 바뀌지만 화면에 보이는 별칭 문구는 유지). 브라우저 환경이
    아니거나(SSR) 일치하는 링크가 없으면 원본을 그대로 돌려준다. */
export function renameWikiLinkReferencesInHtml(
  html: string,
  oldTitle: string,
  newTitle: string
): { html: string; changed: boolean } {
  const trimmedOld = oldTitle.trim();
  const trimmedNew = newTitle.trim();
  if (typeof window === "undefined" || !html || !trimmedOld || trimmedOld === trimmedNew) {
    return { html, changed: false };
  }
  if (!html.includes("data-wiki-link")) return { html, changed: false };

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return { html, changed: false };
  }

  const needle = trimmedOld.toLowerCase();
  let next = html;
  let changed = false;
  doc.querySelectorAll('span[data-wiki-link="true"]').forEach((el) => {
    const title = (el.getAttribute("data-title") ?? "").trim();
    if (title.toLowerCase() !== needle) return;
    const before = el.outerHTML;
    el.setAttribute("data-title", trimmedNew);
    if (!el.getAttribute("data-alias")) {
      el.textContent = `[[${trimmedNew}]]`;
    }
    const after = el.outerHTML;
    if (before !== after && next.includes(before)) {
      next = next.replace(before, after);
      changed = true;
    }
  });

  return changed ? { html: next, changed: true } : { html, changed: false };
}

/** HTML로 아직 변환되지 않은 순수 마크다운 본문(예: 한 번도 에디터로 연 적 없는 시드/가져오기
    노트)의 `[[title]]` / `[[title#heading]]` / `[[title|alias]]` / `[[title#heading|alias]]`
    표기를 그대로 문자열 치환한다. heading/alias 구간은 보존하고 title만 바꾼다. */
export function renameWikiLinkReferencesInMarkdown(
  markdown: string,
  oldTitle: string,
  newTitle: string
): { markdown: string; changed: boolean } {
  const trimmedOld = oldTitle.trim();
  const trimmedNew = newTitle.trim();
  if (!markdown || !trimmedOld || trimmedOld === trimmedNew) {
    return { markdown, changed: false };
  }
  const needle = trimmedOld.toLowerCase();
  let changed = false;
  const next = markdown.replace(/\[\[([^[\]]+)\]\]/g, (match, body: string) => {
    const [titleAndHeading, aliasPart] = body.split("|");
    const [title, heading] = titleAndHeading.split("#");
    if (title.trim().toLowerCase() !== needle) return match;
    changed = true;
    const rebuilt = `${trimmedNew}${heading ? `#${heading}` : ""}${aliasPart ? `|${aliasPart}` : ""}`;
    return `[[${rebuilt}]]`;
  });
  return changed ? { markdown: next, changed: true } : { markdown, changed: false };
}

/** 노트 본문이 HTML로 저장돼 있든(에디터가 한 번이라도 저장한 경우) 순수 마크다운이든
    (시드/가져오기 등 아직 편집기를 거치지 않은 경우) 관계없이 위키링크 제목 변경을 반영한다.
    형식 판별은 NoteEditor.tsx의 resolveEditorHtml과 동일한 규칙("<"로 시작하면 HTML)을 쓴다. */
export function renameWikiLinkReferencesInContent(
  content: string,
  oldTitle: string,
  newTitle: string
): { content: string; changed: boolean } {
  if (!content) return { content, changed: false };
  if (content.trim().startsWith("<") || content.includes("data-wiki-link")) {
    const result = renameWikiLinkReferencesInHtml(content, oldTitle, newTitle);
    return { content: result.html, changed: result.changed };
  }
  const result = renameWikiLinkReferencesInMarkdown(content, oldTitle, newTitle);
  return { content: result.markdown, changed: result.changed };
}

/** 저장 직전 방어적 검증 — HTML의 `data-title="title"` span이든, 아직 마크다운 텍스트 상태인
    `[[title]]`(heading/alias 포함 가능) 표기든 "닫는 `]]`까지 완결된" 형태만 "실제로 링크가
    남아있다"로 인정한다. 반드시 닫는 대괄호까지 확인해야 한다 — 예전에는 `[[title` 뒤에
    아무 문자도 없이 문서가 끝나는 경우(자동완성 트리거 텍스트가 아직 실제 링크로 변환되지
    않은, 닫히지 않은 상태)까지 "링크가 있다"로 잘못 판단해, 정작 `]]`가 없는 `[[A` 상태를
    보정하지 않고 그대로 저장하는 버그가 있었다. */
export function contentHasWikiLinkTo(content: string, title: string): boolean {
  const trimmed = title.trim();
  if (!content || !trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const needle = trimmed.toLowerCase();
  if (content.includes("data-wiki-link")) {
    const spanRe = /<span\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = spanRe.exec(content))) {
      const attrs = match[1];
      if (!/data-wiki-link="true"/.test(attrs)) continue;
      const titleMatch = /data-title="([^"]*)"/.exec(attrs);
      if (titleMatch && titleMatch[1].trim().toLowerCase() === needle) return true;
    }
  }
  // 닫는 ]]까지 있어야만 인정한다 — [[title, [[title#heading, [[title]처럼 아직 안 닫힌 상태는
  // 여기서 걸러지고 ensureWikiLinkPresent가 보정한다.
  return new RegExp(`\\[\\[\\s*${escaped}(?:[|#][^\\]]*)?\\]\\]`, "i").test(content);
}

/** contentHasWikiLinkTo가 false를 돌려줄 때(라이브에딧 전환 타이밍 등으로 닫는 `]]`가 아직
    안 붙었거나 title이 빈 채로 깨진 경우) 이미 문서에 남아있는 흔적을 "그 자리에서" 고쳐
    닫는다 — 본문 끝에 새 `[[title]]`을 무작정 덧붙이면 깨진 `[[title` 텍스트와 새로 붙인
    `[[title]]`이 중복으로 남기 때문이다. 우선순위:
    1) 닫히지 않은 `[[title`(같은 title로 시작하고 아직 `]]`가 없는 부분) → 그 자리에서 `]]`로 닫는다.
    2) 빈 `[[]]` → 마지막 occurrence를 `[[title]]`로 채운다.
    3) 문서에서 흔적 자체가 사라졌다면(둘 다 없음) 최후의 수단으로 본문 끝에 `[[title]]`을 추가한다. */
export function ensureWikiLinkPresent(content: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return content;
  if (contentHasWikiLinkTo(content, trimmed)) return content;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const openRe = new RegExp(`\\[\\[\\s*${escaped}\\b`, "i");
  const openMatch = openRe.exec(content);
  if (openMatch) {
    const insertAt = openMatch.index + openMatch[0].length;
    return `${content.slice(0, insertAt)}]]${content.slice(insertAt)}`;
  }

  const emptyMatches = [...content.matchAll(/\[\[\s*\]\]/g)];
  if (emptyMatches.length > 0) {
    const last = emptyMatches[emptyMatches.length - 1];
    const start = last.index ?? 0;
    return `${content.slice(0, start)}[[${trimmed}]]${content.slice(start + last[0].length)}`;
  }

  return ensureWikiLinkAppended(content, trimmed);
}

/** ensureWikiLinkPresent의 최후 수단(위 두 경우 모두 아닐 때) — 본문 끝에 `[[title]]`을
    명시적으로 덧붙인다. 사용자가 직접 쓴 다른 내용은 건드리지 않는다. */
export function ensureWikiLinkAppended(content: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return content;
  const suffix = `[[${trimmed}]]`;
  if (!content || !content.trim()) return suffix;
  if (content.trim().startsWith("<")) return `${content}<p>${suffix}</p>`;
  return `${content}\n\n${suffix}`;
}

export function extractWikiLinkTargets(markdown: string) {
  const matches = markdown.match(/\[\[([^\]]+)\]\]/g) ?? [];
  return matches.map((match) => match.slice(2, -2)).filter(Boolean);
}

/** span으로 렌더된 위키링크(`data-wiki-link` atom 노드)와, 아직 span으로 변환되지 않은
    원문 `[[title]]` 표기가 한 본문에 섞여 있을 수 있다(예: 자동완성으로 확정된 링크와 막
    타이핑 중인/가져오기 등으로 아직 파싱 전인 링크). 예전에는 span이 하나라도 있으면 원문
    `[[...]]` 추출을 건너뛰어 섞인 케이스에서 outgoing/backlink 패널에 일부가 누락됐다 —
    span의 outerHTML 자체를 먼저 들어내고(그 안에 담긴 `[[title]]`/`[[alias]]` 텍스트가
    "원문 링크"로 중복 추출되지 않도록) 남은 본문에서 원문 `[[...]]`을 마저 추출한 뒤 둘을
    합치고 중복만 제거한다. */
export function extractResolvedWikiLinkTargets(content: string) {
  if (!content) return [];

  const spanTargets: string[] = [];
  let contentWithoutSpans = content;
  if (content.includes("data-wiki-link")) {
    const spanRe = /<span\b([^>]*)>[\s\S]*?<\/span>/gi;
    contentWithoutSpans = content.replace(spanRe, (full, attrs: string) => {
      if (!/data-wiki-link\s*=\s*["']true["']/i.test(attrs)) return full;
      // 여는 quote와 같은 닫는 quote까지만 값으로 인정한다 — data-title="John's Plan"처럼
      // 값 안에 반대쪽 quote 문자가 섞여 있어도 그 자리에서 값이 끊기지 않게 하기 위함.
      const titleMatch = attrs.match(/data-title\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const raw = (titleMatch?.[1] ?? titleMatch?.[2] ?? "").trim();
      if (raw) spanTargets.push(raw);
      return "";
    });
  }

  const rawTargets = extractWikiLinkTargets(contentWithoutSpans);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const target of [...spanTargets, ...rawTargets]) {
    const key = normalizeWikiLinkTarget(target);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(target);
  }
  return merged;
}

/** 두 시점의 본문에서 "위키링크가 가리키는 target 집합" 자체가 달라졌는지만 비교한다(추가든
    삭제든 상관없이 집합이 달라지면 true) — Graph 즉시 동기화(NotesWorkspace의
    handleContentChange)가 모든 타이핑마다 저장을 트리거하지 않고, `[[bb]]`가 `[[bb]`로 깨지는
    등 실제로 연결 관계가 바뀐 순간만 골라내기 위한 기준이다. extractWikiLinkTargets는 HTML로
    렌더된 위키링크 atom 노드의 innerHTML(`[[title]]` 또는 alias가 있으면 `[[alias]]`)도 그대로
    문자열로 포함하므로 별도 HTML 파싱 없이 재사용할 수 있다 — alias가 있는 링크는 alias 텍스트를
    "식별자"로 쓰게 되지만, 이전/이후 비교에 항상 같은 규칙을 적용하므로 "달라졌는지" 판단
    자체는 정확하다. */
export function wikiLinkTargetSetChanged(prevContent: string, nextContent: string): boolean {
  const prevTargets = new Set(extractWikiLinkTargets(prevContent).map(normalizeWikiLinkTarget));
  const nextTargets = new Set(extractWikiLinkTargets(nextContent).map(normalizeWikiLinkTarget));
  if (prevTargets.size !== nextTargets.size) return true;
  for (const target of prevTargets) {
    if (!nextTargets.has(target)) return true;
  }
  return false;
}

export function resolveWikiLinkByTitle<T extends { id: string; title: string }>(
  notes: T[],
  target: string
) {
  const needle = normalizeWikiLinkTarget(target);
  if (!needle) return null;

  const exact = notes.find((note) => normalizeTitleForMatch(note.title) === needle);
  if (exact) return exact;

  const partial = notes.filter((note) => normalizeTitleForMatch(note.title).includes(needle));
  return partial.length === 1 ? partial[0] : null;
}
