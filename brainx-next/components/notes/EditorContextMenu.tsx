"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import {
  ClipboardPaste,
  Columns2,
  Columns3,
  ImagePlus,
  Link2,
  Merge,
  Rows3,
  Split,
  Table2,
  Trash2,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { activeTableDisplayAttrs, updateActiveTableAttrs } from "./tableUtils";

export interface EditorContextTarget {
  x: number;
  y: number;
  inTable: boolean;
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors",
        disabled && "cursor-not-allowed text-txt3/55",
        !disabled && danger && "text-red-400 hover:bg-red-500/10 hover:text-red-300",
        !disabled && !danger && "text-txt2 hover:bg-surface2/60 hover:text-txt"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function EditorContextMenu({
  target,
  editor,
  onClose,
  onChooseImage,
  onInsertImageUrl,
  onInsertTable,
  onSplitColumns,
}: {
  target: EditorContextTarget;
  editor: Editor;
  onClose: () => void;
  onChooseImage: () => void;
  onInsertImageUrl: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onSplitColumns: (count: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y, visibility: "hidden" as "hidden" | "visible" });
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      left: Math.max(margin, Math.min(target.x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(target.y, window.innerHeight - rect.height - margin)),
      visibility: "visible",
    });
  }, [target.x, target.y, showTablePicker, showColumnPicker, target.inTable]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const tableAttrs = target.inTable ? activeTableDisplayAttrs(editor) : null;
  const canMerge = target.inTable && editor.can().mergeCells();
  const canSplit = target.inTable && editor.can().splitCell();
  // 컬럼 분할은 커서가 최상위 블록(리스트 항목/인용 안처럼 더 깊이 중첩되지 않은 위치)에
  // 있을 때만 의미가 명확하다 — splitBlockIntoColumns의 depth 제약과 동일한 기준.
  const canSplitColumns = !target.inTable && editor.state.selection.$from.depth === 1;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="노트 본문 메뉴"
      className="fixed z-[2100] w-56 overflow-hidden rounded-lg border border-line/60 py-1"
      style={{
        left: pos.left,
        top: pos.top,
        visibility: pos.visibility,
        background: "rgb(var(--surface))",
        boxShadow: "0 12px 28px -6px rgba(2,6,23,0.5), 0 0 0 1px rgb(var(--border) / 0.2)",
      }}
    >
      <MenuItem
        icon={<ClipboardPaste size={13} />}
        label="붙여넣기"
        disabled
        title="브라우저 보안 정책상 Ctrl+V를 사용해 주세요"
      />
      <MenuItem icon={<ImagePlus size={13} />} label="이미지 삽입" onClick={run(onChooseImage)} />
      <MenuItem icon={<Link2 size={13} />} label="이미지 URL로 삽입" onClick={run(onInsertImageUrl)} />
      <MenuItem
        icon={<Table2 size={13} />}
        label="표 삽입"
        onClick={() => setShowTablePicker((current) => !current)}
      />
      {showTablePicker && (
        <div className="mx-2 mb-1 rounded-md border border-line/40 bg-surface2/35 p-2">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-txt3">
            <label className="flex items-center gap-1">행
              <input
                aria-label="표 행 수"
                type="number"
                min={1}
                max={20}
                value={rows}
                onChange={(event) => setRows(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                className="h-6 w-12 rounded border border-line/50 bg-transparent px-1 text-txt outline-none"
              />
            </label>
            <label className="flex items-center gap-1">열
              <input
                aria-label="표 열 수"
                type="number"
                min={1}
                max={20}
                value={cols}
                onChange={(event) => setCols(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                className="h-6 w-12 rounded border border-line/50 bg-transparent px-1 text-txt outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={run(() => onInsertTable(rows, cols))}
            className="w-full rounded bg-primary py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            {rows}×{cols} 표 삽입
          </button>
        </div>
      )}

      <MenuItem
        icon={<Columns2 size={13} />}
        label="N단으로 나누기"
        disabled={!canSplitColumns}
        title={canSplitColumns ? undefined : "리스트 항목/인용 안쪽처럼 중첩된 위치에서는 사용할 수 없습니다"}
        onClick={() => setShowColumnPicker((current) => !current)}
      />
      {showColumnPicker && canSplitColumns && (
        <div className="mx-2 mb-1 rounded-md border border-line/40 bg-surface2/35 p-2">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-txt3">
            <label className="flex items-center gap-1">단 개수
              <input
                aria-label="컬럼 개수"
                type="number"
                min={2}
                max={6}
                value={columnCount}
                onChange={(event) => setColumnCount(Math.min(6, Math.max(2, Number(event.target.value) || 2)))}
                className="h-6 w-12 rounded border border-line/50 bg-transparent px-1 text-txt outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={run(() => onSplitColumns(columnCount))}
            className="w-full rounded bg-primary py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            {columnCount}단으로 나누기
          </button>
        </div>
      )}

      {target.inTable && (
        <>
          <div className="my-1 border-t border-line/30" />
          <MenuItem icon={<Rows3 size={13} />} label="행 추가" onClick={run(() => editor.chain().focus().addRowAfter().run())} />
          <MenuItem icon={<Columns3 size={13} />} label="열 추가" onClick={run(() => editor.chain().focus().addColumnAfter().run())} />
          {/* 행삭제/열삭제/표삭제가 전부 같은 아이콘이면 구분이 안 된다는 피드백 — 행/열은 구조를
              나타내는 기존 Rows3/Columns3을 danger 색으로(TableToolbar.tsx와 동일한 규칙),
              "표 전체 삭제"만 Trash2로 남겨 의미 차이를 아이콘으로도 드러낸다. */}
          <MenuItem icon={<Rows3 size={13} />} label="현재 행 삭제" danger onClick={run(() => editor.chain().focus().deleteRow().run())} />
          <MenuItem icon={<Columns3 size={13} />} label="현재 열 삭제" danger onClick={run(() => editor.chain().focus().deleteColumn().run())} />
          <MenuItem icon={<Trash2 size={13} />} label="표 삭제" danger onClick={run(() => editor.chain().focus().deleteTable().run())} />
          <div className="my-1 border-t border-line/30" />
          <MenuItem icon={<Merge size={13} />} label="셀 병합" disabled={!canMerge} onClick={run(() => editor.chain().focus().mergeCells().run())} />
          <MenuItem icon={<Split size={13} />} label="셀 병합 해제" disabled={!canSplit} onClick={run(() => editor.chain().focus().splitCell().run())} />

          {/* 표 전체 색 기능은 제거됨(요구사항) — 셀 배경색만 유지하며, 셀 배경색은
              TableToolbar(표 안에 커서가 있을 때 뜨는 플로팅 툴바)에서 지정한다. */}
          <div className="px-3 pb-2 pt-1.5">
            <p className="mb-1 text-[10px] font-medium text-txt3">테두리 굵기</p>
            <div className="flex gap-1">
              {[1, 2, 3].map((width) => {
                const active = tableAttrs?.borderWidth === width;
                return (
                  <button
                    key={width}
                    type="button"
                    aria-label={`표 테두리 ${width}px`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => updateActiveTableAttrs(editor, { borderWidth: width })}
                    className={cx(
                      "flex flex-1 flex-col items-center gap-1 rounded py-1 transition-colors",
                      active ? "bg-primary/15 text-primary ring-1 ring-primary/50" : "text-txt3 hover:bg-surface2 hover:text-txt"
                    )}
                  >
                    <span
                      className="block w-7 rounded-full"
                      style={{ height: width, background: active ? "rgb(var(--primary))" : "rgb(var(--txt3))" }}
                      aria-hidden
                    />
                    <span className="text-[9.5px] leading-none">{width}px</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
