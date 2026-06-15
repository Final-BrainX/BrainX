"use client";

import { type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getOAuthAuthorization, type OAuthProvider } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Icon, ThemeToggle } from "@/components/brainx-ui";
import { HeroConstellation } from "@/components/public/landing-screen";

const OAUTH_LINK_INTENT_KEY = "brainx_oauth_link_intent_v1";

export function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  right,
  disabled,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  right?: ReactNode;
  disabled?: boolean;
  autoComplete?: string;
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
        disabled={disabled}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-xl border border-line/60 bg-surface/60 px-3.5 text-[14px] text-txt outline-none transition-colors placeholder:text-txt3 focus:border-primary/60 focus:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

export function SocialButtons() {
  const { pushToast } = useBrainX();
  const providers: Array<{
    name: string;
    provider: OAuthProvider;
    background: string;
    color: string;
  }> = [
    {
      name: "Google",
      provider: "google",
      background: "#fff",
      color: "#1f2937",
    },
    {
      name: "Kakao",
      provider: "kakao",
      background: "#FEE500",
      color: "#191600",
    },
    //{ name: "Apple", provider: "apple", background: "#111", color: "#fff" }
    { name: "Naver", provider: "naver", background: "#03C75A", color: "#fff" },
  ];

  const handleOAuth = async (provider: OAuthProvider, name: string) => {
    try {
      window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
      const data = await getOAuthAuthorization(provider);
      window.location.href = data.authorizationUrl;
    } catch (error) {
      pushToast(
        error instanceof Error
          ? error.message
          : `${name} 로그인을 시작할 수 없습니다.`,
        "err",
      );
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {providers.map((provider) => (
        <button
          key={provider.name}
          type="button"
          onClick={() => handleOAuth(provider.provider, provider.name)}
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
        <button
          type="button"
          onClick={() => router.push("/")}
          className="relative z-10 flex w-fit items-center gap-2.5"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-accent to-cyan shadow-glow">
            <Icon name="brain" size={20} className="text-white" />
          </div>
          <span className="font-display text-[20px] font-bold tracking-tight">
            BrainX
          </span>
        </button>
        <div className="relative z-10 max-w-sm">
          <h2 className="mb-3 text-[30px] font-bold leading-tight tracking-tight">
            지식의 흐름을
            <br />
            연결하는 AI 워크스페이스
          </h2>
          <p className="leading-relaxed text-txt2">
            생각을 기록하고 연결하면 BrainX가 정리와 탐색을 도와줍니다.
          </p>
        </div>
        <div className="relative z-10 text-[12px] text-txt3">© 2026 BrainX</div>
      </div>

      <div className="scroll relative flex items-center justify-center overflow-y-auto p-6">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm py-10">{children}</div>
      </div>
    </div>
  );
}
