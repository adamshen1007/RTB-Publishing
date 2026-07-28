import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { validateRecord } from "../scripts/books/model.mjs";
import { generateMigrationReviewEvidence } from "../scripts/books/migration-review.mjs";
import { discoverBookProject } from "../scripts/books/discovery.mjs";
import { MIGRATION_DIMENSIONS, assertMigrationPasses, migrationReport } from "../scripts/books/migrate-yc.mjs";

const yc = () => discoverBookProject("books/volume-01-yc-playbook");

test("MIG-004 through MIG-010: YC semantic oracle is complete and deterministic", () => {
  const first = migrationReport(yc(), yc());
  const second = migrationReport(yc(), yc());
  assert.deepEqual(first, second);
  assert.equal(first.status, "passed");
  assert.deepEqual(first.dimensions.map((item) => item.dimension), MIGRATION_DIMENSIONS);
  assert.doesNotThrow(() => assertMigrationPasses(first));
});

test("MIG-008: a semantic change fails closed", () => {
  const before = yc(); const after = yc();
  after.chapters = after.chapters.slice(1);
  const report = migrationReport(before, after);
  assert.equal(report.status, "blocked");
  assert.throws(() => assertMigrationPasses(report), /Semantic migration is blocked/);
});

test("MIG-012: deterministic preview evidence remains awaiting human review", () => {
  const output = resolve("build/test-migration-review");
  const evidence = generateMigrationReviewEvidence(yc(), output);
  assert.equal(evidence.status, "awaiting-human-review");
  assert.equal(evidence.machine_oracle_status, "passed");
  assert.ok(evidence.pages.length >= 2);
});

test("sanitized migration fixture satisfies the versioned schema", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/migration/yc/passed-report.json", "utf8"));
  assert.equal(validateRecord("migration-report", fixture).valid, true);
});
