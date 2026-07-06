"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { Icon, Btn, Card, Toggle, Avatar } from "@/components/brainx-ui";
import type { BrainXNote } from "@/lib/brainx-data";
import { getOAuthAuthorization, type OAuthProvider } from "@/lib/auth-api";
import {
  cancelAccountDeletion,
  changeMyPassword,
  getMyProfile,
  requestAccountDeletion,
  unlinkSocialAccount,
  updateMyConsents,
  updateMyProfile,
  AuthRequiredError,
  type ConsentPayload,
  type MyProfile
} from "@/lib/user-api";

const COVER_KEY = "brainx_profile_cover_v1";
const OAUTH_LINK_INTENT_KEY = "brainx_oauth_link_intent_v1";
const PROVIDERS = ["google", "kakao", "naver"] as const;
type SocialProvider = (typeof PROVIDERS)[number];
const SOCIAL_PROVIDERS: Record<SocialProvider, { name: string; mark: string; color: string; bg: string; border: string; text: string }> = {
  google: {
    name: "Google",
    mark: "G",
    color: "#4285F4",
    bg: "#ffffff",
    border: "#dfe5f2",
    text: "#1f2937"
  },
  kakao: {
    name: "Kakao",
    mark: "K",
    color: "#000000",
    bg: "#FEE500",
    border: "#f0d700",
    text: "#191919"
  },
  naver: {
    name: "Naver",
    mark: "N",
    color: "#ffffff",
    bg: "#03C75A",
    border: "#03b653",
    text: "#ffffff"
  }
};
const TOKEN_LIMIT = 20000;
const TOKEN_USED = 12800;
const TOKEN_USAGE_PERCENT = Math.round((TOKEN_USED / TOKEN_LIMIT) * 100);
const STORAGE_LIMIT_GB = 5;
const STORAGE_USED_GB = 1.4;
const STORAGE_USAGE_PERCENT = Math.round((STORAGE_USED_GB / STORAGE_LIMIT_GB) * 100);
const SHARE_LINK_LIMIT = 30;
const SHARE_LINK_USED = 6;
const SHARE_LINK_USAGE_PERCENT = Math.round((SHARE_LINK_USED / SHARE_LINK_LIMIT) * 100);
type ActivityPeriod = "day" | "week" | "month";
const ACTIVITY_FILTERS: { id: ActivityPeriod; label: string }[] = [
  { id: "day", label: "일별" },
  { id: "week", label: "주별" },
  { id: "month", label: "월별" }
];

function displayName(profile: MyProfile | null) {
  return profile?.nickname?.trim() || profile?.email?.split("@")[0] || "BrainX 사용자";
}

function readImageFile(event: ChangeEvent<HTMLInputElement>, onLoad: (value: string) => void) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onLoad(typeof reader.result === "string" ? reader.result : "");
  reader.readAsDataURL(file);
}

function ProfileAvatar({ name, imageUrl, size = 112 }: { name: string; imageUrl?: string | null; size?: number }) {
  return (
    <div className="relative shadow-soft rounded-full bg-bg p-1 shrink-0" style={{ width: size + 8, height: size + 8 }}>
      <Avatar name={name} imageUrl={imageUrl} size={size} />
    </div>
  );
}

function formatToken(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K` : value.toLocaleString();
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ContributionGrid({ notes }: { notes: BrainXNote[] }) {
  const weekCount = 52;
  const weekStep = 17;
  const cellSize = 13;
  const cellGap = 4;
  const gridWidth = weekCount * weekStep - cellGap;
  const labelColumnWidth = 34;
  const labelGap = 12;
  const graphWidth = labelColumnWidth + labelGap + gridWidth;
  const dayLabels = [
    { label: "월", row: 1 },
    { label: "수", row: 3 },
    { label: "금", row: 5 }
  ];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (weekCount * 7 - 1));
  const totalCells = weekCount * 7;
  const colors = ["var(--surface2)", "rgb(var(--primary) / 0.2)", "rgb(var(--primary) / 0.4)", "rgb(var(--primary) / 0.7)", "rgb(var(--primary))"];
  const noteCountsByDate = notes.reduce<Record<string, number>>((counts, note) => {
    const targetDate = new Date(note.updatedAt || note.createdAt);
    if (Number.isNaN(targetDate.getTime())) return counts;
    const key = dateKey(targetDate);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const monthLabels = Array.from({ length: weekCount }).reduce<{ label: string; week: number }[]>((labels, _, week) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + week * 7);
    const label = `${date.getMonth() + 1}월`;
    if (week === 0 || labels[labels.length - 1]?.label !== label) {
      labels.push({ label, week });
    }
    return labels;
  }, []);
  const rangeLabel = `${startDate.getFullYear()}년 ${startDate.getMonth() + 1}월 - ${today.getFullYear()}년 ${today.getMonth() + 1}월`;

  return (
    <Card className="overflow-x-auto px-4 py-4 scroll">
      <div className="mx-auto" style={{ width: `${graphWidth}px` }}>
        <div className="mb-3 flex items-center justify-between text-[12px] text-txt3">
          <span>{rangeLabel}</span>
          <span>노트 작성/저장 기준</span>
        </div>

        <div
          className="grid"
          style={{
            columnGap: `${labelGap}px`,
            gridTemplateColumns: `${labelColumnWidth}px ${gridWidth}px`
          }}
        >
          <div />
          <div className="relative mb-2 h-4 text-[12px] text-txt" style={{ width: `${gridWidth}px` }}>
            {monthLabels.map((month) => (
              <span key={`${month.label}-${month.week}`} className="absolute top-0" style={{ left: `${month.week * weekStep}px` }}>
                {month.label}
              </span>
            ))}
          </div>

          <div className="relative h-[115px] text-[12px] text-txt3">
            {dayLabels.map((day) => (
              <span key={day.label} className="absolute right-1" style={{ top: `${day.row * weekStep - 1}px` }}>
                {day.label}
              </span>
            ))}
          </div>

          <div
            className="grid grid-flow-col grid-rows-7"
            style={{
              gap: `${cellGap}px`,
              gridTemplateColumns: `repeat(${weekCount}, ${cellSize}px)`,
              width: `${gridWidth}px`
            }}
          >
            {Array.from({ length: totalCells }).map((_, index) => {
              const cellDate = new Date(startDate);
              cellDate.setDate(startDate.getDate() + index);
              const count = noteCountsByDate[dateKey(cellDate)] ?? 0;
              const intensity = Math.min(4, count);
              return (
                <span
                  key={index}
                  title={`${dateKey(cellDate)} · ${count}개 노트`}
                  className="rounded-[3px] ring-1 ring-inset ring-line/10"
                  style={{ width: `${cellSize}px`, height: `${cellSize}px`, backgroundColor: colors[intensity] }}
                />
              );
            })}
          </div>

          <div />
          <div className="mt-4 flex items-center justify-between text-[12px] text-txt3">
            <span>노트를 작성하거나 저장한 날짜를 기준으로 표시됩니다</span>
            <div className="flex items-center gap-1">
              <span>적음</span>
              <div className="flex gap-[3px]">
                {colors.map((color) => (
                  <span key={color} className="h-[11px] w-[11px] rounded-[2px]" style={{ backgroundColor: color }} />
                ))}
              </div>
              <span>많음</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  percent,
  tone = "from-primary via-accent to-cyan"
}: {
  label: string;
  used: string;
  limit: string;
  percent: number;
  tone?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-txt">{label}</div>
          <div className="mt-0.5 text-[11.5px] text-txt3">{used} / {limit}</div>
        </div>
        <div className="text-[13px] font-bold text-txt">{percent}%</div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface2">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TokenUsageCard() {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-txt">사용량</h3>
          <p className="mt-1 text-[12px] text-txt3">현재 플랜 기준으로 이번 달 사용량을 계산합니다.</p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-bold tracking-tight text-txt">{TOKEN_USAGE_PERCENT}%</div>
          <div className="text-[12px] text-txt3">AI 토큰</div>
        </div>
      </div>
      <div className="space-y-5">
        <UsageMeter
          label="AI 토큰"
          used={formatToken(TOKEN_USED)}
          limit={formatToken(TOKEN_LIMIT)}
          percent={TOKEN_USAGE_PERCENT}
        />
        <UsageMeter
          label="저장 용량"
          used={`${STORAGE_USED_GB.toFixed(1)}GB`}
          limit={`${STORAGE_LIMIT_GB}GB`}
          percent={STORAGE_USAGE_PERCENT}
          tone="from-cyan to-primary"
        />
        <UsageMeter
          label="공유 링크"
          used={`${SHARE_LINK_USED}개`}
          limit={`${SHARE_LINK_LIMIT}개`}
          percent={SHARE_LINK_USAGE_PERCENT}
          tone="from-accent to-pink-400"
        />
      </div>
    </Card>
  );
}

function buildActivitySeries(notes: BrainXNote[], period: ActivityPeriod) {
  const bucketCount = period === "day" ? 14 : 12;
  const now = new Date();
  const values = Array.from({ length: bucketCount }, () => 0);

  notes.forEach((note, index) => {
    const noteDate = new Date(note.createdAt);
    let bucketIndex = -1;

    if (!Number.isNaN(noteDate.getTime())) {
      if (period === "day") {
        const diffDays = Math.floor((now.getTime() - noteDate.getTime()) / 86400000);
        bucketIndex = bucketCount - 1 - diffDays;
      } else if (period === "week") {
        const diffWeeks = Math.floor((now.getTime() - noteDate.getTime()) / 604800000);
        bucketIndex = bucketCount - 1 - diffWeeks;
      } else {
        const diffMonths =
          (now.getFullYear() - noteDate.getFullYear()) * 12 + now.getMonth() - noteDate.getMonth();
        bucketIndex = bucketCount - 1 - diffMonths;
      }
    }

    if (bucketIndex < 0 || bucketIndex >= bucketCount) {
      bucketIndex = (index * 5 + note.links.length * 3) % bucketCount;
    }

    values[bucketIndex] += 1 + Math.min(3, note.links.length);
  });

  return values.map((value, index) => {
    if (period === "day") {
      const date = new Date(now);
      date.setDate(now.getDate() - (bucketCount - 1 - index));
      return { label: `${date.getMonth() + 1}/${date.getDate()}`, value };
    }
    if (period === "week") {
      return { label: `${bucketCount - index}주 전`, value };
    }
    const date = new Date(now.getFullYear(), now.getMonth() - (bucketCount - 1 - index), 1);
    return { label: `${date.getFullYear()}.${date.getMonth() + 1}`, value };
  });
}

function calculateWritingStreak(notes: BrainXNote[]) {
  if (notes.length === 0) return 0;
  const activeDays = new Set(
    notes
      .map((note) => new Date(note.updatedAt || note.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString().slice(0, 10))
  );
  if (activeDays.size <= 1) return Math.min(7, Math.max(1, Math.ceil(notes.length / 3)));

  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 365; index += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!activeDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function resampleChartPoints(points: { label: string; value: number }[], length: number) {
  if (points.length === length) return points;
  if (points.length === 0) return Array.from({ length }, () => ({ label: "", value: 0 }));

  return Array.from({ length }).map((_, index) => {
    const sourcePosition = length <= 1 ? 0 : (index / (length - 1)) * (points.length - 1);
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(points.length - 1, leftIndex + 1);
    const progress = sourcePosition - leftIndex;
    const value = points[leftIndex].value + (points[rightIndex].value - points[leftIndex].value) * progress;
    return { label: points[leftIndex].label, value };
  });
}

function ActivityLineChart({ points }: { points: { label: string; value: number }[] }) {
  const [animatedPoints, setAnimatedPoints] = useState(points);
  const previousPointsRef = useRef(points);
  const pointSignature = points.map((point) => `${point.label}:${point.value}`).join("|");
  const width = 640;
  const height = 210;
  const padding = { top: 18, right: 18, bottom: 34, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...points.map((point) => point.value), ...animatedPoints.map((point) => point.value));
  const coordinates = animatedPoints.map((point, index) => {
    const x = padding.left + (innerWidth / Math.max(1, animatedPoints.length - 1)) * index;
    const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight;
    return { ...point, x, y };
  });
  const path = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(animatedPoints.length / 6));

  useEffect(() => {
    const fromPoints = resampleChartPoints(previousPointsRef.current, points.length);
    const duration = 460;
    let frame = 0;
    let startTime = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setAnimatedPoints(
        points.map((point, index) => ({
          ...point,
          value: fromPoints[index].value + (point.value - fromPoints[index].value) * eased
        }))
      );

      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        previousPointsRef.current = points;
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [pointSignature, points]);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] min-w-[620px] w-full" role="img" aria-label="생성 추이 그래프">
        {[0, 1, 2, 3].map((line) => {
          const y = padding.top + (innerHeight / 3) * line;
          return <line key={line} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--line)" opacity={0.5} />;
        })}
        <polyline fill="none" points={path} stroke="rgb(var(--primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <polygon
          points={`${padding.left},${height - padding.bottom} ${path} ${width - padding.right},${height - padding.bottom}`}
          fill="url(#activityFill)"
          opacity="0.5"
        />
        <defs>
          <linearGradient id="activityFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {coordinates.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="4.5" fill="rgb(var(--primary))" stroke="var(--bg)" strokeWidth="2" />
        ))}
        {coordinates.map((point, index) =>
          index % labelStep === 0 || index === coordinates.length - 1 ? (
            <text key={point.label} x={point.x} y={height - 10} textAnchor="middle" className="fill-txt3 text-[11px]">
              {point.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

function ActivityDashboard({
  notes,
  period,
  onPeriodChange
}: {
  notes: BrainXNote[];
  period: ActivityPeriod;
  onPeriodChange: (period: ActivityPeriod) => void;
}) {
  const series = buildActivitySeries(notes, period);
  const totalLinks = notes.reduce((sum, note) => sum + note.links.length, 0);
  const mindMapNodeCount = new Set(notes.flatMap((note) => [note.id, ...note.links])).size;
  const streak = calculateWritingStreak(notes);
  const topConnectedNotes = [...notes]
    .sort((a, b) => b.links.length - a.links.length || b.words - a.words)
    .slice(0, 5);
  const activeLabel = ACTIVITY_FILTERS.find((filter) => filter.id === period)?.label ?? "주별";

  return (
    <section className="mt-8 rounded-[22px] border border-line/40 bg-surface/70 px-5 py-6 shadow-soft md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-txt2">개인 활동 지표</p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-txt">BrainX 활동 리포트</h2>
        </div>
        <div className="inline-flex w-fit rounded-full border border-line bg-surface p-1 shadow-sm">
          {ACTIVITY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onPeriodChange(filter.id)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${
                period === filter.id ? "bg-txt text-bg shadow-sm" : "text-txt2 hover:bg-surface2"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "총 노트 수", value: notes.length.toLocaleString(), caption: "작성된 노트" },
          { label: "마인드맵 노드 수", value: mindMapNodeCount.toLocaleString(), caption: "노트와 연결 노드" },
          { label: "연속 작성 스트릭", value: `${streak}일`, caption: "최근 작성 흐름" },
          { label: "연결 수", value: totalLinks.toLocaleString(), caption: "노트 간 링크" }
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line/40 bg-surface2 p-4">
            <p className="text-[12px] font-medium text-txt2">{stat.label}</p>
            <p className="mt-2 text-[26px] font-bold tracking-tight text-txt">{stat.value}</p>
            <p className="mt-1 text-[12px] text-txt3">{stat.caption}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold text-txt">생성 추이 그래프</h3>
              <p className="mt-1 text-[12px] text-txt3">{activeLabel} 기준으로 노트 생성과 연결 활동을 표시합니다.</p>
            </div>
          </div>
          <ActivityLineChart points={series} />
        </Card>

        <Card className="p-4">
          <h3 className="text-[16px] font-semibold text-txt">가장 많이 연결된 노트 TOP 5</h3>
          <div className="mt-4 space-y-3">
            {topConnectedNotes.map((note, index) => (
              <div key={note.id} className="flex items-center gap-3 rounded-xl bg-surface2 px-3 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-txt text-[12px] font-bold text-bg">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-txt">{note.title}</p>
                  <p className="mt-0.5 text-[12px] text-txt3">{note.links.length}개 연결 · {note.words.toLocaleString()}단어</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-[14px] font-medium text-txt2">{children}</span>;
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line/40 px-6 py-6 first:border-t-0">
      <h3 className="mb-4 text-[17px] font-semibold text-txt">{title}</h3>
      {children}
    </section>
  );
}

function hasEmailPassword(profile: MyProfile | null) {
  if (!profile) return true;
  if (typeof profile.security.hasPassword === "boolean") return profile.security.hasPassword;
  return profile.security.linkedProviders.length === 0;
}

function PasswordInput({
  placeholder,
  value,
  visible,
  onChange,
  onToggle
}: {
  placeholder: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-line/60 bg-surface px-3 pr-11 text-[14px] text-txt outline-none transition focus:border-primary/60"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-txt3 transition hover:bg-surface2 hover:text-txt"
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={17} />
      </button>
    </div>
  );
}

function ImageActionMenu({
  className = "",
  onChoose,
  onDelete
}: {
  className?: string;
  onChoose: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className={`absolute z-40 w-32 overflow-hidden rounded-2xl border border-line/60 bg-surface p-1.5 text-txt shadow-soft ${className}`}
    >
      <button type="button" onClick={onChoose} className="h-9 w-full rounded-xl px-3 text-left text-[13px] font-medium hover:bg-surface2">
        사진 선택
      </button>
      <button type="button" onClick={onDelete} className="h-9 w-full rounded-xl px-3 text-left text-[13px] font-medium text-red-500 hover:bg-red-500/10">
        삭제
      </button>
    </div>
  );
}

function ConsentToggle({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface2 px-3 py-3">
      <span className="text-[14px] text-txt">{label}</span>
      <div className={disabled ? "pointer-events-none opacity-50" : ""}>
        <Toggle on={checked} onChange={(v) => !disabled && onChange(v)} size="sm" />
      </div>
    </div>
  );
}

function AccountSettingsModal({
  profile,
  coverImage,
  onClose,
  onProfileChange,
  onCoverChange
}: {
  profile: MyProfile | null;
  coverImage: string;
  onClose: () => void;
  onProfileChange: (profile: MyProfile) => void;
  onCoverChange: (coverImage: string) => void;
}) {
  const { pushToast, sidebarCollapsed } = useBrainX();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState(displayName(profile));
  const [profileImage, setProfileImage] = useState(profile?.profileImageUrl ?? "");
  const [coverDraft, setCoverDraft] = useState(coverImage);
  const [imageMenuOpen, setImageMenuOpen] = useState<"cover" | "profile" | null>(null);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
  const [passwordSectionOpen, setPasswordSectionOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ currentPassword: false, newPassword: false, newPasswordConfirm: false });
  const [consents, setConsents] = useState<ConsentPayload>({
    termsRequired: profile?.consents.termsRequired ?? true,
    privacyRequired: profile?.consents.privacyRequired ?? true,
    marketingOptional: profile?.consents.marketingOptional ?? false,
    behaviorAnalyticsOptional: profile?.consents.behaviorAnalyticsOptional ?? false
  });
  const [deletionReason, setDeletionReason] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    function closeOnOutsideMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || dialogRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("mousedown", closeOnOutsideMouseDown);
    return () => document.removeEventListener("mousedown", closeOnOutsideMouseDown);
  }, [onClose]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const saved = await updateMyProfile({ nickname: nickname.trim(), profileImageAssetId: profileImage });
      onProfileChange({
        ...(profile as MyProfile),
        nickname: saved.nickname,
        profileImageUrl: saved.profileImageUrl
      });
      onCoverChange(coverDraft);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COVER_KEY, coverDraft);
      }
      pushToast("프로필이 저장되었습니다.", "ok");
      onClose();
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
      setVisiblePasswords({ currentPassword: false, newPassword: false, newPasswordConfirm: false });
      setPasswordSectionOpen(false);
      pushToast("비밀번호가 변경되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "비밀번호 변경에 실패했습니다.", "err");
    }
  };

  const startSocialLink = async (provider: SocialProvider) => {
    try {
      const data = await getOAuthAuthorization(provider as OAuthProvider);
      window.localStorage.setItem(OAUTH_LINK_INTENT_KEY, JSON.stringify({ provider, state: data.state, returnTo: "/mypage" }));
      window.location.href = data.authorizationUrl;
    } catch (error) {
      window.localStorage.removeItem(OAUTH_LINK_INTENT_KEY);
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결을 시작할 수 없습니다.", "err");
    }
  };

  const chooseImage = (target: "cover" | "profile") => {
    setImageMenuOpen(null);
    if (target === "cover") {
      coverInputRef.current?.click();
    } else {
      profileInputRef.current?.click();
    }
  };

  const deleteImage = (target: "cover" | "profile") => {
    setImageMenuOpen(null);
    if (target === "cover") {
      setCoverDraft("");
      if (coverInputRef.current) coverInputRef.current.value = "";
    } else {
      setProfileImage("");
      if (profileInputRef.current) profileInputRef.current.value = "";
    }
  };

  const removeSocialLink = async (provider: string) => {
    try {
      await unlinkSocialAccount(provider);
      onProfileChange({
        ...(profile as MyProfile),
        security: {
          ...(profile as MyProfile).security,
          linkedProviders: (profile?.security.linkedProviders ?? []).filter((item) => item !== provider)
        }
      });
      pushToast("소셜 계정 연결이 해제되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결 해제에 실패했습니다.", "err");
    }
  };

  const saveConsents = async (next: ConsentPayload) => {
    setConsents(next);
    try {
      const saved = await updateMyConsents(next);
      onProfileChange({ ...(profile as MyProfile), consents: saved });
      pushToast("개인정보 동의가 수정되었습니다.", "ok");
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

  const name = nickname || displayName(profile);
  const canChangePassword = hasEmailPassword(profile);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed bottom-0 right-0 top-0 z-50 flex h-dvh items-center justify-center overflow-y-auto bg-black/62 px-4 py-6 left-0 ${
        sidebarCollapsed ? "md:left-[68px]" : "md:left-[236px]"
      }`}
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        className="max-h-[88svh] w-full max-w-[628px] overflow-hidden rounded-[26px] bg-bg text-txt shadow-[0_24px_80px_rgb(0_0_0/0.35)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-[68px] items-center justify-between border-b border-line/40 px-6 bg-surface/40">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface2" aria-label="닫기">
            <Icon name="x" size={19} />
          </button>
          <h2 className="text-[20px] font-semibold">계정 설정</h2>
          <Btn
            variant="primary"
            onClick={saveProfile}
            disabled={savingProfile || !nickname.trim()}
          >
            {savingProfile ? "저장 중" : "저장"}
          </Btn>
        </div>

        <div className="scroll max-h-[calc(88svh-68px)] overflow-y-auto">
          <div
            onClick={() => setImageMenuOpen((current) => current === "cover" ? null : "cover")}
            className="relative z-0 h-[154px] cursor-pointer bg-[linear-gradient(120deg,#91b5f7_0%,#ef9bdb_52%,#f38a62_100%)]"
          >
            {coverDraft ? <img src={coverDraft} alt="배경 이미지" className="h-full w-full object-cover" /> : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setImageMenuOpen((current) => current === "cover" ? null : "cover");
              }}
              className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
              aria-label="배경사진 변경"
            >
              <Icon name="upload" size={19} />
            </button>
            {imageMenuOpen === "cover" ? (
              <ImageActionMenu
                className="left-1/2 top-[calc(50%+32px)] -translate-x-1/2"
                onChoose={() => chooseImage("cover")}
                onDelete={() => deleteImage("cover")}
              />
            ) : null}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => readImageFile(event, setCoverDraft)} />
            <div
              onClick={(event) => {
                event.stopPropagation();
                setImageMenuOpen((current) => current === "profile" ? null : "profile");
              }}
              className="absolute -bottom-14 left-6 z-20 cursor-pointer"
            >
              <ProfileAvatar name={name} imageUrl={profileImage || null} size={112} />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageMenuOpen((current) => current === "profile" ? null : "profile");
                }}
                className="absolute right-0 top-2 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-black text-white shadow"
                aria-label="프로필 사진 변경"
              >
                <Icon name="upload" size={15} />
              </button>
              {imageMenuOpen === "profile" ? (
                <ImageActionMenu
                  className="left-full top-0 ml-3"
                  onChoose={() => chooseImage("profile")}
                  onDelete={() => deleteImage("profile")}
                />
              ) : null}
            </div>
            <input ref={profileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => readImageFile(event, setProfileImage)} />
          </div>

          <div className="h-16" />

          <ModalSection title="프로필">
            <div className="space-y-4">
              <label className="block">
                <FieldLabel>이름</FieldLabel>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line/60 bg-surface px-3.5 text-[15px] text-txt outline-none transition focus:border-primary/60"
                />
              </label>
              <label className="block">
                <FieldLabel>이메일</FieldLabel>
                <input value={profile?.email ?? ""} disabled className="h-11 w-full rounded-xl border border-line/40 bg-surface2 px-3.5 text-[15px] text-txt3" />
              </label>
            </div>
          </ModalSection>

          <ModalSection title="소셜 계정 연결">
            <div className="mb-3 flex flex-wrap gap-2">
              {PROVIDERS.map((provider) => {
                const linked = profile?.security.linkedProviders.includes(provider) ?? false;
                const social = SOCIAL_PROVIDERS[provider];
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => linked ? removeSocialLink(provider) : startSocialLink(provider)}
                    className="inline-flex h-12 items-center gap-2.5 rounded-[18px] border px-4 text-[14px] font-medium transition hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: linked ? social.border : "#d4d4d4",
                      backgroundColor: linked ? social.bg : "#ffffff",
                      color: linked ? social.text : "#404040"
                    }}
                  >
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold"
                      style={{
                        backgroundColor: linked ? "rgb(255 255 255 / 0.28)" : social.bg,
                        color: social.color,
                        border: `1px solid ${social.border}`
                      }}
                    >
                      {social.mark}
                    </span>
                    <span>{social.name}</span>
                    <span className="ml-1 text-[12px] opacity-70">{linked ? "연결됨" : "연결하기"}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] leading-5 text-txt3">연결된 소셜 계정으로 로그인해도 현재 BrainX 계정으로 들어옵니다.</p>
          </ModalSection>

          <ModalSection title="비밀번호 변경">
            {canChangePassword ? (
              <>
                <button
                  type="button"
                  onClick={() => setPasswordSectionOpen((open) => !open)}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-line/60 bg-surface px-4 text-left text-[15px] font-medium text-txt transition hover:border-primary/50"
                  aria-expanded={passwordSectionOpen}
                >
                  <span>비밀번호 변경</span>
                  <Icon name="chevD" size={18} className={`text-txt3 transition ${passwordSectionOpen ? "rotate-180" : ""}`} />
                </button>
                {passwordSectionOpen ? (
                  <div className="mt-3 grid gap-2 rounded-xl bg-surface2/60 p-3">
                    <PasswordInput
                      placeholder="현재 비밀번호 입력"
                      value={passwords.currentPassword}
                      visible={visiblePasswords.currentPassword}
                      onChange={(value) => setPasswords((current) => ({ ...current, currentPassword: value }))}
                      onToggle={() => setVisiblePasswords((current) => ({ ...current, currentPassword: !current.currentPassword }))}
                    />
                    <PasswordInput
                      placeholder="새 비밀번호 입력"
                      value={passwords.newPassword}
                      visible={visiblePasswords.newPassword}
                      onChange={(value) => setPasswords((current) => ({ ...current, newPassword: value }))}
                      onToggle={() => setVisiblePasswords((current) => ({ ...current, newPassword: !current.newPassword }))}
                    />
                    <PasswordInput
                      placeholder="새 비밀번호 확인"
                      value={passwords.newPasswordConfirm}
                      visible={visiblePasswords.newPasswordConfirm}
                      onChange={(value) => setPasswords((current) => ({ ...current, newPasswordConfirm: value }))}
                      onToggle={() => setVisiblePasswords((current) => ({ ...current, newPasswordConfirm: !current.newPasswordConfirm }))}
                    />
                    <Btn
                      variant="primary"
                      onClick={submitPassword}
                      disabled={!passwords.currentPassword || !passwords.newPassword || !passwords.newPasswordConfirm}
                      className="mt-1 w-full"
                    >
                      비밀번호 저장
                    </Btn>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-line/40 bg-surface2 px-4 py-4">
                <p className="text-[15px] font-medium text-txt">소셜 로그인 계정은 비밀번호가 없습니다.</p>
                <p className="mt-1.5 text-[14px] leading-6 text-txt3">
                  이메일 비밀번호 로그인을 사용하려면 비밀번호를 새로 설정해 주세요.
                </p>
              </div>
            )}
          </ModalSection>

          <ModalSection title="개인정보 동의 수정">
            <div className="space-y-2">
              <ConsentToggle label="서비스 이용약관 동의" checked={consents.termsRequired} disabled onChange={() => undefined} />
              <ConsentToggle label="개인정보 처리방침 동의" checked={consents.privacyRequired} disabled onChange={() => undefined} />
              <ConsentToggle label="마케팅 정보 수신 동의" checked={consents.marketingOptional} onChange={(value) => saveConsents({ ...consents, marketingOptional: value })} />
              <ConsentToggle label="행동 데이터 분석 동의" checked={consents.behaviorAnalyticsOptional} onChange={(value) => saveConsents({ ...consents, behaviorAnalyticsOptional: value })} />
            </div>
          </ModalSection>

          <ModalSection title="회원 탈퇴">
            <div className="space-y-3">
              <input value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="탈퇴 사유" className="h-10 w-full rounded-xl border border-line/60 bg-surface px-3 text-[14px] text-txt outline-none transition focus:border-primary/60" />
              <div className="flex flex-wrap gap-2">
                <Btn variant="primary" onClick={submitDeletion} className="bg-red-500 hover:bg-red-600">탈퇴 요청</Btn>
                <Btn variant="soft" onClick={cancelDeletion}>탈퇴 요청 취소</Btn>
              </div>
            </div>
          </ModalSection>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function MyPageScreen() {
  const router = useRouter();
  const { notes, pushToast } = useBrainX();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coverImage, setCoverImage] = useState("");
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>("week");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCoverImage(window.localStorage.getItem(COVER_KEY) ?? "");
    }

    let mounted = true;
    getMyProfile()
      .then((data) => {
        if (mounted) setProfile(data);
      })
      .catch((error) => {
        const isAuthError = error instanceof AuthRequiredError;
        pushToast(isAuthError ? error.message : error instanceof Error ? error.message : "내 정보를 불러오지 못했습니다.", "err");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pushToast, router]);

  const name = displayName(profile);
  return (
    <div data-route className="min-h-full bg-bg text-txt">
      <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-8 md:px-8 md:pt-10">
        <section className="relative">
          <div className="relative z-0 h-[220px] overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#a9c5fb_0%,#eba2df_48%,#f48d68_100%)] md:h-[274px]">
            {coverImage ? <img src={coverImage} alt="배경 이미지" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="relative z-20 -mt-24 px-6 md:px-9">
            <ProfileAvatar name={name} imageUrl={profile?.profileImageUrl} size={150} />
          </div>

          <div className="mt-9 flex flex-col gap-5 border-b border-line/40 pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-[14px] font-medium text-txt3">내 페이지</p>
            <h1 className="text-[38px] font-bold tracking-tight md:text-[44px]">{loading ? "불러오는 중" : name}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="soft" icon="settings" onClick={() => setSettingsOpen(true)}>
                계정 설정
              </Btn>
            </div>
          </div>
        </section>

        <ActivityDashboard notes={notes} period={activityPeriod} onPeriodChange={setActivityPeriod} />

        <section className="mt-12">
          <h2 className="mb-5 text-[20px] font-semibold">
            지난 1년 동안 <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{name}</span>님이 작성하신 노트
          </h2>
          <ContributionGrid notes={notes} />

          <div className="mt-5">
            <TokenUsageCard />
          </div>
        </section>
      </div>

      {settingsOpen ? (
        <AccountSettingsModal
          profile={profile}
          coverImage={coverImage}
          onClose={() => setSettingsOpen(false)}
          onProfileChange={setProfile}
          onCoverChange={setCoverImage}
        />
      ) : null}
    </div>
  );
}
