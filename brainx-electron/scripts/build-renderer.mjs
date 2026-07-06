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
const productionOrigin = process.env.BRAINX_DESKTOP_API_ORIGIN ?? "https://brainx.p-e.kr";

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
        NEXT_PUBLIC_API_BASE_URL: productionOrigin,
        NEXT_PUBLIC_WORKSPACE_API_BASE_URL: productionOrigin,
        NEXT_PUBLIC_INGESTION_API_BASE_URL: productionOrigin,
        API_SERVER_URL: productionOrigin,
        INTELLIGENCE_API_BASE_URL: productionOrigin,
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

async function copyIfExists(sourcePath, targetPath) {
  try {
    await fs.access(sourcePath);
  } catch {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
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

  console.log("[brainx-electron] Bundled renderer ready at .app-bundle/standalone");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
