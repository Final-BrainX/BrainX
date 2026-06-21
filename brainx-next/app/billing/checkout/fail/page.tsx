"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { notifyOpenerAndClosePayment } from "@/lib/payment-popup";

function CheckoutFailContent() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("결제가 취소되었습니다.");

  useEffect(() => {
    const code = searchParams.get("code");
    const tossMessage = searchParams.get("message");
    const finalMessage = tossMessage ?? (code ? `결제에 실패했습니다. (${code})` : "결제가 취소되었습니다.");
    setMessage(finalMessage);
    notifyOpenerAndClosePayment(false, finalMessage);
  }, [searchParams]);

  return (
    <main className="grid min-h-full place-items-center bg-bg p-6 text-center text-txt">
      <p className="text-[14px] text-txt2">{message}</p>
    </main>
  );
}

export default function CheckoutFailPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutFailContent />
    </Suspense>
  );
}
