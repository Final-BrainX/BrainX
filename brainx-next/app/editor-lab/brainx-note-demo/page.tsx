"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

const NoteDemoLayout = dynamic(
  () => import("@/components/editor-lab/brainx-note-demo/NoteDemoLayout"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100svh] items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent animate-pulse" />
          <p className="text-txt3 text-[13px]">BrainX Note Demo 로딩 중…</p>
        </div>
      </div>
    ),
  }
);

export default function BrainXNoteDemoPage() {
  // 배포(next build/start, NODE_ENV=production) 환경에서는 실험용 데모 라우트를 404 처리한다.
  // 로컬 개발(next dev)에서는 그대로 접근 가능하게 유지한다.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <NoteDemoLayout />;
}
