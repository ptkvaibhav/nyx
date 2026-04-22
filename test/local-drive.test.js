import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { syncFileWithConfig } from "../src/core/sync.js";
import { getLocalDriveStatus } from "../src/providers/local-drive.js";

test("uploads a document into the local Drive scaffold and dedupes by fingerprint", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-local-drive-"));
  const sourceRoot = path.join(workspace, "source");
  const driveRoot = path.join(workspace, "Drive");
  const resumePath = path.join(sourceRoot, "abc_resume.pdf");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(resumePath, "resume-version-1", "utf8");

  const configContext = createConfigContext({
    workspace,
    sourceRoot,
    driveRoot
  });

  const firstResult = await syncFileWithConfig({
    filePath: resumePath,
    configContext
  });

  assert.equal(firstResult.action, "upload");
  assert.equal(firstResult.selectedProvider, "googleDrive");
  assert.match(firstResult.storedPath, /Drive[\\/]+GoogleDrive[\\/]+Resumes[\\/]+abc_resume\.pdf$/);

  const uploadedContent = await readFile(firstResult.storedPath, "utf8");
  assert.equal(uploadedContent, "resume-version-1");

  const secondResult = await syncFileWithConfig({
    filePath: resumePath,
    configContext
  });

  assert.equal(secondResult.action, "skip");
  assert.equal(secondResult.selectedProvider, "googleDrive");

  const status = await getLocalDriveStatus({
    driveRoot,
    providers: configContext.config.providers
  });

  assert.equal(status.providers.googleDrive.fileCount, 1);
  assert.equal(status.providers.oneDrive.fileCount, 0);
});

test("routes to OneDrive when it has more mock free space than Google Drive", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-local-drive-"));
  const sourceRoot = path.join(workspace, "source");
  const driveRoot = path.join(workspace, "Drive");
  const imagePath = path.join(sourceRoot, "photo.jpg");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(imagePath, "image-binary-placeholder", "utf8");

  const configContext = createConfigContext({
    workspace,
    sourceRoot,
    driveRoot,
    googleCapacityBytes: 8,
    oneDriveCapacityBytes: 2048
  });

  const result = await syncFileWithConfig({
    filePath: imagePath,
    configContext
  });

  assert.equal(result.action, "upload");
  assert.equal(result.selectedProvider, "oneDrive");
  assert.match(result.storedPath, /Drive[\\/]+OneDrive[\\/]+Photos[\\/]+photo\.jpg$/);
});

test("prompts for repository creation instead of uploading loose code files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-local-drive-"));
  const sourceRoot = path.join(workspace, "source");
  const driveRoot = path.join(workspace, "Drive");
  const codePath = path.join(sourceRoot, "tool.js");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(codePath, "console.log('hello');", "utf8");

  const configContext = createConfigContext({
    workspace,
    sourceRoot,
    driveRoot
  });

  const result = await syncFileWithConfig({
    filePath: codePath,
    configContext
  });

  assert.equal(result.action, "prompt_create_repository");

  const status = await getLocalDriveStatus({
    driveRoot,
    providers: configContext.config.providers
  });

  assert.equal(status.providers.googleDrive.fileCount, 0);
  assert.equal(status.providers.oneDrive.fileCount, 0);
});

test("skips excluded files such as .env", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "nyx-local-drive-"));
  const sourceRoot = path.join(workspace, "source");
  const driveRoot = path.join(workspace, "Drive");
  const envPath = path.join(sourceRoot, ".env");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(envPath, "SECRET_TOKEN=demo", "utf8");

  const configContext = createConfigContext({
    workspace,
    sourceRoot,
    driveRoot
  });

  const result = await syncFileWithConfig({
    filePath: envPath,
    configContext
  });

  assert.equal(result.action, "skip");
  assert.match(result.reason, /outside watched directories or excluded by policy/i);
});

function createConfigContext({
  workspace,
  sourceRoot,
  driveRoot,
  googleCapacityBytes = 4096,
  oneDriveCapacityBytes = 1024
}) {
  return {
    baseDirectory: workspace,
    configPath: path.join(workspace, "nyx.config.json"),
    config: {
      watchedDirectories: [
        {
          path: sourceRoot,
          recursive: true,
          include: ["**/*"],
          exclude: [
            "**/.env",
            "**/.env.*",
            "**/.git/**",
            "**/node_modules/**",
            "**/Temp/**",
            "**/packages/**",
            "**/Drive/**",
            "**/.nyx/**"
          ]
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
          capacityBytes: googleCapacityBytes
        },
        oneDrive: {
          enabled: true,
          mode: "local-folder",
          folderName: "OneDrive",
          capacityBytes: oneDriveCapacityBytes
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
