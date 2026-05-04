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
        
        // Inline parsePdfSilently equivalent for the route
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
          const PDFJS = (await import("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js")).default || require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
          PDFJS.disableWorker = true;
          await PDFJS.getDocument({ data: dataBuffer, password });
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

  // Step 3: AI Exclusions
  app.post("/api/ai/exclusions", async (req, res) => {
    try {
      const aiResponse = await askAI("Based on typical file organization, what directories should be in the exclusion list? Give me a JSON string.");
      res.json(JSON.parse(aiResponse));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Step 5: AI Renaming reasoning
  app.post("/api/ai/rename", async (req, res) => {
    try {
      const { fileInfo } = req.body;
      const prompt = `I have a file with info ${JSON.stringify(fileInfo)}. Propose a rename and give reasoning. JSON format.`;
      const aiResponse = await askAI(prompt);
      res.json(JSON.parse(aiResponse));
    } catch (error) {
      res.status(500).json({ error: error.message });
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
