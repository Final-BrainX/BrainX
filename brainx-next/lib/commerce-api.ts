"use client";

import { getPublicApiBaseUrl } from "@/lib/api-base";
import { clearAuthSession, readAuthSession, refreshAuthSessionOnce, type ApiResponse } from "@/lib/auth-api";
import { requestDesktopApiJson } from "@/lib/desktop-api-request";

export const PAYMENT_RESULT_MESSAGE_TYPE = "brainx-payment-result";

export type Plan = {
  planId: string;
  name: string;
  price: number;
  currency: string;
  features: string[];
  entitlements: Record<string, unknown>;
};

export type SubscriptionStatus = "FREE" | "ACTIVE" | "PAST_DUE" | "CANCEL_SCHEDULED" | "CANCELLED" | string;

export type Subscription = {
  plan: { planId: string; name: string };
  status: SubscriptionStatus;
  renewalAt: string | null;
  entitlements: Record<string, unknown>;
};

export type CheckoutSession = {
  checkoutSessionId: string;
  provider: "toss" | "stripe";
  checkoutUrl: string | null;
  clientKey: string | null;
  orderId: string | null;
  orderName: string | null;
  amount: number | null;
  currency: string | null;
};

export type BillingCycle = "MONTHLY" | "YEARLY";

export type CheckoutConfirmResult = {
  checkoutSessionId: string;
  paymentId: string;
  status: "SUCCEEDED" | "FAILED";
  planId: string;
  subscriptionStatus: SubscriptionStatus;
};

export type TokenUsageFeatureUsage = { feature: string; credits: number };
export type TokenUsageDailyUsage = { date: string; credits: number };

export type TokenUsageData = {
  planName: string | null;
  monthlyCreditLimit: number | null;
  usedCredits: number;
  usagePercent: number;
  resetDate: string;
  byFeature: TokenUsageFeatureUsage[];
  recentDays: TokenUsageDailyUsage[];
};

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedRequest<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const session = readAuthSession();
  const requestInit: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  };
  const desktopResponse = await requestDesktopApiJson<ApiResponse<T>>(path, requestInit);
  const response = desktopResponse
    ? { ok: desktopResponse.ok, status: desktopResponse.status }
    : await fetch(`${getPublicApiBaseUrl()}${path}`, requestInit);
  const payload = desktopResponse
    ? desktopResponse.payload
    : ((await (response as Response).json().catch(() => null)) as ApiResponse<T> | null);
  if (response.status === 401 || response.status === 403) {
    // 액세스 토큰이 만료된 흔한 정상 케이스도 여기 걸리므로, 바로 로그아웃시키기 전에
    // refreshToken으로 한 번 갱신을 시도하고 새 토큰으로 같은 요청을 한 번만 재시도한다
    // (retried 플래그로 재귀를 1회로 제한해 갱신도 실패하는 경우 무한 루프를 막는다).
    if (!retried && session?.refreshToken && (await refreshAuthSessionOnce())) {
      return authedRequest<T>(path, init, true);
    }
    clearAuthSession();
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

export async function getPlans() {
  const data = await authedRequest<{ plans: Plan[] }>("/api/v1/plans");
  return data.plans;
}

export async function getMySubscription() {
  return authedRequest<Subscription>("/api/v1/users/me/subscription");
}

export async function createCheckoutSession(planId: string, billingCycle: BillingCycle, successUrl: string, cancelUrl: string) {
  return authedRequest<CheckoutSession>("/api/v1/subscriptions/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({ planId, billingCycle, successUrl, cancelUrl })
  });
}

export async function confirmCheckoutSession(checkoutSessionId: string, paymentKey: string, orderId: string, amount: number) {
  return authedRequest<CheckoutConfirmResult>(`/api/v1/subscriptions/checkout-sessions/${checkoutSessionId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
}

export async function cancelSubscription(cancelAtPeriodEnd: boolean) {
  return authedRequest<{ planId: string; status: string; cancelAt: string | null }>("/api/v1/subscriptions/cancel", {
    method: "POST",
    body: JSON.stringify({ cancelAtPeriodEnd })
  });
}

export async function getMyTokenUsage(month?: string) {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return authedRequest<TokenUsageData>(`/api/v1/users/me/token-usage${query}`);
}

export type AiUsageData = {
  actorType: "USER" | "GUEST";
  usedCount: number;
  limit: number | null;
  remaining: number | null;
  usagePercent: number | null;
};

// 로그인 세션이 없어도(게스트) 호출한다 — Gateway가 세팅하는 브라우저 쿠키(brainx_guest_id)로
// 게스트를 식별하므로 credentials를 명시적으로 실어 보내야 한다.
export async function getAiUsage() {
  return authedRequest<AiUsageData>("/api/v1/ai/usage", { credentials: "include" });
}
