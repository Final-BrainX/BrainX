"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  getHostedWebOrigin,
  getOAuthAuthorization,
  setAuthSessionPersistence,
  stashOAuthReturnTo,
  type OAuthProvider,
} from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Icon, ThemeToggle } from "@/components/brainx-ui";
import { HeroConstellation } from "@/components/public/landing-screen";
import { BrandLogo } from "@/components/brand-logo";
import { isElectronDesktop, openBrainxExternalUrl } from "@/lib/desktop-bridge";

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
  error,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  right?: ReactNode;
  disabled?: boolean;
  autoComplete?: string;
  error?: string;
}) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-[14.5px] font-medium text-txt2">
        <label htmlFor={inputId}>{label}</label>
        {right}
      </div>
      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`h-11 w-full rounded-xl border bg-surface/60 px-3.5 text-[16px] text-txt outline-none transition-colors placeholder:text-txt3 focus:bg-surface ${
          error ? "border-red-400/80 focus:border-red-400" : "border-line/60 focus:border-primary/60"
        }`}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 break-keep text-[12.5px] leading-snug text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type SocialButtonsProps = {
  recentLogin?: "google" | "kakao" | "naver" | null;
  returnTo?: string | null;
  rememberMe?: boolean;
};

export function SocialButtons({ recentLogin = null, returnTo = null, rememberMe = true }: SocialButtonsProps) {
  const { pushToast } = useBrainX();
  const providers: Array<{
    name: string;
    provider: OAuthProvider;
    background: string;
    color: string;
    icon: ReactNode;
  }> = [
    {
      name: "Google",
      provider: "google",
      background: "#fff",
      color: "#1f2937",
      icon: (
        <span className="grid h-5 w-5 place-items-center rounded-full border border-[#dadce0] text-[11px] font-bold leading-none text-[#4285f4]">
          G
        </span>
      )
    },
    {
      name: "Kakao",
      provider: "kakao",
      background: "#FEE500",
      color: "#191600",
      icon: (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#191600] text-[10px] font-black leading-none text-[#FEE500]">
          K
        </span>
      )
    },
    //{ name: "Apple", provider: "apple", background: "#111", color: "#fff" }
    {
      name: "Naver",
      provider: "naver",
      background: "#03C75A",
      color: "#fff",
      icon: (
        <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-white text-[10px] font-black leading-none text-[#03C75A]">
          N
        </span>
      )
    },
  ];

  const handleOAuth = async (provider: OAuthProvider, name: string) => {
    try {
      window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
      setAuthSessionPersistence(rememberMe ? "local" : "session");
      const normalizedReturnTo = returnTo ?? "/home";

      if (isElectronDesktop()) {
        const hostedOrigin = getHostedWebOrigin();
        const desktopStartUrl = `${hostedOrigin}/oauth/desktop/${provider}?returnTo=${encodeURIComponent(normalizedReturnTo)}`;
        const opened = await openBrainxExternalUrl(desktopStartUrl);
        if (!opened) {
          throw new Error("외부 브라우저를 열지 못했습니다.");
        }
        pushToast("브라우저에서 로그인 후 앱으로 자동 복귀합니다.", "info");
        return;
      }

      stashOAuthReturnTo(normalizedReturnTo);
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
    <div className="grid grid-cols-3 items-end gap-2">
      {providers.map((provider) => (
        <div key={provider.name} className="flex flex-col items-center gap-5">
          {recentLogin === provider.provider ? (
            <div className="relative w-fit">
              <div className="inline-flex items-center gap-2 rounded-[10px] bg-black px-3 py-2 text-[12px] font-medium text-white shadow-sm dark:bg-white dark:text-black">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-semibold text-black dark:bg-black dark:text-white">
                  {provider.provider === "google" ? "G" : provider.provider === "kakao" ? "K" : "N"}
                </span>
                <span>최근 로그인</span>
              </div>
              <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-black dark:bg-white" />
            </div>
          ) : (
            <div className="h-8" />
          )}
          <button
            type="button"
            onClick={() => handleOAuth(provider.provider, provider.name)}
            style={{ background: provider.background, color: provider.color }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line/30 px-3 text-[15px] font-semibold transition hover:brightness-95"
          >
            {provider.icon}
            {provider.name}
          </button>
        </div>
      ))}
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";

  const leftBackground = isLight
    ? "linear-gradient(145deg, #d8d4f7 0%, #e8f5f0 50%, #dcd8f5 100%)"
    : "linear-gradient(145deg, #0f1327 0%, #121a33 52%, #17102f 100%)";

  const rightPanelClassName = isLight
    ? "scroll relative flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-white p-6"
    : "scroll relative flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-bg2 p-6";

  return (
    <div className="relative grid overflow-hidden lg:grid-cols-2">
      <div
        className="relative hidden overflow-hidden border-r border-line/40 p-12 lg:flex lg:flex-col lg:justify-between"
        style={{ background: leftBackground }}
      >
        <div className="absolute inset-0 grid-bg opacity-35" />
        <div className="absolute inset-0">
          <div className="absolute inset-0">
            <HeroConstellation />
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="relative z-10 flex w-fit items-center gap-2.5 mb-8"
        >
          <BrandLogo size={40} showWordmark />
        </button>
        <div className="relative z-10 max-w-sm">
          <h2 className="mb-3 text-[32px] font-bold leading-tight tracking-tight">내 지식의 우주를<br />탐험하는 AI 두뇌</h2>
          <p className="leading-relaxed text-txt2">적기만 하세요. 연결과 정리는 AI가 합니다. 흩어진 노트가 하나의 살아있는 그래프가 됩니다.</p>
        </div>
        <div className="relative z-10 text-[14px] text-txt3">© 2026 BrainX 개발팀</div>
      </div>

      <div className={rightPanelClassName}>
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
