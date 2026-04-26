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
      purpose: "document",
      expectedFolders: ["Documents"],
      moveRecommended: true,
      renameRecommended: true,
      reasons: [
        "Filename does not look descriptive enough for the detected content.",
        "A clearer destination folder exists."
      ]
    }
  };

  const proposals = buildOrganizationProposals([file]);

  assert.equal(proposals.length, 2);

  const move = proposals.find((proposal) => proposal.action === "move_file");
  assert.ok(move);
  assert.equal(move.status, "pending_user_approval");
  assert.equal(move.approvalGate, "moving files in batch");
  assert.equal(move.evidence.proposedRelativePath, "Documents/file123.pdf");

  const rename = proposals.find((proposal) => proposal.action === "rename_file");
  assert.ok(rename);
  assert.equal(rename.status, "pending_user_approval");
  assert.equal(rename.approvalGate, "renaming files");
  assert.equal(rename.proposedName, "Document_abcdef12.pdf");
  assert.equal(rename.evidence.sha256, "abcdef1234567890");
});

test("buildOrganizationProposals skips nested bundle files that should not be reorganized individually", () => {
  const proposals = buildOrganizationProposals([
    {
      rootPath: path.resolve("managed"),
      absolutePath: path.resolve("managed", "bundle", "nested", "file123.pdf"),
      relativePath: "bundle/nested/file123.pdf",
      baseName: "file123.pdf",
      extension: ".pdf",
      sha256: "abcdef1234567890",
      classification: {
        category: "document"
      },
      structure: {
        purpose: "document",
        expectedFolders: ["Documents"],
        moveRecommended: true,
        renameRecommended: true,
        reasons: ["Nested bundle"]
      }
    }
  ]);

  assert.equal(proposals.length, 0);
  assert.equal(isEligibleForLocalOrganization("bundle/nested/file123.pdf"), false);
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

test("findIrrelevanceFindings skips duplicates nested inside extracted bundles", () => {
  const findings = findIrrelevanceFindings({
    configuredRules: ["exact duplicate files by content hash"],
    duplicates: [
      {
        sha256: "same-hash",
        sizeBytes: 128,
        files: [
          { absolutePath: "bundle/a.txt", relativePath: "bundle/a.txt", rootPath: "root" },
          { absolutePath: "bundle/nested/b.txt", relativePath: "bundle/nested/b.txt", rootPath: "root" }
        ]
      }
    ]
  });

  assert.equal(findings.length, 0);
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
