"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useBrainX } from "@/components/brainx-provider";
import { Icon } from "@/components/brainx-ui";
import {
  McpAuthRequiredError,
  createMcpApiClient,
  listMcpApiClients,
  revokeMcpApiClient,
  type McpApiClientItem
} from "@/lib/mcp-api";
import { cx } from "@/lib/utils";

type McpApiKeysPanelVariant = "page" | "modal";
type ExpirationOption = "30d" | "90d" | "365d" | "none";
type ClientStatus = "active" | "expired" | "revoked";

const MCP_NOTE_TOOL_SCOPES = ["whoami", "notes:read", "ai:search", "notes:write"] as const;
const MCP_NOTE_TOOL_SCOPE_LABEL = MCP_NOTE_TOOL_SCOPES.join(", ");
const MCP_NOTE_TOOL_LABEL = "brainx_whoami, brainx_search_notes, brainx_get_note, brainx_create_note";
const EXPIRATION_OPTIONS: { value: ExpirationOption; label: string; days: number | null }[] = [
  { value: "30d", label: "30일", days: 30 },
  { value: "90d", label: "90일", days: 90 },
  { value: "365d", label: "1년", days: 365 },
  { value: "none", label: "만료 없음", days: null }
];

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function McpApiKeysPanel({
  variant = "page",
  className = ""
}: {
  variant?: McpApiKeysPanelVariant;
  className?: string;
}) {
  const router = useRouter();
  const { pushToast } = useBrainX();
  const nameId = useId();
  const expirationId = useId();
  const fieldErrorId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [clients, setClients] = useState<McpApiClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [expiration, setExpiration] = useState<ExpirationOption>("90d");
  const [creating, setCreating] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [issuedKey, setIssuedKey] = useState<{ clientId: string; apiKeyOnce: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<McpApiClientItem | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [mcpEndpoint, setMcpEndpoint] = useState("/mcp");

  const tone = panelTone(variant);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMcpEndpoint(`${window.location.origin}/mcp`);
    }
  }, []);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof McpAuthRequiredError) {
        pushToast(err.message, "err");
        router.replace("/login");
        return true;
      }
      return false;
    },
    [pushToast, router]
  );

  const loadClients = useCallback(
    async (initial = false) => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError("");
      try {
        const data = await listMcpApiClients();
        setClients(data.clients);
      } catch (err) {
        if (handleAuthError(err)) return;
        const message = err instanceof Error ? err.message : "MCP API key 목록을 불러오지 못했습니다.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleAuthError]
  );

  useEffect(() => {
    void loadClients(true);
  }, [loadClients]);

  const copyValue = async (value: string, successMessage: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      pushToast(successMessage, "ok");
    } catch {
      pushToast("복사하지 못했습니다. 직접 선택해 복사해 주세요.", "err");
    }
  };

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = clientName.trim();
    if (!nextName) {
      setFieldError("API key 이름을 입력해 주세요.");
      nameInputRef.current?.focus();
      return;
    }

    setCreating(true);
    setFieldError("");
    try {
      const created = await createMcpApiClient({
        name: nextName,
        scopes: [...MCP_NOTE_TOOL_SCOPES],
        expiresAt: expiresAtFromOption(expiration)
      });
      setIssuedKey(created);
      setClientName("");
      setExpiration("90d");
      pushToast("API key를 생성했습니다. 지금 복사해 주세요.", "ok");
      await loadClients(false);
    } catch (err) {
      if (handleAuthError(err)) return;
      const message = err instanceof Error ? err.message : "API key 생성에 실패했습니다. 입력값을 확인해 주세요.";
      setFieldError(message);
      nameInputRef.current?.focus();
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!pendingRevoke) return;
    setRevokingId(pendingRevoke.clientId);
    try {
      await revokeMcpApiClient(pendingRevoke.clientId);
      pushToast("API key를 폐기했습니다.", "ok");
      setPendingRevoke(null);
      await loadClients(false);
    } catch (err) {
      if (handleAuthError(err)) return;
      pushToast(err instanceof Error ? err.message : "API key 폐기에 실패했습니다.", "err");
    } finally {
      setRevokingId(null);
    }
  };

  const liveMessage = loading
    ? "MCP API key 목록을 불러오는 중…"
    : error
      ? error
      : `${clients.length}개 MCP API key`;
  const authHeaderValue = issuedKey ? `Authorization: Bearer ${issuedKey.apiKeyOnce}` : "Authorization: Bearer bxk_live_...";

  return (
    <section className={cx(tone.panel, className)} aria-labelledby="mcp-api-keys-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cx("text-[12px] font-semibold uppercase tracking-[0.08em]", tone.eyebrow)}>Agent Access</p>
          <h2 id="mcp-api-keys-title" className={cx("mt-1 text-[20px] font-bold text-pretty", tone.heading)}>
            MCP API Keys
          </h2>
          <p className={cx("mt-1 max-w-2xl text-[13px] leading-relaxed", tone.muted)}>
            외부 MCP client와 agent가 BrainX에 접근할 때 사용하는 scoped key를 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadClients(false)}
          disabled={loading || refreshing}
          className={cx(tone.secondaryButton, "h-9 px-3 text-[12px]")}
        >
          <span aria-hidden="true"><Icon name="refresh" size={14} /></span>
          {refreshing ? "새로고침 중…" : "새로고침"}
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <form onSubmit={submitClient} className={cx("min-w-0 rounded-xl border p-4", tone.innerPanel)} noValidate>
          <div className="flex items-start gap-3">
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone.iconBox)} aria-hidden="true">
              <Icon name="shield" size={17} />
            </span>
            <div className="min-w-0">
              <h3 className={cx("text-[15px] font-semibold", tone.heading)}>새 API Key 생성</h3>
              <p className={cx("mt-1 text-[12px] leading-relaxed", tone.muted)}>
                Codex 노트 도구 권한은 <span translate="no" className={tone.codeText}>{MCP_NOTE_TOOL_SCOPE_LABEL}</span>로 발급됩니다.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label htmlFor={nameId} className={cx("text-[12px] font-semibold", tone.label)}>
              이름
            </label>
            <input
              ref={nameInputRef}
              id={nameId}
              name="mcp-api-key-name"
              type="text"
              value={clientName}
              onChange={(event) => {
                setClientName(event.target.value);
                if (fieldError) setFieldError("");
              }}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? fieldErrorId : undefined}
              placeholder="예: Desktop Agent…"
              className={cx(tone.input, "h-10 w-full px-3 text-[13px]")}
            />
            {fieldError ? (
              <p id={fieldErrorId} aria-live="polite" className="text-[12px] font-medium text-red-500">
                {fieldError}
              </p>
            ) : null}

            <label htmlFor={expirationId} className={cx("text-[12px] font-semibold", tone.label)}>
              만료 기간
            </label>
            <select
              id={expirationId}
              name="mcp-api-key-expiration"
              value={expiration}
              onChange={(event) => setExpiration(event.target.value as ExpirationOption)}
              autoComplete="off"
              className={cx(tone.input, "h-10 w-full px-3 text-[13px]")}
            >
              {EXPIRATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button type="submit" disabled={creating} className={cx(tone.primaryButton, "mt-1 h-10 px-3 text-[13px]")}>
              <span aria-hidden="true"><Icon name="plus" size={15} /></span>
              {creating ? "API Key 생성 중…" : "API Key 생성"}
            </button>
          </div>
        </form>

        <div className={cx("min-w-0 rounded-xl border p-4", tone.innerPanel)}>
          <div className="flex items-start gap-3">
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone.iconBox)} aria-hidden="true">
              <Icon name="globe" size={17} />
            </span>
            <div className="min-w-0">
              <h3 className={cx("text-[15px] font-semibold", tone.heading)}>연결 정보</h3>
              <p className={cx("mt-1 text-[12px] leading-relaxed", tone.muted)}>
                MCP Inspector나 agent client에서 아래 endpoint와 Bearer header를 사용합니다.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <CopyRow
              label="Endpoint"
              value={mcpEndpoint}
              onCopy={() => copyValue(mcpEndpoint, "MCP endpoint를 복사했습니다.")}
              tone={tone}
            />
            <CopyRow
              label="Header"
              value={authHeaderValue}
              onCopy={() => copyValue(authHeaderValue, "Authorization header를 복사했습니다.")}
              tone={tone}
            />
            <CopyRow
              label="Tools"
              value={MCP_NOTE_TOOL_LABEL}
              onCopy={() => copyValue(MCP_NOTE_TOOL_LABEL, "Tool 목록을 복사했습니다.")}
              tone={tone}
            />
          </div>
        </div>
      </div>

      {issuedKey ? (
        <div className={cx("mt-4 rounded-xl border p-4", tone.successPanel)} aria-live="polite">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className={cx("text-[14px] font-semibold", tone.heading)}>새 API key가 생성되었습니다</h3>
              <p className={cx("mt-1 text-[12px] leading-relaxed", tone.muted)}>
                이 값은 한 번만 표시됩니다. 닫으면 다시 볼 수 없습니다.
              </p>
            </div>
            <button
              type="button"
              aria-label="생성된 API key 닫기"
              onClick={() => setIssuedKey(null)}
              className={cx(tone.iconButton, "h-8 w-8")}
            >
              <span aria-hidden="true"><Icon name="x" size={15} /></span>
            </button>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <code translate="no" className={cx("min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[12px]", tone.codeBlock)}>
              {issuedKey.apiKeyOnce}
            </code>
            <button
              type="button"
              aria-label="생성된 API key 복사"
              onClick={() => copyValue(issuedKey.apiKeyOnce, "API key를 복사했습니다.")}
              className={cx(tone.iconButton, "h-9 w-9")}
            >
              <span aria-hidden="true"><Icon name="copy" size={15} /></span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={cx("text-[15px] font-semibold", tone.heading)}>발급된 API Keys</h3>
          <p aria-live="polite" className={cx("text-[12px]", tone.muted)}>
            {liveMessage}
          </p>
        </div>

        <div className={cx("mt-3 overflow-hidden rounded-xl border", tone.list)}>
          {loading ? <StateRow tone={tone} message="MCP API key 목록을 불러오는 중…" /> : null}
          {!loading && error ? (
            <StateRow
              tone={tone}
              message={error}
              action={
                <button type="button" onClick={() => void loadClients(false)} className={cx(tone.secondaryButton, "h-8 px-3 text-[12px]")}>
                  다시 시도
                </button>
              }
            />
          ) : null}
          {!loading && !error && clients.length === 0 ? (
            <StateRow tone={tone} message="아직 발급된 MCP API key가 없습니다." />
          ) : null}
          {!loading && !error
            ? clients.map((client) => (
                <ClientRow
                  key={client.clientId}
                  client={client}
                  tone={tone}
                  revoking={revokingId === client.clientId}
                  onRevoke={() => setPendingRevoke(client)}
                />
              ))
            : null}
        </div>
      </div>

      {pendingRevoke ? (
        <RevokeConfirmDialog
          client={pendingRevoke}
          busy={revokingId === pendingRevoke.clientId}
          onCancel={() => setPendingRevoke(null)}
          onConfirm={confirmRevoke}
        />
      ) : null}
    </section>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  tone
}: {
  label: string;
  value: string;
  onCopy: () => void;
  tone: ReturnType<typeof panelTone>;
}) {
  return (
    <div className={cx("flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2", tone.copyRow)}>
      <div className="min-w-0 flex-1">
        <div className={cx("text-[11px] font-semibold", tone.label)}>{label}</div>
        <code translate="no" className={cx("mt-0.5 block truncate text-[12px]", tone.codeText)}>
          {value}
        </code>
      </div>
      <button type="button" aria-label={`${label} 복사`} onClick={onCopy} className={cx(tone.iconButton, "h-8 w-8")}>
        <span aria-hidden="true"><Icon name="copy" size={14} /></span>
      </button>
    </div>
  );
}

function ClientRow({
  client,
  tone,
  revoking,
  onRevoke
}: {
  client: McpApiClientItem;
  tone: ReturnType<typeof panelTone>;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const status = getClientStatus(client);
  const badge = statusBadge(status, tone);
  const revokeDisabled = status === "revoked" || revoking;
  const scopeLabel = client.scopes.join(", ") || MCP_NOTE_TOOL_SCOPE_LABEL;

  return (
    <div className={cx("flex min-w-0 flex-col gap-3 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between", tone.row)}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className={cx("min-w-0 truncate text-[14px] font-semibold", tone.heading)}>{client.name || "이름 없음"}</p>
          <span className={badge.className}>{badge.label}</span>
          <span className={cx("max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.scopeBadge)} title={scopeLabel} translate="no">
            {scopeLabel}
          </span>
        </div>
        <code translate="no" className={cx("mt-1 block truncate text-[12px]", tone.codeText)}>
          {client.clientId}
        </code>
        <div className={cx("mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]", tone.muted)}>
          <span>생성 {formatDate(client.createdAt)}</span>
          <span>최근 사용 {formatDate(client.lastUsedAt, "없음")}</span>
          <span>만료 {formatDate(client.expiresAt, "없음")}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        disabled={revokeDisabled}
        className={cx(tone.dangerButton, "h-8 shrink-0 px-3 text-[12px]")}
      >
        <span aria-hidden="true"><Icon name="trash" size={14} /></span>
        {revoking ? "폐기 중…" : "폐기"}
      </button>
    </div>
  );
}

function StateRow({
  tone,
  message,
  action
}: {
  tone: ReturnType<typeof panelTone>;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={cx("flex min-h-[84px] items-center justify-between gap-3 px-4 py-4 text-[13px]", tone.muted)}>
      <span>{message}</span>
      {action}
    </div>
  );
}

function RevokeConfirmDialog({
  client,
  busy,
  onCancel,
  onConfirm
}: {
  client: McpApiClientItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/55 p-4"
      role="presentation"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-[min(380px,calc(100vw-32px))] rounded-xl border border-line/60 bg-surface p-4 text-txt shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[16px] font-bold text-pretty">
          API key를 폐기할까요?
        </h2>
        <p id={descriptionId} className="mt-2 text-[13px] leading-relaxed text-txt3">
          <span className="font-semibold text-txt">{client.name || client.clientId}</span> key는 즉시 사용할 수 없게 됩니다.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-line/60 px-3 text-[13px] font-semibold text-txt2 transition-colors hover:bg-surface2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:cursor-wait disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-[13px] font-bold text-white transition-colors hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:cursor-wait disabled:opacity-60"
          >
            <span aria-hidden="true"><Icon name="trash" size={14} /></span>
            {busy ? "폐기 중…" : "폐기"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function expiresAtFromOption(option: ExpirationOption) {
  const selected = EXPIRATION_OPTIONS.find((item) => item.value === option);
  if (!selected?.days) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + selected.days);
  return expiresAt.toISOString();
}

function getClientStatus(client: McpApiClientItem): ClientStatus {
  if (client.revokedAt) return "revoked";
  if (client.expiresAt && Date.parse(client.expiresAt) <= Date.now()) return "expired";
  return "active";
}

function statusBadge(status: ClientStatus, tone: ReturnType<typeof panelTone>) {
  if (status === "revoked") {
    return { label: "폐기됨", className: cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.revokedBadge) };
  }
  if (status === "expired") {
    return { label: "만료됨", className: cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.expiredBadge) };
  }
  return { label: "활성", className: cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone.activeBadge) };
}

function formatDate(value: string | null, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return dateFormatter.format(date);
}

function panelTone(variant: McpApiKeysPanelVariant) {
  if (variant === "modal") {
    return {
      panel: "rounded-xl border border-[#e5e0d8] bg-white p-5 text-[#36332f]",
      innerPanel: "border-[#e5e0d8] bg-[#fbfaf8]",
      list: "border-[#e5e0d8] bg-white",
      row: "border-[#eee8df]",
      copyRow: "border-[#e5e0d8] bg-white",
      successPanel: "border-[#bfd8cb] bg-[#f3faf6]",
      iconBox: "bg-[#eeeafe] text-[#6c55f6]",
      heading: "text-[#36332f]",
      muted: "text-[#6d6861]",
      label: "text-[#5f5a52]",
      eyebrow: "text-[#6c55f6]",
      codeText: "font-mono text-[#4a36aa]",
      codeBlock: "bg-white text-[#4a36aa] ring-1 ring-[#d8d0c4]",
      input: "rounded-lg border border-[#ded8cf] bg-white text-[#36332f] outline-none transition-colors placeholder:text-[#aaa39a] focus-visible:border-[#6c55f6] focus-visible:ring-2 focus-visible:ring-[#6c55f6]/25",
      primaryButton: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#6c55f6] font-bold text-white transition-colors hover:bg-[#5945e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c55f6]/40 disabled:cursor-wait disabled:opacity-60",
      secondaryButton: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#ded8cf] bg-white font-semibold text-[#5f5a52] transition-colors hover:bg-[#f2efea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c55f6]/30 disabled:cursor-wait disabled:opacity-60",
      dangerButton: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50",
      iconButton: "grid place-items-center rounded-lg text-[#6d6861] transition-colors hover:bg-[#f2efea] hover:text-[#36332f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c55f6]/30",
      scopeBadge: "bg-[#eeeafe] text-[#6c55f6]",
      activeBadge: "bg-emerald-50 text-emerald-700",
      expiredBadge: "bg-amber-50 text-amber-700",
      revokedBadge: "bg-red-50 text-red-700"
    };
  }

  return {
    panel: "rounded-2xl border border-line/60 bg-surface p-5 text-txt shadow-soft",
    innerPanel: "border-line/60 bg-surface2/35",
    list: "border-line/60 bg-surface/80",
    row: "border-line/50",
    copyRow: "border-line/60 bg-surface/70",
    successPanel: "border-emerald-400/35 bg-emerald-500/10",
    iconBox: "bg-primary/15 text-primary",
    heading: "text-txt",
    muted: "text-txt3",
    label: "text-txt2",
    eyebrow: "text-primary",
    codeText: "font-mono text-primary",
    codeBlock: "bg-bg/40 text-primary ring-1 ring-line/50",
    input: "rounded-lg border border-line/60 bg-surface text-txt outline-none transition-colors placeholder:text-txt3 focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/35",
    primaryButton: "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-wait disabled:opacity-60",
    secondaryButton: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/60 bg-surface2/55 font-semibold text-txt2 transition-colors hover:bg-surface2 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait disabled:opacity-60",
    dangerButton: "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/10 font-semibold text-red-300 transition-colors hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:cursor-not-allowed disabled:opacity-50",
    iconButton: "grid place-items-center rounded-lg text-txt3 transition-colors hover:bg-surface2 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    scopeBadge: "bg-primary/15 text-primary",
    activeBadge: "bg-emerald-500/15 text-emerald-300",
    expiredBadge: "bg-amber-500/15 text-amber-300",
    revokedBadge: "bg-red-500/15 text-red-300"
  };
}
