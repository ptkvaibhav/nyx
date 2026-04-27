import { Catalog } from "../core/catalog.js";
import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import { findDuplicateGroups } from "./duplicates.js";
import { findIrrelevanceFindings } from "./irrelevance.js";
import { buildOrganizationProposals } from "./proposals.js";
import { buildReviewQueue } from "./review-queue.js";
import { scanManagedDirectories } from "./scan-managed.js";
import { analyzeFileStructure } from "./structure.js";
import { classifyFile } from "../core/classify.js";

export async function buildLocalAudit({ 
  engagementPath = "docs/engagement.md",
  dbPath = ".nyx/nyx.db" 
} = {}) {
  const engagement = await loadEngagement(engagementPath);
  const scanResult = await scanManagedDirectories({
    managedDirectories: engagement.managedDirectories,
    exclusions: engagement.defaultExclusions
  });

  const catalog = await Catalog.open(dbPath);
  const files = [];
  const scannedPaths = [];

  for (const scannedFile of scanResult.files) {
    scannedPaths.push(scannedFile.absolutePath);
    
    // Check if we already have this file and if it has changed
    const existing = catalog.getFileByPath(scannedFile.absolutePath);
    if (existing && existing.modifiedAt === scannedFile.modifiedAt && existing.sizeBytes === scannedFile.sizeBytes) {
      files.push(existing);
      continue;
    }

    const profile = await fingerprintFile(scannedFile.absolutePath);
    const classification = classifyFile(profile);
    const structure = analyzeFileStructure({
      ...scannedFile,
      ...profile,
      classification
    });

    const fileRecord = {
      ...scannedFile,
      ...profile,
      classification,
      structure
    };

    files.push(fileRecord);
  }

  // Persist files to database
  catalog.upsertFiles(files.filter(f => !f.lastScannedAt)); // Only upsert the new/changed ones
  catalog.clearStaleFiles(scannedPaths);

  const duplicates = findDuplicateGroups(files);
  const structuredFiles = files.filter((file) => file.structure.status === "structured");
  const weaklyStructuredFiles = files.filter((file) => file.structure.status === "weakly_structured");
  const unstructuredFiles = files.filter((file) => file.structure.status === "unstructured");
  
  const organizationProposals = buildOrganizationProposals(files);
  const irrelevanceFindings = findIrrelevanceFindings({
    duplicates,
    configuredRules: engagement.safeIrrelevanceRules
  });
  
  const reviewQueue = buildReviewQueue({
    organizationProposals,
    irrelevanceFindings
  });

  // Persist review items to database
  catalog.upsertReviewItems(reviewQueue.items);

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
      unstructuredFiles: unstructuredFiles.length,
      reviewItems: reviewQueue.totals.pendingItems
    },
    duplicates,
    files,
    organizationProposals,
    irrelevanceFindings,
    reviewQueue,
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
