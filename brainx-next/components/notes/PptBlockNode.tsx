"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2, Presentation } from "lucide-react";
import { isElectronDesktop } from "@/lib/desktop-bridge";
import { openDesktopVaultAsset } from "@/lib/desktop-vault";
import { getAssetFileUrl, getPptSlideUrl, isDesktopVaultAssetId } from "@/lib/ingestion-api";
import { cx } from "@/lib/utils";
import { getPptSlideUrl, getPptSlideVideoUrl, getAssetFileUrl } from "@/lib/ingestion-api";
import { startBlockDrag } from "./DragHandleExtension";

function decodeHtmlEntities(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function parsePptOnlyNote(content: string): { assetId: string; fileName: string; slideCount: number; videoSlides: number[] } | null {
  const trimmed = content.trim();
  const match = /^<div data-ppt-block="true" data-asset-id="([^"]+)" data-file-name="([^"]*)" data-slide-count="(\d+)"(?: data-video-slides="([^"]*)")?><\/div>$/.exec(trimmed);
  if (!match) return null;
  const videoSlides = match[4] ? match[4].split(",").map(Number).filter((n) => !isNaN(n)) : [];
  return { assetId: match[1], fileName: decodeHtmlEntities(match[2]), slideCount: parseInt(match[3], 10), videoSlides };
}

function PptBlockView({ node, selected, getPos, editor }: NodeViewProps) {
  const assetId = (node.attrs.assetId as string) ?? "";
  const fileName = (node.attrs.fileName as string) ?? "presentation.pptx";
  const slideCount = (node.attrs.slideCount as number) ?? 1;
  const videoSlideSet = new Set<number>((node.attrs.videoSlides as number[]) ?? []);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isVideoSlide = videoSlideSet.has(currentSlide);
  const slideUrl = assetId && !isVideoSlide ? getPptSlideUrl(assetId, currentSlide) : "";
  const slideVideoUrl = assetId && isVideoSlide ? getPptSlideVideoUrl(assetId, currentSlide) : "";
  const downloadUrl = assetId ? getAssetFileUrl(assetId) : "";

  const prev = () => setCurrentSlide((value) => Math.max(0, value - 1));
  const next = () => setCurrentSlide((value) => Math.min(slideCount - 1, value + 1));

  const openExternal = useCallback(async () => {
    if (isElectronDesktop() && isLocalVaultAsset) {
      await openDesktopVaultAsset(assetId);
      return;
    }
    if (!downloadUrl) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  }, [assetId, downloadUrl, isLocalVaultAsset]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        prev();
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, slideCount]);

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
        <div
          className={cx(
            "shrink-0 border-b px-3 py-2",
            "flex items-center justify-between gap-2",
            isFullscreen ? "border-white/10 bg-black/80 cursor-default" : "border-line/40 bg-surface2/40 cursor-grab"
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
              <button
                type="button"
                onClick={() => void openExternal()}
                className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
              >
                Open externally
                <ExternalLink size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={cx(
                "flex items-center gap-1 text-[12px]",
                isFullscreen ? "text-white/70 hover:text-white" : "text-txt3 hover:text-txt"
              )}
            >
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>

        {/* 슬라이드 */}
        <div className={cx("relative bg-black flex items-center justify-center", isFullscreen ? "flex-1" : "h-[70vh]")}>
          {isVideoSlide && slideVideoUrl ? (
            <video
              key={slideVideoUrl}
              src={slideVideoUrl}
              controls
              className="max-h-full max-w-full"
              draggable={false}
            />
          ) : slideUrl ? (
            <img
              key={slideUrl}
              src={slideUrl}
              alt={`Slide ${currentSlide + 1}`}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : isLocalVaultAsset ? (
            <div className="flex max-w-[380px] flex-col items-center gap-3 px-6 text-center">
              <Presentation size={28} className="text-white/60" />
              <div className="text-[13px] font-medium text-white/80">
                Local vault PPT files do not have generated slide previews yet.
              </div>
              <div className="text-[12px] leading-5 text-white/45">
                Open the presentation in a desktop viewer to inspect or edit it.
              </div>
              <button
                type="button"
                onClick={() => void openExternal()}
                className="rounded-full border border-white/20 px-3 py-1.5 text-[12px] font-medium text-white/80 transition hover:border-white/35 hover:text-white"
              >
                Open presentation
              </button>
            </div>
          ) : (
            <div className="text-[13px] text-txt3">Unable to load slide preview.</div>
          )}

          {slideUrl && slideCount > 1 && (
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

          {isFullscreen && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 select-none rounded bg-black/50 px-3 py-1 text-[11px] text-white/40">
              Press ESC or use the button to exit fullscreen
            </div>
          )}
        </div>

        <div
          className={cx(
            "shrink-0 border-t px-3 py-1.5",
            "flex items-center justify-center gap-3",
            isFullscreen ? "border-white/10 bg-black/80" : "border-line/40 bg-surface2/40"
          )}
        >
          <span className={cx("text-[12px]", isFullscreen ? "text-white/60" : "text-txt3")}>
            {Math.min(currentSlide + 1, slideCount)} / {slideCount}
          </span>
          {slideUrl && slideCount > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: Math.min(slideCount, 10) }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentSlide(index)}
                  className={cx(
                    "h-1.5 rounded-full transition-all",
                    index === currentSlide
                      ? "w-4 bg-primary"
                      : isFullscreen
                        ? "w-1.5 bg-white/20 hover:bg-white/50"
                        : "w-1.5 bg-line hover:bg-txt3"
                  )}
                />
              ))}
              {slideCount > 10 && (
                <span className={cx("self-center text-[11px]", isFullscreen ? "text-white/40" : "text-txt3")}>...</span>
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
        parseHTML: (element) => element.getAttribute("data-asset-id"),
        renderHTML: (attributes) => (attributes.assetId ? { "data-asset-id": String(attributes.assetId) } : {}),
      },
      fileName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-file-name"),
        renderHTML: (attributes) => (attributes.fileName ? { "data-file-name": String(attributes.fileName) } : {}),
      },
      slideCount: {
        default: 1,
        parseHTML: (element) => parseInt(element.getAttribute("data-slide-count") ?? "1", 10),
        renderHTML: (attributes) => ({ "data-slide-count": String(attributes.slideCount ?? 1) }),
      },
      videoSlides: {
        default: [] as number[],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-video-slides");
          if (!raw) return [];
          return raw.split(",").map(Number).filter((n) => !isNaN(n));
        },
        renderHTML: (attrs) => {
          const vs = attrs.videoSlides as number[];
          return vs && vs.length > 0 ? { "data-video-slides": vs.join(",") } : {};
        },
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
