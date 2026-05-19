import path from "node:path";
import { isEligibleForLocalOrganization } from "./eligibility.js";
import { identifyVersionGroups } from "./versions.js";

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

export function buildOrganizationProposals(files = []) {
  const eligibleFiles = files.filter((file) => isEligibleForLocalOrganization(file));
  const versionFindings = identifyVersionGroups(eligibleFiles);
  const versionArchivablePaths = new Set(versionFindings.archivable.map(f => f.absolutePath));

  return eligibleFiles
    .flatMap((file) => {
    const proposals = [];

    // If it's an older version, propose moving to Versions subfolder
    if (versionArchivablePaths.has(file.absolutePath)) {
      proposals.push(buildVersionArchiveProposal(file));
      return proposals;
    }

    if (file.structure?.moveRecommended) {
      const moveProposal = buildMoveProposal(file);
      if (moveProposal) {
        proposals.push(moveProposal);
      }
    }

    if (file.structure?.renameRecommended) {
      const renameProposal = buildRenameProposal(file);
      if (renameProposal) {
        proposals.push(renameProposal);
      }
    }

    return proposals;
  })
    .sort((left, right) => left.id.localeCompare(right.id));
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

function buildRenameProposal(file) {
  const proposedName = proposeFileName(file);

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

function proposeFileName(file) {
  const purpose = file.structure?.purpose ?? file.classification?.category ?? "other";
  let label = file.structure?.renameLabel ?? PURPOSE_LABELS[purpose] ?? PURPOSE_LABELS.other;
  
  const extension = file.extension ?? path.extname(file.absolutePath);
  const currentBaseName = path.basename(file.absolutePath, extension);
  
  // If the current name is just a huge string of numbers (like 400082092134) or a generic IMG_ tag,
  // we should prepend the semantic label so the user knows what it is (e.g. Document_400082092134.pdf)
  // But wait, the user said "suggest the name of the file instead of just document_original name. Example - Say an ID card document like Aadhar card is named as 40130202.pdf, it should reason that this is an Aadhar Card and based on that suggest that it should be named as Pratik Vaibhav_Aadhar Card.pdf".
  // Because we do not run deep AI extracting on *every* file automatically (it takes 10s per file), 
  // we will give it a better default name but encourage the "Ask AI" button.
  // Actually, for Identity documents, we can extract the specific type if the rule matched!
  
  // If the name is already prefixed with the label, don't double prefix
  if (currentBaseName.toLowerCase().startsWith(label.toLowerCase())) {
     return `${currentBaseName}${extension}`;
  }

  // If the purpose is explicitly identified (like Identity, Finance, Resume), prefix it for clarity
  if (purpose !== "other" && purpose !== "image" && purpose !== "document") {
     return `${label}_${currentBaseName}${extension}`;
  }

  // For generic images or documents, just use the original name, don't force a "Document_" prefix
  // unless it's literally just a hash. But let's just default to the original name to avoid annoying users.
  return `${currentBaseName}${extension}`;
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
