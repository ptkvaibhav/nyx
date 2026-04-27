import { constants } from "node:fs";
import { access, appendFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import { loadReviewManifest, writeReviewManifest } from "./review-store.js";
import { hasVerifiedBackupProof } from "./protection.js";

const DEFAULT_AUDIT_LOG_PATH = ".nyx/audit-log.jsonl";

export async function applyApprovedReview({ 
  catalog,
  engagementPath = "docs/engagement.md", 
  auditLogPath = DEFAULT_AUDIT_LOG_PATH 
} = {}) {
  const engagement = await loadEngagement(engagementPath);
  const managedRoots = engagement.managedDirectories.map((root) => path.resolve(root));
  
  const allPendingItems = catalog.getPendingReviewItems();
  const approvedItems = allPendingItems.filter((item) => item.approved === true && item.status === "approved");
  
  const pathRedirects = new Map();
  const result = {
    dbPath: catalog.db.name,
    auditLogPath: path.resolve(auditLogPath),
    applied: [],
    skipped: [],
    errors: []
  };

  for (const item of approvedItems) {
    try {
      const appliedItem = await applyReviewItem({ item, managedRoots, pathRedirects });
      result.applied.push(appliedItem);
      
      catalog.markReviewItemApplied(item.id, appliedItem);

      await appendAuditEntry({
        auditLogPath,
        entry: {
          ...appliedItem,
          dbPath: catalog.db.name
        }
      });
    } catch (error) {
      result.errors.push({
        itemId: item.id,
        message: error.message
      });
    }
  }

  const remainingItems = catalog.getPendingReviewItems();
  const blockedItems = remainingItems.filter((item) => item.approved !== true && item.status !== "applied");
  result.skipped.push(...blockedItems.map((item) => {
    return {
      itemId: item.id,
      reason: "Review item is not approved."
    };
  }));

  return result;
}

async function applyReviewItem({ item, managedRoots, pathRedirects }) {
  if (item.action === "move_file" || item.action === "rename_file") {
    return applyPathMutation({ item, managedRoots, pathRedirects });
  }

  if (item.action === "review_duplicate_deletion") {
    return applyDuplicateDeletion({ item, managedRoots });
  }

  if (item.action === "archive_local_copy") {
    return applyLocalArchive({ item, managedRoots });
  }

  throw new Error(`Unsupported review action: ${item.action}`);
}

async function applyPathMutation({ item, managedRoots, pathRedirects }) {
  const originalSourcePath = path.resolve(item.subjectPath);
  const sourcePath = resolveCurrentPath(originalSourcePath, pathRedirects);
  const targetPath = resolveTargetPath({ item, sourcePath });

  assertInsideManagedRoots(sourcePath, managedRoots);
  assertInsideManagedRoots(targetPath, managedRoots);
  await assertFingerprint(sourcePath, item.evidence?.sha256);

  if (await exists(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await rename(sourcePath, targetPath);
  pathRedirects.set(originalSourcePath, targetPath);

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

function resolveCurrentPath(sourcePath, pathRedirects) {
  return pathRedirects.get(sourcePath) ?? sourcePath;
}

function resolveTargetPath({ item, sourcePath }) {
  if (item.action === "rename_file") {
    return path.resolve(path.dirname(sourcePath), item.proposedName);
  }

  return path.resolve(item.proposedPath);
}
