"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { CLUSTERS, PRICING } from "@/lib/brainx-data";

import { cx } from "@/lib/utils";

import { Badge, Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";

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
    <Card hover className="p-6 fade-up">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `rgb(${color} / 0.14)`, color: `rgb(${color})` }}>
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mb-2 text-[17px] font-semibold text-txt">{title}</h3>
      <p className="text-[14px] leading-relaxed text-txt2">{desc}</p>
    </Card>
  );
}

export function LandingScreen() {
  const router = useRouter();

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
    <div data-route className="relative overflow-y-auto scroll">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-line/40 bg-bg/60 px-6 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-accent to-cyan shadow-glow">
            <Icon name="brain" size={20} className="text-white" />
          </div>
          <span className="text-[20px] font-bold tracking-tight font-display">BrainX</span>
        </div>
        <nav className="ml-10 hidden items-center gap-1 text-sm text-txt2 md:flex">
          {["기능", "마인드맵", "요금제"].map((item) => (
            <a key={item} href="#" className="flex h-9 items-center rounded-lg px-3 hover:bg-surface2/50 hover:text-txt">
              {item}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Btn variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => router.push("/login")}>
            로그인
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => router.push("/home")}>
            무료로 시작
          </Btn>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1180px] gap-12 px-6 pb-20 pt-16 md:grid-cols-2 md:px-10 md:pt-24">
        <div className="relative z-10">
          <Badge color="139 92 246" dot className="mb-6">
            AI 기반 개인 지식 관리 · BrainX
          </Badge>
          <h1 className="mb-5 text-[40px] font-bold leading-[1.08] tracking-tight md:text-[54px]">
            내 지식의 우주를 탐험하는<br />
            <span className="gradient-text">AI 두뇌, BrainX</span>
          </h1>
          <p className="mb-8 max-w-md text-[17px] leading-relaxed text-txt2">
            노트, 메모, 자료를 저장하면 AI가 정리하고 연결하며, 필요한 순간 답을 찾아줍니다. 적기만 하세요. 연결과 정리는 AI가 합니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" size="lg" icon="bolt" onClick={() => router.push("/home")}>
              무료로 시작하기
            </Btn>
            <Btn variant="outline" size="lg" icon="eye" onClick={() => router.push("/graph")}>
              데모 보기
            </Btn>
          </div>
          <div className="mt-9 flex items-center gap-6 text-[13px] text-txt3">
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={15} className="text-cyan" /> 신용카드 불필요
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="check" size={15} className="text-cyan" /> 1분 만에 시작
            </span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 grid-bg opacity-60" />
          <Card className="relative aspect-[5/4] overflow-hidden p-2" glow>
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-cyan animate-pulse" />
              <span className="text-[12px] font-medium text-txt2">실시간 지식 그래프 · 13 노트 연결됨</span>
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

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div className="mb-12 text-center">
          <Badge className="mb-4">핵심 기능</Badge>
          <h2 className="text-[32px] font-bold tracking-tight md:text-[40px]">
            저장 그 이상, <span className="gradient-text">생각을 연결</span>합니다
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
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
              <h3 className="mb-3 text-[19px] font-semibold leading-snug text-txt">{item.title}</h3>
              <p className="text-[14px] leading-relaxed text-txt2">{item.desc}</p>
              {index === 2 ? (
                <Btn variant="outline" size="sm" icon="arrowL" className="mt-5 [&_svg]:rotate-180" onClick={() => router.push("/home")}>
                  지금 경험하기
                </Btn>
              ) : null}
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <div className="mb-10 text-center">
          <Badge className="mb-4">요금제</Badge>
          <h2 className="mb-6 text-[32px] font-bold tracking-tight md:text-[40px]">생각의 크기에 맞춰</h2>
          <div className="inline-flex items-center gap-3 rounded-xl p-1 glass">
            <div className="h-9 rounded-lg bg-surface2 px-4 text-sm font-medium text-txt">월간</div>
            <div className="flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-txt2">
              연간 <span className="text-[11px] text-cyan">-20%</span>
            </div>
          </div>
        </div>
        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
          {PRICING.map((plan) => (
            <Card key={plan.id} glow={plan.best} className={cx("relative p-7", plan.best && "border-primary/50")}>
              {plan.best ? <Badge color="59 130 246" className="absolute -top-3 left-1/2 -translate-x-1/2">가장 인기</Badge> : null}
              <div className="mb-1 text-[15px] font-semibold text-txt2">{plan.name}</div>
              <div className="mb-1 flex items-end gap-1">
                <span className="text-[34px] font-bold tracking-tight">₩{plan.yr.toLocaleString()}</span>
                <span className="mb-1.5 text-sm text-txt3">/월</span>
              </div>
              <p className="mb-5 text-[13px] text-txt3">{plan.tag}</p>
              <Btn variant={plan.best ? "primary" : "soft"} className="mb-5 w-full" onClick={() => router.push("/billing")}>
                {plan.cta}
              </Btn>
              <ul className="space-y-2.5">
                {plan.feats.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[13.5px] text-txt2">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0 text-cyan" />
                    {feature}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <Card glow className="relative overflow-hidden border-primary/40 p-12 text-center">
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div className="relative">
            <h2 className="mb-4 text-[30px] font-bold tracking-tight md:text-[38px]">머릿속 우주를 정리할 시간</h2>
            <p className="mx-auto mb-7 max-w-md text-txt2">지금 첫 노트를 쓰면, BrainX가 나머지를 연결합니다.</p>
            <Btn variant="primary" size="lg" icon="bolt" onClick={() => router.push("/home")}>
              무료로 시작하기
            </Btn>
          </div>
        </Card>
      </section>

      <footer className="mx-auto max-w-[1180px] border-t border-line/40 px-6 py-10 md:px-10">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-txt3 md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Icon name="brain" size={16} className="text-white" />
            </div>
            <span className="font-display font-bold text-txt">BrainX</span>
            <span className="ml-2">© 2026 BrainX 개발팀</span>
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
