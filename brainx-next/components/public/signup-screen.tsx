"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { allConsents, EMPTY_CONSENTS, LEGAL_DOCUMENTS, type ConsentKey, type ConsentState } from "@/lib/legal";
import { checkEmailAvailability, requestEmailVerification, signupWithEmail, verifyEmailCode } from "@/lib/auth-api";
import { cx } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Icon } from "@/components/brainx-ui";
import { AuthShell, Field } from "@/components/public/auth-shared";

type VerificationStatus = "idle" | "sent" | "checking" | "verified" | "invalid";
type EmailAvailabilityStatus = "idle" | "checking" | "available" | "unavailable";

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const passed = checks.filter(Boolean).length;

  if (password.length === 0) {
    return {
      score: 0,
      label: "비밀번호를 입력해 주세요.",
      textClass: "text-txt3",
      barClass: "bg-line/50"
    };
  }
  if (passed <= 2) {
    return {
      score: 1,
      label: "약함 · 영문, 숫자, 특수문자를 포함해 8자 이상 입력해 주세요.",
      textClass: "text-red-400",
      barClass: "bg-red-400"
    };
  }
  if (passed === 3) {
    return {
      score: 2,
      label: "보통 · 한 가지 조건을 더 채우면 안전해요.",
      textClass: "text-amber-500",
      barClass: "bg-amber-400"
    };
  }
  return {
    score: 3,
    label: "안전 · 사용 가능한 비밀번호입니다.",
    textClass: "text-primary",
    barClass: "bg-primary"
  };
}

export function SignupScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailAvailabilityStatus, setEmailAvailabilityStatus] = useState<EmailAvailabilityStatus>("idle");
  const [checkedEmail, setCheckedEmail] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);
  const [expandedSlugs, setExpandedSlugs] = useState<string[]>([]);

  const allConsented = LEGAL_DOCUMENTS.every((document) => consents[document.consentKey]);

  const toggleConsent = (key: ConsentKey) => {
    setConsents((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleAllConsents = () => {
    setConsents(allConsents(!allConsented));
  };

  const toggleExpanded = (slug: string) => {
    setExpandedSlugs((current) => (current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug]));
  };

  const codeVerified = verificationStatus === "verified";
  const emailChecked = emailAvailabilityStatus === "available" && checkedEmail === email.trim();
  const passwordStrength = getPasswordStrength(password);
  const passwordMeetsPolicy = passwordStrength.score === 3;
  const passwordConfirmTouched = passwordConfirm.length > 0;
  const passwordMatches = passwordConfirmTouched && password === passwordConfirm;
  const passwordMismatch = passwordConfirmTouched && password !== passwordConfirm;
  const requiredOnlyConsentsAccepted = consents.termsRequired && consents.privacyRequired;
  const canCheckEmail = email.trim().length > 0 && emailAvailabilityStatus !== "checking" && !submitting;
  const canSendCode = emailChecked && !sendingCode;
  const canCheckCode =
    email.trim().length > 0 &&
    verificationCode.trim().length > 0 &&
    verificationStatus !== "checking" &&
    !submitting;
  const canProceed =
    requiredOnlyConsentsAccepted &&
    email.trim().length > 0 &&
    verificationCode.trim().length > 0 &&
    passwordMeetsPolicy &&
    passwordMatches &&
    codeVerified &&
    !submitting;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setCheckedEmail("");
    setEmailAvailabilityStatus("idle");
    setVerificationCode("");
    setVerificationStatus("idle");
  };

  const handleCodeChange = (value: string) => {
    setVerificationCode(value);
    setVerificationStatus((current) => (current === "verified" ? "sent" : current));
  };

  const handleCheckEmail = async () => {
    if (!canCheckEmail) return;
    const normalizedEmail = email.trim();
    setEmailAvailabilityStatus("checking");
    try {
      const data = await checkEmailAvailability(normalizedEmail);
      if (!data.available) {
        setCheckedEmail("");
        setEmailAvailabilityStatus("unavailable");
        pushToast("이미 가입된 이메일입니다.", "err");
        return;
      }
      setCheckedEmail(normalizedEmail);
      setEmailAvailabilityStatus("available");
      pushToast("사용 가능한 이메일입니다.", "ok");
    } catch (error) {
      setCheckedEmail("");
      setEmailAvailabilityStatus("idle");
      pushToast(error instanceof Error ? error.message : "이메일 중복 확인에 실패했습니다.", "err");
    }
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
      router.push("/onboarding");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원가입에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-[600px] px-6 py-5 [&_input]:h-9 [&_input]:rounded-lg [&_input]:text-[14px]">
          <h1 className="mb-1 text-[24px] font-bold tracking-tight text-txt">두뇌를 깨우는 1분</h1>
          <p className="mb-4 text-[14px] text-txt2">무료로 BrainX를 시작하세요.</p>
      <div className="mb-1 flex items-start gap-2">
        <div className="flex-1 [&>div]:mb-0">
          <Field
            label="이메일"
            type="email"
            placeholder="you@brainx.app"
            value={email}
            onChange={(event) => handleEmailChange(event.target.value)}
            autoComplete="email"
            disabled={submitting}
          />
        </div>
        <Btn variant={emailChecked ? "outline" : "soft"} size="sm" className="mt-[25px] h-9 shrink-0 px-3 text-[13px]" disabled={!canCheckEmail} onClick={handleCheckEmail}>
          {emailAvailabilityStatus === "checking" ? "확인 중..." : emailChecked ? "확인됨" : "중복 확인"}
        </Btn>
      </div>
      {emailAvailabilityStatus === "available" ? (
        <p className="mb-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary">
          <Icon name="check" size={13} />
          사용 가능한 이메일입니다.
        </p>
      ) : null}
      {emailAvailabilityStatus === "unavailable" ? (
        <p className="mb-2 break-keep text-[12px] leading-snug text-red-400">이미 가입된 이메일입니다. 다른 이메일을 입력해 주세요.</p>
      ) : null}
      <div className="mb-2 flex items-start gap-2">
        <div className="flex-1 [&>div]:mb-0">
          <Field
            label="인증 코드"
            placeholder="6자리 숫자"
            value={verificationCode}
            onChange={(event) => handleCodeChange(event.target.value)}
            disabled={submitting || verificationStatus === "idle"}
          />
          {codeVerified ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary">
              <Icon name="check" size={13} />
              인증이 완료되었습니다.
            </p>
          ) : null}
          {verificationStatus === "invalid" ? (
            <p className="mt-1 text-[12px] text-red-400">인증 코드가 올바르지 않습니다. 다시 확인해 주세요.</p>
          ) : null}
        </div>
        <Btn variant="accent" size="sm" icon="send" className="mt-[25px] h-9 shrink-0 px-3 text-[13px]" disabled={!canSendCode || submitting} onClick={handleSendCode}>
          {sendingCode ? "전송 중..." : "코드 전송"}
        </Btn>
        <Btn variant={codeVerified ? "outline" : "primary"} size="sm" icon={codeVerified ? "check" : undefined} className="mt-[25px] h-9 shrink-0 px-3 text-[13px]" disabled={!canCheckCode} onClick={handleCheckCode}>
          {verificationStatus === "checking" ? "확인 중..." : codeVerified ? "확인됨" : "코드 확인"}
        </Btn>
      </div>
      <div className="mb-3 [&>div]:mb-0">
        <Field
          label="비밀번호"
          type="password"
          placeholder="8자 이상"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          disabled={submitting}
        />
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {[1, 2, 3].map((step) => (
            <span key={step} className={`h-1 rounded-full ${passwordStrength.score >= step ? passwordStrength.barClass : "bg-line/50"}`} />
          ))}
        </div>
        <p className={`mt-1 text-[12px] leading-snug ${passwordStrength.textClass}`}>{passwordStrength.label}</p>
      </div>
      <div className="mb-3 [&>div]:mb-0">
        <Field
          label="비밀번호 확인"
          type="password"
          placeholder="다시 입력"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
          disabled={submitting}
        />
        {passwordMatches ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary">
            <Icon name="check" size={13} />
            비밀번호가 일치합니다.
          </p>
        ) : null}
        {passwordMismatch ? (
          <p className="mt-1 text-[12px] text-red-400">비밀번호 확인이 일치하지 않습니다.</p>
        ) : null}
      </div>
      <div className="my-3 rounded-xl border border-line/60 bg-surface2/40 p-2.5">
        <button
          type="button"
          onClick={toggleAllConsents}
          disabled={submitting}
          className={cx(
            "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-60",
            allConsented ? "border-primary/60 bg-primary/10" : "border-line/70 bg-surface/40 hover:border-primary/40"
          )}
        >
          <span
            className={cx(
              "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
              allConsented ? "border-primary bg-primary text-white" : "border-line bg-surface/60 text-transparent"
            )}
          >
            <Icon name="check" size={13} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-txt">모두 동의하기</span>
            <span className="block text-[11px] text-txt3">필수·선택 항목 전체 동의</span>
          </span>
        </button>

        <div className="mt-2 space-y-1">
          {LEGAL_DOCUMENTS.map((document) => {
            const checked = consents[document.consentKey];
            const expanded = expandedSlugs.includes(document.slug);
            return (
              <div
                key={document.slug}
                className={cx(
                  "overflow-hidden rounded-lg border transition-colors",
                  checked ? "border-primary/45 bg-primary/[0.06]" : "border-line/60 bg-surface/30"
                )}
              >
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <button
                    type="button"
                    aria-label={`${document.shortLabel} 동의`}
                    aria-pressed={checked}
                    onClick={() => toggleConsent(document.consentKey)}
                    disabled={submitting}
                    className={cx(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-60",
                      checked ? "border-primary bg-primary text-white" : "border-line bg-surface/60 text-transparent"
                    )}
                  >
                    <Icon name="check" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(document.slug)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-txt">{document.shortLabel}</span>
                      <span className="block truncate text-[10.5px] text-txt3">{document.summary}</span>
                    </span>
                    <span
                      className={cx(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-medium",
                        document.required ? "border-primary/30 bg-primary/10 text-primary" : "border-line/70 bg-surface2/60 text-txt3"
                      )}
                    >
                      {document.required ? "필수" : "선택"}
                    </span>
                    <Icon name="chevD" size={16} className={cx("shrink-0 text-txt3 transition-transform duration-300", expanded ? "rotate-180" : "")} />
                  </button>
                </div>
                <div className={cx("grid transition-all duration-300 ease-out", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden">
                    <div className="scroll max-h-[96px] space-y-2 overflow-y-auto border-t border-line/50 px-3 py-2 text-[12px] leading-relaxed text-txt2">
                      <p className="break-keep">{document.summary}</p>
                      {document.sections.map((section) => (
                        <div key={section.title}>
                          <p className="mb-0.5 text-[12px] font-semibold text-txt">{section.title}</p>
                          {section.body.map((paragraph, index) => (
                            <p key={index} className="break-keep text-txt3">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ))}
                      <a
                        href={`/legal/${document.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                      >
                        전문 보기
                        <Icon name="chevR" size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Btn variant="primary" size="md" className="h-10 w-full text-[15px]" disabled={!canProceed} onClick={handleSignup}>
        {submitting ? "가입 중..." : "가입하고 시작하기"}
      </Btn>
      <p className="mt-4 text-center text-[13.5px] text-txt2">
        이미 계정이 있으신가요?{" "}
        <button type="button" onClick={() => router.push("/login")} className="font-medium text-primary">
          로그인
        </button>
      </p>
      </div>
    </AuthShell>
  );
}
