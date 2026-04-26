import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/core/config.js";
import { syncFileWithLocalDrive } from "../src/core/sync.js";
import { ensureLocalDriveScaffold, getLocalDriveStatus } from "../src/providers/local-drive.js";

const { baseDirectory, config } = await loadConfig();
const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);
const watchedRoot = path.resolve(baseDirectory, config.watchedDirectories[0].path);
const smokeRoot = path.join(watchedRoot, ".nyx-smoke");
const smokeFilePath = path.join(smokeRoot, "smoke-document.txt");

await ensureLocalDriveScaffold({
  driveRoot,
  providers: config.providers
});

const status = await getLocalDriveStatus({
  driveRoot,
  providers: config.providers
});

assertHasProvider(status, "googleDrive");
assertHasProvider(status, "oneDrive");

await mkdir(smokeRoot, { recursive: true });
await writeFile(smokeFilePath, "smoke-document", "utf8");

const firstSync = await syncFileWithLocalDrive({ filePath: smokeFilePath });
assertAction(firstSync, ["upload", "skip"]);
assertSelectedProvider(firstSync, "googleDrive");

const secondSync = await syncFileWithLocalDrive({ filePath: smokeFilePath });
assertAction(secondSync, ["skip"]);
assertSelectedProvider(secondSync, "googleDrive");

await rm(smokeRoot, { recursive: true, force: true });

console.log("Smoke test passed.");

function assertHasProvider(currentStatus, providerId) {
  if (!currentStatus.providers?.[providerId]) {
    throw new Error(`Expected provider "${providerId}" in drive status.`);
  }
}

function assertAction(result, allowedActions) {
  if (!allowedActions.includes(result.action)) {
    throw new Error(`Unexpected action "${result.action}". Allowed actions: ${allowedActions.join(", ")}.`);
  }
}

function assertSelectedProvider(result, providerId) {
  if (result.selectedProvider !== providerId) {
    throw new Error(`Expected selected provider "${providerId}" but got "${result.selectedProvider}".`);
  }
}
