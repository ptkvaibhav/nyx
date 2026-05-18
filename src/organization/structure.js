import path from "node:path";
import { classifyFile } from "../core/classify.js";
import { inferPurposeDetails } from "./purpose-rules.js";

const GENERIC_NAME_PATTERNS = [
  /^(file|document|scan|copy|duplicate|new|untitled)[-_ ]?\d*$/i,
  /^(img|image|photo|vid|video|media|whatsapp|screenshot)[-_ ]?[a-z0-9-_() ]+$/i,
  /^\d{8,}$/, // long numeric strings
  /^[a-f0-9]{16,}$/i // long hex hashes
];

export function analyzeFileStructure(fileEntry) {
  const classification = fileEntry.classification ?? classifyFile(fileEntry);
  const purpose = inferPurpose(fileEntry, classification);
  const currentFolderSegments = path
    .dirname(fileEntry.relativePath)
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  const currentBaseName = path.basename(fileEntry.absolutePath, fileEntry.extension).trim();
  const expectedFolders = purpose.expectedFolders;
  const folderMatchesContent = expectedFolders.some((expectedFolder) => {
    return currentFolderSegments.some((currentSegment) => currentSegment.toLowerCase() === expectedFolder.toLowerCase());
  });
  const nameLooksGeneric = GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(currentBaseName));
  const fileNameMatchesContent = purpose.matchedByRule || (!nameLooksGeneric && currentBaseName.length >= 4);
  const betterDestinationExists = expectedFolders[0] !== "Unsorted" && !folderMatchesContent;

  let status = "unstructured";
  if (fileNameMatchesContent && folderMatchesContent && !betterDestinationExists) {
    status = "structured";
  } else if (fileNameMatchesContent || folderMatchesContent) {
    status = "weakly_structured";
  }

  return {
    status,
    category: classification.category,
    purpose: purpose.purpose,
    expectedFolders,
    fileNameMatchesContent,
    folderMatchesContent,
    moveRecommended: betterDestinationExists,
    renameRecommended: shouldRecommendRename({
      fileNameMatchesContent,
      nameLooksGeneric,
      purpose
    }),
    matchedByRule: purpose.matchedByRule,
    renameLabel: purpose.renameLabel,
    reasons: buildReasons({
      fileNameMatchesContent,
      folderMatchesContent,
      betterDestinationExists,
      expectedFolders
    })
  };
}

export function inferPurpose(fileEntry, classification = classifyFile(fileEntry)) {
  return inferPurposeDetails({
    absolutePath: fileEntry.absolutePath,
    baseName: fileEntry.baseName ?? path.basename(fileEntry.absolutePath),
    extension: fileEntry.extension ?? path.extname(fileEntry.absolutePath),
    category: classification.category,
    extractedText: fileEntry.extractedText ?? "",
    isEntity: fileEntry.isEntity,
    entityType: fileEntry.entityType
  });
}

function buildReasons({ fileNameMatchesContent, folderMatchesContent, betterDestinationExists, expectedFolders }) {
  const reasons = [];

  if (!fileNameMatchesContent) {
    reasons.push("Filename does not look descriptive enough for the detected content.");
  }

  if (!folderMatchesContent) {
    reasons.push(`File is not placed in its expected folder: ${expectedFolders.join(", ")}.`);
  }

  if (betterDestinationExists) {
    reasons.push("A clearer destination folder exists.");
  }

  if (reasons.length === 0) {
    reasons.push("Filename and folder placement look appropriate.");
  }

  return reasons;
}

function shouldRecommendRename({ fileNameMatchesContent, nameLooksGeneric, purpose }) {
  // Recommend rename if the name is explicitly generic, OR if it doesn't match content rules
  // and the purpose isn't just 'other' or 'image' (where renaming might not be super helpful without AI)
  if (nameLooksGeneric) return true;
  
  if (!fileNameMatchesContent && purpose.purpose !== 'image' && purpose.purpose !== 'other') {
     return true;
  }

  return false;
}
