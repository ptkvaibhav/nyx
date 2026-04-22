import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadConfig(configPath = "nyx.config.json") {
  const resolvedPath = path.resolve(configPath);
  const raw = await readFile(resolvedPath, "utf8");
  const config = JSON.parse(raw);

  return {
    configPath: resolvedPath,
    baseDirectory: path.dirname(resolvedPath),
    config
  };
}

export function resolveWatchedRoot(baseDirectory, watchedRoot) {
  return path.resolve(baseDirectory, watchedRoot.path);
}

