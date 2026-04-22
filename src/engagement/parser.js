import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadEngagement(engagementPath = "docs/engagement.md") {
  const resolvedPath = path.resolve(engagementPath);
  const markdown = await readFile(resolvedPath, "utf8");

  return {
    engagementPath: resolvedPath,
    ...parseEngagementMarkdown(markdown)
  };
}

export function parseEngagementMarkdown(markdown) {
  const managedDirectoriesSection = getSection(markdown, "Managed Directories");
  const irrelevanceSection = getSection(markdown, "Safe Irrelevance File Rules");
  const exclusionSection = getSection(markdown, "Default Exclusions");
  const namingSection = getSection(markdown, "Naming Guidance");
  const importantSection = getSection(markdown, "Important Files And Folders");
  const approvalSection = getSection(markdown, "Approval Gates");

  return {
    managedDirectories: extractBullets(managedDirectoriesSection, "Current selection"),
    safeIrrelevanceRules: extractBullets(irrelevanceSection, "Suggested starter rules"),
    defaultExclusions: extractSectionBullets(exclusionSection),
    namingGuidance: extractBullets(namingSection, "Current naming guidance by file type"),
    importantCategories: extractBullets(importantSection, "Important file categories"),
    importantFolders: extractBullets(importantSection, "Important folder candidates once structure exists"),
    approvalGates: extractSectionBullets(approvalSection)
  };
}

function getSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);

  if (startIndex === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      break;
    }

    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n");
}

function extractBullets(section, label) {
  const lines = section.split(/\r?\n/);
  const labelLine = `${label}:`;
  const startIndex = lines.findIndex((line) => line.trim() === labelLine);

  if (startIndex === -1) {
    return [];
  }

  const bullets = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const currentLine = lines[index].trim();

    if (!currentLine) {
      if (bullets.length > 0) {
        break;
      }
      continue;
    }

    if (currentLine.endsWith(":") && !currentLine.startsWith("- ")) {
      break;
    }

    if (currentLine.startsWith("- ")) {
      bullets.push(cleanBullet(currentLine));
    }
  }

  return bullets;
}

function extractSectionBullets(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map(cleanBullet);
}

function cleanBullet(line) {
  return line.replace(/^- /, "").replace(/`/g, "").trim();
}

