import express from "express";
import path from "node:path";
import { realpath, access } from "node:fs/promises";
import { constants } from "node:fs";
import { Catalog } from "./core/catalog.js";
import { applyApprovedReview, rollbackAppliedReview } from "./organization/executor.js";
import { initAI, askAI, getAIStatus } from "./core/ai.js";
import { buildLocalAudit } from "./organization/local-audit.js";
import { loadEngagement } from "./engagement/parser.js";

const DEFAULT_DB_PATH = ".nyx/nyx.db";

export async function startServer({ port = 3030, dbPath = DEFAULT_DB_PATH } = {}) {
  // Global error handlers to prevent silent crashes
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
  });

  // Initialize AI engine
  await initAI();

  const app = express();
  const catalog = await Catalog.open(dbPath);

  app.use(express.json());

  // API Routes
  
  let currentScanProgress = { current: 0, total: 0, file: "", status: "idle" };
  let scanCancelled = false;

  app.get("/api/health", async (req, res) => {
    try {
      const managedRoots = await getManagedRoots();
      
      const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
      const uiIndexPath = path.join(__dirname, "..", "ui", "dist", "index.html");
      let uiBuilt = false;
      try {
        await access(uiIndexPath, constants.F_OK);
        uiBuilt = true;
      } catch {}

      res.json({
        ok: true,
        dbPath: path.resolve(dbPath),
        ai: getAIStatus(),
        managedRoots,
        uiBuilt
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message,
        ai: getAIStatus()
      });
    }
  });

  app.get("/api/scan/progress", (req, res) => {
    res.json(currentScanProgress);
  });

  app.post("/api/scan/start", async (req, res) => {
    const { directory, skippedFiles } = req.body;
    if (!directory) return res.status(400).json({ error: "Directory path required" });

    let managedRoots;
    try {
      managedRoots = await getManagedRoots();
      const resolvedDir = await getSafePath(directory, managedRoots);
      assertInsideManagedRoots(resolvedDir, managedRoots);
    } catch (error) {
      return res.status(403).json({ error: error.message });
    }

    // Prevent multiple concurrent scans for now
    if (currentScanProgress.status === "running" || currentScanProgress.status === "discovering") {
      return res.status(409).json({ error: "A scan is already in progress" });
    }

    scanCancelled = false;
    currentScanProgress = { current: 0, total: 0, file: "", status: "running" };

    // Fire and forget the scan job
    (async () => {
      try {
        const audit = await buildLocalAudit({ 
          dbPath,
          targetDirectory: directory,
          skippedFiles: skippedFiles || [],
          isCancelled: () => scanCancelled,
          onDiscovery: (count, path) => {
             if (scanCancelled) return;
             currentScanProgress = { current: count, total: 0, file: path, status: "discovering" };
          },
          onProgress: (current, total, file) => {
             if (scanCancelled) return;
             currentScanProgress = { current, total, file, status: "running" };
          }
        });

        if (scanCancelled) {
          currentScanProgress.status = "cancelled";
        } else if (audit.needsPassword) {
          currentScanProgress.status = "needs_password";
          currentScanProgress.passwordFile = audit.passwordFile;
        } else {
          currentScanProgress.status = "complete";
        }
      } catch (error) {
        console.error("Background Scan Error:", error);
        currentScanProgress.status = scanCancelled ? "cancelled" : "failed";
        currentScanProgress.error = error.message;
      }
    })();

    res.json({ success: true, message: "Scan started in background" });
  });

  app.post("/api/scan/cancel", (req, res) => {
    scanCancelled = true;
    currentScanProgress.status = "cancelled";
    res.json({ success: true, message: "Scan cancellation requested" });
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

  app.get("/api/select-directory", async (req, res) => {
    res.status(501).json({
      error: "Native folder selection is not enabled. Enter an approved local path manually.",
      managedRoots: await getManagedRoots()
    });
  });

  app.get("/api/browse-directory", async (req, res) => {
    try {
      const dirPath = req.query.path || "";
      const managedRoots = await getManagedRoots();
      
      let targetPath;
      if (!dirPath) {
        // Return managed roots list
        return res.json({
          currentPath: "",
          isRoot: true,
          entries: managedRoots.map(root => ({
            name: path.basename(root) || root,
            path: root.replaceAll("\\", "/"),
            isDirectory: true
          }))
        });
      } else {
        targetPath = await getSafePath(dirPath, managedRoots);
      }
      
      const fs = await import("node:fs/promises");
      const files = await fs.readdir(targetPath, { withFileTypes: true });
      const entries = files
        .filter(f => f.isDirectory() && !f.name.startsWith("."))
        .map(f => ({
          name: f.name,
          path: path.join(targetPath, f.name).replaceAll("\\", "/"),
          isDirectory: true
        }));
        
      res.json({
        currentPath: targetPath.replaceAll("\\", "/"),
        parentPath: path.dirname(targetPath).replaceAll("\\", "/"),
        isRoot: managedRoots.some(r => r.replaceAll("\\", "/").toLowerCase() === targetPath.replaceAll("\\", "/").toLowerCase()),
        entries
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/open-file", async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) return res.status(400).send("Path is required");
      const managedRoots = await getManagedRoots();
      const absolutePath = await getSafePath(filePath, managedRoots);
      const open = (await import("open")).default;
      await open(absolutePath);
      res.json({ success: true });
    } catch (error) {
      res.status(error.statusCode ?? 500).json({ error: error.message });
    }
  });

  app.get("/api/file", async (req, res) => {
    try {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).send("Path is required");
      }
      
      const managedRoots = await getManagedRoots();
      const absolutePath = await getSafePath(filePath, managedRoots);
      
      try {
        await access(absolutePath, constants.F_OK);
        res.sendFile(absolutePath);
      } catch {
        res.status(404).send("File not found");
      }
    } catch (error) {
      res.status(error.statusCode ?? 500).send(error.message);
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
      const { fileInfo, subjectPath } = req.body;
      const file = subjectPath ? catalog.getFileByPath(subjectPath) : null;
      const textSample = file?.extractedText ? file.extractedText.slice(0, 1000) : "No text available.";
      
      const fileRelativePath = file?.relativePath || subjectPath || fileInfo.currentName;

      const prompt = file?.extractedText && file.extractedText.length > 50
        ? `I have a file named "${fileInfo.currentName}" with category "${fileInfo.category}" and purpose "${fileInfo.purpose}".
It is located at: "${fileRelativePath}"
Here is a sample of its extracted text content:
---
${textSample}
---
Analyze the text, file name, and path to determine exactly what this file is (e.g. Bank Statement, Aadhaar Card, Offer Letter, etc.) and who it belongs to if applicable.
Propose a highly descriptive and structured file name. Use Spaces, Title Case, and clear descriptors (e.g., "Pratik Vaibhav - Aadhaar Card.pdf" or "HDFC Bank Statement - Jan 2024.pdf").
Do not include the extension in the proposed name unless you match the original one.
Return ONLY a raw JSON string like {"proposedName": "New Name.pdf", "reasoning": "why"}. No markdown.`
        : `I have a file named "${fileInfo.currentName}" with category "${fileInfo.category}" and purpose "${fileInfo.purpose}".
It is located at: "${fileRelativePath}"
Analyze the file name, extension, and parent folder path to determine exactly what this file is.
Propose a highly descriptive and structured file name. Use Spaces, Title Case, and clear descriptors.
Do not include the extension in the proposed name unless you match the original one.
Return ONLY a raw JSON string like {"proposedName": "New Name.pdf", "reasoning": "why"}. No markdown.`;

      const aiResponse = await askAI(prompt, "You are a highly intelligent file renaming assistant. You must analyze the text content and path context to extract the semantic meaning of the document and propose a human-readable, descriptive name.");
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
      const { evidence, proposedPath } = req.body || {};

      if (id === "all") {
        catalog.approveAllReviewItems();
      } else {
        if (evidence && proposedPath) {
           catalog.db.prepare("UPDATE review_items SET status = 'approved', approved = 1, updated_at = ?, evidence_json = ?, proposed_path = ? WHERE id = ?")
             .run(new Date().toISOString(), JSON.stringify(evidence), proposedPath, id);
        } else {
           catalog.approveReviewItem(id);
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/items/:id/reject", async (req, res) => {
    try {
      const { id } = req.params;
      catalog.db.prepare("UPDATE review_items SET status = 'rejected', approved = 0, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
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

  app.post("/api/rollback", async (req, res) => {
    try {
      const result = await rollbackAppliedReview({ catalog });
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
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`Nyx Dashboard running at http://localhost:${actualPort}`);
      resolve(server);
    });
  });
}

async function getManagedRoots() {
  const engagement = await loadEngagement("docs/engagement.md");
  return engagement.managedDirectories.map((root) => path.resolve(root));
}

function assertInsideManagedRoots(targetPath, managedRoots) {
  const insideManagedRoot = managedRoots.some((rootPath) => {
    const relativePath = path.relative(rootPath, targetPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  });

  if (!insideManagedRoot) {
    const error = new Error(`Path is outside approved managed directories: ${targetPath}`);
    error.statusCode = 403;
    throw error;
  }
}

async function getSafePath(filePath, managedRoots) {
  let resolvedPath = path.resolve(filePath);
  try {
    resolvedPath = await realpath(resolvedPath);
  } catch {
    // If file doesn't exist, realpath throws. We fallback to path.resolve.
  }
  
  assertInsideManagedRoots(resolvedPath, managedRoots);
  return resolvedPath;
}
