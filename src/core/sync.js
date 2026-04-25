import path from "node:path";
import { loadConfig } from "./config.js";
import { fingerprintFile } from "./fingerprint.js";
import { buildBackupPlan } from "./planner.js";
import { findWatchedRootMatch } from "./watched-roots.js";
import {
  buildProviderSnapshotsFromLocalDrive,
  ensureLocalDriveScaffold,
  findBackupProofInLocalDrive,
  uploadFileToLocalDrive
} from "../providers/local-drive.js";

export async function syncFileWithLocalDrive({ filePath, configPath = "nyx.config.json" }) {
  const configContext = await loadConfig(configPath);
  return syncFileWithConfig({
    filePath,
    configContext
  });
}

export async function syncFileWithConfig({ filePath, configContext }) {
  const resolvedFilePath = path.resolve(filePath);
  const { baseDirectory, config } = configContext;

  const watchedMatch = findWatchedRootMatch({
    filePath: resolvedFilePath,
    baseDirectory,
    watchedDirectories: config.watchedDirectories
  });

  if (!watchedMatch) {
    return {
      action: "skip",
      reason: "File is outside watched directories or excluded by policy.",
      filePath: resolvedFilePath
    };
  }

  const fileProfile = await fingerprintFile(resolvedFilePath);
  const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

  await ensureLocalDriveScaffold({
    driveRoot,
    providers: config.providers
  });

  const providerSnapshots = await buildProviderSnapshotsFromLocalDrive({
    driveRoot,
    providers: config.providers
  });

  const plan = await buildBackupPlan({
    fileProfile,
    providerSnapshots,
    routingPreferences: config.routing.categoryPreferences
  });

  if (plan.action !== "upload") {
    const backupProof = plan.selectedProvider
      ? await findBackupProofInLocalDrive({
        driveRoot,
        providers: config.providers,
        providerId: plan.selectedProvider,
        fileProfile
      })
      : null;

    return {
      ...plan,
      backupProof,
      watchedRoot: watchedMatch.rootPath,
      relativePath: watchedMatch.relativePath
    };
  }

  const uploadResult = await uploadFileToLocalDrive({
    driveRoot,
    providers: config.providers,
    selectedProviderId: plan.selectedProvider,
    fileProfile,
    sourcePath: resolvedFilePath,
    destinationFolder: plan.destinationPath
  });

  return {
    ...plan,
    ...uploadResult,
    driveRoot,
    watchedRoot: watchedMatch.rootPath,
    relativePath: watchedMatch.relativePath
  };
}
