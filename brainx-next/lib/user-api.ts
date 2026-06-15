"use client";

import { readAuthSession, saveAuthSession, type ApiResponse } from "@/lib/auth-api";

export type MyProfile = {
  userId: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  role: string;
  security: {
    twoFactorEnabled: boolean;
    linkedProviders: string[];
  };
  consents: {
    termsRequired: boolean;
    privacyRequired: boolean;
    marketingOptional: boolean;
    behaviorAnalyticsOptional: boolean;
    updatedAt: string | null;
  };
};

export type ConsentPayload = {
  termsRequired: boolean;
  privacyRequired: boolean;
  marketingOptional: boolean;
  behaviorAnalyticsOptional: boolean;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedRequest<T>(path: string, init?: RequestInit) {
  const session = readAuthSession();
  if (!session?.accessToken) {
    throw new Error("로그인이 필요합니다.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

export async function getMyProfile() {
  return authedRequest<MyProfile>("/api/v1/users/me");
}

export async function updateMyProfile(payload: { nickname: string; profileImageAssetId?: string | null }) {
  const data = await authedRequest<{ userId: string; nickname: string; profileImageUrl: string | null }>("/api/v1/users/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  saveAuthSession({ ...(readAuthSession() ?? {}), nickname: data.nickname, profileImageUrl: data.profileImageUrl });
  return data;
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}) {
  return authedRequest<null>("/api/v1/users/me/password", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function configureEmail2fa(enabled: boolean) {
  return authedRequest<{ verificationId: string }>("/api/v1/users/me/2fa/email", {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
}

export async function linkSocialAccount(provider: string, oauthCode: string) {
  return authedRequest<{ provider: string; linked: boolean }>("/api/v1/users/me/social-accounts", {
    method: "POST",
    body: JSON.stringify({ provider, oauthCode })
  });
}

export async function unlinkSocialAccount(provider: string) {
  return authedRequest<{ provider: string; linked: boolean }>(`/api/v1/users/me/social-accounts/${provider}`, {
    method: "DELETE"
  });
}

export async function updateMyConsents(payload: ConsentPayload) {
  return authedRequest<ConsentPayload & { updatedAt: string }>("/api/v1/users/me/consents", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function requestAccountDeletion(reason: string) {
  return authedRequest<{ deletionScheduledAt: string }>("/api/v1/users/me/deletion-request", {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function cancelAccountDeletion() {
  return authedRequest<null>("/api/v1/users/me/deletion-request", {
    method: "DELETE"
  });
}
