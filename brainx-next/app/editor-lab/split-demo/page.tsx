"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { MOCK_NOTES } from "@/lib/notes/mockNotes";

const NotesWorkspace = dynamic(
  () => import("@/components/notes/NotesWorkspace"),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-[13px] text-txt3">
        Split View 로딩 중…
      </div>
    ),
  }
);

export default function SplitDemoPage() {
  // 배포(next build/start, NODE_ENV=production) 환경에서는 실험용 데모 라우트를 404 처리한다.
  // 로컬 개발(next dev)에서는 그대로 접근 가능하게 유지한다.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <WorkspaceProvider>
      <WorkspaceShell>
        <NotesWorkspace initialTab={{ kind: "note", noteId: MOCK_NOTES[0].id }} />
      </WorkspaceShell>
    </WorkspaceProvider>
  );
}
