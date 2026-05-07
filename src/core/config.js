import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadConfig(configPath = "nyx.config.json") {
  const resolvedPath = path.resolve(configPath);
  let config = { ai: { model: "gemma" }, pdfPasswords: [], watchedDirectories: [] };
  
  try {
    const raw = await readFile(resolvedPath, "utf8");
    config = JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return {
    configPath: resolvedPath,
    baseDirectory: path.dirname(resolvedPath),
    config
  };
}

export async function saveConfig(config, configPath = "nyx.config.json") {
  const resolvedPath = path.resolve(configPath);
  await writeFile(resolvedPath, JSON.stringify(config, null, 2), "utf8");
}

export function resolveWatchedRoot(baseDirectory, watchedRoot) {
  return path.resolve(baseDirectory, watchedRoot.path);
}

