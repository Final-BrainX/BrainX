"use client";

import {
  getLocalStoredValue,
  getSessionStoredValue,
  removeLocalStoredValue,
  removeSessionStoredValue,
  setLocalStoredValue,
  setSessionStoredValue,
} from "@/lib/client-storage";
import { clearAuthSession, readAuthSession, type ApiResponse } from "@/lib/auth-api";
import { getBrainxDesktopConfig, isElectronDesktop } from "@/lib/desktop-bridge";
import { createDesktopVaultNote, writeDesktopVaultAsset } from "@/lib/desktop-vault";

const INGESTION_API_BASE_URL = process.env.NEXT_PUBLIC_INGESTION_API_BASE_URL ?? "http://localhost:8083";

/** 노트 안에 임베드된 PDF 뷰어(PdfBlockNode)가 iframe src로 사용하는 원본 파일 URL. */
export function getAssetFileUrl(assetId: string) {
  return `${INGESTION_API_BASE_URL}/api/v1/assets/${assetId}/file`;
}

/** 노션 등에서 가져온 이미지의 서명 URL이 만료됐거나 그 호스트가 CORS로 우리 origin을 막을 때
    (노트 PDF 내보내기 등), 브라우저 대신 백엔드가 그 URL을 가져와서 전달한다. 임의 URL을
    대신 가져오는 기능이라 로그인한 사용자만 쓸 수 있다(GET /api/v1/assets/proxy-image). */
export async function fetchImageViaProxy(url: string): Promise<Blob> {
  const session = readAuthSession();
  const response = await fetch(
    `${INGESTION_API_BASE_URL}/api/v1/assets/proxy-image?url=${encodeURIComponent(url)}`,
    {
      headers: session?.accessToken
        ? { Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}` }
        : {}
    }
  );
  if (!response.ok) {
    throw new Error(`프록시로 이미지를 가져오지 못했습니다 (${response.status})`);
  }
  return response.blob();
}

const NOTION_INTEGRATION_KEY = "brainx_notion_integration_v1";
const NOTION_OAUTH_STATE_KEY = "brainx_notion_oauth_state_v1";

export const NOTION_OAUTH_MESSAGE_TYPE = "brainx-notion-oauth-result";

export type NotionIntegration = {
  integrationAccountId: string;
  connectedAt: string;
};

export type NotionPage = {
  id: string;
  title: string;
  icon?: string | null;
  lastEditedTime?: string | null;
};

type OAuthUrlData = {
  authorizationUrl: string;
  state: string;
};

type IntegrationConnectedData = {
  integrationAccountId: string;
};

type NotionPagesData = {
  pages: NotionPage[];
};

export type ImportJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;

type ImportJobAcceptedData = {
  importJobId: string;
  status: ImportJobStatus;
};

export type ImportJobData = {
  importJobId: string;
  status: ImportJobStatus;
  createdNotes: Array<{ noteId?: string; title?: string }>;
  failedFiles: Array<{ fileName?: string; reason?: string }>;
  conflicts: unknown[];
};

type LocalImportResult = {
  noteId?: string;
  title?: string;
};

function messageFromResponse<T>(response: ApiResponse<T>, fallback: string) {
  return response.message ?? response.error?.message ?? fallback;
}

async function shouldUseDesktopVaultImport() {
  if (!isElectronDesktop()) return false;
  const config = await getBrainxDesktopConfig();
  return Boolean(config?.activeVault);
}

function fileNameWithoutExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function inferFileMimeType(file: File) {
  return file.type || "application/octet-stream";
}

function toBase64FromArrayBuffer(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

function isTextLikeFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt") ||
    name.endsWith(".html") ||
    name.endsWith(".htm")
  );
}

async function importDesktopVaultFile(file: File, targetFolderId?: string): Promise<ImportJobData> {
  if (isZipFile(file)) {
    throw new Error("ZIP import into a local vault is not wired yet. Please extract it first and import the files directly.");
  }

  let createdNotes: LocalImportResult[] = [];
  if (isTextLikeFile(file)) {
    const note = await createDesktopVaultNote({
      title: fileNameWithoutExtension(file.name),
      markdown: await file.text(),
      folderId: targetFolderId ?? null,
      tags: [],
    });
    createdNotes = [{ noteId: note.noteId, title: note.title }];
  } else {
    const dataBase64 = toBase64FromArrayBuffer(await file.arrayBuffer());
    const asset = await writeDesktopVaultAsset({
      fileName: file.name,
      mimeType: inferFileMimeType(file),
      dataBase64,
    });
    const note = await createDesktopVaultNote({
      title: fileNameWithoutExtension(file.name),
      folderId: targetFolderId ?? null,
      markdown: [
        `# ${fileNameWithoutExtension(file.name)}`,
        "",
        `- Imported asset: ${asset.fileName}`,
        `- Vault path: assets/${asset.relativePath}`,
        `- MIME type: ${asset.mimeType}`,
        `- Size: ${asset.size} bytes`,
      ].join("\n"),
      tags: ["imported-asset"],
    });
    createdNotes = [{ noteId: note.noteId, title: note.title }];
  }

  return {
    importJobId: `desktop_import_${globalThis.crypto.randomUUID()}`,
    status: "COMPLETED",
    createdNotes,
    failedFiles: [],
    conflicts: [],
  };
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAuthSession();

  const response = await fetch(`${INGESTION_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.accessToken ? { Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (response.status === 401 || response.status === 403) {
    clearAuthSession();
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!payload) {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(messageFromResponse(payload, "요청 처리에 실패했습니다."));
  }
  return payload.data as T;
}

// 바이너리(multipart) 업로드 전용: Content-Type을 직접 지정하지 않아 브라우저가 boundary를 채우도록 한다.
async function authedUpload(path: string, file: File): Promise<void> {
  const session = readAuthSession();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${INGESTION_API_BASE_URL}${path}`, {
    method: "PUT",
    body: formData,
    headers: session?.accessToken ? { Authorization: `${session.tokenType ?? "Bearer"} ${session.accessToken}` } : {}
  });

  const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  if (response.status === 401 || response.status === 403) {
    clearAuthSession();
    throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!response.ok || !payload?.success) {
    throw new Error(payload ? messageFromResponse(payload, "파일 업로드에 실패했습니다.") : "파일 업로드에 실패했습니다.");
  }
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readNotionIntegration(): NotionIntegration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = getLocalStoredValue(NOTION_INTEGRATION_KEY);
    return raw ? (JSON.parse(raw) as NotionIntegration) : null;
  } catch {
    return null;
  }
}

export function saveNotionIntegration(integrationAccountId: string) {
  if (typeof window === "undefined") return;
  const integration: NotionIntegration = { integrationAccountId, connectedAt: new Date().toISOString() };
  setLocalStoredValue(NOTION_INTEGRATION_KEY, JSON.stringify(integration));
}

export function clearNotionIntegration() {
  if (typeof window === "undefined") return;
  removeLocalStoredValue(NOTION_INTEGRATION_KEY);
}

export async function startNotionOAuth() {
  const data = await authedRequest<OAuthUrlData>("/api/v1/imports/notion/oauth/authorize", {
    method: "POST",
    body: JSON.stringify({})
  });
  if (typeof window !== "undefined") {
    setSessionStoredValue(NOTION_OAUTH_STATE_KEY, data.state);
  }
  return data;
}

export function consumeNotionOAuthState() {
  if (typeof window === "undefined") return null;
  const state = getSessionStoredValue(NOTION_OAUTH_STATE_KEY);
  removeSessionStoredValue(NOTION_OAUTH_STATE_KEY);
  return state;
}

export async function completeNotionOAuth(code: string, state: string) {
  const data = await authedRequest<IntegrationConnectedData>("/api/v1/imports/notion/oauth/callback", {
    method: "POST",
    body: JSON.stringify({ code, state })
  });
  saveNotionIntegration(data.integrationAccountId);
  return data;
}

export async function listNotionPages(integrationAccountId: string) {
  const data = await authedRequest<NotionPagesData>(
    `/api/v1/imports/notion/pages?integrationAccountId=${encodeURIComponent(integrationAccountId)}`
  );
  return data.pages;
}

export async function importNotionPage(integrationAccountId: string, sourceId: string, targetFolderId?: string) {
  return authedRequest<ImportJobAcceptedData>("/api/v1/imports/notion/jobs", {
    method: "POST",
    body: JSON.stringify({ integrationAccountId, sourceId, mode: "IMPORT", targetFolderId })
  });
}

export async function getImportJobStatus(importJobId: string) {
  return authedRequest<ImportJobData>(`/api/v1/imports/${importJobId}`);
}

// ── 콘텐츠 가져오기 (ZIP/CSV/PDF/Text/Markdown/HTML/Word) ──────────────────

type AssetUploadSessionData = {
  uploadSessionId: string;
  uploadUrl: string;
  maxSizeBytes: number;
};

type AssetUploadCompleteData = {
  assetId: string;
  conversionJobId: string | null;
  status: "UPLOADED" | "CONVERTING";
};

function isZipFile(file: File) {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
}

async function createAssetUploadSession(file: File, targetFolderId?: string) {
  return authedRequest<AssetUploadSessionData>("/api/v1/assets/upload-sessions", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      targetNoteId: targetFolderId ?? null
    })
  });
}

async function completeAssetUpload(uploadSessionId: string, checksum: string) {
  return authedRequest<AssetUploadCompleteData>(`/api/v1/assets/upload-sessions/${uploadSessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ checksum, conversionMode: "MARKDOWN" })
  });
}

async function importZipJob(uploadedZipAssetId: string, targetFolderId?: string) {
  return authedRequest<ImportJobAcceptedData>("/api/v1/imports/obsidian/jobs", {
    method: "POST",
    body: JSON.stringify({ uploadedZipAssetId, targetFolderId })
  });
}

async function importFileJob(uploadedAssetId: string, targetFolderId?: string) {
  return authedRequest<ImportJobAcceptedData>("/api/v1/imports/file/jobs", {
    method: "POST",
    body: JSON.stringify({ uploadedAssetId, targetFolderId })
  });
}

/** 파일(ZIP 포함)을 업로드하고 가져오기 작업을 생성한 뒤 완료될 때까지 폴링한다. */
export async function uploadAndImportFile(file: File, targetFolderId?: string) {
  if (await shouldUseDesktopVaultImport()) {
    return importDesktopVaultFile(file, targetFolderId);
  }
  const session = await createAssetUploadSession(file, targetFolderId);
  await authedUpload(`/api/v1/assets/upload-sessions/${session.uploadSessionId}/binary`, file);
  const checksum = await sha256Hex(file);
  const completed = await completeAssetUpload(session.uploadSessionId, checksum);

  const accepted = isZipFile(file)
    ? await importZipJob(completed.assetId, targetFolderId)
    : await importFileJob(completed.assetId, targetFolderId);

  let status = accepted.status;
  let job: ImportJobData | null = null;
  for (let attempt = 0; attempt < 30 && status !== "COMPLETED" && status !== "FAILED"; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    job = await getImportJobStatus(accepted.importJobId);
    status = job.status;
  }
  if (!job) {
    job = await getImportJobStatus(accepted.importJobId);
  }
  return job;
}

// ── 노트 내보내기 (PDF/TXT/MD) ──────────────────────────────────────────

export type ExportFormat = "PDF" | "TXT" | "MD";

type ExportJobData = {
  exportJobId: string;
  status: ImportJobStatus;
  downloadUrl: string | null;
  error: string | null;
};

async function requestExportJob(noteId: string, format: ExportFormat) {
  return authedRequest<ExportJobData>("/api/v1/exports", {
    method: "POST",
    body: JSON.stringify({ noteId, format })
  });
}

async function getExportJobStatus(exportJobId: string) {
  return authedRequest<ExportJobData>(`/api/v1/exports/${exportJobId}`);
}

/** 내보내기 작업을 요청하고 완료(또는 실패)될 때까지 폴링한다. */
export async function exportNote(noteId: string, format: ExportFormat) {
  if (await shouldUseDesktopVaultImport()) {
    return {
      exportJobId: `desktop_export_${globalThis.crypto.randomUUID()}`,
      status: "COMPLETED" as const,
      downloadUrl: null,
      error: null,
    };
  }
  const accepted = await requestExportJob(noteId, format);
  let status = accepted.status;
  let job: ExportJobData = accepted;
  for (let attempt = 0; attempt < 30 && status !== "COMPLETED" && status !== "FAILED"; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
    job = await getExportJobStatus(accepted.exportJobId);
    status = job.status;
  }
  return job;
}
