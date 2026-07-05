"use client";

import { useCallback, useEffect, useState } from "react";
import { useBrainX } from "@/components/brainx-provider";
import {
  getBrainxDesktopConfig,
  isElectronDesktop,
  type BrainxDesktopManualSyncConflictReport,
  type BrainxDesktopManualSyncJob,
  type BrainxDesktopVaultSyncMode,
  type BrainxDesktopVaultSyncPolicy,
} from "@/lib/desktop-bridge";
import {
  getDesktopVaultManualSyncConflictReport,
  getDesktopVaultSyncPolicy,
  getLatestDesktopVaultManualSyncJob,
  requestDesktopVaultManualSync,
  setDesktopVaultSyncPolicy,
} from "@/lib/desktop-vault";
import { cx } from "@/lib/utils";

type ConflictSelection = {
  conflictIndex: number;
  report: BrainxDesktopManualSyncConflictReport;
} | null;

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[12px] font-semibold transition disabled:pointer-events-none disabled:opacity-45",
        primary
          ? "bg-[#6c55f6] text-white hover:bg-[#5e49df]"
          : "border border-[#ded8cf] bg-white text-[#4d4944] hover:border-[#bdb5aa] hover:bg-[#fbfaf8]"
      )}
    >
      {children}
    </button>
  );
}

function formatSyncDate(value?: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusTone(status: BrainxDesktopManualSyncJob["status"]) {
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "CONFLICT") return "bg-amber-100 text-amber-700";
  if (status === "FAILED") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function statusAccent(status: BrainxDesktopManualSyncJob["status"]) {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50/70 text-emerald-800";
  if (status === "CONFLICT") return "border-amber-200 bg-amber-50/70 text-amber-800";
  if (status === "FAILED") return "border-rose-200 bg-rose-50/70 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toConflictSummary(conflict: Record<string, unknown>) {
  return {
    entityType: typeof conflict.entityType === "string" ? conflict.entityType : "unknown",
    localId: typeof conflict.localId === "string" ? conflict.localId : "-",
    remoteId: typeof conflict.remoteId === "string" ? conflict.remoteId : "-",
    reason: typeof conflict.reason === "string" ? conflict.reason : "Conflict detected during manual sync.",
    localUpdatedAt: typeof conflict.localUpdatedAt === "string" ? conflict.localUpdatedAt : null,
    remoteUpdatedAt: typeof conflict.remoteUpdatedAt === "string" ? conflict.remoteUpdatedAt : null,
  };
}

export function useDesktopVaultSyncStatus() {
  const [supported, setSupported] = useState(false);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [syncPolicy, setSyncPolicy] = useState<BrainxDesktopVaultSyncPolicy | null>(null);
  const [lastSyncJob, setLastSyncJob] = useState<BrainxDesktopManualSyncJob | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isElectronDesktop()) {
      setSupported(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [config, policy, job] = await Promise.all([
        getBrainxDesktopConfig(),
        getDesktopVaultSyncPolicy(),
        getLatestDesktopVaultManualSyncJob(),
      ]);
      if (!config?.activeVault || !policy) {
        setSupported(false);
        setVaultName(null);
        setSyncPolicy(null);
        setLastSyncJob(null);
        return;
      }
      setSupported(true);
      setVaultName(config.activeVault.name);
      setSyncPolicy(policy);
      setLastSyncJob(job);
    } catch {
      setSupported(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRefresh = () => {
      void refresh();
    };
    window.addEventListener("brainx-desktop-sync-updated", handleRefresh);
    return () => window.removeEventListener("brainx-desktop-sync-updated", handleRefresh);
  }, [refresh]);

  return { supported, vaultName, syncPolicy, lastSyncJob, loading, refresh, setSyncPolicy, setLastSyncJob };
}

function emitSyncUpdated(job: BrainxDesktopManualSyncJob | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("brainx-desktop-sync-updated", { detail: job }));
}

function DesktopVaultSyncConflictDetail({
  selection,
  onClose,
}: {
  selection: ConflictSelection;
  onClose: () => void;
}) {
  if (!selection) return null;
  const conflict = selection.report.conflicts[selection.conflictIndex];
  const summary = conflict ? toConflictSummary(conflict) : null;
  if (!summary) return null;

  return (
    <div className="mt-3 rounded-[10px] border border-[#f1d7a6] bg-[#fffaf1] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-[#7a4b00]">Conflict detail</div>
          <div className="mt-1 text-[11px] text-[#9a7b45]">Report generated {formatSyncDate(selection.report.generatedAt)}</div>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] font-semibold text-[#9a7b45] hover:text-[#7a4b00]">
          Close
        </button>
      </div>
      <div className="mt-3 space-y-2 text-[12px] text-[#4d4944]">
        <div><strong>Entity:</strong> {summary.entityType}</div>
        <div><strong>Reason:</strong> {summary.reason}</div>
        <div><strong>Local ID:</strong> {summary.localId}</div>
        <div><strong>Remote ID:</strong> {summary.remoteId}</div>
        {summary.localUpdatedAt ? <div><strong>Local updated:</strong> {formatSyncDate(summary.localUpdatedAt)}</div> : null}
        {summary.remoteUpdatedAt ? <div><strong>Remote updated:</strong> {formatSyncDate(summary.remoteUpdatedAt)}</div> : null}
      </div>
    </div>
  );
}

export function DesktopVaultSyncBanner({ className }: { className?: string }) {
  const { supported, syncPolicy, lastSyncJob, loading } = useDesktopVaultSyncStatus();

  if (!supported || loading || !syncPolicy || !lastSyncJob) {
    return null;
  }

  return (
    <div className={cx("rounded-2xl border px-4 py-3", statusAccent(lastSyncJob.status), className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold">
            Desktop sync {lastSyncJob.status.toLowerCase()} · {syncPolicy.mode === "local-only" ? "local only" : "manual cloud"}
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            {lastSyncJob.message} {lastSyncJob.completedAt ? `· ${formatSyncDate(lastSyncJob.completedAt)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-white/70 px-2.5 py-1">conflicts {lastSyncJob.conflicts?.length ?? 0}</span>
          <span className="rounded-full bg-white/70 px-2.5 py-1">failed {lastSyncJob.failedFiles?.length ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

export function DesktopVaultSyncStatusSection() {
  const { pushToast } = useBrainX();
  const { supported, vaultName, syncPolicy, lastSyncJob, refresh, setSyncPolicy, setLastSyncJob } = useDesktopVaultSyncStatus();
  const [savingMode, setSavingMode] = useState<BrainxDesktopVaultSyncMode | null>(null);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [conflictSelection, setConflictSelection] = useState<ConflictSelection>(null);

  if (!supported || !syncPolicy) {
    return null;
  }

  const updateMode = async (mode: BrainxDesktopVaultSyncMode) => {
    if (savingMode || mode === syncPolicy.mode) return;
    setSavingMode(mode);
    try {
      const next = await setDesktopVaultSyncPolicy({ mode });
      setSyncPolicy(next);
      pushToast(mode === "local-only" ? "로컬 전용 모드로 전환되었습니다." : "수동 클라우드 동기화 모드로 전환되었습니다.", "ok");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "동기화 모드를 변경하지 못했습니다.", "err");
    } finally {
      setSavingMode(null);
    }
  };

  const runManualSync = async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      const job = await requestDesktopVaultManualSync();
      setLastSyncJob(job);
      emitSyncUpdated(job);
      pushToast(job.message, job.status === "FAILED" ? "err" : job.status === "COMPLETED" ? "ok" : "info");
      await refresh();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "수동 동기화를 시작하지 못했습니다.", "err");
    } finally {
      setManualSyncing(false);
    }
  };

  const openConflictDetail = async (conflictIndex: number) => {
    if (!lastSyncJob?.jobId) return;
    const report = await getDesktopVaultManualSyncConflictReport(lastSyncJob.jobId);
    if (!report) {
      pushToast("충돌 리포트를 불러오지 못했습니다.", "err");
      return;
    }
    setConflictSelection({ conflictIndex, report });
  };

  return (
    <section className="mt-5 rounded-[12px] border border-[#e5e0d8] px-4 py-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-[#2f2d2a]">Desktop Vault Sync</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#6d6861]">
          Current vault <strong>{vaultName}</strong>. Local-only mode and manual cloud sync are separated so you can control when desktop data leaves the active vault.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <ActionButton primary={syncPolicy.mode === "local-only"} disabled={savingMode !== null} onClick={() => void updateMode("local-only")}>
          Local Only
        </ActionButton>
        <ActionButton primary={syncPolicy.mode === "manual-cloud"} disabled={savingMode !== null} onClick={() => void updateMode("manual-cloud")}>
          Manual Cloud Sync
        </ActionButton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#fbfaf8] px-3 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#36332f]">
            Current mode: {syncPolicy.mode === "local-only" ? "Local only" : "Manual cloud sync"}
          </div>
          <div className="mt-1 text-[11px] text-[#8c877f]">Last sync: {formatSyncDate(syncPolicy.lastSyncedAt)}</div>
        </div>
        <ActionButton onClick={() => void runManualSync()} disabled={manualSyncing || syncPolicy.mode !== "manual-cloud"}>
          {manualSyncing ? "Syncing..." : "Run manual sync"}
        </ActionButton>
      </div>

      {lastSyncJob && (
        <div className="mt-3 rounded-[10px] border border-[#e5e0d8] bg-white px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold text-[#36332f]">Latest sync result</div>
              <div className="mt-1 text-[11px] text-[#8c877f]">
                Started {formatSyncDate(lastSyncJob.startedAt)}
                {lastSyncJob.completedAt ? ` · Completed ${formatSyncDate(lastSyncJob.completedAt)}` : ""}
              </div>
            </div>
            <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-semibold", statusTone(lastSyncJob.status))}>
              {lastSyncJob.status}
            </span>
          </div>

          <p className="mt-2 text-[12px] leading-5 text-[#4d4944]">{lastSyncJob.message}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#6d6861]">
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">created notes {lastSyncJob.createdNotes?.length ?? 0}</span>
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">failed files {lastSyncJob.failedFiles?.length ?? 0}</span>
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">conflicts {lastSyncJob.conflicts?.length ?? 0}</span>
          </div>

          {!!lastSyncJob.failedFiles?.length && (
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-semibold text-[#36332f]">Failed files</div>
              {lastSyncJob.failedFiles.slice(0, 5).map((item, index) => (
                <div key={`${item.fileName ?? "file"}-${index}`} className="rounded-[8px] bg-[#fbfaf8] px-3 py-2 text-[12px] text-[#4d4944]">
                  <div className="font-medium">{item.fileName ?? "Unknown file"}</div>
                  <div className="mt-1 text-[11px] text-[#8c877f]">{item.reason ?? "Unknown error"}</div>
                </div>
              ))}
            </div>
          )}

          {!!lastSyncJob.conflicts?.length && (
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-semibold text-[#36332f]">Conflict summary</div>
              {lastSyncJob.conflicts.slice(0, 5).map((conflict, index) => {
                const summary = toConflictSummary(conflict);
                return (
                  <button
                    key={`${summary.localId}-${summary.remoteId}-${index}`}
                    type="button"
                    onClick={() => void openConflictDetail(index)}
                    className="block w-full rounded-[8px] bg-[#fff7e8] px-3 py-2 text-left text-[12px] text-[#4d4944] transition hover:bg-[#ffefcb]"
                  >
                    <div className="font-medium">{summary.entityType} conflict</div>
                    <div className="mt-1 text-[11px] text-[#8c877f]">{summary.reason}</div>
                    <div className="mt-1 text-[11px] text-[#8c877f]">local {summary.localId} · remote {summary.remoteId}</div>
                  </button>
                );
              })}
              {(lastSyncJob.conflicts?.length ?? 0) > 5 && (
                <div className="text-[11px] text-[#8c877f]">See the full report in the active vault under `.brainx/conflicts/`.</div>
              )}
              <DesktopVaultSyncConflictDetail selection={conflictSelection} onClose={() => setConflictSelection(null)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
