"use client";

import { usePathname, useRouter } from "next/navigation";
import { buildAuthPath } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";

export function AiUsageLimitModal() {
  const router = useRouter();
  const pathname = usePathname();
  const { aiUsageLimitReason, closeAiUsageLimitModal } = useBrainX();

  if (!aiUsageLimitReason) return null;

  const isGuest = aiUsageLimitReason === "GUEST_AI_CALL_LIMIT_EXCEEDED";
  const title = isGuest
    ? "BrainX를 사용해 주셔서 감사합니다"
    : "이번 달 AI 크레딧을 모두 사용했어요";
  const description = isGuest
    ? "더 똑똑한 응답, 노트 기반 검색 등 다양한 기능을 계속 이용하려면 로그인하거나 가입하세요."
    : "더 많은 크레딧으로 계속 이용하려면 플랜을 업그레이드하세요.";
  const primaryLabel = isGuest ? "로그인" : "플랜 업그레이드";
  const dismissLabel = isGuest ? "게스트로 계속 이용" : "닫기";

  function goPrimary() {
    closeAiUsageLimitModal();
    router.push(isGuest ? buildAuthPath("/login", pathname) : "/billing");
  }

  function goSignup() {
    closeAiUsageLimitModal();
    router.push(buildAuthPath("/signup", pathname));
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/55 px-4"
      role="presentation"
      onClick={closeAiUsageLimitModal}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-usage-limit-title"
        aria-describedby="ai-usage-limit-description"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line/70 bg-surface p-6 text-center shadow-2xl"
      >
        <h2 id="ai-usage-limit-title" className="text-[18px] font-bold leading-snug text-txt">
          {title}
        </h2>
        <p id="ai-usage-limit-description" className="mt-3 text-[13px] leading-6 text-txt3">
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={goPrimary}
            className="h-11 w-full rounded-full bg-gradient-to-b from-primary to-primary text-[14px] font-semibold text-white shadow-glow transition-all hover:brightness-110"
          >
            {primaryLabel}
          </button>
          {isGuest ? (
            <button
              type="button"
              onClick={goSignup}
              className="h-11 w-full rounded-full border border-line/70 text-[14px] font-semibold text-txt transition-colors hover:bg-surface2/70"
            >
              무료로 회원 가입
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={closeAiUsageLimitModal}
          className="mt-4 text-[12px] font-medium text-txt3 underline underline-offset-2 hover:text-txt2"
        >
          {dismissLabel}
        </button>
      </section>
    </div>
  );
}
