import path from "node:path";

const EXTENSION_RULES = {
  document: new Set([".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".mdx"]),
  image: new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".svg"]),
  video: new Set([".mp4", ".mov", ".mkv", ".avi", ".webm"]),
  archive: new Set([".zip", ".rar", ".7z", ".tar", ".gz"]),
  code: new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".swift",
    ".kt",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".sh",
    ".ps1",
    ".html",
    ".css",
    ".scss"
  ])
};

const CATEGORY_PROVIDERS = {
  document: ["googleDrive", "oneDrive"],
  image: ["googleDrive", "oneDrive"],
  video: ["googleDrive", "oneDrive"],
  archive: ["googleDrive", "oneDrive"],
  code: ["github"],
  other: ["googleDrive", "oneDrive"]
};

export function classifyFile(fileProfile) {
  const extension = fileProfile.extension ?? path.extname(fileProfile.absolutePath ?? "").toLowerCase();
  const baseName = (fileProfile.baseName ?? path.basename(fileProfile.absolutePath ?? "")).toLowerCase();

  const category = detectCategory(extension);
  const folderSegments = inferFolderSegments(baseName, category);

  return {
    category,
    relevantProviders: CATEGORY_PROVIDERS[category] ?? CATEGORY_PROVIDERS.other,
    folderSegments
  };
}

function detectCategory(extension) {
  for (const [category, extensions] of Object.entries(EXTENSION_RULES)) {
    if (extensions.has(extension)) {
      return category;
    }
  }

  return "other";
}

function inferFolderSegments(baseName, category) {
  if (/(resume|cv|cover-letter)/i.test(baseName)) {
    return ["Resumes"];
  }

  if (/(invoice|receipt|tax|payslip)/i.test(baseName)) {
    return ["Finance"];
  }

  if (category === "image") {
    return ["Photos"];
  }

  if (category === "video") {
    return ["Videos"];
  }

  if (category === "archive") {
    return ["Archives"];
  }

  if (category === "document") {
    return ["Documents"];
  }

  if (category === "code") {
    return ["Code"];
  }

  return ["Unsorted"];
}
