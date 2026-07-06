"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertCircle } from "lucide-react";
import { getPublicSharedNote, getLinkedNote, type PublicSharedNoteData } from "@/lib/workspace-api";
import { getAssetFileUrl } from "@/lib/ingestion-api";
import { markdownToHtml } from "@/components/notes/NoteEditor";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/brainx-ui";

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

  // [[위키 링크]] span → 공유 링크 or 배지
  out = out.replace(
    /<span([^>]*data-wiki-link="true"[^>]*)>(.*?)<\/span>/g,
    (_match, attrs: string, inner: string) => {
      const titleMatch = attrs.match(/data-title="([^"]+)"/);
      const title = titleMatch?.[1] ?? inner;
      const shareUrl = linkedShares[title];
      if (shareUrl) {
        return `<a href="${shareUrl}" class="wiki-share-link">${inner}</a>`;
      }
      return `<span class="wiki-link-badge" title="공유되지 않은 노트">${inner}</span>`;
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

  // plain [[title]] 마크다운 — HTML로 재저장되기 전 노트 대응
  out = out.replace(/\[\[([^\[\]|#\n]+?)(?:[#|][^\[\]]*)?\]\]/g, (_match, title: string) => {
    const t = title.trim();
    const shareUrl = linkedShares[t];
    if (shareUrl) {
      return `<a href="${shareUrl}" class="wiki-share-link">[[${t}]]</a>`;
    }
    return `<span class="wiki-link-badge" title="공유되지 않은 노트">[[${t}]]</span>`;
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
        setProcessedHtml(processHtml(resolveShareHtml(data.markdown ?? ""), data.linkedShares ?? {}));
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
