"use client";

import { useRouter } from "next/navigation";

import { Btn } from "@/components/brainx-ui";

import { AuthShell, Field, SocialButtons } from "@/components/public/auth-shared";

export function LoginScreen() {
  const router = useRouter();
  return (
    <AuthShell>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">다시 오신 걸 환영해요</h1>
      <p className="mb-7 text-[14px] text-txt2">BrainX 계정으로 로그인하세요.</p>
      <Field label="이메일" type="email" placeholder="you@brainx.app" />
      <Field
        label="비밀번호"
        type="password"
        placeholder="••••••••"
        right={<button type="button" className="text-[12px] font-normal text-primary">비밀번호 찾기</button>}
      />
      <Btn variant="primary" size="lg" className="mt-2 w-full" onClick={() => router.push("/home")}>
        로그인
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
