import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { validateRecord } from "../scripts/books/model.mjs";
import { discoverBookProject } from "../scripts/books/discovery.mjs";
import { MIGRATION_DIMENSIONS, assertMigrationPasses, discoverHistoricalBookProject, migrationReport, validateMigrationReport } from "../scripts/books/migrate-yc.mjs";
import { generateMigrationReviewEvidence } from "../scripts/books/migration-review.mjs";

const historical = () => discoverHistoricalBookProject({ commit: "2938d43", projectPath: "books/volume-01-yc-playbook" });
const current = () => discoverBookProject("books/volume-01-yc-playbook");

test("MIG-004 through MIG-010: independently pinned pre-migration authority passes the exact oracle", () => {
  const first = migrationReport(historical(), current()); const second = migrationReport(historical(), current());
  assert.deepEqual(first, second); assert.equal(first.status, "passed"); assert.deepEqual(first.dimensions.map((item) => item.dimension), MIGRATION_DIMENSIONS);
  assert.notDeepEqual(first.base_identity, first.migrated_identity); assert.match(first.base_identity.commit, /^[a-f0-9]{40}$/); assert.doesNotThrow(() => assertMigrationPasses(first));
});
test("MIG-008: reordering or incomplete dimension reports fail closed", () => {
  const report = migrationReport(historical(), current());
  report.dimensions = Array(15).fill(report.dimensions[0]);
  assert.throws(() => validateMigrationReport(report), /exactly once/);
  const changed = migrationReport(historical(), current()); changed.dimensions[0].classification = "blocking-difference"; changed.status = "blocked"; changed.blocking_differences = [changed.dimensions[0].dimension];
  assert.throws(() => assertMigrationPasses(changed), /blocked/);
});
test("sanitized pre/post fixture content preserves normalized semantics", () => {
  const before = readFileSync("tests/fixtures/migration/yc/pre-migration-sample.md", "utf8"); const after = readFileSync("tests/fixtures/migration/yc/post-migration-sample.md", "utf8");
  assert.equal(before.replace(/\s+/g, " ").trim(), after.replace(/\s+/g, " ").trim());
  const authority = JSON.parse(readFileSync("tests/fixtures/migration/yc/pre-migration-authority.json", "utf8")); assert.equal(authority.commit, "2938d43");
});
test("migration-report schema is closed and accepts the independently generated report", () => assert.equal(validateRecord("migration-report", migrationReport(historical(), current())).valid, true));
test("MIG-012: review evidence is hash-bound to the independent authority before any output write", () => {
  const output = mkdtempSync(resolve(tmpdir(), "rtb-review-evidence-")); rmSync(output, { recursive: true, force: true });
  try {
    assert.throws(() => generateMigrationReviewEvidence(current(), output), /independently discovered/); assert.equal(existsSync(output), false);
    const evidence = generateMigrationReviewEvidence(current(), output, { beforeProject: historical() });
    assert.equal(evidence.status, "awaiting-human-review"); assert.match(evidence.base_identity.commit, /^[a-f0-9]{40}$/); assert.ok(existsSync(resolve(output, "review-evidence.json")));
  } finally { rmSync(output, { recursive: true, force: true }); }
});
test("MIG-012: review CLI binds historical provenance before generating its record", () => {
  const output = mkdtempSync(resolve(tmpdir(), "rtb-review-cli-")); rmSync(output, { recursive: true, force: true });
  try {
    const text = execFileSync(process.execPath, ["scripts/books/migration-review.mjs", "--before-commit", "2938d43", "--before-project", "books/volume-01-yc-playbook", "--after", "books/volume-01-yc-playbook", "--output", output], { encoding: "utf8" });
    const evidence = JSON.parse(text); assert.match(evidence.base_identity.commit, /^[a-f0-9]{40}$/); assert.ok(existsSync(resolve(output, "review-evidence.json")));
  } finally { rmSync(output, { recursive: true, force: true }); }
});
