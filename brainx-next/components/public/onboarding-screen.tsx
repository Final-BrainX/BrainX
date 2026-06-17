"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { INTERESTS } from "@/lib/brainx-data";
import { EMPTY_CONSENTS, requiredConsentsAccepted, type ConsentState } from "@/lib/legal";
import { cx } from "@/lib/utils";
import { completeOnboarding, readAuthSession } from "@/lib/auth-api";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";
import { Field } from "@/components/public/auth-shared";
import { LegalConsents } from "@/components/public/legal-consents";

export function OnboardingScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const session = readAuthSession();
    setNick(session?.nickname ?? "");
    setProfileImageUrl(session?.profileImageUrl ?? "");
    setOnboardingToken(session?.onboardingToken ?? null);
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
    if (!onboardingToken) {
      pushToast("온보딩 토큰이 없습니다. 소셜 로그인을 다시 시도해 주세요.", "err");
      router.push("/login");
      return;
    }
    if (!nick.trim()) {
      pushToast("이름을 입력해 주세요.", "err");
      setStep(0);
      return;
    }
    if (!requiredConsentsAccepted(consents)) {
      pushToast("필수 약관에 동의해 주세요.", "err");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      await completeOnboarding({
        onboardingToken,
        nickname: nick.trim(),
        profileImageUrl: profileImageUrl.trim() || null,
        interests: selected,
        consents
      });
      pushToast("온보딩이 완료되었습니다.", "ok");
      router.push("/home");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "온보딩 완료에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-route className="scroll relative flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Card glow className="relative w-full max-w-lg p-8">
        <div className="mb-7 flex items-center gap-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={cx("h-1.5 flex-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-surface2")} />
          ))}
        </div>

        {step === 0 ? (
          <>
            <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">어떻게 불러드릴까요?</h1>
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
                <Btn variant="soft" icon="upload" onClick={() => fileInputRef.current?.click()}>
                  이미지 업로드
                </Btn>
              </div>
            </div>
            <Field label="이름" placeholder="사용할 이름" value={nick} onChange={(event) => setNick(event.target.value)} />
            <Btn variant="primary" size="lg" className="mt-2 w-full" disabled={!nick.trim()} onClick={() => setStep(1)}>
              다음
            </Btn>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">관심 분야를 알려주세요</h1>
            <p className="mb-6 text-[16px] text-txt2">AI가 노트를 더 똑똑하게 연결하고 추천해요.</p>
            <div className="mb-6 flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggle(interest)}
                  className={cx(
                    "h-9 rounded-full border px-4 text-[15.5px] font-medium transition-all",
                    selected.includes(interest) ? "border-primary bg-primary text-white" : "border-line text-txt2 hover:border-primary/50"
                  )}
                >
                  {interest}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => setStep(0)}>
                이전
              </Btn>
              <Btn variant="primary" size="lg" className="flex-1" onClick={() => setStep(2)}>
                다음 ({selected.length})
              </Btn>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Icon name="shield" size={26} />
            </div>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">약관에 동의해 주세요</h1>
            <p className="mb-5 text-[14px] leading-relaxed text-txt2">
              소셜 계정으로 새 BrainX 계정을 만들기 전에 서비스 이용과 개인정보 처리에 대한 동의가 필요합니다.
            </p>
            <LegalConsents value={consents} onChange={setConsents} disabled={submitting} className="mb-6" />
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => setStep(1)} disabled={submitting}>
                이전
              </Btn>
              <Btn variant="primary" size="lg" className="flex-1" disabled={!requiredConsentsAccepted(consents)} onClick={() => setStep(3)}>
                다음
              </Btn>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow">
              <Icon name="sparkle" size={26} className="text-white" />
            </div>
            <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">AI 개인화 준비 완료</h1>
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
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => setStep(2)} disabled={submitting}>
                이전
              </Btn>
              <Btn variant="primary" size="lg" className="flex-1" icon="bolt" disabled={submitting} onClick={handleComplete}>
                {submitting ? "저장 중..." : "회원가입 완료"}
              </Btn>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
