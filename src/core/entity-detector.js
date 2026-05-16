import fs from "node:fs/promises";
import path from "node:path";
import { askAI } from "./ai.js";

// In-memory cache to prevent spamming the LLM with identical directory structures.
const entityCache = new Map();

/**
 * Uses the local AI to dynamically determine if a directory should be treated 
 * as a single cohesive entity (like an app, project, cache, or backup) 
 * rather than a collection of individual files.
 */
export async function detectCohesiveEntity(absoluteDirPath) {
  try {
    const dirName = path.basename(absoluteDirPath);
    
    // Ignore root drives or empty names
    if (!dirName || dirName.length <= 1) return { isEntity: false };

    const entries = await fs.readdir(absoluteDirPath, { withFileTypes: true });
    
    // Sample contents (up to 12 items) to give the AI context
    const sampleItems = entries.slice(0, 12).map(e => e.isDirectory() ? `[DIR] ${e.name}` : e.name);
    const sample = sampleItems.length > 0 ? sampleItems.join(", ") : "(empty)";
    
    // Cache key based on directory name and a sample of its contents
    const cacheKey = `${dirName}::${sample}`;
    if (entityCache.has(cacheKey)) {
      return entityCache.get(cacheKey);
    }

    const prompt = `You are a deterministic file system analysis AI. Your job is to decide if a directory is a "Cohesive Entity".
A Cohesive Entity is a folder that should NOT have its internal files separated or moved individually. 
Examples of Cohesive Entities:
- Software projects (contain source code, config files)
- Installed applications or games
- System caches, temporary folders, or metadata folders (e.g., .thumbnails, .cache, .git)
- Device backups or OS images

Directory Name: "${dirName}"
Contents Sample: ${sample}

Determine if this directory is a Cohesive Entity.
Return ONLY a raw JSON string matching this exact structure: {"isEntity": true/false, "type": "software|app|cache|backup|none", "reasoning": "Brief explanation"}`;

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
