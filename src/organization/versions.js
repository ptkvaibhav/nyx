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
      const key = `${file.rootPath}:${baseIdentity}:${file.extension.toLowerCase()}`;
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

  // Remove the version segment to get the base identity
  // e.g., "Project_v2.pdf" -> "Project"
  const versionSegment = match[0];
  const versionNumber = parseInt(match[2], 10);
  const baseIdentity = fileName.replace(versionSegment, "").trim();

  return { baseIdentity, version: versionNumber };
}
