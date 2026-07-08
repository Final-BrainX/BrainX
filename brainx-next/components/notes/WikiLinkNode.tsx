"use client";

import { Extension, Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FilePlus2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { decodeHtmlEntities } from "@/lib/wiki-links";
import { normalizeOptionalWikiLinkText, normalizeWikiLinkText, useWikiLinkContext, resolveWikiLinkTitle } from "./WikiLinkContext";

/** `[[노트]]` / `[[노트|별칭]]` / `[[노트#헤딩]]` / `[[노트#헤딩|별칭]]` 입력 형태를 그대로
    지원한다(Obsidian 문법). `]]`까지 입력하는 순간 nodeInputRule이 매치되어 이 노드로
    변환된다. */
function parseWikiLinkBody(raw: string) {
  const normalizedRaw = normalizeWikiLinkText(raw);
  const pipeIndex = normalizedRaw.indexOf("|");
  const titleAndHeading = pipeIndex >= 0 ? normalizedRaw.slice(0, pipeIndex) : normalizedRaw;
  const aliasPart = pipeIndex >= 0 ? normalizedRaw.slice(pipeIndex + 1) : undefined;
  const headingIndex = titleAndHeading.indexOf("#");
  const title = headingIndex >= 0 ? titleAndHeading.slice(0, headingIndex) : titleAndHeading;
  const heading = headingIndex >= 0 ? titleAndHeading.slice(headingIndex + 1) : undefined;
  return {
    title: normalizeWikiLinkText(title).trim(),
    heading: normalizeOptionalWikiLinkText(heading),
    alias: normalizeOptionalWikiLinkText(aliasPart),
  };
}

/* Obsidian Live Preview 방식 — 이 NodeView는 항상 "비활성"(커서가 근처에 없는) 상태만 그린다.
   커서가 근처로 오면 WikiLinkLiveEdit(아래) 플러그인이 이 atom 노드 자체를 실제 편집 가능한
   `[[title]]` 텍스트로 바꿔치기해버리므로, 그 순간부터는 이 컴포넌트가 렌더링될 일이 없다(문서
   content가 더 이상 wikiLink 노드가 아니라 일반 텍스트이기 때문) — 그래서 decoration이나 커서
   추적 없이 이 컴포넌트는 표시용 텍스트만 그리면 된다. 커서가 벗어나면 WikiLinkLiveEdit이 그
   텍스트를 다시 이 노드로 되돌리면서 다시 마운트된다. */
function WikiLinkView({ node }: NodeViewProps) {
  const ctx = useWikiLinkContext();
  const title = normalizeWikiLinkText(node.attrs.title).trim();
  const alias = normalizeOptionalWikiLinkText(node.attrs.alias);
  const heading = normalizeOptionalWikiLinkText(node.attrs.heading);

  const resolved = ctx ? resolveWikiLinkTitle(ctx.notes, title) : null;
  const exists = !!resolved;
  const display = alias ?? title;

  const handleClick = () => {
    if (!ctx || !title) return;
    if (exists) ctx.onNavigate(title);
    else ctx.onCreate(title);
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
        title={
          title
            ? exists
              ? `"${title}" 노트로 이동${heading ? ` (#${heading})` : ""}`
              : `"${title}" 노트가 없습니다 — 클릭해서 생성`
            : "위키링크 제목을 확인할 수 없습니다."
        }
        aria-label={title ? (exists ? `${title} 노트로 이동` : `${title} 노트 생성`) : "손상된 위키링크"}
        className={cx(
          "rounded px-0.5 align-baseline font-medium underline decoration-1 underline-offset-2 transition-colors",
          exists
            ? "text-primary decoration-primary/50 hover:bg-primary/10"
            : "text-orange-400 decoration-dashed decoration-orange-400/70 hover:bg-orange-400/10"
        )}
      >
        {!exists && <FilePlus2 size={11} className="mr-0.5 inline-block shrink-0 -translate-y-px" />}
        {display || title || "Untitled"}
      </button>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: { title: string; alias?: string | null; heading?: string | null }) => ReturnType;
    };
  }
}

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: "" },
      alias: {
        default: null,
        parseHTML: (el) => normalizeOptionalWikiLinkText(el.getAttribute("data-alias")),
        renderHTML: (attrs) => {
          const alias = normalizeOptionalWikiLinkText(attrs.alias);
          return alias ? { "data-alias": alias } : {};
        },
      },
      heading: {
        default: null,
        parseHTML: (el) => normalizeOptionalWikiLinkText(el.getAttribute("data-heading")),
        renderHTML: (attrs) => {
          const heading = normalizeOptionalWikiLinkText(attrs.heading);
          return heading ? { "data-heading": heading } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          // decodeHtmlEntities: 예전에 저장 경로에서 실수로 이중 이스케이프된(& -> &amp;amp;)
          // 노트를 열면, 브라우저가 HTML을 파싱하며 한 겹만 풀어줘서 data-title에 "&amp;"가
          // 문자 그대로 남는다 — 여기서 한 번 더 풀어 화면에 진짜 "&"로 보이게 하고, 이
          // 노드를 다시 저장할 때도 깨끗한 값으로 직렬화되게 한다(자동 복구).
          return {
            title: decodeHtmlEntities(normalizeWikiLinkText(el.getAttribute("data-title")).trim()),
            alias: normalizeOptionalWikiLinkText(el.getAttribute("data-alias")),
            heading: normalizeOptionalWikiLinkText(el.getAttribute("data-heading")),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = normalizeWikiLinkText(node.attrs.title).trim();
    const alias = normalizeOptionalWikiLinkText(node.attrs.alias);
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wiki-link": "true", "data-title": title }),
      `[[${alias ?? title}]]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[((?:(?!\[\[|\]\]).)+)\]\]$/,
        type: this.type,
        getAttributes: (match) => parseWikiLinkBody(match[1]),
      }),
    ];
  },
});

function wikiLinkRawText(node: { attrs: { title: string; alias: string | null; heading: string | null } }): string {
  const title = normalizeWikiLinkText(node.attrs.title).trim();
  const alias = normalizeOptionalWikiLinkText(node.attrs.alias);
  const heading = normalizeOptionalWikiLinkText(node.attrs.heading);
  return `[[${title}${heading ? `#${heading}` : ""}${alias ? `|${alias}` : ""}]]`;
}

const WIKI_LINK_LIVE_EDIT_RE = /\[\[((?:(?!\[\[|\]\]).)+)\]\]/g;

/** Obsidian Live Preview 방식 위키링크 편집 — atom 노드(wikiLink)를 커서가 근처에 있는 동안만
    실제 편집 가능한 `[[title]]` 텍스트로 풀어준다(선택지 A). atom 노드에서 Backspace를 누르면
    ProseMirror가 "노드 전체 삭제"로 처리해버려(atom은 문자 단위 편집 대상이 아님) 한 글자씩
    지워지지 않는 문제가 있었는데, 커서가 근처일 때 애초에 atom이 아니라 진짜 텍스트가 되게 하면
    일반 Backspace/타이핑이 그대로 통한다. 커서가 벗어나면 그 텍스트가 다시 완전한 `[[...]]`
    패턴이라는 전제 하에 다시 atom 노드로 되돌려 Live Preview 표시(WikiLinkView)로 되돌아간다.
    `]]`가 깨진 채로(`[[title` 상태로) 커서가 벗어나면 다시 노드로 되돌리지 않는다 — 그 상태는
    기존 WikiLinkSuggestion 자동완성이 그대로 인식해서 후보를 다시 띄운다(별도 처리 불필요,
    이 확장은 텍스트를 "일반 텍스트"로만 만들어줄 뿐 그 이후 자동완성 로직은 전혀 건드리지 않는다). */
export const WikiLinkLiveEdit = Extension.create({
  name: "wikiLinkLiveEdit",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("wikiLinkLiveEdit"),
        appendTransaction(transactions, _oldState, newState) {
          if (!editor.isEditable) return null;
          // IME(한글 등) 조합 중에는 절대 문서를 건드리지 않는다 — 조합 중에 노드↔텍스트 변환으로
          // DOM을 다시 그리면(특히 atom 노드 쪽으로 replaceWith) 브라우저가 진행 중이던 조합의
          // 앵커를 잃어버려 "이ㅇ"처럼 조합이 깨진다(`[[노트명]]` 바로 뒤에서 스페이스 없이 바로
          // 한글을 입력하면 재현됨). `view.composing`이 true인 동안은 아무것도 하지 않고, 조합이
          // 끝난 뒤(compositionend로 발생하는 다음 트랜잭션)에 정상적으로 재평가된다.
          if (editor.view.composing) return null;
          if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;

          const wikiLinkType = newState.schema.nodes.wikiLink;
          if (!wikiLinkType) return null;

          const { selection, doc } = newState;
          const tr = newState.tr;
          let changed = false;

          /* Pass 1: 커서가 근처인 wikiLink atom 노드 → 실제 텍스트로 풀어준다. 뒤에서부터
             처리해 앞쪽 포지션이 이 반복 안에서 안 밀리게 한다(문서에 링크가 여러 개 있어도
             안전하도록 — 실제로는 커서는 한 곳뿐이라 보통 최대 1개). */
          const toTextify: Array<{ from: number; to: number; caretBefore: boolean }> = [];
          doc.descendants((node, pos) => {
            if (node.type !== wikiLinkType) return;
            const nodeEnd = pos + node.nodeSize;
            const isNodeSelected = selection instanceof NodeSelection && selection.from === pos;
            const caretBefore = selection.empty && selection.from === pos;
            const caretAfter = selection.empty && selection.from === nodeEnd;
            if (isNodeSelected || caretBefore || caretAfter) {
              toTextify.push({ from: pos, to: nodeEnd, caretBefore: caretBefore || isNodeSelected });
            }
          });
          for (let i = toTextify.length - 1; i >= 0; i--) {
            const { from, to, caretBefore } = toTextify[i];
            const node = doc.nodeAt(from);
            if (!node) continue;
            const raw = wikiLinkRawText(node as unknown as { attrs: { title: string; alias: string | null; heading: string | null } });
            tr.insertText(raw, from, to);
            tr.setSelection(TextSelection.create(tr.doc, caretBefore ? from : from + raw.length));
            changed = true;
          }

          /* Pass 2: 커서가 더 이상 닿아있지 않은 완결된 `[[title]]` 텍스트 → 다시 atom 노드로.
             Pass 1이 만든 텍스트를 포함해, 사용자가 직접 타이핑해 완성한 텍스트에도 똑같이
             적용된다(입력 즉시 nodeInputRule이 먼저 atom으로 바꿔주므로 보통은 Pass 1 결과물만
             해당). 한 트랜잭션에 여러 매치가 있어도 하나 바꿀 때마다 포지션이 밀리므로, 매치를
             찾아 하나 바꾸고 다시 처음부터 스캔한다(문서 크기가 크지 않은 노트 에디터라 비용은
             무시할 수준). */
          for (let guard = 0; guard < 20; guard += 1) {
            const curSel = tr.selection;
            let match: { start: number; end: number; body: string } | null = null;
            tr.doc.descendants((node, pos) => {
              if (match || !node.isText || !node.text) return;
              WIKI_LINK_LIVE_EDIT_RE.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = WIKI_LINK_LIVE_EDIT_RE.exec(node.text))) {
                const start = pos + m.index;
                const end = start + m[0].length;
                const touching = curSel.empty ? curSel.from >= start && curSel.from <= end : false;
                if (!touching) {
                  match = { start, end, body: m[1] };
                  break;
                }
              }
            });
            if (!match) break;
            const { start, end, body } = match;
            try {
              tr.replaceWith(start, end, wikiLinkType.create(parseWikiLinkBody(body)));
              changed = true;
            } catch {
              // 코드블록 등 inline atom을 허용하지 않는 위치에 우연히 같은 패턴의 텍스트가
              // 있으면 스키마가 막는다 — 그 경우 그냥 일반 텍스트로 둔다(무한 재시도 방지를
              // 위해 스캔을 여기서 종료).
              break;
            }
          }

          return changed ? tr : null;
        },
      }),
    ];
  },
});
