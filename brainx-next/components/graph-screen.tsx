"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import { deriveGraphEdges, noteById, clusterById, type BrainXNote, type ClusterId } from "@/lib/brainx-data";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon } from "@/components/brainx-ui";
import { cx } from "@/lib/utils";

type GraphNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

type GraphControls = {
  zoom: (factor: number) => void;
  fit: () => void;
  reheat: () => void;
  bridges: () => void;
};

function settleLayout(notes: BrainXNote[], iterations = 260) {
  const positions: Record<string, GraphNode> = {};
  const clusterOrder: ClusterId[] = ["ml", "read", "proj", "work", "life"];
  const clusterIndex = Object.fromEntries(clusterOrder.map((cluster, index) => [cluster, index])) as Record<ClusterId, number>;

  notes.forEach((note) => {
    const index = clusterIndex[note.cluster];
    const angle = (index / clusterOrder.length) * Math.PI * 2;
    const radius = 190;
    positions[note.id] = {
      x: Math.cos(angle) * radius + (Math.random() - 0.5) * 90,
      y: Math.sin(angle) * radius + (Math.random() - 0.5) * 90,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null
    };
  });

  return positions;
}

function GraphCanvas({
  notes,
  edges,
  selectedId,
  clusterOn,
  timeFilter,
  hiddenClusters,
  controls,
  onSelect
}: {
  notes: BrainXNote[];
  edges: Array<{ source: string; target: string; bridge?: boolean }>;
  selectedId: string | null;
  clusterOn: boolean;
  timeFilter: string;
  hiddenClusters: Partial<Record<ClusterId, boolean>>;
  controls: MutableRefObject<GraphControls | null>;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [hovered, setHovered] = useState<BrainXNote | null>(null);
  const positionsRef = useRef<Record<string, GraphNode>>(settleLayout(notes));
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dragBgRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const dragNodeRef = useRef<string | null>(null);
  const nodeEls = useRef<Record<string, SVGGElement | null>>({});
  const edgeEls = useRef<Array<{ el: SVGLineElement; edge: (typeof edges)[number] }>>([]);
  const raf = useRef(0);

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

  useEffect(() => {
    positionsRef.current = settleLayout(notes);
  }, [notes]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const step = () => {
      const pos = positionsRef.current;

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

      notes.forEach((note) => {
        const point = pos[note.id];
        if (!point) return;
        point.vx += -point.x * 0.0016;
        point.vy += -point.y * 0.0016;
        if (clusterOn) {
          const centroid = clusterCentroids.get(note.cluster);
          if (centroid) {
            point.vx += (centroid.x - point.x) * 0.02;
            point.vy += (centroid.y - point.y) * 0.02;
          }
        }
        if (point.fx !== null && point.fy !== null) {
          point.x = point.fx;
          point.y = point.fy;
          point.vx = 0;
          point.vy = 0;
        } else {
          point.vx *= 0.86;
          point.vy *= 0.86;
          point.x += point.vx;
          point.y += point.vy;
        }
      });

      const { x, y, k } = viewRef.current;
      if (groupRef.current) {
        groupRef.current.setAttribute("transform", `translate(${size.width / 2 + x},${size.height / 2 + y}) scale(${k})`);
      }

      edgeEls.current.forEach(({ el, edge }) => {
        const a = pos[edge.source];
        const b = pos[edge.target];
        if (!a || !b) return;
        el.setAttribute("x1", String(a.x));
        el.setAttribute("y1", String(a.y));
        el.setAttribute("x2", String(b.x));
        el.setAttribute("y2", String(b.y));
      });

      notes.forEach((note) => {
        const element = nodeEls.current[note.id];
        const point = pos[note.id];
        if (!element || !point) return;
        element.setAttribute("transform", `translate(${point.x},${point.y})`);
      });

      if (hovered && tipRef.current) {
        const point = pos[hovered.id];
        if (point) {
          const screenX = size.width / 2 + viewRef.current.x + point.x * viewRef.current.k;
          const screenY = size.height / 2 + viewRef.current.y + point.y * viewRef.current.k;
          tipRef.current.style.transform = `translate(${screenX}px,${screenY}px)`;
        }
      }

      raf.current = window.requestAnimationFrame(step);
    };

    raf.current = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf.current);
  }, [clusterOn, edges, hovered, notes, size.height, size.width]);

  useEffect(() => {
    controls.current = {
      zoom: (factor) => {
        const view = viewRef.current;
        view.k = Math.max(0.35, Math.min(2.4, view.k * factor));
      },
      fit: () => {
        viewRef.current = { x: 0, y: 0, k: 1 };
      },
      reheat: () => {
        Object.values(positionsRef.current).forEach((point) => {
          point.vx += (Math.random() - 0.5) * 40;
          point.vy += (Math.random() - 0.5) * 40;
        });
      },
      bridges: () => {
        edges.forEach((edge) => {
          if (edge.bridge) {
            const entry = edgeEls.current.find((item) => item.edge === edge);
            if (!entry) return;
            entry.el.classList.add("bridge-on");
            window.setTimeout(() => entry.el.classList.remove("bridge-on"), 2600);
          }
        });
      }
    };
  }, [controls, edges]);

  const toGraph = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: (clientX - rect.left - rect.width / 2 - view.x) / view.k,
      y: (clientY - rect.top - rect.height / 2 - view.y) / view.k
    };
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 select-none overflow-hidden"
      onPointerMove={(event) => {
        const draggingNode = dragNodeRef.current;
        const draggingBackground = dragBgRef.current;
        if (draggingNode) {
          const point = positionsRef.current[draggingNode];
          if (point) {
            const coords = toGraph(event.clientX, event.clientY);
            point.fx = coords.x;
            point.fy = coords.y;
          }
        } else if (draggingBackground) {
          viewRef.current.x = draggingBackground.vx + (event.clientX - draggingBackground.x);
          viewRef.current.y = draggingBackground.vy + (event.clientY - draggingBackground.y);
        }
      }}
      onPointerUp={() => {
        if (dragNodeRef.current) {
          const point = positionsRef.current[dragNodeRef.current];
          if (point) {
            point.fx = null;
            point.fy = null;
          }
          dragNodeRef.current = null;
        }
        dragBgRef.current = null;
      }}
      onPointerLeave={() => {
        if (dragNodeRef.current) {
          const point = positionsRef.current[dragNodeRef.current];
          if (point) {
            point.fx = null;
            point.fy = null;
          }
          dragNodeRef.current = null;
        }
        dragBgRef.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-50" />
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={(event) => {
          event.preventDefault();
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const view = viewRef.current;
          const mouseX = event.clientX - rect.left - rect.width / 2;
          const mouseY = event.clientY - rect.top - rect.height / 2;
          const graphX = (mouseX - view.x) / view.k;
          const graphY = (mouseY - view.y) / view.k;
          const nextK = Math.max(0.35, Math.min(2.4, view.k * (event.deltaY < 0 ? 1.12 : 0.89)));
          view.x = mouseX - graphX * nextK;
          view.y = mouseY - graphY * nextK;
          view.k = nextK;
        }}
        onPointerDown={(event) => {
          const target = (event.target as HTMLElement | null)?.closest?.("[data-node]");
          if (target) return;
          dragBgRef.current = {
            x: event.clientX,
            y: event.clientY,
            vx: viewRef.current.x,
            vy: viewRef.current.y
          };
        }}
      >
        <defs>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={groupRef} transform={`translate(${size.width / 2},${size.height / 2}) scale(1)`}>
          <g>
            {edges.map((edge) => {
              const a = positionsRef.current[edge.source];
              const b = positionsRef.current[edge.target];
              if (!a || !b) return null;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  ref={(element) => {
                    if (element) {
                      const existing = edgeEls.current.find((entry) => entry.edge.source === edge.source && entry.edge.target === edge.target);
                      if (existing) existing.el = element;
                      else edgeEls.current.push({ el: element, edge });
                    }
                  }}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edge.bridge ? "rgb(34 211 238 / 0.35)" : "rgb(148 163 184 / 0.2)"}
                  strokeWidth={edge.bridge ? 1.6 : 1}
                  strokeDasharray={edge.bridge ? "5 5" : "none"}
                  className="bridge"
                />
              );
            })}
          </g>
          <g>
            {notes.map((note) => {
              const cluster = clusterById(note.cluster);
              const radius = 10 + Math.min(14, note.words / 180);
              const hidden = hiddenClusters[note.cluster] ? 0.18 : 1;
              const dimmed = timeFilter !== "전체" && (ageRank[note.updated] ?? 0) > (timeFilter === "최근 1일" ? 1 : timeFilter === "최근 1주" ? 7 : 99);
              const selected = selectedId === note.id;

              return (
                <g
                  key={note.id}
                  data-node
                  ref={(element) => {
                    nodeEls.current[note.id] = element;
                  }}
                  transform={`translate(${positionsRef.current[note.id]?.x ?? 0},${positionsRef.current[note.id]?.y ?? 0})`}
                  className="cursor-pointer"
                  style={{ opacity: hidden * (dimmed ? 0.18 : 1), transition: "opacity 0.3s" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dragNodeRef.current = note.id;
                  }}
                  onClick={() => onSelect(note.id)}
                  onPointerEnter={() => setHovered(note)}
                  onPointerLeave={() => setHovered(null)}
                >
                  <circle r={radius * 2.2} fill={`rgb(${cluster.color} / 0.10)`} />
                  {selected ? <circle r={radius + 7} fill="none" stroke={`rgb(${cluster.color})`} strokeWidth="1.5" strokeDasharray="3 3" className="bx-spin" /> : null}
                  <circle
                    r={radius}
                    fill={`rgb(${cluster.color})`}
                    stroke="rgb(255 255 255 / 0.55)"
                    strokeWidth={selected ? 2 : 1}
                    style={{ filter: selected ? `drop-shadow(0 0 10px rgb(${cluster.color}))` : "none" }}
                  />
                  <text
                    textAnchor="middle"
                    y={radius + 15}
                    fontSize="11"
                    fill="rgb(var(--txt2))"
                    className="pointer-events-none font-medium"
                    style={{ paintOrder: "stroke", stroke: "rgb(var(--bg))", strokeWidth: 3 }}
                  >
                    {note.title.length > 12 ? `${note.title.slice(0, 11)}…` : note.title}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div ref={tipRef} className="pointer-events-none absolute left-0 top-0 z-30" style={{ willChange: "transform" }}>
        {hovered ? (
          <div className="fade-up glass -translate-x-1/2 -translate-y-[calc(100%+22px)] w-60 rounded-xl p-3 shadow-soft">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${clusterById(hovered.cluster).color})` }} />
              <span className="text-[11px] text-txt3">
                {clusterById(hovered.cluster).label} · AI 요약
              </span>
            </div>
            <div className="mb-1 text-[13px] font-semibold leading-snug text-txt">{hovered.title}</div>
            <p className="line-clamp-3 text-[11.5px] leading-relaxed text-txt2">{hovered.summary}</p>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .bx-spin {
          animation: bxspin 8s linear infinite;
          transform-origin: center;
        }
        @keyframes bxspin {
          to {
            transform: rotate(360deg);
          }
        }
        .bridge.bridge-on {
          stroke: rgb(34 211 238) !important;
          stroke-width: 2.4 !important;
          animation: dash 1s linear infinite;
          filter: drop-shadow(0 0 6px rgb(34 211 238));
        }
        @keyframes dash {
          to {
            stroke-dashoffset: -20;
          }
        }
      `}</style>
    </div>
  );
}

export function GraphScreen() {
  const router = useRouter();
  const { notes, pushToast } = useBrainX();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clusterOn, setClusterOn] = useState(false);
  const [timeFilter, setTimeFilter] = useState("전체");
  const [hiddenClusters, setHiddenClusters] = useState<Partial<Record<ClusterId, boolean>>>({});
  const controls = useRef<GraphControls | null>(null);
  const edges = useMemo(() => deriveGraphEdges(notes), [notes]);
  const selected = selectedId ? notes.find((note) => note.id === selectedId) ?? null : null;

  return (
    <div data-route className="relative h-full">
      <GraphCanvas
        notes={notes}
        edges={edges}
        selectedId={selectedId}
        clusterOn={clusterOn}
        timeFilter={timeFilter}
        hiddenClusters={hiddenClusters}
        controls={controls}
        onSelect={(id) => setSelectedId(id)}
      />

      <div className="pointer-events-none absolute left-5 right-5 top-5 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto">
          <div className="glass mb-3 max-w-xs rounded-2xl px-4 py-3">
            <h1 className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
              <Icon name="graph" size={18} className="text-primary" />
              지식 마인드맵
            </h1>
            <p className="mt-1 text-[12px] text-txt2">13개 노트 · 19개 연결 · 5개 클러스터. 노드를 끌어 옮기고, 스크롤로 확대해 보세요.</p>
          </div>
          <div className="glass w-52 rounded-2xl p-2.5 space-y-0.5">
            <div className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[11px] font-semibold text-txt3">
              <Icon name="cluster" size={13} />
              AI 클러스터
            </div>
            {["ml", "read", "proj", "work", "life"].map((clusterId) => {
              const cluster = clusterById(clusterId);
              const count = notes.filter((note) => note.cluster === cluster.id).length;
              const hidden = hiddenClusters[cluster.id];
              return (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => setHiddenClusters((current) => ({ ...current, [cluster.id]: !current[cluster.id] }))}
                  className="flex h-8 w-full items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-surface2/50"
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
          <div className="glass flex items-center gap-0.5 rounded-xl p-1.5">
            <button type="button" onClick={() => controls.current?.zoom(1.2)} title="확대" className="grid h-9 w-9 place-items-center rounded-lg text-txt2 hover:bg-surface2/60 hover:text-txt">
              <Icon name="zoomin" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.zoom(0.83)} title="축소" className="grid h-9 w-9 place-items-center rounded-lg text-txt2 hover:bg-surface2/60 hover:text-txt">
              <Icon name="zoomout" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.fit()} title="전체 보기" className="grid h-9 w-9 place-items-center rounded-lg text-txt2 hover:bg-surface2/60 hover:text-txt">
              <Icon name="fit" size={17} />
            </button>
            <div className="mx-1 h-6 w-px bg-line/60" />
            <button type="button" onClick={() => setClusterOn((current) => !current)} title="클러스터링" className={cx("grid h-9 w-9 place-items-center rounded-lg", clusterOn ? "bg-primary text-white" : "text-txt2 hover:bg-surface2/60 hover:text-txt")}>
              <Icon name="cluster" size={17} />
            </button>
            <button type="button" onClick={() => controls.current?.reheat()} title="재배치" className="grid h-9 w-9 place-items-center rounded-lg text-txt2 hover:bg-surface2/60 hover:text-txt">
              <Icon name="refresh" size={17} />
            </button>
          </div>

          <div className="glass flex items-center gap-0.5 rounded-xl p-1">
            {["전체", "최근 1일", "최근 1주"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeFilter(item)}
                className={cx("h-8 rounded-lg px-3 text-[12px] font-medium", timeFilter === item ? "bg-surface2 text-txt" : "text-txt2 hover:text-txt")}
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
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-2 border-b border-line/50 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `rgb(${clusterById(selected.cluster).color})` }} />
                <span className="truncate text-[12px] text-txt3">{clusterById(selected.cluster).label}</span>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="text-txt3 hover:text-txt">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="scroll flex-1 overflow-y-auto p-4">
              <h2 className="mb-2 text-[18px] font-bold leading-snug text-txt">{selected.title}</h2>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {selected.tags.map((tag) => (
                  <Badge key={tag} className="!h-5 !text-[10.5px]">
                    #{tag}
                  </Badge>
                ))}
              </div>
              <div className="mb-4 rounded-xl border border-accent/20 bg-accent/[0.08] p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                  <Icon name="sparkle" size={13} />
                  AI 3줄 요약
                </div>
                <p className="text-[13px] leading-relaxed text-txt2">{selected.summary}</p>
              </div>
              <div className="mb-2 text-[11px] font-semibold text-txt3">연결된 노트 {selected.links.length}</div>
              <div className="mb-4 space-y-1.5">
                {selected.links.map((id) => {
                  const linked = noteById(notes, id);
                  if (!linked) return null;
                  return (
                    <button key={id} type="button" onClick={() => setSelectedId(id)} className="flex w-full items-center gap-2 rounded-lg p-2 hover:bg-surface2/50">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: `rgb(${clusterById(linked.cluster).color})` }} />
                      <span className="flex-1 truncate text-[12.5px] text-txt2">{linked.title}</span>
                      <Icon name="chevR" size={13} className="text-txt3" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 border-t border-line/50 p-4">
              <Btn variant="primary" size="sm" icon="doc" className="flex-1" onClick={() => router.push(`/notes/${selected.id}`)}>
                노트 열기
              </Btn>
              <Btn variant="soft" size="sm" icon="chat" onClick={() => router.push("/chat")}>
                AI에게
              </Btn>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
