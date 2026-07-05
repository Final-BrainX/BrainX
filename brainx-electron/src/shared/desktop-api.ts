export type BrainxDesktopConfig = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  appVersion: string;
  appOrigin: string;
  appMode: "dev-server" | "bundled-standalone" | "remote-web";
  activeVault: BrainxDesktopVaultSummary | null;
};

export type BrainxDesktopStorageArea = "local" | "session";

export type BrainxDesktopPopupOptions = {
  url: string;
  popupId?: string;
  channel?: string;
  name?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
};

export type BrainxDesktopPopupHandle = {
  popupId: string;
  channel?: string;
};

export type BrainxDesktopPopupResult = {
  popupId?: string;
  channel: string;
  payload: unknown;
};

export type BrainxDesktopOpenFileOptions = {
  title?: string;
  accept?: string[];
};

export type BrainxDesktopOpenFileResult = {
  name: string;
  mimeType: string;
  dataBase64: string;
};

export type BrainxDesktopSaveFileOptions = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type BrainxDesktopApiRequestOptions = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type BrainxDesktopApiResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText: string;
  headers: Record<string, string>;
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

export type BrainxDesktopCreateVaultOptions = {
  name?: string;
};

export type BrainxDesktopCreateVaultFolderOptions = {
  name: string;
  parentFolderId?: string | null;
};

export type BrainxDesktopPatchVaultFolderOptions = {
  folderId: string;
  name?: string;
  parentFolderId?: string | null;
  color?: string;
  favorite?: boolean;
};

export type BrainxDesktopDeleteVaultFolderOptions = {
  folderId: string;
};

export type BrainxDesktopCreateVaultNoteOptions = {
  title: string;
  markdown?: string | null;
  folderId?: string | null;
  tags?: string[];
};

export type BrainxDesktopSaveVaultNoteContentOptions = {
  noteId: string;
  markdown: string;
  baseVersion: number;
};

export type BrainxDesktopSaveVaultNoteMetadataOptions = {
  noteId: string;
  title: string;
  folderId?: string | null;
  tags?: string[];
  typography?: BrainxDesktopVaultNote["typography"];
};

export type BrainxDesktopDeleteVaultNoteOptions = {
  noteId: string;
};

export type BrainxDesktopWriteVaultAssetOptions = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type BrainxDesktopSaveVaultExportOptions = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type BrainxDesktopImportVaultZipOptions = {
  fileName: string;
  dataBase64: string;
  targetFolderId?: string | null;
};

export type BrainxDesktopWorkspaceStats = {
  noteCount: number;
  storageBytes: number;
  activities: Array<{
    noteId: string;
    type: string;
    title: string;
    occurredAt: string;
  }>;
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

export type BrainxDesktopApi = {
  getConfig: () => Promise<BrainxDesktopConfig>;
  openExternal: (url: string) => Promise<boolean>;
  openPopup: (options: BrainxDesktopPopupOptions) => Promise<BrainxDesktopPopupHandle | null>;
  notifyPopupResult: (result: BrainxDesktopPopupResult) => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
  getStoredValue: (area: BrainxDesktopStorageArea, key: string) => string | null;
  setStoredValue: (area: BrainxDesktopStorageArea, key: string, value: string) => void;
  removeStoredValue: (area: BrainxDesktopStorageArea, key: string) => void;
  requestApi: (options: BrainxDesktopApiRequestOptions) => Promise<BrainxDesktopApiResponse>;
  openFile: (options?: BrainxDesktopOpenFileOptions) => Promise<BrainxDesktopOpenFileResult | null>;
  saveFile: (options: BrainxDesktopSaveFileOptions) => Promise<boolean>;
  listVaults: () => Promise<BrainxDesktopVaultSummary[]>;
  getActiveVault: () => Promise<BrainxDesktopVaultSummary | null>;
  chooseVaultDirectory: () => Promise<BrainxDesktopVaultSummary | null>;
  createVault: (options?: BrainxDesktopCreateVaultOptions) => Promise<BrainxDesktopVaultSummary | null>;
  getVaultSnapshot: () => Promise<BrainxDesktopVaultSnapshot | null>;
  createVaultFolder: (options: BrainxDesktopCreateVaultFolderOptions) => Promise<BrainxDesktopVaultFolder>;
  patchVaultFolder: (options: BrainxDesktopPatchVaultFolderOptions) => Promise<BrainxDesktopVaultFolder>;
  deleteVaultFolder: (options: BrainxDesktopDeleteVaultFolderOptions) => Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[]; deletedAt: string }>;
  createVaultNote: (options: BrainxDesktopCreateVaultNoteOptions) => Promise<BrainxDesktopVaultNote>;
  saveVaultNoteContent: (options: BrainxDesktopSaveVaultNoteContentOptions) => Promise<{ noteId: string; version: number; savedAt: string; status: "SAVED" }>;
  saveVaultNoteMetadata: (options: BrainxDesktopSaveVaultNoteMetadataOptions) => Promise<{ noteId: string; title: string; folderId: string | null; tags: string[]; version: number; typography?: BrainxDesktopVaultNote["typography"] }>;
  deleteVaultNote: (options: BrainxDesktopDeleteVaultNoteOptions) => Promise<{ noteId: string; deletedAt: string; purgeAt: string | null }>;
  writeVaultAsset: (options: BrainxDesktopWriteVaultAssetOptions) => Promise<BrainxDesktopVaultAsset>;
  openVaultAsset: (assetId: string) => Promise<boolean>;
  importVaultZip: (options: BrainxDesktopImportVaultZipOptions) => Promise<BrainxDesktopManualSyncJob>;
  saveVaultExport: (options: BrainxDesktopSaveVaultExportOptions) => Promise<{ saved: boolean; filePath: string }>;
  getVaultWorkspaceStats: () => Promise<BrainxDesktopWorkspaceStats | null>;
  getVaultSyncPolicy: () => Promise<BrainxDesktopVaultSyncPolicy | null>;
  setVaultSyncPolicy: (policy: { mode: BrainxDesktopVaultSyncMode; remoteWorkspaceId?: string | null }) => Promise<BrainxDesktopVaultSyncPolicy>;
  requestManualSync: () => Promise<BrainxDesktopManualSyncJob>;
  getLatestManualSyncJob: () => Promise<BrainxDesktopManualSyncJob | null>;
  getManualSyncConflictReport: (jobId: string) => Promise<BrainxDesktopManualSyncConflictReport | null>;
};

declare global {
  interface Window {
    brainxDesktop?: BrainxDesktopApi;
  }
}

export {};
