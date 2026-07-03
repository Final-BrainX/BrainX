"use client";

import { clearAuthSession, isDevAuthSession, readAuthSession, saveAuthSession, type ApiResponse } from "@/lib/auth-api";
import type { ThemeMode } from "@/components/brainx-provider";
import type { LanguageCode } from "@/lib/i18n";

export type MyProfile = {
  userId: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  language: LanguageCode;
  theme: ThemeMode;
  role: string;
  security: {
    twoFactorEnabled: boolean;
    linkedProviders: string[];
    hasPassword?: boolean;
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

export type MyNotification = {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  sentByAdminName: string | null;
  read: boolean;
  createdAt: string;
  readAt: string | null;
};

export type MyNotificationsResponse = {
  notifications: MyNotification[];
  unreadCount: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const LANGUAGE_KEY = "brainx_language_v1";
const THEME_KEY = "brainx_theme_v1";
const USE_MOCK_USER_API = process.env.NEXT_PUBLIC_USER_USE_MOCK === "true";

export class AuthRequiredError extends Error {
  constructor(message = "로그인이 만료되었습니다. 다시 로그인해 주세요.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

function readStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "ko";
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
}

async function authedRequest<T>(path: string, init?: RequestInit) {
  if (USE_MOCK_USER_API) {
    return demoUserResponse<T>(path, init);
  }

  const session = readAuthSession();
  // 개발용 DEV_AUTH_BYPASS 세션은 accessToken이 있어도 실제 백엔드가 인정하는 토큰이 아니다.
  // 이걸 그대로 보내면 항상 401 → clearAuthSession() → (bypass라 세션이 즉시 재생성됨) →
  // brainx-auth-session-changed 재발생 → 재요청 → 401 … 무한 루프가 된다. workspace-api.ts /
  // graph-api.ts는 이미 isDevAuthSession을 확인해 이 경로를 피하고 있어 여기도 동일하게 맞춘다.
  if (!session?.accessToken || isDevAuthSession(session)) {
    throw new AuthRequiredError("로그인이 필요합니다.");
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
  if (response.status === 401 || response.status === 403) {
    clearAuthSession();
    throw new AuthRequiredError();
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

function parseBody<T>(init?: RequestInit): Partial<T> {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Partial<T>;
  } catch {
    return {};
  }
}

function demoProfile(): MyProfile {
  const session = readAuthSession();
  return {
    userId: session?.userId ?? "usr_demo",
    email: session?.email ?? "demo@brainx.local",
    nickname: session?.nickname ?? "BrainX Demo",
    profileImageUrl: session?.profileImageUrl ?? null,
    language: readStoredLanguage(),
    theme: readStoredTheme(),
    role: session?.role ?? "ROLE_USER",
    security: {
      twoFactorEnabled: false,
      linkedProviders: ["google"],
      hasPassword: true
    },
    consents: {
      termsRequired: true,
      privacyRequired: true,
      marketingOptional: true,
      behaviorAnalyticsOptional: true,
      updatedAt: new Date().toISOString()
    }
  };
}

function demoUserResponse<T>(path: string, init?: RequestInit): T {
  const method = init?.method?.toUpperCase() ?? "GET";

  if (path === "/api/v1/users/me" && method === "GET") {
    return demoProfile() as T;
  }

  if (path === "/api/v1/users/me/profile" && method === "PATCH") {
    const payload = parseBody<{ nickname?: string; language?: LanguageCode; theme?: ThemeMode }>(init);
    const current = demoProfile();
    const updated = {
      userId: current.userId,
      nickname: payload.nickname ?? current.nickname,
      profileImageUrl: current.profileImageUrl,
      language: payload.language ?? current.language,
      theme: payload.theme ?? current.theme
    };
    saveAuthSession({ ...(readAuthSession() ?? {}), nickname: updated.nickname, profileImageUrl: updated.profileImageUrl });
    return updated as T;
  }

  if (path === "/api/v1/users/me/password" && method === "PATCH") {
    return null as T;
  }

  if (path === "/api/v1/users/me/2fa/email" && method === "POST") {
    return { verificationId: "demo-verification" } as T;
  }

  if (path === "/api/v1/users/me/social-accounts" && method === "POST") {
    const payload = parseBody<{ provider?: string }>(init);
    return { provider: payload.provider ?? "google", linked: true } as T;
  }

  if (path.startsWith("/api/v1/users/me/social-accounts/") && method === "DELETE") {
    return { provider: path.split("/").pop() ?? "google", linked: false } as T;
  }

  if (path === "/api/v1/users/me/consents" && method === "PUT") {
    return { ...parseBody<ConsentPayload>(init), updatedAt: new Date().toISOString() } as T;
  }

  if (path === "/api/v1/users/me/deletion-request" && method === "POST") {
    const deletionScheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return { deletionScheduledAt } as T;
  }

  if (path === "/api/v1/users/me/deletion-request" && method === "DELETE") {
    return null as T;
  }

  if (path === "/api/v1/users/me/notifications" && method === "GET") {
    return {
      notifications: [
        {
          notificationId: "ntf_demo_1",
          type: "ADMIN_NOTICE",
          title: "[일반] BrainX 안내",
          body: "새 공지가 도착하면 이 알림함에서 확인할 수 있습니다.",
          sentByAdminName: "BrainX Admin",
          read: false,
          createdAt: new Date().toISOString(),
          readAt: null
        }
      ],
      unreadCount: 1
    } as T;
  }

  if (path.startsWith("/api/v1/users/me/notifications/") && path.endsWith("/read") && method === "POST") {
    const notificationId = path.split("/")[5] ?? "ntf_demo_1";
    return {
      notificationId,
      type: "ADMIN_NOTICE",
      title: "[일반] BrainX 안내",
      body: "새 공지가 도착하면 이 알림함에서 확인할 수 있습니다.",
      sentByAdminName: "BrainX Admin",
      read: true,
      createdAt: new Date().toISOString(),
      readAt: new Date().toISOString()
    } as T;
  }

  throw new Error("데모 모드에서 지원하지 않는 사용자 API입니다.");
}
export async function getMyProfile() {
  const data = await authedRequest<MyProfile | IdentityProfileResponse>("/api/v1/users/me");
  return normalizeProfile(data);
}

type ProfileUpdateResult = { userId: string; nickname: string; profileImageUrl: string | null; language?: LanguageCode; theme?: ThemeMode };

export async function updateMyProfile(payload: {
  nickname?: string;
  profileImageAssetId?: string | null;
  language?: LanguageCode;
  theme?: ThemeMode;
}): Promise<ProfileUpdateResult> {
  const data = await authedRequest<
    | ProfileUpdateResult
    | IdentityProfileResponse
  >(
    "/api/v1/users/me/profile",
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  );
  const normalized = normalizeProfileUpdate(data);
  saveAuthSession({ ...(readAuthSession() ?? {}), nickname: normalized.nickname, profileImageUrl: normalized.profileImageUrl });
  return normalized;
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}) {
  return authedRequest<null>("/api/v1/users/me/password", {
    method: "PATCH",
    body: JSON.stringify({
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
      newPasswordConfirm: payload.newPasswordConfirm
    })
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
  const data = await authedRequest<(ConsentPayload & { updatedAt?: string }) | { ok: boolean }>("/api/v1/users/me/consents", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  if ("termsRequired" in data) return { ...data, updatedAt: data.updatedAt ?? "" };
  return { ...payload, updatedAt: "" };
}

export async function requestAccountDeletion(reason: string) {
  return authedRequest<{ deletionScheduledAt: string }>("/api/v1/users/me/deletion-request", {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function getMyNotifications() {
  return authedRequest<MyNotificationsResponse>("/api/v1/users/me/notifications");
}

export async function markMyNotificationRead(notificationId: string) {
  return authedRequest<MyNotification>(`/api/v1/users/me/notifications/${notificationId}/read`, {
    method: "POST"
  });
}

export async function cancelAccountDeletion() {
  return authedRequest<null>("/api/v1/users/me/deletion-request", {
    method: "DELETE"
  });
}

type IdentityProfileResponse = {
  userId: string;
  email: string;
  profile?: {
    nickname?: string | null;
    profileImageUrl?: string | null;
  } | null;
  nickname?: string | null;
  profileImageUrl?: string | null;
  language?: LanguageCode | null;
  theme?: ThemeMode | null;
  role?: string;
  security?: {
    twoFactorEnabled?: boolean;
    linkedProviders?: string[];
    hasPassword?: boolean;
  } | null;
  consents?: {
    termsRequired?: boolean;
    privacyRequired?: boolean;
    marketingOptional?: boolean;
    behaviorAnalyticsOptional?: boolean;
    updatedAt?: string | null;
  } | null;
};

function normalizeProfile(data: MyProfile | IdentityProfileResponse): MyProfile {
  if (isIdentityProfile(data)) {
    return {
      userId: data.userId,
      email: data.email,
      nickname: data.profile?.nickname ?? data.nickname ?? "",
      profileImageUrl: data.profile?.profileImageUrl ?? data.profileImageUrl ?? null,
      language: data.language ?? readStoredLanguage(),
      theme: data.theme ?? readStoredTheme(),
      role: data.role ?? "ROLE_USER",
      security: {
        twoFactorEnabled: data.security?.twoFactorEnabled ?? false,
        linkedProviders: data.security?.linkedProviders ?? [],
        hasPassword: data.security?.hasPassword
      },
      consents: {
        termsRequired: data.consents?.termsRequired ?? true,
        privacyRequired: data.consents?.privacyRequired ?? true,
        marketingOptional: data.consents?.marketingOptional ?? false,
        behaviorAnalyticsOptional: data.consents?.behaviorAnalyticsOptional ?? false,
        updatedAt: data.consents?.updatedAt ?? null
      }
    };
  }
  return {
    ...(data as MyProfile),
    language: (data as MyProfile).language ?? readStoredLanguage(),
    theme: (data as MyProfile).theme ?? readStoredTheme()
  };
}

function normalizeProfileUpdate(
  data: ProfileUpdateResult | IdentityProfileResponse
): ProfileUpdateResult {
  if (isIdentityProfile(data)) {
    return {
      userId: data.userId,
      nickname: data.profile?.nickname ?? data.nickname ?? "",
      profileImageUrl: data.profile?.profileImageUrl ?? data.profileImageUrl ?? null,
      language: data.language ?? undefined,
      theme: data.theme ?? undefined
    };
  }
  return {
    userId: data.userId,
    nickname: data.nickname,
    profileImageUrl: data.profileImageUrl,
    language: data.language,
    theme: data.theme
  };
}

function isIdentityProfile(data: MyProfile | ProfileUpdateResult | IdentityProfileResponse): data is IdentityProfileResponse {
  return "profile" in data;
}
