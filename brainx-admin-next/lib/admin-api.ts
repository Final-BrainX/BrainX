import {
  adminProfile,
  billingSubscriptions,
  billingTransactions,
  failedBilling,
  inquiries,
  kpis,
  logs,
  planCards,
  revenueBars,
  services,
  traffic,
  users,
  type AdminInquiry,
  type AdminProfile,
  type AdminUser,
  type BillingSubscription,
  type BillingTransaction,
  type FailedBilling,
  type PaymentStatus,
  type Plan,
  type PlanCard,
  type UserStatus,
  type InquiryStatus
} from "@/lib/admin-data";
import { clearSession, getSession, getToken, type AdminRole, type AdminSession } from "@/lib/admin-auth";

type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
};

type ApiFailure = {
  success?: false;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiPlanId = "free" | "pro" | "max";
type ApiUserStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN";
type ApiTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type ApiPaymentStatus = "SUCCESS" | "FAILED" | "REFUNDED" | "CANCELED";
type ApiKafkaLagState = "HEALTHY" | "NO_COMMITTED_OFFSETS" | "BROKER_UNREACHABLE" | "CONFIG_MISSING";

type ApiUserRow = {
  userId: string;
  name: string;
  email: string;
  planId: ApiPlanId;
  status: ApiUserStatus;
  noteCount: number;
  storageBytes?: number;
  joinedAt: string;
  lastActiveAt?: string | null;
  lastLogin?: {
    sessionId?: string;
    device: string;
    location?: string | null;
    ipAddress?: string | null;
    userAgentHash?: string | null;
    lastSeenAt: string;
    current?: boolean;
  } | null;
  activities?: Array<{ message: string; occurredAt: string }>;
};

type ApiLoginSession = {
  sessionId: string;
  device: string;
  location?: string | null;
  ipAddress?: string | null;
  userAgentHash?: string | null;
  lastSeenAt: string;
  current: boolean;
};

type ApiUserDetail = ApiUserRow & {
  sessions: ApiLoginSession[];
  activities?: Array<{ activityId?: string; type?: string; message: string; occurredAt: string }>;
};

type ApiTicket = {
  ticketId: string;
  userId?: string;
  userName?: string;
  email?: string;
  status: ApiTicketStatus;
  category: string;
  subject: string;
  createdAt: string;
  assigneeAdminName?: string | null;
  urgent?: boolean;
  body?: string;
  replyContent?: string | null;
  repliedAt?: string | null;
};

type ApiPayment = {
  paymentId: string;
  transactionId?: string;
  userId?: string;
  userName: string;
  planId: ApiPlanId;
  amount: number;
  method: string;
  status: ApiPaymentStatus;
  paidAt: string;
};

type ApiSubscription = {
  subscriptionId: string;
  userId?: string;
  userName: string;
  initial?: string;
  planId: ApiPlanId;
  startedAt: string;
  nextBillingAt?: string | null;
  billingCycle?: "MONTHLY" | "YEARLY";
  amount: number;
};

type ApiPaymentFailure = {
  paymentId: string;
  userId?: string;
  userName: string;
  planId: ApiPlanId;
  amount: number;
  reason: string;
  retryCount: number;
  failedAt: string;
};

type ApiPlan = {
  planId: ApiPlanId;
  name: string;
  price: number;
  description?: string;
};

export type AdminAccountRow = {
  adminId: string;
  name: string;
  loginId: string;
  email: string | null;
  role: AdminRole;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type AdminMessageScope = "ALL" | "SELECTED";

export type AdminMessage = {
  messageId: string;
  senderAdminUserId: string;
  senderName: string;
  recipientScope: AdminMessageScope;
  recipientAdminUserIds: string[];
  body: string;
  sentAt: string;
  isRead: boolean;
};

export type AdminMessagesData = {
  messages: AdminMessage[];
  unreadCount: number;
};

export type AdminMessageViewer = {
  adminUserId: string;
  name: string;
};

export type AdminServiceHealthSummary = {
  name: string;
  latency: string;
  uptime: string;
  state: string;
};

export type AdminTrendSeries = {
  metric: string;
  values: number[];
  periodLabel: string;
  pointCount: number;
  timezone: string;
  source: string;
};

export type AdminOverviewSummary = {
  monthlyRevenue: number;
  activeSubscriptions: number;
  mrr: number;
  failedPaymentCount: number;
  activeUsers: number;
  desktopDownloadUsers: number;
  desktopDownloadCount: number;
  totalNotes: number;
  totalStorageBytes: number;
  notesCreatedToday: number;
  timezone: string;
  revenueSource: string;
  userSource: string;
  workspaceSource: string;
};

export type AdminMonitoringSnapshot = {
  snapshotId: string;
  monthlyRevenue: number;
  activeSubscriptions: number;
  mrr: number;
  failedPaymentCount: number;
  activeUsers: number;
  desktopDownloadUsers: number;
  desktopDownloadCount: number;
  kafkaLagMessages: number | null;
  kafkaConsumerGroupId: string | null;
  kafkaLagState: ApiKafkaLagState;
  kafkaLagDetail: string | null;
  capturedAt: string;
  persisted: boolean;
};

export type AdminKafkaLagData = {
  consumerGroupId: string | null;
  kafkaLagState: ApiKafkaLagState;
  kafkaLagMessages: number | null;
  warningThreshold: number;
  criticalThreshold: number;
  kafkaLagDetail: string | null;
  capturedAt: string;
};

export type AdminServiceHealthSnapshot = {
  healthSnapshotId: string;
  serviceName: string;
  state: string;
  latencyMs: number;
  uptimePercent: number;
  capturedAt: string;
};

export type AdminBootstrap = {
  kpis: ReadonlyArray<{ label: string; value: string; delta: string; tone: "good" | "bad"; sub: string }>;
  services: ReadonlyArray<AdminServiceHealthSummary>;
  logs: typeof logs;
  revenueBars: number[];
  activeUserSeries: number[];
  desktopDownloadSeries: number[];
  revenueTrendMeta: AdminTrendSeries;
  activeUserTrendMeta: AdminTrendSeries;
  desktopDownloadTrendMeta: AdminTrendSeries;
  overviewSummary: AdminOverviewSummary;
  users: AdminUser[];
  inquiries: AdminInquiry[];
  billingTransactions: BillingTransaction[];
  billingSubscriptions: BillingSubscription[];
  failedBilling: FailedBilling[];
  planCards: PlanCard[];
  monitoringSnapshots: AdminMonitoringSnapshot[];
  billingSummary: {
    monthlyRevenue: number;
    activeSubscriptions: number;
    mrr: number;
    failedPaymentCount: number;
  };
  adminProfile: AdminProfile;
};

export type AdminLoginSession = {
  sessionId: string;
  device: string;
  location: string;
  ipAddress: string;
  userAgentHash?: string | null;
  lastSeenAt: string;
  current: boolean;
};

export type AdminUserDetail = AdminUser & {
  sessions: AdminLoginSession[];
};

export const fallbackAdminBootstrap: AdminBootstrap = {
  kpis,
  services,
  logs,
  revenueBars,
  activeUserSeries: traffic,
  desktopDownloadSeries: Array.from({ length: traffic.length }, () => 0),
  revenueTrendMeta: {
    metric: "monthlyRevenue",
    values: revenueBars,
    periodLabel: "최근 14회 스냅샷",
    pointCount: revenueBars.length,
    timezone: "Asia/Seoul",
    source: "mock"
  },
  activeUserTrendMeta: {
    metric: "activeUsers",
    values: traffic,
    periodLabel: "최근 14회 스냅샷",
    pointCount: traffic.length,
    timezone: "Asia/Seoul",
    source: "mock"
  },
  desktopDownloadTrendMeta: {
    metric: "desktopDownloadCount",
    values: Array.from({ length: traffic.length }, () => 0),
    periodLabel: "최근 14일 다운로드 없음",
    pointCount: traffic.length,
    timezone: "Asia/Seoul",
    source: "mock"
  },
  overviewSummary: {
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
    revenueSource: "mock",
    userSource: "mock",
    workspaceSource: "mock"
  },
  users,
  inquiries,
  billingTransactions,
  billingSubscriptions,
  failedBilling,
  planCards,
  monitoringSnapshots: [],
  billingSummary: {
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    mrr: 0,
    failedPaymentCount: 0
  },
  adminProfile
};

const userStatusFromApi: Record<ApiUserStatus, UserStatus> = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  WITHDRAWN: "withdrawn"
};

const userStatusToApi: Record<UserStatus, ApiUserStatus> = {
  active: "ACTIVE",
  suspended: "SUSPENDED",
  withdrawn: "WITHDRAWN"
};

const ticketStatusFromApi: Record<ApiTicketStatus, InquiryStatus> = {
  OPEN: "pending",
  IN_PROGRESS: "progress",
  RESOLVED: "done",
  CLOSED: "done"
};

const ticketStatusToApi: Record<InquiryStatus, ApiTicketStatus> = {
  pending: "OPEN",
  progress: "IN_PROGRESS",
  done: "RESOLVED"
};

const paymentStatusFromApi: Record<ApiPaymentStatus, PaymentStatus> = {
  SUCCESS: "success",
  FAILED: "failed",
  REFUNDED: "refunded",
  CANCELED: "canceled"
};

const planFromApi = (planId: ApiPlanId): Plan => planId;
const planToApi = (plan: Plan): ApiPlanId => plan;

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function formatShortDateTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function bytesToStorage(bytes?: number) {
  if (!bytes) return "0MB";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))}MB`;
}

function relativeTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days === 1) return "어제";
  return `${days}일 전`;
}

function normalizeSessions(sessions: ApiLoginSession[]) {
  const byDevice = new Map<string, ApiLoginSession>();
  for (const session of [...sessions].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))) {
    const key = `${session.device}|${session.ipAddress ?? ""}`;
    if (!byDevice.has(key)) {
      byDevice.set(key, session);
    }
  }
  return [...byDevice.values()].slice(0, 2);
}

function normalizeLocationLabel(value?: string | null) {
  if (!value) return "대한민국 서울";
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmed.replace(/\s+/g, ""))) {
    return "대한민국 서울";
  }
  if (trimmed === "Asia/Seoul") {
    return "대한민국 서울";
  }
  return trimmed;
}

function normalizeDeviceLabel(value?: string | null) {
  if (!value) return "BrainX App / Desktop";
  const trimmed = value.trim();
  if (!trimmed) return "BrainX App / Desktop";

  const normalized = trimmed.toLowerCase();
  if (normalized === "browser / unknown" || normalized === "unknown / unknown") {
    return "BrainX App / Desktop";
  }
  if (normalized.includes("electron")) {
    return "BrainX App / Desktop";
  }
  return trimmed;
}

function buildActivities(row: ApiUserRow | ApiUserDetail) {
  const activities = (row.activities ?? []).map((activity) => ({
    text: activity.message,
    time: formatShortDateTime(activity.occurredAt)
  }));
  if (row.lastLogin?.lastSeenAt) {
    activities.unshift({
      text: "최근 접속",
      time: formatShortDateTime(row.lastLogin.lastSeenAt)
    });
  }
  return activities.slice(0, 5);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const method = init?.method?.toUpperCase() ?? "GET";
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const payload = response.status === 204 ? null : ((await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null);
  const errorMessage =
    payload && "error" in payload && payload.error?.message
      ? payload.error.message
      : payload && "message" in payload && payload.message
        ? payload.message
        : `Admin API ${response.status}: ${path}`;

  if ((response.status === 401 || response.status === 403) && !path.endsWith("/auth/login")) {
    if (method === "GET") {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    throw new Error(errorMessage);
  }

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  if (response.status === 204 || !payload) {
    return undefined as T;
  }

  return (payload as ApiSuccess<T>).data;
}

async function apiFetchOptional<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const payload = response.status === 204 ? null : ((await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null);
  const errorMessage =
    payload && "error" in payload && payload.error?.message
      ? payload.error.message
      : payload && "message" in payload && payload.message
        ? payload.message
        : `Admin API ${response.status}: ${path}`;

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  if (response.status === 204 || !payload) {
    return undefined as T;
  }

  return (payload as ApiSuccess<T>).data;
}

function currentAdminSession() {
  return getSession()?.admin ?? null;
}

function buildFallbackAdminBootstrap(profileOverride?: AdminProfile): AdminBootstrap {
  return {
    ...fallbackAdminBootstrap,
    adminProfile: profileOverride ?? currentAdminSession() ?? fallbackAdminBootstrap.adminProfile
  };
}

async function apiFetchWithFallback<T>(path: string, fallbackValue: T, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("401") || message.includes("403")) {
      throw error;
    }
    return fallbackValue;
  }
}

function currentAdminMessageHeaders(viewer?: AdminMessageViewer) {
  const admin = viewer ?? currentAdminSession();
  const headers: Record<string, string> = {};
  if (!admin) {
    return headers;
  }
  headers["X-Admin-User-Id"] = admin.adminUserId;
  return headers;
}

function buildAdminMessagePath(path: string, viewer?: AdminMessageViewer) {
  const admin = viewer ?? currentAdminSession();
  if (!admin) {
    return path;
  }

  const search = new URLSearchParams({
    viewerAdminId: admin.adminUserId,
    viewerName: admin.name
  });
  return `${path}?${search.toString()}`;
}

function mapUser(row: ApiUserRow): AdminUser {
  const recentActiveAt = row.lastActiveAt ?? row.lastLogin?.lastSeenAt ?? null;
  return {
    id: row.userId,
    name: row.name,
    email: row.email,
    plan: planFromApi(row.planId),
    status: userStatusFromApi[row.status],
    joined: formatDate(row.joinedAt),
    notes: row.noteCount,
    storage: bytesToStorage(row.storageBytes),
    lastActive: recentActiveAt ? formatShortDateTime(recentActiveAt) : "-",
    location: row.lastLogin?.location ?? "-",
    device: normalizeDeviceLabel(row.lastLogin?.device),
    activities: buildActivities(row)
  };
}

function mapSession(session: ApiLoginSession): AdminLoginSession {
  return {
    sessionId: session.sessionId,
    device: normalizeDeviceLabel(session.device),
    location: normalizeLocationLabel(session.location),
    ipAddress: session.ipAddress ?? "127.0.0.1",
    userAgentHash: session.userAgentHash ?? null,
    lastSeenAt: session.lastSeenAt,
    current: session.current
  };
}

function extractUserId(source?: string | null) {
  if (!source) return "";
  const normalized = source.trim();
  if (normalized.startsWith("AuthenticatedUser[userId=") && normalized.endsWith("]")) {
    return normalized.slice("AuthenticatedUser[userId=".length, -1);
  }
  return normalized;
}

function resolveUserLabel(userId: string | undefined, rawName: string | undefined, usersById: Map<string, { name: string }>) {
  const candidates = [userId, rawName ? extractUserId(rawName) : ""].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const user = usersById.get(candidate);
    if (user?.name) return user.name;
  }
  if (rawName && !rawName.includes("AuthenticatedUser[userId=")) {
    return rawName;
  }
  return rawName ?? userId ?? "-";
}

function mapTicket(ticket: ApiTicket): AdminInquiry {
  return {
    id: ticket.ticketId,
    user: ticket.userName ?? ticket.userId ?? "-",
    email: ticket.email ?? "",
    status: ticketStatusFromApi[ticket.status],
    category: ticket.category,
    subject: ticket.subject,
    created: formatShortDateTime(ticket.createdAt),
    agent: ticket.assigneeAdminName ?? "",
    urgent: Boolean(ticket.urgent),
    body: ticket.body ?? "",
    replyContent: ticket.replyContent ?? null,
    repliedAt: ticket.repliedAt ?? null
  };
}

function mapPayment(payment: ApiPayment, usersById: Map<string, { name: string }>): BillingTransaction {
  const user = resolveUserLabel(payment.userId, payment.userName, usersById);
  return {
    id: payment.paymentId,
    user,
    plan: planFromApi(payment.planId),
    amount: payment.amount,
    method: payment.method,
    status: paymentStatusFromApi[payment.status],
    date: formatShortDateTime(payment.paidAt)
  };
}

function mapSubscription(subscription: ApiSubscription, usersById: Map<string, { name: string }>): BillingSubscription {
  const user = resolveUserLabel(subscription.userId, subscription.userName, usersById);
  const inferredCycle =
    subscription.billingCycle === "YEARLY"
      ? "yearly"
      : subscription.billingCycle === "MONTHLY"
        ? "monthly"
        : subscription.nextBillingAt
          ? Math.abs(new Date(subscription.nextBillingAt).getTime() - new Date(subscription.startedAt).getTime()) >= 300 * 24 * 60 * 60 * 1000
            ? "yearly"
            : "monthly"
          : undefined;
  return {
    subscriptionId: subscription.subscriptionId,
    user,
    initial: subscription.initial ?? user.charAt(0),
    plan: planFromApi(subscription.planId),
    started: formatDate(subscription.startedAt),
    next: subscription.nextBillingAt ? formatDate(subscription.nextBillingAt).slice(5) : "-",
    billingCycle: inferredCycle,
    amount: subscription.amount
  };
}

function mapPaymentFailure(failure: ApiPaymentFailure, usersById: Map<string, { name: string }>): FailedBilling {
  const user = resolveUserLabel(failure.userId, failure.userName, usersById);
  return {
    paymentId: failure.paymentId,
    user,
    initial: user.charAt(0),
    plan: failure.planId === "max" ? "Max" : failure.planId === "pro" ? "Pro" : "무료",
    amount: `₩${failure.amount.toLocaleString("ko-KR")}`,
    reason: `${failure.reason} · 재시도 ${failure.retryCount}회`,
    date: formatShortDateTime(failure.failedAt)
  };
}

function mapPlan(plan: ApiPlan): PlanCard {
  return {
    key: planFromApi(plan.planId),
    name: plan.name,
    label: plan.name,
    price: plan.price,
    desc: plan.description ?? ""
  };
}

export async function loadAdminBootstrap(): Promise<AdminBootstrap> {
  const sessionAdmin = currentAdminSession();
  const profileFallback = sessionAdmin ?? fallbackAdminBootstrap.adminProfile;
  const [dashboard, userData, supportData, billingSummary, paymentData, subscriptionData, failureData, planData, monitoringSnapshots, profile] = await Promise.all([
    apiFetchWithFallback<{
      kpis: AdminBootstrap["kpis"];
      services: ReadonlyArray<AdminServiceHealthSummary>;
      logs: typeof logs;
      revenueTrend: AdminTrendSeries;
      activeUserTrend: AdminTrendSeries;
      desktopDownloadTrend: AdminTrendSeries;
      summary: AdminOverviewSummary;
    }>("/api/v1/admin/dashboard/overview", {
      kpis: fallbackAdminBootstrap.kpis,
      services: fallbackAdminBootstrap.services,
      logs: fallbackAdminBootstrap.logs,
      revenueTrend: fallbackAdminBootstrap.revenueTrendMeta,
      activeUserTrend: fallbackAdminBootstrap.activeUserTrendMeta,
      desktopDownloadTrend: fallbackAdminBootstrap.desktopDownloadTrendMeta,
      summary: fallbackAdminBootstrap.overviewSummary
    }),
    apiFetchWithFallback<{ users: ApiUserRow[] }>("/api/v1/admin/users", { users: [] }),
    apiFetchWithFallback<{ tickets: ApiTicket[] }>("/api/v1/admin/support/tickets", { tickets: [] }),
    apiFetchWithFallback<{ monthlyRevenue: number; activeSubscriptions: number; mrr: number; failedPaymentCount: number }>(
      "/api/v1/admin/billing/summary",
      fallbackAdminBootstrap.billingSummary
    ),
    apiFetchWithFallback<{ payments: ApiPayment[] }>("/api/v1/admin/billing/payments", { payments: [] }),
    apiFetchWithFallback<{ subscriptions: ApiSubscription[] }>("/api/v1/admin/billing/subscriptions", { subscriptions: [] }),
    apiFetchWithFallback<{ failures: ApiPaymentFailure[] }>("/api/v1/admin/billing/payment-failures", { failures: [] }),
    apiFetchWithFallback<{ plans: ApiPlan[] }>("/api/v1/admin/billing/plans", { plans: [] }),
    apiFetchWithFallback<AdminMonitoringSnapshot[]>("/api/v1/admin/monitoring/snapshots", []),
    apiFetchWithFallback<AdminProfile>("/api/v1/admin/me", profileFallback)
  ]);

  const usersById = new Map(userData.users.map((user) => [user.userId, { name: user.name }]));

  return {
    ...buildFallbackAdminBootstrap(profile),
    kpis: dashboard.kpis ?? fallbackAdminBootstrap.kpis,
    services: dashboard.services ?? fallbackAdminBootstrap.services,
    logs: dashboard.logs ?? fallbackAdminBootstrap.logs,
    revenueBars: dashboard.revenueTrend?.values ?? fallbackAdminBootstrap.revenueBars,
    activeUserSeries: dashboard.activeUserTrend?.values ?? fallbackAdminBootstrap.activeUserSeries,
    desktopDownloadSeries: dashboard.desktopDownloadTrend?.values ?? fallbackAdminBootstrap.desktopDownloadSeries,
    revenueTrendMeta: dashboard.revenueTrend ?? fallbackAdminBootstrap.revenueTrendMeta,
    activeUserTrendMeta: dashboard.activeUserTrend ?? fallbackAdminBootstrap.activeUserTrendMeta,
    desktopDownloadTrendMeta: dashboard.desktopDownloadTrend ?? fallbackAdminBootstrap.desktopDownloadTrendMeta,
    overviewSummary: dashboard.summary ?? fallbackAdminBootstrap.overviewSummary,
    users: userData.users.map((user) => mapUser(user)),
    inquiries: supportData.tickets.map(mapTicket),
    billingTransactions: paymentData.payments.map((payment) => mapPayment(payment, usersById)),
    billingSubscriptions: subscriptionData.subscriptions.map((subscription) => mapSubscription(subscription, usersById)),
    failedBilling: failureData.failures.map((failure) => mapPaymentFailure(failure, usersById)),
    planCards: planData.plans.length > 0 ? planData.plans.map(mapPlan) : fallbackAdminBootstrap.planCards,
    monitoringSnapshots,
    billingSummary,
    adminProfile: profile, /*
    // Touch summary in the client so the contract shape is exercised even before
    // the KPI text is fully moved out of the presentational component.
    kpis: [
      { label: "이번 달 매출", value: `₩${(billingSummary.monthlyRevenue / 1000000).toFixed(1)}M`, delta: "+12.4%", tone: "good", sub: "Commerce-Service 집계" },
      { label: "활성 구독", value: billingSummary.activeSubscriptions.toLocaleString("ko-KR"), delta: "+3.1%", tone: "good", sub: "현재 유료 구독" },
      { label: "MRR", value: `₩${(billingSummary.mrr / 1000000).toFixed(1)}M`, delta: "+18.4%", tone: "good", sub: "월 반복 매출" },
      { label: "결제 실패", value: billingSummary.failedPaymentCount.toLocaleString("ko-KR"), delta: "-0.3%", tone: "bad", sub: "재시도 필요" }
    ] */
  };
}

export const adminApi = {
  login: (loginId: string, password: string) =>
    apiFetch<AdminSession>("/api/v1/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginId, password })
    }),
  getMe: () => apiFetch<AdminProfile>("/api/v1/admin/me"),
  listAdminAccounts: () => apiFetch<{ admins: AdminAccountRow[] }>("/api/v1/admin/admin-accounts").then((data) => data.admins),
  listAdminMessages: (viewer?: AdminMessageViewer) =>
    apiFetchOptional<AdminMessagesData>(buildAdminMessagePath("/api/v1/admin/messages", viewer), {
      headers: currentAdminMessageHeaders(viewer)
    }),
  sendAdminMessage: (body: { recipientScope: AdminMessageScope; recipientAdminUserIds?: string[]; body: string }, viewer?: AdminMessageViewer) =>
    apiFetchOptional<{ message: AdminMessage; unreadCount: number }>(buildAdminMessagePath("/api/v1/admin/messages", viewer), {
      method: "POST",
      headers: currentAdminMessageHeaders(viewer),
      body: JSON.stringify(body)
    }),
  markAdminMessageRead: (messageId: string, viewer?: AdminMessageViewer) =>
    apiFetchOptional<{ messageId: string; unreadCount: number }>(buildAdminMessagePath("/api/v1/admin/messages/" + messageId + "/read", viewer), {
      method: "POST",
      headers: currentAdminMessageHeaders(viewer)
    }),
  createAdminAccount: (body: { name: string; loginId: string; email?: string | null; role: AdminRole }) =>
    apiFetch<{ admin: AdminAccountRow; temporaryPassword: string }>("/api/v1/admin/admin-accounts", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateAdminAccount: (adminId: string, body: { loginId?: string; name?: string; email?: string | null; role?: AdminRole }) =>
    apiFetch<{ admin: AdminAccountRow }>("/api/v1/admin/admin-accounts/" + adminId, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  deleteAdminAccount: (adminId: string) =>
    apiFetch<void>("/api/v1/admin/admin-accounts/" + adminId, { method: "DELETE" }),
  updateProfile: (body: { name?: string; email?: string }) =>
    apiFetch<AdminProfile>("/api/v1/admin/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<void>("/api/v1/admin/me/password", { method: "PATCH", body: JSON.stringify(body) }),
  changeUserPlan: (userId: string, targetPlanId: Plan) =>
    apiFetch<{ userId: string; planId: Plan }>("/api/v1/admin/users/" + userId + "/plan", {
      method: "PATCH",
      body: JSON.stringify({ targetPlanId: planToApi(targetPlanId) })
    }),
  changeUserStatus: (userId: string, status: UserStatus, options?: { reason?: string; suspendedDays?: number }) =>
    apiFetch<{ userId: string; status: ApiUserStatus }>("/api/v1/admin/users/" + userId + "/status", {
      method: "PATCH",
      body: JSON.stringify({ status: userStatusToApi[status], reason: options?.reason, suspendedDays: options?.suspendedDays })
    }),
  withdrawUser: (userId: string, reason?: string) =>
    apiFetch<{ userId: string; deletionRequestId: string }>("/api/v1/admin/users/" + userId + "/withdrawal", { method: "POST", body: JSON.stringify({ reason }) }),
  runUserBulkAction: (
    userIds: string[],
    action: "CHANGE_PLAN" | "SUSPEND" | "REACTIVATE" | "WITHDRAW" | "SEND_NOTICE",
    options?: { targetPlanId?: Plan; notice?: { title: string; body: string }; reason?: string; suspendedDays?: number }
  ) =>
    apiFetch<{ accepted: number; failed: number }>("/api/v1/admin/users/bulk-actions", {
      method: "POST",
      body: JSON.stringify({
        userIds,
        action,
        targetPlanId: options?.targetPlanId ? planToApi(options.targetPlanId) : undefined,
        notice: options?.notice,
        reason: options?.reason,
        suspendedDays: options?.suspendedDays
      })
    }),
  updateTicket: (ticketId: string, body: { status?: InquiryStatus; assigneeAdminUserId?: string | null }) =>
    apiFetch<{ ticket: ApiTicket }>("/api/v1/admin/support/tickets/" + ticketId, {
      method: "PATCH",
      body: JSON.stringify({ status: body.status ? ticketStatusToApi[body.status] : undefined, assigneeAdminUserId: body.assigneeAdminUserId })
    }),
  replyTicket: (ticketId: string, body: { body: string; faq?: boolean }) =>
    apiFetch<{ replyId: string }>("/api/v1/admin/support/tickets/" + ticketId + "/replies", { method: "POST", body: JSON.stringify(body) }),
  refundPayment: (paymentId: string, body?: { amount?: number; reason?: string }) =>
    apiFetch<{ paymentId: string; status: string }>("/api/v1/admin/billing/payments/" + paymentId + "/refund", {
      method: "POST",
      body: JSON.stringify(body ?? {})
    }),
  retryPayment: (paymentId: string) =>
    apiFetch<{ paymentId: string; status: string }>("/api/v1/admin/billing/payments/" + paymentId + "/retry", { method: "POST" }),
  sendPaymentFailureNotice: (paymentId: string) =>
    apiFetch<{ accepted: number; failed: number }>("/api/v1/admin/users/bulk-actions", {
      method: "POST",
      body: JSON.stringify({ userIds: [paymentId], action: "SEND_NOTICE", notice: { title: "결제 실패 안내", body: "결제 수단을 확인해 주세요." } })
    }),
  updatePlanPrice: (planId: Plan, price: number, applyTiming: "IMMEDIATE" | "NEXT_BILLING") =>
    apiFetch<{ planId: Plan; price: number }>("/api/v1/admin/billing/plans/" + planId, {
      method: "PATCH",
      body: JSON.stringify({ price, currency: "KRW", applyTiming })
    }),
  getMonitoringSnapshots: () => apiFetch<AdminMonitoringSnapshot[]>("/api/v1/admin/monitoring/snapshots"),
  getKafkaLag: () => apiFetch<AdminKafkaLagData>("/api/v1/admin/monitoring/kafka-lag"),
  deleteMonitoringSnapshot: (id: string) =>
    apiFetch<void>("/api/v1/admin/monitoring/snapshots/" + id, { method: "DELETE" }),
  getHealthSnapshots: () => apiFetch<AdminServiceHealthSnapshot[]>("/api/v1/admin/monitoring/health"),
  deleteHealthSnapshot: (id: string) =>
    apiFetch<void>("/api/v1/admin/monitoring/health/" + id, { method: "DELETE" }),
  getUserDetail: (userId: string) =>
    apiFetch<ApiUserDetail>("/api/v1/admin/users/" + userId).then((row) => ({
      ...mapUser(row),
      sessions: normalizeSessions(row.sessions ?? []).map(mapSession),
      activities: buildActivities(row)
    })),
  deleteTicket: (ticketId: string) =>
    apiFetch<void>("/api/v1/admin/support/tickets/" + ticketId, { method: "DELETE" }),
  deletePayment: (paymentId: string) =>
    apiFetch<void>("/api/v1/admin/billing/payments/" + paymentId, { method: "DELETE" }),
  deleteSubscription: (subscriptionId: string) =>
    apiFetch<void>("/api/v1/admin/billing/subscriptions/" + subscriptionId, { method: "DELETE" })
};
