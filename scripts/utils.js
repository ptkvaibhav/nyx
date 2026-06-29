import { readdirSync } from "node:fs";
import path from "node:path";

export function collectFiles(startPath, extension) {
  const entries = readdirSync(startPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const absolutePath = path.join(startPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFiles(absolutePath, extension));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith(extension)) {
      results.push(absolutePath);
    }
  }

  return results;
}
