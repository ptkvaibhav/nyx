export function findDuplicateGroups(fileEntries) {
  const groups = new Map();

  for (const fileEntry of fileEntries) {
    const existingGroup = groups.get(fileEntry.sha256) ?? [];
    existingGroup.push(fileEntry);
    groups.set(fileEntry.sha256, existingGroup);
  }

  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([sha256, files]) => {
      return {
        sha256,
        sizeBytes: files[0].sizeBytes,
        files: files
          .map((file) => {
            return {
              absolutePath: file.absolutePath,
              relativePath: file.relativePath,
              rootPath: file.rootPath
            };
          })
          .sort((left, right) => left.absolutePath.localeCompare(right.absolutePath))
      };
    })
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

