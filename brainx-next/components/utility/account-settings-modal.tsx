"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { Icon, type IconName } from "@/components/brainx-ui";
import { ImportScreen } from "@/components/utility/import-screen";
import { getOAuthAuthorization, logout, readAuthSession, type OAuthProvider } from "@/lib/auth-api";
import {
  cancelSubscription,
  getMySubscription,
  getPlans,
  PAYMENT_RESULT_MESSAGE_TYPE,
  type Plan as CommercePlan,
  type Subscription as CommerceSubscription
} from "@/lib/commerce-api";
import {
  AuthRequiredError,
  cancelAccountDeletion,
  changeMyPassword,
  configureEmail2fa,
  getMyProfile,
  requestAccountDeletion,
  unlinkSocialAccount,
  updateMyConsents,
  updateMyProfile,
  type ConsentPayload,
  type MyProfile
} from "@/lib/user-api";
import { getMyWorkspaceStats, type WorkspaceUserStatsData } from "@/lib/workspace-api";
import { createSupportTicket, getMySupportTicket, getMySupportTickets, type SupportTicket, type SupportTicketDetail, type SupportTicketPayload } from "@/lib/support-api";
import { getRecentDailySeries, summarizeWorkspaceNotes } from "@/lib/workspace-note-stats";
import { cx } from "@/lib/utils";
import type { ThemeMode } from "@/components/brainx-provider";
import type { LanguageCode } from "@/lib/i18n";
import { useGuideStore } from "@/lib/use-guide-store";
import { TOKEN_USAGE_SUMMARY } from "@/lib/token-usage";

type TabId = "profile" | "general" | "notifications" | "import" | "usage" | "stats" | "support" | "upgrade";
type SocialProvider = "google" | "kakao" | "naver";

const OAUTH_LINK_INTENT_KEY = "brainx_oauth_link_intent_v1";
const PROVIDERS: SocialProvider[] = ["google", "kakao", "naver"];

const NAV_GROUPS: { label: string; items: { id: TabId; label: string; icon: IconName }[] }[] = [
  {
    label: "계정",
    items: [
      { id: "profile", label: "프로필", icon: "user" },
      { id: "general", label: "일반", icon: "settings" },
      { id: "notifications", label: "알림", icon: "bell" }
    ]
  },
  {
    label: "사용량 및 분석",
    items: [
      { id: "import", label: "가져오기", icon: "import" },
      { id: "usage", label: "AI 토큰 사용량", icon: "bolt" },
      { id: "stats", label: "노트 통계", icon: "dash" }
    ]
  },
  {
    label: "고객 지원",
    items: [
      { id: "support", label: "문의하기", icon: "chat" }
    ]
  }
];

const MOBILE_TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "프로필" },
  { id: "general", label: "일반" },
  { id: "notifications", label: "알림" },
  { id: "import", label: "가져오기" },
  { id: "usage", label: "AI 토큰 사용량" },
  { id: "stats", label: "노트 통계" },
  { id: "support", label: "문의하기" },
  { id: "upgrade", label: "요금제 업그레이드" }
];

const SOCIAL: Record<SocialProvider, { name: string; mark: string; bg: string; fg: string; border: string }> = {
  google: { name: "Google", mark: "G", bg: "#fff", fg: "#4285f4", border: "#e5e7eb" },
  kakao: { name: "카카오", mark: "K", bg: "#fee500", fg: "#191919", border: "#efd900" },
  naver: { name: "네이버", mark: "N", bg: "#03c75a", fg: "#fff", border: "#03b653" }
};

const usageRows = TOKEN_USAGE_SUMMARY.breakdown;

function displayName(profile: MyProfile | null) {
  return profile?.nickname?.trim() || profile?.email?.split("@")[0] || readAuthSession()?.nickname || "사용자";
}

function displayEmail(profile: MyProfile | null) {
  return profile?.email || readAuthSession()?.email || "[email protected]";
}

function sessionDisplayName() {
  const session = readAuthSession();
  return session?.nickname?.trim() || session?.email?.split("@")[0] || "";
}

function sessionProfileImageUrl() {
  return readAuthSession()?.profileImageUrl ?? null;
}

function profileFromSession(): MyProfile | null {
  const session = readAuthSession();
  if (!session?.userId && !session?.email && !session?.nickname && !session?.profileImageUrl) return null;
  return {
    userId: session.userId ?? "",
    email: session.email ?? "",
    nickname: session.nickname?.trim() || session.email?.split("@")[0] || "",
    profileImageUrl: session.profileImageUrl ?? null,
    language: "ko",
    theme: "system",
    role: session.role ?? "ROLE_USER",
    security: {
      twoFactorEnabled: false,
      linkedProviders: []
    },
    consents: {
      termsRequired: true,
      privacyRequired: true,
      marketingOptional: false,
      behaviorAnalyticsOptional: false,
      updatedAt: null
    }
  };
}

function mergeProfileUpdate(
  current: MyProfile | null,
  data: { userId: string; nickname: string; profileImageUrl: string | null; language?: LanguageCode; theme?: ThemeMode }
): MyProfile {
  const base = current ?? profileFromSession() ?? {
    userId: data.userId,
    email: readAuthSession()?.email ?? "",
    nickname: data.nickname,
    profileImageUrl: data.profileImageUrl,
    language: data.language ?? "ko",
    theme: data.theme ?? "system",
    role: readAuthSession()?.role ?? "ROLE_USER",
    security: {
      twoFactorEnabled: false,
      linkedProviders: []
    },
    consents: {
      termsRequired: true,
      privacyRequired: true,
      marketingOptional: false,
      behaviorAnalyticsOptional: false,
      updatedAt: null
    }
  };

  return {
    ...base,
    userId: data.userId || base.userId,
    nickname: data.nickname,
    profileImageUrl: data.profileImageUrl,
    language: data.language ?? base.language,
    theme: data.theme ?? base.theme
  };
}

function readResizedProfileImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("이미지를 처리할 수 없습니다."));
          return;
        }

        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        canvas.width = size;
        canvas.height = size;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "U";
}

function planBadgeLabel(subscription: CommerceSubscription | null) {
  if (!subscription || subscription.status === "FREE" || subscription.status === "CANCELLED" || subscription.plan.planId === "free") {
    return "Free";
  }

  const name = subscription.plan.name.trim();
  return name === "무료" ? "Free" : name || "Free";
}

function ModalButton({
  children,
  onClick,
  disabled,
  danger,
  primary,
  className = ""
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[12px] font-semibold transition disabled:pointer-events-none disabled:opacity-45",
        primary && "bg-[#6c55f6] text-white hover:bg-[#5e49df]",
        danger && "bg-[#d64b36] text-white hover:bg-[#c6422f]",
        !primary && !danger && "border border-[#ded8cf] bg-white text-[#4d4944] hover:border-[#bdb5aa] hover:bg-[#fbfaf8]",
        className
      )}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <p className={cx("mb-4 text-[12px] font-medium", danger ? "text-[#d64b36]" : "text-[#8c877f]")}>{children}</p>;
}

function AccountRow({
  title,
  desc,
  action,
  className = ""
}: {
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-h-[65px] items-center justify-between gap-5 border-b border-[#e8e3db] py-3 last:border-b-0", className)}>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#36332f]">{title}</div>
        {desc ? <div className="mt-1 text-[12px] leading-5 text-[#6d6861]">{desc}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function ProviderMark({ provider, linked }: { provider: SocialProvider; linked: boolean }) {
  const social = SOCIAL[provider];
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border text-[12px] font-bold"
      style={{ backgroundColor: social.bg, color: social.fg, borderColor: linked ? social.border : "transparent" }}
    >
      {social.mark}
    </span>
  );
}

function ProgressBar({ percent, thick = false }: { percent: number; thick?: boolean }) {
  return (
    <div className={cx("overflow-hidden rounded-full bg-[#ebe7e1]", thick ? "h-2.5" : "h-1.5")}>
      <div className="h-full rounded-full bg-[#6c55f6]" style={{ width: `${percent}%` }} />
    </div>
  );
}

function MiniBars({
  values,
  labels,
  activeIndex = 3
}: {
  values: number[];
  labels: string[];
  activeIndex?: number;
}) {
  return (
    <div className="mt-5 flex h-[122px] items-end justify-between gap-8 px-5">
      {values.map((value, index) => (
        <div key={`${labels[index]}-${index}`} className="flex flex-1 flex-col items-center gap-2">
          <div
            className={cx("w-full max-w-[30px] rounded-[5px]", index === activeIndex ? "bg-[#6c55f6]" : "bg-[#e6e1fb]")}
            style={{ height: `${value}px` }}
          />
          <span className="text-[11px] text-[#8c877f]">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

export function AccountSettingsModal({
  open,
  onClose,
  defaultTab = "profile"
}: {
  open: boolean;
  onClose: () => void;
  defaultTab?: TabId;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { pushToast, language, setLanguage, theme, setTheme, t } = useBrainX();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<TabId>(defaultTab);
  const [profile, setProfile] = useState<MyProfile | null>(() => profileFromSession());
  const [subscription, setSubscription] = useState<CommerceSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [nickname, setNickname] = useState(() => sessionDisplayName());
  const [consents, setConsents] = useState<ConsentPayload>({
    termsRequired: true,
    privacyRequired: true,
    marketingOptional: false,
    behaviorAnalyticsOptional: false
  });
  const [savingConsent, setSavingConsent] = useState<keyof ConsentPayload | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
  }, [defaultTab, open]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || dialogRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("mousedown", closeOnOutsideMouseDown);
    return () => document.removeEventListener("mousedown", closeOnOutsideMouseDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    const fallbackName = sessionDisplayName();
    if (fallbackName) setNickname((current) => current || fallbackName);
    setProfile((current) => current ?? profileFromSession());
    setLoading(true);
    getMyProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setNickname(data.nickname ?? "");
        setConsents({
          termsRequired: data.consents.termsRequired,
          privacyRequired: data.consents.privacyRequired,
          marketingOptional: data.consents.marketingOptional,
          behaviorAnalyticsOptional: data.consents.behaviorAnalyticsOptional
        });
        setLanguage(data.language);
        setTheme(data.theme);
      })
      .catch((error) => {
        pushToast(error instanceof Error ? error.message : "프로필을 불러오지 못했습니다.", "err");
        if (error instanceof AuthRequiredError) router.replace("/login");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, pushToast, router]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    getMySubscription()
      .then((data) => {
        if (active) setSubscription(data);
      })
      .catch(() => {
        if (active) setSubscription(null);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const name = displayName(profile);
  const email = displayEmail(profile);
  const profileImageUrl = profile?.profileImageUrl ?? sessionProfileImageUrl();
  const linkedProviders = profile?.security.linkedProviders ?? [];
  const canChangePassword = profile ? profile.security.hasPassword ?? linkedProviders.length === 0 : false;
  const currentPlanLabel = planBadgeLabel(subscription);

  const saveProfile = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      pushToast("이름을 입력해 주세요.", "err");
      return;
    }

    setSavingProfile(true);
    try {
      const data = await updateMyProfile({ nickname: nextNickname });
      setProfile((current) => mergeProfileUpdate(current, data));
      pushToast("프로필이 저장되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "프로필 저장에 실패했습니다.", "err");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveNameOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void saveProfile();
  };

  const changeProfileImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast("이미지 파일만 업로드할 수 있습니다.", "err");
      return;
    }

    setSavingProfile(true);
    try {
      await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
        reader.readAsDataURL(file);
      });
      const dataUrl = await readResizedProfileImage(file);

      if (!dataUrl) throw new Error("이미지를 읽을 수 없습니다.");

      const data = await updateMyProfile({
        nickname: nickname.trim() || name,
        profileImageAssetId: dataUrl
      });
      setProfile((current) => mergeProfileUpdate(current, data));
      pushToast("프로필 사진이 변경되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "프로필 사진 변경에 실패했습니다.", "err");
    } finally {
      setSavingProfile(false);
    }
  };

  const removeProfileImage = async () => {
    setSavingProfile(true);
    try {
      const data = await updateMyProfile({ nickname: nickname.trim() || name, profileImageAssetId: "" });
      setProfile((current) => mergeProfileUpdate(current, data));
      pushToast("프로필 사진이 제거되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "프로필 사진 제거에 실패했습니다.", "err");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveConsent = async (key: keyof ConsentPayload, value: boolean) => {
    const previous = consents;
    const next = { ...consents, [key]: value };
    setConsents(next);
    setSavingConsent(key);
    try {
      const saved = await updateMyConsents(next);
      setConsents({
        termsRequired: saved.termsRequired,
        privacyRequired: saved.privacyRequired,
        marketingOptional: saved.marketingOptional,
        behaviorAnalyticsOptional: saved.behaviorAnalyticsOptional
      });
      pushToast("동의 정보가 저장되었습니다.", "ok");
    } catch (error) {
      setConsents(previous);
      pushToast(error instanceof Error ? error.message : "동의 정보 저장에 실패했습니다.", "err");
    } finally {
      setSavingConsent(null);
    }
  };

  const submitPassword = async () => {
    if (passwords.newPassword !== passwords.newPasswordConfirm) {
      pushToast("새 비밀번호 확인이 일치하지 않습니다.", "err");
      return;
    }

    try {
      await changeMyPassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
      setPasswordOpen(false);
      pushToast("비밀번호가 변경되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다.", "err");
    }
  };

  const toggle2fa = async () => {
    const next = !(profile?.security.twoFactorEnabled ?? false);
    try {
      await configureEmail2fa(next);
      setProfile((current) => (current ? { ...current, security: { ...current.security, twoFactorEnabled: next } } : current));
      pushToast(next ? "2단계 인증 설정을 요청했습니다." : "2단계 인증 해제를 요청했습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "2단계 인증 설정에 실패했습니다.", "err");
    }
  };

  const startSocialLink = async (provider: SocialProvider) => {
    try {
      const data = await getOAuthAuthorization(provider as OAuthProvider);
      window.localStorage.setItem(OAUTH_LINK_INTENT_KEY, JSON.stringify({ provider, state: data.state, returnTo: pathname || "/home" }));
      window.location.href = data.authorizationUrl;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결을 시작하지 못했습니다.", "err");
    }
  };

  const removeSocialLink = async (provider: SocialProvider) => {
    try {
      await unlinkSocialAccount(provider);
      setProfile((current) =>
        current ? { ...current, security: { ...current.security, linkedProviders: current.security.linkedProviders.filter((item) => item !== provider) } } : current
      );
      pushToast("소셜 계정 연결이 해제되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결 해제에 실패했습니다.", "err");
    }
  };

  const submitDeletion = async () => {
    try {
      await requestAccountDeletion("계정과 모든 노트 삭제 요청");
      pushToast("회원 탈퇴 요청이 접수되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원 탈퇴 요청에 실패했습니다.", "err");
    }
  };

  const cancelDeletion = async () => {
    try {
      await cancelAccountDeletion();
      pushToast("회원 탈퇴 요청이 취소되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "회원 탈퇴 취소에 실패했습니다.", "err");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      pushToast("로그아웃되었습니다.", "ok");
      router.replace("/login");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "로그아웃에 실패했습니다.", "err");
    }
  };

  const saveLanguage = async (nextLanguage: LanguageCode) => {
    setLanguage(nextLanguage);
    try {
      const data = await updateMyProfile({ nickname: nickname.trim() || name, language: nextLanguage, theme });
      setProfile((current) => mergeProfileUpdate(current, data));
      pushToast(t("toast.languageSaved"), "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t("toast.languageSaved"), "err");
    }
  };

  const saveTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    try {
      const data = await updateMyProfile({ nickname: nickname.trim() || name, language, theme: nextTheme });
      setProfile((current) => mergeProfileUpdate(current, data));
      pushToast(t("toast.themeSaved"), "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t("toast.themeSaved"), "err");
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-3 md:p-5"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        className="flex h-[min(655px,94svh)] w-[min(972px,96vw)] overflow-hidden rounded-[12px] border border-[#ded8cf] bg-white text-[#36332f] shadow-[0_22px_70px_rgba(18,16,14,.25)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[#e5e0d8] bg-[#fbfaf8] px-3 pb-3 pt-5 md:flex">
          <div className="mb-5 flex items-center gap-3 px-2">
            <div className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#6454d9] text-[15px] font-bold text-white">
              {profileImageUrl ? <img src={profileImageUrl} alt="프로필" className="h-full w-full object-cover" /> : initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-[#36332f]">{loading ? "불러오는 중" : name}</div>
              <a className="block truncate text-[11px] leading-4 text-[#4a36aa] underline">{email}</a>
            </div>
            <span className="rounded-md bg-[#ebe7ff] px-1.5 py-0.5 text-[10px] font-bold text-[#6c55f6]">{currentPlanLabel}</span>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1 px-2 text-[11px] text-[#8c877f]">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cx(
                      "flex h-[29px] w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] transition",
                      tab === item.id ? "bg-[#e9e6e0] font-semibold text-[#36332f]" : "text-[#6d6861] hover:bg-[#f0ede8]"
                    )}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 튜토리얼 다시보기 버튼 */}
          <button
            type="button"
            onClick={() => {
              useGuideStore.getState().triggerTutorialReplay();
              onClose();
            }}
            className="mb-2 flex h-[29px] w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] text-[#6c55f6] hover:bg-[#eeeafe] transition"
          >
            <Icon name="sparkle" size={15} />
            <span>튜토리얼 다시보기</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("upgrade")}
            className={cx(
              "mt-auto flex h-8 w-full items-center gap-2 rounded-[7px] px-3 text-[13px] font-bold transition",
              tab === "upgrade" ? "bg-[#6c55f6] text-white" : "bg-[#eeeafe] text-[#6c55f6] hover:bg-[#e5defd]"
            )}
          >
            <Icon name="sparkle" size={15} />
            요금제 업그레이드
          </button>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-white">
          <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-4 top-4 z-20 grid h-7 w-7 place-items-center rounded-md text-[#8c877f] hover:bg-[#f2efea] hover:text-[#36332f]">
            <Icon name="x" size={18} />
          </button>

          <div className="border-b border-[#e5e0d8] px-4 py-3 md:hidden">
            <select value={tab} onChange={(event) => setTab(event.target.value as TabId)} className="h-9 w-full rounded-[7px] border border-[#ded8cf] bg-white px-3 text-[13px]">
              {MOBILE_TABS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="scroll flex-1 overflow-y-auto px-8 pb-12 pt-11 md:px-[51px]">
            <div className={cx("mx-auto max-w-[622px]", (tab === "upgrade" || tab === "support") && "max-w-[630px]", tab === "import" && "max-w-[1180px]")}>
              {tab === "profile" ? (
                <ProfilePanel
                  email={email}
                  name={name}
                  nickname={nickname}
                  profile={profile}
                  profileImageUrl={profileImageUrl}
                  linkedProviders={linkedProviders}
                  canChangePassword={canChangePassword}
                  passwords={passwords}
                  passwordOpen={passwordOpen}
                  savingProfile={savingProfile}
                  profileInputRef={profileInputRef}
                  onNicknameChange={setNickname}
                  onNameKeyDown={saveNameOnEnter}
                  onProfileImageChange={changeProfileImage}
                  onRemoveImage={removeProfileImage}
                  onTogglePassword={() => setPasswordOpen((current) => !current)}
                  onPasswordsChange={setPasswords}
                  onPasswordSubmit={submitPassword}
                  onToggle2fa={toggle2fa}
                  onStartSocialLink={startSocialLink}
                  onRemoveSocialLink={removeSocialLink}
                  onDeleteAccount={submitDeletion}
                  onCancelDeletion={cancelDeletion}
                />
              ) : null}
              {tab === "general" ? (
                <GeneralSettingsPanel
                  language={language}
                  theme={theme}
                  consents={consents}
                  savingConsent={savingConsent}
                  onLanguageChange={saveLanguage}
                  onThemeChange={saveTheme}
                  onConsentChange={saveConsent}
                  onLogout={handleLogout}
                />
              ) : null}
              {tab === "notifications" ? <NotificationsPanel /> : null}
              {tab === "import" ? <ImportScreen /> : null}
              {tab === "usage" ? <UsagePanel /> : null}
              {tab === "stats" ? <StatsPanel /> : null}
              {tab === "support" ? <SupportPanel /> : null}
              {tab === "upgrade" ? <UpgradePanel billing={billing} onBillingChange={setBilling} onSubscriptionChange={setSubscription} /> : null}
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

function ProfilePanel({
  email,
  name,
  nickname,
  profile,
  profileImageUrl,
  linkedProviders,
  canChangePassword,
  passwords,
  passwordOpen,
  savingProfile,
  profileInputRef,
  onNicknameChange,
  onNameKeyDown,
  onProfileImageChange,
  onRemoveImage,
  onTogglePassword,
  onPasswordsChange,
  onPasswordSubmit,
  onToggle2fa,
  onStartSocialLink,
  onRemoveSocialLink,
  onDeleteAccount,
  onCancelDeletion
}: {
  email: string;
  name: string;
  nickname: string;
  profile: MyProfile | null;
  profileImageUrl: string | null;
  linkedProviders: string[];
  canChangePassword: boolean;
  passwords: { currentPassword: string; newPassword: string; newPasswordConfirm: string };
  passwordOpen: boolean;
  savingProfile: boolean;
  profileInputRef: React.RefObject<HTMLInputElement | null>;
  onNicknameChange: (value: string) => void;
  onNameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onProfileImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onTogglePassword: () => void;
  onPasswordsChange: (value: { currentPassword: string; newPassword: string; newPasswordConfirm: string }) => void;
  onPasswordSubmit: () => void;
  onToggle2fa: () => void;
  onStartSocialLink: (provider: SocialProvider) => void;
  onRemoveSocialLink: (provider: SocialProvider) => void;
  onDeleteAccount: () => void;
  onCancelDeletion: () => void;
}) {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">프로필</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">프로필, 로그인 정보 및 계정 보안을 관리하세요.</p>
      </header>

      <section className="mb-8">
        <SectionLabel>계정</SectionLabel>
        <div className="flex items-start gap-5">
          <div className="grid h-[66px] w-[66px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#6454d9] text-[28px] font-bold text-white">
            {profileImageUrl ? <img src={profileImageUrl} alt="프로필" className="h-full w-full object-cover" /> : initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-[12px] text-[#6d6861]">선호하는 이름</label>
            <input
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
              onKeyDown={onNameKeyDown}
              className="h-8 w-full max-w-[306px] rounded-[7px] border border-[#ded8cf] bg-white px-3 text-[12px] text-[#36332f] outline-none focus:border-[#6c55f6]"
            />
            <div className="mt-3 flex items-center gap-3">
              <input ref={profileInputRef} type="file" accept="image/*" className="hidden" onChange={onProfileImageChange} />
              <ModalButton onClick={() => profileInputRef.current?.click()} disabled={savingProfile}>
                <Icon name="upload" size={13} />
                {savingProfile ? "저장 중" : "사진 변경"}
              </ModalButton>
              <button type="button" onClick={onRemoveImage} disabled={savingProfile || !profileImageUrl} className="text-[12px] text-[#6d6861] hover:text-[#36332f] disabled:cursor-not-allowed disabled:opacity-45">
                사진 제거
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-9">
        <SectionLabel>계정 보안</SectionLabel>
        <AccountRow title="이메일" desc={<a className="text-[#4a36aa] underline">{email}</a>} action={<span className="text-[12px] text-[#8c877f]">변경 API 없음</span>} />
        {canChangePassword ? (
          <>
            <AccountRow title="비밀번호" desc="마지막 변경 · 3개월 전" action={<ModalButton onClick={onTogglePassword}>비밀번호 변경</ModalButton>} />
            {passwordOpen ? <PasswordFields passwords={passwords} onChange={onPasswordsChange} onSubmit={onPasswordSubmit} /> : null}
          </>
        ) : null}
        <AccountRow title="2단계 인증" desc="계정 보안을 위한 인증 단계를 추가하세요." action={<ModalButton onClick={onToggle2fa}>설정</ModalButton>} />
      </section>

      <section className="mb-9">
        <SectionLabel>계정 연동</SectionLabel>
        {PROVIDERS.map((provider) => {
          const linked = linkedProviders.includes(provider);
          return (
            <div key={provider} className="flex min-h-[53px] items-center justify-between border-b border-[#e8e3db] py-2.5 last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <ProviderMark provider={provider} linked={linked} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#36332f]">{SOCIAL[provider].name}</div>
                  <div className="truncate text-[12px] text-[#6d6861]">{linked ? <a className="text-[#4a36aa] underline">{email}</a> : "연결되지 않음"}</div>
                </div>
              </div>
              {linked ? (
                <button type="button" onClick={() => onRemoveSocialLink(provider)} className="inline-flex items-center gap-1.5 text-[12px] text-[#4d4944]">
                  <Icon name="check" size={14} className="text-[#168a4f]" />
                  연결됨
                </button>
              ) : (
                <ModalButton onClick={() => onStartSocialLink(provider)}>연결</ModalButton>
              )}
            </div>
          );
        })}
      </section>

      <section>
        <SectionLabel danger>위험 구역</SectionLabel>
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-[#f0d3cb] bg-[#fdf0ed] px-4 py-4">
          <div>
            <div className="text-[13px] font-bold text-[#36332f]">내 계정 삭제</div>
            <p className="mt-1 text-[12px] text-[#6d6861]">계정과 모든 노트가 영구 삭제됩니다. 되돌릴 수 없습니다.</p>
          </div>
          <ModalButton danger onClick={onDeleteAccount}>
            <Icon name="trash" size={13} />
            회원 탈퇴
          </ModalButton>
        </div>
        <button type="button" onClick={onCancelDeletion} className="mt-3 text-[12px] text-[#8c877f] hover:text-[#36332f]">
          탈퇴 요청 취소
        </button>
      </section>
    </>
  );
}

function PasswordFields({
  passwords,
  onChange,
  onSubmit
}: {
  passwords: { currentPassword: string; newPassword: string; newPasswordConfirm: string };
  onChange: (next: { currentPassword: string; newPassword: string; newPasswordConfirm: string }) => void;
  onSubmit: () => void;
}) {
  const fields: { key: keyof typeof passwords; label: string }[] = [
    { key: "currentPassword", label: "현재 비밀번호" },
    { key: "newPassword", label: "새 비밀번호" },
    { key: "newPasswordConfirm", label: "새 비밀번호 확인" }
  ];

  return (
    <div className="mt-3 grid gap-2 rounded-[10px] bg-[#fbfaf8] p-3">
      {fields.map((field) => (
        <input
          key={field.key}
          type="password"
          value={passwords[field.key]}
          onChange={(event) => onChange({ ...passwords, [field.key]: event.target.value })}
          placeholder={field.label}
          className="h-9 rounded-[7px] border border-[#ded8cf] bg-white px-3 text-[13px] outline-none focus:border-[#6c55f6]"
        />
      ))}
      <div>
        <ModalButton primary onClick={onSubmit} disabled={!passwords.currentPassword || !passwords.newPassword || !passwords.newPasswordConfirm}>
          저장
        </ModalButton>
      </div>
    </div>
  );
}

function ConsentButton({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "h-8 min-w-[48px] rounded-[7px] px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-[#6c55f6] text-white" : "border border-[#ded8cf] bg-white text-[#6d6861]"
      )}
    >
      {checked ? "켜짐" : "꺼짐"}
    </button>
  );
}

function GeneralSettingsPanel({
  language,
  theme,
  consents,
  savingConsent,
  onLanguageChange,
  onThemeChange,
  onConsentChange,
  onLogout
}: {
  language: LanguageCode;
  theme: ThemeMode;
  consents: ConsentPayload;
  savingConsent: keyof ConsentPayload | null;
  onLanguageChange: (value: LanguageCode) => void;
  onThemeChange: (value: ThemeMode) => void;
  onConsentChange: (key: keyof ConsentPayload, value: boolean) => void;
  onLogout: () => void;
}) {
  const { t } = useBrainX();
  const languageOptions: { value: LanguageCode; label: string }[] = [
    { value: "ko", label: t("general.ko") },
    { value: "en", label: t("general.en") }
  ];
  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "dark", label: t("general.dark") },
    { value: "light", label: t("general.light") },
    { value: "system", label: t("general.system") }
  ];

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">{t("general.title")}</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">{t("general.desc")}</p>
      </header>
      <section className="rounded-[12px] border border-[#e5e0d8]">
        <AccountRow className="px-4" title={t("general.language")} desc={t("general.languageDesc")} action={<SegmentedControl options={languageOptions} value={language} onChange={onLanguageChange} />} />
        <AccountRow className="px-4" title={t("general.theme")} desc={t("general.themeDesc")} action={<SegmentedControl options={themeOptions} value={theme} onChange={onThemeChange} />} />
        <AccountRow
          className="px-4"
          title={t("general.marketing")}
          desc={t("general.marketingDesc")}
          action={<ConsentButton checked={consents.marketingOptional} disabled={savingConsent === "marketingOptional"} onChange={(value) => onConsentChange("marketingOptional", value)} />}
        />
        <AccountRow
          className="px-4"
          title={t("general.analytics")}
          desc={t("general.analyticsDesc")}
          action={<ConsentButton checked={consents.behaviorAnalyticsOptional} disabled={savingConsent === "behaviorAnalyticsOptional"} onChange={(value) => onConsentChange("behaviorAnalyticsOptional", value)} />}
        />
        <AccountRow className="px-4" title={t("general.session")} desc={t("general.sessionDesc")} action={<ModalButton danger onClick={onLogout}>{t("general.logout")}</ModalButton>} />
      </section>
    </>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-[8px] border border-[#ded8cf] bg-[#fbfaf8] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "h-7 whitespace-nowrap rounded-[6px] px-2.5 text-[12px] font-semibold transition",
            option.value === value ? "bg-[#6c55f6] text-white shadow-sm" : "text-[#6d6861] hover:bg-white hover:text-[#36332f]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function GeneralPanel({
  consents,
  savingConsent,
  onConsentChange,
  onLogout
}: {
  consents: ConsentPayload;
  savingConsent: keyof ConsentPayload | null;
  onConsentChange: (key: keyof ConsentPayload, value: boolean) => void;
  onLogout: () => void;
}) {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">일반</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">앱 표시와 개인정보 옵션을 관리하세요.</p>
      </header>
      <section className="rounded-[12px] border border-[#e5e0d8]">
        <AccountRow className="px-4" title="언어" desc="한국어" />
        <AccountRow className="px-4" title="테마" desc="시스템 설정 사용" />
        <AccountRow
          className="px-4"
          title="마케팅 정보 수신"
          desc="제품 소식과 혜택 안내 수신 동의"
          action={<ConsentButton checked={consents.marketingOptional} disabled={savingConsent === "marketingOptional"} onChange={(value) => onConsentChange("marketingOptional", value)} />}
        />
        <AccountRow
          className="px-4"
          title="행동 데이터 분석"
          desc="서비스 개선을 위한 사용 분석 동의"
          action={<ConsentButton checked={consents.behaviorAnalyticsOptional} disabled={savingConsent === "behaviorAnalyticsOptional"} onChange={(value) => onConsentChange("behaviorAnalyticsOptional", value)} />}
        />
        <AccountRow className="px-4" title="세션" desc="현재 로그인된 기기에서 로그아웃합니다." action={<ModalButton onClick={onLogout}>로그아웃</ModalButton>} />
      </section>
    </>
  );
}

function NotificationsPanel() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">알림</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">노트와 AI 작업에 관한 알림을 조정하세요.</p>
      </header>
      <section className="rounded-[12px] border border-[#e5e0d8]">
        {["댓글과 멘션", "공유 링크 활동", "AI 작업 완료", "주간 활동 리포트"].map((item) => (
          <AccountRow className="px-4" key={item} title={item} desc="앱 내 알림으로 받아봅니다." action={<span className="text-[12px] font-semibold text-[#6c55f6]">켜짐</span>} />
        ))}
      </section>
    </>
  );
}

function UsagePanel() {
  const used = 287400;
  const limit = 1000000;
  const percent = 28.7;

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">AI 토큰 사용량</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">이번 달 AI 토큰 사용 현황입니다.</p>
      </header>
      <section className="mb-7 rounded-[12px] border border-[#e5e0d8] px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] text-[#6d6861]">이번 달 사용량</span>
          <span className="rounded-md bg-[#eeeafe] px-2 py-0.5 text-[10px] font-bold text-[#6c55f6]">Pro · 월 100만 토큰</span>
        </div>
        <div className="mb-3 flex items-end gap-1">
          <span className="text-[31px] font-bold tracking-[-0.02em] text-[#36332f]">{used.toLocaleString()}</span>
          <span className="pb-1 text-[15px] font-semibold text-[#8c877f]">/ {limit.toLocaleString()} 토큰</span>
        </div>
        <ProgressBar percent={percent} thick />
        <div className="mt-3 flex justify-between text-[12px]">
          <span className="font-bold text-[#36332f]">{percent}% 사용</span>
          <span className="text-[#6d6861]">2026년 7월 1일 초기화</span>
        </div>
      </section>

      <section className="mb-7">
        <SectionLabel>기능별 사용량</SectionLabel>
        <div className="space-y-4">
          {usageRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[32px_1fr] items-center gap-3">
              <div className="grid h-[30px] w-[30px] place-items-center rounded-[7px] bg-[#eeeafe] text-[#6c55f6]">
                <Icon name={row.icon} size={15} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#36332f]">{row.label}</span>
                  <span className="text-[#6d6861]">{row.value.toLocaleString()}</span>
                </div>
                <ProgressBar percent={row.percent} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>최근 7일 추이</SectionLabel>
        <MiniBars values={[45, 70, 56, 90, 80, 34, 27]} labels={["월", "화", "수", "목", "금", "토", "일"]} />
        <div className="mt-5 flex items-center justify-between rounded-[12px] bg-[#eeeafe] px-4 py-3">
          <div>
            <div className="text-[13px] font-bold text-[#36332f]">더 많은 토큰이 필요하신가요?</div>
            <p className="mt-1 text-[12px] text-[#6d6861]">Max로 업그레이드하면 AI 토큰을 무제한으로 사용할 수 있어요.</p>
          </div>
          <ModalButton primary disabled>Max 알아보기</ModalButton>
        </div>
      </section>
    </>
  );
}

function StatsPanel() {
  const { notes, pushToast } = useBrainX();
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceUserStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getMyWorkspaceStats()
      .then((stats) => {
        if (active) setWorkspaceStats(stats);
      })
      .catch((error) => {
        if (active) setWorkspaceStats(null);
        pushToast(error instanceof Error ? error.message : "노트 통계를 불러오지 못했습니다.", "err");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pushToast]);

  const summary = summarizeWorkspaceNotes(notes);
  const recentSeries = getRecentDailySeries(notes, 7);
  const totalNotes = workspaceStats?.noteCount ?? summary.totalNotes;
  const recentWeekCount = recentSeries.values.reduce((sum, value) => sum + value, 0);
  const storageGb = workspaceStats ? workspaceStats.storageBytes / (1024 * 1024 * 1024) : 0;
  const recentActivities = workspaceStats?.activities ?? [];

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">노트 통계</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">
          {loading ? "실제 Workspace 데이터를 불러오는 중입니다." : "실제 노트 데이터와 API 응답을 함께 보여줍니다."}
        </p>
      </header>
      <section className="mb-7 grid grid-cols-2 gap-3">
        {[
          ["작성한 노트", `${totalNotes}`, "실제 API"],
          ["최근 7일 작성", `${recentWeekCount}`, recentWeekCount > 0 ? "활동 있음" : "데이터 없음"],
          ["연속 작성", `${summary.writingStreak}일`, summary.writingStreak > 0 ? "활성" : "휴면"],
          ["저장 공간", `${storageGb.toFixed(1)}GB`, workspaceStats ? "실제 저장량" : "로딩 중"]
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-[12px] border border-[#e5e0d8] px-4 py-4">
            <p className="text-[12px] text-[#6d6861]">{label}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[27px] font-bold tracking-[-0.02em] text-[#36332f]">{value}</span>
              {sub ? (
                <span className={cx("text-[12px] font-bold", label === "저장 공간" ? "text-[#6c55f6]" : recentWeekCount > 0 ? "text-[#168a4f]" : "text-[#ff7a1a]")}>
                  {sub}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </section>
      <section className="mb-7">
        <SectionLabel>주간 작성 활동</SectionLabel>
        <MiniBars values={recentSeries.values} labels={recentSeries.labels} activeIndex={recentSeries.values.length - 1} />
      </section>
      <section className="mb-7">
        <SectionLabel>인사이트</SectionLabel>
        {[
          ["가장 활발한 시간대", summary.peakHour?.label ?? "데이터 없음", "clock"],
          ["평균 노트 길이", `${summary.averageWords} 단어`, "doc"],
          ["가장 많이 쓴 태그", summary.topTag ? `#${summary.topTag.label}` : "태그 없음", "sparkle"]
        ].map(([label, value, icon]) => (
          <div key={label} className="flex items-center justify-between border-b border-[#e8e3db] py-3 text-[12px] last:border-b-0">
            <span className="inline-flex items-center gap-2 text-[#6d6861]">
              <Icon name={icon as IconName} size={14} />
              {label}
            </span>
            <span className={cx("font-medium", typeof value === "string" && value.startsWith("#") ? "text-[#6c55f6]" : "text-[#4d4944]")}>{value}</span>
          </div>
        ))}
      </section>
      <section>
        <SectionLabel>최근 활동</SectionLabel>
        {recentActivities.length ? (
          <div className="space-y-2">
            {recentActivities.slice(0, 3).map((activity) => (
              <div key={`${activity.noteId}-${activity.occurredAt}`} className="rounded-[10px] border border-[#e8e3db] bg-[#fbfaf8] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[#36332f]">{activity.title}</div>
                    <div className="mt-0.5 text-[12px] text-[#8c877f]">{activity.type}</div>
                  </div>
                  <div className="shrink-0 text-[12px] text-[#6d6861]">
                    {new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-[#e8e3db] bg-[#fbfaf8] px-4 py-5 text-center text-[12px] text-[#8c877f]">
            아직 최근 활동 데이터가 없습니다.
          </div>
        )}
      </section>
    </>
  );
}

function SupportPanel() {
  const { pushToast } = useBrainX();
  const categories: Array<{ value: SupportTicketPayload["category"]; label: string }> = [
    { value: "FEATURE_REQUEST", label: "기능 문의" },
    { value: "BUG", label: "버그 신고" },
    { value: "BILLING", label: "결제/환불" },
    { value: "ACCOUNT", label: "계정" },
    { value: "OTHER", label: "기타" }
  ];
  const statusLabel: Record<string, { label: string; color: string }> = {
    OPEN: { label: "접수", color: "#6c55f6" },
    IN_PROGRESS: { label: "처리 중", color: "#b7791f" },
    RESOLVED: { label: "답변 완료", color: "#168a4f" },
    CLOSED: { label: "종료", color: "#8c877f" }
  };
  const [category, setCategory] = useState<SupportTicketPayload["category"]>("FEATURE_REQUEST");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [inquiries, setInquiries] = useState<SupportTicket[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMySupportTickets()
      .then((data) => {
        if (active) setInquiries(data);
      })
      .catch((error) => pushToast(error instanceof Error ? error.message : "문의 내역을 불러오지 못했습니다.", "err"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const submitInquiry = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) {
      pushToast("제목과 내용을 입력해 주세요.", "err");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createSupportTicket({ category, subject: nextTitle, body: nextContent });
      setInquiries((current) => [created, ...current]);
      setTitle("");
      setContent("");
      pushToast("문의가 접수되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "문의 접수에 실패했습니다.", "err");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  };

  const openInquiryDetail = async (ticket: SupportTicket) => {
    try {
      setSelectedInquiry(await getMySupportTicket(ticket.ticketId));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "문의 상세를 불러오지 못했습니다.", "err");
    }
  };

  if (selectedInquiry) {
    const status = statusLabel[selectedInquiry.status] ?? statusLabel.OPEN;
    const userMessage = selectedInquiry.messages.find((message) => message.senderType === "USER");
    const adminMessage = selectedInquiry.messages.find((message) => message.senderType === "ADMIN");
    return (
      <>
        <header className="mb-7">
          <button
            type="button"
            onClick={() => setSelectedInquiry(null)}
            className="mb-4 inline-flex h-8 items-center gap-2 rounded-[7px] px-2 text-[12px] font-semibold text-[#6d6861] transition hover:bg-[#f2efea] hover:text-[#36332f]"
          >
            <Icon name="arrowL" size={14} />
            내 문의 내역
          </button>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#eeeafe] px-2 py-0.5 text-[10px] font-bold text-[#6c55f6]">{selectedInquiry.category}</span>
            <span className="text-[11px] text-[#8c877f]">{formatDate(selectedInquiry.createdAt)}</span>
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${status.color}18`, color: status.color }}>
              {status.label}
            </span>
          </div>
          <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">{selectedInquiry.subject}</h1>
          <p className="mt-3 text-[13px] text-[#6d6861]">문의 상세보기</p>
        </header>

        <section className="mb-7 rounded-[12px] border border-[#e5e0d8] px-5 py-5">
          <SectionLabel>문의 내용</SectionLabel>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#4d4944]">{userMessage?.content ?? "문의 내용을 불러오지 못했습니다."}</p>
        </section>

        <section className="rounded-[12px] border border-[#e5e0d8] px-5 py-5">
          <SectionLabel>관리자 답변</SectionLabel>
          {adminMessage ? (
            <div className="rounded-[10px] bg-[#f0fdf4] px-4 py-4">
              <div className="mb-2 text-[11px] font-bold text-[#168a4f]">{formatDate(adminMessage.createdAt)} 답변 완료</div>
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#36332f]">{adminMessage.content}</p>
            </div>
          ) : (
            <div className="rounded-[10px] bg-[#f8f6f2] px-4 py-5 text-center">
              <div className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-full bg-[#eeeafe] text-[#6c55f6]">
                <Icon name="chat" size={17} />
              </div>
              <p className="text-[13px] font-bold text-[#36332f]">아직 등록된 답변이 없습니다</p>
              <p className="mt-1 text-[12px] text-[#8c877f]">추후 관리자 답글이 등록되면 이 영역에 표시됩니다.</p>
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">문의하기</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">문의 작성과 처리 상태를 한 곳에서 확인하세요.</p>
      </header>

      <section className="mb-7 rounded-[12px] border border-[#e5e0d8] px-5 py-5">
        <SectionLabel>문의 작성</SectionLabel>
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              className={cx(
                "h-8 rounded-full border px-3 text-[12px] font-semibold transition",
                category === item.value ? "border-[#6c55f6] bg-[#6c55f6] text-white" : "border-[#ded8cf] bg-white text-[#6d6861] hover:bg-[#f2efea]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[12px] text-[#6d6861]">제목</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="문의 제목을 입력하세요"
            className="h-9 w-full rounded-[7px] border border-[#ded8cf] px-3 text-[12px] text-[#36332f] outline-none focus:border-[#6c55f6]"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-[12px] text-[#6d6861]">내용</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            maxLength={10000}
            placeholder="문제가 발생한 상황이나 요청 내용을 자세히 적어 주세요."
            className="w-full resize-none rounded-[7px] border border-[#ded8cf] px-3 py-2.5 text-[12px] text-[#36332f] outline-none focus:border-[#6c55f6]"
          />
        </label>
        <ModalButton primary onClick={submitInquiry} disabled={submitting}>
          <Icon name="send" size={13} />
          {submitting ? "접수 중" : "문의 접수"}
        </ModalButton>
      </section>

      <section>
        <SectionLabel>내 문의 내역</SectionLabel>
        {loading ? (
          <div className="rounded-[12px] border border-[#e5e0d8] px-5 py-10 text-center text-[13px] text-[#8c877f]">문의 내역을 불러오는 중입니다.</div>
        ) : inquiries.length ? (
          <div className="space-y-3">
            {inquiries.map((item) => {
              const status = statusLabel[item.status] ?? statusLabel.OPEN;
              return (
                <button
                  key={item.ticketId}
                  type="button"
                  onClick={() => openInquiryDetail(item)}
                  className="block w-full rounded-[12px] border border-[#e5e0d8] px-4 py-4 text-left transition hover:border-[#cfc7bb] hover:bg-[#fbfaf8]"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-md bg-[#eeeafe] px-2 py-0.5 text-[10px] font-bold text-[#6c55f6]">{item.category}</span>
                        <span className="text-[11px] text-[#8c877f]">{formatDate(item.createdAt)}</span>
                      </div>
                      <h2 className="truncate text-[14px] font-bold text-[#36332f]">{item.subject}</h2>
                    </div>
                    <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${status.color}18`, color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[#6d6861]">
                    {item.hasNewReply ? "새 답변이 도착했습니다." : "문의가 정상적으로 접수되었습니다."}
                  </p>
                  <div className="mt-3 text-[11px] font-semibold text-[#6c55f6]">상세보기</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[12px] border border-[#e5e0d8] px-5 py-10 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#eeeafe] text-[#6c55f6]">
              <Icon name="chat" size={18} />
            </div>
            <p className="text-[13px] font-bold text-[#36332f]">문의 내역이 없습니다</p>
            <p className="mt-1 text-[12px] text-[#8c877f]">궁금한 점이나 문제가 생기면 문의를 남겨 주세요.</p>
          </div>
        )}
      </section>
    </>
  );
}

function UpgradePanel({
  billing,
  onBillingChange,
  onSubscriptionChange
}: {
  billing: "monthly" | "yearly";
  onBillingChange: (value: "monthly" | "yearly") => void;
  onSubscriptionChange?: (subscription: CommerceSubscription | null) => void;
}) {
  const { pushToast } = useBrainX();
  const [plans, setPlans] = useState<CommercePlan[]>([]);
  const [subscription, setSubscription] = useState<CommerceSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const pendingPlanIdRef = useRef<string | null>(null);

  useEffect(() => {
    pendingPlanIdRef.current = pendingPlanId;
  }, [pendingPlanId]);

  const refresh = useCallback(async () => {
    try {
      const [planList, sub] = await Promise.all([getPlans(), getMySubscription()]);
      setPlans(planList);
      setSubscription(sub);
      onSubscriptionChange?.(sub);
      window.dispatchEvent(new CustomEvent("brainx-subscription-changed"));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "요금제 정보를 불러오지 못했습니다.", "err");
    } finally {
      setLoading(false);
    }
  }, [onSubscriptionChange, pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handlePaymentMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== PAYMENT_RESULT_MESSAGE_TYPE) return;
      setPendingPlanId(null);
      if (event.data.success) {
        pushToast(event.data.message ?? "결제가 완료되었습니다.", "ok");
        void refresh();
      } else {
        pushToast(event.data.message ?? "결제가 취소되었습니다.", "err");
      }
    }

    window.addEventListener("message", handlePaymentMessage);
    return () => window.removeEventListener("message", handlePaymentMessage);
  }, [pushToast, refresh]);

  const startUpgrade = async (plan: CommercePlan) => {
    if (pendingPlanId) return;
    setPendingPlanId(plan.planId);

    const popup = window.open(
      `/billing/checkout?planId=${encodeURIComponent(plan.planId)}`,
      "brainx-payment"
    );
    if (!popup) {
      pushToast("팝업이 차단되었습니다. 팝업 차단을 해제한 뒤 다시 시도해 주세요.", "err");
      setPendingPlanId(null);
      return;
    }
    // pendingPlanId는 결제 팝업이 postMessage로 결과를 알려줄 때(성공/실패 모두) 해제된다.
    // 단, 사용자가 결제창의 "취소" 버튼이 아니라 팝업 자체를 직접 닫아버리면 fail 페이지로
    // 리다이렉트되지 않아 postMessage가 오지 않으므로, 팝업이 닫혔는지 별도로 감시해서
    // 그 경우에도 "취소되었습니다" 처리를 해 준다.
    const watchClosed = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(watchClosed);
        if (pendingPlanIdRef.current === plan.planId) {
          setPendingPlanId(null);
          pushToast("결제가 취소되었습니다.", "err");
        }
      }
    }, 500);
  };

  const downgradeToFree = async () => {
    if (pendingPlanId) return;
    setPendingPlanId("free");
    try {
      await cancelSubscription(false);
      pushToast("무료 플랜으로 변경됐어요", "ok");
      await refresh();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "플랜 변경에 실패했습니다.", "err");
    } finally {
      setPendingPlanId(null);
    }
  };

  const yearly = billing === "yearly";
  const currentPlanId = subscription?.plan.planId ?? "free";

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#2f2d2a]">요금제</h1>
        <p className="mt-3 text-[13px] text-[#6d6861]">더 강력한 AI로 업그레이드하세요.</p>
      </header>
      <div className="mb-5 inline-flex rounded-[9px] bg-[#f2efea] p-1">
        {(["monthly", "yearly"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onBillingChange(item)}
            className={cx("h-7 rounded-[7px] px-4 text-[12px] font-medium transition", billing === item ? "bg-white text-[#36332f] shadow-sm" : "text-[#6d6861]")}
          >
            {item === "monthly" ? "월간" : "연간"}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-[13px] text-[#8c877f]">요금제 정보를 불러오는 중…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const tier = Number(plan.entitlements.tier ?? 0);
            const isCurrent = plan.planId === currentPlanId;
            const isFree = plan.price === 0;
            const primary = tier === Math.max(...plans.map((p) => Number(p.entitlements.tier ?? 0)));

            let buttonLabel = isFree ? "기본 플랜으로 변경" : `${plan.name}로 업그레이드`;
            if (isCurrent) buttonLabel = "현재 플랜";
            if (pendingPlanId === plan.planId) buttonLabel = "처리 중…";

            return (
              <PlanCard
                key={plan.planId}
                plan={plan.name}
                price={isFree ? "₩0" : `₩${(yearly ? Math.round(plan.price * 0.8) : plan.price).toLocaleString()}`}
                desc={isFree ? "평생 무료" : yearly ? "연간 결제 (TEMP 테스트 가격)" : "월간 결제 (TEMP 테스트 가격)"}
                button={buttonLabel}
                badge={isCurrent ? "현재 플랜" : tier === 2 ? "추천" : undefined}
                active={isCurrent}
                primary={primary && !isCurrent}
                disabled={isCurrent || pendingPlanId !== null}
                features={plan.features}
                onClick={() => (isFree ? downgradeToFree() : startUpgrade(plan))}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

function PlanCard({
  plan,
  price,
  desc,
  button,
  features,
  active,
  primary,
  badge,
  disabled,
  onClick
}: {
  plan: string;
  price: string;
  desc: string;
  button: string;
  features: string[];
  active?: boolean;
  primary?: boolean;
  badge?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className={cx("rounded-[12px] border px-5 py-5", active ? "border-[#6c55f6]" : "border-[#e5e0d8]")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-[#2f2d2a]">{plan}</h3>
        {badge ? <span className={cx("rounded-md px-2 py-0.5 text-[10px] font-bold", primary ? "bg-[#6c55f6] text-white" : "bg-[#eeeafe] text-[#6c55f6]")}>{badge}</span> : null}
      </div>
      <div className="text-[27px] font-bold tracking-[-0.03em] text-[#2f2d2a]">
        {price}
        {price !== "₩0" ? <span className="text-[12px] font-medium text-[#8c877f]"> / 월</span> : null}
      </div>
      <p className="mt-1 text-[12px] text-[#6d6861]">{desc}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "mt-4 h-8 w-full rounded-[7px] text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-75",
          !active ? "bg-[#6c55f6] text-white hover:brightness-110" : "border border-[#ded8cf] text-[#6d6861] hover:bg-[#fbfaf8]"
        )}
      >
        {button}
      </button>
      <div className="mt-4 space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-[12px] text-[#4d4944]">
            <Icon name="check" size={14} className="text-[#6c55f6]" />
            {feature}
          </div>
        ))}
      </div>
    </div>
  );
}
