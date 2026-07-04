"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Presentation, ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { getPptSlideUrl, getAssetFileUrl } from "@/lib/ingestion-api";
import { startBlockDrag } from "./DragHandleExtension";

function decodeHtmlEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parsePptOnlyNote(content: string): { assetId: string; fileName: string; slideCount: number } | null {
  const trimmed = content.trim();
  const match = /^<div data-ppt-block="true" data-asset-id="([^"]+)" data-file-name="([^"]*)" data-slide-count="(\d+)"><\/div>$/.exec(trimmed);
  if (!match) return null;
  return { assetId: match[1], fileName: decodeHtmlEntities(match[2]), slideCount: parseInt(match[3], 10) };
}

function PptBlockView({ node, selected, getPos, editor }: NodeViewProps) {
  const assetId = (node.attrs.assetId as string) ?? "";
  const fileName = (node.attrs.fileName as string) ?? "presentation.pptx";
  const slideCount = (node.attrs.slideCount as number) ?? 1;

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slideUrl = assetId ? getPptSlideUrl(assetId, currentSlide) : "";
  const downloadUrl = assetId ? getAssetFileUrl(assetId) : "";

  const prev = () => setCurrentSlide((s) => Math.max(0, s - 1));
  const next = () => setCurrentSlide((s) => Math.min(slideCount - 1, s + 1));

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prev(); }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); next(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, currentSlide, slideCount]);

  return (
    <NodeViewWrapper className="split-ppt-block my-3">
      <div
        ref={containerRef}
        className={cx(
          "overflow-hidden rounded-lg border border-line/60",
          selected && !isFullscreen && "outline outline-2 outline-offset-2 outline-primary/60",
          isFullscreen && "flex flex-col bg-black"
        )}
      >
        {/* 헤더 */}
        <div
          className={cx(
            "flex items-center justify-between gap-2 border-b px-3 py-2 shrink-0",
            isFullscreen
              ? "border-white/10 bg-black/80 cursor-default"
              : "border-line/40 bg-surface2/40 cursor-grab"
          )}
          onMouseDown={(event) => {
            if (isFullscreen) return;
            if (!editor.isEditable) return;
            if ((event.target as HTMLElement).closest("button, a")) return;
            const pos = getPos();
            if (pos == null) return;
            event.preventDefault();
            startBlockDrag(pos);
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Presentation size={15} className={cx("shrink-0", isFullscreen ? "text-white/60" : "text-txt3")} />
            <span className={cx("min-w-0 truncate text-[13px] font-medium", isFullscreen ? "text-white/80" : "text-txt2")}>
              {fileName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {downloadUrl && !isFullscreen && (
              <a
                href={downloadUrl}
                download={fileName}
                className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
              >
                다운로드
                <ExternalLink size={12} />
              </a>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={cx(
                "flex items-center gap-1 text-[12px]",
                isFullscreen ? "text-white/70 hover:text-white" : "text-txt3 hover:text-txt"
              )}
            >
              {isFullscreen ? "전체화면 종료" : "전체화면"}
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>

        {/* 슬라이드 이미지 */}
        <div className={cx("relative bg-black flex items-center justify-center", isFullscreen ? "flex-1" : "h-[70vh]")}>
          {slideUrl ? (
            <img
              key={slideUrl}
              src={slideUrl}
              alt={`슬라이드 ${currentSlide + 1}`}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="text-[13px] text-txt3">슬라이드를 불러올 수 없습니다.</div>
          )}

          {/* 이전/다음 버튼 */}
          {slideCount > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                disabled={currentSlide === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60 disabled:opacity-20"
              >
                <ChevronLeft size={isFullscreen ? 28 : 20} />
              </button>
              <button
                type="button"
                onClick={next}
                disabled={currentSlide === slideCount - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60 disabled:opacity-20"
              >
                <ChevronRight size={isFullscreen ? 28 : 20} />
              </button>
            </>
          )}

          {/* 전체화면에서 ESC 안내 */}
          {isFullscreen && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-[11px] text-white/40 pointer-events-none select-none">
              ESC 또는 버튼으로 전체화면 종료
            </div>
          )}
        </div>

        {/* 하단 슬라이드 카운터 */}
        <div
          className={cx(
            "flex items-center justify-center gap-3 border-t px-3 py-1.5 shrink-0",
            isFullscreen ? "border-white/10 bg-black/80" : "border-line/40 bg-surface2/40"
          )}
        >
          <span className={cx("text-[12px]", isFullscreen ? "text-white/60" : "text-txt3")}>
            {currentSlide + 1} / {slideCount}
          </span>
          {slideCount > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: Math.min(slideCount, 10) }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentSlide(i)}
                  className={cx(
                    "h-1.5 rounded-full transition-all",
                    i === currentSlide
                      ? "w-4 bg-primary"
                      : isFullscreen
                        ? "w-1.5 bg-white/20 hover:bg-white/50"
                        : "w-1.5 bg-line hover:bg-txt3"
                  )}
                />
              ))}
              {slideCount > 10 && (
                <span className={cx("text-[11px] self-center", isFullscreen ? "text-white/40" : "text-txt3")}>...</span>
              )}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const PptBlock = Node.create({
  name: "pptBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-asset-id"),
        renderHTML: (attrs) => (attrs.assetId ? { "data-asset-id": String(attrs.assetId) } : {}),
      },
      fileName: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-name"),
        renderHTML: (attrs) => (attrs.fileName ? { "data-file-name": String(attrs.fileName) } : {}),
      },
      slideCount: {
        default: 1,
        parseHTML: (el) => parseInt(el.getAttribute("data-slide-count") ?? "1", 10),
        renderHTML: (attrs) => ({ "data-slide-count": String(attrs.slideCount ?? 1) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-ppt-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-ppt-block": "true" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PptBlockView);
  },
});
