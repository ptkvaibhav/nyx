import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function scanManagedDirectories({ managedDirectories, exclusions = [] }) {
  const normalizedExclusions = exclusions.map((entry) => normalizeSegment(entry));
  const files = [];
  const directories = [];
  const roots = [];
  const missingDirectories = [];

  for (const managedDirectory of managedDirectories) {
    const rootPath = path.resolve(managedDirectory);

    try {
      const rootFiles = [];
      const rootDirs = [];
      await walkDirectory({
        rootPath,
        currentPath: rootPath,
        exclusions: normalizedExclusions,
        files: rootFiles,
        directories: rootDirs
      });

      files.push(...rootFiles);
      directories.push(...rootDirs);
      roots.push({
        rootPath,
        fileCount: rootFiles.length
      });
    } catch (error) {
      if (isMissingPathError(error)) {
        missingDirectories.push(rootPath);
        continue;
      }

      throw error;
    }
  }

  return {
    files,
    directories,
    roots,
    missingDirectories
  };
}

async function walkDirectory({ rootPath, currentPath, exclusions, files, directories }) {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath).replaceAll("\\", "/");

    if (shouldExcludePath(relativePath, entry.name, exclusions)) {
      continue;
    }

    if (entry.isDirectory()) {
      directories.push({
        rootPath,
        absolutePath,
        relativePath
      });
      await walkDirectory({
        rootPath,
        currentPath: absolutePath,
        exclusions,
        files,
        directories
      });
      continue;
    }

    if (entry.isFile()) {
      const stats = await stat(absolutePath);
      files.push({
        rootPath,
        absolutePath,
        relativePath,
        modifiedAt: stats.mtime.toISOString(),
        sizeBytes: stats.size
      });
    }
  }
}

function shouldExcludePath(relativePath, entryName, exclusions) {
  const normalizedPath = relativePath.toLowerCase();
  const segments = normalizedPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  const normalizedEntryName = normalizeSegment(entryName);

  return exclusions.some((excluded) => {
    return excluded === normalizedEntryName || segments.includes(excluded);
  });
}

function normalizeSegment(value) {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function isMissingPathError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}
