import { app } from "electron";
import path from "node:path";

const electronProcess = process as NodeJS.Process & {
  resourcesPath?: string;
};

const DEFAULT_DEV_URL = "http://127.0.0.1:3000";
const DEFAULT_PROD_URL = "https://brainx.p-e.kr/";
const DEFAULT_TITLE = "BrainX";
const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 960;
const DEFAULT_SERVER_PORT = 3232;
const DEFAULT_PROTOCOL = "brainx";

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  return parsed.toString();
}

function readBundledPort() {
  return readPositiveNumber(process.env.BRAINX_ELECTRON_RENDERER_PORT, DEFAULT_SERVER_PORT);
}

export function getProtocolScheme() {
  return process.env.BRAINX_ELECTRON_PROTOCOL?.trim() || DEFAULT_PROTOCOL;
}

export function getBundledRendererUrl(port = readBundledPort()) {
  return normalizeUrl(`http://127.0.0.1:${port}`);
}

export function getRemoteRendererUrl() {
  const raw = process.env.BRAINX_ELECTRON_PROD_URL ?? DEFAULT_PROD_URL;
  return normalizeUrl(raw);
}

export function getDevRendererUrl() {
  const raw = process.env.BRAINX_ELECTRON_DEV_URL ?? DEFAULT_DEV_URL;
  return normalizeUrl(raw);
}

export function getRendererEntryUrl(options?: { bundledPort?: number; bundledAvailable?: boolean }) {
  if (!app.isPackaged) {
    return getDevRendererUrl();
  }

  if (options?.bundledAvailable) {
    return getBundledRendererUrl(options.bundledPort);
  }

  return getRemoteRendererUrl();
}

export function getAppOrigin(options?: { bundledPort?: number; bundledAvailable?: boolean }) {
  return new URL(getRendererEntryUrl(options)).origin;
}

export function getRendererMode(options?: { bundledAvailable?: boolean }) {
  if (!app.isPackaged) return "dev-server" as const;
  return options?.bundledAvailable ? ("bundled-standalone" as const) : ("remote-web" as const);
}

export function getWindowTitle() {
  return process.env.BRAINX_ELECTRON_TITLE?.trim() || DEFAULT_TITLE;
}

export function getWindowSize() {
  return {
    width: readPositiveNumber(process.env.BRAINX_ELECTRON_WIDTH, DEFAULT_WIDTH),
    height: readPositiveNumber(process.env.BRAINX_ELECTRON_HEIGHT, DEFAULT_HEIGHT),
  };
}

export function getBundledRendererPort() {
  return readBundledPort();
}

export function getBundledRendererCandidates() {
  const relativePath = path.join(".app-bundle", "standalone", "server.js");
  return [
    ...(electronProcess.resourcesPath
      ? [
          path.join(electronProcess.resourcesPath, "app.asar.unpacked", relativePath),
          path.join(electronProcess.resourcesPath, relativePath),
        ]
      : []),
    path.join(app.getAppPath(), relativePath),
  ];
}
