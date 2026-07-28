import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { assertLegacyBookBuildCompatibility, validateLegacyBookProject } from "../scripts/books/compat.mjs";
import { canonicalJson, migrateFileDryRun, migrateRecord } from "../scripts/books/migrations.mjs";
import { canonicalBlueprintHash, canonicalLifecycleHash, discoverBookProjects, readStructuredFile, resolveSafeRelativePath, validateFile, validateRecord } from "../scripts/books/model.mjs";
import { parse, stringify } from "yaml";

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

test("SCH-003: two discoverable books keep distinct parts, chapters, locales, and outputs", () => {
  const root = resolve(FIXTURES, "discoverable");
  const projects = discoverBookProjects(root);
  assert.equal(projects.length, 2);
  const results = projects.map((file) => validateFile(file, { root: dirname(file) }));
  assert.ok(results.every((result) => result.valid), JSON.stringify(results.map((result) => result.diagnostics)));
  const [english, french] = results.map((result) => result.record);
  assert.notEqual(english.locale, french.locale);
  assert.notEqual(english.output_profiles.length, french.output_profiles.length);
  assert.match(readFileSync(resolve(root, "french/livre.md"), "utf8"), /décision concrète/);
  assert.equal(readStructuredFile(resolve(root, "french/blueprint.yaml"), { root: resolve(root, "french") }).record.parts.length, 2);
});

test("SCH-004: malformed, invalid IDs, missing, unsafe, undeclared, and future records provide repair guidance", () => {
  const invalid = validateFile(resolve(FIXTURES, "invalid-extra.yaml"), { root: FIXTURES, recordType: "book-project", checkPaths: false });
  const invalidId = validateFile(resolve(FIXTURES, "invalid-id.yaml"), { root: FIXTURES, recordType: "book-project", checkPaths: false });
  const missing = validateFile(resolve(FIXTURES, "missing-path.yaml"), { root: FIXTURES, recordType: "book-project" });
  const unsafe = validateFile(resolve(FIXTURES, "unsafe-path.yaml"), { root: FIXTURES, recordType: "book-project", checkPaths: false });
  const future = migrateFileDryRun(resolve(FIXTURES, "future-version.yaml"), { root: FIXTURES });
  for (const result of [invalid, invalidId, missing, unsafe]) {
    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.every((item) => item.problem && item.cause && item.repair));
  }
  assert.ok(future.diagnostics.every((item) => item.problem && item.cause && item.repair));
  assert.throws(() => readStructuredFile(resolve(FIXTURES, "malformed.yaml"), { root: FIXTURES }), /problem: malformed record; cause:[\s\S]*; repair:/);
  assert.ok(missing.diagnostics.some((item) => item.problem === "missing path"));
  assert.ok(unsafe.diagnostics.some((item) => /schema pattern/.test(item.problem)));
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
  const projectRoot = mkdtempSync(resolve(tmpdir(), "rtb-output-link-"));
  cpSync(oneChapter, projectRoot, { recursive: true });
  const projectFile = resolve(projectRoot, "book.project.yaml");
  const project = parse(readFileSync(projectFile, "utf8"));
  project.output_profiles[0].path = "output-link";
  writeFileSync(projectFile, stringify(project));
  symlinkSync(resolve(root, "safe.txt"), resolve(projectRoot, "output-link"));
  const validation = validateFile(projectFile, { root: projectRoot });
  assert.ok(validation.diagnostics.some((item) => item.field === "output-link" && item.problem === "unsafe path"));
});

test("SCH-006: forward migration is deterministic and idempotent", () => {
  const legacy = readStructuredFile(resolve(FIXTURES, "legacy-v0.yaml"), { root: FIXTURES }).record;
  const first = migrateRecord("book-project", legacy);
  const second = migrateRecord("book-project", first.output);
  assert.equal(first.report.status, "migrated", JSON.stringify(first.diagnostics));
  assert.equal(second.report.status, "unchanged", JSON.stringify(second.diagnostics));
  assert.equal(canonicalJson(first.output), canonicalJson(second.output));
  assert.equal(first.report.output_hash, second.report.input_hash);
  assert.equal(validateRecord("schema-migration", first.report).valid, true);
  assert.equal(validateRecord("schema-migration", second.report).valid, true);
  const blocked = migrateRecord("book-project", { ...legacy, schema_version: "99" });
  assert.equal(validateRecord("schema-migration", blocked.report).valid, true);
});

test("SCH-007: failed and interrupted dry-run migration preserves canonical bytes with recovery", () => {
  const file = resolve(FIXTURES, "legacy-v0.yaml");
  const before = readFileSync(file, "utf8");
  const result = migrateFileDryRun(file, { root: dirname(file), interruptAt: "before-apply" });
  assert.equal(readFileSync(file, "utf8"), before);
  assert.equal(result.canonical_source_unchanged, true);
  assert.equal(result.report.status, "blocked");
  assert.match(result.report.rollback_limit, /rerun/i);
  assert.ok(result.diagnostics.some((item) => item.problem === "migration interrupted"));
  assert.equal(validateRecord("schema-migration", result.report).valid, true);
});

test("SCH-008: the existing check command and build preflight use the compatibility adapter", () => {
  const result = validateLegacyBookProject(resolve("books/volume-01-yc-playbook"));
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  const output = execFileSync(process.execPath, ["scripts/check-book.mjs"], { encoding: "utf8" });
  assert.match(output, /Book contract: 23\/23/);
  assert.doesNotThrow(() => assertLegacyBookBuildCompatibility(resolve("books/volume-01-yc-playbook")));
});

test("cross-record references and child stable IDs fail closed", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-references-"));
  cpSync(oneChapter, root, { recursive: true });
  const blueprintFile = resolve(root, "blueprint.yaml");
  const blueprint = parse(readFileSync(blueprintFile, "utf8"));
  blueprint.project_id = "other-project";
  blueprint.content_hash = canonicalBlueprintHash(blueprint);
  writeFileSync(blueprintFile, stringify(blueprint));
  const referenceFailure = validateFile(resolve(root, "book.project.yaml"), { root });
  assert.ok(referenceFailure.diagnostics.some((item) => item.problem === "Blueprint ownership mismatch"));
  assert.ok(referenceFailure.diagnostics.some((item) => item.problem === "Blueprint hash mismatch"));
  const lifecycleRoot = mkdtempSync(resolve(tmpdir(), "rtb-lifecycle-"));
  cpSync(oneChapter, lifecycleRoot, { recursive: true });
  const lifecycleFile = resolve(lifecycleRoot, "lifecycle.yaml");
  const lifecycle = parse(readFileSync(lifecycleFile, "utf8"));
  lifecycle.project_id = "other-project";
  lifecycle.content_hash = canonicalLifecycleHash(lifecycle);
  writeFileSync(lifecycleFile, stringify(lifecycle));
  const lifecycleFailure = validateFile(resolve(lifecycleRoot, "book.project.yaml"), { root: lifecycleRoot });
  assert.ok(lifecycleFailure.diagnostics.some((item) => item.problem === "lifecycle ownership mismatch"));
  assert.ok(lifecycleFailure.diagnostics.some((item) => item.problem === "lifecycle hash mismatch"));
  const valid = readStructuredFile(resolve(oneChapter, "book.project.yaml"), { root: oneChapter }).record;
  valid.output_profiles.push({ ...valid.output_profiles[0], id: valid.output_profiles[0].id, path: "other/index.html" });
  valid.output_profiles.push({ ...valid.output_profiles[0], id: "another-output" });
  assert.ok(validateRecord("book-project", valid).diagnostics.some((item) => item.problem === "duplicate stable ID"));
  assert.ok(validateRecord("book-project", valid).diagnostics.some((item) => item.problem === "duplicate output path"));
  const validBlueprint = readStructuredFile(resolve(oneChapter, "blueprint.yaml"), { root: oneChapter }).record;
  validBlueprint.parts.push({ ...validBlueprint.parts[0], id: validBlueprint.parts[0].id, order: 2 });
  assert.ok(validateRecord("book-blueprint", validBlueprint).diagnostics.some((item) => item.problem === "duplicate stable ID"));
  validBlueprint.parts.push({ ...validBlueprint.parts[0], id: "another-part", order: validBlueprint.parts[0].order });
  assert.ok(validateRecord("book-blueprint", validBlueprint).diagnostics.some((item) => item.problem === "duplicate part order"));
});
