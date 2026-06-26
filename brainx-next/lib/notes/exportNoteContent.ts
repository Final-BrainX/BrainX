"use client";

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { fetchImageViaProxy, getAssetFileUrl } from "@/lib/ingestion-api";

/**
 * 백엔드 POST /api/v1/exports는 SSOT 문서에도 명시된 MVP 스텁이라 실제 파일을 만들지 않고
 * 존재하지 않는 cdn.brainx.com URL만 돌려준다(클릭해도 받아지는 게 없음). 백엔드가 실제
 * 렌더링을 구현하기 전까지는, 노트가 이미 들고 있는 HTML 본문을 여기서 직접 변환해 내려준다.
 * 백엔드 호출(POST /api/v1/exports)은 계약대로 계속 보내되 best-effort로만 처리한다.
 */

function plainTextOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  return Array.from(node.childNodes).map(plainTextOf).join("");
}

export function htmlToPlainText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("p, div, h1, h2, h3, h4, li, tr, blockquote, pre, br").forEach((el) => {
    el.insertAdjacentText("afterend", "\n");
  });
  return (container.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(inlineMarkdown).join("");
  switch (el.tagName) {
    case "STRONG":
    case "B":
      return `**${inner}**`;
    case "EM":
    case "I":
      return `_${inner}_`;
    case "CODE":
      return `\`${inner}\``;
    case "A":
      return `[${inner}](${el.getAttribute("href") ?? ""})`;
    case "BR":
      return "\n";
    default:
      return inner;
  }
}

function blockMarkdown(el: Element, lines: string[]) {
  switch (el.tagName) {
    case "H1":
      lines.push(`# ${inlineMarkdown(el)}`);
      return;
    case "H2":
      lines.push(`## ${inlineMarkdown(el)}`);
      return;
    case "H3":
      lines.push(`### ${inlineMarkdown(el)}`);
      return;
    case "BLOCKQUOTE":
      lines.push(`> ${inlineMarkdown(el)}`);
      return;
    case "PRE":
      lines.push(`\`\`\`\n${plainTextOf(el)}\n\`\`\``);
      return;
    case "UL":
      Array.from(el.children).forEach((li) => lines.push(`- ${inlineMarkdown(li)}`));
      return;
    case "OL":
      Array.from(el.children).forEach((li, idx) => lines.push(`${idx + 1}. ${inlineMarkdown(li)}`));
      return;
    case "P":
    case "DIV": {
      const text = inlineMarkdown(el);
      if (text.trim()) lines.push(text);
      return;
    }
    default:
      Array.from(el.children).forEach((child) => blockMarkdown(child, lines));
  }
}

export function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const lines: string[] = [];
  Array.from(container.children).forEach((child) => blockMarkdown(child, lines));
  return lines.join("\n\n").trim();
}

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ImageBlock의 영구 저장 HTML(getHTML())은 자산 참조 이미지(data-asset-id)일 때 <img>를
    아예 만들지 않는다 — 백엔드 base URL이 바뀌어도 다음 로드 때 다시 계산되도록 에디터의
    React NodeView가 그 자리에서 동적으로 <img src={getAssetFileUrl(assetId)}>를 그려준다.
    PDF 내보내기는 React를 거치지 않고 이 저장된 HTML을 그대로 캡처하므로, 이런 블록은
    캡처할 <img> 자체가 없어 통째로 빈 칸이 된다 — 여기서 직접 만들어 넣는다. */
function resolveAssetImagePlaceholders(container: HTMLElement) {
  container.querySelectorAll("div[data-image-block][data-asset-id]").forEach((div) => {
    if (div.querySelector("img")) return;
    const assetId = div.getAttribute("data-asset-id");
    if (!assetId) return;
    const img = document.createElement("img");
    img.src = getAssetFileUrl(assetId);
    img.alt = div.getAttribute("data-file-name") ?? "";
    div.appendChild(img);
    console.debug("[내보내기] data-asset-id 블록에서 <img> 합성:", { assetId, src: img.src });
  });
}

/** 다단 컬럼(N단으로 나누기)의 가로 배치는 globals.css의 `.split-pane-editor .ProseMirror
    [data-type="column-list"]` 같은 룰로 적용되는데, 그 룰은 실제 에디터 DOM 구조(.split-pane-editor
    .ProseMirror 조상)에만 걸리도록 범위가 좁혀져 있다. 내보내기는 그 클래스 구조 밖에 있는
    임시 컨테이너에 HTML을 그대로 박아넣으므로 이 룰이 전혀 안 먹혀서 칸들이 그냥 위아래로
    쌓여 나왔다 — 여기서 직접 인라인 스타일로 같은 레이아웃을 재현한다. 칸 너비를 드래그로
    조절한 경우 그 비율(data-width)도 영구 저장 HTML에 속성으로는 남아있으므로 그대로
    반영한다. */
function applyColumnLayoutStyles(container: HTMLElement) {
  container.querySelectorAll('[data-type="column-list"]').forEach((list) => {
    const el = list as HTMLElement;
    el.style.display = "flex";
    el.style.gap = "16px";
    el.style.margin = "12px 0";
  });
  container.querySelectorAll('[data-type="column"]').forEach((col) => {
    const el = col as HTMLElement;
    const width = el.getAttribute("data-width");
    el.style.flex = width ? `0 0 ${width}%` : "1 1 0%";
    el.style.minWidth = "0";
    el.style.boxSizing = "border-box";
    el.style.padding = "4px 10px";
  });
}

function replaceWithBrokenImagePlaceholder(img: HTMLImageElement) {
  const placeholder = document.createElement("div");
  placeholder.textContent = "이미지를 불러올 수 없습니다";
  placeholder.style.cssText =
    "display:flex;align-items:center;justify-content:center;min-height:80px;padding:16px;" +
    "border:1px dashed #999;border-radius:8px;color:#888;font-size:13px;background:#f7f7f7;";
  img.replaceWith(placeholder);
}

/** blob을 FileReader로 data URL 문자열로 바꾼다. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** url을 fetch해 data URL로 바꿔서 img.src에 그대로 박아넣는다. html2canvas가 캔버스에 그릴 때
    크로스오리진 이미지는 픽셀을 못 읽어 빈 칸으로 남는데(우리 백엔드도 프론트와 다른
    포트=다른 origin), data URL은 네트워크 요청이 아니라 그 제약이 전혀 없다. 직접 fetch가
    막히면(만료된 서명 URL, CORS 미허용 외부 도메인 등) 백엔드 프록시(서버↔서버 호출이라
    CORS 제약이 없음)로 한 번 더 시도하고, 그래도 안 되면 안내 placeholder로 바꿔서 적어도
    "이미지가 통째로 사라진 것처럼" 보이지 않게 한다. */
async function inlineImagesAsDataUrls(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll("img"));
  console.debug(`[내보내기] 이미지 ${imgs.length}개 발견:`, imgs.map((img) => img.getAttribute("src")));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src) {
        console.warn("[내보내기] img에 src가 없음 → placeholder로 대체");
        replaceWithBrokenImagePlaceholder(img);
        return;
      }
      if (src.startsWith("data:")) return;

      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`status ${res.status}`);
        img.src = await blobToDataUrl(await res.blob());
        console.debug("[내보내기] data URL로 인라인 완료(직접 fetch):", src);
        return;
      } catch (directError) {
        console.warn("[내보내기] 직접 fetch 실패, 백엔드 프록시로 재시도:", src, directError);
      }

      try {
        const blob = await fetchImageViaProxy(src);
        img.src = await blobToDataUrl(blob);
        console.debug("[내보내기] data URL로 인라인 완료(프록시):", src);
      } catch (proxyError) {
        console.warn("[내보내기] 프록시도 실패 → placeholder로 대체:", src, proxyError);
        replaceWithBrokenImagePlaceholder(img);
      }
    })
  );
}

/** 컨테이너 안의 모든 이미지가 로드(또는 실패)될 때까지 기다린다. html2canvas는 호출 시점의
    레이아웃을 그대로 캡처하므로, 이미지가 아직 네트워크에서 받아오는 중이면 0높이/빈 칸으로
    찍혀서 위쪽에 빈 공간만 남는 버그가 있었다. data URL로 바꾼 뒤에도 디코딩에 실패하는
    드문 경우(손상된 바이너리 등)는 placeholder로 바꾼다. */
function waitForImages(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            if (img.naturalWidth === 0) replaceWithBrokenImagePlaceholder(img);
            resolve();
            return;
          }
          img.addEventListener(
            "load",
            () => {
              if (img.naturalWidth === 0) replaceWithBrokenImagePlaceholder(img);
              resolve();
            },
            { once: true }
          );
          img.addEventListener(
            "error",
            () => {
              replaceWithBrokenImagePlaceholder(img);
              resolve();
            },
            { once: true }
          );
        })
    )
  );
}

/**
 * 실제 .pdf 파일로 저장한다(인쇄 대화상자 경유 없음). jsPDF의 기본 내장 폰트(helvetica 등)는
 * 한글을 지원하지 않아 텍스트로 직접 쓰면 깨지므로, 노트를 화면에 보이는 그대로
 * html2canvas로 캡처(브라우저 자체 폰트 렌더링 사용 → 한글 정상 표시)한 뒤 그 이미지를
 * jsPDF 페이지에 붙여서 필요한 만큼 페이지를 나눈다.
 */
export async function downloadPdfFile(title: string, html: string, fileName: string) {
  console.debug("[내보내기] 원본 노트 HTML:", html);
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "700px";
  container.style.padding = "40px";
  container.style.background = "#ffffff";
  container.style.color = "#111111";
  container.style.fontFamily = "-apple-system, 'Malgun Gothic', 'Segoe UI', sans-serif";
  container.innerHTML = `<h1 style="margin:0 0 20px;font-size:24px;">${title}</h1>${html}`;
  resolveAssetImagePlaceholders(container);
  applyColumnLayoutStyles(container);
  container.querySelectorAll("img").forEach((img) => {
    (img as HTMLImageElement).style.maxWidth = "100%";
  });
  document.body.appendChild(container);

  try {
    await inlineImagesAsDataUrls(container);
    await waitForImages(container);
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      doc.addPage();
      doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    doc.save(fileName);
  } finally {
    container.remove();
  }
}

export function safeFileName(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, "_").trim() || "note";
}
