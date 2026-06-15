"use client";

import { useEffect, useState, useMemo } from "react";
import { createLowlight, all } from "lowlight";
import { cx } from "@/lib/utils";
import { SAMPLES } from "@/components/editor/TipTapCodeEditor";

const lowlight = createLowlight(all);

// ── Constants ─────────────────────────────────────────────────────────────

const COMPARISON_LANGS = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Bash" },
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
] as const;

type LangId = (typeof COMPARISON_LANGS)[number]["id"];

const SHIKI_THEMES = [
  { id: "github-dark" as const,  label: "GitHub Dark",  scopeClass: "hlx-github-dark",  isDark: true  },
  { id: "github-light" as const, label: "GitHub Light", scopeClass: "hlx-github-light", isDark: false },
  { id: "vitesse-dark" as const, label: "Vitesse Dark", scopeClass: "hlx-vitesse-dark", isDark: true  },
  { id: "nord" as const,         label: "Nord",         scopeClass: "hlx-nord",         isDark: true  },
];

type ShikiThemeId = (typeof SHIKI_THEMES)[number]["id"];

// ── Scoped Lowlight CSS (highlight.js theme colours, scoped to wrapper class) ──

const LOWLIGHT_THEME_CSS = `
/* ── GitHub Dark ─────────────────────────────────────── */
.hlx-github-dark{background:#0d1117;color:#c9d1d9}
.hlx-github-dark .hljs-doctag,.hlx-github-dark .hljs-keyword,.hlx-github-dark .hljs-meta .hljs-keyword,.hlx-github-dark .hljs-template-tag,.hlx-github-dark .hljs-template-variable,.hlx-github-dark .hljs-type,.hlx-github-dark .hljs-variable.language_{color:#ff7b72}
.hlx-github-dark .hljs-title,.hlx-github-dark .hljs-title.class_,.hlx-github-dark .hljs-title.class_.inherited__,.hlx-github-dark .hljs-title.function_{color:#d2a8ff}
.hlx-github-dark .hljs-attr,.hlx-github-dark .hljs-attribute,.hlx-github-dark .hljs-literal,.hlx-github-dark .hljs-meta,.hlx-github-dark .hljs-number,.hlx-github-dark .hljs-operator,.hlx-github-dark .hljs-selector-attr,.hlx-github-dark .hljs-selector-class,.hlx-github-dark .hljs-selector-id,.hlx-github-dark .hljs-variable{color:#79c0ff}
.hlx-github-dark .hljs-meta .hljs-string,.hlx-github-dark .hljs-regexp,.hlx-github-dark .hljs-string{color:#a5d6ff}
.hlx-github-dark .hljs-built_in,.hlx-github-dark .hljs-symbol{color:#ffa657}
.hlx-github-dark .hljs-code,.hlx-github-dark .hljs-comment,.hlx-github-dark .hljs-formula{color:#8b949e}
.hlx-github-dark .hljs-name,.hlx-github-dark .hljs-quote,.hlx-github-dark .hljs-selector-pseudo,.hlx-github-dark .hljs-selector-tag{color:#7ee787}
.hlx-github-dark .hljs-subst{color:#c9d1d9}
.hlx-github-dark .hljs-section{color:#1f6feb;font-weight:700}
.hlx-github-dark .hljs-bullet{color:#f2cc60}
.hlx-github-dark .hljs-emphasis{color:#c9d1d9;font-style:italic}
.hlx-github-dark .hljs-strong{color:#c9d1d9;font-weight:700}
.hlx-github-dark .hljs-addition{color:#aff5b4;background-color:#033a16}
.hlx-github-dark .hljs-deletion{color:#ffdcd7;background-color:#67060c}

/* ── GitHub Light ────────────────────────────────────── */
.hlx-github-light{background:#ffffff;color:#24292e}
.hlx-github-light .hljs-doctag,.hlx-github-light .hljs-keyword,.hlx-github-light .hljs-meta .hljs-keyword,.hlx-github-light .hljs-template-tag,.hlx-github-light .hljs-template-variable,.hlx-github-light .hljs-type,.hlx-github-light .hljs-variable.language_{color:#d73a49}
.hlx-github-light .hljs-title,.hlx-github-light .hljs-title.class_,.hlx-github-light .hljs-title.class_.inherited__,.hlx-github-light .hljs-title.function_{color:#6f42c1}
.hlx-github-light .hljs-attr,.hlx-github-light .hljs-attribute,.hlx-github-light .hljs-literal,.hlx-github-light .hljs-meta,.hlx-github-light .hljs-number,.hlx-github-light .hljs-operator,.hlx-github-light .hljs-selector-attr,.hlx-github-light .hljs-selector-class,.hlx-github-light .hljs-selector-id,.hlx-github-light .hljs-variable{color:#005cc5}
.hlx-github-light .hljs-meta .hljs-string,.hlx-github-light .hljs-regexp,.hlx-github-light .hljs-string{color:#032f62}
.hlx-github-light .hljs-built_in,.hlx-github-light .hljs-symbol{color:#e36209}
.hlx-github-light .hljs-code,.hlx-github-light .hljs-comment,.hlx-github-light .hljs-formula{color:#6a737d}
.hlx-github-light .hljs-name,.hlx-github-light .hljs-quote,.hlx-github-light .hljs-selector-pseudo,.hlx-github-light .hljs-selector-tag{color:#22863a}
.hlx-github-light .hljs-subst{color:#24292e}
.hlx-github-light .hljs-section{color:#005cc5;font-weight:700}
.hlx-github-light .hljs-bullet{color:#735c0f}
.hlx-github-light .hljs-emphasis{font-style:italic}
.hlx-github-light .hljs-strong{font-weight:700}
.hlx-github-light .hljs-addition{color:#22863a;background-color:#f0fff4}
.hlx-github-light .hljs-deletion{color:#b31d28;background-color:#ffeef0}

/* ── Vitesse Dark ────────────────────────────────────── */
.hlx-vitesse-dark{background:#121212;color:#dbd7ca}
.hlx-vitesse-dark .hljs-keyword{color:#4d9375}
.hlx-vitesse-dark .hljs-built_in{color:#80a665}
.hlx-vitesse-dark .hljs-type{color:#5da994}
.hlx-vitesse-dark .hljs-literal,.hlx-vitesse-dark .hljs-number{color:#4c9a91}
.hlx-vitesse-dark .hljs-string,.hlx-vitesse-dark .hljs-regexp{color:#c98a7d}
.hlx-vitesse-dark .hljs-comment{color:#758575;font-style:italic}
.hlx-vitesse-dark .hljs-title.function_{color:#80a665}
.hlx-vitesse-dark .hljs-title.class_{color:#5da994}
.hlx-vitesse-dark .hljs-title{color:#80a665}
.hlx-vitesse-dark .hljs-variable{color:#dbd7ca}
.hlx-vitesse-dark .hljs-attr,.hlx-vitesse-dark .hljs-attribute{color:#4d9375}
.hlx-vitesse-dark .hljs-property{color:#7dace4}
.hlx-vitesse-dark .hljs-selector-tag,.hlx-vitesse-dark .hljs-name{color:#4d9375}
.hlx-vitesse-dark .hljs-selector-class{color:#6394bf}
.hlx-vitesse-dark .hljs-operator{color:#cb7676}
.hlx-vitesse-dark .hljs-meta{color:#bb8a35}
.hlx-vitesse-dark .hljs-tag{color:#4d9375}
.hlx-vitesse-dark .hljs-section{color:#6394bf;font-weight:700}
.hlx-vitesse-dark .hljs-emphasis{font-style:italic}
.hlx-vitesse-dark .hljs-strong{font-weight:700}

/* ── Nord ────────────────────────────────────────────── */
.hlx-nord{background:#2e3440;color:#d8dee9}
.hlx-nord .hljs-keyword{color:#81a1c1}
.hlx-nord .hljs-built_in{color:#81a1c1}
.hlx-nord .hljs-type{color:#8fbcbb}
.hlx-nord .hljs-literal,.hlx-nord .hljs-number{color:#b48ead}
.hlx-nord .hljs-string,.hlx-nord .hljs-regexp{color:#a3be8c}
.hlx-nord .hljs-comment{color:#616e88;font-style:italic}
.hlx-nord .hljs-title.function_{color:#88c0d0}
.hlx-nord .hljs-title.class_{color:#8fbcbb}
.hlx-nord .hljs-title{color:#88c0d0}
.hlx-nord .hljs-variable{color:#d8dee9}
.hlx-nord .hljs-attr,.hlx-nord .hljs-attribute{color:#8fbcbb}
.hlx-nord .hljs-property{color:#88c0d0}
.hlx-nord .hljs-selector-tag,.hlx-nord .hljs-name{color:#81a1c1}
.hlx-nord .hljs-selector-class{color:#88c0d0}
.hlx-nord .hljs-operator{color:#81a1c1}
.hlx-nord .hljs-meta{color:#5e81ac}
.hlx-nord .hljs-tag{color:#81a1c1}
.hlx-nord .hljs-section{color:#5e81ac;font-weight:700}
.hlx-nord .hljs-bullet{color:#ebcb8b}
.hlx-nord .hljs-emphasis{font-style:italic}
.hlx-nord .hljs-strong{font-weight:700}

/* ── Shiki output overrides (consistent sizing) ──────── */
.shiki-preview pre{margin:0!important;padding:1rem!important;font-size:13px!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;line-height:1.6!important;overflow-x:auto}
`;

// ── HAST → HTML string ─────────────────────────────────────────────────────

function hastToHtml(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;

  if (n.type === "text") {
    return String(n.value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  if (n.type === "element") {
    const props = (n.properties as Record<string, unknown>) ?? {};
    const classes = Array.isArray(props.className)
      ? (props.className as string[]).join(" ")
      : "";
    const inner = ((n.children as unknown[]) ?? []).map(hastToHtml).join("");
    return classes ? `<span class="${classes}">${inner}</span>` : inner;
  }
  if (n.type === "root") {
    return ((n.children as unknown[]) ?? []).map(hastToHtml).join("");
  }
  return "";
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ShikiComparison() {
  const [activeLang, setActiveLang] = useState<LangId>("javascript");
  const [activeTheme, setActiveTheme] = useState<ShikiThemeId>("github-dark");
  const [shikiHtml, setShikiHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [shikiError, setShikiError] = useState<string | null>(null);

  const code = SAMPLES[activeLang] ?? `// ${activeLang} example\nconsole.log("hello")`;
  const themeInfo = SHIKI_THEMES.find((t) => t.id === activeTheme)!;

  // Synchronous Lowlight render (instant, no async needed)
  const lowlightHtml = useMemo(() => {
    try {
      const result = lowlight.highlight(activeLang, code);
      return hastToHtml(result);
    } catch {
      return code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [activeLang, code]);

  // Async Shiki render via dynamic import (SSR-safe)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setShikiHtml("");
    setShikiError(null);

    (async () => {
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(code, {
          lang: activeLang,
          theme: activeTheme,
        });
        if (!cancelled) {
          setShikiHtml(html);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setShikiError(String(err));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLang, activeTheme, code]);

  return (
    <div className="flex flex-col gap-5">
      {/* Inject scoped theme CSS once */}
      <style suppressHydrationWarning>{LOWLIGHT_THEME_CSS}</style>

      {/* ── Section header + theme selector ─── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold font-display text-txt">
            Lowlight vs Shiki 비교
          </h2>
          <p className="text-xs text-txt3 mt-0.5">
            동일한 코드 샘플로 두 하이라이터의 색상 품질을 나란히 비교합니다
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-txt3 mr-0.5">테마</span>
          {SHIKI_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTheme(t.id)}
              className={cx(
                "px-2.5 py-1 rounded-lg text-[11px] border transition-all",
                activeTheme === t.id
                  ? "bg-primary/20 text-primary border-primary/30 font-semibold"
                  : "border-line/40 text-txt3 hover:text-txt hover:bg-surface2/60 hover:border-primary/20"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Language tabs ─────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {COMPARISON_LANGS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveLang(id)}
            className={cx(
              "px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all",
              activeLang === id
                ? "bg-primary/20 text-primary border-primary/30 font-semibold"
                : "border-line/30 text-txt3 hover:text-txt hover:border-primary/20 hover:bg-primary/5"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Side-by-side panels ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Lowlight */}
        <div className="flex flex-col rounded-xl overflow-hidden border border-line/40">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface2/60 border-b border-line/30 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-txt2">Lowlight</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-500 border border-yellow-400/20 font-mono">
                highlight.js
              </span>
            </div>
            <span className="text-[10px] text-txt3 font-mono">CSS 클래스 방식</span>
          </div>
          <div
            className={cx("overflow-auto flex-1", themeInfo.scopeClass)}
          >
            <pre
              className="m-0 p-4 text-[13px] font-mono leading-relaxed min-h-[260px]"
              style={{ background: "inherit" }}
            >
              <code dangerouslySetInnerHTML={{ __html: lowlightHtml }} />
            </pre>
          </div>
        </div>

        {/* Right: Shiki */}
        <div className="flex flex-col rounded-xl overflow-hidden border border-line/40">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface2/60 border-b border-line/30 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-txt2">Shiki</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20 font-mono">
                VSCode 문법
              </span>
            </div>
            <span className="text-[10px] text-txt3 font-mono">인라인 스타일 방식</span>
          </div>
          <div className="overflow-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center min-h-[260px] text-txt3">
                <span className="text-xs animate-pulse">Shiki 렌더링 중...</span>
              </div>
            ) : shikiError ? (
              <div className="p-4 min-h-[260px] text-xs text-red-400 font-mono whitespace-pre-wrap">
                오류: {shikiError}
              </div>
            ) : (
              <div
                className="shiki-preview min-h-[260px]"
                dangerouslySetInnerHTML={{ __html: shikiHtml }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Verdict cards ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        <div className="flex gap-3 p-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-yellow-400/15 flex items-center justify-center text-yellow-500 font-bold text-sm font-mono">
            L
          </div>
          <div>
            <p className="text-xs font-semibold text-txt mb-1">
              Lowlight &mdash; 현재 방식
            </p>
            <p className="text-[11px] text-txt3 leading-relaxed">
              가볍고 Tiptap 연동이 쉬움. 에디터 내부에서 실시간 편집·하이라이팅이 동시에 동작.{" "}
              <strong className="text-txt2">MVP 및 에디터 통합에 적합.</strong>
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-4 rounded-xl border border-blue-400/20 bg-blue-400/5">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-400/15 flex items-center justify-center text-blue-400 font-bold text-sm font-mono">
            S
          </div>
          <div>
            <p className="text-xs font-semibold text-txt mb-1">
              Shiki &mdash; 비교 대상
            </p>
            <p className="text-[11px] text-txt3 leading-relaxed">
              VSCode 수준의 색상 정밀도. TextMate 문법 기반으로 토큰 분류가 더 세밀함.{" "}
              <strong className="text-txt2">문서·블로그 정적 렌더링에 적합.</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
