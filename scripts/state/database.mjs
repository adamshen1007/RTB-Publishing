import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const migrationsDirectory = resolve(dirname(new URL(import.meta.url).pathname), "migrations");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const ACTIVE_PROMOTION_PHASES = new Set(["prepared", "backup-intent", "backup-complete", "activate-intent", "activate-complete", "material-verified", "rollback-quarantine-intent", "rollback-quarantine-complete", "rollback-restore-intent", "rollback-restore-complete", "rollback-cleanup-intent"]);

function exactTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function validateDraftV9PromotionRows(database) {
  for (const row of database.prepare("SELECT * FROM promotion_transactions ORDER BY token").all()) {
    const hashes = row.marker_hash === null && row.evidence_hash === null || HASH.test(row.marker_hash ?? "") && HASH.test(row.evidence_hash ?? ""), lifecycle = row.status === "active" && ACTIVE_PROMOTION_PHASES.has(row.phase) && HASH.test(row.marker_hash ?? "") && HASH.test(row.evidence_hash ?? "") || row.status === "committed" && row.phase === "commit-cleanup-complete" || row.status === "rolled-back" && row.phase === "rollback-cleanup-complete";
    if (!UUID.test(row.token) || !SAFE_ID.test(row.project_id) || !SAFE_ID.test(row.release_id) || !HASH.test(row.candidate_hash) || !HASH.test(row.manifest_hash) || !hashes || !lifecycle || !exactTimestamp(row.created_at) || !exactTimestamp(row.updated_at) || Date.parse(row.updated_at) < Date.parse(row.created_at)) throw new Error(`Malformed draft-v9 promotion row: ${row.token ?? "<missing-token>"}.`);
  }
}

function timestamp(now) { return new Date(now()).toISOString(); }

function reconcilePromotionTransactionSchema(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'promotion_transactions'").get();
  if (!table || table.sql.includes("binding_state") && table.sql.includes("ledger_completed")) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    validateDraftV9PromotionRows(database);
    database.exec(`
      ALTER TABLE promotion_transactions RENAME TO promotion_transactions_legacy009;
      CREATE TABLE promotion_transactions (
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
      INSERT INTO promotion_transactions (token, project_id, release_id, candidate_hash, manifest_hash, marker_hash, evidence_hash, phase, binding_state, status, created_at, updated_at)
      SELECT token, project_id, release_id, candidate_hash, manifest_hash, marker_hash, evidence_hash, phase, 'active', status, created_at, updated_at
      FROM promotion_transactions_legacy009;
      DROP TABLE promotion_transactions_legacy009;
      CREATE INDEX promotion_transactions_release ON promotion_transactions(project_id, release_id, status);
    `);
    database.exec("COMMIT; PRAGMA wal_checkpoint(FULL);");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw new Error("Legacy draft-v9 promotion rows could not be migrated safely; correct the malformed legacy row before retrying.", { cause: error });
  }
}

export function migrationFiles(directory = migrationsDirectory) {
  return readdirSync(directory)
    .filter((fileName) => /^\d+-[a-z0-9-]+\.sql$/.test(fileName))
    .sort((left, right) => Number(left.slice(0, left.indexOf("-"))) - Number(right.slice(0, right.indexOf("-"))) || left.localeCompare(right));
}

export function openStateDatabase(file, { now = () => Date.now(), migrationsDirectory: migrationDirectory = migrationsDirectory } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);");
  const applied = new Set(database.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
  for (const name of migrationFiles(migrationDirectory)) {
    const version = Number(name.slice(0, name.indexOf("-")));
    if (applied.has(version)) continue;
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(readFileSync(resolve(migrationDirectory, name), "utf8"));
      database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(version, name, timestamp(now));
      database.exec("COMMIT;");
    } catch (error) { database.exec("ROLLBACK;"); database.close(); throw error; }
  }
  reconcilePromotionTransactionSchema(database);
  return database;
}

export function databaseExists(file) { return existsSync(file); }

export function initializeLifecycle(database, projectId, { version = 0, guard = "ready", status = "queued", now = () => Date.now() } = {}) {
  database.prepare("INSERT OR IGNORE INTO lifecycle_state (project_id, version, guard, status, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(projectId, version, guard, status, timestamp(now));
  return database.prepare("SELECT project_id AS projectId, version, guard, status, updated_at AS updatedAt FROM lifecycle_state WHERE project_id = ?").get(projectId);
}

export function lifecycle(database, projectId) {
  return database.prepare("SELECT project_id AS projectId, version, guard, status, updated_at AS updatedAt FROM lifecycle_state WHERE project_id = ?").get(projectId);
}

export function acquireLease(database, { projectId, ownerId, operationId, now = () => Date.now() }) {
  database.exec("BEGIN IMMEDIATE;");
  try {
    if (database.prepare("SELECT 1 FROM mutation_leases WHERE project_id = ?").get(projectId)) throw new Error("A durable mutation lease is still active; recovery is required.");
    const token = (database.prepare("SELECT last_token FROM fencing_tokens WHERE project_id = ?").get(projectId)?.last_token ?? 0) + 1;
    database.prepare("INSERT INTO fencing_tokens (project_id, last_token) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET last_token = excluded.last_token").run(projectId, token);
    database.prepare("INSERT INTO mutation_leases (project_id, owner_id, operation_id, fencing_token, acquired_at) VALUES (?, ?, ?, ?, ?)").run(projectId, ownerId, operationId, token, timestamp(now));
    database.exec("COMMIT;");
    return token;
  } catch (error) { database.exec("ROLLBACK;"); throw error; }
}

export function releaseLease(database, { projectId, ownerId, fencingToken }) {
  const result = database.prepare("DELETE FROM mutation_leases WHERE project_id = ? AND owner_id = ? AND fencing_token = ?").run(projectId, ownerId, fencingToken);
  if (result.changes !== 1) throw new Error("Mutation lease fence mismatch while releasing lease.");
}

/** Only recovery, while holding the OS lock, may fence an abandoned lease. */
export function fenceAbandonedLease(database, projectId) {
  database.prepare("DELETE FROM mutation_leases WHERE project_id = ?").run(projectId);
}

export function durableCheckpoint(database) {
  database.exec("PRAGMA wal_checkpoint(FULL);");
}
