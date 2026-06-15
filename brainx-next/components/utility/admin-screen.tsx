"use client";

import { useMemo, useState } from "react";

import { CLUSTERS } from "@/lib/brainx-data";

import { countWords, cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Avatar, Badge, Btn, Card, EmptyState, Icon, RelevanceBar, SectionHead, Toggle } from "@/components/brainx-ui";

import { SectionCard, Stat, readPreferences } from "@/components/utility/utility-shared";

const ADMIN_FLAGS = [
  { key: "semanticSearch", label: "의미 기반 검색", desc: "벡터 검색과 재순위화" },
  { key: "shareLinks", label: "공유 링크", desc: "외부 접근 허용" },
  { key: "aiSummaries", label: "AI 요약", desc: "저장 시 자동 요약" },
  { key: "autoTag", label: "자동 태깅", desc: "클러스터 추천" }
] as const;

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
