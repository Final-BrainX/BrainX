"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { loginLocal } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn } from "@/components/brainx-ui";
import { AuthShell, Field, SocialButtons } from "@/components/public/auth-shared";

export function LoginScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const data = await loginLocal(email.trim(), password);
      if (data.requires2fa) {
        pushToast("2단계 인증이 필요합니다.", "info");
        return;
      }
      pushToast("로그인 성공", "ok");
      router.push(data.next === "ONBOARDING" ? "/onboarding" : "/home");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "로그인에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">다시 만나서 반가워요</h1>
      <p className="mb-7 text-[14px] text-txt2">BrainX 계정으로 로그인하세요.</p>
      <Field
        label="이메일"
        type="email"
        placeholder="you@brainx.app"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        disabled={submitting}
      />
      <Field
        label="비밀번호"
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        disabled={submitting}
        right={
          <button type="button" className="text-[12px] font-normal text-primary">
            비밀번호 찾기
          </button>
        }
      />
      <Btn variant="primary" size="lg" className="mt-2 w-full" disabled={!canSubmit} onClick={handleLogin}>
        {submitting ? "로그인 중..." : "로그인"}
      </Btn>
      <div className="my-6 flex items-center gap-3 text-[12px] text-txt3">
        <div className="h-px flex-1 bg-line/60" />
        또는
        <div className="h-px flex-1 bg-line/60" />
      </div>
      <SocialButtons />
      <p className="mt-7 text-center text-[13px] text-txt2">
        계정이 없으신가요?{" "}
        <button type="button" onClick={() => router.push("/signup")} className="font-medium text-primary">
          회원가입
        </button>
      </p>
    </AuthShell>
  );
}
