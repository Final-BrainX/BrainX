"use client";

import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Extension, textblockTypeInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { createLowlight, all } from "lowlight";
import { Link2, Highlighter, Sparkles, Wand2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { MockNote } from "@/lib/notes/noteTypes";
import { HeadingFold } from "./headingFold";
import { CodeBlockView } from "./CodeBlockView";
import { QuickSwatchRow, MoreColorPopover, TEXT_COLOR_QUICK, HIGHLIGHT_SWATCHES } from "./ColorPalette";

export type EditMode = "read" | "edit";
export type AiActionType = "summarize" | "rewrite";

const lowlight = createLowlight(all);

/* ── Markdown → HTML (초기 로딩) ─────────────────────────────────────── */
function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(text: string) {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  const codeLines: string[] = [];
  let codeLang = "";
  let listType: "ul" | "ol" | null = null;
  const listItems: string[] = [];

  function flushList() {
    if (!listType || listItems.length === 0) return;
    const tag = listType;
    out.push(
      `<${tag}>${listItems
        .map((t) => `<li><p>${inlineHtml(t)}</p></li>`)
        .join("")}</${tag}>`
    );
    listItems.length = 0;
    listType = null;
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        out.push(
          `<pre><code class="language-${codeLang}">${escHtml(
            codeLines.join("\n")
          )}</code></pre>`
        );
        codeLines.length = 0;
        codeLang = "";
        inCode = false;
      } else {
        flushList();
        codeLang = line.slice(3).trim();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (line.startsWith("### ")) {
      flushList(); out.push(`<h3>${inlineHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushList(); out.push(`<h2>${inlineHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushList(); out.push(`<h1>${inlineHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote><p>${inlineHtml(line.slice(2))}</p></blockquote>`);
    } else {
      const olMatch = /^(\d+)\. (.+)/.exec(line);
      if (olMatch) {
        if (listType === "ul") flushList();
        listType = "ol";
        listItems.push(olMatch[2]);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (listType === "ol") flushList();
        listType = "ul";
        listItems.push(line.slice(2));
      } else if (line.trim() === "") {
        flushList(); out.push("<p></p>");
      } else {
        flushList(); out.push(`<p>${inlineHtml(line)}</p>`);
      }
    }
  }

  flushList();
  return out.join("");
}

/**
 * 노트 콘텐츠를 에디터에 로드할 HTML로 변환.
 * - 빈 노트: 그대로 빈 문자열 (새 노트)
 * - 이미 편집되어 HTML로 저장된 노트(에디터가 저장한 getHTML() 결과): 그대로 사용
 *   (다시 markdownToHtml을 통과시키면 태그가 텍스트로 escape되어 깨짐)
 * - 최초 시드 데이터(마크다운 원문): markdownToHtml로 변환
 */
function resolveEditorHtml(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("<")) return rawContent;
  return markdownToHtml(rawContent);
}

/* ── Obsidian Live Preview ────────────────────────────────────────────── */
const LivePreviewKey = new PluginKey("livePreview");

const MarkdownLivePreview = Extension.create({
  name: "markdownLivePreview",

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: LivePreviewKey,
        props: {
          decorations(state) {
            if (!editor.isEditable) return DecorationSet.empty;

            const { selection, doc } = state;
            const { $from, from, to } = selection;
            const decos: Decoration[] = [];

            /* ── Heading prefix 위젯
               커서가 안에 있을 때(opacity 0.45) + 빈 heading(opacity 0.3)에 항상 표시.
               빈 heading에 marker를 보여야 Enter→split 후 시각적으로 heading이 남아 있게 됨. */
            doc.forEach((node, offset) => {
              if (node.type.name !== "heading") return;
              const level   = node.attrs.level as number;
              const nodeEnd = offset + node.nodeSize;
              const cursorInside = from > offset && to < nodeEnd;
              const isEmpty = node.textContent === "";
              if (!cursorInside && !isEmpty) return;

              const opacity = cursorInside ? 0.45 : 0.3;
              const prefix  = "#".repeat(level) + " ";
              decos.push(
                Decoration.widget(
                  offset + 1,
                  () => {
                    const s = document.createElement("span");
                    s.textContent = prefix;
                    s.style.cssText =
                      `color:rgb(var(--txt3));opacity:${opacity};font-size:inherit;` +
                      `font-weight:inherit;line-height:inherit;` +
                      `user-select:none;pointer-events:none;`;
                    return s;
                  },
                  { side: -1, key: `md-h-prefix-${offset}-${level}-${cursorInside ? 1 : 0}` }
                )
              );
              if (cursorInside) {
                decos.push(
                  Decoration.node(offset, nodeEnd, { class: "md-source-active" })
                );
              }
            });

            /* ── Blockquote prefix (커서가 있을 때만) ── */
            for (let d = $from.depth; d >= 1; d--) {
              const node = $from.node(d);
              const pos  = $from.before(d);

              if (node.type.name === "blockquote") {
                const paraPos = $from.depth > d ? $from.before(d + 1) : pos + 1;
                decos.push(
                  Decoration.widget(
                    paraPos + 1,
                    () => {
                      const s = document.createElement("span");
                      s.textContent = "> ";
                      s.style.cssText =
                        "color:rgb(var(--txt3));opacity:0.55;" +
                        "user-select:none;pointer-events:none;";
                      return s;
                    },
                    { side: -1, key: "md-bq-prefix" }
                  )
                );
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, { class: "md-source-active" })
                );
                break;
              }
            }

            /* ── 인라인 코드: 커서가 있을 때 backtick 표시 ── */
            const codeMarkType = state.schema.marks.code;
            if (
              codeMarkType &&
              $from.parent.isTextblock &&
              $from.marks().some((m) => m.type === codeMarkType)
            ) {
              const parent = $from.parent;
              const base = $from.start();
              let spanFrom = -1;
              let spanTo = -1;

              parent.forEach((child, offset) => {
                const hasCode =
                  child.isText &&
                  child.marks.some((m) => m.type === codeMarkType);
                if (hasCode) {
                  if (spanFrom === -1) spanFrom = base + offset;
                  spanTo = base + offset + child.nodeSize;
                } else if (spanFrom !== -1) {
                  // code span ended → flush
                  if ($from.pos >= spanFrom && $from.pos <= spanTo) {
                    pushCodeMarkers(decos, spanFrom, spanTo);
                  }
                  spanFrom = -1;
                  spanTo = -1;
                }
              });
              // trailing span
              if (spanFrom !== -1 && $from.pos >= spanFrom && $from.pos <= spanTo) {
                pushCodeMarkers(decos, spanFrom, spanTo);
              }
            }

            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});

function pushCodeMarkers(
  decos: Decoration[],
  spanFrom: number,
  spanTo: number
) {
  const mk = () => {
    const s = document.createElement("span");
    s.textContent = "`";
    s.className = "md-code-marker";
    return s;
  };
  decos.push(Decoration.widget(spanFrom, mk, { side: -1, key: `mci-o-${spanFrom}` }));
  decos.push(Decoration.widget(spanTo, mk, { side: 1, key: `mci-c-${spanTo}` }));
}

/* ── ``` + Enter → code block ────────────────────────────────────────── */
// 대소문자 + alias 정규화 맵
const LANG_ALIAS: Record<string, string> = {
  js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python",
  sh: "bash", shell: "bash", zsh: "bash",
  rb: "ruby",
  kt: "kotlin",
  cs: "csharp",
  md: "markdown",
};

function normalizeLang(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return LANG_ALIAS[lower] ?? lower;
}

const MarkdownCodeFenceEnter = Extension.create({
  name: "markdownCodeFenceEnter",
  priority: 150,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph") return false;
        const fullText = $from.parent.textContent;
        if ($from.parentOffset !== fullText.length) return false;
        // [a-zA-Z] → 대소문자 모두 허용
        const m = /^```([a-zA-Z]*)$/.exec(fullText);
        if (!m) return false;
        const lang = normalizeLang(m[1]);
        const codeBlockType = this.editor.schema.nodes.codeBlock;
        if (!codeBlockType) return false;
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup($from.before(), codeBlockType, { language: lang });
            tr.delete($from.pos - $from.parentOffset, $from.pos);
            return true;
          })
          .run();
      },
    };
  },
});

/* ── Heading marker keyboard editing ─────────────────────────────────── */
// Backspace at heading start → 레벨 감소 (level 1이면 StarterKit에 위임)
// # at heading start (parentOffset 0) → 레벨 증가
const HeadingMarkerEdit = Extension.create({
  name: "headingMarkerEdit",
  priority: 200,

  addKeyboardShortcuts() {
    return {
      // Heading 내부 Enter → heading 유지 + 아래에 paragraph 생성 (Obsidian 방식)
      Enter: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== "heading") return false;
        try {
          // splitBlock()과 setNode("paragraph")를 한 체인(.chain().splitBlock().setNode(...).run())으로
          // 묶으면 안 된다 — tiptap의 CommandManager.createChain()의 run()은 체인 안의 모든 명령이
          // 성공했는지와 무관하게 공유 트랜잭션을 항상 dispatch하고, 그 다음 .run()의 반환값만
          // "전부 성공했는가"로 계산한다(src/CommandManager.ts). splitBlock()이 문서 끝(atEnd)에서
          // 이미 기본 타입을 paragraph로 만들어 버리는 경우 — 즉 일반적인 heading Enter 케이스 —
          // 뒤따르는 setNode("paragraph")는 "이미 같은 타입/속성이라 바꿀 게 없다"는 이유로
          // prosemirror-commands의 setBlockType이 false를 반환한다(node.hasMarkup 체크).
          // 그러면 체인 전체는 false를 반환하지만 splitBlock()의 분할은 이미 dispatch되어버린
          // 상태고, 키보드 단축키 시스템은 "처리 안 됨"으로 보고 다음 우선순위의 Enter 핸들러
          // (StarterKit 기본 splitBlock 등)를 또 실행시켜 같은 키 입력에 분할이 여러 번 누적되는
          // 문제가 있었다([[이중 대괄호 링크]]처럼 일반 텍스트만 있어도 재현되며, heading 안의
          // 어떤 텍스트든 상관없이 일어나는 일반적인 버그였다). 그래서 splitBlock()을 단독으로
          // 실행해 결과를 확정하고, 분할된 새 블록이 여전히 heading이면(중간 지점에서 Enter한
          // 경우) 그때만 별도로 paragraph 변환을 시도한다.
          const splitOk = this.editor.chain().splitBlock().run();
          if (!splitOk) return false;
          const stillHeading = this.editor.state.selection.$from.parent.type.name === "heading";
          if (stillHeading && this.editor.can().setParagraph()) {
            this.editor.chain().setParagraph().run();
          }
          return true;
        } catch {
          // 예상치 못한 selection/스키마 상태에서도 에디터 전체가 죽지 않도록 방어 —
          // false를 반환하면 키보드 단축키 시스템이 다음 우선순위(StarterKit 기본 Enter)로
          // 넘어가 최소한 동작은 하게 된다.
          return false;
        }
      },
      "#": () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        if ($from.parent.type.name !== "heading") return false;
        const level = $from.parent.attrs.level as number;
        if (level >= 6) return false;
        return this.editor.commands.setHeading({ level: (level + 1) as 1 | 2 | 3 | 4 | 5 | 6 });
      },
      Backspace: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        if ($from.parent.type.name !== "heading") return false;
        const level = $from.parent.attrs.level as number;
        if (level <= 1) {
          // H1 커서 맨 앞 → paragraph로 변환 (joinBackward/앞줄 merge 방지)
          return this.editor.commands.setParagraph();
        }
        return this.editor.chain().setHeading({ level: (level - 1) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      },
    };
  },
});

/* ── 버블 툴바 ─────────────────────────────────────────────────────────── */
function BubbleBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cx(
        "grid h-[26px] min-w-[26px] place-items-center rounded px-1 transition-colors",
        active ? "bg-primary/15 text-primary" : "text-txt2 hover:bg-surface2/70 hover:text-txt"
      )}
    >
      {children}
    </button>
  );
}

function BubbleToolbar({
  editor,
  onAiAction,
}: {
  editor: Editor;
  onAiAction: (type: AiActionType, text: string) => void;
}) {
  const getSelectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  }, [editor]);

  const [recentTextColors, setRecentTextColors] = useState<string[]>([]);
  const [recentHighlights, setRecentHighlights] = useState<string[]>([]);
  const pushRecent = (list: string[], value: string) => [value, ...list.filter((v) => v !== value)].slice(0, 4);

  const currentTextColor = (editor.getAttributes("textStyle").color as string) ?? null;
  const currentHighlight = (editor.getAttributes("highlight").color as string) ?? null;

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-line/60 px-1 py-1"
      style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 20px -4px rgba(2,6,23,0.35)", zIndex: 2000 }}
    >
      <BubbleBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게">
        <span className="text-[13px] font-bold leading-none">B</span>
      </BubbleBtn>
      <BubbleBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임">
        <span className="text-[13px] italic leading-none">I</span>
      </BubbleBtn>
      <BubbleBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄">
        <span className="text-[13px] underline leading-none">U</span>
      </BubbleBtn>
      <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선">
        <span className="text-[13px] leading-none line-through">S</span>
      </BubbleBtn>
      <BubbleBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="인라인 코드">
        <span className="text-[11px] font-mono leading-none">{"</>"}</span>
      </BubbleBtn>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

      <BubbleBtn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = (editor.getAttributes("link").href as string) ?? "";
          const url = window.prompt("링크 주소 입력 (빈 값이면 제거):", prev || "https://");
          if (url === null) return;
          const trimmed = url.trim();
          if (trimmed === "") {
            editor.chain().focus().unsetLink().run();
          } else {
            editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
          }
        }}
        title="링크"
      >
        <Link2 size={13} />
      </BubbleBtn>

      {/* 글자 색상 — 드래그 직후 바로 보이는 빠른 스와치 + 더보기(커스텀/최근) */}
      <span
        className="grid h-[26px] w-[16px] shrink-0 place-items-center text-[13px] font-bold leading-none"
        style={{ color: currentTextColor ?? undefined }}
        aria-hidden
      >
        A
      </span>
      <QuickSwatchRow
        swatches={TEXT_COLOR_QUICK}
        currentValue={currentTextColor}
        shape="circle"
        onSelect={(color) => {
          editor.chain().focus().setColor(color).run();
          setRecentTextColors((prev) => pushRecent(prev, color));
        }}
      />
      <MoreColorPopover
        title="글자 색상"
        currentValue={currentTextColor}
        recentValues={recentTextColors}
        resetLabel="기본값으로 되돌리기"
        shape="circle"
        onSelect={(color) => {
          editor.chain().focus().setColor(color).run();
          setRecentTextColors((prev) => pushRecent(prev, color));
        }}
        onReset={() => editor.chain().focus().unsetColor().run()}
      />

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

      {/* 형광펜 — 드래그 직후 바로 보이는 빠른 스와치 + 더보기(커스텀/최근) */}
      <Highlighter
        size={13}
        className="shrink-0"
        style={currentHighlight ? { color: currentHighlight } : undefined}
        aria-hidden
      />
      <QuickSwatchRow
        swatches={HIGHLIGHT_SWATCHES}
        currentValue={currentHighlight}
        shape="square"
        onSelect={(color) => {
          editor.chain().focus().toggleHighlight({ color }).run();
          setRecentHighlights((prev) => pushRecent(prev, color));
        }}
      />
      <MoreColorPopover
        title="형광펜"
        currentValue={currentHighlight}
        recentValues={recentHighlights}
        resetLabel="형광펜 제거"
        shape="square"
        onSelect={(color) => {
          editor.chain().focus().toggleHighlight({ color }).run();
          setRecentHighlights((prev) => pushRecent(prev, color));
        }}
        onReset={() => editor.chain().focus().unsetHighlight().run()}
      />

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

      <BubbleBtn
        active={false}
        onClick={() => onAiAction("summarize", getSelectedText())}
        title="AI로 요약"
      >
        <Sparkles size={13} />
      </BubbleBtn>
      <BubbleBtn
        active={false}
        onClick={() => onAiAction("rewrite", getSelectedText())}
        title="AI로 다시쓰기"
      >
        <Wand2 size={13} />
      </BubbleBtn>
    </div>
  );
}

/* ── 공통 Editor Extensions ────────────────────────────────────────────
   PaneLeafView마다 동일한 extensions 배열을 새로 만들면 StarterKit이 내장한
   link/underline과 별도 import가 다시 섞여 "Duplicate extension names" 경고가
   재발하기 쉽다. 모든 인스턴스가 이 단일 배열을 공유하도록 모듈 스코프에 한 번만
   정의한다. (link/underline은 StarterKit 내장분만 사용) */
const NOTE_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    link: { openOnClick: false, autolink: false },
  }),
  MarkdownLivePreview,
  MarkdownCodeFenceEnter,
  HeadingMarkerEdit,
  HeadingFold,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  CodeBlockLowlight.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        filename: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-filename") ?? null,
          renderHTML: (attrs) =>
            attrs.filename ? { "data-filename": String(attrs.filename) } : {},
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
    addInputRules() {
      return [
        textblockTypeInputRule({
          find: /^```([a-z]+)?[\s\n]$/,
          type: this.type,
          getAttributes: (match) => ({ language: match[1] ?? null }),
        }),
      ];
    },
    addKeyboardShortcuts() {
      return {
        // Ctrl/Cmd+A: 코드블록 내용만 전체 선택 (노트 전체 선택 방지)
        "Mod-a": () => {
          const { state } = this.editor;
          const { $from } = state.selection;
          if ($from.parent.type.name !== "codeBlock") return false;
          const from = $from.start($from.depth);
          const to   = $from.end($from.depth);
          return this.editor.commands.setTextSelection({ from, to });
        },
        // 빈 코드블록에서 Backspace → paragraph로 변환
        Backspace: () => {
          const { state } = this.editor;
          const { $from, empty } = state.selection;
          if (!empty || $from.parent.type.name !== "codeBlock") return false;
          if ($from.parent.textContent !== "") return false;
          return this.editor.commands.clearNodes();
        },
        // Escape → 코드블록 밖으로 커서 이동 (마지막 블록이면 paragraph 삽입)
        Escape: () => {
          const { state } = this.editor;
          const { $from } = state.selection;
          if ($from.parent.type.name !== "codeBlock") return false;
          // $from.depth: codeBlock 내부 depth (보통 1), after(depth)로 codeBlock 끝 다음 위치
          const afterPos = $from.after($from.depth);
          if (afterPos < state.doc.content.size) {
            // afterPos+1: 다음 노드의 첫 번째 내부 위치 (노드 경계 → 내부)
            return this.editor.commands.focus(afterPos + 1);
          }
          return this.editor
            .chain()
            .insertContentAt(afterPos, { type: "paragraph" })
            .focus(afterPos + 1)
            .run();
        },
      };
    },
  }).configure({
    lowlight,
    exitOnTripleEnter: true,
    exitOnArrowDown: true,
  }),
];

export interface NoteEditorHandle {
  focusStart: () => void;
  focusEnd: () => void;
  flushPendingSave: () => void;
}

/* ── 커스텀 버블 메뉴 ──────────────────────────────────────────────────
   @tiptap/react/menus의 <BubbleMenu>는 appendTo로 document.body에 메뉴를 옮기려고
   하면(패널 overflow에 안 잘리게 하려고) 이 환경(React 19 + Next 16 Turbopack +
   현재 tiptap 버전 조합)에서 두 번이나 메뉴가 아예 안 뜨는 회귀가 발생했다(props
   메모이제이션으로도 해결 안 됨). tiptap의 BubbleMenuPlugin이 메뉴 엘리먼트를
   "리액트 트리 바깥에서 직접 DOM에 붙이고 떼는" 방식이라 React 19와 충돌하는 것으로
   추정된다. 그래서 tiptap의 BubbleMenu/appendTo 메커니즘 자체를 쓰지 않고, 선택
   좌표를 직접 계산해 React가 완전히 소유하는 createPortal(document.body)로 띄운다 —
   "document.body에 붙인다"는 목표(appendTo의 의도)는 동일하게 달성하면서 DOM
   소유권을 리액트 한쪽에만 둔다. */
/** coordsAtPos(pos, side)의 안전한 래퍼 — 문서 시작/끝처럼 노드 경계에 걸친 위치에서
    ProseMirror가 예외를 던지거나 비정상(NaN/0) rect를 돌려주는 경우를 대비한다. 실패하면
    에디터 DOM 자체의 bounding rect를 기준으로 한 안전한 좌표로 대체한다. */
function safeCoordsAtPos(view: EditorView, pos: number, side: -1 | 1) {
  try {
    const rect = view.coordsAtPos(pos, side);
    if ([rect.left, rect.top, rect.bottom].every(Number.isFinite)) return rect;
  } catch {
    // 아래 fallback으로 진행
  }
  const dom = view.dom.getBoundingClientRect();
  return { left: dom.left + 8, top: dom.top + 8, bottom: dom.top + 24, right: dom.left + 8 };
}

/** 주어진 Range를 화면 좌표 바운딩 박스로 변환한다. getClientRects()가 여러 줄 선택 시
    줄마다 별도 rect를 주므로 0x0 degenerate rect만 골라 무시하고 나머지를 합친다. */
function rangeToAnchorRect(range: Range): { left: number; top: number; bottom: number } | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  if (rects.length > 0) {
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    rects.forEach((r) => {
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    });
    return { left: (left + right) / 2, top, bottom };
  }
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return { left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
  }
  return null;
}

function CustomBubbleMenu({ editor, onAiAction }: { editor: Editor; onAiAction: (type: AiActionType, text: string) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const updateAnchor = useCallback(() => {
    if (!editor.isEditable) {
      setAnchor(null);
      return;
    }

    // 1차 판단 기준: 브라우저 네이티브 selection(window.getSelection()). 드래그로 선택 영역을
    // 확장하다가 마우스가 에디터 패널 바깥(사이드바, 다른 분할 패널, 패널 사이 리사이즈
    // 핸들 등 — 보통 이런 영역은 user-select:none이 걸려 있다)으로 나가도, 네이티브 selection
    // 자체는 anchorNode(드래그가 "시작"된, 고정된 지점)를 기준으로 계속 유효하게 유지된다.
    // 반면 ProseMirror의 내부 selection(editor.state.selection)은 이런 경우 갱신되지 않을 수
    // 있다(prosemirror-view의 selectionchange 처리가 view.hasFocus() === (document.activeElement
    // === view.dom)일 때만 동작) — 그래서 "마우스를 패널 밖에서 놓으면 버블 툴바가 사라지는"
    // 버그의 실제 원인은 PM 내부 selection을 1차 기준으로 썼던 것 자체였다. anchorNode가 이
    // 에디터 DOM 안에 있는지만 확인하면, 화면분할 중에도 "이 selection은 어느 에디터 것인가"가
    // 명확히 한 곳으로만 결정된다(같은 selection이 두 에디터에서 동시에 채택될 일이 없음).
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0) {
      // 네이티브 selection이 페이지에 존재하는 한, 그 selection의 소유 여부를 명확히 판정해서
      // "이 에디터 것이 아니면 무조건 숨긴다." 이 분기가 핵심이다 — 처음 구현에서는 소유권이
      // 없을 때 곧바로 ProseMirror 내부 selection(editor.state.selection)으로 "폴백"했는데,
      // PM 내부 selection은 포커스가 떠난 뒤에도 과거 값을 그대로 들고 있을 수 있어서(focus를
      // 잃은 에디터는 prosemirror-view가 더 이상 내부 selection을 갱신하지 않음 — 위 주석 참고),
      // 다른 패널(B)에서 새로 선택을 시작해도 이전에 선택했던 패널(C)이 자기 자신의 "오래된"
      // PM selection을 다시 읽어 자기 버블 메뉴를 되살리는 버그가 실제로 발생했다(Playwright로
      // 재현 — 두 패널의 버블 메뉴가 동시에 떠 있는 상태가 만들어짐). 그래서 네이티브 selection이
      // 있는데 내 것이 아니면 "내 상태를 따로 점검하지 않고" 곧바로 숨기는 것으로 바꿨다.
      const anchorNode = sel.anchorNode;
      const anchorEl = anchorNode ? (anchorNode.nodeType === 3 ? anchorNode.parentNode : anchorNode) : null;
      const belongsHere = !!anchorEl && editor.view.dom.contains(anchorEl);

      if (!belongsHere) {
        setAnchor(null);
        return;
      }
      if (sel.isCollapsed || editor.isActive("codeBlock")) {
        setAnchor(null);
        return;
      }
      setAnchor(rangeToAnchorRect(sel.getRangeAt(0)));
      return;
    }

    // 네이티브 selection 정보를 전혀 얻을 수 없는 경우(거의 발생하지 않음)에만 ProseMirror
    // 내부 selection으로 판단한다.
    const { from, to } = editor.state.selection;
    if (from === to || editor.isActive("codeBlock")) {
      setAnchor(null);
      return;
    }
    // side: from은 선택 시작 이후(1)쪽, to는 선택 끝 이전(-1)쪽 rect를 우선해서 문서 경계의
    // 모호한 위치(예: from=문서 시작)에서도 선택 "안쪽"의 유효한 rect를 얻도록 한다.
    const start = safeCoordsAtPos(editor.view, from, 1);
    const end = safeCoordsAtPos(editor.view, to, -1);
    setAnchor({
      left: (start.left + end.left) / 2,
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
    });
  }, [editor]);

  useEffect(() => {
    const handleBlur = () => setAnchor(null);
    editor.on("selectionUpdate", updateAnchor);
    editor.on("transaction", updateAnchor);
    editor.on("blur", handleBlur);
    // 패널 밖으로 드래그가 나가는 동안에는 ProseMirror가 "selectionUpdate"/"transaction"을
    // 전혀 못 쏠 수 있으므로(내부 selection이 갱신되지 않음), 브라우저 자체의 selectionchange를
    // 직접 들어서 네이티브 selection 기준으로도 항상 재계산을 시도한다.
    document.addEventListener("selectionchange", updateAnchor);
    return () => {
      // editor.off(event)를 콜백 없이 호출하면 그 이벤트의 리스너가 전부 삭제된다(tiptap-core
      // EventEmitter 구현) — useEditor의 onBlur(setFocused(false))도 같은 "blur" 이벤트를
      // 쓰므로, 반드시 이 핸들러 참조만 지정해서 떼어내야 다른 리스너를 건드리지 않는다.
      editor.off("selectionUpdate", updateAnchor);
      editor.off("transaction", updateAnchor);
      document.removeEventListener("selectionchange", updateAnchor);
      editor.off("blur", handleBlur);
    };
  }, [editor, updateAnchor]);

  // 화면분할/스크롤/리사이즈에도 선택 좌표 기준으로 다시 계산(스크롤바 드래그 등과 무관하게
  // 항상 "현재 선택 위치"만 따라간다 — 패널 스크롤 이벤트를 가로채지 않음)
  useEffect(() => {
    if (!anchor) return;
    const onScrollOrResize = () => updateAnchor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [anchor, updateAnchor]);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) {
      setPos(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    let left = anchor.left - rect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    let top = anchor.top - rect.height - 10;
    if (top < margin) top = anchor.bottom + 10; // 위쪽 공간이 부족하면 선택 영역 아래로
    setPos({ left, top });
  }, [anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos?.left ?? anchor.left,
        top: pos?.top ?? anchor.top,
        visibility: pos ? "visible" : "hidden",
        zIndex: 2000,
      }}
    >
      <BubbleToolbar editor={editor} onAiAction={onAiAction} />
    </div>,
    document.body
  );
}

/** 본문이 비어있고 포커스되지 않았을 때만 보이는 안내 문구 — placeholder처럼 동작 */
const EDITOR_HINT_TEXT = "# 제목 · - 목록 · > 인용 · **굵게** · `코드` · ``` 코드블록 · 텍스트 선택 → 버블 툴바";

interface NoteEditorProps {
  note: MockNote;
  mode: EditMode;
  /** 편집 모드에서는 본문 클릭이 stopPropagation되어 패널 바깥 wrapper까지 버블링되지 않으므로,
      여기서 직접 호출해 패널(탭) 활성화가 빠지지 않게 한다 */
  onActivate: () => void;
  onContentChange: (noteId: string, newContentHtml: string) => void;
  onAiAction: (type: AiActionType, text: string) => void;
}

/** TipTap 에디터 코어 — Bubble Toolbar, 색상/형광펜, 코드블록을 포함한 노트 본문 편집 영역.
    읽기/편집 모드는 노트(탭) 단위로 부모(EditorPanel)가 관리하며, 이 컴포넌트는 mode prop을
    그대로 따르기만 한다(모드를 직접 설정하지 않음 — 그래야 탭별 모드가 서로 덮어쓰지 않는다). */
const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { note, mode, onActivate, onContentChange, onAiAction },
  ref
) {
  const contentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEmpty, setIsEmpty] = useState(() => note.content.trim() === "");
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: NOTE_EDITOR_EXTENSIONS,
    content: resolveEditorHtml(note.content),
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: {
        spellcheck: "false",
        autocomplete: "off",
        translate: "no",
      },
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    /* 본문 변경 → mock notes state로 디바운스 동기화 (탭 전환/재방문 시 내용 유지) */
    onUpdate: ({ editor: ed }) => {
      setIsEmpty(ed.isEmpty);
      const html = ed.getHTML();
      const noteId = note.id;
      if (contentSyncTimerRef.current) clearTimeout(contentSyncTimerRef.current);
      contentSyncTimerRef.current = setTimeout(() => {
        onContentChange(noteId, html);
      }, 400);
    },
  });

  useImperativeHandle(ref, () => ({
    focusStart: () => {
      editor?.chain().focus("start").run();
    },
    focusEnd: () => {
      editor?.chain().focus("end").run();
    },
    flushPendingSave: () => {
      if (!editor) return;
      if (contentSyncTimerRef.current) {
        clearTimeout(contentSyncTimerRef.current);
        contentSyncTimerRef.current = null;
      }
      onContentChange(note.id, editor.getHTML());
    },
  }), [editor, note.id, onContentChange]);

  /* note 변경(탭 전환 등) → 내용만 갱신한다. 모드는 여기서 설정하지 않는다 — mode prop은
     부모가 탭(노트 인스턴스) 단위로 들고 있고, 새로 생성된 탭은 기본값 자체가 "edit"이므로
     별도로 강제할 필요가 없다(아래 [editor, mode] effect가 그 prop을 그대로 적용한다). 여기서
     모드를 같이 설정하면 "탭 복귀 시 이전에 선택한 읽기 모드가 유지돼야 한다"는 정책과 충돌한다. */
  useEffect(() => {
    if (!editor) return;
    if (contentSyncTimerRef.current) {
      clearTimeout(contentSyncTimerRef.current);
      contentSyncTimerRef.current = null;
    }
    editor.commands.setContent(resolveEditorHtml(note.content));
    setIsEmpty(note.content.trim() === "");
    setFocused(false);
    // editor를 deps에 포함: NoteEditor가 새로 마운트되는 시점(예: 빈 시작 탭 → 새 노트로 교체)에는
    // immediatelyRender:false로 인해 첫 렌더에서 editor가 아직 null이라 이 effect가 조기 종료되는데,
    // note.id만 의존하면 editor가 준비된 뒤에도 재실행되지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editor]);

  /* mode prop(탭별 읽기/편집 상태) → editable 토글. 탭 전환으로 note.id와 mode가 같은 렌더에서
     함께 바뀌어도 두 effect가 각자 최신 값으로 정확히 적용된다. */
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(mode === "edit");
  }, [editor, mode]);

  /* 언마운트 시 보류 중인 디바운스 동기화 정리 */
  useEffect(() => {
    return () => {
      if (contentSyncTimerRef.current) clearTimeout(contentSyncTimerRef.current);
    };
  }, []);

  const showHint = mode === "edit" && isEmpty && !focused;

  return (
    <div
      className="split-pane-editor tiptap-note-content relative"
      onClick={(e) => { if (mode === "edit") { e.stopPropagation(); onActivate(); } }}
    >
      {editor && <CustomBubbleMenu editor={editor} onAiAction={onAiAction} />}
      <EditorContent editor={editor} />
      {showHint && (
        <p
          className="pointer-events-none absolute left-0 top-0 text-[11px]"
          style={{ opacity: 0.45, color: "rgb(var(--txt3))" }}
        >
          {EDITOR_HINT_TEXT}
        </p>
      )}
    </div>
  );
});

export default NoteEditor;
