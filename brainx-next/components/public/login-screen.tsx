"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { issueTemporaryPassword, loginLocal, readRecentSocialLoginProvider, requestEmailVerification, verifyEmailCode } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn } from "@/components/brainx-ui";
import { AuthShell, Field, SocialButtons } from "@/components/public/auth-shared";

type ResetStep = "idle" | "sent" | "verified";
type LoginFieldErrors = {
  email?: string;
  password?: string;
};

type RecentSocialLoginProvider = "google" | "kakao" | "naver";

export function LoginScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [resetEmail, setResetEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [recentLogin, setRecentLogin] = useState<"google" | "kakao" | "naver" | null>(() => readRecentSocialLoginProvider());

  useEffect(() => {
    const syncRecentLogin = () => {
      setRecentLogin(readRecentSocialLoginProvider() as RecentSocialLoginProvider | null);
    };

    syncRecentLogin();
    window.addEventListener("storage", syncRecentLogin);
    window.addEventListener("brainx-auth-session-changed", syncRecentLogin);

    return () => {
      window.removeEventListener("storage", syncRecentLogin);
      window.removeEventListener("brainx-auth-session-changed", syncRecentLogin);
    };
  }, []);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;
  const canRequestResetCode = resetEmail.trim().length > 0 && !resetSubmitting;
  const canVerifyResetCode = resetEmail.trim().length > 0 && verificationCode.trim().length > 0 && !resetSubmitting;
  const canIssueTemporaryPassword = resetStep === "verified" && canVerifyResetCode;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setFieldErrors({});
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
      const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
      if (message.includes("존재하지 않는 이메일")) {
        setFieldErrors({ email: "이메일이 존재하지 않습니다." });
        return;
      }
      if (message.includes("비밀번호")) {
        setFieldErrors({ password: "올바른 비밀번호를 입력하세요." });
        return;
      }
      pushToast(message, "err");
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
        onChange={(event) => {
          setEmail(event.target.value);
          if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
        }}
        autoComplete="email"
        disabled={submitting}
        error={fieldErrors.email}
      />
      <Field
        label="비밀번호"
        type="password"
        placeholder="비밀번호 입력"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
        }}
        autoComplete="current-password"
        disabled={submitting}
        error={fieldErrors.password}
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
      <div className="my-5 flex items-center gap-3 text-[14px] text-txt3">
        <div className="h-px flex-1 bg-line/60" />
        또는
        <div className="h-px flex-1 bg-line/60" />
      </div>
      <SocialButtons recentLogin={recentLogin} />
      <p className="mt-12 text-center text-[15px] text-txt2">
        계정이 없으신가요?{" "}
        <button type="button" onClick={() => router.push("/signup")} className="font-medium text-primary">
          회원가입
        </button>
      </p>
    </AuthShell>
  );
}
