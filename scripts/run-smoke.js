import path from "node:path";
import { loadConfig } from "../src/core/config.js";
import { syncFileWithLocalDrive } from "../src/core/sync.js";
import { ensureLocalDriveScaffold, getLocalDriveStatus } from "../src/providers/local-drive.js";

const { baseDirectory, config } = await loadConfig();
const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

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

const firstSync = await syncFileWithLocalDrive({ filePath: "README.md" });
assertAction(firstSync, ["upload", "skip"]);
assertSelectedProvider(firstSync, "googleDrive");

const secondSync = await syncFileWithLocalDrive({ filePath: "README.md" });
assertAction(secondSync, ["skip"]);
assertSelectedProvider(secondSync, "googleDrive");

const codeSync = await syncFileWithLocalDrive({ filePath: "src/cli.js" });
assertAction(codeSync, ["skip"]);
if (!String(codeSync.reason).includes("existing Git repository")) {
  throw new Error("Expected repository-protected code files to be skipped.");
}

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
