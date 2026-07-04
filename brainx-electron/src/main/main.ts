import {
  app,
  type BaseWindow,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
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
  BrainxDesktopCreateVaultOptions,
  BrainxDesktopCreateVaultFolderOptions,
  BrainxDesktopCreateVaultNoteOptions,
  BrainxDesktopDeleteVaultFolderOptions,
  BrainxDesktopDeleteVaultNoteOptions,
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

const electronProcess = process as NodeJS.Process & {
  defaultApp?: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "..", "preload", "index.js");

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

function toVaultSummary(vaultPath: string, name = path.basename(vaultPath)): BrainxDesktopVaultSummary {
  return {
    id: crypto.createHash("sha1").update(vaultPath).digest("hex"),
    name,
    vaultPath,
    notesPath: path.join(vaultPath, "notes"),
    assetsPath: path.join(vaultPath, "assets"),
    exportsPath: path.join(vaultPath, "exports"),
    lastOpenedAt: new Date().toISOString(),
  };
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

function buildNoteFileName(noteId: string, title: string) {
  return `${sanitizeSlug(title, noteId)}-${noteId}.md`;
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
  fs.mkdirSync(vault.notesPath, { recursive: true });
  fs.mkdirSync(vault.assetsPath, { recursive: true });
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
          notesDir: "notes",
          assetsDir: "assets",
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
}

function upsertVault(vault: BrainxDesktopVaultSummary) {
  ensureVaultStructure(vault);
  const existingIndex = vaultState.recentVaults.findIndex((item) => item.id === vault.id);
  if (existingIndex >= 0) {
    vaultState.recentVaults.splice(existingIndex, 1);
  }
  vaultState.recentVaults.unshift(vault);
  vaultState.recentVaults = vaultState.recentVaults.slice(0, 12);
  vaultState.activeVaultId = vault.id;
  persistVaultState();
  return vault;
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
    vaultState.recentVaults = Array.isArray(parsed.recentVaults) ? parsed.recentVaults : [];
  } catch {
    vaultState.activeVaultId = null;
    vaultState.recentVaults = [];
  }
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
  const notePath = path.join(vault.notesPath, fileName);
  try {
    return fs.readFileSync(notePath, "utf8");
  } catch {
    return "";
  }
}

function writeVaultNoteMarkdown(vault: BrainxDesktopVaultSummary, fileName: string, markdown: string) {
  const notePath = path.join(vault.notesPath, fileName);
  fs.writeFileSync(notePath, markdown, "utf8");
}

function deleteVaultNoteFile(vault: BrainxDesktopVaultSummary, fileName: string) {
  const notePath = path.join(vault.notesPath, fileName);
  if (fs.existsSync(notePath)) {
    fs.rmSync(notePath, { force: true });
  }
}

function readVaultSnapshot(vault: BrainxDesktopVaultSummary): BrainxDesktopVaultSnapshot {
  const index = readVaultIndex(vault);
  return {
    vault,
    syncPolicy: index.syncPolicy,
    folders: index.folders,
    assets: index.assets,
    notes: index.notes.map((note) => ({
      ...note,
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

function createChildWindow(url: string, opener?: BrowserWindow | null, options?: BrainxDesktopPopupOptions) {
  const child = new BrowserWindow({
    parent: opener ?? mainWindow ?? undefined,
    modal: false,
    width: options?.width ?? 1200,
    height: options?.height ?? 860,
    minWidth: options?.minWidth ?? 960,
    minHeight: options?.minHeight ?? 640,
    autoHideMenuBar: true,
    show: false,
    title: options?.name ?? getWindowTitle(),
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
    const route = parsed.pathname.startsWith("/") ? parsed.pathname : `/${parsed.pathname}`;
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
    fileName: buildNoteFileName(noteId, title),
  };
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
    show: false,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  attachNavigationPolicy(window);
  hardenContents(window.webContents);

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

  ipcMain.handle("brainx-desktop:choose-vault-directory", async (event) => {
    const owner = resolveDialogOwner(event.sender);
    const result = await showOpenDialogForOwner(owner, {
      title: "Open BrainX Vault",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const selectedPath = result.filePaths[0];
    const vault = toVaultSummary(selectedPath);
    return upsertVault(vault);
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
    return vault ? readVaultSnapshot(vault) : null;
  });

  ipcMain.handle("brainx-desktop:create-vault-folder", (_event, options: BrainxDesktopCreateVaultFolderOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const folder = createVaultFolderRecord(index, options);
    index.folders.unshift(folder);
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

    if (typeof options.name === "string" && options.name.trim()) {
      folder.name = ensureUniqueFolderName(index.folders, options.name, options.parentFolderId ?? folder.parentFolderId, folder.folderId);
    }
    if (options.parentFolderId !== undefined) {
      folder.parentFolderId = options.parentFolderId;
    }
    if (options.color !== undefined) {
      folder.color = options.color;
    }
    if (options.favorite !== undefined) {
      folder.favorite = options.favorite;
    }
    folder.updatedAt = new Date().toISOString();
    persistVaultIndex(vault, index);
    return folder;
  });

  ipcMain.handle("brainx-desktop:delete-vault-folder", (_event, options: BrainxDesktopDeleteVaultFolderOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const deletedFolderIds = collectDescendantFolderIds(index.folders, options.folderId);
    const notesToDelete = index.notes.filter((note) => note.folderId && deletedFolderIds.has(note.folderId));
    notesToDelete.forEach((note) => deleteVaultNoteFile(vault, note.fileName));
    index.notes = index.notes.filter((note) => !(note.folderId && deletedFolderIds.has(note.folderId)));
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
    const nextTitle = ensureUniqueNoteTitle(index.notes, options.title.trim() || note.title, options.folderId ?? note.folderId, note.noteId);
    const nextFileName = buildNoteFileName(note.noteId, nextTitle);
    const currentMarkdown = readVaultNoteMarkdown(vault, note.fileName);
    if (nextFileName !== note.fileName) {
      writeVaultNoteMarkdown(vault, nextFileName, currentMarkdown);
      deleteVaultNoteFile(vault, note.fileName);
      note.fileName = nextFileName;
    }
    note.title = nextTitle;
    note.folderId = options.folderId ?? null;
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

  ipcMain.handle("brainx-desktop:delete-vault-note", (_event, options: BrainxDesktopDeleteVaultNoteOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const note = index.notes.find((item) => item.noteId === options.noteId);
    if (!note) {
      return { noteId: options.noteId, deletedAt: new Date().toISOString(), purgeAt: null };
    }
    deleteVaultNoteFile(vault, note.fileName);
    index.notes = index.notes.filter((item) => item.noteId !== options.noteId);
    persistVaultIndex(vault, index);
    return { noteId: options.noteId, deletedAt: new Date().toISOString(), purgeAt: null };
  });

  ipcMain.handle("brainx-desktop:write-vault-asset", (_event, options: BrainxDesktopWriteVaultAssetOptions) => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const now = new Date().toISOString();
    const extension = path.extname(options.fileName) || ".bin";
    const assetId = `vault_asset_${crypto.randomUUID()}`;
    const relativePath = `${sanitizeSlug(path.basename(options.fileName, extension), assetId)}-${assetId}${extension}`;
    const assetPath = path.join(vault.assetsPath, relativePath);
    const buffer = Buffer.from(options.dataBase64, "base64");
    fs.writeFileSync(assetPath, buffer);
    const asset: BrainxDesktopVaultAsset = {
      assetId,
      fileName: options.fileName,
      mimeType: options.mimeType,
      relativePath,
      size: buffer.byteLength,
      createdAt: now,
      updatedAt: now,
    };
    index.assets.unshift(asset);
    persistVaultIndex(vault, index);
    return asset;
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

  ipcMain.handle("brainx-desktop:request-manual-sync", (): BrainxDesktopManualSyncJob => {
    const vault = requireActiveVault();
    const index = readVaultIndex(vault);
    const startedAt = new Date().toISOString();
    if (index.syncPolicy.mode !== "manual-cloud") {
      return {
        jobId: `vault_sync_${crypto.randomUUID()}`,
        status: "SKIPPED",
        mode: index.syncPolicy.mode,
        startedAt,
        message: "Vault sync mode is local-only. Switch to manual-cloud to enqueue sync jobs.",
      };
    }

    return {
      jobId: `vault_sync_${crypto.randomUUID()}`,
      status: "QUEUED",
      mode: index.syncPolicy.mode,
      startedAt,
      message: "Manual sync job scaffold created. Remote sync worker is the next implementation step.",
    };
  });
}

if (!registerSingleInstanceHandling()) {
  // app quits inside registerSingleInstanceHandling
} else {
  registerDeepLinkEvents();

  app.whenReady().then(async () => {
    loadStorageState();
    loadVaultState();
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
