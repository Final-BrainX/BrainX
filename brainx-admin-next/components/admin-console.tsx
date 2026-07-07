"use client";

import {
  Bell,
  Ban,
  Download,
  Eye,
  Megaphone,
  MonitorSmartphone,
  Pencil,
  RefreshCw,
  Repeat2,
  Search,
  SendHorizonal,
  LogOut,
  ShieldCheck,
  Trash2,
  X,
  WalletCards
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  fallbackAdminBootstrap,
  isAuthErrorMessage,
  loadAdminBootstrap,
  type AdminBootstrap,
  type AdminMessage,
  type AdminMessageScope,
  type AdminMessageViewer,
  type AdminKafkaLagData,
  type AdminMonitoringSnapshot,
  type AdminServiceHealthSnapshot,
  type AdminUserDetail
} from "@/lib/admin-api";
import {
  type AdminInquiry,
  type AdminUser,
  type BillingSubscription,
  type BillingTransaction,
  type FailedBilling,
  type InquiryStatus,
  type PaymentStatus,
  type Plan,
  type PlanCard,
  type UserStatus
} from "@/lib/admin-data";
import { clearSession, getSession, updateSessionAdmin } from "@/lib/admin-auth";
import { AdminSidebar, type SidebarTarget } from "@/components/admin-sidebar";
import { AdminAccountsPanel } from "@/components/admin-accounts-panel";

type ConsoleView = SidebarTarget;

const ADMIN_SCREEN_STORAGE_KEY = "brainx_admin_screen_v1";
const ADMIN_PROFILE_IMAGE_STORAGE_KEY = "brainx-admin-profile-image";

const titles: Record<ConsoleView, { title: string; desc: string }> = {
  admins: { title: "관리자 관리", desc: "관리자 계정 추가와 권한 관리를 할 수 있어요" },
  dashboard: { title: "모니터링", desc: "BrainX 운영 지표를 실시간으로 확인해요" },
  users: { title: "사용자 관리", desc: "BrainX 사용자 목록과 플랜 상태를 관리해요" },
  support: { title: "문의 응답", desc: "고객 문의를 확인하고 담당자에게 배정해요" },
  billing: { title: "결제 관리", desc: "결제 내역, 구독, 환불 및 요금제를 관리해요" }
};

const planLabel: Record<Plan, string> = { free: "무료", pro: "Pro", max: "Max" };
const planStyle: Record<Plan, { background: string; color: string }> = {
  free: { background: "#f5f5f4", color: "#57534e" },
  pro: { background: "#eff6ff", color: "#1d4ed8" },
  max: { background: "#f5f3ff", color: "#6d28d9" }
};

const userStatus: Record<UserStatus, { label: string; background: string; color: string; dot: string }> = {
  active: { label: "활성", background: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  suspended: { label: "정지", background: "#fffbeb", color: "#b45309", dot: "#f59e0b" },
  withdrawn: { label: "탈퇴", background: "#f5f5f4", color: "#78716c", dot: "#a8a29e" }
};

const inquiryStatus: Record<InquiryStatus, { label: string; background: string; color: string; dot: string }> = {
  pending: { label: "대기", background: "#fffbeb", color: "#b45309", dot: "#f59e0b" },
  progress: { label: "처리중", background: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  done: { label: "완료", background: "#f0fdf4", color: "#15803d", dot: "#22c55e" }
};

const paymentStatus: Record<PaymentStatus, { label: string; background: string; color: string; dot: string }> = {
  success: { label: "성공", background: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  failed: { label: "실패", background: "#fef2f2", color: "#dc2626", dot: "#ef4444" },
  refunded: { label: "환불", background: "#f5f5f4", color: "#57534e", dot: "#a8a29e" },
  canceled: { label: "취소", background: "#f5f5f4", color: "#78716c", dot: "#a8a29e" }
};

function kstClock() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function money(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
}

function formatStorage(bytes: number) {
  if (!bytes) return "0MB";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))}MB`;
}

function linePath(values: number[]) {
  if (!Array.isArray(values) || values.length === 0) {
    return "M0,150 L560,150";
  }
  const width = 560;
  const height = 150;
  const max = Math.max(...values, 1) * 1.12;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function normalizeSeries(values: unknown, fallback: number[] = [0]) {
  if (!Array.isArray(values)) {
    return fallback;
  }
  const normalized = values
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

const KST_TIME_ZONE = "Asia/Seoul";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: map.get("year") ?? "0000",
    month: map.get("month") ?? "00",
    day: map.get("day") ?? "00"
  };
}

function formatTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    hour: map.get("hour") ?? "00",
    minute: map.get("minute") ?? "00"
  };
}

function formatKstDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dateParts = formatDateParts(date);
  const timeParts = formatTimeParts(date);
  return `${dateParts.year}.${dateParts.month}.${dateParts.day} ${timeParts.hour}:${timeParts.minute}`;
}

function formatKstMonthDay(date: Date) {
  const parts = formatDateParts(date);
  return `${parts.month}/${parts.day}`;
}

function formatIsoDateFromDate(date: Date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysToIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return value;
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return formatIsoDateFromDate(next);
}

function buildTrendLabels(pointCount: number, endAt?: string | Date | null) {
  if (!pointCount || pointCount <= 0) return [];
  const end = endAt ? new Date(endAt) : new Date();
  if (Number.isNaN(end.getTime())) return [];
  return Array.from({ length: pointCount }, (_, index) => {
    const delta = pointCount - index - 1;
    return formatKstMonthDay(new Date(end.getTime() - delta * DAY_IN_MS));
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function buildLineChartSvg(labels: string[], values: number[], title: string, accent = "#0f766e") {
  const width = 720;
  const height = 240;
  const padding = { top: 18, right: 20, bottom: 38, left: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const gradientId = `${safeId(title)}-fill`;
  const points = values.map((value, index) => {
    const x = padding.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
    const y = padding.top + innerHeight - ((value - minValue) / range) * innerHeight;
    return { x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${height - padding.bottom} ${polyline} ${width - padding.right},${height - padding.bottom}`;
  const gridLines = [0, 1, 2, 3].map((line) => {
    const y = padding.top + (innerHeight / 3) * line;
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="#e7e5e4" />`;
  });
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="${escapeHtml(title)}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f766e" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#0f766e" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines.join("")}
      <polygon points="${area}" fill="url(#${gradientId})" opacity="0.85" />
      <polyline fill="none" points="${polyline}" stroke="${accent}" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" />
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${accent}" stroke="#ffffff" stroke-width="2" />`).join("")}
      ${labels
        .map((label, index) => {
          if (index % labelStep !== 0 && index !== labels.length - 1) return "";
          const x = padding.left + (innerWidth / Math.max(labels.length - 1, 1)) * index;
          return `<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#6b7280" font-size="11">${escapeHtml(label)}</text>`;
        })
        .join("")}
      <text x="${padding.left}" y="16" fill="#111827" font-size="14" font-weight="600">${escapeHtml(title)}</text>
    </svg>
  `;
}

function buildBarChartSvg(labels: string[], values: number[], title: string, accent = "#2563eb") {
  const width = 720;
  const height = 240;
  const padding = { top: 22, right: 18, bottom: 38, left: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...values);
  const barWidth = innerWidth / Math.max(values.length, 1) - 8;
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const gridLines = [0, 1, 2, 3].map((line) => {
    const y = padding.top + (innerHeight / 3) * line;
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y}" y2="${y}" stroke="#e7e5e4" />`;
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="${escapeHtml(title)}">
      ${gridLines.join("")}
      ${values
        .map((value, index) => {
          const x = padding.left + (innerWidth / Math.max(values.length, 1)) * index + 4;
          const barHeight = (value / maxValue) * innerHeight;
          const y = padding.top + innerHeight - barHeight;
          return `<rect x="${x}" y="${y}" width="${Math.max(8, barWidth)}" height="${barHeight}" rx="10" fill="${accent}" fill-opacity="0.86" />`;
        })
        .join("")}
      ${labels
        .map((label, index) => {
          if (index % labelStep !== 0 && index !== labels.length - 1) return "";
          const x = padding.left + (innerWidth / Math.max(labels.length, 1)) * index + (innerWidth / Math.max(values.length, 1)) / 2;
          return `<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#6b7280" font-size="11">${escapeHtml(label)}</text>`;
        })
        .join("")}
      <text x="${padding.left}" y="18" fill="#111827" font-size="14" font-weight="600">${escapeHtml(title)}</text>
    </svg>
  `;
}

const KAFKA_LAG_WARNING_THRESHOLD = 1_000;
const KAFKA_LAG_CRITICAL_THRESHOLD = 5_000;

type KafkaLagView = {
  consumerGroupId: string | null;
  kafkaLagState: AdminKafkaLagData["kafkaLagState"] | null;
  kafkaLagMessages: number | null;
  kafkaLagDetail: string | null;
  warningThreshold?: number;
  criticalThreshold?: number;
};

type KafkaLagSnapshotLike = Pick<AdminMonitoringSnapshot, "kafkaLagState" | "kafkaLagMessages" | "kafkaLagDetail" | "kafkaConsumerGroupId">;

function kafkaLagThresholds(view: KafkaLagView | null | undefined) {
  return {
    warningThreshold: view?.warningThreshold ?? KAFKA_LAG_WARNING_THRESHOLD,
    criticalThreshold: view?.criticalThreshold ?? KAFKA_LAG_CRITICAL_THRESHOLD
  };
}

function kafkaLagTone(view: KafkaLagView | null | undefined): { background: string; color: string; dot?: string } {
  if (!view || view.kafkaLagState == null) return { background: "#f5f5f4", color: "#57534e" };
  if (view.kafkaLagState === "BROKER_UNREACHABLE") return { background: "#fef2f2", color: "#dc2626", dot: "#ef4444" };
  if (view.kafkaLagState === "NO_COMMITTED_OFFSETS" || view.kafkaLagState === "CONFIG_MISSING") {
    return { background: "#f5f5f4", color: "#57534e" };
  }
  const lag = view.kafkaLagMessages ?? 0;
  const { warningThreshold, criticalThreshold } = kafkaLagThresholds(view);
  if (lag >= criticalThreshold) return { background: "#fef2f2", color: "#dc2626", dot: "#ef4444" };
  if (lag >= warningThreshold) return { background: "#fef3c7", color: "#b45309", dot: "#f59e0b" };
  return { background: "#f0fdf4", color: "#15803d", dot: "#22c55e" };
}

function kafkaLagLabel(view: KafkaLagView | null | undefined) {
  if (!view || view.kafkaLagState == null) return "연결 필요";
  if (view.kafkaLagState === "BROKER_UNREACHABLE") return "연결 실패";
  if (view.kafkaLagState === "NO_COMMITTED_OFFSETS") return "미집계";
  if (view.kafkaLagState === "CONFIG_MISSING") return "설정 필요";
  const lag = view.kafkaLagMessages ?? 0;
  const { warningThreshold, criticalThreshold } = kafkaLagThresholds(view);
  if (lag >= criticalThreshold) return "위험";
  if (lag >= warningThreshold) return "경고";
  return "정상";
}

function kafkaLagDetail(view: KafkaLagView | null | undefined) {
  if (!view || view.kafkaLagState == null) return "Kafka lag 데이터 대기 중";
  if (view.kafkaLagState === "BROKER_UNREACHABLE") return "브로커 연결 실패";
  if (view.kafkaLagState === "NO_COMMITTED_OFFSETS") return "커밋된 offset이 없어 미집계 상태";
  if (view.kafkaLagState === "CONFIG_MISSING") return "consumer group id 설정이 필요합니다";
  if (view.kafkaLagMessages == null) return "lag를 읽지 못했습니다";
  return view.kafkaLagDetail ?? "최신 consumer group lag";
}

function kafkaLagDisplay(view: KafkaLagView | KafkaLagSnapshotLike | null | undefined): KafkaLagView | null {
  if (!view) return null;
  return {
    consumerGroupId: "consumerGroupId" in view ? view.consumerGroupId ?? null : view.kafkaConsumerGroupId ?? null,
    kafkaLagState: view.kafkaLagState,
    kafkaLagMessages: view.kafkaLagMessages,
    kafkaLagDetail: view.kafkaLagDetail ?? null,
    warningThreshold: "warningThreshold" in view ? view.warningThreshold : undefined,
    criticalThreshold: "criticalThreshold" in view ? view.criticalThreshold : undefined
  };
}

function healthMeta(state: string | null | undefined) {
  if (state === "UP") return { dot: "#22c55e", text: "#15803d", tone: "good" as const, label: "정상" };
  if (state === "DEGRADED") return { dot: "#f59e0b", text: "#b45309", tone: "warn" as const, label: "저하" };
  if (state === "DOWN") return { dot: "#ef4444", text: "#dc2626", tone: "neutral" as const, label: "중단" };
  return { dot: "#a8a29e", text: "#78716c", tone: "neutral" as const, label: "미확인" };
}

function Tag({ meta, children }: { meta: { background: string; color: string; dot?: string }; children: React.ReactNode }) {
  return (
    <span className="tag" style={{ background: meta.background, color: meta.color }}>
      {meta.dot ? <span className="dot" style={{ background: meta.dot }} /> : null}
      {children}
    </span>
  );
}

function getNextBillingDate(started: string, billingCycle?: "monthly" | "yearly") {
  return addDaysToIsoDate(started, billingCycle === "yearly" ? 365 : 30);
}

function getBillingCycleLabel(billingCycle?: "monthly" | "yearly") {
  return billingCycle === "yearly" ? "연간" : "월간";
}

function downloadAdminReport(payload: {
  overviewSummary: AdminBootstrap["overviewSummary"];
  kpis: AdminBootstrap["kpis"];
  activeUserSeries: number[];
  revenueBars: number[];
  desktopDownloadSeries: number[];
  activeUserTrendMeta: AdminBootstrap["activeUserTrendMeta"];
  revenueTrendMeta: AdminBootstrap["revenueTrendMeta"];
  desktopDownloadTrendMeta: AdminBootstrap["desktopDownloadTrendMeta"];
  monitoringSnapshots: AdminMonitoringSnapshot[];
  healthSnapshots: AdminServiceHealthSnapshot[];
  billingSubscriptions: BillingSubscription[];
  lastUpdatedAt: string | null;
}) {
  if (typeof window === "undefined") return;

  const generatedAt = new Date();
  const generatedAtLabel = formatKstDateTime(generatedAt.toISOString());
  const fileDate = formatIsoDateFromDate(generatedAt);
  const endDate = payload.lastUpdatedAt ? new Date(payload.lastUpdatedAt) : generatedAt;
  const trendLength = Math.max(payload.activeUserSeries.length, payload.revenueBars.length, 14);
  const trendLabels = buildTrendLabels(trendLength, endDate);
  const activeTrend = normalizeSeries(payload.activeUserSeries, normalizeSeries(payload.activeUserTrendMeta.values, [0]));
  const revenueTrend = normalizeSeries(payload.revenueBars, normalizeSeries(payload.revenueTrendMeta.values, [0]));
  const desktopDownloadTrend = normalizeSeries(payload.desktopDownloadSeries, normalizeSeries(payload.desktopDownloadTrendMeta.values, [0]));
  const trendDates = trendLabels.slice(-Math.max(activeTrend.length, revenueTrend.length, desktopDownloadTrend.length));
  const activeTrendRows = trendDates.map((dateLabel, index) => ({
    date: dateLabel,
    activeUsers: activeTrend[index] ?? 0,
    revenue: revenueTrend[index] ?? 0,
    desktopDownloads: desktopDownloadTrend[index] ?? 0
  }));
  const monitoringRows = [...payload.monitoringSnapshots]
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())
    .slice(0, 14);
  const healthRows = [...payload.healthSnapshots]
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())
    .slice(0, 10);
  const subscriptionRows = [...payload.billingSubscriptions]
    .filter((item) => item.plan !== "free")
    .slice()
    .sort((left, right) => left.started.localeCompare(right.started));

  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <style>
      body { font-family: Arial, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #111827; padding: 24px; background: #ffffff; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      h2 { margin: 22px 0 10px; font-size: 18px; }
      .muted { color: #6b7280; font-size: 12px; }
      .card { border: 1px solid #dbe2ea; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .metric { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #f8fafc; }
      .metric-label { color: #6b7280; font-size: 12px; }
      .metric-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; }
      .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .chart-card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; }
      .chart-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
      .chart-subtitle { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
    </style>
  </head>
  <body>
    <h1>BrainX 관리자 운영 리포트</h1>
    <div class="muted">생성 시각: ${escapeHtml(generatedAtLabel)} · 마지막 업데이트: ${escapeHtml(payload.lastUpdatedAt ? formatKstDateTime(payload.lastUpdatedAt) : "-")}</div>

    <div class="card">
      <h2>핵심 지표</h2>
      <div class="grid">
        <div class="metric"><div class="metric-label">이번 달 매출</div><div class="metric-value">${money(payload.overviewSummary.monthlyRevenue)}</div></div>
        <div class="metric"><div class="metric-label">활성 구독</div><div class="metric-value">${payload.overviewSummary.activeSubscriptions.toLocaleString("ko-KR")}</div></div>
        <div class="metric"><div class="metric-label">MRR</div><div class="metric-value">${money(payload.overviewSummary.mrr)}</div></div>
        <div class="metric"><div class="metric-label">결제 실패</div><div class="metric-value">${payload.overviewSummary.failedPaymentCount.toLocaleString("ko-KR")}</div></div>
        <div class="metric"><div class="metric-label">앱 다운로드 사용자</div><div class="metric-value">${payload.overviewSummary.desktopDownloadUsers.toLocaleString("ko-KR")}</div></div>
        <div class="metric"><div class="metric-label">앱 다운로드 횟수</div><div class="metric-value">${payload.overviewSummary.desktopDownloadCount.toLocaleString("ko-KR")}</div></div>
      </div>
    </div>

    <div class="split">
      <div class="chart-card">
        <div class="chart-title">최근 14일 활성 사용자 추이</div>
        <div class="chart-subtitle">${escapeHtml(payload.activeUserTrendMeta.periodLabel)} · ${escapeHtml(payload.activeUserTrendMeta.source)}</div>
        ${buildLineChartSvg(trendDates, activeTrendRows.map((row) => row.activeUsers), "최근 14일 활성 사용자 추이")}
      </div>
      <div class="chart-card">
        <div class="chart-title">최근 14일 매출 추이</div>
        <div class="chart-subtitle">${escapeHtml(payload.revenueTrendMeta.periodLabel)} · ${escapeHtml(payload.revenueTrendMeta.source)}</div>
        ${buildBarChartSvg(trendDates, activeTrendRows.map((row) => row.revenue), "최근 14일 매출 추이")}
      </div>
      <div class="chart-card">
        <div class="chart-title">최근 14일 Windows 앱 다운로드</div>
        <div class="chart-subtitle">${escapeHtml(payload.desktopDownloadTrendMeta.periodLabel)} · ${escapeHtml(payload.desktopDownloadTrendMeta.source)}</div>
        ${buildBarChartSvg(trendDates, activeTrendRows.map((row) => row.desktopDownloads), "최근 14일 Windows 앱 다운로드", "#2563eb")}
      </div>
    </div>

    <div class="card">
      <h2>일별 지표</h2>
      <table>
        <thead>
          <tr>
            <th>날짜</th>
            <th>활성 사용자</th>
            <th>매출</th>
            <th>앱 다운로드</th>
          </tr>
        </thead>
        <tbody>
          ${activeTrendRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.date)}</td>
                  <td>${row.activeUsers.toLocaleString("ko-KR")}</td>
                  <td>${money(row.revenue)}</td>
                  <td>${row.desktopDownloads.toLocaleString("ko-KR")}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>최근 모니터링 스냅샷</h2>
      <table>
        <thead>
          <tr>
            <th>수집 시각</th>
            <th>매출</th>
            <th>활성 구독</th>
            <th>MRR</th>
            <th>활성 사용자</th>
            <th>Kafka Lag</th>
          </tr>
        </thead>
        <tbody>
          ${monitoringRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(formatKstDateTime(row.capturedAt))}</td>
                  <td>${money(row.monthlyRevenue)}</td>
                  <td>${row.activeSubscriptions.toLocaleString("ko-KR")}</td>
                  <td>${money(row.mrr)}</td>
                  <td>${row.activeUsers.toLocaleString("ko-KR")}</td>
                  <td>${row.kafkaLagMessages == null ? "-" : `${row.kafkaLagMessages.toLocaleString("ko-KR")} msgs`}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>구독 현황</h2>
      <table>
        <thead>
          <tr>
            <th>사용자</th>
            <th>플랜</th>
            <th>시작일</th>
            <th>다음 결제일</th>
            <th>주기</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          ${subscriptionRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.user)}</td>
                  <td>${escapeHtml(planLabel[row.plan])}</td>
                  <td>${escapeHtml(row.started)}</td>
                  <td>${escapeHtml(getNextBillingDate(row.started, row.billingCycle))}</td>
                  <td>${escapeHtml(getBillingCycleLabel(row.billingCycle))}</td>
                  <td>${money(row.amount)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${
      healthRows.length > 0
        ? `
    <div class="card">
      <h2>서비스 체크 기록</h2>
      <table>
        <thead>
          <tr>
            <th>수집 시각</th>
            <th>서비스</th>
            <th>상태</th>
            <th>지연</th>
          </tr>
        </thead>
        <tbody>
          ${healthRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(formatKstDateTime(row.capturedAt))}</td>
                  <td>${escapeHtml(row.serviceName)}</td>
                  <td>${escapeHtml(row.state)}</td>
                  <td>${row.latencyMs.toLocaleString("ko-KR")}ms</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`
        : ""
    }
  </body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `brainx-admin-report-${fileDate}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function TrendAxisLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))`, gap: 4, marginTop: 10, color: "#a8a29e", fontSize: 10 }}>
      {labels.map((label) => (
        <div key={label} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
          {label}
        </div>
      ))}
    </div>
  );
}

export function AdminConsole() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<ConsoleView>(() => {
    if (typeof window === "undefined") return "dashboard";
    const saved = window.localStorage.getItem(ADMIN_SCREEN_STORAGE_KEY) as ConsoleView | null;
    return saved ?? "dashboard";
  });
  const [adminData, setAdminData] = useState<AdminBootstrap | null>(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedInquiry, setSelectedInquiry] = useState("");
  const [reply, setReply] = useState("");
  const [toast, setToast] = useState("대시보드 로딩 준비 중입니다");
  const [billingTab, setBillingTab] = useState<"history" | "subscriptions" | "failed" | "plans">("history");
  const [now, setNow] = useState("--:--:--");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    const sessionToken = session.accessToken;

    let active = true;
    adminApi
      .getMe()
      .then((admin) => {
        if (!active) return;
        if (admin.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        setAuthReady(true);
      })
      .catch((error) => {
        if (!active) return;
        const errorMessage = error instanceof Error ? error.message : "";
        if (isAuthErrorMessage(errorMessage) && getSession()?.accessToken === sessionToken) {
          clearSession();
          router.replace("/login");
          return;
        }
        setAuthReady(true);
        setAdminError(errorMessage || "관리자 세션 확인 중 오류가 발생했습니다.");
        setToast("관리자 세션 확인 중 오류가 발생했습니다.");
      });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    setNow(kstClock());
    const timer = window.setInterval(() => setNow(kstClock()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProfileImage(window.localStorage.getItem(ADMIN_PROFILE_IMAGE_STORAGE_KEY));
  }, []);

  const reloadAdminData = async () => {
    setAdminLoading(true);
    setAdminError("");
    try {
      const data = await loadAdminBootstrap();
      setAdminData(data);
      setSelectedInquiry((current) => data.inquiries.some((item) => item.id === current) ? current : data.inquiries[0]?.id ?? "");
    } catch (error) {
      const sessionAdmin = getSession()?.admin ?? fallbackAdminBootstrap.adminProfile;
      setAdminData({ ...fallbackAdminBootstrap, adminProfile: sessionAdmin });
      setAdminError(error instanceof Error ? error.message : "관리자 API를 불러오지 못했어요");
      setToast("관리자 API를 불러오지 못했어요");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady) return;

    let active = true;
    setAdminLoading(true);
    loadAdminBootstrap()
      .then((data) => {
        if (!active) return;
        setAdminData(data);
        setAdminError("");
        setSelectedInquiry((current) => data.inquiries.some((item) => item.id === current) ? current : data.inquiries[0]?.id ?? "");
      })
      .catch((error) => {
        if (!active) return;
        const sessionAdmin = getSession()?.admin ?? fallbackAdminBootstrap.adminProfile;
        setAdminData({ ...fallbackAdminBootstrap, adminProfile: sessionAdmin });
        setAdminError(error instanceof Error ? error.message : "Admin API 불러오기에 실패했습니다.");
        setToast("Admin API 불러오기에 실패했습니다.");
      })
      .finally(() => {
        if (active) setAdminLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authReady]);

  useEffect(() => {
    if (adminLoading || adminError || !adminData) return;
    if (adminData.adminProfile.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    updateSessionAdmin(adminData.adminProfile);
  }, [adminLoading, adminError, adminData, router]);

  useEffect(() => {
    if (screen === "admins" && adminData && adminData.adminProfile.role !== "owner") {
      setScreen("dashboard");
      return;
    }
    window.localStorage.setItem(ADMIN_SCREEN_STORAGE_KEY, screen);
  }, [screen, adminData]);

  const activeInquiry = adminData?.inquiries.find((item) => item.id === selectedInquiry) ?? adminData?.inquiries[0];
  const failedPayments = adminData?.billingTransactions.filter((payment) => payment.status === "failed") ?? [];

  const syncAdminProfile = (profile: AdminBootstrap["adminProfile"]) => {
    updateSessionAdmin(profile);
    setAdminData((current) => (current ? { ...current, adminProfile: profile } : current));
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const logout = () => {
    clearSession();
    router.replace("/login");
  };

  if (!authReady) {
    return null;
  }

  if (!adminData) {
    return (
      <div className="admin-shell">
        <main className="main" style={{ width: "100%" }}>
          <header className="topbar">
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px" }}>관리자 콘솔</h1>
              <p style={{ margin: "2px 0 0", color: "#a8a29e", fontSize: 12.5 }}>실제 관리자 데이터를 불러오는 중입니다</p>
            </div>
          </header>
          <section className="content">
            <AdminDataState loading={adminLoading} error={adminError} onRetry={reloadAdminData} />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar
        admin={adminData.adminProfile}
        profileImage={profileImage}
        activeTarget={screen}
        onNavigate={setScreen}
        supportBadge={adminData.inquiries.filter((item) => item.status === "pending").length}
        billingBadge={failedPayments.length}
      />

      <main className="main">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px" }}>{titles[screen].title}</h1>
            <p style={{ margin: "2px 0 0", color: "#a8a29e", fontSize: 12.5 }}>{titles[screen].desc}</p>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative" }}>
            <Search size={16} color="#a8a29e" style={{ position: "absolute", left: 12, top: 11 }} />
            <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사용자 · 이메일 검색" />
          </div>
          <span className="prod"><span className="dot" style={{ background: "#22c55e" }} />PROD</span>
          <button className="btn" aria-label="알림" onClick={() => notify("읽지 않은 알림 3건이 있습니다")} style={{ width: 38, padding: 0, justifyContent: "center" }}>
            <Bell size={18} />
          </button>
          <button className="btn danger" aria-label="로그아웃" onClick={logout}>
            <LogOut size={16} />
            로그아웃
          </button>
          <div className="mono" style={{ color: "#57534e", fontSize: 13 }}>{now}<span style={{ color: "#a8a29e", fontSize: 11 }}> KST</span></div>
        </header>

        <section className="content">
          <AdminDataState loading={adminLoading} error={adminError} onRetry={reloadAdminData} />
          {screen === "dashboard" ? (
            <DashboardPage
              data={adminData}
              adminProfile={adminData.adminProfile}
              profileImage={profileImage}
              onProfileImageUpdated={setProfileImage}
              onProfileUpdated={syncAdminProfile}
              onOpenAdmins={() => setScreen("admins")}
              onToast={notify}
              onRefresh={reloadAdminData}
            />
          ) : null}
          {screen === "users" ? <UsersPanel users={adminData.users} onReload={reloadAdminData} onToast={notify} /> : null}
          {screen === "support" ? (
            <SupportPanel
              inquiries={adminData.inquiries}
              activeId={selectedInquiry}
              reply={reply}
              activeInquiry={activeInquiry ?? adminData.inquiries[0]}
              onSelect={setSelectedInquiry}
              onReply={setReply}
              onReload={reloadAdminData}
              onToast={notify}
            />
          ) : null}
          {screen === "billing" ? <BillingPanel data={adminData} tab={billingTab} setTab={setBillingTab} onReload={reloadAdminData} onToast={notify} /> : null}
          {screen === "admins" ? <AdminAccountsPanel currentAdmin={adminData.adminProfile} onCurrentAdminUpdated={syncAdminProfile} onToast={notify} /> : null}
        </section>
      </main>
      {toast ? (
        <div className="toast">
          <ShieldCheck size={18} color="#0d9488" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function AdminDataState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (!loading && !error) return null;
  return (
    <div className={`data-state ${error ? "error" : ""}`}>
      <span className="dot" style={{ background: error ? "#ef4444" : "#64748b", animation: loading ? "pulse 1.5s infinite" : undefined }} />
      <span>{error ? "관리자 API 연결 실패 - 로컬 fallback 데이터를 표시 중입니다" : "관리자 API 데이터를 불러오는 중입니다"}</span>
      {error ? <button className="btn ghost" onClick={onRetry}>다시 시도</button> : null}
    </div>
  );
}

function Dashboard({
  data,
  onToast,
  onRefresh
}: {
  data: AdminBootstrap;
  onToast: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const overviewSummary = data.overviewSummary ?? {
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    mrr: 0,
    failedPaymentCount: 0,
    activeUsers: 0,
    desktopDownloadUsers: 0,
    desktopDownloadCount: 0,
    totalNotes: 0,
    totalStorageBytes: 0,
    notesCreatedToday: 0,
    timezone: "Asia/Seoul",
    revenueSource: "unknown",
    userSource: "unknown",
    workspaceSource: "unknown"
  };
  const desktopDownloadUsers = normalizeNumber(overviewSummary.desktopDownloadUsers, 0);
  const desktopDownloadCount = normalizeNumber(overviewSummary.desktopDownloadCount, 0);
  const activeUserTrendMeta = data.activeUserTrendMeta ?? {
    metric: "activeUsers",
    values: [],
    periodLabel: "최근 데이터 없음",
    pointCount: 0,
    timezone: "Asia/Seoul",
    source: "unknown"
  };
  const revenueTrendMeta = data.revenueTrendMeta ?? {
    metric: "monthlyRevenue",
    values: [],
    periodLabel: "최근 데이터 없음",
    pointCount: 0,
    timezone: "Asia/Seoul",
    source: "unknown"
  };
  const desktopDownloadTrendMeta = data.desktopDownloadTrendMeta ?? {
    metric: "desktopDownloadCount",
    values: [],
    periodLabel: "최근 데이터 없음",
    pointCount: 0,
    timezone: "Asia/Seoul",
    source: "unknown"
  };
  const activeUserSeries = normalizeSeries(
    (data as AdminBootstrap & { traffic?: number[] }).activeUserSeries ?? (data as AdminBootstrap & { traffic?: number[] }).traffic,
    normalizeSeries(activeUserTrendMeta.values, [0])
  );
  const revenueBars = normalizeSeries(data.revenueBars, normalizeSeries(revenueTrendMeta.values, [0]));
  const desktopDownloadSeries = normalizeSeries(data.desktopDownloadSeries, normalizeSeries(desktopDownloadTrendMeta.values, [0]));
  const activeUserPath = linePath(activeUserSeries);
  const activeUserArea = `${activeUserPath} L560,150 L0,150 Z`;
  const maxRevenueBar = Math.max(...revenueBars, 1);
  const maxDesktopDownloadBar = Math.max(...desktopDownloadSeries, 1);
  const visibleKpis = data.kpis;
  const [snapshots, setSnapshots] = useState<AdminMonitoringSnapshot[]>(() => data.monitoringSnapshots);
  const [healthSnapshots, setHealthSnapshots] = useState<AdminServiceHealthSnapshot[]>([]);
  const [kafkaLag, setKafkaLag] = useState<AdminKafkaLagData | null>(null);
  const [openModal, setOpenModal] = useState<"snapshots" | "health" | "logs" | null>(null);
  const HISTORY_PREVIEW_COUNT = 5;
  const intelligenceService = data.services.find((service) => service.name === "Intelligence-Service") ?? data.services.find((service) => service.name === "AI-Service") ?? null;
  const refreshRef = useRef(onRefresh);
  const toastRef = useRef(onToast);

  useEffect(() => {
    refreshRef.current = onRefresh;
    toastRef.current = onToast;
  }, [onRefresh, onToast]);

  const loadHistory = async () => {
    try {
      const [nextSnapshots, nextHealthSnapshots] = await Promise.all([
        adminApi.getMonitoringSnapshots(),
        adminApi.getHealthSnapshots()
      ]);
      setSnapshots(nextSnapshots);
      setHealthSnapshots(nextHealthSnapshots);
    } catch {
      setSnapshots([]);
      setHealthSnapshots([]);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSnapshots(data.monitoringSnapshots);
  }, [data.monitoringSnapshots]);

  useEffect(() => {
    let active = true;

    const loadKafkaLag = () => {
      adminApi
        .getKafkaLag()
        .then((value) => {
          if (active) setKafkaLag(value);
        })
        .catch(() => {});
    };

    loadKafkaLag();
    const timer = window.setInterval(loadKafkaLag, 30000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const reloadDashboard = async () => {
      try {
        await Promise.all([refreshRef.current(), loadHistory()]);
      } catch {
        toastRef.current("모니터링 데이터를 다시 불러오지 못했어요");
      }
    };

    const timer = window.setInterval(() => {
      void reloadDashboard();
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const deleteSnapshot = async (id: string) => {
    await adminApi.deleteMonitoringSnapshot(id);
    setSnapshots((prev) => prev.filter((item) => item.snapshotId !== id));
    onToast("모니터링 기록을 삭제했어요");
  };

  const deleteHealthSnapshot = async (id: string) => {
    await adminApi.deleteHealthSnapshot(id);
    setHealthSnapshots((prev) => prev.filter((item) => item.healthSnapshotId !== id));
    onToast("서비스 체크 기록을 삭제했어요");
  };

  const orderedSnapshots = snapshots.slice().sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime());
  const orderedHealthSnapshots = healthSnapshots.slice().sort((left, right) => new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime());
  const latestMonitoringSnapshot =
    orderedSnapshots[orderedSnapshots.length - 1] ??
    data.monitoringSnapshots[data.monitoringSnapshots.length - 1] ??
    null;
  const latestMonitoringUpdatedAt = latestMonitoringSnapshot?.capturedAt ?? data.monitoringSnapshots[data.monitoringSnapshots.length - 1]?.capturedAt ?? null;
  const latestKafkaLag =
    kafkaLag ?? (latestMonitoringSnapshot ? {
      consumerGroupId: latestMonitoringSnapshot.kafkaConsumerGroupId,
      kafkaLagState: latestMonitoringSnapshot.kafkaLagState,
      kafkaLagMessages: latestMonitoringSnapshot.kafkaLagMessages,
      kafkaLagDetail: latestMonitoringSnapshot.kafkaLagDetail
    } : null);
  const latestKafkaLagView = kafkaLagDisplay(latestKafkaLag);
  const reversedSnapshots = orderedSnapshots.slice().reverse();
  const reversedHealthSnapshots = orderedHealthSnapshots.slice().reverse();
  const activeTrendLabels = buildTrendLabels(activeUserSeries.length, latestMonitoringUpdatedAt);
  const revenueTrendLabels = buildTrendLabels(revenueBars.length, latestMonitoringUpdatedAt);
  const desktopDownloadTrendLabels = buildTrendLabels(desktopDownloadSeries.length, latestMonitoringUpdatedAt);

  const handleDownloadReport = () => {
    downloadAdminReport({
      overviewSummary,
      kpis: data.kpis,
      activeUserSeries,
      revenueBars,
      desktopDownloadSeries,
      activeUserTrendMeta,
      revenueTrendMeta,
      desktopDownloadTrendMeta,
      monitoringSnapshots: snapshots,
      healthSnapshots,
      billingSubscriptions: data.billingSubscriptions,
      lastUpdatedAt: latestMonitoringUpdatedAt
    });
    onToast("운영 리포트를 엑셀 형태로 내려받았어요");
  };

  const handleRefresh = async () => {
    try {
      await Promise.all([refreshRef.current(), loadHistory()]);
      toastRef.current("모니터링 데이터를 새로고침했어요");
    } catch {
      toastRef.current("모니터링 데이터를 새로고침하지 못했어요");
    }
  };

  const renderSnapshotRow = (snapshot: AdminMonitoringSnapshot) => (
    <div key={snapshot.snapshotId} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f5f5f4", padding: "8px 0" }}>
      <span className="mono" style={{ width: 130, color: "#78716c", fontSize: 11 }}>{formatHistoryTime(snapshot.capturedAt)}</span>
      <span className="mono" style={{ flex: 1, fontSize: 12 }}>
        매출 {money(snapshot.monthlyRevenue)} · 구독 {snapshot.activeSubscriptions} · MRR {money(snapshot.mrr)} · 활성 {snapshot.activeUsers} · 다운로드 {normalizeNumber(snapshot.desktopDownloadUsers, 0)}/{normalizeNumber(snapshot.desktopDownloadCount, 0)} · Kafka {kafkaLagLabel(kafkaLagDisplay(snapshot))} {snapshot.kafkaLagMessages == null ? "" : `(${snapshot.kafkaLagMessages.toLocaleString("ko-KR")} msgs)`}
      </span>
      {snapshot.persisted ? (
        <button className="btn danger" title="삭제" onClick={() => deleteSnapshot(snapshot.snapshotId)} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}><Trash2 size={14} /></button>
      ) : (
        <Tag meta={{ background: "#f0fdf4", color: "#15803d" }}>live</Tag>
      )}
    </div>
  );

  const renderHealthRow = (snapshot: AdminServiceHealthSnapshot) => (
    <div key={snapshot.healthSnapshotId} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f5f5f4", padding: "8px 0" }}>
      <span className="dot" style={{ background: healthMeta(snapshot.state).dot }} />
      <span className="mono" style={{ width: 130, color: "#78716c", fontSize: 11 }}>{formatHistoryTime(snapshot.capturedAt)}</span>
      <span className="mono" style={{ flex: 1, fontSize: 12 }}>{snapshot.serviceName} · {snapshot.latencyMs}ms</span>
      <button className="btn danger" title="삭제" onClick={() => deleteHealthSnapshot(snapshot.healthSnapshotId)} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}><Trash2 size={14} /></button>
    </div>
  );

  const renderLogRow = (log: AdminBootstrap["logs"][number], index: number) => (
    <div key={`${log.service}-${log.time}-${index}-${log.message}`} style={{ display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid #f5f5f4", padding: "11px 20px" }}>
      <Tag meta={{ background: log.level === "ERROR" ? "#fef2f2" : log.level === "WARN" ? "#fffbeb" : "#eff6ff", color: log.level === "ERROR" ? "#dc2626" : log.level === "WARN" ? "#b45309" : "#1d4ed8" }}>{log.level}</Tag>
      <span className="mono" style={{ width: 150, color: "#57534e", fontSize: 12 }}>{log.service}</span>
      <span style={{ flex: 1, color: "#44403c", fontSize: 13 }}>{log.message}</span>
      <span className="mono" style={{ color: "#a8a29e", fontSize: 11.5 }}>{log.time}</span>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div className="status-line" style={{ display: "flex", alignItems: "center", gap: 8, color: "#111827", fontSize: 12.5, fontWeight: 600 }}>
          <span className="dot" style={{ background: "#0f766e" }} />
          <span>실시간 · 마지막 업데이트 {latestMonitoringUpdatedAt ? formatKstDateTime(latestMonitoringUpdatedAt) : "-"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => void handleRefresh()}><RefreshCw size={15} />새로고침</button>
          <button className="btn primary" onClick={handleDownloadReport}><Download size={15} />리포트 다운로드</button>
        </div>
      </div>
      <div className="grid-4" style={{ gridTemplateColumns: `repeat(${visibleKpis.length}, minmax(0, 1fr))` }}>
        {visibleKpis.map((item) => (
          <div className="card" key={item.label}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#78716c", fontSize: 13, fontWeight: 500 }}>
              <span>{item.label}</span>
              <span className="mono" style={{ color: item.tone === "good" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{item.delta}</span>
            </div>
            <div className="mono" style={{ marginTop: 12, fontSize: 28, fontWeight: 600, letterSpacing: -1 }}>{item.value}</div>
            <div style={{ marginTop: 4, color: "#a8a29e", fontSize: 12 }}>{item.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-wide">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div className="card-title">활성 사용자 추이</div>
              <div style={{ marginTop: 2, color: "#a8a29e", fontSize: 12 }}>
                현재 활성 사용자 <b className="mono" style={{ color: "#44403c" }}>{overviewSummary.activeUsers.toLocaleString("ko-KR")}</b> · {activeUserTrendMeta.periodLabel} · {activeUserTrendMeta.source}
              </div>
            </div>
            <Tag meta={{ background: "#f0fdf4", color: "#15803d" }}>실시간</Tag>
          </div>
          <svg className="chart-line" viewBox="0 0 560 150" preserveAspectRatio="none">
            <defs><linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity="0.18" /><stop offset="100%" stopColor="#0d9488" stopOpacity="0" /></linearGradient></defs>
            <path d={activeUserArea} fill="url(#trafficFill)" />
            <path d={activeUserPath} fill="none" stroke="#0d9488" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <TrendAxisLabels labels={activeTrendLabels} />
        </div>
          <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="card-title">서비스 체크</div>
            <span style={{ color: "#a8a29e", fontSize: 11 }}>{data.services.length}개 서비스</span>
          </div>
          {data.services.map((service) => (
            <div key={service.name} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f5f5f4", padding: "9px 0" }}>
              <span className="dot" style={{ background: healthMeta(service.state).dot }} />
              <span className="mono" style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{service.name}</span>
              <span className="mono" style={{ color: healthMeta(service.state).text, fontSize: 12, fontWeight: 600 }}>{service.latency}</span>
              <span className="mono" style={{ width: 54, color: "#a8a29e", fontSize: 11, textAlign: "right" }}>{service.uptime}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid-bottom-top">
        <div className="card revenue-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="card-title">매출 분석 <span style={{ color: "#a8a29e", fontSize: 12, fontWeight: 500 }}>{revenueTrendMeta.periodLabel}</span></div>
            <span className="mono" style={{ color: "#0d9488", fontSize: 13, fontWeight: 600 }}>{revenueTrendMeta.timezone}</span>
          </div>
          <div className="revenue-chart revenue-chart-compact">
            {revenueBars.map((bar, index) => (
              <div key={`${bar}-${index}`} style={{ flex: 1, height: `${Math.max(4, (bar / maxRevenueBar) * 100)}%`, borderRadius: "7px 7px 3px 3px", background: index > 10 ? "#0d9488" : "#d6d3d1" }} />
            ))}
          </div>
          <TrendAxisLabels labels={revenueTrendLabels} />
        </div>
        <div className="grid-bottom-side">
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="card-title">Windows 앱 다운로드</div>
              <span className="mono" style={{ color: "#2563eb", fontSize: 13, fontWeight: 600 }}>{desktopDownloadTrendMeta.timezone}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div className="mono" style={{ fontSize: 24, fontWeight: 600 }}>{desktopDownloadCount.toLocaleString("ko-KR")}</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>사용자 {desktopDownloadUsers.toLocaleString("ko-KR")}명</div>
            </div>
            <div className="revenue-chart" style={{ height: 120 }}>
              {desktopDownloadSeries.map((bar, index) => (
                <div
                  key={`${bar}-${index}-download`}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, (bar / maxDesktopDownloadBar) * 100)}%`,
                    borderRadius: "7px 7px 3px 3px",
                    background: index > Math.max(0, desktopDownloadSeries.length - 4) ? "#2563eb" : "#bfdbfe"
                  }}
                />
              ))}
            </div>
            <TrendAxisLabels labels={desktopDownloadTrendLabels} />
            <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 11 }}>{desktopDownloadTrendMeta.periodLabel} · {desktopDownloadTrendMeta.source}</div>
          </div>
          <AlertMetric
            title={intelligenceService ? "Intelligence-Service 응답" : "AI 응답 서비스"}
            left="상태"
            leftValue={healthMeta(intelligenceService?.state).label}
            right="지연"
            rightValue={intelligenceService?.latency ?? "-"}
            tone={healthMeta(intelligenceService?.state).tone}
          />
        </div>
      </div>
      <div className="grid-bottom-metrics">
        <AlertMetric
          title="Workspace 원장"
          left="전체 노트"
          leftValue={overviewSummary.totalNotes.toLocaleString("ko-KR")}
          right="오늘 생성"
          rightValue={overviewSummary.notesCreatedToday.toLocaleString("ko-KR")}
          tone="neutral"
          detail={`총 저장량 ${formatStorage(overviewSummary.totalStorageBytes)} · ${overviewSummary.workspaceSource}`}
        />
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Kafka 큐 대기 Lag</div>
            <Tag meta={kafkaLagTone(latestKafkaLagView)}>
              {kafkaLagLabel(latestKafkaLagView)}
            </Tag>
          </div>
          <div className="mono" style={{ marginTop: 8, fontSize: 24, fontWeight: 600 }}>
            {latestKafkaLagView?.kafkaLagMessages == null ? "-" : latestKafkaLagView.kafkaLagMessages.toLocaleString("ko-KR")} <span style={{ color: "#a8a29e", fontSize: 12 }}>msgs</span>
          </div>
          <div style={{ marginTop: 2, color: "#a8a29e", fontSize: 11 }}>
            {latestKafkaLagView?.consumerGroupId ?? "intelligence-service"} · {kafkaLagDetail(latestKafkaLagView)}
          </div>
          <div style={{ marginTop: 4, color: "#a8a29e", fontSize: 11 }}>
            경고 기준 {kafkaLagThresholds(latestKafkaLagView).warningThreshold.toLocaleString("ko-KR")} msgs · 심각 기준 {kafkaLagThresholds(latestKafkaLagView).criticalThreshold.toLocaleString("ko-KR")} msgs
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 20px 12px" }}>
          <div className="card-title">실시간 에러 로그 & 알림</div>
          <button className="btn" onClick={() => setOpenModal("logs")}>전체 보기</button>
        </div>
        {data.logs.slice(0, HISTORY_PREVIEW_COUNT).map(renderLogRow)}
      </div>
      <div className="grid-wide" style={{ marginTop: 20 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="card-title">모니터링 기록</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#a8a29e", fontSize: 11 }}>{snapshots.length}건</span>
              {snapshots.length > HISTORY_PREVIEW_COUNT ? (
                <button className="btn" onClick={() => setOpenModal("snapshots")}>전체 보기</button>
              ) : null}
            </div>
          </div>
          {snapshots.length === 0 && <div style={{ color: "#a8a29e", fontSize: 12, padding: "8px 0" }}>저장된 기록이 없어요</div>}
          {reversedSnapshots.slice(0, HISTORY_PREVIEW_COUNT).map(renderSnapshotRow)}
        </div>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="card-title">서비스 체크 기록</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#a8a29e", fontSize: 11 }}>{healthSnapshots.length}건</span>
              {healthSnapshots.length > HISTORY_PREVIEW_COUNT ? (
                <button className="btn" onClick={() => setOpenModal("health")}>전체 보기</button>
              ) : null}
            </div>
          </div>
          {healthSnapshots.length === 0 && <div style={{ color: "#a8a29e", fontSize: 12, padding: "8px 0" }}>저장된 서비스 기록이 없어요</div>}
          {reversedHealthSnapshots.slice(0, HISTORY_PREVIEW_COUNT).map(renderHealthRow)}
        </div>
      </div>
      {openModal === "snapshots" ? (
        <ListModal title={`모니터링 기록 (${snapshots.length}건)`} onClose={() => setOpenModal(null)}>
          {snapshots.length === 0 ? <div style={{ color: "#a8a29e", fontSize: 12, padding: "8px 0" }}>저장된 기록이 없어요</div> : reversedSnapshots.map(renderSnapshotRow)}
        </ListModal>
      ) : null}
      {openModal === "health" ? (
        <ListModal title={`서비스 체크 기록 (${healthSnapshots.length}건)`} onClose={() => setOpenModal(null)}>
          {healthSnapshots.length === 0 ? <div style={{ color: "#a8a29e", fontSize: 12, padding: "8px 0" }}>저장된 서비스 기록이 없어요</div> : reversedHealthSnapshots.map(renderHealthRow)}
        </ListModal>
      ) : null}
      {openModal === "logs" ? (
        <ListModal title={`실시간 에러 로그 & 알림 (${data.logs.length}건)`} onClose={() => setOpenModal(null)}>
          {data.logs.map(renderLogRow)}
        </ListModal>
      ) : null}
    </>
  );
}

function DashboardPage({
  data,
  adminProfile,
  profileImage,
  onProfileImageUpdated,
  onProfileUpdated,
  onOpenAdmins,
  onToast,
  onRefresh
}: {
  data: AdminBootstrap;
  adminProfile: AdminBootstrap["adminProfile"];
  profileImage: string | null;
  onProfileImageUpdated: (value: string | null) => void;
  onProfileUpdated: (profile: AdminBootstrap["adminProfile"]) => void;
  onOpenAdmins: () => void;
  onToast: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="dashboard-layout">
      <div className="dashboard-main">
        <Dashboard data={data} onToast={onToast} onRefresh={onRefresh} />
      </div>
      <AdminProfileRail
        admin={adminProfile}
        profileImage={profileImage}
        onProfileImageUpdated={onProfileImageUpdated}
        onProfileUpdated={onProfileUpdated}
        onOpenAdmins={onOpenAdmins}
        onToast={onToast}
      />
    </div>
  );
}

function AdminProfileRail({
  admin,
  profileImage,
  onProfileImageUpdated,
  onProfileUpdated,
  onOpenAdmins,
  onToast
}: {
  admin: AdminBootstrap["adminProfile"];
  profileImage: string | null;
  onProfileImageUpdated: (value: string | null) => void;
  onProfileUpdated: (profile: AdminBootstrap["adminProfile"]) => void;
  onOpenAdmins: () => void;
  onToast: (message: string) => void;
}) {
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof adminApi.listAdminAccounts>>> ([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageScope, setMessageScope] = useState<AdminMessageScope>("ALL");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [email, setEmail] = useState(admin.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editingField, setEditingField] = useState<"loginId" | "email" | "password" | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const currentAccount = accounts.find((account) => account.adminId === admin.adminUserId) ?? accounts[0];
  const messageViewer: AdminMessageViewer = { adminUserId: admin.adminUserId, name: admin.name };
  const unreadMessages = messages.filter((message) => !message.isRead);
  const availableRecipients = accounts.filter((account) => account.adminId !== admin.adminUserId);
  const previewMessages = messages.slice(-5);

  const hasLength = newPassword.length >= 8;
  const hasMix = /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);

  useEffect(() => {
    setEmail(admin.email ?? "");
  }, [admin.email, admin.name]);

  useEffect(() => {
    setLoginId(currentAccount?.loginId ?? "");
  }, [currentAccount?.loginId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!editingField) return;
      const target = event.target as Node | null;
      if (target && railRef.current?.contains(target)) return;
      setEditingField(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editingField]);

  const openAvatarPicker = () => {
    avatarInputRef.current?.click();
  };

  const updateAvatarImage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : null;
      if (!value) return;
      onProfileImageUpdated(value);
      window.localStorage.setItem(ADMIN_PROFILE_IMAGE_STORAGE_KEY, value);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let active = true;
    adminApi
      .listAdminAccounts()
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch(() => {
        if (active) setAccounts([]);
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadMessages = async () => {
    try {
      const data = await adminApi.listAdminMessages(messageViewer);
      setMessages(data.messages);
    } catch {
      return;
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => {
      void loadMessages();
    }, 3000);
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void loadMessages();
      }
    };
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [messageViewer.adminUserId, messageViewer.name]);

  const toggleRecipient = (adminId: string) => {
    setSelectedRecipientIds((current) => (current.includes(adminId) ? current.filter((id) => id !== adminId) : [...current, adminId]));
  };

  const sendAdminMessage = async () => {
    if (sendingMessage) return;
    const nextBody = messageDraft.trim();
    if (!nextBody) {
      onToast("메시지 내용을 입력해 주세요");
      return;
    }
    if (messageScope === "SELECTED" && selectedRecipientIds.length === 0) {
      onToast("선택 발송 대상을 하나 이상 골라 주세요");
      return;
    }

    try {
      setSendingMessage(true);
      await adminApi.sendAdminMessage({
        recipientScope: messageScope,
        recipientAdminUserIds: messageScope === "SELECTED" ? selectedRecipientIds : [],
        body: nextBody
      }, messageViewer);
      setMessageDraft("");
      if (messageScope === "SELECTED") {
        setSelectedRecipientIds([]);
      }
      await loadMessages();
      onToast(messageScope === "ALL" ? "전체 메시지를 보냈어요" : "선택한 관리자에게 메시지를 보냈어요");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "메시지 전송에 실패했어요");
    } finally {
      setSendingMessage(false);
    }
  };

  const openMessageModal = async () => {
    setMessageModalOpen(true);
    const unreadIds = unreadMessages.map((message) => message.messageId);
    if (unreadIds.length === 0) return;
    await Promise.all(unreadIds.map((messageId) => adminApi.markAdminMessageRead(messageId, messageViewer).catch(() => null)));
    await loadMessages();
  };

  const saveLoginId = async () => {
    if (!currentAccount) {
      onToast("관리자 계정을 불러오지 못했어요");
      return;
    }
    const nextLoginId = loginId.trim();
    if (!nextLoginId) {
      onToast("아이디를 입력해 주세요");
      return;
    }
    try {
      const { admin: updated } = await adminApi.updateAdminAccount(currentAccount.adminId, { loginId: nextLoginId });
      setAccounts((prev) => prev.map((account) => (account.adminId === updated.adminId ? updated : account)));
      onToast("아이디를 변경했어요");
      setEditingField(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "아이디 변경에 실패했어요");
    }
  };

  const saveEmail = async () => {
    try {
      const updated = await adminApi.updateProfile({ email });
      updateSessionAdmin(updated);
      onProfileUpdated(updated);
      onToast("이메일을 변경했어요");
      setEditingField(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "이메일 변경에 실패했어요");
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      onToast("비밀번호 항목을 모두 입력해 주세요");
      return;
    }
    if (!hasLength || !hasMix) {
      onToast("새 비밀번호는 영문과 숫자를 포함한 8자 이상이어야 해요");
      return;
    }
    if (newPassword !== confirmPassword) {
      onToast("새 비밀번호와 확인 값이 달라요");
      return;
    }
    try {
      await adminApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onToast("관리자 비밀번호를 변경했어요");
      setEditingField(null);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "비밀번호 변경에 실패했어요");
    }
  };

  const roleBadgeStyle: Record<string, { background: string; color: string }> = {
    owner: { background: "#f5f3ff", color: "#6d28d9" },
    admin: { background: "#eff6ff", color: "#1d4ed8" },
    support: { background: "#fffbeb", color: "#b45309" },
    billing: { background: "#f0fdf4", color: "#15803d" }
  };
  const roleLabel: Record<string, string> = {
    owner: "최고관리자",
    admin: "관리자",
    support: "문의 담당",
    billing: "결제 담당"
  };

  return (
    <aside className="dashboard-rail">
      <section className="rail-card admin-setting-card" ref={railRef}>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="sr-only-input"
          onChange={(event) => updateAvatarImage(event.target.files?.[0] ?? null)}
        />
        <div className="admin-setting-hero">
          <button className="admin-setting-avatar-button" type="button" onClick={openAvatarPicker} aria-label="프로필 사진 수정">
            {profileImage ? <img src={profileImage} alt="" className="admin-setting-avatar-image" /> : <div className="admin-setting-avatar">{admin.name.trim().charAt(0) || "A"}</div>}
            <span className="admin-setting-avatar-overlay">수정</span>
          </button>
          <div className="admin-setting-name">
            <div className="admin-setting-name-text">{admin.name}</div>
            <div className="admin-setting-email">{admin.email ?? "-"}</div>
          </div>
          <span className="admin-setting-role">{roleLabel[admin.role] ?? admin.role}</span>
        </div>

        <div className="admin-setting-meta">
          <div className="admin-setting-meta-row">
            <span className="admin-setting-meta-label">아이디</span>
            <span className="admin-setting-meta-value mono">{currentAccount?.loginId ?? "-"}</span>
            <button className="admin-setting-icon-button" type="button" onClick={() => setEditingField("loginId")} aria-label="아이디 수정" title="아이디 수정">
              <Pencil size={12} />
            </button>
          </div>
          {editingField === "loginId" ? (
            <div className="rail-field" style={{ margin: "8px 0 4px" }}>
              <span>새 아이디</span>
              <input className="mono" value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="admin01" />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn ghost" type="button" onClick={() => setEditingField(null)}>취소</button>
                <button className="btn primary" type="button" onClick={saveLoginId}>저장</button>
              </div>
            </div>
          ) : null}
          <div className="admin-setting-meta-row">
            <span className="admin-setting-meta-label">이메일</span>
            <span className="admin-setting-meta-value">{admin.email ?? "-"}</span>
            <button className="admin-setting-icon-button" type="button" onClick={() => setEditingField("email")} aria-label="이메일 수정" title="이메일 수정">
              <Pencil size={12} />
            </button>
          </div>
          {editingField === "email" ? (
            <div className="rail-field" style={{ margin: "8px 0 4px" }}>
              <span>새 이메일</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@brainx.io" />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn ghost" type="button" onClick={() => setEditingField(null)}>취소</button>
                <button className="btn primary" type="button" onClick={saveEmail}>저장</button>
              </div>
            </div>
          ) : null}
          <div className="admin-setting-meta-row">
            <span className="admin-setting-meta-label">비밀번호</span>
            <span className="admin-setting-meta-value">보안 변경 필요</span>
            <button className="admin-setting-icon-button" type="button" onClick={() => setEditingField("password")} aria-label="비밀번호 수정" title="비밀번호 수정">
              <Pencil size={12} />
            </button>
          </div>
          {editingField === "password" ? (
            <div className="rail-field" style={{ margin: "8px 0 4px" }}>
              <span>현재 비밀번호</span>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              <span style={{ marginTop: 6 }}>새 비밀번호</span>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <div className="rail-password-rules" style={{ marginTop: 8 }}>
                <span className={hasLength ? "valid" : ""}>8자 이상</span>
                <span className={hasMix ? "valid" : ""}>문자+숫자</span>
              </div>
              <span style={{ marginTop: 6 }}>새 비밀번호 확인</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn ghost" type="button" onClick={() => setEditingField(null)}>취소</button>
                <button className="btn primary" type="button" onClick={changePassword}>저장</button>
              </div>
            </div>
          ) : null}
          <div className="admin-setting-meta-row">
            <span className="admin-setting-meta-label">SMS</span>
            <span className="admin-setting-meta-value">{unreadMessages.length}건</span>
            <button className={`admin-setting-link${unreadMessages.length === 0 ? " muted" : ""}`} type="button" onClick={() => void openMessageModal()}>읽음</button>
          </div>
          <div className="admin-setting-meta-row">
            <span className="admin-setting-meta-label">역할</span>
            <span className="admin-setting-meta-value">{roleLabel[admin.role] ?? admin.role}</span>
            <button className="admin-setting-link" type="button" onClick={onOpenAdmins}>변경</button>
          </div>
        </div>
      </section>

      <section className="rail-card rail-admin-list">
        <div className="rail-head">
          <div>
            <div className="rail-title">관리자 목록</div>
            <div className="rail-subtitle">등록된 관리자 계정을 빠르게 확인해요</div>
          </div>
          <span className="mono" style={{ color: "#6b7280", fontSize: 12 }}>{loadingAccounts ? "불러오는 중" : `${accounts.length}명`}</span>
        </div>
        <div className="rail-admin-list-body">
          {accounts.map((account) => (
            <div
              className="rail-admin-row"
              key={account.adminId}
              onClick={admin.role === "owner" ? onOpenAdmins : undefined}
              style={admin.role === "owner" ? { cursor: "pointer" } : undefined}
            >
              <div className="rail-mini-avatar">
                {account.adminId === admin.adminUserId && profileImage ? (
                  <img src={profileImage} alt="" className="rail-mini-avatar-image" />
                ) : (
                  account.name.trim().charAt(0) || "A"
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{account.name}</div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{account.loginId}</div>
              </div>
              <Tag meta={roleBadgeStyle[account.role] ?? roleBadgeStyle.admin}>{roleLabel[account.role] ?? account.role}</Tag>
            </div>
          ))}
          {!loadingAccounts && accounts.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13, padding: "12px 2px" }}>관리자 계정이 없어요</div>
          ) : null}
        </div>
      </section>

      <section className="rail-card admin-message-card">
        <div className="rail-head">
          <div>
            <div className="rail-title">관리자 메시지</div>
            <div className="rail-subtitle">전체 공지 또는 선택 발송으로 빠르게 소통해요</div>
          </div>
          <button className="btn" type="button" onClick={() => void openMessageModal()}>
            읽음 {unreadMessages.length > 0 ? `(${unreadMessages.length})` : ""}
          </button>
        </div>
        <AdminMessageFeed
          messages={previewMessages}
          currentAdminUserId={admin.adminUserId}
          loading={loadingMessages}
          resolveRecipientLabel={(message) => describeAdminMessageAudience(message, accounts)}
        />
        <AdminMessageComposer
          scope={messageScope}
          onScopeChange={setMessageScope}
          draft={messageDraft}
          onDraftChange={setMessageDraft}
          recipientOptions={availableRecipients}
          selectedRecipientIds={selectedRecipientIds}
          onRecipientToggle={toggleRecipient}
          onSend={() => void sendAdminMessage()}
          sending={sendingMessage}
          compact
        />
      </section>

      {messageModalOpen ? (
        <AdminMessageModal
          currentAdminUserId={admin.adminUserId}
          messages={messages}
          loading={loadingMessages}
          scope={messageScope}
          onScopeChange={setMessageScope}
          draft={messageDraft}
          onDraftChange={setMessageDraft}
          recipientOptions={availableRecipients}
          selectedRecipientIds={selectedRecipientIds}
          onRecipientToggle={toggleRecipient}
          onSend={() => void sendAdminMessage()}
          sending={sendingMessage}
          resolveRecipientLabel={(message) => describeAdminMessageAudience(message, accounts)}
          onClose={() => setMessageModalOpen(false)}
        />
      ) : null}
    </aside>
  );
}

function describeAdminMessageAudience(message: AdminMessage, accounts: Array<{ adminId: string; name: string }>) {
  if (message.recipientScope === "ALL") return "전체";
  const names = message.recipientAdminUserIds
    .map((adminId) => accounts.find((account) => account.adminId === adminId)?.name)
    .filter((value): value is string => Boolean(value));
  if (names.length > 0) return names.join(", ");
  return `${message.recipientAdminUserIds.length}명 선택`;
}

function AdminMessageFeed({
  messages,
  currentAdminUserId,
  loading,
  resolveRecipientLabel
}: {
  messages: AdminMessage[];
  currentAdminUserId: string;
  loading: boolean;
  resolveRecipientLabel: (message: AdminMessage) => string;
}) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const lastMessageId = messages.at(-1)?.messageId ?? "";

  useEffect(() => {
    const node = feedRef.current;
    if (!node) return;
    const scrollToBottom = () => {
      node.scrollTop = node.scrollHeight;
    };
    scrollToBottom();
    const frameId = window.requestAnimationFrame(scrollToBottom);
    const timerId = window.setTimeout(scrollToBottom, 80);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [lastMessageId, messages.length, loading]);

  if (loading) {
    return <div className="admin-message-empty">메시지를 불러오는 중이에요</div>;
  }

  if (messages.length === 0) {
    return <div className="admin-message-empty">아직 주고받은 메시지가 없어요</div>;
  }

  return (
    <div className="admin-message-feed" ref={feedRef}>
      {messages.map((message) => {
        const mine = message.senderAdminUserId === currentAdminUserId;
        return (
          <div key={message.messageId} className={`admin-message-row${mine ? " mine" : ""}`}>
            <div className="admin-message-meta">
              <span>{mine ? "나" : message.senderName}</span>
              <span>{resolveRecipientLabel(message)}</span>
              {!mine && !message.isRead ? <span className="admin-message-unread">NEW</span> : null}
            </div>
            <div className={`admin-message-bubble${mine ? " mine" : ""}`}>{message.body}</div>
            <div className="admin-message-time">{formatHistoryTime(message.sentAt)}</div>
          </div>
        );
      })}
    </div>
  );
}

function AdminMessageComposer({
  scope,
  onScopeChange,
  draft,
  onDraftChange,
  recipientOptions,
  selectedRecipientIds,
  onRecipientToggle,
  onSend,
  sending = false,
  compact = false
}: {
  scope: AdminMessageScope;
  onScopeChange: (scope: AdminMessageScope) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  recipientOptions: Array<{ adminId: string; name: string; loginId: string; role: string }>;
  selectedRecipientIds: string[];
  onRecipientToggle: (adminId: string) => void;
  onSend: () => void;
  sending?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`admin-message-composer${compact ? " compact" : ""}`}>
      <div className="admin-message-audience">
        <button className={`admin-message-scope${scope === "ALL" ? " active" : ""}`} type="button" onClick={() => onScopeChange("ALL")}>
          전체 보내기
        </button>
        <button className={`admin-message-scope${scope === "SELECTED" ? " active" : ""}`} type="button" onClick={() => onScopeChange("SELECTED")}>
          선택해서 보내기
        </button>
      </div>
      {scope === "SELECTED" ? (
        <div className="admin-message-recipient-list">
          {recipientOptions.map((account) => (
            <button
              key={account.adminId}
              type="button"
              className={`admin-message-recipient${selectedRecipientIds.includes(account.adminId) ? " active" : ""}`}
              onClick={() => onRecipientToggle(account.adminId)}
            >
              <span>{account.name}</span>
              <span>{account.loginId}</span>
            </button>
          ))}
          {recipientOptions.length === 0 ? <div className="admin-message-empty inline">보낼 다른 관리자가 없어요</div> : null}
        </div>
      ) : null}
      <div className="admin-message-compose-box">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="운영 이슈나 전달 사항을 게임 채팅처럼 빠르게 남겨 보세요"
          rows={compact ? 3 : 4}
        />
        <button className="btn primary" type="button" onClick={onSend} disabled={sending}>
          <SendHorizonal size={14} />
          {sending ? "보내는 중..." : "보내기"}
        </button>
      </div>
    </div>
  );
}

function AdminMessageModal({
  currentAdminUserId,
  messages,
  loading,
  scope,
  onScopeChange,
  draft,
  onDraftChange,
  recipientOptions,
  selectedRecipientIds,
  onRecipientToggle,
  onSend,
  sending,
  resolveRecipientLabel,
  onClose
}: {
  currentAdminUserId: string;
  messages: AdminMessage[];
  loading: boolean;
  scope: AdminMessageScope;
  onScopeChange: (scope: AdminMessageScope) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  recipientOptions: Array<{ adminId: string; name: string; loginId: string; role: string }>;
  selectedRecipientIds: string[];
  onRecipientToggle: (adminId: string) => void;
  onSend: () => void;
  sending: boolean;
  resolveRecipientLabel: (message: AdminMessage) => string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="list-modal admin-message-modal" onClick={(event) => event.stopPropagation()}>
        <div className="list-modal-head">
          <div>
            <div className="card-title">관리자 메시지함</div>
            <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>받은 메시지를 확인하고 바로 답장을 보낼 수 있어요</div>
          </div>
          <button className="btn" onClick={onClose} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}><X size={16} /></button>
        </div>
        <div className="admin-message-modal-body">
          <AdminMessageFeed messages={messages} currentAdminUserId={currentAdminUserId} loading={loading} resolveRecipientLabel={resolveRecipientLabel} />
          <AdminMessageComposer
            scope={scope}
            onScopeChange={onScopeChange}
            draft={draft}
            onDraftChange={onDraftChange}
            recipientOptions={recipientOptions}
            selectedRecipientIds={selectedRecipientIds}
            onRecipientToggle={onRecipientToggle}
            onSend={onSend}
            sending={sending}
          />
        </div>
      </div>
    </div>
  );
}

function ListModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="list-modal" onClick={(event) => event.stopPropagation()}>
        <div className="list-modal-head">
          <div className="card-title">{title}</div>
          <button className="btn" onClick={onClose} style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}><X size={16} /></button>
        </div>
        <div className="list-modal-body">{children}</div>
      </div>
    </div>
  );
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function AlertMetric({
  title,
  left,
  leftValue,
  right,
  rightValue,
  detail,
  tone = "warn"
}: {
  title: string;
  left: string;
  leftValue: string;
  right: string;
  rightValue: string;
  detail?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const bar = tone === "good" ? { width: "82%", background: "linear-gradient(90deg,#14b8a6,#0f766e)" } : tone === "warn" ? { width: "76%", background: "linear-gradient(90deg,#f59e0b,#d97706)" } : { width: "62%", background: "linear-gradient(90deg,#94a3b8,#64748b)" };
  const valueColor = tone === "good" ? "#0f766e" : tone === "warn" ? "#d97706" : "#64748b";
  return (
    <div className="card">
      <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ display: "flex", gap: 20 }}>
        {[{ label: left, value: leftValue }, { label: right, value: rightValue }].map((item) => (
          <div key={item.label} style={{ flex: 1 }}>
            <div style={{ color: "#a8a29e", fontSize: 11 }}>{item.label}</div>
            <div className="mono" style={{ color: valueColor, fontSize: 22, fontWeight: 600 }}>{item.value}</div>
          </div>
        ))}
      </div>
      {detail ? <div style={{ marginTop: 8, color: "#a8a29e", fontSize: 11 }}>{detail}</div> : null}
      <div style={{ height: 6, overflow: "hidden", borderRadius: 4, background: "#f5f5f4", marginTop: 14 }}><div style={bar} /></div>
    </div>
  );
}

function UsersPanel({ users, onReload, onToast }: { users: AdminUser[]; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  const [userSearch, setUserSearch] = useState("");
  const [plan, setPlan] = useState<Plan | "all">("all");
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [year, setYear] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailUser, setDetailUser] = useState<AdminUserDetail | null>(null);
  const [bulkPlanModalOpen, setBulkPlanModalOpen] = useState(false);
  const [bulkSuspendModalOpen, setBulkSuspendModalOpen] = useState(false);
  const [bulkWithdrawModalOpen, setBulkWithdrawModalOpen] = useState(false);
  const [bulkNoticeModalOpen, setBulkNoticeModalOpen] = useState(false);

  const years = Array.from(new Set(users.map((user) => user.joined.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  const rows = users.filter((user) => {
    const matchesText = `${user.name} ${user.email}`.toLowerCase().includes(userSearch.toLowerCase());
    const matchesPlan = plan === "all" || user.plan === plan;
    const matchesStatus = status === "all" || user.status === status;
    const matchesYear = year === "all" || user.joined.startsWith(year);
    return matchesText && matchesPlan && matchesStatus && matchesYear;
  });
  const allVisibleSelected = rows.length > 0 && rows.every((user) => selectedIds.includes(user.id));
  const selectedUsers = users.filter((user) => selectedIds.includes(user.id));

  const toggleOne = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !rows.some((user) => user.id === id));
      return Array.from(new Set([...current, ...rows.map((user) => user.id)]));
    });
  };

  const ensureSelection = () => {
    if (selectedIds.length === 0) {
      onToast("먼저 사용자를 선택해 주세요");
      return false;
    }
    return true;
  };

  const reactivateUser = async (user: AdminUser) => {
    await adminApi.changeUserStatus(user.id, "active");
    await onReload();
    setSelectedIds((current) => current.filter((id) => id !== user.id));
    onToast(`${user.name} 계정의 정지를 취소했어요`);
  };

  return (
    <>
      <div className="toolbar">
        <div style={{ position: "relative" }}>
          <Search size={15} color="#a8a29e" style={{ position: "absolute", left: 12, top: 11 }} />
          <input className="search user-search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="이름 또는 이메일 검색" />
        </div>
        <select className="select" value={plan} onChange={(event) => setPlan(event.target.value as Plan | "all")}>
          <option value="all">플랜 · 전체</option>
          <option value="free">무료</option>
          <option value="pro">Pro</option>
          <option value="max">Max</option>
        </select>
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value as UserStatus | "all")}>
          <option value="all">상태 · 전체</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
          <option value="withdrawn">탈퇴</option>
        </select>
        <select className="select" value={year} onChange={(event) => setYear(event.target.value)}>
          <option value="all">가입일 · 전체</option>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#78716c", fontSize: 13 }}>결과 <b style={{ color: "#1c1917" }}>{rows.length}</b>명</span>
      </div>
      {selectedIds.length > 0 ? (
        <div className="bulkbar">
          <b>{selectedIds.length}명 선택</b>
          <button className="btn" onClick={() => ensureSelection() && setBulkPlanModalOpen(true)}><Repeat2 size={15} />플랜 변경</button>
          <button className="btn" onClick={() => ensureSelection() && setBulkSuspendModalOpen(true)}><Ban size={15} />계정 정지</button>
          <button className="btn danger" onClick={() => ensureSelection() && setBulkWithdrawModalOpen(true)}><X size={15} />탈퇴 처리</button>
          <button className="btn" onClick={() => ensureSelection() && setBulkNoticeModalOpen(true)}><Megaphone size={15} />공지 발송</button>
          <button className="btn ghost" onClick={() => setSelectedIds([])} style={{ marginLeft: "auto" }}>선택 해제</button>
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="현재 목록 전체 선택" /></th>
              <th>사용자</th>
              <th>플랜</th>
              <th>상태</th>
              <th>메모 수</th>
              <th>가입일</th>
              <th>최근 활동</th>
              <th style={{ textAlign: "right" }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id} className={selectedIds.includes(user.id) ? "selected-row" : ""} onClick={() => setDetailUser(user as AdminUserDetail)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggleOne(user.id)} aria-label={`${user.name} ?좏깮`} />
                </td>
                <td>
                  <div className="user-cell">
                    <Avatar user={user} />
                    <div>
                      <b>{user.name}</b>
                      <div className="mono" style={{ color: "#a8a29e", fontSize: 12 }}>{user.email}</div>
                    </div>
                  </div>
                </td>
                <td><Tag meta={planStyle[user.plan]}>{planLabel[user.plan]}</Tag></td>
                <td><Tag meta={userStatus[user.status]}>{userStatus[user.status].label}</Tag></td>
                <td className="mono">{user.notes}</td>
                <td className="mono">{user.joined}</td>
                <td>{user.lastActive}</td>
                <td style={{ textAlign: "right" }}>
                  <div className="row-icons" onClick={(event) => event.stopPropagation()}>
                    <button aria-label={`${user.name} 상세 보기`} onClick={() => setDetailUser(user as AdminUserDetail)}><Eye size={15} /></button>
                    <button aria-label={`${user.name} 플랜 변경`} onClick={() => {
                      setSelectedIds([user.id]);
                      setBulkPlanModalOpen(true);
                    }}><Repeat2 size={15} /></button>
                    {user.status === "suspended" ? (
                      <button className="success" aria-label={`${user.name} 정지 취소`} onClick={() => { void reactivateUser(user); }}>
                        <RefreshCw size={15} />
                      </button>
                    ) : (
                      <button aria-label={`${user.name} 계정 정지`} onClick={() => {
                        setSelectedIds([user.id]);
                        setBulkSuspendModalOpen(true);
                      }}><Ban size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detailUser ? <UserDetailDrawer user={detailUser} onReload={onReload} onClose={() => setDetailUser(null)} onToast={onToast} /> : null}
      {bulkPlanModalOpen ? (
        <BulkPlanChangeModal
          count={selectedUsers.length}
          onClose={() => setBulkPlanModalOpen(false)}
          onApply={async (targetPlanId) => {
            await adminApi.runUserBulkAction(selectedIds, "CHANGE_PLAN", { targetPlanId });
            await onReload();
            onToast(`${selectedIds.length}명의 플랜을 ${planLabel[targetPlanId]}로 변경했어요`);
            setBulkPlanModalOpen(false);
            setSelectedIds([]);
          }}
        />
      ) : null}
      {bulkSuspendModalOpen ? (
        <SuspendUsersModal
          count={selectedUsers.length}
          onClose={() => setBulkSuspendModalOpen(false)}
          onApply={async ({ reason, suspendedDays }) => {
            await adminApi.runUserBulkAction(selectedIds, "SUSPEND", { reason, suspendedDays });
            await onReload();
            onToast(`${selectedIds.length}명의 계정을 ${suspendedDays}일 정지했어요`);
            setBulkSuspendModalOpen(false);
            setSelectedIds([]);
          }}
        />
      ) : null}
      {bulkWithdrawModalOpen ? (
        <WithdrawUsersModal
          count={selectedUsers.length}
          onClose={() => setBulkWithdrawModalOpen(false)}
          onApply={async (reason) => {
            await adminApi.runUserBulkAction(selectedIds, "WITHDRAW", { reason });
            await onReload();
            onToast(`${selectedIds.length}명의 탈퇴 처리를 요청했어요`);
            setBulkWithdrawModalOpen(false);
            setSelectedIds([]);
          }}
        />
      ) : null}
      {bulkNoticeModalOpen ? (
        <SendNoticeModal
          count={selectedUsers.length}
          onClose={() => setBulkNoticeModalOpen(false)}
          onApply={async ({ type, title, body }) => {
            await adminApi.runUserBulkAction(selectedIds, "SEND_NOTICE", { notice: { title: `[${type}] ${title}`, body } });
            setBulkNoticeModalOpen(false);
            setSelectedIds([]);
            await onReload();
            onToast(`${selectedIds.length}명에게 공지를 발송했어요`);
          }}
        />
      ) : null}
    </>
  );
}

function Avatar({ user, size = 38 }: { user: AdminUser; size?: number }) {
  const palette = ["#ea580c", "#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#be123c", "#0891b2"];
  const color = palette[Math.abs(user.name.charCodeAt(0) + user.name.charCodeAt(user.name.length - 1)) % palette.length];
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: Math.max(13, size * 0.38) }}>
      {user.name.charAt(0)}
    </span>
  );
}

function loginSessions(user: AdminUserDetail | AdminUser) {
  if (!("sessions" in user) || !user.sessions) return [];

  return user.sessions.map((session) => ({
    id: session.sessionId,
    device: session.device,
    location: normalizeCountryLabel(session.location),
    lastSeen: formatHistoryTime(session.lastSeenAt),
    current: session.current
  }));
}

function normalizeCountryLabel(value?: string | null) {
  if (!value) return "대한민국";
  if (value.includes("Korea") || value.includes("대한민국")) return "대한민국";
  return "대한민국";
}

function UserDetailDrawer({ user, onReload, onClose, onToast }: { user: AdminUserDetail; onReload: () => Promise<void>; onClose: () => void; onToast: (message: string) => void }) {
    const [detail, setDetail] = useState<AdminUserDetail>(user);
    const [planModalOpen, setPlanModalOpen] = useState(false);
    const [suspendModalOpen, setSuspendModalOpen] = useState(false);
    const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);

    useEffect(() => {
      let cancelled = false;

      const refresh = async () => {
        try {
          const data = await adminApi.getUserDetail(user.id);
          if (!cancelled) {
            setDetail(data);
          }
        } catch {
          if (!cancelled) {
            setDetail(user);
          }
        }
      };

      setDetail(user);
      void refresh();

      return () => {
        cancelled = true;
      };
    }, [user.id]);

    const sessions = loginSessions(detail);
    const suspendButtonLabel = detail.status === "suspended" ? "정지 취소" : "계정 정지";
    const suspendButtonIcon = detail.status === "suspended" ? <RefreshCw size={15} /> : <Ban size={15} />;
    const reactivateUser = async () => {
      await adminApi.changeUserStatus(detail.id, "active");
      await onReload();
      setDetail((current) => ({ ...current, status: "active" }));
      onToast(`${detail.name} 계정의 정지를 취소했어요`);
    };

    return (
      <div className="drawer-backdrop" onClick={onClose}>
      <aside className="user-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <b>사용자 상세</b>
          <button className="icon-button" onClick={onClose} aria-label="사용자 상세 닫기"><X size={18} /></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-profile">
            <Avatar user={detail} size={56} />
            <div>
              <h2>{detail.name}</h2>
              <div className="mono drawer-email">{detail.email}</div>
            </div>
          </div>
          <div className="drawer-status"><Tag meta={userStatus[detail.status]}>{userStatus[detail.status].label}</Tag></div>
          <div className="detail-grid">
            <DetailStat label="메모 수" value={detail.notes.toLocaleString("ko-KR")} />
            <DetailStat label="현재 플랜" value={planLabel[detail.plan]} tag={detail.plan} />
            <DetailStat label="가입일" value={detail.joined} />
            <DetailStat label="최근 활동" value={detail.lastActive} />
          </div>
          <button className="plan-change-button" onClick={() => setPlanModalOpen(true)}>플랜 변경</button>
          <section className="device-section">
            <h3>로그인 기기</h3>
            <div className="device-list">
              {sessions.length === 0 ? (
                <p style={{ color: "#a8a29e", fontSize: 13, padding: "8px 0" }}>로그인 기록이 없습니다</p>
              ) : (
                sessions.map((session) => (
                  <div className={`device-item ${session.current ? "current" : ""}`} key={session.id}>
                    <span className="device-icon"><MonitorSmartphone size={17} /></span>
                    <div>
                      <div className="device-title">
                        <b>{session.device}</b>
                {session.current ? <span>현재 접속</span> : null}
                      </div>
                      <p>{session.location}</p>
                    </div>
                    <time>{session.lastSeen}</time>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="activity-section">
            <h3>활동 내역</h3>
            {detail.activities.map((activity, index) => (
              <div className="activity-item" key={`${activity.text}-${activity.time}-${index}`}>
                <span className="dot" style={{ background: "#0d9488" }} />
                <div>
                  <div>{activity.text}</div>
                  <span>{activity.time}</span>
                </div>
              </div>
            ))}
          </section>
          <section className="danger-zone">
            <h3>위험 구역</h3>
            <div className="danger-actions">
              {detail.status === "suspended" ? (
                <button className="reactivate-button" onClick={() => { void reactivateUser(); }}>
                  {suspendButtonIcon}
                  {suspendButtonLabel}
                </button>
              ) : (
                <button className="danger-secondary" onClick={() => {
                  setSuspendModalOpen(true);
                }}>
                  {suspendButtonIcon}
                  {suspendButtonLabel}
                </button>
              )}
              <button className="danger-primary" onClick={async () => {
                setWithdrawModalOpen(true);
              }}>탈퇴 처리</button>
            </div>
          </section>
        </div>
      </aside>
      {planModalOpen ? (
        <PlanChangeModal
          user={detail}
          onClose={() => setPlanModalOpen(false)}
          onApply={async (plan) => {
            await adminApi.changeUserPlan(user.id, plan);
            await onReload();
            onToast(`${detail.name}의 플랜을 ${planLabel[plan]}으로 변경했어요`);
            setPlanModalOpen(false);
          }}
        />
      ) : null}
      {suspendModalOpen ? (
        <SuspendUsersModal
          count={1}
          onClose={() => setSuspendModalOpen(false)}
          onApply={async ({ reason, suspendedDays }) => {
            await adminApi.changeUserStatus(user.id, "suspended", { reason, suspendedDays });
            await onReload();
            onToast(`${detail.name} 계정을 ${suspendedDays}일 정지했어요`);
            setSuspendModalOpen(false);
            onClose();
          }}
        />
      ) : null}
      {withdrawModalOpen ? (
        <WithdrawUsersModal
          count={1}
          onClose={() => setWithdrawModalOpen(false)}
          onApply={async (reason) => {
            await adminApi.withdrawUser(user.id, reason);
            await onReload();
            onToast(`${detail.name} 탈퇴 처리를 요청했어요`);
            setWithdrawModalOpen(false);
            onClose();
          }}
        />
      ) : null}
    </div>
  );
}

function DetailStat({ label, value, tag }: { label: string; value: string; tag?: Plan }) {
  return (
    <div className="detail-stat">
      <span>{label}</span>
      {tag ? <Tag meta={planStyle[tag]}>{value}</Tag> : <b className="mono">{value}</b>}
    </div>
  );
}

function PlanChangeModal({ user, onClose, onApply }: { user: AdminUser; onClose: () => void; onApply: (plan: Plan) => void }) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(user.plan);
  const planOptions: Plan[] = ["free", "pro", "max"];

  return (
    <div className="modal-backdrop" onClick={(event) => event.stopPropagation()}>
      <div className="price-modal plan-change-modal">
        <div className="modal-icon"><Repeat2 size={22} /></div>
        <h2>플랜 변경</h2>
        <p>{user.name}의 플랜을 변경합니다. 변경 사항은 즉시 반영돼요.</p>
        <div className="plan-option-grid">
          {planOptions.map((plan) => (
            <button key={plan} className={selectedPlan === plan ? "active" : ""} onClick={() => setSelectedPlan(plan)}>
              {planLabel[plan]}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button onClick={() => onApply(selectedPlan)}>변경 적용</button>
        </div>
      </div>
    </div>
  );
}

function BulkPlanChangeModal({ count, onClose, onApply }: { count: number; onClose: () => void; onApply: (plan: Plan) => void }) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("free");
  const planOptions: Plan[] = ["free", "pro", "max"];

  return (
    <div className="modal-backdrop">
      <div className="price-modal plan-change-modal">
        <div className="modal-icon"><Repeat2 size={22} /></div>
        <h2>일괄 플랜 변경</h2>
        <p>{count}명의 사용자를 한 번에 같은 플랜으로 변경합니다.</p>
        <div className="plan-option-grid">
          {planOptions.map((plan) => (
            <button key={plan} className={selectedPlan === plan ? "active" : ""} onClick={() => setSelectedPlan(plan)}>
              {planLabel[plan]}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button onClick={() => onApply(selectedPlan)}>변경 적용</button>
        </div>
      </div>
    </div>
  );
}

function SuspendUsersModal({
  count,
  onClose,
  onApply
}: {
  count: number;
  onClose: () => void;
  onApply: (payload: { reason: string; suspendedDays: number }) => void;
}) {
  const [reason, setReason] = useState("");
  const [suspendedDays, setSuspendedDays] = useState("7");

  return (
    <div className="modal-backdrop">
      <div className="price-modal plan-change-modal">
        <div className="modal-icon"><Ban size={22} /></div>
        <h2>계정 정지</h2>
        <p>{count}명의 계정을 같은 조건으로 정지합니다.</p>
        <label className="reply-label" htmlFor="suspend-reason">정지 사유</label>
        <textarea id="suspend-reason" className="support-reply" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="정지 사유를 입력해 주세요." />
        <label className="reply-label" htmlFor="suspend-days">정지 일수</label>
        <input id="suspend-days" className="search user-search" value={suspendedDays} onChange={(event) => setSuspendedDays(event.target.value)} placeholder="예: 7" />
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button onClick={() => onApply({ reason: reason.trim(), suspendedDays: Math.max(1, Number(suspendedDays) || 1) })}>정지 적용</button>
        </div>
      </div>
    </div>
  );
}

function WithdrawUsersModal({ count, onClose, onApply }: { count: number; onClose: () => void; onApply: (reason: string) => void }) {
  const [reason, setReason] = useState("");

  return (
    <div className="modal-backdrop">
      <div className="price-modal plan-change-modal">
        <div className="modal-icon"><X size={22} /></div>
        <h2>탈퇴 처리 확인</h2>
        <p>{count}명의 탈퇴 처리를 요청합니다. 이 작업은 되돌리기 어렵습니다.</p>
        <label className="reply-label" htmlFor="withdraw-reason">탈퇴 사유</label>
        <textarea id="withdraw-reason" className="support-reply" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="내부 관리용 사유를 남길 수 있습니다." />
        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button onClick={() => onApply(reason.trim())}>탈퇴 처리</button>
        </div>
      </div>
    </div>
  );
}

function SendNoticeModal({
  count,
  onClose,
  onApply
}: {
  count: number;
  onClose: () => void;
  onApply: (payload: { type: string; title: string; body: string }) => Promise<void>;
}) {
  const [type, setType] = useState("일반");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fieldStyle = { width: "100%" };
  const stackStyle = { display: "grid", gap: 12 };

  return (
    <div className="modal-backdrop">
      <div className="price-modal plan-change-modal" style={{ width: "min(560px, calc(100vw - 32px))" }}>
        <div className="modal-icon"><Megaphone size={22} /></div>
        <h2>공지 발송</h2>
        <p>{count}명의 알림함에 같은 공지를 발송합니다.</p>
        <div style={stackStyle}>
          <div>
            <label className="reply-label" htmlFor="notice-type">공지 유형</label>
            <select id="notice-type" className="select" style={fieldStyle} value={type} onChange={(event) => setType(event.target.value)}>
              <option value="일반">일반</option>
              <option value="운영">운영</option>
              <option value="결제">결제</option>
              <option value="보안">보안</option>
            </select>
          </div>
          <div>
            <label className="reply-label" htmlFor="notice-title">공지 제목</label>
            <input id="notice-title" className="search" style={fieldStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="공지 제목" />
          </div>
          <div>
            <label className="reply-label" htmlFor="notice-body">공지 내용</label>
            <textarea id="notice-body" className="support-reply" style={{ ...fieldStyle, minHeight: 160 }} value={body} onChange={(event) => setBody(event.target.value)} placeholder="공지 내용을 입력해 주세요." />
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={submitting}>취소</button>
          <button
            onClick={async () => {
              if (submitting) return;
              setSubmitting(true);
              try {
                await onApply({ type, title: title.trim(), body: body.trim() });
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
          >
            {submitting ? "발송 중..." : "발송"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupportPanel({ inquiries, activeId, activeInquiry, reply, onSelect, onReply, onReload, onToast }: { inquiries: AdminInquiry[]; activeId: string; activeInquiry?: AdminInquiry; reply: string; onSelect: (id: string) => void; onReply: (value: string) => void; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  const [tab, setTab] = useState<InquiryStatus | "all">("all");
  const [replyFaq, setReplyFaq] = useState(false);
  const tabs: Array<{ id: InquiryStatus | "all"; label: string; count: number }> = [
    { id: "all", label: "전체", count: inquiries.length },
    { id: "pending", label: "대기", count: inquiries.filter((item) => item.status === "pending").length },
    { id: "progress", label: "처리중", count: inquiries.filter((item) => item.status === "progress").length },
    { id: "done", label: "완료", count: inquiries.filter((item) => item.status === "done").length }
  ];
  const visibleInquiries = tab === "all" ? inquiries : inquiries.filter((item) => item.status === tab);
  const selectInquiry = (id: string) => {
    onSelect(id);
    onReply("");
    setReplyFaq(false);
  };

  if (!activeInquiry) {
    return (
      <div className="support-layout">
        <aside className="support-list-panel">
          <div className="support-tabs">
            {tabs.map((item) => (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
                {item.label} {item.count}
              </button>
            ))}
          </div>
          <div className="support-list" />
        </aside>
        <section className="support-detail-panel">
            <div className="rounded-[12px] border border-[#e5e0d8] px-5 py-10 text-center text-[13px] text-[#8c877f]">
            문의가 없습니다.
            </div>
        </section>
      </div>
    );
  }

  return (
    <div className="support-layout">
      <aside className="support-list-panel">
        <div className="support-tabs">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              {item.label} {item.count}
            </button>
          ))}
        </div>
        <div className="support-list">
          {visibleInquiries.map((item) => (
            <button key={item.id} className={`support-ticket ${activeId === item.id ? "active" : ""}`} onClick={() => selectInquiry(item.id)}>
              <div className="support-ticket-tags">
                <SupportStatusBadge status={item.status} />
                <SupportCategoryBadge category={item.category} />
                {item.urgent ? <span className="urgent-label">긴급</span> : null}
              </div>
              <b>{item.subject}</b>
              <div className="support-ticket-meta">
                <span>{item.user}</span>
                <span className="mono">{item.created}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="support-detail-panel">
        <div className="support-detail-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="support-detail-tags">
              <SupportStatusBadge status={activeInquiry.status} />
              <SupportCategoryBadge category={activeInquiry.category} />
            </div>
            <h2>{activeInquiry.subject}</h2>
          </div>
          <button
            className="btn danger"
            onClick={async () => {
              await adminApi.deleteTicket(activeInquiry.id);
              await onReload();
              onToast("문의를 삭제했어요");
            }}
          >
            <Trash2 size={15} />삭제
          </button>
        </div>

        <div className="support-meta-card">
          <div>
            <span>사용자</span>
            <b>{activeInquiry.user}</b>
          </div>
          <div>
            <span>이메일</span>
            <b className="mono">{activeInquiry.email}</b>
          </div>
          <div>
            <span>작성 시간</span>
            <b className="mono">{activeInquiry.created}</b>
          </div>
          <label>
            <span>담당자 배정</span>
            <select defaultValue={activeInquiry.agent || ""} onChange={async (event) => {
              await adminApi.updateTicket(activeInquiry.id, { status: "progress", assigneeAdminUserId: event.target.value || null });
              await onReload();
              onToast(event.target.value ? `담당자를 ${event.target.value}으로 배정했어요` : "담당자 배정을 해제했어요");
            }}>
              <option value="">미배정</option>
              <option value="김대영">김대영</option>
              <option value="정관리">정관리</option>
            </select>
          </label>
        </div>

        <p className="support-body">
          {activeInquiry.body.split("\n").map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>

        <div className="support-divider" />

        {activeInquiry.replyContent ? (
          <div className="support-body" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <b style={{ display: "block", color: "#15803d", marginBottom: 8 }}>
              {activeInquiry.agent || "관리자"}님이 답변을 완료했어요
              {activeInquiry.repliedAt ? <span className="mono" style={{ marginLeft: 8, color: "#78716c", fontWeight: 500 }}>{formatHistoryTime(activeInquiry.repliedAt)}</span> : null}
            </b>
            <span style={{ whiteSpace: "pre-wrap" }}>{activeInquiry.replyContent}</span>
          </div>
        ) : null}

        {!activeInquiry.replyContent ? (
          <>
            <label className="reply-label" htmlFor="support-reply">답변 작성</label>
            <textarea
              id="support-reply"
              className="support-reply"
              value={reply}
              onChange={(event) => onReply(event.target.value)}
              placeholder="고객에게 보낼 답변을 입력해 주세요."
            />
            <div className="reply-actions">
              <label className="faq-check">
                <input type="checkbox" checked={replyFaq} onChange={(event) => setReplyFaq(event.target.checked)} />
                <span>답변을 FAQ로 등록</span>
              </label>
              <div className="reply-buttons">
                <button className="reply-save" onClick={() => onToast("답변을 임시 저장했어요")}>임시 저장</button>
                <button
                  className="reply-send"
                  onClick={async () => {
                    if (!reply.trim()) {
                      onToast("답변 내용을 입력해 주세요");
                      return;
                    }
                    await adminApi.replyTicket(activeInquiry.id, { body: reply, faq: replyFaq });
                    await onReload();
                    onReply("");
                    setReplyFaq(false);
                    onToast(replyFaq ? "답변을 전송하고 FAQ로 등록했어요" : "답변을 전송했어요");
                  }}
                >
                  답변 전송
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SupportStatusBadge({ status }: { status: InquiryStatus }) {
  const meta = inquiryStatus[status];
  return (
    <span className={`support-status support-status-${status}`}>
      <span className="dot" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function SupportCategoryBadge({ category }: { category: string }) {
  const colors: Record<string, { background: string; color: string }> = {
    "버그": { background: "#fef2f2", color: "#ef4444" },
    "문의": { background: "#ecfeff", color: "#0891b2" },
    "결제": { background: "#faf5ff", color: "#9333ea" },
    "기능요청": { background: "#ecfdf5", color: "#059669" },
    "계정": { background: "#fffbeb", color: "#d97706" }
  };
  const tone = colors[category] ?? { background: "#f5f5f4", color: "#57534e" };
  return (
    <span className="support-category" style={{ background: tone.background, color: tone.color }}>
      {category}
    </span>
  );
}

type BillingTab = "history" | "subscriptions" | "failed" | "plans";

const billingTransactions = [
  { id: "TXN-8F2A91", user: "서소연", plan: "max" as Plan, amount: 39000, method: "신용카드", status: "success" as PaymentStatus, date: "06-25 08:42" },
  { id: "TXN-7B14C2", user: "하지은", plan: "pro" as Plan, amount: 19000, method: "간편결제", status: "success" as PaymentStatus, date: "06-25 07:15" },
  { id: "TXN-3D90E5", user: "이도윤", plan: "pro" as Plan, amount: 19000, method: "체크카드", status: "failed" as PaymentStatus, date: "06-25 02:30" },
  { id: "TXN-1A77F8", user: "박재민", plan: "max" as Plan, amount: 39000, method: "간편결제", status: "success" as PaymentStatus, date: "06-24 22:10" },
  { id: "TXN-9C03B1", user: "최예린", plan: "pro" as Plan, amount: 19000, method: "신용카드", status: "canceled" as PaymentStatus, date: "06-24 18:55" },
  { id: "TXN-5E62A0", user: "정태훈", plan: "pro" as Plan, amount: 19000, method: "삼성페이", status: "success" as PaymentStatus, date: "06-24 13:40" },
  { id: "TXN-2F48D7", user: "강민수", plan: "max" as Plan, amount: 39000, method: "체크카드", status: "failed" as PaymentStatus, date: "06-24 09:12" },
  { id: "TXN-6B91C4", user: "김서연", plan: "max" as Plan, amount: 39000, method: "신용카드", status: "success" as PaymentStatus, date: "06-23 20:05" },
  { id: "TXN-4A20E9", user: "문수아", plan: "pro" as Plan, amount: 19000, method: "간편결제", status: "success" as PaymentStatus, date: "06-23 16:30" },
  { id: "TXN-8D55F3", user: "박주미", plan: "pro" as Plan, amount: 19000, method: "체크카드", status: "failed" as PaymentStatus, date: "06-23 11:48" }
];

const billingSubscriptions = [
  { user: "김서연", initial: "김", plan: "max" as Plan, started: "2024-03-12", next: "07-12", amount: 39000 },
  { user: "하지은", initial: "하", plan: "pro" as Plan, started: "2024-07-29", next: "07-29", amount: 19000 },
  { user: "서소연", initial: "서", plan: "max" as Plan, started: "2023-06-02", next: "08-02", amount: 39000 },
  { user: "이도윤", initial: "이", plan: "pro" as Plan, started: "2024-09-11", next: "07-30", amount: 19000 },
  { user: "정태훈", initial: "정", plan: "pro" as Plan, started: "2024-04-23", next: "08-11", amount: 19000 },
  { user: "박재민", initial: "박", plan: "max" as Plan, started: "2023-10-15", next: "07-23", amount: 39000 }
];

const failedBilling = [
  { user: "이도윤", initial: "이", plan: "Pro", amount: "₩19,000", reason: "카드 한도 초과 · 재시도 2회", date: "06-25 02:30" },
  { user: "강민수", initial: "강", plan: "Max", amount: "₩39,000", reason: "유효기간 만료 · 재시도 1회", date: "06-24 09:12" },
  { user: "박주미", initial: "박", plan: "Pro", amount: "₩19,000", reason: "PG 승인 거절 · 재시도 3회", date: "06-23 11:48" }
];

const planCards = [
  { key: "free" as Plan, name: "Free", label: "Free", price: 0, desc: "작은 팀을 위한 기본 플랜" },
  { key: "pro" as Plan, name: "Pro", label: "Pro", price: 19000, desc: "무제한 프로젝트 · 고급 AI · 협업" },
  { key: "max" as Plan, name: "Max", label: "Max", price: 39000, desc: "워크플로우 · 권한 관리 · 고급 자동화" }
];

function BillingPanel({ data, tab, setTab, onReload, onToast }: { data: AdminBootstrap; tab: BillingTab; setTab: (tab: BillingTab) => void; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  const [priceModal, setPriceModal] = useState<null | { key: Plan; name: string; price: number }>(null);
  const [draftPrice, setDraftPrice] = useState("");
  const [timing, setTiming] = useState<"now" | "next">("now");
  const subscriptionRows = data.billingSubscriptions.filter((item) => item.plan !== "free");
  const openPriceModal = (plan: { key: Plan; name: string; price: number }) => {
    setPriceModal(plan);
    setDraftPrice(String(plan.price));
    setTiming("now");
  };

  return (
    <>
      <div className="billing-kpis">
        <BillingKpi label="이번 달 매출" value={`₩${(data.billingSummary.monthlyRevenue / 1000000).toFixed(1)}M`} />
        <BillingKpi label="활성 구독" value={data.billingSummary.activeSubscriptions.toLocaleString("ko-KR")} />
        <BillingKpi label="MRR" value={`₩${(data.billingSummary.mrr / 1000000).toFixed(1)}M`} accent />
        <BillingKpi label="결제 실패" value={data.billingSummary.failedPaymentCount.toLocaleString("ko-KR")} danger />
      </div>
      <div className="billing-tabs">
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>결제 내역</button>
        <button className={tab === "subscriptions" ? "active" : ""} onClick={() => setTab("subscriptions")}>구독 현황</button>
        <button className={tab === "failed" ? "active" : ""} onClick={() => setTab("failed")}>결제 실패 추적</button>
        <button className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>요금제 관리</button>
      </div>

      {tab === "history" ? <BillingHistory transactions={data.billingTransactions} onReload={onReload} onToast={onToast} /> : null}
      {tab === "subscriptions" ? <BillingSubscriptions subscriptions={subscriptionRows} onReload={onReload} onToast={onToast} /> : null}
      {tab === "failed" ? <FailedPayments failures={data.failedBilling} onReload={onReload} onToast={onToast} /> : null}
      {tab === "plans" ? <PlanManagement plans={data.planCards} onEdit={openPriceModal} /> : null}
      {priceModal ? (
        <PriceModal
          modal={priceModal}
          value={draftPrice}
          timing={timing}
          onValue={setDraftPrice}
          onTiming={setTiming}
          onClose={() => setPriceModal(null)}
          onSave={async () => {
            await adminApi.updatePlanPrice(priceModal.key, Number(draftPrice || 0), timing === "now" ? "IMMEDIATE" : "NEXT_BILLING");
            await onReload();
            onToast(`${priceModal.name} 요금제를 ₩${Number(draftPrice || 0).toLocaleString("ko-KR")}로 수정했어요`);
            setPriceModal(null);
          }}
        />
      ) : null}
    </>
  );
}

function BillingKpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="billing-kpi">
      <span>{label}</span>
      <b className="mono" style={{ color: accent ? "#0d9488" : danger ? "#dc2626" : "#111827" }}>{value}</b>
    </div>
  );
}

function BillingHistory({ transactions, onReload, onToast }: { transactions: BillingTransaction[]; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  const [refundTarget, setRefundTarget] = useState<BillingTransaction | null>(null);

  return (
    <>
      <div className="billing-table-card">
        <table>
          <thead><tr><th>거래 ID</th><th>사용자</th><th>플랜</th><th>금액</th><th>결제수단</th><th>상태</th><th>일시</th><th style={{ textAlign: "right" }}>관리</th></tr></thead>
          <tbody>
            {transactions.map((payment) => (
              <tr key={payment.id}>
                <td className="mono">{payment.id}</td>
                <td><b>{payment.user}</b></td>
                <td><Tag meta={planStyle[payment.plan]}>{planLabel[payment.plan] === "무료" ? "Free" : planLabel[payment.plan]}</Tag></td>
                <td className="mono"><b>{money(payment.amount)}</b></td>
                <td>{payment.method}</td>
                <td><Tag meta={paymentStatus[payment.status]}>{paymentStatus[payment.status].label}</Tag></td>
                <td className="mono" style={{ color: "#a8a29e" }}>{payment.date}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {payment.status === "success" ? <button className="refund-button" onClick={() => setRefundTarget(payment)}>환불</button> : null}
                    <button
                      className="btn danger"
                       title="삭제"
                      style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
                      onClick={async () => {
                        await adminApi.deletePayment(payment.id);
                        await onReload();
                        onToast(`${payment.user} 결제 기록을 삭제했어요`);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {refundTarget ? (
        <RefundConfirmModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onConfirm={async (reason) => {
            await adminApi.refundPayment(refundTarget.id, {
              amount: refundTarget.amount,
              reason
            });
            await onReload();
            onToast(`${refundTarget.user} 결제 환불을 처리했어요`);
            setRefundTarget(null);
          }}
        />
      ) : null}
    </>
  );
}

function RefundConfirmModal({
  payment,
  onClose,
  onConfirm
}: {
  payment: BillingTransaction;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("관리자 환불 처리");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="price-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-icon"><WalletCards size={22} /></div>
        <h2>환불 확인</h2>
        <p>{payment.user} 사용자의 결제를 환불할까요? 환불 후 결제 상태는 환불로 유지되고, 사용자는 무료 플랜으로 전환됩니다.</p>
        <div style={{ width: "100%", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", padding: 14, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}><span style={{ color: "#64748b" }}>거래 ID</span><b className="mono">{payment.id}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, marginTop: 8 }}><span style={{ color: "#64748b" }}>사용자</span><b>{payment.user}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, marginTop: 8 }}><span style={{ color: "#64748b" }}>환불 금액</span><b>{money(payment.amount)}</b></div>
        </div>
        <label className="price-label" style={{ display: "block", marginTop: 14 }}>
          환불 사유
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            style={{
              width: "100%",
              marginTop: 8,
              borderRadius: 12,
              border: "1px solid #dbe2ea",
              padding: "12px 14px",
              resize: "vertical",
              fontSize: 14,
              outline: "none"
            }}
          />
        </label>
        <div className="modal-actions">
          <button onClick={onClose} disabled={submitting}>취소</button>
          <button
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(reason.trim() || "관리자 환불 처리");
              } catch (error) {
                window.alert(error instanceof Error ? error.message : "환불 처리에 실패했어요.");
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
          >
            {submitting ? "처리 중..." : "환불 진행"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingSubscriptions({ subscriptions, onReload, onToast }: { subscriptions: BillingSubscription[]; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  return (
    <div className="subscription-grid">
          {subscriptions.length === 0 ? (
        <div className="failed-row" style={{ gridColumn: "1 / -1", justifyContent: "center", color: "#78716c", fontWeight: 700 }}>
          등록된 구독이 없어요
        </div>
      ) : null}
      {subscriptions.map((item) => (
        <div className="subscription-card" key={item.subscriptionId}>
          <Avatar user={{ name: item.user } as AdminUser} size={38} />
          <div style={{ flex: 1 }}>
            <b>{item.user}</b>
            <p>
              시작 {item.started} · 다음 결제 <strong>{getBillingCycleLabel(item.billingCycle)} {getNextBillingDate(item.started, item.billingCycle)}</strong>
            </p>
          </div>
          <div className="subscription-price">
          <Tag meta={planStyle[item.plan]}>{planLabel[item.plan] === "무료" ? "Free" : planLabel[item.plan]}</Tag>
             <span className="mono">{money(item.amount)}<small>/월</small></span>
          </div>
          <button
            className="btn danger"
             title="삭제"
            style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
            onClick={async () => {
              await adminApi.deleteSubscription(item.subscriptionId);
              await onReload();
               onToast(`${item.user} 구독 기록을 삭제했어요`);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function FailedPayments({ failures, onReload, onToast }: { failures: FailedBilling[]; onReload: () => Promise<void>; onToast: (message: string) => void }) {
  return (
    <div className="failed-card">
       <div className="failed-title">결제 실패 추적은 최근 시도와 안내가 필요해요</div>
      {failures.length === 0 ? (
          <div className="failed-row" style={{ justifyContent: "center", color: "#78716c", fontWeight: 700 }}>
          결제 실패가 없습니다
        </div>
      ) : null}
      {failures.map((item) => (
        <div className="failed-row" key={item.user}>
          <Avatar user={{ name: item.user } as AdminUser} size={38} />
          <div style={{ flex: 1 }}>
            <b>{item.user}</b>
            <span>{item.plan} {item.amount}</span>
            <p>{item.reason}</p>
          </div>
          <time className="mono">{item.date}</time>
          <button className="retry-button" onClick={async () => {
            await adminApi.retryPayment(item.paymentId);
            await onReload();
            onToast(`${item.user} 결제를 다시 시도했어요`);
          }}>결제 시도</button>
          <button className="mail-button" onClick={async () => {
            await adminApi.sendPaymentFailureNotice(item.paymentId);
            await onReload();
            onToast(`${item.user}에게 안내 메일을 보냈어요`);
          }}>안내 메일</button>
        </div>
      ))}
    </div>
  );
}

function PlanManagement({ plans, onEdit }: { plans: PlanCard[]; onEdit: (plan: { key: Plan; name: string; price: number }) => void }) {
  return (
    <section className="plan-management">
      <h3>요금제 관리</h3>
      <p>가격 변경 이력으로 기록하고 즉시 반영할 수 있어요.</p>
      <div className="plan-card-grid">
        {plans.map((plan) => (
          <div className="plan-admin-card" key={plan.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Tag meta={planStyle[plan.key]}>{plan.label}</Tag>
               <button onClick={() => onEdit({ key: plan.key, name: plan.name, price: plan.price })}>가격 수정</button>
            </div>
             <div className="plan-price mono">{plan.price === 0 ? "Free" : money(plan.price)}<small>/월</small></div>
            <div className="plan-desc">{plan.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceModal({ modal, value, timing, onValue, onTiming, onClose, onSave }: { modal: { key: Plan; name: string; price: number }; value: string; timing: "now" | "next"; onValue: (value: string) => void; onTiming: (timing: "now" | "next") => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="price-modal">
         <div className="modal-icon"><Pencil size={22} /></div>
         <h2>{modal.name} 요금제 가격 수정</h2>
         <p>가격 변경 이력을 기록하고 적용 시점을 선택할 수 있어요.</p>
        <label className="price-label">
          새 가격(원)
          <input className="mono" value={value} onChange={(event) => onValue(event.target.value.replace(/[^0-9]/g, ""))} />
        </label>
         <div className="modal-label">적용 시점</div>
        <div className="timing-grid">
           <button className={timing === "now" ? "active" : ""} onClick={() => onTiming("now")}>즉시 적용</button>
           <button className={timing === "next" ? "active" : ""} onClick={() => onTiming("next")}>다음 결제부터</button>
        </div>
        <div className="modal-actions">
           <button onClick={onClose}>취소</button>
           <button onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  );
}



