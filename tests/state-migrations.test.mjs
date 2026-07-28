import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import test from "node:test";
import { openStateDatabase } from "../scripts/state/database.mjs";

test("a migration-006 database preserves a legacy reserved identity while adding finalization reconciliation", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-migration-006-")), legacyMigrations = resolve(root, "migrations"), databaseFile = resolve(root, "state.sqlite");
  try {
    mkdirSync(legacyMigrations);
    for (const name of ["001-initial.sql", "002-lifecycle-workflow-ledger.sql", "003-workflow-fencing.sql", "004-release-identities.sql", "005-release-candidates-and-bindings.sql", "006-release-reviews.sql"]) copyFileSync(resolve("scripts/state/migrations", name), resolve(legacyMigrations, basename(name)));
    const legacy = openStateDatabase(databaseFile, { migrationsDirectory: legacyMigrations });
    legacy.prepare("INSERT INTO release_identities (release_id, project_id, candidate_hash, approval_id, status, created_at) VALUES (?, ?, ?, ?, 'reserved', ?)").run("REL-LEGACY", "book", "candidate", "approval", "2026-01-01T00:00:00.000Z"); legacy.close();
    const upgraded = openStateDatabase(databaseFile);
    try { assert.equal(upgraded.prepare("SELECT status FROM release_identities WHERE release_id = 'REL-LEGACY'").get().status, "reserved"); assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('release_finalizations') WHERE name = 'completed_while_current'").get().count, 1); }
    finally { upgraded.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
