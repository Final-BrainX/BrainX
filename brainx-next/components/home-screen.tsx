"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clusterById, type BrainXNote } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Card, Icon, SectionHead } from "@/components/brainx-ui";
import { readAuthSession } from "@/lib/auth-api";
import { getMyProfile } from "@/lib/user-api";
import { cx } from "@/lib/utils";

function userNameFromSession() {
  const session = readAuthSession();
  return session?.nickname?.trim() || session?.email?.split("@")[0] || "사용자";
}

function topicLabel(note: BrainXNote) {
  return note.tags[0] || clusterById(note.cluster).label;
}

function UserInsightDashboard({ notes }: { notes: BrainXNote[] }) {
  const router = useRouter();
  const [topicView, setTopicView] = useState<"bubble" | "trend">("bubble");
  const totalLinks = notes.reduce((count, note) => count + note.links.length, 0);
  const totalWords = notes.reduce((count, note) => count + note.words, 0);
  const topClusters = useMemo(() => {
    const grouped = new Map<string, { label: string; color: string; count: number; words: number; links: number }>();

    for (const note of notes) {
      const cluster = clusterById(note.cluster);
      const current = grouped.get(note.cluster) ?? { label: cluster.label, color: cluster.color, count: 0, words: 0, links: 0 };
      current.count += 1;
      current.words += note.words;
      current.links += note.links.length;
      grouped.set(note.cluster, current);
    }

    return [...grouped.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.count - a.count || b.links - a.links)
      .slice(0, 5);
  }, [notes]);

  const dormantNote = useMemo(
    () => [...notes].sort((a, b) => a.links.length - b.links.length || a.words - b.words)[0] ?? null,
    [notes]
  );
  const focusNote = useMemo(
    () => [...notes].sort((a, b) => b.links.length - a.links.length || b.words - a.words)[0] ?? null,
    [notes]
  );
  const recommendedTopic = topClusters[0]?.label ?? "AI 지식 정리";

  const bubbles = topClusters.map((cluster, index) => ({
    ...cluster,
    size: Math.min(96, 44 + cluster.count * 12 + cluster.links * 3),
    left: [18, 40, 63, 78, 30][index] ?? 50,
    top: [62, 36, 58, 28, 22][index] ?? 50
  }));
  const trendDays = ["월", "화", "수", "목", "금", "토", "일"];
  const trendMax = Math.max(...topClusters.map((cluster) => cluster.count + Math.floor(cluster.links / 3)), 6);
  const trendLines = topClusters.slice(0, 4).map((cluster, clusterIndex) => {
    const values = trendDays.map((_, dayIndex) => {
      const wave = ((dayIndex + clusterIndex) % 3) - 1;
      return Math.max(1, cluster.count + wave + Math.floor(cluster.links / 4));
    });
    const points = values
      .map((value, index) => {
        const x = 46 + (index / Math.max(trendDays.length - 1, 1)) * 608;
        const y = 250 - (value / trendMax) * 196;
        return `${Math.round(x)},${Math.round(y)}`;
      })
      .join(" ");

    return { ...cluster, values, points };
  });

  const kpis = [
    { icon: "doc" as const, label: "분석된 노트", value: `${notes.length}개`, sub: "현재 지식 베이스", color: "59 130 246" },
    { icon: "link" as const, label: "지식 연결", value: `${totalLinks}개`, sub: "노트 간 참조", color: "139 92 246" },
    { icon: "cluster" as const, label: "핵심 주제", value: `${topClusters.length}개`, sub: "활성 주제군", color: "234 179 8" },
    { icon: "bolt" as const, label: "작성 밀도", value: `${Math.round(totalWords / Math.max(notes.length, 1)).toLocaleString()}자`, sub: "노트 평균 분량", color: "34 211 238" }
  ];

  const insights = [
    {
      color: "rgb(139 92 246)",
      text: focusNote
        ? `${topicLabel(focusNote)} 관련 노트가 현재 지식 그래프의 중심에 있습니다. 특히 "${focusNote.title}" 노트가 여러 주제를 연결하고 있어요.`
        : "아직 중심 주제를 분석할 노트가 부족합니다."
    },
    {
      color: "rgb(59 130 246)",
      text: `최근 지식 흐름은 ${topClusters.slice(0, 3).map((cluster) => cluster.label).join(", ")} 영역에 집중되어 있습니다.`
    },
    {
      color: "rgb(244 114 182)",
      text: dormantNote
        ? `"${dormantNote.title}" 노트는 연결이 적은 편입니다. 관련 노트와 이어주면 지식 그래프가 더 촘촘해집니다.`
        : "방치된 노트가 아직 보이지 않습니다."
    },
    {
      color: "rgb(52 211 153)",
      text: `다음에는 ${recommendedTopic}에서 파생되는 세부 개념을 하나 더 정리해보면 학습 흐름이 자연스럽게 이어집니다.`
    }
  ];

  return (
    <section className="mb-4">
      <SectionHead
        icon="dash"
        color="99 102 241"
        title="나의 지식 인사이트"
        sub="최근 노트 활동을 바탕으로 BrainX가 정리한 개인 리포트"
      />

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
        <Card glow className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold text-txt3">이번 주 지식 요약</p>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">개인 리포트</span>
          </div>
          <p className="text-[16px] leading-8 text-txt2">
            최근 사용자는{" "}
            <b className="text-txt">{topClusters.slice(0, 3).map((cluster) => cluster.label).join(", ") || "새로운 주제"}</b>
            를 중심으로 지식을 확장하고 있습니다. 총 <b className="text-primary">{notes.length}개의 노트</b>와{" "}
            <b className="text-accent">{totalLinks}개의 연결</b>이 현재 학습 흐름을 만들고 있어요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topClusters.slice(0, 4).map((cluster) => (
              <span
                key={cluster.id}
                className="rounded-lg border border-line/60 bg-surface2/60 px-3 py-1.5 text-[12px] font-medium text-txt2"
              >
                {cluster.label} {cluster.count}
              </span>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <p className="mb-3 text-[13px] font-semibold text-txt3">다시 보면 좋은 노트</p>
          <p className="flex-1 text-[15px] leading-7 text-txt2">
            {dormantNote ? (
              <>
                <b className="text-txt">{dormantNote.title}</b> 노트는 아직 연결이 적습니다. 관련 개념을 추가하거나 다른 노트와 연결해보세요.
              </>
            ) : (
              "다시 살펴볼 노트를 찾는 중입니다."
            )}
          </p>
          <Btn variant="soft" size="sm" className="mt-4 w-fit" icon="notes" onClick={() => dormantNote && router.push(`/notes/${dormantNote.id}`)}>
            노트 열기
          </Btn>
        </Card>

        <Card className="flex flex-col p-5">
          <p className="mb-3 text-[13px] font-semibold text-txt3">다음 추천 정리 주제</p>
          <p className="flex-1 text-[15px] leading-7 text-txt2">
            <b className="text-primary">{recommendedTopic}</b> 흐름이 활발합니다. 다음에는 관련 세부 개념, 예시, 의사결정 기준을 한 노트로 묶어보세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["개념 정리", "예시 추가", "연결 확장"].map((label) => (
              <span key={label} className="rounded-lg bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent">
                {label}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-txt3">{kpi.label}</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `rgb(${kpi.color} / 0.13)`, color: `rgb(${kpi.color})` }}>
                <Icon name={kpi.icon} size={18} />
              </span>
            </div>
            <div className="text-[26px] font-bold tracking-tight text-txt">{kpi.value}</div>
            <div className="mt-1 text-[13px] text-txt3">{kpi.sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold tracking-tight text-txt">주제 지도</h2>
              <p className="mt-1 text-[13px] text-txt3">노트 수, 연결 수, 작성 밀도를 함께 본 지식 분포</p>
            </div>
            <div className="flex rounded-xl border border-line/60 bg-surface2/60 p-1">
              {(["bubble", "trend"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setTopicView(view)}
                  className={cx(
                    "h-8 rounded-lg px-3 text-[12px] font-semibold transition",
                    topicView === view ? "bg-white text-primary shadow-soft" : "text-txt3 hover:text-txt"
                  )}
                >
                  {view === "bubble" ? "버블" : "추이"}
                </button>
              ))}
            </div>
          </div>

          <div className="relative h-[340px] overflow-hidden rounded-2xl border border-line/60 bg-[radial-gradient(circle_at_30%_20%,rgb(99_102_241/.12),transparent_30%),linear-gradient(180deg,rgb(255_255_255/.72),rgb(255_255_255/.38))] dark:bg-surface2/40">
            {topicView === "bubble" ? (
              <>
            <div className="absolute inset-x-6 top-1/4 h-px bg-line/50" />
            <div className="absolute inset-x-6 top-1/2 h-px bg-line/50" />
            <div className="absolute inset-x-6 top-3/4 h-px bg-line/50" />
            <div className="absolute inset-y-6 left-1/4 w-px bg-line/50" />
            <div className="absolute inset-y-6 left-1/2 w-px bg-line/50" />
            <div className="absolute inset-y-6 left-3/4 w-px bg-line/50" />

            {bubbles.map((bubble) => (
              <button
                key={bubble.id}
                type="button"
                className={cx(
                  "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center shadow-soft transition hover:scale-105",
                  "bg-white/80 backdrop-blur"
                )}
                style={{
                  left: `${bubble.left}%`,
                  top: `${bubble.top}%`,
                  width: bubble.size,
                  height: bubble.size,
                  borderColor: `rgb(${bubble.color} / 0.55)`,
                  boxShadow: `0 20px 50px rgb(${bubble.color} / 0.18)`
                }}
                title={`${bubble.label}: 노트 ${bubble.count}개, 연결 ${bubble.links}개`}
              >
                <span className="px-2 text-[12px] font-bold leading-tight text-txt">{bubble.label}</span>
              </button>
            ))}
              </>
            ) : (
              <div className="absolute inset-0 p-5">
                <svg viewBox="0 0 700 280" className="h-full w-full overflow-visible">
                  {[0, 1, 2, 3].map((line) => (
                    <line key={line} x1="46" y1={54 + line * 62} x2="654" y2={54 + line * 62} stroke="rgb(var(--line) / 0.72)" strokeWidth="1" />
                  ))}
                  {trendLines.map((line) => (
                    <g key={line.id}>
                      <polyline points={line.points} fill="none" stroke={`rgb(${line.color})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      {line.points.split(" ").map((point, index) => {
                        const [cx, cy] = point.split(",").map(Number);
                        return <circle key={`${line.id}-${index}`} cx={cx} cy={cy} r="4" fill={`rgb(${line.color})`} />;
                      })}
                    </g>
                  ))}
                  {trendDays.map((day, index) => (
                    <text key={day} x={46 + (index / Math.max(trendDays.length - 1, 1)) * 608} y="270" textAnchor="middle" className="fill-txt3 text-[12px]">
                      {day}
                    </text>
                  ))}
                </svg>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-4">
            {topClusters.map((cluster) => (
              <div key={cluster.id} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${cluster.color})` }} />
                <span className="text-[13px] text-txt3">{cluster.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[18px] font-bold tracking-tight text-txt">인사이트 요약</h2>
          <p className="mt-1 text-[13px] text-txt3">활동에서 자동으로 관찰한 패턴</p>
          <div className="mt-5 space-y-4">
            {insights.map((insight, index) => (
              <div key={`${index}-${insight.text}`} className="flex gap-3">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: insight.color }} />
                <p className="text-[14px] leading-7 text-txt2">{insight.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const { notes } = useBrainX();
  const [displayName, setDisplayName] = useState("사용자");

  useEffect(() => {
    let active = true;
    setDisplayName(userNameFromSession());

    getMyProfile()
      .then((profile) => {
        if (!active) return;
        setDisplayName(profile.nickname?.trim() || profile.email.split("@")[0] || "사용자");
      })
      .catch(() => {
        if (active) setDisplayName(userNameFromSession());
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[15px] text-txt3">2026년 6월 8일 일요일 · 오전</p>
          <h1 className="text-[28px] font-bold tracking-tight">좋은 아침이에요, {displayName}님 🌿</h1>
          <p className="mt-1.5 text-[16px] text-txt2">
            오늘 <b className="text-txt">3개의 노트</b>가 새로 연결되었고, AI가 <b className="text-accent">2개의 인사이트</b>를 발견했어요.
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
              <div className="mt-1 whitespace-nowrap text-[14px] text-txt3">{stat.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <UserInsightDashboard notes={notes} />
    </div>
  );
}
