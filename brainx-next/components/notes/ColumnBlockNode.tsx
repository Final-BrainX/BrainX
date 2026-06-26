"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column-list", class: "split-column-list" }), 0];
  },
});

/** 칸 사이 경계를 드래그해 두 칸의 너비 비율을 바꾸는 핸들. width는 항상 0~100 사이의
    퍼센트로 저장하고, null이면 동일 비율(flex: 1)로 본다 — 칸이 늘거나 줄 때마다 모든 칸의
    width를 다시 계산할 필요가 없도록, 실제 드래그가 일어난 칸들만 명시적 width를 갖는다. */
function ColumnView({ node, getPos, editor }: NodeViewProps) {
  const onResizeMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();

    const pos = getPos();
    if (pos == null) return;
    const thisNode = editor.state.doc.nodeAt(pos);
    const nextPos = pos + node.nodeSize;
    const nextNode = editor.state.doc.nodeAt(nextPos);
    if (!thisNode || !nextNode || nextNode.type.name !== "column") return;

    // addNodeView의 attrs 옵션이 style(flex)을 꽂는 실제 DOM은 NodeViewWrapper가 아니라
    // ReactNodeViewRenderer가 한 단계 바깥에 만드는 wrapper(this.dom, view.nodeDOM(pos))다 —
    // 리사이즈 측정/적용도 반드시 그 엘리먼트를 기준으로 해야 한다.
    const thisDom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const nextDom = editor.view.nodeDOM(nextPos) as HTMLElement | null;
    const container = thisDom?.parentElement ?? null;
    if (!thisDom || !nextDom || !container) return;

    const containerWidth = container.getBoundingClientRect().width;
    const startWidthPxA = thisDom.getBoundingClientRect().width;
    const startWidthPxB = nextDom.getBoundingClientRect().width;
    const pairWidthPx = startWidthPxA + startWidthPxB;
    const startX = event.clientX;
    let committed: { a: number; b: number } | null = null;

    document.body.style.cursor = "col-resize";

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const minPx = pairWidthPx * 0.15;
      const newAPx = Math.min(Math.max(startWidthPxA + dx, minPx), pairWidthPx - minPx);
      const newBPx = pairWidthPx - newAPx;
      const aPercent = (newAPx / containerWidth) * 100;
      const bPercent = (newBPx / containerWidth) * 100;
      thisDom.style.flex = `0 0 ${aPercent}%`;
      nextDom.style.flex = `0 0 ${bPercent}%`;
      committed = { a: aPercent, b: bPercent };
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      if (committed) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { ...thisNode.attrs, width: committed!.a });
            tr.setNodeMarkup(nextPos, undefined, { ...nextNode.attrs, width: committed!.b });
            return true;
          })
          .run();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <NodeViewWrapper>
      <NodeViewContent />
      <div className="split-column-resize-handle" contentEditable={false} onMouseDown={onResizeMouseDown} />
    </NodeViewWrapper>
  );
}

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-width");
          return raw ? Number(raw) : null;
        },
        renderHTML: (attrs) => (attrs.width != null ? { "data-width": String(attrs.width) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "split-column" }), 0];
  },

  addNodeView() {
    // ReactNodeViewRenderer는 우리 컴포넌트(NodeViewWrapper)를 한 단계 더 바깥 div(이 NodeView의
    // 실제 DOM, 즉 columnList의 진짜 flex 자식)로 감싼다. flex/너비는 그 바깥 div에 줘야만
    // 의미가 있다 — NodeViewWrapper 안쪽에 줬더니 거기는 진짜 flex item이 아니라서 너비가
    // 콘텐츠 길이대로 제멋대로 찌그러지는 버그가 있었다.
    return ReactNodeViewRenderer(ColumnView, {
      className: "split-column",
      attrs: ({ node }) => ({
        "data-type": "column",
        style: `flex: ${node.attrs.width != null ? `0 0 ${node.attrs.width}%` : "1 1 0%"};`,
      }),
    });
  },
});

/**
 * 우클릭 메뉴 "N단으로 나누기" — 커서가 위치한 최상위 블록을 컬럼 레이아웃의 첫 번째 칸으로
 * 옮기고, 나머지 칸은 빈 문단으로 채운다. 리스트 항목/인용 안처럼 더 깊이 중첩된 위치에서는
 * 어떤 블록 하나를 통째로 옮겨야 할지 모호해지므로 최상위 블록(depth 1)에서만 동작한다.
 */
export function splitBlockIntoColumns(editor: Editor, count: number) {
  const { state } = editor;
  const { $from } = state.selection;
  if ($from.depth !== 1) return false;

  const schema = state.schema;
  const columnType = schema.nodes.column;
  const columnListType = schema.nodes.columnList;
  const paragraphType = schema.nodes.paragraph;
  if (!columnType || !columnListType || !paragraphType) return false;

  const blockPos = $from.before(1);
  const blockNode = $from.node(1);
  const blockEnd = blockPos + blockNode.nodeSize;

  const firstColumn = columnType.create(null, blockNode);
  const otherColumns = Array.from({ length: Math.max(1, count - 1) }, () =>
    columnType.create(null, paragraphType.create())
  );
  const columnList = columnListType.create(null, [firstColumn, ...otherColumns]);

  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(blockPos, blockEnd, columnList);
      return true;
    })
    .run();
}
