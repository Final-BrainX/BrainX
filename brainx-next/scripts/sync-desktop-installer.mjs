import { mkdir, access, copyFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(rootDir, "..");
const installerFileName = "BrainX Setup 0.1.0.exe";
const sourcePath = join(projectDir, "..", "brainx-electron", "release", installerFileName);
const targetDir = join(projectDir, "public", "downloads");
const targetPath = join(targetDir, installerFileName);

async function main() {
  try {
    await access(sourcePath);
  } catch {
    console.warn(`[brainx-next] desktop installer not found at ${sourcePath}; skipping sync`);
    return;
  }

  await mkdir(targetDir, { recursive: true });
  const sourceStat = await stat(sourcePath);
  try {
    const targetStat = await stat(targetPath);
    if (targetStat.size === sourceStat.size) {
      console.log(`[brainx-next] desktop installer already synced at ${targetPath}`);
      return;
    }
  } catch {
    // target does not exist yet
  }
  await copyFile(sourcePath, targetPath);
  console.log(`[brainx-next] synced desktop installer to ${targetPath}`);
}

main().catch((error) => {
  console.error("[brainx-next] failed to sync desktop installer", error);
  process.exitCode = 1;
});
