CREATE TABLE IF NOT EXISTS legacy_promotion_migrations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  token TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('completed-terminal-evidence', 'pending-reapproval-required')),
  authority_hash TEXT NOT NULL,
  invalidation_id TEXT,
  pending_temp_token TEXT,
  pending_journal_hash TEXT,
  pending_journal_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, release_id, token)
);

CREATE INDEX IF NOT EXISTS legacy_promotion_migrations_scope
  ON legacy_promotion_migrations(project_id, release_id, status);
