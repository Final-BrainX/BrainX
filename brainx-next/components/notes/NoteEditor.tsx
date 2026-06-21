"use client";

import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Extension, textblockTypeInputRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { Link2, Highlighter, Sparkles, Wand2, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Table, TableRow, TableHeader, TableCell, TableView } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { cx } from "@/lib/utils";
import { MockNote } from "@/lib/notes/noteTypes";
import { HeadingFold } from "./headingFold";
import { CodeBlockView } from "./CodeBlockView";
import { QuickSwatchRow, MoreColorPopover, TEXT_COLOR_QUICK, HIGHLIGHT_SWATCHES } from "./ColorPalette";
import { ImageBlock, insertImageBlockFromFile } from "./ImageBlockNode";
import { blockWidthPercent, type BlockAlign, type BlockWidthMode } from "./BlockControls";
// 표를 쓰지 않는 노트에서는 이 작은 플로팅 툴바조차 메인 청크에 묶이지 않도록 분리한다.
// Table/TableCell 등 TipTap extension 자체는 그대로 유지(동적 등록은 사이드 이펙트 위험이
// 커서 시도하지 않음) — 여기서 지연시키는 건 순수 React UI뿐이다.
const TableToolbar = dynamic(() => import("./TableToolbar").then((mod) => mod.TableToolbar), {
  ssr: false,
});
import { activeCellAttrs, updateSelectedCellsAttrs } from "./tableUtils";
import EditorContextMenu, { type EditorContextTarget } from "./EditorContextMenu";
import { lowlight } from "./lowlightSetup";

export type EditMode = "read" | "edit";
export type AiActionType = "summarize" | "rewrite";

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

/** 표 안에서 텍스트/셀을 선택했을 때 뜨는 전용 버블 툴바. 일반 BubbleToolbar는 형광펜·AI
    동작까지 포함해 표 안에서는 과한 기능이라 별도로 둔다 — Bold/Italic/Strike/글자색/정렬만
    제공한다(형광펜 제외는 요청 사항). 셀 정렬은 단일 셀 텍스트 선택뿐 아니라 드래그로 만든
    다중 셀 CellSelection에도 동작하도록 TableToolbar와 같은 updateSelectedCellsAttrs를 쓴다. */
function TableBubbleToolbar({ editor }: { editor: Editor }) {
  const currentTextColor = (editor.getAttributes("textStyle").color as string) ?? null;
  const cellAlign = activeCellAttrs(editor).align;

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
      <BubbleBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선">
        <span className="text-[13px] leading-none line-through">S</span>
      </BubbleBtn>

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

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
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
      />

      <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />

      {(["left", "center", "right"] as BlockAlign[]).map((a) => (
        <BubbleBtn
          key={a}
          active={cellAlign === a}
          onClick={() => updateSelectedCellsAttrs(editor, { cellAlign: a })}
          title={a === "left" ? "셀 왼쪽 정렬" : a === "center" ? "셀 가운데 정렬" : "셀 오른쪽 정렬"}
        >
          {a === "left" ? <AlignLeft size={13} /> : a === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
        </BubbleBtn>
      ))}
    </div>
  );
}

/* ── 공통 Editor Extensions ────────────────────────────────────────────
   PaneLeafView마다 동일한 extensions 배열을 새로 만들면 StarterKit이 내장한
   link/underline과 별도 import가 다시 섞여 "Duplicate extension names" 경고가
   재발하기 쉽다. 모든 인스턴스가 이 단일 배열을 공유하도록 모듈 스코프에 한 번만
   정의한다. (link/underline은 StarterKit 내장분만 사용) */
class BrainXTableView extends TableView {
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
    this.syncDisplayAttributes(node);
  }

  update(node: ProseMirrorNode) {
    const updated = super.update(node);
    if (updated) this.syncDisplayAttributes(node);
    return updated;
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
  ImageBlock,
  BrainXTable,
  TableRow,
  BrainXTableHeader,
  BrainXTableCell,
];

export interface NoteEditorHandle {
  focusStart: () => void;
  focusEnd: () => void;
  flushPendingSave: () => void;
  /** 패널 레벨(EditorPanel.tsx)의 항상-보이는 삽입 버튼이 호출한다 — 본문 안에 버튼을 두면
      노트 길이에 따라 스크롤해야 보이는 위치에 가는 버그가 있었음(고정 위치 버튼은 패널
      기준으로 둬야 함). */
  insertImageFile: (file: File) => void;
  insertImageUrl: (src: string) => void;
  insertTable: (rows: number, cols: number) => void;
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
        if (settling) return; // 잔여 collapse 가능성 — 마지막 위치 유지, 숨기지 않음
        setAnchor(null);
        return;
      }
      if (sel.isCollapsed || editor.isActive("codeBlock")) {
        if (settling && sel.isCollapsed) return; // 잔여 collapse — 마지막 위치 유지
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
      if (settling && from === to) return; // 잔여 collapse — 마지막 위치 유지
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
      {editor.isActive("table") ? (
        <TableBubbleToolbar editor={editor} />
      ) : (
        <BubbleToolbar editor={editor} onAiAction={onAiAction} />
      )}
    </div>,
    document.body
  );
}

/** 본문이 비어있고 포커스되지 않았을 때만 보이는 안내 문구 — placeholder처럼 동작 */
const EDITOR_HINT_TEXT =
  "# 제목 · - 목록 · > 인용 · **굵게** · `코드` · ``` 코드블록 · ```mermaid 다이어그램 · ![](url) 이미지 · 텍스트 선택 → 버블 툴바";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEmpty, setIsEmpty] = useState(() => note.content.trim() === "");
  const [focused, setFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState<EditorContextTarget | null>(null);

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
      className="split-pane-editor tiptap-note-content relative"
      onClick={(e) => { if (mode === "edit") { e.stopPropagation(); onActivate(); } }}
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
      {editor && <CustomBubbleMenu editor={editor} onAiAction={onAiAction} />}
      {editor && <TableToolbar editor={editor} />}
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
        />
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
