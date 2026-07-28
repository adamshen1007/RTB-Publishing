import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { openStateDatabase } from "../scripts/state/database.mjs";

function seedDraftV9(file, rows) {
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE promotion_transactions (
      token TEXT PRIMARY KEY, project_id TEXT NOT NULL, release_id TEXT NOT NULL,
      candidate_hash TEXT NOT NULL, manifest_hash TEXT NOT NULL, marker_hash TEXT,
      evidence_hash TEXT, phase TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, UNIQUE(project_id, release_id, token)
    );
  `);
  const insert = database.prepare("INSERT INTO promotion_transactions (token, project_id, release_id, candidate_hash, manifest_hash, marker_hash, evidence_hash, phase, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const row of rows) insert.run(...row);
  database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (9, '009-promotion-transactions.sql', ?)").run("2026-01-01T00:00:00.000Z");
  database.close();
}

test("a migration-006 database preserves a legacy reserved identity while adding finalization reconciliation", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-migration-006-")), legacyMigrations = resolve(root, "migrations"), databaseFile = resolve(root, "state.sqlite");
  try {
    mkdirSync(legacyMigrations);
    for (const name of ["001-initial.sql", "002-lifecycle-workflow-ledger.sql", "003-workflow-fencing.sql", "004-release-identities.sql", "005-release-candidates-and-bindings.sql", "006-release-reviews.sql"]) copyFileSync(resolve("scripts/state/migrations", name), resolve(legacyMigrations, basename(name)));
    const legacy = openStateDatabase(databaseFile, { migrationsDirectory: legacyMigrations });
    legacy.prepare("INSERT INTO release_identities (release_id, project_id, candidate_hash, approval_id, status, created_at) VALUES (?, ?, ?, ?, 'reserved', ?)").run("REL-LEGACY", "book", "candidate", "approval", "2026-01-01T00:00:00.000Z"); legacy.close();
    const upgraded = openStateDatabase(databaseFile);
    try { assert.equal(upgraded.prepare("SELECT status FROM release_identities WHERE release_id = 'REL-LEGACY'").get().status, "reserved"); assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('release_finalizations') WHERE name = 'completed_while_current'").get().count, 1); for (const column of ["evidence_hash", "binding_state", "pending_marker_hash", "pending_evidence_hash", "pending_phase", "pending_temp_token", "pending_marker_json"]) assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('promotion_transactions') WHERE name = ?").get(column).count, 1); }
    finally { upgraded.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("draft-v9 promotion rows are preserved exactly while adding durable binding fields", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-draft-v9-preserve-")), legacyMigrations = resolve(root, "migrations"), databaseFile = resolve(root, "state.sqlite"), rows = [
    ["token-active", "book-a", "REL-A", "candidate-a", "manifest-a", "marker-a", "evidence-a", "prepared", "active", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"],
    ["token-committed", "book-b", "REL-B", "candidate-b", "manifest-b", null, null, "commit-cleanup-complete", "committed", "2026-02-01T00:00:00.000Z", "2026-02-02T00:00:00.000Z"],
    ["token-rolled", "book-c", "REL-C", "candidate-c", "manifest-c", "marker-c", "evidence-c", "rollback-cleanup-complete", "rolled-back", "2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z"],
  ];
  try {
    mkdirSync(legacyMigrations);
    for (const name of ["001-initial.sql", "002-lifecycle-workflow-ledger.sql", "003-workflow-fencing.sql", "004-release-identities.sql", "005-release-candidates-and-bindings.sql", "006-release-reviews.sql", "007-release-finalizations.sql", "008-finalization-approval-facts.sql"]) copyFileSync(resolve("scripts/state/migrations", name), resolve(legacyMigrations, basename(name)));
    openStateDatabase(databaseFile, { migrationsDirectory: legacyMigrations }).close(); seedDraftV9(databaseFile, rows);
    const upgraded = openStateDatabase(databaseFile);
    try {
      const actual = upgraded.prepare("SELECT token, project_id, release_id, candidate_hash, manifest_hash, marker_hash, evidence_hash, phase, status, created_at, updated_at, binding_state, pending_marker_hash, pending_evidence_hash, pending_phase, pending_temp_token, pending_marker_json FROM promotion_transactions ORDER BY token").all();
      assert.equal(actual.length, rows.length);
      for (const row of actual) {
        const expected = rows.find((candidate) => candidate[0] === row.token);
        assert.deepEqual([row.token, row.project_id, row.release_id, row.candidate_hash, row.manifest_hash, row.marker_hash, row.evidence_hash, row.phase, row.status, row.created_at, row.updated_at], expected);
        assert.equal(row.binding_state, "active");
        for (const field of ["pending_marker_hash", "pending_evidence_hash", "pending_phase", "pending_temp_token", "pending_marker_json"]) assert.equal(row[field], null);
      }
    } finally { upgraded.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed draft-v9 promotion rows fail actionably and leave the legacy table intact", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-draft-v9-malformed-")), legacyMigrations = resolve(root, "migrations"), databaseFile = resolve(root, "state.sqlite"), malformed = ["token-bad", "book", "REL", "candidate", "manifest", "marker", "evidence", "prepared", "unknown-status", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"];
  try {
    mkdirSync(legacyMigrations);
    for (const name of ["001-initial.sql", "002-lifecycle-workflow-ledger.sql", "003-workflow-fencing.sql", "004-release-identities.sql", "005-release-candidates-and-bindings.sql", "006-release-reviews.sql", "007-release-finalizations.sql", "008-finalization-approval-facts.sql"]) copyFileSync(resolve("scripts/state/migrations", name), resolve(legacyMigrations, basename(name)));
    openStateDatabase(databaseFile, { migrationsDirectory: legacyMigrations }).close(); seedDraftV9(databaseFile, [malformed]);
    assert.throws(() => openStateDatabase(databaseFile), /Legacy draft-v9 promotion rows could not be migrated safely/);
    const preserved = new DatabaseSync(databaseFile);
    try { const row = preserved.prepare("SELECT token, status FROM promotion_transactions").get(); assert.equal(row.token, "token-bad"); assert.equal(row.status, "unknown-status"); assert.equal(preserved.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'promotion_transactions_legacy009'").get().count, 0); }
    finally { preserved.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
