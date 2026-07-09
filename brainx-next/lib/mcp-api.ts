"use client";

import { getPublicApiBaseUrl } from "@/lib/api-base";
import { clearAuthSession, readAuthSession, refreshAuthSessionOnce, type ApiResponse } from "@/lib/auth-api";
import { isAuthSessionFailureStatus } from "@/lib/auth-http-status";

export type McpApiClientItem = {
  clientId: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type McpApiClientListData = {
  clients: McpApiClientItem[];
};

export type McpApiClientCreateRequest = {
  name: string;
  scopes: string[];
  expiresAt: string | null;
};

export type McpApiClientCreateData = {
  clientId: string;
  apiKeyOnce: string;
};

export class McpAuthRequiredError extends Error {
  constructor(message = "로그인이 만료되었습니다. 다시 로그인해 주세요.") {
    super(message);
    this.name = "McpAuthRequiredError";
  }
}

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function authedMcpRequest<T>(path: string, init?: RequestInit, retried = false) {
  const session = readAuthSession();
  if (!session?.accessToken) {
    throw new McpAuthRequiredError("로그인이 필요합니다.");
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
      return authedMcpRequest<T>(path, init, true);
    }
    clearAuthSession();
    throw new McpAuthRequiredError();
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "MCP API key 요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

export async function listMcpApiClients() {
  return authedMcpRequest<McpApiClientListData>("/api/v1/mcp/api-clients");
}

export async function createMcpApiClient(payload: McpApiClientCreateRequest) {
  return authedMcpRequest<McpApiClientCreateData>("/api/v1/mcp/api-clients", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function revokeMcpApiClient(clientId: string) {
  return authedMcpRequest<null>(`/api/v1/mcp/api-clients/${encodeURIComponent(clientId)}`, {
    method: "DELETE"
  });
}
