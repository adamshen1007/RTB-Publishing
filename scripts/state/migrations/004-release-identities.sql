CREATE TABLE IF NOT EXISTS release_identities (
  release_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  approval_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS release_identities_no_delete BEFORE DELETE ON release_identities BEGIN SELECT RAISE(ABORT, 'release identities are never reusable'); END;
