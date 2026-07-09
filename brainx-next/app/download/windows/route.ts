import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const INSTALLER_FILE_NAME = "BrainX Setup 0.1.0.exe";
const INSTALLER_VERSION = "0.1.0";
const installerPath = join(process.cwd(), "public", "downloads", INSTALLER_FILE_NAME);

// CI(desktop-installer 잡)는 brainx-electron이 바뀔 때마다 새로 빌드한 설치 파일을
// s3://$BRAINX_DESKTOP_INSTALLER_BUCKET/$BRAINX_DESKTOP_INSTALLER_KEY에 올린다. 이 두 값이
// 설정돼 있으면(운영/dev 배포 환경) 거기서 직접 스트리밍하고, 없으면(로컬 개발) public/downloads의
// 로컬 파일로 폴백한다 — 로컬에는 AWS 자격 증명이 없는 경우가 많고, 예전부터 있던 동작이라
// 개발 중 다운로드 버튼 테스트가 계속 되게 하기 위함이다. EC2 인스턴스 프로필에 이미
// s3:GetObject 권한이 있어(Terraform ec2_runtime 정책) 별도 액세스 키 없이 동작한다.
const installerBucket = process.env.BRAINX_DESKTOP_INSTALLER_BUCKET;
const installerKey = process.env.BRAINX_DESKTOP_INSTALLER_KEY ?? `desktop-installers/latest/${INSTALLER_FILE_NAME}`;
const awsRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

function forwardedIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

async function recordDesktopDownload(request: Request, clientKey: string | null, source: string | null) {
  try {
    const endpoint = new URL("/api/v1/landing/desktop-downloads", request.url);
    const response = await fetch(endpoint, {
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
    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      console.error("Failed to record desktop download", {
        status: response.status,
        statusText: response.statusText,
        body: responseBody.slice(0, 500)
      });
    }
  } catch (error) {
    console.error("Failed to record desktop download", error);
  }
}

function downloadHeaders(contentLength: number | undefined) {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${INSTALLER_FILE_NAME}"; filename*=UTF-8''${encodeURIComponent(INSTALLER_FILE_NAME)}`,
    "Cache-Control": "no-store"
  };
  if (contentLength !== undefined) {
    headers["Content-Length"] = String(contentLength);
  }
  return headers;
}

async function streamFromS3(bucket: string) {
  const client = new S3Client(awsRegion ? { region: awsRegion } : {});
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: installerKey }));
  if (!response.Body) {
    throw new Error("S3 GetObject response had no body");
  }
  return new Response(response.Body.transformToWebStream(), {
    headers: downloadHeaders(response.ContentLength)
  });
}

async function streamFromLocalDisk() {
  await access(installerPath);
  const fileStat = await stat(installerPath);
  const stream = createReadStream(installerPath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: downloadHeaders(fileStat.size)
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientKey = url.searchParams.get("clientKey");
  const source = url.searchParams.get("source");

  try {
    const response = installerBucket ? await streamFromS3(installerBucket) : await streamFromLocalDisk();
    await recordDesktopDownload(request, clientKey, source);
    return response;
  } catch (error) {
    console.error("Failed to serve desktop installer", error);
    return new Response("Installer not found", { status: 404 });
  }
}
