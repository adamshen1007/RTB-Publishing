import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverBookProject, discoverBooks, resolveProjectRoot } from "../scripts/books/discovery.mjs";
import { initializeSnapshots, materializeSnapshot, pointerPath, readPointer, snapshotRoot, writePointer } from "../scripts/state/snapshots.mjs";
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
    const oneRoot = resolve(output, "one"), frenchRoot = resolve(output, "french"); cpSync("tests/fixtures/books/one-chapter", oneRoot, { recursive: true }); cpSync("tests/fixtures/books/discoverable/french", frenchRoot, { recursive: true });
    const one = discoverBookProject(oneRoot, { workspaceRoot: oneRoot });
    const result = buildProject(one, { buildRoot: resolve(output, "build"), outputRoot: resolve(output, "dist") });
    assert.ok(existsSync(result.outputs[0].file));
    const french = discoverBookProject(frenchRoot, { workspaceRoot: frenchRoot });
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
    assert.throws(() => discoverBooks(root), /symbolic link/);
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

test("generic build rejects symbolic output roots without touching their targets", () => {
  for (const kind of ["build", "dist"]) {
    const root = mkdtempSync(resolve(tmpdir(), `rtb-generic-${kind}-`)), external = mkdtempSync(resolve(tmpdir(), `rtb-generic-external-${kind}-`));
    try {
      cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); writeFileSync(resolve(external, "sentinel"), "untouched");
      const project = discoverBookProject(root, { workspaceRoot: root }), buildRoot = resolve(root, "build"), outputRoot = resolve(root, "dist");
      symlinkSync(external, kind === "build" ? buildRoot : outputRoot);
      assert.throws(() => buildProject(project, { buildRoot, outputRoot, workspaceRoot: root }), /symbolic link|real directory/);
      assert.equal(readFileSync(resolve(external, "sentinel"), "utf8"), "untouched"); assert.deepEqual(new Set(["sentinel"]), new Set(readdirSync(external)));
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
  }
});

test("generic build rejects stale pointers and hard-linked canonical inputs", () => {
  const make = (label) => { const root = mkdtempSync(resolve(tmpdir(), `rtb-generic-${label}-`)); cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); initializeSnapshots(root); return root; };
  let root = make("stale");
  try {
    const stale = discoverBookProject(root, { workspaceRoot: root }), prior = readPointer(root), next = materializeSnapshot(root, { sourceRoot: snapshotRoot(root, prior.snapshotHash) }); writePointer(root, { expected: prior, nextSnapshotHash: next.hash, nextVersion: prior.version + 1 });
    assert.throws(() => buildProject(stale, { buildRoot: resolve(root, "build"), outputRoot: resolve(root, "dist"), workspaceRoot: root }), /stale/);
    const fresh = discoverBookProject(root, { workspaceRoot: root }), result = buildProject(fresh, { buildRoot: resolve(root, "build"), outputRoot: resolve(root, "dist"), workspaceRoot: root }); assert.ok(existsSync(result.outputs[0].file));
  } finally { rmSync(root, { recursive: true, force: true }); }
  root = make("pointer-link");
  try {
    const pointer = pointerPath(root), outside = resolve(root, "pointer-copy"); writeFileSync(outside, readFileSync(pointer)); unlinkSync(pointer); linkSync(outside, pointer);
    assert.throws(() => discoverBookProject(root, { workspaceRoot: root }), /private regular file with one link/);
  } finally { rmSync(root, { recursive: true, force: true }); }
  root = make("snapshot-link");
  try {
    const pointer = readPointer(root), manifest = resolve(snapshotRoot(root, pointer.snapshotHash), "book.project.yaml"), outside = resolve(root, "manifest-copy"); writeFileSync(outside, readFileSync(manifest)); unlinkSync(manifest); linkSync(outside, manifest);
    assert.throws(() => discoverBookProject(root, { workspaceRoot: root }), /multiply linked|private regular file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("canonical identity rejects hard-linked asset and research files", () => {
  for (const relativePath of ["assets/figure.txt", "research/notes/source.txt"]) {
    const root = mkdtempSync(resolve(tmpdir(), "rtb-canonical-hardlink-"));
    try {
      cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const file = resolve(root, relativePath), outside = resolve(root, "outside-copy"); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(outside, "canonical"); linkSync(outside, file);
      assert.throws(() => discoverBookProject(root, { workspaceRoot: root }), /multiply linked/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("generic build atomically switches complete build/output generations", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-generic-generation-"));
  try {
    cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), options = { buildRoot: resolve(root, "build"), outputRoot: resolve(root, "dist"), workspaceRoot: root }, first = buildProject(project, options), initialPointer = readFileSync(first.generationPointer, "utf8");
    for (const hook of ["beforeGenerationReady", "afterGenerationReady", "beforeGenerationSwitch"]) {
      assert.throws(() => buildProject(project, { ...options, hooks: { [hook]: () => { throw new Error(`fault-${hook}`); } } }), new RegExp(`fault-${hook}`));
      assert.equal(readFileSync(first.generationPointer, "utf8"), initialPointer); assert.ok(existsSync(first.combinedFile)); assert.ok(existsSync(first.outputs[0].file));
    }
    assert.throws(() => buildProject(project, { ...options, hooks: { afterGenerationSwitch: () => { throw new Error("fault-after-switch"); } } }), /fault-after-switch/);
    const current = JSON.parse(readFileSync(first.generationPointer, "utf8")), generation = resolve(root, "dist", ".generations", project.id, current.generation); assert.ok(existsSync(resolve(generation, "build", "combined.md"))); assert.ok(existsSync(resolve(generation, "output-root", project.id, project.outputProfiles[0].filename)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
