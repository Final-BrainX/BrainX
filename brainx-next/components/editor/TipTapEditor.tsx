"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { useBrainX } from "@/components/brainx-provider";
import { cx } from "@/lib/utils";
import type { EditorFontSize } from "@/app/editor-lab/page";
import { FONT_SIZES, FONT_SIZE_LABELS } from "@/app/editor-lab/page";

const TITLE_KEY = "brainx_tiptap_title_v1";
const CONTENT_KEY = "brainx_tiptap_content_v1";

type ViewMode = "editor" | "preview" | "json";

const FONT_SIZE_KEYS = Object.keys(FONT_SIZE_LABELS) as EditorFontSize[];

interface TipTapEditorProps {
  fontSize: EditorFontSize;
  onFontSizeChange: (size: EditorFontSize) => void;
}

export default function TipTapEditor({ fontSize, onFontSizeChange }: TipTapEditorProps) {
  const { theme } = useBrainX();
  const [title, setTitle] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLight = theme === "light";

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "내용을 입력하세요..." }),
    ],
    editorProps: {
      attributes: { class: "outline-none" },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(CONTENT_KEY, JSON.stringify(ed.getJSON()));
        setSaveStatus("saved");
      }, 600);
    },
  });

  // Load saved content
  useEffect(() => {
    if (!editor) return;
    const saved = localStorage.getItem(CONTENT_KEY);
    if (saved) {
      try {
        editor.commands.setContent(JSON.parse(saved));
      } catch {
        // ignore malformed data
      }
    }
  }, [editor]);

  // Load / persist title
  useEffect(() => {
    setTitle(localStorage.getItem(TITLE_KEY) ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem(TITLE_KEY, title);
  }, [title]);

  if (!editor) return <EditorSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 없음"
        className={cx(
          "w-full bg-transparent text-2xl font-bold font-display outline-none border-b pb-3 transition-colors",
          "text-txt placeholder:text-txt3",
          isLight
            ? "border-slate-200 focus:border-blue-400"
            : "border-line/40 focus:border-primary/50"
        )}
      />

      {/* Toolbar */}
      <div className={cx(
        "flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-xl border",
        isLight ? "bg-slate-50 border-slate-200" : "bg-surface2/40 border-line/40"
      )}>
        {/* Format buttons */}
        <ToolBtn active={editor.isActive("bold")} title="굵게 (Ctrl+B)" isLight={isLight}
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolBtn>
        <ToolBtn active={editor.isActive("italic")} title="기울임 (Ctrl+I)" isLight={isLight}
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span className="italic">I</span>
        </ToolBtn>

        <Sep isLight={isLight} />

        {([1, 2, 3] as const).map((level) => (
          <ToolBtn
            key={level}
            active={editor.isActive("heading", { level })}
            title={`제목 ${level}`}
            isLight={isLight}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          >
            <span className="font-mono text-[11px] font-semibold">H{level}</span>
          </ToolBtn>
        ))}

        <Sep isLight={isLight} />

        <ToolBtn active={editor.isActive("bulletList")} title="글머리 목록" isLight={isLight}
          onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <span className="text-xs">• —</span>
        </ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} title="번호 목록" isLight={isLight}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <span className="text-xs">1. —</span>
        </ToolBtn>

        <div className="flex-1" />

        {/* Font size */}
        <div className="flex items-center gap-1.5">
          <SegGroup isLight={isLight}>
            {FONT_SIZE_KEYS.map((size) => (
              <SegBtn key={size} active={fontSize === size} isLight={isLight}
                onClick={() => onFontSizeChange(size)}>
                {FONT_SIZE_LABELS[size]}
              </SegBtn>
            ))}
          </SegGroup>
          <span className="text-xs text-primary font-mono tabular-nums">
            {FONT_SIZE_LABELS[fontSize]} ({FONT_SIZES[fontSize]}px)
          </span>
        </div>

        <Sep isLight={isLight} />

        {/* View mode */}
        <SegGroup isLight={isLight}>
          {(["editor", "preview", "json"] as ViewMode[]).map((mode) => (
            <SegBtn key={mode} active={viewMode === mode} isLight={isLight}
              onClick={() => setViewMode(mode)}>
              {mode === "editor" ? "편집" : mode === "preview" ? "미리보기" : "JSON"}
            </SegBtn>
          ))}
        </SegGroup>

        <Sep isLight={isLight} />

        <span className={cx(
          "text-[11px] pr-1 transition-colors tabular-nums",
          saveStatus === "saving" ? "text-primary" : "text-txt3"
        )}>
          {saveStatus === "saving" ? "저장 중..." : "✓ 저장됨"}
        </span>
      </div>

      {/*
       * Content area — fontSize is applied via inline style so it cascades into
       * .ProseMirror.  Heading em-units in globals.css scale proportionally.
       * isLight drives the background / text color via CSS variables + Tailwind.
       */}
      <div
        style={{ fontSize: `${FONT_SIZES[fontSize]}px` }}
        className={cx(
          "min-h-[380px] rounded-xl border p-6 transition-all",
          isLight
            ? "border-slate-200 bg-white"
            : "border-line/40 bg-surface/20"
        )}
      >
        {viewMode === "editor" && (
          <div className={cx("tiptap-content", isLight && "tiptap-content--light")}>
            <EditorContent editor={editor} />
          </div>
        )}

        {viewMode === "preview" && (
          <div
            className="prose-bx"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        )}

        {viewMode === "json" && (
          <pre className="text-xs font-mono text-txt2 whitespace-pre-wrap leading-relaxed overflow-auto">
            {JSON.stringify(editor.getJSON(), null, 2)}
          </pre>
        )}
      </div>

      {/* Info row */}
      <p className="text-[11px] text-txt3">
        TipTap v3 · StarterKit (ProseMirror 기반) · 마크다운 단축키 지원 · localStorage 자동 저장
      </p>
    </div>
  );
}

/* ── Toolbar sub-components ──────────────────────── */

function ToolBtn({
  active,
  onClick,
  title,
  isLight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  isLight: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx(
        "min-w-[30px] h-7 px-2 rounded-lg text-sm transition-all",
        active
          ? "bg-primary/20 text-primary shadow-[inset_0_0_0_1px_rgb(var(--primary)/0.3)]"
          : isLight
            ? "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            : "text-txt2 hover:text-txt hover:bg-surface2"
      )}
    >
      {children}
    </button>
  );
}

function SegGroup({
  children,
  isLight,
}: {
  children: React.ReactNode;
  isLight: boolean;
}) {
  return (
    <div className={cx(
      "flex items-center gap-0.5 rounded-lg p-0.5",
      isLight ? "bg-white border border-slate-200" : "bg-surface/60"
    )}>
      {children}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  isLight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  isLight: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "px-2.5 py-0.5 rounded-md text-xs transition-all whitespace-nowrap",
        active
          ? "bg-primary/20 text-primary font-medium"
          : isLight
            ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            : "text-txt3 hover:text-txt"
      )}
    >
      {children}
    </button>
  );
}

function Sep({ isLight }: { isLight: boolean }) {
  return (
    <div className={cx(
      "w-px h-4 mx-0.5",
      isLight ? "bg-slate-200" : "bg-line/50"
    )} />
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-9 rounded-lg shimmer" />
      <div className="h-10 rounded-xl shimmer" />
      <div className="h-80 rounded-xl shimmer" />
    </div>
  );
}
