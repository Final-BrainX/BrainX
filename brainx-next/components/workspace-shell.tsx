"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useGuideStore } from "@/lib/use-guide-store";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Icon, ThemeToggle } from "@/components/brainx-ui";
import { AccountSettingsModal } from "@/components/utility/account-settings-modal";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cx } from "@/lib/utils";
import {
  readAuthSession,
  type AuthSession,
} from "@/lib/auth-api";
import {
  getMySubscription,
  PAYMENT_RESULT_MESSAGE_TYPE,
  type Subscription,
} from "@/lib/commerce-api";
import { getMyProfile } from "@/lib/user-api";

const NAV = [
  { id: "home", labelKey: "nav.home" as const, icon: "home" as const, path: "/home" },
  { id: "notes", labelKey: "nav.notes" as const, icon: "notes" as const, path: "/notes" },
  { id: "graph", labelKey: "nav.graph" as const, icon: "graph" as const, path: "/graph" },
  { id: "chat", labelKey: "nav.chat" as const, icon: "chat" as const, path: "/chat" },
];

const NAV2 = [
  {
    id: "admin",
    labelKey: "nav.admin" as const,
    icon: "shield" as const,
    path: "/admin",
  },
];

function isActive(pathname: string, path: string) {
  if (path === "/notes") return pathname.startsWith("/notes");
  return pathname === path;
}

function planLabel(subscription: Subscription | null) {
  if (!subscription || subscription.status === "FREE" || subscription.status === "CANCELLED" || subscription.plan.planId === "free") {
    return "Free";
  }

  const name = subscription.plan.name.trim();
  return name === "무료" ? "Free" : name || "Free";
}

function SearchBar() {
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("최신순");
  const [semantic, setSemantic] = useState(false);
  const [open, setOpen] = useState(false);
  const { pushToast, t } = useBrainX();
  const options = ["최신순", "오래된순", "제목 기준", "내용 기준", "기간 검색"];

  return (
    <div className="relative w-full md:flex-1 md:max-w-xl tutorial-target-search">
      <div
        className={cx(
          "group flex h-9 items-center gap-2 rounded-xl border px-3 transition-all duration-200",
          semantic
            ? "border-accent/50 bg-accent/[0.06] shadow-glowv"
            : "border-line/60 bg-surface/60 hover:border-line",
        )}
      >
        <Icon
          name="search"
          size={18}
          className={semantic ? "text-accent" : "text-txt3"}
        />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              pushToast(`"${value}" 검색 완료 · 8개 결과`, "ok");
            }
          }}
          placeholder={
            semantic
              ? '의미로 검색… "어텐션이 왜 작동하는지"'
              : "노트·메모·자료 검색"
          }
          className="flex-1 bg-transparent text-[14px] text-txt outline-none placeholder:text-txt3"
        />
        <button
          type="button"
          onClick={() => setSemantic((current) => !current)}
          className={cx(
            "flex h-6 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap transition-all",
            semantic
              ? "border-accent bg-accent text-white"
              : "border-line/60 bg-surface2/60 text-txt2 hover:text-txt",
          )}
        >
            <Icon name="sparkle" size={13} /> 의미
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex h-6 items-center gap-1 rounded-md px-2 text-[12px] whitespace-nowrap text-txt2 hover:bg-surface2/60 hover:text-txt"
          >
            <Icon name="filter" size={13} /> {filter}{" "}
            <Icon name="chevD" size={12} />
          </button>
          {open ? (
            <div
              className="fade-up glass absolute right-0 top-9 z-50 w-40 rounded-xl p-1.5 shadow-soft"
              onMouseLeave={() => setOpen(false)}
            >
              {options.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setFilter(item);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-[13px]",
                    item === filter
                      ? "bg-surface2/60 text-primary"
                      : "text-txt2 hover:bg-surface2/50 hover:text-txt",
                  )}
                >
                  {item}
                  {item === filter ? <Icon name="check" size={14} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MobileNavButton({
  icon,
  label,
  path,
  onMyPageClick,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  path: string;
  onMyPageClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = isActive(pathname, path);

  return (
    <button
      type="button"
      onClick={() => {
        if (path === "/mypage") {
          onMyPageClick?.();
          return;
        }
        router.push(path);
      }}
      className={cx(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[14px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-txt"
          : "border-line/50 bg-surface2/40 text-txt2 hover:bg-surface2/70 hover:text-txt",
      )}
    >
      <Icon name={icon} size={15} className={active ? "text-primary" : ""} />
      {label}
    </button>
  );
}

function SidebarItem({
  icon,
  label,
  path,
  onMyPageClick,
  notesExplorerOpen,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  path: string;
  onMyPageClick?: () => void;
  notesExplorerOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const active = isActive(pathname, path);
  const isNotes = path === "/notes";

  return (
    <button
      type="button"
      onClick={() => {
        if (path === "/mypage") {
          onMyPageClick?.();
          return;
        }
        if (path === "/notes" && pathname.startsWith("/notes")) {
          window.dispatchEvent(new CustomEvent("brainx-toggle-notes-explorer"));
          return;
        }
        router.push(path);
      }}
      className={cx(
        "group relative flex aspect-square w-full items-center justify-center gap-3 rounded-[0.4rem] transition-all duration-200",
        path === "/home" && "tutorial-target-home",
        path === "/notes" && "tutorial-target-notes",
        path === "/graph" && "tutorial-target-mindmap",
        path === "/chat" && "tutorial-target-ai",
        active
          ? "bg-surface2/80 text-txt"
          : "text-txt2 hover:bg-surface2/50 hover:text-txt",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-accent" />
      ) : null}

      {isNotes && active ? (
        hovered ? (
          notesExplorerOpen !== false ? (
            <PanelLeftClose size={19} className="text-primary" />
          ) : (
            <PanelLeft size={19} className="text-primary" />
          )
        ) : (
          <Icon name={icon} size={19} className="text-primary" />
        )
      ) : (
        <Icon name={icon} size={19} className={active ? "text-primary" : ""} />
      )}
      
      {/* Tooltip on Hover */}
      <span 
        className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      >
        {label}
        <div
          className="absolute left-[-4px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-txt"
          style={{ zIndex: -1 }}
        />
      </span>
    </button>
  );
}

function Sidebar({ onOpenSettings, notesExplorerOpen }: { onOpenSettings: () => void; notesExplorerOpen?: boolean }) {
  const router = useRouter();
  const { t } = useBrainX();

  return (
    <aside
      className="relative z-20 hidden h-full w-[50px] shrink-0 flex-col border-r border-line/50 bg-bg2/40 backdrop-blur-xl transition-all duration-300 md:flex pt-4"
    >
      <nav className="flex-1 space-y-2 px-1">
        {NAV.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            label={t(item.labelKey)}
            onMyPageClick={onOpenSettings}
            notesExplorerOpen={notesExplorerOpen}
          />
        ))}
        <div className="my-3 mx-1 h-px bg-line/50" />
        {NAV2.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            label={t(item.labelKey)}
          />
        ))}
      </nav>

      <div className="mt-auto px-1 pb-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => router.push("/billing")}
          className="group relative grid aspect-square w-full place-items-center rounded-[0.4rem] glass text-accent"
        >
          <Icon name="bolt" size={18} />
          <span 
            className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium bg-txt text-bg2 shadow-md opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          >
            업그레이드
            <div
              className="absolute left-[-4px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 bg-txt"
              style={{ zIndex: -1 }}
            />
          </span>
        </button>
      </div>
    </aside>
  );
}

function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { pushToast, t } = useBrainX();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState("Free");
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const isGuest = !session?.accessToken;

  useEffect(() => {
    setSession(readAuthSession());
    const syncSession = () => setSession(readAuthSession());
    window.addEventListener("brainx-auth-session-changed", syncSession);
    return () =>
      window.removeEventListener("brainx-auth-session-changed", syncSession);
  }, []);

  useEffect(() => {
    let active = true;

    if (!session?.accessToken) {
      setProfileName("");
      setProfileImageUrl(null);
      return () => {
        active = false;
      };
    }

    getMyProfile()
      .then((profile) => {
        if (!active) return;
        setProfileName(
          profile.nickname?.trim() || profile.email.split("@")[0] || "",
        );
        setProfileImageUrl(profile.profileImageUrl);
      })
      .catch(() => {
        if (!active) return;
        setProfileName("");
        setProfileImageUrl(null);
      });

    return () => {
      active = false;
    };
  }, [
    session?.accessToken,
    session?.userId,
    session?.nickname,
    session?.profileImageUrl,
  ]);

  useEffect(() => {
    let active = true;

    const refreshPlan = () => {
      if (!session?.accessToken) {
        setCurrentPlan("Free");
        return;
      }

      getMySubscription()
        .then((subscription) => {
          if (active) setCurrentPlan(planLabel(subscription));
        })
        .catch(() => {
          if (active) setCurrentPlan("Free");
        });
    };

    refreshPlan();

    function handlePaymentMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === PAYMENT_RESULT_MESSAGE_TYPE) refreshPlan();
    }

    window.addEventListener("focus", refreshPlan);
    window.addEventListener("brainx-auth-session-changed", refreshPlan);
    window.addEventListener("brainx-subscription-changed", refreshPlan);
    window.addEventListener("message", handlePaymentMessage);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshPlan);
      window.removeEventListener("brainx-auth-session-changed", refreshPlan);
      window.removeEventListener("brainx-subscription-changed", refreshPlan);
      window.removeEventListener("message", handlePaymentMessage);
    };
  }, [session?.accessToken, session?.userId]);

  const displayName = isGuest
    ? "게스트"
    : profileName ||
      session?.nickname?.trim() ||
      session?.email?.split("@")[0] ||
      "사용자";
  const displayImageUrl = profileImageUrl ?? session?.profileImageUrl;
  const mobileNav = [
    { label: t("nav.home"), icon: "home" as const, path: "/home" },
    { label: t("nav.notes"), icon: "notes" as const, path: "/notes" },
    { label: t("nav.graph"), icon: "graph" as const, path: "/graph" },
    { label: t("nav.chat"), icon: "chat" as const, path: "/chat" },
  ];
  const topTooltipClass =
    "pointer-events-none absolute top-[calc(100%+12px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-txt px-2.5 py-1.5 text-[12px] font-medium text-bg2 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100";

  return (
    <header className="relative z-10 border-b border-line/50 bg-bg2/30 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-4 py-3 md:h-[50px] md:flex-row md:items-center md:gap-2.5 md:pl-0 md:pr-4 md:py-0">
        <div className="hidden h-full w-[50px] shrink-0 items-center justify-center border-r border-line/50 md:flex">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex items-center group"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.4rem] bg-gradient-to-br from-primary via-accent to-cyan shadow-glow">
              <Icon name="brain" size={19} className="text-white" strokeWidth={1.6} />
            </div>
          </button>
        </div>
        <div className="md:ml-2 md:flex-1 md:max-w-lg">
          <SearchBar />
        </div>
        <div className="flex items-center justify-between gap-2 md:ml-auto md:justify-end">
          <div className="tutorial-target-darkmode group relative [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-lg [&_svg]:h-[15px] [&_svg]:w-[15px]">
            <ThemeToggle />
            <span className={topTooltipClass}>
              테마 변경
              <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
            </span>
          </div>
          <button
            type="button"
            onClick={() => pushToast("새 알림은 없습니다", "info")}
            className="tutorial-target-notifications group relative grid h-8 w-8 place-items-center rounded-lg border border-line/60 text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt"
          >
            <Icon name="bell" size={15} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            <span className={topTooltipClass}>
              알림
              <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
            </span>
          </button>
          <div className="mx-1 hidden h-6 w-px bg-line/60 md:block" />
          <div className="relative">
            <button
              type="button"
              onClick={() => (isGuest ? setGuestMenuOpen((current) => !current) : onOpenSettings())}
              className="tutorial-target-profile group relative flex h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-surface2/60"
            >
              <Avatar name={displayName} size={26} imageUrl={displayImageUrl} />
              <div className="hidden text-left leading-tight sm:block">
                <div className="max-w-[110px] truncate text-[12px] font-semibold text-txt">
                  {displayName}
                </div>
                <div className="text-[10px] text-txt3">
                  {isGuest ? "체험 중" : currentPlan}
                </div>
              </div>
              {isGuest ? <Icon name="chevD" size={12} className="text-txt3" /> : null}
              {!isGuest ? (
                <span className={topTooltipClass}>
                  사용자 프로필
                  <div className="absolute left-1/2 top-[-4px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-txt" style={{ zIndex: -1 }} />
                </span>
              ) : null}
            </button>
            {isGuest && guestMenuOpen ? (
              <div
                className="fade-up absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-line/60 bg-surface p-3 shadow-soft"
                onMouseLeave={() => setGuestMenuOpen(false)}
              >
                <div className="px-1">
                  <div className="text-[13px] font-semibold text-txt">체험 모드 사용 중</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-txt2">
                    가입하면 현재 작성한 노트와 폴더를 계정에 저장할 수 있어요.
                  </div>
                </div>
                <div className="my-2 h-px bg-line/50" />
                <button
                  type="button"
                  onClick={() => {
                    setGuestMenuOpen(false);
                    router.push("/signup");
                  }}
                  className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[13px] font-medium text-txt hover:bg-surface2/60"
                >
                  회원가입
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuestMenuOpen(false);
                    router.push("/login");
                  }}
                  className="flex h-9 w-full items-center rounded-lg px-2 text-left text-[13px] text-txt2 hover:bg-surface2/60 hover:text-txt"
                >
                  로그인
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t border-line/40 px-4 py-2 md:hidden">
        <div className="scroll flex gap-2 overflow-x-auto pb-1">
          {mobileNav.map((item) => (
            <MobileNavButton
              key={item.path}
              {...item}
              onMyPageClick={onOpenSettings}
            />
          ))}
        </div>
      </div>
    </header>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesExplorerOpen, setNotesExplorerOpen] = useState(true);

  useEffect(() => {
    const handleExplorerState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail) {
        setNotesExplorerOpen(customEvent.detail.open);
      } else {
        // Toggle if no detail
        setNotesExplorerOpen((prev) => !prev);
      }
    };
    window.addEventListener("brainx-toggle-notes-explorer", handleExplorerState);
    return () => window.removeEventListener("brainx-toggle-notes-explorer", handleExplorerState);
  }, []);

  useEffect(() => {
    if (pathname === "/mypage") {
      if (readAuthSession()?.accessToken) {
        setSettingsOpen(true);
      }
      router.replace("/home");
    }
  }, [pathname, router]);

  return (
    <div className="flex h-[100svh] w-full flex-col overflow-hidden">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} notesExplorerOpen={notesExplorerOpen} />
        <main className="scroll relative flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
      <AccountSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
