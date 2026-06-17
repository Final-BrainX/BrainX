"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { EMPTY_CONSENTS, requiredConsentsAccepted, type ConsentState } from "@/lib/legal";
import { requestEmailVerification, signupWithEmail, verifyEmailCode } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Icon } from "@/components/brainx-ui";
import { AuthShell, Field } from "@/components/public/auth-shared";
import { LegalConsents } from "@/components/public/legal-consents";

type VerificationStatus = "idle" | "sent" | "checking" | "verified" | "invalid";

export function SignupScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);

  const codeVerified = verificationStatus === "verified";
  const canSendCode = email.trim().length > 0 && !sendingCode;
  const canCheckCode =
    email.trim().length > 0 &&
    verificationCode.trim().length > 0 &&
    verificationStatus !== "checking" &&
    !submitting;
  const canProceed =
    requiredConsentsAccepted(consents) &&
    email.trim().length > 0 &&
    verificationCode.trim().length > 0 &&
    password.length > 0 &&
    passwordConfirm.length > 0 &&
    codeVerified &&
    !submitting;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setVerificationStatus("idle");
  };

  const handleCodeChange = (value: string) => {
    setVerificationCode(value);
    setVerificationStatus((current) => (current === "verified" ? "sent" : current));
  };

  const handleSendCode = async () => {
    if (!canSendCode) return;
    setSendingCode(true);
    try {
      await requestEmailVerification(email.trim(), "SIGNUP");
      setVerificationStatus("sent");
      pushToast("인증 코드가 이메일로 발송되었습니다.", "ok");
    } catch (error) {
      setVerificationStatus("idle");
      pushToast(error instanceof Error ? error.message : "인증 코드 요청에 실패했습니다.", "err");
    } finally {
      setSendingCode(false);
    }
  };

  const handleCheckCode = async () => {
    if (!canCheckCode) return;
    setVerificationStatus("checking");
    try {
      await verifyEmailCode(email.trim(), verificationCode.trim(), "SIGNUP");
      setVerificationStatus("verified");
      pushToast("인증 코드가 확인되었습니다.", "ok");
    } catch (error) {
      setVerificationStatus("invalid");
      pushToast(error instanceof Error ? error.message : "인증 코드가 올바르지 않습니다.", "err");
    }
  };

  const handleSignup = async () => {
    if (!canProceed) return;
    if (password !== passwordConfirm) {
      pushToast("비밀번호 확인이 일치하지 않습니다.", "err");
      return;
    }

    setSubmitting(true);
    try {
      const data = await signupWithEmail({
        email: email.trim(),
        verificationCode: verificationCode.trim(),
        password,
        passwordConfirm,
        consents: {
          termsRequired: consents.termsRequired,
          privacyRequired: consents.privacyRequired,
          marketingOptional: consents.marketingOptional,
          behaviorAnalyticsOptional: consents.behaviorAnalyticsOptional
        }
      });
      pushToast("회원가입이 완료되었습니다.", "ok");
      router.push(data.next === "ONBOARDING" ? "/onboarding" : "/home");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원가입에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[28px] font-bold tracking-tight">두뇌를 깨우는 1분</h1>
      <p className="mb-7 text-[16px] text-txt2">무료로 BrainX를 시작하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <div className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <Field label="인증 코드" placeholder="6자리 숫자" />
        </div>
        <Btn variant="soft" className="mb-1 px-3" disabled={!canSendCode || submitting} onClick={handleSendCode}>
          {sendingCode ? "전송 중..." : "코드 전송"}
        </Btn>
        <Btn variant={codeVerified ? "outline" : "soft"} className="mb-1 px-3" disabled={!canCheckCode} onClick={handleCheckCode}>
          {verificationStatus === "checking" ? "확인 중..." : codeVerified ? "확인됨" : "코드 확인"}
        </Btn>
      </div>
      {codeVerified ? (
        <p className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary">
          <Icon name="check" size={13} />
          인증이 완료되었습니다.
        </p>
      ) : null}
      {verificationStatus === "invalid" ? (
        <p className="mb-3 text-[12.5px] text-red-400">인증 코드가 올바르지 않습니다. 다시 확인해 주세요.</p>
      ) : null}
      <Field
        label="비밀번호"
        type="password"
        placeholder="8자 이상"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        disabled={submitting}
      />
      <Field
        label="비밀번호 확인"
        type="password"
        placeholder="다시 입력"
        value={passwordConfirm}
        onChange={(event) => setPasswordConfirm(event.target.value)}
        autoComplete="new-password"
        disabled={submitting}
      />
      <LegalConsents value={consents} onChange={setConsents} disabled={submitting} className="my-4" />
      <Btn variant="primary" size="lg" className="w-full" disabled={!canProceed} onClick={handleSignup}>
        {submitting ? "가입 중..." : "가입하고 시작하기"}
      </Btn>
      <p className="mt-6 text-center text-[15px] text-txt2">
        이미 계정이 있으신가요?{" "}
        <button type="button" onClick={() => router.push("/login")} className="font-medium text-primary">
          로그인
        </button>
      </p>
    </AuthShell>
  );
}
