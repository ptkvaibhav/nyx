import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_REVIEW_PATH = ".nyx/review-queue.json";

export async function saveReviewManifest({ audit, reviewPath = DEFAULT_REVIEW_PATH } = {}) {
  const resolvedPath = path.resolve(reviewPath);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    engagementPath: audit.engagementPath,
    managedDirectories: audit.managedDirectories,
    totals: audit.reviewQueue.totals,
    items: audit.reviewQueue.items.map((item) => {
      return {
        ...item,
        approved: false
      };
    })
  };

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    reviewPath: resolvedPath,
    manifest
  };
}

export async function loadReviewManifest(reviewPath = DEFAULT_REVIEW_PATH) {
  const resolvedPath = path.resolve(reviewPath);
  const manifest = JSON.parse(await readFile(resolvedPath, "utf8"));

  return {
    reviewPath: resolvedPath,
    manifest
  };
}

export async function writeReviewManifest({ reviewPath = DEFAULT_REVIEW_PATH, manifest } = {}) {
  const resolvedPath = path.resolve(reviewPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    reviewPath: resolvedPath,
    manifest
  };
}

export async function approveReviewItems({ reviewPath = DEFAULT_REVIEW_PATH, itemIds = [] } = {}) {
  const loaded = await loadReviewManifest(reviewPath);
  const approveAll = itemIds.includes("all");
  const requestedIds = new Set(itemIds);
  const now = new Date().toISOString();
  const missingIds = new Set(itemIds.filter((itemId) => itemId !== "all"));

  const items = loaded.manifest.items.map((item) => {
    if (!approveAll && !requestedIds.has(item.id)) {
      return item;
    }

    missingIds.delete(item.id);

    return {
      ...item,
      status: "approved",
      approved: true,
      approvedAt: now
    };
  });

  if (missingIds.size > 0) {
    throw new Error(`Review item not found: ${[...missingIds].join(", ")}`);
  }

  const manifest = {
    ...loaded.manifest,
    updatedAt: now,
    items
  };

  await writeReviewManifest({
    reviewPath: loaded.reviewPath,
    manifest
  });

  return {
    reviewPath: loaded.reviewPath,
    approvedCount: items.filter((item) => item.approved).length,
    manifest
  };
}
