CREATE TABLE IF NOT EXISTS promotion_transactions (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  marker_hash TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'committed', 'rolled-back')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, release_id, token)
);

CREATE INDEX IF NOT EXISTS promotion_transactions_release
  ON promotion_transactions(project_id, release_id, status);
