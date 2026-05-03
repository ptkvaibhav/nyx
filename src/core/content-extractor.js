import fs from "node:fs/promises";
import path from "node:path";

export async function extractContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === ".pdf") {
    try {
      const pdf = (await import("pdf-parse")).default;
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text || "";
    } catch (err) {
      console.warn(`Failed to extract text from PDF: ${filePath}`, err.message);
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