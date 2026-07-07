"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, type Variants, type Transition } from "framer-motion";
import { Crown } from "lucide-react";

import { useRouter } from "next/navigation";

import { CLUSTERS, PRICING } from "@/lib/brainx-data";
import { clearAuthSession, logout, readAuthSession, type AuthSession } from "@/lib/auth-api";

import { cx } from "@/lib/utils";

import { Badge, Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";
import { BrandLogo } from "@/components/brand-logo";


/** 페이지 배경에 흑릿하게 마인드맵 노드들이 외곽에서 천체치럼 떠다니는 배경 */
function BackgroundMindmap() {
  const ref = useRef<SVGSVGElement | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const W = 1600;
    const H = 4000; // 전체 스크롤 높이를 커버
    const colors = ["59 130 246", "139 92 246", "34 211 238", "52 211 153", "244 114 182"];

    const N = 80;
    const nodes = Array.from({ length: N }, (_, i) => {
      const side = i % 4;
      let x: number, y: number;
      if (side === 0) {
        // 왼쪽 띠
        x = Math.random() * W * 0.14;
        y = Math.random() * H;
      } else if (side === 1) {
        // 오른쪽 띠
        x = W - Math.random() * W * 0.14;
        y = Math.random() * H;
      } else if (side === 2) {
        // 상단
        x = Math.random() * W;
        y = Math.random() * H * 0.06;
      } else {
        // 하단
        x = Math.random() * W;
        y = H - Math.random() * H * 0.06;
      }
      return {
        x, y,
        vx: (Math.random() - 0.5) * 0.01,
        vy: (Math.random() - 0.5) * 0.01,
        r: 1.0 + Math.random() * 4,
        c: colors[i % colors.length],
        phase: Math.random() * Math.PI * 2
      };
    });

    const edges: Array<[number, number]> = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 가까운 노드끼리만 연결 (전체 화면 너비의 25% 이내)
        if (dist < W * 0.25 && Math.random() < 0.18) edges.push([i, j]);
      }
    }

    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const edgeGroup = document.createElementNS(ns, "g");
    const nodeGroup = document.createElementNS(ns, "g");
    svg.append(edgeGroup, nodeGroup);

    const edgeEls = edges.map(() => {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("stroke", "rgb(148 163 184 / 0.2)");
      line.setAttribute("stroke-width", "0.1");
      edgeGroup.appendChild(line);
      return line;
    });

    const nodeEls = nodes.map((node) => {
      const g = document.createElementNS(ns, "g");
      const halo = document.createElementNS(ns, "circle");
      halo.setAttribute("r", String(node.r * 1.8));
      halo.setAttribute("fill", `rgb(${node.c} / 0.2`);
      const core = document.createElementNS(ns, "circle");
      core.setAttribute("r", String(node.r));
      core.setAttribute("fill", `rgb(${node.c} / 0.5)`);
      g.append(halo, core);
      nodeGroup.appendChild(g);
      return g;
    });

    let t = 0;
    const tick = () => {
      t += 0.008;
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > W) node.vx *= -1;
        if (node.y < 0 || node.y > H) node.vy *= -1;
      });
      nodeEls.forEach((g, i) => {
        const n = nodes[i];
        g.setAttribute("transform", `translate(${n.x},${n.y + Math.sin(t + n.phase) * 3})`);
      });
      edges.forEach(([s, tgt], i) => {
        edgeEls[i].setAttribute("x1", String(nodes[s].x));
        edgeEls[i].setAttribute("y1", String(nodes[s].y));
        edgeEls[i].setAttribute("x2", String(nodes[tgt].x));
        edgeEls[i].setAttribute("y2", String(nodes[tgt].y));
      });
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1600 4000"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMin slice"
      style={{ filter: "blur(1.5px)", opacity: 0.85, zIndex: 0 }}
    />
  );
}

export function HeroConstellation() {
  const ref = useRef<SVGSVGElement | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const W = 560;
    const H = 460;
    const colors = ["59 130 246", "139 92 246", "34 211 238", "52 211 153"];
    const N = 22;
    const nodes = Array.from({ length: N }, (_, index) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 3 + Math.random() * 6,
      c: colors[index % colors.length],
      hub: index < 4
    }));

    nodes.forEach((node) => {
      if (node.hub) node.r = 9 + Math.random() * 4;
    });

    const edges: Array<[number, number]> = [];
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        if (Math.random() < 0.1 || (nodes[i].hub && Math.random() < 0.3)) {
          edges.push([i, j]);
        }
      }
    }

    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const edgeGroup = document.createElementNS(ns, "g");
    const nodeGroup = document.createElementNS(ns, "g");
    svg.append(edgeGroup, nodeGroup);

    const edgeEls = edges.map(() => {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("stroke", "rgb(148 163 184 / 0.16)");
      line.setAttribute("stroke-width", "1");
      edgeGroup.appendChild(line);
      return line;
    });

    const nodeEls = nodes.map((node) => {
      const group = document.createElementNS(ns, "g");
      const halo = document.createElementNS(ns, "circle");
      halo.setAttribute("r", String(node.r * 2.4));
      halo.setAttribute("fill", `rgb(${node.c} / 0.10)`);
      const core = document.createElementNS(ns, "circle");
      core.setAttribute("r", String(node.r));
      core.setAttribute("fill", `rgb(${node.c})`);
      core.setAttribute("opacity", node.hub ? "1" : "0.85");
      if (node.hub) {
        core.setAttribute("stroke", "rgb(255 255 255 / 0.5)");
        core.setAttribute("stroke-width", "1.2");
      }
      group.append(halo, core);
      nodeGroup.appendChild(group);
      return group;
    });

    let t = 0;
    const tick = () => {
      t += 0.016;
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 20 || node.x > W - 20) node.vx *= -1;
        if (node.y < 20 || node.y > H - 20) node.vy *= -1;
      });
      nodeEls.forEach((group, index) => {
        group.setAttribute("transform", `translate(${nodes[index].x},${nodes[index].y + Math.sin(t + index) * 1.5})`);
      });
      edges.forEach(([source, target], index) => {
        const line = edgeEls[index];
        line.setAttribute("x1", String(nodes[source].x));
        line.setAttribute("y1", String(nodes[source].y));
        line.setAttribute("x2", String(nodes[target].x));
        line.setAttribute("y2", String(nodes[target].y));
      });
      raf.current = window.requestAnimationFrame(tick);
    };

    tick();
    return () => window.cancelAnimationFrame(raf.current);
  }, []);

  return <svg ref={ref} viewBox="0 0 560 460" className="h-full w-full" preserveAspectRatio="xMidYMid slice" />;
}

function FeatureCard({
  icon,
  color,
  title,
  desc
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <Card hover className="p-6 h-full flex flex-col">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `rgb(${color} / 0.14)`, color: `rgb(${color})` }}>
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mb-2 text-[19px] font-semibold text-txt">{title}</h3>
      <p className="text-[16px] leading-relaxed text-txt2">{desc}</p>
    </Card>
  );
}

/** 문자열을 받아 한글 초성/중성/종성 단위의 타이핑 프레임 배열을 생성합니다 */
function getTypingFrames(text: string) {
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const frames: string[] = [""];
  let currentText = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // 한글 음절인 경우 (가 ~ 힣)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      const cho = Math.floor(index / 588);
      const jung = Math.floor((index - cho * 588) / 28);
      const jong = index % 28;

      // 1. 초성
      frames.push(currentText + CHO[cho]);
      // 2. 초성 + 중성
      frames.push(currentText + String.fromCharCode(0xac00 + cho * 588 + jung * 28));
      // 3. 초성 + 중성 + 종성 (있는 경우에만)
      if (jong > 0) {
        frames.push(currentText + char);
      }
      currentText += char;
    } else {
      // 영문, 띄어쓰기, 기호 등
      currentText += char;
      frames.push(currentText);
    }
  }
  return frames;
}

/** 스크롤 시 화면에 등장할 때 한 번만 타이핑되는 훅 */
function useSingleTyping(text: string, start: boolean, typingSpeed = 15) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = useMemo(() => getTypingFrames(text), [text]);

  useEffect(() => {
    if (!start) return;
    if (frameIndex < frames.length - 1) {
      const timer = setTimeout(() => setFrameIndex((f) => f + 1), typingSpeed);
      return () => clearTimeout(timer);
    }
  }, [frameIndex, frames, typingSpeed, start]);

  const displayed = frames[frameIndex] || "";
  return { displayed, isDone: frameIndex === frames.length - 1 };
}


const itemTransition: Transition = {
  duration: 0.6,
  ease: [0.22, 1, 0.36, 1],
};

const sectionVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.22, delayChildren: 0.5 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: itemTransition }
};

const singleItemVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { ...itemTransition, delay: 0.2 } }
};


/** 슬로건 배열을 순환하며 자모 단위 타이핑 → 완료 5초 대기 → 삭제 → 반복하는 훅 */
function useTypingLoop(slogans: string[], typingSpeed = 30, initialDeleteSpeed = 40, pauseMs = 5000) {
  const [sloganIndex, setSloganIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "deleting">("typing");

  const frames = useMemo(() => getTypingFrames(slogans[sloganIndex]), [sloganIndex, slogans]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (frameIndex < frames.length - 1) {
        timer = setTimeout(() => setFrameIndex((f) => f + 1), typingSpeed);
      } else {
        timer = setTimeout(() => setPhase("pause"), pauseMs);
      }
    } else if (phase === "pause") {
      setPhase("deleting");
    } else {
      if (frameIndex > 0) {
        // 지울 때 처음엔 느리다가 갈수록(progress가 0에 가까워질수록) 속도가 매우 빨라짐 (최소 2ms)
        const progress = frameIndex / frames.length; // 1(시작) -> 0(끝)
        const currentDeleteSpeed = Math.max(2, initialDeleteSpeed * Math.pow(progress, 3));
        timer = setTimeout(() => setFrameIndex((f) => f - 1), currentDeleteSpeed);
      } else {
        setSloganIndex((prev) => (prev + 1) % slogans.length);
        setPhase("typing");
      }
    }

    return () => clearTimeout(timer);
  }, [frameIndex, phase, frames, typingSpeed, initialDeleteSpeed, pauseMs, slogans.length]);

  const displayed = frames[frameIndex] || "";
  return { displayed, isDone: phase === "pause", sloganIndex };
}
/** 노트 아이콘 SVG – 실제 BrainX 노트 페이지 아이콘 */
function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect x="3" y="2" width="14" height="16" rx="2" fill="#EEEDFE" stroke="#9B8FEE" strokeWidth="1.2" />
      <line x1="6" y1="7" x2="14" y2="7" stroke="#9B8FEE" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="6" y1="10" x2="14" y2="10" stroke="#C4BFF5" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="6" y1="13" x2="10.5" y2="13" stroke="#C4BFF5" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const AI_DEMO_NOTES = [
  { title: "RAG 파이프라인 구현 방법 정리", chips: [{ label: "AI", cls: "tc-purple" }, { label: "개발", cls: "tc-blue" }] },
  { title: "벡터 데이터베이스 비교 분석",   chips: [{ label: "DB",  cls: "tc-teal"  }, { label: "AI",  cls: "tc-purple" }] },
  { title: "프로젝트 회의록 2026-07-03",     chips: [{ label: "회의", cls: "tc-coral" }] },
  { title: "임베딩 모델 선택 기준",          chips: [{ label: "AI",  cls: "tc-purple" }, { label: "리서치", cls: "tc-blue" }] },
];

function AiDemo({ active }: { active: boolean }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisibleCount(0);
      setShowLabel(false);
      return;
    }
    const timers: NodeJS.Timeout[] = [];
    AI_DEMO_NOTES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), 100 + i * 300));
    });
    timers.push(setTimeout(() => setShowLabel(true), 100 + (AI_DEMO_NOTES.length - 1) * 300 + 150));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return (
    <div className="ai-demo">
      {AI_DEMO_NOTES.map((note, i) => (
        <div
          key={note.title}
          className="ai-note-row"
          style={{
            opacity: visibleCount > i ? 1 : 0,
            transform: visibleCount > i ? 'translateX(0)' : 'translateX(28px)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
          }}
        >
          <NoteIcon size={16} />
          <span className="note-txt">{note.title}</span>
          <div className="tag-chips">
            {note.chips.map((chip, ci) => (
              <span
                key={ci}
                className={`tag-chip ${chip.cls}`}
                style={{
                  opacity: visibleCount > i ? 1 : 0,
                  transform: visibleCount > i ? 'scale(1)' : 'scale(0.7)',
                  transition: `opacity 0.25s ease ${0.18 + ci * 0.1}s, transform 0.25s ease ${0.18 + ci * 0.1}s`,
                }}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      ))}
      {showLabel && (
        <div className="ai-label">
          <div className="ai-pulse" />
          AI가 4개 노트를 분석하고 태그를 자동 생성했어요
        </div>
      )}
    </div>
  );
}

function RagDemoChat({ active }: { active: boolean }) {
  const [qText, setQText] = useState("");
  const [aText, setAText] = useState("");
  const [showSource, setShowSource] = useState(false);

  const fullQ = "RAG 파이프라인에서 청킹 전략은 어떻게 해?";
  const fullA = "내 노트에 따르면 청킹 전략은 크게 3가지로 나뉩니다.\n고정 크기 청킹은 단순하지만 문장이 끊길 수 있고, 의미 기반 청킹은 문장 경계를 유지해 품질이 높아요.";

  useEffect(() => {
    if (!active) {
      setQText("");
      setAText("");
      setShowSource(false);
      return;
    }

    let qIdx = 0;
    let aIdx = 0;
    let qTimer: NodeJS.Timeout;
    let aTimer: NodeJS.Timeout;
    let delayTimer: NodeJS.Timeout;

    const typeQ = () => {
      if (qIdx < fullQ.length) {
        setQText(fullQ.slice(0, qIdx + 1));
        qIdx++;
        qTimer = setTimeout(typeQ, 30);
      } else {
        delayTimer = setTimeout(typeA, 400);
      }
    };

    const typeA = () => {
      if (aIdx < fullA.length) {
        setAText(fullA.slice(0, aIdx + 1));
        aIdx++;
        aTimer = setTimeout(typeA, 25);
      } else {
        setShowSource(true);
      }
    };

    typeQ();

    return () => {
      clearTimeout(qTimer);
      clearTimeout(aTimer);
      clearTimeout(delayTimer);
    };
  }, [active]);

  const renderA = (text: string) => {
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="rag-demo">
      <div className="chat-bubble chat-user">
        {qText}
        {qText.length > 0 && qText.length < fullQ.length && <span>|</span>}
      </div>
      {qText.length === fullQ.length && (
        <div className="chat-bubble chat-ai">
          {renderA(aText)}
          {aText.length < fullA.length && <span>|</span>}
        </div>
      )}
      {showSource && (
        <div className="chat-source" style={{ animation: 'fadeIn 0.4s ease forwards' }}>
          근거 노트: RAG 파이프라인 구현 방법 정리 · 임베딩 모델 선택 기준
        </div>
      )}
    </div>
  );
}
function NotionDemo({ active }: { active: boolean }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!active) {
      setConnected(false);
      return;
    }
    const timer = setTimeout(() => {
      setConnected(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <div className="import-demo">
      <div className="flex items-center justify-between bg-white rounded-xl p-3 mb-1 border border-[#eae8f8] shadow-sm transition-all">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1e1a3c] text-white rounded-xl flex items-center justify-center font-bold text-[18px]">
            N
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[#1e1a3c] text-[14px]">
              {connected ? "Notion 워크스페이스 연결됨" : "Notion 워크스페이스 연결"}
            </span>
            <span className="text-[#8e8aad] text-[11px] mt-0.5">
              {connected ? "가져올 페이지를 선택하세요." : "OAuth로 안전하게 연결하고 가져올 페이지를 선택하세요."}
            </span>
          </div>
        </div>
        <div>
          {connected ? (
            <button className="flex items-center gap-1 text-[#8e8aad] text-[11px] font-medium hover:text-[#1e1a3c] transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
              연결 해제
            </button>
          ) : (
            <button className="bg-[#0f172a] text-white px-3 py-1.5 rounded-lg text-[11px] font-medium hover:bg-[#1e293b] transition-colors">
              연결하기
            </button>
          )}
        </div>
      </div>

      {connected && (
        <div className="flex flex-col gap-2">
          <style>{`
            @keyframes noteSlideX {
              from { opacity: 0; transform: translateX(30px); }
              to { opacity: 1; transform: translateX(0); }
            }
          `}</style>
          <div className="text-[11px] text-[#8e8aad] font-medium flex items-center justify-between px-1 mt-1">
            <span>페이지 목록 · 3개</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          <div className="import-row" style={{ animation: 'noteSlideX 0.4s ease forwards', animationDelay: '0.1s', opacity: 0 }}>
            <span className="import-source src-notion">Notion</span>
            <span className="import-txt">프로젝트 로드맵 2026</span>
            <span className="import-status st-done" style={{ animationDelay: '0.5s' }}>✓ 가져오기 완료</span>
          </div>
          {/* <div className="import-row" style={{ animation: 'noteSlideX 0.4s ease forwards', animationDelay: '0.3s', opacity: 0 }}>
            <span className="import-source src-obsidian">Obsidian</span>
            <span className="import-txt">머신러닝 스터디 노트</span>
            <span className="import-status st-done" style={{ animationDelay: '0.7s' }}>✓ 가져오기 완료</span>
          </div> */}
          <div className="import-row" style={{ animation: 'noteSlideX 0.4s ease forwards', animationDelay: '0.5s', opacity: 0 }}>
            <span className="import-source src-notion">Notion</span>
            <span className="import-txt">팀 회의록 아카이브</span>
            <span className="import-status st-link" style={{ animationDelay: '0.9s' }}>가져오기</span>
          </div>
          <div className="ai-connect-label">
            <div className="ai-pulse" />
            AI가 기존 노트 간 관계를 분석해 지식 그래프를 구성하고 있어요
          </div>
        </div>
      )}
    </div>
  );
}

export function LandingScreen() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollRef = useRef(0);

  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const syncSession = () => setSession(readAuthSession());
    syncSession();
    window.addEventListener("brainx-auth-session-changed", syncSession);
    window.addEventListener("storage", syncSession);
    return () => {
      window.removeEventListener("brainx-auth-session-changed", syncSession);
      window.removeEventListener("storage", syncSession);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const current = el.scrollTop;
      const prev = prevScrollRef.current;
      // 최상단 근처에서는 항상 표시
      if (current < 10) {
        setHeaderVisible(true);
        setScrolled(false);
      } else {
        setScrolled(true);
        // 위로 스크롤 → 표시 / 아래로 스크롤 → 숨김
        setHeaderVisible(current < prev);
      }
      setShowTopBtn(current > window.innerHeight / 2);
      prevScrollRef.current = current;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const isLoggedIn = Boolean(session?.accessToken);

  const section1Ref = useRef<HTMLDivElement>(null);
  const inView1 = useInView(section1Ref, { root: containerRef, once: true, amount: 0.2 });
  const { displayed: t1, isDone: t1Done } = useSingleTyping("저장 그 이상, 생각을 연결합니다", inView1);

  const featureSectionRef = useRef<HTMLDivElement>(null);
  const featureInView = useInView(featureSectionRef, { root: containerRef, once: true, amount: 0.2 });
  const { displayed: featureTitle, isDone: featureTitleDone } = useSingleTyping("저장 그 이상, 생각을 연결합니다", featureInView);
  const featureTitle_p1 = featureTitle.slice(0, 9);
  const featureTitle_p2 = featureTitle.slice(9, 15);
  const featureTitle_p3 = featureTitle.slice(15);

  const section2Ref = useRef<HTMLDivElement>(null);
  const inView2 = useInView(section2Ref, { root: containerRef, once: true, amount: 1 });
  const { displayed: t2, isDone: t2Done } = useSingleTyping("생각의 크기에 맞추다", inView2);

  const section3Ref = useRef<HTMLDivElement>(null);
  const inView3 = useInView(section3Ref, { root: containerRef, once: true, amount: 1 });
  const { displayed: t3, isDone: t3Done } = useSingleTyping("머릿속 우주를 정리할 시간", inView3);

  // 3가지 슬로건 배열
  const SLOGANS = [
    "내 지식의 우주를 탐험하는\nAI 두뇌, BrainX",
    "흩어진 생각들을 연결하는\nAI 두뇌, BrainX",
    "숨겨진 본질을 발견하는\nAI 두뇌, BrainX"
  ];
  // useTypingLoop(slogans, typingSpeed, initialDeleteSpeed, pauseMs)
  const { displayed, sloganIndex } = useTypingLoop(SLOGANS, 15, 45, 5000);

  const nlIdx = displayed.indexOf("\n");
  const typedLine1 = nlIdx === -1 ? displayed : displayed.slice(0, nlIdx);
  const typedLine2 = nlIdx === -1 ? "" : displayed.slice(nlIdx + 1);

  /* 로그인 없이 Guest 모드로 입장한다 — 별도 세션을 만들지 않는다. Gateway가 /home, /notes
     등의 워크스페이스 API 요청에서 guest id(brainx_guest_id)를 발급해 Workspace-Service가
     X-Guest-Id 기반 GUEST actor로 처리한다. */
  const enterGuestMode = () => {
    router.push("/home");
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      clearAuthSession();
    }
    setSession(null);
  };

  const startWindowsDownload = (source: "header" | "hero") => {
    if (typeof window === "undefined") return;
    const storageKey = "brainx_windows_download_client_key";
    let clientKey = window.localStorage.getItem(storageKey);
    if (!clientKey) {
      clientKey = window.crypto?.randomUUID?.() ?? `brainx-${Date.now()}`;
      window.localStorage.setItem(storageKey, clientKey);
    }
    const params = new URLSearchParams({ clientKey, source });
    window.location.href = `/download/windows?${params.toString()}`;
  };

  const featureStories = [
    {
      id: "ai",
      badge: "AI Demo",
      title: "AI 자동 연결",
      desc: "노트 작성 후 마인드맵에서 AI 추천으로 전체 노드를 자동 연결하고, 클러스터링으로 관련 내용을 그룹화합니다."
    },
    {
      id: "rag",
      badge: "RAG Demo",
      title: "RAG 기반 내 노트 챗봇",
      desc: "내 노트를 근거로 답하고, 모든 답변에 출처 노트 링크를 함께 제시합니다."
    },
    {
      id: "graph",
      badge: "Graph Demo",
      title: "지식 마인드맵",
      desc: "노트는 노드, 연결은 엣지로. 흩어진 생각이 살아있는 그래프로 이어집니다."
    },
    {
      id: "import",
      badge: "Import Demo",
      title: "다양한 파일 확장자 가져오기",
      desc: "기존 자료를 그대로 옮기고 pdf, ppt, txt, md 등 다양한 파일 형식을 가져올 수 있습니다. "
    }
  ] as const;

  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <>
      <div
      ref={containerRef}
      data-route
      className="relative h-screen overflow-y-auto scroll transition-colors duration-1000"
      style={{
        backgroundColor: sloganIndex === 0
          ? "rgb(var(--accent) / 0.08)"
          : sloganIndex === 1
          ? "rgb(var(--primary) / 0.08)"
          : "rgb(var(--cyan) / 0.08)"
      }}
    >
      <BackgroundMindmap />
      <header
        className={cx(
          "sticky top-0 z-40 flex h-16 items-center px-6 backdrop-blur-xl transition-all duration-300",
          scrolled
            ? "border-b border-line/60 bg-bg/90 shadow-[0_2px_20px_rgba(0,0,0,0.18)]"
            : "border-b border-line/40 bg-bg/60",
          headerVisible ? "translate-y-0" : "-translate-y-full"
        )}
      >
        <BrandLogo size={36} showWordmark />
        {/* <nav className="ml-10 hidden items-center gap-1 text-[16px] text-txt2 md:flex">
          {["기능", "마인드맵", "요금제"].map((item) => (
            <a key={item} href="#" className="flex h-9 items-center rounded-lg px-3 hover:bg-surface2/50 hover:text-txt">
              {item}
            </a>
          ))}
        </nav> */}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoggedIn ? (
            <>
              <Btn variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={handleLogout}>
                로그아웃
              </Btn>
              <Btn variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => startWindowsDownload("header")}>
                Windows 앱 다운로드
              </Btn>
              <Btn variant="primary" size="sm" onClick={() => router.push("/home")}>
                BrainX 시작하기
              </Btn>
            </>
          ) : (
            <>
            <Btn variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => router.push("/login")}>
              로그인
            </Btn>
              <Btn variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => startWindowsDownload("header")}>
                Windows 앱 다운로드
              </Btn>
              <Btn variant="primary" size="sm" onClick={() => router.push("/home")}>
                BrainX 시작하기
              </Btn>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-[1180px] gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] md:px-10 md:pt-24 lg:items-center">
        {/* min-w-0: 타이핑으로 인해 텍스트 너비가 변해도 그리드 레이아웃(fr)이 요동치지 않도록 방지 */}
        <div className="relative z-10 min-w-0">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-[13px] font-semibold text-primary dark: border-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            AI 기반 개인 지식 관리 · BrainX
          </div>
          <h1 className="mb-6 text-[28px] sm:text-[40px] md:text-[48px] lg:text-[56px] font-extrabold leading-[1.15] tracking-tighter">
            {/* 1줄: 타이핑 애니메이션 — 고정 높이 유지, 줄바꿈 방지 */}
            <span className="text-txt flex items-center whitespace-nowrap" style={{ height: "1.15em" }}>
              <span>{typedLine1}</span>
              {nlIdx === -1 && (
                <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />
              )}
            </span>
            {/* 2줄: 타이핑 애니메이션 — 고정 높이 유지 */}
            <span className="gradient-text flex items-center" style={{ height: "1.15em" }}>
              <span>{typedLine2}</span>
              {nlIdx !== -1 && (
                <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />
              )}
            </span>
          </h1>
          <p className="mb-8 max-w-md text-[19px] leading-relaxed text-txt2">
            노트, 메모, 자료를 저장하면 AI가 정리하고 연결하며, 필요한 순간 답을 찾아줍니다. 적기만 하세요. 연결과 정리는 AI가 합니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" size="lg" icon="bolt" onClick={enterGuestMode}>
              BrainX 시작하기
            </Btn>
            <Btn variant="outline" size="lg" onClick={() => startWindowsDownload("hero")}>
              Windows 앱 다운로드
            </Btn>
          </div>
          <p className="mt-3 text-sm text-txt3">Windows 전용 설치 파일(.exe) 다운로드</p>
          <div className="mt-9 flex items-center gap-6 text-[15px] text-txt3">
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={15} className="text-cyan" /> 신용카드 불필요
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={15} className="text-cyan" /> 1분 만에 시작
            </span>
          </div>
        </div>
        {/* min-w-0: 우측 그래프 컨테이너 영역 고정 */}
        <div className="relative min-w-0">
          <div className="absolute inset-0 grid-bg opacity-60" />
          <Card className="relative aspect-[5/4] overflow-hidden p-2" glow>
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-cyan animate-pulse" />
              <span className="text-[14px] font-medium text-txt2">실시간 지식 그래프 · 13 노트 연결됨</span>
            </div>
            <HeroConstellation />
            <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between">
              <div className="flex gap-1.5">
                {CLUSTERS.slice(0, 4).map((cluster) => (
                  <Badge key={cluster.id} color={cluster.color} dot className="!h-6 backdrop-blur-md">
                    {cluster.label}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section ref={featureSectionRef} className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div ref={section2Ref} className="mb-10 text-center">
          <Badge className="mb-4">핵심 기능</Badge>
            <h2 className="section-title mb-12">
              <span>{featureTitle_p1}</span>
              <em>{featureTitle_p2}</em>
              <span>{featureTitle_p3}</span>
              {!featureTitleDone && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm align-middle" />}
            </h2>
        </div>

        <div className="feature-layout flex-col lg:flex-row"
          style={{
            opacity: featureTitleDone ? 1 : 0,
            transform: featureTitleDone ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.55s ease, transform 0.55s ease',
          }}
        >
          <div className="card-list">
            {featureStories.map((story, index) => {
              const iconClass = index === 0 ? "ic-purple" : index === 1 ? "ic-teal" : index === 2 ? "ic-blue" : "ic-coral";
              const icon = index === 0 ? "✦" : index === 1 ? "💬" : index === 2 ? "🕸" : "📥";
              return (
                <button key={story.id} type="button" className={cx("feat-card", activeFeature === index && "active")} onClick={() => setActiveFeature(index)}>
                  <div className={cx("card-icon", iconClass)}>{icon}</div>
                  <div className="card-body">
                    <div className="card-title">{story.title}</div>
                    <div className="card-desc">{story.desc}</div>
                  </div>
                  <span className="card-arrow">›</span>
                </button>
              );
            })}
          </div>

          <div className="preview-panel">
            <div className="panel-topbar">
              <div className="topbar-dots">
                <div className="dot dot-r" />
                <div className="dot dot-y" />
                <div className="dot dot-g" />
              </div>
              <span className="topbar-title">{featureStories[activeFeature].badge}</span>
              <span className="topbar-badge">Live Preview</span>
            </div>

            <div className="slides-wrap">
              <div className="slides" id="slides" style={{ transform: `translateX(-${activeFeature * 100}%)` }}>
                <div className="slide">
                  <div className="slide-head">
                    <div className="slide-tag text-[#7B7AEE]">AI 자동 연결</div>
                    <div className="slide-h">저장하는 순간, AI가 연결을 시작합니다</div>
                    <div className="slide-p">생성한 노트를 통해 마인드맵이 자동으로 완성돼요.</div>
                  </div>
                  <div className="gif-frame">
                    <AiDemo active={activeFeature === 0} />
                  </div>
                </div>

                <div className="slide">
                  <div className="slide-head">
                    <div className="slide-tag text-[#1D9E75]">RAG 기반 챗봇</div>
                    <div className="slide-h">내 노트가 답변의 근거가 됩니다</div>
                    <div className="slide-p">출처 링크가 항상 함께 제공돼요.</div>
                  </div>
                  <div className="gif-frame">
                    <RagDemoChat active={activeFeature === 1} />
                  </div>
                </div>

                <div className="slide">
                  <div className="slide-head">
                    <div className="slide-tag text-[#185FA5]">지식 마인드맵</div>
                    <div className="slide-h">생각의 연결을 시각화합니다</div>
                    <div className="slide-p">노드와 엣지로 지식 구조가 한눈에 보여요.</div>
                  </div>
                  <div className="gif-frame">
                    <div className="graph-demo">
                      <svg viewBox="0 0 400 185" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <radialGradient id="gc" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#9B8FEE" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#9B8FEE" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        <circle cx="200" cy="92" r="50" fill="url(#gc)" />
                        <line x1="200" y1="92" x2="80" y2="48" stroke="#C4BFF5" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="200" y1="92" x2="320" y2="48" stroke="#C4BFF5" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="200" y1="92" x2="320" y2="148" stroke="#B5ECD9" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="200" y1="92" x2="80" y2="148" stroke="#BDD6F0" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="80" y1="48" x2="32" y2="92" stroke="#C4BFF5" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        <line x1="320" y1="148" x2="368" y2="92" stroke="#B5ECD9" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        <circle cx="200" cy="92" r="32" fill="#EEEDFE" stroke="#9B8FEE" strokeWidth="1.5" />
                        <text x="200" y="88" textAnchor="middle" fontSize="11" fontWeight="600" fill="#3B339E">RAG</text>
                        <text x="200" y="102" textAnchor="middle" fontSize="10" fill="#8B87C4">파이프라인</text>
                        <circle cx="80" cy="48" r="22" fill="#E1F5EE" stroke="#4BC3AC" strokeWidth="1.2" />
                        <text x="80" y="44" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#085041">벡터</text>
                        <text x="80" y="56" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#085041">데이터베이스</text>
                        <circle cx="320" cy="48" r="22" fill="#E6F1FB" stroke="#5BA8F0" strokeWidth="1.2" />
                        <text x="320" y="44" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#0C447C">임베딩</text>
                        <text x="320" y="56" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#0C447C">모델</text>
                        <circle cx="320" cy="148" r="20" fill="#FAECE7" stroke="#F0855A" strokeWidth="1.2" />
                        <text x="320" y="144" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#712B13">청킹</text>
                        <text x="320" y="156" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#712B13">전략</text>
                        <circle cx="80" cy="148" r="20" fill="#FDF0EA" stroke="#F0B05A" strokeWidth="1.2" />
                        <text x="80" y="144" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#7A4010">프로젝트</text>
                        <text x="80" y="156" textAnchor="middle" fontSize="9.5" fontWeight="500" fill="#7A4010">회의록</text>
                        <circle cx="32" cy="92" r="14" fill="#F8F7FF" stroke="#D4D0F5" strokeWidth="1" />
                        <text x="32" y="96" textAnchor="middle" fontSize="8.5" fill="#8B87C4">Qdrant</text>
                        <circle cx="368" cy="92" r="14" fill="#F0FBF7" stroke="#B5ECD9" strokeWidth="1" />
                        <text x="368" y="96" textAnchor="middle" fontSize="8.5" fill="#1D9E75">OpenAI</text>
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="slide">
                  <div className="slide-head">
                    <div className="slide-tag text-[#993C1D]">Notion · Obsidian 가져오기</div>
                    <div className="slide-h">기존 자료를 그대로 옮깁니다</div>
                    <div className="slide-p">AI가 관계를 새로 분석하고 연결해 드려요.</div>
                  </div>
                  <div className="gif-frame">
                    <NotionDemo active={activeFeature === 3} />
                  </div>
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <div className="dots-row">
                {featureStories.map((story, index) => (
                  <button
                    key={story.id}
                    type="button"
                    className={cx("ind-dot", activeFeature === index && "active")}
                    onClick={() => setActiveFeature(index)}
                    aria-label={story.title}
                  />
                ))}
              </div>
              <button type="button" className="panel-cta" onClick={() => setActiveFeature((current) => (current + 1) % featureStories.length)}>
                다음 기능 ›
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div ref={section2Ref} className="mb-10 text-center">
          <Badge className="mb-4">요금제</Badge>
          <h2 className="mb-6 text-[34px] font-bold tracking-tight md:text-[42px] min-h-[1.2em] flex items-center justify-center">
            <span className="flex items-center">
              <span>{t2}</span>
              {!t2Done && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />}
            </span>
          </h2>
          <div className="inline-flex items-center gap-1 rounded-xl border border-line/60 bg-surface/80 p-1 cursor-pointer" onClick={() => setIsAnnual(!isAnnual)}>
            <div
              className={cx("flex h-9 items-center rounded-lg px-4 text-[16px] font-medium transition-all", !isAnnual ? "bg-bg text-txt shadow-sm" : "text-txt3 hover:text-txt")}
              style={!isAnnual && isDark ? { backgroundColor: "rgb(var(--primary))", color: "white" } : undefined}
            >월간</div>
            <div
              className={cx("flex h-9 items-center gap-2 rounded-lg px-4 text-[16px] font-medium transition-all", isAnnual ? "bg-bg text-txt shadow-sm dark:text-txt" : "text-txt3 hover:text-txt")}
              style={isAnnual && isDark ? { backgroundColor: "rgb(var(--primary))", color: "white" } : undefined}
            >
              연간 <span className={cx("text-[13px] text-cyan dark: text-txt")}>-20%</span>
            </div>
          </div>
        </div>
        <motion.div
          className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3"
          variants={sectionVariants}
          initial="hidden"
          animate={t2Done ? "visible" : "hidden"}
        >
          {PRICING.map((plan) => (
            <motion.div key={plan.id} variants={itemVariants} className="h-full">
              <Card glow={plan.best} className={cx("relative p-7 h-full flex flex-col", plan.best && "border-primary/50")}>
                {plan.best ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold text-white shadow-sm backdrop-blur-sm" style={{ backgroundColor: "rgba(59, 130, 246, 0.8)" }}>
                    <Crown size={14} className="text-yellow-400 fill-yellow-400" />
                    가장 인기
                  </div>
                ) : null}
                <div className="mb-1 text-[17px] font-semibold text-txt2">{plan.name}</div>
                <div className="mb-1 flex items-end gap-1.5 flex-wrap">
                  <span
                    className="text-[36px] font-bold tracking-tight transition-colors"
                    style={{ color: isAnnual && plan.price > 0 ? "rgb(var(--primary))" : undefined }}
                  >
                    ₩{isAnnual ? plan.yr.toLocaleString() : plan.price.toLocaleString()}
                  </span>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-[16px] text-txt3">/월</span>
                    {isAnnual && plan.price > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[12px] font-semibold text-primary">
                        ↓ {Math.round((1 - plan.yr / plan.price) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
                <p className="mb-5 text-[15px] text-txt3">{plan.tag}</p>
                <div>
                  <Btn variant={plan.best ? "primary" : "soft"} className="mb-5 w-full" onClick={() => router.push("/billing")}>
                    {plan.cta}
                  </Btn>
                  <ul className="space-y-2.5">
                    {plan.feats.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-[15.5px] text-txt2">
                        <Icon name="check" size={16} className="mt-0.5 shrink-0 text-cyan" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <motion.div ref={section3Ref} variants={singleItemVariants} initial="hidden" animate={inView3 ? "visible" : "hidden"}>
          <Card glow className="relative overflow-hidden border-primary/40 p-12 text-center">
            <div className="absolute inset-0 grid-bg opacity-40" />
            <div className="relative">
              <h2 className="mb-4 text-[32px] font-bold tracking-tight md:text-[40px] min-h-[1.2em] flex items-center justify-center">
                <span className="flex items-center">
                  <span>{t3}</span>
                  {!t3Done && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />}
                </span>
              </h2>
              <div
                style={{
                  opacity: t3Done ? 1 : 0,
                  transform: t3Done ? 'translateY(0)' : 'translateY(16px)',
                  transition: 'opacity 0.45s ease, transform 0.45s ease',
                }}
              >
                <p className="mx-auto mb-7 max-w-md text-txt2">지금 첫 노트를 쓰면, BrainX가 나머지를 연결합니다.</p>
                <Btn variant="primary" size="lg" icon="bolt" onClick={enterGuestMode}>
                  {isLoggedIn ? "BrainX 시작하기" : "무료로 시작하기"}
                </Btn>
              </div>
            </div>
          </Card>
        </motion.div>
      </section>

      <footer className="mx-auto max-w-[1180px] border-t border-line/40 px-6 py-10 md:px-10">
        <div className="flex flex-col items-center justify-between gap-4 text-[16px] text-txt3 md:flex-row">
          <div className="flex items-center gap-4">
            <BrandLogo size={28} showWordmark />
            <span className="text-[14px]">© 2026 BrainX 개발팀</span>
          </div>
          <div className="flex items-center gap-5">
            {["이용약관", "개인정보", "문의하기"].map((item) => (
              <a key={item} href={item === "문의하기" ? "/support" : "#"} className="hover:text-txt">
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>
      </div>

      {/* 상단으로 이동 버튼 */}
      <button
        type="button"
        className={cx(
          "group fixed bottom-8 right-8 z-[100] flex h-12 w-12 items-center justify-center rounded-full bg-surface border border-line/60 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-surface2 hover:scale-105",
          showTopBtn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
        )}
        onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <div className="flex items-center justify-center" style={{ transform: "rotate(90deg)" }}>
          <Icon name="arrowL" size={20} className="text-txt2 group-hover:text-txt" />
        </div>
        <span className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-[100] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-txt px-2.5 py-1.5 text-[12px] font-medium text-bg2 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
          상단으로 이동
          <div className="absolute bottom-[-4px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
        </span>
      </button>

      <style jsx global>{`
        .section-tag {
          text-align: center;
          font-size: 12px;
          color: #8b87c4;
          letter-spacing: 0.08em;
        }
        .section-title {
          text-align: center;
          font-size: 36px;
          font-weight: 700;
          color: #1e1a3c;
          line-height: 1.25;
          letter-spacing: -0.02em;
        }
        .section-title em {
          font-style: normal;
          background: linear-gradient(135deg, #4f8ef7, #7b7aee, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .feature-layout {
          display: flex;
          gap: 20px;
          max-width: 960px;
          margin: 0 auto;
          align-items: flex-start;
        }
        .card-list {
          display: flex;
          flex-direction: column;
          flex-wrap: wrap;
          width: 295px;
          gap: 8px;
        }
        .feat-card {
          flex: 1 1 50%;
          min-height: 116px;
          background: #fff;
          border-radius: 14px;
          padding: 16px 18px;
          cursor: pointer;
          border: 1.5px solid transparent;
          transition: all 0.2s ease;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          position: relative;
          text-align: left;
          overflow: hidden;
        }
        .feat-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #4f8ef7, #a78bfa);
          opacity: 0;
          transition: opacity 0.2s;
          border-radius: 3px 0 0 3px;
        }
        .feat-card:hover {
          border-color: rgba(123, 122, 238, 0.2);
          box-shadow: 0 4px 16px rgba(123, 122, 238, 0.1);
        }
        .feat-card.active {
          border-color: rgba(123, 122, 238, 0.35);
          background: #fafaff;
          box-shadow: 0 6px 20px rgba(123, 122, 238, 0.14);
        }
        .feat-card.active::before {
          opacity: 1;
        }
        .card-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ic-purple { background: #eeedfe; }
        .ic-teal { background: #e0f5f0; }
        .ic-blue { background: #e6f1fb; }
        .ic-coral { background: #fdf0ea; }
        .card-body {
          flex: 1;
          min-width: 0;
        }
        .card-title {
          font-size: 15px;
          font-weight: 600;
          color: #1e1a3c;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .card-desc {
          font-size: 12px;
          color: #8e8aad;
          line-height: 1.6;
        }
        .card-arrow {
          font-size: 18px;
          color: #c4bff5;
          flex-shrink: 0;
          margin-top: 2px;
          transition: transform 0.2s, color 0.2s;
        }
        .feat-card.active .card-arrow {
          color: #7b7aee;
          transform: translateX(2px);
        }
        .preview-panel {
          width: 100%;
          flex: 1;
          background: #fff;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(123, 122, 238, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
          min-height: 400px;
          position: relative;
        }
        .panel-topbar {
          background: #f8f7ff;
          border-bottom: 1px solid #eae8f8;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .topbar-dots { display: flex; gap: 5px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; animation: none;}
        .dot-r { background: #ff6b6b; }
        .dot-y { background: #ffd93d; }
        .dot-g { background: #6bcb77; }
        .topbar-title {
          font-size: 12px;
          color: #a8a4c4;
          margin-left: 8px;
          flex: 1;
        }
        .topbar-badge {
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 20px;
          background: #eeedfe;
          color: #6c63d8;
          border: 1px solid #d4d0f5;
          font-weight: 500;
        }
        .slides-wrap {
          position: relative;
          overflow: hidden;
        }
        .slides {
          display: flex;
          transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .slide {
          min-width: 100%;
          padding: 28px 28px 24px;
        }
        .slide-head {
          margin-bottom: 18px;
        }
        .slide-tag {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .slide-h {
          font-size: 20px;
          font-weight: 700;
          color: #1e1a3c;
          margin-bottom: 6px;
          line-height: 1.3;
        }
        .slide-p {
          font-size: 13px;
          color: #8e8aad;
          line-height: 1.65;
        }
        .gif-frame {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #eae8f8;
          background: #fafaff;
          position: relative;
        }
        .ai-demo {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 250px;
        }
        .ai-note-row {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1px solid #eae8f8;
          border-radius: 8px;
          padding: 9px 12px;
        }
        .note-txt { font-size: 12px; color: #3c395a; flex: 1; }
        .tag-chips { display: flex; gap: 4px; margin-left: auto; }
        .tag-chip {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 20px;
          animation: chipPop 0.3s ease forwards;
          opacity: 0;
        }
        .tag-chip:nth-child(1) { animation-delay: 1.2s; }
        .tag-chip:nth-child(2) { animation-delay: 1.4s; }
        @keyframes chipPop {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
        .tc-purple { background: #eeedfe; color: #534ab7; border: 1px solid #d4d0f5; }
        .tc-teal { background: #e1f5ee; color: #0f6e56; border: 1px solid #b5ecd9; }
        .tc-blue { background: #e6f1fb; color: #185fa5; border: 1px solid #bdd6f0; }
        .tc-coral { background: #faece7; color: #993c1d; border: 1px solid #f5c4b3; }
        .ai-label {
          font-size: 11px;
          color: #9b8fee;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 0 0 2px;
          animation: fadeIn 0.5s 1.6s ease forwards;
          opacity: 0;
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
        .ai-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9b8fee;
          animation: pulse 1.2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.7); }
        }
        .rag-demo {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 250px;
        }
        .chat-bubble {
          border-radius: 12px;
          padding: 10px 13px;
          font-size: 15px;
          line-height: 1.6;
          max-width: 90%;
          animation: fadeIn 0.4s ease forwards;
          opacity: 0;
        }
        .chat-user {
          background: #2563eb;
          color: #ffffff;
          align-self: flex-end;
          border-bottom-right-radius: 3px;
          animation-delay: 0.2s;
        }
        .chat-ai {
          background: #fff;
          border: 1px solid #eae8f8;
          color: #3c395a;
          align-self: flex-start;
          border-bottom-left-radius: 3px;
          animation-delay: 0.8s;
        }
        .chat-source {
          font-size: 11px;
          color: #9b8fee;
          display: flex;
          align-items: center;
          gap: 5px;
          animation: fadeIn 0.4s 1.4s ease forwards;
          opacity: 0;
        }
        .graph-demo {
          padding: 12px;
          min-height: 250px;
          position: relative;
        }
        .graph-demo svg { width: 100%; height: 210px; }
        .import-demo {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 250px;
        }
        .import-row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border: 1px solid #eae8f8;
          border-radius: 8px;
          padding: 9px 12px;
          animation: noteSlide 0.4s ease forwards;
          opacity: 0;
        }
        .import-row:nth-child(1) { animation-delay: 0.1s; }
        .import-row:nth-child(2) { animation-delay: 0.3s; }
        .import-row:nth-child(3) { animation-delay: 0.5s; }
        .import-source {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .src-notion { background: #f5f5f0; color: #555; border: 1px solid #e8e8e0; }
        .src-obsidian { background: #f0eeff; color: #5b4fd9; border: 1px solid #d4ceff; }
        .import-txt {
          font-size: 12px;
          color: #3c395a;
          flex: 1;
        }
        .import-status {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 20px;
          animation: chipPop 0.3s ease forwards;
          opacity: 0;
        }
        .import-row:nth-child(1) .import-status { animation-delay: 0.7s; }
        .import-row:nth-child(2) .import-status { animation-delay: 0.9s; }
        .import-row:nth-child(3) .import-status { animation-delay: 1.1s; }
        .st-done { background: #e1f5ee; color: #0f6e56; border: 1px solid #b5ecd9; }
        .st-link { background: #eeedfe; color: #534ab7; border: 1px solid #d4d0f5; }
        .ai-connect-label {
          font-size: 11px;
          color: #9b8fee;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 2px;
          animation: fadeIn 0.5s 1.4s ease forwards;
          opacity: 0;
        }
        .panel-footer {
          padding: 14px 20px;
          border-top: 1px solid #f0eef9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dots-row { display: flex; gap: 6px; }
        .ind-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ddd9f5;
          cursor: pointer;
          transition: background 0.2s, width 0.2s;
        }
        .ind-dot.active {
          background: #7b7aee;
          width: 18px;
          border-radius: 20px;
        }
        .panel-cta {
          font-size: 12px;
          color: #9b8fee;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          background: none;
          border: none;
          font-family: inherit;
          transition: color 0.12s;
        }
        .panel-cta:hover { color: #6c63d8; }
        @media (max-width: 1024px) {
          .feature-layout {
            flex-direction: column;
          }
          .card-list {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
