import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import { findDuplicateGroups } from "./duplicates.js";
import { scanManagedDirectories } from "./scan-managed.js";
import { analyzeFileStructure } from "./structure.js";
import { classifyFile } from "../core/classify.js";

export async function buildLocalAudit({ engagementPath = "docs/engagement.md" } = {}) {
  const engagement = await loadEngagement(engagementPath);
  const scanResult = await scanManagedDirectories({
    managedDirectories: engagement.managedDirectories,
    exclusions: engagement.defaultExclusions
  });

  const files = [];
  for (const scannedFile of scanResult.files) {
    const profile = await fingerprintFile(scannedFile.absolutePath);
    const classification = classifyFile(profile);
    const structure = analyzeFileStructure({
      ...scannedFile,
      ...profile,
      classification
    });

    files.push({
      ...scannedFile,
      ...profile,
      classification,
      structure
    });
  }

  const duplicates = findDuplicateGroups(files);
  const structuredFiles = files.filter((file) => file.structure.status === "structured");
  const weaklyStructuredFiles = files.filter((file) => file.structure.status === "weakly_structured");
  const unstructuredFiles = files.filter((file) => file.structure.status === "unstructured");

  return {
    engagementPath: engagement.engagementPath,
    managedDirectories: engagement.managedDirectories,
    exclusions: engagement.defaultExclusions,
    missingDirectories: scanResult.missingDirectories,
    totals: {
      filesScanned: files.length,
      duplicateGroups: duplicates.length,
      duplicateFiles: duplicates.reduce((total, group) => total + group.files.length, 0),
      structuredFiles: structuredFiles.length,
      weaklyStructuredFiles: weaklyStructuredFiles.length,
      unstructuredFiles: unstructuredFiles.length
    },
    rules: {
      configuredIrrelevanceRules: engagement.safeIrrelevanceRules,
      implementedReviewRules: ["exact duplicate files by content hash"],
      pendingReviewRules: engagement.safeIrrelevanceRules.filter((rule) => {
        return rule.toLowerCase() !== "exact duplicate files by content hash";
      })
    },
    duplicates,
    structuredFiles: sortStructureFindings(structuredFiles),
    weaklyStructuredFiles: sortStructureFindings(weaklyStructuredFiles),
    unstructuredFiles: sortStructureFindings(unstructuredFiles)
  };
}

function sortStructureFindings(files) {
  return files
    .map((file) => {
      return {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        rootPath: file.rootPath,
        category: file.classification.category,
        purpose: file.structure.purpose,
        status: file.structure.status,
        expectedFolders: file.structure.expectedFolders,
        moveRecommended: file.structure.moveRecommended,
        renameRecommended: file.structure.renameRecommended,
        reasons: file.structure.reasons
      };
    })
    .sort((left, right) => left.absolutePath.localeCompare(right.absolutePath));
}

