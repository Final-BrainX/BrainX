"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { FileText, FilePlus2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { WikiLinkSuggestionKey } from "./WikiLinkSuggestion";
import { useWikiLinkContext } from "./WikiLinkContext";

interface Candidate {
  id: string;
  kind: "note" | "create";
  title: string;
}

/** `[[` 입력 시 뜨는 노트 자동완성 드롭다운. 트리거 감지(`WikiLinkSuggestion` 플러그인)와
    분리해, 후보 필터링·키보드 이동·삽입처럼 인스턴스별 데이터(노트 목록)가 필요한 부분은
    전부 여기 React 쪽에서 처리한다. `CustomBubbleMenu`와 같은 위치 계산(`coordsAtPos` +
    `createPortal(document.body)`) 패턴을 그대로 따른다. */
export function WikiLinkAutocomplete({ editor }: { editor: Editor }) {
  const ctx = useWikiLinkContext();
  const [state, setState] = useState(() => WikiLinkSuggestionKey.getState(editor.state) ?? null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setState(WikiLinkSuggestionKey.getState(editor.state) ?? null);
    editor.on("transaction", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("transaction", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const active = state?.active ?? false;
  const range = state?.range ?? null;
  const query = state?.query ?? "";

  const candidates: Candidate[] = (() => {
    if (!ctx || !active) return [];
    const q = query.trim().toLowerCase();
    const matches = q ? ctx.notes.filter((n) => n.title.toLowerCase().includes(q)) : ctx.notes;
    const list: Candidate[] = matches.slice(0, 8).map((n) => ({ id: n.id, kind: "note", title: n.title }));
    const exact = matches.some((n) => n.title.toLowerCase() === q);
    if (q.trim() && !exact) list.push({ id: `create:${query.trim().toLowerCase()}`, kind: "create", title: query.trim() });
    return list;
  })();

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, active]);

  useLayoutEffect(() => {
    if (!active || !range) {
      setPos(null);
      return;
    }
    try {
      const coords = editor.view.coordsAtPos(range.from);
      setPos({ left: coords.left, top: coords.bottom + 4 });
    } catch {
      setPos(null);
    }
  }, [active, range, editor]);

  const commit = useCallback(
    (candidate: Candidate) => {
      if (!range) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .insertWikiLink({ title: candidate.title })
        .run();
      if (candidate.kind === "create") ctx?.onCreate(candidate.title);
    },
    [editor, range, ctx]
  );

  // 키보드 네비게이션 — ProseMirror가 Enter/ArrowUp/ArrowDown을 자체 커맨드로 먼저 처리해버리기
  // 전에 capture 단계에서 가로챈다. 이 에디터 자신의 DOM에만 리스너를 달아 Split View의 다른
  // 패널에는 영향이 없다.
  useEffect(() => {
    if (!active || candidates.length === 0) return;
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, candidates.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        const target = candidates[selectedIndex];
        if (target) {
          e.preventDefault();
          e.stopPropagation();
          commit(target);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        editor.view.dispatch(editor.state.tr.setMeta(WikiLinkSuggestionKey, "close"));
      }
    };
    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [active, candidates, selectedIndex, commit, editor]);

  if (!active || !pos || candidates.length === 0) return null;

  return createPortal(
    <div
      ref={listRef}
      style={{
        position: "fixed",
        left: Math.max(4, Math.min(pos.left, window.innerWidth - 244)),
        top: pos.top,
        zIndex: 2100,
        width: 240,
      }}
      className="overflow-hidden rounded-lg border border-line/60 py-1"
    >
      <div style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}>
        {candidates.map((c, idx) => (
          <button
          key={`${c.kind}-${c.id}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(c)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={cx(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors",
              idx === selectedIndex ? "bg-primary/12 text-primary" : "text-txt2 hover:bg-surface2/60 hover:text-txt"
            )}
          >
            {c.kind === "note" ? (
              <FileText size={12} className="shrink-0 text-txt3" />
            ) : (
              <FilePlus2 size={12} className="shrink-0 text-orange-400" />
            )}
            <span className="flex-1 truncate">
              {c.kind === "create" ? <>새 노트 만들기 &ldquo;{c.title}&rdquo;</> : c.title}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
