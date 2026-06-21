"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { confirmCheckoutSession } from "@/lib/commerce-api";
import { notifyOpenerAndClosePayment } from "@/lib/payment-popup";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제를 승인하는 중입니다…");

  useEffect(() => {
    const checkoutSessionId = searchParams.get("checkoutSessionId");
    const paymentKey = searchParams.get("paymentKey");
    const orderId = searchParams.get("orderId");
    const amount = searchParams.get("amount");

    if (!checkoutSessionId || !paymentKey || !orderId || !amount) {
      const errorMessage = "결제 승인 정보가 올바르지 않습니다.";
      setMessage(errorMessage);
      notifyOpenerAndClosePayment(false, errorMessage);
      return;
    }

    let cancelled = false;

    confirmCheckoutSession(checkoutSessionId, paymentKey, orderId, Number(amount))
      .then((result) => {
        if (cancelled) return;
        const successMessage = `결제가 완료되었습니다. (${result.planId.toUpperCase()} 플랜)`;
        setMessage(successMessage);
        notifyOpenerAndClosePayment(true, successMessage);
      })
      .catch((error) => {
        if (cancelled) return;
        const errorMessage = error instanceof Error ? error.message : "결제 승인에 실패했습니다.";
        setMessage(errorMessage);
        notifyOpenerAndClosePayment(false, errorMessage);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-center text-txt">
      <p className="text-[14px] text-txt2">{message}</p>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
