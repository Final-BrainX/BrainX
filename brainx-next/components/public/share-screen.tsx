"use client";

import { useMemo } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { CLUSTERS, SAMPLE_MD, noteById } from "@/lib/brainx-data";

import { Avatar, Badge, Btn, Icon, ThemeToggle } from "@/components/brainx-ui";

import { useBrainX } from "@/components/brainx-provider";

export function ShareScreen({ noteId }: { noteId?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notes } = useBrainX();
  const resolvedId = noteId ?? searchParams.get("id") ?? "n1";
  const note = useMemo(() => noteById(notes, resolvedId) ?? noteById(notes, "n1"), [notes, resolvedId]);
  const cluster = note ? CLUSTERS.find((entry) => entry.id === note.cluster) ?? CLUSTERS[0] : CLUSTERS[0];
  const markdown = note ? SAMPLE_MD[note.id] ?? note.markdown : "";

  const copyLink = async () => {
    if (!note) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore clipboard issues
    }
  };

  return (
    <div data-route className="h-full overflow-y-auto scroll">
      <header className="sticky top-0 z-10 flex h-16 items-center border-b border-line/40 bg-bg/60 px-6 backdrop-blur-xl">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Icon name="brain" size={17} className="text-white" />
          </div>
          <span className="font-display font-bold">BrainX</span>
        </button>
        <div className="flex-1" />
        <Badge color="234 179 8" dot className="mr-3">
          읽기 전용 · 23일 후 만료
        </Badge>
        <ThemeToggle />
      </header>

      <article className="mx-auto max-w-2xl px-6 py-12">
        <Badge color={cluster.color} dot className="mb-4">
          {cluster.label}
        </Badge>
        <h1 className="mb-4 text-[34px] font-bold tracking-tight">{note?.title ?? "공유 노트"}</h1>
        <div className="mb-8 flex items-center gap-3 border-b border-line/40 pb-8">
          <Avatar name="연우" size={36} />
          <div>
            <div className="text-[14px] font-medium text-txt">김연우</div>
            <div className="text-[12px] text-txt3">2026년 6월 6일 작성 · 공개 노트</div>
          </div>
        </div>
        <div className="prose-bx space-y-4">
          {markdown
            .split("\n")
            .map((line, index) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={index} className="text-[20px] font-bold mt-7 mb-2">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <li
                    key={index}
                    className="ml-5 list-disc text-[15px] leading-relaxed text-txt2"
                    dangerouslySetInnerHTML={{ __html: line.replace("- ", "").replace(/\*\*(.+?)\*\*/g, "<b class=\"text-txt\">$1</b>") }}
                  />
                );
              }
              if (!line.trim()) return null;
              return <p key={index} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<b class=\"text-txt\">$1</b>") }} />;
            })}
        </div>
        <div className="mt-10 flex gap-2 border-t border-line/40 pt-8">
          <Btn variant="primary" icon="bolt" onClick={() => router.push("/home")}>
            BrainX로 열기
          </Btn>
          <Btn variant="soft" icon="copy" onClick={copyLink}>
            링크 복사
          </Btn>
        </div>
      </article>
    </div>
  );
}
