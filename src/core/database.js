import Database from "better-sqlite3";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const DEFAULT_DB_PATH = ".nyx/nyx.db";

export async function initializeDatabase(dbPath = DEFAULT_DB_PATH) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");

  // Files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      absolute_path TEXT PRIMARY KEY,
      relative_path TEXT NOT NULL,
      root_path TEXT NOT NULL,
      base_name TEXT NOT NULL,
      extension TEXT,
      size_bytes INTEGER NOT NULL,
      modified_at TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      category TEXT,
      purpose TEXT,
      structure_status TEXT,
      move_recommended BOOLEAN,
      rename_recommended BOOLEAN,
      last_scanned_at TEXT NOT NULL,
      extracted_text TEXT,
      proposed_name TEXT,
      expected_folder TEXT,
      ai_reasoning TEXT
    )
  `);

  // Migrate existing databases to add the new columns if they do not exist
  try {
    db.exec("ALTER TABLE files ADD COLUMN extracted_text TEXT");
  } catch { /* ignore */ }
  try {
    db.exec("ALTER TABLE files ADD COLUMN proposed_name TEXT");
  } catch { /* ignore */ }
  try {
    db.exec("ALTER TABLE files ADD COLUMN expected_folder TEXT");
  } catch { /* ignore */ }
  try {
    db.exec("ALTER TABLE files ADD COLUMN ai_reasoning TEXT");
  } catch { /* ignore */ }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256)`);

  // Review Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      approved BOOLEAN DEFAULT 0,
      risk TEXT,
      subject_path TEXT,
      proposed_path TEXT,
      proposed_name TEXT,
      evidence_json TEXT,
      applied_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  return db;
}
