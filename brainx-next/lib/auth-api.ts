"use client";

export type EmailVerificationPurpose = "SIGNUP" | "PASSWORD_CHANGE";
export type OAuthProvider = "kakao" | "google" | "apple" | "naver";

export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type AuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string;
  userId?: string | null;
  email?: string;
  nickname?: string;
  profileImageUrl?: string | null;
  role?: string;
  requires2fa?: boolean;
  onboardingToken?: string | null;
  next?: string | null;
};

export type SignupConsents = {
  termsRequired: boolean;
  privacyRequired: boolean;
  marketingOptional: boolean;
  behaviorAnalyticsOptional: boolean;
};

type EmailVerificationData = {
  verificationId: string;
  email: string;
  expiresAt: string;
};

type EmailVerificationCheckData = {
  verified: boolean;
  email: string;
};

type OAuthAuthorizeData = {
  provider: OAuthProvider;
  authorizationUrl: string;
  state: string;
};

type OAuthCallbackData = AuthSession & {
  accountLinked?: boolean;
  isNewUser?: boolean;
};

const AUTH_SESSION_KEY = "brainx_auth_session_v1";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

export function saveAuthSession(session: Partial<AuthSession>) {
  if (typeof window === "undefined") return;
  const normalized: AuthSession = {
    tokenType: session.tokenType ?? "Bearer",
    accessToken: session.accessToken ?? null,
    refreshToken: session.refreshToken ?? null,
    userId: session.userId,
    email: session.email,
    nickname: session.nickname,
    profileImageUrl: session.profileImageUrl ?? null,
    role: session.role,
    requires2fa: session.requires2fa,
    onboardingToken: session.onboardingToken ?? null,
    next: session.next ?? null
  };
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event("brainx-auth-session-changed"));
}

export function readAuthSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  window.dispatchEvent(new Event("brainx-auth-session-changed"));
}

export async function requestEmailVerification(email: string, purpose: EmailVerificationPurpose) {
  return request<EmailVerificationData>("/api/v1/auth/email-verifications", {
    method: "POST",
    body: JSON.stringify({ email, purpose })
  });
}

export async function verifyEmailCode(email: string, verificationCode: string, purpose: EmailVerificationPurpose) {
  return request<EmailVerificationCheckData>("/api/v1/auth/email-verifications/verify", {
    method: "POST",
    body: JSON.stringify({ email, verificationCode, purpose })
  });
}

export async function signupWithEmail(payload: {
  email: string;
  verificationCode: string;
  password: string;
  passwordConfirm: string;
  consents: SignupConsents;
}) {
  const data = await request<AuthSession>("/api/v1/auth/signup/email", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  saveAuthSession(data);
  return data;
}

export async function loginLocal(email: string, password: string) {
  const data = await request<AuthSession>("/api/v1/auth/login/local", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  saveAuthSession(data);
  return data;
}

export async function logout() {
  const session = readAuthSession();
  await request<null>("/api/v1/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session?.refreshToken ?? "" })
  });
  clearAuthSession();
}

export async function refreshToken() {
  const session = readAuthSession();
  const data = await request<AuthSession>("/api/v1/auth/token/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: session?.refreshToken ?? "" })
  });
  saveAuthSession({ ...session, ...data });
  return data;
}

export async function getOAuthAuthorization(provider: OAuthProvider) {
  return request<OAuthAuthorizeData>(`/api/v1/auth/oauth/${provider}/authorize`, {
    method: "GET"
  });
}

export async function completeOAuthLogin(provider: OAuthProvider, code: string, state: string) {
  const data = await request<OAuthCallbackData>(`/api/v1/auth/oauth/${provider}/callback`, {
    method: "POST",
    body: JSON.stringify({ code, state })
  });
  saveAuthSession(data);
  return data;
}

export async function completeOnboarding(payload: {
  onboardingToken: string;
  nickname: string;
  profileImageUrl?: string | null;
  interests: string[];
}) {
  const data = await request<AuthSession>("/api/v1/auth/onboarding/complete", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  saveAuthSession(data);
  return data;
}
