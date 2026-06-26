"use client";

import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { cx } from "@/lib/utils";
import { getAssetFileUrl } from "@/lib/ingestion-api";
import { startBlockDrag } from "./DragHandleExtension";

function decodeHtmlEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** 노트 본문이 PDF 임베드 블록 하나로만 이루어져 있으면(파일 가져오기로 만들어진 PDF 노트),
    Tiptap 에디터를 띄우는 대신 전용 PdfViewerPanel을 화면 전체로 보여주기 위해 사용한다. */
export function parsePdfOnlyNote(content: string): { assetId: string; fileName: string } | null {
  const trimmed = content.trim();
  const match = /^<div data-pdf-block="true" data-asset-id="([^"]+)" data-file-name="([^"]*)"><\/div>$/.exec(trimmed);
  if (!match) return null;
  return { assetId: match[1], fileName: decodeHtmlEntities(match[2]) };
}

function PdfBlockView({ node, selected, getPos, editor }: NodeViewProps) {
  const assetId = (node.attrs.assetId as string) ?? "";
  const fileName = (node.attrs.fileName as string) ?? "document.pdf";
  const url = assetId ? getAssetFileUrl(assetId) : "";

  const frameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement === frameRef.current) {
      void document.exitFullscreen();
    } else {
      void frameRef.current?.requestFullscreen();
    }
  };

  return (
    <NodeViewWrapper className="split-pdf-block my-3">
      <div
        ref={frameRef}
        className={cx(
          "overflow-hidden rounded-lg border border-line/60",
          selected && "outline outline-2 outline-offset-2 outline-primary/60",
          isFullscreen && "rounded-none bg-surface"
        )}
      >
        {/* iframe 안의 클릭은 부모 문서로 전파되지 않으므로(별도 브라우징 컨텍스트), 드래그
            시작은 이 헤더 바에서만 받는다 — 네이티브 드래그 대신 ⠿ 손잡이와 동일한 휠-호환
            드래그 시스템을 쓴다(DragHandleExtension 참고). 버튼/링크 클릭은 그대로 동작해야
            하므로 제외한다. */}
        <div
          className="flex items-center justify-between gap-2 border-b border-line/40 bg-surface2/40 px-3 py-2 cursor-grab"
          onMouseDown={(event) => {
            if (!editor.isEditable) return;
            if ((event.target as HTMLElement).closest("button, a")) return;
            const pos = getPos();
            if (pos == null) return;
            event.preventDefault();
            startBlockDrag(pos);
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={15} className="shrink-0 text-txt3" />
            <span className="min-w-0 truncate text-[13px] font-medium text-txt2">{fileName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {url && !isFullscreen && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
              >
                새 탭에서 열기
                <ExternalLink size={12} />
              </a>
            )}
            {url && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-1 text-[12px] text-txt3 hover:text-txt"
              >
                {isFullscreen ? "전체화면 종료" : "큰 화면으로 보기"}
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            )}
          </div>
        </div>
        {url ? (
          <iframe
            src={url}
            title={fileName}
            className={cx("w-full bg-surface", isFullscreen ? "h-[calc(100vh-41px)]" : "h-[85vh]")}
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-[13px] text-txt3">
            원본 PDF를 불러올 수 없습니다.
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** 가져오기로 만들어진 노트의 본문 전체를 채우는 PDF 원본 뷰어 블록(옵시디언의 PDF 임베드와
    동일한 역할). 추출 텍스트는 따로 붙이지 않고, iframe으로 원본 바이너리
    (GET /api/v1/assets/{assetId}/file)를 그대로 큰 화면으로 보여준다. */
export const PdfBlock = Node.create({
  name: "pdfBlock",
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
    };
  },

  parseHTML() {
    return [{ tag: "div[data-pdf-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-pdf-block": "true" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfBlockView);
  },
});
