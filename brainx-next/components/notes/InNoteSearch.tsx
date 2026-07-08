"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { cx } from "@/lib/utils";

interface Match {
  from: number;
  to: number;
}

function findMatches(doc: import("@tiptap/pm/model").Node, query: string): Match[] {
  const matches: Match[] = [];
  const q = query.trim().toLowerCase();
  if (!q) return matches;
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase();
      let from = 0;
      for (;;) {
        const idx = text.indexOf(q, from);
        if (idx === -1) break;
        matches.push({ from: pos + idx, to: pos + idx + q.length });
        from = idx + q.length;
      }
      return;
    }
    // 위키링크(WikiLinkNode.tsx)는 atom 노드라 title/alias가 PM 텍스트 노드가 아니라
    // attrs로만 존재한다 — 그래서 위 텍스트 스캔에서는 항상 제외되고, "[[Spring Boot]]"가
    // 렌더된(밑줄 링크) 상태에서는 "Spring"/"Boot" 어느 substring으로도 찾을 수 없었다.
    // 검색 source(TipTap document)는 그대로 두고, atom 노드일 때만 title(+alias)을 일반
    // 텍스트처럼 검사해 노드 전체 범위를 매치로 추가한다.
    if (node.type.name === "wikiLink") {
      const title = typeof node.attrs.title === "string" ? node.attrs.title : "";
      const alias = typeof node.attrs.alias === "string" ? node.attrs.alias : "";
      if (`${title} ${alias}`.toLowerCase().includes(q)) {
        matches.push({ from: pos, to: pos + node.nodeSize });
      }
    }
  });
  return matches;
}

/** 노트 패널 내부 검색(Ctrl+F/Cmd+F). 상시 로드되는 공유 extensions 배열에 정적으로 추가하는
    대신, 이 컴포넌트가 열려 있는 동안에만 editor.registerPlugin으로 하이라이트 전용 플러그인을
    붙였다 뗀다 — 검색은 패널마다 켜졌다 꺼지는 부가 기능이라 에디터 확장 설정 자체는 건드리지
    않는 최소 변경으로 구현했다. 트리거 캡처는 WikiLinkAutocomplete.tsx와 동일하게
    `editor.view.dom`에만 캡처 단계로 붙여, Split View에서 이 패널만 반응하고 다른 패널/브라우저
    기본 찾기에는 영향이 없게 한다. */
export function InNoteSearch({ editor, anchorEl }: { editor: Editor; anchorEl?: HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pluginKeyRef = useRef(new PluginKey("inNoteSearch"));

  const openRef = useRef(open);
  const matchesRef = useRef(matches);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // 하이라이트 전용 플러그인 — React state를 ref로만 읽고 문서는 건드리지 않는다.
  useEffect(() => {
    const key = pluginKeyRef.current;
    const plugin = new Plugin({
      key,
      props: {
        decorations(state) {
          if (!openRef.current || matchesRef.current.length === 0) return DecorationSet.empty;
          const decos = matchesRef.current.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class: i === currentIndexRef.current ? "in-note-search-match in-note-search-match-active" : "in-note-search-match",
            })
          );
          return DecorationSet.create(state.doc, decos);
        },
      },
    });
    editor.registerPlugin(plugin);
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
    };
  }, [editor]);

  // 하이라이트 대상(React state)이 바뀔 때마다 문서는 그대로 둔 채 빈 트랜잭션을 하나 흘려보내
  // ProseMirror가 decorations()를 다시 계산하도록 만든다.
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr);
  }, [editor, open, matches, currentIndex]);

  const scrollToMatch = useCallback((index: number, list: Match[]) => {
    const match = list[index];
    if (!match) return;
    try {
      const { node } = editor.view.domAtPos(match.from);
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
      el?.scrollIntoView?.({ block: "nearest" });
    } catch {
      // 문서가 바뀌어 위치가 유효하지 않으면 조용히 무시
    }
  }, [editor]);

  // 검색어(query)가 바뀌거나, 열려 있는 동안 문서 내용이 바뀌면(사용자가 타이핑) 매치를 다시 계산
  useEffect(() => {
    if (!open) return;
    const recompute = () => {
      const next = findMatches(editor.state.doc, query);
      setMatches(next);
      setCurrentIndex((i) => (next.length === 0 ? 0 : Math.min(i, next.length - 1)));
    };
    recompute();
    editor.on("update", recompute);
    return () => { editor.off("update", recompute); };
  }, [editor, open, query]);

  const goTo = useCallback((dir: 1 | -1) => {
    setCurrentIndex((i) => {
      const list = matchesRef.current;
      if (list.length === 0) return i;
      const next = (i + dir + list.length) % list.length;
      scrollToMatch(next, list);
      return next;
    });
  }, [scrollToMatch]);

  // Mod-F(Ctrl+F/Cmd+F) — 이 에디터 DOM에만 캡처 단계로 붙여 브라우저 기본 찾기보다 우선한다.
  useEffect(() => {
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    };
    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [editor]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMatches([]);
    setCurrentIndex(0);
  }, []);

  if (!open) return null;

  // anchorEl(탭 바와 스크롤 영역 사이에 EditorPanel이 마련해 둔, 크기 0의 기준점)이 있으면
  // 그 안에 포털로 꽂아 넣되 절대 위치로 우측 정렬한다 — 앵커 자체가 레이아웃 공간을 차지하지
  // 않으므로(스크롤 영역 바깥) 검색창이 노트 영역 상단에 겹쳐 보이고, 스크롤해도 앵커 위치
  // 기준으로 고정된 채 유지된다. 그 레이아웃이 없는 곳(editor-lab 등)에서는 기존처럼 본문 위
  // 우상단 플로팅으로 대체한다.
  const content = (
    <div
      className={cx(
        "flex items-center gap-1 rounded-lg border border-line/60 px-2 py-1.5 text-[12px] shadow-lg",
        "absolute right-3 top-1.5 z-30"
      )}
      style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 20px -4px rgba(2,6,23,0.35)" }}
    >
      <Search size={12} className="shrink-0 text-txt3" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goTo(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        placeholder="노트에서 검색..."
        className="w-40 bg-transparent text-txt outline-none placeholder:text-txt3"
      />
      <span className="w-10 shrink-0 text-center text-txt3">
        {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : query.trim() ? "0/0" : ""}
      </span>
      <button
        type="button"
        onClick={() => goTo(-1)}
        disabled={matches.length === 0}
        title="이전 (Shift+Enter)"
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-txt disabled:opacity-30"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        onClick={() => goTo(1)}
        disabled={matches.length === 0}
        title="다음 (Enter)"
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-txt disabled:opacity-30"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        onClick={close}
        title="닫기 (Esc)"
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-txt3 transition-colors hover:bg-surface2/80 hover:text-txt"
      >
        <X size={12} />
      </button>
    </div>
  );

  return anchorEl ? createPortal(content, anchorEl) : content;
}
