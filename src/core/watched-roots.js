import path from "node:path";
import { resolveWatchedRoot } from "./config.js";
import { isIncluded } from "./path-rules.js";

export function findWatchedRootMatch({ filePath, baseDirectory, watchedDirectories }) {
  const resolvedFilePath = path.resolve(filePath);

  for (const watchedRoot of watchedDirectories) {
    const rootPath = resolveWatchedRoot(baseDirectory, watchedRoot);
    const relativePath = path.relative(rootPath, resolvedFilePath);

    if (!isDescendantPath(relativePath)) {
      continue;
    }

    if (!isIncluded(relativePath, watchedRoot.include, watchedRoot.exclude)) {
      continue;
    }

    return {
      watchedRoot,
      rootPath,
      relativePath: relativePath.replaceAll("\\", "/")
    };
  }

  return null;
}

function isDescendantPath(relativePath) {
  if (!relativePath) {
    return false;
  }

  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
