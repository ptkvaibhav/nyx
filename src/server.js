import express from "express";
import path from "node:path";
import { Catalog } from "./core/catalog.js";
import { applyApprovedReview } from "./organization/executor.js";

const DEFAULT_DB_PATH = ".nyx/nyx.db";

export async function startServer({ port = 3000, dbPath = DEFAULT_DB_PATH } = {}) {
  const app = express();
  const catalog = await Catalog.open(dbPath);

  app.use(express.json());

  // API Routes
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
  const uiPath = path.resolve("ui/dist");
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
