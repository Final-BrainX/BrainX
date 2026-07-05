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
  if (!value) return "아직 동기화되지 않음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusTone(status: BrainxDesktopManualSyncJob["status"]) {
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "CONFLICT") return "bg-amber-100 text-amber-700";
  if (status === "FAILED") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function toConflictSummary(conflict: Record<string, unknown>) {
  return {
    entityType: typeof conflict.entityType === "string" ? conflict.entityType : "unknown",
    localId: typeof conflict.localId === "string" ? conflict.localId : "-",
    remoteId: typeof conflict.remoteId === "string" ? conflict.remoteId : "-",
    reason: typeof conflict.reason === "string" ? conflict.reason : "수동 동기화 중 충돌이 감지되었습니다.",
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
          <div className="text-[12px] font-semibold text-[#7a4b00]">충돌 상세</div>
          <div className="mt-1 text-[11px] text-[#9a7b45]">리포트 생성 {formatSyncDate(selection.report.generatedAt)}</div>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] font-semibold text-[#9a7b45] hover:text-[#7a4b00]">
          닫기
        </button>
      </div>
      <div className="mt-3 space-y-2 text-[12px] text-[#4d4944]">
        <div><strong>대상:</strong> {summary.entityType}</div>
        <div><strong>사유:</strong> {summary.reason}</div>
        <div><strong>로컬 ID:</strong> {summary.localId}</div>
        <div><strong>원격 ID:</strong> {summary.remoteId}</div>
        {summary.localUpdatedAt ? <div><strong>로컬 수정:</strong> {formatSyncDate(summary.localUpdatedAt)}</div> : null}
        {summary.remoteUpdatedAt ? <div><strong>원격 수정:</strong> {formatSyncDate(summary.remoteUpdatedAt)}</div> : null}
      </div>
    </div>
  );
}

export function DesktopVaultSyncBanner({ className }: { className?: string }) {
  void className;
  return null;
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
      pushToast(mode === "local-only" ? "로컬 전용 모드로 전환했습니다." : "수동 클라우드 동기화 모드로 전환했습니다.", "ok");
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
      if (typeof window !== "undefined" && (job.status === "COMPLETED" || job.status === "CONFLICT" || job.status === "SKIPPED")) {
        window.dispatchEvent(new CustomEvent("brainx:notes-refresh", { detail: { syncRefresh: true } }));
      }
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
        <h2 className="text-[14px] font-bold text-[#2f2d2a]">데스크톱 볼트 동기화</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#6d6861]">
          현재 볼트는 <strong>{vaultName}</strong>입니다. 로컬 전용과 수동 클라우드 동기화를 분리해서 데스크톱 데이터가 언제 외부로 나가는지 직접 제어할 수 있습니다.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <ActionButton primary={syncPolicy.mode === "local-only"} disabled={savingMode !== null} onClick={() => void updateMode("local-only")}>
          로컬 전용
        </ActionButton>
        <ActionButton primary={syncPolicy.mode === "manual-cloud"} disabled={savingMode !== null} onClick={() => void updateMode("manual-cloud")}>
          수동 클라우드 동기화
        </ActionButton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#fbfaf8] px-3 py-3">
        <div>
          <div className="text-[12px] font-semibold text-[#36332f]">
            현재 모드: {syncPolicy.mode === "local-only" ? "로컬 전용" : "수동 클라우드 동기화"}
          </div>
          <div className="mt-1 text-[11px] text-[#8c877f]">마지막 동기화: {formatSyncDate(syncPolicy.lastSyncedAt)}</div>
        </div>
        <ActionButton onClick={() => void runManualSync()} disabled={manualSyncing || syncPolicy.mode !== "manual-cloud"}>
          {manualSyncing ? "동기화 중..." : "수동 동기화 실행"}
        </ActionButton>
      </div>

      {lastSyncJob && (
        <div className="mt-3 rounded-[10px] border border-[#e5e0d8] bg-white px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold text-[#36332f]">최근 동기화 결과</div>
              <div className="mt-1 text-[11px] text-[#8c877f]">
                시작 {formatSyncDate(lastSyncJob.startedAt)}
                {lastSyncJob.completedAt ? ` · 완료 ${formatSyncDate(lastSyncJob.completedAt)}` : ""}
              </div>
            </div>
            <span className={cx("rounded-full px-2.5 py-1 text-[11px] font-semibold", statusTone(lastSyncJob.status))}>
              {lastSyncJob.status}
            </span>
          </div>

          <p className="mt-2 text-[12px] leading-5 text-[#4d4944]">{lastSyncJob.message}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#6d6861]">
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">생성 노트 {lastSyncJob.createdNotes?.length ?? 0}</span>
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">실패 파일 {lastSyncJob.failedFiles?.length ?? 0}</span>
            <span className="rounded-full bg-[#f4f0e8] px-2.5 py-1">충돌 {lastSyncJob.conflicts?.length ?? 0}</span>
          </div>

          {!!lastSyncJob.failedFiles?.length && (
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-semibold text-[#36332f]">실패 파일</div>
              {lastSyncJob.failedFiles.slice(0, 5).map((item, index) => (
                <div key={`${item.fileName ?? "file"}-${index}`} className="rounded-[8px] bg-[#fbfaf8] px-3 py-2 text-[12px] text-[#4d4944]">
                  <div className="font-medium">{item.fileName ?? "알 수 없는 파일"}</div>
                  <div className="mt-1 text-[11px] text-[#8c877f]">{item.reason ?? "알 수 없는 오류"}</div>
                </div>
              ))}
            </div>
          )}

          {!!lastSyncJob.conflicts?.length && (
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-semibold text-[#36332f]">충돌 요약</div>
              {lastSyncJob.conflicts.slice(0, 5).map((conflict, index) => {
                const summary = toConflictSummary(conflict);
                return (
                  <button
                    key={`${summary.localId}-${summary.remoteId}-${index}`}
                    type="button"
                    onClick={() => void openConflictDetail(index)}
                    className="block w-full rounded-[8px] bg-[#fff7e8] px-3 py-2 text-left text-[12px] text-[#4d4944] transition hover:bg-[#ffefcb]"
                  >
                    <div className="font-medium">{summary.entityType} 충돌</div>
                    <div className="mt-1 text-[11px] text-[#8c877f]">{summary.reason}</div>
                    <div className="mt-1 text-[11px] text-[#8c877f]">로컬 {summary.localId} · 원격 {summary.remoteId}</div>
                  </button>
                );
              })}
              {(lastSyncJob.conflicts?.length ?? 0) > 5 && (
                <div className="text-[11px] text-[#8c877f]">전체 리포트는 active vault의 `.brainx/conflicts/` 아래에서 확인할 수 있습니다.</div>
              )}
              <DesktopVaultSyncConflictDetail selection={conflictSelection} onClose={() => setConflictSelection(null)} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
