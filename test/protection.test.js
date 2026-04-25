import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { syncFileWithConfig } from "../src/core/sync.js";
import { applyApprovedReview } from "../src/organization/executor.js";
import { buildProtectionPlan } from "../src/organization/protection.js";
import { approveReviewItems, saveReviewManifest } from "../src/organization/review-store.js";

test("buildProtectionPlan reports important backup status and archive proposals with proof", async () => {
  const workspace = await mkdtempWorkspace();
  const context = await createProtectionFixture(workspace);

  const syncResult = await syncFileWithConfig({
    filePath: context.archivePath,
    configContext: context.configContext
  });
  assert.equal(syncResult.action, "upload");

  const plan = await buildProtectionPlan({
    engagementPath: context.engagementPath,
    configPath: context.configPath
  });

  assert.equal(plan.totals.importantFiles, 1);
  assert.equal(plan.totals.importantFilesMissingBackup, 1);
  assert.equal(plan.totals.lowerPriorityFiles, 1);
  assert.equal(plan.totals.archiveCandidates, 1);
  assert.equal(plan.reviewQueue.totals.archiveProposals, 1);
  assert.equal(plan.archiveProposals[0].action, "archive_local_copy");
  assert.equal(plan.archiveProposals[0].backupProof.sha256, syncResult.backupProof.sha256);
});

test("applyApprovedReview archives a local copy only after verified backup proof", async () => {
  const workspace = await mkdtempWorkspace();
  const context = await createProtectionFixture(workspace);
  const reviewPath = path.join(workspace, ".nyx", "archive-review.json");

  await syncFileWithConfig({
    filePath: context.archivePath,
    configContext: context.configContext
  });

  const plan = await buildProtectionPlan({
    engagementPath: context.engagementPath,
    configPath: context.configPath
  });
  const saved = await saveReviewManifest({ audit: plan, reviewPath });
  const archiveItem = saved.manifest.items.find((item) => item.action === "archive_local_copy");

  assert.ok(archiveItem);
  await approveReviewItems({ reviewPath, itemIds: [archiveItem.id] });

  const result = await applyApprovedReview({ reviewPath });

  assert.equal(result.errors.length, 0);
  assert.equal(result.applied.length, 1);
  await assertMissing(context.archivePath);
  assert.equal(await readFile(archiveItem.backupProof.storedPath, "utf8"), "old installer");
});

async function mkdtempWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), "nyx-protection-"));
}

async function createProtectionFixture(workspace) {
  const managedRoot = path.join(workspace, "managed");
  const driveRoot = path.join(workspace, "Drive");
  const engagementPath = path.join(workspace, "engagement.md");
  const configPath = path.join(workspace, "nyx.config.json");
  const archivePath = path.join(managedRoot, "Archives", "old-tool.zip");
  const resumePath = path.join(managedRoot, "Resumes", "Jane_Resume.pdf");

  await mkdir(path.dirname(archivePath), { recursive: true });
  await mkdir(path.dirname(resumePath), { recursive: true });
  await writeFile(archivePath, "old installer", "utf8");
  await writeFile(resumePath, "resume", "utf8");
  await writeEngagement({ engagementPath, managedRoot });

  const configContext = createConfigContext({
    workspace,
    managedRoot,
    driveRoot,
    configPath
  });

  await writeFile(configPath, JSON.stringify(configContext.config, null, 2), "utf8");

  return {
    archivePath,
    configContext,
    configPath,
    engagementPath
  };
}

function createConfigContext({ workspace, managedRoot, driveRoot, configPath }) {
  return {
    baseDirectory: workspace,
    configPath,
    config: {
      watchedDirectories: [
        {
          path: managedRoot,
          recursive: true,
          include: ["**/*"],
          exclude: ["**/.nyx/**", "**/Drive/**"]
        }
      ],
      mockDrive: {
        enabled: true,
        rootFolder: driveRoot
      },
      providers: {
        googleDrive: {
          enabled: true,
          mode: "local-folder",
          folderName: "GoogleDrive",
          capacityBytes: 4096
        },
        oneDrive: {
          enabled: true,
          mode: "local-folder",
          folderName: "OneDrive",
          capacityBytes: 4096
        },
        github: {
          enabled: true,
          defaultVisibility: "private",
          promptBeforeCreateRepository: true
        }
      },
      routing: {
        categoryPreferences: {
          document: ["googleDrive", "oneDrive"],
          image: ["googleDrive", "oneDrive"],
          video: ["googleDrive", "oneDrive"],
          archive: ["googleDrive", "oneDrive"],
          code: ["github"]
        }
      },
      advisory: {
        quotaWarningPercent: 85,
        staleFileDays: 730,
        pricingRefreshDays: 14
      }
    }
  };
}

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

- \`.nyx\`

## Naming Guidance

Current naming guidance by file type:

- latest resume: \`Name_Resume.ext\`

## Important Files And Folders

Important file categories:

- resumes and CVs
- financial records

Important folder candidates once structure exists:

- \`Resumes\`
- \`Finance\`

## Approval Gates

- deleting a local copy after confirmed cloud backup
`,
    "utf8"
  );
}

async function assertMissing(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    assert.fail(`Expected ${targetPath} to be missing`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
