"use client";

import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Extension, InputRule, textblockTypeInputRule } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Check, Link2, Highlighter, Loader2, Sparkles, Wand2, RotateCcw, Search, FileText, ExternalLink, X, AlertTriangle } from "lucide-react";
import { Table, TableRow, TableHeader, TableCell, TableView } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import type { Fragment, Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cx } from "@/lib/utils";
import { MockNote } from "@/lib/notes/noteTypes";
import { typographyCssVars } from "@/lib/notes/typography";
import { titleDragGuard } from "@/lib/notes/titleDragGuard";
import { HeadingFold } from "./headingFold";
import { CodeBlockView } from "./CodeBlockView";
import { QuickSwatchRow, MoreColorPopover, TEXT_COLOR_QUICK, HIGHLIGHT_SWATCHES } from "./ColorPalette";
import { ImageBlock, insertImageBlockFromFile } from "./ImageBlockNode";
import { ColumnList, Column, splitBlockIntoColumns } from "./ColumnBlockNode";
import { PdfBlock } from "./PdfBlockNode";
import { HtmlBlock } from "./HtmlBlockNode";
import { blockWidthPercent, type BlockWidthMode } from "./BlockControls";
import { FontSize, FontFamily, FONT_SIZE_PRESETS, FONT_FAMILY_PRESETS } from "./fontExtensions";
import { WikiLink } from "./WikiLinkNode";
import { DragHandle } from "./DragHandleExtension";
import { WikiLinkSuggestion } from "./WikiLinkSuggestion";
import { WikiLinkAutocomplete } from "./WikiLinkAutocomplete";
import { useWikiLinkContext } from "./WikiLinkContext";
import { SlashCommandKey, SlashCommandSuggestion } from "./SlashCommand";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { TagSuggestion } from "./TagSuggestion";
import { TagAutocomplete } from "./TagAutocomplete";
import { TagNode } from "./TagNode";
import { TaskListMarkdownBridge } from "./TaskListMarkdownBridge";
import { createInlineAssistStream, decideAiSuggestion } from "@/lib/intelligence-api";
import {
  AI_CONTEXT_AROUND_CURSOR_CHARS,
  AI_CONTEXT_MIN_CONTINUE_BEFORE_CHARS,
  buildInlineAssistContext,
  validateAiContextSufficiency,
} from "@/lib/ai-context";
// 표를 쓰지 않는 노트에서는 이 작은 플로팅 툴바조차 메인 청크에 묶이지 않도록 분리한다.
// Table/TableCell 등 TipTap extension 자체는 그대로 유지(동적 등록은 사이드 이펙트 위험이
// 커서 시도하지 않음) — 여기서 지연시키는 건 순수 React UI뿐이다.
const TableToolbar = dynamic(() => import("./TableToolbar").then((mod) => mod.TableToolbar), {
  ssr: false,
});
import EditorContextMenu, { type EditorContextTarget } from "./EditorContextMenu";
import { lowlight } from "./lowlightSetup";

export type EditMode = "read" | "edit";
export type AiActionType = "summarize" | "rewrite";

/* ── Markdown → HTML (초기 로딩) ─────────────────────────────────────── */
function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `[[제목]]` / `[[제목|별칭]]` / `[[제목#헤딩]]` / `[[제목#헤딩|별칭]]`을 WikiLinkNode가
    parseHTML로 인식하는 `span[data-wiki-link]` 구조로 변환한다. 에디터에 직접 타이핑할 때는
    nodeInputRule이 같은 일을 하지만, 마크다운을 불러와서 표시할 때는(가져오기 등) 이 경로를
    타지 않으므로 초기 로딩 변환에서도 처리해야 클릭 가능한 링크가 된다. */
function wikiLinkHtml(text: string) {
  return text.replace(/\[\[([^[\]]+)\]\]/g, (_match, body: string) => {
    const [titleAndHeading, aliasPart] = body.split("|");
    const [title, heading] = titleAndHeading.split("#");
    const t = title.trim();
    const h = heading?.trim();
    const a = aliasPart?.trim();
    if (!t) return _match;
    const attrs = [`data-wiki-link="true"`, `data-title="${escHtml(t)}"`];
    if (a) attrs.push(`data-alias="${escHtml(a)}"`);
    if (h) attrs.push(`data-heading="${escHtml(h)}"`);
    return `<span ${attrs.join(" ")}>[[${escHtml(a ?? t)}]]</span>`;
  });
}

function inlineHtml(text: string) {
  return wikiLinkHtml(escHtml(text))
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = href.replace(/"/g, "&quot;");
      return `<a href="${safeHref}">${label}</a>`;
    })
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
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
  let listType: "ul" | "ol" | "task" | null = null;
  const listItems: { text: string; checked?: boolean }[] = [];
  let tableLines: string[] = [];

  function isTableRow(line: string) {
    return /^\|.*\|\s*$/.test(line.trim());
  }
  function isSeparatorRow(line: string) {
    return /^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());
  }
  function splitCells(line: string): string[] {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  }
  function flushTable() {
    if (tableLines.length === 0) return;
    const rows = tableLines.filter((l) => !isSeparatorRow(l));
    if (rows.length > 0) {
      const headerCells = splitCells(rows[0]);
      const bodyRows = rows.slice(1);
      out.push(
        "<table><tbody><tr>" +
          headerCells.map((c) => `<th><p>${inlineHtml(c)}</p></th>`).join("") +
          "</tr>" +
          bodyRows
            .map(
              (r) =>
                "<tr>" +
                splitCells(r).map((c) => `<td><p>${inlineHtml(c)}</p></td>`).join("") +
                "</tr>"
            )
            .join("") +
          "</tbody></table>"
      );
    }
    tableLines = [];
  }

  function flushList() {
    if (!listType || listItems.length === 0) return;
    if (listType === "task") {
      out.push(
        `<ul data-type="taskList">${listItems
          .map(
            (it) =>
              `<li data-type="taskItem" data-checked="${it.checked ? "true" : "false"}">` +
              `<label><input type="checkbox"${it.checked ? " checked" : ""}><span></span></label>` +
              `<div><p>${inlineHtml(it.text)}</p></div></li>`
          )
          .join("")}</ul>`
      );
    } else {
      const tag = listType;
      out.push(
        `<${tag}>${listItems
          .map((it) => `<li><p>${inlineHtml(it.text)}</p></li>`)
          .join("")}</${tag}>`
      );
    }
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

    if (isTableRow(line)) {
      flushList();
      tableLines.push(line);
      continue;
    }
    flushTable();

    if (line.startsWith("### ")) {
      // "#"+공백을 지우지 않고 그대로 둔다 — 헤딩이 이제 실제 텍스트에 마크다운 기호를
      // 포함하는 라이브 프리뷰 방식이라(MarkdownHeading 참고), 시드 데이터도 동일한 형태로
      // 로드해야 변환된 헤딩과 똑같이 그 기호 위/사이로 커서를 자유롭게 둘 수 있다.
      flushList(); out.push(`<h3>### ${inlineHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushList(); out.push(`<h2>## ${inlineHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      flushList(); out.push(`<h1># ${inlineHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote><p>${inlineHtml(line.slice(2))}</p></blockquote>`);
    } else if (/^!\[([^\]]*)\]\((\S+)\)$/.exec(line.trim())) {
      // 마크다운 이미지 문법(![alt](url)) — 이전에는 이 분기가 없어서 그냥 일반 문단의
      // 리터럴 텍스트로 보였다(Notion 가져오기 등 마크다운 원문에 흔히 등장).
      // url이 asset://{assetId} 형태면(가져오기에서 우리 자산으로 영구 저장한 이미지)
      // 절대 URL을 본문에 굳이 박아두지 않고 PdfBlock/HtmlBlock과 같은 방식으로 렌더링
      // 시점에 getAssetFileUrl(assetId)를 계산하게 한다 — 백엔드 base URL이 바뀌어도 안전.
      flushList();
      const [, alt, url] = /^!\[([^\]]*)\]\((\S+)\)$/.exec(line.trim())!;
      if (url.startsWith("asset://")) {
        const assetId = url.slice("asset://".length);
        out.push(`<div data-image-block="true" data-asset-id="${escHtml(assetId)}" data-file-name="${escHtml(alt)}"></div>`);
      } else {
        out.push(`<div data-image-block="true"><img src="${escHtml(url)}" alt="${escHtml(alt)}"></div>`);
      }
    } else {
      const taskMatch = /^[-*] \[([ xX])\] (.*)$/.exec(line);
      const olMatch = /^(\d+)\. (.+)/.exec(line);
      if (taskMatch) {
        if (listType && listType !== "task") flushList();
        listType = "task";
        listItems.push({ text: taskMatch[2], checked: taskMatch[1].toLowerCase() === "x" });
      } else if (olMatch) {
        if (listType && listType !== "ol") flushList();
        listType = "ol";
        listItems.push({ text: olMatch[2] });
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (listType && listType !== "ul") flushList();
        listType = "ul";
        listItems.push({ text: line.slice(2) });
      } else if (line.trim() === "") {
        flushList(); out.push("<p></p>");
      } else {
        flushList(); out.push(`<p>${inlineHtml(line)}</p>`);
      }
    }
  }

  flushList();
  flushTable();
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

function markdownToEditorInsertionHtml(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (trimmed === "") return "";
  if (trimmed.startsWith("<")) return trimmed;
  if (isInlineMarkdown(trimmed)) return inlineHtml(trimmed);
  return markdownToHtml(trimmed);
}

function isInlineMarkdown(value: string) {
  if (value.includes("\n")) return false;
  return !/^(#{1,6}\s|>\s|([-*]|\d+\.)\s|```)/.test(value);
}

function escapeMarkdownText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/~/g, "\\~");
}

function escapeMarkdownCode(text: string) {
  return text.replace(/`/g, "\\`");
}

function escapeMarkdownLinkUrl(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

function serializeRangeAsMarkdown(editor: Editor, range: { from: number; to: number }) {
  return serializeFragmentAsMarkdown(editor.state.doc.slice(range.from, range.to).content).trim();
}

function serializeFragmentAsMarkdown(fragment: Fragment, depth = 0) {
  const blocks: string[] = [];
  fragment.forEach((node) => {
    const serialized = serializeNodeAsMarkdown(node, depth).trimEnd();
    if (serialized.trim()) blocks.push(serialized);
  });
  return blocks.join("\n\n");
}

function serializeNodeAsMarkdown(node: ProseMirrorNode, depth = 0): string {
  switch (node.type.name) {
    case "paragraph":
      return serializeInlineContent(node);
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level ?? 1)));
      return `${"#".repeat(level)} ${serializeInlineContent(node)}`;
    }
    case "blockquote":
      return serializeFragmentAsMarkdown(node.content, depth)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "bulletList":
      return serializeListAsMarkdown(node, false, depth);
    case "orderedList":
      return serializeListAsMarkdown(node, true, depth);
    case "listItem":
      return serializeListItemAsMarkdown(node, "- ", depth);
    case "codeBlock": {
      const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
      return `\`\`\`${language}\n${node.textContent}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "image": {
      const alt = typeof node.attrs.alt === "string" ? escapeMarkdownText(node.attrs.alt) : "";
      const src = typeof node.attrs.src === "string" ? escapeMarkdownLinkUrl(node.attrs.src) : "";
      return src ? `![${alt}](${src})` : alt;
    }
    default:
      if (node.isText) return serializeMarkedText(node.text ?? "", node.marks);
      if (node.isTextblock) return serializeInlineContent(node);
      if (node.isLeaf) return node.textContent ? escapeMarkdownText(node.textContent) : "";
      return serializeFragmentAsMarkdown(node.content, depth);
  }
}

function serializeInlineContent(node: ProseMirrorNode) {
  let output = "";
  node.forEach((child) => {
    if (child.isText) {
      output += serializeMarkedText(child.text ?? "", child.marks);
    } else if (child.type.name === "hardBreak") {
      output += "\n";
    } else if (child.type.name === "image") {
      output += serializeNodeAsMarkdown(child);
    } else {
      output += child.textContent ? escapeMarkdownText(child.textContent) : "";
    }
  });
  return output;
}

function serializeMarkedText(text: string, marks: readonly Mark[]) {
  if (!text) return "";
  const codeMark = marks.find((mark) => mark.type.name === "code");
  let output = codeMark ? `\`${escapeMarkdownCode(text)}\`` : escapeMarkdownText(text);

  for (const mark of marks) {
    if (mark.type.name === "code") continue;
    if (mark.type.name === "bold") output = `**${output}**`;
    else if (mark.type.name === "italic") output = `*${output}*`;
    else if (mark.type.name === "strike") output = `~~${output}~~`;
    else if (mark.type.name === "link" && typeof mark.attrs.href === "string") {
      output = `[${output}](${escapeMarkdownLinkUrl(mark.attrs.href)})`;
    }
  }
  return output;
}

function serializeListAsMarkdown(node: ProseMirrorNode, ordered: boolean, depth: number) {
  const items: string[] = [];
  let number = Number(node.attrs.start ?? 1);
  node.forEach((child) => {
    if (child.type.name !== "listItem") return;
    const marker = ordered ? `${number}. ` : "- ";
    items.push(serializeListItemAsMarkdown(child, marker, depth));
    number += 1;
  });
  return items.join("\n");
}

function serializeListItemAsMarkdown(node: ProseMirrorNode, marker: string, depth: number) {
  const indent = "  ".repeat(depth);
  const childBlocks: string[] = [];
  node.forEach((child) => {
    if (child.type.name === "paragraph") childBlocks.push(serializeInlineContent(child));
    else childBlocks.push(serializeNodeAsMarkdown(child, depth + 1));
  });

  const [first = "", ...rest] = childBlocks.filter((block) => block.trim());
  const continuation = `${indent}${" ".repeat(marker.length)}`;
  const lines = [`${indent}${marker}${first}`];
  for (const block of rest) {
    lines.push(...block.split("\n").map((line) => `${continuation}${line}`));
  }
  return lines.join("\n");
}

/* ── Obsidian Live Preview ────────────────────────────────────────────── */
type LivePreviewState = {
  /** mousedown ~ mouseup 사이에만 true. 데코레이션 동결 범위를 결정한다. */
  dragging: boolean;
  decos: DecorationSet;
  /** 현재 mousedown~mouseup "세션" 동안 한 번이라도 non-empty selection이 만들어졌는지.
      mousedown마다 false로 리셋되고, 드래그 중 selection이 실제로 생기면 true로 래치된다.
      이 값이 false인 채로 mouseup이 오면 "단순 클릭"(드래그가 아니라 클릭으로 selection을
      해제하려는 의도)으로 간주해 settling/복원 보호를 전혀 걸지 않는다 — 이게 빠지면
      클릭으로 선택을 해제하려 해도 직전 드래그의 `lastNonEmpty`가 되살아나 버린다(실제로
      발생한 회귀). */
  sawNonEmpty: boolean;
  /** 직전 세션에서(또는 진행 중인 세션에서) 마지막으로 관찰된 non-empty selection. 드래그가
      본문 바깥(제목, 다른 패널, 사이드바, 우측 패널 등)에서 끝나면 브라우저가 selection
      자체를 collapse시켜버리는 경우가 있어(아래 `view()`의 주석 참고), 그 경우에만 이 값으로
      복원한다. */
  lastNonEmpty: { from: number; to: number } | null;
  /** "이번 mouseup이 실제 드래그-선택의 끝인지"가 확정된 뒤(= sawNonEmpty였던 경우만) 짧게
      true로 유지된다. `CustomBubbleMenu`가 이 값을 읽어서, 이 기간 동안 native selection이
      일시적으로 collapse돼도 툴바를 숨기지 않는다 — 단순 클릭(sawNonEmpty=false)에는 이
      보호가 전혀 걸리지 않으므로 클릭 즉시 정상적으로 선택 해제된다. 왜 "collapse를 막는
      것"이 아니라 "UI가 collapse에 반응하지 않게 하는 것"인지는 아래 `view()`의 주석 참고. */
  settling: boolean;
};
const LivePreviewKey = new PluginKey<LivePreviewState>("livePreview");
/** 실제 드래그-선택이 끝난 뒤, 이 시간(ms) 동안만 "드래그가 남긴 잔여 collapse"로 간주해
    무시/복원한다. 단순 클릭에는 적용되지 않는다(sawNonEmpty 가드 참고). */
const SETTLE_MS = 150;

/** 마우스 드래그(텍스트 선택) 중에는 이 데코레이션을 절대 다시 계산하면 안 된다 — 드래그
    중에 heading prefix 위젯/`md-source-active` 클래스가 추가·제거되면서 헤딩 노드의 DOM이
    교체되는데, 이 DOM 변경이 진행 중인 브라우저 네이티브 selection 확장(drag-to-select)
    제스처를 깨뜨려 selection이 통째로 collapse되는 버그의 실제 원인이었다(Playwright로
    `window.getSelection()`/`editor.state.selection`을 직접 찍어 확인: 헤딩 경계를 넘는
    드래그, 본문 바깥 제목 영역으로 넘어가는 드래그 모두 동일하게 collapse를 일으켰다).
    버블 툴바가 "사라지는" 것처럼 보였던 건 증상이고, 진짜 문제는 selection 자체가 깨진
    것이었다 — 그래서 mousedown~mouseup 동안은 데코레이션을 동결(freeze)해 DOM을 건드리지
    않고, 드래그가 끝난 뒤(mouseup, 어디서 끝나든)에만 최종 selection 기준으로 다시 계산한다. */
function computeLivePreviewDecorations(editor: Editor, state: EditorState): DecorationSet {
  const { selection, doc } = state;
  const { $from, from, to } = selection;
  const decos: Decoration[] = [];
  const isEditable = editor.isEditable;

  /* ── 헤딩의 "## " 마크다운 기호 — Obsidian Live Preview 방식(커서가 그 줄에 있을 때만 표시)
     "## "는 decoration 위젯이 아니라 heading 노드의 실제 텍스트 내용 일부다(아래 MarkdownHeading
     커스텀 input rule이 입력된 "#"+공백을 지우지 않고 그대로 둔다) — 그래야 사용자가 그 위/사이로
     커서를 자유롭게 두고 직접 고칠 수 있다. 표시 여부(cursorInside)는 selection에 의존하지만,
     이 함수를 호출하는 Plugin.apply()가 실제 드래그 중(mousedown~mouseup)에는 이 함수를 절대
     다시 호출하지 않고 이전 decoration을 위치만 매핑해 그대로 쓴다(파일 상단 MarkdownLivePreview
     주석 참고, blockquote/인라인 코드 마커도 이미 같은 패턴) — 그래서 cursorInside가 바뀌어도
     "드래그가 진행되는 동안" DOM이 흔들리는 일은 없다(과거 버그는 정확히 이 보호가 없을 때만
     발생했다). 단순 클릭/화살표 이동처럼 드래그가 아닌 선택 변경은 한 번에 끝나는 동작이라
     이 토글로 인한 DOM 변경이 진행 중인 네이티브 제스처를 방해할 일이 없다.
     읽기 모드(isEditable=false)에서는 "#"가 실제 텍스트로 항상 DOM에 남아있는 채 decoration이
     전혀 안 붙으면 기본 스타일(완전히 보이는 일반 텍스트)로 노출돼 버린다 — 그래서 읽기
     모드에서는 cursorInside를 보지 않고 무조건 숨김 클래스를 적용해, 클릭/포커스로 그 줄에
     캐럿이 가더라도 "#"가 다시 나타나지 않게 한다. */
  doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    const match = /^#{1,6}\s*/.exec(node.textContent);
    if (!match || match[0].length === 0) return;
    const nodeEnd = offset + node.nodeSize;
    const cursorInside = isEditable && from > offset && to < nodeEnd;
    const start = offset + 1;
    const end = start + match[0].length;
    decos.push(
      Decoration.inline(start, end, {
        class: cursorInside ? "md-heading-syntax" : "md-heading-syntax-hidden",
      })
    );
  });

  // 읽기 모드에서는 헤딩 "#" 숨김 외에 다른 라이브 프리뷰 데코레이션(블록쿼트/인라인 코드
  // 마커 등 편집 전용 위젯)을 붙이지 않는다 — 그 위젯들은 원래 decoration 자체이므로 아래로
  // 내려가지 않으면(=계산하지 않으면) 자동으로 보이지 않는다.
  if (!isEditable) return DecorationSet.create(doc, decos);

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
}

const MarkdownLivePreview = Extension.create({
  name: "markdownLivePreview",

  addProseMirrorPlugins() {
    const { editor } = this;
    // mousedown 지점에서 일정 거리 이상 움직였는지를 별도로 추적한다(아래 view()의 mousemove
    // 리스너가 채움) — PM 모델의 selection이 non-empty가 됐는지(sawNonEmpty)만으로 "실제
    // 드래그였는가"를 판단하면, 드래그가 에디터 DOM 바깥으로 빠르게 빠져나가는 경로에서는
    // PM이 selection 변화를 한 번도 못 잡아챌 수 있다(focus가 view.dom에 있어도, 그 사이
    // 'selectionchange' 처리 타이밍에 따라 비어있는 상태만 관찰될 수 있음 — Playwright로
    // 같은 경로를 반복 실행해도 sawNonEmpty가 true/false로 들쑥날쑥하게 나오는 것으로 확인됨,
    // 즉 PM 신호만으로는 신뢰할 수 없다). 포인터 이동 거리는 PM 상태와 무관하게 항상 정확히
    // 잡을 수 있으므로 더 신뢰할 수 있는 "이건 클릭이 아니라 드래그였다" 신호다.
    let mouseDownPoint: { x: number; y: number } | null = null;
    let movedEnough = false;
    const DRAG_THRESHOLD_PX = 4;
    return [
      new Plugin({
        key: LivePreviewKey,
        state: {
          init(_, state): LivePreviewState {
            return {
              dragging: false,
              decos: computeLivePreviewDecorations(editor, state),
              sawNonEmpty: false,
              lastNonEmpty: null,
              settling: false,
            };
          },
          apply(tr, prev, _oldState, newState): LivePreviewState {
            const meta = tr.getMeta(LivePreviewKey) as
              | { dragging?: boolean; settling?: boolean; resetSession?: boolean }
              | undefined;
            const dragging = meta?.dragging ?? prev.dragging;
            const settling = meta?.settling ?? prev.settling;
            // resetSession: 새 mousedown마다 "이번 세션에서 실제로 선택이 만들어졌는가"를
            // 처음부터 다시 관찰해야 한다 — 그래야 "드래그 끝(클릭 아님)"과 "단순 클릭"을
            // 구분할 수 있다. 리셋하지 않으면 직전 드래그의 sawNonEmpty=true가 남아있어서,
            // 바로 이어지는 단순 클릭까지 "드래그의 연속"으로 오인해 선택 해제를 막아버린다
            // (실제로 발생한 회귀: 클릭으로 선택 해제가 안 됨).
            const sawNonEmpty = meta?.resetSession
              ? false
              : dragging && !newState.selection.empty
                ? true
                : prev.sawNonEmpty;
            const lastNonEmpty =
              dragging && !newState.selection.empty
                ? { from: newState.selection.from, to: newState.selection.to }
                : meta?.dragging === false
                  ? null // 드래그가 끝났으면 다음 드래그를 위해 비운다
                  : prev.lastNonEmpty;
            if (dragging) {
              // 드래그 중에는 데코레이션을 새로 계산하지 않고 위치만 매핑한다 — 셀렉션이
              // 바뀌어도 위젯/노드 데코레이션을 추가·제거하지 않아야 진행 중인 네이티브
              // drag-to-select 제스처가 깨지지 않는다.
              return { dragging, decos: prev.decos.map(tr.mapping, tr.doc), sawNonEmpty, lastNonEmpty, settling };
            }
            return {
              dragging,
              decos: computeLivePreviewDecorations(editor, newState),
              sawNonEmpty,
              lastNonEmpty,
              settling,
            };
          },
        },
        props: {
          decorations(state) {
            return LivePreviewKey.getState(state)?.decos ?? DecorationSet.empty;
          },
          handleDOMEvents: {
            mousedown(view, event) {
              // settling은 여기서 켜지 않는다 — 이번 mousedown이 "드래그"가 될지 "클릭"이
              // 될지는 아직 모른다. settling(=collapse 무시 보호)은 mouseup에서 이번 세션이
              // 실제 드래그였다고 확정된 뒤에만 켠다(아래 onMouseUp).
              mouseDownPoint = { x: event.clientX, y: event.clientY };
              movedEnough = false;
              view.dispatch(view.state.tr.setMeta(LivePreviewKey, { dragging: true, resetSession: true }));
              return false;
            },
          },
        },
        view(view) {
          // ── 왜 "collapse를 막는 것"이 아니라 "UI가 반응하지 않게 하는 것"인가 ──────────
          // 처음에는 'selectionchange'를 다른 누구보다 먼저 가로채 collapse가 보이기 전에
          // 동기적으로 복원하려 했다. 하지만 실제로는 효과가 없었다(Playwright로 직접
          // requestAnimationFrame 단위까지 추적해 확인) — ProseMirror의 EditorView가 생성될
          // 때 내부 domObserver가 이미 'selectionchange'를 듣고 있고, 이 domObserver는
          // collapse를 감지하면 **그 자리에서 동기적으로** `editor.state.selection`을
          // collapse된 값으로 동기화하면서 "selectionUpdate" 이벤트를 즉시 발생시킨다.
          // domObserver는 EditorView 생성 시점(어떤 Plugin의 view()보다 먼저)에 등록되므로,
          // 우리가 아무리 일찍 'selectionchange' 리스너를 달아도 domObserver를 앞지를 수
          // 없다 — 즉 "collapse 자체를 막는 것"은 prosemirror-view 내부를 패치하지 않는 한
          // 불가능하다.
          //
          // 그래서 접근을 바꿨다: collapse가 PM 모델에 잠깐 반영되는 것 자체는 막지 못해도,
          // **그 잠깐의 collapse를 누구도 "선택이 해제됐다"는 신호로 받아들이지 않게 만들면
          // 된다.** `CustomBubbleMenu`가 이 Plugin의 `settling` 상태를 읽어서, settling이
          // true인 동안 native selection이 collapse로 보이더라도 툴바를 숨기지 않고 마지막
          // 위치를 그대로 유지한다(아래 `updateAnchor` 참고).
          //
          // settling은 "실제 드래그-선택이 끝났을 때만" 켜진다(sawNonEmpty 가드, 위 apply()
          // 참고) — 단순 클릭은 sawNonEmpty가 끝까지 false이므로 settling이 전혀 켜지지
          // 않고, 클릭의 collapse가 그대로 반영되어 즉시 선택 해제된다.
          //
          // native selection highlight(브라우저가 직접 그리는 파란 음영) 자체의 깜빡임을
          // 줄이기 위해, setTimeout 한 번이 아니라 settle 구간 내내 requestAnimationFrame마다
          // 확인-복원한다 — rAF 콜백은 그 프레임의 paint보다 먼저 실행되므로, "이번 프레임에서
          // collapse를 감지해 같은 콜백 안에서 즉시 복원"하면 그 collapse가 화면에 그려질
          // 기회 자체가 없다(다음 paint는 이미 복원된 selection을 그린다). setTimeout(특히
          // 150ms 단위)에 맡기면 그 사이 여러 프레임이 collapse 상태로 paint될 수 있어 눈에
          // 보이는 하이라이트 깜빡임으로 이어졌다.
          let rafId: number | null = null;
          let settleDeadline = 0;

          const restoreIfCollapsed = (snapshot: { from: number; to: number } | null) => {
            if (!snapshot) return false;
            // PM 모델(`view.state.selection.empty`)이 아니라 **네이티브 DOM selection**을
            // 기준으로 판단해야 한다 — 브라우저가 한 번의 collapse가 아니라 여러 프레임에 걸쳐
            // selection을 반복적으로 재-collapse하는 경우가 실제로 있는데(Playwright로 확인),
            // 이전 프레임에 우리가 이미 PM 모델을 복원해놓았다는 이유로(`view.state.selection.empty
            // === false`) 다음 프레임에 또 발생한 네이티브 재-collapse를 그냥 지나치면, 네이티브
            // 하이라이트는 다시 사라진 채로 한동안 방치된다. 매 프레임 네이티브 DOM을 직접 다시
            // 확인해야 이 반복적인 재-collapse를 전부 잡아낼 수 있다.
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) return false; // 네이티브가 이미 정상이면 손대지 않음
            const docSize = view.state.doc.content.size;
            try {
              const restored = TextSelection.create(
                view.state.doc,
                Math.min(snapshot.from, docSize),
                Math.min(snapshot.to, docSize)
              );
              // 항상 새 Selection 인스턴스를 dispatch해 prosemirror-view가 "변경 없음"으로
              // 판단해 DOM 갱신을 skip하지 않고, 매번 강제로 selectionToDOM을 다시 태우게 한다.
              view.dispatch(view.state.tr.setSelection(restored));
              return true;
            } catch {
              // 매핑이 불가능한 위치라면(문서 구조가 그 사이 바뀐 경우 등) 복원을 건너뛴다.
              return false;
            }
          };

          const stopSettleLoop = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = null;
          };

          const settleLoop = (snapshot: { from: number; to: number } | null) => {
            restoreIfCollapsed(snapshot);
            if (performance.now() >= settleDeadline) {
              view.dispatch(view.state.tr.setMeta(LivePreviewKey, { settling: false }));
              rafId = null;
              return;
            }
            rafId = requestAnimationFrame(() => settleLoop(snapshot));
          };

          // mousedown 지점에서 DRAG_THRESHOLD_PX 이상 움직이면 movedEnough를 true로 래치한다.
          // 패널/사이드바/제목 등 에디터 바깥까지 포함해 항상 정확하므로 window 레벨로 듣는다.
          const onMouseMove = (e: MouseEvent) => {
            if (!mouseDownPoint || movedEnough) return;
            const dx = e.clientX - mouseDownPoint.x;
            const dy = e.clientY - mouseDownPoint.y;
            if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) movedEnough = true;
          };
          window.addEventListener("mousemove", onMouseMove);

          // mouseup은 패널 바깥(제목, 다른 분할 패널, 사이드바, 우측 패널 등)에서 끝날 수
          // 있으므로 이 에디터 DOM의 handleDOMEvents만으로는 못 잡는다 — window 레벨로 들어야
          // 드래그가 어디서 끝나든 동결을 해제하고 최종 selection 기준으로 다시 계산한다.
          const onMouseUp = () => {
            const pluginState = LivePreviewKey.getState(view.state);
            if (!pluginState?.dragging) return;
            const { lastNonEmpty: snapshot } = pluginState;
            // "실제 드래그였다"는 두 신호 중 하나라도 참이면 인정한다 — PM이 selection
            // non-empty를 한 번이라도 직접 관찰했거나(sawNonEmpty), 포인터가 임계값 이상
            // 움직였거나(movedEnough, 위 주석 참고). 둘 다 거짓이어야만 "단순 클릭"이다.
            const wasRealDrag = pluginState.sawNonEmpty || movedEnough;
            stopSettleLoop();
            mouseDownPoint = null;
            if (!wasRealDrag) {
              // 이번 세션은 드래그가 아니라 단순 클릭이었다 — collapse를 그대로 둔다(보호
              // 없이 즉시 선택 해제). settling도 강제로 끈다(혹시 직전 드래그의 settle 구간이
              // 아직 안 끝난 채 겹쳤더라도, 사용자의 새 클릭 의도를 우선한다).
              view.dispatch(view.state.tr.setMeta(LivePreviewKey, { dragging: false, settling: false }));
              return;
            }
            // 실제 드래그였다 — settling을 켜고 settle 구간 동안 매 프레임 collapse를 감시한다.
            view.dispatch(view.state.tr.setMeta(LivePreviewKey, { dragging: false, settling: true }));
            settleDeadline = performance.now() + SETTLE_MS;
            settleLoop(snapshot);
          };
          window.addEventListener("mouseup", onMouseUp);

          return {
            destroy: () => {
              window.removeEventListener("mousemove", onMouseMove);
              window.removeEventListener("mouseup", onMouseUp);
              stopSettleLoop();
            },
          };
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
            // preview:false — 막 fence를 입력한 직후라 내용이 비어있다. mermaid 블록은
            // 기본 preview:true(렌더링 모드)인데, 그대로 두면 타이핑을 시작하는 순간(텍스트가
            // 비어있지 않게 되는 순간) CodeBlockView가 편집 영역을 display:none으로 숨겨버려
            // 포커스가 날아가고 이후 입력이 전부 사라지는 버그가 있었다(실측 확인). 새로 만든
            // 블록은 항상 편집 모드로 시작해야 안전하다.
            tr.setNodeMarkup($from.before(), codeBlockType, { language: lang, preview: false });
            tr.delete($from.pos - $from.parentOffset, $from.pos);
            return true;
          })
          .run();
      },
    };
  },
});

/* ── 마크다운 헤딩 Live Preview ───────────────────────────────────────────
   기존 구현은 "## "를 decoration 위젯(비편집 영역)으로 보여줬다 — 보기엔 똑같아도 실제
   텍스트가 아니라서 그 위/사이에 커서를 둘 수 없었고(클릭해도 항상 "제목" 시작 위치로
   스냅), Backspace/Delete로 "#" 하나만 지우는 것도 불가능했다. 진짜 "마크다운을 편집하면서
   동시에 렌더링되는" 경험을 위해 "#"+공백을 heading 노드의 실제 텍스트로 유지하도록
   바꿨다 — Obsidian처럼 커서가 그 줄에 있을 때만 "#"를 보여주는 표시/숨김은 위
   computeLivePreviewDecorations의 cursorInside 기반 `.md-heading-syntax`/
   `.md-heading-syntax-hidden` decoration이 담당한다(실제 드래그 중에는 그 함수 자체가
   재호출되지 않도록 보호돼 있어 안전 — 같은 파일의 MarkdownLivePreview 주석 참고). */
// MarkdownHeading/HeadingLevelSync 둘 다 같은 레벨 목록을 알아야 한다 — 확장 인스턴스를 서로
// 찾아 옵션을 읽는 대신(생성 순서/타이밍에 의존해 깨지기 쉬움) 모듈 스코프 상수 하나를 공유한다.
const SUPPORTED_HEADING_LEVELS = [1, 2, 3] as const;

const MarkdownHeading = Heading.extend({
  addInputRules() {
    const levels = this.options.levels as number[];
    const maxLevel = Math.max(...levels);
    return [
      new InputRule({
        // 기본 tiptap headingRule과 동일한 트리거("#"~"######" + 공백 1개, 줄 맨 앞)지만,
        // handler에서 매치된 텍스트를 지우지 않는다(기본은 `tr.delete(range.from, range.to)`로
        // 지운 뒤 setBlockType — 여기서는 그 delete를 빼고 setBlockType만 한다).
        find: new RegExp(`^(#{1,${maxLevel}})\\s$`),
        handler: ({ state, range, match }) => {
          const level = Math.min(match[1].length, maxLevel) as 1 | 2 | 3 | 4 | 5 | 6;
          if (!levels.includes(level)) return null;
          // range는 이미 문서에 들어가 있는 "#" 글자들만 가리킨다(range.to는 트리거로 쓰인
          // 공백이 아직 삽입되기 *전* 커서 위치) — prosemirror-inputrules는 매치에 쓰인 마지막
          // 글자(공백)를 자동으로 넣어주지 않고, 핸들러가 트랜잭션에 직접 step을 안 넣으면
          // 이 규칙 자체가 무시된다(run()의 `!tr.steps.length` 체크). 그 공백을 직접 삽입해야
          // "## 제목"처럼 "#"와 본문 사이의 띄어쓰기가 실제 텍스트로 남는다.
          const trailing = match[0].slice(match[1].length);
          state.tr
            .insertText(trailing, range.to)
            .setBlockType(range.from, range.from, this.type, { level });
        },
      }),
    ];
  },
});

/* 위 input rule로 "## 제목"이 만들어진 뒤에도, 사용자가 그 "#" 영역을 직접 편집(스페이스/문자
   입력, Backspace, Delete)할 수 있어야 한다 — 매 트랜잭션 뒤 모든 heading의 실제 텍스트를
   다시 읽어 앞부분 "#" 개수에 맞춰 level 속성을 재동기화한다("## "→"###"면 레벨 3으로,
   "#"가 하나도 안 남으면 평범한 문단으로). attrs만 바꾸거나 type만 바꾸는 것이라(텍스트 길이는
   그대로) 다른 노드의 위치가 밀리지 않아, newState.doc을 순회하며 바로 적용해도 안전하다. */
const HeadingLevelSync = Extension.create({
  name: "headingLevelSync",
  addProseMirrorPlugins() {
    const levels: readonly number[] = SUPPORTED_HEADING_LEVELS;
    const maxLevel = Math.max(...levels);
    return [
      new Plugin({
        key: new PluginKey("headingLevelSync"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let tr: Transaction | null = null;
          newState.doc.forEach((node, offset) => {
            if (node.type.name !== "heading") return;
            const match = /^#{1,6}/.exec(node.textContent);
            const hashCount = match ? match[0].length : 0;
            if (hashCount === 0) {
              // "#"가 전부 지워졌다 — 평범한 문단으로 되돌린다.
              (tr ?? (tr = newState.tr)).setNodeMarkup(offset, newState.schema.nodes.paragraph, {});
              return;
            }
            const level = Math.min(hashCount, maxLevel);
            if (!levels.includes(level)) return;
            if (node.attrs.level !== level) {
              (tr ?? (tr = newState.tr)).setNodeMarkup(offset, undefined, { ...node.attrs, level });
            }
          });
          return tr;
        },
      }),
    ];
  },
});

/* ── Heading marker keyboard editing ─────────────────────────────────── */
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
      /* "#"/Backspace로 헤딩 레벨을 직접 조작하던 핸들러는 제거했다 — "## "가 이제 진짜
         텍스트라서, "#"를 누르면 평범한 문자 입력으로 처리되고(레벨은 아래 HeadingLevelSync가
         결과 텍스트의 "#" 개수를 다시 세어 동기화), Backspace도 평범한 문자 삭제로 처리된다.
         이전처럼 "커서가 맨 앞일 때만" 특별 동작하는 게 아니라, 헤딩 어디서든(예: "#|#" 사이,
         "##| 제목") 자연스럽게 "#"를 추가/삭제해 레벨을 바꿀 수 있게 하는 게 목적이다. */
      /* 헤딩 안에서 Home 키가 줄 시작으로 안 가는 네이티브 버그가 있었다(Playwright로 실측:
         일반 문단에서는 정상, 헤딩 안에서만 무반응). ProseMirror 모델 기준으로 직접 텍스트
         시작 위치로 이동시켜 우회한다 — "## "가 실제 텍스트가 된 지금도 안전망으로 유지. */
      Home: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== "heading") return false;
        return this.editor.commands.setTextSelection($from.start());
      },
      "Shift-Home": () => {
        const { state } = this.editor;
        const { $from, to } = state.selection;
        if ($from.parent.type.name !== "heading") return false;
        return this.editor.commands.setTextSelection({ from: $from.start(), to });
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
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cx(
        "grid h-[26px] min-w-[26px] place-items-center rounded px-1 transition-colors",
        disabled
          ? "cursor-not-allowed text-txt3/50"
          : active
            ? "bg-primary/15 text-primary"
            : "text-txt2 hover:bg-surface2/70 hover:text-txt"
      )}
    >
      {children}
    </button>
  );
}

/** 글자 크기/글꼴 — 기존 명세에 빠져 있던 기능. 상단 고정 툴바·슬래시 커맨드는 이 프로젝트에
    아직 없고(NOTE_FEATURE_IMPLEMENTATION_STATUS.md 참고), 우클릭 메뉴는 표/이미지 삽입 같은
    "삽입" 동작 전용이라 "선택한 텍스트에 적용"이라는 성격과 맞지 않다 — 텍스트 선택 시 바로
    뜨는 Bubble Toolbar에 기존 글자색(MoreColorPopover)과 동일한 "토글 버튼 + 작은 패널"
    패턴으로 추가하는 것이 가장 자연스럽고, 기존 UI 구조를 새로 만들지 않아도 된다. */
function FontPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [customSize, setCustomSize] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentSize = (editor.getAttributes("textStyle").fontSize as string) ?? null;
  const currentFamily = (editor.getAttributes("textStyle").fontFamily as string) ?? null;

  const commitCustomSize = () => {
    const n = Number(customSize);
    if (Number.isFinite(n) && n > 0) {
      editor.chain().focus().setFontSize(`${Math.min(Math.max(n, 6), 96)}px`).run();
    }
    setCustomSize("");
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="글꼴 / 글자 크기"
        aria-label="글꼴 및 글자 크기"
        className={cx(
          "grid h-[26px] w-[24px] shrink-0 place-items-center rounded text-[11px] font-semibold transition-colors",
          open ? "bg-primary/15 text-primary" : "text-txt2 hover:bg-surface2/70 hover:text-txt"
        )}
      >
        Aa
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-[190px] overflow-hidden rounded-lg border border-line/60 p-2.5"
          style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}
        >
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[11px] font-semibold text-txt2">글자 크기</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetFontSize().run()}
              title="기본값으로 되돌리기"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt"
            >
              <RotateCcw size={10} />
            </button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1 px-0.5">
            {FONT_SIZE_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setFontSize(size).run()}
                title={`${parseInt(size, 10)}px`}
                className={cx(
                  "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                  currentSize === size ? "bg-primary/15 text-primary" : "text-txt2 hover:bg-surface2/70 hover:text-txt"
                )}
              >
                {parseInt(size, 10)}
              </button>
            ))}
            <input
              type="number"
              placeholder="직접"
              aria-label="사용자 지정 글자 크기(px)"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitCustomSize(); } }}
              onBlur={commitCustomSize}
              className="h-6 w-12 rounded border border-line/50 bg-transparent px-1 text-[11px] text-txt outline-none"
            />
          </div>

          <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-txt2">글꼴</p>
          <div className="flex flex-col gap-0.5">
            {FONT_FAMILY_PRESETS.map((f) => {
              const active = f.value === null ? !currentFamily : currentFamily === f.value;
              return (
                <button
                  key={f.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (f.value === null) editor.chain().focus().unsetFontFamily().run();
                    else editor.chain().focus().setFontFamily(f.value).run();
                  }}
                  style={{ fontFamily: f.value ?? undefined }}
                  className={cx(
                    "rounded px-2 py-1 text-left text-[12px] transition-colors",
                    active ? "bg-primary/15 text-primary" : "text-txt2 hover:bg-surface2/70 hover:text-txt"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 내부 노트 링크 href 스킴 — 실제 URL이 아니라 노트 id를 가리키는 표시일 뿐이다. 일반
    href와 구분해 클릭 시 외부 이동이 아니라 앱 내 노트 이동(WikiLinkContext.onNavigate)으로
    처리한다. WikiLink([[제목]])와 달리 "임의의 텍스트를 그대로 두고 그 텍스트에 노트로 가는
    링크만 붙이는" 경우(앵커 텍스트 ≠ 노트 제목)를 위한 보완 기능 — 자세한 평가는 작업 보고 참조. */
export const INTERNAL_LINK_PREFIX = "brainx-note://";

function LinkPopover({
  editor,
  popoverOpenRef,
}: {
  editor: Editor;
  popoverOpenRef: React.MutableRefObject<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"url" | "note">("url");
  const [urlDraft, setUrlDraft] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const wikiCtx = useWikiLinkContext();
  /* 검색/URL input에 포커스를 주는 순간 selection이 바뀌므로(타이핑 도중 collapse될 수도
     있음), 적용 시점이 아니라 팝오버를 "여는 시점"의 선택 범위를 미리 저장해뒀다가 적용
     직전에 그 범위로 복원한다 — 노트를 고르거나 글을 입력하는 동안 원래 선택이 흔들려도
     항상 처음 선택했던 텍스트에 링크가 걸린다. */
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);

  /* 검색/URL input에 포커스를 주면(클릭 또는 타이핑) 에디터 쪽 네이티브 selection 소유권이
     사라져 CustomBubbleMenu가 툴바 전체를 숨기는데, 이 팝오버가 열려 있는 동안은 그 selection
     상실을 무시하도록 popoverOpenRef를 동기화한다 — 닫히면 즉시 원래 동작으로 복귀. */
  useEffect(() => {
    popoverOpenRef.current = open;
    return () => { popoverOpenRef.current = false; };
  }, [open, popoverOpenRef]);

  const currentHref = (editor.getAttributes("link").href as string) ?? "";
  const isInternal = currentHref.startsWith(INTERNAL_LINK_PREFIX);

  useEffect(() => {
    if (!open) return;
    savedRangeRef.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setUrlDraft(isInternal ? "" : currentHref);
    setTab(isInternal ? "note" : "url");
    setNoteQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* range가 비어있지(collapsed) 않으면 적용 직전에 그 위치로 selection을 복원한다 — 팝오버를
     연 시점에 선택했던 텍스트가 그대로 링크의 앵커가 된다(savedRangeRef 주석 참고). */
  const restoreSavedRange = (chain: ReturnType<Editor["chain"]>) => {
    const range = savedRangeRef.current;
    if (range && range.from !== range.to) return chain.setTextSelection(range);
    return chain;
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (trimmed === "") editor.chain().focus().unsetLink().run();
    else restoreSavedRange(editor.chain().focus()).extendMarkRange("link").setLink({ href: trimmed }).run();
    setOpen(false);
  };

  const applyNoteLink = (noteId: string) => {
    restoreSavedRange(editor.chain().focus()).extendMarkRange("link").setLink({ href: `${INTERNAL_LINK_PREFIX}${noteId}` }).run();
    setOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().unsetLink().run();
    setOpen(false);
  };

  const filteredNotes = (wikiCtx?.notes ?? []).filter((n) =>
    n.title.toLowerCase().includes(noteQuery.trim().toLowerCase())
  ).slice(0, 8);

  return (
    <div ref={ref} className="relative">
      <BubbleBtn active={editor.isActive("link")} onClick={() => setOpen((v) => !v)} title="링크">
        <Link2 size={13} />
      </BubbleBtn>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1.5 w-[230px] overflow-hidden rounded-lg border border-line/60 p-2.5"
          style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}
        >
          <div className="mb-2 flex items-center gap-1 rounded-md p-0.5" style={{ background: "rgb(var(--surface2) / 0.6)" }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab("url")}
              className={cx(
                "flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors",
                tab === "url" ? "bg-primary/15 text-primary" : "text-txt3 hover:text-txt2"
              )}
            >
              <ExternalLink size={11} /> 외부 URL
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab("note")}
              className={cx(
                "flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors",
                tab === "note" ? "bg-primary/15 text-primary" : "text-txt3 hover:text-txt2"
              )}
            >
              <FileText size={11} /> 노트 연결
            </button>
          </div>

          {tab === "url" ? (
            <div className="flex flex-col gap-1.5">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }}
                placeholder="https://..."
                className="h-7 w-full rounded border border-line/50 bg-transparent px-2 text-[11.5px] text-txt outline-none"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={applyUrl}
                  className="flex-1 rounded bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                >
                  적용
                </button>
                {currentHref && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={removeLink}
                    className="rounded px-2 py-1 text-[11px] text-txt3 hover:bg-surface2/70 hover:text-txt"
                  >
                    제거
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-txt3" />
                <input
                  value={noteQuery}
                  onChange={(e) => setNoteQuery(e.target.value)}
                  placeholder="노트 검색..."
                  className="h-7 w-full rounded border border-line/50 bg-transparent pl-6 pr-2 text-[11.5px] text-txt outline-none"
                />
              </div>
              <div className="scroll-thin flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                {filteredNotes.length === 0 ? (
                  <p className="px-1 py-2 text-center text-[10.5px] text-txt3">일치하는 노트가 없습니다</p>
                ) : (
                  filteredNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyNoteLink(n.id)}
                      className="truncate rounded px-2 py-1 text-left text-[11.5px] text-txt2 transition-colors hover:bg-surface2/70 hover:text-txt"
                      title={n.title}
                    >
                      {n.title}
                    </button>
                  ))
                )}
              </div>
              {isInternal && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={removeLink}
                  className="rounded px-2 py-1 text-[11px] text-txt3 hover:bg-surface2/70 hover:text-txt"
                >
                  연결 해제
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RewriteRange = {
  from: number;
  to: number;
};

type BubbleAnchor = {
  left: number;
  top: number;
  bottom: number;
  kind: "selection" | "cursor";
};

type RewriteSuggestionState =
  | {
      status: "loading";
      requestId: number;
      range: RewriteRange;
      originalPlainText: string;
      selectedMarkdown: string;
      contextBefore: string;
      contextAfter: string;
      text: string;
    }
  | {
      status: "ready";
      requestId: number;
      range: RewriteRange;
      originalPlainText: string;
      selectedMarkdown: string;
      contextBefore: string;
      contextAfter: string;
      text: string;
      suggestionId: string;
      modelId: string;
    }
  | {
      status: "error";
      requestId: number;
      range: RewriteRange;
      originalPlainText: string;
      selectedMarkdown: string;
      contextBefore: string;
      contextAfter: string;
      text: string;
      message: string;
      suggestionId?: string;
    };

type ContinueSuggestionState =
  | {
      status: "loading";
      requestId: number;
      insertPos: number;
      contextBefore: string;
      contextAfter: string;
      text: string;
    }
  | {
      status: "ready";
      requestId: number;
      insertPos: number;
      contextBefore: string;
      contextAfter: string;
      text: string;
      suggestionId: string;
      modelId: string;
    }
  | {
      status: "error";
      requestId: number;
      insertPos: number;
      contextBefore: string;
      contextAfter: string;
      text: string;
      message: string;
      suggestionId?: string;
    };

function selectedText(editor: Editor, range: RewriteRange) {
  return editor.state.doc.textBetween(range.from, range.to, " ");
}

function inlineContext(editor: Editor, range: RewriteRange) {
  const docSize = editor.state.doc.content.size;
  return buildInlineAssistContext({
    task: range.from === range.to ? "editor.continue" : "editor.rewrite",
    contextBefore: serializeRangeAsMarkdown(editor, {
      from: Math.max(0, range.from - AI_CONTEXT_AROUND_CURSOR_CHARS),
      to: range.from,
    }),
    contextAfter: serializeRangeAsMarkdown(editor, {
      from: range.to,
      to: Math.min(docSize, range.to + AI_CONTEXT_AROUND_CURSOR_CHARS),
    }),
  });
}

function insertMarkdownContent(editor: Editor, range: RewriteRange, text: string) {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, markdownToEditorInsertionHtml(text))
    .run();
}

function messageFromUnknown(error: unknown) {
  return error instanceof Error ? error.message : "AI 요청에 실패했습니다.";
}

type InlineContinueDraftMeta =
  | { type: "set"; draft: ContinueSuggestionState }
  | { type: "clear" };

const InlineContinueDraftKey = new PluginKey<ContinueSuggestionState | null>("inlineContinueDraft");

function getInlineContinueDraft(editor: Editor) {
  return InlineContinueDraftKey.getState(editor.state) ?? null;
}

function setInlineContinueDraft(editor: Editor, draft: ContinueSuggestionState) {
  editor.view.dispatch(editor.state.tr.setMeta(InlineContinueDraftKey, { type: "set", draft } satisfies InlineContinueDraftMeta));
}

function clearInlineContinueDraft(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(InlineContinueDraftKey, { type: "clear" } satisfies InlineContinueDraftMeta));
}

function continueSuggestionId(draft: ContinueSuggestionState | null | undefined) {
  return draft?.status === "ready" || draft?.status === "error" ? draft.suggestionId : undefined;
}

const CONTINUE_TRIGGER_IDLE_MS = 600;
const CONTINUE_TRIGGER_SAFE_WIDTH = 124;
const CONTINUE_DRAFT_SAFE_WIDTH = 420;

/* "이어쓰기" 제안 UI는 본문 흐름 안에 직접 꽂지 않고 editor shell 위에 띄운다. 트리거 버튼은
   idle 상태에서만 작게 보이고, 결과 위젯은 커서 라인 아래 여백 쪽에 둬 현재 줄을 덮지 않게 한다. */
function InlineContinueFloatingWidget({
  draft,
  anchor,
  onAccept,
  onCancel,
}: {
  draft: ContinueSuggestionState;
  anchor: { left: number; top: number };
  onAccept: () => void;
  onCancel: () => void;
}) {
  const isLoading = draft.status === "loading";
  const isError = draft.status === "error";
  const bodyText = isError
    ? "앞 문맥이 조금 더 필요합니다."
    : draft.text.trim()
      ? draft.text
      : "이어 쓰는 중...";

  const stop = (event: React.MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  return (
    <div className="absolute z-40 max-w-[min(420px,calc(100%-16px))]" style={{ left: anchor.left, top: anchor.top }} data-inline-continue-widget="true">
      <div
        className={cx(
          "flex w-fit max-w-full items-start gap-1.5 rounded-md border px-2 py-1 text-[12px] leading-relaxed shadow-sm",
          isError
            ? "border-red-400/40 bg-red-500/10 text-red-300"
            : "border-primary/30 bg-primary/10 text-txt"
        )}
      >
        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">
          <Sparkles size={10} />
          AI
        </span>
        <span
          className={cx(
            "max-h-28 min-w-0 overflow-y-auto break-words border-b border-dashed pr-1",
            isError ? "border-red-400/50" : "border-primary/50"
          )}
        >
          {bodyText}
        </span>
        {isLoading ? <Loader2 size={12} className="shrink-0 animate-spin text-primary" /> : null}
        {draft.status === "ready" ? (
          <button
            type="button"
            title="이어쓰기 수락"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => stop(event, onAccept)}
            className="grid h-5 w-5 shrink-0 place-items-center rounded bg-primary text-white transition-colors hover:brightness-110"
          >
            <Check size={12} />
          </button>
        ) : null}
        <button
          type="button"
          title={isLoading ? "이어쓰기 중단" : "이어쓰기 취소"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => stop(event, onCancel)}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-txt"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

const InlineContinueDraftExtension = Extension.create({
  name: "inlineContinueDraft",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: InlineContinueDraftKey,
        state: {
          init(): ContinueSuggestionState | null {
            return null;
          },
          apply(tr, previous): ContinueSuggestionState | null {
            const meta = tr.getMeta(InlineContinueDraftKey) as InlineContinueDraftMeta | undefined;
            if (meta?.type === "clear") return null;
            if (meta?.type === "set") return meta.draft;
            if (!previous) return null;
            if (!tr.docChanged) return previous;

            const mapped = tr.mapping.mapResult(previous.insertPos, 1);
            if (mapped.deleted) return null;
            return {
              ...previous,
              insertPos: Math.min(mapped.pos, tr.doc.content.size),
            };
          },
        },
      }),
    ];
  },
});

function BubbleToolbar({
  editor,
  noteId,
  onAiAction,
  popoverOpenRef,
}: {
  editor: Editor;
  noteId: string;
  onAiAction: (type: AiActionType, text: string) => void;
  popoverOpenRef: React.MutableRefObject<boolean>;
}) {
  const getSelectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  }, [editor]);

  const [rewriteSuggestion, setRewriteSuggestion] = useState<RewriteSuggestionState | null>(null);
  const rewriteRequestIdRef = useRef(0);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const rewritePanelOpen = rewriteSuggestion !== null;

  useEffect(() => {
    if (!rewritePanelOpen) return;
    popoverOpenRef.current = true;
    return () => { popoverOpenRef.current = false; };
  }, [rewritePanelOpen, popoverOpenRef]);

  useEffect(() => {
    return () => rewriteAbortRef.current?.abort();
  }, []);

  const requestRewrite = useCallback(async (saved?: RewriteSuggestionState) => {
    const range = saved?.range ?? { from: editor.state.selection.from, to: editor.state.selection.to };
    if (range.from === range.to) return;

    const originalPlainText = saved?.originalPlainText ?? selectedText(editor, range);
    if (!originalPlainText.trim()) return;

    const selectedMarkdown = saved?.selectedMarkdown ?? (serializeRangeAsMarkdown(editor, range) || originalPlainText);

    const rawContext = saved
      ? { contextBefore: saved.contextBefore, contextAfter: saved.contextAfter }
      : inlineContext(editor, range);
    const context = buildInlineAssistContext({
      task: "editor.rewrite",
      selectedText: saved?.selectedMarkdown ?? selectedMarkdown,
      contextBefore: rawContext.contextBefore,
      contextAfter: rawContext.contextAfter,
    });
    const requestId = rewriteRequestIdRef.current + 1;
    rewriteRequestIdRef.current = requestId;
    rewriteAbortRef.current?.abort();
    const sufficiency = validateAiContextSufficiency("editor.rewrite", context);
    if (!sufficiency.ok) {
      setRewriteSuggestion({
        status: "error",
        requestId,
        range,
        originalPlainText,
        selectedMarkdown: context.selectedText || selectedMarkdown,
        contextBefore: context.contextBefore,
        contextAfter: context.contextAfter,
        text: "",
        message: sufficiency.message,
      });
      return;
    }
    const controller = new AbortController();
    rewriteAbortRef.current = controller;

    setRewriteSuggestion({
      status: "loading",
      requestId,
      range,
      originalPlainText,
      selectedMarkdown: context.selectedText || selectedMarkdown,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      text: "",
    });

    let streamedText = "";
    try {
      const done = await createInlineAssistStream(
        {
          noteId,
          selectedText: context.selectedText || selectedMarkdown,
          contextBefore: context.contextBefore,
          contextAfter: context.contextAfter,
          action: "REWRITE",
          language: "ko",
        },
        {
          signal: controller.signal,
          onDelta: (text) => {
            streamedText += text;
            setRewriteSuggestion((current) =>
              current?.requestId === requestId
                ? { ...current, status: "loading", text: streamedText }
                : current
            );
          },
        }
      );
      if (!done) throw new Error("AI 다시쓰기 완료 이벤트를 받지 못했습니다.");

      setRewriteSuggestion((current) =>
        current?.requestId === requestId
          ? {
              status: "ready",
              requestId,
              range,
              originalPlainText,
              selectedMarkdown: context.selectedText || selectedMarkdown,
              contextBefore: context.contextBefore,
              contextAfter: context.contextAfter,
              text: streamedText,
              suggestionId: done.suggestionId,
              modelId: done.modelId,
            }
          : current
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setRewriteSuggestion((current) =>
        current?.requestId === requestId
          ? {
              status: "error",
              requestId,
              range,
              originalPlainText,
              selectedMarkdown: context.selectedText || selectedMarkdown,
              contextBefore: context.contextBefore,
              contextAfter: context.contextAfter,
              text: streamedText,
              message: messageFromUnknown(error),
            }
          : current
      );
    }
  }, [editor, noteId]);

  const acceptRewrite = useCallback(async () => {
    if (!rewriteSuggestion || rewriteSuggestion.status !== "ready") return;
    const currentText = selectedText(editor, rewriteSuggestion.range);
    if (currentText !== rewriteSuggestion.originalPlainText) {
      setRewriteSuggestion({
        ...rewriteSuggestion,
        status: "error",
        message: "선택 영역이 변경되어 제안을 적용할 수 없습니다.",
        suggestionId: rewriteSuggestion.suggestionId,
      });
      return;
    }

    insertMarkdownContent(editor, rewriteSuggestion.range, rewriteSuggestion.text);
    setRewriteSuggestion(null);
    decideAiSuggestion(rewriteSuggestion.suggestionId, { decision: "ACCEPTED" }).catch((error) => {
      console.warn("Failed to record accepted AI suggestion.", error);
    });
  }, [editor, rewriteSuggestion]);

  const rejectRewrite = useCallback(() => {
    const suggestionId = rewriteSuggestion?.status === "ready" || rewriteSuggestion?.status === "error"
      ? rewriteSuggestion.suggestionId
      : undefined;
    setRewriteSuggestion(null);
    if (suggestionId) {
      decideAiSuggestion(suggestionId, { decision: "REJECTED" }).catch((error) => {
        console.warn("Failed to record rejected AI suggestion.", error);
      });
    }
  }, [rewriteSuggestion]);

  const regenerateRewrite = useCallback(() => {
    if (!rewriteSuggestion) return;
    const suggestionId = rewriteSuggestion.status === "ready" || rewriteSuggestion.status === "error"
      ? rewriteSuggestion.suggestionId
      : undefined;
    if (suggestionId) {
      decideAiSuggestion(suggestionId, { decision: "REGENERATED" }).catch((error) => {
        console.warn("Failed to record regenerated AI suggestion.", error);
      });
    }
    void requestRewrite(rewriteSuggestion);
  }, [requestRewrite, rewriteSuggestion]);

  const [recentTextColors, setRecentTextColors] = useState<string[]>([]);
  const [recentHighlights, setRecentHighlights] = useState<string[]>([]);
  const pushRecent = (list: string[], value: string) => [value, ...list.filter((v) => v !== value)].slice(0, 4);

  const currentTextColor = (editor.getAttributes("textStyle").color as string) ?? null;
  const currentHighlight = (editor.getAttributes("highlight").color as string) ?? null;
  const rewritePreviewHtml =
    rewriteSuggestion && rewriteSuggestion.status !== "error" && rewriteSuggestion.text.trim()
      ? markdownToHtml(rewriteSuggestion.text)
      : null;

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

      <LinkPopover editor={editor} popoverOpenRef={popoverOpenRef} />

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

      <FontPopover editor={editor} />

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

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
      <div className="relative">
        <BubbleBtn
          active={rewritePanelOpen}
          disabled={rewriteSuggestion?.status === "loading"}
          onClick={() => void requestRewrite()}
          title="AI로 다시쓰기"
        >
          {rewriteSuggestion?.status === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
        </BubbleBtn>
        {rewriteSuggestion ? (
          <div
            className="absolute right-0 top-full z-50 mt-1.5 w-[320px] overflow-hidden rounded-lg border border-line/60 p-2.5"
            style={{ background: "rgb(var(--surface))", boxShadow: "0 10px 28px -6px rgba(2,6,23,0.48)" }}
          >
            <div className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-txt2">
              <Wand2 size={13} className="text-primary" />
              <span className="flex-1">AI 다시쓰기 제안</span>
              {rewriteSuggestion.status === "ready" ? (
                <span className="rounded bg-surface2/70 px-1.5 py-0.5 text-[10.5px] text-txt3">{rewriteSuggestion.modelId}</span>
              ) : null}
            </div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-line/40 bg-surface2/30 px-2.5 py-2 text-[12.5px] leading-relaxed text-txt2">
              {rewriteSuggestion.status === "error" ? (
                <span className="text-red-400">{rewriteSuggestion.message}</span>
              ) : rewritePreviewHtml ? (
                <div className="tiptap-note-content" dangerouslySetInnerHTML={{ __html: rewritePreviewHtml }} />
              ) : (
                <span className="text-txt3">다시 쓰는 중...</span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5">
              {rewriteSuggestion.status === "ready" ? (
                <>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={regenerateRewrite}
                    className="grid h-7 w-7 place-items-center rounded-md text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt"
                    title="다시 생성"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={rejectRewrite}
                    className="grid h-7 w-7 place-items-center rounded-md text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt"
                    title="거절"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void acceptRewrite()}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:brightness-110"
                  >
                    <Check size={13} />
                    수락
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={rejectRewrite}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-semibold text-txt3 transition-colors hover:bg-surface2/70 hover:text-txt"
                >
                  <X size={13} />
                  닫기
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CursorContinueButton({
  onRequest,
}: {
  onRequest: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="AI로 이어쓰기"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRequest}
      title="AI로 이어쓰기"
      className="group inline-flex h-7 items-center gap-1 rounded-full border border-line/60 bg-surface/95 px-1.5 text-[11px] font-semibold text-txt3 opacity-80 shadow-sm transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
    >
      <Sparkles size={13} className="shrink-0 text-primary" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-150 group-hover:max-w-14 group-hover:opacity-100 group-focus-visible:max-w-14 group-focus-visible:opacity-100">
        이어쓰기
      </span>
    </button>
  );
}

/* ── 공통 Editor Extensions ────────────────────────────────────────────
   PaneLeafView마다 동일한 extensions 배열을 새로 만들면 StarterKit이 내장한
   link/underline과 별도 import가 다시 섞여 "Duplicate extension names" 경고가
   재발하기 쉽다. 모든 인스턴스가 이 단일 배열을 공유하도록 모듈 스코프에 한 번만
   정의한다. (link/underline은 StarterKit 내장분만 사용) */
class BrainXTableView extends TableView {
  private editorView?: EditorView;
  private gripHandle: HTMLButtonElement;

  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes: Record<string, unknown> = {}
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    // columnResizing plugin은 View 생성 시 extension의 HTMLAttributes를 넘기지 않는다.
    // 표 스타일 계약이 리사이즈 활성화 여부에 따라 사라지지 않도록 NodeView가 직접 보장한다.
    this.table.classList.add("note-table");
    this.editorView = view;
    this.syncDisplayAttributes(node);

    // 표 전체 선택용 그립 핸들 — border-collapse라 표 안에는 셀이 아닌 픽셀이 없어서("표
    // 테두리"가 시각적으로만 존재하고 실제로는 항상 어떤 셀의 border) 테두리를 직접 클릭하는
    // 방식은 신뢰할 수 없다(실측: 클릭 좌표가 항상 셀로 hit-test됨). 대신 Notion처럼 표
    // 좌상단에 hover 시 나타나는 작은 그립을 두고, 클릭 시 그 좌표 아래의 표를 찾아
    // NodeSelection으로 선택한다 — TableToolbar의 updateAnchor와 동일한 "좌표 → posAtCoords →
    // 조상에서 table 탐색" 패턴을 재사용한다.
    this.gripHandle = document.createElement("button");
    this.gripHandle.type = "button";
    this.gripHandle.contentEditable = "false";
    this.gripHandle.title = "표 전체 선택";
    this.gripHandle.className = "note-table-grip";
    this.gripHandle.innerHTML =
      '<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><circle cx="1.5" cy="1.5" r="1.2" fill="currentColor"/><circle cx="7.5" cy="1.5" r="1.2" fill="currentColor"/><circle cx="1.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>';
    this.gripHandle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ev = this.editorView;
      if (!ev) return;
      // 그립이 표 모서리 바로 바깥에 떠 있어 클릭 좌표 자체로 hit-test하면 표 밖(앞 문단)으로
      // 잡힐 수 있다 — 항상 표 영역 안쪽의 한 점(좌상단에서 4px 들어간 지점)을 기준으로
      // posAtCoords를 조회해 어떤 표인지를 신뢰성 있게 찾는다.
      const rect = this.table.getBoundingClientRect();
      const coords = ev.posAtCoords({ left: rect.left + 4, top: rect.top + 4 });
      if (!coords) return;
      const $pos = ev.state.doc.resolve(coords.pos);
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === "table") {
          const tablePos = $pos.before(d);
          ev.dispatch(ev.state.tr.setSelection(NodeSelection.create(ev.state.doc, tablePos)));
          ev.focus();
          break;
        }
      }
    });
    this.dom.style.position = "relative";
    this.dom.appendChild(this.gripHandle);
  }

  update(node: ProseMirrorNode) {
    const updated = super.update(node);
    if (updated) this.syncDisplayAttributes(node);
    return updated;
  }

  /* 표 전체가 NodeSelection으로 선택되면(그립 클릭) PM이 호출 — outline으로 표시한다.
     Backspace/Delete는 별도 키맵 없이 tiptap 기본 Keymap의 deleteSelection이 처리한다(NodeSelection은
     selection.empty가 false라 deleteSelection이 그대로 표 노드를 지운다). */
  selectNode() {
    this.table.dataset.nodeSelected = "true";
  }

  deselectNode() {
    delete this.table.dataset.nodeSelected;
  }

  destroy() {
    this.gripHandle.remove();
  }

  private syncDisplayAttributes(node: ProseMirrorNode) {
    this.table.dataset.align = String(node.attrs.align ?? "center");
    const widthMode = (String(node.attrs.widthMode ?? "fit") as BlockWidthMode);
    this.table.dataset.widthMode = widthMode;
    this.table.dataset.tableColor = String(node.attrs.tableColor ?? "default");
    this.table.dataset.borderWidth = String(node.attrs.borderWidth ?? 1);

    if (widthMode === "fit" || widthMode === "original") {
      // 두 모드는 순수 CSS([data-width-mode] 선택자, globals.css)로 처리된다 — 인라인
      // 스타일이 남아 있으면 그게 우선 적용되어 충돌하므로 비워둔다.
      this.table.style.width = "";
      this.table.style.minWidth = "";
      return;
    }

    // 비율 프리셋/사용자 지정은 "원본(자연) 폭" 기준으로 계산해야 한다(컨테이너 폭 기준
    // 계산이 이번 수정의 대상 버그였다). 표는 <img>의 naturalWidth 같은 고정값이 없으므로,
    // 이미 검증되어 있는 "원본" 모드와 동일한 CSS 상태(max-content)로 한 프레임 동안
    // 강제했다가 scrollWidth로 그 폭을 읽는다 — 강제→측정→복원이 같은 동기 구간에서 끝나
    // 화면에 중간 상태가 그려지지 않는다(레이아웃만 강제될 뿐 paint는 일어나지 않음).
    const prevWidth = this.table.style.width;
    const prevMinWidth = this.table.style.minWidth;
    this.table.style.width = "max-content";
    this.table.style.minWidth = "max-content";
    const naturalPx = this.table.scrollWidth;
    this.table.style.width = prevWidth;
    this.table.style.minWidth = prevMinWidth;

    const widthPercent = (node.attrs.widthPercent as number | null) ?? null;
    const percent = blockWidthPercent(widthMode, widthPercent);
    const targetPx = naturalPx * (percent / 100);
    this.table.style.width = `${targetPx}px`;
    this.table.style.minWidth = `${targetPx}px`;
  }
}

const BrainXTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-align") ?? "center",
        renderHTML: (attrs) => ({ "data-align": String(attrs.align ?? "center") }),
      },
      widthMode: {
        default: "fit",
        parseHTML: (el) => el.getAttribute("data-width-mode") ?? "fit",
        renderHTML: (attrs) => ({ "data-width-mode": String(attrs.widthMode ?? "fit") }),
      },
      widthPercent: {
        default: null,
        parseHTML: (el) => {
          const value = el.getAttribute("data-width-percent");
          return value ? Number(value) : null;
        },
        renderHTML: (attrs) => attrs.widthPercent
          ? { "data-width-percent": String(attrs.widthPercent) }
          : {},
      },
      tableColor: {
        default: "default",
        parseHTML: (el) => el.getAttribute("data-table-color") ?? "default",
        renderHTML: (attrs) => ({ "data-table-color": String(attrs.tableColor ?? "default") }),
      },
      borderWidth: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-border-width")) || 1,
        renderHTML: (attrs) => ({ "data-border-width": String(attrs.borderWidth ?? 1) }),
      },
    };
  },
}).configure({
  resizable: true,
  View: BrainXTableView,
  HTMLAttributes: { class: "note-table" },
  // prosemirror-tables의 tableEditing()은 기본적으로(false) 표 노드 자체의 NodeSelection을
  // 항상 CellSelection으로 정규화해버린다 — 그립 클릭으로 만든 NodeSelection이 dispatch
  // 직후 appendTransaction에서 도로 CellSelection으로 바뀌어 selectNode()가 전혀 호출되지
  // 않는 문제였다(실측 확인). true로 켜면 표 전체 NodeSelection이 그대로 유지된다.
  allowTableNodeSelection: true,
});

/** 셀 단위 배경색·정렬 — 표 전체(BrainXTable) 색과 별개로, 선택한 셀(들)에만 적용된다.
    TableCell/TableHeader 둘 다 같은 속성 세트가 필요해 공통 팩토리로 둔다. */
function cellDisplayAttributes() {
  return {
    cellBackground: {
      default: "none",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-cell-bg") ?? "none",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.cellBackground && attrs.cellBackground !== "none"
          ? { "data-cell-bg": String(attrs.cellBackground) }
          : {},
    },
    cellAlign: {
      default: "left",
      parseHTML: (el: HTMLElement) => el.getAttribute("data-cell-align") ?? "left",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.cellAlign && attrs.cellAlign !== "left"
          ? { "data-cell-align": String(attrs.cellAlign) }
          : {},
    },
  };
}

const BrainXTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellDisplayAttributes() };
  },
});

const BrainXTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellDisplayAttributes() };
  },
});

const NOTE_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    codeBlock: false,
    // 기본 Heading은 "#"+공백을 지워버리는 input rule을 쓴다(라이브 프리뷰와 상충) — 아래
    // MarkdownHeading(이 "#"를 실제 텍스트로 유지)으로 대체한다.
    heading: false,
    // protocols 기본 허용 목록(http/https/mailto 등)에는 brainx-note:// 같은 커스텀 스킴이
    // 없어서 기본 검증을 통과하지 못해 setLink가 조용히 실패한다(LinkPopover의 노트 연결
    // 기능, INTERNAL_LINK_PREFIX) — 추가해줘야 내부 노트 링크가 실제로 적용된다.
    link: { openOnClick: false, autolink: false, protocols: ["http", "https", "mailto", "tel", "brainx-note"] },
    // StarterKit(tiptap v3)이 기본 포함하는 TrailingNode 확장은 "문서의 마지막 노드가 단락이
    // 아니면 빈 단락을 자동으로 덧붙인다"(표/이미지 뒤에 클릭할 자리를 만들어주는 용도) —
    // 그런데 heading은 글을 쓰는 동안 거의 항상 "마지막 노드"이므로, "# "/슬래시 명령으로 헤딩을
    // 만들 때마다 그 직후에 보이지 않는 빈 단락이 끼어들어 헤딩 다음 줄 배치가 한 줄 더
    // 밀려 보이는 원인이었다(HeadingLevelSync/라이브 프리뷰 자체와는 무관). heading을
    // notAfter에 추가해 "헤딩 다음에는 자동으로 빈 단락을 추가하지 않음"으로 좁히고,
    // 표/이미지 등 다른 블록 뒤의 기존 동작은 그대로 둔다.
    trailingNode: { notAfter: ["heading"] },
  }),
  MarkdownHeading.configure({ levels: [...SUPPORTED_HEADING_LEVELS] }),
  HeadingLevelSync,
  InlineContinueDraftExtension,
  MarkdownLivePreview,
  MarkdownCodeFenceEnter,
  HeadingMarkerEdit,
  HeadingFold,
  TextStyle,
  Color,
  FontSize,
  FontFamily,
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
        // ── Mermaid 전용 표시 옵션(언어가 mermaid가 아니면 무시됨) ──
        align: {
          default: "center",
          parseHTML: (el) => el.getAttribute("data-align") ?? "center",
          renderHTML: (attrs) => ({ "data-align": String(attrs.align ?? "center") }),
        },
        widthMode: {
          default: "fit",
          parseHTML: (el) => el.getAttribute("data-width-mode") ?? "fit",
          renderHTML: (attrs) => ({ "data-width-mode": String(attrs.widthMode ?? "fit") }),
        },
        widthPercent: {
          default: null,
          parseHTML: (el) => {
            const v = el.getAttribute("data-width-percent");
            return v ? Number(v) : null;
          },
          renderHTML: (attrs) =>
            attrs.widthPercent ? { "data-width-percent": String(attrs.widthPercent) } : {},
        },
        preview: {
          default: true,
          parseHTML: (el) => el.getAttribute("data-preview") !== "false",
          renderHTML: (attrs) => ({ "data-preview": attrs.preview === false ? "false" : "true" }),
        },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
    addInputRules() {
      return [
        textblockTypeInputRule({
          // 대소문자 모두 허용(```Mermaid, ```MERMAID 등) — getAttributes에서 소문자로 정규화한다.
          find: /^```([a-zA-Z]+)?[\s\n]$/,
          type: this.type,
          // preview:false — 위 MarkdownCodeFenceEnter의 같은 이유로 새 블록은 항상 편집 모드로 시작.
          getAttributes: (match) => ({ language: match[1] ? match[1].toLowerCase() : null, preview: false }),
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
        // Escape → 코드블록 밖으로 커서 이동 (마지막 블록이면 paragraph 삽입).
        // Mermaid 코드블록이면 포커스를 빼면서 동시에 다이어그램 보기로 전환한다 — 문법
        // 오류가 있어도 전환 자체는 그대로 진행하고(오류 표시는 보기 상태의 MermaidPreview가
        // 담당), 일반 코드블록은 language가 mermaid가 아니므로 이 분기를 타지 않아 기존 동작이
        // 그대로 유지된다.
        Escape: () => {
          const { state } = this.editor;
          const { $from } = state.selection;
          if ($from.parent.type.name !== "codeBlock") return false;

          if ($from.parent.attrs.language === "mermaid" && $from.parent.attrs.preview !== true) {
            const blockPos = $from.before($from.depth);
            this.editor.view.dispatch(
              this.editor.state.tr.setNodeMarkup(blockPos, undefined, { ...$from.parent.attrs, preview: true })
            );
          }

          // setNodeMarkup은 attrs만 바꾸고 문서 크기를 바꾸지 않으므로, 갱신된 state에서도
          // 같은 절대 위치가 그대로 유효하다 — 그 최신 state를 기준으로 포커스를 이동한다.
          const freshState = this.editor.state;
          const $pos = freshState.selection.$from;
          // $pos.depth: codeBlock 내부 depth(보통 1), after(depth)로 codeBlock 끝 다음 위치
          const afterPos = $pos.after($pos.depth);
          if (afterPos < freshState.doc.content.size) {
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
    addProseMirrorPlugins() {
      // Esc는 명시적인 키 입력이 있을 때만 동작한다 — "포커스 아웃되면 자동으로 다이어그램
      // 보기로 전환"(본문/제목/다른 블록/다른 노트 클릭 등 Esc 없이 선택이 떠나는 모든 경우)은
      // 별도로 다뤄야 한다. appendTransaction은 "이 트랜잭션이 적용된 직후, 필요하면 보정
      // 트랜잭션을 하나 더 붙이는" ProseMirror 표준 메커니즘이라 selectionUpdate 시점마다
      // 직접 dispatch를 호출하는 것보다 안전하다(같은 트랜잭션 배치 안에서 처리됨).
      const mermaidAutoPreview = new Plugin({
        key: new PluginKey("mermaidAutoPreview"),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;

          // "편집 중이던 mermaid 블록"을 트랜잭션 전(oldState) 선택 위치의 조상에서만 찾으면,
          // </> 버튼 클릭(mousedown에 preventDefault가 걸려 있어 selection이 그 블록으로 전혀
          // 옮겨가지 않음)이나 다이어그램 더블클릭(텍스트 위치로 매핑되지 않을 수 있음)으로
          // 편집을 시작한 경우 oldState.selection이 처음부터 그 블록 밖에 있어서 못 찾는다.
          // 대신 oldState 문서 전체에서 이미 preview:false인 mermaid 블록을 전부 찾고, 이번
          // 트랜잭션 이후 그 블록이 선택 범위 밖으로 벗어났는지를 위치 기준으로 직접 판정한다
          // — 선택이 그 블록을 거쳐 갔는지 여부와 무관하게 항상 정확하게 잡힌다.
          const openBlocks: { pos: number }[] = [];
          oldState.doc.descendants((node, pos) => {
            if (node.type.name === "codeBlock" && node.attrs.language === "mermaid" && node.attrs.preview === false) {
              openBlocks.push({ pos });
            }
          });
          if (openBlocks.length === 0) return null;

          let tr: typeof newState.tr | null = null;
          for (const { pos } of openBlocks) {
            // 문서 변경으로 위치가 옮겨졌을 수 있으니 mapping으로 보정한 뒤, 그 위치가 여전히
            // 유효한 mermaid 코드블록인지 한 번 더 확인한다(삭제됐을 수도 있음).
            let mappedPos = pos;
            for (const t of transactions) mappedPos = t.mapping.map(mappedPos);
            const nodeAtMapped = newState.doc.nodeAt(mappedPos);
            if (!nodeAtMapped || nodeAtMapped.type.name !== "codeBlock") continue;
            if (nodeAtMapped.attrs.language !== "mermaid" || nodeAtMapped.attrs.preview !== false) continue;

            // 이 블록의 범위 안에 트랜잭션 후 selection이 여전히 걸쳐 있으면(같은 블록 안에서
            // 타이핑/커서 이동) 그대로 두고, 벗어났을 때만 보기 모드로 되돌린다.
            const from = mappedPos;
            const to = mappedPos + nodeAtMapped.nodeSize;
            const sel = newState.selection;
            if (sel.from >= from && sel.to <= to) continue;

            tr = (tr ?? newState.tr).setNodeMarkup(mappedPos, undefined, { ...nodeAtMapped.attrs, preview: true });
          }
          return tr;
        },
      });
      return [mermaidAutoPreview];
    },
  }).configure({
    lowlight,
    exitOnTripleEnter: true,
    exitOnArrowDown: true,
  }),
  ImageBlock,
  PdfBlock,
  HtmlBlock,
  ColumnList,
  Column,
  DragHandle,
  BrainXTable,
  TableRow,
  BrainXTableHeader,
  BrainXTableCell,
  WikiLink,
  WikiLinkSuggestion,
  TagNode,
  TagSuggestion,
  TaskList,
  TaskItem.configure({ nested: true }),
  TaskListMarkdownBridge,
  SlashCommandSuggestion,
];

export type InlineDraftSession = {
  contextBefore: string;
  contextAfter: string;
  appendDelta: (text: string) => void;
  commit: (text: string) => void;
  rollback: () => void;
};

type ActiveInlineDraftSession = {
  from: number;
  to: number;
  active: boolean;
};

export interface NoteEditorHandle {
  focusStart: () => void;
  focusEnd: () => void;
  flushPendingSave: () => void;
  getHTML: () => string;
  startInlineDraftSession: () => InlineDraftSession | null;
  /** 패널 레벨(EditorPanel.tsx)의 항상-보이는 삽입 버튼이 호출한다 — 본문 안에 버튼을 두면
      노트 길이에 따라 스크롤해야 보이는 위치에 가는 버그가 있었음(고정 위치 버튼은 패널
      기준으로 둬야 함). */
  insertImageFile: (file: File) => void;
  insertImageUrl: (src: string) => void;
  insertTable: (rows: number, cols: number) => void;
  /** 우측 목차(RightSidebar) 클릭 → 해당 heading으로 스크롤. index는 parseHeadings가 매긴
      문서 순서(0-based, heading id "h-{index}")와 동일한 기준이라 그대로 재사용할 수 있다. */
  scrollToHeading: (index: number) => void;
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

function CustomBubbleMenu({
  editor,
  noteId,
  onAiAction,
}: {
  editor: Editor;
  noteId: string;
  onAiAction: (type: AiActionType, text: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<BubbleAnchor | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  /* LinkPopover의 "노트 연결" 검색창처럼 버블 툴바 안에 실제 입력 포커스가 필요한 하위
     팝오버가 떠 있는 동안은, 그 입력에 포커스가 가면서 에디터 밖으로 선택이 옮겨가도(=
     네이티브 selection 소유권이 사라짐) 툴바 전체가 사라지면 안 된다 — 아래 `settling`과
     같은 자리에서 함께 체크한다(기존 선택 보존 로직 확장, 변경 아님). */
  const popoverOpenRef = useRef(false);

  const updateAnchor = useCallback(() => {
    // 제목 input 안에서 드래그가 진행 중이면 이 본문 에디터의 selection/버블메뉴 상태를
    // 전혀 건드리지 않는다 — 제목은 제목 컴포넌트 내부에서 독립적으로 selection/focus를
    // 관리해야 하고, 본문 쪽 로직(여기)이 그 사이에 끼어들면 안 된다(EditorPanel.tsx의 제목
    // input mousedown이 켜고, window capture 단계 mouseup에서 끈다).
    if (titleDragGuard.active) return;
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

    // 드래그 중(mousedown~mouseup) 그리고 드래그가 막 끝난 직후(mouseup~SETTLE_MS)에는 native
    // selection이 일시적으로 collapse될 수 있다 — ① 드래그 도중에는 마우스 경로가 대각선으로
    // 두 블록(예: 문단→헤딩)을 가로지를 때 중간 보간 지점이 일시적으로 anchor와 같은 위치로
    // hit-test되어 한두 프레임 collapse처럼 보일 수 있고(Playwright로 실제 재현됨), ② mouseup
    // 직후에는 브라우저의 mouseup 처리 자체에서 비동기로 한 번 더 collapse가 발생할 수 있다
    // (prosemirror-view의 domObserver가 우리보다 먼저 'selectionchange'를 가로채 동기적으로
    // 반영해버리므로 이 collapse는 가로채서 막을 수 없다, 위 `MarkdownLivePreview` Plugin의
    // `view()` 주석 참고). 두 경우 모두 collapse 자체를 막는 대신, 그 기간 동안은 "collapse처럼
    // 보여도 숨기지 않는다" — 마지막으로 그려진 위치를 그대로 유지해 hide→show 깜빡임이 한 번도
    // 일어나지 않게 한다. `dragging`은 마우스를 누르고 있는 동안(클릭이든 드래그든) 항상 켜져
    // 있지만, 짧은 클릭이라면 mouseup 시점에 바로 보호가 해제되므로(아래 Plugin의 onMouseUp,
    // `wasRealDrag` 분기 참고) 클릭으로 선택을 해제하는 동작과는 충돌하지 않는다.
    const livePreviewState = LivePreviewKey.getState(editor.state);
    const settling = (livePreviewState?.dragging || livePreviewState?.settling) ?? false;

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
        // anchor가 확실히 이 에디터 바깥에 있다 — settling(이 에디터 "자기 자신"의 드래그가
        // 남긴 잔여 collapse를 무시하기 위한 보호)을 여기서도 적용하면 안 된다. anchor가
        // 다른 곳이면 "다른 곳에서 새로운 선택이 시작됐다"는 확실한 신호이므로 즉시
        // 숨겨야 한다. settling을 이 분기에도 걸어두면, 직전 드래그(이 패널 안에서의 진짜
        // 드래그)의 150ms settle 구간과 겹쳐서 전혀 무관한 새 선택(예: 제목 영역 드래그,
        // 다른 패널 드래그)이 시작돼도 이 패널의 버블 메뉴가 안 사라지는 버그가 있었다
        // (제목을 드래그하면 다른 패널까지 선택이 이어지는 것처럼 보이던 문제의 원인).
        if (popoverOpenRef.current) return;
        setAnchor(null);
        return;
      }
      if (editor.isActive("codeBlock")) {
        setAnchor(null);
        return;
      }
      if (sel.isCollapsed) {
        if (popoverOpenRef.current) return;
        const cursor = safeCoordsAtPos(editor.view, editor.state.selection.from, 1);
        setAnchor((current) =>
          settling && current?.kind === "selection"
            ? current
            : { ...cursor, bottom: cursor.bottom, kind: "cursor" }
        );
        return;
      }
      const nextAnchor = rangeToAnchorRect(sel.getRangeAt(0));
      setAnchor(nextAnchor ? { ...nextAnchor, kind: "selection" } : null);
      return;
    }

    // 네이티브 selection 정보를 전혀 얻을 수 없는 경우(거의 발생하지 않음)에만 ProseMirror
    // 내부 selection으로 판단한다.
    const { from, to } = editor.state.selection;
    if (from === to || editor.isActive("codeBlock")) {
      if (editor.isActive("codeBlock")) {
        setAnchor(null);
        return;
      }
      const cursor = safeCoordsAtPos(editor.view, from, 1);
      setAnchor((current) =>
        settling && current?.kind === "selection"
          ? current
          : { ...cursor, bottom: cursor.bottom, kind: "cursor" }
      );
      return;
    }
    if (editor.isActive("codeBlock")) {
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
      kind: "selection",
    });
  }, [editor]);

  useEffect(() => {
    // 팝오버(LinkPopover의 노트 검색 입력 등) 안의 input에 포커스를 줄 때도 에디터 blur가
    // 발생하는데, 그 동안은 무시해야 한다 — 위 updateAnchor의 settling/popoverOpenRef 분기와
    // 동일한 이유.
    const handleBlur = () => { if (!popoverOpenRef.current) setAnchor(null); };
    editor.on("focus", updateAnchor);
    editor.on("selectionUpdate", updateAnchor);
    editor.on("transaction", updateAnchor);
    editor.on("blur", handleBlur);
    editor.view.dom.addEventListener("click", updateAnchor);
    editor.view.dom.addEventListener("keyup", updateAnchor);
    editor.view.dom.addEventListener("mouseup", updateAnchor);
    // 패널 밖으로 드래그가 나가는 동안에는 ProseMirror가 "selectionUpdate"/"transaction"을
    // 전혀 못 쏠 수 있으므로(내부 selection이 갱신되지 않음), 브라우저 자체의 selectionchange를
    // 직접 들어서 네이티브 selection 기준으로도 항상 재계산을 시도한다.
    document.addEventListener("selectionchange", updateAnchor);
    return () => {
      // editor.off(event)를 콜백 없이 호출하면 그 이벤트의 리스너가 전부 삭제된다(tiptap-core
      // EventEmitter 구현) — useEditor의 onBlur(setFocused(false))도 같은 "blur" 이벤트를
      // 쓰므로, 반드시 이 핸들러 참조만 지정해서 떼어내야 다른 리스너를 건드리지 않는다.
      editor.off("focus", updateAnchor);
      editor.off("selectionUpdate", updateAnchor);
      editor.off("transaction", updateAnchor);
      document.removeEventListener("selectionchange", updateAnchor);
      editor.view.dom.removeEventListener("click", updateAnchor);
      editor.view.dom.removeEventListener("keyup", updateAnchor);
      editor.view.dom.removeEventListener("mouseup", updateAnchor);
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
      let top = anchor.top - rect.height + 0;
    if (top < margin) top = anchor.bottom + 10; // 위쪽 공간이 부족하면 선택 영역 아래로
    setPos({ left, top });
  }, [anchor]);

  // 표 안에서는 이 일반 버블 툴바를 띄우지 않는다 — 행/열/셀 작업 위에 별도로 떠 있는
  // TableToolbar가 이제 서식(Bold/Italic/Strike/색상)·정렬·삭제까지 전부 통합해서 보여준다
  // (TableToolbar.tsx 참고). 두 툴바가 동시에 떠서 겹치던 문제를 "표 안에서는 툴바 하나만"
  // 원칙으로 해결한 것 — 표 밖에서는 기존과 동일하게 동작한다.
  if (!anchor || editor.isActive("table") || anchor.kind === "cursor") return null;

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
      <BubbleToolbar editor={editor} noteId={noteId} onAiAction={onAiAction} popoverOpenRef={popoverOpenRef} />
    </div>,
    document.body
  );
}

/** 본문이 비어있고 포커스되지 않았을 때만 보이는 안내 문구 — placeholder처럼 동작 */
const EDITOR_HINT_TEXT =
  "# 제목 · - 목록 · > 인용 · **굵게** · `코드` · ``` 코드블록 · ```mermaid 다이어그램 · ![](url) 이미지 · 텍스트 선택 → 버블 툴바";

/** Notion S3 presigned URL(X-Amz-Expires 파라미터)이 포함된 이미지가 있으면 true.
    가져오기 중 이미지 다운로드에 실패해 원본 URL로 폴백된 경우에만 해당하며, 1시간 후 만료된다. */
function hasExpiringNotionImages(content: string): boolean {
  return content.includes("X-Amz-Expires");
}

interface NoteEditorProps {
  note: MockNote;
  mode: EditMode;
  /** 워크스페이스 전체 노트에서 수집된 고유 태그 목록 — `#` 자동완성에 사용 */
  allTags: readonly string[];
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
  { note, mode, allTags, onActivate, onContentChange, onAiAction },
  ref
) {
  const contentSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const continueAbortRef = useRef<AbortController | null>(null);
  const continueRequestIdRef = useRef(0);
  const inlineDraftSessionRef = useRef<ActiveInlineDraftSession | null>(null);
  const cursorAiIdleTimerRef = useRef<number | null>(null);
  const suppressInlineContinueAutoRejectRef = useRef(false);
  const lastInlineContinueDraftRef = useRef<ContinueSuggestionState | null>(null);
  const syncedNoteIdRef = useRef(note.id);
  const [isEmpty, setIsEmpty] = useState(() => note.content.trim() === "");
  const [focused, setFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState<EditorContextTarget | null>(null);
  const [showExpiringBanner, setShowExpiringBanner] = useState(() => hasExpiringNotionImages(note.content));

  useEffect(() => {
    setShowExpiringBanner(hasExpiringNotionImages(note.content));
  }, [note.id, note.content]);
  const [cursorAiAnchor, setCursorAiAnchor] = useState<{ left: number; top: number } | null>(null);
  const [continueDraftView, setContinueDraftView] = useState<ContinueSuggestionState | null>(null);
  const [continueDraftAnchor, setContinueDraftAnchor] = useState<{ left: number; top: number } | null>(null);
  const wikiCtx = useWikiLinkContext();

  /* 내부 노트 링크(LinkPopover에서 만든 brainx-note://<id> href) 클릭 처리 — 읽기 모드는
     바로 이동, 편집 모드는 Ctrl/Cmd+클릭만 이동(평범한 클릭은 커서 위치/편집을 위해 남겨둠).
     일반 외부 링크(http 등)는 기존처럼 openOnClick:false라 아무 동작도 하지 않는다(그대로 유지). */
  const handleInternalLinkClick = useCallback((e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest?.("a[href^='" + INTERNAL_LINK_PREFIX + "']") as HTMLAnchorElement | null;
    if (!anchor || !wikiCtx) return false;
    if (mode === "edit" && !(e.metaKey || e.ctrlKey)) return false;
    const noteId = anchor.getAttribute("href")!.slice(INTERNAL_LINK_PREFIX.length);
    const target = wikiCtx.notes.find((n) => n.id === noteId);
    if (!target) return false;
    e.preventDefault();
    e.stopPropagation();
    wikiCtx.onNavigate(target.title);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wikiCtx]);

  const editor = useEditor({
    extensions: NOTE_EDITOR_EXTENSIONS,
    content: resolveEditorHtml(note.content),
    immediatelyRender: false,
    // Table의 columnResizing plugin은 생성 시점의 isEditable을 한 번만 읽는다. 항상 등록되게
    // true로 생성하고, 아래 layout effect에서 실제 탭 mode를 첫 paint 전에 적용한다.
    editable: true,
    editorProps: {
      attributes: {
        spellcheck: "false",
        autocomplete: "off",
        translate: "no",
      },
      // 클립보드에 이미지 파일이 있을 때만 가로채 이미지 블록으로 삽입한다 — 이미지가 아닌
      // 일반 텍스트/HTML 붙여넣기는 false를 반환해 tiptap의 기본 처리를 그대로 따른다.
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((file) => insertImageBlockFromFile(view, file));
        return true;
      },
      // 표 테두리/래퍼 영역(셀 내부가 아닌 곳) 클릭 → 표 전체를 NodeSelection으로 선택한다.
      // handleClickOn은 클릭 좌표가 속한 모든 조상 노드에 대해 안쪽→바깥쪽 순서로 호출되므로,
      // 셀 안을 클릭해도 결국 그 조상인 table에 대해서도 호출된다 — 그래서 node.type만으로는
      // "셀 안 클릭"과 "표 테두리 클릭"을 구분할 수 없고, 실제 클릭된 DOM(event.target)이
      // td/th 내부인지로 판정해야 한다. 셀 안이면 false를 반환해 기존 커서 배치/선택 동작을
      // 그대로 둔다.
      handleClickOn: (view, pos, node, nodePos, event) => {
        if (node.type.name !== "table") return false;
        const target = event.target as HTMLElement | null;
        if (target?.closest("td, th")) return false;
        const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos));
        view.dispatch(tr);
        return true;
      },
      // 사이드바 노트 드래그(EditorPanel의 dragPayload 오버레이)는 이 핸들러와 무관하게
      // 별도의 absolute 오버레이가 이벤트를 먼저 가로채므로 충돌하지 않는다 — 여기서는 OS
      // 파일 탐색기 등에서 끌어온 실제 이미지 파일(event.dataTransfer.files)만 처리한다.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // 에디터 내부 노드 이동(드래그) — 기본 동작 유지
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const pos = coords?.pos ?? view.state.selection.from;
        files.forEach((file) => insertImageBlockFromFile(view, file, pos));
        return true;
      },
    },
    onFocus: () => setFocused(true),
    // 본문 안에서 다른 위치로 선택이 옮겨가는 경우는 CodeBlockLowlight의 mermaidAutoPreview
    // appendTransaction이 처리하지만, 포커스가 에디터 DOM 밖으로 완전히 나가는 경우(제목 클릭,
    // 다른 노트/탭 클릭, 사이드바 클릭 등)는 selection 자체가 안 바뀌어 그 훅이 못 잡는다 —
    // blur 시점에 한 번 더 직접 확인해 다이어그램 보기로 되돌린다.
    // 현재 selection의 조상에서만 mermaid 블록을 찾으면 </> 버튼 클릭(mousedown에
    // preventDefault가 걸려 있어 selection이 그 블록으로 옮겨가지 않음)이나 다이어그램
    // 더블클릭으로 편집을 시작한 직후에는 selection이 그 블록 밖에 있어 못 찾는다 — 위
    // appendTransaction과 동일하게 문서 전체에서 preview:false인 mermaid 블록을 전부 찾아
    // 되돌린다(selection 경로와 무관하게 항상 정확히 잡힌다).
    onBlur: ({ editor: ed }) => {
      setFocused(false);
      const openPositions: number[] = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === "codeBlock" && node.attrs.language === "mermaid" && node.attrs.preview === false) {
          openPositions.push(pos);
        }
      });
      if (openPositions.length === 0) return;
      let tr = ed.state.tr;
      for (const pos of openPositions) {
        const node = tr.doc.nodeAt(pos);
        if (node) tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, preview: true });
      }
      ed.view.dispatch(tr);
      // blur가 "다른 노트 클릭"으로 일어난 경우, 곧바로 note.id가 바뀌면서 아래 [note.id, editor]
      // effect가 contentSyncTimerRef를 그냥 clearTimeout만 하고(flush 없이) 새 노트 내용으로
      // 덮어쓴다 — 그 사이 400ms 디바운스가 아직 안 끌렸으면 방금 되돌린 preview:true가 notes
      // state에 저장되지 못한 채 사라져, 그 노트를 다시 열면 코드 편집 상태로 보이는 문제가
      // 있었다. 이 보정만큼은 디바운스를 기다리지 않고 즉시 저장한다.
      if (contentSyncTimerRef.current) {
        clearTimeout(contentSyncTimerRef.current);
        contentSyncTimerRef.current = null;
      }
      onContentChange(note.id, ed.getHTML());
    },
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

  const rollbackInlineDraftSession = useCallback((session: ActiveInlineDraftSession | null) => {
    if (!editor || !session?.active) return;
    session.active = false;
    if (inlineDraftSessionRef.current === session) inlineDraftSessionRef.current = null;
    const from = Math.min(session.from, editor.state.doc.content.size);
    const to = Math.min(Math.max(from, session.to), editor.state.doc.content.size);
    if (to > from) {
      editor.chain().focus().insertContentAt({ from, to }, "").run();
    }
  }, [editor]);

  const startInlineDraftSession = useCallback((): InlineDraftSession | null => {
    if (!editor || mode !== "edit" || !editor.isEditable) return null;

    rollbackInlineDraftSession(inlineDraftSessionRef.current);

    const insertPos = Math.min(editor.state.selection.from, editor.state.doc.content.size);
    editor.chain().focus().setTextSelection(insertPos).run();
    const context = buildInlineAssistContext({
      task: "editor.draft",
      contextBefore: serializeRangeAsMarkdown(editor, {
        from: Math.max(0, insertPos - AI_CONTEXT_AROUND_CURSOR_CHARS),
        to: insertPos,
      }),
      contextAfter: serializeRangeAsMarkdown(editor, {
        from: insertPos,
        to: Math.min(editor.state.doc.content.size, insertPos + AI_CONTEXT_AROUND_CURSOR_CHARS),
      }),
    });
    const session: ActiveInlineDraftSession = { from: insertPos, to: insertPos, active: true };
    inlineDraftSessionRef.current = session;

    return {
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      appendDelta: (text) => {
        if (!editor || !session.active || inlineDraftSessionRef.current !== session || !text) return;
        const pos = Math.min(session.to, editor.state.doc.content.size);
        editor.view.dispatch(editor.state.tr.insertText(text, pos, pos));
        session.to = editor.state.selection.from;
      },
      commit: (text) => {
        if (!editor || !session.active || inlineDraftSessionRef.current !== session) return;
        if (!text.trim()) {
          rollbackInlineDraftSession(session);
          return;
        }
        session.active = false;
        inlineDraftSessionRef.current = null;
        const from = Math.min(session.from, editor.state.doc.content.size);
        const to = Math.min(Math.max(from, session.to), editor.state.doc.content.size);
        insertMarkdownContent(editor, { from, to }, text);
      },
      rollback: () => {
        rollbackInlineDraftSession(session);
      },
    };
  }, [editor, mode, rollbackInlineDraftSession]);

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
    getHTML: () => editor?.getHTML() ?? "",
    startInlineDraftSession,
    insertImageFile: (file) => {
      if (!editor) return;
      insertImageBlockFromFile(editor.view, file);
    },
    insertImageUrl: (src) => {
      editor?.chain().focus().setImageBlock({ src }).run();
    },
    insertTable: (rows, cols) => {
      editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },
    scrollToHeading: (index) => {
      if (!editor) return;
      // parseHeadings(RightSidebar.tsx)와 같은 문서 순서 기준 — 별도 id/anchor를 새로 만드는
      // 대신 실제 렌더된 heading 엘리먼트를 순서대로 찾는다(DOM 쿼리가 ProseMirror position
      // 계산보다 read/edit 모드 양쪽에서 더 단순하고 안정적이다).
      const target = editor.view.dom.querySelectorAll("h1, h2, h3")[index] as HTMLElement | undefined;
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      target.classList.remove("brainx-heading-flash");
      // 같은 heading을 연속으로 다시 클릭해도 애니메이션이 재생되도록 강제로 리플로우시킨다.
      void target.offsetWidth;
      target.classList.add("brainx-heading-flash");
      window.setTimeout(() => target.classList.remove("brainx-heading-flash"), 900);
    },
  }), [editor, note.id, onContentChange, startInlineDraftSession]);

  const requestInlineContinue = useCallback(async () => {
    if (!editor) return;

    const existing = getInlineContinueDraft(editor);
    if (existing) {
      continueAbortRef.current?.abort();
      continueAbortRef.current = null;
      suppressInlineContinueAutoRejectRef.current = true;
      clearInlineContinueDraft(editor);
      const existingSuggestionId = continueSuggestionId(existing);
      if (existingSuggestionId) {
        decideAiSuggestion(existingSuggestionId, { decision: "REJECTED" }).catch((error) => {
          console.warn("Failed to record rejected AI suggestion.", error);
        });
      }
    }

    const insertPos = editor.state.selection.from;
    const context = inlineContext(editor, { from: insertPos, to: insertPos });
    const requestId = continueRequestIdRef.current + 1;
    continueRequestIdRef.current = requestId;
    continueAbortRef.current?.abort();

    const sufficiency = validateAiContextSufficiency("editor.continue", context);
    if (!sufficiency.ok) {
      setInlineContinueDraft(editor, {
        status: "error",
        requestId,
        insertPos,
        contextBefore: context.contextBefore,
        contextAfter: context.contextAfter,
        text: "",
        message: sufficiency.message,
      });
      return;
    }

    const controller = new AbortController();
    continueAbortRef.current = controller;
    setInlineContinueDraft(editor, {
      status: "loading",
      requestId,
      insertPos,
      contextBefore: context.contextBefore,
      contextAfter: context.contextAfter,
      text: "",
    });

    let streamedText = "";
    try {
      const done = await createInlineAssistStream(
        {
          noteId: note.id,
          selectedText: "",
          contextBefore: context.contextBefore,
          contextAfter: context.contextAfter,
          action: "CONTINUE",
          language: "ko",
        },
        {
          signal: controller.signal,
          onDelta: (text) => {
            streamedText += text;
            const current = getInlineContinueDraft(editor);
            if (current?.requestId !== requestId) return;
            setInlineContinueDraft(editor, { ...current, status: "loading", text: streamedText });
          },
        }
      );
      if (continueAbortRef.current === controller) continueAbortRef.current = null;
      if (!done) throw new Error("AI 이어쓰기 완료 이벤트를 받지 못했습니다.");

      const current = getInlineContinueDraft(editor);
      if (current?.requestId !== requestId) return;
      if (!streamedText.trim()) {
        setInlineContinueDraft(editor, {
          ...current,
          status: "error",
          text: "",
          message: "이어쓰기 결과가 비어 있습니다.",
          suggestionId: done.suggestionId,
        });
        return;
      }
      setInlineContinueDraft(editor, {
        ...current,
        status: "ready",
        text: streamedText,
        suggestionId: done.suggestionId,
        modelId: done.modelId,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (continueAbortRef.current === controller) continueAbortRef.current = null;
      const current = getInlineContinueDraft(editor);
      if (current?.requestId !== requestId) return;
      setInlineContinueDraft(editor, {
        ...current,
        status: "error",
        text: streamedText,
        message: messageFromUnknown(error),
      });
    }
  }, [editor, note.id]);

  const acceptInlineContinue = useCallback(() => {
    if (!editor) return;
    const draft = getInlineContinueDraft(editor);
    if (!draft || draft.status !== "ready") return;

    suppressInlineContinueAutoRejectRef.current = true;
    clearInlineContinueDraft(editor);
    const insertPos = Math.min(draft.insertPos, editor.state.doc.content.size);
    insertMarkdownContent(editor, { from: insertPos, to: insertPos }, draft.text);
    decideAiSuggestion(draft.suggestionId, { decision: "ACCEPTED" }).catch((error) => {
      console.warn("Failed to record accepted AI suggestion.", error);
    });
  }, [editor]);

  const cancelInlineContinue = useCallback(() => {
    if (!editor) return;
    const draft = getInlineContinueDraft(editor);
    continueAbortRef.current?.abort();
    continueAbortRef.current = null;
    suppressInlineContinueAutoRejectRef.current = true;
    clearInlineContinueDraft(editor);
    const suggestionId = continueSuggestionId(draft);
    if (suggestionId) {
      decideAiSuggestion(suggestionId, { decision: "REJECTED" }).catch((error) => {
        console.warn("Failed to record rejected AI suggestion.", error);
      });
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const syncInlineContinueDraft = () => {
      const current = getInlineContinueDraft(editor);
      const previous = lastInlineContinueDraftRef.current;
      const suppressed = suppressInlineContinueAutoRejectRef.current;
      if (!current && previous && !suppressed) {
        continueAbortRef.current?.abort();
        continueAbortRef.current = null;
        const suggestionId = continueSuggestionId(previous);
        if (suggestionId) {
          decideAiSuggestion(suggestionId, { decision: "REJECTED" }).catch((error) => {
            console.warn("Failed to record rejected AI suggestion.", error);
          });
        }
      }
      suppressInlineContinueAutoRejectRef.current = false;
      lastInlineContinueDraftRef.current = current;
      setContinueDraftView(current);
    };

    syncInlineContinueDraft();
    editor.on("transaction", syncInlineContinueDraft);
    return () => {
      editor.off("transaction", syncInlineContinueDraft);
    };
  }, [editor]);


  useEffect(() => {
    return () => {
      continueAbortRef.current?.abort();
      rollbackInlineDraftSession(inlineDraftSessionRef.current);
    };
  }, [rollbackInlineDraftSession]);

  useEffect(() => {
    if (!editor) return;

    const clearPendingCursorAiAnchor = () => {
      if (cursorAiIdleTimerRef.current) {
        window.clearTimeout(cursorAiIdleTimerRef.current);
        cursorAiIdleTimerRef.current = null;
      }
      setCursorAiAnchor(null);
    };

    const updateContinueDraftAnchor = () => {
      const draft = getInlineContinueDraft(editor);
      const shellRectForDraft = editorShellRef.current?.getBoundingClientRect();
      if (draft && shellRectForDraft) {
        const pos = Math.min(draft.insertPos, editor.state.doc.content.size);
        const draftCoords = safeCoordsAtPos(editor.view, pos, 1);
        const left = Math.max(
          8,
          Math.min(draftCoords.left - shellRectForDraft.left, shellRectForDraft.width - CONTINUE_DRAFT_SAFE_WIDTH)
        );
        const top = Math.max(8, draftCoords.bottom - shellRectForDraft.top + 10);
        setContinueDraftAnchor({ left, top });
      } else {
        setContinueDraftAnchor(null);
      }
    };

    const updateCursorAiAnchor = () => {
      updateContinueDraftAnchor();

      const editorHasFocus = editor.view.dom.contains(document.activeElement);
      const slashCommandOpen = SlashCommandKey.getState(editor.state)?.active ?? false;
      if (!editor.isEditable || !editorHasFocus || contextMenu || slashCommandOpen || getInlineContinueDraft(editor)) {
        clearPendingCursorAiAnchor();
        return;
      }
      if (!editor.state.selection.empty || editor.isActive("codeBlock") || editor.isActive("table")) {
        clearPendingCursorAiAnchor();
        return;
      }

      const shellRect = editorShellRef.current?.getBoundingClientRect();
      if (!shellRect) {
        clearPendingCursorAiAnchor();
        return;
      }
      const coords = safeCoordsAtPos(editor.view, editor.state.selection.from, 1);
      const context = inlineContext(editor, {
        from: editor.state.selection.from,
        to: editor.state.selection.from,
      });
      if (context.contextBefore.trim().length < AI_CONTEXT_MIN_CONTINUE_BEFORE_CHARS) {
        clearPendingCursorAiAnchor();
        return;
      }

      const candidateLeft = coords.right - shellRect.left + 8;
      if (candidateLeft + CONTINUE_TRIGGER_SAFE_WIDTH > shellRect.width) {
        clearPendingCursorAiAnchor();
        return;
      }

      const nextAnchor = {
        left: Math.max(8, candidateLeft),
        top: Math.max(8, coords.top - shellRect.top - 3),
      };
      if (cursorAiIdleTimerRef.current) window.clearTimeout(cursorAiIdleTimerRef.current);
      setCursorAiAnchor(null);
      cursorAiIdleTimerRef.current = window.setTimeout(() => {
        cursorAiIdleTimerRef.current = null;
        setCursorAiAnchor(nextAnchor);
      }, CONTINUE_TRIGGER_IDLE_MS);
    };
    const scheduleCursorAiAnchorUpdate = () => {
      window.requestAnimationFrame(updateCursorAiAnchor);
    };

    const handleBlur = () => {
      clearPendingCursorAiAnchor();
    };

    editor.on("focus", scheduleCursorAiAnchorUpdate);
    editor.on("selectionUpdate", updateCursorAiAnchor);
    editor.on("transaction", updateCursorAiAnchor);
    editor.on("blur", handleBlur);
    editor.view.dom.addEventListener("click", scheduleCursorAiAnchorUpdate);
    editor.view.dom.addEventListener("keyup", scheduleCursorAiAnchorUpdate);
    editor.view.dom.addEventListener("mouseup", scheduleCursorAiAnchorUpdate);
    window.addEventListener("scroll", updateCursorAiAnchor, true);
    window.addEventListener("resize", updateCursorAiAnchor);

    return () => {
      editor.off("focus", scheduleCursorAiAnchorUpdate);
      editor.off("selectionUpdate", updateCursorAiAnchor);
      editor.off("transaction", updateCursorAiAnchor);
      editor.off("blur", handleBlur);
      editor.view.dom.removeEventListener("click", scheduleCursorAiAnchorUpdate);
      editor.view.dom.removeEventListener("keyup", scheduleCursorAiAnchorUpdate);
      editor.view.dom.removeEventListener("mouseup", scheduleCursorAiAnchorUpdate);
      window.removeEventListener("scroll", updateCursorAiAnchor, true);
      window.removeEventListener("resize", updateCursorAiAnchor);
      if (cursorAiIdleTimerRef.current) {
        window.clearTimeout(cursorAiIdleTimerRef.current);
        cursorAiIdleTimerRef.current = null;
      }
    };
  }, [contextMenu, editor]);

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
    // setContent를 이 effect 안에서 곧바로 호출하면, 새 노트 본문에 이미지/표/코드블록처럼
    // ReactNodeViewRenderer를 쓰는 노드가 있을 때 그 NodeView가 마운트되며 ReactRenderer가
    // 내부적으로 flushSync를 호출한다 — 그게 "지금 이 React 커밋(effect 플러시)이 끝나기 전"에
    // 일어나 "flushSync was called from inside a lifecycle method" 에러가 난다. 마이크로태스크로
    // 한 틱 미뤄서 현재 커밋이 완전히 끝난 뒤에 실행되게 한다(빠르게 노트를 또 전환하면 이전
    // 마이크로태스크는 cancelled 플래그로 무시).
    let cancelled = false;
    const content = note.content;
    const noteId = note.id;
    queueMicrotask(() => {
      if (cancelled) return;
      const isSameNote = syncedNoteIdRef.current === noteId;
      const editorHasFocus = editor.view.dom.contains(document.activeElement);
      if (isSameNote && editorHasFocus) {
        setIsEmpty(editor.isEmpty);
        return;
      }
      const nextContent = resolveEditorHtml(content);
      if (editor.getHTML() !== nextContent) {
        editor.commands.setContent(nextContent);
      }
      syncedNoteIdRef.current = noteId;
      setIsEmpty(content.trim() === "");
      setFocused(false);
    });
    // editor를 deps에 포함: NoteEditor가 새로 마운트되는 시점(예: 빈 시작 탭 → 새 노트로 교체)에는
    // immediatelyRender:false로 인해 첫 렌더에서 editor가 아직 null이라 이 effect가 조기 종료되는데,
    // note.id만 의존하면 editor가 준비된 뒤에도 재실행되지 않는다.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, note.content, editor]);

  /* mode prop(탭별 읽기/편집 상태) → editable 토글. 탭 전환으로 note.id와 mode가 같은 렌더에서
     함께 바뀌어도 두 effect가 각자 최신 값으로 정확히 적용된다. */
  useLayoutEffect(() => {
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
      ref={editorShellRef}
      className={cx(
        "split-pane-editor tiptap-note-content relative",
        // .hf-btn은 globals.css의 `.split-pane-editor .ProseMirror .hf-btn { display:flex }`
        // 규칙이 이 클래스보다 specificity가 높아 일반 `hidden`으로는 안 가려진다 — `!hidden`으로
        // important를 줘서 강제로 숨긴다(실측: !important 없이는 읽기 모드에서도 display:flex로 보임).
        mode === "read" && "[&_.hf-btn]:!hidden [&_.md-heading-syntax]:hidden [&_.md-heading-syntax-hidden]:hidden [&_.split-drag-handle]:hidden"
      )}
      style={typographyCssVars(note.typography)}
      onClick={(e) => {
        if (handleInternalLinkClick(e)) return;
        if (mode === "edit") { e.stopPropagation(); onActivate(); }
      }}
      onContextMenu={(event) => {
        if (mode !== "edit" || !editor) return;
        event.preventDefault();
        event.stopPropagation();
        onActivate();
        const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        let clickedInTable = false;
        if (coords) {
          const $clicked = editor.state.doc.resolve(coords.pos);
          for (let depth = $clicked.depth; depth >= 0; depth -= 1) {
            if ($clicked.node(depth).type.name === "table") {
              clickedInTable = true;
              break;
            }
          }
          const currentSelection = editor.state.selection;
          const keepCellRange = currentSelection instanceof CellSelection
            && coords.pos >= currentSelection.from
            && coords.pos <= currentSelection.to;
          if (!keepCellRange) {
            const selection = TextSelection.near($clicked);
            editor.view.dispatch(editor.state.tr.setSelection(selection));
          }
        }
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          inTable: clickedInTable,
        });
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="이미지 파일 선택"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
        onChange={(event) => {
          Array.from(event.target.files ?? []).forEach((file) => {
            if (editor) insertImageBlockFromFile(editor.view, file);
          });
          event.target.value = "";
        }}
      />
      {editor && <CustomBubbleMenu editor={editor} noteId={note.id} onAiAction={onAiAction} />}
      {editor && mode === "edit" && cursorAiAnchor && !continueDraftView ? (
        <div
          className="absolute z-40"
          style={{ left: cursorAiAnchor.left, top: cursorAiAnchor.top }}
        >
          <CursorContinueButton onRequest={requestInlineContinue} />
        </div>
      ) : null}
      {editor && continueDraftView && continueDraftAnchor ? (
        <InlineContinueFloatingWidget
          draft={continueDraftView}
          anchor={continueDraftAnchor}
          onAccept={acceptInlineContinue}
          onCancel={cancelInlineContinue}
        />
      ) : null}
      {editor && <TableToolbar editor={editor} />}
      {editor && <WikiLinkAutocomplete editor={editor} />}
      {editor && <TagAutocomplete editor={editor} allTags={allTags} />}
      {editor && (
        <SlashCommandMenu editor={editor} onPickImage={() => fileInputRef.current?.click()} />
      )}
      {editor && contextMenu && (
        <EditorContextMenu
          target={contextMenu}
          editor={editor}
          onClose={() => setContextMenu(null)}
          onChooseImage={() => fileInputRef.current?.click()}
          onInsertImageUrl={() => {
            const url = window.prompt("이미지 URL 입력:", "https://")?.trim();
            if (url) editor.chain().focus().setImageBlock({ src: url }).run();
          }}
          onInsertTable={(rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()}
          onSplitColumns={(count) => splitBlockIntoColumns(editor, count)}
        />
      )}
      {showExpiringBanner && (
        <div className="flex items-start gap-2 mb-3 rounded-lg border border-yellow-400/40 bg-yellow-50/70 px-3 py-2 text-[12px] text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-400/25 dark:text-yellow-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-yellow-500" />
          <span className="flex-1 leading-relaxed">
            이 노트의 일부 이미지는 Notion에서 가져올 때 영구 저장에 실패해 <strong>1시간 후 만료</strong>됩니다.
            Notion에서 다시 가져오기하면 이미지를 영구 저장할 수 있습니다.
          </span>
          <button
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
            onClick={() => setShowExpiringBanner(false)}
            aria-label="닫기"
          >
            <X size={12} />
          </button>
        </div>
      )}
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
