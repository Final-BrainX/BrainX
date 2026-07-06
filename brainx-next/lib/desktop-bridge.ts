"use client";

type DesktopPopupOptions = {
  url: string;
  popupId?: string;
  channel?: string;
  name?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  features?: string;
  target?: string;
};

type DesktopPopupResult<T = unknown> = {
  popupId?: string;
  channel: string;
  payload: T;
};

type DesktopPopupClosedDetail = {
  popupId: string;
  channel?: string;
};

type DesktopPopupResultDetail<T = unknown> = {
  popupId: string;
  channel: string;
  payload: T;
};

type BrowserPopupHandle = {
  kind: "browser";
  popup: Window;
  readonly closed: boolean;
};

type ElectronPopupHandle = {
  kind: "electron";
  popupId: string;
  channel?: string;
  readonly closed: boolean;
};

export type PopupHandle = BrowserPopupHandle | ElectronPopupHandle;

type BrainxDesktopConfig = {
  platform: string;
  isPackaged: boolean;
  appVersion: string;
  appOrigin: string;
  appMode: "dev-server" | "bundled-standalone" | "remote-web";
  activeVault: BrainxDesktopVaultSummary | null;
};

export type BrainxDesktopVaultSummary = {
  id: string;
  name: string;
  vaultPath: string;
  notesPath: string;
  assetsPath: string;
  exportsPath: string;
  lastOpenedAt: string;
};

export type BrainxDesktopVaultSyncMode = "local-only" | "manual-cloud";

export type BrainxDesktopVaultSyncPolicy = {
  mode: BrainxDesktopVaultSyncMode;
  remoteWorkspaceId: string | null;
  lastSyncedAt: string | null;
};

export type BrainxDesktopVaultFolder = {
  folderId: string;
  name: string;
  parentFolderId: string | null;
  documentGroupId?: string | null;
  color?: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BrainxDesktopVaultNote = {
  noteId: string;
  title: string;
  markdown: string;
  folderId: string | null;
  documentGroupId?: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  typography?: {
    scalePercent?: number;
    fontFamily?: string | null;
    overrides?: {
      body?: number;
      h1?: number;
      h2?: number;
      h3?: number;
    };
  } | null;
};

export type BrainxDesktopVaultAsset = {
  assetId: string;
  fileName: string;
  mimeType: string;
  relativePath: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

export type BrainxDesktopVaultSnapshot = {
  vault: BrainxDesktopVaultSummary;
  syncPolicy: BrainxDesktopVaultSyncPolicy;
  notes: BrainxDesktopVaultNote[];
  folders: BrainxDesktopVaultFolder[];
  assets: BrainxDesktopVaultAsset[];
};

export type BrainxDesktopManualSyncJob = {
  jobId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "SKIPPED" | "FAILED" | "CONFLICT";
  mode: BrainxDesktopVaultSyncMode;
  startedAt: string;
  message: string;
  completedAt?: string;
  createdNotes?: Array<{ noteId?: string; title?: string }>;
  failedFiles?: Array<{ fileName?: string; reason?: string }>;
  conflicts?: Array<Record<string, unknown>>;
};

export type BrainxDesktopManualSyncConflictReport = {
  jobId: string;
  generatedAt: string;
  conflicts: Array<Record<string, unknown>>;
};

type BrainxDesktopApi = {
  getConfig?: () => Promise<BrainxDesktopConfig>;
  openExternal?: (url: string) => Promise<boolean>;
  openPopup?: (options: DesktopPopupOptions) => Promise<{ popupId: string; channel?: string } | null>;
  notifyPopupResult?: (result: DesktopPopupResult) => Promise<void>;
  closeCurrentWindow?: () => Promise<void>;
  getStoredValue?: (area: "local" | "session", key: string) => string | null;
  setStoredValue?: (area: "local" | "session", key: string, value: string) => void;
  removeStoredValue?: (area: "local" | "session", key: string) => void;
  requestApi?: (options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    bodyText: string;
    headers: Record<string, string>;
  }>;
  openFile?: (options?: { title?: string; accept?: string[] }) => Promise<{
    name: string;
    mimeType: string;
    dataBase64: string;
  } | null>;
  saveFile?: (options: { fileName: string; mimeType: string; dataBase64: string }) => Promise<boolean>;
  listVaults?: () => Promise<BrainxDesktopVaultSummary[]>;
  getActiveVault?: () => Promise<BrainxDesktopVaultSummary | null>;
  activateVault?: (vaultId: string) => Promise<BrainxDesktopVaultSummary | null>;
  chooseVaultDirectory?: () => Promise<BrainxDesktopVaultSummary | null>;
  createVault?: (options?: { name?: string }) => Promise<BrainxDesktopVaultSummary | null>;
  getVaultSnapshot?: () => Promise<BrainxDesktopVaultSnapshot | null>;
  createVaultFolder?: (options: { name: string; parentFolderId?: string | null }) => Promise<BrainxDesktopVaultFolder>;
  patchVaultFolder?: (options: { folderId: string; name?: string; parentFolderId?: string | null; color?: string; favorite?: boolean }) => Promise<BrainxDesktopVaultFolder>;
  deleteVaultFolder?: (options: { folderId: string }) => Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[]; deletedAt: string }>;
  createVaultNote?: (options: { title: string; markdown?: string | null; folderId?: string | null; tags?: string[] }) => Promise<BrainxDesktopVaultNote>;
  saveVaultNoteContent?: (options: { noteId: string; markdown: string; baseVersion: number }) => Promise<{ noteId: string; version: number; savedAt: string; status: "SAVED" }>;
  saveVaultNoteMetadata?: (options: { noteId: string; title: string; folderId?: string | null; tags?: string[]; typography?: BrainxDesktopVaultNote["typography"] }) => Promise<{ noteId: string; title: string; folderId: string | null; tags: string[]; version: number; typography?: BrainxDesktopVaultNote["typography"] }>;
  deleteVaultNote?: (options: { noteId: string }) => Promise<{ noteId: string; deletedAt: string; purgeAt: string | null }>;
  writeVaultAsset?: (options: { fileName: string; mimeType: string; dataBase64: string }) => Promise<BrainxDesktopVaultAsset>;
  openVaultAsset?: (assetId: string) => Promise<boolean>;
  importVaultZip?: (options: { fileName: string; dataBase64: string; targetFolderId?: string | null }) => Promise<BrainxDesktopManualSyncJob>;
  saveVaultExport?: (options: { fileName: string; mimeType: string; dataBase64: string }) => Promise<{ saved: boolean; filePath: string }>;
  getVaultWorkspaceStats?: () => Promise<{
    noteCount: number;
    storageBytes: number;
    activities: Array<{ noteId: string; type: string; title: string; occurredAt: string }>;
  } | null>;
  getVaultSyncPolicy?: () => Promise<BrainxDesktopVaultSyncPolicy | null>;
  setVaultSyncPolicy?: (policy: { mode: BrainxDesktopVaultSyncMode; remoteWorkspaceId?: string | null }) => Promise<BrainxDesktopVaultSyncPolicy>;
  requestManualSync?: () => Promise<BrainxDesktopManualSyncJob>;
  getLatestManualSyncJob?: () => Promise<BrainxDesktopManualSyncJob | null>;
  getManualSyncConflictReport?: (jobId: string) => Promise<BrainxDesktopManualSyncConflictReport | null>;
};

declare global {
  interface WindowEventMap {
    "brainx-desktop-popup-result": CustomEvent<DesktopPopupResultDetail>;
    "brainx-desktop-popup-closed": CustomEvent<DesktopPopupClosedDetail>;
  }

  interface Window {
    brainxDesktop?: BrainxDesktopApi;
  }
}

function isBrowserPopup() {
  return typeof window !== "undefined" && !!window.opener && window.opener !== window;
}

const electronPopupClosedState = new Map<string, boolean>();
let desktopPopupEventsBound = false;

function bindDesktopPopupEvents() {
  if (desktopPopupEventsBound || typeof window === "undefined") return;
  desktopPopupEventsBound = true;

  window.addEventListener("brainx-desktop-popup-closed", (event) => {
    electronPopupClosedState.set(event.detail.popupId, true);
  });
}

function asAbsoluteUrl(url: string) {
  return new URL(url, window.location.origin).toString();
}

export function isElectronDesktop() {
  return typeof window !== "undefined" && !!window.brainxDesktop;
}

export async function getBrainxDesktopConfig() {
  if (!isElectronDesktop() || !window.brainxDesktop?.getConfig) {
    return null;
  }
  return window.brainxDesktop.getConfig();
}

export async function openBrainxExternalUrl(url: string) {
  if (typeof window === "undefined") return false;

  if (isElectronDesktop() && window.brainxDesktop?.openExternal) {
    return window.brainxDesktop.openExternal(url);
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(popup);
}

export async function openBrainxPopup(options: DesktopPopupOptions): Promise<PopupHandle | null> {
  if (typeof window === "undefined") return null;

  if (isElectronDesktop() && window.brainxDesktop?.openPopup) {
    bindDesktopPopupEvents();
    const handle = await window.brainxDesktop.openPopup({
      ...options,
      url: asAbsoluteUrl(options.url),
    });
    if (!handle) return null;
    electronPopupClosedState.set(handle.popupId, false);
    return {
      kind: "electron",
      popupId: handle.popupId,
      channel: handle.channel,
      get closed() {
        return electronPopupClosedState.get(handle.popupId) ?? false;
      },
    };
  }

  const popup = window.open(
    options.url,
    options.target ?? options.name ?? "_blank",
    options.features ?? "width=1200,height=860,noopener=no,noreferrer=no"
  );
  if (!popup) return null;
  return {
    kind: "browser",
    popup,
    get closed() {
      return popup.closed;
    },
  };
}

export function addPopupResultListener<T extends Record<string, unknown>>(
  channel: string,
  listener: (payload: T) => void
) {
  if (typeof window === "undefined") return () => {};

  if (isElectronDesktop()) {
    const handleDesktopEvent = (event: CustomEvent<DesktopPopupResultDetail<T>>) => {
      if (event.detail.channel !== channel) return;
      listener(event.detail.payload);
    };
    window.addEventListener("brainx-desktop-popup-result", handleDesktopEvent as EventListener);
    return () => window.removeEventListener("brainx-desktop-popup-result", handleDesktopEvent as EventListener);
  }

  const handleMessage = (event: MessageEvent<T & { type?: string }>) => {
    if (event.origin !== window.location.origin) return;
    if ((event.data as { type?: string } | null)?.type !== channel) return;
    listener(event.data);
  };
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

export function watchPopupClosed(handle: PopupHandle, onClosed: () => void) {
  if (typeof window === "undefined") return () => {};

  if (handle.kind === "electron") {
    const handleClosed = (event: CustomEvent<DesktopPopupClosedDetail>) => {
      if (event.detail.popupId !== handle.popupId) return;
      onClosed();
    };
    window.addEventListener("brainx-desktop-popup-closed", handleClosed as EventListener);
    return () => window.removeEventListener("brainx-desktop-popup-closed", handleClosed as EventListener);
  }

  const timer = window.setInterval(() => {
    if (!handle.popup.closed) return;
    window.clearInterval(timer);
    onClosed();
  }, 500);

  return () => window.clearInterval(timer);
}

export async function notifyPopupResultAndClose<T extends Record<string, unknown>>(channel: string, payload: T) {
  if (typeof window === "undefined") return false;

  if (isElectronDesktop() && window.brainxDesktop?.notifyPopupResult) {
    await window.brainxDesktop.notifyPopupResult({ channel, payload });
    await closeCurrentPopupWindow();
    return true;
  }

  if (!isBrowserPopup()) return false;
  window.opener.postMessage({ type: channel, ...payload }, window.location.origin);
  window.close();
  return true;
}

export async function closeCurrentPopupWindow() {
  if (typeof window === "undefined") return;

  if (isElectronDesktop() && window.brainxDesktop?.closeCurrentWindow) {
    await window.brainxDesktop.closeCurrentWindow();
    return;
  }

  window.close();
}
