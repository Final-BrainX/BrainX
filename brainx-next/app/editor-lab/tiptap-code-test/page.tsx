"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cx } from "@/lib/utils";

const TipTapCodeEditor = dynamic(
  () => import("@/components/editor/TipTapCodeEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 rounded-xl bg-surface2/60" />
        <div className="h-16 rounded-xl bg-surface2/60" />
        <div className="h-96 rounded-xl bg-surface2/60" />
      </div>
    ),
  }
);

const ShikiComparison = dynamic(
  () => import("@/components/editor/ShikiComparison"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 rounded-xl bg-surface2/60 w-48" />
        <div className="h-10 rounded-xl bg-surface2/60" />
        <div className="h-72 rounded-xl bg-surface2/60" />
      </div>
    ),
  }
);

type Tab = "editor" | "comparison";

export default function TipTapCodeTestPage() {
  const [tab, setTab] = useState<Tab>("editor");

  return (
    <div className="min-h-screen bg-bg text-txt" data-route>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/editor-lab"
            className="inline-flex items-center gap-1 text-sm text-txt3 hover:text-txt transition-colors"
          >
            ← Editor Lab
          </Link>
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-txt">
              TipTap Code Highlight Test
            </h1>
            <span className="text-[11px] text-txt3 bg-surface2 px-2.5 py-1 rounded-full border border-line/30 mb-0.5">
              실험용 · 백엔드 미연결
            </span>
          </div>
          <p className="text-txt3 text-sm mt-2 leading-relaxed">
            에디터 하이라이팅 테스트 및 Lowlight · Shiki 비교
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-surface2/40 border border-line/30 w-fit">
          <button
            onClick={() => setTab("editor")}
            className={cx(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "editor"
                ? "bg-primary/20 text-primary font-semibold"
                : "text-txt3 hover:text-txt"
            )}
          >
            에디터 테스트
          </button>
          <button
            onClick={() => setTab("comparison")}
            className={cx(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === "comparison"
                ? "bg-primary/20 text-primary font-semibold"
                : "text-txt3 hover:text-txt"
            )}
          >
            Lowlight vs Shiki 비교
          </button>
        </div>

        {/* Content */}
        {tab === "editor" ? <TipTapCodeEditor /> : <ShikiComparison />}
      </div>
    </div>
  );
}
