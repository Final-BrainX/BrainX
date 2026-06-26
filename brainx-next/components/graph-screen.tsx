"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Compass, FileUp, PencilLine, Pin, PinOff, Sparkles } from "lucide-react";
import { readAuthSession } from "@/lib/auth-api";
import { deriveGraphEdges, noteById, clusterById, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { getGraph, graphEdgesForFlow, graphToBrainXNotes, USE_MOCK_GRAPH, USE_MOCK_GRAPH_CLUSTERS } from "@/lib/graph-api";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState, useReactFlow, type Edge, type Node } from "@xyflow/react";
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
  const steps = [
    {
      step: "1",
      title: "노트 작성",
      desc: "생각, 공부, 아이디어를 먼저 적어두면 그래프의 중심이 생깁니다.",
      icon: PencilLine,
      color: "from-[#EFEAFF] to-[#F7F5FF]",
      accent: "text-[#6C63D8]"
    },
    {
      step: "2",
      title: "AI 연결",
      desc: "BrainX가 주제와 문맥을 읽고 관련 노트를 부드럽게 연결해요.",
      icon: Sparkles,
      color: "from-[#EAF8F2] to-[#F5FBF8]",
      accent: "text-[#4BC3AC]"
    },
    {
      step: "3",
      title: "그래프 탐색",
      desc: "연결망을 따라가며 지식의 구조와 공백을 한눈에 확인해요.",
      icon: Compass,
      color: "from-[#EAF1FF] to-[#F5F8FF]",
      accent: "text-[#5BA8F0]"
    }
  ] as const;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 py-10">
      <div className="pointer-events-auto flex w-full max-w-[860px] flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-white/75 shadow-[0_10px_30px_rgba(108,99,216,0.12)] backdrop-blur">
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6C63D8] to-[#7A72E6] px-5 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(108,99,216,0.22)] transition-transform hover:-translate-y-0.5"
          >
            <Icon name="plus" size={16} />
            첫 노트 만들기
          </button>
          <button
            type="button"
            onClick={onOpenNotes}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line/70 bg-white/80 px-5 text-[14px] font-semibold text-txt2 shadow-sm transition-colors hover:border-primary/30 hover:text-txt"
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
              className="group relative overflow-hidden rounded-2xl border border-line/60 bg-white/85 p-5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_34px_rgba(108,99,216,0.12)]"
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

type PlanetFlowNode = Node<{
  label: string;
  color: string;
  radius: number;
  selected: boolean;
  dimmed: boolean;
  isDirect: boolean;
  layer: "front" | "middle" | "back";
  theme: "2d" | "universe";
}>;

type OrbitFlowEdge = Edge<{
  isBridge: boolean;
  isSelected: boolean;
  isDimmed: boolean;
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
  const clusterOrder: ClusterId[] = ["ml", "read", "proj", "work", "life"];
  const clusterIndex = Object.fromEntries(clusterOrder.map((cluster, index) => [cluster, index])) as Record<ClusterId, number>;

  notes.forEach((note) => {
    const index = clusterIndex[note.cluster] ?? 0;
    const angle = (index / clusterOrder.length) * Math.PI * 2;
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

  return positions;
}

const nodeTypes = { planet: PlanetNode };
const edgeTypes = { orbit: OrbitEdge };

const ageRank: Record<string, number> = {
  오늘: 0,
  "2시간 전": 0,
  "4시간 전": 0,
  어제: 1,
  "1일 전": 1,
  "2일 전": 2,
  "3일 전": 3,
  "4일 전": 4,
  "5일 전": 5,
  "6일 전": 6,
  "1주 전": 7
};

function GraphCanvasFlow({
  theme,
  notes,
  edges,
  selectedId,
  layoutMode,
  clusterOn,
  timeFilter,
  hiddenClusters,
  controls,
  bridgeMode,
  onSelect
}: {
  theme: '2d' | 'universe';
  notes: BrainXNote[];
  edges: Array<{ source: string; target: string; bridge?: boolean }>;
  selectedId: string | null;
  layoutMode: LayoutMode;
  clusterOn: boolean;
  timeFilter: string;
  hiddenClusters: Partial<Record<ClusterId, boolean>>;
  controls: MutableRefObject<GraphControls | null>;
  bridgeMode: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { setCenter, fitView, zoomTo, getViewport, fitBounds } = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<PlanetFlowNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<OrbitFlowEdge>([]);
  const [hovered, setHovered] = useState<BrainXNote | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  
  const positionsRef = useRef<Record<string, GraphNode>>(settleLayout(notes));
  const raf = useRef(0);

  // Sync positionsRef with notes to handle async data loading
  useEffect(() => {
    let added = false;
    const settled = settleLayout(notes);
    notes.forEach(note => {
      if (!positionsRef.current[note.id]) {
        positionsRef.current[note.id] = settled[note.id];
        added = true;
      }
    });
    if (added && controls.current) {
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
    const step = () => {
      tick++;
      const pos = positionsRef.current;
      const isStructured = notes.some(n => pos[n.id] && pos[n.id].tx !== null);

      if (!isStructured) {
        for (let i = 0; i < notes.length; i += 1) {
          for (let j = i + 1; j < notes.length; j += 1) {
            const a = pos[notes[i].id];
            const b = pos[notes[j].id];
            if (!a || !b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            // Optimization: Skip expensive math for nodes far away from each other
            if (Math.abs(dx) > 400 || Math.abs(dy) > 400) continue;
            
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

      if (moved && tick % 2 === 0) {
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
      const cluster = clusterById(note.cluster);
      const linkCount = note.links.length;
      const baseRadius = 3.5 + Math.min(4, linkCount * 0.75);
      const selected = activeId === note.id;
      const isDirect = activeId ? direct.has(note.id) : false;
      const radius = selected ? baseRadius + 4 : (isDirect ? baseRadius + 1.5 : baseRadius);
      const dimmed = timeFilter !== "전체" && (ageRank[note.updated] ?? 0) > (timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99);
      const hidden = hiddenClusters[note.cluster] ? true : false;
      
      let layer: 'front' | 'middle' | 'back' = 'middle';
      if (activeId) {
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
        position: { x: positionsRef.current[note.id]?.x ?? 0, y: positionsRef.current[note.id]?.y ?? 0 },
        origin: [0.5, 0.5] as [number, number],
        data: {
          label: note.title,
          color: cluster.color,
          radius,
          selected,
          dimmed,
          isDirect,
          layer,
          theme
        },
        hidden,
        draggable: true,
        className: dimmed ? 'pointer-events-none' : ''
      };
    });
    
    const newEdges = edges.map(edge => {
      const sourceNote = notes.find(n => n.id === edge.source);
      const targetNote = notes.find(n => n.id === edge.target);
      
      const sourceDimmed = timeFilter !== "전체" && (ageRank[sourceNote?.updated ?? 0] ?? 0) > (timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99);
      const targetDimmed = timeFilter !== "전체" && (ageRank[targetNote?.updated ?? 0] ?? 0) > (timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99);

      const isSelected = activeId && (edge.source === activeId || edge.target === activeId);
      // bridgeMode: bridge 아닌 엣지는 흐리게, bridge 엣지는 강조
      const isDimmed = activeId
        ? !isSelected
        : (bridgeMode ? !edge.bridge : (sourceDimmed || targetDimmed));
      // 소스 노드의 색상을 엣지에 전달
      const sourceColor = sourceNote ? clusterById(sourceNote.cluster).color : null;
      // 선택/호버된 활성 노드의 색상을 엣지에 전달
      const activeNote = activeId ? notes.find(n => n.id === activeId) : null;
      const activeColor = activeNote ? clusterById(activeNote.cluster).color : null;
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
          theme,
          sourceColor,
          activeColor
        }
      };
    });
    
    setRfNodes(newNodes);
    setRfEdges(newEdges);
  }, [notes, edges, selectedId, hovered, draggingNodeId, timeFilter, hiddenClusters, setRfNodes, setRfEdges, theme, bridgeMode]);

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
          onSelect(selectedId === node.id ? null : node.id);
        }}
        onPaneClick={() => onSelect(null)}
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
      {hovered && !selectedId && (
        <TooltipOverlay 
          hovered={hovered} 
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

function TooltipOverlay({ hovered, onMouseEnter, onMouseLeave }: { hovered: BrainXNote, onMouseEnter: () => void, onMouseLeave: () => void }) {
  const { getNode, flowToScreenPosition } = useReactFlow();

  const node = getNode(hovered.id);
  if (!node) return null;

  const radius = (node.data?.radius as number) || 10;

  // 노드가 origin: [0.5, 0.5] 이므로 position이 정중앙입니다.
  // y축에서 radius만큼 빼서 노드의 맨 위를 가리키게 합니다.
  const pos = flowToScreenPosition({
    x: node.position.x,
    y: node.position.y - radius,
  });

  const clusterColor = `rgb(${clusterById(hovered.cluster).color})`;

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
            {clusterById(hovered.cluster).label} · AI 요약
          </span>
        </div>
        <div className="mb-1 text-[15px] font-semibold leading-snug text-txt">{hovered.title}</div>
        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-txt3">{hovered.summary}</p>

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

function GraphScreenInner() {
  const router = useRouter();
  const { notes: mockNotes, pushToast } = useBrainX();
  const [liveNotes, setLiveNotes] = useState<BrainXNote[] | null>(null);
  const [liveEdges, setLiveEdges] = useState<Array<{ source: string; target: string; bridge?: boolean }> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'2d' | 'universe'>('2d');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [clusterOn, setClusterOn] = useState(false);
  const [timeFilter, setTimeFilter] = useState("전체");
  const [hiddenClusters, setHiddenClusters] = useState<Partial<Record<ClusterId, boolean>>>({});
  const [bridgeMode, setBridgeMode] = useState(false);
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const [sidebarsLocked, setSidebarsLocked] = useState(false);
  const controls = useRef<GraphControls | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const notes = liveNotes ?? mockNotes;
  const edges = useMemo(() => liveEdges ?? deriveGraphEdges(notes), [liveEdges, notes]);
  const clusterListNotes = USE_MOCK_GRAPH_CLUSTERS ? mockNotes : notes;
  const selected = selectedId ? notes.find((note) => note.id === selectedId) ?? null : null;
  const hasGraphData = notes.length > 0;

  useEffect(() => {
    const session = readAuthSession();
    const hasRealLogin = !!session && session.accessToken !== "demo-access-token";

    if (USE_MOCK_GRAPH && !hasRealLogin) {
      setLiveNotes(null);
      setLiveEdges(null);
      return;
    }

    let active = true;
    setLiveNotes([]);
    setLiveEdges([]);
    getGraph()
      .then((graph) => {
        if (!active) return;
        setLiveNotes(graphToBrainXNotes(graph));
        setLiveEdges(graphEdgesForFlow(graph));
      })
      .catch((error) => {
        if (!active) return;
        setLiveNotes([]);
        setLiveEdges([]);
        const message = error instanceof Error ? error.message : "Could not load graph data.";
        pushToast(message, "err");
      });

    return () => {
      active = false;
    };
  }, [pushToast]);

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
          hiddenClusters={hiddenClusters}
          controls={controls}
          bridgeMode={bridgeMode}
          onSelect={(id) => {
            if (id !== null && bridgeMode) setBridgeMode(false);
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
            "pointer-events-auto transition-all duration-300 ease-out",
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
          <div className="glass w-52 rounded-2xl p-2.5 space-y-0.5 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11px] font-semibold text-txt2">
              <Icon name="cluster" size={13} />
              클러스터 (카테고리)
            </div>
            {["ml", "read", "proj", "work", "life"].map((clusterId) => {
              const cluster = clusterById(clusterId as ClusterId);
              const count = clusterListNotes.filter((note) => note.cluster === cluster.id).length;
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
        </div>

        <div
          className={cx(
            "pointer-events-auto flex flex-col items-end gap-3 transition-all duration-300 ease-out",
            !hasGraphData || sidebarsVisible ? "translate-x-0 opacity-100" : "translate-x-10 opacity-0"
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
                  "group relative grid h-9 w-9 place-items-center rounded-lg transition-all duration-300",
                  theme === 'universe' 
                    ? "text-cyan hover:text-white" 
                    : "text-txt3 hover:bg-txt/10 hover:text-txt"
                )}
              >
                <div className={theme === 'universe' ? "drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-300" : ""}>
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
            <button type="button" onClick={() => controls.current?.reheat()} className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="refresh" size={17} />
              <span className="pointer-events-none absolute top-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                재배치
                <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
              </span>
            </button>
          </div>

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

          <Btn
            variant={bridgeMode ? "primary" : "accent"}
            size="sm"
            icon="sparkle"
            onClick={() => {
              const next = !bridgeMode;
              setBridgeMode(next);
              controls.current?.bridges();
              if (next) {
                pushToast("징검다리 개념 연결선이 강조 표시됩니다 ✨", "ok");
              }
            }}
          >
            {bridgeMode ? "강조 해제" : "징검다리 개념 추천"}
          </Btn>
        </div>
      </div>

      {selected ? (
        <div className="fade-up absolute bottom-5 right-5 top-5 z-30 w-80">
          <div className="flex h-full flex-col overflow-hidden bg-surface/90 border border-line/50 rounded-2xl backdrop-blur-xl shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-line/50 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: `rgb(${clusterById(selected.cluster).color})`, color: `rgb(${clusterById(selected.cluster).color})` }} />
                <span className="truncate text-[12px] text-txt2">{clusterById(selected.cluster).label}</span>
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
              <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <Icon name="sparkle" size={13} />
                  AI 분석 요약
                </div>
                <p className="text-[13px] leading-relaxed text-txt2">{selected.summary}</p>
              </div>
              <div className="mb-2 text-[11px] font-semibold text-txt3">신경 시냅스 (연결된 노트) {selected.links.length}</div>
              <div className="mb-4 space-y-1.5">
                {selected.links.map((id) => {
                  const linked = noteById(notes, id);
                  if (!linked) return null;
                  return (
                    <button key={id} type="button" onClick={() => setSelectedId(id)} className="flex w-full items-center gap-2 rounded-lg p-2 hover:bg-txt/5 transition-colors">
                      <span className="h-2 w-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]" style={{ background: `rgb(${clusterById(linked.cluster).color})`, color: `rgb(${clusterById(linked.cluster).color})` }} />
                      <span className="flex-1 text-left truncate text-[12.5px] text-txt2">{linked.title}</span>
                      <Icon name="chevR" size={13} className="text-txt3" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 border-t border-line/50 p-4">
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
