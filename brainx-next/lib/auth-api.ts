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
  provider?: OAuthProvider | "email" | null;
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

type EmailAvailabilityData = {
  email: string;
  available: boolean;
};

type EmailVerificationCheckData = {
  verified: boolean;
  email: string;
};

type TemporaryPasswordIssueData = {
  email: string;
  issued: boolean;
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

type ClaimedNoteDraft = {
  noteId: string;
  sourceNoteId: string;
  title: string;
  version: number;
};

type NoteDraftClaimData = {
  claimedCount: number;
  notes: ClaimedNoteDraft[];
};

const AUTH_SESSION_KEY = "brainx_auth_session_v1";
const LAST_SOCIAL_LOGIN_KEY = "brainx_last_social_login_provider_v1";
const WORKSPACE_SESSION_KEY = "brainx_notes_workspace_v1";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const WORKSPACE_API_BASE_URL =
  process.env.NEXT_PUBLIC_WORKSPACE_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "";
let clientLocationPromise: Promise<string | null> | null = null;

async function resolveClientLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!clientLocationPromise) {
    clientLocationPromise = new Promise((resolve) => {
      const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      const finish = (value: string | null) => resolve(value || fallback);

      if (!navigator.geolocation) {
        finish(null);
        return;
      }

      const timeout = window.setTimeout(() => finish(null), 1200);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timeout);
          const { latitude, longitude } = position.coords;
          finish(`${latitude.toFixed(5)},${longitude.toFixed(5)}`);
        },
        () => {
          window.clearTimeout(timeout);
          finish(null);
        },
        { enableHighAccuracy: false, timeout: 1000, maximumAge: 5 * 60 * 1000 }
      );
    });
  }

  return clientLocationPromise;
}

async function buildAuthHeaders() {
  const clientLocation = await resolveClientLocation();
  const headers: Record<string, string> = {};
  if (clientLocation) {
    headers["X-Client-Location"] = clientLocation;
  }
  return headers;
}

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

async function claimGuestDraftsAfterAuth(session: AuthSession) {
  if (!session.accessToken) return null;

  try {
    const response = await fetch(`${WORKSPACE_API_BASE_URL}/api/v1/notes/drafts/claim`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const payload = (await response.json().catch(() => null)) as ApiResponse<NoteDraftClaimData> | null;
    if (!response.ok || !payload?.success) {
      console.warn("Guest draft claim skipped after auth.", payload?.error?.code ?? response.status);
      return null;
    }

    return payload.data ?? null;
  } catch (error) {
    console.warn("Guest draft claim request failed after auth.", error);
    return null;
  } finally {
    // NotesWorkspace는 마운트 시 한 번만 노트 목록을 불러오고, 로그인 상태 변화를 직접
    // 구독하지 않는다 — 같은 탭에서 게스트로 보던 노트 목록(및 클라이언트에서만 지운 항목)이
    // 로그인/회원가입 직후에도 그대로 남아 새 계정의 화면처럼 보이는 문제가 있었다. claim
    // 시도(성공/스킵/실패 모두) 직후 기존 "brainx:notes-refresh" 이벤트를 재사용해 새 actor
    // 기준으로 노트 목록을 다시 불러오게 한다 — claim이 끝난 뒤에 발생시켜야 방금 승계된
    // 게스트 노트도 이 새로고침에서 바로 보인다(순서가 바뀌면 레이스가 생김).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { resetWorkspace: true } }));
    }
  }
}

export function saveAuthSession(session: Partial<AuthSession>) {
  if (typeof window === "undefined") return;
  const normalized: AuthSession = {
    tokenType: session.tokenType ?? "Bearer",
    accessToken: session.accessToken ?? null,
    refreshToken: session.refreshToken ?? null,
    provider: session.provider ?? null,
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
  if (normalized.provider === "google" || normalized.provider === "kakao" || normalized.provider === "naver") {
    window.localStorage.setItem(LAST_SOCIAL_LOGIN_KEY, normalized.provider);
  }
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
  window.localStorage.removeItem(WORKSPACE_SESSION_KEY);
  window.dispatchEvent(new Event("brainx-auth-session-changed"));
  // localStorage는 지워도 NotesWorkspace가 같은 탭에서 리마운트 없이 계속 떠 있으면(예: /notes를
  // 벗어나지 않고 로그아웃) 메모리에 남은 이전 계정의 notes/탭 상태는 그대로다 — claim 이후와
  // 동일하게 워크스페이스를 비우고 새 actor(로그아웃했으면 게스트) 기준으로 다시 불러온다.
  window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { resetWorkspace: true } }));
}

export function readRecentSocialLoginProvider() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(LAST_SOCIAL_LOGIN_KEY);
  return value === "google" || value === "kakao" || value === "naver" ? value : null;
}

export async function requestEmailVerification(email: string, purpose: EmailVerificationPurpose) {
  return request<EmailVerificationData>("/api/v1/auth/email-verifications", {
    method: "POST",
    body: JSON.stringify({ email, purpose })
  });
}

export async function checkEmailAvailability(email: string) {
  return request<EmailAvailabilityData>(`/api/v1/auth/email-availability?email=${encodeURIComponent(email)}`, {
    method: "GET"
  });
}

export async function verifyEmailCode(email: string, verificationCode: string, purpose: EmailVerificationPurpose) {
  return request<EmailVerificationCheckData>("/api/v1/auth/email-verifications/verify", {
    method: "POST",
    body: JSON.stringify({ email, verificationCode, purpose })
  });
}

export async function issueTemporaryPassword(email: string, verificationCode: string) {
  return request<TemporaryPasswordIssueData>("/api/v1/auth/password/temporary", {
    method: "POST",
    body: JSON.stringify({ email, verificationCode })
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
      headers: await buildAuthHeaders(),
      body: JSON.stringify(payload)
    });
  const session = { ...data, provider: "email" as const };
  saveAuthSession(session);
  await claimGuestDraftsAfterAuth(session);
  return data;
}

export async function loginLocal(email: string, password: string) {
  const data = await request<AuthSession>("/api/v1/auth/login/local", {
      method: "POST",
      headers: await buildAuthHeaders(),
      body: JSON.stringify({ email, password })
    });
  const session = { ...data, provider: "email" as const };
  saveAuthSession(session);
  await claimGuestDraftsAfterAuth(session);
  return data;
}

export async function logout() {
  const session = readAuthSession();
  await request<null>("/api/v1/auth/logout", {
      method: "POST",
      headers: await buildAuthHeaders(),
      body: JSON.stringify({ refreshToken: session?.refreshToken ?? "" })
    });
  clearAuthSession();
}

export async function refreshToken() {
  const session = readAuthSession();
  const data = await request<AuthSession>("/api/v1/auth/token/refresh", {
      method: "POST",
      headers: await buildAuthHeaders(),
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
      headers: await buildAuthHeaders(),
      body: JSON.stringify({ code, state })
    });
  const session = { ...data, provider };
  saveAuthSession(session);
  await claimGuestDraftsAfterAuth(session);
  return data;
}

export async function completeOnboarding(payload: {
  onboardingToken: string;
  nickname: string;
  profileImageUrl?: string | null;
  interests: string[];
  consents: SignupConsents;
}) {
  const data = await request<AuthSession>("/api/v1/auth/onboarding/complete", {
    method: "POST",
    headers: await buildAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const session = { ...data, provider: "email" as const };
  saveAuthSession(session);
  // 이메일 회원가입은 signupWithEmail → (닉네임/관심사 입력) → completeOnboarding 2단계로
  // 끝난다. signupWithEmail에서도 claim을 호출하지만, 그때 받은 세션은 온보딩 전 단계라
  // Workspace-Service가 인증된 사용자로 받아주지 못해 claim이 조용히 스킵될 수 있다 — 그래서
  // 실제로 계정이 확정되는 이 시점(= "회원가입 완료" 순간)에 다시 한 번 호출해, 게스트로
  // 작성한 노트가 가입 직후 화면에도 바로 보이게 한다.
  await claimGuestDraftsAfterAuth(session);
  return data;
}
