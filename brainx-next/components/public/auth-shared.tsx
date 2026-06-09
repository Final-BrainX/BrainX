"use client";

import { type ChangeEvent, type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";

import { Btn, Icon, ThemeToggle } from "@/components/brainx-ui";

import { HeroConstellation } from "@/components/public/landing-screen";

export function Field({
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

export function SocialButtons() {
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

export function AuthShell({ children }: { children: ReactNode }) {
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
