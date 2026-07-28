import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const migrationsDirectory = resolve(dirname(new URL(import.meta.url).pathname), "migrations");

function timestamp(now) { return new Date(now()).toISOString(); }

export function openStateDatabase(file, { now = () => Date.now() } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);");
  const applied = new Set(database.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
  for (const name of readdirSync(migrationsDirectory).filter((fileName) => /^\d+-[a-z0-9-]+\.sql$/.test(fileName)).sort()) {
    const version = Number(name.slice(0, name.indexOf("-")));
    if (applied.has(version)) continue;
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(readFileSync(resolve(migrationsDirectory, name), "utf8"));
      database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(version, name, timestamp(now));
      database.exec("COMMIT;");
    } catch (error) { database.exec("ROLLBACK;"); database.close(); throw error; }
  }
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
