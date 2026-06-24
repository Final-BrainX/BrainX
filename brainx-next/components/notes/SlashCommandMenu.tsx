"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Code2,
  Table2,
  Image as ImageIcon,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { SlashCommandKey } from "./SlashCommand";

interface SlashRange {
  from: number;
  to: number;
}

interface SlashCommandItem {
  id: string;
  label: string;
  keywords: string[];
  icon: LucideIcon;
  run: (editor: Editor, range: SlashRange, helpers: { onPickImage: () => void }) => void;
}

const COMMANDS: SlashCommandItem[] = [
  {
    id: "heading1",
    label: "제목 1",
    keywords: ["h1", "heading1", "제목1", "heading"],
    icon: Heading1,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    id: "heading2",
    label: "제목 2",
    keywords: ["h2", "heading2", "제목2"],
    icon: Heading2,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    id: "heading3",
    label: "제목 3",
    keywords: ["h3", "heading3", "제목3"],
    icon: Heading3,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    id: "bulletList",
    label: "글머리 기호 목록",
    keywords: ["bullet", "ul", "목록", "불릿"],
    icon: List,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "번호 매기기 목록",
    keywords: ["numbered", "ol", "순서", "번호"],
    icon: ListOrdered,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "taskList",
    label: "할 일 목록",
    keywords: ["todo", "check", "체크박스", "할일", "task"],
    icon: CheckSquare,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "blockquote",
    label: "인용구",
    keywords: ["quote", "인용"],
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "divider",
    label: "구분선",
    keywords: ["divider", "hr", "구분선"],
    icon: Minus,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "codeBlock",
    label: "코드 블록",
    keywords: ["code", "코드"],
    icon: Code2,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "표",
    keywords: ["table", "표"],
    icon: Table2,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "image",
    label: "이미지",
    keywords: ["image", "img", "이미지", "사진"],
    icon: ImageIcon,
    run: (editor, range, helpers) => {
      editor.chain().focus().deleteRange(range).run();
      helpers.onPickImage();
    },
  },
  {
    id: "mermaid",
    label: "Mermaid 다이어그램",
    keywords: ["mermaid", "다이어그램", "diagram"],
    icon: Workflow,
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCodeBlock({ language: "mermaid" })
        .updateAttributes("codeBlock", { preview: false })
        .run(),
  },
];

/** "/" 입력 시 뜨는 노션 스타일 블록 명령어 메뉴. 트리거 감지(`SlashCommandSuggestion` 플러그인)와
    분리해, 후보 필터링·키보드 이동·명령 실행은 여기 React 쪽에서 처리한다 — `WikiLinkAutocomplete`와
    동일한 위치 계산(`coordsAtPos` + `createPortal(document.body)`) 패턴을 그대로 따른다. */
export function SlashCommandMenu({
  editor,
  onPickImage,
}: {
  editor: Editor;
  onPickImage: () => void;
}) {
  const [state, setState] = useState(() => SlashCommandKey.getState(editor.state) ?? null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const update = () => setState(SlashCommandKey.getState(editor.state) ?? null);
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

  const candidates: SlashCommandItem[] = (() => {
    if (!active) return [];
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q))
    );
  })();

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, active]);

  // 키보드로 선택이 이동할 때 메뉴 스크롤도 따라가야 한다 — max-h-[280px]+overflow-y-auto라
  // 후보가 많으면(코드블록 이후 항목들) 스크롤 없이는 선택이 화면 밖으로 밀려나 "더 안
  // 내려가는 것처럼" 보였다(실제로는 selectedIndex는 계속 증가하고 있었음).
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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
    (item: SlashCommandItem) => {
      if (!range) return;
      item.run(editor, range, { onPickImage });
    },
    [editor, range, onPickImage]
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
        editor.view.dispatch(editor.state.tr.setMeta(SlashCommandKey, "close"));
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
        width: 236,
      }}
      className="max-h-[280px] overflow-y-auto rounded-lg border border-line/60 py-1 scroll-thin"
    >
      <div style={{ background: "rgb(var(--surface))", boxShadow: "0 8px 24px -4px rgba(2,6,23,0.45)" }}>
        {candidates.map((c, idx) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              ref={(el) => { itemRefs.current[idx] = el; }}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(c)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={cx(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors",
                idx === selectedIndex ? "bg-primary/12 text-primary" : "text-txt2 hover:bg-surface2/60 hover:text-txt"
              )}
            >
              <Icon size={13} className="shrink-0 text-txt3" />
              <span className="flex-1 truncate">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
