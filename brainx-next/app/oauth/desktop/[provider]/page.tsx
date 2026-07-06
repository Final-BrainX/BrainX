"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { getOAuthAuthorization, type OAuthProvider } from "@/lib/auth-api";

const PROVIDERS = new Set(["kakao", "google", "apple", "naver"]);
const DESKTOP_OAUTH_INTENT_KEY = "brainx_desktop_oauth_intent_v1";

function normalizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }
  return value;
}

function DesktopOAuthStartContent() {
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [message, setMessage] = useState("브라우저에서 BrainX 로그인 화면을 여는 중입니다.");

  const provider = useMemo(() => {
    const value = params.provider;
    return PROVIDERS.has(value) ? (value as OAuthProvider) : null;
  }, [params.provider]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!provider) {
      setMessage("지원하지 않는 소셜 로그인 제공자입니다.");
      return;
    }

    const returnTo = normalizeReturnTo(searchParams.get("returnTo"));

    getOAuthAuthorization(provider)
      .then((data) => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(
          DESKTOP_OAUTH_INTENT_KEY,
          JSON.stringify({
            provider,
            state: data.state,
            returnTo,
            createdAt: new Date().toISOString(),
          })
        );
        window.location.replace(data.authorizationUrl);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "소셜 로그인 브라우저 시작에 실패했습니다.");
      });
  }, [provider, searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-txt">
      <div className="max-w-[420px] text-center">
        <h1 className="text-[22px] font-semibold">BrainX Desktop Login</h1>
        <p className="mt-3 text-[14px] leading-6 text-txt2">{message}</p>
      </div>
    </main>
  );
}

export default function DesktopOAuthStartPage() {
  return (
    <Suspense fallback={null}>
      <DesktopOAuthStartContent />
    </Suspense>
  );
}
