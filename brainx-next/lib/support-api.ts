"use client";

import { getPublicApiBaseUrl } from "@/lib/api-base";
import { clearAuthSession, readAuthSession, refreshAuthSessionOnce, type ApiResponse } from "@/lib/auth-api";
import { isAuthSessionFailureStatus } from "@/lib/auth-http-status";

export type SupportTicket = {
  ticketId: string;
  category: string;
  subject: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | string;
  createdAt: string;
  updatedAt: string | null;
  hasNewReply?: boolean | null;
};

export type SupportMessage = {
  messageId: string;
  senderType: "USER" | "ADMIN" | string;
  content: string;
  attachments: Array<{ assetId: string; fileName: string; fileUrl: string }>;
  createdAt: string;
};

export type SupportTicketDetail = SupportTicket & {
  messages: SupportMessage[];
};

export type SupportTicketPayload = {
  category: "ACCOUNT" | "BILLING" | "PAYMENT" | "BUG" | "FEATURE_REQUEST" | "DATA" | "OTHER";
  subject: string;
  body: string;
  attachments?: string[];
};

type SupportTicketListData = {
  tickets: SupportTicket[];
};

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedRequest<T>(path: string, init?: RequestInit, retried = false) {
  const session = readAuthSession();
  if (!session?.accessToken) {
    throw new Error("로그인이 필요합니다.");
  }

  const response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (isAuthSessionFailureStatus(response.status)) {
    if (!retried && session.refreshToken && (await refreshAuthSessionOnce())) {
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

export async function getMySupportTickets() {
  const data = await authedRequest<SupportTicketListData>("/api/v1/support/tickets");
  return data.tickets;
}

export function createSupportTicket(payload: SupportTicketPayload) {
  return authedRequest<SupportTicket>("/api/v1/support/tickets", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMySupportTicket(ticketId: string) {
  return authedRequest<SupportTicketDetail>(`/api/v1/support/tickets/${ticketId}`);
}
