import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { collectFiles } from "./utils.js";

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
  const relativePath = path.relative(repoRoot, filePath).replaceAll("\\", "/");

  for (const rule of rules) {
    if (rule.pattern.test(content)) {
      if (content.includes(`// security-bypass: ${rule.name}`)) {
        continue;
      }
      findings.push({
        filePath: relativePath,
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


