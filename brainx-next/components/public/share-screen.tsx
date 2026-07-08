"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertCircle } from "lucide-react";
import { getPublicSharedNote, getLinkedNote, type PublicSharedNoteData } from "@/lib/workspace-api";
import { getAssetFileUrl, getPptSlideUrl } from "@/lib/ingestion-api";
import { markdownToHtml } from "@/components/notes/NoteEditor";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/brainx-ui";
import { sanitizeHtml } from "@/lib/safe-html";

/**
 * 노트를 에디터에서 한 번도 연 적이 없으면(예: Notion 가져오기 직후) 콘텐츠가 원본 마크다운
 * 그대로 저장돼 있다(NoteEditor.tsx의 resolveEditorHtml과 동일한 판단 기준: '<'로 시작하면
 * 이미 HTML). 공유 페이지는 processHtml이 HTML을 전제로 동작하므로, 마크다운이면 먼저
 * HTML로 변환해야 ![](asset://...) 같은 문법이 화면에 글자 그대로 노출되지 않는다.
 */
function resolveShareHtml(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (trimmed === "" || trimmed.startsWith("<")) return rawContent;
  return markdownToHtml(rawContent);
}

/**
 * ToggleNode.renderHTML(ToggleNode.tsx:429-431)은 `<div data-type="toggle" data-open
 * data-summary>(자식 콘텐츠)</div>`만 직렬화하고, 제목(summary)은 텍스트가 아니라 속성값으로만
 * 저장한다 — 화살표 아이콘과 제목 텍스트는 전부 ToggleNodeView(React NodeView)가 그린다.
 * 그래서 공유 페이지에서는 제목이 통째로 사라지고 내용만 보인다. 정적 페이지에서도 접기/펼치기가
 * 그대로 동작하도록 표준 <details>/<summary>로 바꾼다(별도 JS 없이 브라우저 기본 기능).
 * 토글 안에는 임의의 블록(중첩 토글·컬럼·이미지 등)이 올 수 있어 안쪽에도 <div>가 얼마든지
 * 나올 수 있으므로, 단순 정규식으로는 자기 자신의 닫는 태그를 정확히 못 찾는다(중첩된 </div>에서
 * 멈춰버림) — <div> 개폐 태그 수를 세어 진짜 짝이 맞는 지점을 찾는다.
 */
function convertToggleBlocks(html: string): string {
  const openTagRe = /<div([^>]*)data-type="toggle"([^>]*)>/;
  let out = "";
  let cursor = 0;

  while (true) {
    const rest = html.slice(cursor);
    const openMatch = openTagRe.exec(rest);
    if (!openMatch) {
      out += rest;
      break;
    }
    const openStart = cursor + openMatch.index;
    const contentStart = openStart + openMatch[0].length;
    const attrs = openMatch[1] + openMatch[2];

    const divTagRe = /<div\b[^>]*>|<\/div>/g;
    divTagRe.lastIndex = contentStart;
    let depth = 1;
    let closeStart = -1;
    let m: RegExpExecArray | null;
    while ((m = divTagRe.exec(html))) {
      if (m[0] === "</div>") {
        depth -= 1;
        if (depth === 0) {
          closeStart = m.index;
          break;
        }
      } else {
        depth += 1;
      }
    }

    if (closeStart === -1) {
      // 닫는 태그를 못 찾으면(깨진 HTML) 더 이상 손대지 않고 나머지를 그대로 둔다.
      out += html.slice(cursor, openStart) + html.slice(openStart);
      break;
    }

    const inner = html.slice(contentStart, closeStart);
    const summaryMatch = attrs.match(/data-summary="([^"]*)"/);
    const openAttrMatch = attrs.match(/data-open="([^"]*)"/);
    const summary = summaryMatch && summaryMatch[1] ? summaryMatch[1] : "토글";
    const isOpen = openAttrMatch ? openAttrMatch[1] === "true" : true;

    out += html.slice(cursor, openStart);
    out += `<details class="share-toggle"${isOpen ? " open" : ""}><summary>${summary}</summary><div class="share-toggle-content">${convertToggleBlocks(inner)}</div></details>`;
    cursor = closeStart + "</div>".length;
  }

  return out;
}

function formatExpiry(isoString: string): string {
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return "만료됨";
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1 ? "1일 후 만료" : `${diffDays}일 후 만료`;
}

function processHtml(html: string, linkedShares: Record<string, string>): string {
  // 위험 태그 제거
  let out = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 토글 블록(<div data-type="toggle">) → <details>/<summary>. 위험 태그 제거 다음, 다른 치환보다
  // 먼저 구조를 풀어둔다(안의 내용은 이후 단계에서 동일하게 처리됨 — 순서에 의존하지 않음).
  out = convertToggleBlocks(out);

  // 헤딩 안에 남아있는 마크다운 문법 "#"/"##"/"###" 제거.
  // NoteEditor.tsx의 markdownToHtml은 "<h1># 제목</h1>"처럼 heading 태그 안에 원본 마크다운
  // 마커를 그대로 남겨두는데(라이브 에디터에서 커서가 그 줄에 있을 때만 보이게 하기 위해),
  // 에디터에서 직접 입력한 heading도 동일하게 텍스트에 "#"가 남는다(NoteEditor.tsx:460 주석 참고).
  // 실제로 화면에 "#"를 숨기는 건 ProseMirror Decoration(NoteEditor.tsx:472-485, cursorInside
  // 여부에 따라 md-heading-syntax/md-heading-syntax-hidden 클래스를 토글)인데, 이건 살아있는
  // ProseMirror 에디터 인스턴스가 있어야만 동작한다. 공유 페이지는 Tiptap 없이 정적 HTML만
  // dangerouslySetInnerHTML로 꽂아 넣으므로 이 decoration이 전혀 붙지 않아 "#"가 일반 텍스트로
  // 그대로 노출된다. 앱 자체의 읽기 모드가 쓰는 것과 같은 판정 정규식(#{1,6}\s*)으로 정적으로
  // 제거한다.
  out = out.replace(/(<h[1-6]>)#{1,6}\s*/g, "$1");

  // markdownToHtml이 asset:// 이미지를 <div data-image-block data-asset-id="..."></div>
  // (빈 div, NodeView가 채워주길 기대하는 자리표시자)로 남겨두는데, 공유 페이지는 Tiptap
  // NodeView가 없어 그대로 두면 아무것도 안 보인다. 실제 <img src="{자산 파일 URL}">로 채운다.
  // (외부 URL 이미지는 markdownToHtml이 이미 <img>를 채워서 내보내므로 본문이 비어있지 않아
  // 아래 정규식(빈 div만 매칭)에 걸리지 않는다.)
  out = out.replace(
    /<div([^>]*data-image-block="true"[^>]*)>\s*<\/div>/g,
    (match: string, attrs: string) => {
      const assetIdMatch = attrs.match(/data-asset-id="([^"]*)"/);
      if (!assetIdMatch) return match;
      const fileNameMatch = attrs.match(/data-file-name="([^"]*)"/);
      const alt = fileNameMatch?.[1] ?? "";
      return `<div data-image-block="true"><img src="${getAssetFileUrl(assetIdMatch[1])}" alt="${alt}"></div>`;
    }
  );

  // PdfBlock/HtmlBlock.renderHTML(PdfBlockNode.tsx:144-146, HtmlBlockNode.tsx:145-147)은
  // <div data-pdf-block data-asset-id data-file-name></div>처럼 내용이 완전히 빈 채로
  // 직렬화된다 — 실제 <iframe> 뷰어는 PdfBlockView/HtmlBlockView(React NodeView)가 그린다.
  // 공유 페이지엔 이 NodeView가 없어 그대로 두면 완전히 빈 화면이 되므로, 같은 자산 URL로
  // 직접 <iframe>을 채운다(에디터가 쓰는 것과 동일한 GET /api/v1/assets/{id}/file).
  out = out.replace(
    /<div([^>]*data-pdf-block="true"[^>]*)>\s*<\/div>/g,
    (match: string, attrs: string) => {
      const assetIdMatch = attrs.match(/data-asset-id="([^"]*)"/);
      if (!assetIdMatch) return match;
      const fileNameMatch = attrs.match(/data-file-name="([^"]*)"/);
      const fileName = fileNameMatch?.[1] || "document.pdf";
      const url = getAssetFileUrl(assetIdMatch[1]);
      return `<div class="share-file-block"><iframe src="${url}" title="${fileName}" class="share-file-frame"></iframe></div>`;
    }
  );

  out = out.replace(
    /<div([^>]*data-html-block="true"[^>]*)>\s*<\/div>/g,
    (match: string, attrs: string) => {
      const assetIdMatch = attrs.match(/data-asset-id="([^"]*)"/);
      if (!assetIdMatch) return match;
      const fileNameMatch = attrs.match(/data-file-name="([^"]*)"/);
      const fileName = fileNameMatch?.[1] || "page.html";
      const url = getAssetFileUrl(assetIdMatch[1]);
      return `<div class="share-file-block"><iframe src="${url}" title="${fileName}" sandbox="allow-same-origin allow-scripts allow-popups" class="share-file-frame"></iframe></div>`;
    }
  );

  // PptBlock도 같은 이유로 빈 div만 저장된다. 슬라이드 넘기기는 상태(currentSlide)가 필요해
  // 정적 페이지에서 그대로 재현할 수 없으므로, 첫 슬라이드 미리보기 이미지 + 원본 파일 다운로드
  // 링크로 대체한다(완전한 인터랙션 대신 "그래도 뭔가는 보이고, 원본은 받을 수 있게").
  out = out.replace(
    /<div([^>]*data-ppt-block="true"[^>]*)>\s*<\/div>/g,
    (match: string, attrs: string) => {
      const assetIdMatch = attrs.match(/data-asset-id="([^"]*)"/);
      if (!assetIdMatch) return match;
      const fileNameMatch = attrs.match(/data-file-name="([^"]*)"/);
      const fileName = fileNameMatch?.[1] || "presentation.pptx";
      const assetId = assetIdMatch[1];
      const slideUrl = getPptSlideUrl(assetId, 0);
      const fileUrl = getAssetFileUrl(assetId);
      return (
        `<div class="share-file-block share-ppt-block">` +
        `<img src="${slideUrl}" alt="${fileName} 첫 슬라이드" class="share-ppt-preview">` +
        `<a href="${fileUrl}" target="_blank" rel="noreferrer" class="share-file-link">${fileName} 다운로드</a>` +
        `</div>`
      );
    }
  );

  // [[위키 링크]] span → 공유 링크 or 배지
  // 주의: WikiLinkNode.renderHTML(WikiLinkNode.tsx:129-137)이 직렬화하는 span의 텍스트는
  // `[[Title]]`처럼 대괄호를 그대로 포함한다 — 실제로 대괄호를 지우고 제목만 보여주는 건
  // 라이브 에디터에서만 붙는 WikiLinkView라는 React NodeView(WikiLinkNode.tsx:30-73)인데,
  // 이 컴포넌트는 살아있는 Tiptap 인스턴스가 있어야 렌더링된다. 공유 페이지는 그 NodeView가
  // 없으니 span의 텍스트(대괄호 포함)를 그대로 쓰면 "[[제목]]"이 문자 그대로 노출된다.
  // WikiLinkView와 동일하게 alias ?? title을 표시 텍스트로 쓰고 대괄호는 버린다.
  out = out.replace(
    /<span([^>]*data-wiki-link="true"[^>]*)>(.*?)<\/span>/g,
    (_match, attrs: string, inner: string) => {
      const titleMatch = attrs.match(/data-title="([^"]+)"/);
      const aliasMatch = attrs.match(/data-alias="([^"]*)"/);
      const title = titleMatch?.[1] ?? inner.replace(/^\[\[|\]\]$/g, "");
      const display = aliasMatch?.[1] || title;
      const shareUrl = linkedShares[title];
      if (shareUrl) {
        return `<a href="${shareUrl}" class="wiki-share-link">${display}</a>`;
      }
      return `<span class="wiki-link-badge" title="공유되지 않은 노트">${display}</span>`;
    }
  );

  // 다단 컬럼의 드래그로 지정된 칸 너비(data-width, %) → 인라인 flex 스타일
  // (에디터에서는 ColumnView의 NodeView가 런타임에 계산해 넣지만, 공유 페이지는 저장된
  // HTML을 그대로 꽂아 넣을 뿐이라 여기서 직접 반영해야 한다)
  // 주의: Column.renderHTML(mergeAttributes)이 실제로 만드는 속성 순서는
  // `data-width="..." data-type="column"`로, data-width가 먼저 온다. 예전 정규식은
  // data-type="column" 다음에 data-width가 온다고 가정해서 실제 저장된 HTML과 순서가
  // 어긋나 한 번도 매치되지 않았다(항상 균등 폭으로만 보였다) — 속성 순서에 의존하지 않도록
  // data-type="column" 매치와 data-width 추출을 분리한다.
  out = out.replace(
    /<div([^>]*data-type="column"[^>]*)>/g,
    (match: string, attrs: string) => {
      if (/style="/.test(attrs)) return match;
      const widthMatch = attrs.match(/data-width="(\d+(?:\.\d+)?)"/);
      if (!widthMatch) return match;
      return `<div${attrs} style="flex: 0 0 ${widthMatch[1]}%">`;
    }
  );

  // brainx-note://noteId 직접 링크
  out = out.replace(/href="brainx-note:\/\/([^"]+)"/g, (_match, noteId: string) => {
    const shareUrl = linkedShares[noteId];
    if (shareUrl) return `href="${shareUrl}"`;
    return `href="#" data-brainx-note="${noteId}" onclick="return false;"`;
  });

  // plain [[title]] 마크다운 — HTML로 재저장되기 전 노트 대응 (대괄호는 표시하지 않는다)
  out = out.replace(/\[\[([^\[\]|#\n]+?)(?:[#|][^\[\]]*)?\]\]/g, (_match, title: string) => {
    const t = title.trim();
    const shareUrl = linkedShares[t];
    if (shareUrl) {
      return `<a href="${shareUrl}" class="wiki-share-link">${t}</a>`;
    }
    return `<span class="wiki-link-badge" title="공유되지 않은 노트">${t}</span>`;
  });

  return out;
}

interface ShareScreenProps {
  shareId?: string;
  noteId?: string;
}

export function ShareScreen({ shareId, noteId }: ShareScreenProps = {}) {
  const router = useRouter();
  const [note, setNote] = useState<PublicSharedNoteData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "expired" | "notfound" | "err">("loading");
  const [processedHtml, setProcessedHtml] = useState<string>("");

  useEffect(() => {
    if (!shareId) { setStatus("notfound"); return; }
    const fetcher = noteId
      ? getLinkedNote(shareId, noteId)
      : getPublicSharedNote(shareId);
    fetcher
      .then((data) => {
        setNote(data);
        setProcessedHtml(sanitizeHtml(processHtml(resolveShareHtml(data.markdown ?? ""), data.linkedShares ?? {})));
        setStatus("ok");
      })
      .catch((e: Error) => {
        if (e.message === "GONE") setStatus("expired");
        else if (e.message === "NOT_FOUND") setStatus("notfound");
        else setStatus("err");
      });
  }, [shareId, noteId]);

  return (
    <div data-route className="h-full overflow-y-auto scroll bg-bg">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-line/40 bg-bg/80 px-5 backdrop-blur-xl">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2">
          <BrandLogo size={28} showWordmark />
        </button>
        <div className="flex-1" />
        {status === "ok" && note && (
          <div className="flex items-center gap-1.5 rounded-full border border-line/40 bg-surface2/50 px-2.5 py-1 text-[11px] text-txt3">
            <Clock size={11} />
            {formatExpiry(note.expiresAt)}
          </div>
        )}
        <div className="ml-3">
          <ThemeToggle />
        </div>
      </header>

      {/* 로딩 */}
      {status === "loading" && (
        <div className="flex h-[60vh] items-center justify-center text-[13px] text-txt3">
          노트를 불러오는 중…
        </div>
      )}

      {/* 에러 상태 */}
      {(status === "expired" || status === "notfound" || status === "err") && (
        <div className="mx-auto mt-20 max-w-md px-6 text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-txt3/40" />
          <h2 className="mb-2 text-[20px] font-semibold text-txt">
            {status === "expired" ? "만료된 공유 링크" : status === "notfound" ? "링크를 찾을 수 없어요" : "오류가 발생했어요"}
          </h2>
          <p className="mb-6 text-[14px] text-txt3">
            {status === "expired"
              ? "이 공유 링크는 만료되었거나 비활성화되었어요."
              : status === "notfound"
                ? "공유 링크가 존재하지 않아요."
                : "잠시 후 다시 시도해 주세요."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg bg-primary/10 px-4 py-2 text-[13px] font-medium text-primary hover:bg-primary/20"
          >
            BrainX 홈으로
          </button>
        </div>
      )}

      {/* 노트 본문 */}
      {status === "ok" && note && (
        <article className="mx-auto max-w-2xl px-6 py-12">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-txt3">
            공유된 노트
          </div>
          <h1 className="mb-5 text-[34px] font-bold tracking-tight text-txt">
            {note.title || "제목 없음"}
          </h1>

          <div className="mb-8 flex items-center gap-2 border-b border-line/40 pb-6 text-[13px] text-txt3">
            <span>{note.author?.nickname ?? "BrainX 사용자"}</span>
            <span>·</span>
            <span>읽기 전용</span>
          </div>

          <div
            className="share-content"
            dangerouslySetInnerHTML={{ __html: processedHtml }}
          />
        </article>
      )}
    </div>
  );
}
