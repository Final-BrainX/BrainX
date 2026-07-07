"use client";

import { Node, mergeAttributes, InputRule, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ResolvedPos } from "@tiptap/pm/model";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import React, { useEffect, useRef, useState } from "react";

const TOGGLE_SUMMARY_PLACEHOLDER = "토글";
/* 새로 만든 형제 토글의 제목 입력창에 자동으로 포커스를 주기 위한 신호 — 마운트 시 1회만 소비된다. */
const AUTO_FOCUS_ATTR = "autoFocusSummary";
/* Backspace로 토글 밖 ↔ 제목 사이를 오갈 때(addKeyboardShortcuts, ProseMirror 레벨)가 이 이벤트를
   쏘고, 같은 pos를 가진 ToggleNodeView(React 레벨, 제목은 문서 content가 아니라 여기서만 관리)가
   받아서 제목 편집 모드로 되돌아간다 — 두 세계(문서 content ↔ NodeView 로컬 상태) 사이의 다리.
   editor.view.dom(이 에디터 인스턴스 자신)에만 쏘고 들어서 화면분할 중 다른 패널과 섞이지 않는다. */
const FOCUS_TITLE_EVENT = "brainx-toggle-focus-title";

/* ── React 뷰 컴포넌트 ────────────────────────────────── */

function ToggleNodeView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const isOpen = (node.attrs.open as boolean) ?? true;
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<string>((node.attrs.summary as string) ?? "");
  const summary = (node.attrs.summary as string) ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  /* 최신 summary를 ref로도 들고 있는다 — FOCUS_TITLE_EVENT 리스너가 이 값을 읽을 때 deps 배열에
     summary를 넣지 않아도 되게 하기 위함(아래 두 번째 useEffect 참고). */
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  /* focusTitleInput()이 요청한 caret 위치 — 아래 useEffect(focusRequest 의존)가 커밋 이후에 실제
     focus()/setSelectionRange()를 수행할 때 참조한다. */
  const pendingCaretRef = useRef<"start" | "end">("end");
  const [focusRequest, setFocusRequest] = useState(0);

  const toggleOpen = () => updateAttributes({ open: !isOpen });

  /* 제목 입력창을 열고 실제 브라우저 포커스까지 가져온다. caret이 "start"면 맨 앞(위/앞에서 내려온
     경우), "end"(기본값)면 맨 뒤(아래/뒤에서 올라온 경우, 또는 Backspace로 되돌아온 경우)에 둔다.
     setTimeout으로 포커스를 미루면 React가 실제로 <input>을 커밋하기 전에 실행될 수 있어(레이스,
     실제 확인됨 — inputRef.current가 null인 채로 실행됨) focus가 씹히는 문제가 있었다. 대신
     focusRequest를 증가시켜 아래 useEffect가 "이 컴포넌트의 커밋이 끝난 뒤"(React가 보장하는
     시점)에 focus를 수행하게 한다 — editingSummary가 이미 true였던 경우(예: 이미 편집 중인 제목에
     다시 caret만 옮기는 경우)에도 focusRequest 값 자체가 매번 바뀌므로 effect가 반드시 재실행된다. */
  const focusTitleInput = (draft: string, caret: "start" | "end" = "end") => {
    setSummaryDraft(draft);
    setEditingSummary(true);
    pendingCaretRef.current = caret;
    setFocusRequest((n) => n + 1);
  };

  useEffect(() => {
    if (focusRequest === 0) return;
    // insertContentAt로 막 삽입된 형제 토글처럼, 같은 트랜잭션에서 다른 상태 변경(예: 이전
    // 토글의 setEditingSummary(false))과 겹치는 경우 inputRef.current가 이미 DOM에서 떨어져나간
    // (isConnected === false) 엘리먼트를 가리킬 때가 실제로 있다 — ReactNodeViewRenderer가 이
    // 토글 삽입 트랜잭션 처리 중 이 NodeView를 한 번 더 재구성하면서, React ref가 방금 떨어져나간
    // 이전 인스턴스의 <input>을 붙든 채로 effect가 실행되는 경우가 확인됨(실제 재현 — hasEl:true,
    // isConnected:false인데 같은 클래스의 "연결된" <input>이 DOM에 따로 존재). 그래서 React ref를
    // 신뢰하는 대신, ProseMirror가 이 노드의 현재 포지션에 대해 실제로 붙들고 있는 DOM을
    // view.nodeDOM(pos)로 직접 조회해 항상 "지금 화면에 있는" 엘리먼트를 찾는다. requestAnimationFrame은
    // 백그라운드/비활성 탭에서 아예 멈출 수 있어(재현 확인됨 — 첫 시도 이후 콜백이 전혀 안 옴)
    // setTimeout으로 짧게 재시도한다. */
    let attempts = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const tryFocus = () => {
      const pos = typeof getPos === "function" ? getPos() : undefined;
      const nodeDom = typeof pos === "number" ? editor.view.nodeDOM(pos) : null;
      const container = nodeDom instanceof HTMLElement ? nodeDom : null;
      const el = container?.querySelector<HTMLInputElement>(".brainx-toggle__summary-input") ?? null;
      if (el && el.isConnected) {
        el.focus();
        const p = pendingCaretRef.current === "start" ? 0 : el.value.length;
        el.setSelectionRange(p, p);
        return;
      }
      attempts += 1;
      if (attempts >= 10) return;
      timerId = setTimeout(tryFocus, 16);
    };
    tryFocus();
    return () => {
      if (timerId !== null) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  /* 화살표 키로 제목 ↔ 이웃 블록을 이동한다(Notion처럼 토글도 일반 블록처럼 화살표로 지나갈 수
     있어야 함). 제목은 문서 content가 아닌 별도 <input>이라 ProseMirror의 커서 이동이 알지 못하므로,
     여기서 "이 토글의 앞/뒤에 뭐가 있는지"를 직접 계산해서 옮겨준다. */
  const moveToPreviousBlock = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const indexInParent = $pos.index();
    if (indexInParent === 0) return; // 이 레벨에 이전 형제가 없음 — 문서 시작 등, 그대로 둔다
    const prevSibling = parent.child(indexInParent - 1);
    const prevPos = pos - prevSibling.nodeSize;
    if (prevSibling.type.name === "toggleNode") {
      if (prevSibling.attrs.open) {
        // 펼쳐진 토글이면 본문 마지막 줄 끝으로 — 접힌 토글일 때만 제목으로 간다
        const doc = editor.state.doc;
        const $near = doc.resolve(Math.max(0, pos - 1));
        const sel = Selection.near($near, -1);
        editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
        editor.view.focus();
        return;
      }
      editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: prevPos, caret: "end" } }));
      return;
    }
    // 일반 블록 → 그 블록의 끝(텍스트 마지막)으로 커서를 옮긴다
    const $end = editor.state.doc.resolve(prevPos + prevSibling.nodeSize - 1);
    editor.chain().focus().setTextSelection($end.pos).run();
  };

  const moveToNextBlockOrBody = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    if (isOpen) {
      // 펼쳐진 상태면 본문 첫 줄 맨 앞으로 이동
      editor.chain().focus().setTextSelection(pos + 2).run();
      return;
    }
    const currentNode = editor.state.doc.nodeAt(pos);
    if (!currentNode) return;
    const afterPos = currentNode ? pos + currentNode.nodeSize : pos;
    const $after = editor.state.doc.resolve(Math.min(afterPos, editor.state.doc.content.size));
    const nextNode = $after.nodeAfter;
    if (!nextNode) return; // 문서 끝
    if (nextNode.type.name === "toggleNode") {
      editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: afterPos, caret: "start" } }));
      return;
    }
    editor.chain().focus().setTextSelection(afterPos + 1).run();
  };

  const getCurrentToggleNode = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return null;
    return editor.state.doc.nodeAt(pos);
  };

  const isStructurallyEmptyToggle = () => {
    const current = getCurrentToggleNode();
    if (!current || current.childCount !== 1) return false;
    const onlyChild = current.firstChild;
    return !!onlyChild && onlyChild.type.name === "paragraph" && onlyChild.content.size === 0;
  };

  const focusToggleBodyStart = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    if (!isOpen) {
      updateAttributes({ open: true });
    }
    setTimeout(() => {
      editor.chain().focus().setTextSelection(pos + 2).run();
    }, 0);
  };

  /* 방금 Enter로 생성된 형제 토글이면 마운트 직후 곧바로 제목 편집 모드로 연다(Notion처럼 다음 줄에
     새 토글이 생기자마자 바로 타이핑할 수 있게). 1회성 신호라 소비 즉시 attrs에서 지운다. */
  useEffect(() => {
    if (node.attrs[AUTO_FOCUS_ATTR]) {
      focusTitleInput("");
      // updateAttributes를 마운트 effect에서 곧바로 호출하면 ReactNodeViewRenderer가 내부적으로
      // 쓰는 flushSync가 "렌더링 중 flushSync 호출" 경고를 일으킨다(React가 이 컴포넌트를 막
      // 커밋하는 도중이라). 다음 매크로태스크로 미뤄서 커밋이 끝난 뒤에 반영한다.
      const timer = setTimeout(() => updateAttributes({ [AUTO_FOCUS_ATTR]: false }), 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Backspace로 토글 밖 ↔ 제목 사이를 오갈 때 이 토글이 대상이면 제목 편집 모드로 복귀한다.
     summaryRef를 쓰므로 deps를 항상 []로 고정할 수 있다(다른 effect와 deps 배열 길이를 맞춰,
     ReactNodeViewRenderer 환경에서 나던 "useEffect deps 배열 크기가 렌더마다 다르다" React 경고를
     피한다). 이벤트는 ProseMirror 키보드 단축키 처리(=React가 관리하는 keydown) 도중 동기적으로
     dispatch되므로, 여기서 곧바로 setState를 하면 "렌더링 중 flushSync 호출" 에러가 났었다 —
     setTimeout으로 한 틱 미뤄 현재 커밋이 끝난 뒤에 안전하게 반영한다. */
  useEffect(() => {
    const target = editor.view.dom;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pos: number; caret?: "start" | "end" }>).detail;
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number" || detail.pos !== pos) return;
      setTimeout(() => {
        focusTitleInput(summaryRef.current, detail.caret ?? "end");
      }, 0);
    };
    target.addEventListener(FOCUS_TITLE_EVENT, handler);
    return () => target.removeEventListener(FOCUS_TITLE_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 토글을 일반 문단으로 되돌린다(제목이 비어있는 상태에서 Enter/Backspace 공통 처리).
     제목 <input>은 문서 content가 아니라 별도 DOM 엘리먼트라, tr.setSelection만으로는 ProseMirror의
     "내부" selection 모델만 바뀔 뿐 실제 브라우저 포커스는 그대로 input(곧 사라질) 쪽에 남아있다 —
     그래서 토글은 사라졌는데 커서가 살아있지 않은(바로 타이핑이 안 되는) 문제가 있었다.
     트랜잭션 적용 후 editor.commands.focus(pos)로 실제 DOM 포커스까지 에디터로 가져온다. input이
     언마운트되는 렌더가 끝난 다음 프레임에 실행해, 언마운트 중인 input의 blur 핸들러와 겹치지 않게 한다. */
  const convertToParagraph = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    const applied = editor
      .chain()
      .command(({ tr }) => {
        const current = tr.doc.nodeAt(pos);
        if (!current) return false;
        tr.replaceWith(pos, pos + current.nodeSize, editor.schema.nodes.paragraph.create());
        return true;
      })
      .run();
    if (!applied) return;
    setTimeout(() => {
      editor.commands.focus(pos + 1);
    }, 0);
  };

  /* 제목에서 Enter → (Notion처럼) 토글 밖으로 나가거나 본문으로 이동하는 게 아니라, 바로 아래에
     같은 레벨의 새 토글을 하나 더 만든다. 제목이 비어있으면 대신 일반 문단으로 되돌린다. */
  const handleSummaryEnter = () => {
    const trimmed = summaryDraft.trim();

    if (trimmed === "") {
      if (isStructurallyEmptyToggle()) {
        setEditingSummary(false);
        convertToParagraph();
        return;
      }
      setEditingSummary(false);
      setSummaryDraft("");
      updateAttributes({ summary: "" });
      focusToggleBodyStart();
      return;
    }

    setEditingSummary(false);
    updateAttributes({ summary: trimmed });
    setSummaryDraft(trimmed);

    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    const currentNode = editor.state.doc.nodeAt(pos);
    if (!currentNode) return;
    const insertPos = pos + currentNode.nodeSize;
    editor
      .chain()
      .insertContentAt(insertPos, {
        type: "toggleNode",
        // Enter로 이어서 만드는 다음 토글은 접힌 상태로 시작한다(제목만 빠르게 연달아 입력하는
        // 리스트형 흐름 — 본문을 열어둔 채로 시작하면 오히려 다음 줄로 밀려 헷갈린다).
        attrs: { open: false, summary: "", [AUTO_FOCUS_ATTR]: true },
        content: [{ type: "paragraph" }],
      })
      .run();
  };

  const handleSummaryBlur = () => {
    setEditingSummary(false);
    const trimmed = summaryDraft.trim();
    updateAttributes({ summary: trimmed });
    setSummaryDraft(trimmed);
  };

  /* 제목이 비어있는 상태에서 Backspace → 토글을 일반 문단으로 되돌린다.
     화살표 키: 제목은 항상 한 줄이라 Up/Down은 무조건 이웃 블록으로 이동, Left/Right는 커서가
     텍스트 맨 앞/끝에 있을 때만(선택 없이) 이웃 블록으로 넘어간다 — 그 외에는 입력창 안에서의
     기본 커서 이동을 그대로 쓴다. */
  const handleSummaryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSummaryEnter();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSummaryDraft(summary);
      setEditingSummary(false);
    } else if (e.key === "Backspace" && summaryDraft === "") {
      e.preventDefault();
      if (isStructurallyEmptyToggle()) {
        convertToParagraph();
        return;
      }
    } else if (e.key === "Delete" && summaryDraft === "") {
      if (!isStructurallyEmptyToggle()) {
        e.preventDefault();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveToPreviousBlock();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveToNextBlockOrBody();
    } else if (
      e.key === "ArrowLeft" &&
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === 0
    ) {
      e.preventDefault();
      moveToPreviousBlock();
    } else if (
      e.key === "ArrowRight" &&
      e.currentTarget.selectionStart === e.currentTarget.value.length &&
      e.currentTarget.selectionEnd === e.currentTarget.value.length
    ) {
      e.preventDefault();
      moveToNextBlockOrBody();
    }
  };

  return (
    <NodeViewWrapper as="div" className="brainx-toggle" data-open={isOpen ? "true" : "false"}>
      <div className="brainx-toggle__header" contentEditable={false}>
        <button
          type="button"
          className="brainx-toggle__chevron"
          onClick={toggleOpen}
          aria-label={isOpen ? "접기" : "펼치기"}
        >
          <span className="brainx-toggle__chevron-icon" aria-hidden="true">
            {isOpen ? "▼" : "▶"}
          </span>
        </button>

        {editingSummary && editor.isEditable ? (
          <input
            ref={inputRef}
            // autoFocus를 쓰지 않는다 — 이 컴포넌트는 focusTitleInput()에서 직접 caret 위치를
            // 지정해 focus()/setSelectionRange()를 호출하는데, autoFocus의 브라우저 기본 포커스
            // 시점이 그 직후에 겹쳐서 caret이 "start"로 지정해도 다시 끝으로 밀리는 문제가 있었다.
            className="brainx-toggle__summary-input"
            value={summaryDraft}
            placeholder={TOGGLE_SUMMARY_PLACEHOLDER}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onBlur={handleSummaryBlur}
            onKeyDown={handleSummaryKeyDown}
          />
        ) : (
          <span
            className={summary ? "brainx-toggle__summary" : "brainx-toggle__summary brainx-toggle__summary--placeholder"}
            onClick={() => {
              if (!editor.isEditable) return;
              setSummaryDraft(summary);
              setEditingSummary(true);
            }}
          >
            {summary || TOGGLE_SUMMARY_PLACEHOLDER}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="brainx-toggle__content">
          <NodeViewContent as="div" />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* ── 화살표 키로 토글 경계를 넘나들기 위한 헬퍼 ──────────────
   커서가 현재 textblock 경계(줄바꿈 중간이 아니라 진짜 블록 끝/시작)에 있을 때만 호출된다.
   "토글이 직접 관련될 때만" true를 반환해 리스트/표 등 다른 중첩 구조의 화살표 이동은 건드리지
   않는다 — 안전 범위를 좁게 유지하기 위해 조상을 한 단계(문단의 바로 위 부모)만 살펴본다. */
function exitForward(editor: Editor, $from: ResolvedPos, toggleName: string): boolean {
  const depth = $from.depth;
  const parentDepth = depth - 1;
  if (parentDepth < 0) return false;
  const parent = $from.node(parentDepth);
  const indexInParent = $from.index(parentDepth);

  if (indexInParent < parent.childCount - 1) {
    // 같은 부모 안에 바로 다음 형제가 있다 — 그게 토글이면 그 제목으로, 아니면 기본 동작에 맡긴다
    const nextSibling = parent.child(indexInParent + 1);
    if (nextSibling.type.name !== toggleName) return false;
    const afterPos = $from.after(depth);
    editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: afterPos, caret: "start" } }));
    return true;
  }

  // 내가 이 부모의 마지막 자식 — 부모 자체를 벗어나야 다음 블록이 나온다. 부모가 toggleNode일
  // 때(=토글 본문 마지막 줄에서 나가는 경우)만 처리하고, 그 외(최상위 마지막 블록 등)는 그대로 둔다.
  if (parent.type.name !== toggleName) return false;
  const afterPos = $from.before(parentDepth) + parent.nodeSize;
  const doc = editor.state.doc;
  const $after = doc.resolve(Math.min(afterPos, doc.content.size));
  const nextNode = $after.nodeAfter;
  if (!nextNode) return false;

  if (nextNode.type.name === toggleName) {
    editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: afterPos, caret: "start" } }));
    return true;
  }
  editor.chain().focus().setTextSelection(afterPos + 1).run();
  return true;
}

function exitBackward(editor: Editor, $from: ResolvedPos, toggleName: string): boolean {
  const depth = $from.depth;
  const parentDepth = depth - 1;
  if (parentDepth < 0) return false;
  const parent = $from.node(parentDepth);
  const indexInParent = $from.index(parentDepth);

  if (indexInParent > 0) {
    // 같은 부모 안에 바로 이전 형제가 있다 — 그게 토글이면, 펼쳐진 상태면 본문 마지막 줄 끝으로,
    // 접힌 상태면 제목(끝)으로 이동한다. 아니면 기본 동작에 맡긴다.
    const prevSibling = parent.child(indexInParent - 1);
    if (prevSibling.type.name !== toggleName) return false;
    const beforePos = $from.before(depth);
    if (prevSibling.attrs.open) {
      const doc = editor.state.doc;
      const $near = doc.resolve(Math.max(0, beforePos - 1));
      const sel = Selection.near($near, -1);
      editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
      editor.view.focus();
      return true;
    }
    const prevPos = beforePos - prevSibling.nodeSize;
    editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: prevPos, caret: "end" } }));
    return true;
  }

  // 내가 이 부모의 첫 번째 자식 — 부모가 toggleNode일 때(=본문 첫 줄에서 나가는 경우)만 제목으로
  // 돌아가고, 그 외(최상위 첫 블록 등)는 그대로 둔다.
  if (parent.type.name !== toggleName) return false;
  const togglePos = $from.before(parentDepth);
  editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: togglePos, caret: "end" } }));
  return true;
}

/* ── TipTap Node 정의 ─────────────────────────────────── */

export const ToggleNode = Node.create({
  name: "toggleNode",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": attrs.open ? "true" : "false" }),
      },
      summary: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-summary") ?? "",
        renderHTML: (attrs) => ({ "data-summary": attrs.summary ?? "" }),
      },
      /* 문서에 저장할 필요 없는 1회성 UI 신호 — HTML로 직렬화하지 않는다 */
      [AUTO_FOCUS_ATTR]: {
        default: false,
        parseHTML: () => false,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='toggle']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView);
  },

  /* 토글 본문이 완전히 비어있을 때(자식이 빈 문단 하나뿐일 때)만 그 문단에 안내 placeholder 클래스를
     붙인다 — 일반 문서 placeholder(is-editor-empty, 문서 전체가 비었을 때만 표시)와는 별개 규칙이라
     서로 겹치지 않는다. 사용자가 입력을 시작하면(문단이 비어있지 않게 되면) 트랜잭션마다 다시 계산되어
     자동으로 사라진다. */
  addProseMirrorPlugins() {
    const pluginKey = new PluginKey("toggleNodeContentPlaceholder");
    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "toggleNode") return;
              if (node.childCount !== 1) return;
              const onlyChild = node.firstChild;
              if (!onlyChild || onlyChild.type.name !== "paragraph" || onlyChild.content.size > 0) return;
              const childPos = pos + 1;
              decorations.push(
                Decoration.node(childPos, childPos + onlyChild.nodeSize, {
                  class: "brainx-toggle__content-placeholder",
                })
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  /* Backspace 처리 — 커서가 빈 문단의 맨 앞일 때만 개입한다(내용이 있으면 기본 동작 그대로):
     - 토글 본문의 첫 번째 자식(첫 줄)이면 → 제목 편집 모드로 되돌아간다(Notion에서 본문 첫 줄
       맨 앞 Backspace가 토글 밖(제목)으로 나가는 것과 동일한 느낌).
     - 토글 본문의 두 번째 이후 자식이면서 "마지막" 자식이면 → 그 빈 줄을 지우고 토글 밖으로 나가
       새 일반 문단을 만든다(본문 중간의 빈 줄은 기본 병합 동작 그대로 사용 — 위 줄과 합쳐진다).
     - 토글 "바로 다음"에 오는 빈 문단(= 방금 빈 토글이 지워지고 남은 문단)이면 → 그 문단을 지우고
       바로 앞 토글의 제목 편집 모드로 돌아간다(커서는 제목 텍스트 끝) — 이게 없으면 Backspace를
       두 번 눌러야 이전 토글 제목 끝으로 이동했다(1번째는 기본 join이 토글 "본문" 쪽으로 커서를
       옮겨버려서, 사용자가 기대하는 "제목 끝"이 아니었음).
     제목 자체의 Backspace(비어있을 때 문단으로 변환)는 문서 content가 아니라 ToggleNodeView가
     소유한 React input이라 여기서 다루지 않는다. */
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection, schema } = state;
        const { $from, empty } = selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;

        const currentParagraph = $from.parent;
        if (currentParagraph.type.name !== "paragraph") return false;
        const isEmpty = currentParagraph.content.size === 0;

        const paragraphDepth = $from.depth;
        const parentDepth = paragraphDepth - 1;
        if (parentDepth < 0) return false;

        const parent = $from.node(parentDepth);
        const indexInParent = $from.index(parentDepth);

        /* Case A: 이 문단이 toggleNode의 자식(본문 내부)인 경우 — 첫 줄이 비어있을 때만
           제목으로 병합한다(텍스트가 있으면 기본 동작에 맡긴다, 기존 동작 유지). */
        if (parent.type.name === this.name) {
          if (!isEmpty) return false;
          const toggleNode = parent;
          const togglePos = $from.before(parentDepth);

          if (indexInParent === 0) {
            this.editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: togglePos } }));
            return true;
          }

          const isLastChild = indexInParent === toggleNode.childCount - 1;
          if (!isLastChild) return false;

          const toggleEndPos = togglePos + toggleNode.nodeSize;
          const paraStart = $from.before(paragraphDepth);
          const paraEnd = $from.after(paragraphDepth);

          return this.editor
            .chain()
            .command(({ tr }) => {
              tr.delete(paraStart, paraEnd);
              const insertAt = toggleEndPos - (paraEnd - paraStart);
              tr.insert(insertAt, schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
              return true;
            })
            .run();
        }

        /* Case B: 이 문단의 바로 앞 형제가 toggleNode인 경우 — 문단이 비어있으면(토글 뒤
           텍스트를 Backspace로 다 지운 상태) 문단을 지우고 병합하고, 텍스트가 남아있으면
           (문단 맨 앞에서 처음 누른 Backspace) 아무것도 지우지 않고 커서만 토글 쪽으로 옮긴다
           — isolating 경계 때문에 기본 동작이 이 상황에서 토글 전체를 NodeSelection으로
           선택해버려 버블 툴바가 "선택됨" 모드로 뜨는 버그가 있었다(텍스트 selection이 아닌데도
           표시됨). 앞 토글이 펼쳐져 있으면 제목이 아니라 본문 마지막 줄 끝으로 이동한다
           (exitBackward/moveToPreviousBlock과 같은 규칙 — 접혀 있을 때만 제목으로 간다). */
        if (indexInParent === 0) return false;
        const prevSibling = parent.child(indexInParent - 1);
        if (prevSibling.type.name !== this.name) return false;

        const paraStart = $from.before(paragraphDepth);
        const paraEnd = $from.after(paragraphDepth);
        const prevTogglePos = paraStart - prevSibling.nodeSize;
        const prevSiblingOpen = prevSibling.attrs.open;

        if (prevSiblingOpen) {
          const applied = this.editor
            .chain()
            .command(({ tr }) => {
              if (isEmpty) tr.delete(paraStart, paraEnd);
              const $near = tr.doc.resolve(Math.max(0, paraStart - 1));
              const sel = Selection.near($near, -1);
              tr.setSelection(sel);
              return true;
            })
            .run();
          if (applied) this.editor.view.focus();
          return applied;
        }

        if (!isEmpty) {
          this.editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: prevTogglePos } }));
          return true;
        }

        const deleted = this.editor
          .chain()
          .command(({ tr }) => {
            tr.delete(paraStart, paraEnd);
            return true;
          })
          .run();
        if (deleted) {
          this.editor.view.dom.dispatchEvent(new CustomEvent(FOCUS_TITLE_EVENT, { detail: { pos: prevTogglePos } }));
        }
        return deleted;
      },

      /* 화살표 키로 토글을 일반 블록처럼 지나갈 수 있게 한다. view.endOfTextblock()으로 "줄바꿈
         중간이 아니라 진짜 블록 경계"인지 먼저 확인해, 여러 줄짜리 문단 안에서의 평범한 화살표
         이동은 절대 건드리지 않는다. 그 다음 "지금 빠져나가려는 지점 바로 옆에 토글이 있는지"만
         확인해서, 토글과 무관한 이동(리스트/표 등 다른 중첩 구조)에는 개입하지 않고 기본 동작에
         맡긴다(exitForward/exitBackward 참고 — 토글이 직접 관련될 때만 true를 반환). */
      ArrowDown: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if (!view.endOfTextblock("down")) return false;
        return exitForward(this.editor, $from, this.name);
      },
      ArrowRight: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parentOffset !== $from.parent.content.size) return false;
        return exitForward(this.editor, $from, this.name);
      },
      ArrowUp: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if (!view.endOfTextblock("up")) return false;
        return exitBackward(this.editor, $from, this.name);
      },
      ArrowLeft: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;
        return exitBackward(this.editor, $from, this.name);
      },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\/(?:토글|toggle)\s$/,
        handler: ({ range, chain }) => {
          chain()
            .deleteRange(range)
            .insertContent({
              type: "toggleNode",
              // /토글로 만든 첫 토글은 기본적으로 접힌 상태로 시작한다(Notion과 동일).
              attrs: { open: false, summary: "", [AUTO_FOCUS_ATTR]: true },
              content: [{ type: "paragraph" }],
            })
            .run();
        },
      }),
    ];
  },
});
