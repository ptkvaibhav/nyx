import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { buildLocalAudit } from "../src/organization/local-audit.js";
import { applyApprovedReview } from "../src/organization/executor.js";
import { approveReviewItems, saveReviewManifest } from "../src/organization/review-store.js";

test("applyApprovedReview skips unapproved review items without mutating files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const reviewPath = path.join(workspace, ".nyx", "review.json");
  const sourcePath = path.join(managedRoot, "Downloads", "file123.pdf");

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "document", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const audit = await buildLocalAudit({ engagementPath });
  await saveReviewManifest({ audit, reviewPath });

  const result = await applyApprovedReview({ reviewPath });

  assert.equal(result.applied.length, 0);
  assert.ok(result.skipped.length > 0);
  assert.equal(await readFile(sourcePath, "utf8"), "document");
});

test("applyApprovedReview applies approved move and rename proposals with audit entries", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const reviewPath = path.join(workspace, ".nyx", "review.json");
  const auditLogPath = path.join(workspace, ".nyx", "audit-log.jsonl");
  const sourcePath = path.join(managedRoot, "Downloads", "file123.pdf");

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "document", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const audit = await buildLocalAudit({ engagementPath });
  const saved = await saveReviewManifest({ audit, reviewPath });
  const renameItem = saved.manifest.items.find((item) => item.action === "rename_file");

  await approveReviewItems({ reviewPath, itemIds: [renameItem.id] });
  const result = await applyApprovedReview({ reviewPath, auditLogPath });

  assert.equal(result.errors.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(path.basename(result.applied[0].newPath), renameItem.proposedName);
  assert.equal(await readFile(result.applied[0].newPath, "utf8"), "document");

  const auditLog = await readFile(auditLogPath, "utf8");
  assert.match(auditLog, /"action":"rename_file"/);
  assert.match(auditLog, /"rollback"/);

  const secondResult = await applyApprovedReview({ reviewPath, auditLogPath });
  assert.equal(secondResult.errors.length, 0);
  assert.equal(secondResult.applied.length, 0);
});

test("applyApprovedReview deletes approved duplicate candidates after fingerprint verification", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const reviewPath = path.join(workspace, ".nyx", "review.json");
  const firstPath = path.join(managedRoot, "Finance", "duplicate-a.pdf");
  const secondPath = path.join(managedRoot, "Downloads", "duplicate-b.pdf");

  await mkdir(path.dirname(firstPath), { recursive: true });
  await mkdir(path.dirname(secondPath), { recursive: true });
  await writeFile(firstPath, "same", "utf8");
  await writeFile(secondPath, "same", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const audit = await buildLocalAudit({ engagementPath });
  const saved = await saveReviewManifest({ audit, reviewPath });
  const duplicateItem = saved.manifest.items.find((item) => item.action === "review_duplicate_deletion");

  await approveReviewItems({ reviewPath, itemIds: [duplicateItem.id] });
  const result = await applyApprovedReview({ reviewPath });

  assert.equal(result.errors.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].deletedPaths.length, 1);
});

async function writeEngagement({ engagementPath, managedRoot }) {
  await writeFile(
    engagementPath,
    `
# Nyx Engagement

## Managed Directories

Current selection:

- \`${managedRoot.replaceAll("\\", "\\\\")}\`

## Safe Irrelevance File Rules

Suggested starter rules:

- exact duplicate files by content hash

## Default Exclusions

- \`node_modules\`

## Naming Guidance

Current naming guidance by file type:

- latest resume: \`Name_Resume.ext\`

## Important Files And Folders

Important file categories:

- financial records

Important folder candidates once structure exists:

- \`Finance\`

## Approval Gates

- renaming files
- moving files in batch
- deleting duplicates
`,
    "utf8"
  );
}
