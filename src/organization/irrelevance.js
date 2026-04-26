import { isEligibleDuplicateGroup } from "./eligibility.js";

export function findIrrelevanceFindings({ duplicates = [], configuredRules = [] } = {}) {
  const normalizedRules = configuredRules.map((rule) => rule.toLowerCase());
  const findings = [];

  if (normalizedRules.includes("exact duplicate files by content hash")) {
    findings.push(...duplicates.filter(isEligibleDuplicateGroup).map(buildDuplicateFinding));
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

function buildDuplicateFinding(group) {
  const [proposedKeepFile, ...proposedDeleteFiles] = group.files;

  return {
    id: `irrelevance:duplicate:${group.sha256}`,
    type: "irrelevance_finding",
    action: "review_duplicate_deletion",
    status: "pending_user_approval",
    approvalGate: "deleting duplicates",
    risk: "destructive",
    matchedRule: "exact duplicate files by content hash",
    confidence: "high",
    reviewOnly: true,
    proposedKeepPath: proposedKeepFile.absolutePath,
    proposedDeletePaths: proposedDeleteFiles.map((file) => file.absolutePath),
    evidence: {
      sha256: group.sha256,
      sizeBytes: group.sizeBytes,
      duplicateCount: group.files.length,
      proposedKeepPath: proposedKeepFile.absolutePath,
      proposedDeletePaths: proposedDeleteFiles.map((file) => file.absolutePath),
      files: group.files
    }
  };
}
