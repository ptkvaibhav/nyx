import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetDirectories = ["src", "test"];
const rules = [
  { name: "eval", pattern: /\beval\s*\(/ },
  { name: "Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { name: "child_process usage", pattern: /\bchild_process\b/ },
  { name: "execSync usage", pattern: /\bexecSync\s*\(/ },
  { name: "spawnSync usage", pattern: /\bspawnSync\s*\(/ },
  { name: "OpenAI-style secret", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub personal access token", pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/ }
];

const findings = [];
const jsFiles = targetDirectories.flatMap((directory) => collectFiles(path.join(repoRoot, directory), ".js"));

for (const filePath of jsFiles) {
  const content = readFileSync(filePath, "utf8");

  for (const rule of rules) {
    if (rule.pattern.test(content)) {
      findings.push({
        filePath: path.relative(repoRoot, filePath).replaceAll("\\", "/"),
        rule: rule.name
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.filePath}: ${finding.rule}`);
  }
  process.exit(1);
}

console.log(`Security check passed for ${jsFiles.length} JavaScript files.`);

function collectFiles(startPath, extension) {
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

