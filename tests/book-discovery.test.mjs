import assert from "node:assert/strict";
import test from "node:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverBookProject, discoverBooks, resolveProjectRoot } from "../scripts/books/discovery.mjs";
import { initializeSnapshots } from "../scripts/state/snapshots.mjs";

test("MIG-001/MIG-003: generic discovery finds versioned projects of different shapes", () => {
  const projects = discoverBooks(resolve("tests/fixtures/books/discoverable"));
  assert.deepEqual(projects.map((project) => project.id), ["english-field-guide", "guide-francais"]);
  assert.notEqual(projects[0].chapters.length, projects[1].chapters.length);
  assert.notEqual(projects[0].parts.length, projects[1].parts.length);
});

test("MIG-002: a project cannot resolve outside its safe root", () => {
  assert.throws(() => discoverBookProject("tests/fixtures/books/does-not-exist"), /does not exist/);
  const root = resolveProjectRoot("books/volume-01-yc-playbook");
  assert.equal(root.authority, "legacy-working-tree");
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
