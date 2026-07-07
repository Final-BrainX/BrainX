import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const INSTALLER_FILE_NAME = "BrainX Setup 0.1.0.exe";
const INSTALLER_VERSION = "0.1.0";
const installerPath = join(process.cwd(), "public", "downloads", INSTALLER_FILE_NAME);

function forwardedIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

async function recordDesktopDownload(request: Request, clientKey: string | null, source: string | null) {
  try {
    const endpoint = new URL("/api/v1/landing/desktop-downloads", request.url);
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": forwardedIp(request) ?? "",
        "User-Agent": request.headers.get("user-agent") ?? ""
      },
      body: JSON.stringify({
        platform: "WINDOWS",
        installerVersion: INSTALLER_VERSION,
        source: source ?? "landing",
        clientKey
      }),
      cache: "no-store"
    });
  } catch (error) {
    console.error("Failed to record desktop download", error);
  }
}

export async function GET(request: Request) {
  try {
    await access(installerPath);
  } catch {
    return new Response("Installer not found", { status: 404 });
  }

  const url = new URL(request.url);
  const clientKey = url.searchParams.get("clientKey");
  const source = url.searchParams.get("source");

  await recordDesktopDownload(request, clientKey, source);

  const fileStat = await stat(installerPath);
  const stream = createReadStream(installerPath);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename="${INSTALLER_FILE_NAME}"; filename*=UTF-8''${encodeURIComponent(INSTALLER_FILE_NAME)}`,
      "Cache-Control": "no-store"
    }
  });
}
