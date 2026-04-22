import test from "node:test";
import assert from "node:assert/strict";
import { parseEngagementMarkdown } from "../src/engagement/parser.js";

test("parses managed directories, exclusions, importance, and approval gates from engagement markdown", () => {
  const markdown = `
# Nyx Engagement

## Managed Directories

Current selection:

- \`C:\\Users\\Example\\Documents\`
- \`D:\\Projects\`

## Safe Irrelevance File Rules

Suggested starter rules:

- exact duplicate files by content hash
- flight tickets older than 2 years

## Default Exclusions

- \`.git\`
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
`;

  const engagement = parseEngagementMarkdown(markdown);

  assert.deepEqual(engagement.managedDirectories, ["C:\\Users\\Example\\Documents", "D:\\Projects"]);
  assert.deepEqual(engagement.defaultExclusions, [".git", "node_modules"]);
  assert.deepEqual(engagement.safeIrrelevanceRules, [
    "exact duplicate files by content hash",
    "flight tickets older than 2 years"
  ]);
  assert.deepEqual(engagement.importantCategories, ["resumes and CVs"]);
  assert.deepEqual(engagement.importantFolders, ["Resumes"]);
  assert.deepEqual(engagement.approvalGates, ["renaming files", "deleting duplicates"]);
});

