"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createCheckoutSession } from "@/lib/commerce-api";
import { closeCurrentPopupWindow } from "@/lib/desktop-bridge";
import { notifyOpenerAndClosePayment } from "@/lib/payment-popup";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제창을 준비하는 중입니다.");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const planId = searchParams.get("planId");
    const billingCycle = searchParams.get("billingCycle");

    if (!planId) {
      setFailed(true);
      setMessage("플랜 정보가 올바르지 않습니다. 이 창을 닫고 다시 시도해 주세요.");
      return;
    }

    if (billingCycle !== "MONTHLY" && billingCycle !== "YEARLY") {
      setFailed(true);
      setMessage("결제 주기 정보가 올바르지 않습니다. 이 창을 닫고 다시 시도해 주세요.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const origin = window.location.origin;
        const session = await createCheckoutSession(
          planId,
          billingCycle,
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
          failUrl: `${origin}/billing/checkout/fail?checkoutSessionId=${session.checkoutSessionId}`,
        });
      } catch (error) {
        if (cancelled) return;
        setFailed(true);
        const tossMessage = (error as { message?: string } | null)?.message;
        const finalMessage = tossMessage ?? "결제가 취소되었습니다.";
        setMessage(finalMessage);
        void notifyOpenerAndClosePayment(false, finalMessage);
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
        {failed ? (
          <button
            type="button"
            onClick={() => void closeCurrentPopupWindow()}
            className="mt-4 rounded-lg border border-line/60 px-3.5 py-2 text-[13px] font-medium text-txt2 hover:bg-surface2"
          >
            창 닫기
          </button>
        ) : null}
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
