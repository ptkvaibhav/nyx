import path from "node:path";
import { isEligibleDuplicateGroup } from "./eligibility.js";

export function findIrrelevanceFindings({ duplicates = [], files = [], directories = [], configuredRules = [] } = {}) {
  const normalizedRules = configuredRules.map((rule) => rule.toLowerCase());
  const findings = [];

  if (normalizedRules.includes("exact duplicate files by content hash")) {
    findings.push(...duplicates.filter(isEligibleDuplicateGroup).map(buildDuplicateFinding));
  }

  // New rule: redundant archives
  findings.push(...findExtractedArchives({ files, directories }));

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

function findExtractedArchives({ files, directories }) {
  const findings = [];
  const ARCHIVE_EXTENSIONS = [".zip", ".7z", ".rar", ".tar", ".gz", ".tgz"];
  
  // Combine regular directories and folders flagged as cohesive entities
  const allDirPaths = new Set([
    ...directories.map(d => d.absolutePath.toLowerCase()),
    ...files.filter(f => f.isEntity).map(f => f.absolutePath.toLowerCase())
  ]);

  for (const file of files) {
    if (file.isEntity) continue; // Archives aren't usually folder entities themselves in this context
    
    const baseName = file.baseName || path.basename(file.absolutePath || "");
    if (!baseName) continue;

    const ext = path.extname(baseName).toLowerCase();
    if (!ARCHIVE_EXTENSIONS.includes(ext)) continue;

    const baseNameWithoutExt = baseName.slice(0, -ext.length);
    const possibleDirPath = path.join(path.dirname(file.absolutePath), baseNameWithoutExt);

    if (allDirPaths.has(possibleDirPath.toLowerCase())) {
      findings.push({
        id: `irrelevance:extracted_archive:${file.sha256}:${file.relativePath}`,
        type: "irrelevance_finding",
        action: "review_archive_cleanup",
        status: "pending_user_approval",
        approvalGate: "deleting irrelevant files",
        risk: "destructive",
        subjectPath: file.absolutePath,
        matchedRule: "archive exists alongside extracted folder",
        confidence: "medium",
        reviewOnly: true,
        evidence: {
          archivePath: file.absolutePath,
          extractedFolderPath: possibleDirPath,
          reasons: ["This archive appears to have been extracted into a folder in the same location."]
        }
      });
    }
  }

  return findings;
}

function buildDuplicateFinding(group) {
  const proposedKeepFile = identifyProposedKeepFile(group.files);
  const proposedDeleteFiles = group.files.filter((file) => file.absolutePath !== proposedKeepFile.absolutePath);

  return {
    id: `irrelevance:duplicate:${group.sha256}`,
    type: "irrelevance_finding",
    action: "review_duplicate_deletion",
    status: "pending_user_approval",
    approvalGate: "deleting duplicates",
    risk: "destructive",
    subjectPath: proposedKeepFile.absolutePath,
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

export function identifyProposedKeepFile(files) {
  // Score files based on "originality" (lower score is better/more original)
  const scoredFiles = files.map((file) => {
    let score = 0;
    const name = file.baseName || path.basename(file.absolutePath || "");

    // Penalize common download suffixes
    if (name) {
        const baseNameOnly = path.parse(name.toLowerCase()).name;
        if (/\(\d+\)$/.test(baseNameOnly)) score += 10;
        if (name.toLowerCase().includes("copy")) score += 5;
        if (name.toLowerCase().includes("duplicate")) score += 5;
    }

    // Prefer shorter paths (usually more root-level/intentional)
    score += (file.relativePath || "").split("/").length;

    return { file, score };
  });

  scoredFiles.sort((a, b) => a.score - b.score);
  return scoredFiles[0].file;
}
