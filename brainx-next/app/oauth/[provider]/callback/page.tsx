"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { completeOAuthLogin, type OAuthProvider } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";

const PROVIDERS = new Set(["kakao", "google", "apple", "naver"]);

export default function OAuthCallbackPage() {
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [message, setMessage] = useState("소셜 로그인을 완료하는 중입니다.");

  const provider = useMemo(() => {
    const value = params.provider;
    return PROVIDERS.has(value) ? (value as OAuthProvider) : null;
  }, [params.provider]);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!provider || !code || !state) {
      setMessage("소셜 로그인 정보가 올바르지 않습니다.");
      pushToast("소셜 로그인 정보가 올바르지 않습니다.", "err");
      router.replace("/login");
      return;
    }

    let mounted = true;
    completeOAuthLogin(provider, code, state)
      .then((data) => {
        if (!mounted) return;
        pushToast("소셜 로그인이 완료되었습니다.", "ok");
        router.replace(data.next === "ONBOARDING" ? "/onboarding" : "/home");
      })
      .catch((error) => {
        if (!mounted) return;
        const nextMessage = error instanceof Error ? error.message : "소셜 로그인에 실패했습니다.";
        setMessage(nextMessage);
        pushToast(nextMessage, "err");
        router.replace("/login");
      });

    return () => {
      mounted = false;
    };
  }, [provider, pushToast, router, searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-txt">
      <p className="text-[14px] text-txt2">{message}</p>
    </main>
  );
}
