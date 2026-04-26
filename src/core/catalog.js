import { initializeDatabase } from "./database.js";

export class Catalog {
  constructor(db) {
    this.db = db;
  }

  static async open(dbPath) {
    const db = await initializeDatabase(dbPath);
    return new Catalog(db);
  }

  upsertFile(file) {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        absolute_path, relative_path, root_path, base_name, extension,
        size_bytes, modified_at, sha256, category, purpose,
        structure_status, move_recommended, rename_recommended, last_scanned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(absolute_path) DO UPDATE SET
        relative_path=excluded.relative_path,
        root_path=excluded.root_path,
        base_name=excluded.base_name,
        extension=excluded.extension,
        size_bytes=excluded.size_bytes,
        modified_at=excluded.modified_at,
        sha256=excluded.sha256,
        category=excluded.category,
        purpose=excluded.purpose,
        structure_status=excluded.structure_status,
        move_recommended=excluded.move_recommended,
        rename_recommended=excluded.rename_recommended,
        last_scanned_at=excluded.last_scanned_at
    `);

    stmt.run(
      file.absolutePath,
      file.relativePath,
      file.rootPath,
      file.baseName,
      file.extension,
      file.sizeBytes,
      file.modifiedAt,
      file.sha256,
      file.classification?.category,
      file.structure?.purpose,
      file.structure?.status,
      file.structure?.moveRecommended ? 1 : 0,
      file.structure?.renameRecommended ? 1 : 0,
      new Date().toISOString()
    );
  }

  upsertFiles(files) {
    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        this.upsertFile(item);
      }
    });
    transaction(files);
  }

  getAllFiles() {
    return this.db.prepare("SELECT * FROM files").all().map(mapDbFileToProfile);
  }

  getFilesBySha256(sha256) {
    return this.db.prepare("SELECT * FROM files WHERE sha256 = ?").all(sha256).map(mapDbFileToProfile);
  }

  clearStaleFiles(scannedPaths) {
    if (scannedPaths.length === 0) return;
    const placeholders = scannedPaths.map(() => "?").join(",");
    this.db.prepare(`DELETE FROM files WHERE absolute_path NOT IN (${placeholders})`).run(...scannedPaths);
  }

  upsertReviewItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO review_items (
        id, type, action, status, approved, risk,
        subject_path, proposed_path, proposed_name, evidence_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        approved=excluded.approved,
        proposed_path=excluded.proposed_path,
        proposed_name=excluded.proposed_name,
        evidence_json=excluded.evidence_json,
        updated_at=excluded.updated_at
    `);

    const now = new Date().toISOString();
    stmt.run(
      item.id,
      item.type,
      item.action,
      item.status,
      item.approved ? 1 : 0,
      item.risk,
      item.subjectPath,
      item.proposedPath,
      item.proposedName,
      JSON.stringify(item.evidence ?? {}),
      item.createdAt ?? now,
      now
    );
  }

  upsertReviewItems(items) {
    const transaction = this.db.transaction((list) => {
      for (const item of list) {
        this.upsertReviewItem(item);
      }
    });
    transaction(items);
  }

  getPendingReviewItems() {
    return this.db.prepare("SELECT * FROM review_items WHERE status != 'applied'").all().map(mapDbToReviewItem);
  }

  approveAllReviewItems() {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE review_items
      SET status = 'approved', approved = 1, updated_at = ?
      WHERE status = 'pending_user_approval'
    `).run(now);
  }

  approveReviewItem(id) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE review_items
      SET status = 'approved', approved = 1, updated_at = ?
      WHERE id = ?
    `).run(now, id);
  }

  markReviewItemApplied(id, result) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE review_items
      SET status = 'applied', updated_at = ?, applied_at = ?, evidence_json = ?
      WHERE id = ?
    `).run(now, now, JSON.stringify(result), id);
  }
}

function mapDbFileToProfile(row) {
  return {
    absolutePath: row.absolute_path,
    relativePath: row.relative_path,
    rootPath: row.root_path,
    baseName: row.base_name,
    extension: row.extension,
    sizeBytes: row.size_bytes,
    modifiedAt: row.modified_at,
    sha256: row.sha256,
    classification: { category: row.category },
    structure: {
      purpose: row.purpose,
      status: row.structure_status,
      moveRecommended: row.move_recommended === 1,
      renameRecommended: row.rename_recommended === 1
    }
  };
}

function mapDbToReviewItem(row) {
  return {
    id: row.id,
    type: row.type,
    action: row.action,
    status: row.status,
    approved: row.approved === 1,
    risk: row.risk,
    subjectPath: row.subject_path,
    proposedPath: row.proposed_path,
    proposedName: row.proposed_name,
    evidence: JSON.parse(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliedAt: row.applied_at
  };
}
