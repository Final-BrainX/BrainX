import {
  app,
  type BaseWindow,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  type OpenDialogOptions,
  type SaveDialogOptions,
  shell,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAppOrigin,
  getBundledRendererCandidates,
  getBundledRendererPort,
  getProtocolScheme,
  getRendererEntryUrl,
  getRendererMode,
  getWindowSize,
  getWindowTitle,
} from "./app-config.js";
import type {
  BrainxDesktopApiRequestOptions,
  BrainxDesktopApiResponse,
  BrainxDesktopCreateVaultOptions,
  BrainxDesktopCreateVaultFolderOptions,
  BrainxDesktopCreateVaultNoteOptions,
  BrainxDesktopDeleteVaultFolderOptions,
  BrainxDesktopDeleteVaultNoteOptions,
  BrainxDesktopImportVaultZipOptions,
  BrainxDesktopOpenFileOptions,
  BrainxDesktopPatchVaultFolderOptions,
  BrainxDesktopPopupOptions,
  BrainxDesktopPopupResult,
  BrainxDesktopSaveFileOptions,
  BrainxDesktopSaveVaultExportOptions,
  BrainxDesktopSaveVaultNoteContentOptions,
  BrainxDesktopSaveVaultNoteMetadataOptions,
  BrainxDesktopStorageArea,
  BrainxDesktopVaultSyncMode,
  BrainxDesktopVaultAsset,
  BrainxDesktopVaultFolder,
  BrainxDesktopManualSyncJob,
  BrainxDesktopVaultNote,
  BrainxDesktopVaultSnapshot,
  BrainxDesktopVaultSyncPolicy,
  BrainxDesktopVaultSummary,
  BrainxDesktopWriteVaultAssetOptions,
} from "../shared/desktop-api.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "brainx-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const electronProcess = process as NodeJS.Process & {
  defaultApp?: boolean;
};

const WINDOWS_TITLE_BAR_OVERLAY_HEIGHT = 36;
const WINDOWS_TITLE_BAR_CONTROL_WIDTH = 140;

function getWindowChromeOptions() {
  if (process.platform !== "win32") {
    return {};
  }

  return {
    titleBarStyle: "hidden" as const,
    titleBarOverlay: {
      color: "#eef1ff",
      symbolColor: "#334155",
      height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT,
    },
    backgroundColor: "#eef1ff",
  };
}

function installWindowsTitleBarDragRegion(window: BrowserWindow) {
  if (process.platform !== "win32") return;

  void window.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.brainx-desktop-drag-region')) return;
      if (document.getElementById('brainx-electron-titlebar-drag-region')) return;

      const region = document.createElement('div');
      region.id = 'brainx-electron-titlebar-drag-region';
      region.setAttribute('aria-hidden', 'true');
      region.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:${WINDOWS_TITLE_BAR_CONTROL_WIDTH}px',
        'height:${WINDOWS_TITLE_BAR_OVERLAY_HEIGHT}px',
        'z-index:2147483646',
        'background:transparent',
        'user-select:none',
      ].join(';');
      region.style.setProperty('-webkit-app-region', 'drag');
      document.body.appendChild(region);
    })();
  `).catch((error: unknown) => {
    console.warn('[brainx-electron] Failed to install title-bar drag region.', error);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "..", "preload", "index.js");
const devPngIconPath = path.resolve(__dirname, "..", "..", "build", "icon.png");

let mainWindow: BrowserWindow | null = null;
let rendererEntryUrl = getRendererEntryUrl();
let appOrigin = getAppOrigin();
let rendererMode = getRendererMode();
let bundledRendererProcess: ChildProcess | null = null;
let bundledRendererPort: number | null = null;
let pendingDeepLink: string | null = null;

const popupRegistry = new Map<number, { popupId: string; channel?: string; opener: WebContents }>();
const sessionStore = new Map<string, string>();
const storageState: { local: Record<string, string> } = { local: {} };
const vaultState = {
  activeVaultId: null as string | null,
  recentVaults: [] as BrainxDesktopVaultSummary[],
};

type VaultStateFile = {
  activeVaultId: string | null;
  recentVaults: BrainxDesktopVaultSummary[];
};

type VaultIndexFile = {
  version: 1;
  vaultId: string;
  syncPolicy: BrainxDesktopVaultSyncPolicy;
  notes: Array<BrainxDesktopVaultNote & { fileName: string }>;
  folders: BrainxDesktopVaultFolder[];
  assets: BrainxDesktopVaultAsset[];
};

type VaultSyncStateFile = {
  version: 1;
  lastSyncedAt: string | null;
  noteMappings: Record<string, { remoteNoteId: string }>;
  folderMappings: Record<string, { remoteFolderId: string }>;
  assetMappings: Record<string, { remoteAssetId: string; checksum: string | null; syncedAt: string | null }>;
  deletedRemoteNoteIds: string[];
};

type VaultSyncConflict = {
  entityType: "note" | "folder" | "asset";
  localId: string;
  remoteId: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  reason: string;
};

const AUTH_SESSION_STORAGE_KEY = "brainx_auth_session_v1";
const DEFAULT_API_ORIGIN = "https://brainx.p-e.kr/";

function getWindowIconPath() {
  if (app.isPackaged) {
    return undefined;
  }
  return fs.existsSync(devPngIconPath) ? devPngIconPath : undefined;
}

function getStorageFilePath() {
  return path.join(app.getPath("userData"), "renderer-storage.json");
}

function getVaultStateFilePath() {
  return path.join(app.getPath("userData"), "vaults.json");
}

function getVaultConfigDirectory(vault: BrainxDesktopVaultSummary) {
  return path.join(vault.vaultPath, ".brainx");
}

function getVaultWorkspaceFilePath(vault: BrainxDesktopVaultSummary) {
  return path.join(getVaultConfigDirectory(vault), "workspace.json");
}

function getVaultIndexFilePath(vault: BrainxDesktopVaultSummary) {
  return path.join(getVaultConfigDirectory(vault), "index.json");
}

function getVaultSyncStateFilePath(vault: BrainxDesktopVaultSummary) {
  return path.join(getVaultConfigDirectory(vault), "sync-state.json");
}

function getVaultLastSyncJobFilePath(vault: BrainxDesktopVaultSummary) {
  return path.join(getVaultConfigDirectory(vault), "last-sync-job.json");
}

function getVaultConflictsDirectory(vault: BrainxDesktopVaultSummary) {
  return path.join(getVaultConfigDirectory(vault), "conflicts");
}

function getDesktopApiOrigin() {
  const raw =
    process.env.BRAINX_DESKTOP_API_ORIGIN ??
    process.env.BRAINX_ELECTRON_WEB_ORIGIN ??
    process.env.BRAINX_ELECTRON_PROD_URL ??
    DEFAULT_API_ORIGIN;
  return new URL(raw).origin;
}

function resolveDesktopApiRequestUrl(rawPath: string) {
  const apiOrigin = getDesktopApiOrigin();
  const target = new URL(rawPath, apiOrigin);
  if (target.origin !== apiOrigin) {
    throw new Error("Desktop API bridge only allows requests to the configured BrainX origin.");
  }
  return target.toString();
}

function toVaultSummary(vaultPath: string, name = path.basename(vaultPath)): BrainxDesktopVaultSummary {
  return {
    id: crypto.createHash("sha1").update(vaultPath).digest("hex"),
    name,
    vaultPath,
    notesPath: vaultPath,
    assetsPath: vaultPath,
    exportsPath: path.join(vaultPath, "exports"),
    lastOpenedAt: new Date().toISOString(),
  };
}

function normalizeVaultSummary(vault: BrainxDesktopVaultSummary): BrainxDesktopVaultSummary {
  return {
    ...vault,
    lastOpenedAt: vault.lastOpenedAt || new Date(0).toISOString(),
  };
}

function sortVaultsByRecent(vaults: BrainxDesktopVaultSummary[]) {
  return [...vaults].sort((left, right) => {
    const leftTime = Number.isFinite(Date.parse(left.lastOpenedAt)) ? Date.parse(left.lastOpenedAt) : 0;
    const rightTime = Number.isFinite(Date.parse(right.lastOpenedAt)) ? Date.parse(right.lastOpenedAt) : 0;
    return rightTime - leftTime;
  });
}

function getActiveVault() {
  if (!vaultState.activeVaultId) return null;
  return vaultState.recentVaults.find((vault) => vault.id === vaultState.activeVaultId) ?? null;
}

function persistVaultState() {
  const payload: VaultStateFile = {
    activeVaultId: vaultState.activeVaultId,
    recentVaults: vaultState.recentVaults,
  };
  fs.writeFileSync(getVaultStateFilePath(), JSON.stringify(payload, null, 2), "utf8");
}

function createDefaultVaultIndex(vault: BrainxDesktopVaultSummary): VaultIndexFile {
  return {
    version: 1,
    vaultId: vault.id,
    syncPolicy: {
      mode: "local-only",
      remoteWorkspaceId: null,
      lastSyncedAt: null,
    },
    notes: [],
    folders: [],
    assets: [],
  };
}

function sanitizeSlug(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function sanitizeFileComponent(value: string, fallback: string) {
  const normalized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const candidate = normalized || fallback.trim() || "Untitled";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate) ? `${candidate}_` : candidate;
}

function buildNoteFileName(title: string) {
  return `${sanitizeFileComponent(title, "Untitled")}.md`;
}

function getVaultFolderPathSegments(index: VaultIndexFile, folderId: string | null) {
  if (!folderId) return [] as string[];
  const segments: string[] = [];
  const visited = new Set<string>();
  let currentFolderId: string | null = folderId;
  while (currentFolderId) {
    if (visited.has(currentFolderId)) {
      throw new Error("Vault folder hierarchy contains a cycle.");
    }
    visited.add(currentFolderId);
    const folder = index.folders.find((item) => item.folderId === currentFolderId);
    if (!folder) {
      break;
    }
    segments.unshift(sanitizeFileComponent(folder.name, "Folder"));
    currentFolderId = folder.parentFolderId ?? null;
  }
  return segments;
}

function buildVaultRelativeDirectory(index: VaultIndexFile, folderId: string | null) {
  const segments = getVaultFolderPathSegments(index, folderId);
  return segments.length > 0 ? path.join(...segments) : "";
}

function buildUniqueRelativeFilePath(
  existingRelativePaths: string[],
  directoryRelativePath: string,
  desiredFileName: string,
  excludeRelativePath?: string
) {
  const parsed = path.parse(desiredFileName);
  const baseName = sanitizeFileComponent(parsed.name || desiredFileName, "Untitled");
  const extension = parsed.ext || "";
  const siblingPaths = new Set(
    existingRelativePaths
      .filter((candidate) => candidate !== excludeRelativePath)
      .map((candidate) => path.normalize(candidate).toLowerCase())
  );
  let suffix = 1;
  let candidateName = `${baseName}${extension}`;
  let candidateRelativePath = directoryRelativePath
    ? path.join(directoryRelativePath, candidateName)
    : candidateName;
  while (siblingPaths.has(path.normalize(candidateRelativePath).toLowerCase())) {
    suffix += 1;
    candidateName = `${baseName} ${suffix}${extension}`;
    candidateRelativePath = directoryRelativePath
      ? path.join(directoryRelativePath, candidateName)
      : candidateName;
  }
  return candidateRelativePath;
}

function normalizeVaultRelativePath(relativePath: string) {
  return path.normalize(relativePath).replace(/[\\/]+/g, "/").toLowerCase();
}

function isVaultTextLikeFile(filePath: string) {
  return (
    /\.(md|markdown|txt|html|htm|csv)$/i.test(filePath) ||
    ["text/plain", "text/markdown", "text/html", "text/csv"].includes(guessMimeType(filePath))
  );
}

function toIsoTimestamp(value: Date) {
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? value.toISOString() : new Date().toISOString();
}

function createVaultNoteRecordForExistingFile(
  index: VaultIndexFile,
  options: {
    title: string;
    fileName: string;
    folderId: string | null;
    markdown?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  }
): BrainxDesktopVaultNote & { fileName: string } {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const updatedAt = options.updatedAt ?? createdAt;
  return {
    noteId: `vault_note_${crypto.randomUUID()}`,
    title: ensureUniqueNoteTitle(index.notes, options.title.trim() || "Untitled", options.folderId ?? null),
    markdown: options.markdown ?? "",
    folderId: options.folderId ?? null,
    tags: options.tags ?? [],
    version: 1,
    createdAt,
    updatedAt,
    typography: null,
    fileName: options.fileName,
  };
}

function createVaultAssetRecordForExistingFile(
  index: VaultIndexFile,
  filePath: string,
  relativePath: string,
  stats: fs.Stats
) {
  const createdAt = toIsoTimestamp(stats.birthtime);
  const updatedAt = toIsoTimestamp(stats.mtime);
  const asset: BrainxDesktopVaultAsset = {
    assetId: `vault_asset_${crypto.randomUUID()}`,
    fileName: path.basename(filePath),
    mimeType: guessMimeType(filePath),
    relativePath,
    size: stats.size,
    createdAt,
    updatedAt,
  };
  index.assets.unshift(asset);
  return asset;
}

function ensureDirectoryForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function moveFileIfNeeded(sourcePath: string, destinationPath: string) {
  if (path.normalize(sourcePath).toLowerCase() === path.normalize(destinationPath).toLowerCase()) {
    return;
  }
  ensureDirectoryForFile(destinationPath);
  fs.renameSync(sourcePath, destinationPath);
}

function relocateDirectoryIfNeeded(vaultRoot: string, sourceRelativePath: string, destinationRelativePath: string) {
  if (!sourceRelativePath || !destinationRelativePath) return;
  if (path.normalize(sourceRelativePath).toLowerCase() === path.normalize(destinationRelativePath).toLowerCase()) {
    return;
  }
  const sourcePath = path.join(vaultRoot, sourceRelativePath);
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  const destinationPath = path.join(vaultRoot, destinationRelativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.renameSync(sourcePath, destinationPath);
}

function rewriteRelativePathPrefix(relativePath: string, sourcePrefix: string, destinationPrefix: string) {
  const normalizedRelative = path.normalize(relativePath);
  const normalizedSource = path.normalize(sourcePrefix);
  const normalizedDestination = path.normalize(destinationPrefix);
  if (normalizedRelative === normalizedSource) {
    return normalizedDestination;
  }
  const sourceWithSep = `${normalizedSource}${path.sep}`;
  if (!normalizedRelative.startsWith(sourceWithSep)) {
    return relativePath;
  }
  return path.join(normalizedDestination, normalizedRelative.slice(sourceWithSep.length));
}

function resolveLegacyVaultFilePath(vault: BrainxDesktopVaultSummary, storedRelativePath: string, legacyDirectoryName: "notes" | "assets") {
  const currentPath = path.join(vault.vaultPath, storedRelativePath);
  if (fs.existsSync(currentPath)) {
    return currentPath;
  }
  const legacyPath = path.join(vault.vaultPath, legacyDirectoryName, storedRelativePath);
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  return currentPath;
}

function migrateLegacyVaultLayout(vault: BrainxDesktopVaultSummary) {
  const index = readVaultIndex(vault);
  let changed = false;

  const nextNotePaths = new Set<string>();
  for (const note of index.notes) {
    const directoryRelativePath = buildVaultRelativeDirectory(index, note.folderId ?? null);
    const desiredRelativePath = buildUniqueRelativeFilePath(
      Array.from(nextNotePaths),
      directoryRelativePath,
      buildNoteFileName(note.title),
      note.fileName
    );
    const currentPath = resolveLegacyVaultFilePath(vault, note.fileName, "notes");
    const desiredPath = path.join(vault.vaultPath, desiredRelativePath);
    if (fs.existsSync(currentPath) && path.normalize(currentPath).toLowerCase() !== path.normalize(desiredPath).toLowerCase()) {
      moveFileIfNeeded(currentPath, desiredPath);
      changed = true;
    }
    if (note.fileName !== desiredRelativePath) {
      note.fileName = desiredRelativePath;
      changed = true;
    }
    nextNotePaths.add(desiredRelativePath);
  }

  const nextAssetPaths = new Set<string>();
  for (const asset of index.assets) {
    const desiredRelativePath = buildUniqueRelativeFilePath(
      Array.from(nextAssetPaths),
      "",
      sanitizeFileComponent(asset.fileName, asset.assetId),
      asset.relativePath
    );
    const currentPath = resolveLegacyVaultFilePath(vault, asset.relativePath, "assets");
    const desiredPath = path.join(vault.vaultPath, desiredRelativePath);
    if (fs.existsSync(currentPath) && path.normalize(currentPath).toLowerCase() !== path.normalize(desiredPath).toLowerCase()) {
      moveFileIfNeeded(currentPath, desiredPath);
      changed = true;
    }
    if (asset.relativePath !== desiredRelativePath) {
      asset.relativePath = desiredRelativePath;
      changed = true;
    }
    nextAssetPaths.add(desiredRelativePath);
  }

  if (changed) {
    persistVaultIndex(vault, index);
  }
}

function ensureUniqueFolderName(
  folders: BrainxDesktopVaultFolder[],
  name: string,
  parentFolderId: string | null,
  excludeFolderId?: string
) {
  const siblings = folders.filter(
    (folder) => folder.parentFolderId === parentFolderId && folder.folderId !== excludeFolderId
  );
  const siblingNames = new Set(siblings.map((folder) => folder.name.trim()));
  if (!siblingNames.has(name.trim())) {
    return name.trim();
  }

  let suffix = 2;
  let candidate = `${name.trim()} ${suffix}`;
  while (siblingNames.has(candidate)) {
    suffix += 1;
    candidate = `${name.trim()} ${suffix}`;
  }
  return candidate;
}

function ensureUniqueNoteTitle(
  notes: Array<BrainxDesktopVaultNote & { fileName: string }>,
  title: string,
  folderId: string | null,
  excludeNoteId?: string
) {
  const siblings = notes.filter((note) => note.folderId === folderId && note.noteId !== excludeNoteId);
  const siblingTitles = new Set(siblings.map((note) => note.title.trim()));
  if (!siblingTitles.has(title.trim())) {
    return title.trim();
  }

  let suffix = 2;
  let candidate = `${title.trim()} ${suffix}`;
  while (siblingTitles.has(candidate)) {
    suffix += 1;
    candidate = `${title.trim()} ${suffix}`;
  }
  return candidate;
}

function ensureVaultStructure(vault: BrainxDesktopVaultSummary) {
  fs.mkdirSync(vault.vaultPath, { recursive: true });
  fs.mkdirSync(vault.exportsPath, { recursive: true });
  fs.mkdirSync(getVaultConfigDirectory(vault), { recursive: true });

  const workspaceDescriptorPath = getVaultWorkspaceFilePath(vault);
  if (!fs.existsSync(workspaceDescriptorPath)) {
    fs.writeFileSync(
      workspaceDescriptorPath,
      JSON.stringify(
        {
          version: 1,
          vaultId: vault.id,
          name: vault.name,
          createdAt: new Date().toISOString(),
          notesDir: ".",
          assetsDir: ".",
          exportsDir: "exports",
          syncPolicy: {
            mode: "local-only",
            remoteWorkspaceId: null,
            lastSyncedAt: null,
          },
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const indexPath = getVaultIndexFilePath(vault);
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, JSON.stringify(createDefaultVaultIndex(vault), null, 2), "utf8");
  }

  migrateLegacyVaultLayout(vault);
}

function upsertVault(vault: BrainxDesktopVaultSummary) {
  const normalizedVault = normalizeVaultSummary(vault);
  ensureVaultStructure(normalizedVault);
  const existingIndex = vaultState.recentVaults.findIndex((item) => item.id === normalizedVault.id);
  if (existingIndex >= 0) {
    vaultState.recentVaults.splice(existingIndex, 1);
  }
  vaultState.recentVaults.unshift(normalizedVault);
  vaultState.recentVaults = sortVaultsByRecent(vaultState.recentVaults).slice(0, 12);
  vaultState.activeVaultId = normalizedVault.id;
  persistVaultState();
  return normalizedVault;
}

function touchVault(vaultId: string, touchedAt = new Date().toISOString()) {
  const vault = vaultState.recentVaults.find((item) => item.id === vaultId);
  if (!vault) return null;
  return upsertVault({ ...vault, lastOpenedAt: touchedAt });
}

function loadStorageState() {
  try {
    const raw = fs.readFileSync(getStorageFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { local?: Record<string, string> };
    storageState.local = parsed.local ?? {};
  } catch {
    storageState.local = {};
  }
}

function persistStorageState() {
  fs.writeFileSync(getStorageFilePath(), JSON.stringify(storageState, null, 2), "utf8");
}

function loadVaultState() {
  try {
    const raw = fs.readFileSync(getVaultStateFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultStateFile>;
    vaultState.activeVaultId = parsed.activeVaultId ?? null;
    vaultState.recentVaults = Array.isArray(parsed.recentVaults) ? parsed.recentVaults.map(normalizeVaultSummary) : [];
  } catch {
    vaultState.activeVaultId = null;
    vaultState.recentVaults = [];
  }

  vaultState.recentVaults = sortVaultsByRecent(vaultState.recentVaults.filter((vault) => fs.existsSync(vault.vaultPath)));

  if (vaultState.activeVaultId && !vaultState.recentVaults.some((vault) => vault.id === vaultState.activeVaultId)) {
    vaultState.activeVaultId = null;
  }

  if (!vaultState.activeVaultId && vaultState.recentVaults.length > 0) {
    vaultState.activeVaultId = vaultState.recentVaults[0].id;
  }

  persistVaultState();
}

function requireActiveVault() {
  const vault = getActiveVault();
  if (!vault) {
    throw new Error("No active BrainX vault is selected.");
  }
  ensureVaultStructure(vault);
  return vault;
}

function readVaultIndex(vault: BrainxDesktopVaultSummary) {
  try {
    const raw = fs.readFileSync(getVaultIndexFilePath(vault), "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultIndexFile>;
    return {
      ...createDefaultVaultIndex(vault),
      ...parsed,
      version: 1 as const,
      vaultId: vault.id,
      syncPolicy: parsed.syncPolicy ?? createDefaultVaultIndex(vault).syncPolicy,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch {
    const fallback = createDefaultVaultIndex(vault);
    fs.writeFileSync(getVaultIndexFilePath(vault), JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

function persistVaultIndex(vault: BrainxDesktopVaultSummary, index: VaultIndexFile) {
  fs.writeFileSync(getVaultIndexFilePath(vault), JSON.stringify(index, null, 2), "utf8");
  const workspacePath = getVaultWorkspaceFilePath(vault);
  try {
    const workspaceRaw = fs.readFileSync(workspacePath, "utf8");
    const workspaceData = JSON.parse(workspaceRaw) as Record<string, unknown>;
    fs.writeFileSync(
      workspacePath,
      JSON.stringify({ ...workspaceData, syncPolicy: index.syncPolicy, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch {
    // ignore workspace descriptor sync failures
  }
}

function readVaultSyncState(vault: BrainxDesktopVaultSummary): VaultSyncStateFile {
  try {
    const raw = fs.readFileSync(getVaultSyncStateFilePath(vault), "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultSyncStateFile>;
    return {
      version: 1,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      noteMappings: parsed.noteMappings ?? {},
      folderMappings: parsed.folderMappings ?? {},
      assetMappings: parsed.assetMappings ?? {},
      deletedRemoteNoteIds: Array.isArray(parsed.deletedRemoteNoteIds) ? parsed.deletedRemoteNoteIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [],
    };
  } catch {
    return {
      version: 1,
      lastSyncedAt: null,
      noteMappings: {},
      folderMappings: {},
      assetMappings: {},
      deletedRemoteNoteIds: [],
    };
  }
}

function persistVaultSyncState(vault: BrainxDesktopVaultSummary, state: VaultSyncStateFile) {
  fs.writeFileSync(getVaultSyncStateFilePath(vault), JSON.stringify(state, null, 2), "utf8");
}

function readLastManualSyncJob(vault: BrainxDesktopVaultSummary): BrainxDesktopManualSyncJob | null {
  try {
    const raw = fs.readFileSync(getVaultLastSyncJobFilePath(vault), "utf8");
    return JSON.parse(raw) as BrainxDesktopManualSyncJob;
  } catch {
    return null;
  }
}

function persistLastManualSyncJob(vault: BrainxDesktopVaultSummary, job: BrainxDesktopManualSyncJob) {
  fs.writeFileSync(getVaultLastSyncJobFilePath(vault), JSON.stringify(job, null, 2), "utf8");
}

function readStoredAuthSession() {
  try {
    const raw = storageState.local[AUTH_SESSION_STORAGE_KEY];
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string | null; tokenType?: string | null };
    if (!parsed.accessToken) return null;
    return {
      accessToken: parsed.accessToken,
      tokenType: parsed.tokenType || "Bearer",
    };
  } catch {
    return null;
  }
}

function hashValue(value: unknown) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function hashVaultFolder(folder: BrainxDesktopVaultFolder) {
  return hashValue({
    name: folder.name,
    parentFolderId: folder.parentFolderId ?? null,
    color: folder.color ?? null,
    favorite: folder.favorite ?? false,
  });
}

function hashVaultNote(note: BrainxDesktopVaultNote & { fileName?: string }) {
  return hashValue({
    title: note.title,
    markdown: note.markdown,
    folderId: note.folderId ?? null,
    tags: note.tags,
    typography: note.typography ?? null,
  });
}

function isUpdatedAfter(updatedAt: string | null | undefined, baseline: string | null) {
  if (!updatedAt || !baseline) return Boolean(updatedAt);
  return Date.parse(updatedAt) > Date.parse(baseline);
}

function getVaultAssetById(vault: BrainxDesktopVaultSummary, assetId: string) {
  const index = readVaultIndex(vault);
  const asset = index.assets.find((item) => item.assetId === assetId);
  if (!asset) {
    throw new Error("Vault asset not found.");
  }
  return {
    asset,
    assetPath: path.join(vault.vaultPath, asset.relativePath),
  };
}

function getVaultAssetFilePath(vault: BrainxDesktopVaultSummary, asset: BrainxDesktopVaultAsset) {
  return path.join(vault.vaultPath, asset.relativePath);
}

function hashBufferSha256(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function extractAssetReferences(markdown: string) {
  const references: Array<{ assetId: string; blockType: "image" | "pdf" | "html" | "ppt" | "unknown" }> = [];
  const blockPattern = /<div\s+data-([a-z]+)-block="true"[^>]*data-asset-id="([^"]+)"/g;
  for (const match of markdown.matchAll(blockPattern)) {
    const rawType = match[1];
    const assetId = match[2];
    const blockType =
      rawType === "image" || rawType === "pdf" || rawType === "html" || rawType === "ppt"
        ? rawType
        : "unknown";
    references.push({ assetId, blockType });
  }

  const assetUrlPattern = /asset:\/\/([A-Za-z0-9._-]+)/g;
  for (const match of markdown.matchAll(assetUrlPattern)) {
    references.push({ assetId: match[1], blockType: "image" });
  }

  return references;
}

function replaceAssetIdsInMarkdown(markdown: string, replacements: Record<string, string>) {
  let nextMarkdown = markdown;
  for (const [sourceAssetId, targetAssetId] of Object.entries(replacements)) {
    if (!sourceAssetId || sourceAssetId === targetAssetId) continue;
    const escaped = sourceAssetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nextMarkdown = nextMarkdown.replace(new RegExp(`data-asset-id="${escaped}"`, "g"), `data-asset-id="${targetAssetId}"`);
    nextMarkdown = nextMarkdown.replace(new RegExp(`asset://${escaped}`, "g"), `asset://${targetAssetId}`);
  }
  return nextMarkdown;
}

function isLocalVaultAssetId(assetId: string) {
  return assetId.startsWith("vault_asset_");
}

function canMirrorAssetToVault(blockType: "image" | "pdf" | "html" | "ppt" | "unknown") {
  return blockType === "image" || blockType === "pdf" || blockType === "html";
}

async function ensureDirectory(directoryPath: string) {
  await fsp.mkdir(directoryPath, { recursive: true });
}

async function extractZipArchive(zipPath: string, destinationPath: string) {
  await ensureDirectory(destinationPath);
  await new Promise<void>((resolve, reject) => {
    const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destinationPath.replace(/'/g, "''")}' -Force`;
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ZIP extraction failed with code ${code ?? "unknown"}.`));
    });
    child.once("error", reject);
  });
}

function normalizeVaultSyncPolicy(
  current: BrainxDesktopVaultSyncPolicy,
  patch: { mode: BrainxDesktopVaultSyncMode; remoteWorkspaceId?: string | null }
): BrainxDesktopVaultSyncPolicy {
  return {
    mode: patch.mode,
    remoteWorkspaceId: patch.mode === "manual-cloud" ? patch.remoteWorkspaceId?.trim() || null : null,
    lastSyncedAt: current.lastSyncedAt,
  };
}

function readVaultNoteMarkdown(vault: BrainxDesktopVaultSummary, fileName: string) {
  const notePath = resolveLegacyVaultFilePath(vault, fileName, "notes");
  try {
    return fs.readFileSync(notePath, "utf8");
  } catch {
    return "";
  }
}

function writeVaultNoteMarkdown(vault: BrainxDesktopVaultSummary, fileName: string, markdown: string) {
  const notePath = path.join(vault.vaultPath, fileName);
  ensureDirectoryForFile(notePath);
  fs.writeFileSync(notePath, markdown, "utf8");
}

function deleteVaultNoteFile(vault: BrainxDesktopVaultSummary, fileName: string) {
  const notePath = path.join(vault.vaultPath, fileName);
  if (fs.existsSync(notePath)) {
    fs.rmSync(notePath, { force: true });
  }
}

function readVaultSnapshot(vault: BrainxDesktopVaultSummary): BrainxDesktopVaultSnapshot {
  const index = reconcileVaultIndexWithFilesystem(vault, readVaultIndex(vault));
  const syncState = readVaultSyncState(vault);
  return {
    vault,
    syncPolicy: index.syncPolicy,
    folders: index.folders,
    assets: index.assets,
    notes: index.notes.map((note) => ({
      ...note,
      remoteNoteId: syncState.noteMappings[note.noteId]?.remoteNoteId ?? null,
      markdown: readVaultNoteMarkdown(vault, note.fileName),
    })),
  };
}

function collectDescendantFolderIds(folders: BrainxDesktopVaultFolder[], folderId: string) {
  const descendantFolderIds = new Set<string>([folderId]);
  let frontier = [folderId];
  while (frontier.length > 0) {
    const next = folders
      .filter((folder) => folder.parentFolderId && frontier.includes(folder.parentFolderId))
      .map((folder) => folder.folderId)
      .filter((candidate) => !descendantFolderIds.has(candidate));
    next.forEach((candidate) => descendantFolderIds.add(candidate));
    frontier = next;
  }
  return descendantFolderIds;
}

function getStorageArea(area: BrainxDesktopStorageArea) {
  return area === "local" ? storageState.local : sessionStore;
}

function guessMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt") return "text/plain";
  if (ext === ".md") return "text/markdown";
  if (ext === ".csv") return "text/csv";
  if (ext === ".html" || ext === ".htm") return "text/html";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".json") return "application/json";
  if (ext === ".zip") return "application/zip";
  return "application/octet-stream";
}

function toDialogFilters(options?: BrainxDesktopOpenFileOptions) {
  if (!options?.accept?.length) return [];
  const extensions = options.accept
    .map((value: string) => value.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  if (!extensions.length) return [];
  return [{ name: "Supported Files", extensions }];
}

function isSafeHttpUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isAppUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin === appOrigin;
  } catch {
    return false;
  }
}

function createFallbackHtml(message: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>BrainX</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; background:#0b1020; color:#f4f7ff; margin:0; }
      main { min-height:100vh; display:grid; place-items:center; padding:32px; }
      section { width:min(560px, 100%); background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:24px; }
      h1 { margin:0 0 12px; font-size:24px; }
      p { margin:0 0 16px; line-height:1.6; color:#d3daf0; }
      button { appearance:none; border:0; border-radius:10px; padding:10px 14px; font:inherit; cursor:pointer; }
      .primary { background:#f4f7ff; color:#0b1020; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>BrainX Desktop</h1>
        <p>${message}</p>
        <button class="primary" onclick="location.reload()">다시 시도</button>
      </section>
    </main>
  </body>
</html>`)}`;
}

function registerAssetProtocol() {
  protocol.handle("brainx-asset", async (request) => {
    const assetId = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, "").replace(/^vault\/?/, ""));
    const vault = getActiveVault();
    if (!vault || !assetId) {
      return new Response("Asset not found", { status: 404 });
    }

    try {
      const { asset, assetPath } = getVaultAssetById(vault, assetId);
      const buffer = await fsp.readFile(assetPath);
      return new Response(buffer, {
        status: 200,
        headers: {
          "content-type": asset.mimeType || "application/octet-stream",
          "content-length": String(buffer.byteLength),
        },
      });
    } catch {
      return new Response("Asset not found", { status: 404 });
    }
  });
}

function createChildWindow(url: string, opener?: BrowserWindow | null, options?: BrainxDesktopPopupOptions) {
  const child = new BrowserWindow({
    parent: opener ?? mainWindow ?? undefined,
    modal: false,
    width: options?.width ?? 1200,
    height: options?.height ?? 860,
    minWidth: options?.minWidth ?? 960,
    minHeight: options?.minHeight ?? 640,
    autoHideMenuBar: true,
    ...getWindowChromeOptions(),
    show: false,
    title: options?.name ?? getWindowTitle(),
    icon: getWindowIconPath(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  child.once("ready-to-show", () => child.show());
  void child.loadURL(url);
  return child;
}

function navigateToDeepLink(targetUrl: string) {
  if (!mainWindow) {
    pendingDeepLink = targetUrl;
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
  void mainWindow.loadURL(targetUrl);
}

function resolveDeepLink(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${getProtocolScheme()}:`) return null;
    const routePath = parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`;
    const route = parsed.host ? `/${parsed.host}${routePath}` : routePath;
    const target = new URL(route + parsed.search + parsed.hash, appOrigin);
    return target.toString();
  } catch {
    return null;
  }
}

function consumePendingDeepLink() {
  if (!pendingDeepLink) return;
  const nextUrl = pendingDeepLink;
  pendingDeepLink = null;
  navigateToDeepLink(nextUrl);
}

function attachNavigationPolicy(window: BrowserWindow, allowExternalNavigation = false) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSafeHttpUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }

    if (allowExternalNavigation) {
      createChildWindow(url, window);
      return { action: "deny" };
    }

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        parent: window,
        modal: false,
        width: 1200,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        autoHideMenuBar: true,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    if (allowExternalNavigation && isSafeHttpUrl(url)) return;
    if (!isSafeHttpUrl(url)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    void shell.openExternal(url);
  });

  window.webContents.on("did-attach-webview", (_, contents) => {
    hardenContents(contents);
  });
}

function hardenContents(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (!isSafeHttpUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    createChildWindow(url, BrowserWindow.fromWebContents(contents));
    return { action: "deny" };
  });
}

function resolveDialogOwner(contents: WebContents): BaseWindow | undefined {
  return BrowserWindow.fromWebContents(contents) ?? mainWindow ?? undefined;
}

async function showOpenDialogForOwner(owner: BaseWindow | undefined, options: OpenDialogOptions) {
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options);
}

async function showSaveDialogForOwner(owner: BaseWindow | undefined, options: SaveDialogOptions) {
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options);
}

function createVaultFolderRecord(
  index: VaultIndexFile,
  options: BrainxDesktopCreateVaultFolderOptions
): BrainxDesktopVaultFolder {
  const now = new Date().toISOString();
  return {
    folderId: `vault_folder_${crypto.randomUUID()}`,
    name: ensureUniqueFolderName(index.folders, options.name, options.parentFolderId ?? null),
    parentFolderId: options.parentFolderId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function createVaultNoteRecord(
  index: VaultIndexFile,
  options: BrainxDesktopCreateVaultNoteOptions
): BrainxDesktopVaultNote & { fileName: string } {
  const now = new Date().toISOString();
  const noteId = `vault_note_${crypto.randomUUID()}`;
  const title = ensureUniqueNoteTitle(index.notes, options.title.trim() || "Untitled", options.folderId ?? null);
  const directoryRelativePath = buildVaultRelativeDirectory(index, options.folderId ?? null);
  const fileName = buildUniqueRelativeFilePath(
    index.notes.map((note) => note.fileName),
    directoryRelativePath,
    buildNoteFileName(title)
  );
  return {
    noteId,
    title,
    markdown: options.markdown ?? "",
    folderId: options.folderId ?? null,
    tags: options.tags ?? [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    typography: null,
    fileName,
  };
}

function createImportedAssetMarkdown(asset: BrainxDesktopVaultAsset) {
  const lowerName = asset.fileName.toLowerCase();
  if (asset.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lowerName)) {
    return `<div data-image-block="true" data-asset-id="${asset.assetId}" data-file-name="${asset.fileName}"></div>`;
  }
  if (lowerName.endsWith(".pdf")) {
    return `<div data-pdf-block="true" data-asset-id="${asset.assetId}" data-file-name="${asset.fileName}"></div>`;
  }
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) {
    return `<div data-html-block="true" data-asset-id="${asset.assetId}" data-file-name="${asset.fileName}"></div>`;
  }
  return [
    `# ${path.basename(asset.fileName, path.extname(asset.fileName)) || asset.fileName}`,
    "",
    `- Imported asset: ${asset.fileName}`,
    `- Vault path: ${asset.relativePath}`,
    `- MIME type: ${asset.mimeType}`,
    `- Size: ${asset.size} bytes`,
  ].join("\n");
}

function createVaultAssetRecord(
  index: VaultIndexFile,
  vault: BrainxDesktopVaultSummary,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  folderId: string | null = null
) {
  const now = new Date().toISOString();
  const assetId = `vault_asset_${crypto.randomUUID()}`;
  const directoryRelativePath = buildVaultRelativeDirectory(index, folderId);
  const relativePath = buildUniqueRelativeFilePath(
    index.assets.map((asset) => asset.relativePath),
    directoryRelativePath,
    sanitizeFileComponent(fileName, `${assetId}${path.extname(fileName) || ".bin"}`)
  );
  const assetPath = path.join(vault.vaultPath, relativePath);
  ensureDirectoryForFile(assetPath);
  fs.writeFileSync(assetPath, buffer);
  const asset: BrainxDesktopVaultAsset = {
    assetId,
    fileName,
    mimeType,
    relativePath,
    size: buffer.byteLength,
    createdAt: now,
    updatedAt: now,
  };
  index.assets.unshift(asset);
  return asset;
}

function ensureVaultFolderPath(
  index: VaultIndexFile,
  folderNameByPath: Map<string, string>,
  segments: string[]
) {
  let parentFolderId: string | null = null;
  let currentPath = "";
  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) continue;
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const normalizedCurrentPath = normalizeVaultRelativePath(currentPath);
    const existingFolderId = folderNameByPath.get(normalizedCurrentPath);
    if (existingFolderId) {
      parentFolderId = existingFolderId;
      continue;
    }
    const folder = createVaultFolderRecord(index, { name: segment, parentFolderId });
    index.folders.push(folder);
    folderNameByPath.set(normalizedCurrentPath, folder.folderId);
    parentFolderId = folder.folderId;
  }
  return parentFolderId;
}

function buildVaultFolderPathMap(index: VaultIndexFile) {
  const folderIdByPath = new Map<string, string>();
  for (const folder of index.folders) {
    const relativePath = buildVaultRelativeDirectory(index, folder.folderId);
    const normalized = normalizeVaultRelativePath(relativePath);
    if (normalized) {
      folderIdByPath.set(normalized, folder.folderId);
    }
  }
  return { folderIdByPath };
}

function reconcileVaultIndexWithFilesystem(vault: BrainxDesktopVaultSummary, index: VaultIndexFile) {
  const indexedNotePaths = new Set(index.notes.map((note) => normalizeVaultRelativePath(note.fileName)));
  const indexedAssetPaths = new Set(index.assets.map((asset) => normalizeVaultRelativePath(asset.relativePath)));
  const { folderIdByPath } = buildVaultFolderPathMap(index);
  let changed = false;

  // fs.readdirSync/statSync/readFileSync는 파일시스템 상태(권한 거부, 클라우드 동기화
  // placeholder, walk 도중 삭제/잠금된 파일 등)에 따라 예고 없이 throw할 수 있다. 이 함수가
  // 조금이라도 예외를 던지면 호출자인 readVaultSnapshot() 전체가 실패하고, 그 결과 렌더러의
  // getVaultSnapshot() IPC 호출이 reject되어 loadFromServer()의 Promise.all이 통째로 실패한다
  // — 노트 목록뿐 아니라 "웹 동기화" 버튼(usesDesktopVault)까지 함께 사라지는 원인이었다.
  // 디렉터리 하나, 파일 하나를 못 읽는 것이 전체 vault 스냅샷 로딩을 막으면 안 되므로, 문제가
  // 있는 디렉터리/파일은 건너뛰고 나머지는 계속 인덱싱한다.
  const walk = (directoryPath: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`[vault] 디렉터리를 읽지 못해 건너뜀: ${directoryPath}`, error);
      return;
    }

    for (const entry of entries) {
      if (entry.name === ".brainx") continue;
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "notes" || entry.name === "assets" || entry.name === path.basename(vault.exportsPath)) {
          continue;
        }
        walk(fullPath);
        continue;
      }

      try {
        const relativePath = path.relative(vault.vaultPath, fullPath);
        if (!relativePath || relativePath.startsWith("..")) continue;
        const normalizedRelativePath = normalizeVaultRelativePath(relativePath);
        if (indexedNotePaths.has(normalizedRelativePath) || indexedAssetPaths.has(normalizedRelativePath)) {
          continue;
        }

        const relativeSegments = relativePath.split(path.sep);
        const parentSegments = relativeSegments.slice(0, -1);
        const parentFolderId =
          parentSegments.length > 0
            ? ensureVaultFolderPath(index, folderIdByPath, parentSegments)
            : null;
        const stats = fs.statSync(fullPath);
        const title = path.basename(entry.name, path.extname(entry.name)) || entry.name;
        const createdAt = toIsoTimestamp(stats.birthtime);
        const updatedAt = toIsoTimestamp(stats.mtime);

        if (isVaultTextLikeFile(fullPath)) {
          const markdown = fs.readFileSync(fullPath, "utf8");
          const note = createVaultNoteRecordForExistingFile(index, {
            title,
            fileName: relativePath,
            folderId: parentFolderId,
            markdown,
            createdAt,
            updatedAt,
          });
          index.notes.unshift(note);
          indexedNotePaths.add(normalizedRelativePath);
          changed = true;
          continue;
        }

        const asset = createVaultAssetRecordForExistingFile(index, fullPath, relativePath, stats);
        indexedAssetPaths.add(normalizedRelativePath);
        const note = createVaultNoteRecord(index, {
          title,
          markdown: createImportedAssetMarkdown(asset),
          folderId: parentFolderId,
          tags: ["imported-asset"],
        });
        note.createdAt = createdAt;
        note.updatedAt = updatedAt;
        index.notes.unshift(note);
        writeVaultNoteMarkdown(vault, note.fileName, note.markdown);
        indexedNotePaths.add(normalizeVaultRelativePath(note.fileName));
        changed = true;
      } catch (error) {
        console.warn(`[vault] 파일을 인덱싱하지 못해 건너뜀: ${fullPath}`, error);
      }
    }
  };

  walk(vault.vaultPath);
  if (changed) {
    persistVaultIndex(vault, index);
  }
  return index;
}

async function importExtractedVaultDirectory(
  vault: BrainxDesktopVaultSummary,
  targetFolderId: string | null,
  extractedRoot: string
) {
  const index = readVaultIndex(vault);
  const createdNotes: Array<{ noteId?: string; title?: string }> = [];
  const failedFiles: Array<{ fileName?: string; reason?: string }> = [];
  const folderNameByPath = new Map<string, string>();

  const walk = async (directoryPath: string) => {
    const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".brainx") continue;
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "notes" || entry.name === "assets" || entry.name === path.basename(vault.exportsPath)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      const relativePath = path.relative(extractedRoot, fullPath);
      const relativeSegments = relativePath.split(path.sep);
      const parentSegments = relativeSegments.slice(0, -1);
      const parentFolderId =
        parentSegments.length > 0
          ? ensureVaultFolderPath(index, folderNameByPath, parentSegments)
          : targetFolderId;

      try {
        const buffer = await fsp.readFile(fullPath);
        const lowerName = entry.name.toLowerCase();
        const isTextLike =
          /\.(md|markdown|txt|html|htm|csv)$/i.test(lowerName) ||
          ["text/plain", "text/markdown", "text/html", "text/csv"].includes(guessMimeType(fullPath));

        if (isTextLike) {
          const note = createVaultNoteRecord(index, {
            title: path.basename(entry.name, path.extname(entry.name)),
            markdown: buffer.toString("utf8"),
            folderId: parentFolderId,
            tags: [],
          });
          index.notes.unshift(note);
          writeVaultNoteMarkdown(vault, note.fileName, note.markdown);
          createdNotes.push({ noteId: note.noteId, title: note.title });
          continue;
        }

        const asset = createVaultAssetRecord(index, vault, entry.name, guessMimeType(fullPath), buffer, parentFolderId);
        const note = createVaultNoteRecord(index, {
          title: path.basename(entry.name, path.extname(entry.name)),
          markdown: createImportedAssetMarkdown(asset),
          folderId: parentFolderId,
          tags: ["imported-asset"],
        });
        index.notes.unshift(note);
        writeVaultNoteMarkdown(vault, note.fileName, note.markdown);
        createdNotes.push({ noteId: note.noteId, title: note.title });
      } catch (error) {
        failedFiles.push({
          fileName: relativePath,
          reason: error instanceof Error ? error.message : "Unknown import failure",
        });
      }
    }
  };

  await walk(extractedRoot);
  persistVaultIndex(vault, index);
  return { createdNotes, failedFiles };
}

function buildRemoteWorkspaceHeaders(session: { accessToken: string; tokenType: string }, init?: RequestInit) {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `${session.tokenType} ${session.accessToken}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function remoteWorkspaceRequest<T>(pathName: string, init?: RequestInit): Promise<T> {
  const session = readStoredAuthSession();
  if (!session?.accessToken) {
    throw new Error("Desktop manual sync requires an authenticated BrainX session.");
  }

  const response = await fetch(`${getDesktopApiOrigin()}${pathName}`, {
    ...init,
    headers: buildRemoteWorkspaceHeaders(session, init),
  });
  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; message?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message ?? payload?.error?.message ?? `Remote sync request failed (${response.status}).`);
  }
  return payload.data as T;
}

async function remoteWorkspaceBinaryRequest(pathName: string, init?: RequestInit) {
  const session = readStoredAuthSession();
  if (!session?.accessToken) {
    throw new Error("Desktop manual sync requires an authenticated BrainX session.");
  }

  const response = await fetch(`${getDesktopApiOrigin()}${pathName}`, {
    ...init,
    headers: buildRemoteWorkspaceHeaders(session, init),
  });
  if (!response.ok) {
    throw new Error(`Remote asset request failed (${response.status}).`);
  }
  return response;
}

async function deleteRemoteWorkspaceNote(remoteNoteId: string) {
  const session = readStoredAuthSession();
  if (!session?.accessToken) {
    throw new Error("Desktop manual sync requires an authenticated BrainX session.");
  }

  const response = await fetch(`${getDesktopApiOrigin()}/api/v1/notes/${remoteNoteId}?mode=trash`, {
    method: "DELETE",
    headers: buildRemoteWorkspaceHeaders(session),
  });
  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; error?: { message?: string } }
    | null;
  if (response.status === 404) {
    return;
  }
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message ?? payload?.error?.message ?? `Remote note delete failed (${response.status}).`);
  }
}

async function uploadVaultAssetToRemote(
  vault: BrainxDesktopVaultSummary,
  index: VaultIndexFile,
  syncState: VaultSyncStateFile,
  localAssetId: string
) {
  const asset = index.assets.find((item) => item.assetId === localAssetId);
  if (!asset) {
    throw new Error(`Vault asset not found for sync: ${localAssetId}`);
  }

  const assetPath = getVaultAssetFilePath(vault, asset);
  const buffer = await fsp.readFile(assetPath);
  const checksum = hashBufferSha256(buffer);
  const currentMapping = syncState.assetMappings[localAssetId];
  if (currentMapping?.remoteAssetId && currentMapping.checksum === checksum) {
    return currentMapping.remoteAssetId;
  }

  const uploadSession = await remoteWorkspaceRequest<{
    uploadSessionId: string;
    uploadUrl: string;
    maxSizeBytes: number;
  }>("/api/v1/assets/upload-sessions", {
    method: "POST",
    body: JSON.stringify({
      fileName: asset.fileName,
      contentType: asset.mimeType,
      sizeBytes: asset.size,
      targetNoteId: null,
    }),
  });

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: asset.mimeType || "application/octet-stream" }), asset.fileName);
  await remoteWorkspaceBinaryRequest(`/api/v1/assets/upload-sessions/${uploadSession.uploadSessionId}/binary`, {
    method: "PUT",
    body: formData,
  });

  const completed = await remoteWorkspaceRequest<{ assetId: string; status: string }>(
    `/api/v1/assets/upload-sessions/${uploadSession.uploadSessionId}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        checksum,
        conversionMode: "KEEP_ORIGINAL",
      }),
    }
  );

  syncState.assetMappings[localAssetId] = {
    remoteAssetId: completed.assetId,
    checksum,
    syncedAt: new Date().toISOString(),
  };
  return completed.assetId;
}

async function ensureRemoteAssetMirroredToVault(
  vault: BrainxDesktopVaultSummary,
  index: VaultIndexFile,
  syncState: VaultSyncStateFile,
  remoteAssetId: string
) {
  const existingEntry = Object.entries(syncState.assetMappings).find(([, value]) => value.remoteAssetId === remoteAssetId);
  if (existingEntry) {
    const [localAssetId] = existingEntry;
    const existingAsset = index.assets.find((item) => item.assetId === localAssetId);
    if (existingAsset && fs.existsSync(getVaultAssetFilePath(vault, existingAsset))) {
      return localAssetId;
    }
  }

  const detail = await remoteWorkspaceRequest<{
    assetId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    downloadUrl: string;
    createdAt?: string;
  }>(`/api/v1/assets/${remoteAssetId}`);
  const response = await remoteWorkspaceBinaryRequest(`/api/v1/assets/${remoteAssetId}/file`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const asset = createVaultAssetRecord(index, vault, detail.fileName, detail.contentType, buffer);
  if (detail.createdAt) {
    asset.createdAt = detail.createdAt;
    asset.updatedAt = detail.createdAt;
  }
  syncState.assetMappings[asset.assetId] = {
    remoteAssetId,
    checksum: hashBufferSha256(buffer),
    syncedAt: new Date().toISOString(),
  };
  return asset.assetId;
}

async function buildRemoteMarkdownFromLocalNote(
  vault: BrainxDesktopVaultSummary,
  index: VaultIndexFile,
  syncState: VaultSyncStateFile,
  localMarkdown: string
) {
  const replacements: Record<string, string> = {};
  for (const reference of extractAssetReferences(localMarkdown)) {
    if (!isLocalVaultAssetId(reference.assetId)) continue;
    replacements[reference.assetId] = await uploadVaultAssetToRemote(vault, index, syncState, reference.assetId);
  }
  return replaceAssetIdsInMarkdown(localMarkdown, replacements);
}

async function buildLocalMarkdownFromRemoteNote(
  vault: BrainxDesktopVaultSummary,
  index: VaultIndexFile,
  syncState: VaultSyncStateFile,
  remoteMarkdown: string
) {
  const replacements: Record<string, string> = {};
  for (const reference of extractAssetReferences(remoteMarkdown)) {
    if (isLocalVaultAssetId(reference.assetId)) continue;
    if (!canMirrorAssetToVault(reference.blockType)) continue;
    replacements[reference.assetId] = await ensureRemoteAssetMirroredToVault(vault, index, syncState, reference.assetId);
  }
  return replaceAssetIdsInMarkdown(remoteMarkdown, replacements);
}

function writeConflictReport(vault: BrainxDesktopVaultSummary, jobId: string, conflicts: VaultSyncConflict[]) {
  if (conflicts.length === 0) return;
  fs.mkdirSync(getVaultConflictsDirectory(vault), { recursive: true });
  fs.writeFileSync(
    path.join(getVaultConflictsDirectory(vault), `${jobId}.json`),
    JSON.stringify({ jobId, generatedAt: new Date().toISOString(), conflicts }, null, 2),
    "utf8"
  );
}

function readConflictReport(vault: BrainxDesktopVaultSummary, jobId: string) {
  try {
    const raw = fs.readFileSync(path.join(getVaultConflictsDirectory(vault), `${jobId}.json`), "utf8");
    return JSON.parse(raw) as { jobId: string; generatedAt: string; conflicts: Array<Record<string, unknown>> };
  } catch {
    return null;
  }
}

async function runManualVaultSync(vault: BrainxDesktopVaultSummary): Promise<BrainxDesktopManualSyncJob> {
  const jobId = `vault_sync_${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const index = reconcileVaultIndexWithFilesystem(vault, readVaultIndex(vault));
  if (index.syncPolicy.mode !== "manual-cloud") {
    const skippedJob = {
      jobId,
      status: "SKIPPED",
      mode: index.syncPolicy.mode,
      startedAt,
      message: "현재 vault 동기화 모드는 로컬 전용입니다. 웹 반영이 필요하면 manual-cloud 모드로 바꾼 뒤 수동 동기화를 실행해 주세요.",
    } satisfies BrainxDesktopManualSyncJob;
    persistLastManualSyncJob(vault, skippedJob);
    return skippedJob;
  }

  try {
    const syncState = readVaultSyncState(vault);
    if (syncState.deletedRemoteNoteIds.length > 0) {
      const pendingDeletedRemoteNoteIds = [...new Set(syncState.deletedRemoteNoteIds)];
      for (const remoteNoteId of pendingDeletedRemoteNoteIds) {
        await deleteRemoteWorkspaceNote(remoteNoteId);
      }
      syncState.deletedRemoteNoteIds = [];
    }
    const remoteFoldersData = await remoteWorkspaceRequest<{
      folders: Array<{ folderId: string; name: string; parentFolderId: string | null; updatedAt?: string }>;
    }>("/api/v1/folders/tree");
    const remoteNotesData = await remoteWorkspaceRequest<{ notes: Array<{ noteId: string; title: string; markdown: string; folderId: string | null; tags: string[]; version: number; createdAt: string; updatedAt: string }>; totalCount: number }>("/api/v1/notes");
    const remoteFolders = Array.isArray(remoteFoldersData.folders) ? remoteFoldersData.folders : [];
    const remoteFoldersById = new Map(remoteFolders.map((folder) => [folder.folderId, folder]));
    const remoteNotesById = new Map(remoteNotesData.notes.map((note) => [note.noteId, note]));
    const reverseFolderMappings = new Map(Object.entries(syncState.folderMappings).map(([localId, value]) => [value.remoteFolderId, localId]));
    const reverseNoteMappings = new Map(Object.entries(syncState.noteMappings).map(([localId, value]) => [value.remoteNoteId, localId]));
    const conflicts: VaultSyncConflict[] = [];
    const createdNotes: Array<{ noteId?: string; title?: string }> = [];

    for (const remoteFolder of remoteFolders) {
      if (reverseFolderMappings.has(remoteFolder.folderId)) continue;
      const parentFolderId = remoteFolder.parentFolderId ? reverseFolderMappings.get(remoteFolder.parentFolderId) ?? null : null;
      const localFolder = createVaultFolderRecord(index, { name: remoteFolder.name, parentFolderId });
      localFolder.updatedAt = remoteFolder.updatedAt ?? localFolder.updatedAt;
      index.folders.push(localFolder);
      syncState.folderMappings[localFolder.folderId] = { remoteFolderId: remoteFolder.folderId };
      reverseFolderMappings.set(remoteFolder.folderId, localFolder.folderId);
    }

    const folderDepth = (folder: BrainxDesktopVaultFolder) => {
      let depth = 0;
      let currentParent = folder.parentFolderId;
      while (currentParent) {
        depth += 1;
        currentParent = index.folders.find((item) => item.folderId === currentParent)?.parentFolderId ?? null;
      }
      return depth;
    };

    const localFolders = index.folders.slice().sort((left, right) => folderDepth(left) - folderDepth(right));
    for (const localFolder of localFolders) {
      const mapping = syncState.folderMappings[localFolder.folderId];
      const localChanged = isUpdatedAfter(localFolder.updatedAt, syncState.lastSyncedAt);
      const payload = {
        name: localFolder.name,
        parentFolderId: localFolder.parentFolderId
          ? syncState.folderMappings[localFolder.parentFolderId]?.remoteFolderId ?? null
          : null,
      };

      if (!mapping) {
        const created = await remoteWorkspaceRequest<{ folderId: string; name: string; parentFolderId: string | null }>(
          "/api/v1/folders",
          { method: "POST", body: JSON.stringify(payload) }
        );
        syncState.folderMappings[localFolder.folderId] = { remoteFolderId: created.folderId };
        reverseFolderMappings.set(created.folderId, localFolder.folderId);
        continue;
      }

      const remoteFolder = remoteFoldersById.get(mapping.remoteFolderId);
      if (!remoteFolder) {
        const recreated = await remoteWorkspaceRequest<{ folderId: string; name: string; parentFolderId: string | null }>(
          "/api/v1/folders",
          { method: "POST", body: JSON.stringify(payload) }
        );
        syncState.folderMappings[localFolder.folderId] = { remoteFolderId: recreated.folderId };
        reverseFolderMappings.set(recreated.folderId, localFolder.folderId);
        continue;
      }

      const remoteChanged = isUpdatedAfter(remoteFolder.updatedAt ?? null, syncState.lastSyncedAt);
      if (localChanged && remoteChanged && hashVaultFolder(localFolder) !== hashValue(remoteFolder)) {
        conflicts.push({
          entityType: "folder",
          localId: localFolder.folderId,
          remoteId: remoteFolder.folderId,
          localUpdatedAt: localFolder.updatedAt,
          remoteUpdatedAt: remoteFolder.updatedAt ?? localFolder.updatedAt,
          reason: "Both local and remote folder metadata changed since the last sync.",
        });
        continue;
      }

      if (localChanged) {
        await remoteWorkspaceRequest(`/api/v1/folders/${remoteFolder.folderId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else if (remoteChanged) {
        localFolder.name = remoteFolder.name;
        localFolder.parentFolderId = remoteFolder.parentFolderId
          ? reverseFolderMappings.get(remoteFolder.parentFolderId) ?? null
          : null;
        localFolder.updatedAt = remoteFolder.updatedAt ?? localFolder.updatedAt;
      }
    }

    for (const remoteNote of remoteNotesData.notes) {
      if (reverseNoteMappings.has(remoteNote.noteId)) continue;
      const localizedMarkdown = await buildLocalMarkdownFromRemoteNote(vault, index, syncState, remoteNote.markdown);
      const localNote = createVaultNoteRecord(index, {
        title: remoteNote.title,
        markdown: localizedMarkdown,
        folderId: remoteNote.folderId ? reverseFolderMappings.get(remoteNote.folderId) ?? null : null,
        tags: remoteNote.tags ?? [],
      });
      localNote.updatedAt = remoteNote.updatedAt;
      localNote.createdAt = remoteNote.createdAt;
      localNote.version = Math.max(remoteNote.version ?? 1, 1);
      index.notes.unshift(localNote);
      writeVaultNoteMarkdown(vault, localNote.fileName, localNote.markdown);
      syncState.noteMappings[localNote.noteId] = { remoteNoteId: remoteNote.noteId };
      createdNotes.push({ noteId: localNote.noteId, title: localNote.title });
    }

    for (const localNote of index.notes) {
      const mapping = syncState.noteMappings[localNote.noteId];
      const localChanged = isUpdatedAfter(localNote.updatedAt, syncState.lastSyncedAt);
      let remoteEquivalentMarkdown: string | null = null;
      const getRemoteEquivalentMarkdown = async () => {
        if (remoteEquivalentMarkdown !== null) {
          return remoteEquivalentMarkdown;
        }
        remoteEquivalentMarkdown = await buildRemoteMarkdownFromLocalNote(vault, index, syncState, localNote.markdown);
        return remoteEquivalentMarkdown;
      };
      const metadataPayload = {
        title: localNote.title,
        folderId: localNote.folderId ? syncState.folderMappings[localNote.folderId]?.remoteFolderId ?? null : null,
        tags: localNote.tags,
        typography: localNote.typography ?? null,
      };

      if (!mapping) {
        const created = await remoteWorkspaceRequest<{ noteId: string; title: string; folderId: string | null; version: number; createdAt: string }>(
          "/api/v1/notes",
          {
            method: "POST",
            body: JSON.stringify({
              title: localNote.title,
              markdown: await getRemoteEquivalentMarkdown(),
              folderId: metadataPayload.folderId,
              tags: localNote.tags,
            }),
          }
        );
        syncState.noteMappings[localNote.noteId] = { remoteNoteId: created.noteId };
        continue;
      }

      const remoteNote = remoteNotesById.get(mapping.remoteNoteId);
      if (!remoteNote) {
        const recreated = await remoteWorkspaceRequest<{ noteId: string; title: string; folderId: string | null; version: number; createdAt: string }>(
          "/api/v1/notes",
          {
            method: "POST",
            body: JSON.stringify({
              title: localNote.title,
              markdown: await getRemoteEquivalentMarkdown(),
              folderId: metadataPayload.folderId,
              tags: localNote.tags,
            }),
          }
        );
        syncState.noteMappings[localNote.noteId] = { remoteNoteId: recreated.noteId };
        continue;
      }

      const remoteChanged = isUpdatedAfter(remoteNote.updatedAt, syncState.lastSyncedAt);
      if (
        localChanged &&
        remoteChanged &&
        hashVaultNote(localNote) !== hashValue({
          title: remoteNote.title,
          markdown: await buildLocalMarkdownFromRemoteNote(vault, index, syncState, remoteNote.markdown),
          folderId: remoteNote.folderId ? reverseFolderMappings.get(remoteNote.folderId) ?? null : null,
          tags: remoteNote.tags ?? [],
        })
      ) {
        conflicts.push({
          entityType: "note",
          localId: localNote.noteId,
          remoteId: remoteNote.noteId,
          localUpdatedAt: localNote.updatedAt,
          remoteUpdatedAt: remoteNote.updatedAt,
          reason: "Both local and remote note content changed since the last sync.",
        });
        continue;
      }

      if (localChanged) {
        await remoteWorkspaceRequest(`/api/v1/notes/${remoteNote.noteId}/content`, {
          method: "PUT",
          body: JSON.stringify({
            baseVersion: remoteNote.version ?? 1,
            markdown: await getRemoteEquivalentMarkdown(),
            clientSavedAt: new Date().toISOString(),
          }),
        });
        await remoteWorkspaceRequest(`/api/v1/notes/${remoteNote.noteId}/metadata`, {
          method: "PATCH",
          body: JSON.stringify(metadataPayload),
        });
      } else if (remoteChanged) {
        const localizedMarkdown = await buildLocalMarkdownFromRemoteNote(vault, index, syncState, remoteNote.markdown);
        localNote.title = remoteNote.title;
        localNote.markdown = localizedMarkdown;
        localNote.folderId = remoteNote.folderId ? reverseFolderMappings.get(remoteNote.folderId) ?? null : null;
        localNote.tags = remoteNote.tags ?? [];
        localNote.version = Math.max(remoteNote.version ?? localNote.version, localNote.version);
        localNote.updatedAt = remoteNote.updatedAt;
        writeVaultNoteMarkdown(vault, localNote.fileName, localNote.markdown);
      }
    }

    persistVaultIndex(vault, index);
    syncState.lastSyncedAt = new Date().toISOString();
    persistVaultSyncState(vault, syncState);
    writeConflictReport(vault, jobId, conflicts);
    index.syncPolicy.lastSyncedAt = syncState.lastSyncedAt;
    persistVaultIndex(vault, index);

    const completedJob = {
      jobId,
      status: conflicts.length > 0 ? "CONFLICT" : "COMPLETED",
      mode: index.syncPolicy.mode,
      startedAt,
      completedAt: new Date().toISOString(),
      message: conflicts.length > 0
        ? "동기화는 완료됐지만 일부 항목에 충돌이 있습니다. 자세한 내용은 `.brainx/conflicts/`를 확인해 주세요."
        : "로컬 변경사항의 웹 동기화가 완료되었습니다.",
      createdNotes,
      failedFiles: [],
      conflicts,
    } satisfies BrainxDesktopManualSyncJob;
    persistLastManualSyncJob(vault, completedJob);
    return completedJob;
  } catch (error) {
    const failedJob = {
      jobId,
      status: "FAILED",
      mode: index.syncPolicy.mode,
      startedAt,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "수동 동기화에 실패했습니다.",
      failedFiles: [],
      conflicts: [],
    } satisfies BrainxDesktopManualSyncJob;
    persistLastManualSyncJob(vault, failedJob);
    return failedJob;
  }
}

function buildAppMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "BrainX",
      submenu: [
        { role: "about" },
        { type: "separator" as const },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function findAvailablePort(startPort: number) {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    const available = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once("error", () => resolve(false));
      tester.once("listening", () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error("No available port found for bundled renderer.");
}

function getBundledRendererServerPath() {
  for (const candidate of getBundledRendererCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function waitForServer(url: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reachable = await new Promise<boolean>((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(response.statusCode !== undefined && response.statusCode < 500);
      });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (reachable) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error("Timed out while waiting for bundled renderer server.");
}

async function bootstrapRendererRuntime() {
  const serverPath = getBundledRendererServerPath();
  if (!app.isPackaged || !serverPath) {
    rendererMode = getRendererMode({ bundledAvailable: false });
    rendererEntryUrl = getRendererEntryUrl({ bundledAvailable: false });
    appOrigin = getAppOrigin({ bundledAvailable: false });
    return;
  }

  bundledRendererPort = await findAvailablePort(getBundledRendererPort());
  const serverCwd = path.dirname(serverPath);
  if (!fs.existsSync(serverCwd)) {
    throw new Error(`Bundled renderer directory does not exist: ${serverCwd}`);
  }

  bundledRendererProcess = spawn(process.execPath, [serverPath], {
    cwd: serverCwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(bundledRendererPort),
      HOSTNAME: "127.0.0.1",
      INTELLIGENCE_API_BASE_URL: "https://brainx.p-e.kr",
    },
    stdio: "ignore",
    windowsHide: true,
  });

  bundledRendererProcess.unref();

  bundledRendererProcess.once("exit", () => {
    bundledRendererProcess = null;
  });

  rendererMode = getRendererMode({ bundledAvailable: true });
  rendererEntryUrl = getRendererEntryUrl({
    bundledAvailable: true,
    bundledPort: bundledRendererPort,
  });
  appOrigin = getAppOrigin({
    bundledAvailable: true,
    bundledPort: bundledRendererPort,
  });

  try {
    await waitForServer(rendererEntryUrl);
  } catch (error) {
    rendererMode = getRendererMode({ bundledAvailable: false });
    rendererEntryUrl = getRendererEntryUrl({ bundledAvailable: false });
    appOrigin = getAppOrigin({ bundledAvailable: false });
    if (bundledRendererProcess) {
      bundledRendererProcess.kill();
      bundledRendererProcess = null;
    }
    console.warn(error instanceof Error ? error.message : error);
  }
}

async function createMainWindow() {
  const { width, height } = getWindowSize();

  const window = new BrowserWindow({
    width,
    height,
    minWidth: 1200,
    minHeight: 760,
    title: getWindowTitle(),
    autoHideMenuBar: true,
    ...getWindowChromeOptions(),
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachNavigationPolicy(window);
  hardenContents(window.webContents);
  window.webContents.openDevTools({ mode: "detach" });
  window.webContents.on("did-finish-load", () => installWindowsTitleBarDragRegion(window));

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.webContents.on("did-fail-load", async (_event, code, description, failedUrl) => {
    if (failedUrl.startsWith("data:text/html")) return;
    const message = rendererMode === "remote-web"
      ? `서버에 연결하지 못했습니다. (${code}: ${description})`
      : `로컬 renderer를 불러오지 못했습니다. (${code}: ${description})`;
    await window.loadURL(createFallbackHtml(message));
  });

  await window.loadURL(rendererEntryUrl);
  mainWindow = window;
  consumePendingDeepLink();
}

function registerProtocolHandling() {
  if (electronProcess.defaultApp) {
    app.setAsDefaultProtocolClient(getProtocolScheme(), process.execPath, [path.resolve(process.argv[1] ?? "")]);
    return;
  }
  app.setAsDefaultProtocolClient(getProtocolScheme());
}

function registerSingleInstanceHandling() {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return false;
  }

  app.on("second-instance", (_event, argv) => {
    const deepLinkArg = argv.find((value) => value.startsWith(`${getProtocolScheme()}://`));
    if (deepLinkArg) {
      const targetUrl = resolveDeepLink(deepLinkArg);
      if (targetUrl) {
        navigateToDeepLink(targetUrl);
        return;
      }
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  return true;
}

function registerDeepLinkEvents() {
  app.on("open-url", (event, rawUrl) => {
    event.preventDefault();
    const targetUrl = resolveDeepLink(rawUrl);
    if (targetUrl) {
      navigateToDeepLink(targetUrl);
    }
  });

  const initialDeepLink = process.argv.find((value) => value.startsWith(`${getProtocolScheme()}://`));
  if (initialDeepLink) {
    pendingDeepLink = resolveDeepLink(initialDeepLink);
  }
}

function registerIpc() {
  ipcMain.handle("brainx-desktop:get-config", () => ({
    platform: process.platform,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    appOrigin,
    appMode: rendererMode,
    activeVault: getActiveVault(),
    windowControlsOverlayHeight:
      process.platform === "win32" ? WINDOWS_TITLE_BAR_OVERLAY_HEIGHT : 0,
  }));

  ipcMain.handle("brainx-desktop:open-external", async (_event, url: string) => {
    if (!isSafeHttpUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("brainx-desktop:open-popup", async (event, options: BrainxDesktopPopupOptions) => {
    if (!isSafeHttpUrl(options.url)) return null;

    const openerWindow = BrowserWindow.fromWebContents(event.sender);
    const popupId = options.popupId ?? crypto.randomUUID();
    const child = createChildWindow(options.url, openerWindow, options);
    attachNavigationPolicy(child, true);
    hardenContents(child.webContents);

    popupRegistry.set(child.id, {
      popupId,
      channel: options.channel,
      opener: event.sender,
    });

    child.on("closed", () => {
      const popup = popupRegistry.get(child.id);
      popupRegistry.delete(child.id);
      if (!popup || popup.opener.isDestroyed()) return;
      popup.opener.send("brainx-desktop:popup-closed", {
        popupId: popup.popupId,
        channel: popup.channel,
      });
    });

    return { popupId, channel: options.channel };
  });

  ipcMain.handle("brainx-desktop:notify-popup-result", async (event, result: BrainxDesktopPopupResult) => {
    const popupWindow = BrowserWindow.fromWebContents(event.sender);
    if (!popupWindow) return;

    const popup = popupRegistry.get(popupWindow.id);
    if (!popup || popup.opener.isDestroyed()) return;

    popup.opener.send("brainx-desktop:popup-result", {
      popupId: result.popupId ?? popup.popupId,
      channel: result.channel,
      payload: result.payload,
    });
  });

  ipcMain.handle("brainx-desktop:close-current-window", async (event) => {
    const popupWindow = BrowserWindow.fromWebContents(event.sender);
    if (!popupWindow || popupWindow === mainWindow) return;
    popupWindow.close();
  });

  ipcMain.on("brainx-desktop:get-stored-value", (event, area: BrainxDesktopStorageArea, key: string) => {
    const target = getStorageArea(area);
    event.returnValue = target instanceof Map ? target.get(key) ?? null : target[key] ?? null;
  });

  ipcMain.on("brainx-desktop:set-stored-value", (event, area: BrainxDesktopStorageArea, key: string, value: string) => {
    const target = getStorageArea(area);
    if (target instanceof Map) {
      target.set(key, value);
    } else {
      target[key] = value;
      persistStorageState();
    }
    event.returnValue = true;
  });

  ipcMain.on("brainx-desktop:remove-stored-value", (event, area: BrainxDesktopStorageArea, key: string) => {
    const target = getStorageArea(area);
    if (target instanceof Map) {
      target.delete(key);
    } else if (key in target) {
      delete target[key];
      persistStorageState();
    }
    event.returnValue = true;
  });

  ipcMain.handle("brainx-desktop:request-api", async (_event, options: BrainxDesktopApiRequestOptions) => {
    const url = resolveDesktopApiRequestUrl(options.path);
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
    });
    const bodyText = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    const result: BrainxDesktopApiResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      bodyText,
      headers,
    };
    return result;
  });

  ipcMain.handle("brainx-desktop:open-file", async (event, options?: BrainxDesktopOpenFileOptions) => {
    const owner = resolveDialogOwner(event.sender);
    const result = await showOpenDialogForOwner(owner, {
      title: options?.title ?? "Select File",
      properties: ["openFile"],
      filters: toDialogFilters(options),
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const data = await fsp.readFile(filePath);
    return {
      name: path.basename(filePath),
      mimeType: guessMimeType(filePath),
      dataBase64: data.toString("base64"),
    };
  });

  ipcMain.handle("brainx-desktop:save-file", async (event, options: BrainxDesktopSaveFileOptions) => {
    const owner = resolveDialogOwner(event.sender);
    const result = await showSaveDialogForOwner(owner, {
      title: "Save File",
      defaultPath: options.fileName,
    });
    if (result.canceled || !result.filePath) return false;

    await fsp.writeFile(result.filePath, Buffer.from(options.dataBase64, "base64"));
    return true;
  });

  ipcMain.handle("brainx-desktop:list-vaults", () => vaultState.recentVaults);

  ipcMain.handle("brainx-desktop:get-active-vault", () => getActiveVault());

  ipcMain.handle("brainx-desktop:activate-vault", (_event, vaultId: string) => {
    const vault = vaultState.recentVaults.find((item) => item.id === vaultId);
    if (!vault || !fs.existsSync(vault.vaultPath)) {
      return null;
    }
    return upsertVault({ ...vault, lastOpenedAt: new Date().toISOString() });
  });

  ipcMain.handle("brainx-desktop:choose-vault-directory", async (event) => {
    const owner = resolveDialogOwner(event.sender);
    const result = await showOpenDialogForOwner(owner, {
      title: "Open BrainX Vault",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const selectedPath = result.filePaths[0];
    const vault = toVaultSummary(selectedPath);
    const hadWorkspaceDescriptor = fs.existsSync(getVaultWorkspaceFilePath(vault));
    const openedVault = upsertVault(vault);
    if (!hadWorkspaceDescriptor) {
      await importExtractedVaultDirectory(openedVault, null, selectedPath);
    }
    return openedVault;
  });

  ipcMain.handle("brainx-desktop:create-vault", async (event, options?: BrainxDesktopCreateVaultOptions) => {
    const owner = resolveDialogOwner(event.sender);
    const requestedName = options?.name?.trim() || "BrainX Vault";
    const result = await showOpenDialogForOwner(owner, {
      title: "Choose Vault Parent Folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const vaultPath = path.join(result.filePaths[0], requestedName);
    const vault = toVaultSummary(vaultPath, requestedName);
    return upsertVault(vault);
  });

  ipcMain.handle("brainx-desktop:get-vault-snapshot", () => {
    const vault = getActiveVault();
    if (!vault) return null;
    const touchedVault = touchVault(vault.id) ?? vault;
    return readVaultSnapshot(touchedVault);
  });

  ipcMain.handle("brainx-desktop:create-vault-folder", (_event, options: BrainxDesktopCreateVaultFolderOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const folder = createVaultFolderRecord(index, options);
    index.folders.unshift(folder);
    const folderPath = path.join(vault.vaultPath, buildVaultRelativeDirectory(index, folder.folderId));
    fs.mkdirSync(folderPath, { recursive: true });
    persistVaultIndex(vault, index);
    return folder;
  });

  ipcMain.handle("brainx-desktop:patch-vault-folder", (_event, options: BrainxDesktopPatchVaultFolderOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const folder = index.folders.find((item) => item.folderId === options.folderId);
    if (!folder) {
      throw new Error("Vault folder not found.");
    }

    const currentRelativePath = buildVaultRelativeDirectory(index, folder.folderId);
    const affectedFolderIds = collectDescendantFolderIds(index.folders, folder.folderId);

    if (typeof options.name === "string" && options.name.trim()) {
      folder.name = ensureUniqueFolderName(index.folders, options.name, options.parentFolderId ?? folder.parentFolderId, folder.folderId);
    }
    if (options.parentFolderId !== undefined) {
      if (options.parentFolderId === folder.folderId) {
        throw new Error("Vault folder cannot be moved into itself.");
      }
      if (options.parentFolderId && collectDescendantFolderIds(index.folders, folder.folderId).has(options.parentFolderId)) {
        throw new Error("Vault folder cannot be moved into its descendant.");
      }
      folder.parentFolderId = options.parentFolderId;
    }
    if (options.color !== undefined) {
      folder.color = options.color;
    }
    if (options.favorite !== undefined) {
      folder.favorite = options.favorite;
    }

    const nextRelativePath = buildVaultRelativeDirectory(index, folder.folderId);
    if (currentRelativePath && nextRelativePath) {
      relocateDirectoryIfNeeded(vault.vaultPath, currentRelativePath, nextRelativePath);
      index.notes.forEach((note) => {
        if (note.folderId && affectedFolderIds.has(note.folderId)) {
          note.fileName = rewriteRelativePathPrefix(note.fileName, currentRelativePath, nextRelativePath);
        }
      });
      index.assets.forEach((asset) => {
        asset.relativePath = rewriteRelativePathPrefix(asset.relativePath, currentRelativePath, nextRelativePath);
      });
    }

    folder.updatedAt = new Date().toISOString();
    persistVaultIndex(vault, index);
    return folder;
  });

  ipcMain.handle("brainx-desktop:delete-vault-folder", (_event, options: BrainxDesktopDeleteVaultFolderOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const deletedFolderIds = collectDescendantFolderIds(index.folders, options.folderId);
    const deletedRelativeDirectories = Array.from(deletedFolderIds)
      .map((folderId) => buildVaultRelativeDirectory(index, folderId))
      .filter(Boolean);
    const notesToDelete = index.notes.filter((note) => note.folderId && deletedFolderIds.has(note.folderId));
    notesToDelete.forEach((note) => deleteVaultNoteFile(vault, note.fileName));
    index.notes = index.notes.filter((note) => !(note.folderId && deletedFolderIds.has(note.folderId)));
    index.assets = index.assets.filter((asset) => {
      const normalizedAssetPath = path.normalize(asset.relativePath);
      const shouldDelete = deletedRelativeDirectories.some((relativeDirectory) => {
        const normalizedDirectory = path.normalize(relativeDirectory);
        return (
          normalizedAssetPath === normalizedDirectory ||
          normalizedAssetPath.startsWith(`${normalizedDirectory}${path.sep}`)
        );
      });
      if (shouldDelete) {
        const assetPath = path.join(vault.vaultPath, asset.relativePath);
        if (fs.existsSync(assetPath)) {
          fs.rmSync(assetPath, { force: true });
        }
      }
      return !shouldDelete;
    });
    deletedRelativeDirectories
      .sort((left, right) => right.length - left.length)
      .forEach((relativeDirectory) => {
        const folderPath = path.join(vault.vaultPath, relativeDirectory);
        if (fs.existsSync(folderPath)) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      });
    index.folders = index.folders.filter((folder) => !deletedFolderIds.has(folder.folderId));
    persistVaultIndex(vault, index);
    return {
      deletedFolderIds: Array.from(deletedFolderIds),
      deletedNoteIds: notesToDelete.map((note) => note.noteId),
      deletedAt: new Date().toISOString(),
    };
  });

  ipcMain.handle("brainx-desktop:create-vault-note", (_event, options: BrainxDesktopCreateVaultNoteOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const note = createVaultNoteRecord(index, options);
    index.notes.unshift(note);
    writeVaultNoteMarkdown(vault, note.fileName, note.markdown);
    persistVaultIndex(vault, index);
    return note;
  });

  ipcMain.handle("brainx-desktop:save-vault-note-content", (_event, options: BrainxDesktopSaveVaultNoteContentOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const note = index.notes.find((item) => item.noteId === options.noteId);
    if (!note) {
      throw new Error("Vault note not found.");
    }
    const nextVersion = Math.max(note.version + 1, options.baseVersion + 1);
    const savedAt = new Date().toISOString();
    note.markdown = options.markdown;
    note.version = nextVersion;
    note.updatedAt = savedAt;
    writeVaultNoteMarkdown(vault, note.fileName, options.markdown);
    persistVaultIndex(vault, index);
    return { noteId: note.noteId, version: nextVersion, savedAt, status: "SAVED" as const };
  });

  ipcMain.handle("brainx-desktop:save-vault-note-metadata", (_event, options: BrainxDesktopSaveVaultNoteMetadataOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const note = index.notes.find((item) => item.noteId === options.noteId);
    if (!note) {
      throw new Error("Vault note not found.");
    }
    const nextFolderId = options.folderId !== undefined ? options.folderId : note.folderId;
    const nextTitle = ensureUniqueNoteTitle(index.notes, options.title.trim() || note.title, nextFolderId, note.noteId);
    const nextFileName = buildUniqueRelativeFilePath(
      index.notes.map((item) => item.fileName),
      buildVaultRelativeDirectory(index, nextFolderId),
      buildNoteFileName(nextTitle),
      note.fileName
    );
    const currentMarkdown = readVaultNoteMarkdown(vault, note.fileName);
    if (nextFileName !== note.fileName) {
      writeVaultNoteMarkdown(vault, nextFileName, currentMarkdown);
      deleteVaultNoteFile(vault, note.fileName);
      note.fileName = nextFileName;
    }
    note.title = nextTitle;
    note.folderId = nextFolderId;
    note.tags = options.tags ?? [];
    note.typography = options.typography ?? null;
    note.version += 1;
    note.updatedAt = new Date().toISOString();
    persistVaultIndex(vault, index);
    return {
      noteId: note.noteId,
      title: note.title,
      folderId: note.folderId,
      tags: note.tags,
      version: note.version,
      typography: note.typography ?? undefined,
    };
  });

  ipcMain.handle("brainx-desktop:delete-vault-note", async (_event, options: BrainxDesktopDeleteVaultNoteOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const note = index.notes.find((item) => item.noteId === options.noteId);
    if (!note) {
      return { noteId: options.noteId, deletedAt: new Date().toISOString(), purgeAt: null };
    }
    const syncState = readVaultSyncState(vault);
    const mappedRemoteNoteId = syncState.noteMappings[note.noteId]?.remoteNoteId ?? null;
    if (mappedRemoteNoteId) {
      syncState.deletedRemoteNoteIds = Array.from(new Set([...syncState.deletedRemoteNoteIds, mappedRemoteNoteId]));
      delete syncState.noteMappings[note.noteId];
      persistVaultSyncState(vault, syncState);
    }
    deleteVaultNoteFile(vault, note.fileName);
    index.notes = index.notes.filter((item) => item.noteId !== options.noteId);
    persistVaultIndex(vault, index);
    return { noteId: options.noteId, deletedAt: new Date().toISOString(), purgeAt: null };
  });

  ipcMain.handle("brainx-desktop:write-vault-asset", (_event, options: BrainxDesktopWriteVaultAssetOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const buffer = Buffer.from(options.dataBase64, "base64");
    const asset = createVaultAssetRecord(index, vault, options.fileName, options.mimeType, buffer);
    persistVaultIndex(vault, index);
    return asset;
  });

  ipcMain.handle("brainx-desktop:open-vault-asset", async (_event, assetId: string) => {
    const vault = requireActiveVault();
    const { assetPath } = getVaultAssetById(vault, assetId);
    const result = await shell.openPath(assetPath);
    return result.length === 0;
  });

  ipcMain.handle("brainx-desktop:import-vault-zip", async (_event, options: BrainxDesktopImportVaultZipOptions) => {
    const vault = requireActiveVault();
    const jobId = `desktop_zip_import_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    const tempRoot = path.join(app.getPath("temp"), "brainx-vault-imports", jobId);
    const zipPath = path.join(tempRoot, options.fileName);
    const extractPath = path.join(tempRoot, "unzipped");

    try {
      await ensureDirectory(tempRoot);
      await fsp.writeFile(zipPath, Buffer.from(options.dataBase64, "base64"));
      await extractZipArchive(zipPath, extractPath);
      const result = await importExtractedVaultDirectory(vault, options.targetFolderId ?? null, extractPath);
      return {
        jobId,
        status: result.failedFiles.length > 0 ? "CONFLICT" : "COMPLETED",
        mode: readVaultIndex(vault).syncPolicy.mode,
        startedAt,
        completedAt: new Date().toISOString(),
        message: result.failedFiles.length > 0 ? "ZIP import completed with some failed files." : "ZIP import completed.",
        createdNotes: result.createdNotes,
        failedFiles: result.failedFiles,
        conflicts: [],
      } satisfies BrainxDesktopManualSyncJob;
    } catch (error) {
      return {
        jobId,
        status: "FAILED",
        mode: readVaultIndex(vault).syncPolicy.mode,
        startedAt,
        completedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "ZIP import failed.",
        createdNotes: [],
        failedFiles: [{ fileName: options.fileName, reason: error instanceof Error ? error.message : "Unknown ZIP import failure" }],
        conflicts: [],
      } satisfies BrainxDesktopManualSyncJob;
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  ipcMain.handle("brainx-desktop:save-vault-export", async (_event, options: BrainxDesktopSaveVaultExportOptions) => {
    const vault = requireActiveVault();
    const targetPath = path.join(vault.exportsPath, options.fileName);
    await fsp.writeFile(targetPath, Buffer.from(options.dataBase64, "base64"));
    return { saved: true, filePath: targetPath };
  });

  ipcMain.handle("brainx-desktop:get-vault-workspace-stats", () => {
    const vault = getActiveVault();
    if (!vault) return null;
    const snapshot = readVaultSnapshot(vault);
    const storageBytes =
      snapshot.notes.reduce((total, note) => total + Buffer.byteLength(note.markdown, "utf8"), 0) +
      snapshot.assets.reduce((total, asset) => total + asset.size, 0);
    return {
      noteCount: snapshot.notes.length,
      storageBytes,
      activities: snapshot.notes
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 10)
        .map((note) => ({
          noteId: note.noteId,
          type: "NOTE_UPDATED",
          title: note.title,
          occurredAt: note.updatedAt,
        })),
    };
  });

  ipcMain.handle("brainx-desktop:get-vault-sync-policy", () => {
    const vault = getActiveVault();
    if (!vault) return null;
    return readVaultIndex(vault).syncPolicy;
  });

  ipcMain.handle("brainx-desktop:get-latest-manual-sync-job", () => {
    const vault = getActiveVault();
    if (!vault) return null;
    return readLastManualSyncJob(vault);
  });

  ipcMain.handle("brainx-desktop:get-manual-sync-conflict-report", (_event, jobId: string) => {
    const vault = getActiveVault();
    if (!vault) return null;
    return readConflictReport(vault, jobId);
  });

  ipcMain.handle(
    "brainx-desktop:set-vault-sync-policy",
    (_event, policy: { mode: BrainxDesktopVaultSyncMode; remoteWorkspaceId?: string | null }) => {
      const vault = requireActiveVault();
      const index = readVaultIndex(vault);
      index.syncPolicy = normalizeVaultSyncPolicy(index.syncPolicy, policy);
      persistVaultIndex(vault, index);
      return index.syncPolicy;
    }
  );

  ipcMain.handle("brainx-desktop:request-manual-sync", async () => {
    const vault = requireActiveVault();
    return runManualVaultSync(vault);
  });
}

if (!registerSingleInstanceHandling()) {
  // app quits inside registerSingleInstanceHandling
} else {
  registerDeepLinkEvents();

  app.whenReady().then(async () => {
    loadStorageState();
    loadVaultState();
    registerAssetProtocol();
    registerProtocolHandling();
    buildAppMenu();
    await bootstrapRendererRuntime();
    registerIpc();
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      } else if (mainWindow) {
        mainWindow.focus();
      }
    });
  });
}

app.on("before-quit", () => {
  if (bundledRendererProcess) {
    bundledRendererProcess.kill();
    bundledRendererProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
