import { readdir } from "node:fs/promises";
import path from "node:path";
import { isIncluded } from "./path-rules.js";

export async function scanWatchedDirectory(rootPath, watchedRoot) {
  const results = [];
  await walkDirectory(rootPath, rootPath, watchedRoot, results);
  return results;
}

async function walkDirectory(rootPath, currentPath, watchedRoot, results) {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath);

    if (entry.isDirectory()) {
      if (!watchedRoot.recursive && currentPath !== rootPath) {
        continue;
      }

      const directoryProbe = normalizeDirectoryRulePath(relativePath);
      if (directoryProbe && !mightContainIncludedFiles(directoryProbe, watchedRoot)) {
        continue;
      }

      await walkDirectory(rootPath, absolutePath, watchedRoot, results);
      continue;
    }

    if (entry.isFile() && isIncluded(relativePath, watchedRoot.include, watchedRoot.exclude)) {
      results.push({
        absolutePath,
        relativePath: relativePath.replaceAll("\\", "/")
      });
    }
  }
}

function normalizeDirectoryRulePath(relativePath) {
  if (!relativePath) {
    return "";
  }

  return `${relativePath.replaceAll("\\", "/")}/`;
}

function mightContainIncludedFiles(directoryProbe, watchedRoot) {
  if (isIncluded(directoryProbe, watchedRoot.include, watchedRoot.exclude)) {
    return true;
  }

  return !watchedRoot.exclude?.some((rule) => directoryProbe.includes(stripRuleWildcards(rule)));
}

function stripRuleWildcards(rule) {
  return rule.replaceAll("*", "").replaceAll("\\", "/");
}

