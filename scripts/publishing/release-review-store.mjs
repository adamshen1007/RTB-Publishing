import { resolve } from "node:path";
import { durableCheckpoint, openStateDatabase } from "../state/database.mjs";

export const RELEASE_REVIEW_KINDS = Object.freeze([
  "migration-visual-review",
  "pdf-screen-reader-visual-review",
  "rights-and-brand-review",
]);

const rowToRecord = (row) => row && ({
  schemaVersion: 1,
  id: row.id,
  projectId: row.project_id,
  kind: row.kind,
  decision: row.decision,
  candidateHash: row.candidate_hash,
  sourceFingerprint: row.source_fingerprint,
  artifactHashes: { html: row.html_sha256, pdf: row.pdf_sha256, epub: row.epub_sha256 },
  reviewer: { type: "human", id: row.reviewer_id, ...(row.qualified_role ? { qualifiedRole: row.qualified_role } : {}) },
  createdAt: row.created_at,
});

export class ReleaseReviewStore {
  constructor({ root, databaseFile } = {}) {
    if (!root && !databaseFile) throw new Error("A release review store requires a local state database.");
    this.databaseFile = databaseFile ?? resolve(root, ".rtb-state", "state.sqlite");
  }

  registeredCandidate(projectId, candidateHash) {
    const database = openStateDatabase(this.databaseFile);
    try {
      const row = database.prepare("SELECT candidate_json FROM release_candidates WHERE project_id = ? AND candidate_hash = ?").get(projectId, candidateHash);
      return row ? JSON.parse(row.candidate_json) : null;
    } finally { database.close(); }
  }

  currentCandidate(projectId) {
    const database = openStateDatabase(this.databaseFile);
    try {
      const row = database.prepare("SELECT candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId);
      return row ? JSON.parse(row.candidate_json) : null;
    } finally { database.close(); }
  }

  append(record) {
    const database = openStateDatabase(this.databaseFile);
    try {
      database.exec("BEGIN IMMEDIATE");
      const currentRow = database.prepare("SELECT candidate_hash, candidate_json FROM release_candidates WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(record.projectId);
      if (!currentRow || currentRow.candidate_hash !== record.candidateHash) throw new Error("Release review evidence is stale because the current registered candidate changed.");
      const candidate = JSON.parse(currentRow.candidate_json);
      const exact = candidate.sourceFingerprint === record.sourceFingerprint
        && ["html", "pdf", "epub"].every((format) => candidate.artifacts?.[format]?.sha256 === record.artifactHashes?.[format]);
      if (!exact) throw new Error("Release review evidence does not match the current registered candidate materials.");
      database.prepare(`INSERT INTO release_reviews (
        id, project_id, kind, decision, candidate_hash, source_fingerprint,
        html_sha256, pdf_sha256, epub_sha256, reviewer_id, qualified_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.projectId, record.kind, record.decision, record.candidateHash, record.sourceFingerprint,
          record.artifactHashes.html, record.artifactHashes.pdf, record.artifactHashes.epub,
          record.reviewer.id, record.reviewer.qualifiedRole ?? null, record.createdAt);
      database.exec("COMMIT");
      durableCheckpoint(database);
      return record;
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    } finally { database.close(); }
  }

  latestForCandidate(projectId, candidateHash) {
    const database = openStateDatabase(this.databaseFile);
    try {
      const rows = database.prepare(`SELECT * FROM release_reviews
        WHERE project_id = ? AND candidate_hash = ?
        ORDER BY created_at DESC, rowid DESC`).all(projectId, candidateHash);
      const latest = new Map();
      for (const row of rows) if (!latest.has(row.kind)) latest.set(row.kind, rowToRecord(row));
      return Object.fromEntries(latest);
    } finally { database.close(); }
  }
}
