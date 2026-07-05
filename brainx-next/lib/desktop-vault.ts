"use client";

import {
  isElectronDesktop,
  type BrainxDesktopManualSyncConflictReport,
  type BrainxDesktopVaultAsset,
  type BrainxDesktopVaultFolder,
  type BrainxDesktopVaultNote,
  type BrainxDesktopVaultSnapshot,
  type BrainxDesktopVaultSummary,
  type BrainxDesktopVaultSyncPolicy,
  type BrainxDesktopManualSyncJob,
} from "@/lib/desktop-bridge";

export async function listDesktopVaults(): Promise<BrainxDesktopVaultSummary[]> {
  if (!isElectronDesktop() || !window.brainxDesktop?.listVaults) {
    return [];
  }
  return window.brainxDesktop.listVaults();
}

export async function getActiveDesktopVault(): Promise<BrainxDesktopVaultSummary | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.getActiveVault) {
    return null;
  }
  return window.brainxDesktop.getActiveVault();
}

export async function activateDesktopVault(vaultId: string): Promise<BrainxDesktopVaultSummary | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.activateVault) {
    return null;
  }
  return window.brainxDesktop.activateVault(vaultId);
}

export async function chooseDesktopVaultDirectory(): Promise<BrainxDesktopVaultSummary | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.chooseVaultDirectory) {
    return null;
  }
  return window.brainxDesktop.chooseVaultDirectory();
}

export async function createDesktopVault(name?: string): Promise<BrainxDesktopVaultSummary | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.createVault) {
    return null;
  }
  return window.brainxDesktop.createVault(name ? { name } : undefined);
}

export async function getDesktopVaultSnapshot(): Promise<BrainxDesktopVaultSnapshot | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.getVaultSnapshot) {
    return null;
  }
  return window.brainxDesktop.getVaultSnapshot();
}

export async function createDesktopVaultFolder(name: string, parentFolderId?: string | null): Promise<BrainxDesktopVaultFolder> {
  if (!isElectronDesktop() || !window.brainxDesktop?.createVaultFolder) {
    throw new Error("Desktop vault folder API is unavailable.");
  }
  return window.brainxDesktop.createVaultFolder({ name, parentFolderId });
}

export async function patchDesktopVaultFolder(options: {
  folderId: string;
  name?: string;
  parentFolderId?: string | null;
  color?: string;
  favorite?: boolean;
}): Promise<BrainxDesktopVaultFolder> {
  if (!isElectronDesktop() || !window.brainxDesktop?.patchVaultFolder) {
    throw new Error("Desktop vault folder update API is unavailable.");
  }
  return window.brainxDesktop.patchVaultFolder(options);
}

export async function deleteDesktopVaultFolder(folderId: string) {
  if (!isElectronDesktop() || !window.brainxDesktop?.deleteVaultFolder) {
    throw new Error("Desktop vault folder delete API is unavailable.");
  }
  return window.brainxDesktop.deleteVaultFolder({ folderId });
}

export async function createDesktopVaultNote(options: {
  title: string;
  markdown?: string | null;
  folderId?: string | null;
  tags?: string[];
}): Promise<BrainxDesktopVaultNote> {
  if (!isElectronDesktop() || !window.brainxDesktop?.createVaultNote) {
    throw new Error("Desktop vault note API is unavailable.");
  }
  return window.brainxDesktop.createVaultNote(options);
}

export async function saveDesktopVaultNoteContent(noteId: string, markdown: string, baseVersion: number) {
  if (!isElectronDesktop() || !window.brainxDesktop?.saveVaultNoteContent) {
    throw new Error("Desktop vault note save API is unavailable.");
  }
  return window.brainxDesktop.saveVaultNoteContent({ noteId, markdown, baseVersion });
}

export async function saveDesktopVaultNoteMetadata(options: {
  noteId: string;
  title: string;
  folderId?: string | null;
  tags?: string[];
  typography?: BrainxDesktopVaultNote["typography"];
}) {
  if (!isElectronDesktop() || !window.brainxDesktop?.saveVaultNoteMetadata) {
    throw new Error("Desktop vault note metadata API is unavailable.");
  }
  return window.brainxDesktop.saveVaultNoteMetadata(options);
}

export async function deleteDesktopVaultNote(noteId: string) {
  if (!isElectronDesktop() || !window.brainxDesktop?.deleteVaultNote) {
    throw new Error("Desktop vault note delete API is unavailable.");
  }
  return window.brainxDesktop.deleteVaultNote({ noteId });
}

export async function writeDesktopVaultAsset(options: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<BrainxDesktopVaultAsset> {
  if (!isElectronDesktop() || !window.brainxDesktop?.writeVaultAsset) {
    throw new Error("Desktop vault asset API is unavailable.");
  }
  return window.brainxDesktop.writeVaultAsset(options);
}

export async function openDesktopVaultAsset(assetId: string) {
  if (!isElectronDesktop() || !window.brainxDesktop?.openVaultAsset) {
    return false;
  }
  return window.brainxDesktop.openVaultAsset(assetId);
}

export async function importDesktopVaultZip(options: {
  fileName: string;
  dataBase64: string;
  targetFolderId?: string | null;
}) {
  if (!isElectronDesktop() || !window.brainxDesktop?.importVaultZip) {
    throw new Error("Desktop vault ZIP import API is unavailable.");
  }
  return window.brainxDesktop.importVaultZip(options);
}

export async function saveDesktopVaultExport(options: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}) {
  if (!isElectronDesktop() || !window.brainxDesktop?.saveVaultExport) {
    throw new Error("Desktop vault export API is unavailable.");
  }
  return window.brainxDesktop.saveVaultExport(options);
}

export async function getDesktopVaultWorkspaceStats() {
  if (!isElectronDesktop() || !window.brainxDesktop?.getVaultWorkspaceStats) {
    return null;
  }
  return window.brainxDesktop.getVaultWorkspaceStats();
}

export async function getDesktopVaultSyncPolicy(): Promise<BrainxDesktopVaultSyncPolicy | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.getVaultSyncPolicy) {
    return null;
  }
  return window.brainxDesktop.getVaultSyncPolicy();
}

export async function setDesktopVaultSyncPolicy(policy: {
  mode: BrainxDesktopVaultSyncPolicy["mode"];
  remoteWorkspaceId?: string | null;
}) {
  if (!isElectronDesktop() || !window.brainxDesktop?.setVaultSyncPolicy) {
    throw new Error("Desktop vault sync policy API is unavailable.");
  }
  return window.brainxDesktop.setVaultSyncPolicy(policy);
}

export async function requestDesktopVaultManualSync(): Promise<BrainxDesktopManualSyncJob> {
  if (!isElectronDesktop() || !window.brainxDesktop?.requestManualSync) {
    throw new Error("Desktop vault manual sync API is unavailable.");
  }
  return window.brainxDesktop.requestManualSync();
}

export async function getLatestDesktopVaultManualSyncJob(): Promise<BrainxDesktopManualSyncJob | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.getLatestManualSyncJob) {
    return null;
  }
  return window.brainxDesktop.getLatestManualSyncJob();
}

export async function getDesktopVaultManualSyncConflictReport(jobId: string): Promise<BrainxDesktopManualSyncConflictReport | null> {
  if (!isElectronDesktop() || !window.brainxDesktop?.getManualSyncConflictReport) {
    return null;
  }
  return window.brainxDesktop.getManualSyncConflictReport(jobId);
}
