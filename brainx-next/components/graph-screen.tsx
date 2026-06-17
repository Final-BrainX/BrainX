"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { deriveGraphEdges, noteById, clusterById, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";
import { ReactFlow, ReactFlowProvider, useNodesState, useEdgesState, useReactFlow } from "@xyflow/react";
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
  reheat: () => void;
  bridges: () => void;
};

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
  onSelect: (id: string | null) => void;
}) {
  const { setCenter, fitView, zoomTo } = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  
  const positionsRef = useRef<Record<string, GraphNode>>(settleLayout(notes));
  const raf = useRef(0);

  // Setup GraphControls ref
  useEffect(() => {
    if (controls) {
      controls.current = {
        zoom: (factor) => {
          zoomTo(factor); // react flow zooming
        },
        fit: () => {
          fitView({ duration: 800 });
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
      const xSpacing = 160;
      const ySpacing = 80;
      layers.forEach((layer, depth) => {
        const x = depth * xSpacing;
        const totalHeight = (layer.length - 1) * ySpacing;
        let startY = -totalHeight / 2;
        layer.forEach((id) => {
          const p = positionsRef.current[id];
          if (p) {
            p.tx = x - (layers.length * xSpacing) / 2;
            p.ty = startY;
          }
          startY += ySpacing;
        });
      });
    } else if (layoutMode === 'radial') {
      const radiusStep = 140;
      layers.forEach((layer, depth) => {
        if (depth === 0) {
          layer.forEach(id => {
            const p = positionsRef.current[id];
            if (p) {
              p.tx = 0;
              p.ty = 0;
            }
          });
        } else {
          const r = depth * radiusStep;
          const angleStep = (Math.PI * 2) / layer.length;
          layer.forEach((id, idx) => {
            const p = positionsRef.current[id];
            if (p) {
              p.tx = Math.cos(angleStep * idx) * r;
              p.ty = Math.sin(angleStep * idx) * r;
            }
          });
        }
      });
    }
  }, [layoutMode, notes, edges]);

  // Physics loop
  useEffect(() => {
    const step = () => {
      const pos = positionsRef.current;
      const isStructured = notes.some(n => pos[n.id]?.tx !== null);

      if (!isStructured) {
        for (let i = 0; i < notes.length; i += 1) {
          for (let j = i + 1; j < notes.length; j += 1) {
            const a = pos[notes[i].id];
            const b = pos[notes[j].id];
            if (!a || !b) continue;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
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

      if (moved) {
        setRfNodes((nds) => 
          nds.map((n) => {
            const p = pos[n.id];
            if (p) {
              return { ...n, position: { x: p.x, y: p.y } };
            }
            return n;
          })
        );
      }

      raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [notes, edges, clusterOn, setRfNodes]);

  // Sync data
  useEffect(() => {
    const direct = new Set<string>();
    if (selectedId) {
      edges.forEach((e) => {
        if (e.source === selectedId) direct.add(e.target);
        if (e.target === selectedId) direct.add(e.source);
      });
    }

    const newNodes = notes.map(note => {
      const cluster = clusterById(note.cluster);
      const linkCount = note.links.length;
      const baseRadius = 7 + Math.min(8, linkCount * 1.5);
      const selected = selectedId === note.id;
      const isDirect = selectedId ? direct.has(note.id) : false;
      const radius = selected ? baseRadius + 8 : (isDirect ? baseRadius + 3 : baseRadius);
      const dimmed = timeFilter !== "전체" && (ageRank[note.updated] ?? 0) > (timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99);
      const hidden = hiddenClusters[note.cluster] ? true : false;
      
      let layer: 'front' | 'middle' | 'back' = 'middle';
      if (selectedId) {
        if (selected) layer = 'front';
        else if (isDirect) layer = 'middle';
        else layer = 'back';
      } else {
        if (baseRadius > 10) layer = 'front';
      }

      return {
        id: note.id,
        type: 'planet',
        position: { x: positionsRef.current[note.id]?.x ?? 0, y: positionsRef.current[note.id]?.y ?? 0 },
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
        draggable: true
      };
    });
    
    const newEdges = edges.map(edge => {
      const isSelected = selectedId && (edge.source === selectedId || edge.target === selectedId);
      const isDimmed = selectedId && !isSelected;
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: 'orbit',
        data: {
          isBridge: edge.bridge,
          isSelected,
          isDimmed,
          theme
        }
      };
    });
    
    setRfNodes(newNodes);
    setRfEdges(newEdges);
  }, [notes, edges, selectedId, timeFilter, hiddenClusters, setRfNodes, setRfEdges, theme]);

  const [hovered, setHovered] = useState<BrainXNote | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

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
        onNodeClick={(_, node) => onSelect(selectedId === node.id ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        onNodeMouseEnter={(e, node) => {
          const note = notes.find(n => n.id === node.id);
          if (note) {
            setHovered(note);
          }
        }}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeDragStart={(_, node) => {
          const p = positionsRef.current[node.id];
          if (p) {
            p.fx = p.x;
            p.fy = p.y;
          }
        }}
        onNodeDrag={(_, node) => {
          const p = positionsRef.current[node.id];
          if (p) {
            p.fx = node.position.x;
            p.fy = node.position.y;
            p.x = node.position.x;
            p.y = node.position.y;
          }
        }}
        onNodeDragStop={(_, node) => {
          const p = positionsRef.current[node.id];
          if (p) {
            p.fx = null;
            p.fy = null;
          }
        }}
        fitView
        minZoom={0.2}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      />
      
      {/* AI Summary Tooltip */}
      {hovered && !selectedId && <TooltipOverlay hovered={hovered} theme={theme} />}
    </>
  );
}

function TooltipOverlay({ hovered, theme }: { hovered: BrainXNote | null; theme: string }) {
  const { getNode, flowToScreenPosition } = useReactFlow();
  if (!hovered) return null;
  const node = getNode(hovered.id);
  if (!node) return null;
  
  const radius = (node.data?.radius as number) || 10;
  
  // node.position is top-left, we want top-center
  const pos = flowToScreenPosition({ 
    x: node.position.x + radius, 
    y: node.position.y 
  });

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-40 w-full h-full overflow-hidden">
      <div 
        className="fade-up absolute border backdrop-blur-md w-64 rounded-xl p-3 shadow-2xl bg-surface/80 border-line/30"
        style={{
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, calc(-100% - 16px))'
        }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${clusterById(hovered.cluster).color})` }} />
          <span className="text-[13px] text-txt2">
            {clusterById(hovered.cluster).label} · AI 요약
          </span>
        </div>
        <div className="mb-1 text-[15px] font-semibold leading-snug text-txt">{hovered.title}</div>
        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-txt3">{hovered.summary}</p>
      </div>
    </div>
  );
}

function GraphScreenInner() {
  const router = useRouter();
  const { notes, pushToast } = useBrainX();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'2d' | 'universe'>('2d');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [clusterOn, setClusterOn] = useState(false);
  const [timeFilter, setTimeFilter] = useState("전체");
  const [hiddenClusters, setHiddenClusters] = useState<Partial<Record<ClusterId, boolean>>>({});
  const controls = useRef<GraphControls | null>(null);
  const edges = useMemo(() => deriveGraphEdges(notes), [notes]);
  const selected = selectedId ? notes.find((note) => note.id === selectedId) ?? null : null;

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
          onSelect={(id) => setSelectedId(id)}
        />
      </ReactFlowProvider>

      <div className="pointer-events-none absolute left-5 right-5 top-5 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto">
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
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-3">
          <div className="glass flex items-center gap-0.5 rounded-xl p-1.5 backdrop-blur-md shadow-sm">
            <button type="button" onClick={() => controls.current?.zoom(1.2)} title="확대" className="grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="zoomin" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.zoom(0.83)} title="축소" className="grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="zoomout" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.fit()} title="전체 보기" className="grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="fit" size={17} />
            </button>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <div className="flex rounded-lg p-0.5 bg-surface2/50">
              <button type="button" onClick={() => setLayoutMode('force')} className={cx("px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors", layoutMode === 'force' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>네트워크</button>
              <button type="button" onClick={() => setLayoutMode('tree')} className={cx("px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors", layoutMode === 'tree' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>가로 트리</button>
              <button type="button" onClick={() => setLayoutMode('radial')} className={cx("px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors", layoutMode === 'radial' ? "bg-txt/15 text-txt shadow-sm" : "text-txt3 hover:text-txt")}>방사형</button>
            </div>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <button
                type="button"
                onClick={() => setTheme(t => t === 'universe' ? '2d' : 'universe')}
                title={theme === 'universe' ? '우주 모드 끄기' : '우주 모드 켜기'}
                className={cx(
                  "grid h-9 w-9 place-items-center rounded-lg transition-all duration-300 relative",
                  theme === 'universe' 
                    ? "text-cyan drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] hover:text-white hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" 
                    : "text-txt3 hover:bg-txt/10 hover:text-txt"
                )}
              >
                <UniverseIcon size={19} />
              </button>
            <div className="mx-1 h-6 w-px bg-line/40" />
            <button type="button" onClick={() => setClusterOn((current) => !current)} title="클러스터링" className={cx("grid h-9 w-9 place-items-center rounded-lg transition-colors", clusterOn ? "bg-primary text-white" : "text-txt3 hover:bg-txt/10 hover:text-txt")}>
              <Icon name="cluster" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.reheat()} title="재배치" className="grid h-9 w-9 place-items-center rounded-lg transition-colors text-txt3 hover:bg-txt/10 hover:text-txt">
              <Icon name="refresh" size={17} />
            </button>
          </div>

          <div className="glass flex items-center gap-0.5 rounded-xl p-1 backdrop-blur-md shadow-sm">
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

          <Btn variant="accent" size="sm" icon="sparkle" onClick={() => {
            controls.current?.bridges();
            pushToast("징검다리 개념 3개를 발견했어요 ✨", "ok");
          }}>
            징검다리 개념 추천
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
