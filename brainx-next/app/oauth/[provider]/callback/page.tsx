"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import {
  buildAuthPath,
  completeOAuthLogin,
  consumeOAuthReturnTo,
  resolveAuthReturnTo,
  type OAuthProvider,
} from "@/lib/auth-api";
import { isElectronDesktop } from "@/lib/desktop-bridge";
import { AuthRequiredError, linkSocialAccount } from "@/lib/user-api";
import { useBrainX } from "@/components/brainx-provider";

const PROVIDERS = new Set(["kakao", "google", "apple", "naver"]);
const OAUTH_LINK_INTENT_KEY = "brainx_oauth_link_intent_v1";
const DESKTOP_OAUTH_INTENT_KEY = "brainx_desktop_oauth_intent_v1";

function normalizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }
  return value;
}

function readJsonStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function OAuthCallbackContent() {
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useBrainX();
  const processedCallbackKeyRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const [message, setMessage] = useState("소셜 로그인 완료를 처리하는 중입니다.");

  const provider = useMemo(() => {
    const value = params.provider;
    return PROVIDERS.has(value) ? (value as OAuthProvider) : null;
  }, [params.provider]);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const queryReturnTo = normalizeReturnTo(searchParams.get("returnTo"));

    if (!provider || !code || !state) {
      setMessage("소셜 로그인 정보가 올바르지 않습니다.");
      pushToast("소셜 로그인 정보가 올바르지 않습니다.", "err");
      router.replace("/login");
      return;
    }

    activeRef.current = true;
    const callbackKey = `${provider}:${state}:${code}`;
    if (processedCallbackKeyRef.current === callbackKey) {
      return () => {
        activeRef.current = false;
      };
    }
    processedCallbackKeyRef.current = callbackKey;

    const linkIntent = readJsonStorage<{ provider?: string; state?: string; returnTo?: string }>(OAUTH_LINK_INTENT_KEY);
    const desktopIntent = readJsonStorage<{ provider?: string; state?: string; returnTo?: string }>(DESKTOP_OAUTH_INTENT_KEY);

    if (linkIntent?.provider === provider && linkIntent.state === state) {
      setMessage("소셜 계정 연결을 완료하는 중입니다.");
      linkSocialAccount(provider, code)
        .then(() => {
          if (!activeRef.current) return;
          window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
          pushToast("소셜 계정 연결이 완료되었습니다.", "ok");
          router.replace(linkIntent.returnTo ?? "/mypage");
        })
        .catch((error) => {
          if (!activeRef.current) return;
          processedCallbackKeyRef.current = null;
          window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
          const nextMessage = error instanceof Error ? error.message : "소셜 계정 연결에 실패했습니다.";
          setMessage(nextMessage);
          pushToast(nextMessage, "err");
          router.replace(error instanceof AuthRequiredError ? "/login" : linkIntent.returnTo ?? "/mypage");
        });

      return () => {
        activeRef.current = false;
      };
    }

    if (!isElectronDesktop() && desktopIntent?.provider === provider && desktopIntent.state === state) {
      setMessage("BrainX 앱으로 돌아가는 중입니다.");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DESKTOP_OAUTH_INTENT_KEY);
        const deepLink = `brainx://oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&returnTo=${encodeURIComponent(normalizeReturnTo(desktopIntent.returnTo))}`;
        window.location.replace(deepLink);
      }

      return () => {
        activeRef.current = false;
      };
    }

    completeOAuthLogin(provider, code, state)
      .then((data) => {
        if (!activeRef.current) return;
        pushToast("소셜 로그인이 완료되었습니다.", "ok");
        const returnTo = isElectronDesktop() ? queryReturnTo : consumeOAuthReturnTo();
        router.replace(data.next === "ONBOARDING" ? buildAuthPath("/onboarding", returnTo) : resolveAuthReturnTo(returnTo));
      })
      .catch((error) => {
        if (!activeRef.current) return;
        processedCallbackKeyRef.current = null;
        const nextMessage = error instanceof Error ? error.message : "소셜 로그인에 실패했습니다.";
        setMessage(nextMessage);
        pushToast(nextMessage, "err");
        router.replace("/login");
      });

    return () => {
      activeRef.current = false;
    };
  }, [provider, pushToast, router, searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-txt">
      <p className="text-[14px] text-txt2">{message}</p>
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
