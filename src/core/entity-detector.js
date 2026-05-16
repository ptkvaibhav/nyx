import fs from "node:fs/promises";
import path from "node:path";

const ENTITY_MARKERS = [
  ".git",
  "node_modules",
  "package.json",
  "Cargo.toml",
  "requirements.txt",
  ".vbox",
  "AppxManifest.xml",
  "Contents/Info.plist", // macOS apps
  "bin/Release",
  "Release"
];

const APPLICATION_NAME_PATTERNS = [
  /kali-linux/i,
  /juice-shop/i,
  /flutter_windows/i,
  /apache-maven/i,
  /DS4Windows/i,
  /DVWA/i,
  /VMware/i,
  /Ollama/i,
  /^\.thumbnails$/i,
  /^\.cache$/i,
  /^Android$/i
];

/**
 * Checks if a directory should be treated as a single cohesive entity 
 * (like an app or project) rather than a collection of individual files.
 */
export async function detectCohesiveEntity(absoluteDirPath) {
  try {
    const entries = await fs.readdir(absoluteDirPath);
    const entrySet = new Set(entries);

    // Check for file markers
    for (const marker of ENTITY_MARKERS) {
      if (entrySet.has(marker)) {
        return {
          isEntity: true,
          type: "software_project",
          marker
        };
      }
    }

    // Check for application name patterns in the folder itself
    const dirName = path.basename(absoluteDirPath);
    for (const pattern of APPLICATION_NAME_PATTERNS) {
      if (pattern.test(dirName)) {
        return {
          isEntity: true,
          type: "application",
          pattern: pattern.toString()
        };
      }
    }

    return { isEntity: false };
  } catch {
    return { isEntity: false };
  }
}
