"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createCheckoutSession } from "@/lib/commerce-api";
import { notifyOpenerAndClosePayment } from "@/lib/payment-popup";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제창을 준비하는 중입니다…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const planId = searchParams.get("planId");
    if (!planId) {
      setFailed(true);
      setMessage("플랜 정보가 올바르지 않습니다. 이 창을 닫고 다시 시도해 주세요.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const origin = window.location.origin;
        const session = await createCheckoutSession(
          planId,
          `${origin}/billing/checkout/success`,
          `${origin}/billing/checkout/fail`
        );
        if (cancelled) return;

        if (!session.clientKey || !session.orderId || !session.amount || !session.orderName) {
          throw new Error("결제 정보를 생성하지 못했습니다.");
        }

        sessionStorage.setItem(
          "brainx_checkout_session_v1",
          JSON.stringify({ checkoutSessionId: session.checkoutSessionId })
        );

        const { loadTossPayments } = await import("@tosspayments/payment-sdk");
        const tossPayments = await loadTossPayments(session.clientKey);
        await tossPayments.requestPayment("카드", {
          amount: session.amount,
          orderId: session.orderId,
          orderName: session.orderName,
          successUrl: `${origin}/billing/checkout/success?checkoutSessionId=${session.checkoutSessionId}`,
          failUrl: `${origin}/billing/checkout/fail?checkoutSessionId=${session.checkoutSessionId}`
        });
        // requestPayment가 성공하면 브라우저가 successUrl/failUrl로 이동하므로 이 아래 코드는
        // 보통 실행되지 않는다. 사용자가 결제창을 닫는 등으로 취소하면 reject된다 (catch에서 처리).
      } catch (error) {
        if (cancelled) return;
        setFailed(true);
        // Toss SDK는 사용자가 결제창을 닫거나 취소하면 {code, message} 형태로 reject한다
        // (예: USER_CANCEL). Error 인스턴스가 아닐 수 있으므로 message 필드를 직접 읽어본다.
        const tossMessage = (error as { message?: string } | null)?.message;
        const finalMessage = tossMessage ?? "결제가 취소되었습니다.";
        setMessage(finalMessage);
        notifyOpenerAndClosePayment(false, finalMessage);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-center text-txt">
      <div>
        <p className="text-[14px] text-txt2">{message}</p>
        {failed && (
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-4 rounded-lg border border-line/60 px-3.5 py-2 text-[13px] font-medium text-txt2 hover:bg-surface2"
          >
            창 닫기
          </button>
        )}
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
