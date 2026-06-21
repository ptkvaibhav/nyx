import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { loadEngagement } from "../engagement/parser.js";
import { ensureLocalDriveScaffold, loadLocalDriveState } from "../providers/local-drive.js";
import { buildLocalAudit } from "./local-audit.js";
import { buildReviewQueue } from "./review-queue.js";

const IMPORTANT_PURPOSE_KEYWORDS = {
  resume: ["resume", "cv"],
  "travel-ticket": ["travel", "ticket", "itinerary"],
  finance: ["financial", "finance", "invoice", "tax"],
  identity: ["identity"],
  education: ["education", "certificate", "transcript"],
  legal: ["contract", "legal"],
  image: ["photo"],
  video: ["video"],
  document: ["document", "project"]
};

const LOWER_PRIORITY_FOLDERS = new Set(["archives", "unsorted", "downloads"]);
const LOWER_PRIORITY_CATEGORIES = new Set(["archive", "other"]);

export async function buildProtectionPlan({
  engagementPath = "docs/engagement.md",
  configPath = "nyx.config.json",
  dbPath = ".nyx/nyx.db",
  requiredRemoteCopies = 1
} = {}) {
  const [engagement, audit, configContext] = await Promise.all([
    loadEngagement(engagementPath),
    buildLocalAudit({ engagementPath, dbPath }),
    loadConfig(configPath)
  ]);
  const driveRoot = path.resolve(configContext.baseDirectory, configContext.config.mockDrive.rootFolder);

  await ensureLocalDriveScaffold({
    driveRoot,
    providers: configContext.config.providers
  });

  const driveState = await loadLocalDriveState({
    driveRoot,
    providers: configContext.config.providers
  });
  const remoteProofsBySha = buildRemoteProofIndex(driveState.providers);
  const importantFiles = [];
  const lowerPriorityFiles = [];
  const archiveProposals = [];

  for (const file of audit.files) {
    const backupProofs = remoteProofsBySha.get(file.sha256) ?? [];
    const protectionStatus = backupProofs.length >= requiredRemoteCopies ? "protected" : "needs_backup";
    const protectedFile = {
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      rootPath: file.rootPath,
      baseName: file.baseName,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      category: file.classification.category,
      purpose: file.structure.purpose,
      expectedFolders: file.structure.expectedFolders,
      backupProofs,
      protectionStatus
    };

    if (isImportantFile(file, engagement)) {
      importantFiles.push(protectedFile);
      continue;
    }

    if (isLowerPriorityFile(file)) {
      lowerPriorityFiles.push(protectedFile);
      if (backupProofs.length > 0) {
        archiveProposals.push(buildArchiveProposal({ file, backupProof: backupProofs[0] }));
      }
    }
  }

  const reviewQueue = buildReviewQueue({
    protectionArchiveProposals: archiveProposals
  });

  return {
    engagementPath: audit.engagementPath,
    configPath: configContext.configPath,
    managedDirectories: audit.managedDirectories,
    driveRoot,
    totals: {
      localFiles: audit.files.length,
      importantFiles: importantFiles.length,
      protectedImportantFiles: importantFiles.filter((file) => file.protectionStatus === "protected").length,
      importantFilesMissingBackup: importantFiles.filter((file) => file.protectionStatus !== "protected").length,
      lowerPriorityFiles: lowerPriorityFiles.length,
      archiveCandidates: archiveProposals.length
    },
    importantFiles: importantFiles.sort(sortByPath),
    lowerPriorityFiles: lowerPriorityFiles.sort(sortByPath),
    archiveProposals,
    reviewQueue
  };
}

function buildRemoteProofIndex(providers) {
  const index = new Map();

  for (const [providerId, providerState] of Object.entries(providers)) {
    for (const file of providerState.files) {
      const proofs = index.get(file.sha256) ?? [];
      proofs.push({
        provider: providerId,
        storedPath: file.storedPath,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        verifiedAt: file.verifiedAt ?? file.uploadedAt
      });
      index.set(file.sha256, proofs);
    }
  }

  return index;
}

function isImportantFile(file, engagement) {
  const folderHints = new Set([
    ...file.classification.folderSegments,
    ...file.structure.expectedFolders,
    firstPathSegment(file.relativePath)
  ].filter(Boolean).map(normalize));
  const importantFolders = engagement.importantFolders.map(normalize);

  if (importantFolders.some((folder) => folderHints.has(folder))) {
    return true;
  }

  const purpose = file.structure.purpose ?? file.classification.category;
  const keywords = IMPORTANT_PURPOSE_KEYWORDS[purpose] ?? [purpose];
  const importantText = engagement.importantCategories.join(" ").toLowerCase();

  return keywords.some((keyword) => importantText.includes(keyword));
}

function isLowerPriorityFile(file) {
  const category = file.classification.category;
  const folder = normalize(firstPathSegment(file.relativePath));

  return LOWER_PRIORITY_CATEGORIES.has(category) || LOWER_PRIORITY_FOLDERS.has(folder);
}

function buildArchiveProposal({ file, backupProof }) {
  return {
    id: `archive:${file.sha256}:${file.relativePath}`,
    type: "protection_archive_proposal",
    action: "archive_local_copy",
    status: "pending_user_approval",
    approvalGate: "deleting a local copy after confirmed cloud backup",
    risk: "destructive",
    subjectPath: file.absolutePath,
    backupProof,
    evidence: {
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      currentRelativePath: file.relativePath,
      category: file.classification.category,
      purpose: file.structure.purpose,
      backupProof
    }
  };
}

function firstPathSegment(relativePath) {
  return relativePath.split(/[\\/]/)[0];
}

function normalize(value) {
  return String(value).replace(/`/g, "").toLowerCase();
}

function sortByPath(left, right) {
  return left.absolutePath.localeCompare(right.absolutePath);
}

export async function hasVerifiedBackupProof(backupProof, expectedSha256) {
  if (!backupProof?.storedPath || backupProof.sha256 !== expectedSha256 || !backupProof.verifiedAt) {
    return false;
  }

  try {
    await access(path.resolve(backupProof.storedPath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
