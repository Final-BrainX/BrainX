"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { INTERESTS } from "@/lib/brainx-data";
import { EMPTY_CONSENTS, requiredConsentsAccepted, type ConsentState } from "@/lib/legal";
import { buildAuthPath, completeOnboarding, readAuthSession, readReturnToParam, resolveAuthReturnTo } from "@/lib/auth-api";
import { isElectronDesktop } from "@/lib/desktop-bridge";
import { updateMyProfile } from "@/lib/user-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";
import { Field } from "@/components/public/auth-shared";
import { LegalConsents } from "@/components/public/legal-consents";
import { useGuideStore } from "@/lib/use-guide-store";

export function OnboardingScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const markAsNewUserFirstLogin = useGuideStore((s) => s.markAsNewUserFirstLogin);
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const [hasAuthSession, setHasAuthSession] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);
  const [submitting, setSubmitting] = useState(false);
  const [returnTo] = useState(() => readReturnToParam());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requiresConsentStep = Boolean(onboardingToken);
  const stepSequence = requiresConsentStep ? [0, 1, 2, 3] : [0, 1, 3];
  const activeStepIndex = Math.max(0, stepSequence.indexOf(step));
  const progressPercent = ((activeStepIndex + 1) / stepSequence.length) * 100;

  useEffect(() => {
    const session = readAuthSession();
    setNick(session?.nickname ?? "");
    setProfileImageUrl(session?.profileImageUrl ?? "");
    setOnboardingToken(session?.onboardingToken ?? null);
    setHasAuthSession(Boolean(session?.accessToken));
  }, []);

  const avatarInitial = useMemo(() => nick.trim()[0]?.toUpperCase() ?? "?", [nick]);

  const toggle = (item: string) => {
    setSelected((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]));
  };

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      pushToast("이미지 파일만 업로드할 수 있습니다.", "err");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileImageUrl(typeof reader.result === "string" ? reader.result : "");
      pushToast("프로필 사진이 변경되었습니다.", "ok");
    };
    reader.onerror = () => {
      pushToast("이미지를 불러오지 못했습니다.", "err");
    };
    reader.readAsDataURL(file);
  };

  const handleComplete = async () => {
    if (!nick.trim()) {
      pushToast("이름을 입력해 주세요.", "err");
      setStep(0);
      return;
    }
    if (requiresConsentStep && !requiredConsentsAccepted(consents)) {
      pushToast("필수 약관에 동의해 주세요.", "err");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      if (onboardingToken) {
        await completeOnboarding({
          onboardingToken,
          nickname: nick.trim(),
          profileImageUrl: profileImageUrl.trim() || null,
          interests: selected,
          consents,
        });
      } else if (hasAuthSession) {
        await updateMyProfile({
          nickname: nick.trim(),
          profileImageAssetId: profileImageUrl.trim() || null,
        });
      } else {
        pushToast("로그인이 필요합니다.", "err");
        router.push(buildAuthPath("/login", returnTo));
        return;
      }
      pushToast("온보딩이 완료되었습니다.", "ok");
      markAsNewUserFirstLogin();
      router.push(isElectronDesktop() && returnTo === "/home" ? "/" : resolveAuthReturnTo(returnTo));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "온보딩 완료에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  const goPrev = () => setStep((current) => stepSequence[Math.max(0, stepSequence.indexOf(current) - 1)] ?? current);
  const goNext = () => setStep((current) => stepSequence[Math.min(stepSequence.length - 1, stepSequence.indexOf(current) + 1)] ?? current);

  return (
    <div data-route className="scroll relative flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <Card glow className="relative flex h-[620px] w-full max-w-[620px] flex-col overflow-hidden p-0">
        <div className="border-b border-line/40 px-8 pt-7">
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="relative flex-1 px-8 py-8">
          {/* <button
            type="button"
            onClick={goPrev}
            disabled={activeStepIndex <= 0 || submitting}
            aria-label="이전 단계"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line/50 bg-surface/90 p-3 text-txt shadow-soft transition hover:bg-surface disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={activeStepIndex >= stepSequence.length - 1 || submitting}
            aria-label="다음 단계"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line/50 bg-surface/90 p-3 text-txt shadow-soft transition hover:bg-surface disabled:pointer-events-none disabled:opacity-35"
          >
            <ChevronRight size={22} />
          </button> */}

          <div className="flex h-full flex-col justify-between gap-6 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {step === 0 ? (
                <>
                  <div className="mb-3 flex items-center gap-5">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                      <Icon name="user" size={26} />
                    </div>
                    <h1 className="text-[26px] font-bold tracking-tight">어떻게 불러드릴까요?</h1>
                  </div>
                  <p className="mb-6 text-[16px] text-txt2">프로필은 나중에 언제든 바꿀 수 있어요.</p>
                  <div className="mb-5 flex items-center gap-4">
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt="프로필 이미지" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white">
                        {avatarInitial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleProfileImageChange}
                      />
                      <Btn variant="soft" size="lg" icon="upload" onClick={() => fileInputRef.current?.click()}>
                        이미지 업로드
                      </Btn>
                    </div>
                  </div>
                  <Field label="이름" placeholder="사용할 이름" value={nick} onChange={(event) => setNick(event.target.value)} />
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div className="mb-3 flex items-center gap-5">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                      <Icon name="sparkle" size={26} />
                    </div>
                    <h1 className="text-[26px] font-bold tracking-tight">관심 분야를 알려주세요</h1>
                  </div>
                  <p className="mb-6 text-[16px] text-txt2">AI가 노트를 더 똑똑하게 연결하고 추천해요.</p>
                  <div className="mb-6 flex flex-wrap gap-2">
                    {INTERESTS.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggle(interest)}
                        className={`h-9 rounded-full border px-4 text-[15.5px] font-medium transition-all ${
                          selected.includes(interest) ? "border-primary bg-primary text-white" : "border-line text-txt2 hover:border-primary/50"
                        }`}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="mb-3 flex items-center gap-5">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                      <Icon name="shield" size={26} />
                    </div>
                    <h1 className="text-[24px] font-bold tracking-tight">약관에 동의해 주세요</h1>
                  </div>
                  <p className="mb-5 text-[14px] leading-relaxed text-txt2">
                    소셜 계정으로 새 BrainX 계정을 만들기 전에 서비스 이용과 개인정보 처리에 대한 동의가 필요합니다.
                  </p>
                  <LegalConsents value={consents} onChange={setConsents} disabled={submitting} className="mb-6" />
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="mb-3 flex items-center gap-5">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                      <Icon name="sparkle" size={26} />
                    </div>
                    <h1 className="text-[26px] font-bold tracking-tight">AI 개인화 준비 완료</h1>
                  </div>
                  <p className="mb-6 text-[16px] leading-relaxed text-txt2">
                    이제 노트를 쓰면 BrainX가 자동으로 정리·연결하고, 필요할 때 근거 있는 답을 찾아드릴게요. 첫 노트를 함께 시작해요.
                  </p>
                  <div className="mb-6 space-y-2.5 rounded-xl bg-surface2/40 p-4">
                    {["관심 분야 기반 자동 태깅", "노트 간 AI 연결 추천", "내 자료 기반 RAG 챗봇"].map((item) => (
                      <div key={item} className="flex items-center gap-2.5 text-[15.5px] text-txt2">
                        <Icon name="check" size={16} className="text-cyan" />
                        {item}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-line/40 pt-5">
              <div className="flex items-center gap-2">
                <Btn variant="soft" size="lg" className="flex-1" onClick={goPrev} disabled={activeStepIndex <= 0 || submitting}>
                  이전
                </Btn>
                {step === 3 ? (
                  <Btn variant="primary" size="lg" className="flex-1" icon="bolt" disabled={submitting || !requiredConsentsAccepted(consents)} onClick={handleComplete}>
                    {submitting ? "저장 중..." : "회원가입 완료"}
                  </Btn>
                ) : (
                  <Btn
                    variant="primary"
                    size="lg"
                    className="flex-1"
                    disabled={submitting || (step === 0 ? !nick.trim() : step === 2 ? !requiredConsentsAccepted(consents) : false)}
                    onClick={goNext}
                  >
                    다음{step === 1 ? ` (${selected.length})` : ""}
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
