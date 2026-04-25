import { constants } from "node:fs";
import { access, appendFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import { loadReviewManifest, writeReviewManifest } from "./review-store.js";
import { hasVerifiedBackupProof } from "./protection.js";

const DEFAULT_AUDIT_LOG_PATH = ".nyx/audit-log.jsonl";

export async function applyApprovedReview({ reviewPath, auditLogPath = DEFAULT_AUDIT_LOG_PATH } = {}) {
  const { reviewPath: resolvedReviewPath, manifest } = await loadReviewManifest(reviewPath);
  const engagement = await loadEngagement(manifest.engagementPath);
  const managedRoots = engagement.managedDirectories.map((root) => path.resolve(root));
  const approvedItems = manifest.items.filter((item) => item.approved === true && item.status === "approved");
  const result = {
    reviewPath: resolvedReviewPath,
    auditLogPath: path.resolve(auditLogPath),
    applied: [],
    skipped: [],
    errors: []
  };

  for (const item of approvedItems) {
    try {
      const appliedItem = await applyReviewItem({ item, managedRoots });
      result.applied.push(appliedItem);
      markItemApplied({
        manifest,
        itemId: item.id,
        appliedItem
      });
      await appendAuditEntry({
        auditLogPath,
        entry: {
          ...appliedItem,
          reviewPath: resolvedReviewPath
        }
      });
    } catch (error) {
      result.errors.push({
        itemId: item.id,
        message: error.message
      });
    }
  }

  await writeReviewManifest({
    reviewPath: resolvedReviewPath,
    manifest: {
      ...manifest,
      updatedAt: new Date().toISOString()
    }
  });

  const blockedItems = manifest.items.filter((item) => item.approved !== true && item.status !== "applied");
  result.skipped.push(...blockedItems.map((item) => {
    return {
      itemId: item.id,
      reason: "Review item is not approved."
    };
  }));

  return result;
}

function markItemApplied({ manifest, itemId, appliedItem }) {
  manifest.items = manifest.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    return {
      ...item,
      status: "applied",
      applied: true,
      appliedAt: appliedItem.appliedAt,
      appliedResult: appliedItem
    };
  });
}

async function applyReviewItem({ item, managedRoots }) {
  if (item.action === "move_file" || item.action === "rename_file") {
    return applyPathMutation({ item, managedRoots });
  }

  if (item.action === "review_duplicate_deletion") {
    return applyDuplicateDeletion({ item, managedRoots });
  }

  if (item.action === "archive_local_copy") {
    return applyLocalArchive({ item, managedRoots });
  }

  throw new Error(`Unsupported review action: ${item.action}`);
}

async function applyPathMutation({ item, managedRoots }) {
  const sourcePath = path.resolve(item.subjectPath);
  const targetPath = path.resolve(item.proposedPath);

  assertInsideManagedRoots(sourcePath, managedRoots);
  assertInsideManagedRoots(targetPath, managedRoots);
  await assertFingerprint(sourcePath, item.evidence?.sha256);

  if (await exists(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);

  return {
    itemId: item.id,
    action: item.action,
    appliedAt: new Date().toISOString(),
    previousPath: sourcePath,
    newPath: targetPath,
    rollback: {
      action: "move_path",
      from: targetPath,
      to: sourcePath
    }
  };
}

async function applyDuplicateDeletion({ item, managedRoots }) {
  const deletePaths = item.proposedDeletePaths ?? item.evidence?.proposedDeletePaths ?? [];
  const deletedPaths = [];

  for (const deletePath of deletePaths) {
    const resolvedPath = path.resolve(deletePath);
    assertInsideManagedRoots(resolvedPath, managedRoots);
    await assertFingerprint(resolvedPath, item.evidence?.sha256);
    await unlink(resolvedPath);
    deletedPaths.push(resolvedPath);
  }

  return {
    itemId: item.id,
    action: item.action,
    appliedAt: new Date().toISOString(),
    keptPath: item.proposedKeepPath ?? item.evidence?.proposedKeepPath,
    deletedPaths,
    rollback: {
      action: "manual_restore_required",
      reason: "Deleted duplicate files must be restored from backup, recycle bin, or source copy if needed."
    }
  };
}

async function applyLocalArchive({ item, managedRoots }) {
  const sourcePath = path.resolve(item.subjectPath);
  const backupProof = item.backupProof ?? item.evidence?.backupProof;
  const expectedSha256 = item.evidence?.sha256;

  assertInsideManagedRoots(sourcePath, managedRoots);
  await assertFingerprint(sourcePath, expectedSha256);

  if (!(await hasVerifiedBackupProof(backupProof, expectedSha256))) {
    throw new Error(`Verified backup proof is missing for ${sourcePath}`);
  }

  await assertFingerprint(path.resolve(backupProof.storedPath), expectedSha256);
  await unlink(sourcePath);

  return {
    itemId: item.id,
    action: item.action,
    appliedAt: new Date().toISOString(),
    archivedPath: sourcePath,
    backupProof,
    rollback: {
      action: "restore_from_backup",
      from: backupProof.storedPath,
      to: sourcePath
    }
  };
}

async function appendAuditEntry({ auditLogPath, entry }) {
  const resolvedPath = path.resolve(auditLogPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await appendFile(resolvedPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function assertFingerprint(filePath, expectedSha256) {
  if (!expectedSha256) {
    return;
  }

  const profile = await fingerprintFile(filePath);
  if (profile.sha256 !== expectedSha256) {
    throw new Error(`Fingerprint changed for ${filePath}`);
  }
}

function assertInsideManagedRoots(targetPath, managedRoots) {
  const insideManagedRoot = managedRoots.some((rootPath) => {
    const relativePath = path.relative(rootPath, targetPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  });

  if (!insideManagedRoot) {
    throw new Error(`Path is outside approved managed directories: ${targetPath}`);
  }
}

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
