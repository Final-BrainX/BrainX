"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { InitialTab } from "@/components/notes/NotesWorkspace";
import { getBrainxDesktopConfig, isElectronDesktop, type BrainxDesktopVaultSummary } from "@/lib/desktop-bridge";
import { chooseDesktopVaultDirectory, createDesktopVault, listDesktopVaults } from "@/lib/desktop-vault";
import { getNoteById } from "@/lib/notes/mockNotes";
import { USE_MOCK_NOTES } from "@/lib/workspace-api";

const NotesWorkspace = dynamic(() => import("@/components/notes/NotesWorkspace"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-txt3">노트 워크스페이스 로딩 중...</div>,
});

function VaultSelectionGate({
  recentVaults,
  isBusy,
  error,
  onCreateVault,
  onChooseVault,
}: {
  recentVaults: BrainxDesktopVaultSummary[];
  isBusy: boolean;
  error: string | null;
  onCreateVault: () => void;
  onChooseVault: () => void;
}) {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-[560px] rounded-[28px] border border-line/60 bg-surface/95 p-7 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.24em] text-primary/80">Local Vault</div>
        <h1 className="text-2xl font-semibold text-txt">BrainX Desktop를 시작하려면 vault를 먼저 선택해야 합니다.</h1>
        <p className="mt-3 text-[14px] leading-6 text-txt2">
          이 vault가 앞으로 노트, 첨부 자산, 내보내기 파일의 로컬 저장 기준 경로가 됩니다.
        </p>
        {recentVaults.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-line/50 bg-surface2/40 p-4">
            <div className="mb-2 text-[12px] font-medium text-txt2">최근 vault</div>
            <div className="space-y-2">
              {recentVaults.slice(0, 3).map((vault) => (
                <div key={vault.id} className="rounded-xl border border-line/40 px-3 py-2">
                  <div className="text-[13px] font-medium text-txt">{vault.name}</div>
                  <div className="truncate text-[11px] text-txt3">{vault.vaultPath}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {error ? <div className="mt-4 text-[12px] font-medium text-red-400">{error}</div> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onCreateVault}
            disabled={isBusy}
            className="rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-black transition-opacity disabled:opacity-60"
          >
            새 vault 만들기
          </button>
          <button
            type="button"
            onClick={onChooseVault}
            disabled={isBusy}
            className="rounded-xl border border-line/60 px-4 py-2 text-[13px] font-semibold text-txt transition-colors hover:bg-surface2/60 disabled:opacity-60"
          >
            기존 vault 열기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotesLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const id = pathname === "/notes" ? null : pathname.replace(/^\/notes\//, "");
  const [isDesktopVaultMode, setIsDesktopVaultMode] = useState(false);
  const [isVaultReady, setIsVaultReady] = useState(false);
  const [recentVaults, setRecentVaults] = useState<BrainxDesktopVaultSummary[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadVaultState() {
      if (!isElectronDesktop()) {
        setIsVaultReady(true);
        return;
      }

      try {
        const [config, vaults] = await Promise.all([getBrainxDesktopConfig(), listDesktopVaults()]);
        if (!active) return;
        setIsDesktopVaultMode(true);
        setRecentVaults(vaults);
        setIsVaultReady(Boolean(config?.activeVault));
      } catch (error) {
        if (!active) return;
        setIsDesktopVaultMode(true);
        setVaultError(error instanceof Error ? error.message : "로컬 vault 정보를 불러오지 못했습니다.");
      }
    }

    void loadVaultState();
    return () => {
      active = false;
    };
  }, []);

  const refreshVaultState = async () => {
    const [config, vaults] = await Promise.all([getBrainxDesktopConfig(), listDesktopVaults()]);
    setRecentVaults(vaults);
    setIsVaultReady(Boolean(config?.activeVault));
  };

  const handleCreateVault = async () => {
    try {
      setIsBusy(true);
      setVaultError(null);
      await createDesktopVault("BrainX Vault");
      await refreshVaultState();
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "새 vault를 만들지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleChooseVault = async () => {
    try {
      setIsBusy(true);
      setVaultError(null);
      await chooseDesktopVaultDirectory();
      await refreshVaultState();
    } catch (error) {
      setVaultError(error instanceof Error ? error.message : "기존 vault를 열지 못했습니다.");
    } finally {
      setIsBusy(false);
    }
  };

  const initialTab: InitialTab = id && (!USE_MOCK_NOTES || getNoteById(id)) ? { kind: "note", noteId: id } : { kind: "start" };

  if (isDesktopVaultMode && !isVaultReady) {
    return (
      <VaultSelectionGate
        recentVaults={recentVaults}
        isBusy={isBusy}
        error={vaultError}
        onCreateVault={handleCreateVault}
        onChooseVault={handleChooseVault}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <NotesWorkspace
        initialTab={initialTab}
        persistKey="brainx_notes_workspace_v1"
        onActiveNoteChange={(noteId) => router.replace(noteId ? `/notes/${noteId}` : "/notes")}
      />
      {children}
    </div>
  );
}
