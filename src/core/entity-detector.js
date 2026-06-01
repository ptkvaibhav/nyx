import fs from "node:fs/promises";
import path from "node:path";
import { askAI } from "./ai.js";

// In-memory cache to prevent spamming the LLM with identical directory structures.
const entityCache = new Map();

// Folders that are definitely NOT cohesive entities (individual files inside should be organized)
const COMMON_NON_ENTITY_NAMES = new Set([
  "documents", "photos", "pictures", "videos", "music", "downloads", "desktop",
  "finance", "identity", "legal", "education", "resumes", "tickets", "unsorted",
  "bank statements", "pay slips", "form 16", "aadhaar", "passport", "pan card"
]);

/**
 * Uses the local AI to dynamically determine if a directory should be treated 
 * as a single cohesive entity (like an app, project, cache, or backup) 
 * rather than a collection of individual files.
 */
export async function detectCohesiveEntity(absoluteDirPath) {
  try {
    const dirName = path.basename(absoluteDirPath);
    const lowerDirName = dirName.toLowerCase();
    
    // Ignore root drives or empty names
    if (!dirName || dirName.length <= 1) return { isEntity: false };

    // FAST BYPASS: Known common user folders are not cohesive entities
    if (COMMON_NON_ENTITY_NAMES.has(lowerDirName)) {
       return { isEntity: false };
    }

    const entries = await fs.readdir(absoluteDirPath, { withFileTypes: true });
    
    // Fast path: if empty, not a cohesive entity
    if (entries.length === 0) return { isEntity: false };

    // Fast path: if directory contains ONLY images/videos, it's a media folder, not a cohesive software entity
    // However, skip this fast-path if the folder name is hidden (starts with .) like .thumbnails
    const allFiles = entries.filter(e => e.isFile());
    const allMedia = allFiles.length > 0 && allFiles.every(e => /\.(jpg|jpeg|png|mp4|mov|gif|webp|heic)$/i.test(e.name));
    if (allMedia && entries.length === allFiles.length && !dirName.startsWith('.')) {
       return { isEntity: false };
    }
    
    // Sample contents (up to 12 items) to give the AI context
    const sampleItems = entries.slice(0, 12).map(e => e.isDirectory() ? `[DIR] ${e.name}` : e.name);
    const sample = sampleItems.length > 0 ? sampleItems.join(", ") : "(empty)";
    
    // Cache key based on directory name and a sample of its contents
    const cacheKey = `${dirName}::${sample}`;
    if (entityCache.has(cacheKey)) {
      return entityCache.get(cacheKey);
    }

    const prompt = `You are a strict, deterministic file system analysis AI. Decide if a directory is a "Cohesive Entity".
A Cohesive Entity is a strict, machine-generated folder that MUST NOT have its internal files separated or moved.
Examples:
- Software projects (contain code, package.json, build configs)
- Installed applications (contain .exe, .dll, binary assets)
- System caches or hidden metadata folders (e.g., .thumbnails, .cache, .git)

CRITICAL RULES:
- A folder containing mostly user documents (PDFs, Word docs, Excel, media, loose files) is NEVER a cohesive entity.
- If it looks like a user's personal organization folder, return false.
- Do NOT flag device backups as entities unless they are raw disk images.

Example 1:
Directory Name: ".thumbnails"
Contents Sample: 1.jpg, 2.jpg
Response: {"isEntity": true, "type": "cache", "reasoning": "Hidden metadata folders like .thumbnails must be kept intact."}

Example 2:
Directory Name: "Vacation 2023"
Contents Sample: beach.jpg, mountain.png
Response: {"isEntity": false, "type": "none", "reasoning": "Standard user folder containing media."}

Directory Name: "${dirName}"
Contents Sample: ${sample}

Return ONLY a raw JSON string matching the exact structure above.`;

    const response = await askAI(prompt, "You are a deterministic system AI returning valid JSON only. Do not use markdown blocks like ```json. Return raw JSON.");
    
    // Clean JSON if the AI hallucinates markdown
    const clean = response.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1").trim();
    
    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      // If parsing fails, use a safe default but don't cache the failure globally
      return { isEntity: false };
    }
    
    const finalResult = {
      isEntity: !!result.isEntity,
      type: result.type || "unknown",
      marker: "AI Determined",
      reasoning: result.reasoning || "AI classified based on name and contents."
    };
    
    entityCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (error) {
    console.error("AI Entity Detection failed for", absoluteDirPath, error.message);
    return { isEntity: false };
  }
}
