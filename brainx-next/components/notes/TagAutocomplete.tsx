"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Hash } from "lucide-react";
import { cx } from "@/lib/utils";
import { TagSuggestionKey } from "./TagSuggestion";

interface TagAutocompleteProps {
  editor: Editor;
  /** 워크스페이스 내 모든 노트에서 수집된 중복 제거된 태그 목록 */
  allTags: readonly string[];
}

/** 후보 태그 최대 표시 개수 — 10,000건 이상 데이터에서도 렌더 부담이 없도록 제한 */
const MAX_CANDIDATES = 10;

/**
 * `#` 입력 시 뜨는 태그 자동완성 드롭다운.
 *
 * - 트리거 감지(`TagSuggestion` ProseMirror Plugin)와 완전히 분리되어 있다.
 * - 후보 필터링·키보드 네비게이션·삽입은 전부 여기서 처리한다.
 * - `coordsAtPos` + `createPortal(document.body)` 위치 계산 패턴은
 *   `WikiLinkAutocomplete`와 동일하다.
 */
function TagAutocompleteInner({ editor, allTags }: TagAutocompleteProps) {
  const [state, setState] = useState(
    () => TagSuggestionKey.getState(editor.state) ?? null
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ProseMirror 트랜잭션/선택 변경 시 상태 동기화
  useEffect(() => {
    const update = () =>
      setState(TagSuggestionKey.getState(editor.state) ?? null);
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

  // 쿼리가 바뀌면 선택 인덱스 초기화
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, active]);

  /** 쿼리로 태그 후보를 필터링 — useMemo로 렌더마다 재계산 방지 */
  const candidates = useMemo<string[]>(() => {
    if (!active) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allTags.slice(0, MAX_CANDIDATES);
    return allTags
      .filter((tag) => tag.toLowerCase().includes(q))
      .slice(0, MAX_CANDIDATES);
  }, [active, query, allTags]);

  // Caret 위치 계산 (commit/close 시 null 처리)
  useLayoutEffect(() => {
    if (!active || !range) {
      setPos(null);
      return;
    }
    try {
      const coords = editor.view.coordsAtPos(range.from);
      setPos({ left: coords.left, top: coords.bottom + 6 });
    } catch {
      setPos(null);
    }
  }, [active, range, editor]);

  /** 태그 선택 → `#쿼리` 범위를 TagNode 인라인 노드로 치환하고 커서를 뒤로 이동 */
  const commit = useCallback(
    (tag: string) => {
      if (!range) return;
      const tagNodeType = editor.state.schema.nodes["tagNode"];
      if (tagNodeType) {
        // TagNode가 등록된 경우: 인라인 노드로 삽입
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const node = tagNodeType.create({ name: tag });
            const space = state.schema.text(" ");
            tr.replaceWith(range.from, range.to, [node, space]);
            return true;
          })
          .run();
      } else {
        // Fallback: 텍스트로 삽입
        editor
          .chain()
          .focus()
          .deleteRange({ from: range.from, to: range.to })
          .insertContent(`#${tag} `)
          .run();
      }
    },
    [editor, range]
  );

  /** Escape → ProseMirror 플러그인 상태를 "close"로 설정해 비활성화 */
  const closeDropdown = useCallback(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(TagSuggestionKey, "close")
    );
  }, [editor]);

  /**
   * 키보드 네비게이션 — ProseMirror가 ArrowUp/Down/Enter를 먼저 처리하기 전에
   * capture 단계에서 가로챈다. Split View의 다른 패널에는 영향이 없다.
   */
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
        closeDropdown();
      }
    };

    dom.addEventListener("keydown", handler, true);
    return () => dom.removeEventListener("keydown", handler, true);
  }, [active, candidates, selectedIndex, commit, closeDropdown, editor]);

  // 스크롤: 선택된 항목이 드롭다운 내에 보이도록 자동 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector<HTMLButtonElement>(
      `[data-idx="${selectedIndex}"]`
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!active || !pos || candidates.length === 0) return null;

  const safeLeft = Math.max(4, Math.min(pos.left, window.innerWidth - 244));

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="태그 자동완성"
      style={{
        position: "fixed",
        left: safeLeft,
        top: pos.top,
        zIndex: 2100,
        width: 240,
        maxHeight: 280,
        overflowY: "auto",
      }}
      className="scroll-thin overflow-hidden rounded-lg border border-line/60 py-1"
    >
      <div
        style={{
          background: "rgb(var(--surface))",
          boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)",
        }}
      >
        {candidates.map((tag, idx) => (
          <button
            key={tag}
            type="button"
            role="option"
            aria-selected={idx === selectedIndex}
            data-idx={idx}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(tag)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={cx(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors",
              idx === selectedIndex
                ? "bg-primary/12 text-primary"
                : "text-txt2 hover:bg-surface2/60 hover:text-txt"
            )}
          >
            <Hash size={11} className="shrink-0 opacity-60" />
            <span className="flex-1 truncate">{tag}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

/** React.memo로 감싸 allTags·editor 참조가 변하지 않으면 리렌더 방지 */
export const TagAutocomplete = memo(TagAutocompleteInner);
TagAutocomplete.displayName = "TagAutocomplete";
