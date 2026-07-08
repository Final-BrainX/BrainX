"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clusterById, type BrainXNote } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Card, Icon } from "@/components/brainx-ui";
import { useWorkspace } from "@/components/workspace-provider";
import { isDevAuthSession, readAuthSession } from "@/lib/auth-api";
import { DEV_USER_ID } from "@/lib/dev-user";
import { getMyProfile } from "@/lib/user-api";
import {
  AI_CLUSTER_MAX_CLUSTERS,
  AI_CLUSTER_MAX_NOTES,
  AI_CLUSTER_MIN_NOTES,
  UNASSIGNED_CLUSTER_ID,
  applyAiClustersToNotes,
  isAiFeatureReadyNote,
  resolveAiCluster,
  type AiClusterMeta,
  type AiClusterStatus,
} from "@/lib/ai-cluster-projection";
import {
  getLatestClusterJob,
  getLatestInsightReport,
  requestClusterJob,
  requestInsightReport,
  type ClusterJobLatestData,
  type InsightReportLatestData,
} from "@/lib/intelligence-api";
import { getMyWorkspaceStats, getWorkspaceDisplayName, type WorkspaceUserStatsData } from "@/lib/workspace-api";
import { summarizeWorkspaceNotes } from "@/lib/workspace-note-stats";
import { cx } from "@/lib/utils";

function userNameFromSession() {
  const session = readAuthSession();
  return session?.nickname?.trim() || session?.email?.split("@")[0] || "사용자";
}

function topicLabel(note: BrainXNote, clusterMetaById?: Map<string, AiClusterMeta>) {
  if (clusterMetaById?.has(note.cluster)) {
    return resolveAiCluster(note.cluster, clusterMetaById).label;
  }
  return note.tags[0] || clusterById(note.cluster).label;
}

type AiInsightStatus = "idle" | "loading" | "generating" | "error";

type HomeInsightItem = {
  color: string;
  tag: string;
  text?: string;
  html?: string;
};

function insightText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recommendationText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const title = insightText(record.title);
  const reason = insightText(record.reason);
  if (title && reason) return `${title} - ${reason}`;
  return title || reason;
}

function UserInsightDashboard({
  notes,
  currentWorkspaceId,
}: {
  notes: BrainXNote[];
  currentWorkspaceId: string | null;
}) {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [topicView, setTopicView] = useState<"bubble" | "trend">("bubble");
  const [clusterLatest, setClusterLatest] = useState<ClusterJobLatestData | null>(null);
  const [clusterStatus, setClusterStatus] = useState<AiClusterStatus>("idle");
  const [clusterError, setClusterError] = useState<string | null>(null);
  const clusterRequestIdRef = useRef(0);
  const [insightLatest, setInsightLatest] = useState<InsightReportLatestData | null>(null);
  const [insightStatus, setInsightStatus] = useState<AiInsightStatus>("idle");
  const [insightError, setInsightError] = useState<string | null>(null);
  const insightRequestIdRef = useRef(0);
  // notes(HomeScreen이 currentWorkspaceId 기준으로 이미 필터링해 넘긴 값)에서 직접 계산한다 —
  // getMyWorkspaceStats()(workspaceStats)는 SSOT상 "계정 전체 Workspace 합산" 전용이라 여기서
  // 쓰면 Workspace를 바꿔도 항상 같은 숫자가 나온다.
  const summary = useMemo(() => summarizeWorkspaceNotes(notes), [notes]);
  const totalNotes = summary.totalNotes;
  const totalLinks = summary.totalLinks;
  const totalWords = summary.totalWords;
  const recentActivityTitle = summary.recentNotes[0]?.title?.trim() || null;
  const currentSession = readAuthSession();
  // Ticket16: AI 클러스터/인사이트는 "default" 문자열이 아니라 현재 선택된 Workspace의 실제
  // documentGroupId가 있을 때만 호출한다 — Guest/미선택 상태(currentWorkspaceId=null)는 기존과
  // 동일하게 패널을 비활성 상태로 유지한다.
  const aiClusterPanelEnabled = !!currentSession?.accessToken && !isDevAuthSession(currentSession) && !!currentWorkspaceId;
  const aiInsightPanelEnabled =
    ((!!currentSession?.accessToken && !isDevAuthSession(currentSession)) || Boolean(DEV_USER_ID)) && !!currentWorkspaceId;
  const aiClusterProjection = useMemo(
    () => aiClusterPanelEnabled ? applyAiClustersToNotes(notes, clusterLatest) : { notes, clusters: null },
    [aiClusterPanelEnabled, clusterLatest, notes]
  );
  const topicNotes = aiClusterProjection.clusters ? aiClusterProjection.notes : notes;
  const topicClusters = aiClusterProjection.clusters;
  const clusterMetaById = useMemo(() => {
    const values = new Map<string, AiClusterMeta>();
    for (const cluster of topicClusters ?? []) {
      values.set(cluster.id, cluster);
    }
    return values;
  }, [topicClusters]);
  const aiClusterUsableNoteCount = useMemo(
    () => notes.filter(isAiFeatureReadyNote).length,
    [notes]
  );
  const noteIndexStatusUnavailable = notes.some((note) => note.indexStatusUnavailable);

  const topClusters = useMemo(() => {
    const grouped = new Map<string, { label: string; color: string; count: number; words: number; links: number }>();
    for (const note of topicNotes) {
      const cluster = topicClusters ? resolveAiCluster(note.cluster, clusterMetaById) : clusterById(note.cluster);
      const current = grouped.get(note.cluster) ?? { label: cluster.label, color: cluster.color, count: 0, words: 0, links: 0 };
      current.count += 1;
      current.words += note.words;
      current.links += note.links.length;
      grouped.set(note.cluster, current);
    }
    const sortedClusters = [...grouped.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.count - a.count || b.links - a.links);
    const visibleClusters = sortedClusters.slice(0, 5);
    const unassignedCluster = topicClusters ? sortedClusters.find((cluster) => cluster.id === UNASSIGNED_CLUSTER_ID) : undefined;
    if (unassignedCluster && !visibleClusters.some((cluster) => cluster.id === UNASSIGNED_CLUSTER_ID)) {
      return [...visibleClusters.slice(0, 4), unassignedCluster];
    }
    return visibleClusters;
  }, [clusterMetaById, topicClusters, topicNotes]);

  const dormantNote = useMemo(
    () => [...topicNotes].sort((a, b) => a.links.length - b.links.length || a.words - b.words)[0] ?? null,
    [topicNotes]
  );
  const focusNote = useMemo(
    () => [...topicNotes].sort((a, b) => b.links.length - a.links.length || b.words - a.words)[0] ?? null,
    [topicNotes]
  );

  const recommendedTopic = topClusters[0]?.label ?? "새로운 주제";
  const aiClusterButtonDisabled =
    !aiClusterPanelEnabled ||
    clusterStatus === "loading" ||
    clusterStatus === "analyzing" ||
    aiClusterUsableNoteCount < AI_CLUSTER_MIN_NOTES;
  const clusterActionLabel = clusterLatest?.state === "FRESH" ? "다시 분석" : "AI 클러스터링";
  const clusterStateMessage = (() => {
    if (!aiClusterPanelEnabled) {
      return { title: "기본 분류", body: "로그인된 실제 워크스페이스에서 AI 클러스터링을 실행할 수 있어요." };
    }
    if (clusterStatus === "loading") {
      return { title: "상태 확인 중", body: "최근 AI 클러스터 결과를 불러오고 있어요." };
    }
    if (clusterStatus === "analyzing") {
      return { title: "AI 분석 중", body: "현재 노트 스냅샷을 주제별로 묶고 있어요." };
    }
    if (clusterLatest?.state === "NO_SOURCE_NOTES") {
      return { title: "분석 대상 없음", body: "색인된 노트가 생기면 AI 클러스터를 만들 수 있어요." };
    }
    if (aiClusterUsableNoteCount < AI_CLUSTER_MIN_NOTES) {
      return { title: "노트 부족", body: `분석 가능한 노트가 ${AI_CLUSTER_MIN_NOTES}개 이상 필요해요.` };
    }
    if (clusterLatest?.state === "NOT_ANALYZED") {
      return { title: "AI 분석 전", body: "버튼을 누르면 현재 노트 기준의 주제 지도를 만들어요." };
    }
    if (clusterLatest?.state === "STALE") {
      return { title: "노트가 변경됨", body: "마지막 AI 결과를 표시 중이에요. 다시 분석해 최신화하세요." };
    }
    if (clusterLatest?.state === "FAILED") {
      return { title: "최근 분석 실패", body: clusterLatest.job?.failureMessage ?? "다시 분석을 실행해 주세요." };
    }
    if (clusterLatest?.state === "FRESH") {
      return { title: "AI 클러스터 적용", body: "현재 색인된 노트 스냅샷과 일치하는 주제 지도예요." };
    }
    if (clusterError) {
      return { title: "상태 확인 실패", body: clusterError };
    }
    return { title: "기본 분류", body: "아직 AI 클러스터 결과가 없어 기존 분류로 표시하고 있어요." };
  })();
  const insightReport = insightLatest?.report ?? null;
  const aiInsightButtonDisabled =
    !aiInsightPanelEnabled ||
    insightStatus === "loading" ||
    insightStatus === "generating" ||
    insightLatest?.state === "NO_SOURCE_NOTES";
  const insightActionLabel = (() => {
    if (insightLatest?.state === "FRESH") return "다시 생성";
    if (insightLatest?.state === "STALE") return "최신 리포트 생성";
    if (insightLatest?.state === "FAILED") return "재시도";
    return "AI 리포트 생성";
  })();
  const insightStateMessage = (() => {
    if (!aiInsightPanelEnabled) {
      return { title: "로컬 요약", body: "로그인된 실제 워크스페이스에서 AI 인사이트 리포트를 생성할 수 있어요." };
    }
    if (insightStatus === "loading") {
      return { title: "최근 리포트 확인 중", body: "이전에 생성한 AI 인사이트 리포트를 불러오고 있어요." };
    }
    if (insightStatus === "generating") {
      return { title: "AI 리포트 생성 중", body: "현재 노트 카드로 지식 공백과 추천 액션을 분석하고 있어요." };
    }
    if (insightLatest?.state === "NO_SOURCE_NOTES") {
      return { title: "분석 대상 없음", body: "색인된 노트가 생기면 AI 인사이트 리포트를 만들 수 있어요." };
    }
    if (insightLatest?.state === "STALE") {
      return { title: "노트가 변경됨", body: "아래 리포트는 이전 노트 기준이에요. 최신 리포트를 다시 생성할 수 있어요." };
    }
    if (insightLatest?.state === "FAILED") {
      return { title: "최근 생성 실패", body: insightReport?.failureMessage ?? "AI 인사이트 리포트 생성에 실패했어요. 다시 시도해 주세요." };
    }
    if (insightLatest?.state === "FRESH") {
      return { title: "AI 리포트 적용", body: "실제 LLM이 생성한 최신 인사이트 리포트를 표시하고 있어요." };
    }
    if (insightError) {
      return { title: "리포트 확인 실패", body: insightError };
    }
    return { title: "로컬 요약", body: "아직 AI 리포트가 없어 현재 노트/연결 기준의 빠른 요약을 보여주고 있어요." };
  })();

  const refreshInsightLatest = useCallback(
    async ({ showError = false }: { showError?: boolean } = {}) => {
      if (!aiInsightPanelEnabled || !currentWorkspaceId) {
        setInsightLatest(null);
        setInsightError(null);
        setInsightStatus("idle");
        return null;
      }

      const requestId = insightRequestIdRef.current + 1;
      insightRequestIdRef.current = requestId;
      setInsightStatus((current) => current === "generating" ? current : "loading");

      try {
        const latest = await getLatestInsightReport({ documentGroupId: currentWorkspaceId });
        if (requestId !== insightRequestIdRef.current) return null;
        setInsightLatest(latest);
        setInsightError(null);
        setInsightStatus("idle");
        return latest;
      } catch (error) {
        if (requestId !== insightRequestIdRef.current) return null;
        const message = error instanceof Error ? error.message : "AI 인사이트 리포트를 불러오지 못했습니다.";
        setInsightError(message);
        setInsightStatus("error");
        if (showError) pushToast(message, "err");
        return null;
      }
    },
    [aiInsightPanelEnabled, currentWorkspaceId, pushToast]
  );

  const refreshClusterLatest = useCallback(
    async ({ showError = false }: { showError?: boolean } = {}) => {
      if (!aiClusterPanelEnabled || !currentWorkspaceId) {
        setClusterLatest(null);
        setClusterError(null);
        setClusterStatus("idle");
        return null;
      }

      const requestId = clusterRequestIdRef.current + 1;
      clusterRequestIdRef.current = requestId;
      setClusterStatus((current) => current === "analyzing" ? current : "loading");

      try {
        const latest = await getLatestClusterJob({ documentGroupId: currentWorkspaceId });
        if (requestId !== clusterRequestIdRef.current) return null;
        setClusterLatest(latest);
        setClusterError(null);
        setClusterStatus("idle");
        return latest;
      } catch (error) {
        if (requestId !== clusterRequestIdRef.current) return null;
        const message = error instanceof Error ? error.message : "AI 클러스터 상태를 불러오지 못했습니다.";
        setClusterError(message);
        setClusterStatus("error");
        if (showError) pushToast(message, "err");
        return null;
      }
    },
    [aiClusterPanelEnabled, currentWorkspaceId, pushToast]
  );

  const requestAiClusterAnalysis = useCallback(async () => {
    if (aiClusterButtonDisabled || !currentWorkspaceId) return;
    const requestId = clusterRequestIdRef.current + 1;
    clusterRequestIdRef.current = requestId;
    setClusterStatus("analyzing");
    setClusterError(null);

    try {
      const job = await requestClusterJob({
        scope: {
          documentGroupId: currentWorkspaceId,
          maxNotes: AI_CLUSTER_MAX_NOTES,
        },
        algorithmOptions: {
          maxClusters: AI_CLUSTER_MAX_CLUSTERS,
        },
      });
      if (requestId !== clusterRequestIdRef.current) return;
      setClusterLatest((current) => ({
        documentGroupId: job.documentGroupId,
        searchableNoteCount: current?.searchableNoteCount ?? aiClusterUsableNoteCount,
        latestNoteUpdatedAt: current?.latestNoteUpdatedAt ?? null,
        state: job.status === "FAILED" ? "FAILED" : "FRESH",
        job,
      }));
      pushToast(job.status === "FAILED" ? "AI 클러스터 분석이 실패했습니다." : "AI 클러스터 분석이 완료되었습니다.", job.status === "FAILED" ? "err" : "ok");
      await refreshClusterLatest({ showError: false });
    } catch (error) {
      if (requestId !== clusterRequestIdRef.current) return;
      const message = error instanceof Error ? error.message : "AI 클러스터 분석을 시작하지 못했습니다.";
      setClusterError(message);
      setClusterStatus("error");
      pushToast(message, "err");
    }
  }, [aiClusterButtonDisabled, aiClusterUsableNoteCount, currentWorkspaceId, pushToast, refreshClusterLatest]);

  const requestAiInsightReport = useCallback(async () => {
    if (aiInsightButtonDisabled || !currentWorkspaceId) return;
    const requestId = insightRequestIdRef.current + 1;
    insightRequestIdRef.current = requestId;
    setInsightStatus("generating");
    setInsightError(null);

    try {
      const report = await requestInsightReport({
        scope: {
          documentGroupId: currentWorkspaceId,
          maxNotes: AI_CLUSTER_MAX_NOTES,
        },
        includeLearningRecommendations: true,
      });
      if (requestId !== insightRequestIdRef.current) return;
      setInsightLatest((current) => ({
        documentGroupId: currentWorkspaceId,
        searchableNoteCount: current?.searchableNoteCount ?? aiClusterUsableNoteCount,
        latestNoteUpdatedAt: current?.latestNoteUpdatedAt ?? null,
        state: report.status === "FAILED" ? "FAILED" : "FRESH",
        report,
      }));
      pushToast(
        report.status === "FAILED" ? "AI 인사이트 리포트 생성에 실패했습니다." : "AI 인사이트 리포트를 생성했습니다.",
        report.status === "FAILED" ? "err" : "ok"
      );
      await refreshInsightLatest({ showError: false });
    } catch (error) {
      if (requestId !== insightRequestIdRef.current) return;
      const message = error instanceof Error ? error.message : "AI 인사이트 리포트 생성을 시작하지 못했습니다.";
      setInsightError(message);
      setInsightStatus("error");
      pushToast(message, "err");
    }
  }, [aiInsightButtonDisabled, aiClusterUsableNoteCount, currentWorkspaceId, pushToast, refreshInsightLatest]);

  useEffect(() => {
    let active = true;
    refreshClusterLatest({ showError: false }).finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
      clusterRequestIdRef.current += 1;
    };
  }, [refreshClusterLatest]);

  useEffect(() => {
    let active = true;
    refreshInsightLatest({ showError: false }).finally(() => {
      if (!active) return;
    });
    return () => {
      active = false;
      insightRequestIdRef.current += 1;
    };
  }, [refreshInsightLatest]);

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
    {
      icon: "doc" as const,
      label: "전체 노트",
      value: `${totalNotes}`,
      sub: recentActivityTitle ? `최근 활동: ${recentActivityTitle}` : "실제 Workspace 데이터",
      color: "var(--accent)",
      fill: Math.min(100, (totalNotes / 100) * 100)
    },
    {
      icon: "link" as const,
      label: "AI 연결",
      value: `${totalLinks}`,
      sub: "그래프에서 집계된 실제 링크",
      color: "16 185 129",
      fill: Math.min(100, (totalLinks / 200) * 100)
    },
    {
      icon: "fire" as const,
      label: "작성 스트릭",
      value: `${summary.writingStreak}일`,
      sub: "연속 활동 기준",
      color: "249 115 22",
      fill: Math.min(100, (summary.writingStreak / 14) * 100)
    },
    { icon: "bolt" as const, label: "이번 달 토큰", value: `12.8K`, sub: "AI 분석량", color: "var(--primary)", fill: 85 }
  ];

  const insights = [
    {
      color: "rgb(var(--accent))",
      tag: "그래프 허브",
      text: focusNote
        ? `${topicLabel(focusNote, clusterMetaById)} 쪽 노트가 가장 많이 연결되어 있어요. 특히 <strong>"${focusNote.title}"</strong>가 여러 주제를 잇고 있어요.`
        : "아직 집중해서 볼 노트가 충분하지 않아요."
    },
    {
      color: "rgb(16 185 129)",
      tag: "활성 흐름",
      text: summary.topCategory
        ? `최근 지식 흐름은 <strong>${summary.topCategory.label}</strong> 영역에 집중되어 있어요.`
        : "태그와 카테고리가 조금 더 쌓이면 흐름을 더 선명하게 볼 수 있어요."
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
  const reportInsightItems = useMemo<HomeInsightItem[] | null>(() => {
    if (!insightReport || insightLatest?.state === "FAILED") return null;
    const items: HomeInsightItem[] = [];
    const summaryText = insightText(insightReport.summary);
    if (summaryText) {
      items.push({
        color: "rgb(var(--accent))",
        tag: "AI 요약",
        text: summaryText,
      });
    }

    const gaps = (insightReport.knowledgeGaps ?? [])
      .map(insightText)
      .filter(Boolean)
      .slice(0, 3);
    for (const [index, gap] of gaps.entries()) {
      items.push({
        color: index === 0 ? "rgb(249 115 22)" : "rgb(245 158 11)",
        tag: index === 0 ? "지식 공백" : "추가 공백",
        text: gap,
      });
    }

    const recommendations = (insightReport.recommendations ?? [])
      .map(recommendationText)
      .filter(Boolean)
      .slice(0, Math.max(1, 4 - items.length));
    for (const [index, recommendation] of recommendations.entries()) {
      items.push({
        color: index === 0 ? "rgb(16 185 129)" : "rgb(var(--primary))",
        tag: index === 0 ? "추천 액션" : "다음 액션",
        text: recommendation,
      });
    }

    return items.length > 0 ? items : null;
  }, [insightLatest?.state, insightReport]);
  const visibleInsightItems: HomeInsightItem[] = reportInsightItems ?? insights.map((insight) => ({
    color: insight.color,
    tag: insight.tag,
    html: insight.text,
  }));

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

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/40">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-accent/15 text-accent">
                <Icon name="brain" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">나의 지식 인사이트</span>
            </div>
            <button
              type="button"
              disabled={aiInsightButtonDisabled}
              onClick={requestAiInsightReport}
              className={cx(
                "inline-flex h-7 items-center gap-1.5 rounded-[0.4rem] px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                insightStatus === "generating"
                  ? "bg-orange-500/15 text-orange-500"
                  : "bg-accent text-white hover:bg-accent/90"
              )}
            >
              <Icon name={insightStatus === "generating" ? "refresh" : "sparkle"} size={12} />
              {insightStatus === "generating" ? "생성 중" : insightActionLabel}
            </button>
          </div>
          <div className="flex-1 p-5">
            <div
              className="mb-4 rounded-[0.4rem] border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-indigo-500/10 p-4 text-[13px] leading-relaxed text-txt shadow-[0_0_20px_rgba(168,85,247,0.05)]"
              dangerouslySetInnerHTML={{
                __html: `현재 <strong>${totalNotes}개 노트</strong>와 <strong>${totalLinks}개 연결</strong>이 실제 Workspace 데이터와 동기화되어 있어요.${recentActivityTitle ? ` 최근에 업데이트된 노트는 <strong>"${recentActivityTitle}"</strong>입니다.` : ""}`
              }}
            />
            <div className="mb-4 rounded-[0.4rem] border border-line/60 bg-surface2/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-txt">{insightStateMessage.title}</div>
                <div className="rounded-[0.4rem] bg-txt/5 px-2 py-0.5 text-[10px] font-medium text-txt3">
                  {insightLatest?.state ?? "LOCAL"} · 분석 가능 {insightLatest?.searchableNoteCount ?? aiClusterUsableNoteCount}개
                </div>
              </div>
              <div className="mt-1 text-[11.5px] leading-5 text-txt3">{insightStateMessage.body}</div>
              {insightLatest?.state === "STALE" ? (
                <div className="mt-2 rounded-[0.4rem] border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">
                  노트가 변경됨 · 최신 리포트 생성 필요
                </div>
              ) : null}
              {insightError ? (
                <div className="mt-2 rounded-[0.4rem] border border-red-400/30 bg-red-400/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-200">
                  {insightError}
                </div>
              ) : null}
            </div>
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
                <div className="mt-1 text-[18px] font-semibold text-txt">{totalNotes}개</div>
                <div className="absolute right-3 top-3 rounded-[0.4rem] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">실시간</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">지식 연결</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{totalLinks}개</div>
                <div className="absolute right-3 top-3 rounded-[0.4rem] bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">그래프</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">핵심 주제군</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{topClusters.length}개</div>
              </div>
              <div className="relative rounded-[0.4rem] border border-line/60 bg-surface2/40 p-3">
                <div className="text-[11px] text-txt3">노트 평균 분량</div>
                <div className="mt-1 text-[18px] font-semibold text-txt">{Math.round(totalWords / Math.max(totalNotes, 1))}자</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex max-h-[70vh] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/40 lg:max-h-[620px]">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-orange-500/15 text-orange-500">
                <Icon name="sparkle" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">인사이트 요약</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-txt3">
              {reportInsightItems ? "AI 리포트 기반" : "활동에서 관찰한 패턴"} <Icon name="chevR" size={12} />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-start overflow-y-auto overscroll-contain">
            {visibleInsightItems.map((insight, index) => (
              <div key={index} className="flex min-w-0 cursor-default items-stretch gap-3 border-b border-line/40 bg-surface/60 p-4 transition-colors hover:bg-surface last:border-b-0">
                <div className="w-[3px] shrink-0 rounded-full" style={{ background: insight.color }} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[15px] font-semibold uppercase tracking-wider" style={{ color: insight.color }}>{insight.tag}</div>
                  {insight.html ? (
                    <div className="break-words text-[13px] leading-relaxed text-txt2 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: insight.html }} />
                  ) : (
                    <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-txt2 [overflow-wrap:anywhere]">{insight.text}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/40">
          <div className="flex items-center justify-between border-b border-line/60 bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="grid h-[26px] w-[26px] place-items-center rounded-[0.4rem] bg-emerald-500/15 text-emerald-500">
                <Icon name="link" size={14} />
              </div>
              <span className="text-[16px] font-semibold text-txt">주제 지도</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-txt3">
              <button
                type="button"
                disabled={aiClusterButtonDisabled}
                onClick={requestAiClusterAnalysis}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-[0.4rem] px-2.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  clusterStatus === "analyzing"
                    ? "bg-primary/15 text-primary"
                    : "bg-primary text-white hover:bg-primary/90"
                )}
              >
                <Icon name={clusterStatus === "analyzing" ? "refresh" : "sparkle"} size={12} />
                {clusterStatus === "analyzing" ? "분석 중" : clusterActionLabel}
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setTopicView("bubble")} className={cx("hover:text-txt transition-colors", topicView === "bubble" && "text-txt font-semibold")}>버블</button>
                <span>·</span>
                <button onClick={() => setTopicView("trend")} className={cx("hover:text-txt transition-colors", topicView === "trend" && "text-txt font-semibold")}>추이</button>
                <Icon name="chevR" size={12} className="ml-1" />
              </div>
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-center">
            <div className="mb-3 rounded-[0.4rem] border border-line/60 bg-surface2/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-txt">{clusterStateMessage.title}</div>
                <div className="rounded-[0.4rem] bg-txt/5 px-2 py-0.5 text-[10px] font-medium text-txt3">
                  {topicClusters ? "AI 클러스터" : "기본 분류"} · 분석 가능 {aiClusterUsableNoteCount}개
                </div>
              </div>
              <div className="mt-1 text-[11.5px] leading-5 text-txt3">{clusterStateMessage.body}</div>
              {noteIndexStatusUnavailable ? (
                <div className="mt-2 rounded-[0.4rem] border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">
                  색인 상태를 확인하지 못해 기존 기준을 함께 사용합니다.
                </div>
              ) : null}
              {clusterLatest?.state === "STALE" ? (
                <div className="mt-2 rounded-[0.4rem] border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-200">
                  노트가 변경됨 · 다시 분석 필요
                </div>
              ) : null}
              {clusterError ? (
                <div className="mt-2 rounded-[0.4rem] border border-red-400/30 bg-red-400/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-200">
                  {clusterError}
                </div>
              ) : null}
            </div>
            {topClusters.length === 0 ? (
              <div className="flex items-start gap-3 rounded-[0.4rem] border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="mt-0.5 text-emerald-500"><Icon name="link" size={18} /></div>
                <div className="flex-1">
                  <div className="mb-1 text-[15px] font-medium uppercase tracking-wider text-emerald-500/70">연결 부족</div>
                  <div className="mb-1 text-[14px] font-semibold text-txt">연결이 부족해요</div>
                  <div className="mb-3 text-[12px] leading-relaxed text-txt3">노트에 새로운 주제를 추가해보세요.</div>
                  <button
                    onClick={() => router.push("/notes")}
                    className="inline-flex items-center gap-1 rounded-[0.4rem] border border-emerald-500/30 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  >
                    <Icon name="chevR" size={12} /> 노트 추가하기
                  </button>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/40">
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
  const { workspaces, currentWorkspaceId } = useWorkspace();
  const [displayName, setDisplayName] = useState("사용자");
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceUserStatsData | null>(null);
  const currentWorkspace = workspaces.find((workspace) => workspace.documentGroupId === currentWorkspaceId) ?? null;
  // NotesWorkspace.tsx(Ticket14)의 matchesCurrentWorkspace와 동일한 규칙: currentWorkspaceId가
  // null이면(Guest/미선택) 기존처럼 전체 노트를 그대로 쓰고, 실제 Workspace가 선택돼 있으면 그
  // Workspace(default Workspace는 documentGroupId가 아직 없는 레거시 노트도 함께) 노트만 남긴다.
  const includeLegacyNullDocumentGroup = currentWorkspaceId === null || currentWorkspace?.isDefault === true;
  const visibleNotes = useMemo(() => {
    if (currentWorkspaceId === null) return notes;
    return notes.filter((note) => {
      const noteWorkspaceId = note.documentGroupId ?? null;
      if (noteWorkspaceId === currentWorkspaceId) return true;
      return includeLegacyNullDocumentGroup && noteWorkspaceId === null;
    });
  }, [notes, currentWorkspaceId, includeLegacyNullDocumentGroup]);

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

  /** getMyWorkspaceStats()(`/api/v1/workspaces/me/stats`)는 SSOT상 "인증된 사용자 본인의 전체
      Workspace(documentGroup) 기준" 합산값이라 documentGroupId로 필터링되지 않는다 — 어떤
      Workspace를 선택해도 이 응답 자체는 항상 같다. 노트 수/최근 활동은 이제 이 값을 쓰지 않고
      visibleNotes(currentWorkspaceId로 이미 필터링된 노트) 기준으로 아래 렌더/UserInsightDashboard
      쪽에서 클라이언트가 직접 계산한다 — 이 fetch는 "통계가 로드됐는지" 상태 표시용으로만 남긴다.
      documentGroupId로 스코프된 통계 API(SSOT의 `/api/v1/workspaces/{documentGroupId}/sync`)는
      아직 Backend에 구현돼 있지 않다. */
  useEffect(() => {
    let active = true;
    const loadStats = () => {
      getMyWorkspaceStats()
        .then((stats) => {
          if (active) setWorkspaceStats(stats);
        })
        .catch(() => {
          if (active) setWorkspaceStats(null);
        });
    };

    loadStats();
    window.addEventListener("brainx:notes-refresh", loadStats);

    return () => {
      active = false;
      window.removeEventListener("brainx:notes-refresh", loadStats);
    };
  }, [currentWorkspaceId]);

  return (
    <div data-route className="mx-auto max-w-[1100px] px-6 py-6 md:px-8 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
        <div>
          <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-wide text-txt3">
            <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date())} · 오전</span>
            {currentWorkspace ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line/60 bg-surface2/50 px-2 py-0.5 text-[10px] font-semibold text-txt2">
                <Icon name="folder" size={10} />
                {getWorkspaceDisplayName(currentWorkspace)}
              </span>
            ) : null}
          </p>
          <h1 className="text-[30px] font-semibold tracking-tight text-txt">
            좋은 아침이에요,<br />
            <span className="text-accent">{displayName}</span>님 🌿
          </h1>
          <p className="mt-2 text-[13px] text-txt3">
            {workspaceStats
              ? `지금 ${visibleNotes.length.toLocaleString("ko-KR")}개의 실제 노트가 동기화되어 있고, 가장 최근 활동은 "${visibleNotes[0]?.title ?? "노트"}"예요.`
              : `지금 ${visibleNotes.length.toLocaleString("ko-KR")}개의 노트를 기준으로 인사이트를 계산하고 있어요.`}
            {currentWorkspace && workspaces.length > 1
              ? " (토큰 사용량만 전체 Workspace 합산 기준이에요)"
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-[12px] font-medium text-accent">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          AI가 지식 그래프를 분석 중이에요
        </div>
      </div>

      <UserInsightDashboard notes={visibleNotes} currentWorkspaceId={currentWorkspaceId} />
    </div>
  );
}
