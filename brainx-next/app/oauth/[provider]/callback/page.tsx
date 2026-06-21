"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { completeOAuthLogin, type OAuthProvider } from "@/lib/auth-api";
import { AuthRequiredError, linkSocialAccount } from "@/lib/user-api";
import { useBrainX } from "@/components/brainx-provider";

const PROVIDERS = new Set(["kakao", "google", "apple", "naver"]);
const OAUTH_LINK_INTENT_KEY = "brainx_oauth_link_intent_v1";

function OAuthCallbackContent() {
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
    const linkIntent = (() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(OAUTH_LINK_INTENT_KEY);
        return raw ? (JSON.parse(raw) as { provider?: string; state?: string; returnTo?: string }) : null;
      } catch {
        return null;
      }
    })();

    if (linkIntent?.provider === provider && linkIntent.state === state) {
      setMessage("소셜 계정을 연결하는 중입니다.");
      linkSocialAccount(provider, code)
        .then(() => {
          if (!mounted) return;
          window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
          pushToast("소셜 계정이 연결되었습니다.", "ok");
          router.replace(linkIntent?.returnTo ?? "/mypage");
        })
        .catch((error) => {
          if (!mounted) return;
          window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
          const nextMessage = error instanceof Error ? error.message : "소셜 계정 연결에 실패했습니다.";
          setMessage(nextMessage);
          pushToast(nextMessage, "err");
          router.replace(error instanceof AuthRequiredError ? "/login" : linkIntent?.returnTo ?? "/mypage");
        });

      return () => {
        mounted = false;
      };
    }

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

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
