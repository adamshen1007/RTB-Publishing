import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { discoverBookProject, discoverBooks, resolveProjectRoot } from "../scripts/books/discovery.mjs";
import { resolveCurrentGeneration } from "../scripts/books/generation.mjs";
import { initializeSnapshots, materializeSnapshot, pointerPath, readPointer, snapshotRoot, writePointer } from "../scripts/state/snapshots.mjs";
import { buildProject, outputDispatch } from "../scripts/build-book.mjs";
import { readPreviewAsset } from "../scripts/preview.mjs";
import { cleanOutputs } from "../scripts/clean.mjs";

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
    const result = buildProject(one, { outputRoot: resolve(output, "dist") });
    assert.ok(existsSync(result.outputs[0].file));
    const french = discoverBookProject(frenchRoot, { workspaceRoot: frenchRoot });
    assert.throws(() => buildProject(french, { outputRoot: resolve(output, "dist") }), /no generic PDF renderer capability/);
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
  for (const kind of ["dist"]) {
    const root = mkdtempSync(resolve(tmpdir(), `rtb-generic-${kind}-`)), external = mkdtempSync(resolve(tmpdir(), `rtb-generic-external-${kind}-`));
    try {
      cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); writeFileSync(resolve(external, "sentinel"), "untouched");
      const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist");
      symlinkSync(external, outputRoot);
      assert.throws(() => buildProject(project, { outputRoot, workspaceRoot: root }), /symbolic link|real directory/);
      assert.equal(readFileSync(resolve(external, "sentinel"), "utf8"), "untouched"); assert.deepEqual(new Set(["sentinel"]), new Set(readdirSync(external)));
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
  }
});

test("generic build rejects stale pointers and hard-linked canonical inputs", () => {
  const make = (label) => { const root = mkdtempSync(resolve(tmpdir(), `rtb-generic-${label}-`)); cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); initializeSnapshots(root); return root; };
  let root = make("stale");
  try {
    const stale = discoverBookProject(root, { workspaceRoot: root }), prior = readPointer(root), next = materializeSnapshot(root, { sourceRoot: snapshotRoot(root, prior.snapshotHash) }); writePointer(root, { expected: prior, nextSnapshotHash: next.hash, nextVersion: prior.version + 1 });
    assert.throws(() => buildProject(stale, { outputRoot: resolve(root, "dist"), workspaceRoot: root }), /stale/);
    const fresh = discoverBookProject(root, { workspaceRoot: root }), result = buildProject(fresh, { outputRoot: resolve(root, "dist"), workspaceRoot: root }); assert.ok(existsSync(result.outputs[0].file));
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
    cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), options = { outputRoot: resolve(root, "dist"), workspaceRoot: root }, first = buildProject(project, options), initialPointer = readFileSync(first.generationPointer, "utf8");
    for (const hook of ["beforeGenerationReady", "afterGenerationReady", "beforeGenerationSwitch"]) {
      assert.throws(() => buildProject(project, { ...options, hooks: { [hook]: () => { throw new Error(`fault-${hook}`); } } }), new RegExp(`fault-${hook}`));
      assert.equal(readFileSync(first.generationPointer, "utf8"), initialPointer); assert.ok(existsSync(first.combinedFile)); assert.ok(existsSync(first.outputs[0].file));
    }
    assert.throws(() => buildProject(project, { ...options, hooks: { afterGenerationSwitch: () => { throw new Error("fault-after-switch"); } } }), /fault-after-switch/);
    const current = JSON.parse(readFileSync(first.generationPointer, "utf8")), generation = resolve(root, "dist", ".generations", project.id, current.generation); assert.ok(existsSync(resolve(generation, "build", "combined.md"))); assert.ok(existsSync(resolve(generation, "output-root", project.id, project.outputProfiles[0].filename)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("preview resolution serves only the complete generation selected by .current", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-preview-generation-"));
  try {
    cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, first = buildProject(project, options);
    const stale = resolve(outputRoot, project.id); mkdirSync(stale, { recursive: true }); writeFileSync(resolve(stale, "index.html"), "stale conventional output");
    const current = resolveCurrentGeneration(project, { outputRoot }); assert.equal(current.generation, first.generation); assert.notEqual(current.outputDirectory, stale); assert.ok(existsSync(resolve(current.outputDirectory, project.outputProfiles[0].filename)));
    const second = buildProject(project, options), refreshed = resolveCurrentGeneration(project, { outputRoot }); assert.equal(refreshed.generation, second.generation); assert.notEqual(refreshed.generationRoot, current.generationRoot);
    assert.throws(() => resolveCurrentGeneration(project, { outputRoot, hooks: { beforePointerRecheck: ({ pointer, pointerBytes }) => { const changed = Buffer.from(pointerBytes); changed[changed.length - 2] = changed[changed.length - 2] === 32 ? 33 : 32; writeFileSync(pointer, changed); } } }), /pointer changed while resolving/);
    writeFileSync(second.generationPointer, `${JSON.stringify({ schemaVersion: 1, projectId: project.id, generation: second.generation })}\n`, { mode: 0o600 });
    const pointerBytes = readFileSync(second.generationPointer); unlinkSync(second.generationPointer); assert.throws(() => resolveCurrentGeneration(project, { outputRoot }), /No current build generation.*pnpm build/);
    writeFileSync(second.generationPointer, "not-json\n", { mode: 0o600 }); assert.throws(() => resolveCurrentGeneration(project, { outputRoot }), /pointer is invalid.*pnpm build/);
    writeFileSync(second.generationPointer, pointerBytes, { mode: 0o600 }); assert.equal(resolveCurrentGeneration(project, { outputRoot }).generation, second.generation);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("generic generation durability barriers precede atomic visibility and preserve a switched generation", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-generic-durability-"));
  try {
    cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), original = readFileSync(baseline.generationPointer, "utf8"), events = [];
    buildProject(project, { ...options, hooks: { durability: (event) => events.push(event), beforeGenerationSwitch: () => events.push("before-generation-switch"), afterGenerationSwitch: () => events.push("after-generation-switch") } });
    const switchIndex = events.indexOf("before-generation-switch"), stagingParent = events.lastIndexOf("after-fsync-staging-parent"), generationParent = events.lastIndexOf("after-fsync-generation-parent"), firstFile = events.indexOf("after-fsync-file"), firstDirectory = events.indexOf("after-fsync-directory"), pointerFile = events.lastIndexOf("after-fsync-pointer-file"), pointerParent = events.lastIndexOf("after-fsync-pointer-parent");
    assert.ok(firstFile >= 0 && firstFile < switchIndex); assert.ok(firstDirectory >= 0 && firstDirectory < switchIndex); assert.ok(stagingParent >= 0 && stagingParent < generationParent && generationParent < switchIndex); assert.ok(pointerFile >= 0 && pointerFile < switchIndex && pointerParent > switchIndex); assert.ok(events.indexOf("after-generation-switch") > pointerParent);
    const stable = readFileSync(baseline.generationPointer, "utf8");
    for (const barrier of ["before-fsync-file", "before-fsync-directory", "before-fsync-staging-parent", "before-fsync-generation-parent"]) {
      assert.throws(() => buildProject(project, { ...options, hooks: { durability: (event) => { if (event === barrier) throw new Error(`crash-${barrier}`); } } }), new RegExp(`crash-${barrier}`)); assert.equal(readFileSync(baseline.generationPointer, "utf8"), stable);
    }
    assert.throws(() => buildProject(project, { ...options, hooks: { afterPointerRename: () => { throw new Error("crash-after-pointer-rename"); } } }), /crash-after-pointer-rename/);
    const switched = JSON.parse(readFileSync(baseline.generationPointer, "utf8")); assert.notEqual(switched.generation, JSON.parse(stable).generation); assert.ok(existsSync(resolve(outputRoot, ".generations", project.id, switched.generation)));
    assert.notEqual(original, readFileSync(baseline.generationPointer, "utf8"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pointer replacement after rename fails without trusting or deleting the successor", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-pointer-race-"));
  try { cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, first = buildProject(project, options), priorBytes = readFileSync(first.generationPointer); let displaced;
    assert.throws(() => buildProject(project, { ...options, hooks: { afterPointerRename: ({ pointer }) => { displaced = `${pointer}.owned`; renameSync(pointer, displaced); writeFileSync(pointer, priorBytes, { mode: 0o600 }); } } }), /pointer was replaced/);
    assert.ok(existsSync(displaced)); assert.equal(readFileSync(first.generationPointer).equals(priorBytes), true); const owned = JSON.parse(readFileSync(displaced, "utf8")); assert.ok(existsSync(resolve(outputRoot, ".generations", project.id, owned.generation)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("preview resolves each request and clean waits until response bytes are captured", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-preview-live-"));
  try { cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist", "books"), options = { outputRoot, workspaceRoot: root }, first = buildProject(project, options), firstRead = await readPreviewAsset(project, "/", { workspaceRoot: root, outputRoot }); assert.equal(firstRead.generation, first.generation); const second = buildProject(project, options), secondRead = await readPreviewAsset(project, "/", { workspaceRoot: root, outputRoot }); assert.equal(secondRead.generation, second.generation);
    let releaseRead; const reading = readPreviewAsset(project, "/", { workspaceRoot: root, outputRoot, hooks: { afterOpen: () => new Promise((done) => { releaseRead = done; }) } }); while (!releaseRead) await new Promise((done) => setTimeout(done, 1)); const cleaning = cleanOutputs({ root, buildDirectory: resolve(root, "build"), distributionDirectory: resolve(root, "dist") }); await new Promise((done) => setTimeout(done, 30)); assert.equal(existsSync(outputRoot), true); releaseRead(); const captured = await reading; assert.equal(captured.status, 200); await cleaning; assert.equal(existsSync(outputRoot), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("preview descriptor never serves replacement or symlink bytes", async (context) => {
  for (const kind of ["after-open-symlink", "during-read-file"]) await context.test(kind, async () => { const root = mkdtempSync(resolve(tmpdir(), `rtb-preview-descriptor-${kind}-`)), outside = resolve(root, "outside.html"); try { cpSync("tests/fixtures/books/one-chapter", resolve(root, "book"), { recursive: true }); const projectRoot = resolve(root, "book"), project = discoverBookProject(projectRoot, { workspaceRoot: root }), outputRoot = resolve(root, "dist", "books"); buildProject(project, { outputRoot, workspaceRoot: root }); writeFileSync(outside, "OUTSIDE-SECRET"); const replace = ({ file }) => { const moved = `${file}.owned`; renameSync(file, moved); if (kind.includes("symlink")) symlinkSync(outside, file); else writeFileSync(file, "OUTSIDE-SECRET"); }; await assert.rejects(() => readPreviewAsset(project, "/", { workspaceRoot: root, outputRoot, hooks: kind.startsWith("after-open") ? { afterOpen: replace } : { duringRead: replace } }), /descriptor changed|path changed|symbolic link/); } finally { rmSync(root, { recursive: true, force: true }); } });
});

test("generation retention keeps current plus two complete predecessors", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-generation-gc-"));
  try { cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }; let latest; for (let index = 0; index < 8; index += 1) latest = buildProject(project, options); const generationRoot = resolve(outputRoot, ".generations", project.id), retained = readdirSync(generationRoot), projectGc = resolve(outputRoot, ".gc", project.id); assert.equal(retained.length, 3); assert.equal(retained.includes(latest.generation), true); for (const token of retained) assert.ok(existsSync(resolve(generationRoot, token, "build", "combined.md"))); assert.equal(existsSync(projectGc) ? readdirSync(projectGc).length : 0, 0, "successful bounded reclaim must not accumulate quarantine transactions");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("generic generation publication rejects staging drift and destination races", async (context) => {
  for (const scenario of ["staging-file", "destination-before-check", "destination-before-rename", "reservation-replaced"]) await context.test(scenario, () => {
    const root = mkdtempSync(resolve(tmpdir(), `rtb-generation-fence-${scenario}-`));
    try {
      cpSync("tests/fixtures/books/one-chapter", root, { recursive: true });
      const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), pointerBytes = readFileSync(baseline.generationPointer);
      let collision;
      const hooks = scenario === "staging-file"
        ? { beforeGenerationReady: ({ staging }) => writeFileSync(resolve(staging, "late-file"), "replacement") }
        : scenario === "destination-before-check"
          ? { beforeGenerationReady: ({ generation }) => { collision = generation; mkdirSync(generation, { recursive: true }); writeFileSync(resolve(generation, "successor-proof"), "untouched"); } }
          : scenario === "destination-before-rename"
            ? { beforeGenerationRename: ({ generation }) => { collision = generation; mkdirSync(generation, { recursive: true }); writeFileSync(resolve(generation, "successor-proof"), "untouched"); } }
            : { afterGenerationMaterialized: ({ generation }) => { collision = generation; renameSync(generation, `${generation}.owned`); mkdirSync(generation); writeFileSync(resolve(generation, "successor-proof"), "untouched"); } };
      assert.throws(() => buildProject(project, { ...options, hooks }), /tree contents changed|tree identity changed|destination (already exists|changed before (rename|reservation))/);
      assert.equal(readFileSync(baseline.generationPointer).equals(pointerBytes), true);
      if (collision) assert.equal(readFileSync(resolve(collision, "successor-proof"), "utf8"), "untouched");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

test("owned unpublished generation reservations are removed after materialization and durability failures", async (context) => {
  for (const scenario of ["mkdir", "copy-0", "copy-1", "file-fsync"]) await context.test(scenario, () => {
    const root = mkdtempSync(resolve(tmpdir(), `rtb-owned-generation-${scenario}-`));
    try { cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), generationRoot = resolve(outputRoot, ".generations", project.id), before = new Set(readdirSync(generationRoot)), pointer = readFileSync(baseline.generationPointer); let mkdirCount = 0, copyCount = 0;
      const hooks = scenario === "file-fsync" ? { durability: (event, path) => { if (event === "before-fsync-file" && path.includes(".generations")) throw new Error("owned-generation-fsync"); } } : { generationMaterialization: (event) => { if (event === "after-mkdir" && scenario === "mkdir" && mkdirCount++ === 0) throw new Error("owned-generation-mkdir"); if (event === "after-copy" && scenario === `copy-${copyCount++}`) throw new Error(`owned-generation-${scenario}`); } };
      assert.throws(() => buildProject(project, { ...options, hooks }), /owned-generation/); assert.equal(readFileSync(baseline.generationPointer).equals(pointer), true); assert.deepEqual(new Set(readdirSync(generationRoot)), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

test("generation retention restores quarantined generations when the pointer changes", async (context) => {
  for (const switchAt of [0, 1]) await context.test(switchAt === 0 ? "before first move" : "between moves", () => {
    const root = mkdtempSync(resolve(tmpdir(), `rtb-generation-gc-race-${switchAt}-`));
    try {
      cpSync("tests/fixtures/books/one-chapter", root, { recursive: true });
      const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), generationRoot = resolve(outputRoot, ".generations", project.id);
      for (let index = 0; index < 4; index += 1) cpSync(resolve(generationRoot, baseline.generation), resolve(generationRoot, randomUUID()), { recursive: true });
      const before = new Set(readdirSync(generationRoot)); let selected;
      assert.throws(() => buildProject(project, { ...options, hooks: { beforeGenerationGc: ({ generation, moved }) => { if (moved === 0) selected = generation; if (moved === switchAt) writeFileSync(baseline.generationPointer, `${JSON.stringify({ schemaVersion: 1, projectId: project.id, generation: selected })}\n`, { mode: 0o600 }); } } }), /pointer changed during retention/);
      assert.equal(JSON.parse(readFileSync(baseline.generationPointer, "utf8")).generation, selected);
      assert.ok(existsSync(resolve(generationRoot, selected)), "the generation selected by the changed pointer must be restored");
      for (const generation of before) assert.ok(existsSync(resolve(generationRoot, generation)), `preexisting generation ${generation} must not be deleted`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

test("generation retention recovers only its scoped durable transaction and preserves other evidence", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-generation-gc-recovery-"));
  try {
    cpSync("tests/fixtures/books/one-chapter", root, { recursive: true });
    const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), generationRoot = resolve(outputRoot, ".generations", project.id);
    for (let index = 0; index < 4; index += 1) cpSync(resolve(generationRoot, baseline.generation), resolve(generationRoot, randomUUID()), { recursive: true });
    const other = resolve(outputRoot, ".gc", "other-project", randomUUID()); mkdirSync(other, { recursive: true }); writeFileSync(resolve(other, "proof"), "untouched"); let injected = false;
    assert.throws(() => buildProject(project, { ...options, hooks: { afterGenerationGcRename: () => { if (!injected) { injected = true; throw new Error("gc-after-rename-crash"); } } } }), /gc-after-rename-crash/);
    const projectGc = resolve(outputRoot, ".gc", project.id), transactionRoot = resolve(projectGc, readdirSync(projectGc)[0]), transactionFile = resolve(transactionRoot, "transaction.json"); assert.equal(JSON.parse(readFileSync(transactionFile, "utf8")).generations.some((item) => item.state === "move_pending"), true);
    buildProject(project, options); assert.equal(existsSync(transactionRoot), false); assert.equal(readFileSync(resolve(other, "proof"), "utf8"), "untouched"); assert.equal(existsSync(other), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("generation retention resumes bounded deletion without touching another project", () => {
  const root = mkdtempSync(resolve(tmpdir(), "rtb-generation-gc-delete-"));
  try { cpSync("tests/fixtures/books/one-chapter", root, { recursive: true }); const project = discoverBookProject(root, { workspaceRoot: root }), outputRoot = resolve(root, "dist"), options = { outputRoot, workspaceRoot: root }, baseline = buildProject(project, options), generationRoot = resolve(outputRoot, ".generations", project.id); for (let index = 0; index < 4; index += 1) cpSync(resolve(generationRoot, baseline.generation), resolve(generationRoot, randomUUID()), { recursive: true }); const other = resolve(outputRoot, ".gc", "other-project", randomUUID()); mkdirSync(other, { recursive: true }); writeFileSync(resolve(other, "proof"), "untouched"); let failed = false;
    assert.throws(() => buildProject(project, { ...options, hooks: { beforeGenerationGcDelete: () => { if (!failed) { failed = true; throw new Error("gc-delete-crash"); } } } }), /gc-delete-crash/); const projectGc = resolve(outputRoot, ".gc", project.id); assert.ok(readdirSync(projectGc).length > 0); buildProject(project, options); assert.equal(readdirSync(projectGc).length, 0); assert.equal(readFileSync(resolve(other, "proof"), "utf8"), "untouched"); assert.equal(readdirSync(generationRoot).length, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
