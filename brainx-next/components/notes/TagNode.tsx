"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Hash } from "lucide-react";

/**
 * `#태그명 ` (공백) 입력 시 생성되는 인라인 태그 노드.
 *
 * - atom: true → 에디터가 내부 콘텐츠를 직접 편집하지 않고 통째로 다룸
 * - Input Rule은 TagSuggestion.ts에서 등록(스페이스바 트리거)
 * - TagAutocomplete의 commit()이 이 노드를 삽입함
 */
function TagNodeView({ node }: NodeViewProps) {
  const name = (node.attrs.name as string) ?? "";

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        contentEditable={false}
        data-tag={name}
        className="
          inline-flex items-center gap-[3px] px-[6px] py-[1px]
          rounded-full text-[11.5px] font-medium leading-[1.6]
          select-none cursor-default align-baseline
          bg-primary/10 text-primary border border-primary/20
          hover:bg-primary/18 transition-colors
        "
      >
        <Hash size={9} className="shrink-0 opacity-70" />
        <span>{name}</span>
      </span>
    </NodeViewWrapper>
  );
}

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    tagNode: {
      insertTag: (name: string) => ReturnType;
    };
  }
}

export const TagNode = Node.create({
  name: "tagNode",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-tag-name") ?? "",
        renderHTML: (attrs) => ({ "data-tag-name": String(attrs.name) }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-tag-node]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { name: el.getAttribute("data-tag-name") ?? "" };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-tag-node": "true",
        "data-tag-name": node.attrs.name,
      }),
      `#${node.attrs.name}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TagNodeView);
  },

  addCommands() {
    return {
      insertTag:
        (name: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
    };
  },
});
