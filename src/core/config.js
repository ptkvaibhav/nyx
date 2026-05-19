import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export async function loadConfig(configPath = "nyx.config.json") {
  const resolvedPath = path.isAbsolute(configPath) ? configPath : path.resolve(PROJECT_ROOT, configPath);
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
  const resolvedPath = path.isAbsolute(configPath) ? configPath : path.resolve(PROJECT_ROOT, configPath);
  await writeFile(resolvedPath, JSON.stringify(config, null, 2), "utf8");
}

export function resolveWatchedRoot(baseDirectory, watchedRoot) {
  return path.resolve(baseDirectory, watchedRoot.path);
}

