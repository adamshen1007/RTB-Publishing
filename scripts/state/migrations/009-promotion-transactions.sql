CREATE TABLE IF NOT EXISTS promotion_transactions (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  marker_hash TEXT,
  evidence_hash TEXT,
  phase TEXT,
  binding_state TEXT NOT NULL CHECK (binding_state IN ('active', 'binding_pending')),
  pending_marker_hash TEXT,
  pending_evidence_hash TEXT,
  pending_phase TEXT,
  pending_temp_token TEXT,
  pending_marker_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ledger_completed', 'committed', 'rolled-back')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, release_id, token)
);

CREATE INDEX IF NOT EXISTS promotion_transactions_release
  ON promotion_transactions(project_id, release_id, status);
