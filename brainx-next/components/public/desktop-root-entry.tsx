"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { useBrainX } from "@/components/brainx-provider";
import { Btn, ThemeToggle } from "@/components/brainx-ui";
import { LandingScreen, LoginScreen } from "@/components/public-screens";
import { readAuthSession } from "@/lib/auth-api";
import { getBrainxDesktopConfig, isElectronDesktop, type BrainxDesktopVaultSummary } from "@/lib/desktop-bridge";
import {
  activateDesktopVault,
  chooseDesktopVaultDirectory,
  createDesktopVault,
  listDesktopVaults,
} from "@/lib/desktop-vault";

function VaultLauncher({
  recentVaults,
  loading,
  busy,
  error,
  onOpenVault,
  onChooseVault,
  onCreateVault,
}: {
  recentVaults: BrainxDesktopVaultSummary[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onOpenVault: (vaultId: string) => void;
  onChooseVault: () => void;
  onCreateVault: () => void;
}) {
  const { effectiveTheme } = useBrainX();
  const isLight = effectiveTheme === "light";

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        isLight ? "bg-[#f4f2ff] text-slate-900" : "bg-[#0d1220] text-white"
      }`}
    >
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? "linear-gradient(145deg, rgba(225,233,255,0.95) 0%, rgba(244,242,255,0.98) 42%, rgba(236,245,242,0.96) 100%)"
            : "radial-gradient(circle at top, rgba(88,140,255,0.18), transparent 42%), linear-gradient(145deg, #101728 0%, #090d16 58%, #080b14 100%)",
        }}
      />
      <div
        className={`absolute left-[-8%] top-[-14%] h-[320px] w-[320px] rounded-full blur-3xl ${
          isLight ? "bg-[#b7c9ff]/55" : "bg-[#588cff]/20"
        }`}
      />
      <div
        className={`absolute bottom-[-16%] left-[22%] h-[360px] w-[360px] rounded-full blur-3xl ${
          isLight ? "bg-[#d8c8ff]/60" : "bg-[#8d7dff]/18"
        }`}
      />
      <div
        className={`absolute right-[-8%] top-[14%] h-[320px] w-[320px] rounded-full blur-3xl ${
          isLight ? "bg-[#d7f0ea]/70" : "bg-cyan-400/10"
        }`}
      />
      <div className={`absolute inset-0 grid-bg ${isLight ? "opacity-40" : "opacity-30"}`} />
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className={`px-5 py-6 backdrop-blur-xl ${
            isLight ? "border-r border-[#d7def6] bg-white/55" : "border-r border-white/8 bg-white/[0.03]"
          }`}
        >
          <div className="mb-6 flex items-center gap-3">
            <BrandLogo size={36} />
            <div>
              <div className={`text-[18px] font-semibold tracking-tight ${isLight ? "text-slate-900" : "text-white"}`}>BrainX</div>
              <div className={`text-[11px] ${isLight ? "text-slate-500" : "text-white/55"}`}>Recent Vaults</div>
            </div>
          </div>

          <div className="space-y-2">
            {recentVaults.length === 0 ? (
              <div
                className={`rounded-2xl px-4 py-5 text-[13px] ${
                  isLight
                    ? "border border-white/70 bg-white/72 text-slate-500 shadow-[0_18px_45px_rgba(148,163,184,0.12)]"
                    : "border border-white/8 bg-white/[0.04] text-white/60"
                }`}
              >
                아직 등록된 vault가 없습니다.
              </div>
            ) : (
              recentVaults.map((vault) => (
                <button
                  key={vault.id}
                  type="button"
                  onClick={() => onOpenVault(vault.id)}
                  disabled={busy}
                  className={`block w-full rounded-2xl px-4 py-3 text-left transition disabled:opacity-60 ${
                    isLight
                      ? "border border-white/70 bg-white/78 shadow-[0_18px_45px_rgba(148,163,184,0.12)] hover:-translate-y-0.5 hover:border-[#9db1ff] hover:bg-white/90"
                      : "border border-white/8 bg-white/[0.05] hover:border-[#7ea2ff]/40 hover:bg-white/[0.08]"
                  }`}
                >
                  <div className={`truncate text-[14px] font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>{vault.name}</div>
                  <div className={`mt-1 truncate text-[11px] ${isLight ? "text-slate-500" : "text-white/55"}`}>{vault.vaultPath}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-[620px]">
            <div className="mb-8 flex flex-col items-center text-center">
              <div
                className={`mb-5 rounded-[28px] px-6 py-5 ${
                  isLight
                    ? "border border-white/70 bg-white/72 shadow-[0_30px_80px_-40px_rgba(108,99,216,0.28)] backdrop-blur-xl"
                    : "border border-white/10 bg-white/[0.05] shadow-[0_30px_80px_-40px_rgba(76,108,255,0.55)]"
                }`}
              >
                <BrandLogo size={68} />
              </div>
              <h1 className={`text-[40px] font-semibold tracking-[-0.04em] ${isLight ? "text-slate-900" : "text-white"}`}>BrainX Vault</h1>
              <p className={`mt-3 max-w-[440px] text-[14px] leading-6 ${isLight ? "text-slate-600" : "text-white/62"}`}>
                로컬에 저장된 지식 볼트를 바로 열고, 새 볼트를 만들거나 기존 폴더를 BrainX 작업공간으로 연결할 수 있습니다.
              </p>
            </div>

            <div
              className={`rounded-[30px] p-6 backdrop-blur-xl ${
                isLight
                  ? "border border-white/70 bg-white/60 shadow-[0_32px_100px_-48px_rgba(108,99,216,0.25)]"
                  : "border border-white/10 bg-white/[0.05] shadow-[0_40px_100px_-50px_rgba(15,23,42,0.95)]"
              }`}
            >
              <div className="space-y-5">
                <div
                  className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-4 ${
                    isLight
                      ? "border border-white/80 bg-white/78 shadow-[0_18px_45px_rgba(148,163,184,0.1)]"
                      : "border border-white/8 bg-black/10"
                  }`}
                >
                  <div>
                    <div className={`text-[17px] font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>새 보관함 생성</div>
                    <div className={`mt-1 text-[13px] ${isLight ? "text-slate-600" : "text-white/60"}`}>
                      선택한 폴더 안에 BrainX 전용 vault 구조를 생성합니다.
                    </div>
                  </div>
                  <Btn variant="primary" disabled={busy || loading} onClick={onCreateVault}>
                    생성
                  </Btn>
                </div>

                <div
                  className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-4 ${
                    isLight
                      ? "border border-white/80 bg-white/78 shadow-[0_18px_45px_rgba(148,163,184,0.1)]"
                      : "border border-white/8 bg-black/10"
                  }`}
                >
                  <div>
                    <div className={`text-[17px] font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>기존 보관함 열기</div>
                    <div className={`mt-1 text-[13px] ${isLight ? "text-slate-600" : "text-white/60"}`}>
                      기존 Markdown 폴더를 선택해 BrainX vault로 연결합니다.
                    </div>
                  </div>
                  <Btn variant="soft" disabled={busy || loading} onClick={onChooseVault}>
                    열기
                  </Btn>
                </div>
              </div>

              {loading ? (
                <div className={`mt-5 text-[12px] ${isLight ? "text-slate-500" : "text-white/50"}`}>vault 정보를 불러오는 중입니다…</div>
              ) : null}
              {error ? <div className="mt-5 text-[12px] font-medium text-[#d9485f] dark:text-[#ff8f8f]">{error}</div> : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function DesktopRootEntry() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [recentVaults, setRecentVaults] = useState<BrainxDesktopVaultSummary[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setSessionVersion((current) => current + 1);
    window.addEventListener("brainx-auth-session-changed", sync);
    return () => window.removeEventListener("brainx-auth-session-changed", sync);
  }, []);

  useEffect(() => {
    if (!isElectronDesktop()) {
      setLoading(false);
      return;
    }

    const session = readAuthSession();
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    let active = true;

    async function bootstrap() {
      try {
        setLoading(true);
        setError(null);
        const [config, vaults] = await Promise.all([getBrainxDesktopConfig(), listDesktopVaults()]);
        if (!active) return;

        setRecentVaults(vaults);

        if (config?.activeVault) {
          router.replace("/notes");
          return;
        }

        if (vaults.length > 0) {
          const opened = await activateDesktopVault(vaults[0].id);
          if (!active) return;
          if (opened) {
            router.replace("/notes");
            return;
          }
        }
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "BrainX vault 정보를 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [router, sessionVersion]);

  const handleOpenVault = async (vaultId: string) => {
    try {
      setBusy(true);
      setError(null);
      const opened = await activateDesktopVault(vaultId);
      if (!opened) {
        throw new Error("선택한 vault를 열지 못했습니다.");
      }
      router.replace("/notes");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "선택한 vault를 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleChooseVault = async () => {
    try {
      setBusy(true);
      setError(null);
      const opened = await chooseDesktopVaultDirectory();
      if (!opened) return;
      router.replace("/notes");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "기존 vault를 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVault = async () => {
    try {
      setBusy(true);
      setError(null);
      const created = await createDesktopVault("BrainX Vault");
      if (!created) return;
      router.replace("/notes");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "새 vault를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!isElectronDesktop()) {
    return <LandingScreen />;
  }

  if (!readAuthSession()?.accessToken) {
    return <LoginScreen />;
  }

  return (
    <VaultLauncher
      recentVaults={recentVaults}
      loading={loading}
      busy={busy}
      error={error}
      onOpenVault={handleOpenVault}
      onChooseVault={handleChooseVault}
      onCreateVault={handleCreateVault}
    />
  );
}
