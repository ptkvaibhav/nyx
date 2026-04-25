import path from "node:path";
import { loadConfig } from "../core/config.js";
import { ensureLocalDriveScaffold, loadLocalDriveState } from "../providers/local-drive.js";

export async function buildCloudAudit({ configPath = "nyx.config.json" } = {}) {
  const { baseDirectory, config } = await loadConfig(configPath);
  const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

  await ensureLocalDriveScaffold({
    driveRoot,
    providers: config.providers
  });

  const state = await loadLocalDriveState({
    driveRoot,
    providers: config.providers
  });
  const files = flattenProviderFiles(state.providers);
  const duplicateGroups = findCloudDuplicateGroups(files);

  return {
    driveRoot,
    updatedAt: state.updatedAt,
    totals: {
      providers: Object.keys(state.providers).length,
      files: files.length,
      duplicateGroups: duplicateGroups.length,
      duplicateFiles: duplicateGroups.reduce((total, group) => total + group.files.length, 0)
    },
    providers: Object.fromEntries(
      Object.entries(state.providers).map(([providerId, providerState]) => {
        return [
          providerId,
          {
            folderName: providerState.folderName,
            capacityBytes: providerState.capacityBytes,
            usedBytes: providerState.usedBytes,
            fileCount: providerState.files.length
          }
        ];
      })
    ),
    duplicateGroups
  };
}

function flattenProviderFiles(providers) {
  return Object.entries(providers).flatMap(([providerId, providerState]) => {
    return providerState.files.map((file) => {
      return {
        providerId,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        baseName: file.baseName,
        originalPath: file.originalPath,
        storedPath: file.storedPath,
        uploadedAt: file.uploadedAt,
        verifiedAt: file.verifiedAt
      };
    });
  });
}

function findCloudDuplicateGroups(files) {
  const groups = new Map();

  for (const file of files) {
    const existingGroup = groups.get(file.sha256) ?? [];
    existingGroup.push(file);
    groups.set(file.sha256, existingGroup);
  }

  return [...groups.entries()]
    .filter(([, groupedFiles]) => groupedFiles.length > 1)
    .map(([sha256, groupedFiles]) => {
      return {
        sha256,
        sizeBytes: groupedFiles[0].sizeBytes,
        files: groupedFiles.sort((left, right) => {
          return left.storedPath.localeCompare(right.storedPath);
        })
      };
    })
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}
