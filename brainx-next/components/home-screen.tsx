"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clusterById, noteById, type BrainXNote } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon, RelevanceBar, SectionHead } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

function NoteCard({
  id,
  compact
}: {
  id: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { notes } = useBrainX();
  const note = noteById(notes, id);
  if (!note) return null;
  const cluster = clusterById(note.cluster);

  return (
    <Card hover onClick={() => router.push(`/notes/${note.id}`)} className="group p-4">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(${cluster.color})` }} />
          <span className="truncate text-[13.5px] text-txt3">{cluster.label}</span>
        </div>
        {note.isFavorite ? <Icon name="star" size={15} className="shrink-0 text-yellow-400" fill="currentColor" strokeWidth={0} /> : null}
      </div>
      <h3 className="mb-2 line-clamp-2 text-[17px] font-semibold leading-snug text-txt transition-colors group-hover:text-primary">
        {note.title}
      </h3>
      {!compact ? <p className="mb-3 line-clamp-2 text-[15px] leading-relaxed text-txt2">{note.summary}</p> : null}
      <div className="flex items-center justify-between text-[13.5px] text-txt3">
        <span className="flex items-center gap-1">
          <Icon name="clock" size={13} />
          {note.updated}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="link" size={13} />
          {note.links.length}개 연결
        </span>
      </div>
    </Card>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const { notes, pushToast } = useBrainX();
  const [semantic, setSemantic] = useState(false);

  const favorites = useMemo(() => notes.filter((note) => note.isFavorite), [notes]);
  const recent = useMemo(() => notes.slice(0, 6), [notes]);
  const semanticResults = useMemo<Array<{ note: BrainXNote; rel: number }>>(
    () =>
      [
        { note: noteById(notes, "n4"), rel: 94 },
        { note: noteById(notes, "n1"), rel: 88 },
        { note: noteById(notes, "n12"), rel: 81 }
      ].filter((item): item is { note: BrainXNote; rel: number } => Boolean(item.note)),
    [notes]
  );
  const suggestions = useMemo<Array<{ a: BrainXNote; b: BrainXNote; why: string }>>(
    () =>
      [
        {
          a: noteById(notes, "n2"),
          b: noteById(notes, "n9"),
          why: "RAG 검색 UX가 시맨틱 검색 스케치와 직접 맞닿아 있어요"
        },
        {
          a: noteById(notes, "n5"),
          b: noteById(notes, "n12"),
          why: "의사결정 편향과 프롬프트 제약 설계가 개념적으로 연결됩니다"
        }
      ].filter((item): item is { a: BrainXNote; b: BrainXNote; why: string } => Boolean(item.a && item.b)),
    [notes]
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[15px] text-txt3">2026년 6월 8일 일요일 · 오전</p>
          <h1 className="text-[28px] font-bold tracking-tight">좋은 아침이에요, 연우님 🌿</h1>
          <p className="mt-1.5 text-[16px] text-txt2">
            오늘 <b className="text-txt">3개</b>의 노트가 새로 연결되었고, AI가 <b className="text-accent">2개의 인사이트</b>를 발견했어요.
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="soft" icon="chat" onClick={() => router.push("/chat")}>
            AI에게 묻기
          </Btn>
          <Btn variant="primary" icon="plus" onClick={() => router.push("/notes/new")}>
            새 노트
          </Btn>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: "doc" as const, label: "전체 노트", value: String(notes.length), color: "59 130 246" },
          { icon: "link" as const, label: "AI 연결", value: String(notes.reduce((count, note) => count + note.links.length, 0)), color: "139 92 246" },
          { icon: "fire" as const, label: "작성 스트릭", value: "12일", color: "244 114 182" },
          { icon: "bolt" as const, label: "이번 달 토큰", value: "12.8K", color: "34 211 238" }
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-3.5 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `rgb(${stat.color} / 0.14)`, color: `rgb(${stat.color})` }}>
              <Icon name={stat.icon} size={20} />
            </div>
            <div>
              <div className="text-[24px] font-bold leading-none tracking-tight">{stat.value}</div>
              <div className="mt-1 text-[14px] whitespace-nowrap text-txt3">{stat.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {semantic ? (
        <Card glow className="mb-8 border-accent/40 p-5 fade-up">
          <SectionHead icon="sparkle" color="139 92 246" title="의미 기반 검색 결과" sub="키워드가 아닌 뜻으로 찾은 노트예요" />
          <div className="space-y-2.5">
            {semanticResults.map(({ note, rel }) => (
              <button key={note.id} type="button" onClick={() => router.push(`/notes/${note.id}`)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-surface2/50">
                <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${clusterById(note.cluster).color})` }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-medium text-txt">{note.title}</div>
                  <div className="truncate text-[14px] text-txt3">{note.summary}</div>
                </div>
                <RelevanceBar value={rel} />
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mb-8">
        <SectionHead
          icon="star"
          color="234 179 8"
          title="즐겨찾기"
          sub={`${favorites.length}개의 노트`}
          action={
            <Btn variant="ghost" size="sm" onClick={() => router.push("/notes/n1")}>
              전체 보기 <Icon name="chevR" size={14} />
            </Btn>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {favorites.map((note) => (
            <NoteCard key={note.id} id={note.id} />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <SectionHead icon="link" color="139 92 246" title="AI 추천 연결" sub="이 노트들을 이어보는 건 어때요?" />
        <div className="grid gap-4 md:grid-cols-2">
          {suggestions.map((item) => (
            <Card key={`${item.a.id}-${item.b.id}`} hover className="relative overflow-hidden p-5">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent opacity-40 blur-2xl" />
              <div className="relative mb-3 flex items-center gap-3">
                <div className="flex-1 truncate rounded-lg bg-surface2/60 px-3 py-2 text-[15px] font-medium text-txt">{item.a.title}</div>
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Icon name="link" size={15} />
                </div>
                <div className="flex-1 truncate rounded-lg bg-surface2/60 px-3 py-2 text-[15px] font-medium text-txt">{item.b.title}</div>
              </div>
              <p className="relative mb-3.5 text-[15px] leading-relaxed text-txt2">
                <span className="font-medium text-accent">왜? </span>
                {item.why}
              </p>
              <div className="relative flex gap-2">
                <Btn variant="soft" size="sm" icon="check" onClick={() => pushToast("두 노트를 연결했어요", "ok")}>
                  연결하기
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => pushToast("추천을 숨겼어요")}>
                  나중에
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <SectionHead
          icon="clock"
          color="34 211 238"
          title="최근 열람"
          sub="이어서 작업하기"
          action={
            <Btn variant="ghost" size="sm" onClick={() => router.push("/graph")}>
              그래프로 보기 <Icon name="graph" size={14} />
            </Btn>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((note) => (
            <NoteCard key={note.id} id={note.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
