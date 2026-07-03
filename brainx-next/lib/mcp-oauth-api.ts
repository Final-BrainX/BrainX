"use client";

import { clearAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type McpOAuthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string | null;
};

export type McpOAuthAuthorizationData = {
  redirectTo: string;
  expiresAt: string;
};

export class McpOAuthAuthRequiredError extends Error {
  constructor(message = "로그인이 만료되었습니다. 다시 로그인해 주세요.") {
    super(message);
    this.name = "McpOAuthAuthRequiredError";
  }
}

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

export async function createMcpOAuthAuthorization(payload: McpOAuthAuthorizationRequest) {
  const session = readAuthSession();
  if (!session?.accessToken) {
    throw new McpOAuthAuthRequiredError("로그인이 필요합니다.");
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/oauth/authorizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => null)) as ApiResponse<McpOAuthAuthorizationData> | null;
  if (response.status === 401 || response.status === 403) {
    clearAuthSession();
    throw new McpOAuthAuthRequiredError();
  }
  if (!body) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !body.success) {
    throw new Error(messageFromResponse(body, "MCP 연결 승인에 실패했습니다."));
  }
  return body.data as McpOAuthAuthorizationData;
}
