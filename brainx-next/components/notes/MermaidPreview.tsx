"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** mermaid는 번들 크기가 커서(코어+다이어그램 파서) 코드블록 언어를 mermaid로 바꾸기 전까지는
    로드하지 않는다 — 동적 import 결과를 모듈 스코프에 캐시해 같은 노트에 여러 mermaid 블록이
    있어도 한 번만 로드한다. */
let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
function loadMermaid() {
  if (!mermaidModulePromise) mermaidModulePromise = import("mermaid");
  return mermaidModulePromise;
}

let renderCounter = 0;

function normalizeMermaidSource(source: string) {
  const lines = source.replace(/\r\n?/g, "\n").trim().split("\n");
  if (lines.length === 0) return "";

  const first = lines[0].trim();
  if (/^```/.test(first)) {
    const withoutOpeningFence = lines.slice(1);
    if (withoutOpeningFence.at(-1)?.trim() === "```") withoutOpeningFence.pop();
    return withoutOpeningFence.join("\n").trim();
  }

  if (/^(?:text)?mermaid$/i.test(first) || /^language-(?:text)?mermaid$/i.test(first)) {
    return lines.slice(1).join("\n").trim();
  }

  return lines.join("\n").trim();
}

type RenderState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ok"; svg: string }
  | { status: "error"; message: string };

/** 코드(mermaid 소스)를 SVG로 렌더링한다. 실패해도 이 컴포넌트 안에서만 에러를 보여주고
    예외를 던지지 않는다 — 에디터 전체가 깨지면 안 되기 때문(노트 전체가 코드블록 하나의
    잘못된 문법 때문에 멈추는 사고를 방지).
    targetWidthPx: 부모(CodeBlockView)가 BlockControls의 비율 계산으로 정한 최종 목표
    px("맞춤"이면 null → 100%). naturalWidth는 이 컴포넌트만 SVG의 viewBox/width 속성에서
    바로 알 수 있어 onNaturalWidth로 부모에 보고하고, 부모는 그 값으로 targetWidthPx를
    다시 계산해 내려준다(원본/비율 모두 같은 측정값 하나를 공유). */
export function MermaidPreview({
  code,
  targetWidthPx,
  onNaturalWidth,
}: {
  code: string;
  targetWidthPx: number | null;
  onNaturalWidth?: (px: number) => void;
}) {
  const [state, setState] = useState<RenderState>({ status: "loading" });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = normalizeMermaidSource(code);
    if (!trimmed) {
      setState({ status: "empty" });
      return;
    }
    setState({ status: "loading" });

    loadMermaid()
      .then(async (mod) => {
        if (cancelled) return;
        const mermaid = mod.default;
        const isDark = document.documentElement.classList.contains("dark");
        try {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: isDark ? "dark" : "default",
            fontFamily: "inherit",
          });
          const id = `mermaid-block-${++renderCounter}`;
          const { svg } = await mermaid.render(id, trimmed);
          if (!cancelled) setState({ status: "ok", svg });
        } catch (err) {
          if (!cancelled) {
            setState({
              status: "error",
              message: err instanceof Error ? err.message : "Mermaid 문법 오류",
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Mermaid 라이브러리를 불러오지 못했습니다." });
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  // 렌더된 SVG가 목표 px(또는 컨테이너 폭 100%)로 보이도록 직접 스타일을 적용한다 — mermaid가
  // 만든 SVG는 자체 width/height(px)를 갖고 있어 그대로 두면 컨테이너를 무시한다. naturalWidth는
  // 매 패스마다 부모에 보고해 두고(같은 렌더 결과일 땐 부모가 동일 값으로 setState해 추가
  // 리렌더를 만들지 않는다), 그걸로 부모가 계산해 내려준 targetWidthPx를 그대로 적용한다.
  useLayoutEffect(() => {
    if (state.status !== "ok") return;
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;

    const viewBoxWidth = svgEl.viewBox?.baseVal?.width;
    const attrWidth = Number.parseFloat(svgEl.getAttribute("width") ?? "");
    const naturalWidth = viewBoxWidth || (Number.isFinite(attrWidth) ? attrWidth : 0);
    if (naturalWidth > 0) onNaturalWidth?.(naturalWidth);

    svgEl.style.width = targetWidthPx != null ? `${targetWidthPx}px` : "100%";
    svgEl.style.height = "auto";
    svgEl.style.maxWidth = "none";
    svgEl.style.display = "block";
    // widthMode만 바뀌어 부모 NodeView가 다시 그려질 때 dangerouslySetInnerHTML이 원본 SVG의
    // max-width를 복구할 수 있다. 매 렌더 직후 다시 보정해야 원본 → 75/125% 같은 연속 전환도
    // 직전 모드의 스타일을 끌고 가지 않는다.
  });

  if (state.status === "empty") {
    return (
      <div className="px-4 py-6 text-center text-[12px] text-txt3">
        Mermaid 코드를 입력하면 다이어그램이 표시됩니다.
      </div>
    );
  }
  if (state.status === "loading") {
    return <div className="px-4 py-6 text-center text-[12px] text-txt3">다이어그램 렌더링 중…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-[12px] text-red-400">
        <div className="mb-1 font-semibold">Mermaid 렌더링 오류</div>
        <div className="whitespace-pre-wrap font-mono text-[11px] opacity-90">{state.message}</div>
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className="mermaid-render-output"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
