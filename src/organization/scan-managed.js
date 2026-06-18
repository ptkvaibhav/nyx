import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { detectCohesiveEntity } from "../core/entity-detector.js";

export async function scanManagedDirectories({ managedDirectories, exclusions = [], onDiscovery }) {
  const normalizedExclusions = exclusions.map((entry) => normalizeSegment(entry));
  const files = [];
  const directories = [];
  const roots = [];
  const missingDirectories = [];

  let discoveryCount = 0;

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
        directories: rootDirs,
        onDiscovery: (p) => {
           discoveryCount++;
           if (onDiscovery) onDiscovery(discoveryCount, p);
        }
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

async function walkDirectory({ rootPath, currentPath, exclusions, files, directories, onDiscovery }) {
  if (onDiscovery) onDiscovery(currentPath);
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath).replaceAll("\\", "/");

    if (shouldExcludePath(relativePath, entry.name, exclusions)) {
      continue;
    }

    if (entry.isDirectory()) {
      // COHESIVE ENTITY CHECK:
      // If this is an app or project folder, we stop descending and treat the folder itself as the entity.
      const entityResult = await detectCohesiveEntity(absolutePath);
      if (entityResult.isEntity) {
        files.push({
          rootPath,
          absolutePath,
          relativePath,
          modifiedAt: new Date().toISOString(), // Use folder stats or now
          sizeBytes: 0, // Folders don't have a simple size
          isEntity: true,
          entityType: entityResult.type
        });
        continue;
      }

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
        directories,
        onDiscovery
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
        sizeBytes: stats.size,
        isEntity: false
      });
    }
  }
}

function shouldExcludePath(relativePath, entryName, exclusions) {
  const normalizedPath = relativePath.toLowerCase();
  const segments = normalizedPath.split("/").map((segment) => segment.trim()).filter(Boolean);
  const normalizedEntryName = normalizeSegment(entryName);

  return exclusions.some((excluded) => {
    const isMatch = (val) => {
      if (val === excluded) return true;
      if (val.startsWith(excluded + "-")) return true;
      if (val.startsWith(excluded + "_")) return true;
      if (val.startsWith(excluded + ".")) return true;
      if (val.startsWith(excluded + " ")) return true;
      return false;
    };

    return isMatch(normalizedEntryName) || segments.some(isMatch);
  });
}

function normalizeSegment(value) {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function isMissingPathError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}
