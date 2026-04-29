import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { buildLocalAudit } from "../src/organization/local-audit.js";
import { applyApprovedReview } from "../src/organization/executor.js";
import { Catalog } from "../src/core/catalog.js";

test("applyApprovedReview skips unapproved review items without mutating files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const dbPath = path.join(workspace, ".nyx", "nyx.db");
  const sourcePath = path.join(managedRoot, "file123.pdf");

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "document", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const catalog = await Catalog.open(dbPath);
  await buildLocalAudit({ engagementPath, dbPath });

  const result = await applyApprovedReview({ catalog, engagementPath });

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped.length > 0, true);
  assert.equal(await readFile(sourcePath, "utf8"), "document");
});

test("applyApprovedReview applies approved move and rename proposals with audit entries", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const dbPath = path.join(workspace, ".nyx", "nyx.db");
  const auditLogPath = path.join(workspace, ".nyx", "audit-log.jsonl");
  const sourcePath = path.join(managedRoot, "file123.pdf");

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "document", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const catalog = await Catalog.open(dbPath);
  await buildLocalAudit({ engagementPath, dbPath });
  const pending = catalog.getPendingReviewItems();
  const moveItem = pending.find((item) => item.action === "move_file");

  catalog.approveReviewItem(moveItem.id);
  const result = await applyApprovedReview({ catalog, engagementPath, auditLogPath });

  assert.equal(result.errors.length, 0);
  assert.equal(result.applied.length, 1);
  assert.equal(path.basename(result.applied[0].newPath), "file123.pdf");
  assert.equal(await readFile(result.applied[0].newPath, "utf8"), "document");

  const auditLog = await readFile(auditLogPath, "utf8");
  assert.match(auditLog, /"action":"move_file"/);
  assert.match(auditLog, /"rollback"/);

  const secondResult = await applyApprovedReview({ catalog, engagementPath, auditLogPath });
  assert.equal(secondResult.errors.length, 0);
  assert.equal(secondResult.applied.length, 0);
});

test("applyApprovedReview can combine approved move and rename proposals for the same file", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const dbPath = path.join(workspace, ".nyx", "nyx.db");
  const sourcePath = path.join(managedRoot, "file123.pdf");

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "document", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const catalog = await Catalog.open(dbPath);
  const items = [
    {
      id: "move:demo",
      type: "organization_proposal",
      action: "move_file",
      status: "pending_user_approval",
      approvalGate: "moving files in batch",
      risk: "mutation",
      subjectPath: sourcePath,
      proposedPath: path.join(managedRoot, "Documents", "file123.pdf"),
      evidence: {
        sha256: "43cc23fa52b87b4cc1d02b5b114154151d6adddb17c9fddc06b027fa99e24008"
      }
      },
      {
      id: "rename:demo",
      type: "organization_proposal",
      action: "rename_file",
      status: "pending_user_approval",
      approvalGate: "renaming files",
      risk: "mutation",
      subjectPath: sourcePath,
      proposedName: "Document_demo.pdf",
      proposedPath: path.join(managedRoot, "Document_demo.pdf"),
      evidence: {
        sha256: "43cc23fa52b87b4cc1d02b5b114154151d6adddb17c9fddc06b027fa99e24008"
      }
      }
      ];

      catalog.upsertReviewItems(items);
      catalog.approveAllReviewItems();

      const result = await applyApprovedReview({ catalog, engagementPath });

      assert.equal(result.errors.length, 0);
  assert.equal(result.applied.length, 2);
  assert.equal(await readFile(path.join(managedRoot, "Documents", "Document_demo.pdf"), "utf8"), "document");
});

test("applyApprovedReview deletes approved duplicate candidates after fingerprint verification", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-executor-"));
  const managedRoot = path.join(workspace, "managed");
  const engagementPath = path.join(workspace, "engagement.md");
  const dbPath = path.join(workspace, ".nyx", "nyx.db");
  const firstPath = path.join(managedRoot, "Finance", "duplicate-a.pdf");
  const secondPath = path.join(managedRoot, "duplicate-b.pdf");

  await mkdir(path.dirname(firstPath), { recursive: true });
  await mkdir(path.dirname(secondPath), { recursive: true });
  await writeFile(firstPath, "same", "utf8");
  await writeFile(secondPath, "same", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const catalog = await Catalog.open(dbPath);
  await buildLocalAudit({ engagementPath, dbPath });
  const pending = catalog.getPendingReviewItems();
  const duplicateItem = pending.find((item) => item.action === "review_duplicate_deletion");

  catalog.approveReviewItem(duplicateItem.id);
  const result = await applyApprovedReview({ catalog, engagementPath });

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
