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

  for (const [key, groupFiles] of groups.entries()) {
    if (groupFiles.length <= 1) continue;

    // Sort by version descending
    groupFiles.sort((a, b) => b.extractedVersion - a.extractedVersion);

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
  let versionNumber = 0;

  // Group 2: v(\d+)
  if (match[2]) {
    versionNumber = parseInt(match[2], 10);
  } 
  // Group 4: (\d+) from (1)
  else if (match[4]) {
    versionNumber = parseInt(match[4], 10);
  }
  // Group 5: Copy suffix
  else if (match[5]) {
    // Group 8: (\d+) from Copy (1)
    versionNumber = match[8] ? parseInt(match[8], 10) : 1;
  }

  const baseIdentity = fileName.replace(versionSegment, "").trim();

  return { baseIdentity, version: versionNumber };
}
