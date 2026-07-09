"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Compass, FileUp, PencilLine, Pin, PinOff, Sparkles } from "lucide-react";
import { buildAuthPath, isDevAuthSession, readAuthSession } from "@/lib/auth-api";
import { deriveGraphEdges, noteById, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { deriveDraftWikiLinkEdges, draftsToBrainXNotes, getGraph, graphEdgesForFlow, graphToBrainXNotes, pendingCreatedNoteToBrainXNote, pendingWikiLinkEntryToEdge, USE_MOCK_GRAPH, USE_MOCK_GRAPH_CLUSTERS } from "@/lib/graph-api";
import { createBridgeConcepts, createLinkSuggestions, getLatestClusterJob, requestClusterJob, type BridgeConceptsData, type ClusterJobLatestData } from "@/lib/intelligence-api";
import {
  AI_CLUSTER_MAX_CLUSTERS,
  AI_CLUSTER_MAX_NOTES,
  AI_CLUSTER_MIN_NOTES,
  applyDerivedClustersToNotes,
  applyAiClustersToNotes,
  deriveNoteClusterMeta,
  isAiFeatureReadyNote,
  resolveAiCluster,
  type AiClusterMeta as GraphClusterMeta,
  type AiClusterStatus,
} from "@/lib/ai-cluster-projection";
import { mergeNoteIndexStatuses } from "@/lib/note-index-statuses";
import {
  applyLinkSuggestionToMarkdown,
  filterLinkSuggestions,
  linkAcceptErrorMessage,
  linkSuggestionErrorMessage,
  linkSuggestionKey,
  linkSuggestionTargetTitle,
  normalizeMarkdownText,
  type LinkSuggestion,
} from "@/lib/link-suggestions";
import { readPendingCreatedNotes, removePendingCreatedNoteByNoteId } from "@/lib/notes/pending-created-note-cache";
import { createWorkspaceNote, getNote, hasWorkspaceUserIdentity, listWorkspaceNoteDrafts, matchesWorkspaceScope, updateWorkspaceNoteContent, WorkspaceApiError, type NoteCreated } from "@/lib/workspace-api";
import { graphTimeEffectOpacityByNoteId, isGraphNoteOutsideTimeFilter } from "@/lib/graph-time-effect";
import { useBrainX } from "@/components/brainx-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { Avatar, Badge, Btn, Card, Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";
import { ReactFlow, ReactFlowProvider, SelectionMode, useNodesState, useEdgesState, useReactFlow, useStoreApi, type Edge, type Node, type SelectionRect, type Transform } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { UniverseBackground } from "./universe-background";
import { PlanetNode } from "./planet-node";
import { OrbitEdge } from "./orbit-edge";

const UniverseIcon = ({ size = 18, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="5" />
    <ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-30 12 12)" />
    <path d="M4 6v2m-1-1h2" />
    <path d="M19 4v2m-1-1h2" />
    <path d="M18 19v2m-1-1h2" />
    <path d="M5 18v2m-1-1h2" />
  </svg>
);

const GRAPH_NOTICE_TONE = {
  info: "border border-line/60 bg-surface2/55 text-txt2",
  stale: "border border-accent/25 bg-accent/[0.08] text-txt2",
  error: "border border-primary/25 bg-primary/[0.08] text-txt2"
} as const;

const GRAPH_RECOMMENDATION_BUTTON = "border-[color-mix(in_srgb,rgb(var(--primary))_35%,rgb(var(--surface)))] bg-[color-mix(in_srgb,rgb(var(--primary))_14%,rgb(var(--surface)))] text-primary hover:border-[color-mix(in_srgb,rgb(var(--primary))_48%,rgb(var(--surface)))] hover:bg-[color-mix(in_srgb,rgb(var(--primary))_20%,rgb(var(--surface)))]";

function GraphEmptyState({
  onCreateNote,
  onOpenNotes,
  onOpenChat,
  onOpenGraph
}: {
  onCreateNote: () => void;
  onOpenNotes: () => void;
  onOpenChat: () => void;
  onOpenGraph: () => void;
}) {
  const { effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";
  const steps = [
    {
      step: "1",
      title: "노트 작성",
      desc: "생각, 공부, 아이디어를 먼저 적어두면 그래프의 중심이 생깁니다.",
      icon: PencilLine,
      color: "from-primary/15 to-accent/10",
      accent: "text-primary"
    },
    {
      step: "2",
      title: "AI 연결",
      desc: "BrainX가 주제와 문맥을 읽고 관련 노트를 부드럽게 연결해요.",
      icon: Sparkles,
      color: "from-accent/15 to-primary/10",
      accent: "text-accent"
    },
    {
      step: "3",
      title: "그래프 탐색",
      desc: "연결망을 따라가며 지식의 구조와 공백을 한눈에 확인해요.",
      icon: Compass,
      color: "from-primary/10 to-surface2",
      accent: "text-primary"
    }
  ] as const;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 py-10">
      <div className="pointer-events-auto flex w-full max-w-[860px] flex-col items-center text-center">
        <div
          className={cx(
            "mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border backdrop-blur",
            isLight
              ? "border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)]"
              : "border-white/10 bg-transparent shadow-none"
          )}
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary">
            <Icon name="graph" size={24} />
          </div>
        </div>
        <h2 className="text-[27px] font-bold tracking-tight text-txt sm:text-[30px]">
          아직 지식 그래프가 비어있어요
        </h2>
        <p className="mt-2 max-w-[560px] text-[14px] leading-7 text-txt2 sm:text-[15px]">
          첫 노트를 작성하면 AI가 자동으로 연결을 돕고, 그래프에서 관계를 탐색할 수 있어요.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCreateNote}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[14px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Icon name="plus" size={16} />
            첫 노트 만들기
          </button>
          <button
            type="button"
            onClick={onOpenNotes}
            className={cx(
              "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-[14px] font-semibold shadow-sm transition-colors",
              isLight
                ? "border-line/70 bg-white/80 text-txt2 hover:border-primary/30 hover:text-txt"
                : "border-white/10 bg-transparent text-txt2 hover:border-primary/30 hover:text-txt"
            )}
          >
            <FileUp size={16} />
            가져오기
          </button>
        </div>

        <div className="mt-8 grid w-full gap-3 md:grid-cols-3">
          {steps.map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={item.step === "1" ? onCreateNote : item.step === "2" ? onOpenChat : onOpenGraph}
              className={cx(
                "group relative overflow-hidden rounded-2xl border p-5 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/60",
                isLight
                  ? "border-line/60 bg-white/85 shadow-[0_12px_30px_rgba(15,23,42,0.05)] hover:border-primary/25 hover:shadow-[0_16px_34px_rgba(108,99,216,0.12)]"
                  : "border-white/10 bg-transparent shadow-none hover:border-primary/30"
              )}
            >
              <span className={`absolute -right-1 top-1 text-[56px] font-extrabold leading-none ${item.accent} opacity-[0.08]`}>
                {item.step}
              </span>
              <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} ${item.accent}`}>
                <item.icon size={18} />
              </div>
              <div className="text-[13px] font-semibold text-txt">{item.title}</div>
              <p className="mt-1.5 min-h-[44px] text-[12px] leading-6 text-txt2">{item.desc}</p>
              <div className="mt-3 text-[12px] font-medium text-primary">시작하기</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type LayoutMode = 'force' | 'tree' | 'radial';

type GraphNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  tx: number | null;
  ty: number | null;
};

type GraphControls = {
  zoom: (factor: number) => void;
  fit: () => void;
  center: () => void;
  fitArea: (width: number, height: number) => void;
  reheat: () => void;
  bridges: () => void;
};

type GraphPerformanceProfile = {
  repulsionSkipDistance: number;
  physicsEveryFrames: number;
  renderEveryFrames: number;
};

function graphPerformanceProfile(nodeCount: number): GraphPerformanceProfile {
  if (nodeCount <= 30) {
    return { repulsionSkipDistance: 400, physicsEveryFrames: 1, renderEveryFrames: 2 };
  }
  if (nodeCount <= 60) {
    return { repulsionSkipDistance: 320, physicsEveryFrames: 1, renderEveryFrames: 3 };
  }
  if (nodeCount <= 100) {
    return { repulsionSkipDistance: 240, physicsEveryFrames: 2, renderEveryFrames: 4 };
  }
  return { repulsionSkipDistance: 180, physicsEveryFrames: 3, renderEveryFrames: 5 };
}

type PlanetFlowNode = Node<{
  label: string;
  color: string;
  radius: number;
  selected: boolean;
  bridgeSelected: boolean;
  bridgeSelectionOrder: number | null;
  dimmed: boolean;
  timeFadeOpacity: number;
  isDirect: boolean;
  layer: "front" | "middle" | "back";
  theme: "2d" | "universe";
}>;

type BridgeRecommendation = BridgeConceptsData["recommendations"][number];
type BridgeResultStatus = "idle" | "loading" | "success" | "error";
type BridgeSaveStatus = "saving" | "saved" | "error";
type BridgeSaveState = {
  status: BridgeSaveStatus;
  noteId?: string;
  error?: string;
};
type LinkSuggestionGroup = {
  sourceNoteId: string;
  sourceTitle: string;
  suggestions: LinkSuggestion[];
};
type LinkSuggestionStatus = "idle" | "loading" | "success" | "error";
type LinkSuggestionProgress = {
  current: number;
  total: number;
};
type LinkAcceptStatus = "saving" | "saved" | "error";
type LinkAcceptState = {
  status: LinkAcceptStatus;
  linkId?: string;
  error?: string;
};

type OrbitFlowEdge = Edge<{
  isBridge: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  timeFadeOpacity: number;
  theme: "2d" | "universe";
}>;

function seededUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function settleLayout(notes: BrainXNote[], iterations = 260) {
  const positions: Record<string, GraphNode> = {};
  const clusterOrder = Array.from(new Set(notes.map((note) => note.cluster)));
  const clusterIndex = Object.fromEntries(clusterOrder.map((cluster, index) => [cluster, index])) as Record<ClusterId, number>;

  notes.forEach((note) => {
    const index = clusterIndex[note.cluster] ?? 0;
    const angle = (index / Math.max(1, clusterOrder.length)) * Math.PI * 2;
    const radius = 190;
    const jitterX = (seededUnit(`${note.id}:x`) - 0.5) * 90;
    const jitterY = (seededUnit(`${note.id}:y`) - 0.5) * 90;
    positions[note.id] = {
      x: Math.cos(angle) * radius + jitterX,
      y: Math.sin(angle) * radius + jitterY,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      tx: null,
      ty: null
    };
  });

  const minDistance = 132;
  for (let pass = 0; pass < 12; pass += 1) {
    let moved = false;
    for (let i = 0; i < notes.length; i += 1) {
      for (let j = i + 1; j < notes.length; j += 1) {
        const a = positions[notes[i].id];
        const b = positions[notes[j].id];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= minDistance) continue;
        const push = (minDistance - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return positions;
}

const nodeTypes = { planet: PlanetNode };
const edgeTypes = { orbit: OrbitEdge };

const BRIDGE_MIN_NOTE_COUNT = 2;
const BRIDGE_MAX_NOTE_COUNT = 10;
const BRIDGE_RECOMMENDATION_TAGS = ["bridge", "ai-suggestion"];
const LINK_MIN_NOTE_COUNT = 1;
const LINK_MAX_NOTE_COUNT = 10;
const AI_BOX_SELECTION_MIN_SIZE = 4;
const TIME_EFFECT_DEFAULT_STRENGTH = 60;

function isFilteredOutByTime(note: BrainXNote, timeFilter: string) {
  return isGraphNoteOutsideTimeFilter(note, timeFilter);
}

function isBridgeSelectableNote(
  note: BrainXNote,
  hiddenClusters: Partial<Record<ClusterId, boolean>>,
  timeFilter: string
) {
  return isAiFeatureReadyNote(note) && !hiddenClusters[note.cluster] && !isFilteredOutByTime(note, timeFilter);
}

function mergeSelectedIds(currentIds: string[], incomingIds: string[], maxCount: number) {
  const nextIds: string[] = [...currentIds];
  const seen = new Set(nextIds);
  for (const id of incomingIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    nextIds.push(id);
  }
  return {
    ids: nextIds.slice(0, maxCount),
    truncated: nextIds.length > maxCount
  };
}

function mergeBridgeSelectedIds(currentIds: string[], incomingIds: string[]) {
  return mergeSelectedIds(currentIds, incomingIds, BRIDGE_MAX_NOTE_COUNT);
}

function mergeLinkSelectedIds(currentIds: string[], incomingIds: string[]) {
  return mergeSelectedIds(currentIds, incomingIds, LINK_MAX_NOTE_COUNT);
}

function mergeDragSelectionIds(baseIds: string[], incomingIds: string[]) {
  const nextIds = [...baseIds];
  const seen = new Set(nextIds);
  for (const id of incomingIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    nextIds.push(id);
  }
  return nextIds;
}

function flowBoundsFromSelectionRect(rect: SelectionRect, transform: Transform) {
  const [viewportX, viewportY, zoom] = transform;
  const minX = (rect.x - viewportX) / zoom;
  const minY = (rect.y - viewportY) / zoom;
  const maxX = (rect.x + rect.width - viewportX) / zoom;
  const maxY = (rect.y + rect.height - viewportY) / zoom;
  return { minX, minY, maxX, maxY };
}

function getAiBoxSelectedNodeIds(
  rect: SelectionRect,
  transform: Transform,
  notes: BrainXNote[],
  positions: Record<string, GraphNode>,
  hiddenClusters: Partial<Record<ClusterId, boolean>>,
  timeFilter: string
) {
  if (rect.width < AI_BOX_SELECTION_MIN_SIZE || rect.height < AI_BOX_SELECTION_MIN_SIZE) {
    return [];
  }
  const bounds = flowBoundsFromSelectionRect(rect, transform);
  return notes
    .filter((note) => {
      if (!isBridgeSelectableNote(note, hiddenClusters, timeFilter)) return false;
      const point = positions[note.id];
      if (!point) return false;
      return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
    })
    .map((note) => note.id);
}

function bridgeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("만료") || message.includes("권한")) {
    return "추천 권한이 없거나 로그인이 만료되었습니다. 권한을 확인하고 다시 시도하세요.";
  }
  if (message.includes("not available") || message.includes("찾을 수") || message.includes("없")) {
    return "선택한 노트를 사용할 수 없습니다. 그래프를 새로고침하고 다시 선택하세요.";
  }
  if (message.includes("unavailable") || message.includes("실패")) {
    return "AI 추천 생성이 잠시 불안정합니다. 잠시 후 다시 시도하세요.";
  }
  return message || "추천 생성에 실패했습니다. 선택한 노트를 확인하고 다시 시도하세요.";
}

function bridgeSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("만료") || message.includes("권한")) {
    return "로그인이 만료되었습니다. 다시 로그인한 뒤 저장하세요.";
  }
  return message || "노트 저장에 실패했습니다. 잠시 후 다시 시도하세요.";
}

function hasExistingEdge(
  edges: GraphScreenEdge[],
  sourceNoteId: string,
  targetNoteId: string
) {
  return edges.some((edge) =>
    (edge.source === sourceNoteId && edge.target === targetNoteId) ||
    (edge.source === targetNoteId && edge.target === sourceNoteId)
  );
}

function wikiLink(value: string) {
  const title = normalizeMarkdownText(value) || "무제 노트";
  return `[[${title}]]`;
}

function bridgeSourceNotes(sourceNotes: BrainXNote[]) {
  return sourceNotes.slice(0, 2);
}

function buildBridgeRecommendationMarkdown(recommendation: BridgeRecommendation, sourceNotes: BrainXNote[]) {
  const bridgeNotes = bridgeSourceNotes(sourceNotes);
  const sourceLinks = bridgeNotes.map((note) => wikiLink(note.title));
  const firstSource = sourceLinks[0] ?? "첫 번째 노트";
  const secondSource = sourceLinks[1] ?? "두 번째 노트";
  const connectionView =
    normalizeMarkdownText(recommendation.bridgeReason ?? "") ||
    `${firstSource}와 ${secondSource}를 함께 보며 공통된 쟁점과 차이를 정리한다.`;
  const overviewLines = [
    `- ${firstSource}에서 출발한 문제의식`,
    `- ${secondSource}가 보완하거나 대조하는 관점`,
    "- 두 노트를 함께 볼 때 드러나는 판단 기준",
    "- 이어서 확인할 사례와 반례"
  ];
  const sourceLines = bridgeNotes.map((note, index) => {
    const tags = note.tags.length > 0 ? ` ${note.tags.map((tag) => `#${normalizeMarkdownText(tag)}`).join(" ")}` : "";
    return `${index + 1}. ${wikiLink(note.title)}${tags}`;
  });

  return [
    "## 연결 관점",
    "",
    connectionView,
    "",
    "## 개요",
    "",
    overviewLines.join("\n"),
    "",
    "## 관련 노트",
    "",
    sourceLines.length > 0 ? sourceLines.join("\n") : "- 선택한 노트 정보 없음"
  ].join("\n");
}

function bridgeRecommendationToGraphNote(
  recommendation: BridgeRecommendation,
  created: NoteCreated,
  sourceNotes: BrainXNote[]
): BrainXNote {
  const now = created.createdAt || new Date().toISOString();
  const cluster = sourceNotes[0]?.cluster ?? "proj";
  return {
    id: created.noteId,
    title: normalizeMarkdownText(created.title || recommendation.title) || "징검다리 개념 후보",
    markdown: "",
    folderId: cluster,
    cluster,
    summary:
      recommendation.bridgeReason?.trim() ||
      "선택한 노트 사이를 이어줄 새 문서 주제로 제안되었습니다.",
    tags: BRIDGE_RECOMMENDATION_TAGS,
    links: [],
    searchIndexStatus: "UNKNOWN",
    availableForAiFeatures: false,
    indexedAt: null,
    updated: "today",
    words: 0,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    version: created.version
  };
}

function GraphCanvasFlow({
  theme,
  notes,
  edges,
  selectedId,
  layoutMode,
  clusterOn,
  timeFilter,
  timeFadeOpacityById,
  hiddenClusters,
  clusterMetaById,
  controls,
  bridgeMode,
  bridgeSelectedIds,
  bridgeSelectionLocked,
  linkMode,
  linkSelectedIds,
  linkSelectionLocked,
  onBridgeSelect,
  onBridgeSelectMany,
  onLinkSelect,
  onLinkSelectMany,
  onSelect
}: {
  theme: '2d' | 'universe';
  notes: BrainXNote[];
  edges: Array<{ source: string; target: string; bridge?: boolean }>;
  selectedId: string | null;
  layoutMode: LayoutMode;
  clusterOn: boolean;
  timeFilter: string;
  timeFadeOpacityById: ReadonlyMap<string, number>;
  hiddenClusters: Partial<Record<ClusterId, boolean>>;
  clusterMetaById: Map<string, GraphClusterMeta>;
  controls: MutableRefObject<GraphControls | null>;
  bridgeMode: boolean;
  bridgeSelectedIds: string[];
  bridgeSelectionLocked: boolean;
  linkMode: boolean;
  linkSelectedIds: string[];
  linkSelectionLocked: boolean;
  onBridgeSelect: (id: string) => void;
  onBridgeSelectMany: (ids: string[], replace?: boolean) => void;
  onLinkSelect: (id: string) => void;
  onLinkSelectMany: (ids: string[], replace?: boolean) => void;
  onSelect: (id: string | null) => void;
}) {
  const { setCenter, fitView, zoomTo, getViewport, fitBounds } = useReactFlow();
  const store = useStoreApi<PlanetFlowNode, OrbitFlowEdge>();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<PlanetFlowNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<OrbitFlowEdge>([]);
  const [hovered, setHovered] = useState<BrainXNote | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const bridgeBoxSelectingRef = useRef(false);
  const reactFlowSelectionIdsRef = useRef<Set<string>>(new Set());
  const selectionDragBaseIdsRef = useRef<string[]>([]);
  const bridgeSelectionSignatureRef = useRef("");
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  
  const positionsRef = useRef<Record<string, GraphNode>>(settleLayout(notes));
  const raf = useRef(0);
  const selectionModeActive = bridgeMode || linkMode;
  const selectionLocked = bridgeSelectionLocked || linkSelectionLocked;

  const clearReactFlowNodeSelection = useCallback(() => {
    store.setState({
      nodesSelectionActive: false,
      userSelectionActive: false,
      userSelectionRect: null
    });
    setRfNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        if (!node.selected) return node;
        changed = true;
        return { ...node, selected: false };
      });
      return changed ? next : current;
    });
  }, [setRfNodes, store]);

  useEffect(() => {
    return store.subscribe((state) => {
      if (!selectionModeActive || selectionLocked || !bridgeBoxSelectingRef.current) return;
      if (!state.userSelectionRect) return;

      const rectSelectedIds = getAiBoxSelectedNodeIds(
        state.userSelectionRect,
        state.transform,
        notes,
        positionsRef.current,
        hiddenClusters,
        timeFilter
      );
      const mergedSelectedIds = mergeDragSelectionIds(selectionDragBaseIdsRef.current, rectSelectedIds);
      const selectedNodeIds = linkMode
        ? mergeLinkSelectedIds([], mergedSelectedIds).ids
        : mergeBridgeSelectedIds([], mergedSelectedIds).ids;
      const signature = selectedNodeIds.join("|");
      if (signature === bridgeSelectionSignatureRef.current) return;

      bridgeSelectionSignatureRef.current = signature;
      reactFlowSelectionIdsRef.current = new Set(selectedNodeIds);
      if (linkMode) {
        onLinkSelectMany(selectedNodeIds, true);
      } else if (bridgeMode) {
        onBridgeSelectMany(selectedNodeIds, true);
      }
    });
  }, [bridgeMode, hiddenClusters, linkMode, notes, onBridgeSelectMany, onLinkSelectMany, selectionLocked, selectionModeActive, store, timeFilter]);

  // Sync positionsRef with notes to handle async data loading
  useEffect(() => {
    let added = false;
    let removed = false;
    const settled = settleLayout(notes);
    const noteIdSet = new Set(notes.map((note) => note.id));
    for (const id of Object.keys(positionsRef.current)) {
      if (!noteIdSet.has(id)) {
        delete positionsRef.current[id];
        removed = true;
      }
    }
    notes.forEach(note => {
      if (!positionsRef.current[note.id]) {
        positionsRef.current[note.id] = settled[note.id];
        added = true;
      }
    });
    if ((added || removed) && controls.current) {
      controls.current.reheat();
    }
  }, [notes]);

  // Setup GraphControls ref
  useEffect(() => {
    if (controls) {
      controls.current = {
        zoom: (delta) => {
          const currentZoom = getViewport().zoom;
          zoomTo(currentZoom + delta, { duration: 300 });
        },
        fit: () => {
          fitView({ duration: 800, padding: 0.1 });
        },
        center: () => {
          setCenter(0, 0, { duration: 800 });
        },
        fitArea: (width, height) => {
          // 노드 실제 크기(너비 약 150px, 높이 50px)를 정확히 감싸도록 여백 조정
          const w = width + 150;
          const h = height + 60;
          fitBounds(
            { x: -w/2, y: -h/2, width: w, height: h },
            { padding: 0.1, duration: 800 }
          );
        },
        reheat: () => {
          // Add some random velocity to shake things up
          Object.values(positionsRef.current).forEach(p => {
            p.vx += (Math.random() - 0.5) * 20;
            p.vy += (Math.random() - 0.5) * 20;
          });
        },
        bridges: () => {}
      };
    }
  }, [controls, fitView, zoomTo]);


  // Layout target calculations
  useEffect(() => {
    if (layoutMode === 'force') {
      Object.values(positionsRef.current).forEach(p => {
        p.tx = null;
        p.ty = null;
      });
      return;
    }

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    notes.forEach(n => {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    });

    edges.forEach(e => {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      }
    });

    let roots = notes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
    if (roots.length === 0 && notes.length > 0) roots = [notes[0].id];

    const layers: string[][] = [];
    const visited = new Set<string>();
    let queue = [...roots];

    while (queue.length > 0) {
      const nextQueue: string[] = [];
      const currentLayer: string[] = [];
      queue.forEach(id => {
        if (!visited.has(id)) {
          visited.add(id);
          currentLayer.push(id);
          adj.get(id)?.forEach(child => nextQueue.push(child));
        }
      });
      if (currentLayer.length > 0) layers.push(currentLayer);
      queue = nextQueue;
    }

    const unvisited = notes.filter(n => !visited.has(n.id)).map(n => n.id);
    if (unvisited.length > 0) {
      layers.push(unvisited);
    }

    if (layoutMode === 'tree') {
      const xSpacing = 140;
      const ySpacing = 50;
      let maxItemsInLayer = 0;
      layers.forEach((layer, depth) => {
        maxItemsInLayer = Math.max(maxItemsInLayer, layer.length);
        const x = depth * xSpacing;
        const totalHeight = (layer.length - 1) * ySpacing;
        let startY = -totalHeight / 2;
        layer.forEach((id) => {
          const p = positionsRef.current[id];
          if (p) {
            p.tx = x - ((layers.length - 1) * xSpacing) / 2;
            p.ty = startY;
          }
          startY += ySpacing;
        });
      });
      
      const width = (layers.length - 1) * xSpacing;
      const height = (maxItemsInLayer - 1) * ySpacing;
      if (controls.current) controls.current.fitArea(width, height);
      
    } else if (layoutMode === 'radial') {
      const minArcSpacing = 40;
      let currentRadius = 0;
      layers.forEach((layer, depth) => {
        if (depth === 0) {
          if (layer.length === 1) {
            const p = positionsRef.current[layer[0]];
            if (p) {
              p.tx = 0;
              p.ty = 0;
            }
          } else {
            currentRadius = Math.max(30, (layer.length * minArcSpacing) / (Math.PI * 2));
            const angleStep = (Math.PI * 2) / layer.length;
            layer.forEach((id, idx) => {
              const p = positionsRef.current[id];
              if (p) {
                p.tx = Math.cos(angleStep * idx) * currentRadius;
                p.ty = Math.sin(angleStep * idx) * currentRadius;
              }
            });
          }
        } else {
          const minR = (layer.length * minArcSpacing) / (Math.PI * 2);
          currentRadius = Math.max(currentRadius + 60, minR);
          
          const angleStep = (Math.PI * 2) / layer.length;
          layer.forEach((id, idx) => {
            const p = positionsRef.current[id];
            if (p) {
              p.tx = Math.cos(angleStep * idx) * currentRadius;
              p.ty = Math.sin(angleStep * idx) * currentRadius;
            }
          });
        }
      });
      if (controls.current) controls.current.fitArea(currentRadius * 2, currentRadius * 2);
    }
  }, [layoutMode, notes, edges]);

  // Physics loop
  useEffect(() => {
    let tick = 0;
    const profile = graphPerformanceProfile(notes.length);
    const step = () => {
      tick++;
      const pos = positionsRef.current;
      const isStructured = notes.some(n => pos[n.id] && pos[n.id].tx !== null);
      const runForcePhysics = !isStructured && (tick - 1) % profile.physicsEveryFrames === 0;

      if (runForcePhysics) {
        for (let i = 0; i < notes.length; i += 1) {
          for (let j = i + 1; j < notes.length; j += 1) {
            const a = pos[notes[i].id];
            const b = pos[notes[j].id];
            if (!a || !b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            // Optimization: Skip expensive math for nodes far away from each other
            if (
              Math.abs(dx) > profile.repulsionSkipDistance ||
              Math.abs(dy) > profile.repulsionSkipDistance
            ) continue;
            
            const distance2 = dx * dx + dy * dy + 0.01;
            const distance = Math.sqrt(distance2);
            const repulsion = 2600 / distance2;
            const fx = (dx / distance) * repulsion;
            const fy = (dy / distance) * repulsion;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        edges.forEach((edge) => {
          const a = pos[edge.source];
          const b = pos[edge.target];
          if (!a || !b) return;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const target = edge.bridge ? 240 : 130;
          const force = 0.012 * (distance - target);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        });
      }

      const clusterCentroids = new Map<ClusterId, { x: number; y: number; count: number }>();
      if (clusterOn) {
        notes.forEach((note) => {
          const point = pos[note.id];
          if (!point) return;
          const current = clusterCentroids.get(note.cluster) ?? { x: 0, y: 0, count: 0 };
          current.x += point.x;
          current.y += point.y;
          current.count += 1;
          clusterCentroids.set(note.cluster, current);
        });
        clusterCentroids.forEach((value) => {
          value.x /= value.count;
          value.y /= value.count;
        });
      }

      let moved = false;
      notes.forEach((note) => {
        const point = pos[note.id];
        if (!point) return;

        if (point.tx !== null && point.ty !== null) {
          point.x += (point.tx - point.x) * 0.12;
          point.y += (point.ty - point.y) * 0.12;
          point.vx = 0;
          point.vy = 0;
          if (Math.abs(point.tx - point.x) > 0.5 || Math.abs(point.ty - point.y) > 0.5) moved = true;
        } else {
          point.vx += -point.x * 0.0016;
          point.vy += -point.y * 0.0016;
          if (clusterOn) {
            const centroid = clusterCentroids.get(note.cluster);
            if (centroid) {
              point.vx += (centroid.x - point.x) * 0.02;
              point.vy += (centroid.y - point.y) * 0.02;
            }
          }
        }
        
        if (point.fx !== null && point.fy !== null) {
          point.x = point.fx;
          point.y = point.fy;
          point.vx = 0;
          point.vy = 0;
        } else if (point.tx === null || point.ty === null) {
          point.vx *= 0.86;
          point.vy *= 0.86;
          point.x += point.vx;
          point.y += point.vy;
          if (Math.abs(point.vx) > 0.1 || Math.abs(point.vy) > 0.1) moved = true;
        }
      });

      if (moved && tick % profile.renderEveryFrames === 0) {
        setRfNodes((nds) => {
          let hasChanges = false;
          const next = nds.map((n) => {
            const p = pos[n.id];
            if (p) {
              const dx = Math.abs(n.position.x - p.x);
              const dy = Math.abs(n.position.y - p.y);
              if (dx > 0.5 || dy > 0.5) {
                hasChanges = true;
                return { ...n, position: { x: p.x, y: p.y } };
              }
            }
            return n;
          });
          return hasChanges ? next : nds;
        });
      }

      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [notes, edges, clusterOn, setRfNodes]);

  // Sync data
  useEffect(() => {
    // 드래그 중에는 드래그중인 노드만 활성 노드로 취급, 선택/hover는 딶엄
    const activeId = draggingNodeId ?? selectedId ?? hovered?.id;
    const direct = new Set<string>();
    if (activeId) {
      edges.forEach((e) => {
        if (e.source === activeId) direct.add(e.target);
        if (e.target === activeId) direct.add(e.source);
      });
    }

    const aiSelectionOrder = new Map<string, number>();
    const aiSelectedIds = linkMode ? linkSelectedIds : bridgeMode ? bridgeSelectedIds : [];
    aiSelectedIds.forEach((id, index) => {
      aiSelectionOrder.set(id, index + 1);
    });

    // bridgeMode: bridge 엣지에 연결된 노드 집합
    const bridgeNodes = new Set<string>();
    if (bridgeMode) {
      edges.forEach((e) => {
        if (e.bridge) {
          bridgeNodes.add(e.source);
          bridgeNodes.add(e.target);
        }
      });
    }

    const newNodes = notes.map(note => {
      const cluster = resolveAiCluster(note.cluster, clusterMetaById);
      const linkCount = note.links.length;
      const baseRadius = 3.5 + Math.min(4, linkCount * 0.75);
      const selected = activeId === note.id;
      const bridgeSelected = aiSelectionOrder.has(note.id);
      const isDirect = activeId ? direct.has(note.id) : false;
      const radius = selected || bridgeSelected ? baseRadius + 4 : (isDirect ? baseRadius + 1.5 : baseRadius);
      const dimmed = isFilteredOutByTime(note, timeFilter);
      const timeFadeOpacity = selected || bridgeSelected || isDirect ? 1 : (timeFadeOpacityById.get(note.id) ?? 1);
      const hidden = hiddenClusters[note.cluster] ? true : false;
      
      let layer: 'front' | 'middle' | 'back' = 'middle';
      if (bridgeMode && bridgeSelected) {
        layer = 'front';
      } else if (activeId) {
        // 노드 선택/호버 상태가 우선
        if (selected) layer = 'front';
        else if (isDirect) layer = 'middle';
        else layer = 'back';
      } else if (bridgeMode) {
        // bridgeMode: bridge 노드만 front, 나머지 back
        if (bridgeNodes.has(note.id)) layer = 'front';
        else layer = 'back';
      } else {
        if (baseRadius > 10) layer = 'front';
      }

      return {
        id: note.id,
        type: 'planet',
        selected: false,
        position: { x: positionsRef.current[note.id]?.x ?? 0, y: positionsRef.current[note.id]?.y ?? 0 },
        origin: [0.5, 0.5] as [number, number],
        data: {
          label: note.title,
          color: cluster.color,
          radius,
          selected,
          bridgeSelected,
          bridgeSelectionOrder: aiSelectionOrder.get(note.id) ?? null,
          dimmed,
          timeFadeOpacity,
          isDirect,
          layer,
          theme
        },
        hidden,
        selectable: selectionModeActive && !selectionLocked && !hidden && !dimmed,
        draggable: true,
        className: dimmed ? 'pointer-events-none' : ''
      };
    });
    
    const newEdges = edges.map(edge => {
      const sourceNote = notes.find(n => n.id === edge.source);
      const targetNote = notes.find(n => n.id === edge.target);
      
      const sourceDimmed = sourceNote ? isFilteredOutByTime(sourceNote, timeFilter) : false;
      const targetDimmed = targetNote ? isFilteredOutByTime(targetNote, timeFilter) : false;
      const sourceTimeFadeOpacity = sourceNote ? (timeFadeOpacityById.get(sourceNote.id) ?? 1) : 1;
      const targetTimeFadeOpacity = targetNote ? (timeFadeOpacityById.get(targetNote.id) ?? 1) : 1;

      const isSelected = activeId && (edge.source === activeId || edge.target === activeId);
      // bridgeMode: bridge 아닌 엣지는 흐리게, bridge 엣지는 강조
      const isDimmed = activeId
        ? !isSelected
        : (bridgeMode ? !edge.bridge : (sourceDimmed || targetDimmed));
      // 소스 노드의 색상을 엣지에 전달
      const sourceColor = sourceNote ? resolveAiCluster(sourceNote.cluster, clusterMetaById).color : null;
      // 선택/호버된 활성 노드의 색상을 엣지에 전달
      const activeNote = activeId ? notes.find(n => n.id === activeId) : null;
      const activeColor = activeNote ? resolveAiCluster(activeNote.cluster, clusterMetaById).color : null;
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: 'orbit',
        data: {
          isBridge: !!edge.bridge,
          isBridgeHighlight: !!(bridgeMode && edge.bridge),
          isSelected: !!isSelected,
          isDimmed,
          timeFadeOpacity: isSelected || (bridgeMode && edge.bridge) ? 1 : Math.min(sourceTimeFadeOpacity, targetTimeFadeOpacity),
          theme,
          sourceColor,
          activeColor
        }
      };
    });

    setRfNodes((currentNodes) => {
      if (!bridgeBoxSelectingRef.current) {
        return newNodes;
      }
      const selectedIds = reactFlowSelectionIdsRef.current;
      if (selectedIds.size === 0) {
        return newNodes;
      }
      return newNodes.map((node) => {
        if (!selectedIds.has(node.id)) {
          return node;
        }
        return { ...node, selected: true };
      });
    });
    setRfEdges(newEdges);
  }, [notes, edges, selectedId, hovered, draggingNodeId, timeFilter, timeFadeOpacityById, hiddenClusters, clusterMetaById, setRfNodes, setRfEdges, theme, bridgeMode, bridgeSelectedIds, bridgeSelectionLocked, linkMode, linkSelectedIds, selectionModeActive, selectionLocked]);

  // Camera zoom on select
  useEffect(() => {
    if (selectedId) {
      const pos = positionsRef.current[selectedId];
      if (pos) {
        setCenter(pos.x, pos.y, { zoom: 1.5, duration: 800 });
      }
    }
  }, [selectedId, setCenter]);

  return (
    <>
      {theme === 'universe' && <UniverseBackground />}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          if (node.data.dimmed) return;
          if (bridgeMode) {
            onBridgeSelect(node.id);
            return;
          }
          if (linkMode) {
            onLinkSelect(node.id);
            return;
          }
          onSelect(selectedId === node.id ? null : node.id);
        }}
        onPaneClick={() => {
          if (!bridgeMode) onSelect(null);
        }}
        selectionKeyCode={selectionModeActive && !selectionLocked ? "Shift" : null}
        selectionMode={SelectionMode.Full}
        onSelectionStart={() => {
          if (!selectionModeActive || selectionLocked) return;
          bridgeBoxSelectingRef.current = true;
          reactFlowSelectionIdsRef.current = new Set();
          selectionDragBaseIdsRef.current = linkMode ? linkSelectedIds.slice() : bridgeSelectedIds.slice();
          bridgeSelectionSignatureRef.current = selectionDragBaseIdsRef.current.join("|");
        }}
        onSelectionEnd={() => {
          bridgeBoxSelectingRef.current = false;
          reactFlowSelectionIdsRef.current = new Set();
          selectionDragBaseIdsRef.current = [];
          bridgeSelectionSignatureRef.current = "";
          clearReactFlowNodeSelection();
          window.requestAnimationFrame(clearReactFlowNodeSelection);
        }}
        onNodeMouseEnter={(_, node) => {
          if (node.data.dimmed) return;
          if (isDraggingRef.current) return;
          if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
          const note = notes.find(n => n.id === node.id);
          if (note) setHovered(note);
        }}
        onNodeMouseLeave={() => {
          hoverTimeoutRef.current = window.setTimeout(() => {
            setHovered(null);
          }, 150);
        }}
        onNodeDragStart={(_, node) => {
          isDraggingRef.current = true;
          setDraggingNodeId(node.id);
          if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
          setHovered(null);
          const p = positionsRef.current[node.id];
          if (p) {
            p.fx = p.x;
            p.fy = p.y;
          }
        }}
        onNodeDrag={(_, node) => {
          const p = positionsRef.current[node.id];
          if (p) {
            // 현재 뷰포트 기준으로 flow 좌표 경계 계산 후 클램핑
            const { x: vpX, y: vpY, zoom } = getViewport();
            const containerEl = document.querySelector('.react-flow') as HTMLElement;
            const w = containerEl?.clientWidth ?? window.innerWidth;
            const h = containerEl?.clientHeight ?? window.innerHeight;
            const minX = -vpX / zoom;
            const minY = -vpY / zoom;
            const maxX = (w - vpX) / zoom;
            const maxY = (h - vpY) / zoom;
            const clampedX = Math.max(minX, Math.min(maxX, node.position.x));
            const clampedY = Math.max(minY, Math.min(maxY, node.position.y));
            p.fx = clampedX;
            p.fy = clampedY;
            p.x = clampedX;
            p.y = clampedY;
          }
        }}
        onNodeDragStop={(_, node) => {
          isDraggingRef.current = false;
          setDraggingNodeId(null);
          const p = positionsRef.current[node.id];
          if (p) {
            p.fx = null;
            p.fy = null;
          }
        }}
        fitView
        autoPanOnNodeDrag={false}
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
        onInit={(instance) => {
          // 초기 줌 레벨 CSS 변수 설정
          const { zoom } = instance.getViewport();
          document.documentElement.style.setProperty('--rf-zoom', String(zoom));
        }}
        onMove={(_, viewport) => {
          // 줌 변경 시 CSS 변수 업데이트 (React 재렌더 없이 CSS만 변경)
          document.documentElement.style.setProperty('--rf-zoom', String(viewport.zoom));
        }}
      />
      
      {/* AI Summary Tooltip */}
      {hovered && (!selectedId || selectionModeActive) && (
        <TooltipOverlay 
          hovered={hovered} 
          clusterMetaById={clusterMetaById}
          bridgeMode={bridgeMode}
          linkMode={linkMode}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={() => {
            hoverTimeoutRef.current = window.setTimeout(() => {
              setHovered(null);
            }, 150);
          }}
        />
      )}
    </>
  );
}

function TooltipOverlay({
  hovered,
  clusterMetaById,
  bridgeMode,
  linkMode,
  onMouseEnter,
  onMouseLeave
}: {
  hovered: BrainXNote;
  clusterMetaById: Map<string, GraphClusterMeta>;
  bridgeMode: boolean;
  linkMode: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { getNode, flowToScreenPosition } = useReactFlow();

  const summaryText = (hovered.summary ?? "").trim();
  const unavailableForAiSelection = (bridgeMode || linkMode) && hovered.availableForAiFeatures !== true;
  const tooltipBody = unavailableForAiSelection
    ? bridgeMode
      ? "아직 AI 추천에 사용할 수 없는 노트입니다. 노트 동기화가 완료되면 징검다리 추천에 사용할 수 있어요."
      : "아직 AI 추천에 사용할 수 없는 노트입니다. 노트 동기화가 완료되면 연결 추천에 사용할 수 있어요."
    : summaryText;
  if (!tooltipBody) return null;

  const node = getNode(hovered.id);
  if (!node) return null;

  const radius = (node.data?.radius as number) || 10;

  // 노드가 origin: [0.5, 0.5] 이므로 position이 정중앙입니다.
  // y축에서 radius만큼 빼서 노드의 맨 위를 가리키게 합니다.
  const pos = flowToScreenPosition({
    x: node.position.x,
    y: node.position.y - radius,
  });

  const cluster = resolveAiCluster(hovered.cluster, clusterMetaById);
  const clusterColor = `rgb(${cluster.color})`;
  const title = (hovered.title ?? "").trim() || "제목 없음";
  const tooltipLabel = unavailableForAiSelection ? "AI 추천 준비 전" : `${cluster.label} · AI 요약`;

  // createPortal: [data-route]의 transform 애니메이션이 position:fixed를
  // 깨므로, transform이 없는 document.body에 직접 렌더링
  return createPortal(
    <div
      className="pointer-events-auto"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        // 화살표 팁 및 노드와 툴팁 사이의 간격을 커버하도록 패딩 사용
        transform: 'translate(-50%, -100%)',
        paddingBottom: '19px',
        zIndex: 9999,
      }}
    >
      <div
        role="tooltip"
        className="fade-up rounded-xl p-3 shadow-2xl"
        style={{
          background: 'rgb(var(--surface) / 0.92)',
          border: '1px solid rgb(var(--border) / 0.35)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          width: 256,
          position: 'relative',
        }}
      >
        {/* 내용 */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: clusterColor }} />
          <span className="text-[13px] text-txt2">
            {tooltipLabel}
          </span>
        </div>
        <div className="mb-1 break-words text-[15px] font-semibold leading-snug text-txt">{title}</div>
        <p className="line-clamp-3 break-words text-[13.5px] leading-relaxed text-txt3">{tooltipBody}</p>

        {/* 역삼각형 말풍선 화살표 */}
        <div
          style={{
            position: 'absolute',
            bottom: -9,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: '9px solid rgb(var(--border) / 0.35)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -7,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgb(var(--surface) / 0.92)',
          }}
        />
      </div>
    </div>,
    document.body
  );
}

/** source/target 순서와 무관하게 같은 두 노트 쌍을 같은 key로 취급한다(서버 edge와 클라이언트
    파생 edge가 방향을 다르게 표현할 수 있어, 방향까지 따지면 이미 있는 연결을 중복으로 다시
    추가할 수 있다). */
function edgePairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

type GraphScreenEdge = {
  source: string;
  target: string;
  bridge?: boolean;
  type?: string;
};

function normalizeReferenceEdge(edge: GraphScreenEdge): GraphScreenEdge {
  if (edge.type !== "REFERENCE") return edge;
  return {
    ...edge,
    bridge: true,
  };
}

function GraphScreenInner() {
  const router = useRouter();
  const { notes: mockNotes, pushToast } = useBrainX();
  const [liveNotes, setLiveNotes] = useState<BrainXNote[] | null>(null);
  const [liveEdges, setLiveEdges] = useState<GraphScreenEdge[] | null>(null);
  const [graphDataVersion, setGraphDataVersion] = useState(0);
  const [clusterLatest, setClusterLatest] = useState<ClusterJobLatestData | null>(null);
  const [clusterStatus, setClusterStatus] = useState<AiClusterStatus>("idle");
  const [clusterError, setClusterError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'2d' | 'universe'>('2d');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [clusterOn, setClusterOn] = useState(false);
  const [timeFilter, setTimeFilter] = useState("전체");
  const [timeEffectEnabled, setTimeEffectEnabled] = useState(false);
  const [timeEffectStrength, setTimeEffectStrength] = useState(TIME_EFFECT_DEFAULT_STRENGTH);
  const [hiddenClusters, setHiddenClusters] = useState<Partial<Record<ClusterId, boolean>>>({});
  const [bridgeMode, setBridgeMode] = useState(false);
  const [bridgeSelectedIds, setBridgeSelectedIds] = useState<string[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeResultStatus>("idle");
  const [bridgeRecommendations, setBridgeRecommendations] = useState<BridgeRecommendation[]>([]);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeSaveStates, setBridgeSaveStates] = useState<Record<string, BridgeSaveState>>({});
  const [linkMode, setLinkMode] = useState(false);
  const [linkSelectedIds, setLinkSelectedIds] = useState<string[]>([]);
  const [linkStatus, setLinkStatus] = useState<LinkSuggestionStatus>("idle");
  const [linkGroups, setLinkGroups] = useState<LinkSuggestionGroup[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkProgress, setLinkProgress] = useState<LinkSuggestionProgress | null>(null);
  const [linkAcceptStates, setLinkAcceptStates] = useState<Record<string, LinkAcceptState>>({});
  const [linkAcceptAllLoading, setLinkAcceptAllLoading] = useState(false);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [sidebarsLocked, setSidebarsLocked] = useState(false);
  const controls = useRef<GraphControls | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const graphRequestIdRef = useRef(0);
  const clusterRequestIdRef = useRef(0);
  const graphMountedRef = useRef(false);
  const optimisticGraphNotesRef = useRef<Record<string, BrainXNote>>({});
  const currentSession = readAuthSession();
  const hasRealLogin = !!currentSession?.accessToken && !isDevAuthSession(currentSession);
  const { currentWorkspaceId, workspaces } = useWorkspace();
  // Ticket16: "default" 문자열 대신 현재 선택된 Workspace의 실제 documentGroupId가 있을 때만
  // AI 클러스터링을 활성화한다. 게스트는 AI 기능 호출 자체(10회 한도)는 허용되지만, 실제
  // documentGroupId를 가진 Workspace가 없어 이 요청을 만들 수 없다 — 여기서 막지 않으면
  // 항상 실패하는 호출로 게스트의 귀중한 10회 한도만 소모하게 된다. 게스트도 문서 그룹 없이
  // 클러스터링을 쓰게 하려면 별도로 게스트 Workspace 컨텍스트 지원이 필요하다(범위 밖).
  const aiClusterPanelEnabled = hasRealLogin && !!currentWorkspaceId && !USE_MOCK_GRAPH && !USE_MOCK_GRAPH_CLUSTERS;
  const rawNotes = aiClusterPanelEnabled ? (liveNotes ?? []) : (liveNotes ?? mockNotes);
  const aiClusterProjection = useMemo(
    () => aiClusterPanelEnabled ? applyAiClustersToNotes(rawNotes, clusterLatest) : { notes: rawNotes, clusters: null },
    [aiClusterPanelEnabled, clusterLatest, rawNotes]
  );
  const graphClusterProjection = useMemo(
    () => aiClusterProjection.clusters ? aiClusterProjection : applyDerivedClustersToNotes(aiClusterProjection.notes),
    [aiClusterProjection]
  );
  const notes = graphClusterProjection.notes;
  const timeFadeOpacityById = useMemo(
    () => timeEffectEnabled ? graphTimeEffectOpacityByNoteId(notes, timeEffectStrength) : new Map<string, number>(),
    [notes, timeEffectEnabled, timeEffectStrength]
  );
  // liveEdges가 없으면(게스트, 또는 서버 그래프 자체를 안 쓰는 경로) 지금까지와 동일하게 전부
  // markdown/제목 기반으로 파생한다. liveEdges가 있으면(로그인, 서버 projection) 그 값을 그대로
  // 신뢰하되, 방금 위키링크로 새로 연결한 노트처럼 서버 NoteLink 생성/재조회가 아직 따라오지
  // 못한 REFERENCE(위키링크) 연결만 markdown 기반으로 보충한다 — RELATED/SIMILAR 등 서버 고유의
  // 의미 관계 추천까지 클라이언트 휴리스틱으로 덧붙이면 서버 그래프와 다른 노이즈가 섞이므로
  // 위키링크 exact-match 연결만 좁게 보강한다.
  //
  // 그 markdown 파생조차도 "소스 노트 자신의 저장"이 끝나야 소스 노트의 markdown에 [[title]]이
  // 반영돼 있다는 전제가 깔려 있다 — 소스 노트 저장도 비동기라, 그래프가 막 새로 마운트된
  // 시점에는 그 저장이 아직 안 끝났을 수 있다. 그러면 A 노드는 optimistic하게 보이는데
  // 노트1-A edge만 안 보이는 정확히 그 증상이 난다. 그래서 pending wikilink 항목 자체
  // (source/target을 이미 알고 있다 — 어느 쪽 저장 상태와도 무관)로 optimistic edge를
  // 직접 만들어, 실제 edge(서버 또는 markdown 파생)가 없을 때만 보충한다.
  const edges = useMemo(() => {
    const base = (() => {
      const derivedEdges = deriveGraphEdges(notes).map((edge) => normalizeReferenceEdge(edge));
      if (!liveEdges) return derivedEdges;
      const derivedReferencePairs = new Set(
        derivedEdges
          .filter((edge) => edge.type === "REFERENCE")
          .map((edge) => edgePairKey(edge.source, edge.target))
      );
      const filteredLiveEdges = liveEdges
        .map((edge) => normalizeReferenceEdge(edge))
        .filter((edge) => edge.type !== "REFERENCE" || derivedReferencePairs.has(edgePairKey(edge.source, edge.target)));
      const existingPairs = new Set(filteredLiveEdges.map((edge) => edgePairKey(edge.source, edge.target)));
      const missingWikiLinkEdges = derivedEdges.filter(
        (edge) => edge.type === "REFERENCE" && !existingPairs.has(edgePairKey(edge.source, edge.target))
      );
      return missingWikiLinkEdges.length > 0 ? [...filteredLiveEdges, ...missingWikiLinkEdges] : filteredLiveEdges;
    })();

    const noteIds = new Set(notes.map((n) => n.id));
    const basePairs = new Set(base.map((e) => edgePairKey(e.source, e.target)));
    // 위키링크로 만든 항목(sourceNoteId가 있는 것)만 edge 대상이다 — 일반 새 노트 생성은
    // 연결할 대상이 없으므로 node만 optimistic 처리되고 여기서는 자연히 걸러진다.
    const optimisticEdges: GraphScreenEdge[] = [];
    for (const entry of readPendingCreatedNotes()) {
      if (!entry.sourceNoteId) continue;
      if (!noteIds.has(entry.sourceNoteId) || !noteIds.has(entry.noteId)) continue;
      if (basePairs.has(edgePairKey(entry.sourceNoteId, entry.noteId))) continue;
      optimisticEdges.push(
        normalizeReferenceEdge(
          pendingWikiLinkEntryToEdge({ sourceNoteId: entry.sourceNoteId, noteId: entry.noteId, title: entry.title })
        )
      );
    }

    return optimisticEdges.length > 0 ? [...base, ...optimisticEdges] : base;
  }, [liveEdges, notes]);
  const dynamicClusters = useMemo(() => {
    if (graphClusterProjection.clusters) return graphClusterProjection.clusters;
    return deriveNoteClusterMeta(notes);
  }, [graphClusterProjection.clusters, notes]);
  const clusterMetaById = useMemo(() => {
    const values = new Map<string, GraphClusterMeta>();
    for (const cluster of dynamicClusters) {
      values.set(cluster.id, cluster);
    }
    return values;
  }, [dynamicClusters]);
  const selected = selectedId ? notes.find((note) => note.id === selectedId) ?? null : null;
  const selectedSummary = (selected?.summary ?? "").trim();
  const noteDetailPanelVisible = selected !== null && !bridgeMode && !linkMode;
  const hasGraphData = notes.length > 0;
  const hasActionableNotes = rawNotes.length > 0;
  const noteIndexStatusUnavailable = rawNotes.some((note) => note.indexStatusUnavailable);
  const aiReadyNoteLabel = noteIndexStatusUnavailable ? "선택 가능한 노트" : "AI 추천 가능한 노트";
  const aiClusterUsableNoteCount = useMemo(
    () => rawNotes.filter(isAiFeatureReadyNote).length,
    [rawNotes]
  );
  const aiClusterButtonDisabled =
    !aiClusterPanelEnabled ||
    clusterStatus === "loading" ||
    clusterStatus === "analyzing" ||
    aiClusterUsableNoteCount < AI_CLUSTER_MIN_NOTES;
  const bridgeSelectableIds = useMemo(
    () => notes
      .filter((note) => isBridgeSelectableNote(note, hiddenClusters, timeFilter))
      .map((note) => note.id),
    [hiddenClusters, notes, timeFilter]
  );
  const bridgeSelectAllIds = useMemo(
    () => bridgeSelectableIds.slice(0, BRIDGE_MAX_NOTE_COUNT),
    [bridgeSelectableIds]
  );
  const bridgeSelectedNotes = useMemo(
    () => bridgeSelectedIds.map((id) => notes.find((note) => note.id === id)).filter((note): note is BrainXNote => !!note),
    [bridgeSelectedIds, notes]
  );
  const bridgeSelectableIdSet = useMemo(() => new Set(bridgeSelectableIds), [bridgeSelectableIds]);
  const bridgeSelectedReady =
    bridgeSelectedIds.length === bridgeSelectedNotes.length &&
    bridgeSelectedNotes.every(isAiFeatureReadyNote);
  const bridgeSelectionLocked = bridgeStatus === "loading";
  const bridgeAllSelectableSelected =
    bridgeSelectAllIds.length > 0 &&
    bridgeSelectedIds.length === bridgeSelectAllIds.length &&
    bridgeSelectAllIds.every((id) => bridgeSelectedIds.includes(id));
  const canCreateBridgeConcepts =
    !!currentWorkspaceId &&
    bridgeSelectedIds.length >= BRIDGE_MIN_NOTE_COUNT &&
    bridgeSelectedIds.length <= BRIDGE_MAX_NOTE_COUNT &&
    bridgeSelectedReady &&
    !bridgeSelectionLocked;
  const bridgePanelVisible = bridgeMode || bridgeStatus === "success" || bridgeStatus === "error";
  const linkSelectableIds = bridgeSelectableIds;
  const linkSelectAllIds = useMemo(
    () => linkSelectableIds.slice(0, LINK_MAX_NOTE_COUNT),
    [linkSelectableIds]
  );
  const linkSelectedNotes = useMemo(
    () => linkSelectedIds.map((id) => notes.find((note) => note.id === id)).filter((note): note is BrainXNote => !!note),
    [linkSelectedIds, notes]
  );
  const linkSelectableIdSet = useMemo(() => new Set(linkSelectableIds), [linkSelectableIds]);
  const linkSelectedReady =
    linkSelectedIds.length === linkSelectedNotes.length &&
    linkSelectedNotes.every(isAiFeatureReadyNote);
  const linkSelectionLocked = linkStatus === "loading" || linkAcceptAllLoading;
  const linkAllSelectableSelected =
    linkSelectAllIds.length > 0 &&
    linkSelectedIds.length === linkSelectAllIds.length &&
    linkSelectAllIds.every((id) => linkSelectedIds.includes(id));
  const canCreateLinkSuggestions =
    !!currentWorkspaceId &&
    linkSelectedIds.length >= LINK_MIN_NOTE_COUNT &&
    linkSelectedIds.length <= LINK_MAX_NOTE_COUNT &&
    linkSelectedReady &&
    !linkSelectionLocked;
  const linkPanelVisible = linkMode || linkStatus === "success" || linkStatus === "error";
  const linkSuggestionCount = linkGroups.reduce((sum, group) => sum + group.suggestions.length, 0);
  const linkAcceptableSuggestions = useMemo(
    () => linkGroups.flatMap((group) =>
      group.suggestions
        .filter((suggestion) => linkAcceptStates[linkSuggestionKey(group.sourceNoteId, suggestion)]?.status !== "saved")
        .map((suggestion) => ({ group, suggestion }))
    ),
    [linkAcceptStates, linkGroups]
  );
  const resolveAiRequestNoteId = useCallback(
    (noteId: string) => notes.find((note) => note.id === noteId)?.aiSourceNoteId ?? noteId,
    [notes]
  );

  useEffect(() => {
    setBridgeSelectedIds((current) => current.filter((id) => bridgeSelectableIdSet.has(id)));
  }, [bridgeSelectableIdSet]);

  useEffect(() => {
    setLinkSelectedIds((current) => current.filter((id) => linkSelectableIdSet.has(id)));
  }, [linkSelectableIdSet]);

  const refreshGraph = useCallback(
    async ({
      reset = false,
      showError = true
    }: {
      reset?: boolean;
      showError?: boolean;
    } = {}) => {
      const session = readAuthSession();
      // 데이터 로딩 경로 분기는 JWT 유무만이 아니라, 이 요청이 Workspace-Service에 실제로
      // "식별된 사용자"로 도착하는지(hasWorkspaceUserIdentity — 로컬의 X-User-Id dev override
      // 포함)를 기준으로 삼는다. JWT만 보면, 로컬 개발에서 NEXT_PUBLIC_WORKSPACE_DEV_USER_ID가
      // 설정된 경우 실제로는 USER로 저장된 데이터를 GUEST draft 경로로 잘못 읽어 새로고침 후
      // 사라진 것처럼 보이는 불일치가 생긴다.
      const hasWorkspaceIdentity = hasWorkspaceUserIdentity();
      const requestId = graphRequestIdRef.current + 1;
      graphRequestIdRef.current = requestId;

      if (reset) {
        optimisticGraphNotesRef.current = {};
      }
      // 방금(위키링크든 일반 "+ 새 노트"든) 만든 노트가 노트 화면 세션(sessionStorage)에
      // 남아있으면, 아직 서버가 안 따라왔더라도 그래프에 optimistic하게 먼저 반영한다 —
      // /notes에서 새 노트를 만들고 바로 /graph로 넘어오는(완전히 새로 마운트되는) 경로를
      // 위한 것이다. 매번 최신 캐시 내용으로 다시 씌운다(무조건 덮어쓰기) — "이미 있으면
      // 건너뛰기"로 하면, 최초 생성 시점의 "새 노트"/"새 노트1" 제목으로 한 번 seed된 뒤
      // 사용자가 제목을 바꿔도(handleTitleChange가 캐시의 title은 갱신해도) 여기서 다시
      // 읽어오지 않아 옛 제목이 계속 보이는 문제가 있었다. 이 ref는 노트 id를 key로 쓰고
      // 노트 id는 전역적으로 고유하므로, 여기서 만든 항목이 다른 optimistic 기능(예: 그래프
      // 자체의 "징검다리 개념" 생성)의 항목과 같은 id로 충돌할 일은 없다.
      for (const entry of readPendingCreatedNotes()) {
        optimisticGraphNotesRef.current[entry.noteId] = {
          ...pendingCreatedNoteToBrainXNote(entry),
          documentGroupId: entry.documentGroupId ?? null,
        };
      }

      if (isDevAuthSession(session)) {
        setLiveNotes(null);
        setLiveEdges(null);
        return;
      }

      if (!hasWorkspaceIdentity) {
        // reset(최초 마운트/actor 전환)일 때만 미리 비운다 — 그 외(브라우저 background
        // refresh)는 이미 화면에 떠 있는 그래프를 fetch가 끝나기도 전에 비워 "아무것도 없음"이
        // 잠깐(또는 실패 시 계속) 보이게 만들던 원인이었다.
        if (reset) {
          setLiveNotes([]);
          setLiveEdges([]);
        }
        try {
          const data = await listWorkspaceNoteDrafts();
          if (!graphMountedRef.current || requestId !== graphRequestIdRef.current) return;
          const draftNotes = draftsToBrainXNotes(data.drafts);
          const draftNoteIds = new Set(draftNotes.map((note) => note.id));
          const optimisticDraftNotes = Object.values(optimisticGraphNotesRef.current).filter((note) => {
            if (draftNoteIds.has(note.id)) {
              delete optimisticGraphNotesRef.current[note.id];
              removePendingCreatedNoteByNoteId(note.id);
              return false;
            }
            return true;
          });
          const nextDraftNotes = optimisticDraftNotes.length > 0 ? [...optimisticDraftNotes, ...draftNotes] : draftNotes;
          setLiveNotes(nextDraftNotes);
          setLiveEdges(deriveDraftWikiLinkEdges(nextDraftNotes));
          setGraphDataVersion((version) => version + 1);
        } catch (error) {
          if (!graphMountedRef.current || requestId !== graphRequestIdRef.current) return;
          // 배경 새로고침 하나가 일시적으로 실패했다고 이미 보여주고 있던 그래프를 비우지
          // 않는다 — reset이면 애초에 보여줄 이전 데이터가 없어 빈 상태 그대로 둔다.
          if (reset) {
            setLiveNotes([]);
            setLiveEdges([]);
          }
          if (showError) {
            const message = error instanceof Error ? error.message : "임시 저장된 노트를 불러오지 못했습니다.";
            pushToast(message, "err");
          }
        }
        return;
      }

      if (USE_MOCK_GRAPH) {
        setLiveNotes(null);
        setLiveEdges(null);
        return;
      }

      if (reset) {
        setLiveNotes([]);
        setLiveEdges([]);
      }

      try {
        const graph = await getGraph();
        if (!graphMountedRef.current || requestId !== graphRequestIdRef.current) return;
        const graphNotes = await mergeNoteIndexStatuses(graphToBrainXNotes(graph), currentWorkspaceId);
        if (!graphMountedRef.current || requestId !== graphRequestIdRef.current) return;
        const serverNoteIds = new Set(graphNotes.map((note) => note.id));
        const optimisticNotes = Object.values(optimisticGraphNotesRef.current).filter((note) => {
          if (serverNoteIds.has(note.id)) {
            delete optimisticGraphNotesRef.current[note.id];
            removePendingCreatedNoteByNoteId(note.id);
            return false;
          }
          return true;
        });
        // GraphNodeData(=/api/v1/graph 응답)는 documentGroupId를 포함한다. 예전 응답/캐시처럼
        // 값이 비어 있을 수 있는 경우만 mockNotes(useBrainX(), 실제로는 Notes API로 이미
        // documentGroupId까지 불러온 전역 노트 목록)와 noteId로 보정한다. optimisticNotes는
        // sessionStorage에 생성 당시 documentGroupId를 함께 보존해 두고, 같은 기준으로 현재
        // Workspace와 일치하는 것만 merge한다. 그래야 Workspace A에서 막 만든 노트가 projection
        // 반영 전에 Workspace B graph로 잠깐 섞이는 회귀를 막을 수 있다.
        const docGroupByNoteId = new Map(mockNotes.map((note) => [note.id, note.documentGroupId ?? null]));
        const scopedOptimisticNotes = optimisticNotes.filter((note) =>
          matchesWorkspaceScope(note.documentGroupId ?? null, currentWorkspaceId, workspaces)
        );
        const scopedGraphNotes = graphNotes.filter((note) => {
          const knownDocGroupId = note.documentGroupId ?? docGroupByNoteId.get(note.id);
          // mockNotes(useBrainX(), 별도로 비동기 로드되는 전역 노트 목록)가 이 그래프 응답의
          // 노트를 아직 못 따라온 순간에는 documentGroupId를 모른다 — null(레거시/미배정)로
          // 단정해 배제하면, 실제로는 현재 Workspace 소속인 노트가 두 소스의 로딩 타이밍 차이
          // 때문에 "아무것도 없음"으로 보이는 문제가 있었다. 모르면 배제하지 않고 통과시킨다 —
          // 다음 refresh에서 mockNotes가 따라잡히면 정확한 스코프로 다시 걸러진다.
          if (knownDocGroupId === undefined) return true;
          return matchesWorkspaceScope(knownDocGroupId, currentWorkspaceId, workspaces);
        });
        const scopedNoteIds = new Set([...scopedGraphNotes.map((note) => note.id), ...scopedOptimisticNotes.map((note) => note.id)]);
        setLiveNotes(scopedOptimisticNotes.length > 0 ? [...scopedOptimisticNotes, ...scopedGraphNotes] : scopedGraphNotes);
        setLiveEdges(graphEdgesForFlow(graph).filter((edge) => scopedNoteIds.has(edge.source) && scopedNoteIds.has(edge.target)));
        setGraphDataVersion((version) => version + 1);
      } catch (error) {
        if (!graphMountedRef.current || requestId !== graphRequestIdRef.current) return;
        // 배경 새로고침 하나의 실패로 이미 보여주고 있던 그래프를 비우지 않는다 — reset이면
        // 애초에 보여줄 이전 데이터가 없어 빈 상태 그대로 둔다.
        if (reset) {
          setLiveNotes([]);
          setLiveEdges([]);
        }
        if (showError) {
          const message = error instanceof Error ? error.message : "Could not load graph data.";
          pushToast(message, "err");
        }
      }
    },
    [pushToast, mockNotes, currentWorkspaceId, workspaces]
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
        if (!graphMountedRef.current || requestId !== clusterRequestIdRef.current) return null;
        setClusterLatest(latest);
        setClusterError(null);
        setClusterStatus("idle");
        return latest;
      } catch (error) {
        if (!graphMountedRef.current || requestId !== clusterRequestIdRef.current) return null;
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
      if (!graphMountedRef.current || requestId !== clusterRequestIdRef.current) return;
      setClusterLatest((current) => ({
        documentGroupId: job.documentGroupId,
        searchableNoteCount: current?.searchableNoteCount ?? aiClusterUsableNoteCount,
        latestNoteUpdatedAt: current?.latestNoteUpdatedAt ?? null,
        state: job.status === "FAILED" ? "FAILED" : "FRESH",
        job,
      }));
      setClusterOn(true);
      setHiddenClusters({});
      pushToast(job.status === "FAILED" ? "AI 클러스터 분석이 실패했습니다." : "AI 클러스터 분석이 완료되었습니다.", job.status === "FAILED" ? "err" : "ok");
      await refreshClusterLatest({ showError: false });
    } catch (error) {
      if (!graphMountedRef.current || requestId !== clusterRequestIdRef.current) return;
      const message = error instanceof Error ? error.message : "AI 클러스터 분석을 시작하지 못했습니다.";
      setClusterError(message);
      setClusterStatus("error");
      pushToast(message, "err");
    }
  }, [aiClusterButtonDisabled, aiClusterUsableNoteCount, currentWorkspaceId, pushToast, refreshClusterLatest]);

  const clearBridgeState = () => {
    setBridgeSelectedIds([]);
    setBridgeStatus("idle");
    setBridgeRecommendations([]);
    setBridgeError(null);
    setBridgeSaveStates({});
  };

  const clearLinkState = () => {
    setLinkSelectedIds([]);
    setLinkStatus("idle");
    setLinkGroups([]);
    setLinkError(null);
    setLinkProgress(null);
    setLinkAcceptStates({});
    setLinkAcceptAllLoading(false);
  };

  const closeBridgeMode = () => {
    setBridgeMode(false);
    clearBridgeState();
  };

  const closeLinkMode = () => {
    setLinkMode(false);
    clearLinkState();
  };

  const toggleBridgeMode = () => {
    if (bridgeMode) {
      closeBridgeMode();
      return;
    }
    setSelectedId(null);
    setLinkMode(false);
    clearLinkState();
    setBridgeMode(true);
    setSidebarsVisible(true);
    setSidebarsLocked(true);
    clearBridgeState();
  };

  const toggleLinkMode = () => {
    if (linkMode) {
      closeLinkMode();
      return;
    }
    setSelectedId(null);
    setBridgeMode(false);
    clearBridgeState();
    setLinkMode(true);
    setSidebarsVisible(true);
    setSidebarsLocked(true);
    clearLinkState();
  };

  const clearBridgeGeneratedState = () => {
    setBridgeStatus("idle");
    setBridgeError(null);
    setBridgeRecommendations([]);
    setBridgeSaveStates({});
  };

  const clearLinkGeneratedState = () => {
    setLinkStatus("idle");
    setLinkError(null);
    setLinkGroups([]);
    setLinkProgress(null);
    setLinkAcceptStates({});
    setLinkAcceptAllLoading(false);
  };

  const selectBridgeNotes = (noteIds: string[], replace = false) => {
    if (bridgeSelectionLocked || (!replace && noteIds.length === 0)) return;
    const selectableNoteIds = noteIds.filter((id) => bridgeSelectableIdSet.has(id));
    if (selectableNoteIds.length === 0) {
      if (replace) {
        clearBridgeGeneratedState();
        setBridgeSelectedIds([]);
      }
      if (noteIds.length > 0) pushToast("AI 추천 가능한 노트만 사용할 수 있어요.", "info");
      return;
    }
    clearBridgeGeneratedState();
    const hasNewIncoming = selectableNoteIds.some((id) => !bridgeSelectedIds.includes(id));
    const result = mergeBridgeSelectedIds(replace ? [] : bridgeSelectedIds, selectableNoteIds);
    setBridgeSelectedIds(result.ids);
    if (!replace && hasNewIncoming && bridgeSelectedIds.length >= BRIDGE_MAX_NOTE_COUNT) {
      pushToast(`징검다리 추천은 최대 ${BRIDGE_MAX_NOTE_COUNT}개 노트까지 선택할 수 있어요.`, "info");
    }
  };

  const toggleBridgeSelectAll = () => {
    if (bridgeSelectionLocked || bridgeSelectableIds.length === 0) return;
    clearBridgeGeneratedState();
    if (bridgeAllSelectableSelected) {
      setBridgeSelectedIds([]);
      return;
    }
    const result = mergeBridgeSelectedIds([], bridgeSelectableIds);
    setBridgeSelectedIds(result.ids);
    if (result.truncated) {
      pushToast(`보이는 노트 중 ${BRIDGE_MAX_NOTE_COUNT}개까지만 선택했어요.`, "info");
    }
  };

  const toggleBridgeNote = (noteId: string) => {
    if (bridgeSelectionLocked) return;
    if (!bridgeSelectedIds.includes(noteId) && !bridgeSelectableIdSet.has(noteId)) {
      pushToast("AI 추천 가능한 노트만 사용할 수 있어요.", "info");
      return;
    }
    clearBridgeGeneratedState();
    if (bridgeSelectedIds.includes(noteId)) {
      setBridgeSelectedIds(bridgeSelectedIds.filter((id) => id !== noteId));
      return;
    }
    const result = mergeBridgeSelectedIds(bridgeSelectedIds, [noteId]);
    setBridgeSelectedIds(result.ids);
    if (result.truncated) {
      pushToast(`징검다리 추천은 최대 ${BRIDGE_MAX_NOTE_COUNT}개 노트까지 선택할 수 있어요.`, "info");
    }
  };

  const selectLinkNotes = (noteIds: string[], replace = false) => {
    if (linkSelectionLocked || (!replace && noteIds.length === 0)) return;
    const selectableNoteIds = noteIds.filter((id) => linkSelectableIdSet.has(id));
    if (selectableNoteIds.length === 0) {
      if (replace) {
        clearLinkGeneratedState();
        setLinkSelectedIds([]);
      }
      if (noteIds.length > 0) pushToast("AI 추천 가능한 노트만 사용할 수 있어요.", "info");
      return;
    }
    clearLinkGeneratedState();
    const hasNewIncoming = selectableNoteIds.some((id) => !linkSelectedIds.includes(id));
    const result = mergeLinkSelectedIds(replace ? [] : linkSelectedIds, selectableNoteIds);
    setLinkSelectedIds(result.ids);
    if (!replace && hasNewIncoming && linkSelectedIds.length >= LINK_MAX_NOTE_COUNT) {
      pushToast(`AI 연결 추천은 최대 ${LINK_MAX_NOTE_COUNT}개 노트까지 선택할 수 있어요.`, "info");
    }
  };

  const toggleLinkSelectAll = () => {
    if (linkSelectionLocked || linkSelectableIds.length === 0) return;
    clearLinkGeneratedState();
    if (linkAllSelectableSelected) {
      setLinkSelectedIds([]);
      return;
    }
    const result = mergeLinkSelectedIds([], linkSelectableIds);
    setLinkSelectedIds(result.ids);
    if (result.truncated) {
      pushToast(`보이는 노트 중 ${LINK_MAX_NOTE_COUNT}개까지만 선택했어요.`, "info");
    }
  };

  const toggleLinkNote = (noteId: string) => {
    if (linkSelectionLocked) return;
    if (!linkSelectedIds.includes(noteId) && !linkSelectableIdSet.has(noteId)) {
      pushToast("AI 추천 가능한 노트만 사용할 수 있어요.", "info");
      return;
    }
    clearLinkGeneratedState();
    if (linkSelectedIds.includes(noteId)) {
      setLinkSelectedIds(linkSelectedIds.filter((id) => id !== noteId));
      return;
    }
    const result = mergeLinkSelectedIds(linkSelectedIds, [noteId]);
    setLinkSelectedIds(result.ids);
    if (result.truncated) {
      pushToast(`AI 연결 추천은 최대 ${LINK_MAX_NOTE_COUNT}개 노트까지 선택할 수 있어요.`, "info");
    }
  };

  const handleCreateBridgeConcepts = async () => {
    if (!canCreateBridgeConcepts || !currentWorkspaceId) return;
    const session = readAuthSession();
    const hasRealLogin = !!session?.accessToken && !isDevAuthSession(session);
    if (!hasRealLogin) {
      pushToast("회원가입/로그인 하고 이어서 작업할 수 있어요.", "info");
      router.push(buildAuthPath("/login", "/graph"));
      return;
    }
    setBridgeStatus("loading");
    setBridgeError(null);
    setBridgeSaveStates({});
    try {
      const result = await createBridgeConcepts({
        documentGroupId: currentWorkspaceId,
        noteIds: bridgeSelectedIds.map(resolveAiRequestNoteId)
      });
      setBridgeRecommendations(result.recommendations);
      setBridgeStatus("success");
      if (result.recommendations.length > 0) {
        pushToast("징검다리 개념 후보를 만들었어요.", "ok");
      }
    } catch (error) {
      const message = bridgeErrorMessage(error);
      setBridgeError(message);
      setBridgeStatus("error");
    }
  };

  const handleCreateLinkSuggestions = async () => {
    if (!canCreateLinkSuggestions || !currentWorkspaceId) return;
    const session = readAuthSession();
    if (!session?.accessToken) {
      pushToast("회원가입/로그인 하고 이어서 작업할 수 있어요.", "info");
      router.push(buildAuthPath("/login", "/graph"));
      return;
    }

    setLinkStatus("loading");
    setLinkError(null);
    setLinkGroups([]);
    setLinkAcceptStates({});
    setLinkAcceptAllLoading(false);
    setLinkProgress({ current: 0, total: linkSelectedIds.length });

    try {
      const groups: LinkSuggestionGroup[] = [];
      for (let index = 0; index < linkSelectedIds.length; index += 1) {
        const sourceNoteId = linkSelectedIds[index];
        const sourceNote = notes.find((note) => note.id === sourceNoteId);
        if (!sourceNote) continue;
        setLinkProgress({ current: index + 1, total: linkSelectedIds.length });
        const result = await createLinkSuggestions({
          documentGroupId: currentWorkspaceId,
          noteId: resolveAiRequestNoteId(sourceNoteId)
        });
        const suggestions = filterLinkSuggestions(sourceNoteId, result.suggestions, notes, edges);
        if (suggestions.length > 0) {
          groups.push({
            sourceNoteId,
            sourceTitle: sourceNote.title,
            suggestions
          });
        }
      }
      setLinkGroups(groups);
      setLinkStatus("success");
      setLinkProgress(null);
      if (groups.reduce((sum, group) => sum + group.suggestions.length, 0) > 0) {
        pushToast("AI 연결 후보를 찾았어요.", "ok");
      }
    } catch (error) {
      setLinkError(linkSuggestionErrorMessage(error));
      setLinkStatus("error");
      setLinkProgress(null);
    }
  };

  const addOptimisticLink = (sourceNoteId: string, targetNoteId: string) => {
    setLiveEdges((current) => {
      const baseEdges = current ?? edges;
      if (hasExistingEdge(baseEdges, sourceNoteId, targetNoteId)) {
        return baseEdges;
      }
      return [normalizeReferenceEdge({ source: sourceNoteId, target: targetNoteId, type: "REFERENCE" }), ...baseEdges];
    });
    setLiveNotes((current) => {
      const baseNotes = current ?? notes;
      return baseNotes.map((note) => {
        if (note.id !== sourceNoteId && note.id !== targetNoteId) return note;
        const linkId = note.id === sourceNoteId ? targetNoteId : sourceNoteId;
        if (note.links.includes(linkId)) return note;
        return { ...note, links: [...note.links, linkId] };
      });
    });
    controls.current?.reheat();
  };

  const acceptLinkSuggestion = async (
    group: LinkSuggestionGroup,
    suggestion: LinkSuggestion,
    showToast = true
  ) => {
    const key = linkSuggestionKey(group.sourceNoteId, suggestion);
    const currentState = linkAcceptStates[key];
    if (currentState?.status === "saving" || currentState?.status === "saved") return false;

    setLinkAcceptStates((current) => ({
      ...current,
      [key]: { status: "saving" }
    }));

    try {
      const sourceNote = notes.find((note) => note.id === group.sourceNoteId);
      const targetNote = notes.find((note) => note.id === suggestion.targetNoteId);
      if (!sourceNote) {
        throw new Error("연결할 원본 노트를 찾을 수 없습니다.");
      }
      const targetTitle = linkSuggestionTargetTitle(suggestion, targetNote);
      const latestSource = await getNote(sourceNote.id);
      const latestMarkdown = latestSource?.markdown ?? "";
      const applied = applyLinkSuggestionToMarkdown(latestMarkdown, suggestion, targetTitle);
      if (applied.error) {
        throw new Error(applied.error);
      }
      if (applied.changed) {
        const saved = await updateWorkspaceNoteContent({
          id: sourceNote.id,
          title: latestSource?.title || sourceNote.title,
          content: applied.markdown,
          tags: latestSource?.tags ?? sourceNote.tags,
          category: "ai",
          folderId: latestSource?.folder?.folderId ?? sourceNote.folderId,
          createdAt: Date.parse(latestSource?.createdAt ?? "") || Date.parse(sourceNote.createdAt) || Date.now(),
          updatedAt: Date.now(),
          version: latestSource.version ?? sourceNote.version,
          persisted: true
        });
        setLiveNotes((current) => {
          const baseNotes = current ?? notes;
          return baseNotes.map((note) => note.id === sourceNote.id
            ? {
                ...note,
                title: latestSource?.title || note.title,
                markdown: applied.markdown,
                version: saved.version,
                updatedAt: saved.savedAt,
                updated: "today"
              }
            : note);
        });
      }
      addOptimisticLink(sourceNote.id, suggestion.targetNoteId);
      setLinkAcceptStates((current) => ({
        ...current,
        [key]: { status: "saved" }
      }));
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", {
        detail: { sourceNoteId: sourceNote.id, targetNoteId: suggestion.targetNoteId }
      }));
      if (showToast) {
        pushToast("AI 연결 후보를 본문 링크로 저장했어요.", "ok");
      }
      return true;
    } catch (error) {
      if (error instanceof WorkspaceApiError && error.code === "NOTE_VERSION_CONFLICT") {
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", {
          detail: { sourceNoteId: group.sourceNoteId, targetNoteId: suggestion.targetNoteId }
        }));
      }
      setLinkAcceptStates((current) => ({
        ...current,
        [key]: { status: "error", error: linkAcceptErrorMessage(error) }
      }));
      return false;
    }
  };

  const handleAcceptAllLinkSuggestions = async () => {
    if (linkAcceptAllLoading || linkAcceptableSuggestions.length === 0) return;
    setLinkAcceptAllLoading(true);
    let savedCount = 0;
    try {
      for (const item of linkAcceptableSuggestions) {
        const saved = await acceptLinkSuggestion(item.group, item.suggestion, false);
        if (saved) savedCount += 1;
      }
      if (savedCount > 0) {
        pushToast(`${savedCount}개 연결을 저장했어요.`, "ok");
        setLinkMode(false);
      }
    } finally {
      setLinkAcceptAllLoading(false);
    }
  };

  const handleSaveBridgeRecommendation = async (recommendation: BridgeRecommendation) => {
    const proposalId = recommendation.noteId;
    const currentSaveState = bridgeSaveStates[proposalId];
    if (currentSaveState?.status === "saving") return;
    if (currentSaveState?.status === "saved" && currentSaveState.noteId) {
      router.push(`/notes/${currentSaveState.noteId}`);
      return;
    }

    setBridgeSaveStates((current) => ({
      ...current,
      [proposalId]: { status: "saving" }
    }));

    try {
      const now = Date.now();
      const created = await createWorkspaceNote({
        id: proposalId,
        title: normalizeMarkdownText(recommendation.title) || "징검다리 개념 후보",
        content: buildBridgeRecommendationMarkdown(recommendation, bridgeSelectedNotes),
        tags: BRIDGE_RECOMMENDATION_TAGS,
        category: "ai",
        folderId: undefined,
        createdAt: now,
        updatedAt: now,
        persisted: false,
        documentGroupId: currentWorkspaceId ?? undefined
      });
      const graphNote = bridgeRecommendationToGraphNote(recommendation, created, bridgeSelectedNotes);
      optimisticGraphNotesRef.current[graphNote.id] = graphNote;

      setBridgeSaveStates((current) => ({
        ...current,
        [proposalId]: { status: "saved", noteId: created.noteId }
      }));
      setLiveNotes((current) => {
        const baseNotes = current ?? notes;
        if (baseNotes.some((note) => note.id === graphNote.id)) {
          return baseNotes.map((note) => (note.id === graphNote.id ? graphNote : note));
        }
        return [graphNote, ...baseNotes];
      });
      controls.current?.reheat();
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { noteId: created.noteId } }));
      pushToast("징검다리 후보를 새 노트로 저장했어요.", "ok");
    } catch (error) {
      setBridgeSaveStates((current) => ({
        ...current,
        [proposalId]: { status: "error", error: bridgeSaveErrorMessage(error) }
      }));
    }
  };

  useEffect(() => {
    graphMountedRef.current = true;
    void refreshGraph({ reset: true });

    const handleNotesRefresh = () => {
      void refreshGraph({ showError: false });
    };
    const handleAuthSessionChanged = () => {
      void refreshGraph({ reset: true, showError: false });
    };

    window.addEventListener("brainx:notes-refresh", handleNotesRefresh);
    // brainx:graph-refresh — NotesWorkspace가 노트 본문의 위키링크 target 변경을 감지하고 그
    // 노트를 즉시 저장한 뒤 쏘는 전용 신호(NotesWorkspace.tsx의 handleContentChange 참고).
    // notes-refresh와 같은 핸들러를 그대로 재사용해 동작은 동일하고, NotesWorkspace 자신의
    // loadFromServer(활성 탭 복원 로직)에는 영향을 주지 않는 별도 이벤트라는 점만 다르다.
    window.addEventListener("brainx:graph-refresh", handleNotesRefresh);
    window.addEventListener("brainx-auth-session-changed", handleAuthSessionChanged);
    return () => {
      graphMountedRef.current = false;
      graphRequestIdRef.current += 1;
      clusterRequestIdRef.current += 1;
      window.removeEventListener("brainx:notes-refresh", handleNotesRefresh);
      window.removeEventListener("brainx:graph-refresh", handleNotesRefresh);
      window.removeEventListener("brainx-auth-session-changed", handleAuthSessionChanged);
    };
  }, [refreshGraph]);

  useEffect(() => {
    if (!aiClusterPanelEnabled || !hasActionableNotes) {
      setClusterLatest(null);
      setClusterError(null);
      setClusterStatus("idle");
      return;
    }
    void refreshClusterLatest({ showError: false });
  }, [aiClusterPanelEnabled, graphDataVersion, hasActionableNotes, refreshClusterLatest]);

  useEffect(() => {
    if (!hasGraphData) {
      setSidebarsVisible(true);
      return;
    }

    const clearTimer = () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };

    const scheduleHide = () => {
      clearTimer();
      if (sidebarsLocked) return;
      idleTimerRef.current = window.setTimeout(() => {
        setSidebarsVisible(false);
      }, 3000);
    };

    const handleActivity = () => {
      setSidebarsVisible(true);
      scheduleHide();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    scheduleHide();

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      clearTimer();
    };
  }, [hasGraphData, sidebarsLocked]);

  useEffect(() => {
    if (!hasGraphData) {
      setSidebarsLocked(true);
      setSidebarsVisible(true);
      return;
    }
    if (sidebarsLocked) setSidebarsVisible(true);
  }, [hasGraphData, sidebarsLocked]);

  useEffect(() => {
    if (hasGraphData) return;
    setSidebarsLocked(false);
  }, [hasGraphData]);

  useEffect(() => {
    setBridgeSelectedIds((current) => current.filter((id) => notes.some((note) => note.id === id)));
    setLinkSelectedIds((current) => current.filter((id) => notes.some((note) => note.id === id)));
  }, [notes]);

  const selectedCluster = selected ? resolveAiCluster(selected.cluster, clusterMetaById) : null;
  const clusterStateMessage = (() => {
    if (!aiClusterPanelEnabled) {
      return { title: "노트 기반 분류", body: "AI 클러스터가 꺼진 상태에서는 현재 노트의 태그와 그룹만 표시합니다." };
    }
    if (clusterStatus === "loading") {
      return { title: "상태 확인 중", body: "최근 AI 클러스터 결과를 불러오고 있습니다." };
    }
    if (clusterStatus === "analyzing") {
      return { title: "AI 분석 중", body: "현재 노트 스냅샷을 주제별로 묶고 있습니다." };
    }
    if (clusterLatest?.state === "NO_SOURCE_NOTES") {
      return { title: "분석 대상 없음", body: "AI 추천 가능한 노트가 생기면 AI 클러스터를 만들 수 있습니다." };
    }
    if (aiClusterUsableNoteCount < AI_CLUSTER_MIN_NOTES) {
      return { title: "노트 부족", body: `분석 가능한 노트가 ${AI_CLUSTER_MIN_NOTES}개 이상 필요합니다.` };
    }
    if (clusterLatest?.state === "NOT_ANALYZED") {
      return { title: "아직 분석 전", body: "버튼을 누르면 현재 노트 기준의 지식 구조를 만듭니다." };
    }
    if (clusterLatest?.state === "STALE") {
      return { title: "노트가 변경됨", body: "마지막 결과를 표시 중입니다. 다시 분석해 최신화하세요." };
    }
    if (clusterLatest?.state === "FAILED") {
      return { title: "최근 분석 실패", body: clusterLatest.job?.failureMessage ?? "다시 분석을 실행해 주세요." };
    }
    if (clusterLatest?.state === "FRESH") {
      return { title: "분석 완료", body: "현재 AI 추천 가능한 노트 스냅샷과 일치합니다." };
    }
    if (clusterError) {
      return { title: "상태 확인 실패", body: clusterError };
    }
    return { title: "AI 클러스터", body: "노트 주제를 분석해 그래프 그룹을 구성합니다." };
  })();
  const clusterActionLabel = clusterLatest?.state === "FRESH" ? "다시 분석" : "AI 분석";

  return (
    <div data-route className={cx("relative h-full overflow-hidden transition-colors duration-150", theme === 'universe' ? "bg-slate-950 universe-theme" : "bg-bg")}>
      <ReactFlowProvider>
        <GraphCanvasFlow
          theme={theme}
          notes={notes}
          edges={edges}
          selectedId={selectedId}
          layoutMode={layoutMode}
          clusterOn={clusterOn}
          timeFilter={timeFilter}
          timeFadeOpacityById={timeFadeOpacityById}
          hiddenClusters={hiddenClusters}
          clusterMetaById={clusterMetaById}
          controls={controls}
          bridgeMode={bridgeMode}
          bridgeSelectedIds={bridgeSelectedIds}
          bridgeSelectionLocked={bridgeSelectionLocked}
          linkMode={linkMode}
          linkSelectedIds={linkSelectedIds}
          linkSelectionLocked={linkSelectionLocked}
          onBridgeSelect={toggleBridgeNote}
          onBridgeSelectMany={(ids, replace) => selectBridgeNotes(ids, replace)}
          onLinkSelect={toggleLinkNote}
          onLinkSelectMany={(ids, replace) => selectLinkNotes(ids, replace)}
          onSelect={(id) => {
            setSelectedId(id);
          }}
        />
      </ReactFlowProvider>
      {notes.length === 0 ? (
        <GraphEmptyState
          onCreateNote={() => router.push("/notes")}
          onOpenNotes={() => router.push("/notes")}
          onOpenChat={() => router.push("/chat")}
          onOpenGraph={() => router.push("/graph")}
        />
      ) : null}

      <div className="pointer-events-none absolute left-5 right-5 top-5 z-20 flex items-start justify-between gap-3">
        <div
          className={cx(
            "pointer-events-auto transition-[opacity,transform] duration-300 ease-out",
            !hasGraphData || sidebarsVisible ? "translate-x-0 opacity-100" : "-translate-x-10 opacity-0"
          )}
        >
          <div className="glass mb-3 max-w-xs rounded-2xl px-4 py-3 backdrop-blur-md shadow-sm">
            <h1 className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-txt">
              <Icon name="graph" size={18} className="text-primary" />
              지식 마인드맵
            </h1>
            <p className="mt-1 text-[12px] text-txt2">
              노트 간의 연결망을 탐색하세요. 마우스를 올리거나 스크롤하여 줌인해 보세요.
            </p>
          </div>
          {aiClusterPanelEnabled ? (
            <div className="glass w-64 rounded-2xl p-3 backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-txt2">
                    <Icon name="cluster" size={13} />
                    AI 클러스터
                  </div>
                  <div className="mt-1 truncate text-[13px] font-bold text-txt">{clusterStateMessage.title}</div>
                </div>
                <button
                  type="button"
                  disabled={aiClusterButtonDisabled}
                  onClick={requestAiClusterAnalysis}
                  className={cx(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    clusterStatus === "analyzing"
                      ? "bg-primary/15 text-primary"
                      : "bg-primary text-white hover:bg-primary/90"
                  )}
                >
                  <Icon name={clusterStatus === "analyzing" ? "refresh" : "sparkle"} size={12} />
                  {clusterStatus === "analyzing" ? "분석 중" : clusterActionLabel}
                </button>
              </div>
              <p className="mt-2 break-words text-[11.5px] leading-5 text-txt3">{clusterStateMessage.body}</p>
              <div className="mt-2 rounded-lg bg-txt/5 px-2.5 py-1.5 text-[11px] font-medium text-txt3">
                {aiReadyNoteLabel} {aiClusterUsableNoteCount}개
              </div>
              {noteIndexStatusUnavailable ? (
                <div className={cx("mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium", GRAPH_NOTICE_TONE.info)}>
                  AI 추천 가능 여부를 확인하지 못해 기존 방식으로 선택합니다.
                </div>
              ) : null}
              {clusterLatest?.state === "STALE" ? (
                <div className={cx("mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium", GRAPH_NOTICE_TONE.stale)}>
                  노트가 변경됨 · 다시 분석 필요
                </div>
              ) : null}
              {clusterError ? (
                <div className={cx("mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium", GRAPH_NOTICE_TONE.error)}>
                  {clusterError}
                </div>
              ) : null}
              <div className="mt-3 space-y-0.5">
                {dynamicClusters.map((cluster) => {
                  const count = notes.filter((note) => note.cluster === cluster.id).length;
                  const hidden = hiddenClusters[cluster.id];
                  return (
                    <button
                      key={cluster.id}
                      type="button"
                      onClick={() => setHiddenClusters((current) => ({ ...current, [cluster.id]: !current[cluster.id] }))}
                      className="flex min-h-8 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-txt/10"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(${cluster.color})`, opacity: hidden ? 0.3 : 1 }} />
                      <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", hidden ? "line-through text-txt3" : "text-txt2")}>{cluster.label}</span>
                      <span className="font-mono text-[11px] text-txt3">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glass w-52 rounded-2xl p-2.5 space-y-0.5 backdrop-blur-md shadow-sm">
              <div className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11px] font-semibold text-txt2">
                <Icon name="cluster" size={13} />
                클러스터
              </div>
              {dynamicClusters.map((cluster) => {
                const count = notes.filter((note) => note.cluster === cluster.id).length;
                const hidden = hiddenClusters[cluster.id];
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => setHiddenClusters((current) => ({ ...current, [cluster.id]: !current[cluster.id] }))}
                    className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-txt/10"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: `rgb(${cluster.color})`, opacity: hidden ? 0.3 : 1 }} />
                    <span className={cx("flex-1 text-[12.5px]", hidden ? "line-through text-txt3" : "text-txt2")}>{cluster.label}</span>
                    <span className="font-mono text-[11px] text-txt3">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className={cx(
            "flex flex-col items-end gap-3 transition-[opacity,transform] duration-300 ease-out",
            noteDetailPanelVisible
              ? "pointer-events-none translate-x-10 opacity-0"
              : !hasGraphData || sidebarsVisible
                ? "pointer-events-auto translate-x-0 opacity-100"
                : "pointer-events-none translate-x-10 opacity-0"
          )}
        >
          <div className="glass relative z-20 flex items-center gap-0.5 rounded-xl p-1.5 backdrop-blur-md shadow-sm">
            <button
              type="button"
              aria-pressed={sidebarsLocked}
              disabled={!hasGraphData}
              onClick={() => {
                if (!hasGraphData) return;
                setSidebarsLocked((current) => !current);
              }}
              className={cx(
                "group relative grid h-8 w-8 place-items-center rounded-lg transition-colors",
                !hasGraphData
                  ? "cursor-not-allowed text-txt3/40"
                  : sidebarsLocked
                    ? "bg-primary text-white"
                    : "text-txt3 hover:bg-txt/10 hover:text-txt"
              )}
              title={sidebarsLocked ? "사이드바 고정 해제" : "사이드바 고정"}
            >
              {!hasGraphData || sidebarsLocked ? <PinOff size={14} /> : <Pin size={14} />}
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {!hasGraphData ? "데이터가 있을 때만 사용 가능" : sidebarsLocked ? "사이드바 고정 해제" : "사이드바 고정"}
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <button type="button" onClick={() => controls.current?.zoom(0.5)} className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="zoomin" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                확대
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <button type="button" onClick={() => controls.current?.zoom(-0.5)} className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="zoomout" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                축소
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <button type="button" onClick={() => controls.current?.fit()} className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="fit" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                전체 보기
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <div className="flex rounded-lg p-0.5 bg-surface2/50">
              {/* 네트워크 (force): 노드 3개와 연결선 */}
              <button type="button" onClick={() => setLayoutMode('force')} className={cx("group relative h-9 w-9 grid place-items-center rounded-md transition-colors", layoutMode === 'force' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8.5" cy="3.5" r="2" />
                  <circle cx="3" cy="13" r="2" />
                  <circle cx="14" cy="13" r="2" />
                  <line x1="8.5" y1="5.5" x2="3" y2="11" />
                  <line x1="8.5" y1="5.5" x2="14" y2="11" />
                  <line x1="3" y1="13" x2="14" y2="13" />
                </svg>
                <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  네트워크 레이아웃
                  <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
                </span>
              </button>
              {/* ─ 트리: 트리 레이아웃 */}
              <button type="button" onClick={() => setLayoutMode('tree')} className={cx("group relative h-9 w-9 grid place-items-center rounded-md transition-colors", layoutMode === 'tree' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="2.5" cy="8.5" r="1.8" />
                  <circle cx="9" cy="4" r="1.8" />
                  <circle cx="9" cy="13" r="1.8" />
                  <circle cx="15" cy="1.8" r="1.5" />
                  <circle cx="15" cy="6.5" r="1.5" />
                  <circle cx="15" cy="10.5" r="1.5" />
                  <circle cx="15" cy="15.2" r="1.5" />
                  <line x1="4.3" y1="8.5" x2="7.2" y2="4" />
                  <line x1="4.3" y1="8.5" x2="7.2" y2="13" />
                  <line x1="10.8" y1="4" x2="13.5" y2="1.8" />
                  <line x1="10.8" y1="4" x2="13.5" y2="6.5" />
                  <line x1="10.8" y1="13" x2="13.5" y2="10.5" />
                  <line x1="10.8" y1="13" x2="13.5" y2="15.2" />
                </svg>
                <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  가로 트리 레이아웃
                  <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
                </span>
              </button>
              {/* 방사형: 동심원 */}
              <button type="button" onClick={() => setLayoutMode('radial')} className={cx("group relative h-9 w-9 grid place-items-center rounded-md transition-colors", layoutMode === 'radial' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8.5" cy="8.5" r="1.8" />
                  <circle cx="8.5" cy="8.5" r="5" />
                  <circle cx="8.5" cy="8.5" r="1.8" fill="currentColor" fillOpacity="0.15" />
                  <line x1="8.5" y1="3.5" x2="8.5" y2="1.5" />
                  <line x1="8.5" y1="13.5" x2="8.5" y2="15.5" />
                  <line x1="3.5" y1="8.5" x2="1.5" y2="8.5" />
                  <line x1="13.5" y1="8.5" x2="15.5" y2="8.5" />
                </svg>
                <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  방사형 레이아웃
                  <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
                </span>
              </button>
            </div>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <button
                type="button"
                onClick={() => setTheme(t => t === 'universe' ? '2d' : 'universe')}
                className={cx(
                  "group relative grid h-9 w-9 place-items-center rounded-lg transition-colors duration-200",
                  theme === 'universe'
                    ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-txt"
                    : "text-txt3 hover:bg-txt/10 hover:text-txt"
                )}
              >
                <div>
                  <UniverseIcon size={19} />
                </div>
                <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {theme === 'universe' ? '우주 모드 끄기' : '우주 모드 켜기'}
                  <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
                </span>
              </button>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <button type="button" onClick={() => setClusterOn((current) => !current)} className={cx("group relative grid h-9 w-9 place-items-center rounded-lg transition-colors", clusterOn ? "bg-primary text-white" : "text-txt3 hover:bg-txt/10 hover:text-txt")}>
              <Icon name="cluster" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                클러스터링
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <button
              type="button"
              aria-pressed={timeEffectEnabled}
              onClick={() => setTimeEffectEnabled((current) => !current)}
              className={cx(
                "group relative grid h-9 w-9 place-items-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
                timeEffectEnabled ? "bg-primary text-white" : "text-txt3 hover:bg-txt/10 hover:text-txt"
              )}
            >
              <Icon name="clock" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {timeEffectEnabled ? "시간 효과 끄기" : "시간 효과 켜기"}
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
            <button type="button" onClick={() => controls.current?.reheat()} className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="refresh" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                재배치
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
          </div>

          {timeEffectEnabled ? (
            <div className="glass relative z-10 flex w-[min(280px,calc(100vw-40px))] items-center gap-3 rounded-xl px-3 py-2 backdrop-blur-md shadow-sm">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-txt2">
                <Icon name="clock" size={13} />
                <span className="whitespace-nowrap">흐림 강도</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={timeEffectStrength}
                aria-label="시간 효과 흐림 강도"
                onChange={(event) => setTimeEffectStrength(Number(event.currentTarget.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <span className="w-7 shrink-0 text-right font-mono text-[11px] text-txt3">{timeEffectStrength}</span>
            </div>
          ) : null}

          <div className="glass relative z-10 flex items-center gap-0.5 rounded-xl p-1 backdrop-blur-md shadow-sm">
            {["전체", "최근 1일", "최근 1주"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeFilter(item)}
                className={cx("h-8 rounded-lg px-3 text-[12px] font-medium transition-colors", timeFilter === item ? "bg-txt/15 text-txt" : "text-txt3 hover:text-txt")}
              >
                {item}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-pressed={bridgeMode}
            disabled={!hasActionableNotes}
            onClick={toggleBridgeMode}
            className={cx(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
              !hasActionableNotes
                ? "cursor-not-allowed border-line/40 bg-surface2/60 text-txt3/50"
                : bridgeMode
                  ? "border-primary bg-primary text-white hover:bg-primary/90"
                  : GRAPH_RECOMMENDATION_BUTTON
            )}
          >
            <Icon name="sparkle" size={14} />
            <span>{bridgeMode ? "선택 종료" : "징검다리 개념 추천"}</span>
            {bridgeMode ? (
              <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[11px] tabular-nums">
                {bridgeSelectedIds.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-pressed={linkMode}
            disabled={!hasActionableNotes}
            onClick={toggleLinkMode}
            className={cx(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
              !hasActionableNotes
                ? "cursor-not-allowed border-line/40 bg-surface2/60 text-txt3/50"
                : linkMode
                  ? "border-primary bg-primary text-white hover:bg-primary/90"
                  : GRAPH_RECOMMENDATION_BUTTON
            )}
          >
            <Icon name="sparkle" size={14} />
            <span>{linkMode ? "선택 종료" : "AI 연결 추천"}</span>
            {linkMode ? (
              <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[11px] tabular-nums">
                {linkSelectedIds.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {bridgePanelVisible ? (
        <div className="fade-up pointer-events-auto absolute bottom-5 right-5 z-30 w-[min(360px,calc(100vw-40px))]">
          <div className="flex max-h-[min(560px,calc(100vh-120px))] flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/95 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-line/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
                    <Icon name="sparkle" size={14} />
                    징검다리 개념 추천
                  </div>
                  <h2 className="mt-1 truncate text-[17px] font-bold text-txt">
                    노트 사이를 이어줄 주제 후보
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="징검다리 추천 패널 닫기"
                  onClick={closeBridgeMode}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-txt3 transition-colors hover:bg-txt/10 hover:text-txt focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-txt2">
                그래프에서 2~10개 노트를 선택하세요. 선택 순서대로 AI가 새 문서 후보를 제안합니다.
              </p>
              <p className="mt-1 text-[11px] leading-5 text-txt3">
                {aiReadyNoteLabel} {bridgeSelectableIds.length}개만 선택할 수 있습니다.
              </p>
            </div>

            <div className="scroll flex-1 overflow-y-auto p-4" aria-live="polite">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-txt3">선택한 노트</span>
                  <span className="mt-0.5 block text-[10px] text-txt3">Shift + 드래그로 여러 노트를 선택</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={bridgeSelectionLocked || bridgeSelectableIds.length === 0}
                    onClick={toggleBridgeSelectAll}
                    className="h-6 rounded-md border border-line/60 bg-surface2/60 px-2 text-[10.5px] font-semibold text-txt2 transition-colors hover:border-primary/40 hover:text-txt disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bridgeAllSelectableSelected ? "전체 해제" : "전체 선택"}
                  </button>
                  <span className="text-[11px] tabular-nums text-txt3">
                    {bridgeSelectedIds.length}/{BRIDGE_MAX_NOTE_COUNT}
                  </span>
                </div>
              </div>

              {bridgeSelectedNotes.length > 0 ? (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {bridgeSelectedNotes.map((note, index) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => toggleBridgeNote(note.id)}
                      disabled={bridgeStatus === "loading"}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/60 bg-surface2/70 px-2.5 py-1 text-[11px] text-txt2 transition-colors hover:border-accent/50 hover:text-txt disabled:opacity-60"
                    >
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="max-w-[220px] truncate">{note.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mb-4 rounded-xl border border-dashed border-line/70 bg-surface2/40 px-3 py-4 text-center text-[12px] text-txt3">
                  {bridgeSelectableIds.length === 0
                    ? "AI 추천 가능한 노트가 필요합니다. 노트 동기화 후 다시 시도하세요."
                    : "추천에 사용할 노트를 먼저 선택하세요."}
                </div>
              )}

              <button
                type="button"
                disabled={!canCreateBridgeConcepts}
                onClick={handleCreateBridgeConcepts}
                className={cx(
                  "mb-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
                  canCreateBridgeConcepts
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-surface2 text-txt3"
                )}
              >
                <Icon name={bridgeStatus === "loading" ? "refresh" : "sparkle"} size={15} />
                {bridgeStatus === "loading" ? "추천 생성 중…" : "추천 생성"}
              </button>

              {bridgeStatus === "error" ? (
                <div className={cx("rounded-xl p-3 text-[12px] leading-5", GRAPH_NOTICE_TONE.error)}>
                  {bridgeError ?? "추천 생성에 실패했습니다. 선택한 노트를 확인하고 다시 시도하세요."}
                </div>
              ) : null}

              {bridgeStatus === "success" && bridgeRecommendations.length === 0 ? (
                <div className="rounded-xl border border-line/60 bg-surface2/50 p-4 text-center">
                  <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-txt/5 text-txt3">
                    <Icon name="sparkle" size={16} />
                  </div>
                  <p className="text-[13px] font-semibold text-txt">추천 후보가 없습니다</p>
                  <p className="mt-1 text-[12px] leading-5 text-txt3">
                    다른 노트를 더 선택하거나 연결이 약한 주제끼리 다시 시도하세요.
                  </p>
                </div>
              ) : null}

              {bridgeRecommendations.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-txt3">추천 후보</div>
                  {bridgeRecommendations.map((recommendation) => {
                    const saveState = bridgeSaveStates[recommendation.noteId];
                    const saveStatus = saveState?.status ?? "idle";
                    const isSaving = saveStatus === "saving";
                    const isSaved = saveStatus === "saved" && !!saveState.noteId;
                    return (
                      <article
                        key={recommendation.noteId}
                        className="rounded-xl border border-line/60 bg-surface2/55 p-3"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <h3 className="min-w-0 flex-1 truncate text-[13px] font-bold text-txt">
                            {recommendation.title}
                          </h3>
                          <span className="shrink-0 rounded-full bg-txt/5 px-2 py-0.5 text-[10px] font-medium text-txt3" translate="no">
                            {recommendation.noteId.slice(0, 12)}
                          </span>
                        </div>
                        <p className="mt-2 max-h-24 overflow-y-auto break-words text-[12px] leading-5 text-txt2">
                          {recommendation.bridgeReason}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-2.5">
                          <span className={cx(
                            "min-w-0 truncate text-[11px]",
                            saveStatus === "error" ? "text-primary" : "text-txt3"
                          )}>
                            {isSaved ? "Workspace 노트로 저장됨" : saveStatus === "error" ? saveState.error : "후보를 새 노트로 남길 수 있어요"}
                          </span>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveBridgeRecommendation(recommendation)}
                            className={cx(
                              "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60",
                              isSaved
                                ? "bg-txt/10 text-txt hover:bg-txt/15"
                                : "bg-primary text-white hover:bg-primary/90"
                            )}
                          >
                            <Icon name={isSaving ? "refresh" : isSaved ? "doc" : "plus"} size={12} />
                            {isSaving ? "저장 중" : isSaved ? "열기" : "노트로 저장"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {linkPanelVisible ? (
        <div className="fade-up pointer-events-auto absolute bottom-5 right-5 z-30 w-[min(390px,calc(100vw-40px))]">
          <div className="flex max-h-[min(600px,calc(100vh-120px))] flex-col overflow-hidden rounded-2xl border border-line/60 bg-surface/95 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-line/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-primary">
                    <Icon name="sparkle" size={14} />
                    AI 연결 추천
                  </div>
                  <h2 className="mt-1 truncate text-[17px] font-bold text-txt">
                    노트 사이의 실제 링크 후보
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="AI 연결 추천 패널 닫기"
                  onClick={closeLinkMode}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-txt3 transition-colors hover:bg-txt/10 hover:text-txt focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-txt2">
                연결을 만들 원본 노트를 선택하세요. AI가 각 노트에서 이어볼 만한 대상 노트를 찾습니다.
              </p>
              <p className="mt-1 text-[11px] leading-5 text-txt3">
                {aiReadyNoteLabel} {linkSelectableIds.length}개만 선택할 수 있습니다.
              </p>
            </div>

            <div className="scroll flex-1 overflow-y-auto p-4" aria-live="polite">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold text-txt3">원본 노트</span>
                  <span className="mt-0.5 block text-[10px] text-txt3">노드 클릭 또는 Shift + 드래그로 선택</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={linkSelectionLocked || linkSelectableIds.length === 0}
                    onClick={toggleLinkSelectAll}
                    className="h-6 rounded-md border border-line/60 bg-surface2/60 px-2 text-[10.5px] font-semibold text-txt2 transition-colors hover:border-primary/40 hover:text-txt disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {linkAllSelectableSelected ? "전체 해제" : "전체 선택"}
                  </button>
                  <span className="text-[11px] tabular-nums text-txt3">
                    {linkSelectedIds.length}/{LINK_MAX_NOTE_COUNT}
                  </span>
                </div>
              </div>

              {linkSelectedNotes.length > 0 ? (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {linkSelectedNotes.map((note, index) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => toggleLinkNote(note.id)}
                      disabled={linkSelectionLocked}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line/60 bg-surface2/70 px-2.5 py-1 text-[11px] text-txt2 transition-colors hover:border-primary/50 hover:text-txt disabled:opacity-60"
                    >
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="max-w-[220px] truncate">{note.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mb-4 rounded-xl border border-dashed border-line/70 bg-surface2/40 px-3 py-4 text-center text-[12px] text-txt3">
                  {linkSelectableIds.length === 0
                    ? "AI 추천 가능한 노트가 필요합니다. 노트 동기화 후 다시 시도하세요."
                    : "연결 추천을 만들 원본 노트를 먼저 선택하세요."}
                </div>
              )}

              <button
                type="button"
                disabled={!canCreateLinkSuggestions}
                onClick={handleCreateLinkSuggestions}
                className={cx(
                  "mb-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50",
                  canCreateLinkSuggestions
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-surface2 text-txt3"
                )}
              >
                <Icon name={linkStatus === "loading" ? "refresh" : "sparkle"} size={15} />
                {linkStatus === "loading" && linkProgress
                  ? `${linkProgress.current}/${linkProgress.total} 분석 중…`
                  : "추천 생성"}
              </button>

              {linkStatus === "error" ? (
                <div className={cx("rounded-xl p-3 text-[12px] leading-5", GRAPH_NOTICE_TONE.error)}>
                  {linkError ?? "AI 연결 추천 생성에 실패했습니다. 선택한 노트를 확인하고 다시 시도하세요."}
                </div>
              ) : null}

              {linkStatus === "success" && linkSuggestionCount === 0 ? (
                <div className="rounded-xl border border-line/60 bg-surface2/50 p-4 text-center">
                  <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-txt/5 text-txt3">
                    <Icon name="sparkle" size={16} />
                  </div>
                  <p className="text-[13px] font-semibold text-txt">새로 연결할 후보가 없습니다</p>
                  <p className="mt-1 text-[12px] leading-5 text-txt3">
                    다른 노트를 선택하거나 노트 동기화 후 다시 시도하세요.
                  </p>
                </div>
              ) : null}

              {linkSuggestionCount > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold text-txt3">추천 후보 {linkSuggestionCount}</div>
                    <button
                      type="button"
                      disabled={linkAcceptAllLoading || linkAcceptableSuggestions.length === 0}
                      onClick={handleAcceptAllLinkSuggestions}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {linkAcceptAllLoading ? <Icon name="refresh" size={12} className="animate-spin" /> : null}
                      {linkAcceptAllLoading ? "저장 중" : "전체 수락"}
                    </button>
                  </div>

                  {linkGroups.map((group) => (
                    <section
                      key={group.sourceNoteId}
                      className="rounded-xl border border-line/60 bg-surface2/45 p-3"
                    >
                      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10.5px] font-semibold text-primary">원본 노트</div>
                          <h3 className="truncate text-[13px] font-bold text-txt">{group.sourceTitle}</h3>
                        </div>
                        <span className="shrink-0 rounded-full bg-txt/5 px-2 py-0.5 text-[10px] font-medium text-txt3">
                          {group.suggestions.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.suggestions.map((suggestion) => {
                          const key = linkSuggestionKey(group.sourceNoteId, suggestion);
                          const acceptState = linkAcceptStates[key];
                          const acceptStatus = acceptState?.status ?? "idle";
                          const isSaving = acceptStatus === "saving";
                          const isSaved = acceptStatus === "saved";
                          const targetNote = notes.find((note) => note.id === suggestion.targetNoteId);
                          return (
                            <article
                              key={key}
                              className="rounded-lg border border-line/50 bg-surface/70 p-3"
                            >
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedId(suggestion.targetNoteId)}
                                  className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-txt transition-colors hover:text-primary"
                                >
                                  {suggestion.targetTitle || targetNote?.title || "연결 후보"}
                                </button>
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  {Math.round((suggestion.score ?? 0) * 100)}%
                                </span>
                              </div>
                              {suggestion.reason ? (
                                <p className="mt-2 max-h-20 overflow-y-auto break-words text-[12px] leading-5 text-txt2">
                                  {suggestion.reason}
                                </p>
                              ) : null}
                              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/50 pt-2.5">
                                <span className={cx(
                                  "min-w-0 truncate text-[11px]",
                                  acceptStatus === "error" ? "text-primary" : "text-txt3"
                                )}>
                                  {isSaving ? "본문 링크로 저장 중…" : isSaved ? "그래프에 연결됨" : acceptStatus === "error" ? acceptState.error : "실제 링크로 저장할 수 있어요"}
                                </span>
                                <button
                                  type="button"
                                  disabled={isSaving || isSaved || linkAcceptAllLoading}
                                  onClick={async () => {
                                    const saved = await acceptLinkSuggestion(group, suggestion);
                                    if (saved) setLinkMode(false);
                                  }}
                                  className={cx(
                                    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60",
                                    isSaved
                                      ? "bg-txt/10 text-txt"
                                      : "bg-primary text-white hover:bg-primary/90"
                                  )}
                                >
                                  <Icon name={isSaving ? "refresh" : isSaved ? "check" : "plus"} size={12} className={isSaving ? "animate-spin" : undefined} />
                                  {isSaving ? "저장 중" : isSaved ? "수락됨" : "수락"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {noteDetailPanelVisible ? (
        <div className="fade-up absolute bottom-5 right-5 top-5 z-30 w-80">
          <div className="flex h-full flex-col overflow-hidden bg-surface/90 border border-line/70 rounded-2xl backdrop-blur-xl shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-line/70 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: `rgb(${selectedCluster?.color ?? "148 163 184"})`, color: `rgb(${selectedCluster?.color ?? "148 163 184"})` }} />
                <span className="truncate text-[12px] text-txt2">{selectedCluster?.label ?? "미분류"}</span>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="text-txt3 hover:text-txt transition-colors">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="scroll flex-1 overflow-y-auto p-4">
              <h2 className="mb-2 text-[18px] font-bold leading-snug text-txt">{selected.title}</h2>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {selected.tags.map((tag) => (
                  <Badge key={tag} className="!h-5 !text-[10.5px] bg-txt/10 border-none text-txt2">
                    #{tag}
                  </Badge>
                ))}
              </div>
              {selectedSummary ? (
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    <Icon name="sparkle" size={13} />
                    AI 분석 요약
                  </div>
                  <p className="break-words text-[13px] leading-relaxed text-txt2">{selectedSummary}</p>
                </div>
              ) : null}
              <div className="mb-2 text-[11px] font-semibold text-txt3">신경 시냅스 (연결된 노트) {selected.links.length}</div>
              <div className="mb-4 space-y-1.5">
                {selected.links.map((id) => {
                  const linked = noteById(notes, id);
                  if (!linked) return null;
                  const linkedCluster = resolveAiCluster(linked.cluster, clusterMetaById);
                  return (
                    <button key={id} type="button" onClick={() => setSelectedId(id)} className="flex w-full items-center gap-2 rounded-lg p-2 hover:bg-txt/5 transition-colors">
                      <span className="h-2 w-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]" style={{ background: `rgb(${linkedCluster.color})`, color: `rgb(${linkedCluster.color})` }} />
                      <span className="flex-1 text-left truncate text-[12.5px] text-txt2">{linked.title}</span>
                      <Icon name="chevR" size={13} className="text-txt3" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 border-t border-line/70 p-4">
              <Btn variant="primary" size="sm" icon="doc" className="flex-1 shadow-lg" onClick={() => router.push(`/notes/${selected.id}`)}>
                탐험하기
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function GraphScreen() {
  return (
    <ReactFlowProvider>
      <GraphScreenInner />
    </ReactFlowProvider>
  );
}
