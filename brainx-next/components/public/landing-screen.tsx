"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, useInView, type Variants, type Transition } from "framer-motion";

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

    // 노드를 좌/우 외곽 + 상/하 외곽에 전체 높이 걸쳐 배치
    const N = 52;
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
        vx: (Math.random() - 0.5) * 0.055,
        vy: (Math.random() - 0.5) * 0.055,
        r: 2.5 + Math.random() * 5,
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
      line.setAttribute("stroke", "rgb(148 163 184 / 0.08)");
      line.setAttribute("stroke-width", "0.8");
      edgeGroup.appendChild(line);
      return line;
    });

    const nodeEls = nodes.map((node) => {
      const g = document.createElementNS(ns, "g");
      const halo = document.createElementNS(ns, "circle");
      halo.setAttribute("r", String(node.r * 2.8));
      halo.setAttribute("fill", `rgb(${node.c} / 0.06)`);
      const core = document.createElementNS(ns, "circle");
      core.setAttribute("r", String(node.r));
      core.setAttribute("fill", `rgb(${node.c} / 0.22)`);
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
      style={{ filter: "blur(1.5px)", opacity: 0.55, zIndex: 0 }}
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
  visible: { transition: { staggerChildren: 0.22, delayChildren: 1.2 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: itemTransition }
};

const singleItemVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: itemTransition }
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
  return { displayed, isDone: phase === "pause" };
}

export function LandingScreen() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollRef = useRef(0);

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
      prevScrollRef.current = current;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const isLoggedIn = Boolean(session?.accessToken);

  const section1Ref = useRef<HTMLElement>(null);
  const inView1 = useInView(section1Ref, { root: containerRef, once: true, amount: 0.2 });
  const { displayed: t1, isDone: t1Done } = useSingleTyping("저장 그 이상, 생각을 연결합니다", inView1);
  const t1_p1 = t1.slice(0, 9);
  const t1_p2 = t1.slice(9, 15);
  const t1_p3 = t1.slice(15);

  const section2Ref = useRef<HTMLElement>(null);
  const inView2 = useInView(section2Ref, { root: containerRef, once: true, amount: 0.2 });
  const { displayed: t2, isDone: t2Done } = useSingleTyping("생각의 크기에 맞춰", inView2);

  const section3Ref = useRef<HTMLElement>(null);
  const inView3 = useInView(section3Ref, { root: containerRef, once: true, amount: 0.2 });
  const { displayed: t3, isDone: t3Done } = useSingleTyping("머릿속 우주를 정리할 시간", inView3);

  // 3가지 슬로건 배열
  const SLOGANS = [
    "내 지식의 우주를 탐험하는\nAI 두뇌, BrainX",
    "흩어진 생각들을 연결하는\nAI 두뇌, BrainX",
    "숨겨진 인사이트를 발견하는\nAI 두뇌, BrainX"
  ];
  // useTypingLoop(slogans, typingSpeed, initialDeleteSpeed, pauseMs)
  const { displayed } = useTypingLoop(SLOGANS, 15, 45, 5000);

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

  const features = [
    {
      icon: "sparkle" as const,
      color: "59 130 246",
      title: "AI 자동 정리",
      desc: "노트를 저장하면 AI가 주제를 파악해 태그·요약·폴더를 자동으로 구성합니다."
    },
    {
      icon: "chat" as const,
      color: "139 92 246",
      title: "RAG 기반 내 노트 챗봇",
      desc: "내 자료를 근거로 답하고, 모든 답변에 출처 노트 링크를 함께 제시합니다."
    },
    {
      icon: "graph" as const,
      color: "34 211 238",
      title: "지식 마인드맵",
      desc: "노트는 노드, 연결은 엣지로. 흩어진 생각이 살아있는 그래프로 이어집니다."
    },
    {
      icon: "import" as const,
      color: "52 211 153",
      title: "Notion·Obsidian 가져오기",
      desc: "기존 자료를 그대로 옮겨오고, AI가 관계를 새로 연결해 드립니다."
    }
  ];

  return (
    <div ref={containerRef} data-route className="relative h-screen overflow-y-auto scroll">
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
              <Btn variant="primary" size="sm" onClick={() => router.push("/home")}>
                BrainX 시작하기
              </Btn>
            </>
          ) : (
            <Btn variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => router.push("/login")}>
              로그인
            </Btn>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-[1180px] gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] md:px-10 md:pt-24 lg:items-center">
        {/* min-w-0: 타이핑으로 인해 텍스트 너비가 변해도 그리드 레이아웃(fr)이 요동치지 않도록 방지 */}
        <div className="relative z-10 min-w-0">
          <Badge color="139 92 246" dot className="mb-6">
            AI 기반 개인 지식 관리 · BrainX
          </Badge>
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
          </div>
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

      <section ref={section1Ref} className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div className="mb-12 text-center">
          <Badge className="mb-4">핵심 기능</Badge>
          <h2 className="text-[34px] font-bold tracking-tight md:text-[42px] min-h-[1.2em] flex items-center justify-center">
            <span className="flex items-center">
              <span>{t1_p1}</span>
              <span className="gradient-text">{t1_p2}</span>
              <span>{t1_p3}</span>
              {!t1Done && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />}
            </span>
          </h2>
        </div>
        <motion.div
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          variants={sectionVariants}
          initial="hidden"
          animate={inView1 ? "visible" : "hidden"}>
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants} className="h-full">
              <FeatureCard {...feature} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {[
            {
              tag: "AI 도구의 한계",
              color: "244 114 182",
              title: "질문엔 답하지만, 내 자료를 관리하진 못합니다",
              desc: "ChatGPT·Claude는 똑똑하지만 어제 내가 쓴 메모를 기억하지 못합니다."
            },
            {
              tag: "노트 도구의 한계",
              color: "234 179 8",
              title: "저장은 잘하지만, 연결과 검색이 약합니다",
              desc: "Notion·Obsidian은 잘 쌓이지만, 흩어진 지식을 AI가 이어주진 않습니다."
            },
            {
              tag: "BrainX의 해답",
              color: "34 211 238",
              title: "저장 + AI 정리 + 자동 연결 + RAG 대화",
              desc: "쌓는 순간 정리되고, 연결되고, 언제든 근거 있는 답으로 돌아옵니다."
            }
          ].map((item, index) => (
            <Card key={item.tag} glow={index === 2} className={cx("p-7", index === 2 && "border-cyan/40")}>
              <Badge color={item.color} dot className="mb-4">
                {item.tag}
              </Badge>
              <h3 className="mb-3 text-[21px] font-semibold leading-snug text-txt">{item.title}</h3>
              <p className="text-[16px] leading-relaxed text-txt2">{item.desc}</p>
              {index === 2 ? (
                <Btn variant="outline" size="sm" icon="arrowL" className="mt-5 [&_svg]:rotate-180" onClick={enterGuestMode}>
                  {isLoggedIn ? "BrainX 시작하기" : "지금 경험하기"}
                </Btn>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section ref={section2Ref} className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div className="mb-10 text-center">
          <Badge className="mb-4">요금제</Badge>
          <h2 className="mb-6 text-[34px] font-bold tracking-tight md:text-[42px] min-h-[1.2em] flex items-center justify-center">
            <span className="flex items-center">
              <span>{t2}</span>
              {!t2Done && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />}
            </span>
          </h2>
          <div className="inline-flex items-center gap-1 rounded-xl p-1 glass cursor-pointer" onClick={() => setIsAnnual(!isAnnual)}>
            <div className={cx("flex h-9 items-center rounded-lg px-4 text-[16px] font-medium transition-colors", !isAnnual ? "bg-surface2 text-txt" : "text-txt2 hover:text-txt")}>월간</div>
            <div className={cx("flex h-9 items-center gap-2 rounded-lg px-4 text-[16px] font-medium transition-colors", isAnnual ? "bg-surface2 text-txt" : "text-txt2 hover:text-txt")}>
              연간 <span className="text-[13px] text-cyan">-20%</span>
            </div>
          </div>
        </div>
        <motion.div
          className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3"
          variants={sectionVariants}
          initial="hidden"
          animate={inView2 ? "visible" : "hidden"}
        >
          {PRICING.map((plan) => (
            <motion.div key={plan.id} variants={itemVariants} className="h-full">
              <Card glow={plan.best} className={cx("relative p-7 h-full flex flex-col", plan.best && "border-primary/50")}>
                {plan.best ? <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">가장 인기</Badge> : null}
                <div className="mb-1 text-[17px] font-semibold text-txt2">{plan.name}</div>
                <div className="mb-1 flex items-end gap-1">
                  <span className="text-[36px] font-bold tracking-tight">₩{isAnnual ? plan.yr.toLocaleString() : plan.price.toLocaleString()}</span>
                  <span className="mb-1.5 text-[16px] text-txt3">/월</span>
                </div>
                <p className="mb-5 text-[15px] text-txt3">{plan.tag}</p>
                <div className="mt-auto">
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

      <section ref={section3Ref} className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <motion.div variants={singleItemVariants} initial="hidden" animate={inView3 ? "visible" : "hidden"}>
          <Card glow className="relative overflow-hidden border-primary/40 p-12 text-center">
            <div className="absolute inset-0 grid-bg opacity-40" />
            <div className="relative">
              <h2 className="mb-4 text-[32px] font-bold tracking-tight md:text-[40px] min-h-[1.2em] flex items-center justify-center">
                <span className="flex items-center">
                  <span>{t3}</span>
                  {!t3Done && <span className="inline-block w-[3px] h-[0.75em] ml-1 bg-primary animate-blink rounded-sm flex-shrink-0" />}
                </span>
              </h2>
              <p className="mx-auto mb-7 max-w-md text-txt2">지금 첫 노트를 쓰면, BrainX가 나머지를 연결합니다.</p>
              <Btn variant="primary" size="lg" icon="bolt" onClick={enterGuestMode}>
                {isLoggedIn ? "BrainX 시작하기" : "무료로 시작하기"}
              </Btn>
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
  );
}
