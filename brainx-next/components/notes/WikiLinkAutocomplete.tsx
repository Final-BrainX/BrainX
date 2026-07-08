"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { FileText, FilePlus2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { normalizeTitleForMatch } from "@/lib/wiki-links";
import { WikiLinkSuggestionKey } from "./WikiLinkSuggestion";
import { useWikiLinkContext, folderPathOf } from "./WikiLinkContext";

interface Candidate {
  /** note 후보는 실제 note.id, create 후보는 `create:${query}` — title 대신 이 값을 React key로
      쓴다. 같은 이름의 노트가 서로 다른 폴더에 여러 개 있으면(제목 중복은 폴더 scope 안에서만
      막히므로 실제로 가능하다) title만으로는 key가 겹쳐 "두 자식이 같은 key를 가진다" 경고가 났었다. */
  id: string;
  kind: "note" | "create";
  title: string;
  /** "Backend / Spring" 형태의 폴더 경로 — 최상위 노트/create 후보는 null(보조 텍스트 생략). */
  folderPath?: string | null;
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
    // normalizeTitleForMatch로 노트 제목 앞의 이모지 아이콘을 무시한다 — 그렇지 않으면 이미
    // 존재하는(이모지 붙은) 노트를 정확히 입력해도 exact가 항상 false가 되어 "새 노트 만들기"
    // 후보가 실제 노트 후보와 함께 잘못 나타난다.
    const q = normalizeTitleForMatch(query);
    const matches = q ? ctx.notes.filter((n) => normalizeTitleForMatch(n.title).includes(q)) : ctx.notes;
    const folders = ctx.folders ?? [];
    const list: Candidate[] = matches.slice(0, 8).map((n) => {
      let folderPath: string | null = null;
      try {
        folderPath = folderPathOf(folders, n.folderId);
      } catch {
        folderPath = null; // 경로 계산이 실패해도 후보 목록 자체는 깨지지 않게 한다
      }
      return { id: n.id, kind: "note", title: n.title, folderPath };
    });
    const exact = matches.some((n) => normalizeTitleForMatch(n.title) === q);
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
      // .run()은 동기적으로 트랜잭션(WikiLinkLiveEdit의 appendTransaction 포함)까지 전부
      // 반영한다 — 바로 이 자리에서 editor.getHTML()을 읽어 onCreate에 넘기면, NotesWorkspace의
      // onCreate가 나중에(리렌더/탭 전환을 거친 뒤) activeEditorHandle.getHTML()을 다시 읽을 때
      // 생길 수 있는 시간차 없이 "방금 삽입된 직후"의 본문을 그대로 신뢰할 수 있다.
      if (candidate.kind === "create") ctx?.onCreate(candidate.title, editor.getHTML());
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
              /* 회색 :hover 배경을 CSS로 별도로 주면, 방금 클릭했던 위치에 드롭다운이 다시 뜰 때
                 실제 마우스 포인터가 움직이지 않았는데도(onMouseEnter 없이) 그 항목만 계속 회색으로
                 보이는 "유령 hover"가 생겼다("이전에 선택했던 노트"처럼 보이던 원인). 실제 마우스
                 hover는 이미 onMouseEnter가 selectedIndex를 바꿔 파란색 active로 처리하므로, 여기서는
                 active 여부로만 색을 결정한다. */
              idx === selectedIndex ? "bg-primary/12 text-primary" : "text-txt2"
            )}
          >
            {c.kind === "note" ? (
              <FileText size={12} className="shrink-0 text-txt3" />
            ) : (
              <FilePlus2 size={12} className="shrink-0 text-orange-400" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">
                {c.kind === "create" ? <>새 노트 만들기 &ldquo;{c.title}&rdquo;</> : c.title}
              </span>
              {c.kind === "note" && c.folderPath && (
                <span className="truncate text-[10px] text-txt3">{c.folderPath}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
