"use client";

import {
  getLocalStoredValue,
  getSessionStoredValue,
  removeLocalStoredValue,
  removeSessionStoredValue,
  setLocalStoredValue,
  setSessionStoredValue,
} from "@/lib/client-storage";
import { getPublicApiBaseUrl, getWorkspaceApiBaseUrl } from "@/lib/api-base";
import { requestDesktopApiJson } from "@/lib/desktop-api-request";

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
    details?: Record<string, unknown>;
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

export type AuthSessionPersistence = "local" | "session";

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

export type ClaimedNoteIdMapping = { from: string; to: string };

const AUTH_SESSION_KEY = "brainx_auth_session_v1";
const AUTH_PERSISTENCE_KEY = "brainx_auth_persistence_v1";
// lib/workspace-api.ts의 GUEST_SESSION_ID_KEY와 반드시 같은 값이어야 한다 — claim 요청이
// 실제로 guest 데이터를 만든 것과 같은 guestId를 X-Guest-Id로 실어 보내야 하기 때문이다.
const WORKSPACE_GUEST_SESSION_ID_KEY = "brainx_workspace_guest_id_v1";
const LAST_SOCIAL_LOGIN_KEY = "brainx_last_social_login_provider_v1";
const WORKSPACE_SESSION_KEY = "brainx_notes_workspace_v1";
const PENDING_NOTE_CLAIM_KEY = "brainx_pending_note_claim_v1";
const OAUTH_RETURN_TO_KEY = "brainx_oauth_return_to_v1";
const HOSTED_WEB_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
// 이 값은 X-User-Id 헤더 전송(NEXT_PUBLIC_ENABLE_DEV_USER, lib/dev-user.ts)과는 별개의 스위치
// (NEXT_PUBLIC_DEV_AUTH_BYPASS)로만 게이팅된다 — DEV_AUTH_BYPASS는 완전히 가짜 로그인 세션 객체를
// 만드는 기능이라, 그 세션의 표시용 userId 라벨로만 이 값을 재사용한다. ENABLE_DEV_USER가 꺼져
// 있어도(진짜 게스트 요청에 X-User-Id를 안 붙이는 것과 무관하게) DEV_AUTH_BYPASS가 켜져 있으면
// 이 라벨은 그대로 쓴다.
const DEV_AUTH_USER_ID = process.env.NEXT_PUBLIC_WORKSPACE_DEV_USER_ID?.trim() || "dev-test-user";
export const DEMO_AUTH_SESSION: AuthSession = {
  accessToken: "demo-access-token",
  refreshToken: "demo-refresh-token",
  tokenType: "Bearer",
  userId: "usr_demo",
  email: "demo@brainx.local",
  nickname: "BrainX Demo",
  profileImageUrl: null,
  role: "ROLE_USER",
  requires2fa: false,
  onboardingToken: null,
  next: "HOME"
};

const DEV_AUTH_SESSION: AuthSession = {
  ...DEMO_AUTH_SESSION,
  userId: DEV_AUTH_USER_ID,
  email: `${DEV_AUTH_USER_ID}@brainx.local`,
  nickname: "BrainX Dev",
  provider: "email",
};
let clientLocationPromise: Promise<string | null> | null = null;

function isDesktopRuntime() {
  return typeof window !== "undefined" && !!window.brainxDesktop;
}

function canUseDevAuthBypass() {
  return DEV_AUTH_BYPASS && !isDesktopRuntime();
}

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
  const desktopResponse = await requestDesktopApiJson<ApiResponse<T>>(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (desktopResponse) {
    const payload = desktopResponse.payload;
    if (!payload) {
      throw new Error("서버 응답을 읽을 수 없습니다.");
    }
    if (!desktopResponse.ok || !payload.success) {
      throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
    }
    return payload.data as T;
  }

  let response: Response;
  try {
    response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("BrainX 서버에 연결하지 못했습니다. 네트워크 상태와 앱 최신 빌드를 확인한 뒤 다시 시도해주세요.");
    }
    throw error;
  }

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }

  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }

  return payload.data as T;
}

/** claim 응답의 noteId 매핑(draft id → 승계된 실제 noteId)을 sessionStorage에 잠깐 보관한다.
    NotesWorkspace는 로그인/회원가입 화면과 별도 라우트라 컴포넌트가 매번 새로 마운트되므로,
    claim이 끝나는 시점에 살아있는 이벤트 리스너로는 전달할 수 없다 — 다음 마운트(주로 리다이렉트
    직후) 시점에 resolveActorPersistKey가 이 값을 꺼내 pane tree/tabs의 draft id를 갈아끼운다. */
function stashPendingNoteClaim(mapping: ClaimedNoteIdMapping[]) {
  if (typeof window === "undefined") return;
  if (mapping.length === 0) {
    removeSessionStoredValue(PENDING_NOTE_CLAIM_KEY);
    return;
  }
  setSessionStoredValue(PENDING_NOTE_CLAIM_KEY, JSON.stringify(mapping));
}

/** 저장된 매핑을 읽기만 한다(소비하지 않음) — 로그인/온보딩 화면이 redirect 대상 URL의
    노트 id를 승계된 id로 바꿔 써야 할 때 사용한다. */
export function peekPendingNoteClaim(): ClaimedNoteIdMapping[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = getSessionStoredValue(PENDING_NOTE_CLAIM_KEY);
    return raw ? (JSON.parse(raw) as ClaimedNoteIdMapping[]) : [];
  } catch {
    return [];
  }
}

/** 저장된 매핑을 읽고 지운다 — NotesWorkspace가 실제로 pane tree에 매핑을 적용할 때 한 번만
    소비한다(이후 재마운트에서 같은 매핑이 중복 적용되지 않도록). */
export function consumePendingNoteClaim(): ClaimedNoteIdMapping[] {
  const mapping = peekPendingNoteClaim();
  if (typeof window !== "undefined") {
    removeSessionStoredValue(PENDING_NOTE_CLAIM_KEY);
  }
  return mapping;
}

/** returnTo가 `/notes/{id}` 형태면 claim 매핑을 적용해 승계된 noteId로 바꿔준다. claim이
    있었는데(매핑이 비어있지 않은데) 이 id가 그 안에 없으면(만료/무효) `/notes`로 안전하게
    내려간다. claim 자체가 없었으면(게스트 draft가 없던 경우 등) returnTo를 그대로 둔다. */
export function resolveAuthReturnTo(returnTo: string): string {
  const match = returnTo.match(/^\/notes\/([^/?#]+)(.*)$/);
  if (!match) return returnTo;
  const [, noteId, rest] = match;
  const mapping = peekPendingNoteClaim();
  const remapped = mapping.find((entry) => entry.from === noteId);
  if (remapped) return `/notes/${remapped.to}${rest}`;
  return mapping.length > 0 ? "/notes" : returnTo;
}

/** 게스트/로그인 화면 어디서든 호출 — 내부 경로(`/`로 시작, `//`는 아님)만 허용해 open redirect를 막는다. */
export function readReturnToParam(fallback = "/home"): string {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/** 로그인/회원가입/온보딩 페이지로 이동하는 링크에 현재 페이지를 returnTo로 실어준다.
    returnTo가 홈이면(기본값과 같으면) 굳이 쿼리스트링을 붙이지 않는다. */
export function buildAuthPath(path: string, returnTo?: string | null): string {
  if (!returnTo || returnTo === "/home") return path;
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Google 등 OAuth는 외부 제공자로 풀 페이지 이동 후 콜백 페이지로 돌아오므로 returnTo를
    쿼리스트링이 아니라 sessionStorage에 잠깐 보관해야 살아남는다. */
export function stashOAuthReturnTo(returnTo: string) {
  if (typeof window === "undefined") return;
  if (!returnTo || returnTo === "/home") {
    removeSessionStoredValue(OAUTH_RETURN_TO_KEY);
    return;
  }
  setSessionStoredValue(OAUTH_RETURN_TO_KEY, returnTo);
}

export function getHostedWebOrigin() {
  if (HOSTED_WEB_ORIGIN) {
    return HOSTED_WEB_ORIGIN.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://brainx.p-e.kr";
}

export function consumeOAuthReturnTo(): string {
  if (typeof window === "undefined") return "/home";
  const value = getSessionStoredValue(OAUTH_RETURN_TO_KEY);
  removeSessionStoredValue(OAUTH_RETURN_TO_KEY);
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

async function claimGuestDraftsAfterAuth(session: AuthSession) {
  if (!session.accessToken) return null;

  // lib/workspace-api.ts의 authedRequest는 게스트 요청마다 이 localStorage 값을 X-Guest-Id로
  // 실어 보낸다 — 로그인 직전까지의 노트/폴더/즐겨찾기가 실제로 이 guestId 소유로 저장돼 있으므로,
  // claim 요청도 같은 값을 보내야 Workspace-Service가 승계할 대상을 찾는다. 이 헤더가 빠지면
  // 백엔드가 400(GUEST_ID_REQUIRED)을 던지고 claim이 항상 조용히 스킵된다. 값이 없으면(이 브라우저가
  // 게스트로 아무 요청도 한 적 없음) 승계할 것도 없으므로 헤더 없이 스킵되는 기존 동작을 그대로 둔다.
  const guestId = getLocalStoredValue(WORKSPACE_GUEST_SESSION_ID_KEY)?.trim() || null;

  let claimed: NoteDraftClaimData | null = null;
  try {
    const desktopResponse = await requestDesktopApiJson<ApiResponse<NoteDraftClaimData>>("/api/v1/notes/drafts/claim", {
      method: "POST",
      headers: {
        Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`,
        "Content-Type": "application/json",
        ...(guestId ? { "X-Guest-Id": guestId } : {}),
      },
    });
    const response = desktopResponse
      ? ({
          ok: desktopResponse.ok,
          status: desktopResponse.status,
        } as Pick<Response, "ok" | "status">)
      : await fetch(`${getWorkspaceApiBaseUrl()}/api/v1/notes/drafts/claim`, {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`,
            "Content-Type": "application/json",
            ...(guestId ? { "X-Guest-Id": guestId } : {}),
          },
        });
    const payload = desktopResponse
      ? desktopResponse.payload
      : ((await (response as Response).json().catch(() => null)) as ApiResponse<NoteDraftClaimData> | null);
    if (!response.ok || !payload?.success) {
      console.warn("Guest draft claim skipped after auth.", payload?.error?.code ?? response.status);
      return null;
    }

    claimed = payload.data ?? null;
    return claimed;
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
    const claimedNoteIds: ClaimedNoteIdMapping[] = claimed?.notes.map((note) => ({
      from: note.sourceNoteId,
      to: note.noteId,
    })) ?? [];
    stashPendingNoteClaim(claimedNoteIds);
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
  const persistence = readAuthSessionPersistence();
  if (persistence === "session") {
    removeLocalStoredValue(AUTH_SESSION_KEY);
    setSessionStoredValue(AUTH_SESSION_KEY, JSON.stringify(normalized));
  } else {
    removeSessionStoredValue(AUTH_SESSION_KEY);
    setLocalStoredValue(AUTH_SESSION_KEY, JSON.stringify(normalized));
  }
  if (normalized.provider === "google" || normalized.provider === "kakao" || normalized.provider === "naver") {
    setLocalStoredValue(LAST_SOCIAL_LOGIN_KEY, normalized.provider);
  }
  window.dispatchEvent(new Event("brainx-auth-session-changed"));
}

export function setAuthSessionPersistence(persistence: AuthSessionPersistence) {
  if (typeof window === "undefined") return;
  setLocalStoredValue(AUTH_PERSISTENCE_KEY, persistence);
}

export function readAuthSessionPersistence(): AuthSessionPersistence {
  if (typeof window === "undefined") return "local";
  return getLocalStoredValue(AUTH_PERSISTENCE_KEY) === "session" ? "session" : "local";
}

function normalizeSessionForCompare(session: AuthSession | null | undefined) {
  if (!session) return null;
  return {
    accessToken: session.accessToken ?? null,
    refreshToken: session.refreshToken ?? null,
    tokenType: session.tokenType ?? "Bearer",
    provider: session.provider ?? null,
    userId: session.userId ?? null,
    email: session.email ?? null,
    nickname: session.nickname ?? null,
    profileImageUrl: session.profileImageUrl ?? null,
    role: session.role ?? null,
    requires2fa: session.requires2fa ?? false,
    onboardingToken: session.onboardingToken ?? null,
    next: session.next ?? null,
  };
}

export function isSameAuthSession(
  left: AuthSession | null | undefined,
  right: AuthSession | null | undefined
) {
  return JSON.stringify(normalizeSessionForCompare(left)) === JSON.stringify(normalizeSessionForCompare(right));
}

export function getAuthIdentityKey(session: AuthSession | null | undefined = readAuthSession()) {
  const normalized = normalizeSessionForCompare(session);
  return normalized
    ? `${normalized.userId ?? ""}|${normalized.accessToken ?? ""}|${normalized.refreshToken ?? ""}|${normalized.provider ?? ""}|${normalized.role ?? ""}`
    : "guest";
}

export function isDevAuthSession(session: AuthSession | null | undefined) {
  return session?.accessToken === DEMO_AUTH_SESSION.accessToken;
}

export function readAuthSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = getLocalStoredValue(AUTH_SESSION_KEY) ?? getSessionStoredValue(AUTH_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : canUseDevAuthBypass() ? DEV_AUTH_SESSION : null;
  } catch {
    return canUseDevAuthBypass() ? DEV_AUTH_SESSION : null;
  }
}

export function ensureDevAuthSession() {
  if (typeof window === "undefined" || !canUseDevAuthBypass()) return null;
  const session = readAuthSession();
  if (session?.accessToken) return session;
  saveAuthSession(DEV_AUTH_SESSION);
  return DEV_AUTH_SESSION;
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  const prevSession = readAuthSession();
  const hadStoredAuthSession =
    getLocalStoredValue(AUTH_SESSION_KEY) != null || getSessionStoredValue(AUTH_SESSION_KEY) != null;
  const hadWorkspaceSession = getLocalStoredValue(WORKSPACE_SESSION_KEY) != null;
  removeLocalStoredValue(AUTH_SESSION_KEY);
  removeSessionStoredValue(AUTH_SESSION_KEY);
  removeLocalStoredValue(WORKSPACE_SESSION_KEY);
  const nextSession = readAuthSession();
  const authSessionChanged = !isSameAuthSession(prevSession, nextSession);
  const workspaceChanged = hadWorkspaceSession;
  if (!hadStoredAuthSession && !workspaceChanged && !authSessionChanged) return;
  if (authSessionChanged) {
    window.dispatchEvent(new Event("brainx-auth-session-changed"));
  }
  // localStorage는 지워도 NotesWorkspace가 같은 탭에서 리마운트 없이 계속 떠 있으면(예: /notes를
  // 벗어나지 않고 로그아웃) 메모리에 남은 이전 계정의 notes/탭 상태는 그대로다 — claim 이후와
  // 동일하게 워크스페이스를 비우고 새 actor(로그아웃했으면 게스트) 기준으로 다시 불러온다.
  if (authSessionChanged || workspaceChanged) {
    window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { resetWorkspace: true } }));
  }
}

export function readRecentSocialLoginProvider() {
  if (typeof window === "undefined") return null;
  const value = getLocalStoredValue(LAST_SOCIAL_LOGIN_KEY);
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
  const refreshTokenValue = session?.refreshToken?.trim();
  try {
    // refreshToken이 없으면(세션이 이미 만료/정리됐거나 2FA 대기 등으로 애초에 발급되지
    // 않은 경우) 서버는 LogoutRequest.refreshToken @NotBlank 검증에 걸려 항상 400을
    // 반환한다 — 이 경우 네트워크 요청 자체를 생략하고 로컬 세션만 정리한다.
    if (refreshTokenValue) {
      await request<null>("/api/v1/auth/logout", {
        method: "POST",
        headers: await buildAuthHeaders(),
        body: JSON.stringify({ refreshToken: refreshTokenValue })
      });
    }
  } catch (error) {
    // 서버 로그아웃이 실패해도(토큰이 이미 만료/폐기된 경우 등) 사용자 입장에서는 로컬
    // 세션 정리만으로 로그아웃이 끝나야 한다 — 호출자에게 에러를 던지면 이미 로그아웃된
    // 상태인데도 "로그아웃 실패" 토스트가 뜨는 등 UX가 어긋난다.
    console.warn("Server logout failed; continuing with local session cleanup.", error);
  } finally {
    clearAuthSession();
  }
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
