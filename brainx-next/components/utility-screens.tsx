"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CLUSTERS, PRICING } from "@/lib/brainx-data";
import { cx, countWords, createId } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, EmptyState, Icon, RelevanceBar, SectionHead, ThemeToggle, Toggle } from "@/components/brainx-ui";

type ImportJob = {
  id: string;
  source: string;
  files: string;
  status: string;
  when: string;
};

type WorkspacePreferences = {
  autoTag: boolean;
  semanticSearch: boolean;
  aiSummaries: boolean;
  shareLinks: boolean;
  emailDigest: boolean;
  compactMode: boolean;
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

const FAQ_ITEMS = [
  {
    id: "faq-1",
    question: "공유 링크는 얼마나 유지되나요?",
    answer: "기본 공유 링크는 30일 동안 유효합니다. 만료 전에는 링크를 다시 생성할 수 있고, 읽기 전용으로 유지됩니다."
  },
  {
    id: "faq-2",
    question: "노트가 사라졌다고 느껴질 때는 어떻게 하나요?",
    answer: "대부분은 필터나 검색 결과 때문입니다. 최근 노트, 즐겨찾기, 검색어를 확인하고 그래도 없으면 지원 티켓을 남겨주세요."
  },
  {
    id: "faq-3",
    question: "PDF 가져오기가 느린 이유는 무엇인가요?",
    answer: "문서 구조 분석과 요약, 링크 복원 단계가 순차적으로 진행되기 때문입니다. 큰 파일은 분할 업로드를 권장합니다."
  },
  {
    id: "faq-4",
    question: "AI 답변이 애매할 때는 어떻게 개선하나요?",
    answer: "더 구체적인 질문, 관련 노트 연결, 출처 강제 프롬프트를 사용하면 검색 품질이 안정됩니다."
  }
] as const;

const SUPPORT_CHANNELS = [
  { name: "이메일", value: "help@brainx.app", desc: "24시간 이내 응답", icon: "bell" as const },
  { name: "문서", value: "docs.brainx.app", desc: "가이드·FAQ·릴리즈 노트", icon: "doc" as const },
  { name: "운영 상태", value: "모든 시스템 정상", desc: "최근 장애 없음", icon: "shield" as const }
] as const;

const INVOICES = [
  { id: "inv-1", date: "2026-06-01", plan: "Free", amount: "₩0", status: "납부 완료" },
  { id: "inv-2", date: "2026-05-01", plan: "Free", amount: "₩0", status: "납부 완료" },
  { id: "inv-3", date: "2026-04-01", plan: "Free", amount: "₩0", status: "납부 완료" }
] as const;

const ADMIN_FLAGS = [
  { key: "semanticSearch", label: "의미 기반 검색", desc: "벡터 검색과 재순위화" },
  { key: "shareLinks", label: "공유 링크", desc: "외부 접근 허용" },
  { key: "aiSummaries", label: "AI 요약", desc: "저장 시 자동 요약" },
  { key: "autoTag", label: "자동 태깅", desc: "클러스터 추천" }
] as const;

const SETTINGS_KEY = "brainx_settings_v1";

function readPreferences(): WorkspacePreferences {
  if (typeof window === "undefined") {
    return {
      autoTag: true,
      semanticSearch: true,
      aiSummaries: true,
      shareLinks: true,
      emailDigest: false,
      compactMode: false
    };
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      autoTag: parsed.autoTag ?? true,
      semanticSearch: parsed.semanticSearch ?? true,
      aiSummaries: parsed.aiSummaries ?? true,
      shareLinks: parsed.shareLinks ?? true,
      emailDigest: parsed.emailDigest ?? false,
      compactMode: parsed.compactMode ?? false
    };
  } catch {
    return {
      autoTag: true,
      semanticSearch: true,
      aiSummaries: true,
      shareLinks: true,
      emailDigest: false,
      compactMode: false
    };
  }
}

function SectionCard({
  title,
  sub,
  children,
  action
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-txt">{title}</h2>
          {sub ? <p className="mt-1 text-[12px] text-txt3">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Stat({
  label,
  value,
  desc,
  icon,
  color
}: {
  label: string;
  value: string;
  desc: string;
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `rgb(${color} / 0.14)`, color: `rgb(${color})` }}>
        <Icon name={icon} size={20} />
      </div>
      <div>
        <div className="text-[21px] font-bold leading-none tracking-tight text-txt">{value}</div>
        <div className="mt-1 text-[12px] font-medium text-txt2">{label}</div>
        <div className="mt-1 text-[11px] text-txt3">{desc}</div>
      </div>
    </Card>
  );
}

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

export function MyPageScreen() {
  const router = useRouter();
  const { notes, pushToast } = useBrainX();

  const stats = useMemo(
    () => [
      { label: "전체 노트", value: String(notes.length), desc: "저장된 문서 수", icon: "doc" as const, color: "59 130 246" },
      { label: "즐겨찾기", value: String(notes.filter((note) => note.isFavorite).length), desc: "빠른 접근 대상", icon: "star" as const, color: "234 179 8" },
      { label: "총 단어", value: notes.reduce((sum, note) => sum + note.words, 0).toLocaleString(), desc: "노트 본문 합계", icon: "fire" as const, color: "244 114 182" },
      { label: "연결 수", value: String(notes.reduce((sum, note) => sum + note.links.length, 0)), desc: "노트 간 엣지", icon: "link" as const, color: "34 211 238" }
    ],
    [notes]
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="59 130 246" dot className="mb-2.5">
            프로필 · 개인 워크스페이스
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">내 페이지</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">
            개인 프로필, 사용량, 공개 링크, 활동 내역을 한 화면에서 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Btn variant="soft" icon="copy" onClick={() => pushToast("프로필 링크를 복사했어요", "ok")}>
            링크 복사
          </Btn>
          <Btn variant="primary" icon="eye" onClick={() => router.push("/share?id=n1")}>
            공개 페이지 보기
          </Btn>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name="연우" size={72} ring />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[22px] font-bold tracking-tight text-txt">김연우</h2>
                <Badge color="34 211 238" dot>BrainX Pro 체험 중</Badge>
              </div>
              <p className="mt-1 text-[13px] text-txt2">research@brainx.app · 서울 · 개인 워크스페이스</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Btn variant="soft" size="sm" icon="settings" onClick={() => router.push("/settings")}>
                  설정
                </Btn>
                <Btn variant="soft" size="sm" icon="upload" onClick={() => pushToast("프로필 이미지를 업데이트했어요", "ok")}>
                  이미지 변경
                </Btn>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface2/40 p-4">
              <div className="text-[12px] text-txt3">한 줄 소개</div>
              <div className="mt-1 text-[14px] font-medium text-txt">노트를 연결해 생각을 확장하는 사람</div>
            </div>
            <div className="rounded-2xl bg-surface2/40 p-4">
              <div className="text-[12px] text-txt3">가입일</div>
              <div className="mt-1 text-[14px] font-medium text-txt">2026년 6월 1일</div>
            </div>
          </div>
        </Card>

        <SectionCard title="작업 습관" sub="현재 로컬 데이터 기준으로 계산된 요약입니다.">
          <div className="space-y-3">
            {[
              { label: "아침 작업 비중", value: 78 },
              { label: "AI 연결 활용률", value: 64 },
              { label: "공유 노트 비중", value: 22 }
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between text-[12px] text-txt2">
                  <span>{item.label}</span>
                  <span className="font-mono text-txt3">{item.value}%</span>
                </div>
                <RelevanceBar value={item.value} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="최근 활동" sub="최근에 열어본 노트와 행동 기록입니다.">
          <div className="space-y-2.5">
            {notes.slice(0, 5).map((note) => {
              const cluster = CLUSTERS.find((item) => item.id === note.cluster) ?? CLUSTERS[0];
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => router.push(`/notes/${note.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${cluster.color})` }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-txt">{note.title}</div>
                    <div className="text-[11.5px] text-txt3">{note.updated} · {note.links.length} 연결</div>
                  </div>
                  <Icon name="chevR" size={15} className="text-txt3" />
                </button>
              );
            })}
          </div>
        </SectionCard>

        <div className="grid gap-4">
          <SectionCard title="즐겨찾는 클러스터" sub="노트 분포를 한눈에 봅니다.">
            <div className="space-y-2.5">
              {CLUSTERS.map((cluster) => {
                const count = notes.filter((note) => note.cluster === cluster.id).length;
                return (
                  <div key={cluster.id} className="rounded-xl border border-line/50 bg-surface2/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${cluster.color})` }} />
                        <span className="text-[13px] font-medium text-txt">{cluster.label}</span>
                      </div>
                      <span className="text-[11px] font-mono text-txt3">{count}개</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.max(12, Math.min(count * 18, 100))}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="저장 위치" sub="로컬 저장과 공유 범위를 정리합니다.">
            <div className="space-y-2.5 text-[13px] text-txt2">
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span>브라우저 localStorage</span>
                <Badge>활성</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span>공개 링크</span>
                <Badge color="34 211 238" dot>읽기 전용</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span>백엔드 동기화</span>
                <Badge color="244 114 182" dot>미연결</Badge>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function BillingScreen() {
  const { notes, pushToast } = useBrainX();
  const [annual, setAnnual] = useState(true);

  const usage = useMemo(
    () => [
      { label: "AI 토큰", value: 64 },
      { label: "저장 용량", value: 28 },
      { label: "공유 링크", value: 18 }
    ],
    []
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="234 179 8" dot className="mb-2.5">
            플랜 · 결제
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">요금제와 사용량</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">
            현재는 mock 결제 화면이며, 실제 결제는 연결되어 있지 않습니다. 노트 수와 사용량을 기준으로 플랜을 살펴봅니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="inline-flex items-center rounded-xl border border-line/60 bg-surface2/50 p-1">
            <button type="button" onClick={() => setAnnual(false)} className={cx("h-9 rounded-lg px-4 text-[13px]", annual ? "text-txt2" : "bg-surface text-txt")}>
              월간
            </button>
            <button type="button" onClick={() => setAnnual(true)} className={cx("h-9 rounded-lg px-4 text-[13px]", annual ? "bg-surface text-txt" : "text-txt2")}>
              연간 <span className="ml-1 text-[11px] text-cyan">-20%</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="노트 수" value={String(notes.length)} desc="현재 저장된 문서" icon="doc" color="59 130 246" />
        <Stat label="AI 연결" value={String(notes.reduce((sum, note) => sum + note.links.length, 0))} desc="노트 간 그래프" icon="link" color="139 92 246" />
        <Stat label="오늘 사용" value="12.8K" desc="추정 토큰 사용량" icon="bolt" color="34 211 238" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="p-5">
          <SectionHead icon="bill" title="플랜 선택" sub="월간/연간 요금을 전환해 비교합니다." />
          <div className="grid gap-4 xl:grid-cols-3">
            {PRICING.map((plan) => {
              const price = annual ? plan.yr : plan.price;
              return (
                <Card key={plan.id} glow={plan.best} className={cx("relative p-5", plan.best && "border-primary/50")}>
                  {plan.best ? <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">추천</Badge> : null}
                  <div className="mb-1 text-[15px] font-semibold text-txt2">{plan.name}</div>
                  <div className="mb-1 flex items-end gap-1">
                    <span className="text-[30px] font-bold tracking-tight text-txt">₩{price.toLocaleString()}</span>
                    <span className="mb-1.5 text-sm text-txt3">/월</span>
                  </div>
                  <p className="mb-4 text-[12.5px] text-txt3">{plan.tag}</p>
                  <Btn
                    variant={plan.best ? "primary" : "soft"}
                    className="mb-4 w-full"
                    onClick={() => pushToast(`${plan.name} 플랜을 선택했어요`, "ok")}
                  >
                    {plan.cta}
                  </Btn>
                  <ul className="space-y-2">
                    {plan.feats.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-[12.5px] text-txt2">
                        <Icon name="check" size={14} className="mt-0.5 shrink-0 text-cyan" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="사용량" sub="현재 로컬 워크스페이스 기준의 추정치입니다.">
            <div className="space-y-3">
              {usage.map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px] text-txt2">
                    <span>{item.label}</span>
                    <span className="font-mono text-txt3">{item.value}%</span>
                  </div>
                  <RelevanceBar value={item.value} />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="최근 청구서" sub="결제는 연결되어 있지 않으므로 모의 기록만 표시합니다.">
            <div className="space-y-2.5">
              {INVOICES.map((invoice) => (
                <div key={invoice.id} className="flex items-center gap-3 rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/14 text-primary">
                    <Icon name="bill" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-txt">{invoice.date}</div>
                    <div className="text-[11.5px] text-txt3">{invoice.plan} · {invoice.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-txt">{invoice.amount}</div>
                    <div className="text-[11px] text-txt3">세금계산서</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed, pushToast } = useBrainX();
  const [preferences, setPreferences] = useState<WorkspacePreferences>({
    autoTag: true,
    semanticSearch: true,
    aiSummaries: true,
    shareLinks: true,
    emailDigest: false,
    compactMode: false
  });
  const [nickname, setNickname] = useState("연우");
  const loadedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WorkspacePreferences> & { nickname?: string };
        setPreferences({
          autoTag: parsed.autoTag ?? true,
          semanticSearch: parsed.semanticSearch ?? true,
          aiSummaries: parsed.aiSummaries ?? true,
          shareLinks: parsed.shareLinks ?? true,
          emailDigest: parsed.emailDigest ?? false,
          compactMode: parsed.compactMode ?? false
        });
        if (parsed.nickname) setNickname(parsed.nickname);
      }
    } catch {
      // ignore localStorage errors
    } finally {
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...preferences, nickname }));
    } catch {
      // ignore localStorage errors
    }
  }, [nickname, preferences]);

  const updatePreference = (key: keyof WorkspacePreferences) => {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="139 92 246" dot className="mb-2.5">
            설정 · 환경 관리
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">설정</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">테마, 검색, 공유, 알림, 레이아웃을 로컬에 저장합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Btn variant="soft" icon="refresh" onClick={() => {
            setPreferences({
              autoTag: true,
              semanticSearch: true,
              aiSummaries: true,
              shareLinks: true,
              emailDigest: false,
              compactMode: false
            });
            setNickname("연우");
            pushToast("설정을 기본값으로 되돌렸어요", "ok");
          }}>
            초기화
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-5">
          <SectionHead icon="user" title="프로필" sub="변경 내용은 로컬 저장소에만 보관됩니다." />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={nickname} size={64} ring />
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-semibold text-txt">{nickname}</div>
                <div className="mt-1 text-[12px] text-txt3">research@brainx.app</div>
              </div>
            </div>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">닉네임</div>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Btn variant="soft" icon="copy" onClick={() => pushToast("프로필 설정을 저장했어요", "ok")}>
                저장하기
              </Btn>
              <Btn variant="outline" icon="globe" onClick={() => pushToast("공개 프로필 링크를 준비했어요")}>
                공유 링크
              </Btn>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="레이아웃" sub="사이드바와 테마는 즉시 반영됩니다.">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-txt">사이드바 접기</div>
                  <div className="text-[11.5px] text-txt3">워크스페이스 폭을 넓힙니다.</div>
                </div>
                <Toggle on={sidebarCollapsed} onChange={setSidebarCollapsed} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-txt">테마</div>
                  <div className="text-[11.5px] text-txt3">{theme === "dark" ? "다크" : "라이트"} 모드</div>
                </div>
                <Toggle on={theme === "light"} onChange={(value) => setTheme(value ? "light" : "dark")} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="검색과 자동화" sub="노트 저장과 검색 경험을 조절합니다.">
            <div className="space-y-2.5">
              {ADMIN_FLAGS.map((flag) => (
                <div key={flag.key} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium text-txt">{flag.label}</div>
                    <div className="text-[11.5px] text-txt3">{flag.desc}</div>
                  </div>
                  <Toggle on={preferences[flag.key]} onChange={() => updatePreference(flag.key)} />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="알림과 요약" sub="이메일 알림과 주간 요약을 설정합니다.">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-txt">이메일 요약</div>
                <div className="text-[11.5px] text-txt3">주간 활동 리포트 전송</div>
              </div>
              <Toggle on={preferences.emailDigest} onChange={() => updatePreference("emailDigest")} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-txt">컴팩트 모드</div>
                <div className="text-[11.5px] text-txt3">목록 밀도를 높입니다</div>
              </div>
              <Toggle on={preferences.compactMode} onChange={() => updatePreference("compactMode")} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="내보내기"
          sub="데이터는 로컬에 남아 있고, 내보내기는 브라우저에서 처리됩니다."
          action={<Btn variant="soft" size="sm" icon="upload" onClick={() => pushToast("설정 백업 파일을 준비했어요", "ok")}>백업</Btn>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="rounded-xl border border-line/50 bg-surface2/40 px-3 py-3 text-left" onClick={() => pushToast("노트 JSON 내보내기를 준비했어요", "ok")}>
              <div className="text-[13px] font-medium text-txt">노트 JSON</div>
              <div className="mt-1 text-[11.5px] text-txt3">메타데이터 포함</div>
            </button>
            <button type="button" className="rounded-xl border border-line/50 bg-surface2/40 px-3 py-3 text-left" onClick={() => pushToast("설정 JSON 내보내기를 준비했어요", "ok")}>
              <div className="text-[13px] font-medium text-txt">설정 JSON</div>
              <div className="mt-1 text-[11.5px] text-txt3">테마·레이아웃 포함</div>
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function SupportScreen() {
  const { pushToast } = useBrainX();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>("faq-1");
  const [category, setCategory] = useState("계정");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const filteredFaq = useMemo(
    () =>
      FAQ_ITEMS.filter(
        (item) =>
          !query.trim() ||
          item.question.toLowerCase().includes(query.toLowerCase()) ||
          item.answer.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="34 211 238" dot className="mb-2.5">
            지원 · 도움말
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">지원 센터</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">FAQ, 문의, 상태를 한 곳에 모아둔 mock 지원 화면입니다.</p>
        </div>
        <Btn variant="primary" icon="chat" onClick={() => pushToast("상담 요청을 접수했어요", "ok")}>
          상담 요청
        </Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4">
          <SectionCard title="자주 묻는 질문" sub="검색어로 FAQ를 좁혀볼 수 있습니다.">
            <label className="mb-4 block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">질문 검색</div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="예: 공유 링크, PDF, 환각"
                className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
              />
            </label>
            <div className="space-y-2">
              {filteredFaq.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOpen((current) => (current === item.id ? "" : item.id))}
                  className="w-full rounded-xl border border-line/50 bg-surface2/40 p-4 text-left transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[14px] font-medium text-txt">{item.question}</div>
                    <Icon name={open === item.id ? "chevD" : "chevR"} size={16} className="text-txt3" />
                  </div>
                  {open === item.id ? <div className="mt-2 text-[13px] leading-relaxed text-txt2">{item.answer}</div> : null}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="지원 채널" sub="운영 상태와 응답 기대치를 안내합니다.">
            <div className="space-y-2.5">
              {SUPPORT_CHANNELS.map((channel) => (
                <div key={channel.name} className="flex items-center gap-3 rounded-xl bg-surface2/40 px-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/14 text-primary">
                    <Icon name={channel.icon} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-txt">{channel.name}</div>
                    <div className="truncate text-[11.5px] text-txt3">{channel.value}</div>
                  </div>
                  <Badge>{channel.desc}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-4">
          <SectionCard title="문의 작성" sub="문의는 실제 전송되지 않고 토스트로만 기록됩니다.">
            <div className="space-y-3">
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">카테고리</div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none"
                >
                  {["계정", "결제", "가져오기", "버그", "기능 요청"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">제목</div>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="예: 공유 링크가 열리지 않아요"
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 text-[12px] font-medium text-txt2">내용</div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={6}
                  placeholder="문제가 재현되는 과정을 적어주세요."
                  className="w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 py-3 text-[14px] text-txt outline-none focus:border-primary/60"
                />
              </label>
              <div className="flex gap-2">
                <Btn
                  variant="primary"
                  icon="send"
                  className="flex-1"
                  onClick={() => {
                    if (!subject.trim() || !message.trim()) {
                      pushToast("제목과 내용을 먼저 입력하세요");
                      return;
                    }
                    pushToast(`${category} 문의를 접수했어요`, "ok");
                    setSubject("");
                    setMessage("");
                  }}
                >
                  보내기
                </Btn>
                <Btn variant="soft" icon="copy" onClick={() => pushToast("문의 양식을 복사했어요")}>
                  복사
                </Btn>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="진행 중인 티켓" sub="지원 흐름을 설명하는 목업 데이터입니다.">
            <div className="space-y-2.5">
              {[
                { title: "PDF 가져오기 지연", state: "해결 중", tone: "234 179 8" },
                { title: "공유 링크 만료 시점", state: "안내 완료", tone: "34 211 238" },
                { title: "모바일 편집 버그", state: "검토 중", tone: "244 114 182" }
              ].map((ticket) => (
                <div key={ticket.title} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-txt">{ticket.title}</div>
                    <div className="text-[11.5px] text-txt3">답변 예정: 24시간 이내</div>
                  </div>
                  <Badge color={ticket.tone} dot>{ticket.state}</Badge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function AdminScreen() {
  const { notes, pushToast } = useBrainX();
  const [flags, setFlags] = useState({
    semanticSearch: true,
    shareLinks: true,
    aiSummaries: true,
    autoTag: true
  });

  const stats = useMemo(
    () => [
      { label: "활성 사용자", value: "1,284", desc: "지난 24시간", icon: "user" as const, color: "59 130 246" },
      { label: "이상 징후", value: "2", desc: "검토 대기", icon: "shield" as const, color: "244 114 182" },
      { label: "평균 응답", value: "180ms", desc: "챗 API 추정", icon: "clock" as const, color: "34 211 238" },
      { label: "노트 인덱스", value: String(notes.length), desc: "현재 문서 수", icon: "doc" as const, color: "139 92 246" }
    ],
    [notes.length]
  );

  const flaggedNotes = useMemo(
    () => notes.filter((note) => note.links.length >= 3).slice(0, 4),
    [notes]
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="244 114 182" dot className="mb-2.5">
            관리자 · 운영 대시보드
          </Badge>
          <h1 className="text-[27px] font-bold tracking-tight">관리자</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">사용량, 플래그, 운영 상태를 점검하는 내부 화면입니다.</p>
        </div>
        <Btn variant="soft" icon="refresh" onClick={() => pushToast("운영 지표를 새로 고쳤어요", "ok")}>
          새로고침
        </Btn>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
        <Card className="p-5">
          <SectionHead icon="shield" title="기능 플래그" sub="로컬 mock 플래그를 토글합니다." />
          <div className="space-y-2.5">
            {ADMIN_FLAGS.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-txt">{flag.label}</div>
                  <div className="text-[11.5px] text-txt3">{flag.desc}</div>
                </div>
                <Toggle
                  on={flags[flag.key]}
                  onChange={() => setFlags((current) => ({ ...current, [flag.key]: !current[flag.key] }))}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="상태" sub="배포와 인프라 상태는 모의 값입니다.">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span className="text-[13px] text-txt2">API 응답</span>
                <Badge color="34 211 238" dot>Healthy</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span className="text-[13px] text-txt2">큐 적체</span>
                <Badge color="234 179 8" dot>Low</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <span className="text-[13px] text-txt2">보안 경고</span>
                <Badge color="244 114 182" dot>2건</Badge>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="클러스터별 분포" sub="노트 연결 밀도를 가볍게 훑어봅니다.">
            <div className="space-y-2.5">
              {CLUSTERS.map((cluster) => {
                const count = notes.filter((note) => note.cluster === cluster.id).length;
                return (
                  <div key={cluster.id}>
                    <div className="mb-1.5 flex items-center justify-between text-[12px] text-txt2">
                      <span>{cluster.label}</span>
                      <span className="font-mono text-txt3">{count}</span>
                    </div>
                    <RelevanceBar value={Math.max(18, count * 18)} />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="검토 대기 노트" sub="연결 수가 많은 노트는 우선 점검 대상으로 표기합니다.">
          <div className="space-y-2.5">
            {flaggedNotes.map((note, index) => (
              <button
                key={note.id}
                type="button"
                onClick={() => pushToast(`노트 ${note.title}를 열었습니다`) }
                className="flex w-full items-center gap-3 rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/14 text-primary font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-txt">{note.title}</div>
                  <div className="text-[11.5px] text-txt3">{countWords(note.markdown)} 단어 · {note.links.length} 연결</div>
                </div>
                <Icon name="chevR" size={15} className="text-txt3" />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="운영 로그" sub="최근 발생한 이벤트를 요약합니다.">
          <div className="space-y-2.5">
            {[
              { title: "semantic search index rebuilt", time: "10:14", tone: "34 211 238" },
              { title: "share link validated", time: "09:42", tone: "59 130 246" },
              { title: "admin flag toggled", time: "08:23", tone: "244 114 182" }
            ].map((log) => (
              <div key={`${log.title}-${log.time}`} className="flex items-start gap-3 rounded-xl bg-surface2/40 px-3 py-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(${log.tone})` }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-txt">{log.title}</div>
                  <div className="text-[11.5px] text-txt3">{log.time} · local mock</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <EmptyState
          icon="shield"
          title="관리자 화면은 mock 상태입니다"
          desc="실제 사용자/결제 데이터는 연결되어 있지 않으며, 운영 흐름만 UI로 시뮬레이션합니다."
          action={<Btn variant="primary" icon="sparkle" onClick={() => pushToast("운영 리포트를 생성했어요", "ok")}>리포트 생성</Btn>}
        />
      </div>
    </div>
  );
}
