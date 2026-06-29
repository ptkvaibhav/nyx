const METADATA_FILE_NAMES = new Set(["desktop.ini", "thumbs.db"]);
const SKIPPED_SEGMENTS = new Set([
  ".git",
  ".gradle",
  ".mvn",
  ".nyx",
  ".venv",
  "__pycache__",
  "bin",
  "build",
  "cache",
  "coverage",
  "dist",
  "drive",
  "node_modules",
  "obj",
  "out",
  "packages",
  "target",
  "temp"
]);

export function isEligibleForLocalOrganization(fileOrRelativePath) {
  const relativePath = typeof fileOrRelativePath === "string"
    ? fileOrRelativePath
    : fileOrRelativePath?.relativePath;
  const segments = normalizeSegments(relativePath);

  if (segments.length === 0) {
    return false;
  }

  // Skip hidden system files (starts with ._) and common build/system directories
  if (segments.some((segment) => segment.startsWith("._") || SKIPPED_SEGMENTS.has(segment))) {
    return false;
  }

  const fileName = segments[segments.length - 1];
  if (METADATA_FILE_NAMES.has(fileName)) {
    return false;
  }

  // Any file in a managed directory that isn't excluded by the above rules is eligible.
  // We don't limit by segment length anymore because users might have deep structures
  // that they want Nyx to help organize.
  return true;
}

export function isEligibleDuplicateGroup(group) {
  return group.files.every((file) => isEligibleForLocalOrganization(file));
}

function normalizeSegments(relativePath) {
  return String(relativePath ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}
