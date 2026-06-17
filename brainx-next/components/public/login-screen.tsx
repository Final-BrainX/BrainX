"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { issueTemporaryPassword, loginLocal, requestEmailVerification, verifyEmailCode } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn } from "@/components/brainx-ui";
import { AuthShell, Field, SocialButtons } from "@/components/public/auth-shared";

type ResetStep = "idle" | "sent" | "verified";

export function LoginScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;
  const canRequestResetCode = resetEmail.trim().length > 0 && !resetSubmitting;
  const canVerifyResetCode = resetEmail.trim().length > 0 && verificationCode.trim().length > 0 && !resetSubmitting;
  const canIssueTemporaryPassword = resetStep === "verified" && canVerifyResetCode;

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

  const openReset = () => {
    setResetOpen(true);
    setResetEmail(email);
    setVerificationCode("");
    setResetStep("idle");
  };

  const handleRequestResetCode = async () => {
    if (!canRequestResetCode) return;
    setResetSubmitting(true);
    try {
      await requestEmailVerification(resetEmail.trim(), "PASSWORD_CHANGE");
      setResetStep("sent");
      pushToast("인증 코드가 이메일로 발송되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "인증 코드 요청에 실패했습니다.", "err");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleVerifyResetCode = async () => {
    if (!canVerifyResetCode) return;
    setResetSubmitting(true);
    try {
      await verifyEmailCode(resetEmail.trim(), verificationCode.trim(), "PASSWORD_CHANGE");
      setResetStep("verified");
      pushToast("이메일 인증이 완료되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "인증 코드가 올바르지 않습니다.", "err");
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleIssueTemporaryPassword = async () => {
    if (!canIssueTemporaryPassword) return;
    setResetSubmitting(true);
    try {
      await issueTemporaryPassword(resetEmail.trim(), verificationCode.trim());
      pushToast("임시 비밀번호를 이메일로 발송했습니다.", "ok");
      setEmail(resetEmail.trim());
      setPassword("");
      setResetOpen(false);
      setResetStep("idle");
      setVerificationCode("");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "임시 비밀번호 발급에 실패했습니다.", "err");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[28px] font-bold tracking-tight">다시 오신 걸 환영해요</h1>
      <p className="mb-7 text-[16px] text-txt2">BrainX 계정으로 로그인하세요.</p>
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
        placeholder="비밀번호 입력"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        disabled={submitting}
        right={
          <button type="button" onClick={openReset} className="text-[14px] font-normal text-primary">
            비밀번호 찾기
          </button>
        }
      />
      {resetOpen ? (
        <div className="mb-4 rounded-xl border border-line/60 bg-surface2/40 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-txt">임시 비밀번호 발급</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-txt3">
                이메일 인증이 완료되면 임시 비밀번호를 메일로 보내드립니다.
              </p>
            </div>
            <button type="button" onClick={() => setResetOpen(false)} className="text-[12.5px] text-txt3 hover:text-txt">
              닫기
            </button>
          </div>
          <Field
            label="계정 이메일"
            type="email"
            placeholder="you@brainx.app"
            value={resetEmail}
            onChange={(event) => {
              setResetEmail(event.target.value);
              setResetStep("idle");
            }}
            disabled={resetSubmitting}
          />
          <Btn variant="soft" className="mb-3 w-full" disabled={!canRequestResetCode} onClick={handleRequestResetCode}>
            {resetSubmitting && resetStep === "idle" ? "전송 중..." : "인증 코드 전송"}
          </Btn>
          <Field
            label="인증 코드"
            placeholder="6자리 숫자"
            value={verificationCode}
            onChange={(event) => {
              setVerificationCode(event.target.value);
              if (resetStep === "verified") setResetStep("sent");
            }}
            disabled={resetSubmitting || resetStep === "idle"}
          />
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="soft" disabled={!canVerifyResetCode || resetStep === "verified"} onClick={handleVerifyResetCode}>
              {resetStep === "verified" ? "인증 완료" : "코드 확인"}
            </Btn>
            <Btn variant="primary" disabled={!canIssueTemporaryPassword} onClick={handleIssueTemporaryPassword}>
              임시 비밀번호 발급
            </Btn>
          </div>
        </div>
      ) : null}
      <Btn variant="primary" size="lg" className="mt-2 w-full" disabled={!canSubmit} onClick={handleLogin}>
        {submitting ? "로그인 중..." : "로그인"}
      </Btn>
      <div className="my-6 flex items-center gap-3 text-[14px] text-txt3">
        <div className="h-px flex-1 bg-line/60" />
        또는
        <div className="h-px flex-1 bg-line/60" />
      </div>
      <SocialButtons />
      <p className="mt-7 text-center text-[15px] text-txt2">
        계정이 없으신가요?{" "}
        <button type="button" onClick={() => router.push("/signup")} className="font-medium text-primary">
          회원가입
        </button>
      </p>
    </AuthShell>
  );
}
