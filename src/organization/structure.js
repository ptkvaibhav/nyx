import path from "node:path";
import { classifyFile } from "../core/classify.js";
import { inferPurposeDetails } from "./purpose-rules.js";

const GENERIC_NAME_PATTERNS = [
  /^(file|document|doc|docx|pdf|scan|copy|duplicate|new|untitled|temp|tmp|test|download)[-_ ]?[a-z0-9]*$/i,
  /^(img|image|photo|pic|capture|vid|video|media|whatsapp|screenshot)[-_ ]?[a-z0-9-_() ]*$/i,
  /^\d{4,8,}$/, // long numeric strings (like date or scan numbers)
  /^[a-f0-9]{8,}$/i // hex hashes
];

export function analyzeFileStructure(fileEntry) {
  const classification = fileEntry.classification ?? classifyFile(fileEntry);
  
  let expectedFolder = fileEntry.expectedFolder || fileEntry.structure?.expectedFolder;
  let proposedName = fileEntry.proposedName || fileEntry.structure?.proposedName;
  let purpose = fileEntry.purpose || fileEntry.structure?.purpose;
  let aiReasoning = fileEntry.aiReasoning || fileEntry.structure?.aiReasoning;
  let matchedByRule = fileEntry.matchedByRule || fileEntry.structure?.matchedByRule;

  if (!expectedFolder) {
    const purposeDetails = inferPurpose(fileEntry, classification);
    purpose = purposeDetails.purpose;
    expectedFolder = purposeDetails.expectedFolders?.[0] || "Unsorted";
    matchedByRule = purposeDetails.matchedByRule;
    
    const extension = fileEntry.extension || path.extname(fileEntry.absolutePath);
    const label = purposeDetails.renameLabel || "File";
    const timestamp = fileEntry.modifiedAt ? fileEntry.modifiedAt.split("T")[0].replaceAll("-", "") : "20260101";
    proposedName = `${label}_${timestamp}`;
  }

  const currentFolder = path
    .dirname(fileEntry.relativePath)
    .replaceAll("\\", "/")
    .toLowerCase();
  
  const extension = fileEntry.extension || path.extname(fileEntry.absolutePath);
  const currentBaseName = path.basename(fileEntry.absolutePath, extension).trim();
  
  const expectedFolderNorm = expectedFolder.toLowerCase();
  const expectedSegs = expectedFolderNorm.split("/").filter(Boolean);
  const currentSegs = currentFolder.split("/").filter(Boolean);
  
  const folderMatchesContent = expectedSegs.every(eSeg => 
    currentSegs.some(cSeg => {
      const cleanC = cSeg.replace(/[-_\s]/g, "");
      const cleanE = eSeg.replace(/[-_\s]/g, "");
      return cleanC === cleanE || cleanC.includes(cleanE) || cleanE.includes(cleanC);
    })
  );

  const betterDestinationExists = expectedFolderNorm !== "unsorted" && !folderMatchesContent;
  
  const cleanProposed = proposedName.replace(new RegExp(`\\${extension}$`, 'i'), '').trim();
  
  let fileNameMatchesContent = currentBaseName.toLowerCase() === cleanProposed.toLowerCase();
  const nameLooksGeneric = GENERIC_NAME_PATTERNS.some((pattern) => pattern.test(currentBaseName));
  
  // If AI is offline/bypassed, use rule-based matching
  if (!aiReasoning) {
    fileNameMatchesContent = matchedByRule || (!nameLooksGeneric && currentBaseName.length >= 4);
  }
  
  const moveRecommended = betterDestinationExists;
  const renameRecommended = nameLooksGeneric || !fileNameMatchesContent;

  let status = "unstructured";
  if (fileNameMatchesContent && folderMatchesContent && !betterDestinationExists) {
    status = "structured";
  } else if (fileNameMatchesContent || folderMatchesContent) {
    status = "weakly_structured";
  }

  const reasons = [];
  if (moveRecommended) {
    reasons.push(`File should be moved to expected folder: ${expectedFolder}`);
  }
  if (renameRecommended) {
    reasons.push(`File should be renamed to: ${cleanProposed}`);
  }
  if (reasons.length === 0) {
    reasons.push("Filename and folder placement look appropriate.");
  }
  if (aiReasoning) {
    reasons.push(`AI Analysis: ${aiReasoning}`);
  }

  return {
    status,
    category: classification.category,
    purpose: purpose,
    expectedFolders: [expectedFolder],
    fileNameMatchesContent,
    folderMatchesContent,
    moveRecommended,
    renameRecommended,
    matchedByRule: true,
    renameLabel: purpose,
    reasons
  };
}

export function inferPurpose(fileEntry, classification = classifyFile(fileEntry)) {
  return inferPurposeDetails({
    absolutePath: fileEntry.absolutePath,
    relativePath: fileEntry.relativePath,
    baseName: fileEntry.baseName ?? path.basename(fileEntry.absolutePath),
    extension: fileEntry.extension ?? path.extname(fileEntry.absolutePath),
    category: classification.category,
    extractedText: fileEntry.extractedText ?? "",
    isEntity: fileEntry.isEntity,
    entityType: fileEntry.entityType
  });
}
