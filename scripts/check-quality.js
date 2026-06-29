import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectFiles } from "./utils.js";

const repoRoot = process.cwd();
const targetDirectories = ["src", "test", "scripts"];
const jsonFiles = [
  "package.json",
  "package-lock.json",
  "nyx.config.json",
  "nyx.config.example.json",
  "schemas/nyx-config.schema.json"
];

const jsFiles = targetDirectories.flatMap((directory) => collectFiles(path.join(repoRoot, directory), ".js"));

for (const filePath of jsFiles) {
  const original = readFileSync(filePath, "utf8");
  const normalized = wrapForParsing(normalizeModuleSyntax(original));

  try {
    new Function(normalized);
  } catch (error) {
    const relativePath = path.relative(repoRoot, filePath).replaceAll("\\", "/");
    throw new Error(`Syntax normalization check failed for ${relativePath}: ${error.message}`, { cause: error });
  }
}

for (const relativePath of jsonFiles) {
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

console.log(`Quality check passed for ${jsFiles.length} JavaScript files and ${jsonFiles.length} JSON files.`);

function normalizeModuleSyntax(code) {
  return code
    .replace(/^#!.*?\n/, "")
    .replace(/import\.meta\.url/g, '"file:///dummy"')
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/\bexport\s+default\b/g, "")
    .replace(/\bexport\s+(?=(async\s+)?function\b|class\b|const\b|let\b|var\b)/g, "");
}

function wrapForParsing(code) {
  return `(async () => {\n${code}\n})();`;
}

