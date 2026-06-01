import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isEligibleForLocalOrganization } from "../src/organization/eligibility.js";
import { findIrrelevanceFindings } from "../src/organization/irrelevance.js";
import { buildOrganizationProposals } from "../src/organization/proposals.js";
import { buildReviewQueue } from "../src/organization/review-queue.js";

test("buildOrganizationProposals creates approval-gated move and rename proposals with evidence", () => {
  const file = {
    rootPath: path.resolve("managed"),
    absolutePath: path.resolve("managed", "file123.pdf"),
    relativePath: "file123.pdf",
    baseName: "file123.pdf",
    extension: ".pdf",
    sha256: "abcdef1234567890",
    classification: {
      category: "document"
    },
    structure: {
      purpose: "finance",
      expectedFolders: ["Finance"],
      moveRecommended: true,
      renameRecommended: true,
      reasons: [
        "Filename does not look descriptive enough for the detected content.",
        "A clearer destination folder exists."
      ]
    }
  };

  const proposals = buildOrganizationProposals([file]);

  // Should have move and rename
  assert.equal(proposals.filter(p => p.action === "move_file").length, 1);
  assert.equal(proposals.filter(p => p.action === "rename_file").length, 1);

  const move = proposals.find((proposal) => proposal.action === "move_file");
  assert.ok(move);
  assert.equal(move.status, "pending_user_approval");
  assert.equal(move.approvalGate, "moving files in batch");
  assert.equal(move.evidence.proposedRelativePath, "Finance/file123.pdf");

  const rename = proposals.find((proposal) => proposal.action === "rename_file");
  assert.ok(rename);
  assert.equal(rename.status, "pending_user_approval");
  assert.equal(rename.approvalGate, "renaming files");
  assert.equal(rename.proposedName, "Finance_Record_file123.pdf");
  assert.equal(rename.evidence.sha256, "abcdef1234567890");
});

test("buildOrganizationProposals now allows deep nesting but respects system exclusions", () => {
  const file = {
    rootPath: path.resolve("managed"),
    absolutePath: path.resolve("managed", "some", "deep", "path", "file123.pdf"),
    relativePath: "some/deep/path/file123.pdf",
    baseName: "file123.pdf",
    extension: ".pdf",
    sha256: "abcdef1234567890",
    classification: { category: "document" },
    structure: {
      purpose: "document",
      expectedFolders: ["Documents"],
      moveRecommended: true,
      renameRecommended: false
    }
  };

  const proposals = buildOrganizationProposals([file]);

  // Deep files are now eligible
  assert.equal(proposals.length, 1);
  assert.equal(isEligibleForLocalOrganization("some/deep/path/file123.pdf"), true);
  
  // System segments are still excluded
  assert.equal(isEligibleForLocalOrganization("node_modules/pkg/index.js"), false);
  assert.equal(isEligibleForLocalOrganization(".git/config"), false);
});

test("findIrrelevanceFindings turns duplicate groups into review-only destructive findings", () => {
  const findings = findIrrelevanceFindings({
    configuredRules: ["exact duplicate files by content hash"],
    duplicates: [
      {
        sha256: "same-hash",
        sizeBytes: 128,
        files: [
          { absolutePath: "a.pdf", relativePath: "a.pdf", rootPath: "root" },
          { absolutePath: "b.pdf", relativePath: "b.pdf", rootPath: "root" }
        ]
      }
    ]
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].action, "review_duplicate_deletion");
  assert.equal(findings[0].reviewOnly, true);
  assert.equal(findings[0].risk, "destructive");
  assert.equal(findings[0].evidence.duplicateCount, 2);
  assert.equal(findings[0].proposedDeletePaths.length, 1);
});

test("buildReviewQueue combines proposals and findings with summary totals", () => {
  const queue = buildReviewQueue({
    organizationProposals: [
      { id: "move:1", risk: "mutation" },
      { id: "rename:1", risk: "mutation" }
    ],
    irrelevanceFindings: [
      { id: "irrelevance:1", risk: "destructive" }
    ],
    protectionArchiveProposals: [
      { id: "archive:1", risk: "destructive" }
    ]
  });

  assert.equal(queue.totals.pendingItems, 4);
  assert.equal(queue.totals.organizationProposals, 2);
  assert.equal(queue.totals.irrelevanceFindings, 1);
  assert.equal(queue.totals.archiveProposals, 1);
  assert.equal(queue.totals.mutationItems, 2);
  assert.equal(queue.totals.destructiveItems, 2);
});
