import path from "node:path";
import { VERSION_PATTERN } from "./purpose-rules.js";

/**
 * Groups files by their version-less name and identifies older versions.
 */
export function identifyVersionGroups(files) {
  const groups = new Map();

  for (const file of files) {
    const { baseIdentity, version } = parseVersionInfo(file.baseName);
    if (version !== null) {
      const expectedFolderKey = file.structure?.expectedFolders?.[0] ?? "";
      const key = `${file.rootPath}:${expectedFolderKey}:${baseIdentity}:${file.extension.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push({ ...file, extractedVersion: version, baseIdentity });
    }
  }

  const findings = {
    latest: [],
    archivable: []
  };

  for (const groupFiles of groups.values()) {
    if (groupFiles.length <= 1) continue;

    // Sort by version descending using semantic comparison
    groupFiles.sort((a, b) => compareVersions(b.extractedVersion, a.extractedVersion));

    const [latest, ...older] = groupFiles;
    findings.latest.push(latest);
    findings.archivable.push(...older);
  }

  return findings;
}

function parseVersionInfo(fileName) {
  const match = fileName.match(VERSION_PATTERN);
  if (!match) {
    return { baseIdentity: fileName, version: null };
  }

  const versionSegment = match[0];
  let version = "0";

  // Group 2: v?(\d+(\.\d+)*)
  if (match[2]) {
    version = match[2].replaceAll("_", ".");
  } 
  // Group 4: (\d+) from (1)
  else if (match[4]) {
    version = match[4];
  }
  // Group 5: Copy suffix
  else if (match[5]) {
    // Group 8: (\d+) from Copy (1)
    version = match[8] ? match[8] : "1";
  }

  const baseIdentity = fileName.replace(versionSegment, "").trim();

  return { baseIdentity, version };
}

/**
 * Compares two version strings (e.g. "2024.4" vs "1.2.3").
 * Returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal.
 */
function compareVersions(v1, v2) {
  const parts1 = String(v1).split(".").map(Number);
  const parts2 = String(v2).split(".").map(Number);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num2 > num1) return -1;
  }
  return 0;
}
