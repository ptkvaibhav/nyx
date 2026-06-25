import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";

async function parsePdfSilently(pdf, buffer, options = {}) {
  const originalWarn = console.warn;
  console.warn = () => {}; // Suppress noise
  try {
    return await pdf(buffer, options);
  } finally {
    console.warn = originalWarn; // Restore
  }
}

export async function extractContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === ".pdf") {
    try {
      const pdf = (await import("pdf-parse")).default;
      const dataBuffer = await fs.readFile(filePath);
      
      const { config } = await loadConfig();
      const passwords = config.pdfPasswords || [];
      
      let data = null;
      let lastError = null;
      
      // Try without password
      try {
        data = await parsePdfSilently(pdf, dataBuffer);
      } catch (err) {
        lastError = err;
      }
      
      // If failed due to password
      if (lastError && (lastError.message.toLowerCase().includes("password") || lastError.name === "PasswordException")) {
         let success = false;
         for (const pwd of passwords) {
            try {
              data = await parsePdfSilently(pdf, dataBuffer, { password: pwd });
              success = true;
              break;
            } catch {
               // Ignore
            }
         }
         if (!success) {
            return "[[PASSWORD_REQUIRED]]";
         }
      } else if (lastError) {
         // console.warn(`Failed to extract text from PDF: ${filePath}`, lastError.message);
         return "";
      }
      
      return data ? (data.text || "") : "";
    } catch (err) {
      // console.warn(`Failed to extract text from PDF: ${filePath}`, err.message);
      return "";
    }
  }
  
  if ([".txt", ".md", ".csv", ".json"].includes(ext)) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (err) {
      return "";
    }
  }

  return "";
}