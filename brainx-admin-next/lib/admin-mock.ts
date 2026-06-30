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
  type AdminUser,
  type BillingSubscription,
  type BillingTransaction,
  type AdminProfile,
  type AdminRole,
  type InquiryStatus,
  type PaymentStatus,
  type Plan,
  type UserStatus
} from "@/lib/admin-data";

const now = "2026-06-25T09:14:00+09:00";

type MockAdminAccount = {
  adminId: string;
  name: string;
  loginId: string;
  email: string | null;
  password: string;
  role: AdminRole;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type MockAdminMessage = {
  messageId: string;
  senderAdminUserId: string;
  senderName: string;
  recipientScope: "ALL" | "SELECTED";
  recipientAdminUserIds: string[];
  body: string;
  sentAt: string;
  readByAdminUserIds: string[];
};

const mockUsers: AdminUser[] = users.map((user) => ({ ...user, activities: [...user.activities] }));
const mockInquiries: AdminInquiry[] = inquiries.map((ticket) => ({ ...ticket }));
const mockBillingTransactions: BillingTransaction[] = billingTransactions.map((payment) => ({ ...payment }));
const mockBillingSubscriptions: BillingSubscription[] = billingSubscriptions.map((subscription) => ({ ...subscription }));

const mockAdminAccounts: MockAdminAccount[] = [
  { adminId: "adm_001", name: adminProfile.name, loginId: "admin", email: adminProfile.email, password: "admin1234", role: "owner", mustChangePassword: false, createdAt: adminProfile.createdAt, lastLoginAt: adminProfile.lastLoginAt },
  { adminId: "adm_002", name: "운영 관리자", loginId: "ops_admin", email: "ops@brainx.io", password: "admin1234", role: "admin", mustChangePassword: false, createdAt: "2024-02-12T09:00:00+09:00", lastLoginAt: "2026-06-25T08:52:00+09:00" },
  { adminId: "adm_003", name: "문의 담당", loginId: "support_admin", email: "support@brainx.io", password: "admin1234", role: "support", mustChangePassword: false, createdAt: "2024-05-07T09:00:00+09:00", lastLoginAt: "2026-06-25T08:44:00+09:00" }
];

const currentAdminProfile: AdminProfile = { ...adminProfile };
const mockAdminMessages: MockAdminMessage[] = [
  {
    messageId: "adm_msg_001",
    senderAdminUserId: "adm_002",
    senderName: "운영 관리자",
    recipientScope: "ALL",
    recipientAdminUserIds: [],
    body: "09:30 배포 이후 Kafka lag를 같이 확인해 주세요.",
    sentAt: "2026-06-25T09:32:00+09:00",
    readByAdminUserIds: ["adm_002"]
  },
  {
    messageId: "adm_msg_002",
    senderAdminUserId: "adm_003",
    senderName: "문의 담당",
    recipientScope: "SELECTED",
    recipientAdminUserIds: ["adm_001"],
    body: "결제 장애 문의가 늘어서 결제 로그를 우선 봐주시면 좋겠습니다.",
    sentAt: "2026-06-25T09:41:00+09:00",
    readByAdminUserIds: ["adm_003"]
  }
];

function apiAdminAccount(account: MockAdminAccount) {
  return {
    adminId: account.adminId,
    name: account.name,
    loginId: account.loginId,
    email: account.email,
    role: account.role,
    mustChangePassword: account.mustChangePassword,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt
  };
}

function resolveCurrentAdminAccount(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const adminId = token.startsWith("mock-token-") ? token.slice("mock-token-".length) : "";
  return mockAdminAccounts.find((account) => account.adminId === adminId) ?? mockAdminAccounts[0];
}

function apiAdminProfile(account: MockAdminAccount): AdminProfile {
  return {
    ...currentAdminProfile,
    adminUserId: account.adminId,
    name: account.name,
    email: account.email,
    role: account.role,
    mustChangePassword: account.mustChangePassword,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt
  };
}

function visibleToAdmin(message: MockAdminMessage, adminId: string) {
  return message.senderAdminUserId === adminId || message.recipientScope === "ALL" || message.recipientAdminUserIds.includes(adminId);
}

function apiAdminMessagesFor(account: MockAdminAccount) {
  const messages = mockAdminMessages
    .filter((message) => visibleToAdmin(message, account.adminId))
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
    .map((message) => ({
      messageId: message.messageId,
      senderAdminUserId: message.senderAdminUserId,
      senderName: message.senderName,
      recipientScope: message.recipientScope,
      recipientAdminUserIds: message.recipientAdminUserIds,
      body: message.body,
      sentAt: message.sentAt,
      isRead: message.senderAdminUserId === account.adminId || message.readByAdminUserIds.includes(account.adminId)
    }));

  return {
    messages,
    unreadCount: messages.filter((message) => !message.isRead).length
  };
}

function generateMockPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const planToApi = (plan: Plan) => plan;
const userStatusToApi: Record<UserStatus, "ACTIVE" | "SUSPENDED" | "WITHDRAWN"> = {
  active: "ACTIVE",
  suspended: "SUSPENDED",
  withdrawn: "WITHDRAWN"
};
const ticketStatusToApi: Record<InquiryStatus, "OPEN" | "IN_PROGRESS" | "RESOLVED"> = {
  pending: "OPEN",
  progress: "IN_PROGRESS",
  done: "RESOLVED"
};
const paymentStatusToApi: Record<PaymentStatus, "SUCCESS" | "FAILED" | "REFUNDED" | "CANCELED"> = {
  success: "SUCCESS",
  failed: "FAILED",
  refunded: "REFUNDED",
  canceled: "CANCELED"
};

function json(data: unknown, status = 200) {
  return Response.json({ success: true, data, message: "요청이 성공적으로 처리되었습니다." }, { status });
}

function noContent() {
  return new Response(null, { status: 204 });
}

function dateTimeFromShort(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00+09:00`;
  if (/^\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return `2026-${value.replace(" ", "T")}:00+09:00`;
  return now;
}

function storageToBytes(value: string) {
  if (value.endsWith("GB")) return Math.round(Number(value.replace("GB", "")) * 1024 * 1024 * 1024);
  if (value.endsWith("MB")) return Math.round(Number(value.replace("MB", "")) * 1024 * 1024);
  return 0;
}

function lastActiveToDateTime(value: string) {
  if (value === "방금") return now;
  if (value.includes("분")) return "2026-06-25T09:09:00+09:00";
  if (value.includes("시간")) return "2026-06-25T08:14:00+09:00";
  if (value === "어제") return "2026-06-24T14:00:00+09:00";
  if (value.includes("일")) return "2026-06-22T14:00:00+09:00";
  return null;
}

function apiUser(user: typeof mockUsers[number]) {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    planId: planToApi(user.plan),
    status: userStatusToApi[user.status],
    noteCount: user.notes,
    storageBytes: storageToBytes(user.storage),
    joinedAt: dateTimeFromShort(user.joined),
    lastActiveAt: lastActiveToDateTime(user.lastActive),
    lastLogin: {
      sessionId: `${user.id}-session-current`,
      device: user.device,
      location: user.location,
      ipAddress: "121.168.32.104",
      userAgentHash: "mock-user-agent-hash",
      lastSeenAt: lastActiveToDateTime(user.lastActive) ?? now,
      current: user.status === "active"
    },
    sessions: [
      {
        sessionId: `${user.id}-session-current`,
        device: user.device,
        location: user.location,
        ipAddress: "121.168.32.104",
        userAgentHash: "mock-user-agent-hash",
        lastSeenAt: lastActiveToDateTime(user.lastActive) ?? now,
        current: user.status === "active"
      },
      {
        sessionId: `${user.id}-session-previous`,
        device: user.device,
        location: user.location,
        ipAddress: "211.45.18.72",
        userAgentHash: "mock-user-agent-hash-prev",
        lastSeenAt: now,
        current: false
      }
    ],
    activities: user.activities.map((activity, index) => ({
      activityId: `${user.id}-activity-${index}`,
      type: "USER_ACTIVITY",
      message: activity.text,
      occurredAt: lastActiveToDateTime(activity.time) ?? now
    }))
  };
}

function apiTicket(ticket: typeof mockInquiries[number]) {
  return {
    ticketId: ticket.id,
    userId: mockUsers.find((user) => user.email === ticket.email)?.id ?? ticket.email,
    userName: ticket.user,
    email: ticket.email,
    status: ticketStatusToApi[ticket.status],
    category: ticket.category,
    subject: ticket.subject,
    createdAt: dateTimeFromShort(ticket.created),
    assigneeAdminUserId: ticket.agent ? "adm_001" : null,
    assigneeAdminName: ticket.agent || null,
    urgent: ticket.urgent,
    body: ticket.body,
    replyContent: ticket.replyContent ?? null,
    repliedAt: ticket.repliedAt ? dateTimeFromShort(ticket.repliedAt) : null
  };
}

function apiPayment(payment: typeof mockBillingTransactions[number]) {
  return {
    paymentId: payment.id,
    transactionId: payment.id,
    userId: mockUsers.find((user) => user.name === payment.user)?.id ?? payment.user,
    userName: payment.user,
    planId: planToApi(payment.plan),
    amount: payment.amount,
    currency: "KRW",
    method: payment.method,
    status: paymentStatusToApi[payment.status],
    paidAt: dateTimeFromShort(payment.date)
  };
}

function apiSubscription(subscription: typeof mockBillingSubscriptions[number]) {
  return {
    subscriptionId: subscription.subscriptionId,
    userId: mockUsers.find((user) => user.name === subscription.user)?.id ?? subscription.user,
    userName: subscription.user,
    initial: subscription.initial,
    planId: planToApi(subscription.plan),
    startedAt: dateTimeFromShort(subscription.started),
    nextBillingAt: `2026-${subscription.next}T09:00:00+09:00`,
    billingCycle: subscription.billingCycle === "yearly" ? "YEARLY" : "MONTHLY",
    amount: subscription.amount,
    currency: "KRW"
  };
}

function apiFailure(failure: typeof failedBilling[number]) {
  const planId = failure.plan === "Max" ? "max" : failure.plan === "Pro" ? "pro" : "free";
  return {
    paymentId: failure.paymentId,
    userId: mockUsers.find((user) => user.name === failure.user)?.id ?? failure.user,
    userName: failure.user,
    planId,
    amount: Number(failure.amount.replace(/[^0-9]/g, "")),
    currency: "KRW",
    reason: failure.reason.split("·")[0].trim(),
    retryCount: Number(failure.reason.match(/(\d+)회/)?.[1] ?? 0),
    failedAt: dateTimeFromShort(failure.date)
  };
}

function apiPlan(plan: typeof planCards[number]) {
  return {
    planId: plan.key,
    name: plan.name,
    price: plan.price,
    currency: "KRW",
    description: plan.desc,
    effectiveAt: null
  };
}

export async function handleAdminMockRequest(request: Request, segments: string[]) {
  const method = request.method;
  const path = segments.join("/");
  const currentAccount = resolveCurrentAdminAccount(request);

  if (method === "GET" && path === "dashboard/overview") {
    const activeUsers = traffic[traffic.length - 1] ?? 0;
    const monthlyRevenue = 184200000;
    const activeSubscriptions = 1026;
    const mrr = 28400000;
    const failedPaymentCount = mockBillingTransactions.filter((item) => item.status === "failed").length;
    const totalNotes = mockUsers.reduce((sum, user) => sum + user.notes, 0);
    const totalStorageBytes = 18 * 1024 * 1024 * 1024;
    const notesCreatedToday = 27;
    return json({
      kpis,
      services,
      logs,
      revenueTrend: {
        metric: "monthlyRevenue",
        values: revenueBars,
        periodLabel: "최근 14일 일별 매출",
        pointCount: revenueBars.length,
        timezone: "Asia/Seoul",
        source: "mock"
      },
      activeUserTrend: {
        metric: "dailyActiveUsers",
        values: traffic,
        periodLabel: "최근 14일 일별 활성 사용자",
        pointCount: traffic.length,
        timezone: "Asia/Seoul",
        source: "mock"
      },
      summary: {
        monthlyRevenue,
        activeSubscriptions,
        mrr,
        failedPaymentCount,
        activeUsers,
        totalNotes,
        totalStorageBytes,
        notesCreatedToday,
        timezone: "Asia/Seoul",
        revenueSource: "mock",
        userSource: "mock",
        workspaceSource: "mock"
      }
    });
  }

  if (method === "GET" && path === "monitoring/snapshots") {
    return json([
      {
        snapshotId: "ams_mock0001",
        monthlyRevenue: 184200000,
        activeSubscriptions: 1026,
        mrr: 28400000,
        failedPaymentCount: mockBillingTransactions.filter((item) => item.status === "failed").length,
        activeUsers: traffic[traffic.length - 1] ?? 0,
        kafkaLagMessages: 1842,
        kafkaConsumerGroupId: "intelligence-service",
        kafkaLagState: "HEALTHY",
        kafkaLagDetail: "현재 lag 1842 msgs",
        capturedAt: now
      }
    ]);
  }

  if (method === "GET" && path === "monitoring/kafka-lag") {
    return json({
      consumerGroupId: "intelligence-service",
      kafkaLagState: "HEALTHY",
      kafkaLagMessages: 1842,
      warningThreshold: 1000,
      criticalThreshold: 5000,
      kafkaLagDetail: "현재 lag 1842 msgs",
      capturedAt: now
    });
  }

  if (method === "DELETE" && segments[0] === "monitoring" && segments[1] === "snapshots" && segments[2]) {
    return noContent();
  }

  if (method === "GET" && path === "monitoring/health") {
    return json(
      services.map((service, index) => ({
        healthSnapshotId: `ash_mock${index}`,
        serviceName: service.name,
        state: service.state,
        latencyMs: Number(service.latency.replace(/[^0-9]/g, "")) || 0,
        uptimePercent: Number(service.uptime.replace("%", "")) || 0,
        capturedAt: now
      }))
    );
  }

  if (method === "DELETE" && segments[0] === "monitoring" && segments[1] === "health" && segments[2]) {
    return noContent();
  }

  if (method === "GET" && path === "users") {
    return json({
      users: mockUsers.map(apiUser),
      pagination: { page: 0, size: mockUsers.length, totalItems: mockUsers.length, totalPages: 1 },
      resultCount: mockUsers.length
    });
  }

  if (method === "GET" && segments[0] === "users" && segments[1]) {
    const user = mockUsers.find((item) => item.id === segments[1]);
    if (!user) return Response.json({ error: { code: "NOT_FOUND", message: "사용자를 찾을 수 없습니다." } }, { status: 404 });
    return json(apiUser(user));
  }

  if (method === "PATCH" && segments[0] === "users" && segments[2] === "plan") {
    const body = await request.json().catch(() => ({ targetPlanId: "free" }));
    const user = mockUsers.find((item) => item.id === segments[1]);
    if (user) user.plan = body.targetPlanId;
    return json({ userId: segments[1], planId: body.targetPlanId, changedAt: now });
  }

  if (method === "PATCH" && segments[0] === "users" && segments[2] === "status") {
    const body = await request.json().catch(() => ({ status: "ACTIVE" }));
    const user = mockUsers.find((item) => item.id === segments[1]);
    if (user) {
      user.status = body.status === "SUSPENDED" ? "suspended" : body.status === "WITHDRAWN" ? "withdrawn" : "active";
    }
    return json({ userId: segments[1], status: body.status, changedAt: now });
  }

  if (method === "POST" && segments[0] === "users" && segments[2] === "withdrawal") {
    return json({ userId: segments[1], deletionRequestId: `DEL-${segments[1]}`, status: "REQUESTED" }, 202);
  }

  if (method === "POST" && path === "users/bulk-actions") {
    const body = await request.json().catch(() => ({ userIds: [] }));
    return json({ accepted: body.userIds?.length ?? 0, failed: 0, jobId: `JOB-${Date.now()}` }, 202);
  }

  if (method === "GET" && path === "support/tickets") {
    return json({ tickets: mockInquiries.map(apiTicket) });
  }

  if (segments[0] === "support" && segments[1] === "tickets" && segments[2]) {
    const ticket = mockInquiries.find((item) => item.id === segments[2]);
    if (method === "GET") return json({ ticket: ticket ? apiTicket(ticket) : null });
    if (method === "PATCH") {
      const body = await request.json().catch(() => ({} as { status?: "OPEN" | "IN_PROGRESS" | "RESOLVED"; assigneeAdminUserId?: string | null }));
      if (ticket) {
        if (body.status) ticket.status = body.status === "IN_PROGRESS" ? "progress" : body.status === "RESOLVED" ? "done" : "pending";
        ticket.agent = body.assigneeAdminUserId ? currentAccount.name : "";
      }
      return json({ ticket: ticket ? apiTicket(ticket) : null });
    }
    if (method === "POST" && segments[3] === "replies") {
      const body = await request.json().catch(() => ({ body: "" }));
      if (ticket) {
        ticket.status = "done";
        ticket.agent = currentAccount.name;
        ticket.replyContent = body.body;
        ticket.repliedAt = "2026-06-29 21:46";
      }
      return json({ replyId: `RPL-${Date.now()}`, ticketId: segments[2] }, 201);
    }
    if (method === "DELETE") {
      return noContent();
    }
  }

  if (method === "GET" && path === "billing/summary") {
    return json({
      monthlyRevenue: 184200000,
      activeSubscriptions: mockBillingSubscriptions.length,
      mrr: 28400000,
      failedPaymentCount: mockBillingTransactions.filter((item) => item.status === "failed").length
    });
  }

  if (method === "GET" && path === "billing/payments") {
    return json({ payments: mockBillingTransactions.map(apiPayment), pagination: { page: 0, size: mockBillingTransactions.length, totalItems: mockBillingTransactions.length, totalPages: 1 } });
  }

  if (method === "POST" && segments[0] === "billing" && segments[1] === "payments" && segments[3] === "refund") {
    const payment = mockBillingTransactions.find((item) => item.id === segments[2]);
    if (payment) {
      payment.status = "refunded";
      const user = mockUsers.find((item) => item.name === payment.user);
      if (user) {
        user.plan = "free";
        user.activities.unshift({ text: "관리자 환불 처리 · 무료 플랜 전환", time: "방금" });
      }
      const subscriptionIndex = mockBillingSubscriptions.findIndex((item) => item.user === payment.user);
      if (subscriptionIndex >= 0) mockBillingSubscriptions.splice(subscriptionIndex, 1);
    }
    return json({ paymentId: segments[2], status: "REFUND_REQUESTED", acceptedAt: now }, 202);
  }

  if (method === "POST" && segments[0] === "billing" && segments[1] === "payments" && segments[3] === "retry") {
    return json({ paymentId: segments[2], status: "RETRY_REQUESTED", acceptedAt: now }, 202);
  }

  if (method === "DELETE" && segments[0] === "billing" && segments[1] === "payments" && segments[2]) {
    return noContent();
  }

  if (method === "GET" && path === "billing/subscriptions") {
    return json({ subscriptions: mockBillingSubscriptions.map(apiSubscription) });
  }

  if (method === "DELETE" && segments[0] === "billing" && segments[1] === "subscriptions" && segments[2]) {
    return noContent();
  }

  if (method === "GET" && path === "billing/payment-failures") {
    return json({ failures: failedBilling.map(apiFailure) });
  }

  if (method === "GET" && path === "billing/plans") {
    return json({ plans: planCards.map(apiPlan) });
  }

  if (method === "PATCH" && segments[0] === "billing" && segments[1] === "plans" && segments[2]) {
    const body = await request.json().catch(() => ({ price: 0, applyTiming: "IMMEDIATE" }));
    const plan = planCards.find((item) => item.key === segments[2]);
    return json({ ...(plan ? apiPlan(plan) : { planId: segments[2], name: segments[2], currency: "KRW" }), price: body.price, effectiveAt: now });
  }

  if (method === "POST" && path === "auth/login") {
    const body = await request.json().catch(() => ({ loginId: "", password: "" }));
    const account = mockAdminAccounts.find((item) => item.loginId === body.loginId && item.password === body.password);
    if (!account) {
      return Response.json({ error: { code: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 일치하지 않습니다." } }, { status: 401 });
    }
    account.lastLoginAt = now;
    return json({
      accessToken: `mock-token-${account.adminId}`,
      admin: apiAdminProfile(account)
    });
  }

  if (method === "GET" && path === "admin-accounts") {
    return json({ admins: mockAdminAccounts.map(apiAdminAccount) });
  }

  if (method === "GET" && path === "messages") {
    return json(apiAdminMessagesFor(currentAccount));
  }

  if (method === "POST" && path === "messages") {
    const body = await request.json().catch(() => ({ recipientScope: "ALL", recipientAdminUserIds: [], body: "" }));
    const recipientScope = body.recipientScope === "SELECTED" ? "SELECTED" : "ALL";
    const recipientAdminUserIds: string[] =
      recipientScope === "SELECTED"
        ? ([...new Set(Array.isArray(body.recipientAdminUserIds) ? body.recipientAdminUserIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0) : [])] as string[])
        : [];

    if (!String(body.body ?? "").trim()) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "메시지 내용을 입력해 주세요." } }, { status: 400 });
    }

    if (recipientScope === "SELECTED" && recipientAdminUserIds.length === 0) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "선택 발송 대상을 하나 이상 고르세요." } }, { status: 400 });
    }

    const nextMessage: MockAdminMessage = {
      messageId: `adm_msg_${Date.now()}`,
      senderAdminUserId: currentAccount.adminId,
      senderName: currentAccount.name,
      recipientScope,
      recipientAdminUserIds,
      body: String(body.body).trim(),
      sentAt: new Date().toISOString(),
      readByAdminUserIds: [currentAccount.adminId]
    };
    mockAdminMessages.push(nextMessage);
    const messageData = apiAdminMessagesFor(currentAccount);
    return json({ message: messageData.messages.find((message) => message.messageId === nextMessage.messageId), unreadCount: messageData.unreadCount }, 201);
  }

  if (method === "POST" && segments[0] === "messages" && segments[1] && segments[2] === "read") {
    const message = mockAdminMessages.find((item) => item.messageId === segments[1]);
    if (!message) {
      return Response.json({ error: { code: "NOT_FOUND", message: "메시지를 찾을 수 없습니다." } }, { status: 404 });
    }
    if (!message.readByAdminUserIds.includes(currentAccount.adminId)) {
      message.readByAdminUserIds.push(currentAccount.adminId);
    }
    return json({ messageId: message.messageId, unreadCount: apiAdminMessagesFor(currentAccount).unreadCount });
  }

  if (method === "POST" && path === "admin-accounts") {
    const body = await request.json().catch(() => ({ name: "", loginId: "", role: "admin" }));
    if (mockAdminAccounts.some((item) => item.loginId === body.loginId)) {
      return Response.json({ error: { code: "CONFLICT", message: "이미 사용 중인 아이디입니다." } }, { status: 409 });
    }
    const temporaryPassword = generateMockPassword();
    const account: MockAdminAccount = {
      adminId: `adm_${Date.now()}`,
      name: body.name,
      loginId: body.loginId,
      email: body.email ?? null,
      password: temporaryPassword,
      role: body.role,
      mustChangePassword: true,
      createdAt: now,
      lastLoginAt: null
    };
    mockAdminAccounts.push(account);
    return json({ admin: apiAdminAccount(account), temporaryPassword }, 201);
  }

  if (method === "DELETE" && segments[0] === "admin-accounts" && segments[1]) {
    const index = mockAdminAccounts.findIndex((item) => item.adminId === segments[1]);
    if (index >= 0) {
      mockAdminAccounts.splice(index, 1);
    }
    return noContent();
  }

  if (method === "PATCH" && segments[0] === "admin-accounts" && segments[1]) {
    const account = mockAdminAccounts.find((item) => item.adminId === segments[1]);
    if (!account) {
      return Response.json({ error: { code: "NOT_FOUND", message: "관리자 계정을 찾을 수 없습니다." } }, { status: 404 });
    }
    const body = await request.json().catch(() => ({} as { loginId?: string; name?: string; email?: string | null; role?: AdminRole }));
    if (body.loginId && mockAdminAccounts.some((item) => item.loginId === body.loginId && item.adminId !== account.adminId)) {
      return Response.json({ error: { code: "CONFLICT", message: "이미 사용 중인 아이디입니다." } }, { status: 409 });
    }
    if (typeof body.loginId === "string") account.loginId = body.loginId;
    if (typeof body.name === "string") account.name = body.name;
    if (typeof body.email === "string" || body.email === null) account.email = body.email;
    if (body.role) account.role = body.role;
    if (account.adminId === currentAdminProfile.adminUserId) {
      currentAdminProfile.name = account.name;
      currentAdminProfile.role = account.role;
      currentAdminProfile.mustChangePassword = account.mustChangePassword;
    }
    return json({ admin: apiAdminAccount(account) });
  }

  if (method === "GET" && path === "me") {
    return json(apiAdminProfile(currentAccount));
  }

  if (method === "PATCH" && path === "me/profile") {
    const body = await request.json().catch(() => ({} as { name?: string; email?: string | null }));
    if (typeof body.name === "string") {
      currentAccount.name = body.name;
    }
    if (typeof body.email === "string" || body.email === null) {
      currentAccount.email = body.email;
    }
    return json(apiAdminProfile(currentAccount));
  }

  if (method === "PATCH" && path === "me/password") {
    return noContent();
  }

  return Response.json({ error: { code: "NOT_FOUND", message: `Mock admin route not found: ${method} ${path}` } }, { status: 404 });
}
