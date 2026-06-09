"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Btn, Icon } from "@/components/brainx-ui";

import { AuthShell, Field } from "@/components/public/auth-shared";

export function SignupScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [agree, setAgree] = useState({
    tos: false,
    priv: false,
    mkt: false,
    beh: false
  });

  const terms = [
    { key: "tos", label: "[필수] 서비스 이용약관" },
    { key: "priv", label: "[필수] 개인정보 처리방침" },
    { key: "mkt", label: "[선택] 마케팅 정보 수신" },
    { key: "beh", label: "[선택] 행동 데이터 분석 동의" }
  ] as const;

  const canProceed = agree.tos && agree.priv;

  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">두뇌를 깨우는 1분</h1>
      <p className="mb-7 text-[14px] text-txt2">무료로 BrainX를 시작하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <Field label="인증 코드" placeholder="6자리 숫자" />
        </div>
        <Btn variant="soft" className="mb-4" onClick={() => pushToast("인증 코드를 전송했어요", "ok")}>
          코드 전송
        </Btn>
      </div>
      <Field label="비밀번호" type="password" placeholder="8자 이상" />
      <Field label="비밀번호 확인" type="password" placeholder="다시 입력" />
      <div className="my-4 space-y-1 rounded-xl bg-surface2/40 p-3">
        {terms.map((term) => (
          <button
            key={term.key}
            type="button"
            onClick={() => setAgree((current) => ({ ...current, [term.key]: !current[term.key] }))}
            className="flex h-8 w-full items-center gap-2.5 text-left"
          >
            <span
              className={cx(
                "grid h-5 w-5 place-items-center rounded-md border",
                agree[term.key] ? "border-primary bg-primary text-white" : "border-line"
              )}
            >
              {agree[term.key] ? <Icon name="check" size={13} /> : null}
            </span>
            <span className="text-[13px] text-txt2">{term.label}</span>
          </button>
        ))}
      </div>
      <Btn variant="primary" size="lg" className="w-full" disabled={!canProceed} onClick={() => router.push("/onboarding")}>
        가입하고 시작하기
      </Btn>
      <p className="mt-6 text-center text-[13px] text-txt2">
        이미 계정이 있으신가요?{" "}
        <button type="button" onClick={() => router.push("/login")} className="font-medium text-primary">
          로그인
        </button>
      </p>
    </AuthShell>
  );
}
