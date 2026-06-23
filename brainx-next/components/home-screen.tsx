"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clusterById, type BrainXNote } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Card, Icon } from "@/components/brainx-ui";
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

  const recommendedTopic = topClusters[0]?.label ?? "새로운 주제";

  const bubbles = topClusters.map((cluster, index) => ({
    ...cluster,
    size: Math.min(84, 40 + cluster.count * 10 + cluster.links * 2),
    left: [48, 25, 75, 80, 20][index] ?? 50,
    top: [50, 42, 35, 78, 80][index] ?? 50
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
    { icon: "doc" as const, label: "전체 노트", value: `${notes.length}`, sub: "현재 지식 베이스", color: "var(--accent)", fill: Math.min(100, (notes.length / 100) * 100) },
    { icon: "link" as const, label: "AI 연결", value: `${totalLinks}`, sub: "자동 감지된 컨텍스트", color: "16 185 129", fill: Math.min(100, (totalLinks / 200) * 100) },
    { icon: "fire" as const, label: "작성 스트릭", value: `12일`, sub: "연속 학습 기록", color: "249 115 22", fill: 40 },
    { icon: "bolt" as const, label: "이번 달 토큰", value: `12.8K`, sub: "AI 분석량", color: "var(--primary)", fill: 85 }
  ];

  const insights = [
    {
      color: "rgb(var(--accent))",
      tag: "그래프 허브",
      text: focusNote
        ? `${topicLabel(focusNote)} 관련 노트가 지식 그래프의 중심에 있어요. 특히 <strong>"${focusNote.title}"</strong>가 여러 주제를 연결하고 있어요.`
        : "아직 중심 주제를 분석할 노트가 부족해요."
    },
    {
      color: "rgb(16 185 129)",
      tag: "활성 흐름",
      text: `최근 지식 흐름은 <strong>${topClusters.slice(0, 3).map((cluster) => cluster.label).join(", ")}</strong> 영역에 집중되어 있어요.`
    },
    {
      color: "rgb(249 115 22)",
      tag: "연결 부족",
      text: dormantNote
        ? `<strong>"${dormantNote.title}"</strong> 노트는 연결이 적어요. 관련 노트와 이어주면 지식 그래프가 더 촘촘해져요.`
        : "방치된 노트가 아직 보이지 않아요."
    },
    {
      color: "rgb(var(--primary))",
      tag: "성장 기회",
      text: `<strong>${recommendedTopic}</strong>에서 파생되는 세부 개념을 더 정리하면 학습 흐름이 자연스럽게 이어져요.`
    }
  ];

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <div key={kpi.label} className="relative flex flex-col justify-between rounded-2xl border border-line/60 bg-surface/80 p-4 transition-colors hover:bg-surface">
            <div
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg"
              style={{ background: `rgb(${kpi.color} / 0.15)`, color: `rgb(${kpi.color})` }}
            >
              <Icon name={kpi.icon} size={16} />
            </div>
            <div className="mt-1 flex flex-col items-start justify-center gap-1">
              <div className="text-[12px] font-medium text-txt3">{kpi.label}</div>
              <div className="text-[24px] font-semibold leading-none tracking-tight text-txt" style={{ color: idx === 0 ? 'rgb(var(--accent))' : idx === 1 ? '#10B981' : idx === 2 ? '#F97316' : 'rgb(var(--primary))' }}>{kpi.value}</div>
            </div>
            {idx > 0 && (
              <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-line/50">
                <div className="h-full rounded-full" style={{ width: `${kpi.fill}%`, background: `rgb(${kpi.color})`, opacity: 0.8 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col rounded-2xl border border-line/60 bg-surface/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-accent/15 text-accent">
                <Icon name="brain" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">나의 지식 인사이트</span>
            </div>
            <button className="flex items-center gap-1 text-[11px] text-txt3 hover:text-txt">
              개인 리포트 <Icon name="chevR" size={12} />
            </button>
          </div>
          <div className="flex-1 p-5">
            <div
              className="mb-4 rounded-[0.4rem] border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 p-4 text-[13px] leading-relaxed text-txt shadow-[0_0_20px_rgba(168,85,247,0.05)]"
              dangerouslySetInnerHTML={{
                __html: `최근 <strong>${topClusters.slice(0, 3).map(c => c.label).join(", ")}</strong>을(를) 중심으로 지식을 확장하고 있어요. 총 <strong>${notes.length}개 노트</strong>와 <strong>${totalLinks}개 연결</strong>이 현재 학습 흐름을 만들고 있어요.`
              }}
            />
            <div className="mb-4 flex flex-wrap gap-1.5">
              {topClusters.map((cluster, i) => (
                <span
                  key={cluster.id}
                  className={cx(
                    "rounded-[0.4rem] border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-default",
                    i < 2 ? "border-accent/30 bg-accent/10 text-accent" : "border-line/60 bg-surface2/40 text-txt3"
                  )}
                >
                  {cluster.label} {cluster.count}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">분석된 노트</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{notes.length}개</div>
                <div className="absolute right-3 top-3 rounded-[0.4rem] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">+3 이번 주</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">지식 연결</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{totalLinks}개</div>
                <div className="absolute right-3 top-3 rounded-[0.4rem] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">+5 이번 주</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">핵심 주제군</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{topClusters.length}개</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">노트 평균 분량</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{Math.round(totalWords / Math.max(notes.length, 1))}자</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-line/60 bg-surface/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-orange-500/15 text-orange-500">
                <Icon name="sparkle" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">인사이트 요약</span>
            </div>
            <button className="flex items-center gap-1 text-[11px] text-txt3 hover:text-txt">
              활동에서 관찰한 패턴 <Icon name="chevR" size={12} />
            </button>
          </div>
          
          <div className="flex-1 flex flex-col justify-start">
            {insights.map((insight, index) => (
              <div key={index} className="flex items-stretch gap-3 border-b border-line/40 bg-surface/60 p-4 transition-colors hover:bg-surface cursor-default last:border-b-0">
                <div className="w-[3px] shrink-0 rounded-full" style={{ background: insight.color }} />
                <div className="flex-1">
                  <div className="mb-1 text-[15px] font-semibold uppercase tracking-wider" style={{ color: insight.color }}>{insight.tag}</div>
                  <div className="text-[13px] leading-relaxed text-txt2" dangerouslySetInnerHTML={{ __html: insight.text }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-line/60 bg-surface/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-emerald-500/15 text-emerald-500">
                <Icon name="link" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">주제 지도</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-txt3">
              <button onClick={() => setTopicView("bubble")} className={cx("hover:text-txt transition-colors", topicView === "bubble" && "text-txt font-semibold")}>버블</button>
              <span>·</span>
              <button onClick={() => setTopicView("trend")} className={cx("hover:text-txt transition-colors", topicView === "trend" && "text-txt font-semibold")}>추이</button>
              <Icon name="chevR" size={12} className="ml-1" />
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-center">
            <div className="relative h-[280px] w-full overflow-hidden rounded-[0.4rem] border border-line/60 bg-surface/50">
              {topicView === "bubble" ? (
                <svg viewBox="0 0 320 210" className="h-full w-full">
                  {bubbles.map((b, i) => {
                    if (i === bubbles.length - 1) return null;
                    const next = bubbles[i + 1];
                    return (
                      <line
                        key={`edge-${i}`}
                        x1={b.left * 3.2} y1={b.top * 2.1}
                        x2={next.left * 3.2} y2={next.top * 2.1}
                        stroke={`rgb(${b.color})`}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                        opacity="0.3"
                      />
                    );
                  })}
                  {bubbles.map((b, i) => (
                    <g key={`node-${i}`}>
                      <circle cx={b.left * 3.2} cy={b.top * 2.1} r={b.size * 0.4} fill={`rgb(${b.color} / 0.1)`} stroke={`rgb(${b.color})`} strokeWidth="1" />
                      <circle cx={b.left * 3.2} cy={b.top * 2.1} r="2.5" fill={`rgb(${b.color})`} />
                      <text x={b.left * 3.2} y={b.top * 2.1 - b.size * 0.15 - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="rgb(var(--txt))">{b.label}</text>
                      {i < 3 && <text x={b.left * 3.2} y={b.top * 2.1 + b.size * 0.2 + 5} textAnchor="middle" fontSize="8.5" fill="rgb(var(--txt3))">{b.count} 노트</text>}
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="absolute inset-0 p-4">
                  <svg viewBox="0 0 700 280" className="h-full w-full overflow-visible">
                    {[0, 1, 2, 3].map((line) => (
                      <line key={line} x1="46" y1={54 + line * 62} x2="654" y2={54 + line * 62} stroke="rgb(var(--line) / 0.5)" strokeWidth="1" />
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
            <div className="mt-3 flex flex-wrap gap-3 px-1">
              {bubbles.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 text-[11px] text-txt3">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: `rgb(${b.color})` }} />
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-line/60 bg-surface/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-accent/15 text-accent">
                <Icon name="doc" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">다시 보면 좋은 노트</span>
            </div>
            <button className="flex items-center gap-1 text-[11px] text-txt3 hover:text-txt">
              연결 추천 <Icon name="chevR" size={12} />
            </button>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-center">
            <div className="flex items-start gap-3 rounded-[0.4rem] border border-accent/20 bg-accent/5 p-4">
              <div className="mt-0.5 text-accent"><Icon name="doc" size={18} /></div>
              <div className="flex-1">
                <div className="mb-1 text-[15px] font-medium uppercase tracking-wider text-accent/70">연결 부족 노트</div>
                <div className="mb-1 text-[14px] font-semibold text-txt">{dormantNote?.title || "추천 노트가 없습니다"}</div>
                <div className="mb-3 text-[12px] leading-relaxed text-txt3">연결이 아직 적어요. 관련 개념을 추가하거나 다른 노트와 연결해보세요.</div>
                <button 
                  onClick={() => dormantNote && router.push(`/notes/${dormantNote.id}`)}
                  className="inline-flex items-center gap-1 rounded-[0.4rem] border border-accent/30 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors"
                >
                  <Icon name="chevR" size={12} /> 노트 열기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
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
    <div data-route className="mx-auto max-w-[1100px] px-6 py-6 md:px-8 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-wide text-txt3">{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date())} · 오전</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-txt">
            좋은 아침이에요,<br />
            <span className="text-accent">{displayName}</span>님 🌿
          </h1>
          <p className="mt-2 text-[13px] text-txt3">
            오늘 <strong className="font-medium text-txt2">3개의 노트</strong>가 새로 연결되었고, AI가 <strong className="font-medium text-txt2">2개의 인사이트</strong>를 발견했어요.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-[12px] font-medium text-accent">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          AI가 지식 그래프를 분석 중이에요
        </div>
      </div>

      <UserInsightDashboard notes={notes} />
    </div>
  );
}
