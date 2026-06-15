"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@blocknote/react/style.css";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import { useEffect, useRef, useState } from "react";
import { useBrainX } from "@/components/brainx-provider";
import { cx } from "@/lib/utils";
import type { EditorFontSize } from "@/app/editor-lab/page";
import { FONT_SIZES, FONT_SIZE_LABELS } from "@/app/editor-lab/page";

const TITLE_KEY = "brainx_blocknote_title_v1";
const CONTENT_KEY = "brainx_blocknote_content_v1";

const FONT_SIZE_KEYS = Object.keys(FONT_SIZE_LABELS) as EditorFontSize[];

interface BlockNoteEditorProps {
  fontSize: EditorFontSize;
  onFontSizeChange: (size: EditorFontSize) => void;
}

function loadSavedBlocks(): Block[] | undefined {
  try {
    const raw = localStorage.getItem(CONTENT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Block[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export default function BlockNoteEditor({ fontSize, onFontSizeChange }: BlockNoteEditorProps) {
  const { theme } = useBrainX();
  const [title, setTitle] = useState("");
  const [showJson, setShowJson] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLight = theme === "light";

  const editor = useCreateBlockNote({
    initialContent: loadSavedBlocks(),
  });

  useEffect(() => {
    setTitle(localStorage.getItem(TITLE_KEY) ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem(TITLE_KEY, title);
  }, [title]);

  function handleChange() {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(CONTENT_KEY, JSON.stringify(editor.document));
      setSaveStatus("saved");
    }, 600);
  }

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

      {/* Controls bar */}
      <div className={cx(
        "flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border",
        isLight ? "bg-slate-50 border-slate-200" : "bg-surface2/40 border-line/40"
      )}>
        {/* Font size picker */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-txt3 shrink-0">글씨 크기</span>
          <div className={cx(
            "flex items-center gap-0.5 rounded-lg p-0.5",
            isLight ? "bg-white border border-slate-200" : "bg-surface/60"
          )}>
            {FONT_SIZE_KEYS.map((size) => (
              <button
                key={size}
                onClick={() => onFontSizeChange(size)}
                className={cx(
                  "px-2.5 py-0.5 rounded-md text-xs transition-all whitespace-nowrap",
                  fontSize === size
                    ? "bg-primary/20 text-primary font-medium"
                    : isLight
                      ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      : "text-txt3 hover:text-txt"
                )}
              >
                {FONT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
          <span className="text-xs text-primary font-mono tabular-nums shrink-0">
            {FONT_SIZE_LABELS[fontSize]} ({FONT_SIZES[fontSize]}px)
          </span>
        </div>

        <div className="flex-1" />

        {/* JSON toggle */}
        <button
          onClick={() => setShowJson((v) => !v)}
          className={cx(
            "px-3 py-1 rounded-lg text-xs transition-all",
            showJson
              ? "bg-primary/20 text-primary font-medium"
              : isLight
                ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                : "text-txt3 hover:text-txt hover:bg-surface2"
          )}
        >
          {showJson ? "← 에디터" : "JSON 출력"}
        </button>

        <div className={cx("w-px h-4", isLight ? "bg-slate-200" : "bg-line/50")} />

        {/* Save status */}
        <span className={cx(
          "text-[11px] pr-1 transition-colors tabular-nums",
          saveStatus === "saving" ? "text-primary" : "text-txt3"
        )}>
          {saveStatus === "saving" ? "저장 중..." : "✓ 저장됨"}
        </span>
      </div>

      {/*
       * Editor wrapper
       * `data-bn-fontsize` activates the globals.css override rule.
       * `--bn-fs` drives .bn-default-styles font-size via !important override.
       * BlockNote's heading em-units (3em/2em/1.3em) scale proportionally.
       */}
      {!showJson && (
        <div
          data-bn-fontsize="true"
          style={{ "--bn-fs": `${FONT_SIZES[fontSize]}px` } as React.CSSProperties}
          className={cx(
            "rounded-xl border overflow-hidden min-h-[380px]",
            isLight ? "border-slate-200" : "border-line/40"
          )}
        >
          <BlockNoteView
            editor={editor}
            theme={isLight ? "light" : "dark"}
            onChange={handleChange}
          />
        </div>
      )}

      {/* JSON output panel */}
      {showJson && (
        <div className={cx(
          "min-h-[380px] rounded-xl border p-6",
          isLight ? "border-slate-200 bg-slate-50" : "border-line/40 bg-surface/20"
        )}>
          <pre className="text-xs font-mono text-txt2 whitespace-pre-wrap leading-relaxed overflow-auto">
            {JSON.stringify(editor.document, null, 2)}
          </pre>
        </div>
      )}

      {/* Info row */}
      <p className="text-[11px] text-txt3">
        BlockNote v0.51 · Block 기반 · 슬래시(/) 명령어 지원 · localStorage 자동 저장
      </p>
    </div>
  );
}
