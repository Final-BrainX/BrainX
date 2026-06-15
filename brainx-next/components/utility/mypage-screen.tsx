"use client";

import { useMemo } from "react";

import { useRouter } from "next/navigation";

import { CLUSTERS } from "@/lib/brainx-data";

import { cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Avatar, Badge, Btn, Card, Icon, RelevanceBar, SectionHead, ThemeToggle } from "@/components/brainx-ui";

import { SectionCard, Stat } from "@/components/utility/utility-shared";

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
