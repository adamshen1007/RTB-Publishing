CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fencing_tokens (
  project_id TEXT PRIMARY KEY,
  last_token INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mutation_leases (
  project_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  acquired_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES fencing_tokens(project_id)
);

CREATE TABLE IF NOT EXISTS lifecycle_state (
  project_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  guard TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mutation_journal (
  command_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  fencing_token INTEGER,
  command_hash TEXT NOT NULL,
  phase TEXT NOT NULL,
  operation_state TEXT NOT NULL,
  expected_snapshot_hash TEXT NOT NULL,
  expected_pointer_version INTEGER NOT NULL,
  prior_snapshot_hash TEXT,
  next_snapshot_hash TEXT,
  expected_lifecycle_version INTEGER NOT NULL,
  expected_lifecycle_guard TEXT NOT NULL,
  effects_json TEXT NOT NULL,
  result_json TEXT,
  incident TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mutation_journal_recovery
  ON mutation_journal(project_id, phase, created_at);

CREATE TABLE IF NOT EXISTS immutable_audit_references (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  journal_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, command_id)
);
