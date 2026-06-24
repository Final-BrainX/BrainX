"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Rows3,
  Columns3,
  Trash2,
  Merge,
  Split,
  MoreHorizontal,
} from "lucide-react";
import { cx } from "@/lib/utils";
import { MAX_BLOCK_PERCENT, MIN_BLOCK_PERCENT, type BlockAlign, type BlockWidthMode } from "./BlockControls";
import { QuickSwatchRow, TEXT_COLOR_QUICK } from "./ColorPalette";
import {
  activeCellAttrs,
  activeTableDisplayAttrs,
  updateActiveTableAttrs,
  updateSelectedCellsAttrs,
  type CellColorPreset,
} from "./tableUtils";

const CELL_COLOR_SWATCHES: { value: CellColorPreset; label: string; dot: string }[] = [
  { value: "yellow", label: "노랑", dot: "rgb(234 179 8)" },
  { value: "green", label: "초록", dot: "rgb(16 185 129)" },
  { value: "blue", label: "파랑", dot: "rgb(59 130 246)" },
  { value: "gray", label: "회색", dot: "rgb(148 163 184)" },
];

const BORDER_WIDTH_OPTIONS = [1, 2, 3];

function ToolbarBtn({
  title,
  onClick,
  danger,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        "grid h-[24px] min-w-[24px] shrink-0 place-items-center rounded px-1 transition-colors",
        disabled && "cursor-not-allowed opacity-35",
        !disabled && danger && "text-red-400 hover:bg-red-500/10",
        !disabled && !danger && active && "bg-primary/15 text-primary",
        !disabled && !danger && !active && "text-txt2 hover:bg-surface2/70 hover:text-txt"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-line/50" />;
}

/** 표(Table) 안에 커서가 있을 때만 떠서 행/열을 추가·삭제할 수 있는 작은 툴바.
    `Table`/`TableRow`/`TableCell`은 공식 확장 자체 NodeView(순수 JS, `TableView`)를 쓰기 때문에
    Mermaid/이미지 블록처럼 React NodeView 안에 hover 툴바를 끼워넣을 수 없다 — 그래서
    `CustomBubbleMenu`와 같은 방식(selection 구독 → 좌표 계산 → `createPortal`)으로 별도의
    떠있는 툴바를 만든다. 다만 "표 안에 있는지"는 PM 모델의 조상 노드 체인을 직접 보는
    구조적 판정이라(`editor.isActive("table")`), 버블 툴바를 여러 번 고쳐야 했던 그 "native
    selection이 드래그 중 일시적으로 collapse되는" 문제에 영향받지 않는다 — settling 같은
    방어 로직 없이 단순하게 구현해도 안전하다.

    자주 쓰는 행/열 추가·삭제, 셀 병합/분리, 정렬, 표 삭제만 1차 노출한다(표 삭제는 더보기 안에
    숨어 있으면 찾기 어렵다는 피드백으로 1차로 옮김). 서식·셀 배경색·테두리·표 크기·표 색상처럼
    빈도가 낮은 기능은 "···" 더보기로 옮겨 폭을 줄였다 — 좁은 분할 패널에서 툴바 전체가 옆
    패널/컨텍스트 패널 영역까지 넘어가 잘리던 문제의 근본 원인이 "버튼이 너무 많아 항상 가로로
    길다"였다. 더보기 메뉴 내부도 셀 배경색/테두리를 2열 grid로 묶어 세로 스크롤 의존도를
    낮췄다. */
export function TableToolbar({ editor }: { editor: Editor }) {
  const [anchor, setAnchor] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const [customDraft, setCustomDraft] = useState("100");
  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState<{ left: number; top: number } | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  // 버튼이 늘어날수록 고정폭을 가정할 수 없으므로, 실제 렌더된 폭/높이(잘리기 전 scrollWidth/
  // offsetHeight)를 측정해 좌표 계산에 쓴다 — 안 그러면 폭·높이를 과소 추정해서 안전 영역
  // 밖으로 삐져나가거나 위/아래가 잘린다.
  const [measuredWidth, setMeasuredWidth] = useState(360);
  const [measuredHeight, setMeasuredHeight] = useState(34);
  useLayoutEffect(() => {
    if (!toolbarRef.current) return;
    setMeasuredWidth(toolbarRef.current.scrollWidth);
    setMeasuredHeight(toolbarRef.current.offsetHeight);
  });

  const updateAnchor = useCallback(() => {
    if (!editor.isEditable || !editor.isActive("table")) {
      setAnchor(null);
      return;
    }
    const { selection } = editor.state;
    let tablePos: number | null = null;
    // 표 테두리 클릭으로 표 전체가 NodeSelection으로 잡힌 경우 — $from은 표 "바로 앞" 경계를
    // 가리켜 그 조상 체인에 표 자신이 포함되지 않으므로(아래 일반 분기로는 못 찾음), 선택된
    // 노드가 table인지 직접 확인해서 그 위치를 그대로 쓴다.
    if (selection instanceof NodeSelection && selection.node.type.name === "table") {
      tablePos = selection.from;
    } else {
      const { $from } = selection;
      for (let d = $from.depth; d >= 0; d--) {
        if ($from.node(d).type.name === "table") {
          tablePos = $from.before(d);
          break;
        }
      }
    }
    if (tablePos === null) {
      setAnchor(null);
      return;
    }
    const dom = editor.view.nodeDOM(tablePos);
    const el = dom instanceof HTMLElement ? dom : null;
    if (!el) {
      setAnchor(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  }, [editor]);

  useEffect(() => {
    editor.on("selectionUpdate", updateAnchor);
    editor.on("transaction", updateAnchor);
    const onBlur = () => {
      requestAnimationFrame(() => {
        if (toolbarRef.current?.contains(document.activeElement)) return;
        setAnchor(null);
      });
    };
    editor.on("blur", onBlur);
    return () => {
      editor.off("selectionUpdate", updateAnchor);
      editor.off("transaction", updateAnchor);
      editor.off("blur", onBlur);
    };
  }, [editor, updateAnchor]);

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

  // 표가 바뀌거나(selection이 다른 표로 이동) 툴바가 사라지면 더보기 메뉴도 같이 닫는다.
  useEffect(() => {
    if (!anchor) setMoreOpen(false);
  }, [anchor]);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // 메뉴는 document.body에 portal로 떠 있어 moreWrapRef(버튼) 바깥의 DOM이다 — 둘 중
      // 하나라도 포함하면 "메뉴 안 클릭"으로 본다.
      if (moreWrapRef.current?.contains(target) || moreMenuRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // 더보기 메뉴는 기본적으로 버튼 아래로 펼쳐지는데, 툴바 자체가 이미(표가 패널 아래쪽에
  // 있어서) 화면 하단 가까이 떠 있으면 메뉴가 뷰포트 밖으로 잘려 나간다 — 버튼 기준으로
  // 펼쳐질 실제 공간을 측정해 부족하면 위로 뒤집는다(useLayoutEffect라 화면에 그려지기 전에
  // 다시 계산되어 깜빡임 없이 처음부터 올바른 방향으로 보인다). 1차 툴바가 가로 스크롤
  // (overflow-x-auto)을 갖게 되면서, 더보기 메뉴를 그 안에 absolute로 두면 스크롤 컨테이너의
  // overflow에 잘린다 — document.body에 portal로 띄우고 fixed 좌표를 직접 계산한다.
  useLayoutEffect(() => {
    if (!moreOpen) return;
    const btn = moreWrapRef.current;
    const menu = moreMenuRef.current;
    if (!btn || !menu) return;
    const btnRect = btn.getBoundingClientRect();
    const dropUp = btnRect.bottom + menu.offsetHeight + 8 > window.innerHeight;
    const menuWidth = menu.offsetWidth || 300;
    setMorePos({
      left: Math.max(4, Math.min(btnRect.right - menuWidth, window.innerWidth - menuWidth - 4)),
      top: dropUp ? btnRect.top - menu.offsetHeight - 4 : btnRect.bottom + 4,
    });
  }, [moreOpen]);

  if (!anchor) return null;

  // 텍스트 선택 시 뜨는 버블 툴바(CustomBubbleMenu)와 동일한 기준 — 패널/컨텍스트 패널 경계가
  // 아니라 뷰포트(window) 기준으로만 클램프한다. 이전에는 editor.view.dom(현재 패널) 폭으로
  // 제한해서 좁은 분할 패널에서 줄바꿈/가로스크롤이 필요했는데, "텍스트 버블 툴바처럼 화면 위에
  // 떠서 패널 폭과 무관하게 한 줄로 보이게 해달라"는 요구로 패널 경계 제한을 없앴다 — 이제
  // 다른 패널/컨텍스트 패널 영역 위로 자연스럽게 넘어가 보인다.
  const margin = 4;
  const left = Math.max(margin, Math.min(anchor.right - measuredWidth, window.innerWidth - measuredWidth - margin));

  // 표가 뷰포트 맨 위쪽에 붙어 있으면 "표 위"에 띄울 공간이 부족하다 — 이때는 표 아래로
  // 뒤집는다(CustomBubbleMenu의 위/아래 자동 전환과 같은 방식, 역시 뷰포트 기준).
  const wantTop = anchor.top - measuredHeight - 6;
  const top = wantTop >= margin ? wantTop : anchor.bottom + 6;

  const run = (fn: () => boolean) => () => { fn(); updateAnchor(); };
  const tableAttrs = activeTableDisplayAttrs(editor);
  const cellAttrs = activeCellAttrs(editor);
  const currentTextColor = (editor.getAttributes("textStyle").color as string) ?? null;
  const canMerge = editor.can().mergeCells();
  const canSplit = editor.can().splitCell();
  const commitCustomWidth = () => {
    const next = Number(customDraft);
    if (!Number.isFinite(next) || customDraft.trim() === "") {
      setCustomDraft(String(tableAttrs.widthPercent ?? 100));
      return;
    }
    const widthPercent = Math.min(Math.max(next, MIN_BLOCK_PERCENT), MAX_BLOCK_PERCENT);
    setCustomDraft(String(widthPercent));
    updateActiveTableAttrs(editor, { widthMode: "custom", widthPercent });
  };

  return createPortal(
    <>
      <div
        ref={toolbarRef}
        style={{
          position: "fixed",
          left,
          top,
          zIndex: 1900,
        }}
      >
        <div
          className="flex items-center gap-0.5 rounded-lg border border-line/60 px-1 py-0.5"
          style={{
            background: "rgb(var(--surface))",
            boxShadow: "0 8px 20px -4px rgba(2,6,23,0.35)",
            // 텍스트 선택 시 뜨는 버블 툴바와 동일하게 패널/컨텍스트 패널 폭과 무관하게 항상
            // 한 줄로 펼쳐진다 — 줄바꿈도, 가로 스크롤도 없다(뷰포트 기준 위치 클램프만 함).
            flexWrap: "nowrap",
          }}
        >
          <ToolbarBtn title="위에 행 추가" onClick={run(() => editor.chain().focus().addRowBefore().run())}>
            <ArrowUpToLine size={13} />
          </ToolbarBtn>
          <ToolbarBtn title="아래에 행 추가" onClick={run(() => editor.chain().focus().addRowAfter().run())}>
            <ArrowDownToLine size={13} />
          </ToolbarBtn>
          {/* 행삭제/열삭제/표삭제가 전부 같은 아이콘이면 구분이 안 된다는 피드백 — 행/열은
              구조를 나타내는 Rows3/Columns3을 danger 색으로, "표 전체 삭제"만 더보기 메뉴의
              Trash2로 남겨 의미 차이를 아이콘으로도 드러낸다. */}
          <ToolbarBtn danger title="행 삭제" onClick={run(() => editor.chain().focus().deleteRow().run())}>
            <Rows3 size={13} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn title="왼쪽에 열 추가" onClick={run(() => editor.chain().focus().addColumnBefore().run())}>
            <ArrowLeftToLine size={13} />
          </ToolbarBtn>
          <ToolbarBtn title="오른쪽에 열 추가" onClick={run(() => editor.chain().focus().addColumnAfter().run())}>
            <ArrowRightToLine size={13} />
          </ToolbarBtn>
          <ToolbarBtn danger title="열 삭제" onClick={run(() => editor.chain().focus().deleteColumn().run())}>
            <Columns3 size={13} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title={canSplit ? "셀 병합 해제" : "셀 병합"}
            disabled={!canMerge && !canSplit}
            onClick={run(() => (canSplit ? editor.chain().focus().splitCell().run() : editor.chain().focus().mergeCells().run()))}
          >
            {canSplit ? <Split size={13} /> : <Merge size={13} />}
          </ToolbarBtn>

          <Divider />

          {/* 셀 정렬 — 단일 셀 커서/텍스트 선택, 드래그로 만든 다중 셀 CellSelection 모두 지원 */}
          {(["left", "center", "right"] as BlockAlign[]).map((a) => (
            <ToolbarBtn
              key={a}
              title={a === "left" ? "셀 왼쪽 정렬" : a === "center" ? "셀 가운데 정렬" : "셀 오른쪽 정렬"}
              active={cellAttrs.align === a}
              onClick={run(() => updateSelectedCellsAttrs(editor, { cellAlign: a }))}
            >
              {a === "left" ? <AlignLeft size={13} /> : a === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
            </ToolbarBtn>
          ))}

          <Divider />

          {/* 표 삭제 — 더보기 안에 숨어 있어 찾기 불편하다는 피드백으로 1차 툴바로 옮겼다.
              가장 위험한 동작이라 항상 맨 끝(더보기 바로 앞)에 두어 다른 버튼과 헷갈리지 않게 한다. */}
          <ToolbarBtn danger title="표 삭제" onClick={run(() => editor.chain().focus().deleteTable().run())}>
            <Trash2 size={13} />
          </ToolbarBtn>

          <Divider />

          {/* 자주 쓰지 않는 기능(서식/셀 배경색/테두리/표 크기)은 더보기로 이동 */}
          <div ref={moreWrapRef} className="relative shrink-0">
            <ToolbarBtn title="더보기" active={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
              <MoreHorizontal size={13} />
            </ToolbarBtn>
            {moreOpen && createPortal(
              <div
                ref={moreMenuRef}
                // 기존 252px는 "텍스트 서식" 줄(B/I/S + 색상 표시 + 8개 색상 스와치)이 다 들어가기엔
                // 좁아서, overflow-y:auto(아래)가 CSS 스펙상 overflow-x도 auto로 강제 전환시켜
                // 가로 스크롤바가 생겼다(좌우 여백도 한쪽만 잘리는 느낌으로 불균형해 보였다).
                // 300px로 넓혀 모든 줄이 가로 스크롤 없이 한 번에 들어가게 했다.
                className="w-[300px] rounded-lg border border-line/60 p-1.5"
                style={{
                  position: "fixed",
                  left: morePos?.left ?? 0,
                  top: morePos?.top ?? 0,
                  visibility: morePos ? "visible" : "hidden",
                  zIndex: 1910,
                  background: "rgb(var(--surface))",
                  boxShadow: "0 12px 28px -6px rgba(2,6,23,0.5)",
                  maxHeight: "calc(100vh - 16px)",
                  overflowY: "auto",
                }}
              >
                <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-txt3">텍스트 서식</p>
                <div className="mb-1 flex items-center gap-0.5 px-2">
                  <ToolbarBtn title="굵게" active={editor.isActive("bold")} onClick={run(() => editor.chain().focus().toggleBold().run())}>
                    <span className="text-[13px] font-bold leading-none">B</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="기울임" active={editor.isActive("italic")} onClick={run(() => editor.chain().focus().toggleItalic().run())}>
                    <span className="text-[13px] italic leading-none">I</span>
                  </ToolbarBtn>
                  <ToolbarBtn title="취소선" active={editor.isActive("strike")} onClick={run(() => editor.chain().focus().toggleStrike().run())}>
                    <span className="text-[13px] leading-none line-through">S</span>
                  </ToolbarBtn>
                  <span
                    className="ml-1 grid h-[24px] w-[14px] shrink-0 place-items-center text-[12px] font-bold leading-none"
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
                </div>

                <div className="my-1 border-t border-line/30" />

                {/* 셀 배경색 — 표 전체 색 기능은 제거하고 이것만 유지한다(요구사항: 표 전체
                    색을 바꾸려면 셀을 전부 선택해 배경색을 적용하면 됨). */}
                <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-txt3">셀 배경색</p>
                <div className="mb-1 flex items-center gap-0.5 px-2">
                  {CELL_COLOR_SWATCHES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      title={`셀 배경색 ${s.label}`}
                      aria-label={`셀 배경색 ${s.label}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={run(() =>
                        updateSelectedCellsAttrs(editor, {
                          cellBackground: cellAttrs.background === s.value ? "none" : s.value,
                        })
                      )}
                      className={cx(
                        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded transition-colors",
                        cellAttrs.background === s.value ? "bg-primary/15 ring-1 ring-primary/50" : "hover:bg-surface2/70"
                      )}
                    >
                      <span className="block h-3 w-3 rounded-full" style={{ background: s.dot }} />
                    </button>
                  ))}
                </div>

                <div className="my-1 border-t border-line/30" />

                {/* 테두리 두께 — 두께를 한 버튼으로 순환시키던 방식은 "지금 몇 px인지/뭘 고를 수
                    있는지"가 안 보인다는 피드백으로, 두께가 다른 가로선 미리보기 + px 라벨을 가진
                    3개의 명시적 버튼으로 바꿨다(선택된 값은 배경/테두리로 강조). */}
                <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-txt3">테두리 두께</p>
                <div className="mb-1 flex items-center gap-1 px-2">
                  {BORDER_WIDTH_OPTIONS.map((w) => {
                    const active = tableAttrs.borderWidth === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        title={`테두리 두께 ${w}px`}
                        aria-label={`테두리 두께 ${w}px`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={run(() => updateActiveTableAttrs(editor, { borderWidth: w }))}
                        className={cx(
                          "flex flex-1 flex-col items-center gap-1 rounded py-1 transition-colors",
                          active ? "bg-primary/15 text-primary ring-1 ring-primary/50" : "text-txt2 hover:bg-surface2/70"
                        )}
                      >
                        <span
                          className="block w-7 rounded-full"
                          style={{ height: w, background: active ? "rgb(var(--primary))" : "rgb(var(--txt2))" }}
                          aria-hidden
                        />
                        <span className="text-[9.5px] leading-none">{w}px</span>
                      </button>
                    );
                  })}
                </div>

                <div className="my-1 border-t border-line/30" />

                <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium text-txt3">표 크기</p>
                <div className="mb-1 flex items-center gap-1 px-2">
                  <select
                    aria-label="표 크기"
                    title="표 크기"
                    value={tableAttrs.widthMode}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => updateActiveTableAttrs(editor, { widthMode: event.target.value as BlockWidthMode })}
                    className="h-6 flex-1 rounded border border-line/50 bg-surface px-1 text-[10.5px] text-txt2 outline-none"
                  >
                    <option value="fit">맞춤</option>
                    <option value="original">원본</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="125">125%</option>
                    <option value="150">150%</option>
                    <option value="custom">사용자 지정</option>
                  </select>
                  <input
                    type="number"
                    min={MIN_BLOCK_PERCENT}
                    max={MAX_BLOCK_PERCENT}
                    aria-label="표 사용자 지정 크기 비율"
                    title="사용자 지정 비율(%)"
                    value={tableAttrs.widthMode === "custom" ? customDraft : ""}
                    placeholder="%"
                    onFocus={() => setCustomDraft(String(tableAttrs.widthPercent ?? 100))}
                    onChange={(event) => setCustomDraft(event.target.value)}
                    onBlur={commitCustomWidth}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); commitCustomWidth(); }
                    }}
                    className="h-6 w-12 rounded border border-line/50 bg-transparent px-1 text-[10.5px] text-txt outline-none"
                  />
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        title="오른쪽에 열 추가"
        aria-label="오른쪽 가장자리에서 열 추가"
        onMouseDown={(event) => event.preventDefault()}
        onClick={run(() => editor.chain().focus().addColumnAfter().run())}
        className="fixed z-[1890] grid h-6 w-6 place-items-center rounded-full border border-primary/35 bg-surface text-primary shadow-soft hover:bg-primary/10"
        style={{
          left: Math.max(4, Math.min(anchor.right - 12, window.innerWidth - 28)),
          top: Math.max(4, Math.min((anchor.top + anchor.bottom) / 2 - 12, window.innerHeight - 28)),
        }}
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        title="아래에 행 추가"
        aria-label="아래쪽 가장자리에서 행 추가"
        onMouseDown={(event) => event.preventDefault()}
        onClick={run(() => editor.chain().focus().addRowAfter().run())}
        className="fixed z-[1890] grid h-6 w-6 place-items-center rounded-full border border-primary/35 bg-surface text-primary shadow-soft hover:bg-primary/10"
        style={{
          left: Math.max(4, Math.min((anchor.left + anchor.right) / 2 - 12, window.innerWidth - 28)),
          top: Math.max(4, Math.min(anchor.bottom - 12, window.innerHeight - 28)),
        }}
      >
        <Plus size={13} />
      </button>
    </>,
    document.body
  );
}
