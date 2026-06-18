import path from "node:path";
import { isEligibleForLocalOrganization } from "./eligibility.js";
import { identifyVersionGroups } from "./versions.js";
import { askAI } from "../core/ai.js";

import { findDuplicateGroups } from "./duplicates.js";
import { identifyProposedKeepFile } from "./irrelevance.js";

function cleanJSON(str) {
  try {
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) return match[1].trim();
    return str.trim();
  } catch (e) {
    return str;
  }
}

const PURPOSE_LABELS = {
  resume: "Resume",
  "travel-ticket": "Travel_Ticket",
  finance: "Finance_Record",
  identity: "Identity_Document",
  education: "Education_Record",
  legal: "Legal_Record",
  installer: "Installer",
  document: "Document",
  image: "Image",
  video: "Video",
  archive: "Archive",
  code: "Code_File",
  other: "File"
};

export async function buildOrganizationProposals(files = [], skipAI = false) {
  const duplicates = findDuplicateGroups(files);
  const duplicateDeletePaths = new Set();
  for (const group of duplicates) {
    const keepFile = identifyProposedKeepFile(group.files);
    for (const f of group.files) {
      if (f.absolutePath !== keepFile.absolutePath) {
        duplicateDeletePaths.add(f.absolutePath);
      }
    }
  }

  const eligibleFiles = files.filter((file) => isEligibleForLocalOrganization(file) && !duplicateDeletePaths.has(file.absolutePath));
  const versionFindings = identifyVersionGroups(eligibleFiles);
  const versionArchivablePaths = new Set(versionFindings.archivable.map(f => f.absolutePath));

  const allProposals = [];
  for (const file of eligibleFiles) {
    const proposals = [];

    // If it's an older version, propose moving to Versions subfolder
    if (versionArchivablePaths.has(file.absolutePath)) {
      proposals.push(buildVersionArchiveProposal(file));
      allProposals.push(...proposals);
      continue;
    }

    if (file.structure?.moveRecommended) {
      const moveProposal = buildMoveProposal(file);
      if (moveProposal) {
        proposals.push(moveProposal);
      }
    }

    if (file.structure?.renameRecommended) {
      const renameProposal = await buildRenameProposal(file, skipAI);
      if (renameProposal) {
        proposals.push(renameProposal);
      }
    }

    allProposals.push(...proposals);
  }
  return allProposals.sort((left, right) => left.id.localeCompare(right.id));
}

function buildMoveProposal(file) {
  const targetFolder = file.structure.expectedFolders?.[0];
  if (!targetFolder) {
    return null;
  }
  const proposedRelativePath = path.posix.join(targetFolder, file.baseName);
  const proposedAbsolutePath = path.join(file.rootPath, ...proposedRelativePath.split("/"));

  return {
    id: buildProposalId("move", file),
    type: "organization_proposal",
    action: "move_file",
    status: "pending_user_approval",
    approvalGate: "moving files in batch",
    risk: "mutation",
    subjectPath: file.absolutePath,
    proposedPath: proposedAbsolutePath,
    evidence: {
      currentRelativePath: file.relativePath,
      proposedRelativePath,
      currentFolder: currentFolder(file.relativePath),
      proposedFolder: targetFolder,
      category: file.classification.category,
      purpose: file.structure.purpose,
      sha256: file.sha256,
      reasons: file.structure.reasons
    }
  };
}

async function buildRenameProposal(file, skipAI = false) {
  const proposedName = await proposeFileName(file, skipAI);

  if (proposedName.toLowerCase() === file.baseName.toLowerCase()) {
    return null;
  }

  return {
    id: buildProposalId("rename", file),
    type: "organization_proposal",
    action: "rename_file",
    status: "pending_user_approval",
    approvalGate: "renaming files",
    risk: "mutation",
    subjectPath: file.absolutePath,
    proposedName,
    proposedPath: path.join(path.dirname(file.absolutePath), proposedName),
    evidence: {
      currentName: file.baseName,
      proposedName,
      category: file.classification.category,
      purpose: file.structure.purpose,
      sha256: file.sha256,
      reasons: file.structure.reasons
    }
  };
}

async function proposeFileName(file, skipAI = false) {
  const purpose = file.structure?.purpose ?? file.classification?.category ?? "other";
  let label = file.structure?.renameLabel ?? PURPOSE_LABELS[purpose] ?? PURPOSE_LABELS.other;
  
  const extension = file.extension ?? path.extname(file.absolutePath);
  const currentBaseName = path.basename(file.absolutePath, extension);
  
  if (skipAI) {
    const timestamp = file.modifiedAt.split("T")[0].replaceAll("-", "");
    return `${label}_${timestamp}${extension}`;
  }

  const hasText = file.extractedText && file.extractedText.length > 50;
  
  const prompt = hasText 
    ? `I have a file named "${file.baseName}" with category "${file.classification?.category}" and purpose "${purpose}".
It is currently located at: "${file.relativePath}"
Here is a sample of its extracted text content:
---
${file.extractedText.slice(0, 1000)}
---
Analyze the text, file name, and directory path to determine exactly what this file is (e.g., Bank Statement, Aadhaar Card, Offer Letter, Receipt, etc.) and who it belongs to.
Propose a highly descriptive and structured file name. Use Spaces, Title Case, and clear descriptors (e.g., "Pratik Vaibhav - Aadhaar Card").
Do not include the extension in the proposed name. Do not just return the original name or "document_123".
Return ONLY a raw JSON string like {"proposedName": "New Name", "reasoning": "why"}. No markdown.`
    : `I have a file named "${file.baseName}" with category "${file.classification?.category}" and purpose "${purpose}".
It is currently located at: "${file.relativePath}"
Analyze the file name, extension, and parent folder path to determine exactly what this file is (e.g. Identity Document, Bill, Invoice, Personal Photo, Project Asset, etc.).
Propose a highly descriptive, structured, and meaningful file name. Use Spaces, Title Case, and clear descriptors.
Do not include the extension in the proposed name. Do not just return the original name.
Return ONLY a raw JSON string like {"proposedName": "New Name", "reasoning": "why"}. No markdown.`;

  try {
     const aiResponse = await askAI(prompt, "You are a highly intelligent file renaming assistant. Proactively propose descriptive, human-readable file names based on semantic context.");
     const parsed = JSON.parse(cleanJSON(aiResponse));
     if (parsed.proposedName && parsed.proposedName.toLowerCase() !== currentBaseName.toLowerCase() && !parsed.degraded) {
        file.structure.reasons = file.structure.reasons || [];
        file.structure.reasons.push(parsed.reasoning || "AI proposed this name based on file context.");
        
        let aiName = parsed.proposedName.replace(new RegExp(`\\${extension}$`, 'i'), '');
        return `${aiName}${extension}`;
     }
  } catch (e) {
     console.error("Failed to generate AI rename proposal during scan", e.message);
  }

  // Fallback to rules if AI is offline/degraded or doesn't return a name
  if (currentBaseName.toLowerCase().startsWith(label.toLowerCase())) {
     return `${currentBaseName}${extension}`;
  }

  const isGarbageName = /^(document|scan|img|whatsapp|signal|screenshot|untitled|\d+)[_\s\-]*\d*$/i.test(currentBaseName);
  
  let extractedName = "";
  if (file.extractedText) {
     // Try to find a human name in the text
     const nameMatch = file.extractedText.match(/(?:Name|Employee|Customer|Account|Mr\.|Mrs\.|Ms\.)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
     if (nameMatch && nameMatch[1].length > 3) {
       extractedName = nameMatch[1].trim() + "_";
     }
  }

  if (isGarbageName && extractedName) {
    return `${extractedName}${label}${extension}`.replace(/\s+/g, '_');
  }
  
  return `${extractedName}${label}_${currentBaseName}${extension}`.replace(/\s+/g, '_');
}

function buildProposalId(action, file) {
  return `${action}:${file.sha256}:${file.relativePath}`;
}

function buildVersionArchiveProposal(file) {
  const baseTargetFolder = file.structure?.expectedFolders?.[0] || "Unsorted";
  const targetFolder = path.posix.join(baseTargetFolder, "Versions");
  const proposedRelativePath = path.posix.join(targetFolder, file.baseName);
  const proposedAbsolutePath = path.join(file.rootPath, ...proposedRelativePath.split("/"));

  return {
    id: buildProposalId("version_archive", file),
    type: "organization_proposal",
    action: "move_file",
    status: "pending_user_approval",
    approvalGate: "moving files in batch",
    risk: "mutation",
    subjectPath: file.absolutePath,
    proposedPath: proposedAbsolutePath,
    evidence: {
      isOlderVersion: true,
      currentRelativePath: file.relativePath,
      proposedRelativePath,
      sha256: file.sha256,
      reasons: ["An older version of this file exists; moving to Versions archive."]
    }
  };
}

function currentFolder(relativePath) {
  const folder = path.posix.dirname(relativePath);
  return folder === "." ? "" : folder;
}
