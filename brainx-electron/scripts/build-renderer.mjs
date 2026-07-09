import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(electronRoot, "..");
const nextRoot = path.join(repoRoot, "brainx-next");
const bundleRoot = path.join(electronRoot, ".app-bundle");
const standaloneSource = path.join(nextRoot, ".next", "standalone");
const staticSource = path.join(nextRoot, ".next", "static");
const publicSource = path.join(nextRoot, "public");
const standaloneTarget = path.join(bundleRoot, "standalone");
const productionApiOrigin = process.env.BRAINX_DESKTOP_API_ORIGIN ?? "https://brainx.p-e.kr";
const productionWebOrigin =
  process.env.BRAINX_ELECTRON_WEB_ORIGIN ??
  process.env.BRAINX_ELECTRON_PROD_URL ??
  productionApiOrigin;

async function removeBundleRoot() {
  await fs.rm(bundleRoot, { recursive: true, force: true });
}

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: nextRoot,
      env: {
        ...process.env,
        BRAINX_NEXT_OUTPUT_MODE: "standalone",
        NEXT_PUBLIC_WEB_BASE_URL: productionWebOrigin,
        NEXT_PUBLIC_API_BASE_URL: productionApiOrigin,
        NEXT_PUBLIC_WORKSPACE_API_BASE_URL: productionApiOrigin,
        NEXT_PUBLIC_INGESTION_API_BASE_URL: productionApiOrigin,
        API_SERVER_URL: productionApiOrigin,
        INTELLIGENCE_API_BASE_URL: productionApiOrigin,
      },
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`brainx-next standalone build failed with code ${code ?? "unknown"}.`));
    });
  });
}

async function copyIfExists(sourcePath, targetPath, options = {}) {
  try {
    await fs.access(sourcePath);
  } catch {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true, ...options });
}

// brainx-next/public/downloads는 웹용 "Windows 다운로드" 버튼(/download/windows)이 서빙하는
// 설치 파일 자체를 담는 폴더다. 데스크톱 앱은 이미 설치된 상태로 실행되므로 그 라우트를 쓸 일이
// 없는데, 예전에는 이 폴더까지 매 빌드마다 앱 번들 안에 같이 들어갔다 — 그 결과 새로 만든
// 설치 파일 안에 "직전 설치 파일"이 통째로 들어있게 되어 빌드할 때마다 최종 exe 용량이 계속
// 불어나는 원인이었다(수백 MB까지 커져 GitHub 100MB 파일 제한에 걸림). 원인은 public/ 복사
// 하나가 아니었다 — `next build`(standalone 모드) 자체가 이미 `.next/standalone/public/`에
// public/ 전체(따라서 downloads/도 포함)를 자동으로 복사해 넣고, 그 standalone 출력을 통째로
// 복사하는 단계(위 copyIfExists(standaloneSource, ...))가 downloads/를 다시 들여왔다. 이후
// publicSource를 filter로 걸러 복사해도 fs.cp는 대상 폴더에 이미 있는 파일을 지우지 않고
// 병합만 하므로 소용이 없었다. 그래서 어느 복사 단계에서 들어왔든 상관없이, 모든 복사가 끝난
// 뒤 최종 산출물에서 이 폴더를 명시적으로 지운다.
async function removeBundledDownloads(standaloneTargetPath) {
  await fs.rm(path.join(standaloneTargetPath, "public", "downloads"), { recursive: true, force: true });
}

async function ensureStandaloneOutput() {
  try {
    await fs.access(path.join(standaloneSource, "server.js"));
  } catch {
    throw new Error("Next standalone output is missing server.js.");
  }
}

async function main() {
  console.log("[brainx-electron] Building bundled renderer...");
  await runNextBuild();
  await ensureStandaloneOutput();
  await removeBundleRoot();

  await copyIfExists(standaloneSource, standaloneTarget);
  await copyIfExists(staticSource, path.join(standaloneTarget, ".next", "static"));
  await copyIfExists(publicSource, path.join(standaloneTarget, "public"));
  await removeBundledDownloads(standaloneTarget);

  console.log("[brainx-electron] Bundled renderer ready at .app-bundle/standalone");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
