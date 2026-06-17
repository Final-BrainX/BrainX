"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBrainX } from "@/components/brainx-provider";
import { Avatar, Badge, Btn, Icon, ThemeToggle } from "@/components/brainx-ui";
import { AccountSettingsModal } from "@/components/utility/account-settings-modal";
import { cx } from "@/lib/utils";
import { readAuthSession, type AuthSession } from "@/lib/auth-api";

const NAV = [
  { id: "home", labelKey: "nav.home" as const, icon: "home" as const, path: "/home" },
  { id: "notes", labelKey: "nav.notes" as const, icon: "notes" as const, path: "/notes/n1" },
  { id: "graph", labelKey: "nav.graph" as const, icon: "graph" as const, path: "/graph" },
  { id: "chat", labelKey: "nav.chat" as const, icon: "chat" as const, path: "/chat" },
  { id: "import", labelKey: "nav.import" as const, icon: "import" as const, path: "/import" }
];

const NAV2 = [
  { id: "admin", labelKey: "nav.admin" as const, icon: "shield" as const, path: "/admin" }
];

function isActive(pathname: string, path: string) {
  if (path === "/notes/n1") return pathname.startsWith("/notes");
  return pathname === path;
}

function SearchBar() {
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("최신순");
  const [semantic, setSemantic] = useState(false);
  const [open, setOpen] = useState(false);
  const { pushToast, t } = useBrainX();
  const options = ["최신순", "오래된순", "제목 기준", "내용 기준", "기간 검색"];

  return (
    <div className="relative w-full md:flex-1 md:max-w-xl">
      <div
        className={cx(
          "group flex h-11 items-center gap-2.5 rounded-2xl border px-3.5 transition-all duration-200",
          semantic ? "border-accent/50 bg-accent/[0.06] shadow-glowv" : "border-line/60 bg-surface/60 hover:border-line"
        )}
      >
        <Icon name="search" size={18} className={semantic ? "text-accent" : "text-txt3"} />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              pushToast(`"${value}" 검색 완료 · 8개 결과`, "ok");
            }
          }}
          placeholder={semantic ? '의미로 검색… "어텐션이 왜 작동하는지"' : "노트·메모·자료 검색"}
          className="flex-1 bg-transparent text-[16px] text-txt outline-none placeholder:text-txt3"
        />
        <button
          type="button"
          onClick={() => setSemantic((current) => !current)}
          className={cx(
            "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[14px] font-medium whitespace-nowrap transition-all",
            semantic ? "border-accent bg-accent text-white" : "border-line/60 bg-surface2/60 text-txt2 hover:text-txt"
          )}
        >
          <Icon name="sparkle" size={13} /> 의미
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[14px] whitespace-nowrap text-txt2 hover:bg-surface2/60 hover:text-txt"
          >
            <Icon name="filter" size={13} /> {filter} <Icon name="chevD" size={12} />
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
                    "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-[15px]",
                    item === filter ? "bg-surface2/60 text-primary" : "text-txt2 hover:bg-surface2/50 hover:text-txt"
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
  onMyPageClick
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
        active ? "border-primary/40 bg-primary/10 text-txt" : "border-line/50 bg-surface2/40 text-txt2 hover:bg-surface2/70 hover:text-txt"
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
  collapsed,
  onMyPageClick
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  path: string;
  collapsed: boolean;
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
        "group relative flex h-11 w-full items-center gap-3 rounded-xl px-3 transition-all duration-200",
        active ? "bg-surface2/80 text-txt" : "text-txt2 hover:bg-surface2/50 hover:text-txt"
      )}
    >
      {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary to-accent" /> : null}
      <Icon name={icon} size={19} className={active ? "text-primary" : ""} />
      {!collapsed ? <span className="text-[16px] font-medium whitespace-nowrap">{label}</span> : null}
      {collapsed ? (
        <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg border border-line/60 bg-surface2 px-2 py-1 text-[14px] text-txt opacity-0 shadow-soft group-hover:opacity-100">
          {label}
        </span>
      ) : null}
    </button>
  );
}

function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const router = useRouter();
  const { sidebarCollapsed, setSidebarCollapsed, notes, t } = useBrainX();

  return (
    <aside
      className={cx(
        "relative z-20 hidden h-full shrink-0 flex-col border-r border-line/50 bg-bg2/40 backdrop-blur-xl transition-all duration-300 md:flex",
        sidebarCollapsed ? "w-[68px]" : "w-[236px]"
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2.5 group">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary via-accent to-cyan shadow-glow">
            <Icon name="brain" size={20} className="text-white" strokeWidth={1.6} />
          </div>
          {!sidebarCollapsed ? <span className="text-[21px] font-bold tracking-tight text-txt font-display">BrainX</span> : null}
        </button>
      </div>

      <div className="mb-2 px-3">
        <Btn variant="primary" size={sidebarCollapsed ? "sm" : "md"} icon="plus" className={cx("w-full", sidebarCollapsed && "px-0")} onClick={() => router.push("/notes/new")}>
          {!sidebarCollapsed ? "새 노트" : null}
        </Btn>
      </div>

      <nav className="scroll flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((item) => (
          <SidebarItem key={item.id} {...item} label={t(item.labelKey)} collapsed={sidebarCollapsed} onMyPageClick={onOpenSettings} />
        ))}
        <div className="my-3 mx-1 h-px bg-line/50" />
        {NAV2.map((item) => (
          <SidebarItem key={item.id} {...item} label={t(item.labelKey)} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      {!sidebarCollapsed ? (
        <div className="m-3 rounded-2xl glass p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-txt">Free 플랜</span>
            <Badge color="139 92 246" className="!h-5">
              Pro 추천
            </Badge>
          </div>
          <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.min(64 + notes.length, 92)}%` }} />
          </div>
          <p className="text-[13px] text-txt3">토큰 12.8K / 20K · 이번 달</p>
          <Btn variant="soft" size="sm" className="mt-3 w-full" onClick={() => router.push("/billing")}>
            업그레이드
          </Btn>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => router.push("/billing")}
          className="m-3 grid h-10 place-items-center rounded-xl glass text-accent"
          title="업그레이드"
        >
          <Icon name="bolt" size={18} />
        </button>
      )}

      <button
        type="button"
        onClick={() => setSidebarCollapsed((current) => !current)}
        className="absolute -right-3 top-20 z-30 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface2 text-txt2 shadow-soft hover:text-txt"
      >
        <Icon name="chevR" size={14} className={cx("transition-transform", sidebarCollapsed ? "" : "rotate-180")} />
      </button>
    </aside>
  );
}

function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { pushToast, t } = useBrainX();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const displayName = session?.nickname?.trim() || session?.email?.split("@")[0] || "사용자";
  const mobileNav = [
    { label: t("nav.home"), icon: "home" as const, path: "/home" },
    { label: t("nav.notes"), icon: "notes" as const, path: "/notes/n1" },
    { label: t("nav.graph"), icon: "graph" as const, path: "/graph" },
    { label: t("nav.chat"), icon: "chat" as const, path: "/chat" },
    { label: t("nav.import"), icon: "import" as const, path: "/import" }
  ];

  useEffect(() => {
    setSession(readAuthSession());
    const syncSession = () => setSession(readAuthSession());
    window.addEventListener("brainx-auth-session-changed", syncSession);
    return () => window.removeEventListener("brainx-auth-session-changed", syncSession);
  }, []);

  return (
    <header className="relative z-10 border-b border-line/50 bg-bg2/30 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:gap-3 md:px-5 md:py-0">
        <SearchBar />
        <div className="flex items-center justify-between gap-2 md:ml-auto md:justify-end">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => pushToast("새 알림은 없습니다", "info")}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-line/60 text-txt2 transition-colors hover:bg-surface2/60 hover:text-txt"
          >
            <Icon name="bell" size={17} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
          <div className="mx-1 hidden h-6 w-px bg-line/60 md:block" />
          <button type="button" onClick={onOpenSettings} className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 transition-colors hover:bg-surface2/60">
            <Avatar name={displayName} size={32} imageUrl={session?.profileImageUrl} />
            <div className="hidden text-left leading-tight sm:block">
              <div className="text-[13px] font-semibold text-txt">김연우</div>
              <div className="text-[11px] text-txt3">Free 플랜</div>
            </div>
          </button>
        </div>
      </div>
      <div className="border-t border-line/40 px-4 py-2 md:hidden">
        <div className="scroll flex gap-2 overflow-x-auto pb-1">
          {mobileNav.map((item) => (
            <MobileNavButton key={item.path} {...item} onMyPageClick={onOpenSettings} />
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

  useEffect(() => {
    if (pathname === "/mypage") {
      setSettingsOpen(true);
      router.replace("/home");
    }
  }, [pathname, router]);

  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />
        <main className="scroll relative flex-1 overflow-y-auto">{children}</main>
      </div>
      <AccountSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
