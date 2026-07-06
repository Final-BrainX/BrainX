"use client";

import Link from "next/link";
import { useState } from "react";
import { notFound } from "next/navigation";
import { Sun, Moon, ArrowRight, Star, Zap, Clock } from "lucide-react";
import { useBrainX } from "@/components/brainx-provider";
import { cx } from "@/lib/utils";

/* ── Demo list ───────────────────────────────── */
interface Demo {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  badge?: { label: string; color: "primary" | "accent" | "cyan" | "green" };
  badgeExtra?: string;
  featured?: boolean;
  preview?: React.ReactNode;
}

function MiniLayoutPreview({ isLight }: { isLight: boolean }) {
  return (
    <div
      className={cx(
        "w-full rounded-xl overflow-hidden border text-[8px] leading-none",
        isLight
          ? "border-slate-200 bg-slate-50"
          : "border-line/50 bg-surface/60",
      )}
      style={{ height: 100 }}
    >
      <div
        className={cx(
          "flex items-center gap-1 px-2 py-1 border-b",
          isLight
            ? "border-slate-200 bg-white"
            : "border-line/40 bg-surface2/60",
        )}
      >
        <div className="w-2 h-2 rounded-full bg-primary" />
        <div
          className={cx(
            "flex-1 h-1.5 rounded",
            isLight ? "bg-slate-200" : "bg-line/40",
          )}
        />
        <div
          className={cx(
            "w-6 h-1.5 rounded",
            isLight ? "bg-slate-200" : "bg-line/40",
          )}
        />
      </div>
      <div className="flex h-[calc(100%-28px)]">
        {/* Left panel */}
        <div
          className={cx(
            "w-10 shrink-0 border-r p-1.5 space-y-1",
            isLight ? "border-slate-200 bg-slate-50" : "border-line/40",
          )}
        >
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={cx(
                "h-1 rounded",
                i === 0
                  ? "bg-primary/50"
                  : isLight
                    ? "bg-slate-200"
                    : "bg-line/30",
              )}
            />
          ))}
        </div>
        {/* Editor panels */}
        <div className="flex-1 flex">
          <div
            className={cx(
              "flex-1 p-1.5",
              isLight ? "bg-white" : "bg-surface/80",
            )}
          >
            <div
              className={cx(
                "h-2 rounded mb-1 w-3/4",
                isLight ? "bg-slate-300" : "bg-txt3/30",
              )}
            />
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={cx(
                  "h-1 rounded mb-0.5",
                  isLight ? "bg-slate-200" : "bg-line/30",
                )}
                style={{ width: `${60 + i * 10}%` }}
              />
            ))}
          </div>
          <div
            className={cx(
              "w-0.5 shrink-0",
              isLight ? "bg-slate-200" : "bg-line/30",
            )}
          />
          <div
            className={cx(
              "flex-1 p-1.5 opacity-60",
              isLight ? "bg-white" : "bg-surface/80",
            )}
          >
            <div
              className={cx(
                "h-2 rounded mb-1 w-1/2",
                isLight ? "bg-slate-300" : "bg-txt3/30",
              )}
            />
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className={cx(
                  "h-1 rounded mb-0.5",
                  isLight ? "bg-slate-200" : "bg-line/30",
                )}
                style={{ width: `${50 + i * 15}%` }}
              />
            ))}
          </div>
        </div>
        {/* Right panel */}
        <div
          className={cx(
            "w-12 shrink-0 border-l p-1.5 space-y-1",
            isLight ? "border-slate-200 bg-slate-50" : "border-line/40",
          )}
        >
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cx(
                "h-1 rounded",
                i === 0
                  ? "bg-accent/50"
                  : isLight
                    ? "bg-slate-200"
                    : "bg-line/30",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EditorLabPage() {
  // 배포(next build/start, NODE_ENV=production) 환경에서는 실험용 데모 라우트를 404 처리한다.
  // 로컬 개발(next dev)에서는 그대로 접근 가능하게 유지한다.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { theme, setTheme } = useBrainX();
  const isLight = theme === "light";

  const DEMOS: Demo[] = [
    {
      id: "brainx-note-demo",
      href: "/editor-lab/brainx-note-demo",
      title: "BrainX Note Demo",
      subtitle: "통합 노트 환경",
      description:
        "Obsidian + Notion + AI 기반 BrainX 통합 노트 환경. 화면 분할, 백링크, 지식 그래프, AI 보조, 시맨틱 검색, Import/Export, Command Palette를 한 화면에서 체험.",
      tags: [
        "화면분할",
        "백링크",
        "지식그래프",
        "AI",
        "시맨틱검색",
        "Import/Export",
      ],
      badge: { label: "NEW", color: "primary" },
      badgeExtra: "추천",
      featured: true,
    },
    {
      id: "split-demo",
      href: "/editor-lab/split-demo",
      title: "Split View Demo",
      subtitle: "무제한 화면 분할",
      description:
        "Obsidian 스타일 무제한 분할 뷰. 좌우/상하 혼합 분할, 드래그 앤 드롭 노트 배치, 독립 스크롤.",
      tags: ["화면분할", "DnD", "react-resizable-panels"],
      badge: { label: "STABLE", color: "cyan" },
    },
    {
      id: "tiptap-code-test",
      href: "/editor-lab/tiptap-code-test",
      title: "TipTap Code Editor",
      subtitle: "코드 하이라이팅",
      description:
        "TipTap + CodeBlockLowlight. 40+ 언어 지원, 복사 버튼, 언어 선택, 마크다운 단축키.",
      tags: ["TipTap", "Lowlight", "코드블록"],
      badge: { label: "V3", color: "accent" },
    },
    {
      id: "editor-compare",
      href: "#",
      title: "Editor Compare",
      subtitle: "TipTap vs BlockNote",
      description:
        "TipTap vs BlockNote 에디터 비교. 이 페이지의 원래 내용 (아래 스크롤).",
      tags: ["TipTap", "BlockNote", "비교"],
    },
  ];

  const featuredDemo = DEMOS[0];
  const otherDemos = DEMOS.slice(1);

  const RECENT_FEATURES = [
    {
      label: "BrainX Note Demo",
      icon: "✦",
      href: "/editor-lab/brainx-note-demo",
    },
    { label: "Infinite Split View", icon: "⫸", href: "/editor-lab/split-demo" },
    {
      label: "Knowledge Graph Mock",
      icon: "⬡",
      href: "/editor-lab/brainx-note-demo",
    },
    {
      label: "AI Assistant Panel",
      icon: "🤖",
      href: "/editor-lab/brainx-note-demo",
    },
    {
      label: "Obsidian Backlinks",
      icon: "←→",
      href: "/editor-lab/brainx-note-demo",
    },
    {
      label: "Command Palette",
      icon: "⌘",
      href: "/editor-lab/brainx-note-demo",
    },
  ];

  return (
    <div className="min-h-screen" data-route>
      {/* ── Header ──────────────────────────────── */}
      <header
        className={cx(
          "sticky top-0 z-30 border-b px-4 sm:px-6 py-3 flex items-center gap-3",
          isLight
            ? "bg-white border-slate-200 shadow-sm"
            : "glass border-line/40",
        )}
      >
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
            <span className="text-white font-bold text-[11px]">B</span>
          </div>
          <span
            className={cx(
              "text-sm font-semibold hidden sm:block",
              isLight ? "text-slate-700" : "text-txt",
            )}
          >
            BrainX
          </span>
        </Link>
        <span
          className={cx("text-sm", isLight ? "text-slate-300" : "text-line/50")}
        >
          /
        </span>
        <span
          className={cx(
            "text-sm font-medium",
            isLight ? "text-slate-700" : "text-txt",
          )}
        >
          Playground
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cx(
              "text-[11px] px-2.5 py-1 rounded-full border hidden sm:block",
              isLight
                ? "text-slate-500 border-slate-200 bg-slate-50"
                : "text-txt3 border-line/30 bg-surface2",
            )}
          >
            실험용 · 백엔드 미연결
          </span>
          <button
            onClick={() => setTheme(isLight ? "dark" : "light")}
            className={cx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              isLight
                ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                : "bg-surface2 text-txt2 border-line/50 hover:text-txt",
            )}
          >
            {isLight ? (
              <>
                <Moon size={13} /> Dark
              </>
            ) : (
              <>
                <Sun size={13} /> Light
              </>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Hero ────────────────────────────────── */}
        <div className="mb-10 text-center animate-fadeUp">
          <div
            className={cx(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[11px] font-medium mb-4",
              isLight
                ? "border-blue-200 bg-blue-50 text-blue-600"
                : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <Zap size={11} />
            BrainX 실험실
          </div>
          <h1
            className={cx(
              "text-3xl sm:text-4xl font-bold font-display mb-3",
              isLight ? "text-slate-900" : "text-txt",
            )}
          >
            BrainX Playground
          </h1>
          <p
            className={cx(
              "text-sm sm:text-base leading-relaxed mb-6 max-w-xl mx-auto",
              isLight ? "text-slate-500" : "text-txt3",
            )}
          >
            BrainX에서 구현 중인 기능들을 직접 체험하는 공간입니다.
            <br />
            실제 서비스 적용 전 검증 및 UI 프리뷰를 제공합니다.
          </p>
          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/editor-lab/brainx-note-demo"
              className={cx(
                "inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-glow",
                "bg-gradient-to-r from-primary to-accent text-white hover:brightness-110 hover:shadow-lg",
              )}
            >
              <span>✦</span>
              BrainX Note Demo 열기
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/editor-lab/split-demo"
              className={cx(
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all",
                isLight
                  ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  : "border-line/50 bg-surface/60 text-txt2 hover:border-line hover:bg-surface2",
              )}
            >
              ⫸ Split Demo
            </Link>
          </div>
        </div>

        {/* ── Featured Demo ──────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Star size={14} className="text-primary" />
            <span
              className={cx(
                "text-[11px] font-semibold uppercase tracking-wide",
                isLight ? "text-slate-500" : "text-txt3",
              )}
            >
              주요 데모
            </span>
          </div>

          <Link
            href={featuredDemo.href}
            className={cx(
              "group relative block rounded-2xl border p-6 transition-all overflow-hidden",
              isLight
                ? "bg-white border-slate-200 shadow-sm hover:border-primary/40 hover:shadow-md"
                : "border-line/40 bg-surface/30 hover:border-primary/40 hover:bg-surface/50",
            )}
          >
            {/* Background gradient accent */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 30% 50%, rgb(59 130 246 / 0.04) 0%, transparent 70%)",
                }}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {featuredDemo.badge && (
                    <span
                      className={cx(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        "border-primary/30 bg-primary/10 text-primary",
                      )}
                    >
                      {featuredDemo.badge.label}
                    </span>
                  )}
                  {featuredDemo.badgeExtra && (
                    <span
                      className={cx(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                        isLight
                          ? "border-amber-200 bg-amber-50 text-amber-600"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400",
                      )}
                    >
                      ⭐ {featuredDemo.badgeExtra}
                    </span>
                  )}
                </div>

                <h2
                  className={cx(
                    "text-xl font-bold font-display mb-1",
                    isLight ? "text-slate-900" : "text-txt",
                  )}
                >
                  {featuredDemo.title}
                </h2>
                <p
                  className={cx(
                    "text-[13px] mb-3",
                    isLight ? "text-slate-500" : "text-txt3",
                  )}
                >
                  {featuredDemo.subtitle}
                </p>
                <p
                  className={cx(
                    "text-[13px] leading-relaxed mb-4",
                    isLight ? "text-slate-600" : "text-txt2",
                  )}
                >
                  {featuredDemo.description}
                </p>

                {/* Feature tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {featuredDemo.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cx(
                        "text-[11px] px-2 py-0.5 rounded-full border",
                        isLight
                          ? "border-blue-100 bg-blue-50 text-blue-600"
                          : "border-primary/20 bg-primary/10 text-primary",
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div
                  className={cx(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all",
                    "bg-gradient-to-r from-primary to-accent text-white group-hover:brightness-110",
                  )}
                >
                  데모 열기
                  <ArrowRight size={14} />
                </div>
              </div>

              {/* Mini preview */}
              <div className="sm:w-52 shrink-0">
                <MiniLayoutPreview isLight={isLight} />
                <p
                  className={cx(
                    "text-center text-[10px] mt-1.5",
                    isLight ? "text-slate-400" : "text-txt3",
                  )}
                >
                  좌측 탐색기 + 에디터 + 우측 AI
                </p>
              </div>
            </div>
          </Link>
        </div>

        {/* ── Other demos (grid) ────────────────── */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={cx(
                "text-[11px] font-semibold uppercase tracking-wide",
                isLight ? "text-slate-500" : "text-txt3",
              )}
            >
              더 많은 실험
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {otherDemos.map((demo) => (
              <DemoCard key={demo.id} demo={demo} isLight={isLight} />
            ))}
          </div>
        </div>

        {/* ── Recent Features ────────────────────── */}
        <div
          className={cx(
            "rounded-2xl border p-5 mb-8",
            isLight ? "bg-white border-slate-200 shadow-sm" : "card",
          )}
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock
              size={14}
              className={isLight ? "text-slate-500" : "text-txt3"}
            />
            <span
              className={cx(
                "text-[13px] font-semibold",
                isLight ? "text-slate-700" : "text-txt",
              )}
            >
              Recently Added
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RECENT_FEATURES.map((feat) => (
              <Link
                key={feat.label}
                href={feat.href}
                className={cx(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] transition-all",
                  isLight
                    ? "border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-blue-50 hover:text-primary"
                    : "border-line/40 bg-surface/40 text-txt2 hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                )}
              >
                <span className="text-[14px] shrink-0">{feat.icon}</span>
                <span className="truncate">{feat.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Legacy editor compare section ─────── */}
        <div
          className={cx(
            "rounded-2xl border p-5",
            isLight ? "bg-white border-slate-200 shadow-sm" : "card",
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cx(
                "text-[11px] px-2 py-0.5 rounded-full border",
                isLight
                  ? "border-slate-200 text-slate-400"
                  : "border-line/40 text-txt3",
              )}
            >
              레거시
            </span>
            <span
              className={cx(
                "text-[13px] font-semibold",
                isLight ? "text-slate-700" : "text-txt",
              )}
            >
              에디터 비교 실험실 (TipTap vs BlockNote)
            </span>
          </div>
          <p
            className={cx(
              "text-[12px] mb-3",
              isLight ? "text-slate-500" : "text-txt3",
            )}
          >
            이 페이지는 원래 에디터 비교 도구로 사용되었습니다. 비교 기능은
            아래로 이동되었습니다.
          </p>
          <div className="flex gap-2">
            <Link
              href="/editor-lab/tiptap-code-test"
              className={cx(
                "px-3 py-1.5 rounded-lg text-[12px] border transition-all",
                isLight
                  ? "border-slate-200 text-slate-600 hover:border-primary/40 hover:text-primary"
                  : "border-line/40 text-txt2 hover:border-primary/40 hover:text-primary",
              )}
            >
              코드 하이라이팅 테스트 →
            </Link>
            <Link
              href="/editor-lab/split-demo"
              className={cx(
                "px-3 py-1.5 rounded-lg text-[12px] border transition-all",
                isLight
                  ? "border-slate-200 text-slate-600 hover:border-accent/40 hover:text-accent"
                  : "border-line/40 text-txt2 hover:border-accent/40 hover:text-accent",
              )}
            >
              Split View Demo →
            </Link>
          </div>
        </div>

        <p
          className={cx(
            "mt-6 text-center text-[11px]",
            isLight ? "text-slate-400" : "text-txt3",
          )}
        >
          BrainX Playground · 실험용 페이지 · 백엔드 미연결 · TipTap v3 +
          Lowlight
        </p>
      </div>
    </div>
  );
}

/* ── DemoCard ─────────────────────────────────── */
function DemoCard({ demo, isLight }: { demo: Demo; isLight: boolean }) {
  const colorMap = {
    primary: {
      badge: "border-primary/30 bg-primary/10 text-primary",
      dot: "bg-primary",
    },
    accent: {
      badge: "border-accent/30 bg-accent/10 text-accent",
      dot: "bg-accent",
    },
    cyan: { badge: "border-cyan/30 bg-cyan/10 text-cyan", dot: "bg-cyan" },
    green: {
      badge: "border-green-500/30 bg-green-500/10 text-green-400",
      dot: "bg-green-400",
    },
  };
  const colors = demo.badge ? colorMap[demo.badge.color] : colorMap.primary;

  return (
    <Link
      href={demo.href}
      className={cx(
        "group flex flex-col rounded-2xl border p-4 transition-all",
        isLight
          ? "bg-white border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
          : "border-line/40 bg-surface/30 hover:border-line hover:bg-surface/50 hover:-translate-y-0.5",
      )}
    >
      {demo.badge && (
        <span
          className={cx(
            "self-start px-2 py-0.5 rounded-full text-[10px] font-bold border mb-2",
            colors.badge,
          )}
        >
          {demo.badge.label}
        </span>
      )}
      <h3
        className={cx(
          "text-[14px] font-bold font-display mb-0.5",
          isLight ? "text-slate-800" : "text-txt",
        )}
      >
        {demo.title}
      </h3>
      <p
        className={cx(
          "text-[11px] mb-2",
          isLight ? "text-slate-400" : "text-txt3",
        )}
      >
        {demo.subtitle}
      </p>
      <p
        className={cx(
          "text-[12px] leading-relaxed flex-1 mb-3",
          isLight ? "text-slate-600" : "text-txt2",
        )}
      >
        {demo.description}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
        {demo.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className={cx(
              "text-[10px] px-1.5 py-px rounded-full",
              isLight ? "bg-slate-100 text-slate-500" : "bg-surface2 text-txt3",
            )}
          >
            {tag}
          </span>
        ))}
      </div>
      <div
        className={cx(
          "mt-3 flex items-center gap-1 text-[12px] font-medium transition-all group-hover:gap-2",
          isLight
            ? "text-slate-400 group-hover:text-primary"
            : "text-txt3 group-hover:text-primary",
        )}
      >
        열기
        <ArrowRight size={12} />
      </div>
    </Link>
  );
}
