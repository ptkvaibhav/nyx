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
import { buildLocalAudit } from "./organization/local-audit.js";
import { ensureLocalDriveScaffold, getLocalDriveStatus } from "./providers/local-drive.js";
import { createMockProviderSnapshots } from "./providers/mock-snapshots.js";
import { explainPricingStrategy } from "./advisory/pricing-catalog.js";

const [, , command, ...args] = process.argv;

const handlers = {
  plan: printPlan,
  doctor: runDoctor,
  demo: runDemo,
  "engagement-summary": runEngagementSummary,
  "audit-local": runAuditLocal,
  "init-drive": runInitDrive,
  "drive-status": runDriveStatus,
  scan: runScan,
  "sync-file": runSyncFile,
  decide: runDecide,
  fingerprint: runFingerprint,
  classify: runClassify
};

async function main() {
  const handler = handlers[command];

  if (!handler) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await handler(args);
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
    weaklyStructuredFiles: audit.weaklyStructuredFiles.slice(0, 25),
    unstructuredFiles: audit.unstructuredFiles.slice(0, 25)
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

function printUsage() {
  console.log("Usage: node src/cli.js <command>");
  console.log("");
  console.log("Commands:");
  console.log("- plan");
  console.log("- doctor");
  console.log("- demo");
  console.log("- engagement-summary [engagement-path]");
  console.log("- audit-local [engagement-path]");
  console.log("- init-drive");
  console.log("- drive-status");
  console.log("- scan");
  console.log("- sync-file <file-path>");
  console.log("- decide <file-path>");
  console.log("- fingerprint <file-path>");
  console.log("- classify <file-path>");
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
