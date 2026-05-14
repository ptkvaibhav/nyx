import express from "express";
import path from "node:path";
import { Catalog } from "./core/catalog.js";
import { applyApprovedReview } from "./organization/executor.js";
import { initAI, askAI } from "./core/ai.js";
import { buildLocalAudit } from "./organization/local-audit.js";

const DEFAULT_DB_PATH = ".nyx/nyx.db";

export async function startServer({ port = 3030, dbPath = DEFAULT_DB_PATH } = {}) {
  // Initialize AI engine
  await initAI();

  const app = express();
  const catalog = await Catalog.open(dbPath);

  app.use(express.json());

  // API Routes
  
  let currentScanProgress = { current: 0, total: 0, file: "" };

  app.get("/api/scan/progress", (req, res) => {
    res.json(currentScanProgress);
  });

  app.get("/api/select-directory", async (req, res) => {
    try {
      const { execSync } = await import("node:child_process");
      const script = `
        Add-Type -AssemblyName System.windows.forms
        $f = New-Object System.Windows.Forms.FolderBrowserDialog
        $f.ShowNewFolderButton = $false
        if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          Write-Output $f.SelectedPath
        }
      `;
      const result = execSync(`powershell.exe -NoProfile -Command "${script.replace(/\n/g, '; ')}"`, { encoding: 'utf8' }).trim();
      res.json({ directory: result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/add-password", async (req, res) => {
    try {
      const { password, filePath } = req.body;
      
      // Test the password immediately if filePath is provided
      if (filePath) {
        const fs = await import("node:fs/promises");
        const pdf = (await import("pdf-parse")).default;
        const dataBuffer = await fs.readFile(filePath);
        
        let isValid = false;
        
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
          await pdf(dataBuffer, { password });
          isValid = true;
        } catch (e) {
          isValid = false;
        } finally {
          console.warn = originalWarn;
        }
        
        if (!isValid) {
          return res.json({ success: false, error: "Incorrect password for this file" });
        }
      }

      const { loadConfig, saveConfig } = await import("./core/config.js");
      const { config, configPath } = await loadConfig();
      if (!config.pdfPasswords) config.pdfPasswords = [];
      if (!config.pdfPasswords.includes(password)) {
        config.pdfPasswords.push(password);
        await saveConfig(config, configPath);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Step 1 & 2: Start Scan
  app.post("/api/scan/start", async (req, res) => {
    try {
      const { directory, skippedFiles } = req.body;
      if (!directory) return res.status(400).json({ error: "Directory path required" });
      
      currentScanProgress = { current: 0, total: 0, file: "" };
      const audit = await buildLocalAudit({ 
        dbPath,
        targetDirectory: directory,
        skippedFiles: skippedFiles || [],
        onProgress: (current, total, file) => {
           currentScanProgress = { current, total, file };
        }
      });
      
      if (audit.needsPassword) {
        res.json({ success: true, message: "Password required", needsPassword: true, passwordFile: audit.passwordFile });
        return;
      }
      
      res.json({ success: true, message: "Scan complete", needsPassword: false });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  function cleanJSON(str) {
    try {
      const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) return match[1].trim();
      return str.trim();
    } catch (e) {
      return str;
    }
  }

  // Step 3: AI Exclusions
  app.post("/api/ai/exclusions", async (req, res) => {
    try {
      const prompt = `Based on typical file organization, what directories should be in the exclusion list?
Consider that Nyx now treats "Cohesive Entities" (Git repos, apps, installers) as units.
Give me ONLY a raw JSON string like {"exclusions": ["folder1"], "reasoning": "why"}. No markdown, no intro.`;
      const aiResponse = await askAI(prompt, "You are a deterministic file organization AI. Follow strict technical heuristics. Proactively exclude massive technical toolsets like node_modules, .git, and build artifacts.");
      const clean = cleanJSON(aiResponse);
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed.exclusions)) {
         parsed.exclusions = [".git", "node_modules", "Temp", "dist", "build"];
         parsed.reasoning = "AI generated malformed list. Defaulting to standard technical exclusions.";
      }
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ error: error.message, exclusions: [".git", "node_modules", "Temp"], reasoning: "Failed to parse AI response. Using defaults." });
    }
  });

  // Step 5: AI Renaming reasoning
  app.post("/api/ai/rename", async (req, res) => {
    try {
      const { fileInfo } = req.body;
      const prompt = `I have a file with info ${JSON.stringify(fileInfo)}. Propose a rename and give reasoning.
Ensure names are deterministic (e.g., lowercase, underscores).
If it's a Finance/Form_16, ensure the year is prominent.
Return ONLY a raw JSON string like {"proposedName": "file.pdf", "reasoning": "why"}. No markdown.`;
      const aiResponse = await askAI(prompt, "You are a highly deterministic file renaming assistant. You must follow standard naming conventions and prioritize semantic clarity based on file content and metadata.");
      const clean = cleanJSON(aiResponse);
      res.json(JSON.parse(clean));
    } catch (error) {
      res.status(500).json({ error: error.message, reasoning: "AI parsing failed" });
    }
  });

  app.get("/api/overview", async (req, res) => {
    try {
      const files = catalog.getAllFiles();
      const items = catalog.getPendingReviewItems();
      
      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.sizeBytes, 0),
        pendingItems: items.length,
        duplicates: items.filter(i => i.action === "review_duplicate_deletion").length,
        proposals: items.filter(i => i.type === "organization_proposal").length,
        archives: items.filter(i => i.action === "review_archive_cleanup").length
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/items", async (req, res) => {
    try {
      const items = catalog.getPendingReviewItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/items/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      if (id === "all") {
        catalog.approveAllReviewItems();
      } else {
        catalog.approveReviewItem(id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/apply", async (req, res) => {
    try {
      const result = await applyApprovedReview({ catalog });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Serve UI static files
  const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  const uiPath = path.join(__dirname, "..", "ui", "dist");
  app.use(express.static(uiPath));

  // Final fallback for React routing - using a middleware without a path to avoid regex issues
  app.use((req, res, next) => {
    // If it's an API call that didn't match, 404
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "API route not found" });
    }
    
    // Otherwise serve index.html
    res.sendFile(path.join(uiPath, "index.html"), (err) => {
      if (err) {
        res.status(404).send("Nyx Dashboard UI not built yet. Run 'npm run ui:build' in the ui directory.");
      }
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Nyx Dashboard running at http://localhost:${port}`);
      resolve(server);
    });
  });
}
