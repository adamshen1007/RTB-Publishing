CREATE TABLE IF NOT EXISTS release_finalizations (
  release_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  approval_id TEXT NOT NULL UNIQUE,
  manifest_hash TEXT NOT NULL UNIQUE,
  manifest_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
