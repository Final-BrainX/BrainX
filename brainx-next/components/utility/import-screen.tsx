"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cx, createId } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Badge, Btn, Card, Icon } from "@/components/brainx-ui";

import { SectionCard, Stat } from "@/components/utility/utility-shared";

type ImportJob = {
  id: string;
  source: string;
  files: string;
  status: string;
  when: string;
};

const IMPORT_SOURCES = [
  { id: "notion", label: "Notion", sub: "페이지 · DB · 체크리스트", icon: "notes" as const, color: "59 130 246", files: "24개 항목" },
  { id: "obsidian", label: "Obsidian", sub: "Markdown · 백링크", icon: "doc" as const, color: "139 92 246", files: "51개 항목" },
  { id: "pdf", label: "PDF", sub: "강의자료 · 리포트", icon: "pdf" as const, color: "34 211 238", files: "8개 파일" },
  { id: "web", label: "Web Clip", sub: "기사 · 하이라이트", icon: "globe" as const, color: "52 211 153", files: "16개 항목" },
  { id: "docs", label: "Google Docs", sub: "문서 · 회의록", icon: "upload" as const, color: "244 114 182", files: "12개 파일" }
] as const;

const IMPORT_STEPS = [
  { title: "구조 분석", desc: "헤더, 표, 체크리스트, 코드블록을 파싱합니다." },
  { title: "주제 분류", desc: "노트를 5개 클러스터로 자동 분류합니다." },
  { title: "백링크 복원", desc: "중복 링크를 정리하고 연결 그래프를 다시 만듭니다." },
  { title: "AI 요약", desc: "각 노트의 핵심을 3줄로 압축합니다." }
];

const IMPORT_HISTORY: ImportJob[] = [
  { id: "job-1", source: "Notion", files: "24개 항목", status: "완료", when: "오늘 10:12" },
  { id: "job-2", source: "Obsidian", files: "51개 항목", status: "완료", when: "어제" },
  { id: "job-3", source: "PDF", files: "8개 파일", status: "검토 중", when: "2일 전" }
];

export function ImportScreen() {
  const { notes, pushToast } = useBrainX();
  const [source, setSource] = useState<(typeof IMPORT_SOURCES)[number]["id"]>("notion");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(12);
  const [history, setHistory] = useState<ImportJob[]>(IMPORT_HISTORY);
  const completionRef = useRef<string | null>(null);

  const selectedSource = useMemo(
    () => IMPORT_SOURCES.find((item) => item.id === source) ?? IMPORT_SOURCES[0],
    [source]
  );

  useEffect(() => {
    if (!running) return;

    const interval = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + (current < 40 ? 16 : current < 80 ? 10 : 6), 100);
        if (next === 100) {
          window.clearInterval(interval);
          setRunning(false);
          completionRef.current = selectedSource.id;
        }
        return next;
      });
    }, 150);

    return () => window.clearInterval(interval);
  }, [running, selectedSource.id]);

  useEffect(() => {
    if (progress !== 100 || !completionRef.current) return;
    const finished = IMPORT_SOURCES.find((item) => item.id === completionRef.current) ?? IMPORT_SOURCES[0];
    completionRef.current = null;
    setHistory((current) => [
      {
        id: createId("job"),
        source: finished.label,
        files: finished.files,
        status: "완료",
        when: "방금"
      },
      ...current.slice(0, 3)
    ]);
    pushToast(`${finished.label} 가져오기를 완료했어요`, "ok");
  }, [progress, pushToast]);

  const startImport = () => {
    if (running) return;
    setProgress(12);
    setRunning(true);
  };

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="34 211 238" dot className="mb-2.5">
            가져오기 · 노트 동기화
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">외부 지식 가져오기</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">
            Notion, Obsidian, PDF, 웹 클립을 BrainX 노트로 변환합니다. 현재 로컬 미리보기 기준으로 동작합니다.
          </p>
        </div>
        <Btn variant="primary" icon="upload" onClick={startImport} disabled={running}>
          {running ? "가져오는 중…" : "가져오기 시작"}
        </Btn>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card glow className="overflow-hidden p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[12px] text-txt3">선택된 소스</div>
              <div className="mt-1 flex items-center gap-2 text-[18px] font-bold tracking-tight">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${selectedSource.color})` }} />
                {selectedSource.label}
              </div>
            </div>
            <Badge color={selectedSource.color} dot>
              {selectedSource.files}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-line/60 bg-surface2/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-txt3">
                <Icon name="upload" size={14} />
                업로드 대기열
              </div>
              <div className="space-y-2">
                {IMPORT_SOURCES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSource(item.id)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      source === item.id ? "border-primary/50 bg-primary/[0.10]" : "border-line/50 bg-surface2/40 hover:border-primary/35"
                    )}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `rgb(${item.color} / 0.14)`, color: `rgb(${item.color})` }}>
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-txt">{item.label}</span>
                      <span className="block truncate text-[11.5px] text-txt3">{item.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-line/60 bg-surface2/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[12px] font-semibold text-txt3">진행 상태</div>
                <span className="text-[12px] font-mono text-txt2">{progress}%</span>
              </div>
              <div className="mb-3 h-3 rounded-full bg-surface2">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[13px] leading-relaxed text-txt2">
                {running
                  ? "분석 중입니다. 헤더 구조와 연결, 요약을 차례대로 생성하는 중이에요."
                  : "준비가 완료되면 가져오기를 눌러 로컬 미리보기를 갱신합니다."}
              </p>

              <div className="mt-4 space-y-2">
                {IMPORT_STEPS.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3 rounded-xl bg-surface/50 p-3">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-[12px] font-semibold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-txt">{step.title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-txt3">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Stat label="현재 노트" value={String(notes.length)} desc="로컬 저장된 문서" icon="doc" color="59 130 246" />
          <Stat label="평균 연결" value={`${Math.round(notes.reduce((acc, note) => acc + note.links.length, 0) / Math.max(notes.length, 1))}`} desc="노트당 링크 수" icon="link" color="139 92 246" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="지원 형식" sub="드래그 앤 드롭 대신 소스별 파이프라인을 선택하는 구조입니다.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {IMPORT_SOURCES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSource(item.id)}
                className={cx(
                  "rounded-2xl border p-4 text-left transition-all",
                  source === item.id ? "border-primary/50 bg-primary/[0.08] shadow-soft" : "border-line/50 bg-surface2/40 hover:border-primary/35"
                )}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `rgb(${item.color} / 0.14)`, color: `rgb(${item.color})` }}>
                    <Icon name={item.icon} size={18} />
                  </div>
                  <Icon name="chevR" size={16} className="text-txt3" />
                </div>
                <div className="text-[14px] font-semibold text-txt">{item.label}</div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-txt3">{item.sub}</div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="최근 가져오기"
          sub="완료 내역은 로컬 미리보기에서만 갱신됩니다."
          action={<Btn variant="soft" size="sm" icon="refresh" onClick={() => pushToast("가져오기 기록을 새로 고쳤어요")}>새로고침</Btn>}
        >
          <div className="space-y-2.5">
            {history.map((job) => (
              <div key={job.id} className="flex items-center gap-3 rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan/15 text-cyan">
                  <Icon name="import" size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-txt">{job.source}</div>
                  <div className="text-[11.5px] text-txt3">{job.files} · {job.when}</div>
                </div>
                <Badge className="!h-5">{job.status}</Badge>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
