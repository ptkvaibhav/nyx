/**
 * Provider adapters should implement the following shape.
 *
 * id: string
 * getQuota(): Promise<{ totalBytes: number, usedBytes: number, availableBytes: number }>
 * findByFingerprint(fileProfile): Promise<{ exists: boolean, providerItemId?: string }>
 * ensureFolderPath(folderSegments): Promise<{ providerFolderId: string }>
 * uploadFile(fileProfile, localPath, folderSegments): Promise<{ providerItemId: string }>
 * refreshChanges(cursor): Promise<{ nextCursor: string, changes: Array<object> }>
 */
export const providerContract = Object.freeze({
  requiredMethods: [
    "getQuota",
    "findByFingerprint",
    "ensureFolderPath",
    "uploadFile",
    "refreshChanges"
  ]
});

