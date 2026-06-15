"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useBrainX } from "@/components/brainx-provider";
import { cx } from "@/lib/utils";

/* ── Shared types (must match both editor components) ─ */
export type EditorFontSize = "sm" | "base" | "lg" | "xl";

export const FONT_SIZE_LABELS: Record<EditorFontSize, string> = {
  sm: "작게",
  base: "보통",
  lg: "크게",
  xl: "매우 크게",
};

export const FONT_SIZES: Record<EditorFontSize, number> = {
  sm: 14,
  base: 16,
  lg: 20,
  xl: 24,
};

/* ── Dynamic imports ─────────────────────────────── */
const TipTapEditor = dynamic(
  () => import("@/components/editor/TipTapEditor"),
  { ssr: false, loading: () => <EditorSkeleton /> }
);

const BlockNoteEditor = dynamic(
  () => import("@/components/editor/BlockNoteEditor"),
  { ssr: false, loading: () => <EditorSkeleton /> }
);

type Tab = "tiptap" | "blocknote";

const TABS: { id: Tab; label: string; sub: string; desc: string }[] = [
  {
    id: "tiptap",
    label: "TipTap",
    sub: "ProseMirror 기반",
    desc: "세밀한 커스터마이징, 확장 에코시스템, 마크다운 단축키 지원",
  },
  {
    id: "blocknote",
    label: "BlockNote",
    sub: "Block 기반",
    desc: "Notion 스타일 블록 에디터, / 명령어, 드래그 앤 드롭 내장",
  },
];

const COMPARISON: { feature: string; tiptap: string; blocknote: string }[] = [
  { feature: "글씨 크기 변경", tiptap: "전체 에디터 (em 상속)", blocknote: "전체 문서 (.bn-default-styles 오버라이드)" },
  { feature: "제목 크기 변경", tiptap: "em 단위 비례 스케일", blocknote: "em 단위 비례 스케일" },
  { feature: "자동 저장", tiptap: "✓ localStorage", blocknote: "✓ localStorage" },
  { feature: "JSON 출력", tiptap: "✓ ProseMirror JSON", blocknote: "✓ Block[] JSON" },
  { feature: "서식 도구", tiptap: "커스텀 툴바", blocknote: "내장 Mantine 툴바" },
  { feature: "/ 명령어", tiptap: "확장 필요", blocknote: "✓ 기본 내장" },
  { feature: "블록 드래그", tiptap: "확장 필요", blocknote: "✓ 기본 내장" },
  { feature: "커스터마이징", tiptap: "매우 강력 (확장 API)", blocknote: "보통 (스키마/슬롯)" },
  { feature: "Light Mode", tiptap: "CSS 변수로 즉시 반영", blocknote: "theme prop으로 즉시 반영" },
];

const FONT_SIZE_KEYS = Object.keys(FONT_SIZE_LABELS) as EditorFontSize[];

function EditorSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-9 rounded-lg bg-surface2/60" />
      <div className="h-11 rounded-xl bg-surface2/60" />
      <div className="h-80 rounded-xl bg-surface2/60" />
    </div>
  );
}

export default function EditorLabPage() {
  const { theme, setTheme } = useBrainX();
  const [tab, setTab] = useState<Tab>("tiptap");
  const [fontSize, setFontSize] = useState<EditorFontSize>("base");

  const activeLabel = tab === "tiptap" ? "TipTap" : "BlockNote";
  const isLight = theme === "light";

  return (
    <div className="min-h-screen" data-route>
      {/* ── Header ──────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass border-b border-line/40 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold font-display text-sm">B</span>
          </div>
          <span className="text-txt2 text-sm group-hover:text-txt transition-colors hidden sm:block">
            BrainX
          </span>
        </Link>
        <span className="text-line/70 text-sm">/</span>
        <span className="text-txt text-sm font-medium">Editor Lab</span>

        {/* Active editor badge */}
        <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-[11px] text-primary font-medium whitespace-nowrap">
            {activeLabel}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isLight ? "dark" : "light")}
            title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
            className={cx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              isLight
                ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                : "bg-surface2 text-txt2 border-line/50 hover:text-txt hover:bg-surface2"
            )}
          >
            {isLight ? (
              <><Moon size={13} /> Dark</>
            ) : (
              <><Sun size={13} /> Light</>
            )}
          </button>

          <span className="text-[11px] text-txt3 bg-surface2 px-2.5 py-1 rounded-full border border-line/30 hidden sm:block">
            실험용 · 백엔드 미연결
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Page title ──────────────────────────── */}
        <div className="mb-4 fade-up">
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-txt mb-2">
            에디터 비교 실험실
          </h1>
          <p className="text-txt3 text-sm leading-relaxed">
            BrainX 최종 에디터 선정을 위한 비교 페이지입니다.
            각 에디터를 직접 사용하고 개발자 경험을 평가해보세요.
          </p>
        </div>

        {/* ── Code highlight test quick link ──────── */}
        <div className={cx(
          "flex items-center justify-between gap-3 mb-5 px-4 py-2.5 rounded-xl border",
          isLight
            ? "bg-blue-50/60 border-blue-200/80"
            : "bg-primary/5 border-primary/15"
        )}>
          <div className="min-w-0">
            <p className={cx("text-xs font-semibold", isLight ? "text-blue-700" : "text-primary")}>
              코드 하이라이팅 테스트
            </p>
            <p className="text-[10px] text-txt3 truncate">
              TipTap CodeBlockLowlight · lowlight · 40+ 언어 · ``` 마크다운 단축키
            </p>
          </div>
          <Link
            href="/editor-lab/tiptap-code-test"
            className={cx(
              "shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap",
              isLight
                ? "bg-white border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                : "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
            )}
          >
            바로가기 →
          </Link>
        </div>

        {/* ── Status bar ──────────────────────────── */}
        <div className={cx(
          "flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-6 px-4 py-2.5 rounded-xl border text-xs",
          isLight
            ? "bg-slate-50 border-slate-200 text-slate-500"
            : "bg-surface2/40 border-line/40 text-txt3"
        )}>
          <StatusItem label="현재 에디터" value={activeLabel} accent />
          <StatusItem
            label="현재 테마"
            value={isLight ? "Light ☀" : "Dark ☾"}
            accent={false}
          />
          <StatusItem
            label="현재 글씨 크기"
            value={`${FONT_SIZE_LABELS[fontSize]} (${FONT_SIZES[fontSize]}px)`}
            accent={false}
          />
          {/* Font size quick-pick */}
          <div className="flex items-center gap-1 ml-auto">
            {FONT_SIZE_KEYS.map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={cx(
                  "px-2 py-0.5 rounded text-[11px] transition-all",
                  fontSize === size
                    ? "bg-primary/20 text-primary font-semibold"
                    : isLight
                      ? "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      : "text-txt3 hover:text-txt hover:bg-surface2"
                )}
              >
                {FONT_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab switcher ────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {TABS.map(({ id, label, sub, desc }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                "flex-1 text-left px-5 py-4 rounded-2xl border transition-all",
                tab === id
                  ? "border-primary/50 bg-primary/10 shadow-glow"
                  : isLight
                    ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    : "border-line/40 bg-surface/30 hover:border-line hover:bg-surface2/30"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cx(
                  "font-semibold font-display text-base transition-colors",
                  tab === id ? "text-primary" : "text-txt"
                )}>
                  {label}
                </span>
                <span className={cx(
                  "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                  tab === id
                    ? "text-primary/80 border-primary/30 bg-primary/10"
                    : "text-txt3 border-line/40"
                )}>
                  {sub}
                </span>
                {tab === id && (
                  <span className="ml-auto text-[10px] text-primary/70">선택됨 ✦</span>
                )}
              </div>
              <p className="text-xs text-txt3 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>

        {/* ── Editor card ─────────────────────────── */}
        <div className={cx(
          "rounded-2xl p-5 sm:p-7 fade-up border",
          isLight
            ? "bg-white border-slate-200 shadow-sm"
            : "card"
        )}>
          {tab === "tiptap" ? (
            <TipTapEditor fontSize={fontSize} onFontSizeChange={setFontSize} />
          ) : (
            <BlockNoteEditor fontSize={fontSize} onFontSizeChange={setFontSize} />
          )}
        </div>

        {/* ── 비교 결과 영역 ────────────────────────── */}
        <div className="mt-8 space-y-5">
          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard
              title="TipTap 특징"
              color="primary"
              isLight={isLight}
              items={[
                "전체 에디터 글씨 크기 변경",
                "ProseMirror 기반 강력한 확장",
                "마크다운 단축키 지원 (**굵게**, ## 제목)",
                "편집 / 미리보기 / JSON 3단 뷰",
                "ProseMirror JSON 출력",
                "커스텀 툴바 완전 제어",
              ]}
            />
            <FeatureCard
              title="BlockNote 특징"
              color="accent"
              isLight={isLight}
              items={[
                "전체 문서 단위 글씨 크기 변경",
                "Notion 스타일 블록 편집",
                "슬래시(/) 명령어 내장",
                "블록 드래그 앤 드롭 내장",
                "Block[] JSON 출력",
                "라이트/다크 테마 즉시 전환",
              ]}
            />
          </div>

          {/* Comparison table */}
          <div className={cx(
            "rounded-2xl overflow-hidden border",
            isLight ? "bg-white border-slate-200 shadow-sm" : "card"
          )}>
            <div className={cx(
              "px-5 py-3 border-b flex items-center gap-2",
              isLight ? "border-slate-200 bg-slate-50" : "border-line/40"
            )}>
              <span className="text-sm font-semibold text-txt">기능 비교표</span>
              <span className="text-xs text-txt3">주요 기능 비교</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={cx(
                    "border-b",
                    isLight ? "border-slate-200 bg-slate-50/80" : "border-line/30 bg-surface2/30"
                  )}>
                    <th className="text-left px-5 py-2.5 text-txt2 font-medium w-36">기능</th>
                    <th className="text-left px-4 py-2.5 text-primary font-medium">TipTap</th>
                    <th className="text-left px-4 py-2.5 text-accent font-medium">BlockNote</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr
                      key={i}
                      className={cx(
                        "border-b last:border-0 transition-colors",
                        isLight
                          ? "border-slate-100 hover:bg-slate-50"
                          : "border-line/20 hover:bg-surface2/20"
                      )}
                    >
                      <td className="px-5 py-2.5 text-txt2 font-medium">{row.feature}</td>
                      <td className="px-4 py-2.5 text-txt3">{row.tiptap}</td>
                      <td className="px-4 py-2.5 text-txt3">{row.blocknote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Checkpoint cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CheckCard
              title="TipTap 체크포인트"
              isLight={isLight}
              items={[
                "서식 툴바 UX가 직관적인가?",
                "마크다운 단축키 (**, ## 등) 작동하는가?",
                "JSON 구조가 BrainX 데이터 모델과 맞는가?",
                "커스텀 확장 추가가 용이한가?",
                "라이트 모드에서 가독성이 좋은가?",
              ]}
            />
            <CheckCard
              title="BlockNote 체크포인트"
              isLight={isLight}
              items={[
                "/ 명령어 메뉴가 편리한가?",
                "블록 드래그 앤 드롭이 자연스러운가?",
                "Block[] JSON이 BrainX와 호환 가능한가?",
                "라이트 모드가 실제 Notion과 유사한가?",
                "테마 커스터마이징이 충분한가?",
              ]}
            />
          </div>
        </div>

        <p className="mt-6 text-[11px] text-txt3 text-center">
          ✦ 모든 내용은 브라우저 localStorage에 자동 저장됩니다 · 탭 또는 테마 전환 후에도 유지됩니다
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────── */

function StatusItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: boolean;
}) {
  return (
    <span>
      <span className="opacity-70">{label}:</span>{" "}
      <span className={accent ? "text-primary font-medium" : "font-medium text-txt2"}>
        {value}
      </span>
    </span>
  );
}

function FeatureCard({
  title,
  color,
  isLight,
  items,
}: {
  title: string;
  color: "primary" | "accent";
  isLight: boolean;
  items: string[];
}) {
  const dot = color === "primary" ? "bg-primary" : "bg-accent";
  const heading = color === "primary" ? "text-primary" : "text-accent";
  return (
    <div className={cx(
      "rounded-2xl p-5 border",
      isLight ? "bg-white border-slate-200 shadow-sm" : "card"
    )}>
      <h3 className={cx("text-sm font-semibold mb-3", heading)}>{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-txt3">
            <span className={cx("w-1.5 h-1.5 rounded-full mt-1 shrink-0", dot)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckCard({
  title,
  isLight,
  items,
}: {
  title: string;
  isLight: boolean;
  items: string[];
}) {
  return (
    <div className={cx(
      "rounded-xl p-4 border",
      isLight ? "bg-white border-slate-200 shadow-sm" : "card"
    )}>
      <h3 className="text-xs font-semibold text-txt mb-2.5">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-txt3">
            <span className="text-txt3/50 mt-0.5">□</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
