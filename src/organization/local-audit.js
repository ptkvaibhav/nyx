import { Catalog } from "../core/catalog.js";
import { fingerprintFile } from "../core/fingerprint.js";
import { loadEngagement } from "../engagement/parser.js";
import path from "node:path";
import { findDuplicateGroups } from "./duplicates.js";
import { findIrrelevanceFindings } from "./irrelevance.js";
import { buildOrganizationProposals } from "./proposals.js";
import { buildReviewQueue } from "./review-queue.js";
import { scanManagedDirectories } from "./scan-managed.js";
import { analyzeFileStructure } from "./structure.js";
import { classifyFile } from "../core/classify.js";
import { extractContent } from "../core/content-extractor.js";

export async function buildLocalAudit({ 
  engagementPath = "docs/engagement.md",
  targetDirectory,
  dbPath = ".nyx/nyx.db",
  onProgress,
  onDiscovery,
  isCancelled,
  skippedFiles = []
} = {}) {
  // If targetDirectory is provided, we use that. Otherwise fallback to engagement.md parsing.
  let managedDirectories = targetDirectory ? [targetDirectory] : [];
  let exclusions = [".git", "node_modules", "Temp", "packages", "Drive", ".nyx"];
  let engagement = null;
  
  try {
    engagement = await loadEngagement(engagementPath);
    if (!targetDirectory) {
      managedDirectories = engagement.managedDirectories;
    }
    exclusions = engagement.defaultExclusions;
  } catch (e) {
    console.warn("Could not load engagement.md, using default exclusions.", e.message);
    engagement = {
       safeIrrelevanceRules: ["exact duplicate files by content hash"]
    };
  }

  const scanResult = await scanManagedDirectories({
    managedDirectories,
    exclusions,
    onDiscovery
  });

  const catalog = await Catalog.open(dbPath);
  const files = [];
  const scannedPaths = [];

  let current = 0;
  const total = scanResult.files.length;

  for (const scannedFile of scanResult.files) {
    if (isCancelled && isCancelled()) {
      throw new Error("Scan cancelled by user");
    }
    current++;
    if (onProgress) onProgress(current, total, scannedFile.absolutePath);
    
    scannedPaths.push(scannedFile.absolutePath);
    
    // Check if we already have this file and if it has changed
    const existing = catalog.getFileByPath(scannedFile.absolutePath);
    if (existing && existing.modifiedAt === scannedFile.modifiedAt && existing.sizeBytes === scannedFile.sizeBytes) {
      files.push(existing);
      continue;
    }

    let profile;
    if (scannedFile.isEntity) {
      // For folders (entities), we don't read bytes. 
      // We use a deterministic hash based on path and type.
      profile = {
        absolutePath: scannedFile.absolutePath,
        baseName: path.basename(scannedFile.absolutePath),
        extension: "",
        sizeBytes: 0,
        modifiedAt: scannedFile.modifiedAt,
        sha256: `entity:${scannedFile.entityType}:${scannedFile.absolutePath}`,
        extractedText: ""
      };
    } else {
      profile = await fingerprintFile(scannedFile.absolutePath);
      
      // Extract content for deep intelligence (PDFs, txt, etc.)
      if (skippedFiles.includes(scannedFile.absolutePath)) {
        profile.extractedText = "";
      } else {
        profile.extractedText = await extractContent(scannedFile.absolutePath);
      }
    }

    const passwordRequired = profile.extractedText === "[[PASSWORD_REQUIRED]]";
    
    if (passwordRequired) {
      // SAVE PROGRESS: Upsert the files we have processed so far so we don't scan them again
      catalog.upsertFiles(files.filter(f => !f.lastScannedAt));
      return {
        needsPassword: true,
        passwordFile: scannedFile.absolutePath
      };
    }

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
      structure,
      passwordRequired
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
  
  const organizationProposals = await buildOrganizationProposals(files);
  const irrelevanceFindings = findIrrelevanceFindings({
    duplicates,
    files,
    directories: scanResult.directories,
    configuredRules: engagement?.safeIrrelevanceRules || []
  });
  
  const reviewQueue = buildReviewQueue({
    organizationProposals,
    irrelevanceFindings
  });

  // Persist review items to database
  catalog.upsertReviewItems(reviewQueue.items);

  return {
    engagementPath: engagement?.engagementPath || "dynamic",
    managedDirectories,
    exclusions,
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
