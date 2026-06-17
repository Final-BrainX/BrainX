"use client";

import { clearAuthSession, isDemoSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type SupportInquiry = {
  inquiryId: string;
  category: string;
  title: string;
  content: string;
  status: "RECEIVED" | "IN_PROGRESS" | "ANSWERED" | "CLOSED" | string;
  createdAt: string;
  updatedAt: string | null;
};

export type SupportInquiryPayload = {
  category: string;
  title: string;
  content: string;
};

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedRequest<T>(path: string, init?: RequestInit) {
  const session = readAuthSession();
  if (!session?.accessToken) {
    throw new Error("로그인이 필요합니다.");
  }

  if (isDemoSession(session)) {
    return demoSupportResponse<T>(path, init);
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

function parseBody<T>(init?: RequestInit): Partial<T> {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Partial<T>;
  } catch {
    return {};
  }
}

function demoSupportResponse<T>(path: string, init?: RequestInit): T {
  const method = init?.method?.toUpperCase() ?? "GET";

  if (path === "/api/v1/support/inquiries" && method === "GET") {
    return [
      {
        inquiryId: "inq_demo_001",
        category: "SERVICE",
        title: "데모 문의",
        content: "개발용 데모 세션에서 확인할 수 있는 예시 문의입니다.",
        status: "RECEIVED",
        createdAt: new Date().toISOString(),
        updatedAt: null
      }
    ] as T;
  }

  if (path === "/api/v1/support/inquiries" && method === "POST") {
    const payload = parseBody<SupportInquiryPayload>(init);
    return {
      inquiryId: `inq_demo_${Date.now()}`,
      category: payload.category ?? "GENERAL",
      title: payload.title ?? "데모 문의",
      content: payload.content ?? "",
      status: "RECEIVED",
      createdAt: new Date().toISOString(),
      updatedAt: null
    } as T;
  }

  throw new Error("데모 모드에서 지원하지 않는 고객지원 API입니다.");
}

export function getMySupportInquiries() {
  return authedRequest<SupportInquiry[]>("/api/v1/support/inquiries");
}

export function createSupportInquiry(payload: SupportInquiryPayload) {
  return authedRequest<SupportInquiry>("/api/v1/support/inquiries", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
