import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { validateLegacyBookProject } from "../scripts/books/compat.mjs";
import { canonicalJson, migrateFileDryRun, migrateRecord } from "../scripts/books/migrations.mjs";
import { readStructuredFile, resolveSafeRelativePath, validateFile, validateRecord } from "../scripts/books/model.mjs";

const FIXTURES = resolve("tests/fixtures/books");
const oneChapter = resolve(FIXTURES, "one-chapter");

test("SCH-001: minimal one-chapter Book Project validates without YC defaults", () => {
  const project = validateFile(resolve(oneChapter, "book.project.yaml"), { root: oneChapter, recordType: "book-project" });
  const blueprint = validateFile(resolve(oneChapter, "blueprint.yaml"), { root: oneChapter, recordType: "book-blueprint", checkPaths: true });
  assert.equal(project.valid, true, JSON.stringify(project.diagnostics));
  assert.equal(blueprint.valid, true, JSON.stringify(blueprint.diagnostics));
});

test("SCH-002: the 23-chapter YC project preserves stable chapter IDs", () => {
  const bookDirectory = resolve("books/volume-01-yc-playbook");
  const project = validateFile(resolve(bookDirectory, "book.project.yaml"), { root: bookDirectory });
  const blueprint = validateFile(resolve(bookDirectory, "blueprint.yaml"), { root: bookDirectory });
  assert.equal(project.valid, true, JSON.stringify(project.diagnostics));
  assert.equal(blueprint.valid, true, JSON.stringify(blueprint.diagnostics));
  assert.equal(blueprint.record.chapter_contracts.length, 23);
  assert.equal(new Set(blueprint.record.chapter_contracts.map((chapter) => chapter.id)).size, 23);
});

test("SCH-003: project contracts stay data-driven across locales and output shapes", () => {
  const record = readStructuredFile(resolve(FIXTURES, "multiple-locales/book-fr.yaml"), { root: resolve(FIXTURES, "multiple-locales") }).record;
  const validation = validateRecord("book-project", record);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  assert.equal(record.locale, "fr-FR");
  assert.deepEqual(record.output_profiles.map((profile) => profile.format), ["epub", "pdf"]);
});

test("SCH-004: malformed, undeclared, and future records provide deterministic repair guidance", () => {
  const invalid = validateFile(resolve(FIXTURES, "invalid-extra.yaml"), { root: FIXTURES, recordType: "book-project", checkPaths: false });
  const future = migrateFileDryRun(resolve(FIXTURES, "future-version.yaml"), { root: FIXTURES });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.every((item) => item.problem && item.cause && item.repair));
  assert.equal(future.report.status, "blocked");
  assert.match(future.diagnostics[0].problem, /unsupported schema version/);
  assert.ok(future.diagnostics[0].repair.length > 0);
});

test("SCH-005: traversal, absolute, escaped, and symlink paths fail before target access", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-paths-"));
  writeFileSync(resolve(root, "safe.txt"), "safe");
  symlinkSync(resolve(root, "safe.txt"), resolve(root, "linked.txt"));
  for (const unsafe of ["../outside", "/tmp/outside", "nested/../../outside", "linked.txt"]) {
    assert.throws(() => resolveSafeRelativePath(root, unsafe, { mustExist: true }), /problem: unsafe path/);
  }
});

test("SCH-006: forward migration is deterministic and idempotent", () => {
  const legacy = readStructuredFile(resolve(FIXTURES, "legacy-v0.yaml"), { root: FIXTURES }).record;
  const first = migrateRecord("book-project", legacy);
  const second = migrateRecord("book-project", first.output);
  assert.equal(first.report.status, "migrated", JSON.stringify(first.diagnostics));
  assert.equal(second.report.status, "unchanged", JSON.stringify(second.diagnostics));
  assert.equal(canonicalJson(first.output), canonicalJson(second.output));
  assert.equal(first.report.output_hash, second.report.input_hash);
});

test("SCH-007: dry-run migration never changes canonical source and states rollback limit", () => {
  const file = resolve(FIXTURES, "legacy-v0.yaml");
  const before = readFileSync(file, "utf8");
  const result = migrateFileDryRun(file, { root: dirname(file) });
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(result.canonical_source_unchanged, true);
  assert.match(result.report.rollback_limit, /no canonical write/i);
  assert.equal(validateRecord("schema-migration", result.report).valid, true);
});

test("SCH-008: compatibility adapter leaves the existing YC command contract available", () => {
  const result = validateLegacyBookProject(resolve("books/volume-01-yc-playbook"));
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
});
