import path from "node:path";
import { classifyFile } from "../core/classify.js";

const PURPOSE_RULES = [
  { purpose: "resume", expectedFolders: ["Resumes"], pattern: /(^|[\s._-])(resume|cv|cover-letter)([\s._-]|$)/i },
  { purpose: "travel-ticket", expectedFolders: ["Tickets"], pattern: /(^|[\s._-])(ticket|flight|train|boarding|itinerary)([\s._-]|$)/i },
  { purpose: "finance", expectedFolders: ["Finance"], pattern: /(^|[\s._-])(invoice|receipt|tax|payslip)([\s._-]|$)/i },
  { purpose: "identity", expectedFolders: ["Identity"], pattern: /(^|[\s._-])(passport|aadhar|aadhaar|pan|license)([\s._-]|$)/i },
  { purpose: "education", expectedFolders: ["Education"], pattern: /(^|[\s._-])(transcript|certificate|marksheet|diploma|degree)([\s._-]|$)/i },
  { purpose: "legal", expectedFolders: ["Legal"], pattern: /(^|[\s._-])(contract|agreement|nda|lease)([\s._-]|$)/i },
  { purpose: "installer", expectedFolders: ["Installers"], pattern: /(^|[\s._-])(setup|installer|install)([\s._-]|$)/i }
];

const GENERIC_NAME_PATTERNS = [
  /^file[-_ ]?\d*$/i,
  /^document[-_ ]?\d*$/i,
  /^scan[-_ ]?\d*$/i,
  /^copy[-_ ]?\d*$/i,
  /^duplicate[-_ ]?[a-z0-9]*$/i,
  /^new[-_ ]?\d*$/i,
  /^untitled[-_ ]?\d*$/i,
  /^img[-_ ]?\d+$/i,
  /^image[-_ ]?\d+$/i,
  /^photo[-_ ]?\d+$/i
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
    renameRecommended: !fileNameMatchesContent,
    reasons: buildReasons({
      fileNameMatchesContent,
      folderMatchesContent,
      betterDestinationExists,
      expectedFolders
    })
  };
}

export function inferPurpose(fileEntry, classification = classifyFile(fileEntry)) {
  const baseName = (fileEntry.baseName ?? path.basename(fileEntry.absolutePath)).toLowerCase();
  const extension = (fileEntry.extension ?? path.extname(fileEntry.absolutePath)).toLowerCase();

  for (const rule of PURPOSE_RULES) {
    if (rule.pattern.test(baseName)) {
      return {
        purpose: rule.purpose,
        expectedFolders: rule.expectedFolders,
        matchedByRule: true
      };
    }
  }

  if ([".exe", ".msi", ".dmg", ".pkg"].includes(extension)) {
    return {
      purpose: "installer",
      expectedFolders: ["Installers"],
      matchedByRule: true
    };
  }

  return {
    purpose: classification.category,
    expectedFolders: classification.folderSegments,
    matchedByRule: false
  };
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
