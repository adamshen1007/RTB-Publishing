import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverBookProject, discoverBooks, resolveProjectRoot } from "../scripts/books/discovery.mjs";
import { initializeSnapshots } from "../scripts/state/snapshots.mjs";
import { buildProject, outputDispatch } from "../scripts/build-book.mjs";

test("MIG-001/MIG-003: generic discovery finds versioned projects of different shapes", () => {
  const projects = discoverBooks(resolve("tests/fixtures/books/discoverable"));
  assert.deepEqual(projects.map((project) => project.id), ["english-field-guide", "guide-francais"]);
  assert.notEqual(projects[0].chapters.length, projects[1].chapters.length);
  assert.notEqual(projects[0].parts.length, projects[1].parts.length);
});

test("MIG-003: profile dispatch is data-driven for one, 23, and French PDF/EPUB projects", () => {
  const one = discoverBookProject("tests/fixtures/books/one-chapter", { workspaceRoot: "tests/fixtures/books/one-chapter" });
  const yc = discoverBookProject("books/volume-01-yc-playbook");
  const french = discoverBookProject("tests/fixtures/books/discoverable/french", { workspaceRoot: "tests/fixtures/books/discoverable/french" });
  assert.equal(one.chapters.length, 1); assert.equal(yc.chapters.length, 23); assert.ok(outputDispatch(french).every((profile) => ["epub", "pdf"].includes(profile.format)));
});

test("MIG-003: supported one-chapter build runs and unsupported PDF profile leaves no output", () => {
  const output = mkdtempSync(resolve(tmpdir(), "rtb-book-build-"));
  try {
    const one = discoverBookProject("tests/fixtures/books/one-chapter", { workspaceRoot: "tests/fixtures/books/one-chapter" });
    const result = buildProject(one, { buildRoot: resolve(output, "build"), outputRoot: resolve(output, "dist") });
    assert.ok(existsSync(result.outputs[0].file));
    const french = discoverBookProject("tests/fixtures/books/discoverable/french", { workspaceRoot: "tests/fixtures/books/discoverable/french" });
    assert.throws(() => buildProject(french, { buildRoot: resolve(output, "build"), outputRoot: resolve(output, "dist") }), /no generic PDF renderer capability/);
    assert.equal(existsSync(resolve(output, "dist", french.id)), false);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("MIG-002: a project cannot resolve outside its safe root", () => {
  assert.throws(() => discoverBookProject("tests/fixtures/books/does-not-exist"), /does not exist/);
  const root = resolveProjectRoot("books/volume-01-yc-playbook");
  assert.equal(root.authority, "legacy-working-tree");
});

test("MIG-002: empty, duplicate, and cyclic/symlink workspaces fail safely", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-discovery-negative-"));
  try {
    assert.deepEqual(discoverBooks(root), []);
    cpSync("tests/fixtures/books/one-chapter", resolve(root, "one"), { recursive: true });
    cpSync("tests/fixtures/books/one-chapter", resolve(root, "two"), { recursive: true });
    assert.throws(() => discoverBooks(root), /Duplicate Book Project ID/);
    rmSync(resolve(root, "two"), { recursive: true, force: true });
    symlinkSync(root, resolve(root, "one", "cycle"));
    assert.equal(discoverBooks(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("MIG-002: inaccessible directories fail with confined repair guidance when permissions are enforceable", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-discovery-eacces-")); const denied = resolve(root, "denied");
  mkdirSync(denied);
  try {
    chmodSync(denied, 0o000);
    let failure;
    try { discoverBooks(root); } catch (error) { failure = error; }
    if (!failure) return t.skip("platform or effective user can read chmod(000) directories; EACCES is not enforceable here");
    assert.match(failure.message, /^problem: inaccessible directory; cause: EACCES; repair:/);
    assert.doesNotMatch(failure.message, /\.\.(?:\/|$)/);
  } finally { chmodSync(denied, 0o700); rmSync(root, { recursive: true, force: true }); }
});

test("MIG-002: discovery pins the current immutable root instead of mixing legacy files", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-discovery-snapshot-"));
  cpSync("tests/fixtures/books/one-chapter", root, { recursive: true });
  try {
    initializeSnapshots(root);
    const before = discoverBookProject(root, { workspaceRoot: root });
    writeFileSync(resolve(root, "chapters/start.md"), "# Changed legacy bytes\n");
    const after = discoverBookProject(root, { workspaceRoot: root });
    assert.equal(before.authority, "rtb-content-current");
    assert.equal(after.authority, "rtb-content-current");
    assert.equal(readFileSync(after.chapters[0].sourcePath, "utf8"), readFileSync(before.chapters[0].sourcePath, "utf8"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
