"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { Badge, Btn, Card, Icon, SectionHead, ThemeToggle, Toggle } from "@/components/brainx-ui";
import { SectionCard } from "@/components/utility/utility-shared";
import {
  cancelAccountDeletion,
  changeMyPassword,
  configureEmail2fa,
  getMyProfile,
  linkSocialAccount,
  requestAccountDeletion,
  unlinkSocialAccount,
  updateMyConsents,
  updateMyProfile,
  type ConsentPayload,
  type MyProfile
} from "@/lib/user-api";

const PROVIDERS = ["google", "kakao", "naver"] as const;

export function SettingsScreen() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed, pushToast } = useBrainX();
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
  const [socialForm, setSocialForm] = useState({ provider: "google", oauthCode: "" });
  const [deletionReason, setDeletionReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await getMyProfile();
      setProfile(data);
      setNickname(data.nickname ?? "");
      setProfileImageUrl(data.profileImageUrl ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "내 정보를 불러오지 못했습니다.";
      pushToast(message, "err");
      if (message.includes("로그인") || message.includes("인증")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast("이미지 파일만 업로드할 수 있습니다.", "err");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfileImageUrl(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => pushToast("이미지를 불러오지 못했습니다.", "err");
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const data = await updateMyProfile({ nickname, profileImageAssetId: profileImageUrl });
      setProfile((current) => current ? { ...current, nickname: data.nickname, profileImageUrl: data.profileImageUrl } : current);
      pushToast("프로필이 저장되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "프로필 저장에 실패했습니다.", "err");
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPassword = async () => {
    try {
      await changeMyPassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
      pushToast("비밀번호가 변경되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다.", "err");
    }
  };

  const setTwoFactor = async (enabled: boolean) => {
    try {
      await configureEmail2fa(enabled);
      setProfile((current) => current ? { ...current, security: { ...current.security, twoFactorEnabled: enabled } } : current);
      pushToast("2단계 인증 설정이 요청되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "2단계 인증 설정에 실패했습니다.", "err");
    }
  };

  const submitSocialLink = async () => {
    try {
      const data = await linkSocialAccount(socialForm.provider, socialForm.oauthCode);
      setSocialForm((current) => ({ ...current, oauthCode: "" }));
      setProfile((current) => current ? {
        ...current,
        security: {
          ...current.security,
          linkedProviders: Array.from(new Set([...current.security.linkedProviders, data.provider]))
        }
      } : current);
      pushToast("소셜 계정이 연결되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결에 실패했습니다.", "err");
    }
  };

  const unlinkProvider = async (provider: string) => {
    try {
      await unlinkSocialAccount(provider);
      setProfile((current) => current ? {
        ...current,
        security: { ...current.security, linkedProviders: current.security.linkedProviders.filter((item) => item !== provider) }
      } : current);
      pushToast("소셜 계정 연결이 해제되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결 해제에 실패했습니다.", "err");
    }
  };

  const updateConsent = async (patch: Partial<ConsentPayload>) => {
    if (!profile) return;
    const next = { ...profile.consents, ...patch };
    try {
      const data = await updateMyConsents({
        termsRequired: next.termsRequired,
        privacyRequired: next.privacyRequired,
        marketingOptional: next.marketingOptional,
        behaviorAnalyticsOptional: next.behaviorAnalyticsOptional
      });
      setProfile((current) => current ? { ...current, consents: data } : current);
      pushToast("동의 정보가 수정되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "동의 정보 수정에 실패했습니다.", "err");
    }
  };

  const submitDeletion = async () => {
    try {
      const data = await requestAccountDeletion(deletionReason);
      pushToast(`회원 탈퇴 요청이 접수되었습니다. 삭제 예정일: ${data.deletionScheduledAt}`, "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원 탈퇴 요청에 실패했습니다.", "err");
    }
  };

  const cancelDeletion = async () => {
    try {
      await cancelAccountDeletion();
      pushToast("회원 탈퇴 요청이 취소되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원 탈퇴 요청 취소에 실패했습니다.", "err");
    }
  };

  const avatar = profileImageUrl ? (
    <img src={profileImageUrl} alt="프로필" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/40 ring-offset-2 ring-offset-bg" />
  ) : (
    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-2xl font-bold text-white ring-2 ring-primary/40 ring-offset-2 ring-offset-bg">
      {(nickname || profile?.email || "?")[0]}
    </div>
  );

  return (
    <div data-route className="mx-auto max-w-[1180px] px-6 py-7 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge color="139 92 246" dot className="mb-2.5">계정 설정</Badge>
          <h1 className="text-[27px] font-bold tracking-tight">설정</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-txt2">프로필, 보안, 소셜 계정, 개인정보 동의를 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Btn variant="soft" icon="refresh" onClick={loadProfile} disabled={loading}>새로고침</Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-5">
          <SectionHead icon="user" title="프로필" sub={profile?.email ?? "로그인한 사용자 정보"} />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-semibold text-txt">{nickname || "이름 없음"}</div>
                <div className="mt-1 text-[12px] text-txt3">{profile?.role ?? "ROLE_USER"}</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
              <Btn variant="soft" size="sm" icon="upload" onClick={() => fileInputRef.current?.click()}>이미지</Btn>
            </div>
            <label className="block">
              <div className="mb-1.5 text-[12px] font-medium text-txt2">닉네임</div>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="h-11 w-full rounded-xl border border-line/60 bg-surface2/50 px-3.5 text-[14px] text-txt outline-none focus:border-primary/60" />
            </label>
            <Btn variant="primary" icon="copy" onClick={saveProfile} disabled={savingProfile || loading}>프로필 저장</Btn>
          </div>
        </Card>

        <div className="grid gap-4">
          <SectionCard title="레이아웃" sub="작업 환경 설정은 브라우저에 저장됩니다.">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div><div className="text-[13px] font-medium text-txt">사이드바 접기</div><div className="text-[11.5px] text-txt3">워크스페이스 폭을 넓힙니다.</div></div>
                <Toggle on={sidebarCollapsed} onChange={setSidebarCollapsed} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div><div className="text-[13px] font-medium text-txt">라이트 모드</div><div className="text-[11.5px] text-txt3">현재 {theme === "dark" ? "다크" : "라이트"} 모드</div></div>
                <Toggle on={theme === "light"} onChange={(value) => setTheme(value ? "light" : "dark")} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="비밀번호 변경" sub="이메일 가입 계정에서 사용할 수 있습니다.">
            <div className="grid gap-2">
              <input type="password" placeholder="현재 비밀번호" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none" />
              <input type="password" placeholder="새 비밀번호" value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none" />
              <input type="password" placeholder="새 비밀번호 확인" value={passwords.newPasswordConfirm} onChange={(event) => setPasswords((current) => ({ ...current, newPasswordConfirm: event.target.value }))} className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none" />
              <Btn variant="soft" icon="lock" onClick={submitPassword}>비밀번호 저장</Btn>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="보안" sub="이메일 기반 2단계 인증을 설정합니다.">
          <div className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
            <div><div className="text-[13px] font-medium text-txt">이메일 2FA</div><div className="text-[11.5px] text-txt3">로그인 시 추가 인증을 요청합니다.</div></div>
            <Toggle on={profile?.security.twoFactorEnabled ?? false} onChange={setTwoFactor} />
          </div>
        </SectionCard>

        <SectionCard title="개인정보 동의" sub="필수 동의는 비활성화할 수 없습니다.">
          <div className="space-y-2.5">
            {profile ? ([
              ["termsRequired", "서비스 이용약관", true],
              ["privacyRequired", "개인정보 처리방침", true],
              ["marketingOptional", "마케팅 정보 수신", false],
              ["behaviorAnalyticsOptional", "행동 데이터 분석", false]
            ] as const).map(([key, label, required]) => (
              <div key={key} className="flex items-center justify-between rounded-xl bg-surface2/40 px-3 py-2.5">
                <div><div className="text-[13px] font-medium text-txt">{label}</div><div className="text-[11.5px] text-txt3">{required ? "필수" : "선택"}</div></div>
                <Toggle on={profile.consents[key]} onChange={(value) => updateConsent({ [key]: required ? true : value })} />
              </div>
            )) : null}
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="소셜 계정" sub="OAuth code를 사용해 계정을 연결하거나 해제합니다.">
          <div className="mb-3 flex flex-wrap gap-2">
            {PROVIDERS.map((provider) => {
              const linked = profile?.security.linkedProviders.includes(provider) ?? false;
              return (
                <button key={provider} type="button" onClick={() => linked ? unlinkProvider(provider) : setSocialForm((current) => ({ ...current, provider }))} className="rounded-xl border border-line/60 bg-surface2/40 px-3 py-2 text-[13px] text-txt2">
                  {provider} {linked ? "연결됨" : "미연결"}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-[130px_1fr_auto]">
            <select value={socialForm.provider} onChange={(event) => setSocialForm((current) => ({ ...current, provider: event.target.value }))} className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none">
              {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
            <input value={socialForm.oauthCode} onChange={(event) => setSocialForm((current) => ({ ...current, oauthCode: event.target.value }))} placeholder="oauth_code_from_provider" className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none" />
            <Btn variant="soft" onClick={submitSocialLink} disabled={!socialForm.oauthCode.trim()}>연결</Btn>
          </div>
        </SectionCard>

        <SectionCard title="회원 탈퇴" sub="탈퇴 요청 후 30일 유예 기간이 적용됩니다.">
          <div className="grid gap-2">
            <input value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="탈퇴 사유" className="h-10 rounded-xl border border-line/60 bg-surface2/50 px-3 text-[13px] text-txt outline-none" />
            <div className="flex gap-2">
              <Btn variant="outline" icon="trash" onClick={submitDeletion}>탈퇴 요청</Btn>
              <Btn variant="soft" icon="refresh" onClick={cancelDeletion}>요청 취소</Btn>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
