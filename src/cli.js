#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { classifyFile } from "./core/classify.js";
import { loadConfig, resolveWatchedRoot } from "./core/config.js";
import { fingerprintFile } from "./core/fingerprint.js";
import { buildBackupPlan } from "./core/planner.js";
import { scanWatchedDirectory } from "./core/scan.js";
import { syncFileWithLocalDrive } from "./core/sync.js";
import { loadEngagement } from "./engagement/parser.js";
import { buildCloudAudit } from "./organization/cloud-audit.js";
import { applyApprovedReview, rollbackAppliedReview } from "./organization/executor.js";
import { buildLocalAudit } from "./organization/local-audit.js";
import { buildProtectionPlan } from "./organization/protection.js";
import { DEFAULT_REVIEW_PATH, saveReviewManifest } from "./organization/review-store.js";
import { ensureLocalDriveScaffold, getLocalDriveStatus } from "./providers/local-drive.js";
import { createMockProviderSnapshots } from "./providers/mock-snapshots.js";
import { explainPricingStrategy } from "./advisory/pricing-catalog.js";
import { Catalog } from "./core/catalog.js";
import { startServer } from "./server.js";
import { setupOllama } from "./core/ollama-manager.js";

const [, , command, ...args] = process.argv;
const DEFAULT_DB_PATH = ".nyx/nyx.db";


async function main() {
  if (command === "doctor") {
    await runDoctor();
    return;
  }

  if (command === "setup-ai") {
    await runSetupAi();
    return;
  }
  
  if (command && command !== "ui") {
    console.log("Nyx has been upgraded to V5! Pure CLI commands are deprecated.");
    console.log("Please run `nyx` without arguments to launch the new interactive AI Web Dashboard.");
    console.log("To check system health, run `nyx doctor`.");
    console.log("To check local AI readiness, run `nyx setup-ai`.");
    process.exitCode = 1;
    return;
  }

  await runDefaultShowcase(args);
}

async function printPlan() {
  console.log("Nyx current plan");
  console.log("");
  console.log("Core lanes:");
  console.log("- engagement-driven audit");
  console.log("- duplicate and structure review");
  console.log("- rename and folder proposals with approval");
  console.log("- backup and archival after organization");
  console.log("");
  console.log("Important rules:");
  console.log("- scan only user-approved directories");
  console.log("- identify duplicates by content fingerprint");
  console.log("- never rename, move, or delete without approval");
  console.log("- verify cloud backup before local archival");
  console.log("");
  console.log("Current advisory notes:");
  for (const line of explainPricingStrategy()) {
    console.log(`- ${line}`);
  }
}

async function runDoctor() {
  const configPath = path.resolve("nyx.config.json");
  const exampleConfigPath = path.resolve("nyx.config.example.json");
  const { baseDirectory, config } = await loadConfig();
  const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

  console.log(`Node version: ${process.version}`);
  console.log(`Working directory: ${process.cwd()}`);

  console.log("");
  console.log("Configuration:");
  console.log(`- nyx.config.json: ${await exists(configPath) ? "present" : "missing"}`);
  console.log(`- nyx.config.example.json: ${await exists(exampleConfigPath) ? "present" : "missing"}`);
  console.log(`- mock Drive root: ${driveRoot}`);
  console.log(`- engagement file: ${await exists(path.resolve("docs/engagement.md")) ? "present" : "missing"}`);

  console.log("");
  console.log("AI Status (Ollama):");
  const aiStatus = await setupOllama();
  console.log(`- Service running: ${aiStatus.serviceRunning ? "yes" : "no"}`);
  console.log(`- Configured model (${aiStatus.selectedModel}): ${aiStatus.available ? "installed" : "missing"}`);
  if (!aiStatus.serviceRunning) {
    console.log("  (Start Ollama manually to enable local AI support)");
  } else if (!aiStatus.available) {
    console.log(`  (Run 'ollama pull ${aiStatus.selectedModel}' to download the model)`);
  }
}

async function runSetupAi() {
  const status = await setupOllama();
  console.log(JSON.stringify(status, null, 2));
}

async function runInitDrive() {
  const { baseDirectory, config } = await loadConfig();
  const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

  const state = await ensureLocalDriveScaffold({
    driveRoot,
    providers: config.providers
  });

  console.log(JSON.stringify({ driveRoot, providers: Object.keys(state.providers) }, null, 2));
}

async function runDriveStatus() {
  const { baseDirectory, config } = await loadConfig();
  const driveRoot = path.resolve(baseDirectory, config.mockDrive.rootFolder);

  await ensureLocalDriveScaffold({
    driveRoot,
    providers: config.providers
  });

  console.log(JSON.stringify(await getLocalDriveStatus({ driveRoot, providers: config.providers }), null, 2));
}

async function runDemo() {
  const sampleFile = {
    absolutePath: "C:/Users/example/Documents/abc_resume.pdf",
    baseName: "abc_resume.pdf",
    extension: ".pdf",
    sizeBytes: 128_000,
    modifiedAt: new Date().toISOString(),
    sha256: "demo-sha256",
    sha1: "demo-sha1",
    md5: "demo-md5"
  };

  const providerSnapshots = createMockProviderSnapshots();
  const plan = await buildBackupPlan({
    fileProfile: sampleFile,
    providerSnapshots
  });

  console.log(JSON.stringify(plan, null, 2));
}

async function runEngagementSummary(args) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  console.log(JSON.stringify(await loadEngagement(engagementPath), null, 2));
}

async function runAuditLocal(args) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  const audit = await buildLocalAudit({ engagementPath });

  console.log(JSON.stringify({
    engagementPath: audit.engagementPath,
    managedDirectories: audit.managedDirectories,
    exclusions: audit.exclusions,
    missingDirectories: audit.missingDirectories,
    totals: audit.totals,
    duplicates: audit.duplicates,
    reviewQueue: audit.reviewQueue.totals,
    weaklyStructuredFiles: audit.weaklyStructuredFiles.slice(0, 25),
    unstructuredFiles: audit.unstructuredFiles.slice(0, 25)
  }, null, 2));
}

async function runReviewLocal(args) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  const audit = await buildLocalAudit({ engagementPath });

  console.log(JSON.stringify({
    engagementPath: audit.engagementPath,
    managedDirectories: audit.managedDirectories,
    missingDirectories: audit.missingDirectories,
    totals: audit.reviewQueue.totals,
    items: audit.reviewQueue.items.slice(0, 50)
  }, null, 2));
}

async function _runPrepare(args, isLocal) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  const dbPath = args[1] ?? DEFAULT_DB_PATH;
  
  await buildLocalAudit({ engagementPath, dbPath });
  const catalog = await Catalog.open(dbPath);
  const items = catalog.getPendingReviewItems();

  const totals = {
    pendingItems: items.length,
    organizationProposals: items.filter(i => i.type === "organization_proposal").length,
    mutationItems: items.filter(i => i.risk === "mutation").length
  };

  if (!isLocal) {
    totals.irrelevanceFindings = items.filter(i => i.type === "irrelevance_finding").length;
  }

  const approvePrefix = isLocal ? "approve-local-organization" : "approve-review";
  const applyPrefix = isLocal ? "apply-local-organization" : "apply-review";
  const statusPrefix = isLocal ? "local-organization-status" : "review-status";

  console.log(JSON.stringify({
    dbPath: path.resolve(dbPath),
    totals,
    nextSteps: [
      `node src/cli.js ${statusPrefix} ${dbPath}`,
      `node src/cli.js ${approvePrefix} <item-id|all> ${dbPath}`,
      `node src/cli.js ${applyPrefix} ${dbPath}`
    ]
  }, null, 2));
}

async function runPrepareLocalOrganization(args) {
  await _runPrepare(args, true);
}

async function runPrepareReview(args) {
  await _runPrepare(args, false);
}

async function runReviewStatus(args) {
  const dbPath = args[0] ?? DEFAULT_DB_PATH;
  const catalog = await Catalog.open(dbPath);
  const items = catalog.getPendingReviewItems();

  console.log(JSON.stringify({
    dbPath: path.resolve(dbPath),
    totals: {
      pendingItems: items.filter((item) => item.status === "pending_user_approval").length,
      approvedItems: items.filter((item) => item.status === "approved").length,
      allItems: items.length
    },
    items: items.slice(0, 50)
  }, null, 2));
}

async function runApproveReview(args) {
  const itemId = args[0];
  const dbPath = args[1] ?? DEFAULT_DB_PATH;

  if (!itemId) {
    throw new Error("Usage: node src/cli.js approve-review <item-id|all> [db-path]");
  }

  const catalog = await Catalog.open(dbPath);
  if (itemId === "all") {
    catalog.approveAllReviewItems();
  } else {
    catalog.approveReviewItem(itemId);
  }

  const items = catalog.getPendingReviewItems();

  console.log(JSON.stringify({
    dbPath: path.resolve(dbPath),
    approvedCount: itemId === "all" ? "all" : 1,
    totals: {
      approvedItems: items.filter((i) => i.status === "approved").length,
      pendingItems: items.filter((i) => i.status === "pending_user_approval").length
    }
  }, null, 2));
}

async function runApplyReview(args) {
  const dbPath = args[0] ?? DEFAULT_DB_PATH;
  const catalog = await Catalog.open(dbPath);
  
  const result = await applyApprovedReview({ catalog });

  console.log(JSON.stringify(result, null, 2));
}

async function runRollbackLocalOrganization(args) {
  const dbPath = args[0] ?? DEFAULT_DB_PATH;
  const catalog = await Catalog.open(dbPath);

  const result = await rollbackAppliedReview({ catalog });

  console.log(JSON.stringify(result, null, 2));
}

async function runAuditCloud(args) {
  const configPath = args[0] ?? "nyx.config.json";
  console.log(JSON.stringify(await buildCloudAudit({ configPath }), null, 2));
}

async function runPlanProtection(args) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  const configPath = args[1] ?? "nyx.config.json";
  const plan = await buildProtectionPlan({ engagementPath, configPath });

  console.log(JSON.stringify({
    engagementPath: plan.engagementPath,
    configPath: plan.configPath,
    driveRoot: plan.driveRoot,
    managedDirectories: plan.managedDirectories,
    totals: plan.totals,
    reviewQueue: plan.reviewQueue.totals,
    importantFiles: plan.importantFiles.slice(0, 50),
    archiveProposals: plan.archiveProposals.slice(0, 50)
  }, null, 2));
}

async function runPrepareArchive(args) {
  const engagementPath = args[0] ?? "docs/engagement.md";
  const configPath = args[1] ?? "nyx.config.json";
  const reviewPath = args[2] ?? DEFAULT_REVIEW_PATH;
  const plan = await buildProtectionPlan({ engagementPath, configPath });
  const saved = await saveReviewManifest({ audit: plan, reviewPath });

  console.log(JSON.stringify({
    reviewPath: saved.reviewPath,
    totals: saved.manifest.totals,
    nextSteps: [
      `node src/cli.js review-status ${saved.reviewPath}`,
      `node src/cli.js approve-review <item-id|all> ${saved.reviewPath}`,
      `node src/cli.js apply-review ${saved.reviewPath}`
    ]
  }, null, 2));
}

async function runScan() {
  const { baseDirectory, config } = await loadConfig();
  const report = [];

  for (const watchedRoot of config.watchedDirectories) {
    const rootPath = resolveWatchedRoot(baseDirectory, watchedRoot);
    const files = await scanWatchedDirectory(rootPath, watchedRoot);

    report.push({
      rootPath,
      fileCount: files.length,
      sample: files.slice(0, 10)
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

async function runSyncFile(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error("Usage: node src/cli.js sync-file <file-path>");
  }

  console.log(JSON.stringify(await syncFileWithLocalDrive({ filePath }), null, 2));
}

async function runFingerprint(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error("Usage: node src/cli.js fingerprint <file-path>");
  }

  const profile = await fingerprintFile(path.resolve(filePath));
  console.log(JSON.stringify(profile, null, 2));
}

async function runDecide(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error("Usage: node src/cli.js decide <file-path>");
  }

  const fileProfile = await fingerprintFile(path.resolve(filePath));
  const { config } = await loadConfig();
  const plan = await buildBackupPlan({
    fileProfile,
    providerSnapshots: createMockProviderSnapshots(),
    routingPreferences: config.routing.categoryPreferences
  });

  console.log(JSON.stringify(plan, null, 2));
}

async function runClassify(args) {
  const filePath = args[0];
  if (!filePath) {
    throw new Error("Usage: node src/cli.js classify <file-path>");
  }

  const fileProfile = await buildProfileForClassification(path.resolve(filePath));
  console.log(JSON.stringify(classifyFile(fileProfile), null, 2));
}

async function runUi(args) {
  const port = parseInt(args[0] ?? "3030", 10);
  const dbPath = args[1] ?? DEFAULT_DB_PATH;
  
  const server = await startServer({ port, dbPath });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  try {
    const open = (await import("open")).default;
    await open(`http://localhost:${actualPort}`);
  } catch {
    console.log(`Open browser automatically failed. Please visit http://localhost:${actualPort}`);
  }
}

async function runDefaultShowcase(args) {
  console.log("");
  console.log("=========================================");
  console.log("           Welcome to Nyx v5             ");
  console.log("=========================================");
  console.log("Nyx is your high-integrity, safety-first file");
  console.log("intelligence and organization system.");
  console.log("");
  console.log("Features:");
  console.log(" - Interactive Web Dashboard & AI Wizard");
  console.log(" - Local Ollama AI Reasoning Engine");
  console.log(" - Duplicate detection by content fingerprint");
  console.log(" - Deep Semantic Folder Extraction");
  console.log("");
  console.log("Starting the Nyx Dashboard UI...");
  console.log("=========================================");
  console.log("");
  await runUi(args);
}

async function buildProfileForClassification(filePath) {
  const profile = await fingerprintFile(filePath);
  return {
    ...profile,
    absolutePath: filePath
  };
}

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}


main().catch(async (error) => {
  console.error(error.message);

  const configPath = path.resolve("nyx.config.json");
  if (await exists(configPath)) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!config.watchedDirectories?.length) {
      console.error("Config exists but watchedDirectories is empty.");
    }
  }

  process.exitCode = 1;
});
