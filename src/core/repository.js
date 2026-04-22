import { access, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";

export async function findGitRepositoryRoot(fileOrDirectoryPath) {
  const resolvedPath = path.resolve(fileOrDirectoryPath);
  const targetStat = await stat(resolvedPath);
  let currentPath = targetStat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  while (true) {
    const gitDirectory = path.join(currentPath, ".git");

    try {
      await access(gitDirectory, constants.F_OK);
      return currentPath;
    } catch {
      const parent = path.dirname(currentPath);
      if (parent === currentPath) {
        return null;
      }
      currentPath = parent;
    }
  }
}
