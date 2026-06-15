"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { Icon } from "@/components/brainx-ui";
import type { BrainXNote } from "@/lib/brainx-data";
import {
  cancelAccountDeletion,
  changeMyPassword,
  getMyProfile,
  linkSocialAccount,
  requestAccountDeletion,
  unlinkSocialAccount,
  updateMyConsents,
  updateMyProfile,
  type ConsentPayload,
  type MyProfile
} from "@/lib/user-api";

const COVER_KEY = "brainx_profile_cover_v1";
const PROVIDERS = ["google", "kakao", "naver"] as const;
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

function handleText(profile: MyProfile | null) {
  const source = displayName(profile)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return `@${source || "brainx_user"}`;
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
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-black text-white shadow-[0_18px_35px_rgb(15_23_42/0.18)]"
    >
      {imageUrl ? (
        <img src={imageUrl} alt="프로필 이미지" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[30px] font-bold tracking-tight">{name.slice(0, 2)}</span>
      )}
    </div>
  );
}

function formatToken(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K` : value.toLocaleString();
}

function ContributionGrid({ usagePercent }: { usagePercent: number }) {
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
  const monthLabels = [
    { label: "8월", week: 0 },
    { label: "9월", week: 4 },
    { label: "10월", week: 9 },
    { label: "11월", week: 13 },
    { label: "12월", week: 18 },
    { label: "1월", week: 22 },
    { label: "2월", week: 27 },
    { label: "3월", week: 31 },
    { label: "4월", week: 35 },
    { label: "5월", week: 40 },
    { label: "6월", week: 44 },
    { label: "7월", week: 48 }
  ];
  const totalCells = weekCount * 7;
  const targetFilledCells = Math.round((totalCells * usagePercent) / 100);
  let filledCells = 0;
  const colors = ["#ebedf0", "#d9f7e3", "#9be9a8", "#40c463", "#30a14e"];

  return (
    <div className="scroll overflow-x-auto rounded-[6px] border border-[#d0d7de] bg-white px-4 py-4">
      <div className="mx-auto" style={{ width: `${graphWidth}px` }}>
        <div className="mb-3 flex items-center justify-between text-[12px] text-[#57606a]">
          <span>2025년 8월 - 2026년 7월</span>
          <span>AI 토큰 사용 기준</span>
        </div>

        <div
          className="grid"
          style={{
            columnGap: `${labelGap}px`,
            gridTemplateColumns: `${labelColumnWidth}px ${gridWidth}px`
          }}
        >
          <div />
          <div className="relative mb-2 h-4 text-[12px] text-[#24292f]" style={{ width: `${gridWidth}px` }}>
            {monthLabels.map((month) => (
              <span key={month.label} className="absolute top-0" style={{ left: `${month.week * weekStep}px` }}>
                {month.label}
              </span>
            ))}
          </div>

          <div className="relative h-[115px] text-[12px] text-[#57606a]">
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
              const deterministic = (index * 37 + Math.floor(index / 7) * 19 + (index % 7) * 11) % 100;
              const active = filledCells < targetFilledCells && deterministic < Math.min(96, usagePercent + 24);
              if (active) filledCells += 1;
              const intensity = active ? ((deterministic + index) % 4) + 1 : 0;
              return (
                <span
                  key={index}
                  className="rounded-[3px] outline outline-1 outline-white"
                  style={{ width: `${cellSize}px`, height: `${cellSize}px`, backgroundColor: colors[intensity] }}
                />
              );
            })}
          </div>

          <div />
          <div className="mt-4 flex items-center justify-between text-[12px] text-[#57606a]">
            <span>토큰 사용량은 활동일 기준으로 표시됩니다</span>
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
    </div>
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
    <div className="card rounded-2xl shadow-soft p-5">
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
    </div>
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

function ActivityLineChart({ points }: { points: { label: string; value: number }[] }) {
  const width = 640;
  const height = 210;
  const padding = { top: 18, right: 18, bottom: 34, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const coordinates = points.map((point, index) => {
    const x = padding.left + (innerWidth / Math.max(1, points.length - 1)) * index;
    const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight;
    return { ...point, x, y };
  });
  const path = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] min-w-[620px] w-full" role="img" aria-label="생성 추이 그래프">
        {[0, 1, 2, 3].map((line) => {
          const y = padding.top + (innerHeight / 3) * line;
          return <line key={line} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#eee7dc" />;
        })}
        <polyline fill="none" points={path} stroke="#111827" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <polygon
          points={`${padding.left},${height - padding.bottom} ${path} ${width - padding.right},${height - padding.bottom}`}
          fill="url(#activityFill)"
          opacity="0.5"
        />
        <defs>
          <linearGradient id="activityFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {coordinates.map((point) => (
          <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="4.5" fill="#111827" stroke="#ffffff" strokeWidth="2" />
        ))}
        {coordinates.map((point, index) =>
          index % labelStep === 0 || index === coordinates.length - 1 ? (
            <text key={point.label} x={point.x} y={height - 10} textAnchor="middle" className="fill-neutral-500 text-[11px]">
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
    <section className="mt-8 rounded-[22px] border border-[#dedbd5] bg-white/70 px-5 py-6 shadow-[0_18px_45px_rgb(15_23_42/0.06)] md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-neutral-500">개인 활동 지표</p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-neutral-950">BrainX 활동 리포트</h2>
        </div>
        <div className="inline-flex w-fit rounded-full border border-neutral-200 bg-white p-1 shadow-sm">
          {ACTIVITY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onPeriodChange(filter.id)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${
                period === filter.id ? "bg-neutral-950 text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
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
          <div key={stat.label} className="rounded-2xl border border-[#eee8df] bg-[#fbfaf7] p-4">
            <p className="text-[12px] font-medium text-neutral-500">{stat.label}</p>
            <p className="mt-2 text-[26px] font-bold tracking-tight text-neutral-950">{stat.value}</p>
            <p className="mt-1 text-[12px] text-neutral-500">{stat.caption}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-2xl border border-[#eee8df] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold text-neutral-950">생성 추이 그래프</h3>
              <p className="mt-1 text-[12px] text-neutral-500">{activeLabel} 기준으로 노트 생성과 연결 활동을 표시합니다.</p>
            </div>
          </div>
          <ActivityLineChart points={series} />
        </div>

        <div className="rounded-2xl border border-[#eee8df] bg-white p-4">
          <h3 className="text-[16px] font-semibold text-neutral-950">가장 많이 연결된 노트 TOP 5</h3>
          <div className="mt-4 space-y-3">
            {topConnectedNotes.map((note, index) => (
              <div key={note.id} className="flex items-center gap-3 rounded-xl bg-[#fbfaf7] px-3 py-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-950 text-[12px] font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-neutral-950">{note.title}</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">{note.links.length}개 연결 · {note.words.toLocaleString()}단어</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-[14px] font-medium text-neutral-700">{children}</span>;
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-200 px-6 py-6 first:border-t-0">
      <h3 className="mb-4 text-[17px] font-semibold text-neutral-950">{title}</h3>
      {children}
    </section>
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
    <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-3">
      <span className="text-[14px] text-neutral-800">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-black" : "bg-neutral-300"} disabled:opacity-50`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} />
      </button>
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
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState(displayName(profile));
  const [profileImage, setProfileImage] = useState(profile?.profileImageUrl ?? "");
  const [coverDraft, setCoverDraft] = useState(coverImage);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
  const [socialForm, setSocialForm] = useState({ provider: "google", oauthCode: "" });
  const [consents, setConsents] = useState<ConsentPayload>({
    termsRequired: profile?.consents.termsRequired ?? true,
    privacyRequired: profile?.consents.privacyRequired ?? true,
    marketingOptional: profile?.consents.marketingOptional ?? false,
    behaviorAnalyticsOptional: profile?.consents.behaviorAnalyticsOptional ?? false
  });
  const [deletionReason, setDeletionReason] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const saved = await updateMyProfile({ nickname: nickname.trim(), profileImageAssetId: profileImage || null });
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

  const submitSocialLink = async () => {
    try {
      const data = await linkSocialAccount(socialForm.provider, socialForm.oauthCode);
      onProfileChange({
        ...(profile as MyProfile),
        security: {
          ...(profile as MyProfile).security,
          linkedProviders: Array.from(new Set([...(profile?.security.linkedProviders ?? []), data.provider]))
        }
      });
      setSocialForm((current) => ({ ...current, oauthCode: "" }));
      pushToast("소셜 계정이 연결되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "소셜 계정 연결에 실패했습니다.", "err");
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed bottom-0 right-0 top-0 z-50 flex h-dvh items-center justify-center overflow-y-auto bg-black/62 px-4 py-6 left-0 ${
        sidebarCollapsed ? "md:left-[68px]" : "md:left-[236px]"
      }`}
    >
      <div className="max-h-[88svh] w-full max-w-[628px] overflow-hidden rounded-[26px] bg-white text-neutral-950 shadow-[0_24px_80px_rgb(0_0_0/0.35)]">
        <div className="flex h-[68px] items-center justify-between border-b border-neutral-200 px-6">
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100" aria-label="닫기">
            <Icon name="x" size={19} />
          </button>
          <h2 className="text-[20px] font-semibold">계정 설정</h2>
          <button
            type="button"
            onClick={saveProfile}
            disabled={savingProfile || !nickname.trim()}
            className="h-10 rounded-full bg-black px-6 text-[15px] font-medium text-white shadow-[0_5px_14px_rgb(0_0_0/0.22)] disabled:opacity-45"
          >
            {savingProfile ? "저장 중" : "저장"}
          </button>
        </div>

        <div className="scroll max-h-[calc(88svh-68px)] overflow-y-auto">
          <div className="relative h-[154px] bg-[linear-gradient(120deg,#91b5f7_0%,#ef9bdb_52%,#f38a62_100%)]">
            {coverDraft ? <img src={coverDraft} alt="배경 이미지" className="h-full w-full object-cover" /> : null}
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
              aria-label="배경사진 변경"
            >
              <Icon name="upload" size={19} />
            </button>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => readImageFile(event, setCoverDraft)} />
            <div className="absolute -bottom-14 left-6">
              <ProfileAvatar name={name} imageUrl={profileImage || null} size={112} />
              <button
                type="button"
                onClick={() => profileInputRef.current?.click()}
                className="absolute right-0 top-2 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-black text-white shadow"
                aria-label="프로필 사진 변경"
              >
                <Icon name="upload" size={15} />
              </button>
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
                  className="h-11 w-full rounded-xl border border-neutral-300 px-3.5 text-[15px] outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <FieldLabel>이메일</FieldLabel>
                <input value={profile?.email ?? ""} disabled className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 text-[15px] text-neutral-500" />
              </label>
            </div>
          </ModalSection>

          <ModalSection title="소셜 계정 연결">
            <div className="mb-3 flex flex-wrap gap-2">
              {PROVIDERS.map((provider) => {
                const linked = profile?.security.linkedProviders.includes(provider) ?? false;
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => linked ? removeSocialLink(provider) : setSocialForm((current) => ({ ...current, provider }))}
                    className={`rounded-full border px-3 py-2 text-[13px] ${linked ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-neutral-700"}`}
                  >
                    {provider} {linked ? "연결됨" : "미연결"}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
              <select value={socialForm.provider} onChange={(event) => setSocialForm((current) => ({ ...current, provider: event.target.value }))} className="h-10 rounded-xl border border-neutral-300 px-3 text-[14px]">
                {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </select>
              <input value={socialForm.oauthCode} onChange={(event) => setSocialForm((current) => ({ ...current, oauthCode: event.target.value }))} placeholder="OAuth code" className="h-10 rounded-xl border border-neutral-300 px-3 text-[14px]" />
              <button type="button" onClick={submitSocialLink} disabled={!socialForm.oauthCode.trim()} className="h-10 rounded-xl bg-black px-4 text-[14px] font-medium text-white disabled:opacity-40">연결</button>
            </div>
          </ModalSection>

          <ModalSection title="비밀번호 변경">
            <div className="grid gap-2">
              <input type="password" placeholder="현재 비밀번호" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} className="h-10 rounded-xl border border-neutral-300 px-3 text-[14px]" />
              <input type="password" placeholder="새 비밀번호" value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} className="h-10 rounded-xl border border-neutral-300 px-3 text-[14px]" />
              <input type="password" placeholder="새 비밀번호 확인" value={passwords.newPasswordConfirm} onChange={(event) => setPasswords((current) => ({ ...current, newPasswordConfirm: event.target.value }))} className="h-10 rounded-xl border border-neutral-300 px-3 text-[14px]" />
              <button type="button" onClick={submitPassword} className="mt-1 h-10 rounded-xl border border-neutral-300 bg-white px-4 text-[14px] font-medium hover:border-black">비밀번호 저장</button>
            </div>
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
              <input value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="탈퇴 사유" className="h-10 w-full rounded-xl border border-neutral-300 px-3 text-[14px]" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={submitDeletion} className="h-10 rounded-xl bg-red-600 px-4 text-[14px] font-medium text-white">탈퇴 요청</button>
                <button type="button" onClick={cancelDeletion} className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-[14px] font-medium hover:border-black">탈퇴 요청 취소</button>
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
        pushToast(error instanceof Error ? error.message : "내 정보를 불러오지 못했습니다.", "err");
        router.replace("/login");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pushToast, router]);

  const name = displayName(profile);
  const linkedCount = profile?.security.linkedProviders.length ?? 0;

  return (
    <div data-route className="min-h-full bg-[#fbfaf8] text-neutral-950">
      <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-8 md:px-8 md:pt-10">
        <section className="relative">
          <div className="h-[220px] overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#a9c5fb_0%,#eba2df_48%,#f48d68_100%)] md:h-[274px]">
            {coverImage ? <img src={coverImage} alt="배경 이미지" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="-mt-24 px-6 md:px-9">
            <ProfileAvatar name={name} imageUrl={profile?.profileImageUrl} size={150} />
          </div>

          <div className="mt-9 flex flex-col gap-5 border-b border-[#e7e2da] pb-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-[14px] font-medium text-neutral-500">내 페이지</p>
            <h1 className="text-[38px] font-bold tracking-tight md:text-[44px]">{loading ? "불러오는 중" : name}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[16px] text-neutral-600">
              <span>{handleText(profile)}</span>
              <span>·</span>
              <span>{profile?.email ?? "로그인 사용자"}</span>
                <span>·</span>
                <span>소셜 {linkedCount}개 연결</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 text-[15px] font-medium transition hover:border-neutral-900"
            >
              계정 설정 <Icon name="settings" size={16} />
            </button>
          </div>
        </section>

        <ActivityDashboard notes={notes} period={activityPeriod} onPeriodChange={setActivityPeriod} />

        <section className="mt-12">
          <h2 className="mb-5 text-[20px] font-semibold">
            지난 1년 동안 {name}님이 사용하신 토큰
          </h2>
          <ContributionGrid usagePercent={TOKEN_USAGE_PERCENT} />

          <div className="mt-5">
            <TokenUsageCard />
          </div>

          <div className="mt-9 grid gap-x-20 gap-y-8 sm:grid-cols-2">
            <div>
              <p className="text-[15px] text-neutral-600">연간 사용량</p>
              <p className="mt-1 text-[20px] font-semibold">{formatToken(TOKEN_USED)} tokens</p>
            </div>
            <div>
              <p className="text-[15px] text-neutral-600">사용률</p>
              <p className="mt-1 text-[20px] font-semibold">{TOKEN_USAGE_PERCENT}%</p>
            </div>
            <div>
              <p className="text-[15px] text-neutral-600">남은 토큰</p>
              <p className="mt-1 text-[20px] font-semibold">{formatToken(TOKEN_LIMIT - TOKEN_USED)} tokens</p>
            </div>
            <div>
              <p className="text-[15px] text-neutral-600">월 제공량</p>
              <p className="mt-1 text-[20px] font-semibold">{formatToken(TOKEN_LIMIT)} tokens</p>
            </div>
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
