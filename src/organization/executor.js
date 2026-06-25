import { constants } from "node:fs";
import { access, appendFile, mkdir, rename, readdir, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import { hasVerifiedBackupProof } from "./protection.js";

const DEFAULT_AUDIT_LOG_PATH = ".nyx/audit-log.jsonl";

export async function applyApprovedReview({ 
  catalog,
  engagementPath = "docs/engagement.md", 
  auditLogPath = DEFAULT_AUDIT_LOG_PATH 
} = {}) {
  const { managedDirectories } = await loadEngagement(engagementPath);
  const managedRoots = managedDirectories.map((root) => path.resolve(root));
  
  const allPendingItems = catalog.getPendingReviewItems();
  const approvedItems = sortApprovedReviewItems(
    allPendingItems.filter((item) => item.approved === true && item.status === "approved")
  );
  
  const pathRedirects = new Map();
  const result = {
    dbPath: catalog.db.name,
    auditLogPath: path.resolve(auditLogPath),
    applied: [],
    skipped: [],
    errors: []
  };

  const sourceDirsToPrune = new Set();

  for (const item of approvedItems) {
    try {
      const sourcePath = path.resolve(item.subjectPath);
      sourceDirsToPrune.add(path.dirname(sourcePath));

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

  // PRUNE EMPTY DIRECTORIES
  if (sourceDirsToPrune.size > 0) {
    await pruneEmptyDirectories(Array.from(sourceDirsToPrune), managedRoots);
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

export async function rollbackAppliedReview({
  catalog,
  engagementPath = "docs/engagement.md",
  auditLogPath = DEFAULT_AUDIT_LOG_PATH
} = {}) {
  const { managedDirectories } = await loadEngagement(engagementPath);
  const managedRoots = managedDirectories.map((root) => path.resolve(root));
  
  // Get all applied items
  const rawApplied = catalog.db.prepare("SELECT * FROM review_items WHERE status = 'applied'").all().map(row => {
    return {
      ...row,
      evidence: JSON.parse(row.evidence_json)
    };
  });

  const appliedItems = sortRollbackItems(rawApplied);

  const result = {
    dbPath: catalog.db.name,
    auditLogPath: path.resolve(auditLogPath),
    rolledBack: [],
    errors: []
  };

  for (const item of appliedItems) {
    try {
      const rollbackAction = item.evidence?.rollback;
      if (!rollbackAction) {
        throw new Error(`No rollback metadata found for item ${item.id}`);
      }

      const rolledBack = await executeRollback({ rollbackAction, managedRoots });
      result.rolledBack.push({
        itemId: item.id,
        ...rolledBack
      });

      // Update status in DB - move back to pending_user_approval for safety
      catalog.db.prepare("UPDATE review_items SET status = 'pending_user_approval', approved = 0, applied_at = NULL, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), item.id);

      await appendAuditEntry({
        auditLogPath,
        entry: {
          action: "rollback",
          itemId: item.id,
          appliedAt: new Date().toISOString(),
          details: rolledBack
        }
      });
    } catch (error) {
      result.errors.push({
        itemId: item.id,
        message: error.message
      });
    }
  }

  return result;
}

function sortRollbackItems(items) {
  const actionPriority = new Map([
    ["rename_file", 0],
    ["move_file", 1],
    ["archive_local_copy", 2],
    ["review_duplicate_deletion", 3]
  ]);

  return [...items].sort((left, right) => {
    const timeCompare = String(right.applied_at || "").localeCompare(String(left.applied_at || ""));
    if (timeCompare !== 0) {
      return timeCompare;
    }
    
    const leftPriority = actionPriority.get(left.action) ?? 99;
    const rightPriority = actionPriority.get(right.action) ?? 99;
    return leftPriority - rightPriority;
  });
}

async function executeRollback({ rollbackAction, managedRoots }) {
  if (rollbackAction.action === "move_path" || rollbackAction.action === "restore_from_backup" || rollbackAction.action === "restore_archive") {
    const fromPath = path.resolve(rollbackAction.from || rollbackAction.quarantinePath);
    const toPath = path.resolve(rollbackAction.to || rollbackAction.originalPath);

    if (rollbackAction.action === "move_path") {
      assertInsideManagedRoots(fromPath, managedRoots);
    }
    assertInsideManagedRoots(toPath, managedRoots);

    if (await exists(toPath)) {
      throw new Error(`Rollback target path already exists: ${toPath}`);
    }

    await mkdir(path.dirname(toPath), { recursive: true });
    await rename(fromPath, toPath);

    const actionResultName = rollbackAction.action === "move_path" ? "rolled_back_move" :
                             rollbackAction.action === "restore_from_backup" ? "restored_from_backup" : "rolled_back_archive";

    return {
      action: actionResultName,
      from: fromPath,
      to: toPath
    };
  }

  if (rollbackAction.action === "restore_duplicates") {
    for (const entry of rollbackAction.restoredFromPaths) {
      const fromPath = path.resolve(entry.quarantinePath);
      const toPath = path.resolve(entry.originalPath);

      assertInsideManagedRoots(toPath, managedRoots);

      if (await exists(toPath)) {
        continue;
      }

      await mkdir(path.dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
    }

    return {
      action: "rolled_back_duplicates",
      details: rollbackAction.restoredFromPaths
    };
  }

  throw new Error(`Unsupported rollback action: ${rollbackAction.action}`);
}

async function applyReviewItem({ item, managedRoots, pathRedirects }) {
  if (item.action === "move_file" || item.action === "rename_file") {
    return applyPathMutation({ item, managedRoots, pathRedirects });
  }

  if (item.action === "review_duplicate_deletion") {
    return applyDuplicateDeletion({ item, managedRoots, pathRedirects });
  }

  if (item.action === "archive_local_copy") {
    return applyLocalArchive({ item, managedRoots, pathRedirects });
  }

  throw new Error(`Unsupported review action: ${item.action}`);
}

async function applyPathMutation({ item, managedRoots, pathRedirects }) {
  const originalSourcePath = path.resolve(item.subjectPath);
  const sourcePath = resolveCurrentPath(originalSourcePath, pathRedirects);
  let targetPath = resolveTargetPath({ item, sourcePath });

  assertInsideManagedRoots(sourcePath, managedRoots);
  assertInsideManagedRoots(targetPath, managedRoots);

  if (!(await exists(sourcePath))) {
    return {
      itemId: item.id,
      action: item.action,
      appliedAt: new Date().toISOString(),
      previousPath: sourcePath,
      newPath: targetPath,
      status: "source_file_missing"
    };
  }

  const stats = await stat(sourcePath);
  const isDirectory = stats.isDirectory();

  if (!isDirectory) {
    await assertFingerprint(sourcePath, item.evidence?.sha256);
  }

  // Collision Resolution
  if (await exists(targetPath)) {
    if (!isDirectory) {
      // If it's the exact same file (same hash), we can skip moving and just treat it as applied
      const targetFingerprint = await fingerprintFile(targetPath);
      if (targetFingerprint.sha256 === item.evidence?.sha256) {
        return {
          itemId: item.id,
          action: item.action,
          appliedAt: new Date().toISOString(),
          previousPath: sourcePath,
          newPath: targetPath,
          status: "already_exists_identical"
        };
      }
    }

    // Otherwise, generate a unique path by appending a short hash
    const ext = isDirectory ? "" : path.extname(targetPath);
    const base = isDirectory ? targetPath : targetPath.slice(0, -ext.length);
    const shortHash = String(item.evidence?.sha256 ?? Date.now()).slice(0, 8);
    targetPath = `${base}_${shortHash}${ext}`;
    
    // Check again just in case of extreme coincidence
    if (await exists(targetPath)) {
       targetPath = `${base}_${Date.now()}${ext}`;
    }
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

/**
 * Recursively removes empty directories, starting from provided paths 
 * and moving up until a managed root or a non-empty directory is hit.
 */
async function pruneEmptyDirectories(paths, managedRoots) {
  for (const startPath of paths) {
    let current = startPath;
    
    while (current) {
      // Don't prune the root itself
      if (managedRoots.some(root => path.relative(root, current) === "")) break;
      
      // Safety check: ensure we are inside a managed root
      try {
        assertInsideManagedRoots(current, managedRoots);
      } catch {
        break; 
      }

      try {
        const entries = await readdir(current);
        if (entries.length === 0) {
          await rmdir(current);
          current = path.dirname(current);
        } else {
          break; // Stop if not empty
        }
      } catch {
        break; // Stop on error
      }
    }
  }
}

async function applyDuplicateDeletion({ item, managedRoots, pathRedirects }) {
  const deletePaths = item.proposedDeletePaths ?? item.evidence?.proposedDeletePaths ?? [];
  const deletedPaths = [];
  const restoredFromPaths = [];

  for (const deletePath of deletePaths) {
    const resolvedPath = resolveCurrentPath(path.resolve(deletePath), pathRedirects);
    assertInsideManagedRoots(resolvedPath, managedRoots);
    await assertFingerprint(resolvedPath, item.evidence?.sha256);
    
    // Quarantine file in .nyx/quarantine instead of unlinking directly
    const quarantinePath = path.resolve(".nyx/quarantine", `${item.evidence?.sha256}_${path.basename(resolvedPath)}`);
    await mkdir(path.dirname(quarantinePath), { recursive: true });
    await rename(resolvedPath, quarantinePath);
    
    deletedPaths.push(resolvedPath);
    restoredFromPaths.push({
      quarantinePath,
      originalPath: resolvedPath
    });
  }

  return {
    itemId: item.id,
    action: item.action,
    appliedAt: new Date().toISOString(),
    keptPath: resolveCurrentPath(path.resolve(item.proposedKeepPath ?? item.evidence?.proposedKeepPath), pathRedirects),
    deletedPaths,
    rollback: {
      action: "restore_duplicates",
      restoredFromPaths
    }
  };
}

async function applyLocalArchive({ item, managedRoots, pathRedirects }) {
  const sourcePath = resolveCurrentPath(path.resolve(item.subjectPath), pathRedirects);
  const backupProof = item.backupProof ?? item.evidence?.backupProof;
  const expectedSha256 = item.evidence?.sha256;

  assertInsideManagedRoots(sourcePath, managedRoots);
  await assertFingerprint(sourcePath, expectedSha256);

  if (!(await hasVerifiedBackupProof(backupProof, expectedSha256))) {
    throw new Error(`Verified backup proof is missing for ${sourcePath}`);
  }

  await assertFingerprint(path.resolve(backupProof.storedPath), expectedSha256);
  
  // Quarantine file in .nyx/quarantine instead of unlinking directly
  const quarantinePath = path.resolve(".nyx/quarantine", `${expectedSha256}_${path.basename(sourcePath)}`);
  await mkdir(path.dirname(quarantinePath), { recursive: true });
  await rename(sourcePath, quarantinePath);

  return {
    itemId: item.id,
    action: item.action,
    appliedAt: new Date().toISOString(),
    archivedPath: sourcePath,
    backupProof,
    rollback: {
      action: "restore_archive",
      quarantinePath,
      originalPath: sourcePath
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

function sortApprovedReviewItems(items) {
  const actionPriority = new Map([
    ["move_file", 0],
    ["rename_file", 0],
    ["review_duplicate_deletion", 1],
    ["archive_local_copy", 2]
  ]);

  return [...items].sort((left, right) => {
    const leftPriority = actionPriority.get(left.action) ?? 99;
    const rightPriority = actionPriority.get(right.action) ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}
