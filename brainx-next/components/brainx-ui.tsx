"use client";

import type { ComponentType, MouseEventHandler, ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bolt,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Filter,
  Flame,
  Folder,
  Globe,
  GitBranch,
  Home,
  Languages,
  Link2,
  LockKeyhole,
  LogOut,
  LayoutDashboard,
  Maximize2,
  MessageSquare,
  MoonStar,
  NotebookPen,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { cx } from "@/lib/utils";
import { useBrainX } from "@/components/brainx-provider";

export type IconName =
  | "home"
  | "notes"
  | "graph"
  | "chat"
  | "import"
  | "dash"
  | "bill"
  | "settings"
  | "search"
  | "sparkle"
  | "bell"
  | "bolt"
  | "link"
  | "doc"
  | "folder"
  | "plus"
  | "check"
  | "x"
  | "chevR"
  | "chevD"
  | "sun"
  | "moon"
  | "send"
  | "zoomin"
  | "zoomout"
  | "fit"
  | "cluster"
  | "clock"
  | "star"
  | "filter"
  | "user"
  | "upload"
  | "pdf"
  | "translate"
  | "rewrite"
  | "summarize"
  | "eye"
  | "eyeOff"
  | "lock"
  | "logout"
  | "copy"
  | "arrowL"
  | "brain"
  | "fire"
  | "shield"
  | "refresh"
  | "trash"
  | "globe";

const ICONS: Record<IconName, ComponentType<{ size?: number; className?: string; strokeWidth?: number; fill?: string }>> = {
  home: Home,
  notes: NotebookPen,
  graph: BarChart3,
  chat: MessageSquare,
  import: FileUp,
  dash: LayoutDashboard,
  bill: CreditCard,
  settings: Settings2,
  search: Search,
  sparkle: Sparkles,
  bell: Bell,
  bolt: Bolt,
  link: Link2,
  doc: FileText,
  folder: Folder,
  plus: Plus,
  check: Check,
  x: X,
  chevR: ChevronRight,
  chevD: ChevronDown,
  sun: Sun,
  moon: MoonStar,
  send: Send,
  zoomin: ZoomIn,
  zoomout: ZoomOut,
  fit: Maximize2,
  cluster: GitBranch,
  clock: Clock3,
  star: Star,
  filter: Filter,
  user: UserRound,
  upload: Upload,
  pdf: FileText,
  translate: Languages,
  rewrite: PencilLine,
  summarize: FileText,
  eye: Eye,
  eyeOff: EyeOff,
  lock: LockKeyhole,
  logout: LogOut,
  copy: Copy,
  arrowL: ArrowLeft,
  brain: Brain,
  fire: Flame,
  shield: ShieldCheck,
  refresh: RefreshCw,
  trash: Trash2,
  globe: Globe
};

export function Icon({
  name,
  size = 18,
  className = "",
  strokeWidth = 1.8,
  fill = "none"
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const Component = ICONS[name];
  if (!Component) return null;
  return <Component size={size} className={className} strokeWidth={strokeWidth} fill={fill} />;
}

export function Btn({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  type = "button",
  disabled,
  onClick
}: {
  children: ReactNode;
  variant?: "primary" | "accent" | "soft" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
  const sizeClasses = {
    sm: "h-8 px-3 text-[15px] gap-1.5",
    md: "h-10 px-4 text-[16px] gap-2",
    lg: "h-12 px-6 text-[17px] gap-2 rounded-2xl"
  } as const;

  const variantClasses = {
    primary: "text-white bg-gradient-to-b from-primary to-primary hover:brightness-110 shadow-glow",
    accent: "text-white bg-gradient-to-b from-accent to-accent hover:brightness-110 shadow-glowv",
    soft: "text-txt bg-surface2/70 hover:bg-surface2 border border-line/60",
    ghost: "text-txt2 hover:text-txt hover:bg-surface2/60",
    outline: "text-txt border border-line hover:border-primary/60 hover:text-primary bg-transparent"
  } as const;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center font-medium rounded-xl whitespace-nowrap transition-all duration-200 active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {icon ? <Icon name={icon} size={size === "lg" ? 19 : 16} /> : null}
      {children}
    </button>
  );
}

export function Badge({
  children,
  color,
  className = "",
  dot
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  const style = color
    ? {
        background: `rgb(${color} / 0.14)`,
        color: `rgb(${color})`,
        borderColor: `rgb(${color} / 0.3)`
      }
    : {};

  return (
    <span
      style={style}
      className={cx(
        "inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full text-[13.5px] font-medium whitespace-nowrap border border-line/60 bg-surface2/60 text-txt2",
        className
      )}
    >
      {dot ? <span className="w-1.5 h-1.5 rounded-full" style={{ background: color ? `rgb(${color})` : "currentColor" }} /> : null}
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  glow,
  onClick,
  hover
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "card rounded-2xl",
        hover ? "transition-all duration-300 hover:border-primary/45 hover:-translate-y-0.5 cursor-pointer" : "",
        glow ? "shadow-glow" : "shadow-soft",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Avatar({
  name = "연우",
  size = 36,
  ring,
  imageUrl
}: {
  name?: string;
  size?: number;
  ring?: boolean;
  imageUrl?: string | null;
}) {
  return (
    <div
      style={{ width: size, height: size }}
      className={cx(
        "rounded-full grid place-items-center overflow-hidden font-semibold text-white shrink-0 bg-gradient-to-br from-primary to-accent",
        ring ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-bg" : ""
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="프로필" className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.4 }}>{name[0]}</span>
      )}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  size = "md"
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  size?: "sm" | "md";
}) {
  const width = size === "sm" ? 38 : 46;
  const height = size === "sm" ? 22 : 26;
  const knob = height - 6;
  return (
    <button
      onClick={() => onChange(!on)}
      style={{ width, height }}
      className={cx(
        "relative rounded-full transition-colors duration-300",
        on ? "bg-primary" : "bg-surface2 border border-line"
      )}
    >
      <span
        style={{ width: knob, height: knob, left: on ? width - knob - 4 : 4 }}
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-300"
      />
    </button>
  );
}

export function ThemeToggle() {
  const { effectiveTheme, setTheme } = useBrainX();
  return (
    <button
      onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
      className="h-9 w-9 grid place-items-center rounded-xl border border-line/60 text-txt2 hover:text-txt hover:bg-surface2/60 transition-colors"
      title={effectiveTheme === "dark" ? "Light mode" : "Dark mode"}
      type="button"
    >
      <Icon name={effectiveTheme === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}

export function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${value}%` }} />
      </div>
      <span className="text-[13px] text-txt3 font-mono tabular-nums">{value}%</span>
    </div>
  );
}

export function EmptyState({
  icon = "sparkle",
  title,
  desc,
  action
}: {
  icon?: IconName;
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl grid place-items-center glass mb-5 text-primary">
        <Icon name={icon} size={28} />
      </div>
      <h3 className="text-[20px] font-semibold text-txt mb-1.5">{title}</h3>
      <p className="text-[16px] text-txt2 max-w-xs mb-5 leading-relaxed">{desc}</p>
      {action}
    </div>
  );
}

export function SectionHead({
  icon,
  title,
  sub,
  action,
  color
}: {
  icon: IconName;
  title: string;
  sub?: string;
  action?: ReactNode;
  color?: string;
}) {
  const tone = color ?? "59 130 246";
  return (
    <div className="flex items-end justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-xl grid place-items-center"
          style={{ background: `rgb(${tone} / 0.14)`, color: `rgb(${tone})` }}
        >
          <Icon name={icon} size={17} />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-txt leading-tight">{title}</h2>
          {sub ? <p className="text-[14px] text-txt3">{sub}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ToastStack() {
  const { toasts } = useBrainX();

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2 items-center pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="fade-up glass rounded-xl px-4 h-11 flex items-center gap-2.5 text-[16px] text-txt shadow-soft">
          <Icon
            name={toast.kind === "ok" ? "check" : toast.kind === "err" ? "x" : "sparkle"}
            size={15}
            className={toast.kind === "err" ? "text-pink-400" : toast.kind === "ok" ? "text-cyan" : "text-primary"}
          />
          {toast.message}
        </div>
      ))}
    </div>
  );
}
