"use client";

import { Suspense, useMemo, useState } from "react";
import { Check, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { buildAuthPath, readAuthSession } from "@/lib/auth-api";
import {
  McpOAuthAuthRequiredError,
  createMcpOAuthAuthorization,
} from "@/lib/mcp-oauth-api";
import { AuthShell } from "@/components/public/auth-shared";
import { Btn } from "@/components/brainx-ui";

const SCOPE_LABELS: Record<string, string> = {
  whoami: "본인 확인",
  "notes:read": "노트 읽기",
  "ai:search": "AI 검색",
  "notes:write": "노트 쓰기",
};

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => {
    const scope = searchParams.get("scope") ?? "";
    return {
      clientId: searchParams.get("client_id") ?? "",
      redirectUri: searchParams.get("redirect_uri") ?? "",
      responseType: searchParams.get("response_type") ?? "",
      scope,
      state: searchParams.get("state"),
      codeChallenge: searchParams.get("code_challenge") ?? "",
      codeChallengeMethod: searchParams.get("code_challenge_method") ?? "",
      resource: searchParams.get("resource"),
      scopeItems: scope.split(/\s+/).map((item) => item.trim()).filter(Boolean),
    };
  }, [searchParams]);

  const currentUrl = useMemo(() => {
    if (typeof window === "undefined") return "/oauth/authorize";
    return `${window.location.pathname}${window.location.search}`;
  }, []);

  const session = readAuthSession();
  const missingFields = [
    request.responseType === "code" ? "" : "response_type=code",
    request.clientId ? "" : "client_id",
    request.redirectUri ? "" : "redirect_uri",
    request.codeChallenge ? "" : "code_challenge",
    request.codeChallengeMethod === "S256" ? "" : "code_challenge_method=S256",
  ].filter(Boolean);

  const reject = () => {
    if (!request.redirectUri) {
      router.replace("/settings");
      return;
    }
    const target = new URL(request.redirectUri);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("error_description", "BrainX MCP access was denied.");
    if (request.state) target.searchParams.set("state", request.state);
    window.location.href = target.toString();
  };

  const approve = async () => {
    if (missingFields.length > 0 || submitting) return;
    if (!session?.accessToken) {
      router.replace(buildAuthPath("/login", currentUrl));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await createMcpOAuthAuthorization({
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        scope: request.scope,
        state: request.state,
        codeChallenge: request.codeChallenge,
        codeChallengeMethod: request.codeChallengeMethod,
        resource: request.resource,
      });
      window.location.href = data.redirectTo;
    } catch (err) {
      if (err instanceof McpOAuthAuthRequiredError) {
        router.replace(buildAuthPath("/login", currentUrl));
        return;
      }
      setError(err instanceof Error ? err.message : "MCP 연결 승인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-line/60 bg-surface2/60 text-primary">
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-[27px] font-bold tracking-tight text-txt">BrainX MCP 연결 승인</h1>
      <p className="mb-6 break-keep text-[15px] leading-relaxed text-txt2">
        외부 AI 도구가 BrainX의 MCP 기능을 사용할 수 있도록 접근 권한을 확인합니다.
      </p>

      <div className="mb-4 rounded-[12px] border border-line/60 bg-surface2/35 p-4">
        <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-txt">
          <LockKeyhole size={16} aria-hidden="true" />
          연결 요청
        </div>
        <InfoRow label="클라이언트" value={request.clientId || "알 수 없음"} />
        <InfoRow label="연결 주소" value={request.resource || "/mcp"} />
        <InfoRow label="돌아갈 주소" value={request.redirectUri || "없음"} />
      </div>

      <div className="mb-5 rounded-[12px] border border-line/60 bg-surface2/35 p-4">
        <div className="mb-3 text-[14px] font-semibold text-txt">요청 권한</div>
        {request.scopeItems.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {request.scopeItems.map((scope) => (
              <span
                key={scope}
                className="inline-flex items-center gap-1.5 rounded-[999px] border border-line/60 bg-surface px-2.5 py-1 text-[12.5px] font-medium text-txt2"
              >
                <Check size={13} aria-hidden="true" />
                {SCOPE_LABELS[scope] ?? scope}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-txt3">기본 MCP 권한을 요청합니다.</p>
        )}
      </div>

      {missingFields.length > 0 ? (
        <div className="mb-4 rounded-[12px] border border-red-300/70 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          잘못된 연결 요청입니다: {missingFields.join(", ")}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-300/70 bg-red-50 px-3.5 py-3 text-[13px] leading-relaxed text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {!session?.accessToken ? (
        <div className="mb-4 rounded-[12px] border border-line/60 bg-surface2/35 px-3.5 py-3 text-[13px] leading-relaxed text-txt2">
          연결을 승인하려면 BrainX 계정으로 로그인해야 합니다.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Btn variant="soft" size="lg" onClick={reject} disabled={submitting}>
          <X size={16} aria-hidden="true" />
          거부
        </Btn>
        <Btn variant="primary" size="lg" onClick={approve} disabled={missingFields.length > 0 || submitting}>
          {submitting ? "승인 중..." : "승인"}
        </Btn>
      </div>
    </AuthShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-line/50 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="text-[12.5px] font-medium text-txt3">{label}</div>
      <div className="min-w-0 truncate font-mono text-[12.5px] text-txt2" title={value}>
        {value}
      </div>
    </div>
  );
}

export default function McpOAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeContent />
    </Suspense>
  );
}
