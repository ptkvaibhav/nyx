import path from "node:path";
import { isEligibleForLocalOrganization } from "./eligibility.js";

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
  return files
    .filter((file) => isEligibleForLocalOrganization(file))
    .flatMap((file) => {
    const proposals = [];

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
  const label = PURPOSE_LABELS[purpose] ?? PURPOSE_LABELS.other;
  const shortHash = String(file.sha256 ?? "unhashed").slice(0, 8);
  const extension = file.extension ?? path.extname(file.absolutePath);

  return `${label}_${shortHash}${extension}`;
}

function buildProposalId(action, file) {
  return `${action}:${file.sha256}:${file.relativePath}`;
}

function currentFolder(relativePath) {
  const folder = path.posix.dirname(relativePath);
  return folder === "." ? "" : folder;
}
