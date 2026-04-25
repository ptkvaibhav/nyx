import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { buildLocalAudit } from "../src/organization/local-audit.js";

test("buildLocalAudit scans only managed roots, skips exclusions, finds duplicates, and scores structure", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-audit-"));
  const managedRoot = path.join(workspace, "managed");
  const excludedRoot = path.join(managedRoot, "node_modules");
  const engagementPath = path.join(workspace, "engagement.md");

  await mkdir(path.join(managedRoot, "Resumes"), { recursive: true });
  await mkdir(path.join(managedRoot, "Downloads"), { recursive: true });
  await mkdir(path.join(managedRoot, "Finance"), { recursive: true });
  await mkdir(excludedRoot, { recursive: true });

  await writeFile(path.join(managedRoot, "Resumes", "John_Resume.pdf"), "resume", "utf8");
  await writeFile(path.join(managedRoot, "Downloads", "Invoice_2025.pdf"), "invoice", "utf8");
  await writeFile(path.join(managedRoot, "Downloads", "file123.pdf"), "notes", "utf8");
  await writeFile(path.join(managedRoot, "Finance", "duplicate-a.pdf"), "same", "utf8");
  await writeFile(path.join(managedRoot, "Downloads", "duplicate-b.pdf"), "same", "utf8");
  await writeFile(path.join(excludedRoot, "ignored.txt"), "ignore-me", "utf8");

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

- resumes and CVs

Important folder candidates once structure exists:

- \`Resumes\`

## Approval Gates

- renaming files
- deleting duplicates
`,
    "utf8"
  );

  const audit = await buildLocalAudit({ engagementPath });

  assert.equal(audit.totals.filesScanned, 5);
  assert.equal(audit.totals.duplicateGroups, 1);
  assert.equal(audit.duplicates[0].files.length, 2);
  assert.equal(audit.totals.structuredFiles, 1);
  assert.equal(audit.totals.weaklyStructuredFiles, 1);
  assert.equal(audit.totals.unstructuredFiles, 3);
  assert.equal(audit.reviewQueue.totals.irrelevanceFindings, 1);
  assert.ok(audit.reviewQueue.totals.organizationProposals > 0);
  assert.equal(audit.reviewQueue.items.every((item) => item.status === "pending_user_approval"), true);

  const structuredResume = audit.structuredFiles.find((file) => file.relativePath === "Resumes/John_Resume.pdf");
  assert.ok(structuredResume);
  assert.equal(structuredResume.purpose, "resume");

  const weakInvoice = audit.weaklyStructuredFiles.find((file) => file.relativePath === "Downloads/Invoice_2025.pdf");
  assert.ok(weakInvoice);
  assert.equal(weakInvoice.moveRecommended, true);
  assert.equal(weakInvoice.renameRecommended, false);

  const unstructuredGeneric = audit.unstructuredFiles.find((file) => file.relativePath === "Downloads/file123.pdf");
  assert.ok(unstructuredGeneric);
  assert.equal(unstructuredGeneric.renameRecommended, true);
});
