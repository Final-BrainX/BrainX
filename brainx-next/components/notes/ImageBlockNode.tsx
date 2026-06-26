"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { ImageOff } from "lucide-react";
import { cx } from "@/lib/utils";
import { getAssetFileUrl } from "@/lib/ingestion-api";
import {
  BlockSizeToolbar,
  blockContentStyle,
  blockFrameStyle,
  blockJustify,
  type BlockAlign,
  type BlockWidthMode,
} from "./BlockControls";
import { startBlockDrag } from "./DragHandleExtension";

/** 클립보드/드래그앤드롭으로 들어온 이미지 파일을 base64 data URL로 읽어 지정 위치(또는 현재
    커서)에 이미지 블록으로 삽입한다. 파일 읽기가 비동기라 handlePaste/handleDrop처럼 동기
    반환값이 필요한 곳에서는 호출 직후 true를 반환하고, 실제 삽입은 콜백에서 수행한다.
    TODO: 실제 서비스에서는 base64 대신 업로드 API(S3/MinIO)에 파일을 보내고 반환된 URL을
    src로 사용해야 한다 — 지금은 백엔드 업로드 연동이 없는 프론트 데모 단계라 base64로 처리. */
export function insertImageBlockFromFile(view: EditorView, file: File, pos?: number) {
  const reader = new FileReader();
  reader.onload = () => {
    const src = typeof reader.result === "string" ? reader.result : null;
    if (!src) return;
    const insertPos = pos ?? view.state.selection.from;
    const node = view.state.schema.nodes.imageBlock.create({
      src,
      alt: file.name,
      align: "center",
      widthMode: "fit",
    });
    view.dispatch(view.state.tr.insert(insertPos, node));
  };
  reader.readAsDataURL(file);
}

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    imageBlock: {
      setImageBlock: (attrs: { src: string; alt?: string | null }) => ReturnType;
    };
  }
}

function ImageBlockView({ node, updateAttributes, selected, getPos, editor }: NodeViewProps) {
  const [broken, setBroken] = useState(false);
  const assetId      = (node.attrs.assetId as string | null) ?? null;
  // 파일 가져오기로 만들어진 노트는 base64/외부 URL이 아니라 자산 참조(assetId)만 갖고
  // 있으므로, 원본 바이너리 스트리밍 엔드포인트 URL을 그 자리에서 계산해 사용한다.
  const src          = assetId ? getAssetFileUrl(assetId) : ((node.attrs.src as string) ?? "");
  const alt          = (node.attrs.alt as string) ?? "";
  const align        = (node.attrs.align as BlockAlign) ?? "center";
  const widthMode    = (node.attrs.widthMode as BlockWidthMode) ?? "fit";
  const widthPercent = (node.attrs.widthPercent as number | null) ?? null;

  // 50/75/125/150% 같은 비율 프리셋은 "원본 픽셀 크기"를 알아야 계산할 수 있다(컨테이너
  // 폭 기준 계산이 이번 수정의 대상 버그였다) — <img>의 naturalWidth를 측정해 둔다.
  // "원본"/"맞춤" 모드는 이 값과 무관하게 순수 CSS(아래 frameStyle/contentStyle)로 처리되어
  // 측정 전에도 깜빡임 없이 항상 정확하다.
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalWidthPx, setNaturalWidthPx] = useState<number | null>(null);

  useEffect(() => setNaturalWidthPx(null), [src]);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setNaturalWidthPx(img.naturalWidth);
  }, [src]);

  // 크기 툴바는 이제 document.body에 portal로 뜬다(Split View 좁은 패널에서 글자가 세로로
  // 깨지거나 잘리는 문제 방지, BlockControls.tsx 참고) — 그래서 CSS group-hover 대신 이
  // wrapper의 실제 hover를 JS 상태로 추적해 anchor로 넘긴다.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const isOriginal = widthMode === "original";
  const frameStyle = isOriginal
    ? { width: "100%", maxWidth: "100%" }
    : blockFrameStyle(widthMode, widthPercent, naturalWidthPx);
  const contentStyle = isOriginal
    ? { width: "max-content", maxWidth: "none" }
    : blockContentStyle(widthMode, widthPercent, naturalWidthPx);

  return (
    <NodeViewWrapper className="split-image-block my-3">
      {/* NodeViewWrapper는 forwardRef가 아니라 ref를 직접 못 받는다 — hover 감지/위치 측정용
          ref는 이 안쪽 div에 둔다. */}
      <div
        ref={wrapperRef}
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={(event) => {
          // 네이티브 HTML5 드래그(draggable) 대신 ⠿ 손잡이와 같은 마우스 이벤트 기반 드래그로
          // 옮긴다 — 노션처럼 이미지를 직접 잡고 끌 때도 휠 스크롤이 되게 하려는 목적
          // (네이티브 드래그 중에는 브라우저가 'wheel' 이벤트를 보내지 않는다, DragHandleExtension
          // 참고). 클릭만으로는 드래그가 시작되지 않게 preventDefault만 하고 실제 시작은
          // mousemove가 충분히 움직였을 때만 하지 않고 즉시 시작한다 — 손잡이 드래그와 동일한
          // 단순한 동작(클릭 즉시 드래그 상태)으로 통일.
          if (!editor.isEditable) return;
          const pos = getPos();
          if (pos == null) return;
          event.preventDefault();
          startBlockDrag(pos);
        }}
      >
        <BlockSizeToolbar
          value={{ align, widthMode, widthPercent }}
          onChange={(next) => updateAttributes(next)}
          anchorRef={wrapperRef}
          visible={hovered || selected}
        />
        <div className="flex" style={{ justifyContent: blockJustify(align) }}>
          <div
            style={{ ...frameStyle, overflowX: "auto" }}
            className={cx(
              "rounded-lg",
              selected && "outline outline-2 outline-offset-2 outline-primary/60"
            )}
          >
            <div style={contentStyle}>
              {broken || !src ? (
                <div className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line/60 text-txt3">
                  <ImageOff size={18} />
                  <span className="text-[11px]">이미지를 불러올 수 없습니다</span>
                </div>
              ) : (
                <img
                  ref={imgRef}
                  src={src}
                  alt={alt}
                  onLoad={(e) => setNaturalWidthPx(e.currentTarget.naturalWidth)}
                  onError={() => setBroken(true)}
                  draggable={false}
                  style={{
                    display: "block",
                    width: isOriginal ? "auto" : "100%",
                    maxWidth: isOriginal ? "none" : "100%",
                    height: "auto",
                    borderRadius: "0.5rem",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

/** 노트 본문에 삽입되는 이미지 블록. 텍스트 노드가 아닌 atom(leaf) 노드라 캡션/주변 텍스트
    편집과 독립적으로 정렬·크기를 가질 수 있다(코드블록의 mermaid 옵션과 동일한 패턴 공유,
    `BlockControls.tsx` 참고). 실제 업로드 API가 없으므로 src는 data URL(base64)/외부
    URL을 그대로 저장한다.
    TODO: 운영 환경에서는 paste/drop 시 base64 대신 S3/MinIO에 업로드하고 반환된 asset URL을
    src에 저장해야 한다(현재는 프론트 데모 단계라 base64 직접 저장). */
export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  // 네이티브 HTML5 드래그(draggable:true)로 두면 옮길 수는 있지만, 네이티브 드래그 중에는
  // 브라우저가 'wheel' 이벤트를 전혀 보내지 않아(크로미움 공통 동작) 휠로 스크롤하며 옮길 수
  // 없다. 노션처럼 이미지를 직접 잡고 끌어도 휠이 되게, ImageBlockView의 onMouseDown에서
  // DragHandleExtension의 ⠿ 손잡이와 동일한(일반 마우스 이벤트 기반) 드래그를 시작한다.
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-asset-id"),
        renderHTML: (attrs) => (attrs.assetId ? { "data-asset-id": String(attrs.assetId) } : {}),
      },
      align: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-align") ?? "center",
        renderHTML: (attrs) => ({ "data-align": String(attrs.align ?? "center") }),
      },
      widthMode: {
        default: "fit",
        parseHTML: (el) => el.getAttribute("data-width-mode") ?? "fit",
        renderHTML: (attrs) => ({ "data-width-mode": String(attrs.widthMode ?? "fit") }),
      },
      widthPercent: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-width-percent");
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) =>
          attrs.widthPercent ? { "data-width-percent": String(attrs.widthPercent) } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-image-block]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const assetId = el.getAttribute("data-asset-id");
          const img = el.querySelector("img");
          // 파일 가져오기로 만들어진 노트는 <img>가 없는 자산 참조 전용 블록(assetId만)이다.
          if (!assetId && !img) return false;
          return {
            assetId,
            src: img?.getAttribute("src") ?? null,
            alt: img?.getAttribute("alt") ?? el.getAttribute("data-file-name") ?? null,
            align: el.getAttribute("data-align") ?? "center",
            widthMode: el.getAttribute("data-width-mode") ?? "fit",
            widthPercent: el.getAttribute("data-width-percent")
              ? Number(el.getAttribute("data-width-percent"))
              : null,
          };
        },
      },
      // 외부 HTML/마크다운 변환 등에서 단순 <img> 태그만 오는 경우의 폴백
      { tag: "img" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, alt, assetId } = node.attrs;
    // 자산 참조 이미지는 src를 굳이 직렬화하지 않는다 — 백엔드 base URL이 바뀌어도
    // 다음 로드 때 assetId로 다시 계산되도록 한다(PdfBlock과 동일한 패턴).
    if (assetId) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, { "data-image-block": "true", "data-file-name": alt ?? "" }),
      ];
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-image-block": "true" }),
      ["img", { src, alt: alt ?? "" }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },

  addCommands() {
    return {
      setImageBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { align: "center", widthMode: "fit", ...attrs } }),
    };
  },

  addInputRules() {
    return [
      // 마크다운 이미지 문법 ![alt](url) + 공백/줄바꿈 입력 시 자동으로 이미지 블록으로 변환
      nodeInputRule({
        find: /(?:^|\s)!\[([^\]]*)\]\((\S+)\)\s$/,
        type: this.type,
        getAttributes: (match) => ({ alt: match[1] || null, src: match[2] }),
      }),
    ];
  },
});
