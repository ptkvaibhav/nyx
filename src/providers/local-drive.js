import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const STATE_FILE = ".nyx-drive-state.json";

export async function ensureLocalDriveScaffold({ driveRoot, providers }) {
  const state = await loadLocalDriveState({ driveRoot, providers });

  await mkdir(driveRoot, { recursive: true });

  for (const [providerId, providerConfig] of Object.entries(providers)) {
    if (!providerConfig.enabled || providerId === "github") {
      continue;
    }

    await mkdir(path.join(driveRoot, providerConfig.folderName), { recursive: true });
  }

  await saveLocalDriveState({ driveRoot, state });
  return state;
}

export async function loadLocalDriveState({ driveRoot, providers }) {
  await mkdir(driveRoot, { recursive: true });

  const statePath = path.join(driveRoot, STATE_FILE);
  if (!(await exists(statePath))) {
    return createDefaultState(providers);
  }

  const raw = await readFile(statePath, "utf8");
  const persisted = JSON.parse(raw);
  return mergeWithProviderDefaults(persisted, providers);
}

async function saveLocalDriveState({ driveRoot, state }) {
  const statePath = path.join(driveRoot, STATE_FILE);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function buildProviderSnapshotsFromLocalDrive({ driveRoot, providers }) {
  const state = await loadLocalDriveState({ driveRoot, providers });

  return Object.entries(providers)
    .filter(([providerId, providerConfig]) => providerConfig.enabled && providerId !== "github")
    .map(([providerId]) => {
      const providerState = state.providers[providerId];

      return {
        id: providerId,
        availableBytes: Math.max(providerState.capacityBytes - providerState.usedBytes, 0),
        knownFingerprints: new Set(providerState.files.map((file) => file.sha256))
      };
    });
}

export async function uploadFileToLocalDrive({
  driveRoot,
  providers,
  selectedProviderId,
  fileProfile,
  sourcePath,
  destinationFolder
}) {
  const state = await loadLocalDriveState({ driveRoot, providers });
  const providerConfig = providers[selectedProviderId];
  const providerState = state.providers[selectedProviderId];

  const existingFile = providerState.files.find((file) => file.sha256 === fileProfile.sha256);
  if (existingFile) {
    return {
      action: "skip",
      reason: "Matching file fingerprint already exists in the local Drive scaffold.",
      selectedProvider: selectedProviderId,
      storedPath: existingFile.storedPath,
      backupProof: buildBackupProof({
        selectedProviderId,
        storedPath: existingFile.storedPath,
        fileProfile
      })
    };
  }

  const targetDirectory = path.join(driveRoot, providerConfig.folderName, destinationFolder);
  await mkdir(targetDirectory, { recursive: true });

  const targetFileName = await resolveTargetFileName({
    targetDirectory,
    baseName: fileProfile.baseName,
    sha256: fileProfile.sha256
  });
  const targetPath = path.join(targetDirectory, targetFileName);

  await copyFile(sourcePath, targetPath);

  providerState.usedBytes += fileProfile.sizeBytes;
  providerState.files.push({
    sha256: fileProfile.sha256,
    sha1: fileProfile.sha1,
    md5: fileProfile.md5,
    sizeBytes: fileProfile.sizeBytes,
    baseName: fileProfile.baseName,
    originalPath: sourcePath,
    storedPath: targetPath,
    uploadedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString()
  });

  state.updatedAt = new Date().toISOString();
  await saveLocalDriveState({ driveRoot, state });

  return {
    action: "upload",
    selectedProvider: selectedProviderId,
    storedPath: targetPath,
    backupProof: buildBackupProof({
      selectedProviderId,
      storedPath: targetPath,
      fileProfile
    })
  };
}

export async function getLocalDriveStatus({ driveRoot, providers }) {
  const state = await loadLocalDriveState({ driveRoot, providers });

  return {
    driveRoot,
    updatedAt: state.updatedAt,
    providers: Object.fromEntries(
      Object.entries(state.providers).map(([providerId, providerState]) => {
        return [
          providerId,
          {
            capacityBytes: providerState.capacityBytes,
            usedBytes: providerState.usedBytes,
            availableBytes: Math.max(providerState.capacityBytes - providerState.usedBytes, 0),
            fileCount: providerState.files.length
          }
        ];
      })
    )
  };
}

export async function findBackupProofInLocalDrive({ driveRoot, providers, providerId, fileProfile }) {
  const state = await loadLocalDriveState({ driveRoot, providers });
  const providerState = state.providers[providerId];
  const existingFile = providerState?.files.find((file) => file.sha256 === fileProfile.sha256);

  if (!existingFile) {
    return null;
  }

  return buildBackupProof({
    selectedProviderId: providerId,
    storedPath: existingFile.storedPath,
    fileProfile,
    verifiedAt: existingFile.verifiedAt ?? existingFile.uploadedAt
  });
}

function createDefaultState(providers) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    providers: Object.fromEntries(
      Object.entries(providers)
        .filter(([providerId, providerConfig]) => providerConfig.enabled && providerId !== "github")
        .map(([providerId, providerConfig]) => {
          return [
            providerId,
            {
              providerId,
              folderName: providerConfig.folderName,
              capacityBytes: providerConfig.capacityBytes,
              usedBytes: 0,
              files: []
            }
          ];
        })
    )
  };
}

function mergeWithProviderDefaults(persistedState, providers) {
  const defaultState = createDefaultState(providers);
  const mergedProviders = Object.fromEntries(
    Object.entries(defaultState.providers).map(([providerId, providerState]) => {
      const persistedProvider = persistedState.providers?.[providerId] ?? {};

      return [
        providerId,
        {
          ...providerState,
          ...persistedProvider,
          capacityBytes: providerState.capacityBytes,
          folderName: providerState.folderName,
          files: persistedProvider.files ?? providerState.files
        }
      ];
    })
  );

  return {
    ...defaultState,
    ...persistedState,
    providers: mergedProviders
  };
}

async function resolveTargetFileName({ targetDirectory, baseName, sha256 }) {
  const initialCandidate = path.join(targetDirectory, baseName);
  if (!(await exists(initialCandidate))) {
    return baseName;
  }

  const parsed = path.parse(baseName);
  return `${parsed.name}-${sha256.slice(0, 8)}${parsed.ext}`;
}

function buildBackupProof({ selectedProviderId, storedPath, fileProfile, verifiedAt = new Date().toISOString() }) {
  return {
    provider: selectedProviderId,
    storedPath,
    sha256: fileProfile.sha256,
    sizeBytes: fileProfile.sizeBytes,
    verifiedAt
  };
}

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
