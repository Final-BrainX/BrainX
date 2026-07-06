import { contextBridge, ipcRenderer } from "electron";
import type {
  BrainxDesktopApiRequestOptions,
  BrainxDesktopApiResponse,
  BrainxDesktopApi,
  BrainxDesktopConfig,
  BrainxDesktopCreateVaultOptions,
  BrainxDesktopCreateVaultFolderOptions,
  BrainxDesktopCreateVaultNoteOptions,
  BrainxDesktopDeleteVaultFolderOptions,
  BrainxDesktopDeleteVaultNoteOptions,
  BrainxDesktopImportVaultZipOptions,
  BrainxDesktopOpenFileOptions,
  BrainxDesktopOpenFileResult,
  BrainxDesktopManualSyncJob,
  BrainxDesktopManualSyncConflictReport,
  BrainxDesktopPatchVaultFolderOptions,
  BrainxDesktopPopupHandle,
  BrainxDesktopPopupOptions,
  BrainxDesktopPopupResult,
  BrainxDesktopSaveVaultExportOptions,
  BrainxDesktopSaveFileOptions,
  BrainxDesktopSaveVaultNoteContentOptions,
  BrainxDesktopSaveVaultNoteMetadataOptions,
  BrainxDesktopStorageArea,
  BrainxDesktopVaultSyncPolicy,
  BrainxDesktopVaultAsset,
  BrainxDesktopVaultFolder,
  BrainxDesktopVaultNote,
  BrainxDesktopVaultSnapshot,
  BrainxDesktopVaultSummary,
  BrainxDesktopWorkspaceStats,
  BrainxDesktopWriteVaultAssetOptions,
} from "../shared/desktop-api.js";

const api: BrainxDesktopApi = {
  getConfig: () => ipcRenderer.invoke("brainx-desktop:get-config") as Promise<BrainxDesktopConfig>,
  openExternal: (url: string) => ipcRenderer.invoke("brainx-desktop:open-external", url) as Promise<boolean>,
  openPopup: (options: BrainxDesktopPopupOptions) =>
    ipcRenderer.invoke("brainx-desktop:open-popup", options) as Promise<BrainxDesktopPopupHandle | null>,
  notifyPopupResult: (result: BrainxDesktopPopupResult) =>
    ipcRenderer.invoke("brainx-desktop:notify-popup-result", result) as Promise<void>,
  closeCurrentWindow: () => ipcRenderer.invoke("brainx-desktop:close-current-window") as Promise<void>,
  getStoredValue: (area: BrainxDesktopStorageArea, key: string) =>
    ipcRenderer.sendSync("brainx-desktop:get-stored-value", area, key) as string | null,
  setStoredValue: (area: BrainxDesktopStorageArea, key: string, value: string) => {
    ipcRenderer.sendSync("brainx-desktop:set-stored-value", area, key, value);
  },
  removeStoredValue: (area: BrainxDesktopStorageArea, key: string) => {
    ipcRenderer.sendSync("brainx-desktop:remove-stored-value", area, key);
  },
  requestApi: (options: BrainxDesktopApiRequestOptions) =>
    ipcRenderer.invoke("brainx-desktop:request-api", options) as Promise<BrainxDesktopApiResponse>,
  openFile: (options?: BrainxDesktopOpenFileOptions) =>
    ipcRenderer.invoke("brainx-desktop:open-file", options) as Promise<BrainxDesktopOpenFileResult | null>,
  saveFile: (options: BrainxDesktopSaveFileOptions) =>
    ipcRenderer.invoke("brainx-desktop:save-file", options) as Promise<boolean>,
  listVaults: () => ipcRenderer.invoke("brainx-desktop:list-vaults") as Promise<BrainxDesktopVaultSummary[]>,
  getActiveVault: () => ipcRenderer.invoke("brainx-desktop:get-active-vault") as Promise<BrainxDesktopVaultSummary | null>,
  activateVault: (vaultId: string) =>
    ipcRenderer.invoke("brainx-desktop:activate-vault", vaultId) as Promise<BrainxDesktopVaultSummary | null>,
  chooseVaultDirectory: () =>
    ipcRenderer.invoke("brainx-desktop:choose-vault-directory") as Promise<BrainxDesktopVaultSummary | null>,
  createVault: (options?: BrainxDesktopCreateVaultOptions) =>
    ipcRenderer.invoke("brainx-desktop:create-vault", options) as Promise<BrainxDesktopVaultSummary | null>,
  getVaultSnapshot: () => ipcRenderer.invoke("brainx-desktop:get-vault-snapshot") as Promise<BrainxDesktopVaultSnapshot | null>,
  createVaultFolder: (options: BrainxDesktopCreateVaultFolderOptions) =>
    ipcRenderer.invoke("brainx-desktop:create-vault-folder", options) as Promise<BrainxDesktopVaultFolder>,
  patchVaultFolder: (options: BrainxDesktopPatchVaultFolderOptions) =>
    ipcRenderer.invoke("brainx-desktop:patch-vault-folder", options) as Promise<BrainxDesktopVaultFolder>,
  deleteVaultFolder: (options: BrainxDesktopDeleteVaultFolderOptions) =>
    ipcRenderer.invoke("brainx-desktop:delete-vault-folder", options) as Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[]; deletedAt: string }>,
  createVaultNote: (options: BrainxDesktopCreateVaultNoteOptions) =>
    ipcRenderer.invoke("brainx-desktop:create-vault-note", options) as Promise<BrainxDesktopVaultNote>,
  saveVaultNoteContent: (options: BrainxDesktopSaveVaultNoteContentOptions) =>
    ipcRenderer.invoke("brainx-desktop:save-vault-note-content", options) as Promise<{ noteId: string; version: number; savedAt: string; status: "SAVED" }>,
  saveVaultNoteMetadata: (options: BrainxDesktopSaveVaultNoteMetadataOptions) =>
    ipcRenderer.invoke("brainx-desktop:save-vault-note-metadata", options) as Promise<{ noteId: string; title: string; folderId: string | null; tags: string[]; version: number; typography?: BrainxDesktopVaultNote["typography"] }>,
  deleteVaultNote: (options: BrainxDesktopDeleteVaultNoteOptions) =>
    ipcRenderer.invoke("brainx-desktop:delete-vault-note", options) as Promise<{ noteId: string; deletedAt: string; purgeAt: string | null }>,
  writeVaultAsset: (options: BrainxDesktopWriteVaultAssetOptions) =>
    ipcRenderer.invoke("brainx-desktop:write-vault-asset", options) as Promise<BrainxDesktopVaultAsset>,
  openVaultAsset: (assetId: string) =>
    ipcRenderer.invoke("brainx-desktop:open-vault-asset", assetId) as Promise<boolean>,
  importVaultZip: (options: BrainxDesktopImportVaultZipOptions) =>
    ipcRenderer.invoke("brainx-desktop:import-vault-zip", options) as Promise<BrainxDesktopManualSyncJob>,
  saveVaultExport: (options: BrainxDesktopSaveVaultExportOptions) =>
    ipcRenderer.invoke("brainx-desktop:save-vault-export", options) as Promise<{ saved: boolean; filePath: string }>,
  getVaultWorkspaceStats: () =>
    ipcRenderer.invoke("brainx-desktop:get-vault-workspace-stats") as Promise<BrainxDesktopWorkspaceStats | null>,
  getVaultSyncPolicy: () =>
    ipcRenderer.invoke("brainx-desktop:get-vault-sync-policy") as Promise<BrainxDesktopVaultSyncPolicy | null>,
  setVaultSyncPolicy: (policy: { mode: "local-only" | "manual-cloud"; remoteWorkspaceId?: string | null }) =>
    ipcRenderer.invoke("brainx-desktop:set-vault-sync-policy", policy) as Promise<BrainxDesktopVaultSyncPolicy>,
  requestManualSync: () =>
    ipcRenderer.invoke("brainx-desktop:request-manual-sync") as Promise<BrainxDesktopManualSyncJob>,
  getLatestManualSyncJob: () =>
    ipcRenderer.invoke("brainx-desktop:get-latest-manual-sync-job") as Promise<BrainxDesktopManualSyncJob | null>,
  getManualSyncConflictReport: (jobId: string) =>
    ipcRenderer.invoke("brainx-desktop:get-manual-sync-conflict-report", jobId) as Promise<BrainxDesktopManualSyncConflictReport | null>,
};

contextBridge.exposeInMainWorld("brainxDesktop", api);

ipcRenderer.on("brainx-desktop:popup-result", (_event, detail: BrainxDesktopPopupResult & { popupId: string }) => {
  window.dispatchEvent(new CustomEvent("brainx-desktop-popup-result", { detail }));
});

ipcRenderer.on("brainx-desktop:popup-closed", (_event, detail: { popupId: string; channel?: string }) => {
  window.dispatchEvent(new CustomEvent("brainx-desktop-popup-closed", { detail }));
});
