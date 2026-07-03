"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { completeNotionOAuth, consumeNotionOAuthState, NOTION_OAUTH_MESSAGE_TYPE } from "@/lib/ingestion-api";
import { useBrainX } from "@/components/brainx-provider";

function isPopup() {
  return typeof window !== "undefined" && !!window.opener && window.opener !== window;
}

function notifyOpenerAndClose(success: boolean) {
  if (!isPopup()) return false;
  window.opener.postMessage({ type: NOTION_OAUTH_MESSAGE_TYPE, success }, window.location.origin);
  window.close();
  return true;
}

function NotionCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [message, setMessage] = useState("Notion 연동을 완료하는 중입니다.");
  // reactStrictMode(next.config.mjs)가 개발 모드에서 이 effect를 두 번 실행한다. code는
  // 1회용이라 두 번째 실행이 같은 code로 교환을 시도하면 Notion이 거부해 실패 메시지가
  // 뜬다 — 한 번만 실제로 처리되도록 막는다.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setMessage("Notion 연동 정보가 올바르지 않습니다.");
      if (!notifyOpenerAndClose(false)) {
        pushToast("Notion 연동 정보가 올바르지 않습니다.", "err");
        router.replace("/import");
      }
      return;
    }

    const expectedState = consumeNotionOAuthState();
    if (expectedState && expectedState !== state) {
      setMessage("Notion 연동 상태값이 일치하지 않습니다.");
      if (!notifyOpenerAndClose(false)) {
        pushToast("Notion 연동 상태값이 일치하지 않습니다.", "err");
        router.replace("/import");
      }
      return;
    }

    let mounted = true;
    completeNotionOAuth(code, state)
      .then(() => {
        if (!mounted) return;
        setMessage("Notion 연동이 완료되었습니다. 이 창은 닫아도 됩니다.");
        if (!notifyOpenerAndClose(true)) {
          pushToast("Notion 연동이 완료되었습니다.", "ok");
          router.replace("/import");
        }
      })
      .catch((error) => {
        if (!mounted) return;
        const nextMessage = error instanceof Error ? error.message : "Notion 연동에 실패했습니다.";
        setMessage(nextMessage);
        if (!notifyOpenerAndClose(false)) {
          pushToast(nextMessage, "err");
          router.replace("/import");
        }
      });

    return () => {
      mounted = false;
    };
  }, [pushToast, router, searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-txt">
      <p className="text-[14px] text-txt2">{message}</p>
    </main>
  );
}

export default function NotionCallbackPage() {
  return (
    <Suspense fallback={null}>
      <NotionCallbackContent />
    </Suspense>
  );
}
