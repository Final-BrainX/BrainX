"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { CLUSTERS, INTERESTS, PRICING, SAMPLE_MD, noteById } from "@/lib/brainx-data";
import { cx } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";

function HeroConstellation() {
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

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  right
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  right?: ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-txt2">
        <span>{label}</span>
        {right}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-xl border border-line/60 bg-surface/60 px-3.5 text-[14px] text-txt outline-none transition-colors placeholder:text-txt3 focus:border-primary/60 focus:bg-surface"
      />
    </label>
  );
}

function SocialButtons() {
  const { pushToast } = useBrainX();
  const providers = [
    { name: "Google", background: "#fff", color: "#1f2937" },
    { name: "카카오", background: "#FEE500", color: "#191600" },
    { name: "Apple", background: "#111", color: "#fff" }
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {providers.map((provider) => (
        <button
          key={provider.name}
          type="button"
          onClick={() => pushToast(`${provider.name} 로그인 연결 중…`)}
          style={{ background: provider.background, color: provider.color }}
          className="h-11 rounded-xl border border-line/30 text-[13px] font-semibold transition hover:brightness-95"
        >
          {provider.name}
        </button>
      ))}
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="relative grid h-full overflow-hidden lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line/40 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0">
          <HeroConstellation />
        </div>
        <button type="button" onClick={() => router.push("/")} className="relative z-10 flex w-fit items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-accent to-cyan shadow-glow">
            <Icon name="brain" size={20} className="text-white" />
          </div>
          <span className="text-[20px] font-bold tracking-tight font-display">BrainX</span>
        </button>
        <div className="relative z-10 max-w-sm">
          <h2 className="mb-3 text-[30px] font-bold leading-tight tracking-tight">내 지식의 우주를<br />탐험하는 AI 두뇌</h2>
          <p className="leading-relaxed text-txt2">적기만 하세요. 연결과 정리는 AI가 합니다. 흩어진 노트가 하나의 살아있는 그래프가 됩니다.</p>
        </div>
        <div className="relative z-10 text-[12px] text-txt3">© 2026 BrainX 개발팀</div>
      </div>

      <div className="relative flex items-center justify-center overflow-y-auto p-6 scroll">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm py-10">{children}</div>
      </div>
    </div>
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

export function LoginScreen() {
  const router = useRouter();
  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">다시 오신 걸 환영해요</h1>
      <p className="mb-7 text-[14px] text-txt2">BrainX 계정으로 로그인하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <Field
        label="비밀번호"
        type="password"
        placeholder="••••••••"
        right={<button type="button" className="text-[12px] font-normal text-primary">비밀번호 찾기</button>}
      />
      <Btn variant="primary" size="lg" className="mt-2 w-full" onClick={() => router.push("/home")}>
        로그인
      </Btn>
      <div className="my-6 flex items-center gap-3 text-[12px] text-txt3">
        <div className="h-px flex-1 bg-line/60" />
        또는
        <div className="h-px flex-1 bg-line/60" />
      </div>
      <SocialButtons />
      <p className="mt-7 text-center text-[13px] text-txt2">
        계정이 없으신가요?{" "}
        <button type="button" onClick={() => router.push("/signup")} className="font-medium text-primary">
          회원가입
        </button>
      </p>
    </AuthShell>
  );
}

export function SignupScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [agree, setAgree] = useState({
    tos: false,
    priv: false,
    mkt: false,
    beh: false
  });

  const terms = [
    { key: "tos", label: "[필수] 서비스 이용약관" },
    { key: "priv", label: "[필수] 개인정보 처리방침" },
    { key: "mkt", label: "[선택] 마케팅 정보 수신" },
    { key: "beh", label: "[선택] 행동 데이터 분석 동의" }
  ] as const;

  const canProceed = agree.tos && agree.priv;

  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">두뇌를 깨우는 1분</h1>
      <p className="mb-7 text-[14px] text-txt2">무료로 BrainX를 시작하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <Field label="인증 코드" placeholder="6자리 숫자" />
        </div>
        <Btn variant="soft" className="mb-4" onClick={() => pushToast("인증 코드를 전송했어요", "ok")}>
          코드 전송
        </Btn>
      </div>
      <Field label="비밀번호" type="password" placeholder="8자 이상" />
      <Field label="비밀번호 확인" type="password" placeholder="다시 입력" />
      <div className="my-4 space-y-1 rounded-xl bg-surface2/40 p-3">
        {terms.map((term) => (
          <button
            key={term.key}
            type="button"
            onClick={() => setAgree((current) => ({ ...current, [term.key]: !current[term.key] }))}
            className="flex h-8 w-full items-center gap-2.5 text-left"
          >
            <span
              className={cx(
                "grid h-5 w-5 place-items-center rounded-md border",
                agree[term.key] ? "border-primary bg-primary text-white" : "border-line"
              )}
            >
              {agree[term.key] ? <Icon name="check" size={13} /> : null}
            </span>
            <span className="text-[13px] text-txt2">{term.label}</span>
          </button>
        ))}
      </div>
      <Btn variant="primary" size="lg" className="w-full" disabled={!canProceed} onClick={() => router.push("/onboarding")}>
        가입하고 시작하기
      </Btn>
      <p className="mt-6 text-center text-[13px] text-txt2">
        이미 계정이 있으신가요?{" "}
        <button type="button" onClick={() => router.push("/login")} className="font-medium text-primary">
          로그인
        </button>
      </p>
    </AuthShell>
  );
}

export function OnboardingScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (item: string) => {
    setSelected((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]));
  };

  return (
    <div data-route className="relative flex h-full items-center justify-center overflow-y-auto p-6 scroll">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Card glow className="relative w-full max-w-lg p-8">
        <div className="mb-7 flex items-center gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className={cx("h-1.5 flex-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-surface2")} />
          ))}
        </div>

        {step === 0 ? (
          <>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">어떻게 불러드릴까요?</h1>
            <p className="mb-6 text-[14px] text-txt2">프로필은 나중에 언제든 바꿀 수 있어요.</p>
            <div className="mb-5 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white">
                {nick[0] || "?"}
              </div>
              <Btn variant="soft" icon="upload" onClick={() => pushToast("이미지를 업로드했어요", "ok")}>
                이미지 업로드
              </Btn>
            </div>
            <Field label="닉네임" placeholder="예: 연우" value={nick} onChange={(event) => setNick(event.target.value)} />
            <Btn variant="primary" size="lg" className="mt-2 w-full" onClick={() => setStep(1)}>
              다음
            </Btn>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">관심 분야를 알려주세요</h1>
            <p className="mb-6 text-[14px] text-txt2">AI가 노트를 더 똑똑하게 연결하고 추천해요.</p>
            <div className="mb-6 flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggle(interest)}
                  className={cx(
                    "h-9 rounded-full border px-4 text-[13.5px] font-medium transition-all",
                    selected.includes(interest) ? "border-primary bg-primary text-white" : "border-line text-txt2 hover:border-primary/50"
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => setStep(0)}>
                이전
              </Btn>
              <Btn variant="primary" size="lg" className="flex-1" onClick={() => setStep(2)}>
                다음 ({selected.length})
              </Btn>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow">
              <Icon name="sparkle" size={26} className="text-white" />
            </div>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">AI 개인화 준비 완료</h1>
            <p className="mb-6 text-[14px] leading-relaxed text-txt2">
              이제 노트를 쓰면 BrainX가 자동으로 정리·연결하고, 필요할 때 근거 있는 답을 찾아드릴게요. 첫 노트를 함께 시작해요.
            </p>
            <div className="mb-6 space-y-2.5 rounded-xl bg-surface2/40 p-4">
              {["관심 분야 기반 자동 태깅", "노트 간 AI 연결 추천", "내 자료 기반 RAG 챗봇"].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-txt2">
                  <Icon name="check" size={16} className="text-cyan" />
                  {item}
                </div>
              ))}
            </div>
            <Btn variant="primary" size="lg" className="w-full" icon="bolt" onClick={() => router.push("/home")}>
              BrainX 시작하기
            </Btn>
          </>
        ) : null}
      </Card>
    </div>
  );
}

export function ShareScreen({ noteId }: { noteId?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notes } = useBrainX();
  const resolvedId = noteId ?? searchParams.get("id") ?? "n1";
  const note = useMemo(() => noteById(notes, resolvedId) ?? noteById(notes, "n1"), [notes, resolvedId]);
  const cluster = note ? CLUSTERS.find((entry) => entry.id === note.cluster) ?? CLUSTERS[0] : CLUSTERS[0];
  const markdown = note ? SAMPLE_MD[note.id] ?? note.markdown : "";

  const copyLink = async () => {
    if (!note) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore clipboard issues
    }
  };

  return (
    <div data-route className="h-full overflow-y-auto scroll">
      <header className="sticky top-0 z-10 flex h-16 items-center border-b border-line/40 bg-bg/60 px-6 backdrop-blur-xl">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Icon name="brain" size={17} className="text-white" />
          </div>
          <span className="font-display font-bold">BrainX</span>
        </button>
        <div className="flex-1" />
        <Badge color="234 179 8" dot className="mr-3">
          읽기 전용 · 23일 후 만료
        </Badge>
        <ThemeToggle />
      </header>

      <article className="mx-auto max-w-2xl px-6 py-12">
        <Badge color={cluster.color} dot className="mb-4">
          {cluster.label}
        </Badge>
        <h1 className="mb-4 text-[34px] font-bold tracking-tight">{note?.title ?? "공유 노트"}</h1>
        <div className="mb-8 flex items-center gap-3 border-b border-line/40 pb-8">
          <Avatar name="연우" size={36} />
          <div>
            <div className="text-[14px] font-medium text-txt">김연우</div>
            <div className="text-[12px] text-txt3">2026년 6월 6일 작성 · 공개 노트</div>
          </div>
        </div>
        <div className="prose-bx space-y-4">
          {markdown
            .split("\n")
            .map((line, index) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={index} className="text-[20px] font-bold mt-7 mb-2">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <li
                    key={index}
                    className="ml-5 list-disc text-[15px] leading-relaxed text-txt2"
                    dangerouslySetInnerHTML={{ __html: line.replace("- ", "").replace(/\*\*(.+?)\*\*/g, "<b class=\"text-txt\">$1</b>") }}
                  />
                );
              }
              if (!line.trim()) return null;
              return <p key={index} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<b class=\"text-txt\">$1</b>") }} />;
            })}
        </div>
        <div className="mt-10 flex gap-2 border-t border-line/40 pt-8">
          <Btn variant="primary" icon="bolt" onClick={() => router.push("/home")}>
            BrainX로 열기
          </Btn>
          <Btn variant="soft" icon="copy" onClick={copyLink}>
            링크 복사
          </Btn>
        </div>
      </article>
    </div>
  );
}
