"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { notifyPopupResultAndClose } from "@/lib/desktop-bridge";
import {
  completeNotionOAuth,
  consumeNotionOAuthState,
  NOTION_OAUTH_MESSAGE_TYPE,
} from "@/lib/ingestion-api";

function notifyOpenerAndClose(success: boolean) {
  return notifyPopupResultAndClose(NOTION_OAUTH_MESSAGE_TYPE, { success });
}

function NotionCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [message, setMessage] = useState("Notion 연동을 마무리하는 중입니다.");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setMessage("Notion 연동 정보가 올바르지 않습니다.");
      void notifyOpenerAndClose(false).then((handled) => {
        if (handled) return;
        pushToast("Notion 연동 정보가 올바르지 않습니다.", "err");
        router.replace("/import");
      });
      return;
    }

    const expectedState = consumeNotionOAuthState();
    if (expectedState && expectedState !== state) {
      setMessage("Notion 연동 상태값이 일치하지 않습니다.");
      void notifyOpenerAndClose(false).then((handled) => {
        if (handled) return;
        pushToast("Notion 연동 상태값이 일치하지 않습니다.", "err");
        router.replace("/import");
      });
      return;
    }

    let mounted = true;

    completeNotionOAuth(code, state)
      .then(() => {
        if (!mounted) return;
        setMessage("Notion 연동이 완료됐습니다. 이 창은 닫아도 됩니다.");
        void notifyOpenerAndClose(true).then((handled) => {
          if (handled) return;
          pushToast("Notion 연동이 완료됐습니다.", "ok");
          router.replace("/import");
        });
      })
      .catch((error) => {
        if (!mounted) return;
        const nextMessage = error instanceof Error ? error.message : "Notion 연동에 실패했습니다.";
        setMessage(nextMessage);
        void notifyOpenerAndClose(false).then((handled) => {
          if (handled) return;
          pushToast(nextMessage, "err");
          router.replace("/import");
        });
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
