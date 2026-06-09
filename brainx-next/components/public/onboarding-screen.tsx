"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { INTERESTS } from "@/lib/brainx-data";

import { cx } from "@/lib/utils";

import { useBrainX } from "@/components/brainx-provider";

import { Btn, Card, Icon, ThemeToggle } from "@/components/brainx-ui";

import { Field } from "@/components/public/auth-shared";

export function OnboardingScreen() {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (item: string) => {
    setSelected((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]));
  };

  return (
    <div data-route className="relative flex h-full items-center justify-center overflow-y-auto p-6 scroll">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Card glow className="relative w-full max-w-lg p-8">
        <div className="mb-7 flex items-center gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className={cx("h-1.5 flex-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-surface2")} />
          ))}
        </div>

        {step === 0 ? (
          <>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">어떻게 불러드릴까요?</h1>
            <p className="mb-6 text-[14px] text-txt2">프로필은 나중에 언제든 바꿀 수 있어요.</p>
            <div className="mb-5 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white">
                {nick[0] || "?"}
              </div>
              <Btn variant="soft" icon="upload" onClick={() => pushToast("이미지를 업로드했어요", "ok")}>
                이미지 업로드
              </Btn>
            </div>
            <Field label="닉네임" placeholder="예: 연우" value={nick} onChange={(event) => setNick(event.target.value)} />
            <Btn variant="primary" size="lg" className="mt-2 w-full" onClick={() => setStep(1)}>
              다음
            </Btn>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">관심 분야를 알려주세요</h1>
            <p className="mb-6 text-[14px] text-txt2">AI가 노트를 더 똑똑하게 연결하고 추천해요.</p>
            <div className="mb-6 flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggle(interest)}
                  className={cx(
                    "h-9 rounded-full border px-4 text-[13.5px] font-medium transition-all",
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
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow">
              <Icon name="sparkle" size={26} className="text-white" />
            </div>
            <h1 className="mb-1.5 text-[24px] font-bold tracking-tight">AI 개인화 준비 완료</h1>
            <p className="mb-6 text-[14px] leading-relaxed text-txt2">
              이제 노트를 쓰면 BrainX가 자동으로 정리·연결하고, 필요할 때 근거 있는 답을 찾아드릴게요. 첫 노트를 함께 시작해요.
            </p>
            <div className="mb-6 space-y-2.5 rounded-xl bg-surface2/40 p-4">
              {["관심 분야 기반 자동 태깅", "노트 간 AI 연결 추천", "내 자료 기반 RAG 챗봇"].map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-[13.5px] text-txt2">
                  <Icon name="check" size={16} className="text-cyan" />
                  {item}
                </div>
              ))}
            </div>
            <Btn variant="primary" size="lg" className="w-full" icon="bolt" onClick={() => router.push("/home")}>
              BrainX 시작하기
            </Btn>
          </>
        ) : null}
      </Card>
    </div>
  );
}
