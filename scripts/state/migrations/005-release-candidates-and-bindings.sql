CREATE TABLE IF NOT EXISTS release_candidates (
  candidate_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lifecycle_version INTEGER NOT NULL,
  candidate_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lifecycle_material_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  bindings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, kind, id)
);
